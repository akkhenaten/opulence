import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, pick, need } from '../lib/http.mjs';
import { canSeePay, goesBy } from '../lib/auth.mjs';
import { assertOfficerAccess, venueScope } from '../lib/scope.mjs';
import { downloadUrl, checkOwnPhoto, saveThumb, photoUrls, getObjectBytes, headObject } from '../lib/storage.mjs';
import { extract, fileBlock, canRead, HAIKU } from '../lib/ai.mjs';
import { RTW_CHECK_TOOL, rtwResultOf, cleanShareCode } from '../lib/rtw.mjs';
import { londonDate } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { createInvite, sendInvite } from './users.mjs';
import { guardPlatformAccount } from '../lib/platform.mjs';
import { seedOnboarding, syncOnboarding, tickOnboarding } from './hr.mjs';
import { guardSelf } from '../lib/selfcheck.mjs';
import { ALL, CO, MGR, def } from './_def.mjs';
import { NOT_CLEARED, STATUS_LABEL, siaCheckOn } from '../lib/sia.mjs';
import { officerDisplay, officerName, userName } from '../lib/names.mjs';

const NON_SIA = new Set(['steward']);
const PRIVATE = ['ni_number', 'utr', 'bank_name', 'bank_sort_code', 'bank_account', 'dob'];
const MANAGER_FIELDS = ['first_name', 'last_name', 'goes_by', 'email', 'phone', 'dob', 'address', 'postcode', 'ni_number', 'utr', 'bank_name', 'bank_sort_code',
  'bank_account', 'photo_key', 'sia_number', 'sia_type', 'sia_expiry', 'rtw_type', 'rtw_expiry', 'status', 'roles', 'max_weekly_hours',
  'start_date', 'notes'];
const SELF_FIELDS = ['goes_by', 'phone', 'address', 'postcode', 'dob', 'ni_number', 'utr', 'bank_name', 'bank_sort_code', 'bank_account', 'photo_key'];

const daysUntil = (d, today) => (d ? Math.round((new Date(d) - new Date(today)) / 86400000) : null);

export function compliance(o, today = londonDate(new Date())) {
  const issues = [];
  const needsSia = (o.roles || []).some((r) => !NON_SIA.has(r)) || !(o.roles || []).length;
  if (needsSia) {
    if (!o.sia_number || !o.sia_expiry) issues.push('No SIA licence on file');
    else if (o.sia_expiry < today) issues.push('SIA licence expired');
    if (siaCheckOn() && NOT_CLEARED.includes(o.sia_status)) issues.push(`SIA register shows the licence as ${STATUS_LABEL[o.sia_status]}`);
  }
  if (!o.rtw_verified) issues.push('Right to work not verified');
  else if (o.rtw_expiry && o.rtw_expiry < today) issues.push('Right to work expired');
  if (o.status !== 'active') issues.push(`Status: ${o.status}`);
  return { ok: !issues.length, issues, sia_days: daysUntil(o.sia_expiry, today), rtw_days: daysUntil(o.rtw_expiry, today) };
}

// App set-up managers can chase: a registered clock-in phone, and push notifications on at least one device
const APP_SETUP = `EXISTS (SELECT 1 FROM officer_devices d WHERE d.officer_id = o.id AND d.status IN ('active','pending')) AS has_phone,
  EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = o.user_id) AS has_push`;

export function shapeOfficer(o, user) {
  const out = { ...o, name: officerDisplay(o), full_name: `${o.first_name} ${o.last_name}`, compliance: compliance(o) };
  const self = user.role === 'officer' && user.officer_id === o.id;
  if (user.role !== 'company' && !self) for (const k of PRIVATE) delete out[k];
  return out;
}

// One staff record per person: the same email or SIA licence number can't be added twice.
// When the record has (or is getting) an app login, its email must not already sign in as someone else —
// except a company or security manager without a staff record: they can be linked so one login does both.
export async function assertNotDuplicate(db, { id = null, email, sia_number, login = false, link = false }) {
  const e = (email || '').trim().toLowerCase();
  const sia = (sia_number || '').replace(/\s+/g, '');
  if (e || sia) {
    const d = await db.one(
      `SELECT id, ${officerName('')} AS name, status FROM officers
        WHERE id IS DISTINCT FROM $1 AND (($2 <> '' AND lower(email) = $2) OR ($3 <> '' AND replace(sia_number, ' ', '') = $3)) LIMIT 1`, [id, e, sia]);
    if (d) fail(409, `Already on your staff: ${d.name}`, { duplicate: d });
  }
  if (e && login) {
    const u = await db.one(
      'SELECT u.id, u.name, u.role FROM users u WHERE u.email = $1 AND NOT EXISTS (SELECT 1 FROM officers o WHERE o.user_id = u.id AND o.id = $2)', [e, id]);
    if (!u) return null;
    const linkable = await linkableManager(db, e);
    if (linkable) {
      if (link) return linkable;
      fail(409, `${linkable.name} already signs in as a manager. Link this staff record to their login?`, { can_link: true, user_name: linkable.name });
    }
    fail(409, u.role === 'officer' ? 'Another officer already signs in with this email' : 'This email already signs in as a manager or venue user');
  }
  return null;
}

