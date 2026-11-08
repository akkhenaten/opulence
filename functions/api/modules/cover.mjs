// Cover requests: one-off or recurring (weekly / fortnightly), each date its own request.
// Venues and the company edit pending dates directly; changes to accepted dates wait for a manager.
import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { notify, managersFor, venueContacts, officerUser } from '../lib/notify.mjs';
import { fmtDate, fmtTime, fmtDateTime, londonDate, addDays } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { ensureThread, post } from '../lib/threads.mjs';
import { londonToUtc } from './rota.mjs';
import { afterShiftChange } from './shiftSync.mjs';
import { MGR, def } from './_def.mjs';
import { userName } from '../lib/names.mjs';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HORIZON_WEEKS = 8;
const MAX_PER_CALL = 62;
const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ISO weekday (Mon = 1 … Sun = 7) of a YYYY-MM-DD date
export const isoDow = (d) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const mondayOf = (d) => addDays(d, 1 - isoDow(d));
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

/** London date + HH:MM pair → UTC range; a finish at or before the start is the next morning. */
export function occRange(date, start, end) {
  const starts_at = londonToUtc(date, start);
  let ends_at = londonToUtc(date, end);
  if (ends_at <= starts_at) ends_at = londonToUtc(addDays(date, 1), end);
  return { starts_at, ends_at };
}

/** Pure: the dates a series falls on between from and to (inclusive). */
export function expandDates(series, from, to) {
  const start = series.start_date;
  const last = series.end_date && series.end_date < to ? series.end_date : to;
  const first = from > start ? from : start;
  const out = [];
  if (series.kind === 'one_off') {
    if (start >= first && start <= last) out.push({ date: start, ...series.days[0] });
    return out;
  }
  const base = mondayOf(start);
  for (let d = first; d <= last && out.length < MAX_PER_CALL; d = addDays(d, 1)) {
    if (series.frequency === 'fortnightly' && Math.floor(daysBetween(base, d) / 7) % 2) continue;
    for (const slot of series.days) if (slot.dow === isoDow(d)) out.push({ date: d, ...slot });
  }
  return out;
}

/** Validates and normalises what the form sent. One-off = a single date. */
export function cleanSeries(b, today) {
  const role = String(b.role || '');
  if (!role) fail(400, 'Choose a role');
  const kind = b.kind === 'recurring' ? 'recurring' : 'one_off';
  const frequency = b.frequency === 'fortnightly' ? 'fortnightly' : 'weekly';
  let days;
  let start_date;
  let end_date;
  if (kind === 'one_off') {
    if (!DATE.test(b.date || '')) fail(400, 'Choose a date');
    if (b.date < today) fail(400, 'The date must be today or later');
    days = [{ dow: isoDow(b.date), start: b.start, end: b.end, headcount: Number(b.headcount) }];
    start_date = b.date;
    end_date = b.date;
  } else {
    days = (Array.isArray(b.days) ? b.days : []).map((x) => ({ dow: Number(x.dow), start: x.start, end: x.end, headcount: Number(x.headcount) }));
    if (!days.length) fail(400, 'Pick at least one day of the week');
    if (new Set(days.map((x) => x.dow)).size !== days.length) fail(400, 'Each day can only appear once');
    start_date = DATE.test(b.start_date || '') ? b.start_date : today;
    if (start_date < today) fail(400, 'The first date must be today or later');
    end_date = b.end_date ? String(b.end_date) : null;
    if (end_date && (!DATE.test(end_date) || end_date < start_date)) fail(400, 'The end date must be after the first date');
  }
  for (const x of days) {
    if (!(x.dow >= 1 && x.dow <= 7)) fail(400, 'Unknown day of the week');
    if (!HHMM.test(x.start || '') || !HHMM.test(x.end || '')) fail(400, `Set a start and finish time${kind === 'recurring' ? ` for ${DOW[x.dow]}` : ''}`);
    if (x.start === x.end) fail(400, 'Start and finish cannot be the same time');
    if (!(x.headcount >= 1 && x.headcount <= 50)) fail(400, 'Number of staff must be 1–50');
  }
  days.sort((a, c) => a.dow - c.dow);
  return { role, kind, frequency, days, start_date, end_date, notes: String(b.notes || '').slice(0, 1000) };
}

