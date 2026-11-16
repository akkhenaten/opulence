import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, need, pick } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { notify, managersFor, venueContacts, officerUser } from '../lib/notify.mjs';
import { fmtDate, fmtDateTime, fmtTime, londonParts } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { compliance } from './officers.mjs';
import { ALL, MGR, def } from './_def.mjs';
import { statusFor, statusesFor, pairKey, OK, STATUS_LABEL } from '../lib/venuePack.mjs';
import { remindPack } from './venuePacks.mjs';
import { afterShiftChange, FRESH } from './shiftSync.mjs';
import { officerDisplay, officerName } from '../lib/names.mjs';
import { streamFor, assertStreamMovable, afterStreamMove, streamNameSql } from './streams.mjs';

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
  const graceCovers = (key) => c.grace?.covers.includes(key) && shiftDay <= c.grace.ends_on;
  if (o.sia_expiry && o.sia_expiry < shiftDay && !c.issues.includes('SIA licence expired') && !c.graced.includes('SIA licence expired') && shift.role !== 'steward'
    && !graceCovers('sia_expiry_shift')) blocking.push('SIA licence expires before this shift');
  // A grace period only lets them work up to its last day
  if (c.grace && shiftDay > c.grace.ends_on) blocking.push(`Grace period ends ${fmtDate(c.grace.ends_on)}; can't roster after it`);

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
  // Never stops a booking: the officer signs the venue pack before they can clock in
  const notes = [];
  const pk = await statusFor(o.id, shift.venue_id);
  if (pk && !OK.has(pk.status)) notes.push(pk.status === 'unsigned' ? 'Not worked here before: they will read and sign the site pack before clock-in' : `Site pack: ${STATUS_LABEL[pk.status].toLowerCase()} before clock-in`);
  return { blocking, warnings, notes, grace_until: c.grace?.ends_on || null, graced: c.grace ? c.graced : [], officer: { id: o.id, name: officerDisplay(o), full_name: `${o.first_name} ${o.last_name}`, goes_by: o.goes_by || '' } };
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
    `SELECT s.*, v.name AS venue_name, r.name AS role_name, ${streamNameSql('s')} AS stream_name,
       COALESCE(json_agg(json_build_object(
         'id', a.id, 'officer_id', a.officer_id, 'status', a.status, 'is_lead', a.is_lead,
         'name', ${officerName('o')}, 'goes_by', o.goes_by, 'sia_number', o.sia_number,
         'clocked_in', (SELECT min(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual')),
         'clocked_out', (SELECT max(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'out' AND ce.status IN ('ok','approved','manual'))
       ) ORDER BY o.first_name) FILTER (WHERE a.id IS NOT NULL AND a.status NOT IN ('cancelled','rejected')), '[]') AS assignments
       FROM shifts s JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
       LEFT JOIN shift_assignments a ON a.shift_id = s.id LEFT JOIN officers o ON o.id = a.officer_id
      WHERE ${where} GROUP BY s.id, v.name, r.name ORDER BY s.starts_at, v.name`, params);
  // Managers see who still has to sign the venue pack, on shifts that have not ended
  const pairs = venueView ? [] : rows.filter((s) => new Date(s.ends_at) > new Date()).flatMap((s) => s.assignments
    .filter((a) => ['assigned', 'accepted'].includes(a.status)).map((a) => ({ officer_id: a.officer_id, venue_id: s.venue_id })));
  const packs = pairs.length ? await statusesFor(pairs) : new Map();
  return rows.map((s) => {
    const filled = s.assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).length;
    for (const a of s.assignments) {
      const p = packs.get(pairKey(a.officer_id, s.venue_id));
      if (p && !OK.has(p.status)) a.pack = p.status;
    }
    const out = { ...s, filled };
    // Which budget a shift bills to is between Opulence and the venue
    if (user.role === 'officer') { delete out.stream_id; delete out.stream_name; }
    // The signed-in manager's own shifts are marked "You" on the rota
    if (user.self_officer_id) out.assignments = s.assignments.map((a) => ({ ...a, is_self: a.officer_id === user.self_officer_id }));
    if (venueView) out.assignments = s.assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).map(({ name, sia_number, clocked_in, clocked_out, status, is_lead }) => ({ name, sia_number, clocked_in, clocked_out, status, is_lead }));
    return out;
  });
}

