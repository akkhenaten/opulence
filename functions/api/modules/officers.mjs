import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, pick, need } from '../lib/http.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { assertOfficerAccess, venueScope } from '../lib/scope.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { londonDate } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { createInvite, sendInvite } from './users.mjs';
import { seedOnboarding } from './hr.mjs';
import { ALL, CO, MGR, def } from './_def.mjs';

const NON_SIA = new Set(['steward']);
const PRIVATE = ['ni_number', 'utr', 'bank_name', 'bank_sort_code', 'bank_account', 'dob'];
const MANAGER_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'dob', 'address', 'postcode', 'ni_number', 'utr', 'bank_name', 'bank_sort_code',
  'bank_account', 'photo_key', 'sia_number', 'sia_type', 'sia_expiry', 'rtw_type', 'rtw_expiry', 'rtw_verified', 'status', 'roles', 'max_weekly_hours',
  'start_date', 'notes'];
const SELF_FIELDS = ['phone', 'address', 'postcode', 'dob', 'ni_number', 'utr', 'bank_name', 'bank_sort_code', 'bank_account', 'photo_key'];

const daysUntil = (d, today) => (d ? Math.round((new Date(d) - new Date(today)) / 86400000) : null);

export function compliance(o, today = londonDate(new Date())) {
  const issues = [];
  const needsSia = (o.roles || []).some((r) => !NON_SIA.has(r)) || !(o.roles || []).length;
  if (needsSia) {
    if (!o.sia_number || !o.sia_expiry) issues.push('No SIA licence on file');
    else if (o.sia_expiry < today) issues.push('SIA licence expired');
  }
  if (!o.rtw_verified) issues.push('Right to work not verified');
  else if (o.rtw_expiry && o.rtw_expiry < today) issues.push('Right to work expired');
  if (o.status !== 'active') issues.push(`Status: ${o.status}`);
  return { ok: !issues.length, issues, sia_days: daysUntil(o.sia_expiry, today), rtw_days: daysUntil(o.rtw_expiry, today) };
}

export function shapeOfficer(o, user) {
  const out = { ...o, name: `${o.first_name} ${o.last_name}`, compliance: compliance(o) };
  const self = user.role === 'officer' && user.officer_id === o.id;
  if (user.role !== 'company' && !self) for (const k of PRIVATE) delete out[k];
  return out;
}

export const actions = {
  'officers.list': def(MGR, async (b, { user }) => {
    const rows = await q(
      `SELECT o.*, u.status AS login_status, u.last_login FROM officers o LEFT JOIN users u ON u.id = o.user_id
        WHERE ($1::text IS NULL OR o.status = $1) AND ($2::text IS NULL OR $2 = ANY(o.roles))
          AND ($3::text IS NULL OR (o.first_name || ' ' || o.last_name || ' ' || o.email || ' ' || o.sia_number) ILIKE '%' || $3 || '%')
          AND ($4::uuid[] IS NULL OR o.status = 'active' OR EXISTS (SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = o.id AND s.venue_id = ANY($4)))
        ORDER BY o.status = 'active' DESC, o.first_name, o.last_name`, [b.status || null, b.role || null, b.q || null, user.role === 'security' ? await venueScope(user) : null]);
    return Promise.all(rows.map(async (o) => ({ ...shapeOfficer(o, user), photo_url: await downloadUrl(o.photo_key) })));
  }),

  'officers.get': def(ALL, async (b, { user }) => {
    const id = b.id || user.officer_id;
    if (user.role === 'venue') fail(403, 'Forbidden');
    await assertOfficerAccess(user, id);
    const o = need(await one('SELECT o.*, u.status AS login_status, u.last_login FROM officers o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1', [id]));
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
      const keys = Object.keys(f);
      if (keys.length) await q(`UPDATE officers SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [user.officer_id, ...keys.map((k) => f[k])]);
      await audit(user, 'officer.self_update', 'officer', user.officer_id, Object.keys(f));
      return { ok: true };
    }
    const f = pick(b, MANAGER_FIELDS);
    if (b.id) {
      const keys = Object.keys(f);
      if (keys.length) await q(`UPDATE officers SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [b.id, ...keys.map((k) => f[k])]);
      await audit(user, 'officer.update', 'officer', b.id, f);
      return { id: b.id };
    }
    required(b, 'first_name', 'last_name');
    const res = await tx(async (t) => {
      let userId = null;
      let invite = null;
      if (b.invite && b.email) {
        const u = await createInvite(t, { email: b.email, name: `${b.first_name} ${b.last_name}`, role: 'officer', phone: b.phone || '' });
        userId = u.id;
        invite = u;
      }
      const o = await insert('officers', { ...f, status: f.status || (b.invite ? 'applicant' : 'active'), user_id: userId }, t);
      await seedOnboarding(t, o.id);
      return { o, invite };
    });
    await audit(user, 'officer.create', 'officer', res.o.id);
    return { id: res.o.id, invite_link: res.invite ? await sendInvite(res.invite) : null };
  }),

  // Give an existing officer record a login
  'officers.inviteLogin': def(CO, async (b) => {
    const o = need(await one('SELECT * FROM officers WHERE id = $1', [b.id]));
    if (o.user_id) fail(409, 'Officer already has a login');
    if (!o.email) fail(400, 'Add an email address first');
    const u = await tx(async (t) => {
      const created = await createInvite(t, { email: o.email, name: `${o.first_name} ${o.last_name}`, role: 'officer', phone: o.phone });
      await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, created.id]);
      return created;
    });
    return { invite_link: await sendInvite(u) };
  }),

  'officers.saveRate': def(CO, async (b, { user }) => {
    required(b, 'officer_id', 'role', 'rate');
    const r = await insert('officer_rates', { ...pick(b, ['officer_id', 'role', 'rate', 'effective_from']), venue_id: b.venue_id || null });
    await audit(user, 'officer.rate', 'officer', b.officer_id, r);
    return r;
  }),
  'officers.deleteRate': def(CO, async (b, { user }) => {
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
};
