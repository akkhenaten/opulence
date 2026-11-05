import { one, q } from '../lib/db.mjs';
import { venueScope } from '../lib/scope.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { addDays, londonDate } from '../lib/time.mjs';
import { actions as clock } from './clock.mjs';
import { compliance } from './officers.mjs';
import { ALL, def } from './_def.mjs';

const count = async (sql, params) => (await one(sql, params)).n;

// Who is on site right now, summarised from the live board
async function liveSummary(ctx) {
  const rows = await clock['live.board'].fn({}, ctx);
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
  const [live, shifts, incidents, pendingCover, unfilled, exceptions, toApprove, disputed, openIncidents, requests, hoursWeek] = await Promise.all([
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
          WHERE (s.starts_at AT TIME ZONE 'Europe/London')::date >= $2 AND ${scoped('s.venue_id')}`, [scope, weekStart]).then((r) => Number(r.n)),
  ]);
  const out = { role: user.role, live, shifts, incidents, counts: { pendingCover, unfilled, exceptions, toApprove, disputed, openIncidents, requests }, hoursWeek };

  if (user.role === 'company') {
    const officers = await q("SELECT * FROM officers WHERE status IN ('active','onboarding','applicant')");
    const nonCompliant = officers.filter((o) => o.status === 'active' && !compliance(o, today).ok).map((o) => ({ id: o.id, name: `${o.first_name} ${o.last_name}`, issues: compliance(o, today).issues }));
    const [expiring, timeOff, pipeline] = await Promise.all([
      q(`SELECT id, first_name || ' ' || last_name AS name, sia_expiry, rtw_expiry FROM officers WHERE status = 'active'
          AND ((sia_expiry BETWEEN $1 AND $1::date + 60) OR (rtw_expiry BETWEEN $1 AND $1::date + 60)) ORDER BY LEAST(sia_expiry, rtw_expiry) LIMIT 10`, [today]),
      count("SELECT count(*)::int AS n FROM time_off WHERE status = 'pending'"),
      q("SELECT status, count(*)::int AS n FROM officers GROUP BY status"),
    ]);
    Object.assign(out, { nonCompliant: nonCompliant.slice(0, 10), nonCompliantCount: nonCompliant.length, expiring, pipeline });
    out.counts.timeOff = timeOff;
    out.activeOfficers = officers.filter((o) => o.status === 'active').length;
  }
  if (canSeePay(user)) {
    const [outstanding, overdue, revenueMonth] = await Promise.all([
      one("SELECT COALESCE(sum(gross),0) AS n, count(*)::int AS c FROM invoices WHERE status IN ('issued','overdue') AND kind = 'invoice'"),
      one("SELECT COALESCE(sum(gross),0) AS n, count(*)::int AS c FROM invoices WHERE status = 'overdue'"),
      one("SELECT COALESCE(sum(net),0) AS n FROM invoices WHERE status <> 'void' AND status <> 'draft' AND issue_date >= date_trunc('month', now())::date"),
    ]);
    out.money = { outstanding: Number(outstanding.n), outstandingCount: outstanding.c, overdue: Number(overdue.n), overdueCount: overdue.c, revenueMonth: Number(revenueMonth.n) };
  }
  return out;
}

async function venueDash(ctx) {
  const scope = await venueScope(ctx.user);
  const [live, shifts, incidents, toSign, cover, invoices, venues] = await Promise.all([
    liveSummary(ctx),
    upcomingShifts(scope, 48),
    recentIncidents(scope),
    count(`SELECT count(*)::int AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE t.status = 'approved' AND s.venue_id = ANY($1)`, [scope]),
    q("SELECT c.*, v.name AS venue_name, r.name AS role_name FROM cover_requests c JOIN venues v ON v.id = c.venue_id JOIN roles r ON r.code = c.role WHERE c.venue_id = ANY($1) AND c.ends_at > now() AND c.status <> 'cancelled' ORDER BY c.starts_at LIMIT 8", [scope]),
    one("SELECT COALESCE(sum(gross),0) AS n, count(*)::int AS c FROM invoices WHERE venue_id = ANY($1) AND status IN ('issued','overdue')", [scope]),
    q('SELECT id, name, address, postcode FROM venues WHERE id = ANY($1) ORDER BY name', [scope]),
  ]);
  return { role: 'venue', venues, live, shifts, incidents, cover, counts: { toSign }, invoices: { outstanding: Number(invoices.n), count: invoices.c } };
}

async function officerDash({ user }) {
  const oid = user.officer_id;
  if (!oid) return { role: 'officer', linked: false };
  const today = londonDate(new Date());
  const [officer, next, openCount, hoursWeek, lastStatement, incidents, docs] = await Promise.all([
    one('SELECT * FROM officers WHERE id = $1', [oid]),
    q(`SELECT a.id AS assignment_id, a.status AS assignment_status, a.is_lead, s.id AS shift_id, s.starts_at, s.ends_at, v.name AS venue_name, v.address, v.postcode, r.name AS role_name
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
        WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.status = 'published' AND s.ends_at > now() ORDER BY s.starts_at LIMIT 5`, [oid]),
    count(`SELECT count(*)::int AS n FROM shifts s WHERE s.status = 'published' AND s.open AND s.starts_at > now()
             AND s.headcount > (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted'))
             AND NOT EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = s.id AND a.officer_id = $1)`, [oid]),
    one(`SELECT COALESCE(sum(t.hours),0) AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
          WHERE a.officer_id = $1 AND s.starts_at > now() - interval '7 days'`, [oid]).then((r) => Number(r.n)),
    one("SELECT id, number, total, period_start, period_end, status FROM statements WHERE officer_id = $1 AND status <> 'draft' ORDER BY period_end DESC LIMIT 1", [oid]),
    count("SELECT count(*)::int AS n FROM incidents WHERE officer_id = $1 AND status = 'changes_requested'", [oid]),
    q(`SELECT kind, title, expiry FROM documents WHERE owner_type = 'officer' AND owner_id = $1 AND expiry IS NOT NULL AND expiry < $2::date + 60 ORDER BY expiry`, [oid, today]),
  ]);
  return {
    role: 'officer', linked: true, officer: { id: officer.id, first_name: officer.first_name, status: officer.status, sia_expiry: officer.sia_expiry },
    issues: compliance(officer, today).issues, next, openCount, hoursWeek, lastStatement, incidentsToFix: incidents, expiringDocs: docs,
  };
}

export const actions = {
  'dashboard.get': def(ALL, async (_b, ctx) => {
    if (ctx.user.role === 'officer') return officerDash(ctx);
    if (ctx.user.role === 'venue') return venueDash(ctx);
    return managerDash(ctx);
  }),
};
