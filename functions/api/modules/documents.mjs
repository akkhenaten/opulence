import { one, q, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { uploadUrl, downloadUrl } from '../lib/storage.mjs';
import { assertVenue, assertOfficerAccess } from '../lib/scope.mjs';
import { audit } from '../lib/audit.mjs';
import { ALL, CO, MGR, def } from './_def.mjs';
import { tickOnboarding } from './hr.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { cleanShareCode } from '../lib/rtw.mjs';
import { notify, officerUser } from '../lib/notify.mjs';
import { autoApply, refile } from '../lib/docAuto.mjs';
import { misfiledAs } from '../lib/docSets.mjs';

// Saved invoices and pay statements are money documents
const MONEY_KINDS = ['invoice', 'pay_statement', 'pay_agreement'];
const hidesMoney = (user) => user.role === 'security' && !canSeePay(user);

// What a manager can re-file an upload as (contracts and money documents are made by the app)
const EDIT_KINDS = ['sia', 'rtw', 'id', 'poa', 'training', 'first_aid', 'cctv', 'other'];
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
    // The AI read is a manager's compliance aid (with the kind Orb thinks a mis-filed upload really is)
    return MGR.includes(user.role) ? rows.map((d) => ({ ...d, misfiled_as: misfiledAs(d) })) : rows.map(({ ai_read, ai_read_key, ai_read_at, ...d }) => d);
  }),

  'docs.create': def(ALL, async (b, { user }) => {
    required(b, 'owner_type', 'kind', 'title');
    await assertOwner(user, b.owner_type, b.owner_id, true);
    if (b.s3_key && (!b.s3_key.startsWith('docs/') || b.s3_key.startsWith('docs/archive/'))) fail(400, 'Invalid file');
    if (MONEY_KINDS.includes(b.kind)) fail(400, 'That document type is created by the system');
    // A right to work share code can be sent on its own, with no picture
    const code = b.kind === 'rtw' ? cleanShareCode(b.number) : null;
    if (b.kind === 'rtw' && !b.s3_key && !code) fail(400, 'Add a photo, or a share code (it starts with W)');
    const d = await insert('documents', {
      owner_type: b.owner_type, owner_id: b.owner_id || null, kind: b.kind, title: b.title, number: code || b.number || '',
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
    return { url: await downloadUrl(d.s3_key, d.title), mime: d.mime || null, name: d.title };
  }),

  // Straight after an upload: Orb reads a licence or ID scan (or a passport sent under another type) and applies it to the profile when it all agrees.
  // { id } one document, or { officer_id } every unread one of theirs (a new staff profile). Best effort — the
  // 5-minute job reads anything missed.
  'docs.read': def(ALL, async (b, { user }) => {
    const ids = b.id
      ? [need(await one("SELECT id, owner_id, kind FROM documents WHERE id = $1 AND owner_type = 'officer'", [b.id]))]
      : b.officer_id ? await q(
        "SELECT id, owner_id, kind FROM documents WHERE owner_type = 'officer' AND owner_id = $1 AND kind IN ('sia','rtw','id','poa','other') AND s3_key IS NOT NULL AND ai_read_key IS DISTINCT FROM s3_key ORDER BY created_at DESC LIMIT 4",
        [b.officer_id]) : fail(400, 'Document missing');
    for (const d of ids) await assertOwner(user, 'officer', d.owner_id);
    const { readDocuments } = await import('./compliance.mjs');
    for (const d of ids) {
      try {
        await readDocuments(1, { id: d.id });
      } catch (e) {
        console.error('[docs.read]', e.message);
      }
    }
    const now = ids.length ? await q('SELECT id, kind, auto_applied_at FROM documents WHERE id = ANY($1)', [ids.map((d) => d.id)]) : [];
    // refiled: Orb moved an upload sent under the wrong type
    return {
      applied: now.filter((d) => d.auto_applied_at).map((d) => (d.kind === 'sia' ? 'sia' : 'rtw')),
      refiled: now.filter((d) => ids.find((x) => x.id === d.id)?.kind !== d.kind).map((d) => d.kind),
    };
  }),

  // Fix an upload: put it under the right kind (the officer picked the wrong one), or correct its title, number or expiry.
  // A re-filed licence or passport is read (if it wasn't) and applied by Orb as if it had been sent that way.
  'docs.update': def(CO, async (b, { user }) => {
    required(b, 'id');
    const d = need(await one('SELECT * FROM documents WHERE id = $1', [b.id]));
    if (d.system) fail(400, 'Saved invoices, pay statements and signed documents cannot be changed');
    await assertOwner(user, d.owner_type, d.owner_id, true);
    const kind = b.kind && b.kind !== d.kind ? b.kind : null;
    if (kind && (MONEY_KINDS.includes(kind) || !EDIT_KINDS.includes(kind))) fail(400, 'Choose another type');
    if (kind && await one('SELECT 1 FROM officers WHERE rtw_check_doc = $1', [d.id])) fail(400, 'This is the saved right to work check, so it stays under Right to work');
    if (kind) await refile(d, kind, user);
    const f = {};
    if (typeof b.title === 'string' && b.title.trim()) f.title = b.title.trim().slice(0, 200);
    if (b.number !== undefined) f.number = (d.kind === 'rtw' || kind === 'rtw') && cleanShareCode(b.number) ? cleanShareCode(b.number) : String(b.number || '').trim().slice(0, 60);
    if (b.expiry !== undefined) f.expiry = /^\d{4}-\d{2}-\d{2}$/.test(b.expiry || '') ? b.expiry : null;
    const keys = Object.keys(f);
    if (keys.length) await q(`UPDATE documents SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [d.id, ...keys.map((k) => f[k])]);
    await audit(user, 'doc.update', 'document', d.id, { kind: kind ? { from: d.kind, to: kind } : undefined, ...f });
    if (d.owner_type === 'officer') {
      const { readDocuments, runCompliance } = await import('./compliance.mjs');
      try {
        if (kind && ['sia', 'rtw', 'id', 'poa', 'other'].includes(kind) && d.s3_key) {
          if (d.ai_read_key === d.s3_key) await autoApply(d.id);
          else await readDocuments(1, { id: d.id });
        }
        await runCompliance({ officerIds: [d.owner_id] });
      } catch (e) {
        console.error('[docs.update]', e.message);
      }
    }
    return one('SELECT * FROM documents WHERE id = $1', [d.id]);
  }),

  'docs.verify': def(CO, async (b, { user }) => {
    const d = need(await one('UPDATE documents SET verified_by = $2, verified_at = now() WHERE id = $1 RETURNING *', [b.id, user.id]));
    if (d.owner_type === 'officer' && d.kind === 'sia') {
      await q('UPDATE officers SET sia_number = COALESCE(NULLIF($2, \'\'), sia_number), sia_expiry = COALESCE($3, sia_expiry) WHERE id = $1', [d.owner_id, d.number, d.expiry]);
    }
    if (d.owner_type === 'officer') await notify(await officerUser(d.owner_id), { kind: 'hr', title: 'Document checked', body: d.title || '', link: '/officer/documents', dedupe: `docok:${d.id}` });
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