/** Cancel a shift and everyone on it; they are told, and alerts, cards and buttons about it go. */
// quiet: the caller tells the team itself (one message for several shifts) from the team returned
async function cancelShift(s, user, reason, { quiet } = {}) {
  await q("UPDATE shifts SET status = 'cancelled' WHERE id = $1", [s.id]);
  const team = await q("UPDATE shift_assignments SET status = 'cancelled' WHERE shift_id = $1 AND status IN ('assigned','accepted','requested') RETURNING id, officer_id, shift_id, status", [s.id]);
  await afterShiftChange({ removed: team.map((a) => ({ ...a, venue_name: s.venue_name, starts_at: s.starts_at })), shiftIds: [s.id], gone: true });
  if (!quiet) for (const a of team) await notify(await officerUser(a.officer_id), { kind: 'shift', title: 'Shift cancelled', body: `${s.venue_name} · ${fmtDateTime(s.starts_at)}`, link: '/officer/shifts', email: true, severity: 'warning', tier: 'urgent' });
  await audit(user, 'shift.cancel', 'shift', s.id, { reason });
  return team;
}

// Only drafts go for good; nobody was told about them, so nobody is told now
async function deleteDraft(s) {
  const team = await q('SELECT id, officer_id, shift_id FROM shift_assignments WHERE shift_id = $1', [s.id]);
  await q('DELETE FROM shifts WHERE id = $1', [s.id]);
  await afterShiftChange({ removed: team.map((a) => ({ ...a, venue_name: s.venue_name, starts_at: s.starts_at })), shiftIds: [s.id], gone: true });
}

// The shift page itself, where the officer can accept or decline
export const assignedLink = (shift) => (shift?.id ? `/officer/shifts/${shift.id}` : '/officer/shifts');

async function notifyAssigned(assignment, shift, kind = 'assigned') {
  const title = kind === 'assigned' ? 'New shift assigned' : kind === 'approved' ? 'Shift request approved' : 'Shift updated';
  // A change to a shift in the next 48 hours is urgent
  const soon = kind === 'changed' && new Date(shift.starts_at) - Date.now() < 48 * 3600e3;
  await notify(await officerUser(assignment.officer_id), {
    kind: 'shift', title, body: `${shift.venue_name} · ${fmtDateTime(shift.starts_at)} – ${fmtTime(shift.ends_at)}`, link: assignedLink(shift), email: true, ref: `asg:${assignment.id}`, tier: soon ? 'urgent' : null,
  });
}

/* ---------- Several shifts at once ---------- */

export const MAX_BULK = 200;
// "Sat 21 Nov · The Ivy": how a shift left out of a bulk action is named in the list
export const shiftLabel = (s) => `${new Date(s.starts_at).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })}${s.venue_name ? ` · ${s.venue_name}` : ''}`;

/** Why a shift sits out of a bulk action of this kind, or null when it fits. */
export function bulkSkip(s, kind, now = Date.now()) {
  if (s.status === 'cancelled') return 'cancelled';
  if (new Date(s.ends_at) <= now) return 'already finished';
  if (kind === 'publish' && s.status !== 'draft') return 'already published';
  if ((kind === 'open' || kind === 'requests') && s.status !== 'published') return 'still a draft';
  return null;
}

