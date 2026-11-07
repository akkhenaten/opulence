// Staff setup: a one-off shared link the platform admin sends to a company's officers when setting up the app.
// Each officer fills in their own details (no login); submissions wait on a page only the platform admin sees,
// and become staff profiles (by hand, or through Orb) — active, with no login invite. The submission is then deleted.
import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { uploadUrl, headObject, deleteObject, downloadUrl } from '../lib/storage.mjs';
import { notify } from '../lib/notify.mjs';
import { newToken } from '../lib/signLinks.mjs';
import { audit } from '../lib/audit.mjs';
import { londonDate } from '../lib/time.mjs';
import { plat, platformEmails } from '../lib/platform.mjs';
import { officerName } from '../lib/names.mjs';
import { cleanStaffDetails, withoutPrivate, officerFromDetails, SETUP_FILES, DOC_KIND, SETUP_TYPES, PHOTO_TYPES, MAX_SETUP_FILE } from '../lib/staffSetup.mjs';
import { seedOnboarding, tickOnboarding, syncOnboarding } from './hr.mjs';
import { assertNotDuplicate } from './officers.mjs';
import { pub } from './_def.mjs';

// The connection's own address: a forwarded-for header can be set by the visitor
const ipOf = (ctx) => ctx.event?.requestContext?.http?.sourceIp || ctx.ip || '';
const nameOf = (d) => `${d.first_name} ${d.last_name}`.trim();

/** The link, only while it is switched on and the token is the current one */
async function openLink(token) {
  const l = token ? await one('SELECT token FROM staff_setup_link WHERE enabled AND token = $1', [String(token)]) : null;
  if (!l) fail(410, 'This form is closed. Please contact the office.');
}

const dropFiles = (keys) => Promise.all(keys.filter(Boolean).map((k) => deleteObject(k).catch((e) => console.warn('[staff setup] delete failed', k, e.message))));

// An existing staff record with the same email or SIA number
const duplicateOf = (d) => one(
  `SELECT id, ${officerName('')} AS name, status FROM officers
    WHERE ($1 <> '' AND lower(email) = $1) OR ($2 <> '' AND replace(coalesce(sia_number, ''), ' ', '') = $2) LIMIT 1`,
  [d.email || '', d.sia_number || '']);

/** Submissions nobody turned into a profile are deleted after 60 days; uploads never sent after a day. From the scheduled run. */
export async function staffSetupJobs() {
  const old = await q("DELETE FROM staff_setup_submissions WHERE created_at < now() - interval '60 days' RETURNING files");
  for (const s of old) await dropFiles(Object.values(s.files || {}));
  const orphans = await q("DELETE FROM staff_setup_uploads WHERE created_at < now() - interval '1 day' RETURNING key");
  for (const u of orphans) {
    const used = await one("SELECT 1 FROM staff_setup_submissions s WHERE EXISTS (SELECT 1 FROM jsonb_each_text(s.files) f WHERE f.value = $1)", [u.key])
      || await one('SELECT 1 FROM documents WHERE s3_key = $1', [u.key]) || await one('SELECT 1 FROM officers WHERE photo_key = $1', [u.key]);
    if (!used) await dropFiles([u.key]);
  }
  if (old.length) await audit(null, 'staff_setup.purge', 'staff_setup', null, { count: old.length });
  return { purged: old.length, orphans: orphans.length };
}

/** Turn one submission into an active staff profile (no login), with its contact and documents; then delete it */
export async function createFromSubmission(id, user) {
  const s = need(await one('SELECT * FROM staff_setup_submissions WHERE id = $1', [id]), 'Submission not found — it may already be a staff profile');
  const d = s.details;
  const files = s.files || {};
  await assertNotDuplicate({ one }, { email: d.email, sia_number: d.sia_number || '' });
  const officerId = await tx(async (t) => {
    const o = await insert('officers', officerFromDetails(d, files.photo || null), t);
    await seedOnboarding(t, o.id);
    if (d.ec_name) await t.q('INSERT INTO emergency_contacts (officer_id, name, relationship, phone) VALUES ($1,$2,$3,$4)', [o.id, d.ec_name, d.ec_relationship || '', d.ec_phone || '']);
    for (const [kind, key] of Object.entries(files)) {
      if (!DOC_KIND[kind]) continue;
      const h = await headObject(key);
      await t.q("INSERT INTO documents (owner_type, owner_id, kind, title, number, expiry, s3_key, mime, uploaded_by) VALUES ('officer',$1,$2,$3,$4,$5,$6,$7,$8)",
        [o.id, DOC_KIND[kind], SETUP_FILES[kind], kind === 'sia_front' ? d.sia_number || '' : '', kind === 'sia_front' ? d.sia_expiry || null : null, key, h?.mime || null, user.id]);
    }
    await t.q('DELETE FROM staff_setup_submissions WHERE id = $1', [id]);
    return o.id;
  });
  for (const kind of Object.keys(files)) if (DOC_KIND[kind]) await tickOnboarding(officerId, DOC_KIND[kind]);
  await syncOnboarding(officerId);
  await audit(user, 'officer.create', 'officer', officerId, { from: 'staff_setup' });
  return { id: officerId, name: nameOf(d) };
}

