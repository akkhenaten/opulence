import { one, q } from '../lib/db.mjs';
import { narrowScope, venueScope } from '../lib/scope.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { addDays, londonDate } from '../lib/time.mjs';
import { actions as clock } from './clock.mjs';
import { compliance } from './officers.mjs';
import { ALL, def } from './_def.mjs';
import { officerDisplay, officerName } from '../lib/names.mjs';
import { getSettings } from './settings.mjs';

const count = async (sql, params) => (await one(sql, params)).n;

// Who is on site right now, summarised from the live board
async function liveSummary(ctx) {
  return summarise(await clock['live.board'].fn({}, ctx));
}

function summarise(rows) {
  const by = (s) => rows.filter((r) => r.state === s).length;
  return {
    on_site: by('on_shift') + by('on_break'), late: by('late'), no_show: by('no_show'), upcoming: by('upcoming'),
    alerts: rows.filter((r) => ['late', 'no_show', 'left_early'].includes(r.state) || r.has_exception).slice(0, 8),
  };
}

async function upcomingShifts(scope, hours = 36) {
  return q(
    `SELECT s.id, s.starts_at, s.ends_at, s.headcount, v.name AS venue_name, r.name AS role_name,
            (SELECT count(*)::int FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted')) AS filled,
            (SELECT count(*)::int FROM shift_assignments a WHERE a.shift_id = s.id AND a.status = 'accepted') AS confirmed,
            COALESCE((SELECT json_agg(json_build_object('name', o.first_name || ' ' || left(o.last_name, 1) || '.', 'status', a.status) ORDER BY o.first_name)
               FROM shift_assignments a JOIN officers o ON o.id = a.officer_id
               WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted')), '[]') AS team
       FROM shifts s JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
      WHERE s.status = 'published' AND s.ends_at > now() AND s.starts_at < now() + make_interval(hours => $2)
        AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1))
      ORDER BY s.starts_at LIMIT 30`, [scope, hours]);
}

const recentIncidents = (scope) => q(
  `SELECT i.id, i.ref, i.type, i.severity, i.status, i.occurred_at, i.created_at, v.name AS venue_name FROM incidents i JOIN venues v ON v.id = i.venue_id
    WHERE ($1::uuid[] IS NULL OR i.venue_id = ANY($1)) ORDER BY i.created_at DESC LIMIT 6`, [scope]);