export const describe = (s) => {
  if (s.kind === 'one_off') return `${fmtDate(s.start_date)} · ${s.days[0].start}–${s.days[0].end} · ${s.days[0].headcount} staff`;
  const days = s.days.map((x) => `${DOW[x.dow]} ${x.start}–${x.end}${x.headcount > 1 ? ` ×${x.headcount}` : ''}`).join(', ');
  return `${s.frequency === 'fortnightly' ? 'Every other week' : 'Every week'}: ${days}${s.end_date ? ` until ${fmtDate(s.end_date)}` : ''}`;
};

async function createShift(occ, series, userId, db) {
  return insert('shifts', {
    venue_id: occ.venue_id, role: occ.role, starts_at: occ.starts_at, ends_at: occ.ends_at, headcount: occ.headcount, cover_request_id: occ.id,
    status: 'published', open: !!series.open, notes: occ.notes || '', created_by: userId,
  }, db);
}

/** Adds the dates not yet created, up to the horizon. Accepted-all series get their shifts straight away. */
async function materialise(series, userId, db = { q, one }) {
  const today = londonDate(new Date());
  const horizon = addDays(today, HORIZON_WEEKS * 7);
  const from = series.expanded_to ? addDays(series.expanded_to, 1) : series.start_date;
  const dates = expandDates(series, from < today ? today : from, horizon);
  let made = 0;
  for (const d of dates) {
    const r = occRange(d.date, d.start, d.end);
    const occ = await db.one(
      `INSERT INTO cover_requests (venue_id, role, starts_at, ends_at, headcount, notes, requested_by, series_id, occurs_on, status, decided_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [series.venue_id, series.role, r.starts_at, r.ends_at, d.headcount, series.notes, series.requested_by, series.id, d.date,
        series.accepted_all ? 'accepted' : 'pending', series.accepted_all ? userId : null]);
    if (series.accepted_all) await createShift(occ, series, userId, db);
    made += 1;
  }
  const upto = series.end_date && series.end_date < horizon ? series.end_date : horizon;
  const reached = dates.length >= MAX_PER_CALL ? dates[dates.length - 1].date : upto;
  await db.q('UPDATE cover_series SET expanded_to = $2, updated_at = now() WHERE id = $1', [series.id, reached]);
  return made;
}

/** Hourly job: rolling series keep eight weeks of dates ahead. */
export async function extendSeries() {
  const rows = await q(
    `SELECT * FROM cover_series WHERE status = 'active' AND kind = 'recurring'
       AND (end_date IS NULL OR expanded_to IS NULL OR expanded_to < end_date)
       AND (expanded_to IS NULL OR expanded_to < (now() AT TIME ZONE 'Europe/London')::date + $1::int)`, [HORIZON_WEEKS * 7 - 7]);
  let made = 0;
  for (const s of rows) made += await materialise(s, s.requested_by);
  return made;
}

const coverThreadMembers = async (venueId) => [...(await venueContacts(venueId)), ...(await managersFor(venueId))];

// Edits that split a series keep the first series' conversation
async function coverThread(series, venueName) {
  return ensureThread('cover', series.root_id || series.id, await coverThreadMembers(series.venue_id), `${venueName} · cover request`);
}

async function notifyShiftOfficers(shiftId, title, body) {
  const rows = await q(
    `SELECT a.officer_id FROM shift_assignments a WHERE a.shift_id = $1 AND a.status IN ('assigned','accepted')`, [shiftId]);
  for (const a of rows) await notify(await officerUser(a.officer_id), { kind: 'shift', severity: 'warning', title, body, link: '/officer/shifts', email: true, tier: 'urgent' });
}

// Inside a transaction the tidy-up waits until it has committed, so it sees the change
const syncAfter = (db, args) => (db.later ? db.later.push(args) : afterShiftChange(args));

async function cancelOccurrence(occ, db = { q, one }) {
  await db.q("UPDATE cover_requests SET status = 'cancelled', change_status = 'none', change_payload = NULL WHERE id = $1", [occ.id]);
  const shifts = await db.q("UPDATE shifts SET status = 'cancelled' WHERE cover_request_id = $1 AND status <> 'cancelled' RETURNING id, starts_at", [occ.id]);
  for (const s of shifts) {
    const v = await one('SELECT name FROM venues WHERE id = $1', [occ.venue_id]);
    await notifyShiftOfficers(s.id, 'Shift cancelled', `${v.name} · ${fmtDateTime(s.starts_at)}. The venue no longer needs this shift.`);
    const team = await db.q("UPDATE shift_assignments SET status = 'cancelled' WHERE shift_id = $1 AND status IN ('assigned','accepted','requested') RETURNING id, officer_id, shift_id", [s.id]);
    await syncAfter(db, { removed: team.map((a) => ({ ...a, venue_name: v.name, starts_at: s.starts_at })), shiftIds: [s.id], gone: true });
  }
}

/** Moves an occurrence to new times / staff numbers; its shift follows and the team is told. */
async function retimeOccurrence(occ, slot, extra = {}, db = { q, one }) {
  const r = occRange(occ.occurs_on, slot.start, slot.end);
  const role = extra.role || occ.role;
  const notes = extra.notes ?? occ.notes;
  await db.q(
    `UPDATE cover_requests SET starts_at = $2, ends_at = $3, headcount = $4, role = $5, notes = $6, change_status = 'none', change_payload = NULL, change_scope = NULL,
       series_id = COALESCE($7, series_id) WHERE id = $1`,
    [occ.id, r.starts_at, r.ends_at, slot.headcount, role, notes, extra.series_id || null]);
  const shifts = await db.q(
    "UPDATE shifts SET starts_at = $2, ends_at = $3, headcount = $4, role = $5, notes = $6 WHERE cover_request_id = $1 AND status <> 'cancelled' RETURNING id",
    [occ.id, r.starts_at, r.ends_at, slot.headcount, role, notes]);
  const moved = String(new Date(occ.starts_at).getTime()) !== String(r.starts_at.getTime()) || String(new Date(occ.ends_at).getTime()) !== String(r.ends_at.getTime());
  const v = await one('SELECT name FROM venues WHERE id = $1', [occ.venue_id]);
  // What the team was told about the old times no longer holds; fewer places may leave cover cards with nothing to do
  const team = shifts.length ? await db.q("SELECT id, officer_id, shift_id FROM shift_assignments WHERE shift_id = ANY($1::uuid[]) AND status IN ('assigned','accepted')", [shifts.map((s) => s.id)]) : [];
  await syncAfter(db, { stale: moved ? team.map((a) => ({ ...a, venue_name: v.name, starts_at: occ.starts_at })) : [], shiftIds: shifts.map((s) => s.id), officerIds: team.map((a) => a.officer_id) });
  if (moved) {
    for (const s of shifts) await notifyShiftOfficers(s.id, 'Shift times changed', `${v.name} · now ${fmtDateTime(r.starts_at)} – ${fmtTime(r.ends_at)}`);
  }
}

/**
 * Applies "this and future dates" from the pivot date: the old series ends the day before,
 * a new series carries the new pattern, and dates on both sides are matched by day.
 */
async function applyFuture(pivot, def, userId) {
  const old = need(await one('SELECT * FROM cover_series WHERE id = $1', [pivot.series_id]));
  const from = pivot.occurs_on;
  const later = [];
  const fresh = await tx(async (t) => {
    t.later = later;
    const before = addDays(from, -1);
    await t.q(`UPDATE cover_series SET end_date = $2, expanded_to = LEAST(expanded_to, $2), status = CASE WHEN $2 < start_date THEN 'cancelled' ELSE status END, updated_at = now() WHERE id = $1`, [old.id, before]);
    const affected = await t.q("SELECT * FROM cover_requests WHERE series_id = $1 AND occurs_on >= $2 AND status IN ('pending','accepted') ORDER BY occurs_on", [old.id, from]);
    if (def === 'delete') {
      for (const o of affected) await cancelOccurrence(o, t);
      return null;
    }
    const anyAccepted = old.accepted_all || affected.some((o) => o.status === 'accepted');
    const s = await insert('cover_series', {
      venue_id: old.venue_id, role: def.role, kind: 'recurring', frequency: def.frequency, days: JSON.stringify(def.days), start_date: from, end_date: def.end_date,
      notes: def.notes, requested_by: old.requested_by, accepted_all: anyAccepted, open: old.open, root_id: old.root_id || old.id,
    }, t);
    s.days = def.days;
    const today = londonDate(new Date());
    const horizon = addDays(today, HORIZON_WEEKS * 7);
    const want = expandDates(s, from, horizon);
    const byDate = Object.fromEntries(affected.map((o) => [o.occurs_on, o]));
    for (const w of want) {
      const o = byDate[w.date];
      if (o) {
        await retimeOccurrence(o, w, { role: def.role, notes: def.notes, series_id: s.id }, t);
        delete byDate[w.date];
      } else {
        const r = occRange(w.date, w.start, w.end);
        const occ = await t.one(
          `INSERT INTO cover_requests (venue_id, role, starts_at, ends_at, headcount, notes, requested_by, series_id, occurs_on, status, decided_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [s.venue_id, s.role, r.starts_at, r.ends_at, w.headcount, s.notes, s.requested_by, s.id, w.date, anyAccepted ? 'accepted' : 'pending', anyAccepted ? userId : null]);
        if (anyAccepted) await createShift(occ, s, userId, t);
      }
    }
    for (const o of Object.values(byDate)) await cancelOccurrence(o, t);
    const reached = want.length >= MAX_PER_CALL ? want[want.length - 1].date : (s.end_date && s.end_date < horizon ? s.end_date : horizon);
    await t.q('UPDATE cover_series SET expanded_to = $2 WHERE id = $1', [s.id, reached]);
    return s;
  });
  for (const args of later) await afterShiftChange(args);
  return fresh;
}

