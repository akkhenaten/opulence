import { one, q } from '../lib/db.mjs';
import { fail, required } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { cleanFiles, signFiles } from '../lib/files.mjs';
import { emailHtml, notify, sendRawEmail } from '../lib/notify.mjs';
import { isPlatformAdmin, plat, platformEmails } from '../lib/platform.mjs';
import { ALL, def } from './_def.mjs';

// Problems and ideas about the app itself. Anyone signed in sends; only the platform admin reads them.
export const KINDS = ['problem', 'idea'];
export const STATUSES = ['new', 'looking', 'planned', 'fixed', 'not_now'];
export const STATUS_LABEL = { new: 'New', looking: 'Looking at it', planned: 'Planned', fixed: 'Fixed', not_now: 'Not now' };
export const DAILY_LIMIT = 20;
// The email template takes HTML, and this text comes from anyone
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ROLE_LABEL = { company: 'Company manager', security: 'Security manager', venue: 'Venue manager', officer: 'Officer' };

/** What the sender typed, checked and trimmed. Throws a friendly 400 on bad input. */
export function checkFeedback(b) {
  if (!KINDS.includes(b?.kind)) fail(400, "Choose Something's wrong or I have an idea");
  const body = String(b.body || '').trim();
  if (!body) fail(400, 'Tell us what happened or what would make it better');
  if (body.length > 2000) fail(400, 'Keep it under 2,000 characters');
  const cut = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  return { kind: b.kind, body, page: cut(b.page, 300), device: cut(b.device, 300), app_version: cut(b.app_version, 40) };
}

