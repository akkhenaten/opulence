// Signing by email link: a business's signatory, or an officer without a login, opens the document from the email,
// reads it, signs once, and can download the sealed copy for 30 days. The token is the only credential.
import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { notify, companyManagers } from '../lib/notify.mjs';
import { getBrand } from '../lib/brand.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { parse } from '../lib/docmarkup.mjs';
import { event, uaOf, sealQuietly, pdfFor } from '../lib/esign.mjs';
import { findLink, linkState, issueLink, nameMatches, outsideSigner, DOWNLOAD_DAYS } from '../lib/signLinks.mjs';
import { contractInput, companyOf, uploadSignaturePage } from './esign.mjs';
import { recordEngagement } from './contractsPack.mjs';
import { tickOnboarding } from './hr.mjs';
import { CO, def, pub } from './_def.mjs';

const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const OPENS_PER_HOUR = 20;
const fileName = (c, name) => `${c.title} - ${name} - ${c.reference}.pdf`;

const MESSAGE = {
  invalid: 'This signing link is not valid. Check you opened the whole link from the email.',
  expired: 'This signing link has expired. Ask the company to send a new one.',
  revoked: 'A newer signing link was sent, so this one no longer works. Use the latest email.',
  used: 'This document has already been signed.',
  signed: 'This document has already been signed. Use this link to download your copy.',
  void: 'The company withdrew this document. It no longer needs signing.',
};

async function linkFor(token, { forSigning = false } = {}) {
  const { link, contract } = await findLink(token);
  const state = linkState(link, contract);
  if (state === 'ok' || (!forSigning && state === 'signed')) return { link, c: contract, state };
  fail(410, MESSAGE[state] || MESSAGE.invalid, { state });
}

async function view(link, c, state) {
  const [brand, g] = await Promise.all([
    getBrand(),
    c.organisation_id && one('SELECT name FROM organisations WHERE id = $1', [c.organisation_id]),
  ]);
  const who = await outsideSigner(c);
  return {
    state, brand: { name: brand.name, logo_url: brand.logo_url, color: brand.color },
    id: c.id, title: c.title, category: c.category, status: c.status, reference: c.reference, sent_at: c.sent_at, created_at: c.created_at,
    template_version: c.template_version, upload_pages: c.upload_pages,
    officer_name: who?.name || g?.name, party: g?.name || null, signer_name: link.name || who?.name || '',
    company: companyOf(c), signed_name: c.signed_name, signed_at: c.signed_at, signature: c.signed_at ? c.signature : null,
    blocks: parse(c.source === 'upload' && c.upload_key ? uploadSignaturePage(c) : c.body),
    pdf_url: c.upload_key ? await downloadUrl(c.upload_key, `${c.title}.pdf`) : null,
    expires_at: link.expires_at, download_until: link.download_until,
  };
}