async function loadOcc(user, id) {
  const occ = need(await one(
    `SELECT c.*, v.name AS venue_name, s.kind, s.frequency, s.days, s.start_date, s.end_date, s.accepted_all, s.root_id
       FROM cover_requests c JOIN venues v ON v.id = c.venue_id LEFT JOIN cover_series s ON s.id = c.series_id WHERE c.id = $1`, [id]), 'Request not found');
  await assertVenue(user, occ.venue_id);
  return occ;
}

const isMgr = (user) => MGR.includes(user.role);

/** Validates an edit to one date: new times and staff number. */
function cleanSlot(b) {
  const slot = { start: b.start, end: b.end, headcount: Number(b.headcount) };
  if (!HHMM.test(slot.start || '') || !HHMM.test(slot.end || '')) fail(400, 'Set a start and finish time');
  if (slot.start === slot.end) fail(400, 'Start and finish cannot be the same time');
  if (!(slot.headcount >= 1 && slot.headcount <= 50)) fail(400, 'Number of staff must be 1–50');
  return slot;
}

/** Carries out an edit or delete; returns a short description for messages. */
async function applyChange(occ, scope, payload, userId) {
  if (scope === 'one') {
    if (payload.type === 'delete') { await cancelOccurrence(occ); return `${fmtDate(occ.occurs_on)} cancelled`; }
    await retimeOccurrence(occ, payload.slot, { notes: payload.notes, role: payload.role });
    return `${fmtDate(occ.occurs_on)} changed to ${payload.slot.start}–${payload.slot.end}, ${payload.slot.headcount} staff`;
  }
  if (payload.type === 'delete') { await applyFuture(occ, 'delete', userId); return `${fmtDate(occ.occurs_on)} and all later dates cancelled`; }
  const s = await applyFuture(occ, payload.series, userId);
  return `From ${fmtDate(occ.occurs_on)}: ${describe(s)}`;
}