// A company or security manager (active or invited) with no staff record yet
export function linkableManager(db, email) {
  return db.one(
    `SELECT u.id, u.name, u.role FROM users u
      WHERE u.email = lower($1) AND u.role IN ('company','security') AND u.status IN ('active','invited') AND NOT u.system
        AND NOT EXISTS (SELECT 1 FROM officers o WHERE o.user_id = u.id)`, [(email || '').trim()]);
}

// Create an app login for a staff record and link it (used by "Invite to app" and when hiring)
export const inviteOfficerLogin = async (id) => sendInvite(await createOfficerLogin(id));

/** The invited login for a staff record, linked to it; the caller sends the invite */
export async function createOfficerLogin(id) {
  const o = need(await one('SELECT * FROM officers WHERE id = $1', [id]));
  if (o.user_id) fail(409, 'Officer already has a login');
  if (!o.email) fail(400, 'Add an email address first');
  const m = await linkableManager({ one }, o.email);
  if (m) fail(409, `${m.name} already signs in as a manager. Link this staff record to their login?`, { can_link: true, user_name: m.name });
  const u = await tx(async (t) => {
    const created = await createInvite(t, { email: o.email, name: `${o.first_name} ${o.last_name}`, role: 'officer', phone: o.phone, goes_by: o.goes_by });
    await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, created.id]);
    return created;
  });
  return u;
}

