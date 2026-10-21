import { q } from './db.mjs';
import { pushToUsers } from './webpush.mjs';
import { esc, getBrand } from './brand.mjs';

// Kinds a person can switch off in their notification settings; operational alerts always go
export const OPTIONAL_KINDS = ['mention', 'comment', 'reaction', 'announcement', 'training'];

const APP_URL = () => process.env.APP_URL || '';

async function sendEmail(to, subject, html) {
  const projectId = process.env.OPENKBS_PROJECT_ID;
  const apiKey = process.env.OPENKBS_API_KEY;
  if (!projectId || !apiKey || !to) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    await fetch(`https://project.openkbs.com/projects/${projectId}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ to, subject, html }),
      signal: ctrl.signal,
    });
  } catch (e) {
    console.warn('[email] not sent:', e.message);
  } finally {
    clearTimeout(timer);
  }
}

// Emails carry the company's own logo, name and colour, with a small "Sent via Orb Security" line
async function emailHtml(title, body, link) {
  const b = await getBrand();
  const url = link ? `${APP_URL()}/app${link}` : `${APP_URL()}/app`;
  const head = b.logo_url
    ? `<img src="${esc(b.logo_url)}" alt="${esc(b.name)}" height="36" style="display:block;height:36px;max-width:200px;object-fit:contain">`
    : `<div style="font-weight:700;color:#0B1220;font-size:15px">${esc(b.name)}</div>`;
  const label = b.name.length <= 24 ? `Open ${esc(b.name)}` : 'Open the app';
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;background:#F2F4F7">
  <div style="background:#fff;border-radius:18px;padding:24px;border:1px solid #E5E7EB;border-top:4px solid ${b.color}">
  ${head}
  <h2 style="margin:16px 0 8px;color:#0B1220;font-size:20px">${title}</h2>
  <p style="color:#4B5563;line-height:1.5">${body || ''}</p>
  <a href="${url}" style="display:inline-block;margin-top:12px;background:${b.color};color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600">${label}</a>
  </div>
  <div style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:12px">Sent via Orb Security</div></div>`;
}

/**
 * Notify a set of users in-app (and by email when `email` is true).
 * users: array of user ids. dedupe: optional key to avoid repeats.
 */
export async function notify(userIds, { kind, title, body = '', link = '', severity = 'info', dedupe = null, email = false }) {
  let ids = [...new Set((userIds || []).filter(Boolean))];
  if (OPTIONAL_KINDS.includes(kind) && ids.length) {
    ids = (await q("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND COALESCE(notify_prefs->>$2, (SELECT notify_defaults->>$2 FROM settings WHERE id = 1)) IS DISTINCT FROM 'false'", [ids, kind])).map((r) => r.id);
  }
  if (!ids.length) return;
  const rows = await q(
    `INSERT INTO notifications (user_id, kind, title, body, link, severity, dedupe_key)
     SELECT unnest($1::uuid[]), $2, $3, $4, $5, $6, $7
     ON CONFLICT DO NOTHING RETURNING user_id`,
    [ids, kind, title, body, link, severity, dedupe],
  );
  if (rows.length) {
    try {
      await pushToUsers(rows.map((r) => r.user_id), { title, body, link });
    } catch (e) {
      console.warn('[push] not sent:', e.message);
    }
  }
  if (email && rows.length) {
    const users = await q("SELECT email FROM users WHERE id = ANY($1::uuid[]) AND status = 'active'", [rows.map((r) => r.user_id)]);
    const [{ name }, html] = await Promise.all([getBrand(), emailHtml(title, body, link)]);
    await Promise.allSettled(users.map((u) => sendEmail(u.email, `${name} — ${title}`, html)));
  }
}

export const sendRawEmail = sendEmail;
export { emailHtml };

// Recipient helpers
export const companyManagers = async () => (await q("SELECT id FROM users WHERE role = 'company' AND status = 'active'")).map((r) => r.id);
export const securityFor = async (venueId) => (await q("SELECT s.user_id AS id FROM security_venues s JOIN users u ON u.id = s.user_id WHERE s.venue_id = $1 AND u.status = 'active'", [venueId])).map((r) => r.id);
export const venueContacts = async (venueId) => (await q("SELECT c.user_id AS id FROM venue_contacts c JOIN users u ON u.id = c.user_id WHERE c.venue_id = $1 AND u.status = 'active'", [venueId])).map((r) => r.id);
export const officerUser = async (officerId) => (await q('SELECT user_id AS id FROM officers WHERE id = $1 AND user_id IS NOT NULL', [officerId])).map((r) => r.id);
export async function managersFor(venueId) {
  return [...(await companyManagers()), ...(await securityFor(venueId))];
}