export const actions = {
  'cover.list': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    const rows = await q(
      `SELECT c.*, v.name AS venue_name, r.name AS role_name, ${userName('u')} AS requested_by_name, ${userName('cu')} AS change_by_name,
              s.kind, s.frequency, s.days, s.start_date, s.end_date, s.accepted_all, s.status AS series_status, COALESCE(s.root_id, s.id) AS root_id,
              (SELECT id FROM conversations x WHERE x.kind = 'cover' AND x.ref_id = COALESCE(s.root_id, c.series_id)) AS conversation_id,
              (SELECT count(*) FROM shifts sh WHERE sh.cover_request_id = c.id AND sh.status <> 'cancelled') AS shift_count,
              (SELECT count(*) FROM shift_assignments a JOIN shifts sh ON sh.id = a.shift_id
                 WHERE sh.cover_request_id = c.id AND sh.status <> 'cancelled' AND a.status IN ('assigned','accepted')) AS filled,
              (SELECT count(*)::int FROM shift_assignments a JOIN shifts sh ON sh.id = a.shift_id
                 WHERE sh.cover_request_id = c.id AND sh.status <> 'cancelled' AND a.status = 'accepted') AS confirmed
         FROM cover_requests c JOIN venues v ON v.id = c.venue_id JOIN roles r ON r.code = c.role LEFT JOIN users u ON u.id = c.requested_by
         LEFT JOIN users cu ON cu.id = c.change_by LEFT JOIN cover_series s ON s.id = c.series_id
        WHERE ($1::uuid[] IS NULL OR c.venue_id = ANY($1)) AND ($2::text IS NULL OR c.status = $2)
          AND ($3::uuid IS NULL OR c.venue_id = $3)
          AND (c.status IN ('pending','accepted') AND c.ends_at > now() - interval '1 day' OR c.created_at > now() - interval '30 days')
        ORDER BY c.change_status = 'pending' DESC, c.status = 'pending' DESC, c.starts_at LIMIT 400`, [scope, b.status || null, b.venue_id || null]);
    return rows.map((r) => ({ ...r, pattern: r.series_id ? describe(r) : null }));
  }),

  'cover.create': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'venue_id', 'role');
    await assertVenue(user, b.venue_id);
    const today = londonDate(new Date());
    const def_ = cleanSeries(b, today);
    need(await one('SELECT 1 FROM roles WHERE code = $1', [def_.role]), 'Unknown role');
    const series = await tx(async (t) => {
      const s = await insert('cover_series', { ...def_, days: JSON.stringify(def_.days), venue_id: b.venue_id, requested_by: user.id }, t);
      s.days = def_.days;
      const made = await materialise(s, user.id, t);
      if (!made) fail(400, 'Those days do not fall between the dates you chose');
      return s;
    });
    const v = await one('SELECT name FROM venues WHERE id = $1', [b.venue_id]);
    const conv = await coverThread(series, v.name);
    const text = describe(series);
    await post(conv.id, user.id, { body: `New cover request: ${text}${def_.notes ? `\n${def_.notes}` : ''}` });
    await notify((await managersFor(b.venue_id)).filter((id) => id !== user.id), {
      kind: 'cover', title: `New cover request · ${v.name}`, body: text, link: '/company/cover', email: true,
    });
    await audit(user, 'cover.create', 'cover_series', series.id, { kind: series.kind });
    return { series_id: series.id, conversation_id: conv.id };
  }),

  // Edit one date or this and future dates. Pending dates change at once; accepted ones need a manager unless a manager edits.
  'cover.update': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id', 'scope');
    const occ = await loadOcc(user, b.id);
    if (!['pending', 'accepted'].includes(occ.status)) fail(400, `This date is ${occ.status}`);
    if (new Date(occ.starts_at) < new Date()) fail(400, 'This date has already started');
    const scope = b.scope === 'future' && occ.kind === 'recurring' ? 'future' : 'one';
    let payload;
    if (b.delete) payload = { type: 'delete' };
    else if (scope === 'one') payload = { type: 'edit', slot: cleanSlot(b), notes: b.notes === undefined ? undefined : String(b.notes).slice(0, 1000) };
    else {
      const def_ = cleanSeries({ ...b, kind: 'recurring', role: b.role || occ.role, start_date: occ.occurs_on }, occ.occurs_on);
      payload = { type: 'edit', series: def_ };
    }
    const touchesAccepted = scope === 'one'
      ? occ.status === 'accepted'
      : !!(await one("SELECT 1 FROM cover_requests WHERE series_id = $1 AND occurs_on >= $2 AND status = 'accepted' LIMIT 1", [occ.series_id, occ.occurs_on]));
    const conv = occ.series_id ? await coverThread({ id: occ.series_id, root_id: occ.root_id, venue_id: occ.venue_id }, occ.venue_name) : null;
    if (touchesAccepted && !isMgr(user)) {
      await q("UPDATE cover_requests SET change_status = 'pending', change_scope = $2, change_payload = $3, change_by = $4, change_reason = '' WHERE id = $1",
        [occ.id, scope, JSON.stringify(payload), user.id]);
      const what = payload.type === 'delete' ? 'cancel' : 'change';
      const label = `${scope === 'future' ? `${fmtDate(occ.occurs_on)} and later dates` : fmtDate(occ.occurs_on)}`;
      if (conv) await post(conv.id, user.id, { body: `Asked to ${what} ${label}. Waiting for Orb to approve.` });
      await notify(await managersFor(occ.venue_id), {
        kind: 'cover', severity: 'warning', title: `${occ.venue_name} wants to ${what} booked cover`, body: label, link: '/company/cover', email: true,
      });
      await audit(user, 'cover.change_requested', 'cover_request', occ.id, { scope, type: payload.type });
      return { status: 'awaiting_approval' };
    }
    const done = await applyChange(occ, scope, payload, user.id);
    if (conv) await post(conv.id, user.id, { body: `Updated: ${done}.` });
    if (!isMgr(user)) await notify(await managersFor(occ.venue_id), { kind: 'cover', title: `${occ.venue_name} updated a cover request`, body: done, link: '/company/cover' });
    else if (touchesAccepted || occ.status === 'pending') await notify(await venueContacts(occ.venue_id), { kind: 'cover', title: 'Your cover request was updated', body: done, link: '/venue/rota?tab=requests' });
    await audit(user, 'cover.update', 'cover_request', occ.id, { scope, type: payload.type });
    return { status: 'done', summary: done };
  }),

  'cover.decideChange': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const occ = await loadOcc(user, b.id);
    if (occ.change_status !== 'pending') fail(409, 'No change is waiting for approval');
    const conv = occ.series_id ? await coverThread({ id: occ.series_id, root_id: occ.root_id, venue_id: occ.venue_id }, occ.venue_name) : null;
    if (!b.approve) {
      await q("UPDATE cover_requests SET change_status = 'declined', change_reason = $2 WHERE id = $1", [occ.id, String(b.reason || '').slice(0, 300)]);
      if (conv) await post(conv.id, user.id, { body: `We can't make that change${b.reason ? `: ${b.reason}` : ''}. The booking stays as it was.` });
      await notify(await venueContacts(occ.venue_id), { kind: 'cover', title: 'Change to booked cover declined', body: b.reason || 'The booking stays as it was.', link: '/venue/rota?tab=requests', email: true });
      await audit(user, 'cover.change_declined', 'cover_request', occ.id);
      return { ok: true };
    }
    const done = await applyChange(occ, occ.change_scope, occ.change_payload, user.id);
    if (conv) await post(conv.id, user.id, { body: `Approved: ${done}.` });
    await notify(await venueContacts(occ.venue_id), { kind: 'cover', title: 'Change to booked cover approved', body: done, link: '/venue/rota?tab=requests', email: true });
    await audit(user, 'cover.change_approved', 'cover_request', occ.id, { scope: occ.change_scope });
    return { ok: true, summary: done };
  }),

  // Kept for older screens: cancelling = deleting this one date
  'cover.cancel': def(['company', 'security', 'venue'], async (b, ctx) => actions['cover.update'].fn({ id: b.id, scope: b.scope || 'one', delete: true }, ctx)),

  // Accept one date, or every pending date in the series (future dates then arrive accepted)
  'cover.accept': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const occ = await loadOcc(user, b.id);
    const series = occ.series_id ? await one('SELECT * FROM cover_series WHERE id = $1', [occ.series_id]) : null;
    const all = b.scope === 'series' && series;
    const list = all
      ? await q("SELECT * FROM cover_requests WHERE series_id = $1 AND status = 'pending' AND starts_at > now() ORDER BY occurs_on", [series.id])
      : (occ.status === 'pending' ? [occ] : []);
    if (!list.length) fail(409, 'Nothing pending to accept');
    const shifts = await tx(async (t) => {
      if (all) await t.q('UPDATE cover_series SET accepted_all = true, open = $2 WHERE id = $1', [series.id, !!b.open]);
      const out = [];
      for (const c of list) {
        const ok = await t.one("UPDATE cover_requests SET status = 'accepted', decided_by = $2 WHERE id = $1 AND status = 'pending' RETURNING *", [c.id, user.id]);
        if (ok) out.push(await createShift(ok, { open: !!b.open }, user.id, t));
      }
      return out;
    });
    const conv = series ? await coverThread(series, occ.venue_name) : null;
    const text = all ? `Accepted all ${shifts.length} dates${series.kind === 'recurring' && !series.end_date ? ' — new dates will be booked automatically' : ''}` : `Accepted ${fmtDate(occ.occurs_on || occ.starts_at)}`;
    if (conv) await post(conv.id, user.id, { body: `${text}. We'll confirm the team nearer the time.` });
    await notify(await venueContacts(occ.venue_id), { kind: 'cover', title: 'Cover request accepted', body: text, link: '/venue/rota?tab=requests', email: true });
    await audit(user, 'cover.accept', 'cover_request', occ.id, { scope: all ? 'series' : 'one', count: shifts.length });
    return all ? { accepted: shifts.length, shift_ids: shifts.map((s) => s.id), starts_at: shifts[0]?.starts_at } : shifts[0];
  }),

  'cover.decline': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const occ = await loadOcc(user, b.id);
    const ids = b.scope === 'series' && occ.series_id
      ? (await q("SELECT id FROM cover_requests WHERE series_id = $1 AND status = 'pending'", [occ.series_id])).map((r) => r.id)
      : [occ.id];
    const done = await q("UPDATE cover_requests SET status = 'declined', decided_by = $2, decline_reason = $3 WHERE id = ANY($1::uuid[]) AND status = 'pending' RETURNING id", [ids, user.id, String(b.reason || '').slice(0, 300)]);
    if (!done.length) fail(409, 'Request not pending');
    if (b.scope === 'series' && occ.series_id) await q("UPDATE cover_series SET status = 'cancelled' WHERE id = $1", [occ.series_id]);
    const conv = occ.series_id ? await coverThread({ id: occ.series_id, root_id: occ.root_id, venue_id: occ.venue_id }, occ.venue_name) : null;
    if (conv) await post(conv.id, user.id, { body: `Sorry, we can't cover ${done.length > 1 ? `these ${done.length} dates` : 'this date'}${b.reason ? `: ${b.reason}` : '.'}` });
    await notify(await venueContacts(occ.venue_id), { kind: 'cover', title: 'Cover request declined', body: b.reason || 'Please contact us to discuss.', link: '/venue/rota?tab=requests', email: true });
    await audit(user, 'cover.decline', 'cover_request', occ.id, { count: done.length });
    return { ok: true };
  }),
};
