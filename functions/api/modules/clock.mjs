import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { insideFence } from '../lib/geo.mjs';
import { parseQr } from '../lib/qr.mjs';
import { roundHours } from '../lib/rates.mjs';
import { notify, managersFor } from '../lib/notify.mjs';
import { fmtTime } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { compliance } from './officers.mjs';
import { getSettings } from './settings.mjs';
import { MGR, def } from './_def.mjs';

const VALID = ['ok', 'approved', 'manual'];
const EARLY_MIN = 30;

/** (Re)build the timesheet for an assignment from its clock events. Locked/signed timesheets are left alone. */
export async function buildTimesheet(assignmentId, { force = false } = {}) {
  const a = await one('SELECT a.*, s.starts_at, s.ends_at, s.break_minutes AS planned_break FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.id = $1', [assignmentId]);
  if (!a) return null;
  const existing = await one('SELECT * FROM timesheets WHERE assignment_id = $1', [assignmentId]);
  if (existing && !force && (existing.statement_id || existing.invoice_id || existing.status === 'signed')) return existing;
  const events = await q('SELECT * FROM clock_events WHERE assignment_id = $1 ORDER BY ts', [assignmentId]);
  const valid = events.filter((e) => VALID.includes(e.status));
  const ins = valid.filter((e) => e.kind === 'in');
  const outs = valid.filter((e) => e.kind === 'out');
  if (!ins.length) return existing;
  const s = await getSettings();
  const flags = new Set();
  const start = ins[0].ts;
  let end = outs.length ? outs[outs.length - 1].ts : null;
  if (!end) {
    if (new Date(a.ends_at) > new Date()) return existing; // still on shift
    end = a.ends_at;
    flags.add('no_clock_out');
  }
  // Breaks from paired break events, else the planned break
  let breakMin = 0;
  let open = null;
  for (const e of valid) {
    if (e.kind === 'break_start') open = e.ts;
    if (e.kind === 'break_end' && open) { breakMin += (new Date(e.ts) - new Date(open)) / 60000; open = null; }
  }
  breakMin = Math.round(breakMin) || a.planned_break || 0;
  if (events.some((e) => e.status === 'exception' || e.status === 'approved')) flags.add('exception');
  if (events.some((e) => e.status === 'manual')) flags.add('manual');
  if (new Date(start) - new Date(a.starts_at) > s.grace_minutes * 60000) flags.add('late');
  if (new Date(a.ends_at) - new Date(end) > 15 * 60000) flags.add('left_early');
  // Paid time starts at the scheduled start when the officer arrives early
  const paidStart = new Date(start) < new Date(a.starts_at) ? a.starts_at : start;
  const hours = roundHours(paidStart, end, breakMin, s.rounding_minutes);
  return one(
    `INSERT INTO timesheets (assignment_id, actual_start, actual_end, break_minutes, hours, flags, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending')
     ON CONFLICT (assignment_id) DO UPDATE SET actual_start = EXCLUDED.actual_start, actual_end = EXCLUDED.actual_end, break_minutes = EXCLUDED.break_minutes,
       hours = EXCLUDED.hours, flags = EXCLUDED.flags, updated_at = now(),
       status = CASE WHEN timesheets.status = 'disputed' THEN 'disputed' ELSE 'pending' END
     RETURNING *`, [assignmentId, paidStart, end, breakMin, hours, [...flags]]);
}

async function myAssignments(officerId) {
  return q(
    `SELECT a.id AS assignment_id, a.status AS assignment_status, s.id AS shift_id, s.starts_at, s.ends_at, s.role, s.break_minutes,
            v.id AS venue_id, v.name AS venue_name, v.address, v.postcode, v.lat, v.lng, v.radius_m, v.instructions, r.name AS role_name,
            COALESCE((SELECT json_agg(json_build_object('id', id, 'kind', kind, 'ts', ts, 'status', status) ORDER BY ts) FROM clock_events ce WHERE ce.assignment_id = a.id), '[]') AS events
       FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
      WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.status = 'published'
        AND s.starts_at < now() + interval '18 hours' AND s.ends_at > now() - interval '6 hours'
      ORDER BY s.starts_at`, [officerId]);
}

function stateOf(events) {
  const valid = events.filter((e) => e.status !== 'rejected');
  const last = valid[valid.length - 1];
  if (!last) return 'not_started';
  return { in: 'on_shift', break_end: 'on_shift', break_start: 'on_break', out: 'finished' }[last.kind];
}