export const actions = {
  'sign.link.open': pub(async (b, { ip, event: ev }) => {
    const { link, c, state } = await linkFor(b.token);
    const n = await one("SELECT count(*)::int AS n FROM audit_log WHERE action = 'link.open' AND entity_id = $1 AND created_at > now() - interval '1 hour'", [String(link.id)]);
    if (n.n >= OPENS_PER_HOUR) fail(429, 'This link has been opened too many times in the last hour. Try again later.');
    await audit(null, 'link.open', 'sign_link', link.id, { contract: c.id, ip });
    let row = c;
    if (state === 'ok' && !c.opened_at) {
      const r = await one('UPDATE contracts SET opened_at = now() WHERE id = $1 AND opened_at IS NULL RETURNING opened_at', [c.id]);
      if (r) {
        await event('contract', c.id, 'opened', { name: link.name || link.email, ip, ua: uaOf(ev) });
        row = { ...c, opened_at: r.opened_at };
      }
    }
    return view(link, row, state);
  }),

  'sign.link.sign': pub(async (b, { ip, event: ev }) => {
    required(b, 'token', 'signature', 'signed_name');
    if (!PNG.test(String(b.signature)) || b.signature.length > 400000) fail(400, 'Invalid signature');
    const name = String(b.signed_name).trim().slice(0, 120);
    if (name.length < 3) fail(400, 'Type your full name');
    const { link, c: pre } = await linkFor(b.token, { forSigning: true });
    if (!nameMatches(link.name, name)) fail(400, `This link was sent to ${link.name}. Type your full name as it appears there.`);
    const ua = uaOf(ev);
    const c = need(await one(
      "UPDATE contracts SET status = 'signed', signature = $2, signed_name = $3, signed_at = now(), signed_ip = $4, signed_ua = $5 WHERE id = $1 AND status = 'sent' RETURNING *",
      [pre.id, b.signature, name, ip, ua]), 'This document has already been signed', 409);
    // Every other link to the same document stops working; this one stays open for downloading the sealed copy
    await q(`UPDATE sign_links SET used_at = now(), download_until = now() + interval '${DOWNLOAD_DAYS} days' WHERE id = $1`, [link.id]);
    await q('UPDATE sign_links SET revoked_at = now() WHERE contract_id = $1 AND id <> $2 AND revoked_at IS NULL AND used_at IS NULL', [c.id, link.id]);
    await event('contract', c.id, 'signed', { name, ip, ua });
    const out = await sealQuietly('contract', c, await contractInput(c), { filename: fileName(c, name) });
    if (c.officer_id && c.category !== 'policy') await tickOnboarding(c.officer_id, 'contract');
    if (c.source !== 'template') await recordEngagement(c);
    const g = c.organisation_id && await one('SELECT name FROM organisations WHERE id = $1', [c.organisation_id]);
    await notify(await companyManagers(), {
      kind: 'contract', title: 'Contract signed', body: `${name}${g ? ` for ${g.name}` : ''} signed "${c.title}" (${c.reference})`,
      link: c.officer_id ? `/company/staff/${c.officer_id}` : '/company/people/contracts',
    });
    await audit(null, 'link.sign', 'contract', c.id, { ip, reference: c.reference, name, email: link.email });
    return { ok: true, reference: c.reference, filename: out?.filename, signed_at: c.signed_at, download_until: new Date(Date.now() + DOWNLOAD_DAYS * 864e5) };
  }),

  // The document as a PDF: a watermarked copy while unsigned, the sealed copy for 30 days after signing
  'sign.link.pdf': pub(async (b) => {
    const { c } = await linkFor(b.token);
    const name = c.signed_name || (await outsideSigner(c))?.name || 'signatory';
    return pdfFor('contract', c, () => contractInput(c), { filename: fileName(c, name) });
  }),

  // A fresh link (the old ones stop working), optionally to a corrected address
  'contracts.link.resend': def(CO, async (b, { user }) => {
    required(b, 'id');
    const c = need(await one("SELECT * FROM contracts WHERE id = $1 AND status = 'sent'", [b.id]), 'Only documents waiting for a signature can be re-sent');
    if (c.officer_id && (await one('SELECT user_id FROM officers WHERE id = $1', [c.officer_id]))?.user_id) {
      fail(400, 'This officer signs in the app. Use Remind instead.');
    }
    const email = b.email ? String(b.email).trim().toLowerCase().slice(0, 200) : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address');
    const before = await q('UPDATE sign_links SET revoked_at = now() WHERE contract_id = $1 AND revoked_at IS NULL AND used_at IS NULL RETURNING id', [c.id]);
    const l = await issueLink(c, { user, email });
    if (!l.email) fail(400, l.error);
    await q("UPDATE contracts SET signer_kind = 'outside', last_reminded_at = now() WHERE id = $1", [c.id]);
    await event('contract', c.id, 'link', { user, name: l.email });
    await audit(user, 'link.issue', 'contract', c.id, { reference: c.reference, email: l.email, emailed: l.emailed, revoked: before.length, resend: true });
    if (!l.emailed) fail(502, `The email to ${l.email} could not be sent. Check the address and try again.`);
    return { ok: true, email: l.email, expires_at: l.expires_at };
  }),

  // Links on a document, for the manager's timeline (never the token)
  'contracts.links': def(CO, async (b) => {
    required(b, 'id');
    return q(`SELECT id, email, name, expires_at, used_at, revoked_at, created_at,
                CASE WHEN used_at IS NOT NULL THEN 'used' WHEN revoked_at IS NOT NULL THEN 'replaced' WHEN expires_at <= now() THEN 'expired' ELSE 'active' END AS state
                FROM sign_links WHERE contract_id = $1 ORDER BY created_at DESC`, [b.id]);
  }),
};

