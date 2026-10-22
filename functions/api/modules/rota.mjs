import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, need, pick } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { notify, managersFor, venueContacts, officerUser } from '../lib/notify.mjs';
import { fmtDateTime, fmtTime, londonParts } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { compliance } from './officers.mjs';
import { ALL, MGR, def } from './_def.mjs';

const WEEKDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Checks whether an officer can work a shift. blocking issues prevent assignment; warnings can be overridden. */
export async function checkOfficerForShift(officerId, shift, { ignoreAssignment } = {}) {
  const o = await one('SELECT * FROM officers WHERE id = $1', [officerId]);
  if (!o) return { blocking: ['Officer not found'], warnings: [] };
  const blocking = [];
  const warnings = [];
  const c = compliance(o);
  blocking.push(...c.issues);
  // Licence must still be valid on the shift date
  const shiftDay = londonParts(shift.starts_at).date;
  if (o.sia_expiry && o.sia_expiry < shiftDay && !c.issues.includes('SIA licence expired') && shift.role !== 'steward') blocking.push('SIA licence expires before this shift');

  const [ban, overlap, off, avail, hours] = await Promise.all([
    one('SELECT reason FROM venue_bans WHERE officer_id = $1 AND venue_id = $2', [officerId, shift.venue_id]),
    one(
      `SELECT s.starts_at, v.name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
        WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.status <> 'cancelled' AND s.id <> $2
          AND s.starts_at < $4 AND s.ends_at > $3 AND ($5::uuid IS NULL OR a.id <> $5) LIMIT 1`,
      [officerId, shift.id || '00000000-0000-0000-0000-000000000000', shift.starts_at, shift.ends_at, ignoreAssignment || null]),
    one(
      `SELECT kind FROM time_off WHERE officer_id = $1 AND status = 'approved'
         AND start_date <= ($3::timestamptz AT TIME ZONE 'Europe/London')::date AND end_date >= ($2::timestamptz AT TIME ZONE 'Europe/London')::date LIMIT 1`,
      [officerId, shift.starts_at, shift.ends_at]),
    one('SELECT * FROM availability WHERE officer_id = $1 AND weekday = $2', [officerId, WEEKDAY[londonParts(shift.starts_at).weekday]]),
    one(
      `SELECT COALESCE(sum(extract(epoch FROM (s.ends_at - s.starts_at)) / 3600), 0) AS h FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.status <> 'cancelled' AND s.id <> $2
          AND s.starts_at >= date_trunc('week', $3::timestamptz) AND s.starts_at < date_trunc('week', $3::timestamptz) + interval '7 days'`,
      [officerId, shift.id || '00000000-0000-0000-0000-000000000000', shift.starts_at]),
  ]);
  if (ban) blocking.push(`Banned from this venue${ban.reason ? `: ${ban.reason}` : ''}`);
  if (overlap) blocking.push(`Already booked at ${overlap.name} (${fmtTime(overlap.starts_at)})`);
  if (off) blocking.push(`On approved ${off.kind}`);
  if (avail && !avail.available) warnings.push('Marked unavailable on this day');
  if (!(o.roles || []).includes(shift.role)) warnings.push('Role not on profile');
  const shiftHours = (new Date(shift.ends_at) - new Date(shift.starts_at)) / 3600000;
  if (Number(hours.h) + shiftHours > o.max_weekly_hours) warnings.push(`Would exceed ${o.max_weekly_hours}h this week (${Math.round(Number(hours.h) + shiftHours)}h)`);
  return { blocking, warnings, officer: { id: o.id, name: `${o.first_name} ${o.last_name}` } };
}

export async function getShift(id) {
  return need(await one('SELECT s.*, v.name AS venue_name FROM shifts s JOIN venues v ON v.id = s.venue_id WHERE s.id = $1', [id]), 'Shift not found');
}

export async function filledCount(shiftId) {
  return Number((await one("SELECT count(*) AS n FROM shift_assignments WHERE shift_id = $1 AND status IN ('assigned','accepted')", [shiftId])).n);
}