/** The tidy block the admin pastes into the board or a chat with the developer. */
export function taskText(f) {
  return [
    `${f.kind === 'problem' ? 'Problem' : 'Idea'} from ${f.sender_name || 'someone'} (${ROLE_LABEL[f.role] || f.role})`,
    '', f.body, '',
    f.page && `Screen: ${f.page}`,
    f.device && `Device: ${f.device}`,
    f.app_version && `App version: ${f.app_version}`,
    `Sent: ${new Date(f.created_at).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    ...(f.photos || []).map((p, i) => `Photo ${i + 1}: ${p.url || p.name}`),
  ].filter((l) => l !== false && l !== null && l !== undefined).join('\n');
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const toCsv = (rows) => [
  ['Sent', 'Type', 'Status', 'From', 'Role', 'Email', 'Screen', 'Device', 'Version', 'Text', 'Reply', 'Note'].map(csvCell).join(','),
  ...rows.map((f) => [f.created_at && new Date(f.created_at).toISOString(), f.kind, STATUS_LABEL[f.status], f.sender_name, ROLE_LABEL[f.role] || f.role, f.sender_email,
    f.page, f.device, f.app_version, f.body, f.reply, f.note].map(csvCell).join(',')),
].join('\r\n');

// The sender's own view leaves out the admin's private note
const forSender = async ({ note, sender_email, ...f }) => ({ ...f, photos: await signFiles(f.photos) });
const forAdmin = async (f) => ({ ...f, photos: await signFiles(f.photos) });

const settings = async () => (await one('SELECT feedback_on, feedback_email FROM settings WHERE id = 1')) || { feedback_on: true, feedback_email: true };

function filters(b) {
  const where = [];
  const args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
  if (STATUSES.includes(b.status)) add('status = ?', b.status);
  if (b.status === 'open') where.push("status IN ('new','looking','planned')");
  if (KINDS.includes(b.kind)) add('kind = ?', b.kind);
  if (ROLE_LABEL[b.role]) add('role = ?', b.role);
  if (b.search) {
    args.push(String(b.search).slice(0, 100));
    const n = `'%' || $${args.length} || '%'`;
    where.push(`(body ILIKE ${n} OR sender_name ILIKE ${n} OR page ILIKE ${n})`);
  }
  return [where.length ? `WHERE ${where.join(' AND ')}` : '', args];
}

export const actions = {
  'appFeedback.send': def(ALL, async (b, { user }) => {
    if (!(await settings()).feedback_on) fail(400, 'Feedback is closed for now');
    const f = checkFeedback(b);
    const sent = await one("SELECT count(*)::int AS n FROM app_feedback WHERE user_id = $1 AND created_at > now() - interval '1 day'", [user.id]);
    if (sent.n >= DAILY_LIMIT) fail(429, `That's ${DAILY_LIMIT} today — thank you! Please send more tomorrow.`);
    const photos = await cleanFiles(user, b.photos, 'feedback', 3);
    const row = await one(
      `INSERT INTO app_feedback (user_id, sender_name, sender_email, role, kind, body, page, device, app_version, photos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [user.id, user.name || '', user.email || '', user.role, f.kind, f.body, f.page, f.device, f.app_version, JSON.stringify(photos)]);
    await audit(user, 'app_feedback.send', 'app_feedback', row.id, { kind: f.kind });
    if ((await settings()).feedback_email) {
      const title = `${f.kind === 'problem' ? 'Problem' : 'Idea'} from ${row.sender_name} (${ROLE_LABEL[row.role]})`;
      const text = `${esc(f.body.slice(0, 600))}${f.body.length > 600 ? '…' : ''}`.replace(/\n/g, '<br>') + (f.page ? `<br><br>Screen: ${esc(f.page)}` : '');
      const html = await emailHtml(esc(title), text, '/company/platform', 'Open the Feedback inbox');
      await Promise.allSettled(platformEmails().map((to) => sendRawEmail(to, `App feedback — ${title}`, html)));
    }
    return { ok: true, id: row.id };
  }),

  // What I sent, with its status and any reply
  'appFeedback.mine': def(ALL, async (_b, { user }) => {
    const rows = await q('SELECT * FROM app_feedback WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [user.id]);
    return { items: await Promise.all(rows.map(forSender)), on: (await settings()).feedback_on };
  }),

  // Whether the Feedback button shows, and for the platform admin how many are new
  'appFeedback.status': def(ALL, async (_b, { user }) => {
    const s = await settings();
    const platform = isPlatformAdmin(user);
    const fresh = platform ? (await one("SELECT count(*)::int AS n FROM app_feedback WHERE status = 'new'")).n : 0;
    return { on: s.feedback_on, platform, new: fresh };
  }),

  'appFeedback.list': plat(async (b) => {
    const [where, args] = filters(b);
    const rows = await q(`SELECT * FROM app_feedback ${where} ORDER BY created_at DESC LIMIT 500`, args);
    const stats = await one(`SELECT
        count(*) FILTER (WHERE status = 'new')::int AS new,
        count(*) FILTER (WHERE kind = 'problem' AND created_at > now() - interval '7 days')::int AS problems_week,
        count(*) FILTER (WHERE kind = 'idea' AND created_at > now() - interval '7 days')::int AS ideas_week,
        count(*) FILTER (WHERE status = 'fixed' AND updated_at > date_trunc('month', now()))::int AS fixed_month
      FROM app_feedback`);
    return { items: rows.map(({ photos, ...f }) => ({ ...f, photo_count: (photos || []).length })), stats };
  }),

  'appFeedback.get': plat(async (b) => {
    required(b, 'id');
    const f = await one('SELECT * FROM app_feedback WHERE id = $1', [b.id]);
    if (!f) fail(404, 'Not found');
    const sender = f.user_id ? await one('SELECT u.phone, u.status, o.id AS officer_id FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE u.id = $1', [f.user_id]) : null;
    const out = await forAdmin(f);
    return { ...out, sender, task: taskText(out) };
  }),

  // Status and the private note
  'appFeedback.update': plat(async (b, { user }) => {
    required(b, 'id');
    const cur = await one('SELECT * FROM app_feedback WHERE id = $1', [b.id]);
    if (!cur) fail(404, 'Not found');
    if (b.status !== undefined && !STATUSES.includes(b.status)) fail(400, 'Unknown status');
    const status = b.status ?? cur.status;
    const note = b.note === undefined ? cur.note : String(b.note).slice(0, 2000);
    await q('UPDATE app_feedback SET status = $2, note = $3, updated_at = now() WHERE id = $1', [b.id, status, note]);
    if (status !== cur.status) {
      await audit(user, 'app_feedback.status', 'app_feedback', b.id, { status });
      if (status === 'fixed' && cur.user_id && cur.user_id !== user.id) {
        await notify([cur.user_id], { kind: 'app_feedback', title: 'Fixed — thanks for telling us', body: cur.body.slice(0, 120), link: '/my-feedback', dedupe: `appfb-fixed-${b.id}` });
      }
    }
    return { ok: true };
  }),

  // A reply shows in the sender's bell and My feedback (and by email when asked)
  'appFeedback.reply': plat(async (b, { user }) => {
    required(b, 'id', 'reply');
    const reply = String(b.reply).trim().slice(0, 2000);
    if (!reply) fail(400, 'Write a reply');
    const cur = await one('SELECT * FROM app_feedback WHERE id = $1', [b.id]);
    if (!cur) fail(404, 'Not found');
    const status = STATUSES.includes(b.status) ? b.status : cur.status === 'new' ? 'looking' : cur.status;
    await q('UPDATE app_feedback SET reply = $2, replied_at = now(), status = $3, updated_at = now() WHERE id = $1', [b.id, reply, status]);
    await audit(user, 'app_feedback.reply', 'app_feedback', b.id, { status });
    if (cur.user_id && cur.user_id !== user.id) {
      await notify([cur.user_id], { kind: 'app_feedback', title: 'Reply to your feedback', body: reply.slice(0, 160), link: '/my-feedback', email: !!b.email });
    }
    return { ok: true, status };
  }),

  'appFeedback.export': plat(async (b) => {
    const [where, args] = filters(b);
    return { csv: toCsv(await q(`SELECT * FROM app_feedback ${where} ORDER BY created_at DESC`, args)) };
  }),

  'appFeedback.settings': plat(async () => settings()),

  'appFeedback.setSettings': plat(async (b, { user }) => {
    const s = await settings();
    const on = b.feedback_on === undefined ? s.feedback_on : !!b.feedback_on;
    const mail = b.feedback_email === undefined ? s.feedback_email : !!b.feedback_email;
    await q('UPDATE settings SET feedback_on = $1, feedback_email = $2 WHERE id = 1', [on, mail]);
    await audit(user, 'app_feedback.settings', 'settings', 1, { feedback_on: on, feedback_email: mail });
    return { feedback_on: on, feedback_email: mail };
  }),
};
