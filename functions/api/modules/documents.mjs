import { one, q, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { uploadUrl, downloadUrl } from '../lib/storage.mjs';
import { assertVenue, assertOfficerAccess } from '../lib/scope.mjs';
import { audit } from '../lib/audit.mjs';
import { ALL, CO, MGR, def } from './_def.mjs';
import { tickOnboarding } from './hr.mjs';
import { canSeePay } from '../lib/auth.mjs';

// Saved invoices and pay statements are money documents
const MONEY_KINDS = ['invoice', 'pay_statement', 'pay_agreement'];
const hidesMoney = (user) => user.role === 'security' && !canSeePay(user);

const ONBOARD_FOR_KIND = { sia: 'sia', rtw: 'rtw', id: 'id', poa: 'poa' };

async function assertOwner(user, ownerType, ownerId, write = false) {
  if (ownerType === 'officer') {
    await assertOfficerAccess(user, ownerId);
    if (write && user.role === 'security') fail(403, 'Only the company or the officer can upload officer documents');
  } else if (ownerType === 'venue') {
    await assertVenue(user, ownerId);
    if (write && !['company', 'security'].includes(user.role)) fail(403, 'Only the company or its security managers can upload venue documents');
  } else if (user.role !== 'company') fail(403, 'Forbidden');
}

export const actions = {
  // Generic presigned upload for any private file (documents, incident photos, profile photos)
  'files.uploadUrl': def(ALL, async (b, { user }) => {
    required(b, 'filename', 'content_type');
    const folder = ({ officer: 'officers', venue: 'venues', incident: 'incidents', photo: 'photos', company: 'company', feed: 'feed', learn: 'learn', message: 'messages', shiftlog: 'shiftlog', ban: 'bans', voice: 'voice', contract: 'contracts', selfie: 'selfies', email: 'email', feedback: 'feedback' })[b.purpose] || 'misc';
    return uploadUrl(`${folder}/${user.id.slice(0, 8)}`, b.filename, b.content_type);
  }),

  'docs.list': def(ALL, async (b, { user }) => {
    required(b, 'owner_type');
    await assertOwner(user, b.owner_type, b.owner_id);
    const rows = await q(
      `SELECT d.*, u.name AS verified_by_name FROM documents d LEFT JOIN users u ON u.id = d.verified_by
        WHERE owner_type = $1 AND owner_id IS NOT DISTINCT FROM $2 AND ($3::boolean OR d.kind <> ALL($4::text[]))
          AND ($5::text IS NULL OR d.kind = $5) ORDER BY created_at DESC`,
      [b.owner_type, b.owner_id || null, !hidesMoney(user), MONEY_KINDS, b.kind || null]);
    // The AI read is a manager's compliance aid
    return MGR.includes(user.role) ? rows : rows.map(({ ai_read, ai_read_key, ai_read_at, ...d }) => d);
  }),

  'docs.create': def(ALL, async (b, { user }) => {
    required(b, 'owner_type', 'kind', 'title');
    await assertOwner(user, b.owner_type, b.owner_id, true);
    if (b.s3_key && (!b.s3_key.startsWith('docs/') || b.s3_key.startsWith('docs/archive/'))) fail(400, 'Invalid file');
    if (MONEY_KINDS.includes(b.kind)) fail(400, 'That document type is created by the system');
    const d = await insert('documents', {
      owner_type: b.owner_type, owner_id: b.owner_id || null, kind: b.kind, title: b.title, number: b.number || '',
      expiry: b.expiry || null, s3_key: b.s3_key || null, mime: b.mime || null, uploaded_by: user.id,
      provider: b.provider || null, issued_on: b.issued_on || null,
    });
    if (b.owner_type === 'officer' && ONBOARD_FOR_KIND[b.kind]) await tickOnboarding(b.owner_id, ONBOARD_FOR_KIND[b.kind]);
    await audit(user, 'doc.create', 'document', d.id, { kind: d.kind, owner: b.owner_id });
    return d;
  }),

  'docs.url': def(ALL, async (b, { user }) => {
    const d = need(await one('SELECT * FROM documents WHERE id = $1', [b.id]));
    await assertOwner(user, d.owner_type, d.owner_id);
    if (MONEY_KINDS.includes(d.kind) && hidesMoney(user)) fail(403, 'You do not have access to pay information');
    return { url: await downloadUrl(d.s3_key, d.title) };
  }),

  // Verifying an SIA / right-to-work document copies its number + expiry onto the officer's compliance record
  'docs.verify': def(CO, async (b, { user }) => {
    const d = need(await one('UPDATE documents SET verified_by = $2, verified_at = now() WHERE id = $1 RETURNING *', [b.id, user.id]));
    if (d.owner_type === 'officer') {
      if (d.kind === 'sia') await q('UPDATE officers SET sia_number = COALESCE(NULLIF($2, \'\'), sia_number), sia_expiry = COALESCE($3, sia_expiry) WHERE id = $1', [d.owner_id, d.number, d.expiry]);
      if (d.kind === 'rtw') await q('UPDATE officers SET rtw_verified = true, rtw_expiry = $2 WHERE id = $1', [d.owner_id, d.expiry]);
    }
    await audit(user, 'doc.verify', 'document', d.id);
    return d;
  }),

  'docs.delete': def(ALL, async (b, { user }) => {
    const d = need(await one('SELECT * FROM documents WHERE id = $1', [b.id]));
    if (d.system) fail(400, 'Saved invoices, pay statements and signed documents are kept for your records and cannot be deleted');
    await assertOwner(user, d.owner_type, d.owner_id, true);
    if (user.role === 'officer' && d.verified_at) fail(400, 'Verified documents can only be removed by the company');
    await q('DELETE FROM documents WHERE id = $1', [b.id]);
    await audit(user, 'doc.delete', 'document', d.id, { kind: d.kind, owner: d.owner_id });
    return { ok: true };
  }),

  'docs.expiring': def(CO, async (b) => q(
    `SELECT * FROM (
       SELECT 'officer' AS owner_type, o.id AS owner_id, o.first_name || ' ' || o.last_name AS owner_name, 'SIA licence' AS title, o.sia_expiry AS expiry
         FROM officers o WHERE o.status IN ('active','onboarding') AND o.sia_expiry IS NOT NULL
       UNION ALL
       SELECT 'officer', o.id, o.first_name || ' ' || o.last_name, 'Right to work', o.rtw_expiry
         FROM officers o WHERE o.status IN ('active','onboarding') AND o.rtw_expiry IS NOT NULL
       UNION ALL
       SELECT d.owner_type, d.owner_id, COALESCE(o.first_name || ' ' || o.last_name, v.name), d.title, d.expiry
         FROM documents d LEFT JOIN officers o ON d.owner_type = 'officer' AND o.id = d.owner_id
         LEFT JOIN venues v ON d.owner_type = 'venue' AND v.id = d.owner_id
        WHERE d.expiry IS NOT NULL AND d.kind NOT IN ('sia','rtw') AND (o.id IS NULL OR o.status IN ('active','onboarding'))
     ) x WHERE expiry <= CURRENT_DATE + ($1::int || ' days')::interval ORDER BY expiry`, [b.days || 60])),
};