export async function shiftsWithAssignments(where, params, user) {
  const venueView = user.role === 'venue';
  const rows = await q(
    `SELECT s.*, v.name AS venue_name, r.name AS role_name,
       COALESCE(json_agg(json_build_object(
         'id', a.id, 'officer_id', a.officer_id, 'status', a.status, 'is_lead', a.is_lead,
         'name', o.first_name || ' ' || o.last_name, 'sia_number', o.sia_number,
         'clocked_in', (SELECT min(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual')),
         'clocked_out', (SELECT max(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'out' AND ce.status IN ('ok','approved','manual'))
       ) ORDER BY o.first_name) FILTER (WHERE a.id IS NOT NULL AND a.status NOT IN ('cancelled','rejected')), '[]') AS assignments
       FROM shifts s JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
       LEFT JOIN shift_assignments a ON a.shift_id = s.id LEFT JOIN officers o ON o.id = a.officer_id
      WHERE ${where} GROUP BY s.id, v.name, r.name ORDER BY s.starts_at, v.name`, params);
  return rows.map((s) => {
    const filled = s.assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).length;
    const out = { ...s, filled };
    if (venueView) out.assignments = s.assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).map(({ name, sia_number, clocked_in, clocked_out, status, is_lead }) => ({ name, sia_number, clocked_in, clocked_out, status, is_lead }));
    return out;
  });
}

async function notifyAssigned(assignment, shift, kind = 'assigned') {
  const title = kind === 'assigned' ? 'New shift assigned' : kind === 'approved' ? 'Shift request approved' : 'Shift updated';
  await notify(await officerUser(assignment.officer_id), {
    kind: 'shift', title, body: `${shift.venue_name} · ${fmtDateTime(shift.starts_at)} – ${fmtTime(shift.ends_at)}`, link: '/officer/shifts', email: true,
  });
}

