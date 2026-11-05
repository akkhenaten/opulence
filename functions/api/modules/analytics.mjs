// Analytics (switchable module): lateness and absence, incidents, satisfaction, customers and staffing.
// The office sees every venue it covers; a venue sees its own, with officers as "First L.".
import { q as query } from '../lib/db.mjs';
import { fail } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { requireModule } from '../lib/modules.mjs';
import { def } from './_def.mjs';
import { officerName, officerShort } from '../lib/names.mjs';
import { prevRange, checkRange, pctChange, per1000, weekdayBuckets, hourBuckets, avg1 } from '../lib/analytics.mjs';

const ACTIVE = "('assigned','accepted')";
const LONDON = (col) => `(${col} AT TIME ZONE 'Europe/London')`;
const CLOCKED = "EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual'))";
// $1 venue scope (null = all), $2 from, $3 to, $4 venue, $5 officer
const VENUE = (col) => `($1::uuid[] IS NULL OR ${col} = ANY($1)) AND ($4::uuid IS NULL OR ${col} = $4)`;
const IN_RANGE = (col) => `${LONDON(col)}::date BETWEEN $2::date AND $3::date`;
const SHIFTS = `s.status = 'published' AND ${VENUE('s.venue_id')} AND ${IN_RANGE('s.starts_at')}`;
const OFFICER = (col) => `($5::uuid IS NULL OR ${col} = $5)`;
const MONTH = (col) => `to_char(date_trunc('month', ${LONDON(col)}), 'YYYY-MM')`;
const monthLabel = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const bars = (rows, label = 'label') => rows.map((r) => ({ label: r[label], value: Number(r.n) || 0 }));

// Every query shares the same five parameters; pass only up to the highest one it uses
const q = (sql, p) => query(sql, p.slice(0, Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))));

const TYPE_LABEL = (t) => (t || 'other').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

async function attendance(p, name) {
  const base = `FROM attendance_events e JOIN shift_assignments a ON a.id = e.assignment_id JOIN shifts s ON s.id = a.shift_id
                JOIN officers o ON o.id = e.officer_id JOIN venues v ON v.id = s.venue_id WHERE ${SHIFTS} AND ${OFFICER('e.officer_id')}`;
  const [kinds, worked, cover, byVenue, byOfficer, byDay] = await Promise.all([
    q(`SELECT e.kind, count(*)::int AS n, count(*) FILTER (WHERE e.excused)::int AS excused, sum(e.minutes) FILTER (WHERE e.kind = 'late')::int AS late_min ${base} GROUP BY e.kind`, p),
    q(`SELECT count(*)::int AS n FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE ${SHIFTS} AND ${OFFICER('a.officer_id')} AND s.starts_at < now()
          AND (a.status IN ${ACTIVE} OR EXISTS (SELECT 1 FROM attendance_events e WHERE e.assignment_id = a.id AND e.kind = 'cant_make_it'))`, p),
    q(`SELECT count(*)::int AS n FROM ops_items i JOIN shifts s ON s.id = i.shift_id WHERE i.kind = 'cover' AND ${SHIFTS} AND ${OFFICER('i.officer_id')}`, p),
    q(`SELECT v.name AS label, count(*)::int AS n ${base} GROUP BY v.name ORDER BY 2 DESC LIMIT 12`, p),
    q(`SELECT ${name} AS label, count(*)::int AS n, count(*) FILTER (WHERE e.kind = 'late')::int AS late, count(*) FILTER (WHERE e.kind IN ('no_show','cant_make_it'))::int AS absent
        ${base} GROUP BY o.id ORDER BY 2 DESC LIMIT 10`, p),
    q(`SELECT extract(isodow FROM ${LONDON('s.starts_at')})::int AS dow, count(*)::int AS n ${base} GROUP BY 1`, p),
  ]);
  const k = Object.fromEntries(kinds.map((r) => [r.kind, r]));
  const n = (x) => k[x]?.n || 0;
  const bad = n('late') + n('no_show') + n('cant_make_it');
  return {
    shifts: worked[0].n, late: n('late'), no_show: n('no_show'), left_early: n('left_early'), cant_make_it: n('cant_make_it'),
    excused: kinds.reduce((s, r) => s + r.excused, 0), avg_late: avg1(k.late?.late_min, n('late')), cover: cover[0].n,
    on_time_pct: worked[0].n ? Math.max(0, Math.round(((worked[0].n - bad) / worked[0].n) * 100)) : null,
    by_venue: bars(byVenue),
    by_officer: byOfficer.map((r) => ({ label: r.label, value: r.n, sub: [r.late && `${r.late} late`, r.absent && `${r.absent} absent`].filter(Boolean).join(' · ') })),
    by_weekday: weekdayBuckets(byDay),
  };
}