async function managerDash(ctx) {
  const { user } = ctx;
  const scope = await venueScope(user);
  const today = londonDate(new Date());
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const p = [scope];
  const scoped = (col) => `($1::uuid[] IS NULL OR ${col} = ANY($1))`;
  const [live, shifts, incidents, pendingCover, unfilled, exceptions, toApprove, disputed, openIncidents, requests, hoursWeek, shiftsWeek] = await Promise.all([
    liveSummary(ctx),
    upcomingShifts(scope),
    recentIncidents(scope),
    count(`SELECT count(*)::int AS n FROM cover_requests WHERE status = 'pending' AND ${scoped('venue_id')}`, p),
    count(`SELECT count(*)::int AS n FROM shifts s WHERE s.status = 'published' AND s.starts_at > now() AND s.starts_at < now() + interval '7 days' AND ${scoped('s.venue_id')}
             AND s.headcount > (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted'))`, p),
    count(`SELECT count(*)::int AS n FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id
            WHERE ce.status = 'exception' AND ce.ts > now() - interval '14 days' AND ${scoped('s.venue_id')}`, p),
    count(`SELECT count(*)::int AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE t.status = 'pending' AND ${scoped('s.venue_id')}`, p),
    count(`SELECT count(*)::int AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE t.status = 'disputed' AND ${scoped('s.venue_id')}`, p),
    count(`SELECT count(*)::int AS n FROM incidents WHERE status <> 'closed' AND ${scoped('venue_id')}`, p),
    count(`SELECT count(*)::int AS n FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.status = 'requested' AND s.starts_at > now() AND ${scoped('s.venue_id')}`, p),
    one(`SELECT COALESCE(sum(t.hours), 0) AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
          WHERE (s.starts_at AT TIME ZONE 'Europe/London')::date >= $2 AND t.status <> 'declined' AND ${scoped('s.venue_id')}`, [scope, weekStart]).then((r) => Number(r.n)),
    count(`SELECT count(*)::int AS n FROM shifts s WHERE s.status = 'published'
             AND (s.starts_at AT TIME ZONE 'Europe/London')::date BETWEEN $2::date AND $2::date + 6 AND ${scoped('s.venue_id')}`, [scope, weekStart]),
  ]);
  const out = { role: user.role, live, shifts, incidents, counts: { pendingCover, unfilled, exceptions, toApprove, disputed, openIncidents, requests, shiftsWeek }, hoursWeek };

  if (user.role === 'company') {
    const officers = await q("SELECT * FROM officers WHERE status IN ('active','onboarding','applicant')");
    const nonCompliant = officers.filter((o) => o.status === 'active' && !compliance(o, today).ok).map((o) => ({ id: o.id, name: officerDisplay(o), issues: compliance(o, today).issues }));
    const [expiring, timeOff, pipeline] = await Promise.all([
      q(`SELECT id, ${officerName('')} AS name, sia_expiry, rtw_expiry FROM officers WHERE status = 'active'
          AND ((sia_expiry BETWEEN $1 AND $1::date + 60) OR (rtw_expiry BETWEEN $1 AND $1::date + 60)) ORDER BY LEAST(sia_expiry, rtw_expiry) LIMIT 10`, [today]),
      count("SELECT count(*)::int AS n FROM time_off WHERE status = 'pending'"),
      q("SELECT status, count(*)::int AS n FROM officers GROUP BY status"),
    ]);
    // On a grace period (working while they send documents); ending within 3 days needs a decision soon
    const onGrace = officers.filter((o) => o.status === 'active' && compliance(o, today).grace);
    const graceEnding = onGrace.filter((o) => compliance(o, today).grace.days_left <= 3).length;
    Object.assign(out, { nonCompliant: nonCompliant.slice(0, 10), nonCompliantCount: nonCompliant.length, onGraceCount: onGrace.length, expiring, pipeline });
    out.counts.graceEnding = graceEnding;
    out.counts.timeOff = timeOff;
    // Billing streams a venue added: they bill once Opulence has checked the PO, recipient and rates
    out.counts.streamsToCheck = await count("SELECT count(*)::int AS n FROM venue_streams WHERE status = 'active' AND checked_at IS NULL");
    if (out.counts.streamsToCheck) out.streamCheckVenue = (await one("SELECT venue_id FROM venue_streams WHERE status = 'active' AND checked_at IS NULL ORDER BY created_at LIMIT 1"))?.venue_id || null;
    out.activeOfficers = officers.filter((o) => o.status === 'active').length;
  }
  if (canSeePay(user)) {
    const [outstanding, overdue, revenueMonth] = await Promise.all([
      one("SELECT COALESCE(sum(gross),0) AS n, count(*)::int AS c FROM invoices WHERE status IN ('issued','overdue') AND kind = 'invoice'"),
      one("SELECT COALESCE(sum(gross),0) AS n, count(*)::int AS c FROM invoices WHERE status = 'overdue' AND kind = 'invoice'"),
      one("SELECT COALESCE(sum(net),0) AS n FROM invoices WHERE status <> 'void' AND status <> 'draft' AND issue_date >= date_trunc('month', now())::date"),
    ]);
    out.money = { outstanding: Number(outstanding.n), outstandingCount: outstanding.c, overdue: Number(overdue.n), overdueCount: overdue.c, revenueMonth: Number(revenueMonth.n) };
  }
  return out;
}

// One tile per venue for managers with several: live counts from the board rows plus grouped counts
export function venueTiles(venues, rows, { next = [], toSign = [], cover = [], incidents = [] } = {}) {
  const at = (list, id) => list.find((x) => x.venue_id === id);
  return venues.map((v) => {
    const mine = rows.filter((r) => r.venue_id === v.id);
    const n = (...st) => mine.filter((r) => st.includes(r.state)).length;
    return {
      venue_id: v.id, on_site: n('on_shift', 'on_break'), late: n('late', 'no_show'),
      next_shift: at(next, v.id)?.starts_at || null, to_sign: at(toSign, v.id)?.n || 0, cover: at(cover, v.id)?.n || 0, incidents: at(incidents, v.id)?.n || 0,
    };
  });
}

