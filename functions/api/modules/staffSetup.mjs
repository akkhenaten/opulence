// Staff setup: one-off shared links the platform admin sends when setting up a company's app — one for officers,
// one for venue managers. Each person fills in their own details and sets their password. The forms wait in People for
// a company manager (or the platform admin), who taps Make live: an officer becomes an active staff profile with an
// active Officer app login, a venue manager an active Venue manager login for their venues, each with the password
// they chose, and both get a "You're live" email. A form from someone already on file is a double: discarding it
// opens their record. The submission is then deleted.
import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { hashPassword, goesBy } from '../lib/auth.mjs';
import { uploadUrl, headObject, deleteObject, downloadUrl } from '../lib/storage.mjs';
import { notify, sendRawEmail, emailHtml } from '../lib/notify.mjs';
import { newToken } from '../lib/signLinks.mjs';
import { audit } from '../lib/audit.mjs';
import { londonDate } from '../lib/time.mjs';
import { plat, platformEmails, isPlatformEmail, isPlatformAdmin } from '../lib/platform.mjs';
import { getBrand } from '../lib/brand.mjs';
import { welcomeDue } from '../lib/feed.mjs';
import { celebrate } from './everydayJobs.mjs';
import { officerName } from '../lib/names.mjs';
import { cleanStaffDetails, cleanVenueManager, checkSetupPassword, withoutPrivate, officerFromDetails, SETUP_FILES, DOC_KIND, SETUP_TYPES, PHOTO_TYPES, MAX_SETUP_FILE } from '../lib/staffSetup.mjs';
import { seedOnboarding, tickOnboarding, syncOnboarding } from './hr.mjs';
import { assertNotDuplicate, createOfficerLogin } from './officers.mjs';
import { createInvite, setVenues, sendInviteMail } from './users.mjs';
import { pub, def, CO } from './_def.mjs';

// The connection's own address: a forwarded-for header can be set by the visitor
const ipOf = (ctx) => ctx.event?.requestContext?.http?.sourceIp || ctx.ip || '';
const nameOf = (d) => `${d.first_name} ${d.last_name}`.trim();

// Row 1 is the officers' link, row 2 the venue managers'
const LINK_ID = { officer: 1, venue: 2 };
const kindOf = (k) => (k === 'venue' ? 'venue' : 'officer');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const activeVenues = () => q('SELECT id, name FROM venues WHERE active ORDER BY name');
// The venues a manager typed, matched to active venues by name (case and spacing ignored)
const squash = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const typedVenues = (d) => (d.venue_names?.length ? d.venue_names : [d.venue_name]).filter(Boolean);
const matchVenue = (d, venues) => { const want = typedVenues(d).map(squash).filter(Boolean); return venues.filter((v) => want.includes(squash(v.name))); };

/** The link's kind, only while it is switched on and the token is the current one */
async function openLink(token) {
  const l = token ? await one('SELECT id FROM staff_setup_link WHERE enabled AND token = $1', [String(token)]) : null;
  if (!l) fail(410, 'This form is closed. Please contact the office.');
  return l.id === LINK_ID.venue ? 'venue' : 'officer';
}

const dropFiles = (keys) => Promise.all(keys.filter(Boolean).map((k) => deleteObject(k).catch((e) => console.warn('[staff setup] delete failed', k, e.message))));

// A double: someone already on file. For an officer, a staff record with the same email or SIA number, else a login
// with that email; for a venue manager, a login with that email. `tab` is where their page opens: a login's Access tab,
// where the office can add what they need.
const loginWith = async (email) => {
  const u = email ? await one('SELECT id, name, status FROM users WHERE lower(email) = $1 LIMIT 1', [email]) : null;
  return u && { ...u, match: 'email', tab: 'access' };
};
async function duplicateOf(s) {
  const d = s.details || {};
  const email = String(d.email || '').toLowerCase();
  if (s.kind === 'venue') return loginWith(email);
  const sia = String(d.sia_number || '').replace(/\s+/g, '');
  const o = await one(
    `SELECT id, ${officerName('')} AS name, status, ($1 <> '' AND lower(email) = $1) AS by_email FROM officers
      WHERE ($1 <> '' AND lower(email) = $1) OR ($2 <> '' AND replace(coalesce(sia_number, ''), ' ', '') = $2) ORDER BY 4 DESC LIMIT 1`,
    [email, sia]);
  if (o) return { id: o.id, name: o.name, status: o.status, match: o.by_email ? 'email' : 'sia', tab: 'overview' };
  return loginWith(email);
}

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