export const actions = {
  // ---------- Shifts ----------
  'shifts.list': def(ALL, async (b, { user }) => {
    required(b, 'from', 'to');
    if (user.role === 'officer') fail(403, 'Use shifts.mine');
    const scope = await venueScope(user);
    const params = [b.from, b.to, scope, b.venue_id || null];
    let where = 's.starts_at < $2 AND s.ends_at > $1 AND ($3::uuid[] IS NULL OR s.venue_id = ANY($3)) AND ($4::uuid IS NULL OR s.venue_id = $4)';
    if (user.role === 'venue') where += " AND s.status = 'published'";
    if (!b.include_cancelled) where += " AND s.status <> 'cancelled'";
    if (b.officer_id) { params.push(b.officer_id); where += ` AND EXISTS (SELECT 1 FROM shift_assignments x WHERE x.shift_id = s.id AND x.officer_id = $${params.length} AND x.status IN ('assigned','accepted'))`; }
    return shiftsWithAssignments(where, params, user);
  }),

  'shifts.get': def(MGR, async (b, { user }) => {
    const s = await getShift(b.id);
    await assertVenue(user, s.venue_id);
    const [rows] = await Promise.all([shiftsWithAssignments('s.id = $1', [b.id], user)]);
    return rows[0];
  }),

  'shifts.save': def(MGR, async (b, { user }) => {
    required(b, 'venue_id', 'role', 'starts_at', 'ends_at');
    await assertVenue(user, b.venue_id);
    if (new Date(b.ends_at) <= new Date(b.starts_at)) fail(400, 'End must be after start');
    const f = pick(b, ['venue_id', 'role', 'starts_at', 'ends_at', 'break_minutes', 'headcount', 'status', 'open', 'notes']);
    let s;
    if (b.id) {
      const before = await getShift(b.id);
      await assertVenue(user, before.venue_id);
      const keys = Object.keys(f);
      s = await one(`UPDATE shifts SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [b.id, ...keys.map((k) => f[k])]);
      const timeChanged = +new Date(before.starts_at) !== +new Date(s.starts_at) || +new Date(before.ends_at) !== +new Date(s.ends_at) || before.venue_id !== s.venue_id;
      if (timeChanged && s.status === 'published') {
        const officers = await q("SELECT officer_id FROM shift_assignments WHERE shift_id = $1 AND status IN ('assigned','accepted')", [s.id]);
        const v = await one('SELECT name FROM venues WHERE id = $1', [s.venue_id]);
        for (const a of officers) await notifyAssigned(a, { ...s, venue_name: v.name }, 'changed');
      }
      await audit(user, 'shift.update', 'shift', s.id, f);
    } else {
      s = await insert('shifts', { ...f, status: f.status || 'draft', created_by: user.id });
      await audit(user, 'shift.create', 'shift', s.id);
    }
    return s;
  }),

  // Create the same shift on several dates (recurring)
  'shifts.bulkCreate': def(MGR, async (b, { user }) => {
    required(b, 'venue_id', 'role', 'start_time', 'end_time', 'dates');
    await assertVenue(user, b.venue_id);
    if (b.dates.length > 62) fail(400, 'Up to 62 dates at a time');
    const created = [];
    for (const d of b.dates) {
      const starts = londonToUtc(d, b.start_time);
      let ends = londonToUtc(d, b.end_time);
      if (ends <= starts) ends = londonToUtc(addDay(d), b.end_time);
      created.push(await insert('shifts', {
        venue_id: b.venue_id, role: b.role, starts_at: starts, ends_at: ends, headcount: b.headcount || 1, break_minutes: b.break_minutes || 0,
        open: !!b.open, status: b.status || 'draft', notes: b.notes || '', created_by: user.id,
      }));
    }
    await audit(user, 'shift.bulk_create', 'venue', b.venue_id, { count: created.length });
    return { created: created.length };
  }),

  'shifts.publish': def(MGR, async (b, { user }) => {
    required(b, 'ids');
    const scope = await venueScope(user);
    const rows = await q(
      `UPDATE shifts SET status = 'published' WHERE id = ANY($1::uuid[]) AND status = 'draft' AND ($2::uuid[] IS NULL OR venue_id = ANY($2)) RETURNING id`,
      [b.ids, scope]);
    const assigns = await q(
      `SELECT a.officer_id, s.*, v.name AS venue_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
        WHERE a.shift_id = ANY($1::uuid[]) AND a.status = 'assigned'`, [rows.map((r) => r.id)]);
    const byOfficer = {};
    for (const a of assigns) (byOfficer[a.officer_id] ||= []).push(a);
    for (const [officerId, list] of Object.entries(byOfficer)) {
      await notify(await officerUser(officerId), {
        kind: 'shift', title: list.length > 1 ? `${list.length} new shifts published` : 'New shift published',
        body: list.slice(0, 3).map((s) => `${s.venue_name} ${fmtDateTime(s.starts_at)}`).join(' · '), link: '/officer/shifts', email: true,
      });
    }
    // Let eligible officers know about new open shifts
    const openCount = Number((await one("SELECT count(*) AS n FROM shifts WHERE id = ANY($1::uuid[]) AND open", [rows.map((r) => r.id)])).n);
    if (openCount) {
      const officers = await q("SELECT user_id FROM officers WHERE status = 'active' AND user_id IS NOT NULL");
      await notify(officers.map((o) => o.user_id), { kind: 'open_shift', title: `${openCount} open shift${openCount > 1 ? 's' : ''} available`, body: 'Request them in the app before they go.', link: '/officer/shifts?tab=open' });
    }
    await audit(user, 'shift.publish', 'shift', null, { count: rows.length });
    return { published: rows.length };
  }),

  'shifts.cancel': def(MGR, async (b, { user }) => {
    const s = await getShift(b.id);
    await assertVenue(user, s.venue_id);
    await q("UPDATE shifts SET status = 'cancelled' WHERE id = $1", [b.id]);
    const officers = await q("UPDATE shift_assignments SET status = 'cancelled' WHERE shift_id = $1 AND status IN ('assigned','accepted','requested') RETURNING officer_id", [b.id]);
    for (const a of officers) await notify(await officerUser(a.officer_id), { kind: 'shift', title: 'Shift cancelled', body: `${s.venue_name} · ${fmtDateTime(s.starts_at)}`, link: '/officer/shifts', email: true, severity: 'warning' });
    await audit(user, 'shift.cancel', 'shift', b.id, { reason: b.reason });
    return { ok: true };
  }),

  'shifts.delete': def(MGR, async (b, { user }) => {
    const s = await getShift(b.id);
    await assertVenue(user, s.venue_id);
    if (s.status !== 'draft') fail(400, 'Only draft shifts can be deleted — cancel it instead');
    await q('DELETE FROM shifts WHERE id = $1', [b.id]);
    return { ok: true };
  }),

  'shifts.copyWeek': def(MGR, async (b, { user }) => {
    required(b, 'from_week', 'to_week'); // Monday dates
    const scope = await venueScope(user);
    const days = Math.round((new Date(b.to_week) - new Date(b.from_week)) / 86400000);
    if (days % 7) fail(400, 'Weeks must start on the same weekday');
    const rows = await q(
      `INSERT INTO shifts (venue_id, role, starts_at, ends_at, break_minutes, headcount, open, notes, status, created_by)
       SELECT venue_id, role, starts_at + ($3 || ' days')::interval, ends_at + ($3 || ' days')::interval, break_minutes, headcount, open, notes, 'draft', $4
         FROM shifts WHERE status <> 'cancelled' AND starts_at >= ($1::date::timestamp AT TIME ZONE 'Europe/London')
          AND starts_at < (($1::date + 7)::timestamp AT TIME ZONE 'Europe/London')
          AND ($2::uuid[] IS NULL OR venue_id = ANY($2)) AND ($5::uuid IS NULL OR venue_id = $5)
       RETURNING id`, [b.from_week, scope, String(days), user.id, b.venue_id || null]);
    await audit(user, 'shift.copy_week', 'shift', null, { from: b.from_week, to: b.to_week, count: rows.length });
    return { created: rows.length };
  }),

  // Ranked candidates for a shift with eligibility
  'shifts.candidates': def(MGR, async (b, { user }) => {
    const s = await getShift(b.shift_id);
    await assertVenue(user, s.venue_id);
    const officers = await q("SELECT id FROM officers WHERE status = 'active' ORDER BY first_name");
    const assigned = new Set((await q("SELECT officer_id FROM shift_assignments WHERE shift_id = $1 AND status IN ('assigned','accepted')", [s.id])).map((r) => r.officer_id));
    const results = [];
    for (const o of officers) {
      if (assigned.has(o.id)) continue;
      const c = await checkOfficerForShift(o.id, s);
      results.push({ ...c.officer, blocking: c.blocking, warnings: c.warnings });
    }
    return results.sort((a, b2) => a.blocking.length - b2.blocking.length || a.warnings.length - b2.warnings.length || a.name.localeCompare(b2.name));
  }),

  'shifts.assign': def(MGR, async (b, { user }) => {
    required(b, 'shift_id', 'officer_id');
    const s = await getShift(b.shift_id);
    await assertVenue(user, s.venue_id);
    if (s.status === 'cancelled') fail(400, 'Shift is cancelled');
    const check = await checkOfficerForShift(b.officer_id, s);
    if (check.blocking.length) fail(422, check.blocking.join('; '), check);
    if (check.warnings.length && !b.override) fail(409, check.warnings.join('; '), { ...check, needs_override: true });
    if ((await filledCount(s.id)) >= s.headcount) fail(400, 'Shift is already fully staffed');
    const a = await one(
      `INSERT INTO shift_assignments (shift_id, officer_id, status) VALUES ($1,$2,'assigned')
       ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'assigned', responded_at = NULL RETURNING *`, [s.id, b.officer_id]);
    if (s.status === 'published') await notifyAssigned(a, s);
    await audit(user, 'shift.assign', 'shift', s.id, { officer: b.officer_id, override: check.warnings });
    return a;
  }),

  'shifts.unassign': def(MGR, async (b, { user }) => {
    const a = need(await one('SELECT a.*, s.venue_id, s.starts_at, s.status AS shift_status, v.name AS venue_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id WHERE a.id = $1', [b.id]));
    await assertVenue(user, a.venue_id);
    if (await one('SELECT 1 FROM clock_events WHERE assignment_id = $1', [a.id])) fail(400, 'Officer has already clocked in on this shift');
    await q("UPDATE shift_assignments SET status = 'cancelled' WHERE id = $1", [b.id]);
    if (a.shift_status === 'published') await notify(await officerUser(a.officer_id), { kind: 'shift', title: 'Removed from shift', body: `${a.venue_name} · ${fmtDateTime(a.starts_at)}`, link: '/officer/shifts', email: true, severity: 'warning' });
    await audit(user, 'shift.unassign', 'shift', a.shift_id, { officer: a.officer_id });
    return { ok: true };
  }),

  // Officer requested an open shift → approve / reject
  'shifts.decideRequest': def(MGR, async (b, { user }) => {
    required(b, 'id', 'approve');
    const a = need(await one("SELECT * FROM shift_assignments WHERE id = $1 AND status = 'requested'", [b.id]), 'Request not found');
    const s = await getShift(a.shift_id);
    await assertVenue(user, s.venue_id);
    if (b.approve) {
      const check = await checkOfficerForShift(a.officer_id, s, { ignoreAssignment: a.id });
      if (check.blocking.length) fail(422, check.blocking.join('; '), check);
      if ((await filledCount(s.id)) >= s.headcount) fail(400, 'Shift is already fully staffed');
      await q("UPDATE shift_assignments SET status = 'accepted', responded_at = now() WHERE id = $1", [a.id]);
      await notifyAssigned(a, s, 'approved');
    } else {
      await q("UPDATE shift_assignments SET status = 'rejected' WHERE id = $1", [a.id]);
      await notify(await officerUser(a.officer_id), { kind: 'shift', title: 'Shift request not approved', body: `${s.venue_name} · ${fmtDateTime(s.starts_at)}`, link: '/officer/shifts' });
    }
    await audit(user, b.approve ? 'shift.request_approve' : 'shift.request_reject', 'shift', s.id, { officer: a.officer_id });
    return { ok: true };
  }),

  'shifts.pendingRequests': def(MGR, async (_b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT a.id, a.created_at, s.id AS shift_id, s.starts_at, s.ends_at, s.role, v.name AS venue_name, o.id AS officer_id, o.first_name || ' ' || o.last_name AS officer_name
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
        WHERE a.status = 'requested' AND s.status = 'published' AND s.starts_at > now() AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1))
        ORDER BY s.starts_at`, [scope]);
  }),

  // ---------- Officer side ----------
  'shifts.mine': def(['officer'], async (b, { user }) => {
    const rows = await q(
      `SELECT a.id AS assignment_id, a.status AS assignment_status, a.is_lead, s.*, v.name AS venue_name, v.address AS venue_address, v.postcode, v.lat, v.lng,
              v.instructions, r.name AS role_name,
              (SELECT json_agg(json_build_object('kind', kind, 'ts', ts, 'status', status) ORDER BY ts) FROM clock_events ce WHERE ce.assignment_id = a.id) AS clock
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
        WHERE a.officer_id = $1 AND s.status = 'published' AND a.status IN ('assigned','accepted','requested')
          AND s.ends_at > COALESCE($2::timestamptz, now() - interval '1 day') AND s.starts_at < COALESCE($3::timestamptz, now() + interval '60 days')
        ORDER BY s.starts_at`, [user.officer_id, b.from || null, b.to || null]);
    return rows;
  }),

  'shifts.open': def(['officer'], async (_b, { user }) => {
    const rows = await q(
      `SELECT s.*, v.name AS venue_name, v.postcode, r.name AS role_name,
              (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted')) AS filled,
              (SELECT status FROM shift_assignments a WHERE a.shift_id = s.id AND a.officer_id = $1) AS my_status
         FROM shifts s JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
        WHERE s.open AND s.status = 'published' AND s.starts_at > now()
          AND NOT EXISTS (SELECT 1 FROM venue_bans b WHERE b.officer_id = $1 AND b.venue_id = s.venue_id)
        ORDER BY s.starts_at LIMIT 100`, [user.officer_id]);
    return rows.filter((s) => Number(s.filled) < s.headcount && !['assigned', 'accepted'].includes(s.my_status));
  }),

  'shifts.request': def(['officer'], async (b, { user }) => {
    const s = await getShift(b.shift_id);
    if (!s.open || s.status !== 'published') fail(400, 'Shift is not open');
    const check = await checkOfficerForShift(user.officer_id, s);
    if (check.blocking.length) fail(422, check.blocking.join('; '));
    await q(
      `INSERT INTO shift_assignments (shift_id, officer_id, status) VALUES ($1,$2,'requested')
       ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'requested' WHERE shift_assignments.status IN ('declined','cancelled')`, [s.id, user.officer_id]);
    await notify(await managersFor(s.venue_id), { kind: 'open_shift', title: 'Open shift requested', body: `${user.name} · ${s.venue_name} ${fmtDateTime(s.starts_at)}`, link: '/company/rota?tab=requests' });
    return { ok: true };
  }),

  'shifts.respond': def(['officer'], async (b, { user }) => {
    required(b, 'assignment_id', 'accept');
    const a = need(await one(
      `SELECT a.*, s.starts_at, s.venue_id, v.name AS venue_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
        WHERE a.id = $1 AND a.officer_id = $2`, [b.assignment_id, user.officer_id]));
    if (!['assigned', 'requested'].includes(a.status) && !(a.status === 'accepted' && !b.accept)) fail(400, 'Nothing to respond to');
    if (!b.accept && await one('SELECT 1 FROM clock_events WHERE assignment_id = $1', [a.id])) fail(400, 'Already clocked in');
    const status = b.accept ? 'accepted' : a.status === 'requested' ? 'cancelled' : 'declined';
    await q('UPDATE shift_assignments SET status = $2, responded_at = now() WHERE id = $1', [a.id, status]);
    if (!b.accept) {
      await notify(await managersFor(a.venue_id), {
        kind: 'shift', title: 'Shift declined', body: `${user.name} can't work ${a.venue_name} · ${fmtDateTime(a.starts_at)}${b.reason ? ` — ${b.reason}` : ''}`,
        link: '/company/rota', severity: 'warning', email: new Date(a.starts_at) - Date.now() < 48 * 3600000,
      });
    }
    return { ok: true, status };
  }),
};

// London wall-clock (YYYY-MM-DD, HH:MM) → UTC Date
export function londonToUtc(dateStr, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const p = londonParts(guess);
  const offsetMin = (p.hour * 60 + p.minute) - (h * 60 + m) + (p.date !== dateStr ? (p.date > dateStr ? 1440 : -1440) : 0);
  return new Date(guess.getTime() - offsetMin * 60000);
}
const addDay = (d) => new Date(new Date(`${d}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
