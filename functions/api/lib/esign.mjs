// Shared signing engine for contracts, policies and pay rises: references, the signing timeline,
// the company countersignature, sealing the signed PDF, and the reminders job.
import crypto from 'node:crypto';
import { one, q } from './db.mjs';
import { fail } from './http.mjs';
import { notify, officerUser } from './notify.mjs';
import { archivePdf, savedPdf, nameSafe } from './archive.mjs';
import { renderSigned } from './signdoc.mjs';
import { mergeUpload } from './uploadSeal.mjs';
import { getObjectBytes } from './storage.mjs';
import { issueLink, liveLink } from './signLinks.mjs';

export const TABLE = { contract: 'contracts', pay_agreement: 'pay_agreements', venue_pack: 'pack_signings' };
const PREFIX = { contract: 'C', policy: 'P', pay_rise: 'R', venue_pack: 'V', incident: 'I' };
const ARCHIVE_KIND = { contract: 'contract', policy: 'policy', pay_rise: 'pay_agreement', venue_pack: 'venue_pack' };
// Documents that are sent and wait for a signature (a venue pack is signed by the officer on their own)
const SENT = ['contract', 'pay_agreement'];

/** ORB-C-2026-0142 — C contract, P policy, R pay rise, V venue pack, I incident report */
export async function nextReference(category, t = null) {
  const run = t ? t.q.bind(t) : q;
  const [r] = await run("SELECT nextval('esign_ref_seq') AS n");
  return `ORB-${PREFIX[category] || 'C'}-${new Date().getUTCFullYear()}-${String(r.n).padStart(4, '0')}`;
}

export const uaOf = (event) => String(event?.headers?.['user-agent'] || event?.headers?.['User-Agent'] || '').slice(0, 300);