async function incidents(p) {
  const base = `FROM incidents i JOIN venues v ON v.id = i.venue_id WHERE ${VENUE('i.venue_id')} AND ${IN_RANGE('i.occurred_at')} AND ${OFFICER('i.officer_id')}`;
  const [totals, byType, bySeverity, byHour, byMonth, byVenue, bans, counted] = await Promise.all([
    q(`SELECT count(*)::int AS n, count(*) FILTER (WHERE i.severity IN ('high','critical'))::int AS high ${base}`, p),
    q(`SELECT i.type AS label, count(*)::int AS n ${base} GROUP BY 1 ORDER BY 2 DESC`, p),
    q(`SELECT i.severity AS label, count(*)::int AS n ${base} GROUP BY 1`, p),
    q(`SELECT extract(hour FROM ${LONDON('i.occurred_at')})::int AS hour, count(*)::int AS n ${base} GROUP BY 1`, p),
    q(`SELECT ${MONTH('i.occurred_at')} AS label, count(*)::int AS n ${base} GROUP BY 1 ORDER BY 1`, p),
    q(`SELECT v.name AS label, count(*)::int AS n ${base} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, p),
    q(`SELECT count(*)::int AS n FROM customer_bans b WHERE ${VENUE('b.venue_id')} AND ${IN_RANGE('b.created_at')} AND b.status NOT IN ('rejected')`, p),
    // Rate per 1,000 only over nights with a customer count
    q(`WITH c AS (SELECT s.id, l.customers FROM shifts s JOIN shift_logs l ON l.shift_id = s.id WHERE ${SHIFTS} AND l.customers IS NOT NULL)
       SELECT COALESCE((SELECT sum(customers) FROM c), 0)::int AS customers,
              (SELECT count(*) FROM incidents i WHERE i.shift_id IN (SELECT id FROM c) AND ${OFFICER('i.officer_id')})::int AS n`, p),
  ]);
  const sev = Object.fromEntries(bySeverity.map((r) => [r.label, r.n]));
  return {
    total: totals[0].n, high: totals[0].high, bans: bans[0].n, per_1000: per1000(counted[0].n, counted[0].customers),
    by_type: byType.map((r) => ({ label: TYPE_LABEL(r.label), value: r.n })),
    by_severity: ['low', 'medium', 'high', 'critical'].map((s) => ({ label: TYPE_LABEL(s), value: sev[s] || 0 })),
    by_hour: hourBuckets(byHour), by_month: byMonth.map((r) => ({ label: monthLabel(r.label), value: r.n })), by_venue: bars(byVenue),
  };
}

// Every star rating: Orb's post-shift ask, "Rate staff" and "Give feedback" (counted once when it also rated the officer)
const RATINGS = `(
  SELECT f.venue_id, f.officer_id, f.rating, f.answered_at AS at FROM venue_feedback f WHERE f.rating IS NOT NULL AND f.answered_at IS NOT NULL
  UNION ALL
  SELECT c.venue_id, c.officer_id, c.rating, c.created_at FROM venue_comments c WHERE c.rating IS NOT NULL AND c.feedback_id IS NULL)`;

async function satisfaction(p, name) {
  const base = `FROM ${RATINGS} r WHERE ${VENUE('r.venue_id')} AND ${IN_RANGE('r.at')} AND ${OFFICER('r.officer_id')}`;
  const cbase = `FROM venue_comments c WHERE ${VENUE('c.venue_id')} AND ${OFFICER('c.officer_id')}`;
  const [totals, byMonth, tones, open, officers] = await Promise.all([
    q(`SELECT count(*)::int AS n, sum(r.rating)::int AS total ${base}`, p),
    q(`SELECT ${MONTH('r.at')} AS label, round(avg(r.rating), 1)::float AS n ${base} GROUP BY 1 ORDER BY 1`, p),
    q(`SELECT c.tone, count(*)::int AS n ${cbase} AND ${IN_RANGE('c.created_at')} GROUP BY 1`, p),
    q(`SELECT count(*)::int AS n ${cbase} AND c.tone = 'complaint' AND c.status = 'open' AND $2::date <= $3::date`, p),
    q(`SELECT ${name} AS name, v.name AS venue_name, round(avg(r.rating), 1)::float AS avg, count(*)::int AS n
         FROM ${RATINGS} r JOIN officers o ON o.id = r.officer_id JOIN venues v ON v.id = r.venue_id
        WHERE r.officer_id IS NOT NULL AND ${VENUE('r.venue_id')} AND ${IN_RANGE('r.at')} AND ${OFFICER('r.officer_id')}
        GROUP BY o.id, v.id ORDER BY 3 DESC, 4 DESC`, p),
  ]);
  const t = Object.fromEntries(tones.map((r) => [r.tone, r.n]));
  const row = (r) => ({ label: r.name, value: r.avg, sub: `${r.venue_name} · ${r.n} rating${r.n === 1 ? '' : 's'}` });
  return {
    avg: avg1(totals[0].total, totals[0].n), ratings: totals[0].n, praise: t.praise || 0, suggestion: t.suggestion || 0, complaint: t.complaint || 0,
    open_complaints: open[0].n,
    by_month: byMonth.map((r) => ({ label: monthLabel(r.label), value: r.n })),
    top: officers.slice(0, 5).map(row),
    bottom: officers.length > 5 ? officers.slice(-5).reverse().map(row) : [],
  };
}

async function customers(p) {
  const [nights, staff, hours] = await Promise.all([
    q(`SELECT to_char(${LONDON('s.starts_at')}::date, 'YYYY-MM-DD') AS day, extract(isodow FROM ${LONDON('s.starts_at')})::int AS dow, sum(l.customers)::int AS n
         FROM shifts s JOIN shift_logs l ON l.shift_id = s.id WHERE ${SHIFTS} AND l.customers IS NOT NULL GROUP BY s.venue_id, 1, 2 ORDER BY 1`, p),
    q(`SELECT COALESCE(sum(s.headcount), 0)::int AS needed,
              COALESCE(sum((SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ${ACTIVE})), 0)::int AS filled,
              COALESCE(sum(l.customers), 0)::int AS counted,
              COALESCE(sum((SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ${ACTIVE} AND ${CLOCKED})) FILTER (WHERE l.customers IS NOT NULL), 0)::int AS on_duty
         FROM shifts s LEFT JOIN shift_logs l ON l.shift_id = s.id WHERE ${SHIFTS}`, p),
    q(`SELECT COALESCE(sum(t.hours), 0)::float AS h FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
        WHERE ${SHIFTS} AND ${OFFICER('a.officer_id')}`, p),
  ]);
  const total = nights.reduce((s, r) => s + r.n, 0);
  const byDay = new Map();
  for (const r of nights) byDay.set(r.day, (byDay.get(r.day) || 0) + r.n);
  const dow = {};
  for (const r of nights) (dow[r.dow] ||= []).push(r.n);
  const s = staff[0];
  return {
    total, nights: nights.length, avg_per_night: nights.length ? Math.round(total / nights.length) : null,
    per_officer: s.on_duty ? Math.round(s.counted / s.on_duty) : null, hours: Math.round(hours[0].h * 10) / 10, needed: s.needed, filled: s.filled,
    fill_pct: s.needed ? Math.min(100, Math.round((s.filled / s.needed) * 100)) : null,
    by_night: [...byDay].map(([d, n]) => ({ label: dayLabel(d), value: n })),
    by_weekday: weekdayBuckets(Object.entries(dow).map(([d, xs]) => ({ dow: d, n: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) }))),
    busiest: [...byDay].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, n]) => ({ label: dayLabel(d), value: n })),
  };
}

async function summary(p, name) {
  const [a, i, s, c] = await Promise.all([attendance(p, name), incidents(p), satisfaction(p, name), customers(p)]);
  return { attendance: a, incidents: i, satisfaction: s, customers: c };
}

const HEAD = {
  attendance: ['late', 'no_show', 'left_early', 'cant_make_it', 'avg_late', 'on_time_pct', 'cover', 'shifts'],
  incidents: ['total', 'high', 'bans', 'per_1000'],
  satisfaction: ['avg', 'ratings', 'praise', 'suggestion', 'complaint'],
  customers: ['total', 'avg_per_night', 'per_officer', 'hours', 'fill_pct'],
};

/** Headline figures of the earlier period and the % change, beside each section. */
export function withChange(cur, prev) {
  const out = {};
  for (const [sec, keys] of Object.entries(HEAD)) {
    out[sec] = { ...cur[sec], prev: {}, change: {} };
    for (const k of keys) { out[sec].prev[k] = prev[sec][k]; out[sec].change[k] = pctChange(cur[sec][k], prev[sec][k]); }
  }
  return out;
}

async function params(b, user) {
  await requireModule('analytics');
  const err = checkRange(b.from, b.to);
  if (err) fail(400, err);
  if (b.venue_id) await assertVenue(user, b.venue_id);
  const scope = await venueScope(user);
  if (scope && !scope.length) fail(403, 'No venues to show');
  const venue = user.role === 'venue';
  return { scope, venue, officer: venue ? null : b.officer_id || null, name: venue ? officerShort('o') : officerName('o') };
}

export const actions = {
  'analytics.venue': def(['company', 'security', 'venue'], async (b, { user }) => {
    const { scope, officer, name } = await params(b, user);
    const prev = prevRange(b.from, b.to);
    const [cur, before] = await Promise.all([
      summary([scope, b.from, b.to, b.venue_id || null, officer], name),
      summary([scope, prev.from, prev.to, b.venue_id || null, officer], name),
    ]);
    return { range: { from: b.from, to: b.to }, prev_range: prev, ...withChange(cur, before) };
  }),

  /** Venues and officers for the filters. Venues don't filter by officer. */
  'analytics.options': def(['company', 'security', 'venue'], async (_b, { user }) => {
    await requireModule('analytics');
    const scope = await venueScope(user);
    const venues = await q('SELECT id, name FROM venues WHERE ($1::uuid[] IS NULL OR id = ANY($1)) AND active ORDER BY name', [scope]);
    if (user.role === 'venue') return { venues, officers: [] };
    const officers = await q(
      `SELECT o.id, ${officerName('o')} AS name FROM officers o
        WHERE o.status = 'active' OR EXISTS (SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
                                              WHERE a.officer_id = o.id AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) AND s.starts_at > now() - interval '400 days')
        ORDER BY 2`, [scope]);
    return { venues, officers };
  }),
};
