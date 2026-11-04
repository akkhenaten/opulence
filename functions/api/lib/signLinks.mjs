// Signing links for people who sign without a login (a business's signatory, or an officer not yet invited).
// Only the sha256 of the token is stored; the token itself lives in the email.
import crypto from 'node:crypto';
import { one, q } from './db.mjs';
import { getBrand, esc } from './brand.mjs';
import { sendRawEmail, emailHtml } from './notify.mjs';
import { fmtDate } from './time.mjs';

export const LINK_DAYS = 14;
export const DOWNLOAD_DAYS = 30;

export const hashToken = (token) => crypto.createHash('sha256').update(String(token || '')).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

/** Who signs a contract outside the app: the business's signatory, or the officer themselves */
export async function outsideSigner(c) {
  if (c.organisation_id) {
    const g = await one('SELECT name, signatory_name, signatory_email FROM organisations WHERE id = $1', [c.organisation_id]);
    return g && { email: g.signatory_email, name: g.signatory_name || '', party: g.name };
  }
  const o = await one('SELECT first_name, last_name, email FROM officers WHERE id = $1', [c.officer_id]);
  return o && { email: o.email, name: `${o.first_name} ${o.last_name}`.trim(), party: null };
}

/** Where a link stands; `ok` means it can be used to sign now */
export function linkState(l, c) {
  if (!l || !c) return 'invalid';
  if (l.revoked_at) return 'revoked';
  if (l.used_at || ['signed', 'signed_paper'].includes(c.status)) return l.used_at && l.download_until && new Date(l.download_until) > new Date() ? 'signed' : 'used';
  if (c.status === 'void' || c.status === 'superseded') return 'void';
  if (new Date(l.expires_at) <= new Date()) return 'expired';
  return 'ok';
}

export async function findLink(token) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(String(token || ''))) return { link: null, contract: null };
  const link = await one('SELECT * FROM sign_links WHERE token_hash = $1', [hashToken(token)]);
  const contract = link && await one('SELECT * FROM contracts WHERE id = $1', [link.contract_id]);
  return { link, contract };
}

/**
 * Issue a link and email it. `expiresAt` keeps a reminder's link on the original deadline.
 * Returns { emailed, email, expires_at }; the token is never returned to the caller.
 */
export async function issueLink(c, { user = null, email = null, expiresAt = null, reminder = false } = {}) {
  const who = await outsideSigner(c);
  const to = String(email || who?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { emailed: false, email: null, error: 'There is no email address to send the signing link to' };
  const token = newToken();
  const expires = expiresAt || new Date(Date.now() + LINK_DAYS * 864e5);
  await q('INSERT INTO sign_links (token_hash, contract_id, email, name, expires_at, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
    [hashToken(token), c.id, to, who?.name || '', expires, user?.id || null]);
  const brand = await getBrand();
  const title = reminder ? `Reminder: "${esc(c.title)}" is waiting for your signature` : `${esc(brand.name)} has sent you a document to sign`;
  const body = `${reminder ? '' : `"${esc(c.title)}"${who?.party ? ` for ${esc(who.party)}` : ''} is ready for you to read and sign online. `}`
    + `Ref ${esc(c.reference)}. The link works until ${esc(fmtDate(expires))} and can be used once. You do not need an account.`;
  const emailed = await sendRawEmail(to, `${brand.name} — ${reminder ? 'Reminder: ' : ''}${c.title} to sign`, await emailHtml(title, body, `/sign/${token}`, 'Review and sign'));
  return { emailed, email: to, expires_at: expires };
}

/** The newest link still usable for signing, if any */
export const liveLink = (contractId) => one(
  'SELECT * FROM sign_links WHERE contract_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1', [contractId]);

/** Loose check that the typed name belongs to the person the link was sent to: one name in common is enough */
export function nameMatches(expected, typed) {
  const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z\s'-]/g, ' ').split(/[\s'-]+/).filter((w) => w.length >= 2);
  const want = words(expected);
  if (!want.length) return true;
  const got = new Set(words(typed));
  return want.some((w) => got.has(w));
}