export const actions = {
  'officers.list': def(MGR, async (b, { user }) => {
    const rows = await q(
      `SELECT o.*, u.status AS login_status, u.last_login, u.invite_sent_at, u.invite_emailed, u.role AS login_role, ${APP_SETUP} FROM officers o LEFT JOIN users u ON u.id = o.user_id
        WHERE (($1::text IS NULL AND o.status <> 'rejected') OR o.status = $1) AND ($2::text IS NULL OR $2 = ANY(o.roles))
          AND ($3::text IS NULL OR (o.first_name || ' ' || o.last_name || ' ' || o.goes_by || ' ' || o.email || ' ' || o.sia_number) ILIKE '%' || $3 || '%')
          AND ($4::uuid[] IS NULL OR o.status = 'active' OR EXISTS (SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = o.id AND s.venue_id = ANY($4)))
        ORDER BY o.status = 'active' DESC, o.first_name, o.last_name`, [b.status || null, b.role || null, b.q || null, user.role === 'security' ? await venueScope(user) : null]);
    return Promise.all(rows.map(async (o) => ({ ...shapeOfficer(o, user), ...(await photoUrls(o.photo_key)) })));
  }),

  'officers.get': def(ALL, async (b, { user }) => {
    const id = b.id || user.officer_id;
    if (user.role === 'venue') fail(403, 'Forbidden');
    await assertOfficerAccess(user, id);
    const o = need(await one(`SELECT o.*, u.status AS login_status, u.last_login, u.invite_sent_at, u.invite_emailed, u.role AS login_role, ${APP_SETUP}, ${userName('vu')} AS sia_last_verified_by_name, ${userName('rc')} AS rtw_checked_by_name,
        (SELECT d.number FROM documents d WHERE d.owner_type = 'officer' AND d.owner_id = o.id AND d.kind = 'rtw' AND d.number <> '' ORDER BY d.created_at DESC LIMIT 1) AS rtw_share_code
      FROM officers o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN users vu ON vu.id = o.sia_last_verified_by LEFT JOIN users rc ON rc.id = o.rtw_checked_by WHERE o.id = $1`, [id]));
    const [contacts, rates, bans, availability, offboarding] = await Promise.all([
      q('SELECT * FROM emergency_contacts WHERE officer_id = $1', [id]),
      canSeePay(user) || user.officer_id === id
        ? q('SELECT r.*, v.name AS venue_name, ro.name AS role_name FROM officer_rates r JOIN roles ro ON ro.code = r.role LEFT JOIN venues v ON v.id = r.venue_id WHERE officer_id = $1 ORDER BY role, venue_name NULLS FIRST, effective_from DESC', [id])
        : [],
      q('SELECT b.*, v.name AS venue_name FROM venue_bans b JOIN venues v ON v.id = b.venue_id WHERE officer_id = $1', [id]),
      q('SELECT * FROM availability WHERE officer_id = $1 ORDER BY weekday', [id]),
      one('SELECT * FROM offboarding WHERE officer_id = $1', [id]),
    ]);
    return { ...shapeOfficer(o, user), photo_url: await downloadUrl(o.photo_key), emergency_contacts: contacts, rates, bans, availability, offboarding };
  }),

  // Create (company) or update (company: all fields; officer: own personal/bank fields)
  'officers.save': def(['company', 'officer'], async (b, { user }) => {
    if (user.role === 'officer') {
      if (b.id && b.id !== user.officer_id) fail(403, 'Forbidden');
      const f = pick(b, SELF_FIELDS);
      if (f.goes_by !== undefined) f.goes_by = goesBy(f.goes_by);
      if (f.photo_key !== undefined) f.photo_key = await checkOwnPhoto(user, f.photo_key, fail);
      if (f.photo_key) await saveThumb(user, f.photo_key, b.photo_thumb_key);
      const keys = Object.keys(f);
      if (keys.length) await q(`UPDATE officers SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [user.officer_id, ...keys.map((k) => f[k])]);
      if (f.phone !== undefined) await q('UPDATE users SET phone = $2 WHERE id = $1', [user.id, f.phone || '']);
      if (f.goes_by !== undefined) await q('UPDATE users SET goes_by = $2 WHERE id = $1', [user.id, f.goes_by]);
      await syncOnboarding(user.officer_id);
      await audit(user, 'officer.self_update', 'officer', user.officer_id, Object.keys(f));
      return { ok: true };
    }
    const f = pick(b, MANAGER_FIELDS);
    if (f.goes_by !== undefined) f.goes_by = goesBy(f.goes_by);
    if (typeof f.email === 'string') f.email = f.email.trim().toLowerCase();
    if (b.id) {
      const cur = need(await one('SELECT * FROM officers WHERE id = $1', [b.id]));
      const changed = (k) => f[k] !== undefined && String(f[k] || '') !== String(cur[k] || '');
      if (changed('email') || changed('sia_number')) await assertNotDuplicate({ one }, { id: b.id, email: changed('email') ? f.email : '', sia_number: changed('sia_number') ? f.sia_number : '', login: !!cur.user_id });
      if (cur.user_id && f.email === '') fail(400, 'This person signs in with their email, so it can\'t be blank');
      if (cur.user_id && changed('email')) guardPlatformAccount(user, cur.email, f.email, (await one('SELECT email FROM users WHERE id = $1', [cur.user_id]))?.email);
      // A new photo must be an image this manager just uploaded; an unchanged key passes through
      if (changed('photo_key')) {
        f.photo_key = await checkOwnPhoto(user, f.photo_key, fail);
        if (f.photo_key) await saveThumb(user, f.photo_key, b.photo_thumb_key);
      }
      await tx(async (t) => {
        const keys = Object.keys(f);
        if (keys.length) await t.q(`UPDATE officers SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [b.id, ...keys.map((k) => f[k])]);
        // The app login follows the staff record, so the sign-in email and name never drift apart
        if (cur.user_id && (changed('email') || changed('first_name') || changed('last_name') || changed('phone') || changed('goes_by'))) {
          const o = await t.one('SELECT first_name, last_name, goes_by, email, phone FROM officers WHERE id = $1', [b.id]);
          await t.q('UPDATE users SET email = $2, name = $3, phone = $4, goes_by = $5 WHERE id = $1', [cur.user_id, o.email, `${o.first_name} ${o.last_name}`.trim(), o.phone || '', o.goes_by]);
        }
      });
      await audit(user, 'officer.update', 'officer', b.id, f);
      return { id: b.id };
    }
    required(b, 'first_name', 'last_name');
    // A manager's email without App access still offers the link (unless they chose to keep the record separate)
    const manager = await assertNotDuplicate({ one }, { email: f.email, sia_number: f.sia_number, login: !!((b.invite || b.link_user) && f.email), link: !!b.link_user });
    if (!manager && !b.invite && !b.keep_separate && f.email) {
      const m = await linkableManager({ one }, f.email);
      if (m) fail(409, `${m.name} already signs in as a manager. Link this staff record to their login?`, { can_link: true, user_name: m.name });
    }
    const res = await tx(async (t) => {
      let userId = null;
      let invite = null;
      if (manager) userId = manager.id;
      else if (b.invite && b.email) {
        const u = await createInvite(t, { email: b.email, name: `${b.first_name} ${b.last_name}`, role: 'officer', phone: b.phone || '', goes_by: b.goes_by });
        userId = u.id;
        invite = u;
      }
      const o = await insert('officers', { ...f, status: f.status || (b.invite && !manager ? 'applicant' : 'active'), user_id: userId }, t);
      await seedOnboarding(t, o.id);
      return { o, invite };
    });
    await audit(user, 'officer.create', 'officer', res.o.id, manager ? { linked_user: manager.id } : undefined);
    return { id: res.o.id, invite_link: res.invite ? await sendInvite(res.invite) : null };
  }),

  // Give an existing officer record a login
  'officers.inviteLogin': def(CO, async (b) => ({ invite_link: await inviteOfficerLogin(b.id) })),

  // Link a staff record to the manager login with the same email: one login, "Manager" and "My shifts"
  'officers.linkLogin': def(CO, async (b, { user }) => {
    required(b, 'id');
    const o = need(await one('SELECT * FROM officers WHERE id = $1', [b.id]));
    if (o.user_id) fail(409, 'This staff record already has a login');
    const m = need(await linkableManager({ one }, o.email), 'No manager login without a staff record uses this email');
    await q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, m.id]);
    await audit(user, 'user.works_shifts', 'user', m.id, { on: true, officer_id: o.id });
    return { ok: true, user_name: m.name };
  }),

  'officers.saveRate': def(CO, async (b, { user }) => {
    required(b, 'officer_id', 'role', 'rate');
    await guardSelf(user, b.officer_id, { companyOnly: true, message: 'Another company manager needs to change your own pay rate' });
    const r = await insert('officer_rates', { ...pick(b, ['officer_id', 'role', 'rate', 'effective_from']), venue_id: b.venue_id || null });
    await audit(user, 'officer.rate', 'officer', b.officer_id, r);
    return r;
  }),
  'officers.deleteRate': def(CO, async (b, { user }) => {
    const r = await one('SELECT officer_id FROM officer_rates WHERE id = $1', [b.id]);
    if (r) await guardSelf(user, r.officer_id, { companyOnly: true, message: 'Another company manager needs to change your own pay rate' });
    await q('DELETE FROM officer_rates WHERE id = $1', [b.id]);
    await audit(user, 'officer.rate_delete', 'officer_rate', b.id);
    return { ok: true };
  }),

  'officers.saveContacts': def(['company', 'officer'], async (b, { user }) => {
    const id = user.role === 'officer' ? user.officer_id : b.officer_id;
    await tx(async (t) => {
      await t.q('DELETE FROM emergency_contacts WHERE officer_id = $1', [id]);
      for (const c of b.contacts || []) if (c.name) await t.q('INSERT INTO emergency_contacts (officer_id, name, relationship, phone) VALUES ($1,$2,$3,$4)', [id, c.name, c.relationship || '', c.phone || '']);
    });
    return { ok: true };
  }),

  'officers.saveBan': def(CO, async (b, { user }) => {
    required(b, 'officer_id', 'venue_id');
    if (b.remove) await q('DELETE FROM venue_bans WHERE officer_id = $1 AND venue_id = $2', [b.officer_id, b.venue_id]);
    else await q('INSERT INTO venue_bans (officer_id, venue_id, reason) VALUES ($1,$2,$3) ON CONFLICT (officer_id, venue_id) DO UPDATE SET reason = EXCLUDED.reason', [b.officer_id, b.venue_id, b.reason || '']);
    await audit(user, b.remove ? 'officer.unban' : 'officer.ban', 'officer', b.officer_id, { venue: b.venue_id });
    return { ok: true };
  }),

  'officers.saveAvailability': def(['company', 'security', 'officer'], async (b, { user }) => {
    const id = user.role === 'officer' ? user.officer_id : b.officer_id;
    await tx(async (t) => {
      for (const a of b.days || []) {
        await t.q(
          `INSERT INTO availability (officer_id, weekday, available, from_time, to_time) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (officer_id, weekday) DO UPDATE SET available = EXCLUDED.available, from_time = EXCLUDED.from_time, to_time = EXCLUDED.to_time`,
          [id, a.weekday, a.available !== false, a.from_time || null, a.to_time || null]);
      }
    });
    return { ok: true };
  }),

  // Right to work: the manager checks the share code on GOV.UK, saves the check page and uploads it here.
  // rtwRead reads the page to fill in the form; rtwCheck records the check, the only way right to work becomes verified.
  'officers.rtwRead': def(CO, async (b) => {
    const key = checkKey(b.s3_key);
    const head = await headObject(key);
    const mime = b.mime || head?.mime;
    if (!head) fail(400, 'File not found — upload it again');
    if (!canRead(mime) || head.size > 4.5 * 1024 * 1024) return rtwResultOf({ readable: false, concerns: [] });
    try {
      const r = await extract({
        model: HAIKU, max_tokens: 500, module: 'compliance',
        system: "You read a saved UK Home Office 'view a job applicant's right to work details' page for an employer. Report only what is shown. Never guess.",
        messages: [{ role: 'user', content: [{ type: 'text', text: 'The right to work check page an employer saved' }, fileBlock(await getObjectBytes(key), mime)] }],
        tool: RTW_CHECK_TOOL,
      });
      return rtwResultOf(r.input);
    } catch (e) {
      console.warn('[rtw] read failed:', e.message);
      return { ...rtwResultOf(null), error: 'Could not read it — fill in the result yourself' };
    }
  }),

  'officers.rtwCheck': def(CO, async (b, { user }) => {
    const v = rtwCheckInput(b, londonDate(new Date()));
    const o = need(await one('SELECT id, rtw_type FROM officers WHERE id = $1', [b.id]), 'Staff member not found');
    const docId = await tx(async (t) => {
      const [d] = await t.q(
        `INSERT INTO documents (owner_type, owner_id, kind, title, number, expiry, s3_key, mime, uploaded_by, verified_by, verified_at, ai_read, ai_read_key, ai_read_at)
         VALUES ('officer', $1, 'rtw', $2, $3, $4, $5, $6, $7, $7, now(), $8, $5, now()) RETURNING id`,
        [o.id, v.method === 'share_code' ? 'GOV.UK right to work check' : 'Right to work — manual check', v.reference, v.expiry, v.s3_key, v.mime, user.id, v.read]);
      await t.q(`UPDATE officers SET rtw_verified = true, rtw_type = $2, rtw_expiry = $3, rtw_checked_at = now(), rtw_checked_by = $4, rtw_method = $5, rtw_check_doc = $6
        WHERE id = $1`, [o.id, v.method === 'share_code' ? 'Share code' : (o.rtw_type && o.rtw_type !== 'Share code' ? o.rtw_type : 'British or Irish passport'), v.expiry, user.id, v.method, d.id]);
      return d.id;
    });
    await tickOnboarding(o.id, 'rtw');
    await audit(user, 'officer.rtw_check', 'officer', o.id, { method: v.method, permission: v.permission, expiry: v.expiry, doc: docId });
    return { ok: true, doc_id: docId };
  }),
};

