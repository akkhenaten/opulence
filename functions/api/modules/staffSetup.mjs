// Staff setup: one-off shared links the platform admin sends when setting up a company's app — one for officers,
// one for venue managers. Each person fills in their own details (no login); submissions wait on a page only the
// platform admin sees and are turned (by hand, or through Orb) into staff profiles — active, with no login invite —
// or invited Venue Manager logins, with no email sent. The submission is then deleted.
import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { uploadUrl, headObject, deleteObject, downloadUrl } from '../lib/storage.mjs';
import { notify } from '../lib/notify.mjs';
import { newToken } from '../lib/signLinks.mjs';
import { audit } from '../lib/audit.mjs';
import { londonDate } from '../lib/time.mjs';
import { plat, platformEmails, isPlatformEmail } from '../lib/platform.mjs';
import { officerName } from '../lib/names.mjs';
import { cleanStaffDetails, cleanVenueManager, withoutPrivate, officerFromDetails, SETUP_FILES, DOC_KIND, SETUP_TYPES, PHOTO_TYPES, MAX_SETUP_FILE } from '../lib/staffSetup.mjs';
import { seedOnboarding, tickOnboarding, syncOnboarding } from './hr.mjs';
import { assertNotDuplicate, createOfficerLogin } from './officers.mjs';
import { createInvite, setVenues, sendInviteMail } from './users.mjs';
import { pub } from './_def.mjs';

// The connection's own address: a forwarded-for header can be set by the visitor
const ipOf = (ctx) => ctx.event?.requestContext?.http?.sourceIp || ctx.ip || '';
const nameOf = (d) => `${d.first_name} ${d.last_name}`.trim();

// Row 1 is the officers' link, row 2 the venue managers'
const LINK_ID = { officer: 1, venue: 2 };
const kindOf = (k) => (k === 'venue' ? 'venue' : 'officer');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activeVenues = () => q('SELECT id, name FROM venues WHERE active ORDER BY name');
// The venue a manager typed, matched to an active venue by its name (case and spacing ignored)
const squash = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const matchVenue = (d, venues) => venues.filter((v) => squash(d.venue_name) && squash(v.name) === squash(d.venue_name));

/** The link's kind, only while it is switched on and the token is the current one */
async function openLink(token) {
  const l = token ? await one('SELECT id FROM staff_setup_link WHERE enabled AND token = $1', [String(token)]) : null;
  if (!l) fail(410, 'This form is closed. Please contact the office.');
  return l.id === LINK_ID.venue ? 'venue' : 'officer';
}

const dropFiles = (keys) => Promise.all(keys.filter(Boolean).map((k) => deleteObject(k).catch((e) => console.warn('[staff setup] delete failed', k, e.message))));

// An existing staff record with the same email or SIA number; for a venue manager, an existing login
const duplicateOf = (s) => (s.kind === 'venue'
  ? one('SELECT id, name, status FROM users WHERE lower(email) = $1 LIMIT 1', [s.details.email || ''])
  : officerDuplicate(s.details));
const officerDuplicate = (d) => one(
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
      || await one('SELECT 1 FROM documents WHERE s3_key = $1', [u.key]) || await one('SELECT 1 FROM officers WHERE photo_key = $1', [u.key])
      || await one('SELECT 1 FROM users WHERE photo_key = $1', [u.key]);
    if (!used) await dropFiles([u.key]);
  }
  if (old.length) await audit(null, 'staff_setup.purge', 'staff_setup', null, { count: old.length });
  return { purged: old.length, orphans: orphans.length };
}

/** The invite email, with its link to share when the email didn't go; never undoes what was created */
async function inviteOf(makeLogin) {
  try {
    const { link, emailed } = await sendInviteMail(await makeLogin());
    return { invite_link: link, emailed };
  } catch (e) {
    return { invite_error: e.message };
  }
}