/** Add a line to a document's signing timeline. */
export async function event(docType, docId, kind, { user = null, name = null, ip = null, ua = null } = {}, t = null) {
  const run = t ? t.q.bind(t) : q;
  await run('INSERT INTO sign_events (doc_type, doc_id, kind, actor_user_id, actor_name, ip, ua) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [docType, docId, kind, user?.id || null, name || user?.name || null, ip || null, ua || null]);
}

export const events = (docType, docId) => q('SELECT kind, at, actor_name, ip, ua FROM sign_events WHERE doc_type = $1 AND doc_id = $2 ORDER BY at, kind', [docType, docId]);

/** Record the officer's first look at a document. */
export async function markOpened(docType, row, { user, ip, event: ev }) {
  if (row.opened_at || row.status !== 'sent') return row;
  const r = await one(`UPDATE ${TABLE[docType]} SET opened_at = now() WHERE id = $1 AND opened_at IS NULL RETURNING opened_at`, [row.id]);
  if (r) await event(docType, row.id, 'opened', { user, ip, ua: uaOf(ev) });
  return { ...row, opened_at: r?.opened_at || row.opened_at };
}

/** The signature the company signs with: the chosen manager, else the default signatory, else `fallbackId`. 400 with setup:true if none. */
export async function companySigner(userId, fallbackId = null) {
  let id = userId;
  if (!id) id = (await one('SELECT default_signatory_id FROM settings WHERE id = 1'))?.default_signatory_id || fallbackId;
  const s = id && await one(
    "SELECT s.user_id, s.name, s.title, s.png FROM user_signatures s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1 AND u.role = 'company' AND u.status = 'active'", [id]);
  if (!s) fail(400, 'Add a saved company signature first (Settings → Your signature), or pick a manager who has one.', { setup: true });
  return s;
}

/** Columns that snapshot the countersignature onto a document when it is sent. */
export const signerColumns = (s) => ({
  signatory_user_id: s.user_id, company_name_signed: s.name, company_title_signed: s.title || '', company_signature: s.png, company_signed_at: new Date(),
});

export const verifyUrl = (reference) => `${(process.env.APP_URL || '').replace(/\/$/, '')}/app/verify/${encodeURIComponent(reference || '')}`;

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** renderSigned, plus the original pages in front for an uploaded PDF (input.upload = { key }) */
export async function renderDoc(input, status, reference, evs = []) {
  const out = await renderSigned({ ...input, events: evs, status, verifyUrl: verifyUrl(reference) });
  if (!input.upload?.key) return out;
  return { ...out, bytes: await mergeUpload(await getObjectBytes(input.upload.key), out.bytes, { reference, status }) };
}

/**
 * Freeze a signed document: render with both signatures and the certificate, save it to the officer's documents,
 * and store the fingerprint and file hash. `input` is what renderSigned takes, without status/events/verifyUrl.
 */
export async function seal(docType, row, input, { userId = null, filename } = {}) {
  const evs = [...(await events(docType, row.id)), { kind: 'sealed', at: new Date() }];
  const { bytes, fingerprint } = await renderDoc(input, 'signed', row.reference, evs);
  const d = await archivePdf({
    ownerType: row.officer_id ? 'officer' : 'company', ownerId: row.officer_id || null, kind: ARCHIVE_KIND[input.doc.kind] || 'contract', filename, bytes,
    title: nameSafe(filename), number: row.reference || '', userId,
  });
  await q(`UPDATE ${TABLE[docType]} SET fingerprint = $2, pdf_sha256 = $3, pdf_document_id = $4, sealed_at = now() WHERE id = $1`,
    [row.id, fingerprint, sha(bytes), d.id]);
  await event(docType, row.id, 'sealed', {});
  return { filename: d.title, pdf: Buffer.from(bytes).toString('base64'), saved: true };
}

/** Seal right after signing; if storage hiccups the signature still stands and the copy is sealed on first download. */
export async function sealQuietly(docType, row, input, opts) {
  try {
    return await seal(docType, row, input, opts);
  } catch (e) {
    console.error('[esign] seal failed, will seal on download', docType, row.id, e);
    return null;
  }
}

/** The PDF to download: the sealed copy once signed, otherwise a live render with the status watermark. */
export async function pdfFor(docType, row, build, { userId = null, filename }) {
  const signed = row.signed_at && row.status !== 'void';
  if (signed && row.pdf_document_id) {
    const saved = await savedPdf(row.pdf_document_id);
    if (saved) return saved;
  }
  const input = await build();
  // Signed before certificates existed: sealed now, with a note saying so
  if (signed) return seal(docType, row, { ...input, doc: { ...input.doc, legacy: !row.company_signature && docType !== 'venue_pack' } }, { userId, filename });
  const status = row.status === 'void' ? 'void' : row.status === 'superseded' ? 'superseded' : 'sent';
  const { bytes } = await renderDoc(input, status, row.reference, await events(docType, row.id));
  return { filename: nameSafe(filename), pdf: Buffer.from(bytes).toString('base64') };
}

const LINKS = { contract: (r) => `/officer/contracts/${r.id}`, pay_agreement: (r) => `/officer/agreements/${r.id}` };
const TITLE = (docType, r) => (docType === 'pay_agreement' ? 'Pay rise agreement' : r.title);

/** Nudge the officer about one unsigned document. */
export async function remind(docType, r, { user = null, auto = false } = {}) {
  const uid = r.officer_id ? await officerUser(r.officer_id) : [];
  if (!uid.length) {
    // Signing by email link: send a fresh link with the same deadline (the earlier email keeps working too)
    const live = docType === 'contract' && await liveLink(r.id);
    if (!live) return false;
    const l = await issueLink(r, { user, email: live.email, expiresAt: live.expires_at, reminder: true });
    if (!l.emailed) return false;
  } else await notify(uid, {
    kind: docType === 'pay_agreement' ? 'pay' : 'contract', title: `Reminder: ${TITLE(docType, r)} is waiting for your signature`,
    body: `Ref ${r.reference}. Open it in the app to read and sign.`, link: LINKS[docType](r), email: true,
  });
  await q(`UPDATE ${TABLE[docType]} SET last_reminded_at = now()${auto ? ', reminders = reminders + 1' : ''} WHERE id = $1`, [r.id]);
  await event(docType, r.id, 'reminded', { user, name: auto ? 'Automatic reminder' : null });
  return true;
}

/** Hourly: unsigned documents get a reminder after 3 days and again after 7. */
export async function esignReminders() {
  let n = 0;
  for (const docType of SENT) {
    const rows = await q(
      `SELECT * FROM ${TABLE[docType]} WHERE status = 'sent' AND sent_at IS NOT NULL
         AND ((reminders = 0 AND sent_at < now() - interval '3 days') OR (reminders = 1 AND sent_at < now() - interval '7 days'))
         AND (last_reminded_at IS NULL OR last_reminded_at < now() - interval '20 hours') LIMIT 200`);
    for (const r of rows) {
      if (await remind(docType, r, { auto: true })) n++;
      else await q(`UPDATE ${TABLE[docType]} SET reminders = reminders + 1 WHERE id = $1`, [r.id]); // no login: skip this round
    }
  }
  return n;
}
