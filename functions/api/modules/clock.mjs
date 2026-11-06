import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { insideFence } from '../lib/geo.mjs';
import { parseQr } from '../lib/qr.mjs';
import { roundHours } from '../lib/rates.mjs';
import { notify, managersFor } from '../lib/notify.mjs';
import { fmtTime } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { downloadUrl, photoUrls } from '../lib/storage.mjs';
import { compliance } from './officers.mjs';
import { getSettings } from './settings.mjs';
import { guardSelf, markOwn } from '../lib/selfcheck.mjs';
import { MGR, def } from './_def.mjs';
import { evaluate } from '../lib/proof.mjs';
import { checkPhone, findTap, spendTap, checkSelfie, scoreSelfie } from './clockProof.mjs';
import { statusFor, statusesFor, pairKey, livePack, venuePack, OK, STATUS_LABEL } from '../lib/venuePack.mjs';
import crypto from 'node:crypto';
import { officerName, userName } from '../lib/names.mjs';

const VALID = ['ok', 'approved', 'manual'];
export const EARLY_MIN = 15;
/** Clock-in opens EARLY_MIN minutes before the shift */
export const tooEarly = (startsAt, now = Date.now()) => new Date(startsAt) - now > EARLY_MIN * 60000;

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
  for (const f of ['face_check', 'phone_not_verified']) if (events.some((e) => e.status !== 'rejected' && (e.flags || []).includes(f))) flags.add(f);
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
            v.id AS venue_id, v.name AS venue_name, v.address, v.postcode, v.lat, v.lng, v.radius_m, v.instructions, v.proof_rule, r.name AS role_name,
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
    const o = await one('SELECT face_consent FROM officers WHERE id = $1', [user.officer_id]);
    const s = await getSettings();
    // The venue pack must be signed before clock-in at the next venue
    const st = current ? await statusFor(user.officer_id, current.venue_id) : null;
    const pack = st ? { status: st.status, label: STATUS_LABEL[st.status], to_read: st.toRead.length, ok: OK.has(st.status), venue_id: current.venue_id } : null;
    return { current: current || null, today: list, face_consent: o?.face_consent || null, face_match_enabled: !!s.face_match_enabled, pack };
  }),

  'clock.punch': def(['officer'], async (b, { user }) => {
    required(b, 'assignment_id', 'kind');
    if (!['in', 'out', 'break_start', 'break_end'].includes(b.kind)) fail(400, 'Invalid action');
    const a = need((await myAssignments(user.officer_id)).find((x) => x.assignment_id === b.assignment_id), 'Shift not found or not active');
    const state = stateOf(a.events);
    const allowed = { not_started: ['in'], on_shift: ['out', 'break_start'], on_break: ['break_end'], finished: [] }[state];
    if (!allowed.includes(b.kind)) fail(400, state === 'finished' ? 'You have already clocked out' : `You can't do that now (${state.replace('_', ' ')})`);
    // Clock-in waits for the venue pack; clock-out and breaks never do, so a change mid-shift interrupts nothing
    if (b.kind === 'in') {
      const st = await statusFor(user.officer_id, a.venue_id);
      if (!OK.has(st.status)) {
        // Record the refused attempt so Live can say why they are not on; managers hear once per shift
        try {
          const rec = await one(
            `INSERT INTO pack_blocks (assignment_id, officer_id, venue_id, pack_status) VALUES ($1,$2,$3,$4)
             ON CONFLICT (assignment_id) DO UPDATE SET last_at = now(), attempts = pack_blocks.attempts + 1, pack_status = EXCLUDED.pack_status
             RETURNING (xmax = 0) AS first`, [a.assignment_id, user.officer_id, a.venue_id, st.status]);
          if (rec?.first) {
            await audit(user, 'clock.pack_blocked', 'assignment', a.assignment_id, { venue_id: a.venue_id, pack_status: st.status });
            await notify(await managersFor(a.venue_id), {
              kind: 'pack_blocked', severity: 'warning', title: `${user.name} can't clock in – site pack not signed`,
              body: `${a.venue_name}, shift ${fmtTime(a.starts_at)}–${fmtTime(a.ends_at)}. They tried at ${fmtTime(new Date())}.`,
              link: '/company/live', dedupe: `pack_blocked:${a.assignment_id}`, ref: `asg:${a.assignment_id}`,
            });
          }
        } catch (e) { console.error('[pack_blocked]', e.message); }
        fail(423, `Read and sign the site pack for ${a.venue_name} before you clock in`, { code: 'venue_pack', venue_id: a.venue_id, pack_status: st.status, to_read: st.toRead.length });
      }
    }

    const s = await getSettings();
    const fence = insideFence({ lat: b.lat, lng: b.lng, accuracy: b.accuracy }, a, s.gps_tolerance_m);
    const problems = [];
    const flags = [];
    const rec = { qr_ok: null, device_ok: null, device_id: null, venue_code: null, tag_id: null, selfie_key: null, face_result: null, face_note: null, proof_rule: null };
    let proof = null;
    let officer = null;
    let tap = null;

    // Clock-in and clock-out need the registered phone. A phone that fails is recorded as an exception, never a hard stop.
    if (b.kind === 'in' || b.kind === 'out') {
      const ph = await checkPhone(user, b.passkey);
      Object.assign(rec, { device_ok: ph.device_ok, device_id: ph.device_id });
      if (ph.flag) { flags.push(ph.flag); problems.push(ph.problem); }
    }

    if (b.kind === 'in') {
      officer = await one('SELECT * FROM officers WHERE id = $1', [user.officer_id]);
      const c = compliance(officer);
      if (!c.ok) fail(403, `You can't clock in: ${c.issues.join(', ')}. Contact the office.`);
      if (tooEarly(a.starts_at)) fail(400, `Too early — clock-in opens ${EARLY_MIN} minutes before the shift (${fmtTime(new Date(new Date(a.starts_at) - EARLY_MIN * 60000))})`);
      const venue = await one('SELECT qr_version, proof_rule FROM venues WHERE id = $1', [a.venue_id]);
      const notes = [];
      // Venue code: the QR poster or a fresh tap on one of the venue's NFC tags
      const qr = b.qr ? parseQr(b.qr) : null;
      rec.qr_ok = !!qr && qr.venueId === a.venue_id && qr.version === venue.qr_version;
      if (b.qr && !rec.qr_ok) notes.push(qr && qr.venueId !== a.venue_id ? 'QR code is for a different venue' : 'QR code not valid');
      const t = await findTap(user, b.tap_id, a.venue_id);
      if (t.ok) tap = t.tap;
      else if (t.problem) notes.push(t.problem);
      rec.venue_code = rec.qr_ok ? 'qr' : tap ? 'nfc' : null;
      if (tap) rec.tag_id = tap.tag_id;
      // Selfie
      const sf = await checkSelfie(user, b.selfie_key);
      if (sf.ok) rec.selfie_key = b.selfie_key;
      else if (sf.problem) notes.push(sf.problem);
      // Location
      const geoNote = fence.distance == null ? 'Location unavailable' : !fence.ok ? `You are ${fence.distance}m from the venue (limit ${a.radius_m}m)` : null;
      if (geoNote) notes.push(geoNote);

      rec.proof_rule = venue.proof_rule;
      proof = evaluate({ rule: venue.proof_rule, geo_ok: fence.ok, venue_code_ok: !!rec.venue_code, selfie_ok: !!rec.selfie_key });
      if (!proof.met) {
        const label = { location: 'location', venue_code: 'venue code', selfie: 'selfie' };
        problems.push(...notes, `${proof.need === 3 ? 'All 3' : `${proof.need} of 3`} proofs needed (${proof.passed.map((x) => label[x]).join(', ') || 'none'} so far)`);
        if (!b.exception_reason) fail(422, problems.join(' · '), { problems, missing: proof.missing, proof, flags, can_request_exception: true });
        flags.push('rule_not_met');
      }
    }
    if (b.kind === 'out') {
      if (fence.distance == null) problems.push('Location unavailable');
      else if (!fence.ok) problems.push(`You are ${fence.distance}m from the venue (limit ${a.radius_m}m)`);
    }

    // The face check runs once the clock-in is going ahead: a doubtful result sends it to a manager, it never stops the officer
    if (rec.selfie_key) {
      Object.assign(rec, await scoreSelfie(officer, rec.selfie_key, s));
      if (rec.face_result === 'no_match' || rec.face_result === 'unsure') {
        flags.push('face_check');
        problems.push(rec.face_result === 'no_match' ? 'Selfie may not match the profile photo' : 'Selfie face check unsure');
      }
    }

    // Breaks never need checks. Clock-out problems are recorded but flagged.
    const status = problems.length ? 'exception' : 'ok';
    const evId = crypto.randomUUID();
    if (tap && !(await spendTap(tap.id, evId))) fail(409, 'That NFC tap was already used. Tap the tag again.');

    const ev = await one(
      `INSERT INTO clock_events (id, assignment_id, kind, lat, lng, accuracy, distance_m, qr_ok, geo_ok, status, exception_reason,
         device_ok, device_id, venue_code, tag_id, selfie_key, face_result, face_note, proof_rule, flags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [evId, a.assignment_id, b.kind, b.lat ?? null, b.lng ?? null, b.accuracy ?? null, fence.distance, rec.qr_ok ?? true, fence.ok, status,
        b.exception_reason || problems.join(' · ') || null,
        rec.device_ok, rec.device_id, rec.venue_code, rec.tag_id, rec.selfie_key, rec.face_result, rec.face_note, rec.proof_rule, flags]);
    if (a.assignment_status === 'assigned') await q("UPDATE shift_assignments SET status = 'accepted', responded_at = now() WHERE id = $1", [a.assignment_id]);

    if (status === 'exception') {
      await notify(await managersFor(a.venue_id), {
        kind: 'clock_exception', severity: 'warning', title: `Clock-${b.kind === 'in' ? 'in' : 'out'} exception`,
        body: `${user.name} at ${a.venue_name}: ${problems.join(' · ')}${b.exception_reason ? ` — "${b.exception_reason}"` : ''}`, link: '/security/exceptions', email: b.kind === 'in',
      });
    }
    if (b.kind === 'out') await buildTimesheet(a.assignment_id);
    const { selfie_key: _sk, face_note: _fn, face_result: _fr, ...shown } = ev;
    return { event: shown, state: stateOf([...a.events, ev]), problems, flags, proof };
  }),

  'clock.exceptions': def(MGR, async (b, { user }) => {
    const scope = await venueScope(user);
    const rows = await q(
      `SELECT ce.*, a.officer_id, s.venue_id, ${officerName('o')} AS officer_name, v.name AS venue_name, v.radius_m, s.starts_at, s.ends_at, ${userName('u')} AS decided_by_name, o.photo_key,
              (SELECT label FROM venue_tags vt WHERE vt.id = ce.tag_id) AS tag_label
         FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id
         JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id LEFT JOIN users u ON u.id = ce.decided_by
        WHERE ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) AND (CASE WHEN $2 THEN ce.status IN ('exception','approved','rejected') ELSE ce.status = 'exception' END)
        ORDER BY ce.ts DESC LIMIT 200`, [scope, !!b.include_decided]);
    const shaped = await Promise.all(rows.map(async ({ selfie_key, photo_key, ...r }) => ({
      ...r, has_selfie: !!selfie_key, selfie_url: await downloadUrl(selfie_key), profile_photo_url: await downloadUrl(photo_key),
    })));
    return markOwn(user, shaped);
  }),

  'clock.decide': def(MGR, async (b, { user }) => {
    required(b, 'id', 'approve');
    const ev = need(await one(
      `SELECT ce.*, s.venue_id, a.officer_id FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE ce.id = $1`, [b.id]));
    await assertVenue(user, ev.venue_id);
    const self = await guardSelf(user, ev.officer_id, { venueId: ev.venue_id });
    await q('UPDATE clock_events SET status = $2, decided_by = $3, decided_at = now(), self_approved = $4 WHERE id = $1', [b.id, b.approve ? 'approved' : 'rejected', user.id, !!self.selfApproved]);
    await buildTimesheet(ev.assignment_id);
    await audit(user, b.approve ? 'clock.approve' : 'clock.reject', 'clock_event', b.id, self.selfApproved ? { self_approved: true } : undefined);
    return { ok: true };
  }),

  // Supervisor sets the actual times by hand (always audited, reason required)
  'clock.manual': def(MGR, async (b, { user }) => {
    required(b, 'assignment_id', 'start', 'end', 'reason');
    if (new Date(b.end) <= new Date(b.start)) fail(400, 'End must be after start');
    const a = need(await one('SELECT a.*, s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.id = $1', [b.assignment_id]));
    await assertVenue(user, a.venue_id);
    const self = await guardSelf(user, a.officer_id, { venueId: a.venue_id });
    const ts = await one('SELECT * FROM timesheets WHERE assignment_id = $1', [a.id]);
    if (ts && (ts.statement_id || ts.invoice_id)) fail(400, 'This timesheet is already on a statement or invoice');
    await q("UPDATE clock_events SET status = 'rejected', decided_by = $2, decided_at = now() WHERE assignment_id = $1 AND status <> 'rejected'", [a.id, user.id]);
    await q("INSERT INTO clock_events (assignment_id, kind, ts, status, exception_reason, decided_by, self_approved) VALUES ($1,'in',$2,'manual',$4,$5,$6), ($1,'out',$3,'manual',$4,$5,$6)",
      [a.id, b.start, b.end, b.reason, user.id, !!self.selfApproved]);
    if (a.status !== 'accepted') await q("UPDATE shift_assignments SET status = 'accepted' WHERE id = $1", [a.id]);
    const t = await buildTimesheet(a.id, { force: true });
    if (b.break_minutes != null) await q('UPDATE timesheets SET break_minutes = $2 WHERE id = $1', [t.id, b.break_minutes]);
    if (b.break_minutes != null) {
      const s = await getSettings();
      await q('UPDATE timesheets SET hours = $2 WHERE id = $1', [t.id, roundHours(t.actual_start, t.actual_end, b.break_minutes, s.rounding_minutes)]);
    }
    if (self.selfApproved) await q('UPDATE timesheets SET self_approved = true WHERE id = $1', [t.id]);
    await audit(user, 'clock.manual', 'assignment', a.id, { start: b.start, end: b.end, reason: b.reason, ...(self.selfApproved ? { self_approved: true } : {}) });
    return { ok: true };
  }),

  // Live board for managers and venues: everyone due on site in the window
  'live.board': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    const s = await getSettings();
    const rows = await q(
      `SELECT a.id AS assignment_id, a.status AS assignment_status, s.id AS shift_id, s.starts_at, s.ends_at, s.role, r.name AS role_name, v.id AS venue_id, v.name AS venue_name,
              o.id AS officer_id, ${officerName('o')} AS officer_name, o.sia_number, o.phone, o.photo_key,
              COALESCE((SELECT json_agg(json_build_object('kind', kind, 'ts', ts, 'status', status, 'geo_ok', geo_ok, 'distance_m', distance_m, 'device_ok', device_ok,
                   'venue_code', venue_code, 'face_result', face_result, 'flags', flags, 'selfie_key', selfie_key, 'qr_ok', qr_ok, 'proof_rule', proof_rule, 'face_note', face_note) ORDER BY ts)
                 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.status <> 'rejected'), '[]') AS events,
              (SELECT json_build_object('first_at', first_at, 'last_at', last_at, 'attempts', attempts) FROM pack_blocks pb WHERE pb.assignment_id = a.id) AS pack_block
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id JOIN roles r ON r.code = s.role
        WHERE s.status = 'published' AND a.status IN ('assigned','accepted')
          AND s.starts_at < now() + interval '12 hours' AND s.ends_at > now() - interval '2 hours'
          AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) AND ($2::uuid IS NULL OR s.venue_id = $2)
        ORDER BY v.name, s.starts_at, officer_name`, [scope, b.venue_id || null]);
    const now = Date.now();
    const packs = await statusesFor(rows.map((r) => ({ officer_id: r.officer_id, venue_id: r.venue_id })));
    return Promise.all(rows.map(async (r) => {
      const st = stateOf(r.events);
      let state = st;
      if (st === 'not_started') {
        if (now > new Date(r.ends_at).getTime()) state = 'no_show';
        else if (now > new Date(r.starts_at).getTime() + s.grace_minutes * 60000) state = 'late';
        else state = 'upcoming';
      }
      if (st === 'finished' && new Date(r.ends_at) - new Date(r.events.at(-1).ts) > 15 * 60000) state = 'left_early';
      const clockedIn = r.events.find((e) => e.kind === 'in')?.ts || null;
      const pack = livePack(packs.get(pairKey(r.officer_id, r.venue_id))?.status);
      // Not on yet because the pack stopped their clock-in: say so rather than a bare late or no-show
      const blocked = !!r.pack_block && !clockedIn && ['upcoming', 'late', 'no_show'].includes(state);
      const out = { ...r, state, clocked_in: clockedIn, has_exception: r.events.some((e) => e.status === 'exception'), pack, blocked };
      const { photo_key, ...rest } = out;
      if (user.role === 'venue') { delete rest.phone; delete rest.events; delete rest.pack_block; delete rest.blocked; rest.pack = venuePack(pack); }
      // Selfies are for managers only
      const inEv = rest.events?.find((e) => e.kind === 'in' && e.selfie_key);
      if (rest.events) rest.events = rest.events.map(({ selfie_key, ...e }) => e);
      return { ...rest, ...(await photoUrls(photo_key)), selfie_url: inEv ? await downloadUrl(inEv.selfie_key) : null };
    }));
  }),
};