export const actions = {
  // What the officer's clock screen should show right now
  'clock.status': def(['officer'], async (_b, { user }) => {
    const list = (await myAssignments(user.officer_id)).map((a) => ({ ...a, state: stateOf(a.events) }));
    const current = list.find((a) => a.state === 'on_shift' || a.state === 'on_break')
      || list.find((a) => a.state === 'not_started' && new Date(a.ends_at) > new Date());
    return { current: current || null, today: list };
  }),

  'clock.punch': def(['officer'], async (b, { user }) => {
    required(b, 'assignment_id', 'kind');
    if (!['in', 'out', 'break_start', 'break_end'].includes(b.kind)) fail(400, 'Invalid action');
    const a = need((await myAssignments(user.officer_id)).find((x) => x.assignment_id === b.assignment_id), 'Shift not found or not active');
    const state = stateOf(a.events);
    const allowed = { not_started: ['in'], on_shift: ['out', 'break_start'], on_break: ['break_end'], finished: [] }[state];
    if (!allowed.includes(b.kind)) fail(400, state === 'finished' ? 'You have already clocked out' : `You can't do that now (${state.replace('_', ' ')})`);

    const s = await getSettings();
    const fence = insideFence({ lat: b.lat, lng: b.lng, accuracy: b.accuracy }, a, s.gps_tolerance_m);
    let qrOk = true;
    const problems = [];
    if (b.kind === 'in') {
      const o = await one('SELECT * FROM officers WHERE id = $1', [user.officer_id]);
      const c = compliance(o);
      if (!c.ok) fail(403, `You can't clock in: ${c.issues.join(', ')}. Contact the office.`);
      if (new Date(a.starts_at) - Date.now() > EARLY_MIN * 60000) fail(400, `Too early — clock-in opens ${EARLY_MIN} minutes before the shift (${fmtTime(new Date(new Date(a.starts_at) - EARLY_MIN * 60000))})`);
      const qr = parseQr(b.qr);
      const venue = await one('SELECT qr_version FROM venues WHERE id = $1', [a.venue_id]);
      qrOk = !!qr && qr.venueId === a.venue_id && qr.version === venue.qr_version;
      if (!qrOk) problems.push(b.qr ? (qr && qr.venueId !== a.venue_id ? 'QR code is for a different venue' : 'QR code not valid') : 'QR code not scanned');
    }
    if (b.kind === 'in' || b.kind === 'out') {
      if (fence.distance == null) problems.push('Location unavailable');
      else if (!fence.ok) problems.push(`You are ${fence.distance}m from the venue (limit ${a.radius_m}m)`);
    }

    // Breaks never need checks. Clock-out outside the fence is recorded but flagged.
    let status = 'ok';
    if (problems.length) {
      if (b.kind === 'in' && !b.exception_reason) fail(422, problems.join(' · '), { problems, can_request_exception: true });
      status = 'exception';
    }

    const ev = await one(
      `INSERT INTO clock_events (assignment_id, kind, lat, lng, accuracy, distance_m, qr_ok, geo_ok, status, exception_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [a.assignment_id, b.kind, b.lat ?? null, b.lng ?? null, b.accuracy ?? null, fence.distance, qrOk, fence.ok, status, b.exception_reason || problems.join(' · ')]);
    if (a.assignment_status === 'assigned') await q("UPDATE shift_assignments SET status = 'accepted', responded_at = now() WHERE id = $1", [a.assignment_id]);

    if (status === 'exception') {
      await notify(await managersFor(a.venue_id), {
        kind: 'clock_exception', severity: 'warning', title: `Clock-${b.kind === 'in' ? 'in' : 'out'} exception`,
        body: `${user.name} at ${a.venue_name}: ${problems.join(' · ')}${b.exception_reason ? ` — "${b.exception_reason}"` : ''}`, link: '/security/exceptions', email: b.kind === 'in',
      });
    }
    if (b.kind === 'out') await buildTimesheet(a.assignment_id);
    return { event: ev, state: stateOf([...a.events, ev]), problems };
  }),

  'clock.exceptions': def(MGR, async (b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT ce.*, o.first_name || ' ' || o.last_name AS officer_name, v.name AS venue_name, v.radius_m, s.starts_at, s.ends_at, u.name AS decided_by_name
         FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id
         JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id LEFT JOIN users u ON u.id = ce.decided_by
        WHERE ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) AND (CASE WHEN $2 THEN ce.status IN ('exception','approved','rejected') ELSE ce.status = 'exception' END)
        ORDER BY ce.ts DESC LIMIT 200`, [scope, !!b.include_decided]);
  }),

  'clock.decide': def(MGR, async (b, { user }) => {
    required(b, 'id', 'approve');
    const ev = need(await one(
      `SELECT ce.*, s.venue_id FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE ce.id = $1`, [b.id]));
    await assertVenue(user, ev.venue_id);
    await q('UPDATE clock_events SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1', [b.id, b.approve ? 'approved' : 'rejected', user.id]);
    await buildTimesheet(ev.assignment_id);
    await audit(user, b.approve ? 'clock.approve' : 'clock.reject', 'clock_event', b.id);
    return { ok: true };
  }),

  // Supervisor sets the actual times by hand (always audited, reason required)
  'clock.manual': def(MGR, async (b, { user }) => {
    required(b, 'assignment_id', 'start', 'end', 'reason');
    if (new Date(b.end) <= new Date(b.start)) fail(400, 'End must be after start');
    const a = need(await one('SELECT a.*, s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.id = $1', [b.assignment_id]));
    await assertVenue(user, a.venue_id);
    const ts = await one('SELECT * FROM timesheets WHERE assignment_id = $1', [a.id]);
    if (ts && (ts.statement_id || ts.invoice_id)) fail(400, 'This timesheet is already on a statement or invoice');
    await q("UPDATE clock_events SET status = 'rejected', decided_by = $2, decided_at = now() WHERE assignment_id = $1 AND status <> 'rejected'", [a.id, user.id]);
    await q("INSERT INTO clock_events (assignment_id, kind, ts, status, exception_reason, decided_by) VALUES ($1,'in',$2,'manual',$4,$5), ($1,'out',$3,'manual',$4,$5)",
      [a.id, b.start, b.end, b.reason, user.id]);
    if (a.status !== 'accepted') await q("UPDATE shift_assignments SET status = 'accepted' WHERE id = $1", [a.id]);
    const t = await buildTimesheet(a.id, { force: true });
    if (b.break_minutes != null) await q('UPDATE timesheets SET break_minutes = $2 WHERE id = $1', [t.id, b.break_minutes]);
    if (b.break_minutes != null) {
      const s = await getSettings();
      await q('UPDATE timesheets SET hours = $2 WHERE id = $1', [t.id, roundHours(t.actual_start, t.actual_end, b.break_minutes, s.rounding_minutes)]);
    }
    await audit(user, 'clock.manual', 'assignment', a.id, { start: b.start, end: b.end, reason: b.reason });
    return { ok: true };
  }),

  // Live board for managers and venues: everyone due on site in the window
  'live.board': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    const s = await getSettings();
    const rows = await q(
      `SELECT a.id AS assignment_id, s.id AS shift_id, s.starts_at, s.ends_at, s.role, r.name AS role_name, v.id AS venue_id, v.name AS venue_name,
              o.id AS officer_id, o.first_name || ' ' || o.last_name AS officer_name, o.sia_number, o.phone, o.photo_key,
              COALESCE((SELECT json_agg(json_build_object('kind', kind, 'ts', ts, 'status', status, 'geo_ok', geo_ok, 'distance_m', distance_m) ORDER BY ts)
                 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.status <> 'rejected'), '[]') AS events
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id JOIN roles r ON r.code = s.role
        WHERE s.status = 'published' AND a.status IN ('assigned','accepted')
          AND s.starts_at < now() + interval '12 hours' AND s.ends_at > now() - interval '2 hours'
          AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) AND ($2::uuid IS NULL OR s.venue_id = $2)
        ORDER BY v.name, s.starts_at, officer_name`, [scope, b.venue_id || null]);
    const now = Date.now();
    return Promise.all(rows.map(async (r) => {
      const st = stateOf(r.events);
      let state = st;
      if (st === 'not_started') {
        if (now > new Date(r.ends_at).getTime()) state = 'no_show';
        else if (now > new Date(r.starts_at).getTime() + s.grace_minutes * 60000) state = 'late';
        else state = 'upcoming';
      }
      if (st === 'finished' && new Date(r.ends_at) - new Date(r.events.at(-1).ts) > 15 * 60000) state = 'left_early';
      const out = { ...r, state, clocked_in: r.events.find((e) => e.kind === 'in')?.ts || null, has_exception: r.events.some((e) => e.status === 'exception') };
      const { photo_key, ...rest } = out;
      if (user.role === 'venue') { delete rest.phone; delete rest.events; }
      return { ...rest, photo_url: await downloadUrl(photo_key) };
    }));
  }),
};