// The person a form already became, for "Open their page" when a second manager taps Make live
const madeFrom = async (id) => (await one("SELECT entity_id FROM audit_log WHERE action IN ('officer.create', 'user.create') AND detail->>'submission' = $1 ORDER BY action = 'officer.create' DESC, created_at DESC LIMIT 1", [String(id)]))?.entity_id || null;
const goneExtra = async (id) => { const p = await madeFrom(id); return { person_id: p, officer_id: p }; };

/** "You're live": they sign in with the email and the password they set on the form. False when the mail didn't go. */
async function sendLiveMail(d, kind = 'officer') {
  const { name } = await getBrand();
  const app = kind === 'venue' ? 'the Venue portal' : 'the Officer app';
  try {
    return await sendRawEmail(d.email, `You're live at ${name}`, await emailHtml(`You're live, ${esc(d.goes_by || d.first_name)}`,
      `The office has checked your details. Sign in to ${app} with ${esc(d.email)} and the password you set on the form.`, '/login', 'Sign in'));
  } catch (e) {
    console.warn('[staff setup] live email failed', e.message);
    return false;
  }
}

/**
 * Make live: one submission becomes an active staff profile with each answer in its section, then is deleted.
 * A form with a password also becomes their active Officer app login (no invite); an older form without one gets
 * the invite email instead. Two managers at once: the first claims the form, the second is told it is already live.
 */
export async function createFromSubmission(id, user) {
  const s = await one("SELECT * FROM staff_setup_submissions WHERE id = $1 AND kind = 'officer'", [id]);
  if (!s) fail(409, 'Already made live', await goneExtra(id));
  const d = s.details;
  const files = s.files || {};
  const name = nameOf(d);
  await assertNotDuplicate({ one }, { email: d.email, sia_number: d.sia_number || '' });
  const { officerId, userId } = await tx(async (t) => {
    if (!(await t.one('DELETE FROM staff_setup_submissions WHERE id = $1 RETURNING id', [id]))) fail(409, 'Already made live', { person_id: null, officer_id: null });
    const o = await insert('officers', officerFromDetails(d, files.photo || null), t);
    await seedOnboarding(t, o.id);
    if (d.ec_name) await t.q('INSERT INTO emergency_contacts (officer_id, name, relationship, phone) VALUES ($1,$2,$3,$4)', [o.id, d.ec_name, d.ec_relationship || '', d.ec_phone || '']);
    for (const [kind, key] of Object.entries(files)) {
      if (!DOC_KIND[kind]) continue;
      const h = await headObject(key);
      const sia = kind === 'sia_front' || kind === 'sia_back';
      await t.q("INSERT INTO documents (owner_type, owner_id, kind, title, number, expiry, s3_key, mime, uploaded_by) VALUES ('officer',$1,$2,$3,$4,$5,$6,$7,$8)",
        [o.id, DOC_KIND[kind], SETUP_FILES[kind], sia ? d.sia_number || '' : '', sia ? d.sia_expiry || null : null, key, h?.mime || null, user.id]);
    }
    // The share code goes to Right to work, ready to check on GOV.UK
    if (d.rtw_share_code) {
      await t.q("INSERT INTO documents (owner_type, owner_id, kind, title, number, uploaded_by) VALUES ('officer',$1,'rtw','Right to work share code',$2,$3)", [o.id, d.rtw_share_code, user.id]);
    }
    if (!s.password_hash) return { officerId: o.id, userId: null };
    const u = await t.one(
      "INSERT INTO users (email, name, role, phone, password_hash, status, goes_by) VALUES (lower($1),$2,'officer',$3,$4,'active',$5) RETURNING id",
      [d.email, name, d.phone || '', s.password_hash, goesBy(d.goes_by || '')]);
    await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, u.id]);
    return { officerId: o.id, userId: u.id };
  });
  for (const kind of new Set(Object.keys(files).map((k) => DOC_KIND[k]).filter(Boolean))) await tickOnboarding(officerId, kind);
  if (d.rtw_share_code) await tickOnboarding(officerId, 'rtw');
  await syncOnboarding(officerId);
  await audit(user, 'officer.create', 'officer', officerId, { from: 'staff_setup', submission: String(id), login: userId ? 'active' : 'invited' });
  if (!userId) return { id: officerId, name, live: true, invited: true, ...(await inviteOf(() => createOfficerLogin(officerId))) };
  await audit(user, 'user.create', 'user', userId, { role: 'officer', from: 'staff_setup' });
  const w = await one('SELECT id, name, email, role, status, system, feed_prefs FROM users WHERE id = $1', [userId]);
  if (welcomeDue(w, { platform: isPlatformAdmin(w) })) await celebrate({ type: 'welcome', user_id: w.id, name: w.name, key: `welcome:${w.id}` });
  return { id: officerId, name, live: true, emailed: await sendLiveMail(d) };
}