async function venueDash(b, ctx) {
  const all = await venueScope(ctx.user);
  const scope = await narrowScope(ctx.user, b.venue_id);
  const many = all.length > 1;
  const [board, shifts, incidents, toSign, cover, invoices, venues] = await Promise.all([
    clock['live.board'].fn({}, ctx),
    upcomingShifts(scope, 48),
    recentIncidents(scope),
    count(`SELECT count(*)::int AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE t.status = 'approved' AND s.venue_id = ANY($1)`, [scope]),
    q("SELECT c.*, v.name AS venue_name, r.name AS role_name FROM cover_requests c JOIN venues v ON v.id = c.venue_id JOIN roles r ON r.code = c.role WHERE c.venue_id = ANY($1) AND c.ends_at > now() AND c.status <> 'cancelled' ORDER BY c.starts_at LIMIT 8", [scope]),
    // Invoices only: credit notes are issued too, but they are not something to pay
    one(`SELECT COALESCE(sum(gross) FILTER (WHERE kind = 'invoice'),0) AS n, (count(*) FILTER (WHERE kind = 'invoice'))::int AS c,
      (count(*) FILTER (WHERE kind = 'credit'))::int AS credits FROM invoices WHERE venue_id = ANY($1) AND status IN ('issued','overdue')`, [scope]),
    q('SELECT id, name, address, postcode, logo_url FROM venues WHERE id = ANY($1) ORDER BY name', [all]),
  ]);
  const live = summarise(board.filter((r) => scope.includes(r.venue_id)));
  let tiles = null;
  if (many) {
    const [next, signs, covers, incs] = await Promise.all([
      q(`SELECT DISTINCT ON (venue_id) venue_id, starts_at FROM shifts WHERE venue_id = ANY($1) AND status = 'published' AND starts_at > now() ORDER BY venue_id, starts_at`, [all]),
      q(`SELECT s.venue_id, count(*)::int AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE t.status = 'approved' AND s.venue_id = ANY($1) GROUP BY 1`, [all]),
      q(`SELECT venue_id, count(*)::int AS n FROM cover_requests WHERE venue_id = ANY($1) AND status = 'pending' AND ends_at > now() GROUP BY 1`, [all]),
      q(`SELECT venue_id, count(*)::int AS n FROM incidents WHERE venue_id = ANY($1) AND created_at > now() - interval '7 days' GROUP BY 1`, [all]),
    ]);
    tiles = venueTiles(venues, board, { next, toSign: signs, cover: covers, incidents: incs });
  }
  return { role: 'venue', venue_id: b.venue_id || null, venues, tiles, live, shifts, incidents, cover, counts: { toSign }, invoices: { outstanding: Number(invoices.n), count: invoices.c, credits: invoices.credits } };
}

async function officerDash({ user }) {
  const oid = user.officer_id;
  if (!oid) return { role: 'officer', linked: false };
  const today = londonDate(new Date());
  const [officer, next, openCount, hoursWeek, lastStatement, incidents, docs] = await Promise.all([
    one('SELECT * FROM officers WHERE id = $1', [oid]),
    q(`SELECT a.id AS assignment_id, a.status AS assignment_status, a.is_lead, s.id AS shift_id, s.starts_at, s.ends_at, s.venue_id, v.name AS venue_name, v.address, v.postcode, r.name AS role_name
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
        WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.status = 'published' AND s.ends_at > now() ORDER BY s.starts_at LIMIT 8`, [oid]),
    count(`SELECT count(*)::int AS n FROM shifts s WHERE s.status = 'published' AND s.open AND s.starts_at > now()
             AND s.headcount > (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted'))
             AND NOT EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = s.id AND a.officer_id = $1)`, [oid]),
    one(`SELECT COALESCE(sum(t.hours),0) AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
          WHERE a.officer_id = $1 AND s.starts_at > now() - interval '7 days' AND t.status <> 'declined'`, [oid]).then((r) => Number(r.n)),
    one("SELECT id, number, total, period_start, period_end, status, issued_at FROM statements WHERE officer_id = $1 AND status <> 'draft' ORDER BY period_end DESC LIMIT 1", [oid]),
    count("SELECT count(*)::int AS n FROM incidents WHERE officer_id = $1 AND status = 'changes_requested'", [oid]),
    q(`SELECT kind, title, expiry FROM documents WHERE owner_type = 'officer' AND owner_id = $1 AND expiry IS NOT NULL AND expiry < $2::date + 60 ORDER BY expiry`, [oid, today]),
  ]);
  return {
    role: 'officer', linked: true, officer: { id: officer.id, first_name: officer.first_name, status: officer.status, sia_expiry: officer.sia_expiry },
    issues: compliance(officer, today).issues, graced: compliance(officer, today).graced, grace: compliance(officer, today).grace, next, openCount, hoursWeek, lastStatement, incidentsToFix: incidents, expiringDocs: docs,
    office_phone: (await getSettings())?.company_phone || null,
  };
}

export const actions = {
  'dashboard.get': def(ALL, async (b, ctx) => {
    if (ctx.user.role === 'officer') return officerDash(ctx);
    if (ctx.user.role === 'venue') return venueDash(b, ctx);
    return managerDash(ctx);
  }),
};
