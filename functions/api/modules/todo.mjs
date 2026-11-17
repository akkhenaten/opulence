// The one to-do list (lib/todo.mjs): counted here for each role, listed row by row for the inline actions in
// Needs you and the bell. Each count matches the page its link opens, and an item shows in one place only.
import { one, q } from '../lib/db.mjs';
import { fail } from '../lib/http.mjs';
import { narrowScope, venueScope } from '../lib/scope.mjs';
import { londonDate } from '../lib/time.mjs';
import { signerRole } from '../lib/incidentSign.mjs';
import { officerName } from '../lib/names.mjs';
import { kindsFor, summarise } from '../lib/todo.mjs';
import { ALL, def } from './_def.mjs';
import { compliance } from './officers.mjs';
import { actions as ops } from './ops.mjs';

const safe = (p) => Promise.resolve().then(p).catch(() => null);
const n = async (sql, params) => (await one(sql, params)).n;
const scoped = (col) => `($1::uuid[] IS NULL OR ${col} = ANY($1))`;
const TS = 'timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id';

// Shared windows, so a count and the page behind it agree: requests still to come, unfilled in the next 7 days
export const SQL = {
  cover: `SELECT count(*)::int AS n FROM cover_requests WHERE status = 'pending' AND starts_at > now() AND ${scoped('venue_id')}`,
  coverChange: `SELECT count(*)::int AS n FROM cover_requests WHERE change_status = 'pending' AND status = 'accepted' AND ends_at > now() AND ${scoped('venue_id')}`,
  shiftRequests: `SELECT count(*)::int AS n FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
                   WHERE a.status = 'requested' AND s.status = 'published' AND s.starts_at > now() AND ${scoped('s.venue_id')}`,
  // A shift Orb already has a cover card for is counted by that card, not twice
  unfilled: `SELECT count(*)::int AS n FROM shifts s WHERE s.status = 'published' AND s.starts_at > now() AND s.starts_at < now() + interval '7 days' AND ${scoped('s.venue_id')}
               AND s.headcount > (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted'))
               AND NOT EXISTS (SELECT 1 FROM ops_items i WHERE i.kind = 'cover' AND i.status = 'pending' AND i.shift_id = s.id)`,
  exceptions: `SELECT count(*)::int AS n FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id
                WHERE ce.status = 'exception' AND ${scoped('s.venue_id')}`,
  toApprove: `SELECT count(*)::int AS n, min(s.starts_at) AS oldest FROM ${TS} WHERE t.status = 'pending' AND ${scoped('s.venue_id')}`,
  disputed: `SELECT count(*)::int AS n, min(s.starts_at) AS oldest FROM ${TS} WHERE t.status = 'disputed' AND ${scoped('s.venue_id')}`,
  phones: "SELECT count(*)::int AS n FROM officer_devices WHERE status = 'pending'",
  timeOff: "SELECT count(*)::int AS n FROM time_off WHERE status = 'pending'",
  streams: "SELECT count(*)::int AS n, (array_agg(venue_id ORDER BY created_at))[1] AS venue FROM venue_streams WHERE status = 'active' AND checked_at IS NULL",
};

/** Officers with an open Orb compliance card: the card covers them, so the plain rows leave them out. */
const carded = async () => new Set((await q("SELECT DISTINCT officer_id FROM ops_items WHERE kind = 'compliance' AND status = 'pending' AND officer_id IS NOT NULL")).map((r) => r.officer_id));