const checkKey = (k) => {
  if (typeof k !== 'string' || !k.startsWith('docs/') || k.startsWith('docs/archive/')) fail(400, 'Upload the check page first');
  return k;
};

/** A right to work check as entered, or a 400 explaining what is missing. today: YYYY-MM-DD */
export function rtwCheckInput(b, today) {
  if (!b?.id) fail(400, 'Staff member missing');
  const s3_key = checkKey(b.s3_key);
  const method = b.method === 'manual' ? 'manual' : 'share_code';
  if (b.photo_matched !== true) fail(400, 'Confirm the photo matches this person');
  const permission = b.permission === 'time_limited' ? 'time_limited' : b.permission === 'unlimited' ? 'unlimited' : fail(400, 'Choose no time limit or time-limited');
  const expiry = permission === 'time_limited' ? String(b.expiry || '') : null;
  if (permission === 'time_limited' && !(/^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry > today)) fail(400, 'Add the date their permission to work ends');
  const read = b.read && typeof b.read === 'object' ? rtwResultOf(b.read) : null;
  return { s3_key, mime: typeof b.mime === 'string' ? b.mime.slice(0, 100) : null, method, permission, expiry, read, reference: (read?.reference || cleanShareCode(b.share_code) || '').slice(0, 40) };
}