/**
 * Make live for a venue manager: an active Venue manager login for their venues, with the password they chose and
 * their photo, then the form is deleted. An older form without a password gets an invited login and the invite email.
 */
export async function createVenueManager(id, venueIds, user) {
  const s = await one("SELECT * FROM staff_setup_submissions WHERE id = $1 AND kind = 'venue'", [id]);
  if (!s) fail(409, 'Already made live', await goneExtra(id));
  const d = s.details;
  const name = nameOf(d);
  const given = Array.isArray(venueIds) && venueIds.length ? venueIds : matchVenue(d, await activeVenues()).map((v) => v.id);
  const ids = [...new Set(given.map(String))].filter((v) => UUID.test(v));
  if (!ids.length) fail(400, `Pick their venues: ${name} wrote "${typedVenues(d).join('", "')}", which doesn't match a venue`, { field: 'venues' });
  if (isPlatformEmail(d.email)) fail(400, 'This email belongs to the platform admin');
  const venues = await q('SELECT id, client_id FROM venues WHERE id = ANY($1::uuid[])', [ids]);
  if (venues.length !== ids.length) fail(400, 'Venue not found');
  const clients = [...new Set(venues.map((v) => v.client_id).filter(Boolean))];
  const u = await tx(async (t) => {
    if (!(await t.one('DELETE FROM staff_setup_submissions WHERE id = $1 RETURNING id', [id]))) fail(409, 'Already made live', { person_id: null, officer_id: null });
    const created = s.password_hash
      ? await t.one(
        "INSERT INTO users (email, name, role, phone, password_hash, status, goes_by) VALUES (lower($1),$2,'venue',$3,$4,'active',$5) RETURNING *",
        [d.email, name, d.phone || '', s.password_hash, goesBy(d.goes_by || '')])
      : await createInvite(t, { email: d.email, name, role: 'venue', phone: d.phone, goes_by: d.goes_by || '' });
    if (clients.length === 1) await t.q('UPDATE users SET client_id = $2 WHERE id = $1', [created.id, clients[0]]);
    if (s.files?.photo) await t.q('UPDATE users SET photo_key = $2 WHERE id = $1', [created.id, s.files.photo]);
    await setVenues(t, created.id, 'venue', ids);
    return created;
  });
  await audit(user, 'user.create', 'user', u.id, { role: 'venue', from: 'staff_setup', submission: String(id), login: s.password_hash ? 'active' : 'invited' });
  if (!s.password_hash) return { id: u.id, name, kind: 'venue', live: true, invited: true, ...(await inviteOf(async () => u)) };
  const w = await one('SELECT id, name, email, role, status, system, feed_prefs FROM users WHERE id = $1', [u.id]);
  if (welcomeDue(w, { platform: isPlatformAdmin(w) })) await celebrate({ type: 'welcome', user_id: w.id, name: w.name, key: `welcome:${w.id}` });
  return { id: u.id, name, kind: 'venue', live: true, emailed: await sendLiveMail(d, 'venue') };
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
    if (c.error) fail(400, c.error, c.field ? { field: c.field } : undefined);
    const pw = checkSetupPassword(b.password, b.password_confirm);
    if (pw.error) fail(400, pw.error, { field: pw.field });
    if (await one('SELECT 1 FROM users WHERE email = lower($1)', [c.details.email])) {
      fail(409, 'This email already has a login. Sign in, or ask the office to update your details.', { field: 'email' });
    }
    const { n } = await one("SELECT count(*)::int AS n FROM staff_setup_submissions WHERE ip = $1 AND created_at > now() - interval '1 hour'", [ip]);
    if (n >= 5) fail(429, 'Too many forms sent — please try again later');
    // Every file must be one this visitor uploaded just now, and within the size limit
    for (const [kind, key] of Object.entries(c.files)) {
      if (!(await one("SELECT 1 FROM staff_setup_uploads WHERE key = $1 AND ip = $2 AND kind = $3 AND created_at > now() - interval '2 hours'", [key, ip, kind]))) fail(400, 'Please upload your files again');
      const h = await headObject(key);
      if (!h) fail(400, 'Please upload your files again');
      if (h.size > MAX_SETUP_FILE) fail(400, `${SETUP_FILES[kind]} must be under 10 MB`);
    }
    // The password is kept only as a hash, in its own column, never with the details
    const hash = hashPassword(b.password);
    const s = await one('INSERT INTO staff_setup_submissions (details, files, ip, kind, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id', [c.details, c.files, ip, kind, hash]);
    await q('DELETE FROM staff_setup_uploads WHERE key = ANY($1)', [Object.values(c.files)]);
    // Every form goes to every company manager and the platform admin
    const to = (await q("SELECT id FROM users WHERE (lower(email) = ANY($1) OR role = 'company') AND status = 'active' AND NOT system", [platformEmails()])).map((u) => u.id);
    await notify(to, {
      kind: 'staff_setup', title: `${kind === 'venue' ? 'New venue manager form' : 'New staff form'} from ${nameOf(c.details)}`,
      body: 'Check their details and make them live.', link: `/company/staff?form=${s.id}`,
    });
    await audit(null, 'staff_setup.submit', 'staff_setup', s.id, { ip, kind });
    return { ok: true, email: c.details.email };
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
  // A venue manager's venues: those their typed venue names match; empty means it matched none, so the admin picks it.
  'staffSetup.list': def(CO, async () => {
    const rows = await q('SELECT * FROM staff_setup_submissions ORDER BY created_at');
    const all = await activeVenues();
    return Promise.all(rows.map(async (s) => ({
      id: s.id, kind: s.kind, name: nameOf(s.details), ...withoutPrivate(s.details), created_at: s.created_at,
      ...(s.kind === 'venue' ? { venues: matchVenue(s.details, all).map((v) => v.name) } : {}),
      files: Object.keys(s.files || {}).map((k) => SETUP_FILES[k] || k), has_password: !!s.password_hash, duplicate: await duplicateOf(s),
    })));
  }),

  'staffSetup.get': def(CO, async (b) => {
    required(b, 'id');
    const s = await one('SELECT * FROM staff_setup_submissions WHERE id = $1', [b.id]);
    if (!s) fail(404, 'This form has already been made live or discarded', await goneExtra(b.id));
    const files = await Promise.all(Object.entries(s.files || {}).map(async ([kind, key]) => ({ kind, title: SETUP_FILES[kind] || kind, url: await downloadUrl(key, SETUP_FILES[kind]) })));
    const venues = s.kind === 'venue' ? await activeVenues() : undefined;
    const matched = venues && matchVenue(s.details, venues).map((v) => v.id);
    return { id: s.id, kind: s.kind, name: nameOf(s.details), details: s.details, files, created_at: s.created_at, has_password: !!s.password_hash, duplicate: await duplicateOf(s), venues, matched };
  }),

  // Make live, for an officer or a venue manager. venue_ids: a venue manager's venues (defaults to those their typed
  // names match). A double is never made live: the 409 carries who it is, so the sheet offers Discard and open.
  'staffSetup.create': def(CO, async (b, { user }) => {
    required(b, 'id');
    const s = await one('SELECT * FROM staff_setup_submissions WHERE id = $1', [b.id]);
    if (!s) fail(409, 'Already made live', await goneExtra(b.id));
    const dup = await duplicateOf(s);
    if (dup) fail(409, `Already on file: ${dup.name}`, { duplicate: dup });
    return s.kind === 'venue' ? createVenueManager(b.id, b.venue_ids, user) : createFromSubmission(b.id, user);
  }),

  // The form, its files and the saved password are deleted. A double returns who it is, so their record opens next.
  'staffSetup.discard': def(CO, async (b, { user }) => {
    required(b, 'id');
    const k = need(await one('SELECT kind, details FROM staff_setup_submissions WHERE id = $1', [b.id]), 'Submission not found');
    const dup = await duplicateOf(k);
    const s = need(await one('DELETE FROM staff_setup_submissions WHERE id = $1 RETURNING files', [b.id]), 'Submission not found');
    await dropFiles(Object.values(s.files || {}));
    await audit(user, 'staff_setup.discard', 'staff_setup', b.id, dup ? { duplicate_of: dup.id } : undefined);
    return { ok: true, duplicate: dup };
  }),
};