async function managerCounts(ctx) {
  const { user } = ctx;
  const scope = await venueScope(user);
  const p = [scope];
  const signer = signerRole(user.role);
  const week = (r) => (r?.oldest ? londonDate(new Date(r.oldest)) : null);
  const [cover, coverChange, shiftRequests, unfilled, exceptions, toApprove, disputed, toSign, open, phones, decisions] = await Promise.all([
    safe(() => n(SQL.cover, p)),
    safe(() => n(SQL.coverChange, p)),
    safe(() => n(SQL.shiftRequests, p)),
    safe(() => n(SQL.unfilled, p)),
    safe(() => n(SQL.exceptions, p)),
    safe(() => one(SQL.toApprove, p)),
    safe(() => one(SQL.disputed, p)),
    safe(() => n(`SELECT count(*)::int AS n FROM incidents WHERE sign_stage = $2 AND ${scoped('venue_id')}`, [scope, signer])),
    safe(() => n(`SELECT count(*)::int AS n FROM incidents WHERE status <> 'closed' AND sign_stage IS DISTINCT FROM $2 AND ${scoped('venue_id')}`, [scope, signer])),
    safe(() => n(SQL.phones)),
    safe(async () => (await ops['ops.count'].fn({}, ctx)).n),
  ]);
  const counts = {
    cover, coverChange, shiftRequests, unfilled, exceptions, phones, decisions,
    toApprove: toApprove?.n ?? null, disputed: disputed?.n ?? null, incidentsToSign: toSign, openIncidents: open,
  };
  const extra = { toApprove: { week: week(toApprove) }, disputed: { week: week(disputed) } };
  if (user.role === 'company') {
    const today = londonDate(new Date());
    const [people, timeOff, streams] = await Promise.all([
      safe(async () => {
        const [officers, cards] = await Promise.all([q("SELECT * FROM officers WHERE status = 'active'"), carded()]);
        const free = officers.filter((o) => !cards.has(o.id));
        const soon = (d) => d && d >= today && d <= addDaysIso(today, 60);
        return {
          cantWork: free.filter((o) => !compliance(o, today).ok).length,
          graceEnding: free.filter((o) => compliance(o, today).grace?.days_left <= 3).length,
          expiring: free.filter((o) => soon(iso(o.sia_expiry)) || soon(iso(o.rtw_expiry))).length,
        };
      }),
      safe(() => n(SQL.timeOff)),
      safe(() => one(SQL.streams)),
    ]);
    Object.assign(counts, { cantWork: people?.cantWork ?? null, graceEnding: people?.graceEnding ?? null, expiring: people?.expiring ?? null, timeOff, streams: streams?.n ?? null });
    extra.streams = { venue: streams?.venue };
  }
  return summarise(user.role, counts, extra);
}

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);
const addDaysIso = (d, k) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400000).toISOString().slice(0, 10);

async function venueCounts(b, ctx) {
  const scope = await narrowScope(ctx.user, b.venue_id);
  const [timesheets, invoices, reports] = await Promise.all([
    safe(() => n(`SELECT count(*)::int AS n FROM ${TS} WHERE t.status = 'approved' AND s.venue_id = ANY($1)`, [scope])),
    safe(() => n("SELECT count(*)::int AS n FROM invoices WHERE kind = 'invoice' AND venue_id = ANY($1) AND status IN ('issued','overdue')", [scope])),
    safe(() => n("SELECT count(*)::int AS n FROM incidents WHERE sign_stage = 'venue' AND venue_id = ANY($1)", [scope])),
  ]);
  return summarise('venue', { timesheets, invoices, reports });
}

async function officerCounts(ctx) {
  const { user } = ctx;
  if (!user.officer_id) return summarise('officer', { answer: 0, resign: 0 });
  const [answer, resign] = await Promise.all([
    safe(async () => {
      const [booked, offers] = await Promise.all([
        one(`SELECT count(*)::int AS n FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
              WHERE a.officer_id = $1 AND a.status = 'assigned' AND s.status = 'published' AND s.ends_at > now()`, [user.officer_id]),
        ops['ops.myOffers'].fn({}, ctx),
      ]);
      return booked.n + offers.offers.filter((o) => o.status === 'offered').length;
    }),
    safe(() => n("SELECT count(*)::int AS n FROM incidents WHERE sign_stage = 'officer' AND officer_id = $1", [user.officer_id])),
  ]);
  return summarise('officer', { answer, resign });
}

/** Everything waiting on this person: { items, byNav, failed }. */
export async function todoSummary(b, ctx) {
  const role = ctx.user.role;
  if (role === 'officer') return officerCounts(ctx);
  if (role === 'venue') return venueCounts(b, ctx);
  return managerCounts(ctx);
}