// Requests on a shift are taken in the order they came in, while places last
export const oldestFirst = (reqs) => [...reqs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

// The picked shifts the manager may touch, earliest first, so each check sees the bookings made before it
async function bulkShifts(user, ids) {
  if (!Array.isArray(ids) || !ids.length) fail(400, 'Pick at least one shift');
  if (ids.length > MAX_BULK) fail(400, `Up to ${MAX_BULK} shifts at a time`);
  const scope = await venueScope(user);
  return q(
    `SELECT s.*, v.name AS venue_name, (SELECT count(*)::int FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted')) AS filled
       FROM shifts s JOIN venues v ON v.id = s.venue_id
      WHERE s.id = ANY($1::uuid[]) AND ($2::uuid[] IS NULL OR s.venue_id = ANY($2)) ORDER BY s.starts_at`, [ids, scope]);
}
const left = (s, why) => ({ id: s.id, label: shiftLabel(s), why });

// One message per officer for everything a bulk action did to them
async function notifyGrouped(officerId, list, one, many, extra = {}) {
  await notify(await officerUser(officerId), {
    kind: 'shift', title: list.length > 1 ? `${list.length} ${many}` : one,
    body: `${list.slice(0, 3).map((s) => `${s.venue_name} ${fmtDateTime(s.starts_at)}`).join(' · ')}${list.length > 3 ? ` +${list.length - 3} more` : ''}`,
    link: list.length === 1 ? assignedLink(list[0]) : '/officer/shifts', email: true, ref: list.length === 1 && list[0].assignment_id ? `asg:${list[0].assignment_id}` : null,
    ...extra,
  });
}
const byOfficer = (rows) => rows.reduce((m, r) => m.set(r.officer_id, [...(m.get(r.officer_id) || []), r]), new Map());

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
      // A move to another venue starts on that venue's stream for the role, unless one was picked
      const venueMoved = f.venue_id !== before.venue_id;
      if (('stream_id' in b && b.stream_id !== before.stream_id) || venueMoved) {
        f.stream_id = await streamFor(f.venue_id, venueMoved && b.stream_id === before.stream_id ? null : b.stream_id, f.role);
        if (f.stream_id === before.stream_id) delete f.stream_id;
        else await assertStreamMovable(b.id);
      }
      // Cancelling goes the same way as the Cancel button, so the team is told and everything about it is cleared
      if (f.status === 'cancelled' && before.status !== 'cancelled') {
        delete f.status;
        if (Object.keys(f).length) await one(`UPDATE shifts SET ${Object.keys(f).map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [b.id, ...Object.values(f)]);
        await cancelShift(await getShift(b.id), user, b.reason);
        return getShift(b.id);
      }
      const keys = Object.keys(f);
      s = await one(`UPDATE shifts SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [b.id, ...keys.map((k) => f[k])]);
      const timeChanged = +new Date(before.starts_at) !== +new Date(s.starts_at) || +new Date(before.ends_at) !== +new Date(s.ends_at) || before.venue_id !== s.venue_id;
      const unpublished = before.status === 'published' && s.status === 'draft';
      if (timeChanged || unpublished) {
        // What the team was told before (old time, old venue) no longer holds
        const team = await q("SELECT id, officer_id, shift_id FROM shift_assignments WHERE shift_id = $1 AND status IN ('assigned','accepted')", [s.id]);
        await afterShiftChange({ stale: team.map((a) => ({ ...a, venue_name: before.venue_name, starts_at: before.starts_at })), shiftIds: [s.id], officerIds: team.map((a) => a.officer_id) });
        if (timeChanged && s.status === 'published') {
          const v = await one('SELECT name FROM venues WHERE id = $1', [s.venue_id]);
          for (const a of team) await notifyAssigned(a, { ...s, venue_name: v.name }, 'changed');
        }
      }
      // Notes changed once the team is on: tell them, and the card shows when they changed
      if ('notes' in f && (f.notes || '') !== (before.notes || '') && s.status === 'published' && new Date(s.starts_at) <= new Date()) {
        s = await one('UPDATE shifts SET notes_updated_at = now() WHERE id = $1 RETURNING *', [s.id]);
        const users = (await q("SELECT o.user_id FROM shift_assignments a JOIN officers o ON o.id = a.officer_id WHERE a.shift_id = $1 AND a.status IN ('assigned','accepted') AND o.user_id IS NOT NULL", [s.id])).map((r) => r.user_id);
        await notify(users, { kind: 'shift', title: 'Shift notes updated', body: String(s.notes || 'The notes were cleared.').slice(0, 160), link: `/officer/shifts/${s.id}`, dedupe: `notes:${s.id}:${Math.floor(Date.now() / 60000)}` });
      }
      if (f.stream_id) {
        await afterStreamMove(s);
        await audit(user, 'shift.stream', 'shift', s.id, { from: before.stream_id, to: s.stream_id });
      }
      await audit(user, 'shift.update', 'shift', s.id, f);
    } else {
      f.stream_id = await streamFor(f.venue_id, b.stream_id, f.role);
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
    const stream = await streamFor(b.venue_id, b.stream_id, b.role);
    const created = [];
    for (const d of b.dates) {
      const starts = londonToUtc(d, b.start_time);
      let ends = londonToUtc(d, b.end_time);
      if (ends <= starts) ends = londonToUtc(addDay(d), b.end_time);
      created.push(await insert('shifts', {
        venue_id: b.venue_id, stream_id: stream, role: b.role, starts_at: starts, ends_at: ends, headcount: b.headcount || 1, break_minutes: b.break_minutes || 0,
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
      `SELECT a.officer_id, a.id AS assignment_id, s.*, v.name AS venue_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
        WHERE a.shift_id = ANY($1::uuid[]) AND a.status = 'assigned'`, [rows.map((r) => r.id)]);
    const byOfficer = {};
    for (const a of assigns) (byOfficer[a.officer_id] ||= []).push(a);
    for (const [officerId, list] of Object.entries(byOfficer)) {
      await notify(await officerUser(officerId), {
        kind: 'shift', title: list.length > 1 ? `${list.length} new shifts published` : 'New shift published',
        body: list.slice(0, 3).map((s) => `${s.venue_name} ${fmtDateTime(s.starts_at)}`).join(' · '), link: '/officer/shifts', email: true,
        ref: list.length === 1 ? `asg:${list[0].assignment_id}` : null,
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
    await cancelShift(s, user, b.reason);
    return { ok: true };
  }),

  'shifts.delete': def(MGR, async (b, { user }) => {
    const s = await getShift(b.id);
    await assertVenue(user, s.venue_id);
    if (s.status !== 'draft') fail(400, 'Only draft shifts can be deleted — cancel it instead');
    await deleteDraft(s);
    return { ok: true };
  }),

  'shifts.copyWeek': def(MGR, async (b, { user }) => {
    required(b, 'from_week', 'to_week'); // Monday dates
    const scope = await venueScope(user);
    const days = Math.round((new Date(b.to_week) - new Date(b.from_week)) / 86400000);
    if (days % 7) fail(400, 'Weeks must start on the same weekday');
    const rows = await q(
      `INSERT INTO shifts (venue_id, stream_id, role, starts_at, ends_at, break_minutes, headcount, open, notes, status, created_by)
       SELECT venue_id, (SELECT x.id FROM venue_streams x WHERE x.id = shifts.stream_id AND x.status = 'active'), role, starts_at + ($3 || ' days')::interval, ends_at + ($3 || ' days')::interval, break_minutes, headcount, open, notes, 'draft', $4
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
      results.push({ ...c.officer, blocking: c.blocking, warnings: c.warnings, notes: c.notes, grace_until: c.grace_until, graced: c.graced });
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
       ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'assigned', responded_at = NULL, ${FRESH} RETURNING *`, [s.id, b.officer_id]);
    await q('DELETE FROM pack_reminders WHERE assignment_id = $1', [a.id]);
    if (s.status === 'published') { await notifyAssigned(a, s); await remindPack(a.id); }
    await afterShiftChange({ shiftIds: [s.id], officerIds: [b.officer_id] });
    await audit(user, 'shift.assign', 'shift', s.id, { officer: b.officer_id, override: check.warnings, ...(b.officer_id === user.self_officer_id ? { self: true } : {}) });
    return a;
  }),

  'shifts.unassign': def(MGR, async (b, { user }) => {
    const a = need(await one('SELECT a.*, s.venue_id, s.starts_at, s.status AS shift_status, v.name AS venue_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id WHERE a.id = $1', [b.id]));
    await assertVenue(user, a.venue_id);
    if (await one('SELECT 1 FROM clock_events WHERE assignment_id = $1', [a.id])) fail(400, 'Officer has already clocked in on this shift');
    await q("UPDATE shift_assignments SET status = 'cancelled' WHERE id = $1", [b.id]);
    await afterShiftChange({ removed: [a], shiftIds: [a.shift_id] });
    if (a.shift_status === 'published') await notify(await officerUser(a.officer_id), { kind: 'shift', title: 'Removed from shift', body: `${a.venue_name} · ${fmtDateTime(a.starts_at)}`, link: '/officer/shifts', email: true, severity: 'warning', tier: 'urgent' });
    await audit(user, 'shift.unassign', 'shift', a.shift_id, { officer: a.officer_id });
    return { ok: true };
  }),

  // Swap one officer for another in one step: the headcount does not change, so a full shift is fine
  'shifts.reassign': def(MGR, async (b, { user }) => {
    required(b, 'shift_id', 'officer_id');
    if (!b.assignment_id && !b.from_officer_id) fail(400, 'Say who is being replaced');
    const s = await getShift(b.shift_id);
    await assertVenue(user, s.venue_id);
    if (s.status === 'cancelled') fail(400, 'Shift is cancelled');
    const old = need(await one(
      `SELECT a.*, ${officerName('o')} AS name FROM shift_assignments a JOIN officers o ON o.id = a.officer_id
        WHERE a.shift_id = $1 AND a.status IN ('assigned','accepted') AND ($2::uuid IS NULL OR a.id = $2) AND ($3::uuid IS NULL OR a.officer_id = $3)`,
      [s.id, b.assignment_id || null, b.from_officer_id || null]), 'That officer is not on this shift');
    if (old.officer_id === b.officer_id) fail(400, 'That officer is already on this shift');
    if (await one('SELECT 1 FROM clock_events WHERE assignment_id = $1', [old.id])) fail(400, `${old.name} has already clocked in on this shift`);
    const check = await checkOfficerForShift(b.officer_id, s);
    if (check.blocking.length) fail(422, check.blocking.join('; '), check);
    if (check.warnings.length && !b.override) fail(409, check.warnings.join('; '), { ...check, needs_override: true });
    const a = await tx(async (t) => {
      await t.q("UPDATE shift_assignments SET status = 'cancelled', is_lead = false WHERE id = $1", [old.id]);
      return t.one(
        `INSERT INTO shift_assignments (shift_id, officer_id, status, is_lead) VALUES ($1,$2,'assigned',$3)
         ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'assigned', responded_at = NULL, is_lead = $3, ${FRESH} RETURNING *`, [s.id, b.officer_id, old.is_lead]);
    });
    await q('DELETE FROM pack_reminders WHERE assignment_id = $1', [a.id]);
    await afterShiftChange({ removed: [{ ...old, venue_name: s.venue_name, starts_at: s.starts_at }], shiftIds: [s.id], officerIds: [b.officer_id] });
    if (s.status === 'published') {
      await notify(await officerUser(old.officer_id), { kind: 'shift', title: 'Removed from shift', body: `${s.venue_name} · ${fmtDateTime(s.starts_at)}`, link: '/officer/shifts', email: true, severity: 'warning', tier: 'urgent' });
      await notifyAssigned(a, s);
      await remindPack(a.id);
    }
    await audit(user, 'shift.reassign', 'shift', s.id, { from: old.officer_id, to: b.officer_id, override: check.warnings });
    return { ...a, replaced: old.name, name: check.officer.name };
  }),

  // Officer requested an open shift → approve / reject
  'shifts.decideRequest': def(MGR, async (b, { user }) => {
    required(b, 'id', 'approve');
    const a = need(await one("SELECT * FROM shift_assignments WHERE id = $1 AND status = 'requested'", [b.id]), 'Request not found');
    const s = await getShift(a.shift_id);
    await assertVenue(user, s.venue_id);
    // The request is dealt with, so the managers' notice about it goes
    await q('DELETE FROM notifications WHERE ref = $1', [`req:${a.id}`]);
    if (b.approve) {
      const check = await checkOfficerForShift(a.officer_id, s, { ignoreAssignment: a.id });
      if (check.blocking.length) fail(422, check.blocking.join('; '), check);
      if ((await filledCount(s.id)) >= s.headcount) fail(400, 'Shift is already fully staffed');
      await q("UPDATE shift_assignments SET status = 'accepted', responded_at = now() WHERE id = $1", [a.id]);
      await notifyAssigned(a, s, 'approved');
      await remindPack(a.id);
      await afterShiftChange({ shiftIds: [s.id], officerIds: [a.officer_id] });
    } else {
      await q("UPDATE shift_assignments SET status = 'rejected' WHERE id = $1", [a.id]);
      await notify(await officerUser(a.officer_id), { kind: 'shift', title: 'Shift request not approved', body: `${s.venue_name} · ${fmtDateTime(s.starts_at)}`, link: '/officer/shifts' });
    }
    await audit(user, b.approve ? 'shift.request_approve' : 'shift.request_reject', 'shift', s.id, { officer: a.officer_id });
    return { ok: true };
  }),

  /* ---------- Several shifts at once: each one gets the same checks as on its own; whatever does not fit is
     left out and named with the reason, and each officer hears once ---------- */

  // Who can take the picked shifts: how many each officer fits, and why not the rest
  'shifts.candidatesMany': def(MGR, async (b, { user }) => {
    const shifts = (await bulkShifts(user, b.ids)).filter((s) => !bulkSkip(s, 'assign') && s.filled < s.headcount).slice(0, 40);
    const on = new Set((await q("SELECT shift_id, officer_id FROM shift_assignments WHERE shift_id = ANY($1::uuid[]) AND status IN ('assigned','accepted')", [shifts.map((s) => s.id)]))
      .map((r) => `${r.shift_id}:${r.officer_id}`));
    const officers = await q("SELECT * FROM officers WHERE status = 'active' ORDER BY first_name");
    const list = await Promise.all(officers.map(async (o) => {
      const blocked = [];
      const warnings = [];
      let fits = 0;
      for (const s of shifts) {
        if (on.has(`${s.id}:${o.id}`)) { blocked.push(left(s, 'already on it')); continue; }
        const c = await checkOfficerForShift(o.id, s);
        if (c.blocking.length) blocked.push(left(s, c.blocking.join('; ')));
        else { fits++; if (c.warnings.length) warnings.push(left(s, c.warnings.join('; '))); }
      }
      return { id: o.id, name: officerDisplay(o), full_name: `${o.first_name} ${o.last_name}`, goes_by: o.goes_by || '', fits, blocked, warnings };
    }));
    return { shifts: shifts.length, officers: list.sort((a, z) => z.fits - a.fits || a.warnings.length - z.warnings.length || a.name.localeCompare(z.name)) };
  }),

  'shifts.assignMany': def(MGR, async (b, { user }) => {
    required(b, 'ids', 'officer_id');
    const shifts = await bulkShifts(user, b.ids);
    const on = new Set((await q("SELECT shift_id FROM shift_assignments WHERE officer_id = $1 AND shift_id = ANY($2::uuid[]) AND status IN ('assigned','accepted')", [b.officer_id, shifts.map((s) => s.id)])).map((r) => r.shift_id));
    const skipped = [];
    const todo = [];
    for (const s of shifts) {
      const why = bulkSkip(s, 'assign') || (on.has(s.id) && 'already on it') || (s.filled >= s.headcount && 'full');
      if (why) skipped.push(left(s, why)); else todo.push(s);
    }
    // Warnings are asked about once for the lot, before anything is booked
    if (!b.override) {
      const warnings = [];
      for (const s of todo) {
        const c = await checkOfficerForShift(b.officer_id, s);
        if (!c.blocking.length && c.warnings.length) warnings.push(left(s, c.warnings.join('; ')));
      }
      if (warnings.length) return { needs_override: true, warnings, done: 0, skipped };
    }
    const made = [];
    for (const s of todo) {
      const c = await checkOfficerForShift(b.officer_id, s);
      if (c.blocking.length) { skipped.push(left(s, c.blocking.join('; '))); continue; }
      if (c.warnings.length && !b.override) { skipped.push(left(s, c.warnings.join('; '))); continue; }
      if ((await filledCount(s.id)) >= s.headcount) { skipped.push(left(s, 'full')); continue; }
      const a = await one(
        `INSERT INTO shift_assignments (shift_id, officer_id, status) VALUES ($1,$2,'assigned')
         ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'assigned', responded_at = NULL, ${FRESH} RETURNING *`, [s.id, b.officer_id]);
      await q('DELETE FROM pack_reminders WHERE assignment_id = $1', [a.id]);
      made.push({ ...s, assignment_id: a.id, warnings: c.warnings });
    }
    const live = made.filter((s) => s.status === 'published');
    if (live.length) {
      await notifyGrouped(b.officer_id, live, 'New shift assigned', 'new shifts assigned');
      for (const s of live) await remindPack(s.assignment_id);
    }
    if (made.length) await afterShiftChange({ shiftIds: made.map((s) => s.id), officerIds: [b.officer_id] });
    await audit(user, 'shift.assign_many', 'shift', null, { officer: b.officer_id, shifts: made.map((s) => s.id), override: made.flatMap((s) => s.warnings), skipped: skipped.length });
    return { done: made.length, skipped };
  }),

  // Every officer request on the picked shifts: approved oldest first while places last, or all declined
  'shifts.decideRequests': def(MGR, async (b, { user }) => {
    required(b, 'ids', 'approve');
    const shifts = await bulkShifts(user, b.ids);
    const reqs = await q(
      `SELECT a.*, ${officerName('o')} AS name FROM shift_assignments a JOIN officers o ON o.id = a.officer_id
        WHERE a.shift_id = ANY($1::uuid[]) AND a.status = 'requested'`, [shifts.map((s) => s.id)]);
    const skipped = [];
    const done = [];
    for (const s of shifts) {
      const mine = oldestFirst(reqs.filter((a) => a.shift_id === s.id));
      if (!mine.length) continue;
      const why = bulkSkip(s, 'requests');
      if (why) { skipped.push(left(s, why)); continue; }
      let free = s.headcount - s.filled;
      for (const a of mine) {
        if (b.approve) {
          if (free <= 0) { skipped.push(left(s, `full, ${a.name} left waiting`)); continue; }
          const c = await checkOfficerForShift(a.officer_id, s, { ignoreAssignment: a.id });
          if (c.blocking.length) { skipped.push(left(s, `${a.name}: ${c.blocking.join('; ')}`)); continue; }
          await q("UPDATE shift_assignments SET status = 'accepted', responded_at = now() WHERE id = $1", [a.id]);
          free--;
        } else {
          await q("UPDATE shift_assignments SET status = 'rejected' WHERE id = $1", [a.id]);
        }
        done.push({ ...s, officer_id: a.officer_id, assignment_id: a.id });
      }
    }
    // The requests are dealt with, so the managers' notices about them go
    if (done.length) await q('DELETE FROM notifications WHERE ref = ANY($1::text[])', [done.map((d) => `req:${d.assignment_id}`)]);
    for (const [officerId, list] of byOfficer(done)) {
      if (b.approve) await notifyGrouped(officerId, list, 'Shift request approved', 'shift requests approved');
      else await notifyGrouped(officerId, list, 'Shift request not approved', 'shift requests not approved', { email: false, link: '/officer/shifts', ref: null });
    }
    if (b.approve) {
      for (const d of done) await remindPack(d.assignment_id);
      if (done.length) await afterShiftChange({ shiftIds: [...new Set(done.map((d) => d.id))], officerIds: [...new Set(done.map((d) => d.officer_id))] });
    }
    await audit(user, b.approve ? 'shift.request_approve_many' : 'shift.request_reject_many', 'shift', null, { requests: done.map((d) => d.assignment_id), skipped: skipped.length });
    return { done: done.length, skipped };
  }),

  // Offer the picked published shifts to officers, or stop offering them
  'shifts.setOpen': def(MGR, async (b, { user }) => {
    required(b, 'ids', 'open');
    const shifts = await bulkShifts(user, b.ids);
    const skipped = [];
    const ids = [];
    for (const s of shifts) {
      const why = bulkSkip(s, 'open');
      if (why) skipped.push(left(s, why));
      else if (!!s.open !== !!b.open) ids.push(s.id);
    }
    if (ids.length) await q('UPDATE shifts SET open = $2 WHERE id = ANY($1::uuid[])', [ids, !!b.open]);
    if (ids.length && b.open) {
      const officers = await q("SELECT user_id FROM officers WHERE status = 'active' AND user_id IS NOT NULL");
      await notify(officers.map((o) => o.user_id), { kind: 'open_shift', title: `${ids.length} open shift${ids.length > 1 ? 's' : ''} available`, body: 'Request them in the app before they go.', link: '/officer/shifts?tab=open' });
    }
    await audit(user, b.open ? 'shift.open_many' : 'shift.close_many', 'shift', null, { shifts: ids });
    return { done: ids.length, skipped };
  }),

  // Published shifts are cancelled (the team is told once each), drafts deleted; a shift someone is clocked in on stays
  'shifts.cancelMany': def(MGR, async (b, { user }) => {
    const shifts = await bulkShifts(user, b.ids);
    const clocked = new Set((await q('SELECT DISTINCT a.shift_id FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id WHERE a.shift_id = ANY($1::uuid[])', [shifts.map((s) => s.id)])).map((r) => r.shift_id));
    const skipped = [];
    const told = [];
    let cancelled = 0;
    let deleted = 0;
    for (const s of shifts) {
      const why = s.status === 'cancelled' ? 'already cancelled' : clocked.has(s.id) ? 'someone has clocked in' : new Date(s.ends_at) <= Date.now() ? 'already finished' : null;
      if (why) { skipped.push(left(s, why)); continue; }
      if (s.status === 'draft') { await deleteDraft(s); deleted++; continue; }
      const team = await cancelShift(s, user, b.reason, { quiet: true });
      told.push(...team.map((a) => ({ ...s, officer_id: a.officer_id })));
      cancelled++;
    }
    for (const [officerId, list] of byOfficer(told)) {
      await notifyGrouped(officerId, list, 'Shift cancelled', 'shifts cancelled', { link: '/officer/shifts', ref: null, severity: 'warning', tier: 'urgent' });
    }
    return { done: cancelled + deleted, cancelled, deleted, skipped };
  }),

  'shifts.pendingRequests': def(MGR, async (_b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT a.id, a.created_at, s.id AS shift_id, s.starts_at, s.ends_at, s.role, v.name AS venue_name, o.id AS officer_id, ${officerName('o')} AS officer_name
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
    const a = await one(
      `INSERT INTO shift_assignments (shift_id, officer_id, status) VALUES ($1,$2,'requested')
       ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'requested', ${FRESH} WHERE shift_assignments.status IN ('declined','cancelled') RETURNING id`, [s.id, user.officer_id]);
    if (a) await q('DELETE FROM pack_reminders WHERE assignment_id = $1', [a.id]);
    await notify(await managersFor(s.venue_id), { kind: 'open_shift', title: 'Open shift requested', body: `${user.name} · ${s.venue_name} ${fmtDateTime(s.starts_at)}`, link: '/company/rota?tab=requests', ref: a ? `req:${a.id}` : null });
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
      await afterShiftChange({ removed: [a], shiftIds: [a.shift_id] });
      await notify(await managersFor(a.venue_id), {
        kind: 'shift', title: 'Shift declined', body: `${user.name}${a.is_lead ? ' (shift lead)' : ''} can't work ${a.venue_name} · ${fmtDateTime(a.starts_at)}${b.reason ? ` — ${b.reason}` : ''}`,
        link: '/company/rota', severity: shortNotice(a.starts_at) ? 'critical' : 'warning', email: new Date(a.starts_at) - Date.now() < 48 * 3600000,
      });
    }
    return { ok: true, status };
  }),
};

// Pulling out of a shift that starts within a day needs cover fast: the alert is urgent
export const shortNotice = (startsAt, now = Date.now()) => new Date(startsAt).getTime() - now < 24 * 3600000;

// London wall-clock (YYYY-MM-DD, HH:MM) → UTC Date
export function londonToUtc(dateStr, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const guess = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const p = londonParts(guess);
  const offsetMin = (p.hour * 60 + p.minute) - (h * 60 + m) + (p.date !== dateStr ? (p.date > dateStr ? 1440 : -1440) : 0);
  return new Date(guess.getTime() - offsetMin * 60000);
}
const addDay = (d) => new Date(new Date(`${d}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);

/** Where a swap request opens for the manager: the shift with Assign already open */
export const swapLink = (shiftId) => `/company/rota?shift=${shiftId}&assign=1`;

// "Ask to swap": the officer keeps the shift until a manager moves it; managers get a notice that opens Assign on it
actions['shifts.swapAsk'] = def(['officer'], async (b, { user }) => {
  required(b, 'assignment_id');
  const a = need(await one(
    `SELECT a.id, a.officer_id, a.status, s.id AS shift_id, s.venue_id, s.starts_at, s.ends_at, v.name AS venue_name
       FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id WHERE a.id = $1`, [b.assignment_id]));
  if (a.officer_id !== user.officer_id) fail(403, 'Forbidden');
  if (!['assigned', 'accepted'].includes(a.status) || new Date(a.ends_at) < new Date()) fail(400, 'This shift can no longer be swapped');
  const note = String(b.note || '').trim().slice(0, 500);
  const o = await one(`SELECT ${officerName('o')} AS name FROM officers o WHERE o.id = $1`, [a.officer_id]);
  await notify(await managersFor(a.venue_id), {
    kind: 'shift', title: `${o.name} asks to swap a shift`, body: `${a.venue_name} · ${fmtDateTime(a.starts_at)} – ${fmtTime(a.ends_at)}${note ? ` · "${note}"` : ''}`,
    link: swapLink(a.shift_id), ref: `swap:${a.id}`,
  });
  await audit(user, 'shift.swap_ask', 'assignment', a.id, { note });
  return { ok: true };
});