/** Turn one submission into an active staff profile with its contact and documents, then delete it; with `invite`, also email them a login */
export async function createFromSubmission(id, user, invite = false) {
  const s = need(await one("SELECT * FROM staff_setup_submissions WHERE id = $1 AND kind = 'officer'", [id]), 'Submission not found — it may already be a staff profile');
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
        [o.id, DOC_KIND[kind], SETUP_FILES[kind], kind === 'sia_front' ? d.sia_number || '' : kind === 'rtw' ? d.rtw_share_code || '' : '', kind === 'sia_front' ? d.sia_expiry || null : null, key, h?.mime || null, user.id]);
    }
    // A share code sent without a picture still goes to Compliance, ready to check on GOV.UK
    if (d.rtw_share_code && !files.rtw) {
      await t.q("INSERT INTO documents (owner_type, owner_id, kind, title, number, uploaded_by) VALUES ('officer',$1,'rtw','Right to work share code',$2,$3)", [o.id, d.rtw_share_code, user.id]);
    }
    await t.q('DELETE FROM staff_setup_submissions WHERE id = $1', [id]);
    return o.id;
  });
  for (const kind of Object.keys(files)) if (DOC_KIND[kind]) await tickOnboarding(officerId, DOC_KIND[kind]);
  if (d.rtw_share_code) await tickOnboarding(officerId, 'rtw');
  await syncOnboarding(officerId);
  await audit(user, 'officer.create', 'officer', officerId, { from: 'staff_setup' });
  return { id: officerId, name: nameOf(d), ...(invite ? await inviteOf(() => createOfficerLogin(officerId)) : {}) };
}

/** Turn a venue manager's submission into an invited Venue Manager login for their venues, with their photo, then delete it; the invite is emailed only with `invite` */
export async function createVenueManager(id, venueIds, user, invite = false) {
  const s = need(await one("SELECT * FROM staff_setup_submissions WHERE id = $1 AND kind = 'venue'", [id]), 'Submission not found — it may already have a login');
  const d = s.details;
  const given = Array.isArray(venueIds) && venueIds.length ? venueIds : matchVenue(d, await activeVenues()).map((v) => v.id);
  const ids = [...new Set(given.map(String))].filter((v) => UUID.test(v));
  if (!ids.length) fail(400, `${nameOf(d)} wrote "${d.venue_name}", which doesn't match a venue — pick their venue in Staff setup first`);
  if (isPlatformEmail(d.email)) fail(400, 'This email belongs to the platform admin');
  const venues = await q('SELECT id, client_id FROM venues WHERE id = ANY($1::uuid[])', [ids]);
  if (venues.length !== ids.length) fail(400, 'Venue not found');
  const clients = [...new Set(venues.map((v) => v.client_id).filter(Boolean))];
  const u = await tx(async (t) => {
    const created = await createInvite(t, { email: d.email, name: nameOf(d), role: 'venue', phone: d.phone, goes_by: d.goes_by || '' });
    if (clients.length === 1) await t.q('UPDATE users SET client_id = $2 WHERE id = $1', [created.id, clients[0]]);
    if (s.files?.photo) await t.q('UPDATE users SET photo_key = $2 WHERE id = $1', [created.id, s.files.photo]);
    await setVenues(t, created.id, 'venue', ids);
    await t.q('DELETE FROM staff_setup_submissions WHERE id = $1', [id]);
    return created;
  });
  const sent = invite ? await inviteOf(async () => u) : {};
  await audit(user, 'user.invite', 'user', u.id, { role: 'venue', from: 'staff_setup', emailed: !!sent.emailed });
  return { id: u.id, name: nameOf(d), kind: 'venue', ...sent };
}