export const actions = {
  // The public form: is the link open?
  'staffSetup.info': pub(async (b) => {
    const l = b.token ? await one('SELECT 1 FROM staff_setup_link WHERE enabled AND token = $1', [String(b.token)]) : null;
    return { open: !!l };
  }),

  'staffSetup.uploadUrl': pub(async (b, ctx) => {
    await openLink(b.token);
    const ip = ipOf(ctx);
    if (!SETUP_FILES[b.kind]) fail(400, 'Unknown file');
    const type = String(b.content_type || '');
    if (b.kind === 'photo' ? !PHOTO_TYPES.test(type) : !SETUP_TYPES.test(type)) fail(400, b.kind === 'photo' ? 'Please upload a photo' : 'Please upload a PDF or a photo');
    const { n } = await one("SELECT count(*)::int AS n FROM staff_setup_uploads WHERE ip = $1 AND created_at > now() - interval '1 hour'", [ip]);
    if (n >= 15) fail(429, 'Too many uploads — please try again later');
    const r = await uploadUrl('staffsetup', b.filename, type);
    await q('INSERT INTO staff_setup_uploads (key, ip, kind) VALUES ($1,$2,$3)', [r.key, ip, b.kind]);
    return r;
  }),

  'staffSetup.submit': pub(async (b, ctx) => {
    if (b.website) return { ok: true }; // honeypot: bots fill every field
    await openLink(b.token);
    const ip = ipOf(ctx);
    const c = cleanStaffDetails(b, londonDate(new Date()));
    if (c.error) fail(400, c.error);
    const { n } = await one("SELECT count(*)::int AS n FROM staff_setup_submissions WHERE ip = $1 AND created_at > now() - interval '1 hour'", [ip]);
    if (n >= 5) fail(429, 'Too many forms sent — please try again later');
    // Every file must be one this visitor uploaded just now, and within the size limit
    for (const [kind, key] of Object.entries(c.files)) {
      if (!(await one("SELECT 1 FROM staff_setup_uploads WHERE key = $1 AND ip = $2 AND kind = $3 AND created_at > now() - interval '2 hours'", [key, ip, kind]))) fail(400, 'Please upload your files again');
      const h = await headObject(key);
      if (!h) fail(400, 'Please upload your files again');
      if (h.size > MAX_SETUP_FILE) fail(400, `${SETUP_FILES[kind]} must be under 10 MB`);
    }
    const s = await one('INSERT INTO staff_setup_submissions (details, files, ip) VALUES ($1,$2,$3) RETURNING id', [c.details, c.files, ip]);
    await q('DELETE FROM staff_setup_uploads WHERE key = ANY($1)', [Object.values(c.files)]);
    const admins = (await q("SELECT id FROM users WHERE lower(email) = ANY($1) AND status = 'active'", [platformEmails()])).map((u) => u.id);
    await notify(admins, { kind: 'staff_setup', title: `Staff details from ${nameOf(c.details)}`, body: 'Ready to become a staff profile in Staff setup.', link: '/company/staff-setup' });
    await audit(null, 'staff_setup.submit', 'staff_setup', s.id, { ip });
    return { ok: true };
  }),

  // The platform admin's page
  'staffSetup.link': plat(async () => {
    const l = await one('SELECT token, enabled, created_at FROM staff_setup_link WHERE id = 1');
    const { n } = await one('SELECT count(*)::int AS n FROM staff_setup_submissions');
    return { link: l || null, waiting: n };
  }),

  'staffSetup.toggle': plat(async (b, { user }) => {
    const on = b.enabled !== false;
    const l = await one(
      `INSERT INTO staff_setup_link (id, token, enabled, created_by) VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET enabled = $2 RETURNING token, enabled, created_at`, [newToken(), on, user.id]);
    await audit(user, on ? 'staff_setup.open' : 'staff_setup.close', 'staff_setup', null);
    return { link: l };
  }),

  // A new link: the old one stops working at once
  'staffSetup.rotate': plat(async (b, { user }) => {
    const l = await one(
      `INSERT INTO staff_setup_link (id, token, enabled, created_by) VALUES (1, $1, true, $2)
       ON CONFLICT (id) DO UPDATE SET token = $1, created_at = now(), created_by = $2 RETURNING token, enabled, created_at`, [newToken(), user.id]);
    await audit(user, 'staff_setup.rotate', 'staff_setup', null);
    return { link: l };
  }),

  // Waiting submissions, without date of birth, NI or bank details (this is also what Orb reads)
  'staffSetup.list': plat(async () => {
    const rows = await q('SELECT * FROM staff_setup_submissions ORDER BY created_at');
    return Promise.all(rows.map(async (s) => ({
      id: s.id, name: nameOf(s.details), ...withoutPrivate(s.details), created_at: s.created_at,
      files: Object.keys(s.files || {}).map((k) => SETUP_FILES[k] || k), duplicate: await duplicateOf(s.details),
    })));
  }),

  'staffSetup.get': plat(async (b) => {
    required(b, 'id');
    const s = need(await one('SELECT * FROM staff_setup_submissions WHERE id = $1', [b.id]), 'Submission not found');
    const files = await Promise.all(Object.entries(s.files || {}).map(async ([kind, key]) => ({ kind, title: SETUP_FILES[kind] || kind, url: await downloadUrl(key, SETUP_FILES[kind]) })));
    return { id: s.id, name: nameOf(s.details), details: s.details, files, created_at: s.created_at, duplicate: await duplicateOf(s.details) };
  }),

  'staffSetup.create': plat(async (b, { user }) => {
    required(b, 'id');
    return createFromSubmission(b.id, user);
  }),

  'staffSetup.discard': plat(async (b, { user }) => {
    required(b, 'id');
    const s = need(await one('DELETE FROM staff_setup_submissions WHERE id = $1 RETURNING files', [b.id]), 'Submission not found');
    await dropFiles(Object.values(s.files || {}));
    await audit(user, 'staff_setup.discard', 'staff_setup', b.id);
    return { ok: true };
  }),
};
