import { q } from './db.mjs';
import { pushToUsers } from './webpush.mjs';
import { esc, getBrand, getSender, onColor } from './brand.mjs';
import { fmtDateTime } from './time.mjs';

// Kinds a person can switch off in their notification settings; operational alerts always go
export const OPTIONAL_KINDS = ['mention', 'comment', 'reaction', 'announcement', 'training', 'shoutout', 'tag', 'event', 'celebration'];

const APP_URL = () => process.env.APP_URL || '';

/** true when the mail service accepted the message. Sent as the company (name from Settings), replies to its email. */
async function sendEmail(to, subject, html) {
  const projectId = process.env.OPENKBS_PROJECT_ID;
  const apiKey = process.env.OPENKBS_API_KEY;
  if (!to) return false;
  if (!projectId || !apiKey) { console.warn('[email] not sent: mail service not configured'); return false; }
  let sender = {};
  try { sender = await getSender(); } catch (e) { console.warn('[email] sender not loaded:', e.message); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`https://project.openkbs.com/projects/${projectId}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ to, subject, html, ...sender }),
      signal: ctrl.signal,
    });
    if (!r.ok) console.warn('[email] not sent:', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.warn('[email] not sent:', e.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Emails carry the company's own logo, name and colour, with a small "Powered by orbsolutions.co.uk" line
async function emailHtml(title, body, link, button = null) {
  const b = await getBrand();
  const url = link ? `${APP_URL()}/app${link}` : `${APP_URL()}/app`;
  const head = b.logo_url
    ? `<img src="${esc(b.logo_url)}" alt="${esc(b.name)}" height="36" style="display:block;height:36px;max-width:200px;object-fit:contain">`
    : `<div style="font-weight:700;color:#0B1220;font-size:15px">${esc(b.name)}</div>`;
  const label = button ? esc(button) : b.name.length <= 24 ? `Open ${esc(b.name)}` : 'Open the app';
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;background:#F2F4F7">
  <div style="background:#fff;border-radius:18px;padding:24px;border:1px solid #E5E7EB;border-top:4px solid ${b.color}">
  ${head}
  <h2 style="margin:16px 0 8px;color:#0B1220;font-size:20px">${title}</h2>
  <p style="color:#4B5563;line-height:1.5">${body || ''}</p>
  <a href="${url}" style="display:inline-block;margin-top:12px;background:${b.color};color:${onColor(b.color)};padding:10px 18px;border-radius:12px;text-decoration:none;font-weight:600">${label}</a>
  </div>
  <div style="text-align:center;margin-top:14px"><a href="https://orbsolutions.co.uk/" style="color:#9CA3AF;font-size:11px;text-decoration:none"><img src="${APP_URL()}/app/orb-lockup.png" alt="Orb Security" height="18" style="height:18px;vertical-align:middle;margin-right:6px">Powered by <span style="text-decoration:underline">orbsolutions.co.uk</span></a></div></div>`;
}

/**
 * Notify a set of users in-app (and by email when `email` is true).
 * users: array of user ids. dedupe: optional key to avoid repeats.
 */
export async function notify(userIds, { kind, title, body = '', link = '', severity = 'info', dedupe = null, email = false, ref = null }) {
  let ids = [...new Set((userIds || []).filter(Boolean))];
  if (OPTIONAL_KINDS.includes(kind) && ids.length) {
    ids = (await q("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND COALESCE(notify_prefs->>$2, (SELECT notify_defaults->>$2 FROM settings WHERE id = 1)) IS DISTINCT FROM 'false'", [ids, kind])).map((r) => r.id);
  }
  if (!ids.length) return;
  const rows = await q(
    `INSERT INTO notifications (user_id, kind, title, body, link, severity, dedupe_key, ref)
     SELECT unnest($1::uuid[]), $2, $3, $4, $5, $6, $7, $8
     ON CONFLICT DO NOTHING RETURNING user_id`,
    [ids, kind, title, body, link, severity, dedupe, ref],
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

// Alerts written before notifications carried a ref, keyed by assignment or card
const ASG_KEYS = ['late', 'esc', 'pack-esc', 'pack-both', 'pack-back', 'omw', 'remind', 'pack-day', 'pack-2h', 'pack_blocked'];

/** The refs and older dedupe keys of everything said about these assignments, shifts and cards. */
export function withdrawKeys({ assignments = [], shifts = [], items = [] } = {}) {
  const a = assignments.map((x) => (typeof x === 'object' ? x.id : x)).filter(Boolean);
  const refs = [...a.map((id) => `asg:${id}`), ...shifts.filter(Boolean).map((id) => `shift:${id}`), ...items.filter(Boolean).map((id) => `ops:${id}`)];
  const keys = [...a.flatMap((id) => ASG_KEYS.map((k) => `${k}:${id}`)), ...items.filter(Boolean).map((id) => `ops:${id}`)];
  return { refs, keys };
}

// Shift notices sent before they carried a ref
const OLD_SHIFT_TITLES = ['New shift assigned', 'Shift request approved', 'Shift updated', 'New shift published', 'New shifts published'];

/**
 * Take back what the bell still says about assignments that ended, shifts that went and cards that closed.
 * assignments: ids or rows; rows with venue_name and starts_at also clear older unkeyed shift notices.
 */
export async function withdraw({ assignments = [], shifts = [], items = [] } = {}) {
  const { refs, keys } = withdrawKeys({ assignments, shifts, items });
  if (refs.length || keys.length) {
    await q('DELETE FROM notifications WHERE ref = ANY($1::text[]) OR dedupe_key = ANY($2::text[])', [refs, keys]);
  }
  for (const a of assignments) {
    if (typeof a !== 'object' || !a.officer_id || !a.venue_name || !a.starts_at) continue;
    const at = fmtDateTime(a.starts_at);
    await q(
      `DELETE FROM notifications n USING officers o WHERE o.id = $1 AND n.user_id = o.user_id AND n.kind = 'shift' AND n.ref IS NULL
         AND n.title = ANY($2::text[]) AND (position($3 in n.body) > 0 OR position($4 in n.body) > 0)`,
      [a.officer_id, OLD_SHIFT_TITLES, `${a.venue_name} · ${at}`, `${a.venue_name} ${at}`]);
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