// Rows behind a count, with what the inline buttons need. Kept short: "See all" opens the full page.
const LISTS = {
  cover: (scope, limit) => q(
    `SELECT c.id, c.series_id, c.starts_at, c.ends_at, c.headcount, c.notes, v.name AS venue_name, r.name AS role_name
       FROM cover_requests c JOIN venues v ON v.id = c.venue_id JOIN roles r ON r.code = c.role
      WHERE c.status = 'pending' AND c.starts_at > now() AND ($1::uuid[] IS NULL OR c.venue_id = ANY($1)) ORDER BY c.starts_at LIMIT $2`, [scope, limit]),
  coverChange: (scope, limit) => q(
    `SELECT c.id, c.starts_at, c.ends_at, c.headcount, c.change_scope, c.change_payload, c.change_reason, v.name AS venue_name, r.name AS role_name
       FROM cover_requests c JOIN venues v ON v.id = c.venue_id JOIN roles r ON r.code = c.role
      WHERE c.change_status = 'pending' AND c.status = 'accepted' AND c.ends_at > now() AND ($1::uuid[] IS NULL OR c.venue_id = ANY($1)) ORDER BY c.starts_at LIMIT $2`, [scope, limit]),
  shiftRequests: (scope, limit) => q(
    `SELECT a.id, s.id AS shift_id, s.starts_at, s.ends_at, v.name AS venue_name, ${officerName('o')} AS officer_name
       FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
      WHERE a.status = 'requested' AND s.status = 'published' AND s.starts_at > now() AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) ORDER BY s.starts_at LIMIT $2`, [scope, limit]),
  unfilled: (scope, limit) => q(
    `SELECT s.id, s.starts_at, s.ends_at, s.headcount, v.name AS venue_name,
            (SELECT count(*)::int FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted')) AS filled
       FROM shifts s JOIN venues v ON v.id = s.venue_id
      WHERE s.status = 'published' AND s.starts_at > now() AND s.starts_at < now() + interval '7 days' AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1))
        AND s.headcount > (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted'))
        AND NOT EXISTS (SELECT 1 FROM ops_items i WHERE i.kind = 'cover' AND i.status = 'pending' AND i.shift_id = s.id)
      ORDER BY s.starts_at LIMIT $2`, [scope, limit]),
  exceptions: (scope, limit) => q(
    `SELECT ce.id, ce.kind, ce.ts, ce.exception_reason, s.id AS shift_id, v.name AS venue_name, ${officerName('o')} AS officer_name
       FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id
       JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
      WHERE ce.status = 'exception' AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) ORDER BY ce.ts DESC LIMIT $2`, [scope, limit]),
  toApprove: (scope, limit) => q(
    `SELECT t.id, t.hours, s.starts_at, s.ends_at, v.name AS venue_name, ${officerName('o')} AS officer_name
       FROM ${TS} JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
      WHERE t.status = 'pending' AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) ORDER BY s.starts_at LIMIT $2`, [scope, limit]),
  disputed: (scope, limit) => q(
    `SELECT t.id, t.hours, t.dispute_comment, s.starts_at, s.ends_at, v.name AS venue_name, ${officerName('o')} AS officer_name
       FROM ${TS} JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
      WHERE t.status = 'disputed' AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) ORDER BY s.starts_at LIMIT $2`, [scope, limit]),
  phones: (_scope, limit) => q(
    `SELECT d.id, d.label, d.created_at, ${officerName('o')} AS officer_name FROM officer_devices d JOIN officers o ON o.id = d.officer_id
      WHERE d.status = 'pending' ORDER BY d.created_at LIMIT $1`, [limit]),
  timeOff: (_scope, limit) => q(
    `SELECT t.id, t.kind, t.start_date, t.end_date, t.reason, ${officerName('o')} AS officer_name FROM time_off t JOIN officers o ON o.id = t.officer_id
      WHERE t.status = 'pending' ORDER BY t.start_date LIMIT $1`, [limit]),
  streams: (_scope, limit) => q(
    `SELECT st.id, st.name, st.po_ref, st.venue_id, v.name AS venue_name FROM venue_streams st JOIN venues v ON v.id = st.venue_id
      WHERE st.status = 'active' AND st.checked_at IS NULL ORDER BY st.created_at LIMIT $1`, [limit]),
  timesheets: (scope, limit) => q(
    `SELECT t.id, t.hours, s.starts_at, s.ends_at, v.name AS venue_name, ${officerName('o')} AS officer_name
       FROM ${TS} JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
      WHERE t.status = 'approved' AND s.venue_id = ANY($1) ORDER BY s.starts_at LIMIT $2`, [scope, limit]),
};

export const actions = {
  'todo.summary': def(ALL, (b, ctx) => todoSummary(b, ctx)),

  'todo.list': def(ALL, async (b, { user }) => {
    const kind = kindsFor(user.role).find((k) => k.key === b.key);
    if (!kind || !LISTS[b.key]) fail(400, 'Nothing to list for this');
    const scope = user.role === 'venue' ? await narrowScope(user, b.venue_id) : await venueScope(user);
    return LISTS[b.key](scope, Math.min(Number(b.limit) || 5, 20));
  }),
};