export const actions = {
  // The public form: is the link open?
  // The public form: is the link open, and which form is it? (Venue managers type their venue; no list is shown.)
  'staffSetup.info': pub(async (b) => {
    const l = b.token ? await one('SELECT id FROM staff_setup_link WHERE enabled AND token = $1', [String(b.token)]) : null;
    if (!l) return { open: false };
    return { open: true, kind: l.id === LINK_ID.venue ? 'venue' : 'officer' };
  }),

  'staffSetup.uploadUrl': pub(async (b, ctx) => {
    // Venue managers send a profile photo only
    if ((await openLink(b.token)) === 'venue' && b.kind !== 'photo') fail(400, 'This form takes a profile photo only');
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
    const kind = await openLink(b.token);
    const ip = ipOf(ctx);
    const c = kind === 'venue' ? cleanVenueManager(b) : cleanStaffDetails(b, londonDate(new Date()));
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
    const s = await one('INSERT INTO staff_setup_submissions (details, files, ip, kind) VALUES ($1,$2,$3,$4) RETURNING id', [c.details, c.files, ip, kind]);
    await q('DELETE FROM staff_setup_uploads WHERE key = ANY($1)', [Object.values(c.files)]);
    const admins = (await q("SELECT id FROM users WHERE lower(email) = ANY($1) AND status = 'active'", [platformEmails()])).map((u) => u.id);
    await notify(admins, kind === 'venue'
      ? { kind: 'staff_setup', title: `Venue manager details from ${nameOf(c.details)}`, body: 'Ready to become a Venue Manager login in Staff setup.', link: '/company/staff-setup' }
      : { kind: 'staff_setup', title: `Staff details from ${nameOf(c.details)}`, body: 'Ready to become a staff profile in Staff setup.', link: '/company/staff-setup' });
    await audit(null, 'staff_setup.submit', 'staff_setup', s.id, { ip, kind });
    return { ok: true };
  }),

  // The platform admin's page: kind officer (default) | venue
  'staffSetup.link': plat(async (b) => {
    const kind = kindOf(b.kind);
    const l = await one('SELECT token, enabled, created_at FROM staff_setup_link WHERE id = $1', [LINK_ID[kind]]);
    const { n } = await one('SELECT count(*)::int AS n FROM staff_setup_submissions WHERE kind = $1', [kind]);
    return { link: l || null, waiting: n };
  }),

  'staffSetup.toggle': plat(async (b, { user }) => {
    const kind = kindOf(b.kind);
    const on = b.enabled !== false;
    const l = await one(
      `INSERT INTO staff_setup_link (id, token, enabled, created_by) VALUES ($4, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET enabled = $2 RETURNING token, enabled, created_at`, [newToken(), on, user.id, LINK_ID[kind]]);
    await audit(user, on ? 'staff_setup.open' : 'staff_setup.close', 'staff_setup', null, { kind });
    return { link: l };
  }),

  // A new link: the old one stops working at once
  'staffSetup.rotate': plat(async (b, { user }) => {
    const kind = kindOf(b.kind);
    const l = await one(
      `INSERT INTO staff_setup_link (id, token, enabled, created_by) VALUES ($3, $1, true, $2)
       ON CONFLICT (id) DO UPDATE SET token = $1, created_at = now(), created_by = $2 RETURNING token, enabled, created_at`, [newToken(), user.id, LINK_ID[kind]]);
    await audit(user, 'staff_setup.rotate', 'staff_setup', null, { kind });
    return { link: l };
  }),

  // Waiting submissions (kind officer | venue), without date of birth, NI or bank details (this is also what Orb reads).
  // A venue manager's venues: the one their typed venue_name matches; empty means it matched none, so the admin picks it.
  'staffSetup.list': plat(async () => {
    const rows = await q('SELECT * FROM staff_setup_submissions ORDER BY created_at');
    const all = await activeVenues();
    return Promise.all(rows.map(async (s) => ({
      id: s.id, kind: s.kind, name: nameOf(s.details), ...withoutPrivate(s.details), created_at: s.created_at,
      ...(s.kind === 'venue' ? { venues: matchVenue(s.details, all).map((v) => v.name) } : {}),
      files: Object.keys(s.files || {}).map((k) => SETUP_FILES[k] || k), duplicate: await duplicateOf(s),
    })));
  }),

  'staffSetup.get': plat(async (b) => {
    required(b, 'id');
    const s = need(await one('SELECT * FROM staff_setup_submissions WHERE id = $1', [b.id]), 'Submission not found');
    const files = await Promise.all(Object.entries(s.files || {}).map(async ([kind, key]) => ({ kind, title: SETUP_FILES[kind] || kind, url: await downloadUrl(key, SETUP_FILES[kind]) })));
    const venues = s.kind === 'venue' ? await activeVenues() : undefined;
    const matched = venues && matchVenue(s.details, venues).map((v) => v.id);
    return { id: s.id, kind: s.kind, name: nameOf(s.details), details: s.details, files, created_at: s.created_at, duplicate: await duplicateOf(s), venues, matched };
  }),

  // venue_ids: for a venue manager, the venues to link (defaults to the venue their typed name matches).
  // invite: also email them their login invite (invite_link comes back to share; invite_error if it couldn't be made)
  'staffSetup.create': plat(async (b, { user }) => {
    required(b, 'id');
    const s = need(await one('SELECT kind FROM staff_setup_submissions WHERE id = $1', [b.id]), 'Submission not found — it may already have been set up');
    return s.kind === 'venue' ? createVenueManager(b.id, b.venue_ids, user, b.invite === true) : createFromSubmission(b.id, user, b.invite === true);
  }),

  'staffSetup.discard': plat(async (b, { user }) => {
    required(b, 'id');
    const s = need(await one('DELETE FROM staff_setup_submissions WHERE id = $1 RETURNING files', [b.id]), 'Submission not found');
    await dropFiles(Object.values(s.files || {}));
    await audit(user, 'staff_setup.discard', 'staff_setup', b.id);
    return { ok: true };
  }),
};
