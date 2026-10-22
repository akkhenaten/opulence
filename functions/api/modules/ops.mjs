// Ops AI — the in-app operations manager. The AI prepares, a manager taps Approve.
// Reminders to officers and feedback prompts to venues go out without approval.
import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, need, pick } from '../lib/http.mjs';
import { venueScope, assertVenue, assertOfficerAccess } from '../lib/scope.mjs';
import { notify, companyManagers, securityFor, venueContacts, officerUser, managersFor } from '../lib/notify.mjs';
import { fmtDate, fmtTime, fmtDateTime, londonDate, londonParts, addDays } from '../lib/time.mjs';
import { roundHours, money } from '../lib/rates.mjs';
import { audit } from '../lib/audit.mjs';
import { claude, extract, SONNET, HAIKU, monthKey } from '../lib/ai.mjs';
import { getSettings } from './settings.mjs';
import { checkOfficerForShift, getShift, filledCount, shiftsWithAssignments, londonToUtc, actions as rota } from './rota.mjs';
import { recalcStatement, recalcInvoice } from './money.mjs';
import { ALL, MGR, CO, def } from './_def.mjs';
import { runCompliance, readDocuments, decideCompliance, computeIssues, sendDigest } from './compliance.mjs';
import { evidenceScan } from './incidentAi.mjs';
import { opsMessage, closeQuick, ensureThread, post, opsUser, syncMembers } from '../lib/threads.mjs';

const ACTIVE = "('assigned','accepted')";
const NO_CLOCK_IN = "NOT EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status <> 'rejected')";
export const jobOn = (s, key) => (s.ops_jobs || {})[key] !== false;
const when = (sh) => `${fmtDate(sh.starts_at)} ${fmtTime(sh.starts_at)}–${fmtTime(sh.ends_at)}`;
const firstLast = (o) => `${o.first_name} ${o.last_name}`;

// ---------- Helpers ----------
export async function logActivity(kind, text, { ref_type = null, ref_id = null, venue_id = null, credits = 0 } = {}) {
  await q('INSERT INTO ops_activity (kind, text, ref_type, ref_id, venue_id, credits) VALUES ($1,$2,$3,$4,$5,$6)', [kind, text, ref_type, ref_id, venue_id, credits]);
}

// Company managers see /company/ops, security managers their own portal
async function notifyManagers(venueId, n) {
  await notify(await companyManagers(), { ...n, link: `/company/${n.link}` });
  if (venueId) await notify(await securityFor(venueId), { ...n, link: `/security/${n.link}` });
}

export async function createItem({ kind, title, reason = '', payload = {}, dedupe = null, venue_id = null, shift_id = null, officer_id = null, severity = 'info' }) {
  const item = await one(
    `INSERT INTO ops_items (kind, title, reason, payload, dedupe, venue_id, shift_id, officer_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (dedupe) DO NOTHING RETURNING *`, [kind, title, reason, payload, dedupe, venue_id, shift_id, officer_id]);
  if (!item) return null;
  await notifyManagers(venue_id, { kind: 'ops', severity, title: `Ops AI: ${title}`, body: reason.slice(0, 200), link: 'ops', dedupe: `ops:${item.id}` });
  await logActivity('item', `Prepared for approval: ${title}`, { ref_type: 'ops_item', ref_id: item.id, venue_id });
  return item;
}

// Share of shifts worked on time over 90 days (excused events don't count against)
export async function reliability(officerIds) {
  if (!officerIds.length) return {};
  const rows = await q(
    `SELECT a.officer_id, count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM attendance_events e WHERE e.assignment_id = a.id AND NOT e.excused AND e.kind IN ('late','no_show','cant_make_it')))::int AS bad
       FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
      WHERE a.officer_id = ANY($1::uuid[]) AND s.status = 'published' AND s.ends_at < now() AND s.ends_at > now() - interval '90 days'
        AND (a.status IN ${ACTIVE} OR EXISTS (SELECT 1 FROM attendance_events e WHERE e.assignment_id = a.id AND e.kind = 'cant_make_it'))
      GROUP BY a.officer_id`, [officerIds]);
  return Object.fromEntries(rows.map((r) => [r.officer_id, { total: r.total, bad: r.bad, rate: r.total ? (r.total - r.bad) / r.total : null }]));
}

// UK postcode outward code ("M4 1AB" → "M4") and area letters ("M")
export const outward = (pc) => {
  const s = String(pc || '').toUpperCase().replace(/\s+/g, '');
  return s.length > 3 ? s.slice(0, -3) : s;
};
const area = (pc) => (outward(pc).match(/^[A-Z]+/) || [''])[0];

/** Pure scoring for cover candidates. Higher is better. */
export function scoreCandidate({ reliability: rel, venueShifts = 0, officerPostcode, venuePostcode, warnings = 0 }) {
  const r = rel ?? 0.85; // new starters get a fair middle score
  const familiarity = Math.min(venueShifts, 5) / 5;
  const near = outward(officerPostcode) && outward(officerPostcode) === outward(venuePostcode) ? 1 : area(officerPostcode) && area(officerPostcode) === area(venuePostcode) ? 0.5 : 0;
  return Math.round((r * 0.5 + familiarity * 0.3 + near * 0.2 - warnings * 0.15) * 100) / 100;
}

function reasonLine({ rel, venueShifts, officerPostcode, venuePostcode, warnings }) {
  const bits = [];
  bits.push(rel?.rate != null ? `${Math.round(rel.rate * 100)}% on time (${rel.total} shift${rel.total === 1 ? '' : 's'})` : 'No recent record');
  if (venueShifts) bits.push(`${venueShifts} shift${venueShifts > 1 ? 's' : ''} here before`);
  if (outward(officerPostcode) && outward(officerPostcode) === outward(venuePostcode)) bits.push(`lives nearby (${outward(officerPostcode)})`);
  else if (area(officerPostcode) && area(officerPostcode) === area(venuePostcode)) bits.push(`same area (${outward(officerPostcode)})`);
  return [...bits, ...warnings].join(' · ');
}

/** Ranked, eligible officers for a shift. */
export async function rankCover(shift, { exclude = [] } = {}) {
  const v = await one('SELECT postcode FROM venues WHERE id = $1', [shift.venue_id]);
  const pool = await q(
    `SELECT o.id, o.first_name, o.last_name, o.postcode FROM officers o
      WHERE o.status = 'active' AND NOT (o.id = ANY($2::uuid[]))
        AND NOT EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = $1 AND a.officer_id = o.id) -- already on it, or dropped out of it
        AND NOT EXISTS (SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = o.id AND a.status IN ${ACTIVE}
                          AND s.status <> 'cancelled' AND s.id <> $1 AND s.starts_at < $4 AND s.ends_at > $3)`,
    [shift.id, exclude, shift.starts_at, shift.ends_at]);
  const ids = pool.map((o) => o.id);
  const [rel, familiar, checks] = await Promise.all([
    reliability(ids),
    q(`SELECT a.officer_id, count(*)::int AS n FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.officer_id = ANY($1::uuid[]) AND s.venue_id = $2 AND a.status IN ${ACTIVE} AND s.ends_at < now() AND s.ends_at > now() - interval '180 days'
        GROUP BY a.officer_id`, [ids, shift.venue_id]).then((r) => Object.fromEntries(r.map((x) => [x.officer_id, x.n]))),
    Promise.all(pool.map((o) => checkOfficerForShift(o.id, shift))),
  ]);
  return pool.map((o, i) => ({ o, c: checks[i] })).filter(({ c }) => !c.blocking.length).map(({ o, c }) => {
    const f = { rel: rel[o.id], venueShifts: familiar[o.id] || 0, officerPostcode: o.postcode, venuePostcode: v?.postcode, warnings: c.warnings };
    return {
      officer_id: o.id, name: firstLast(o), warnings: c.warnings, reliability: rel[o.id]?.rate ?? null, venue_shifts: f.venueShifts, area: outward(o.postcode),
      score: scoreCandidate({ reliability: rel[o.id]?.rate, venueShifts: f.venueShifts, officerPostcode: o.postcode, venuePostcode: v?.postcode, warnings: c.warnings.length }),
      reason: reasonLine(f),
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Creates a Cover card with the top picks. `replacing` = assignment of the officer who can't make it. */
export async function proposeCover(shift, cause, { batch = 1, exclude = [], replacing = null, prefer = [] } = {}) {
  const sh = shift.venue_name ? shift : await getShift(shift.id);
  const short = sh.headcount - (await filledCount(sh.id)) + (replacing ? 1 : 0);
  if (short <= 0) return null;
  const ranked = await rankCover(sh, { exclude });
  const preferred = ranked.filter((c) => prefer.includes(c.officer_id));
  const ordered = [...preferred, ...ranked.filter((c) => !prefer.includes(c.officer_id))];
  const picks = ordered.slice(0, Math.max(3, short)).map((c) => c.officer_id);
  const causeText = { 'no-show': 'Officer has not turned up', cant_make_it: 'Officer can\'t make it', unfilled: `${short} place${short > 1 ? 's' : ''} still unfilled`, next: 'No one accepted the last offers', manager: 'Requested in chat', new: 'New shift from a venue request' }[cause] || cause;
  const reason = ordered.length
    ? `${causeText}. Top pick: ${ordered[0].name} — ${ordered[0].reason}.`
    : `${causeText}. No eligible officers are free — consider agency cover or moving someone.`;
  return createItem({
    kind: 'cover', title: `Cover ${sh.venue_name} · ${when(sh)}`, reason, venue_id: sh.venue_id, shift_id: sh.id,
    severity: ['no-show', 'cant_make_it'].includes(cause) ? 'critical' : 'info',
    payload: { shift_id: sh.id, cause, batch, short, replacing, officer_ids: picks, candidates: ordered.slice(0, 8) },
    dedupe: `cover:${sh.id}:${batch}${replacing ? `:${replacing}` : ''}`,
  });
}

async function nextBatch(item) {
  await q("UPDATE cover_offers SET status = 'expired', responded_at = now() WHERE item_id = $1 AND status = 'offered'", [item.id]);
  await q("UPDATE ops_items SET status = 'expired' WHERE id = $1", [item.id]);
  const offered = (await q('SELECT officer_id FROM cover_offers WHERE shift_id = $1', [item.shift_id])).map((r) => r.officer_id);
  const sh = await getShift(item.shift_id);
  if (sh.status !== 'published' || new Date(sh.ends_at) < new Date()) return null;
  return proposeCover(sh, 'next', { batch: (item.payload.batch || 1) + 1, exclude: offered });
}

// ---------- Venue request parsing ----------
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Pure validation of what the AI read from a venue message. */
export function validateRequest(parsed, { today, roles, shiftIds = [] }) {
  const errors = [];
  if (!parsed || !['new', 'change', 'cancel'].includes(parsed.intent)) return { ok: false, errors: [parsed?.question || 'Could you tell us the date, times and how many officers you need?'] };
  const shifts = (parsed.shifts || []).slice(0, 10);
  if (!shifts.length) errors.push('Which date and times do you need?');
  for (const s of shifts) {
    if (parsed.intent !== 'new' && !shiftIds.includes(s.shift_id)) { errors.push('Which booked shift do you mean? Please give the date and time.'); continue; }
    if (parsed.intent === 'cancel') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || '') || s.date < today) errors.push('Dates must be today or later.');
    if (!HHMM.test(s.start || '') || !HHMM.test(s.end || '')) errors.push('What start and finish times do you need?');
    s.headcount = Number(s.headcount || 1);
    if (!(s.headcount >= 1 && s.headcount <= 20)) errors.push('Headcount must be between 1 and 20.');
    if (!roles.includes(s.role)) errors.push(`Which role do you need? (${roles.join(', ')})`);
  }
  return { ok: !errors.length, errors: [...new Set(errors)], shifts };
}

// London date + HH:MM pair → UTC range; an end at/before the start rolls to the next day
export function toRange(date, start, end) {
  const starts_at = londonToUtc(date, start);
  let ends_at = londonToUtc(date, end);
  if (ends_at <= starts_at) ends_at = londonToUtc(addDays(date, 1), end);
  return { starts_at, ends_at };
}

const REQUEST_TOOL = {
  name: 'record_request',
  description: 'Record the staffing request the venue manager made.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['new', 'change', 'cancel', 'unclear'] },
      question: { type: 'string', description: 'If unclear: one short question to ask back.' },
      summary: { type: 'string', description: 'One-line summary for the operations manager.' },
      shifts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD (London) of the shift start' },
            start: { type: 'string', description: 'HH:MM 24h' },
            end: { type: 'string', description: 'HH:MM 24h (may be after midnight)' },
            role: { type: 'string' },
            headcount: { type: 'integer' },
            notes: { type: 'string' },
            shift_id: { type: 'string', description: 'For change/cancel: id of the existing shift' },
          },
        },
      },
      recurrence: {
        type: 'object',
        description: 'Only when they ask for the same cover repeatedly ("every Friday and Saturday", "weekly until Christmas").',
        properties: {
          frequency: { type: 'string', enum: ['weekly', 'fortnightly'] },
          days: { type: 'array', items: { type: 'object', properties: { dow: { type: 'integer', description: 'ISO weekday 1=Mon..7=Sun' }, start: { type: 'string' }, end: { type: 'string' }, headcount: { type: 'integer' } } } },
          start_date: { type: 'string', description: 'YYYY-MM-DD first week' },
          end_date: { type: 'string', description: 'YYYY-MM-DD last date, or empty for no end' },
          role: { type: 'string' },
        },
      },
    },
    required: ['intent'],
  },
};

// ---------- Reconcile ----------
/** Pure comparison of one timesheet's figures. Returns mismatches and the suggested fix. */
export function reconcileRow({ rota_h, clock_h, ts_h, stmt_h, inv_h, min_hours = 0, edited = false, tol = 0.25 }) {
  const truth = edited || clock_h == null ? ts_h : clock_h;
  const issues = [];
  const fix = {};
  if (!edited && clock_h != null && Math.abs(clock_h - ts_h) > tol) { issues.push({ field: 'ts', text: `Timesheet ${ts_h}h but clocked ${clock_h}h` }); fix.timesheet_hours = clock_h; }
  if (stmt_h != null && Math.abs(stmt_h - truth) > tol) { issues.push({ field: 'stmt', text: `Pay statement ${stmt_h}h, should be ${truth}h` }); fix.statement_hours = truth; }
  const billable = Math.max(truth, Number(min_hours) || 0);
  if (inv_h != null && Math.abs(inv_h - billable) > tol) { issues.push({ field: 'inv', text: `Invoice ${inv_h}h, should be ${billable}h${billable > truth ? ` (${min_hours}h minimum)` : ''}` }); fix.invoice_hours = billable; }
  return { issues, fix, truth, rota_h };
}

export async function runReconcile(start, end) {
  const s = await getSettings();
  const rows = await q(
    `SELECT t.id, t.hours, t.flags, t.break_minutes, t.statement_id, t.invoice_id, a.id AS assignment_id, a.officer_id, s.starts_at, s.ends_at, s.venue_id, s.role,
            v.name AS venue_name, o.first_name, o.last_name,
            extract(epoch FROM (s.ends_at - s.starts_at)) / 3600 - s.break_minutes / 60.0 AS rota_h,
            (SELECT min(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual')) AS cin,
            (SELECT max(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'out' AND ce.status IN ('ok','approved','manual')) AS cout,
            sl.id AS stmt_line_id, sl.hours AS stmt_h, st.status AS stmt_status, st.id AS stmt_id,
            il.id AS inv_line_id, il.hours AS inv_h, i.status AS inv_status, i.id AS inv_id,
            (SELECT min_hours FROM venue_rates vr WHERE vr.venue_id = s.venue_id AND vr.role = s.role AND vr.effective_from <= s.starts_at::date ORDER BY effective_from DESC LIMIT 1) AS min_hours
       FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
       JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
       LEFT JOIN statement_lines sl ON sl.timesheet_id = t.id AND sl.kind = 'hours' LEFT JOIN statements st ON st.id = sl.statement_id
       LEFT JOIN invoice_lines il ON il.timesheet_id = t.id LEFT JOIN invoices i ON i.id = il.invoice_id AND i.kind = 'invoice'
      WHERE (s.starts_at AT TIME ZONE 'Europe/London')::date BETWEEN $1 AND $2`, [start, end]);
  let created = 0;
  for (const r of rows) {
    const edited = (r.flags || []).some((f) => ['edited', 'manual'].includes(f));
    const clock_h = r.cin && r.cout ? roundHours(new Date(r.cin) < new Date(r.starts_at) ? r.starts_at : r.cin, r.cout, r.break_minutes, s.rounding_minutes) : null;
    const fig = { rota_h: money(r.rota_h), clock_h, ts_h: Number(r.hours), stmt_h: r.stmt_line_id ? Number(r.stmt_h) : null, inv_h: r.inv_line_id ? Number(r.inv_h) : null, min_hours: Number(r.min_hours || 0), edited };
    const res = reconcileRow(fig);
    if (!res.issues.length) continue;
    const locked = (res.fix.statement_hours != null && r.stmt_status !== 'draft') || (res.fix.invoice_hours != null && r.inv_status && r.inv_status !== 'draft')
      || (res.fix.timesheet_hours != null && ((r.stmt_status && r.stmt_status !== 'draft') || (r.inv_status && r.inv_status !== 'draft')));
    const item = await createItem({
      kind: 'reconcile', venue_id: r.venue_id, officer_id: r.officer_id,
      title: `Hours mismatch · ${firstLast(r)} · ${fmtDate(r.starts_at)}`,
      reason: `${res.issues.map((i) => i.text).join('; ')}.${locked ? ' Already issued — review and raise a credit note or adjustment if needed.' : ' Approve to correct it.'}`,
      payload: { timesheet_id: r.id, venue_name: r.venue_name, figures: fig, issues: res.issues, fix: res.fix, info_only: locked,
        stmt_line_id: r.stmt_line_id, stmt_id: r.stmt_id, stmt_status: r.stmt_status, inv_line_id: r.inv_line_id, inv_id: r.inv_id, inv_status: r.inv_status },
      dedupe: `reconcile:${r.id}:${[fig.clock_h, fig.ts_h, fig.stmt_h, fig.inv_h].join('|')}`,
    });
    if (item) created++;
  }
  await logActivity('reconcile', `Checked ${rows.length} timesheet${rows.length === 1 ? '' : 's'} for ${fmtDate(start)} – ${fmtDate(end)}: ${created} mismatch${created === 1 ? '' : 'es'} found`);
  return { checked: rows.length, created };
}

// ---------- Escalation ----------
async function escalate(a, s) {
  const done = await one('UPDATE shift_assignments SET escalated_at = now() WHERE id = $1 AND escalated_at IS NULL RETURNING id', [a.id]);
  if (!done) return;
  const sh = await getShift(a.shift_id);
  const name = `${a.first_name} ${a.last_name}`;
  const why = a.reply === 'cant_make_it' ? `says they can't make it${a.reply_reason ? `: "${a.reply_reason}"` : ''}` : a.reply === 'on_my_way' ? `said on my way (${a.reply_eta_min} min) but still not clocked in` : 'has not replied or clocked in';
  if (a.reply === 'cant_make_it') await q("UPDATE shift_assignments SET status = 'cancelled' WHERE id = $1", [a.id]);
  else {
    const [uid] = await officerUser(a.officer_id);
    await opsMessage(uid, `We still haven't seen you clock in at ${sh.venue_name}, so the office is lining up cover. If you're on your way, tell us now.`);
  }
  await notifyManagers(sh.venue_id, { kind: 'late', severity: 'critical', title: `${name} ${a.reply === 'cant_make_it' ? "can't make it" : 'is a no-show'}`, body: `${sh.venue_name} · ${when(sh)}. ${name} ${why}. Cover options are in Ops AI.`, link: 'ops', dedupe: `esc:${a.id}`, email: true });
  await logActivity('escalate', `Escalated ${name} at ${sh.venue_name} (${fmtTime(sh.starts_at)}) — ${why}`, { ref_type: 'assignment', ref_id: a.id, venue_id: sh.venue_id });
  if (jobOn(s, 'cover')) await proposeCover(sh, a.reply === 'cant_make_it' ? 'cant_make_it' : 'no-show', { replacing: a.reply === 'cant_make_it' ? null : a.id });
}

// ---------- Jobs ----------
const JOBS = {
  async escalate(s) {
    if (!jobOn(s, 'chase')) return 'off';
    const rows = await q(
      `SELECT a.*, o.first_name, o.last_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN officers o ON o.id = a.officer_id
        WHERE a.chased_at IS NOT NULL AND a.escalated_at IS NULL AND a.status IN ${ACTIVE} AND s.status = 'published' AND s.ends_at > now() AND ${NO_CLOCK_IN}
          AND ((a.reply IS NULL AND GREATEST(s.starts_at + make_interval(mins => $1::int), a.chased_at) + make_interval(mins => $2::int) < now())
            OR a.reply = 'cant_make_it'
            OR (a.reply = 'on_my_way' AND a.replied_at + make_interval(mins => COALESCE(a.reply_eta_min, 15) + 5) < now()))`,
      [s.grace_minutes, s.ops_escalate_minutes]);
    for (const a of rows) await escalate(a, s);
    return rows.length;
  },

  async attendance() {
    const noShows = await q(
      `INSERT INTO attendance_events (officer_id, assignment_id, kind, notified, reason)
       SELECT a.officer_id, a.id, 'no_show', a.reply IS NOT NULL, COALESCE(a.reply_reason, '') FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.status IN ${ACTIVE} AND s.status = 'published' AND s.ends_at < now() AND s.ends_at > now() - interval '14 days' AND ${NO_CLOCK_IN}
       ON CONFLICT DO NOTHING RETURNING id`);
    const lates = await q(
      `INSERT INTO attendance_events (officer_id, assignment_id, kind, minutes, notified)
       SELECT a.officer_id, a.id, k.kind,
              CASE WHEN k.kind = 'late' THEN round(extract(epoch FROM (t.actual_start - s.starts_at)) / 60) ELSE round(extract(epoch FROM (s.ends_at - t.actual_end)) / 60) END,
              k.kind = 'late' AND a.reply IS NOT NULL
         FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
         CROSS JOIN LATERAL unnest(ARRAY['late','left_early']) AS k(kind)
        WHERE k.kind = ANY(t.flags) AND t.updated_at > now() - interval '14 days'
       ON CONFLICT DO NOTHING RETURNING id`);
    return noShows.length + lates.length;
  },

  async coverScan(s) {
    if (!jobOn(s, 'cover')) return 'off';
    const rows = await q(
      `SELECT s.id FROM shifts s WHERE s.status = 'published' AND s.starts_at > now() AND s.starts_at < now() + interval '72 hours'
          AND s.headcount > (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ${ACTIVE})
          AND NOT EXISTS (SELECT 1 FROM ops_items i WHERE i.kind = 'cover' AND i.shift_id = s.id AND i.status IN ('pending','approved','rejected'))
        ORDER BY s.starts_at LIMIT 10`);
    let n = 0;
    for (const r of rows) {
      const prev = await one("SELECT max((payload->>'batch')::int) AS b FROM ops_items WHERE kind = 'cover' AND shift_id = $1", [r.id]);
      if (await proposeCover({ id: r.id }, 'unfilled', { batch: (prev?.b || 0) + 1 })) n++;
    }
    return n;
  },

  async offerExpiry(s) {
    if (!jobOn(s, 'cover')) return 'off';
    const items = await q(
      `SELECT i.* FROM ops_items i JOIN shifts s ON s.id = i.shift_id
        WHERE i.kind = 'cover' AND i.status = 'approved'
          AND NOT EXISTS (SELECT 1 FROM cover_offers c WHERE c.item_id = i.id AND c.status = 'offered' AND c.offered_at > now() - make_interval(mins => $1))`,
      [s.ops_offer_wait_minutes]);
    let n = 0;
    for (const it of items) {
      const sh = await getShift(it.shift_id);
      const short = sh.headcount - (await filledCount(sh.id));
      if (short <= 0 || sh.status !== 'published' || new Date(sh.ends_at) < new Date()) {
        await q("UPDATE ops_items SET status = 'done' WHERE id = $1", [it.id]);
        await q("UPDATE cover_offers SET status = 'expired', responded_at = now() WHERE item_id = $1 AND status = 'offered'", [it.id]);
        continue;
      }
      await nextBatch(it);
      n++;
    }
    return n;
  },

  async feedback(s) {
    if (!jobOn(s, 'feedback')) return 'off';
    const created = await q(
      `INSERT INTO venue_feedback (shift_id, venue_id, officer_id)
       SELECT DISTINCT s.id, s.venue_id, a.officer_id FROM shifts s JOIN shift_assignments a ON a.shift_id = s.id
        WHERE s.status = 'published' AND s.ends_at < now() AND s.ends_at > now() - interval '48 hours' AND a.status IN ${ACTIVE}
          AND EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual'))
          -- Ask after an officer's first shift at a venue, then at most once a month per officer and venue
          AND NOT EXISTS (SELECT 1 FROM venue_feedback f WHERE f.venue_id = s.venue_id AND f.officer_id = a.officer_id
                AND (f.answered_at > now() - interval '30 days' OR (f.answered_at IS NULL AND f.requested_at > now() - interval '7 days')))
          AND (NOT EXISTS (SELECT 1 FROM venue_feedback f WHERE f.venue_id = s.venue_id AND f.officer_id = a.officer_id)
               OR NOT EXISTS (SELECT 1 FROM venue_feedback f WHERE f.venue_id = s.venue_id AND f.officer_id = a.officer_id AND f.requested_at > now() - interval '30 days'))
       ON CONFLICT DO NOTHING RETURNING shift_id, venue_id`);
    const byShift = {};
    for (const r of created) byShift[r.shift_id] = r.venue_id;
    for (const [shiftId, venueId] of Object.entries(byShift)) {
      const sh = await getShift(shiftId);
      await notify(await venueContacts(venueId), { kind: 'feedback', title: 'How did our officers do?', body: `Rate the team from ${sh.venue_name} · ${when(sh)}. It takes 10 seconds.`, link: '/venue', dedupe: `fb:${shiftId}` });
    }
    const due = await q(
      `UPDATE venue_feedback SET reminded_at = now() WHERE answered_at IS NULL AND reminded_at IS NULL
          AND requested_at < now() - interval '24 hours' AND requested_at > now() - interval '7 days' RETURNING shift_id, venue_id`);
    const remind = {};
    for (const r of due) remind[r.shift_id] = r.venue_id;
    for (const [shiftId, venueId] of Object.entries(remind)) {
      const sh = await getShift(shiftId);
      await notify(await venueContacts(venueId), { kind: 'feedback', title: 'Reminder: rate your officers', body: `${sh.venue_name} · ${when(sh)}`, link: '/venue', dedupe: `fbr:${shiftId}`, email: true });
    }
    if (created.length) await logActivity('feedback', `Asked venues for feedback on ${Object.keys(byShift).length} shift${Object.keys(byShift).length === 1 ? '' : 's'}`);
    return created.length + due.length;
  },

  async reconcile(s) {
    if (!jobOn(s, 'reconcile')) return 'off';
    const now = londonParts(new Date());
    const today = londonDate(new Date());
    const dow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    if (dow !== s.ops_reconcile_dow || now.hour < 6) return 'not today';
    if (await one("SELECT 1 FROM ops_activity WHERE kind = 'reconcile_run' AND text = $1", [today])) return 'done';
    await logActivity('reconcile_run', today);
    const lastMonday = addDays(today, -(dow - 1) - 7);
    return runReconcile(lastMonday, addDays(lastMonday, 6));
  },

  async compliance(s) {
    if (!jobOn(s, 'compliance')) return 'off';
    const today = londonDate(new Date());
    const dow = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    if (dow !== s.ops_compliance_dow || londonParts(new Date()).hour < 6) return 'not today';
    if (await one("SELECT 1 FROM ops_activity WHERE kind = 'compliance_run' AND text = $1", [today])) return 'done';
    await logActivity('compliance_run', today);
    const r = await runCompliance();
    if (jobOn(s, 'compliance_digest')) r.digest = await sendDigest().catch((e) => ({ error: e.message }));
    return r;
  },

  async docRead(s) {
    if (!jobOn(s, 'compliance')) return 'off';
    return readDocuments(4);
  },

  evidenceScan,
};

export async function runOpsJobs(s) {
  const out = {};
  for (const [name, fn] of Object.entries(JOBS)) {
    try {
      out[name] = await fn(s);
    } catch (e) {
      console.error(`[ops] ${name} failed:`, e);
      out[name] = `error: ${e.message}`;
    }
  }
  return out;
}

// ---------- Inbox ----------
async function scopedItem(user, id) {
  const it = need(await one('SELECT * FROM ops_items WHERE id = $1', [id]), 'Item not found');
  const scope = await venueScope(user);
  if (scope && (!it.venue_id || !scope.includes(it.venue_id))) fail(403, 'No access to this item');
  return it;
}

async function decideCover(it, b, user) {
  const sh = await getShift(it.shift_id);
  if (sh.status !== 'published') fail(400, 'Shift is no longer published');
  const ids = (b.edits?.officer_ids || it.payload.officer_ids || []).slice(0, 10);
  if (!ids.length) fail(400, 'Pick at least one officer to offer the shift to');
  if (it.payload.replacing) {
    const r = await one(`UPDATE shift_assignments a SET status = 'cancelled' WHERE a.id = $1 AND a.status IN ${ACTIVE} AND ${NO_CLOCK_IN} RETURNING officer_id`, [it.payload.replacing]);
    if (r) {
      const [uid] = await officerUser(r.officer_id);
      await closeQuick(uid, { ref: `chase:${it.payload.replacing}`, used: 'stood_down' });
      await opsMessage(uid, `You've been stood down from ${sh.venue_name} · ${when(sh)} because we couldn't reach you. Reply here or call the office if this is wrong.`);
    }
  }
  const batch = it.payload.batch || 1;
  const offered = await q(
    `INSERT INTO cover_offers (item_id, shift_id, officer_id, batch) SELECT $1, $2, unnest($3::uuid[]), $4
     ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'offered', item_id = EXCLUDED.item_id, batch = EXCLUDED.batch, offered_at = now(), responded_at = NULL
       WHERE cover_offers.status IN ('expired','filled_by_other')
     RETURNING id, officer_id`, [it.id, sh.id, ids, batch]);
  for (const o of offered) {
    const [uid] = await officerUser(o.officer_id);
    await opsMessage(uid, `Can you cover ${sh.venue_name} · ${when(sh)}? First to accept gets it.`, { ref: `offer:${o.id}`, options: [{ label: 'Accept', value: 'accept' }, { label: 'Decline', value: 'decline' }] }, { email: true });
  }
  return { offered: offered.length };
}

async function decideVenueRequest(it, b, user) {
  const req = it.payload.request_id ? await one('SELECT * FROM venue_requests WHERE id = $1', [it.payload.request_id]) : null;
  if (req && req.status !== 'requested') fail(409, `This request was already ${req.status}`);
  const intent = it.payload.intent;
  const list = b.edits?.shifts || it.payload.shifts || [];
  const done = [];
  if (intent === 'new') {
    const created = [];
    const roleNames = Object.fromEntries((await q('SELECT code, name FROM roles')).map((r) => [r.code, r.name]));
    for (const s of list) {
      const r = toRange(s.date, s.start, s.end);
      const sh = await rota['shifts.save'].fn({ venue_id: it.venue_id, role: s.role, ...r, headcount: Number(s.headcount) || 1, notes: s.notes || '', status: 'published' }, { user });
      created.push(sh);
      done.push(`${s.headcount || 1} × ${roleNames[s.role] || s.role} ${fmtDate(r.starts_at)} ${s.start}–${s.end}`);
    }
    if (jobOn(await getSettings(), 'cover')) for (const sh of created) await proposeCover({ id: sh.id }, 'new');
  } else if (intent === 'change') {
    for (const s of list) {
      const cur = await getShift(s.shift_id);
      const r = s.date && s.start && s.end ? toRange(s.date, s.start, s.end) : { starts_at: cur.starts_at, ends_at: cur.ends_at };
      await rota['shifts.save'].fn({ id: cur.id, venue_id: cur.venue_id, role: s.role || cur.role, ...r, headcount: Number(s.headcount) || cur.headcount }, { user });
      done.push(`changed ${fmtDate(r.starts_at)} ${fmtTime(r.starts_at)}–${fmtTime(r.ends_at)}`);
      if (Number(s.headcount) > cur.headcount) await proposeCover({ id: cur.id }, 'unfilled', { batch: Date.now() % 100000 });
    }
  } else if (intent === 'cancel') {
    for (const s of list) {
      const cur = await getShift(s.shift_id);
      await rota['shifts.cancel'].fn({ id: cur.id, reason: 'Venue request' }, { user });
      done.push(`cancelled ${when(cur)}`);
    }
  }
  if (req) {
    await q("UPDATE venue_requests SET status = 'confirmed' WHERE id = $1", [req.id]);
    await notify(await venueContacts(it.venue_id), { kind: 'cover', title: 'Your request is confirmed', body: done.join(' · '), link: '/venue/messages', email: true });
  }
  return { done };
}

async function decideReconcile(it, b, user) {
  const p = it.payload;
  if (p.info_only) return { reviewed: true };
  if (user.role !== 'company' && (p.fix.statement_hours != null || p.fix.invoice_hours != null)) fail(403, 'Only company managers can correct pay statements and invoices');
  await tx(async (t) => {
    if (p.fix.timesheet_hours != null) {
      await t.q(`UPDATE timesheets SET hours = $2, flags = array_append(array_remove(flags, 'edited'), 'edited'), resolution = $3, updated_at = now() WHERE id = $1`,
        [p.timesheet_id, p.fix.timesheet_hours, 'Ops AI reconcile: matched to clocked hours']);
    }
    if (p.fix.statement_hours != null && p.stmt_line_id) {
      const l = need(await t.one("SELECT l.*, s.status FROM statement_lines l JOIN statements s ON s.id = l.statement_id WHERE l.id = $1", [p.stmt_line_id]));
      if (l.status !== 'draft') fail(400, 'Statement already issued');
      const h = p.fix.statement_hours;
      const amount = Number(l.hours) ? money(Number(l.amount) * h / Number(l.hours)) : money(h * Number(l.rate || 0));
      await t.q('UPDATE statement_lines SET hours = $2, amount = $3 WHERE id = $1', [l.id, h, amount]);
      await recalcStatement(t, l.statement_id);
    }
    if (p.fix.invoice_hours != null && p.inv_line_id) {
      const l = need(await t.one('SELECT l.*, i.status FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE l.id = $1', [p.inv_line_id]));
      if (l.status !== 'draft') fail(400, 'Invoice already issued');
      const h = p.fix.invoice_hours;
      const amount = Number(l.hours) ? money(Number(l.amount) * h / Number(l.hours)) : money(h * Number(l.rate || 0));
      await t.q('UPDATE invoice_lines SET hours = $2, amount = $3 WHERE id = $1', [l.id, h, amount]);
      await recalcInvoice(t, l.invoice_id);
    }
  });
  return { fixed: p.fix };
}

async function decideFeedback(it, b, user) {
  if (b.edits?.hr_note && it.officer_id) {
    await insert('hr_notes', { officer_id: it.officer_id, kind: 'venue_feedback', title: it.title, body: `${it.payload.note || ''} (rating ${it.payload.rating}/5)`, author_id: user.id });
    return { hr_note: true };
  }
  return { reviewed: true };
}

// ---------- Manager chat ----------
export const CHAT_TOOLS = [
  { name: 'find_shifts', description: 'List shifts in a date range (London dates). Includes headcount, filled and assigned officers.',
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD inclusive' }, venue: { type: 'string', description: 'Venue name (partial ok)' }, unfilled_only: { type: 'boolean' } }, required: ['from', 'to'] } },
  { name: 'cover_candidates', description: 'Ranked eligible officers who could cover a shift, with reasons.',
    input_schema: { type: 'object', properties: { shift_id: { type: 'string' } }, required: ['shift_id'] } },
  { name: 'officer_attendance', description: 'Lates, no-shows, left-early and can\'t-make-it events for an officer, plus reliability and venue ratings.',
    input_schema: { type: 'object', properties: { officer: { type: 'string', description: 'Name (partial ok)' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['officer'] } },
  { name: 'officer_hours', description: 'Rostered and worked (timesheet) hours for an officer in a date range.',
    input_schema: { type: 'object', properties: { officer: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['officer', 'from', 'to'] } },
  { name: 'list_officers', description: 'Active officers with roles and home area.', input_schema: { type: 'object', properties: {} } },
  { name: 'list_venues', description: 'Venues this manager looks after.', input_schema: { type: 'object', properties: {} } },
  { name: 'compliance_status', description: 'Live staff compliance issues: SIA licence and right-to-work expiry against the rota, licence type vs role, missing or mismatched documents. With from/to, only issues putting shifts in that range at risk.',
    input_schema: { type: 'object', properties: { officer: { type: 'string', description: 'Name (partial ok)' }, from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD inclusive' } } } },
  { name: 'propose_change', description: 'Prepare a change for the manager to approve in the Ops AI inbox. Never changes anything by itself. kind=cover: offer a shift to officers. kind=rota: add, change or cancel shifts.',
    input_schema: { type: 'object', properties: {
      kind: { type: 'string', enum: ['cover', 'rota'] }, shift_id: { type: 'string', description: 'cover, or rota change/cancel' },
      officer_ids: { type: 'array', items: { type: 'string' }, description: 'cover: officers to offer first' },
      venue: { type: 'string', description: 'rota: venue name' }, intent: { type: 'string', enum: ['new', 'change', 'cancel'] },
      shifts: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, role: { type: 'string' }, headcount: { type: 'integer' }, shift_id: { type: 'string' } } } },
      note: { type: 'string' } }, required: ['kind'] } },
];

async function findOfficer(name) {
  const o = await one(
    `SELECT * FROM officers WHERE (first_name || ' ' || last_name) ILIKE $1 OR first_name ILIKE $2 OR last_name ILIKE $2
      ORDER BY status = 'active' DESC, first_name LIMIT 1`, [`%${name}%`, `${String(name).split(' ')[0]}%`]);
  return need(o, `No officer called ${name}`);
}
async function findVenue(user, name) {
  const scope = await venueScope(user);
  return need(await one('SELECT id, name, postcode FROM venues WHERE name ILIKE $1 AND ($2::uuid[] IS NULL OR id = ANY($2)) LIMIT 1', [`%${name}%`, scope]), `No venue called ${name}`);
}
const dayStart = (d) => londonToUtc(d, '00:00');

export async function runTool(name, input, user, created) {
  const today = londonDate(new Date());
  switch (name) {
    case 'find_shifts': {
      const scope = await venueScope(user);
      const params = [dayStart(input.from), dayStart(addDays(input.to || input.from, 1)), scope];
      let where = "s.starts_at >= $1 AND s.starts_at < $2 AND s.status <> 'cancelled' AND ($3::uuid[] IS NULL OR s.venue_id = ANY($3))";
      if (input.venue) { const v = await findVenue(user, input.venue); params.push(v.id); where += ` AND s.venue_id = $${params.length}`; }
      let rows = await shiftsWithAssignments(where, params, user);
      if (input.unfilled_only) rows = rows.filter((s) => s.filled < s.headcount && s.status === 'published');
      return rows.slice(0, 60).map((s) => ({ shift_id: s.id, venue: s.venue_name, role: s.role_name, when: when(s), status: s.status, headcount: s.headcount, filled: s.filled,
        officers: s.assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).map((a) => a.name) }));
    }
    case 'cover_candidates': {
      const sh = await getShift(input.shift_id);
      await assertVenue(user, sh.venue_id);
      return { shift: `${sh.venue_name} · ${when(sh)}`, candidates: (await rankCover(sh)).slice(0, 8).map(({ officer_id, name: n, reason, score }) => ({ officer_id, name: n, reason, score })) };
    }
    case 'officer_attendance': {
      const o = await findOfficer(input.officer);
      const from = input.from || addDays(today, -90);
      const to = input.to || today;
      const ev = await q(
        `SELECT e.kind, e.minutes, e.reason, e.excused, s.starts_at, v.name AS venue FROM attendance_events e JOIN shift_assignments a ON a.id = e.assignment_id
           JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
          WHERE e.officer_id = $1 AND s.starts_at >= $2 AND s.starts_at < $3 ORDER BY s.starts_at DESC`, [o.id, dayStart(from), dayStart(addDays(to, 1))]);
      const rel = (await reliability([o.id]))[o.id];
      const ratings = await q('SELECT f.rating, f.note, v.name AS venue FROM venue_feedback f JOIN venues v ON v.id = f.venue_id WHERE f.officer_id = $1 AND f.rating IS NOT NULL ORDER BY f.answered_at DESC LIMIT 10', [o.id]);
      return { officer: firstLast(o), from, to, events: ev.map((e) => ({ ...e, when: fmtDateTime(e.starts_at), starts_at: undefined })), reliability_90d: rel ? `${Math.round(rel.rate * 100)}% of ${rel.total}` : 'no shifts', ratings };
    }
    case 'officer_hours': {
      const o = await findOfficer(input.officer);
      const r = await one(
        `SELECT COALESCE(sum(extract(epoch FROM (s.ends_at - s.starts_at)) / 3600), 0) AS rota_h, COALESCE(sum(t.hours), 0) AS worked_h, count(*)::int AS shifts
           FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id LEFT JOIN timesheets t ON t.assignment_id = a.id
          WHERE a.officer_id = $1 AND a.status IN ${ACTIVE} AND s.status <> 'cancelled' AND s.starts_at >= $2 AND s.starts_at < $3`,
        [o.id, dayStart(input.from), dayStart(addDays(input.to, 1))]);
      return { officer: firstLast(o), from: input.from, to: input.to, shifts: r.shifts, rostered_hours: money(r.rota_h), worked_hours: money(r.worked_h), weekly_cap: o.max_weekly_hours };
    }
    case 'list_officers':
      return (await q("SELECT id, first_name, last_name, roles, postcode FROM officers WHERE status = 'active' ORDER BY first_name")).map((o) => ({ officer_id: o.id, name: firstLast(o), roles: o.roles, area: outward(o.postcode) }));
    case 'compliance_status': {
      const scope = await venueScope(user);
      const o = input.officer ? await findOfficer(input.officer) : null;
      const inRange = (sh) => sh && (!input.from || londonDate(sh.starts_at) >= input.from) && (!input.to || londonDate(sh.starts_at) <= input.to);
      return (await computeIssues({ officerId: o?.id })).map((r) => ({
        officer: firstLast(r.officer),
        issues: r.issues.filter((i) => (!input.from && !input.to) || inRange(i.shift)).filter((i) => !scope || (i.shift && scope.includes(i.shift.venue_id)))
          .map((i) => ({ severity: i.severity, issue: i.title, detail: i.detail })),
      })).filter((r) => r.issues.length);
    }
    case 'list_venues': {
      const scope = await venueScope(user);
      return q('SELECT id AS venue_id, name, postcode FROM venues WHERE ($1::uuid[] IS NULL OR id = ANY($1)) ORDER BY name', [scope]);
    }
    case 'propose_change': {
      if (input.kind === 'cover') {
        const sh = await getShift(need(input.shift_id, 'shift_id is required'));
        await assertVenue(user, sh.venue_id);
        const prev = await one("SELECT max((payload->>'batch')::int) AS b FROM ops_items WHERE kind = 'cover' AND shift_id = $1", [sh.id]);
        const it = await proposeCover(sh, 'manager', { batch: (prev?.b || 0) + 1, prefer: input.officer_ids || [] });
        if (!it) return { error: 'That shift is already fully staffed.' };
        created.push(it.id);
        return { created: 'cover card in the Ops AI inbox', item_id: it.id, offering: it.payload.officer_ids.map((id) => it.payload.candidates.find((c) => c.officer_id === id)?.name).filter(Boolean) };
      }
      let venue;
      if (input.shift_id) { const sh = await getShift(input.shift_id); venue = { id: sh.venue_id, name: sh.venue_name }; } else venue = await findVenue(user, input.venue || '');
      await assertVenue(user, venue.id);
      const roles = (await q('SELECT code FROM roles')).map((r) => r.code);
      const shifts = (input.shifts || []).map((s) => ({ ...s, shift_id: s.shift_id || input.shift_id }));
      const v = validateRequest({ intent: input.intent, shifts }, { today, roles, shiftIds: shifts.map((s) => s.shift_id).filter(Boolean) });
      if (!v.ok) return { error: v.errors.join(' ') };
      const it = await createItem({ kind: 'venue_request', venue_id: venue.id, title: `Rota ${input.intent} · ${venue.name}`, reason: input.note || `Prepared in chat by ${user.name}`,
        payload: { intent: input.intent, shifts: v.shifts, from_manager: user.name, text: input.note || '' }, dedupe: `chat:${user.id}:${Date.now()}` });
      created.push(it.id);
      return { created: 'rota card in the Ops AI inbox', item_id: it.id };
    }
    default:
      return { error: 'Unknown tool' };
  }
}

// ---------- Actions ----------
// ---------- Officer replies (buttons in the app, quick replies and free text in Messages) ----------
/** After cover is found: the shift team thread and the venue's cover thread hear about it. */
async function coverFilledThreads(sh, name) {
  const sys = await opsUser();
  const team = (await q(`SELECT o.user_id FROM shift_assignments a JOIN officers o ON o.id = a.officer_id WHERE a.shift_id = $1 AND a.status IN ${ACTIVE} AND o.user_id IS NOT NULL`, [sh.id])).map((r) => r.user_id);
  const shiftThread = await ensureThread('shift', sh.id, [...team, ...(await managersFor(sh.venue_id)), sys], `${sh.venue_name} · ${when(sh)}`);
  await post(shiftThread.id, sys, { body: `${name} is now covering this shift.` });
  const series = sh.cover_request_id ? await one('SELECT COALESCE(cs.root_id, cs.id) AS root FROM cover_requests c JOIN cover_series cs ON cs.id = c.series_id WHERE c.id = $1', [sh.cover_request_id]) : null;
  const venueThread = series ? await one("SELECT id FROM conversations WHERE kind = 'cover' AND ref_id = $1", [series.root]) : null;
  if (venueThread) {
    await syncMembers(venueThread.id, [sys]);
    await post(venueThread.id, sys, { body: `Cover update for ${when(sh)}: ${name} will be working this shift.` });
  }
}

export async function officerReply(b, user) {
  required(b, 'assignment_id', 'reply');
  if (!['on_my_way', 'cant_make_it'].includes(b.reply)) fail(400, 'Unknown reply');
  const a = need(await one(
    `SELECT a.*, o.first_name, o.last_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN officers o ON o.id = a.officer_id
      WHERE a.id = $1 AND a.officer_id = $2 AND a.status IN ${ACTIVE} AND s.status = 'published' AND s.ends_at > now()`, [b.assignment_id, user.officer_id]), 'Shift not found');
  const eta = b.reply === 'on_my_way' ? Math.min(Math.max(Number(b.eta_min) || 15, 1), 120) : null;
  const reason = String(b.reason || '').slice(0, 300);
  await q('UPDATE shift_assignments SET reply = $2, reply_eta_min = $3, reply_reason = $4, replied_at = now(), chased_at = COALESCE(chased_at, now()) WHERE id = $1', [a.id, b.reply, eta, reason]);
  const sh = await getShift(a.shift_id);
  const name = `${a.first_name} ${a.last_name}`;
  await closeQuick(user.id, { ref: `chase:${a.id}`, used: b.reply });
  await opsMessage(user.id, b.reply === 'cant_make_it'
    ? `Thanks for letting us know. We'll arrange cover for ${sh.venue_name} — no need to do anything else.`
    : `Thanks — we've told the office you're about ${eta} minutes away. Clock in as soon as you arrive.`);
  if (b.reply === 'cant_make_it') {
    await q("INSERT INTO attendance_events (officer_id, assignment_id, kind, reason, notified) VALUES ($1,$2,'cant_make_it',$3,true) ON CONFLICT DO NOTHING", [a.officer_id, a.id, reason]);
    await escalate({ ...a, reply: 'cant_make_it', reply_reason: reason }, await getSettings());
  } else {
    await notifyManagers(sh.venue_id, { kind: 'late', title: `${name}: on my way (${eta} min)`, body: `${sh.venue_name} · started ${fmtTime(sh.starts_at)}`, link: 'live', dedupe: `omw:${a.id}` });
    await logActivity('reply', `${name} replied "on my way, ${eta} min" for ${sh.venue_name}`, { ref_type: 'assignment', ref_id: a.id, venue_id: sh.venue_id });
  }
  return { ok: true };
}

export async function offerRespond(b, user) {
  required(b, 'offer_id');
  const offer = need(await one("SELECT * FROM cover_offers WHERE id = $1 AND officer_id = $2", [b.offer_id, user.officer_id]), 'Offer not found');
  if (offer.status === 'filled_by_other') fail(409, 'Already filled — thanks for looking');
  if (offer.status !== 'offered') fail(409, `Offer ${offer.status}`);
  const sh = await getShift(offer.shift_id);
  const o = await one('SELECT first_name, last_name FROM officers WHERE id = $1', [offer.officer_id]);
  await closeQuick(user.id, { ref: `offer:${offer.id}`, used: b.accept ? 'accept' : 'decline' });
  if (!b.accept) {
    await q("UPDATE cover_offers SET status = 'declined', responded_at = now() WHERE id = $1", [offer.id]);
    await opsMessage(user.id, 'No problem — thanks for letting us know.');
    await logActivity('offer', `${firstLast(o)} declined cover at ${sh.venue_name} (${fmtDate(sh.starts_at)})`, { venue_id: sh.venue_id });
    const left = await one("SELECT count(*)::int AS n FROM cover_offers WHERE item_id = $1 AND status = 'offered'", [offer.item_id]);
    if (!left.n) { const it = await one("SELECT * FROM ops_items WHERE id = $1 AND status = 'approved'", [offer.item_id]); if (it) await nextBatch(it); }
    return { ok: true };
  }
  const check = await checkOfficerForShift(offer.officer_id, sh);
  if (check.blocking.length) fail(409, `No longer eligible: ${check.blocking.join('; ')}`);
  const full = await tx(async (t) => {
    const s = await t.one('SELECT * FROM shifts WHERE id = $1 FOR UPDATE', [sh.id]);
    if (s.status !== 'published') fail(409, 'This shift was cancelled');
    const filled = Number((await t.one(`SELECT count(*) AS n FROM shift_assignments WHERE shift_id = $1 AND status IN ${ACTIVE}`, [s.id])).n);
    if (filled >= s.headcount) {
      await t.q("UPDATE cover_offers SET status = 'filled_by_other', responded_at = now() WHERE id = $1", [offer.id]);
      return 'already';
    }
    await t.q(`INSERT INTO shift_assignments (shift_id, officer_id, status, responded_at) VALUES ($1,$2,'accepted',now())
               ON CONFLICT (shift_id, officer_id) DO UPDATE SET status = 'accepted', responded_at = now()`, [s.id, offer.officer_id]);
    await t.q("UPDATE cover_offers SET status = 'accepted', responded_at = now() WHERE id = $1", [offer.id]);
    return filled + 1 >= s.headcount;
  });
  if (full === 'already') fail(409, 'Already filled — thanks for looking');
  if (full) {
    const others = await q("UPDATE cover_offers SET status = 'filled_by_other', responded_at = now() WHERE shift_id = $1 AND status = 'offered' RETURNING id, officer_id", [sh.id]);
    for (const x of others) {
      const [uid] = await officerUser(x.officer_id);
      await closeQuick(uid, { ref: `offer:${x.id}`, used: 'filled' });
      await opsMessage(uid, `The cover shift at ${sh.venue_name} (${when(sh)}) has been taken. Thanks for looking.`);
    }
    await q("UPDATE ops_items SET status = 'done' WHERE kind = 'cover' AND shift_id = $1 AND status IN ('pending','approved')", [sh.id]);
  }
  await opsMessage(user.id, `It's yours: ${sh.venue_name} · ${when(sh)}. It is now on your rota.`);
  await coverFilledThreads(sh, firstLast(o));
  await notifyManagers(sh.venue_id, { kind: 'ops', title: `${firstLast(o)} took the cover shift`, body: `${sh.venue_name} · ${when(sh)}`, link: 'rota', dedupe: `took:${offer.id}` });
  await logActivity('offer', `${firstLast(o)} accepted cover at ${sh.venue_name} (${when(sh)})`, { ref_type: 'shift', ref_id: sh.id, venue_id: sh.venue_id });
  await audit(user, 'ops.offer_accept', 'shift', sh.id, { officer: offer.officer_id });
  return { ok: true };
}

const OPS_SETTINGS = ['ops_jobs', 'ops_escalate_minutes', 'ops_offer_wait_minutes', 'ops_reconcile_dow', 'ops_compliance_dow', 'ops_ai_cap_credits'];

export const actions = {
  'ops.inbox': def(MGR, async (b, { user }) => {
    const scope = await venueScope(user);
    const items = await q(
      `SELECT i.*, v.name AS venue_name, u.name AS decided_by_name FROM ops_items i LEFT JOIN venues v ON v.id = i.venue_id LEFT JOIN users u ON u.id = i.decided_by
        WHERE ($1::uuid[] IS NULL OR i.venue_id = ANY($1)) AND (CASE WHEN $2 = 'pending' THEN i.status = 'pending' ELSE i.status <> 'pending' END)
        ORDER BY i.created_at DESC LIMIT 80`, [scope, b.status === 'decided' ? 'decided' : 'pending']);
    const shiftIds = [...new Set(items.filter((i) => i.shift_id).map((i) => i.shift_id))];
    const shifts = shiftIds.length ? await q(
      `SELECT s.id, s.starts_at, s.ends_at, s.headcount, s.status, (SELECT count(*)::int FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ${ACTIVE}) AS filled
         FROM shifts s WHERE s.id = ANY($1::uuid[])`, [shiftIds]) : [];
    const offers = shiftIds.length ? await q(
      `SELECT c.item_id, c.status, o.first_name || ' ' || o.last_name AS name FROM cover_offers c JOIN officers o ON o.id = c.officer_id WHERE c.shift_id = ANY($1::uuid[])`, [shiftIds]) : [];
    const reqIds = items.map((i) => i.payload?.request_id).filter(Boolean);
    const reqs = reqIds.length ? await q('SELECT id, text, status, created_at FROM venue_requests WHERE id = ANY($1::uuid[])', [reqIds]) : [];
    return items.map((i) => ({
      ...i, shift: shifts.find((s) => s.id === i.shift_id) || null,
      offers: offers.filter((o) => o.item_id === i.id), request: reqs.find((r) => r.id === i.payload?.request_id) || null,
    }));
  }),

  'ops.count': def(MGR, async (_b, { user }) => {
    const scope = await venueScope(user);
    return one("SELECT count(*)::int AS n FROM ops_items WHERE status = 'pending' AND ($1::uuid[] IS NULL OR venue_id = ANY($1))", [scope]);
  }),

  'ops.activity': def(MGR, async (_b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT * FROM ops_activity WHERE kind NOT IN ('reconcile_run','compliance_run') AND ($1::uuid[] IS NULL OR venue_id = ANY($1) ${''}OR (venue_id IS NULL AND $2))
        ORDER BY created_at DESC LIMIT 150`, [scope, user.role === 'company']);
  }),

  'ops.decide': def(MGR, async (b, { user }) => {
    required(b, 'id', 'decision');
    const it = await scopedItem(user, b.id);
    if (it.status !== 'pending') fail(409, `Already ${it.status}`);
    let result;
    if (b.decision === 'reject') {
      if (it.kind === 'venue_request' && it.payload.request_id) {
        await q("UPDATE venue_requests SET status = 'declined', decline_reason = $2 WHERE id = $1 AND status = 'requested'", [it.payload.request_id, b.reason || '']);
        await notify(await venueContacts(it.venue_id), { kind: 'cover', title: 'Request declined', body: b.reason || 'Please contact us to discuss.', link: '/venue/messages', email: true });
      }
      result = { rejected: true, reason: b.reason || '' };
    } else if (b.decision === 'approve') {
      result = await { cover: decideCover, venue_request: decideVenueRequest, reconcile: decideReconcile, feedback: decideFeedback, compliance: decideCompliance }[it.kind](it, b, user);
    } else fail(400, 'decision must be approve or reject');
    const status = b.decision === 'reject' ? 'rejected' : it.kind === 'cover' ? 'approved' : 'done';
    await q('UPDATE ops_items SET status = $2, decided_by = $3, decided_at = now(), result = $4 WHERE id = $1', [it.id, status, user.id, result]);
    await audit(user, `ops.${b.decision}`, 'ops_item', it.id, { kind: it.kind, edits: b.edits, result });
    await logActivity('decision', `${user.name} ${b.decision === 'reject' ? 'rejected' : 'approved'}: ${it.title}`, { ref_type: 'ops_item', ref_id: it.id, venue_id: it.venue_id });
    return { ok: true, status, result };
  }),

  'ops.chat': def(MGR, async (b, { user }) => {
    required(b, 'messages');
    const s = await getSettings();
    if (!jobOn(s, 'chat')) fail(400, 'Ops AI chat is switched off in Settings');
    const now = new Date();
    const system = `You are Ops AI, the operations manager assistant inside Orb Security, a UK manned-security company. You help ${user.name} (${user.role === 'company' ? 'company manager' : 'security manager'}) run rotas, cover, attendance and hours.
Today is ${londonParts(now).weekday} ${londonDate(now)}, time ${fmtTime(now)} Europe/London. Weeks run Monday to Sunday.
Rules: use the tools to look things up — never guess figures. For licences, right to work or "who can work" questions use compliance_status; compliance fixes are approved on the compliance cards in the Ops AI inbox. You can NEVER change anything yourself: to make a change, call propose_change, which puts a card in the Ops AI inbox for the manager to approve, and say so.
Answer in short, plain British business English. Use the officers' and venues' names, dates like "Sat 24 Oct" and 24-hour times. No markdown tables; short lists are fine.`;
    const messages = b.messages.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) })).filter((m) => m.content);
    if (!messages.length || messages[messages.length - 1].role !== 'user') fail(400, 'Send a question');
    const created = [];
    let credits = 0;
    for (let round = 0; round < 7; round++) {
      const r = await claude({ model: SONNET, system, messages, tools: round < 6 ? CHAT_TOOLS : undefined, max_tokens: 1200 });
      credits += r.credits;
      const uses = (r.content || []).filter((c) => c.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !uses.length) {
        const reply = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
        const asked = String(b.messages.filter((m) => m.role === 'user').pop()?.content || '').slice(0, 140);
        await logActivity('chat', `${user.name} asked: ${asked}`, { credits });
        return { reply: reply || 'Done.', items: created, credits };
      }
      messages.push({ role: 'assistant', content: r.content });
      const results = [];
      for (const u of uses) {
        let out;
        try {
          out = await runTool(u.name, u.input || {}, user, created);
        } catch (e) {
          out = { error: e.message };
        }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 12000) });
      }
      messages.push({ role: 'user', content: results });
    }
    return { reply: 'That needed too many steps — try a narrower question.', items: created, credits };
  }),

  'ops.runNow': def(CO, async (b) => {
    const { runJobs } = await import('./jobs.mjs');
    const out = await runJobs();
    if (b.reconcile) out.reconcileNow = await runReconcile(b.start || addDays(londonDate(new Date()), -14), b.end || londonDate(new Date()));
    return out;
  }),

  'attendance.list': def(MGR, async (b, { user }) => {
    required(b, 'officer_id');
    await assertOfficerAccess(user, b.officer_id);
    const [events, rel, ratings] = await Promise.all([
      q(`SELECT e.*, s.starts_at, s.ends_at, v.name AS venue_name FROM attendance_events e JOIN shift_assignments a ON a.id = e.assignment_id
           JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id WHERE e.officer_id = $1 ORDER BY s.starts_at DESC LIMIT 100`, [b.officer_id]),
      reliability([b.officer_id]),
      q(`SELECT f.rating, f.note, f.answered_at, s.starts_at, v.name AS venue_name FROM venue_feedback f JOIN shifts s ON s.id = f.shift_id JOIN venues v ON v.id = f.venue_id
          WHERE f.officer_id = $1 AND f.rating IS NOT NULL ORDER BY f.answered_at DESC LIMIT 30`, [b.officer_id]),
    ]);
    const since = (days) => events.filter((e) => !e.excused && new Date(e.starts_at) > new Date(Date.now() - days * 86400000));
    const counts = (list) => Object.fromEntries(['late', 'no_show', 'left_early', 'cant_make_it'].map((k) => [k, list.filter((e) => e.kind === k).length]));
    const r = rel[b.officer_id];
    return {
      events, ratings, counts30: counts(since(30)), counts90: counts(since(90)),
      reliability: r?.rate ?? null, shifts90: r?.total || 0,
      avg_rating: ratings.length ? Math.round((ratings.reduce((a, x) => a + x.rating, 0) / ratings.length) * 10) / 10 : null,
    };
  }),

  'attendance.update': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const e = need(await one('SELECT * FROM attendance_events WHERE id = $1', [b.id]));
    await assertOfficerAccess(user, e.officer_id);
    const f = pick(b, ['excused', 'note']);
    await q('UPDATE attendance_events SET excused = COALESCE($2, excused), note = COALESCE($3, note) WHERE id = $1', [b.id, f.excused ?? null, f.note ?? null]);
    await audit(user, 'attendance.update', 'attendance_event', b.id, f);
    return { ok: true };
  }),

  'ops.settings.get': def(CO, async () => {
    const s = await getSettings();
    return { ...Object.fromEntries(OPS_SETTINGS.map((k) => [k, s[k]])), ops_ai_used: s.ops_ai_month === monthKey() ? Number(s.ops_ai_used) : 0, month: monthKey() };
  }),

  'ops.settings.save': def(CO, async (b, { user }) => {
    const f = pick(b, OPS_SETTINGS);
    for (const k of ['ops_reconcile_dow', 'ops_compliance_dow']) if (f[k] != null && !(f[k] >= 1 && f[k] <= 7)) fail(400, 'Day must be 1–7');
    for (const k of ['ops_escalate_minutes', 'ops_offer_wait_minutes']) if (f[k] != null && !(f[k] >= 1 && f[k] <= 240)) fail(400, 'Minutes must be 1–240');
    if (f.ops_ai_cap_credits != null && !(Number(f.ops_ai_cap_credits) >= 0)) fail(400, 'Cap must be 0 or more');
    const keys = Object.keys(f);
    if (keys.length) await q(`UPDATE settings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = 1`, keys.map((k) => f[k]));
    await audit(user, 'ops.settings', 'settings', 1, f);
    return actions['ops.settings.get'].fn({}, { user });
  }),

  // ----- Officers -----
  'ops.reply': def(['officer'], async (b, { user }) => officerReply(b, user)),

  'ops.myOffers': def(['officer'], async (_b, { user }) => {
    const oid = user.officer_id;
    const [chase, offers] = await Promise.all([
      q(`SELECT a.id AS assignment_id, a.reply, a.reply_eta_min, s.starts_at, s.ends_at, v.name AS venue_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
          WHERE a.officer_id = $1 AND a.chased_at IS NOT NULL AND a.status IN ${ACTIVE} AND s.status = 'published' AND s.ends_at > now() AND ${NO_CLOCK_IN}`, [oid]),
      q(`SELECT c.id, c.status, c.offered_at, s.id AS shift_id, s.starts_at, s.ends_at, s.headcount, r.name AS role_name, v.name AS venue_name, v.postcode
           FROM cover_offers c JOIN shifts s ON s.id = c.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
          WHERE c.officer_id = $1 AND s.status = 'published' AND s.ends_at > now() AND (c.status = 'offered' OR c.responded_at > now() - interval '2 days')
          ORDER BY c.status = 'offered' DESC, s.starts_at`, [oid]),
    ]);
    return { chase, offers };
  }),

  'ops.offerRespond': def(['officer'], async (b, { user }) => offerRespond(b, user)),

  // ----- Venues -----
  'venueRequests.create': def(['venue', 'company'], async (b, { user }) => {
    required(b, 'text');
    const s = await getSettings();
    if (!b.draft && !jobOn(s, 'venue_requests')) fail(400, 'Chat requests are switched off — please use Cover requests');
    const scope = await venueScope(user);
    const venueId = b.venue_id || (scope && scope[0]);
    need(venueId, 'No venue linked to your account');
    await assertVenue(user, venueId);
    const venue = await one('SELECT id, name FROM venues WHERE id = $1', [venueId]);
    const roles = await q('SELECT code, name FROM roles ORDER BY name');
    const upcoming = await q(
      `SELECT s.id, s.starts_at, s.ends_at, s.role, s.headcount FROM shifts s WHERE s.venue_id = $1 AND s.status = 'published' AND s.starts_at > now() AND s.starts_at < now() + interval '21 days' ORDER BY s.starts_at LIMIT 40`, [venueId]);
    const now = new Date();
    const today = londonDate(now);
    const system = `You read staffing requests from ${venue.name}, a client of Orb Security (UK). Today is ${londonParts(now).weekday} ${today}, Europe/London.
Roles (use the code): ${roles.map((r) => `${r.code} = ${r.name}`).join('; ')}. "Door staff"/"doormen"/"bouncers" = door. "Security"/"guard" = guard unless they say door.
Booked shifts at this venue (for change/cancel): ${upcoming.map((x) => `${x.id}: ${londonDate(x.starts_at)} ${fmtTime(x.starts_at)}-${fmtTime(x.ends_at)} ${x.role} x${x.headcount}`).join(' | ') || 'none'}.
"Saturday" means the next Saturday from today. "9pm–3am" means start 21:00, end 03:00 (next morning) — keep date as the start day.
If the date, times or number of officers are missing or ambiguous, use intent "unclear" and ask ONE short friendly question.`;
    const history = (b.history || []).slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1000) })).filter((m) => m.content);
    const messages = [...history, { role: 'user', content: String(b.text).slice(0, 2000) }];
    while (messages.length && messages[0].role !== 'user') messages.shift();
    const { input: parsed, credits } = await extract({ model: HAIKU, system, messages, tool: REQUEST_TOOL, max_tokens: 800 });
    // Draft: read a message into a cover request form for the person to check — nothing is filed
    if (b.draft) {
      const codes = roles.map((r) => r.code);
      const okRole = (r) => (codes.includes(r) ? r : codes.includes('door') ? 'door' : codes[0]);
      const hhmm = (t) => (/^\d{1,2}:\d{2}$/.test(t || '') ? t.padStart(5, '0') : '');
      const rec = parsed?.recurrence;
      if (rec?.days?.length) {
        return { status: 'draft', credits, draft: {
          venue_id: venueId, kind: 'recurring', role: okRole(rec.role || parsed.shifts?.[0]?.role), frequency: rec.frequency === 'fortnightly' ? 'fortnightly' : 'weekly',
          days: rec.days.filter((d) => d.dow >= 1 && d.dow <= 7).map((d) => ({ dow: d.dow, start: hhmm(d.start) || '21:00', end: hhmm(d.end) || '03:00', headcount: Math.max(1, d.headcount || 1) })),
          start_date: /^\d{4}-\d{2}-\d{2}$/.test(rec.start_date || '') && rec.start_date >= today ? rec.start_date : today,
          end_date: /^\d{4}-\d{2}-\d{2}$/.test(rec.end_date || '') ? rec.end_date : '', notes: parsed.summary || '',
        } };
      }
      const x = parsed?.shifts?.[0];
      return { status: 'draft', credits, draft: {
        venue_id: venueId, kind: 'one_off', role: okRole(x?.role), date: /^\d{4}-\d{2}-\d{2}$/.test(x?.date || '') && x.date >= today ? x.date : '',
        start: hhmm(x?.start), end: hhmm(x?.end), headcount: Math.max(1, x?.headcount || 1), notes: x?.notes || parsed?.summary || '',
      } };
    }
    if (parsed?.intent === 'unclear' || !parsed) return { status: 'question', reply: parsed?.question || 'Could you tell us the date, start and finish times, and how many officers you need?' };
    const v = validateRequest(parsed, { today, roles: roles.map((r) => r.code), shiftIds: upcoming.map((x) => x.id) });
    if (!v.ok) return { status: 'question', reply: v.errors.join(' ') };
    const fullText = [...history.filter((m) => m.role === 'user').map((m) => m.content), b.text].join('\n');
    const req = await insert('venue_requests', { venue_id: venueId, user_id: user.id, text: fullText, parsed });
    const lines = v.shifts.map((x) => {
      if (parsed.intent === 'cancel') { const u = upcoming.find((y) => y.id === x.shift_id); return `cancel ${fmtDate(u.starts_at)} ${fmtTime(u.starts_at)}`; }
      return `${x.headcount} × ${roles.find((r) => r.code === x.role)?.name || x.role} ${fmtDate(x.date)} ${x.start}–${x.end}`;
    });
    const it = await createItem({
      kind: 'venue_request', venue_id: venueId, title: `${venue.name}: ${parsed.intent === 'new' ? 'new shifts' : parsed.intent === 'change' ? 'change a shift' : 'cancel a shift'}`,
      reason: `${lines.join(', ')}. Asked by ${user.name}.`,
      payload: { request_id: req.id, intent: parsed.intent, shifts: v.shifts.map((x, i) => ({ ...x, role_name: roles.find((r) => r.code === x.role)?.name, label: lines[i] })), text: fullText },
      dedupe: `vreq:${req.id}`,
    });
    await q('UPDATE venue_requests SET item_id = $2 WHERE id = $1', [req.id, it.id]);
    await logActivity('venue_request', `Read a request from ${venue.name}: ${lines.join(', ')}`, { ref_type: 'venue_request', ref_id: req.id, venue_id: venueId, credits });
    return { status: 'requested', reply: `Thanks — request sent to Orb: ${lines.join(', ')}. We'll confirm shortly.`, request: req };
  }),

  'venueRequests.list': def(['venue', 'company', 'security'], async (_b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT r.id, r.text, r.parsed, r.status, r.decline_reason, r.created_at, v.name AS venue_name, u.name AS user_name FROM venue_requests r
         JOIN venues v ON v.id = r.venue_id LEFT JOIN users u ON u.id = r.user_id
        WHERE ($1::uuid[] IS NULL OR r.venue_id = ANY($1)) ORDER BY r.created_at DESC LIMIT 50`, [scope]);
  }),

  'feedback.pending': def(['venue'], async (_b, { user }) => {
    const scope = await venueScope(user);
    const rows = await q(
      `SELECT f.shift_id, f.officer_id, o.first_name || ' ' || left(o.last_name, 1) || '.' AS name, s.starts_at, s.ends_at, v.name AS venue_name, r.name AS role_name
         FROM venue_feedback f JOIN shifts s ON s.id = f.shift_id JOIN venues v ON v.id = f.venue_id JOIN officers o ON o.id = f.officer_id JOIN roles r ON r.code = s.role
        WHERE f.answered_at IS NULL AND f.venue_id = ANY($1::uuid[]) AND f.requested_at > now() - interval '7 days' ORDER BY s.starts_at DESC, o.first_name`, [scope]);
    const out = [];
    for (const r of rows) {
      let g = out.find((x) => x.shift_id === r.shift_id);
      if (!g) out.push(g = { shift_id: r.shift_id, starts_at: r.starts_at, ends_at: r.ends_at, venue_name: r.venue_name, role_name: r.role_name, officers: [] });
      g.officers.push({ officer_id: r.officer_id, name: r.name });
    }
    return out;
  }),

  'feedback.submit': def(['venue'], async (b, { user }) => {
    required(b, 'shift_id', 'ratings');
    const sh = await getShift(b.shift_id);
    await assertVenue(user, sh.venue_id);
    let flagged = 0;
    for (const r of b.ratings.slice(0, 30)) {
      const rating = Number(r.rating);
      if (!(rating >= 1 && rating <= 5)) fail(400, 'Ratings are 1 to 5 stars');
      const note = String(r.note || '').slice(0, 1000);
      const f = await one(
        `UPDATE venue_feedback SET rating = $3, note = $4, answered_at = now(), answered_by = $5 WHERE shift_id = $1 AND officer_id = $2 AND answered_at IS NULL RETURNING *`,
        [b.shift_id, r.officer_id, rating, note, user.id]);
      if (!f) continue;
      let problem = rating <= 2;
      let credits = 0;
      if (!problem && note.trim().length > 3) {
        try {
          const x = await extract({ model: HAIKU, system: 'You label venue feedback about a security officer. A problem is any complaint, safety, conduct, lateness, appearance or performance concern.', messages: [{ role: 'user', content: note }],
            tool: { name: 'label', description: 'Label the feedback', input_schema: { type: 'object', properties: { problem: { type: 'boolean' }, summary: { type: 'string' } }, required: ['problem'] } }, max_tokens: 200 });
          problem = !!x.input?.problem;
          credits = x.credits;
        } catch { /* cap reached or AI down: keep the rating-based rule */ }
      }
      const o = await one('SELECT first_name, last_name FROM officers WHERE id = $1', [r.officer_id]);
      if (problem) {
        await createItem({ kind: 'feedback', venue_id: sh.venue_id, shift_id: sh.id, officer_id: r.officer_id, severity: 'warning',
          title: `Feedback: ${firstLast(o)} rated ${rating}/5 at ${sh.venue_name}`, reason: note ? `"${note}" — ${user.name}` : `Rated ${rating}/5 by ${user.name} for ${when(sh)}.`,
          payload: { rating, note, feedback_id: f.id, shift: when(sh) }, dedupe: `fbk:${f.id}` });
        flagged++;
      }
      await logActivity('feedback', `${sh.venue_name} rated ${firstLast(o)} ${rating}/5`, { venue_id: sh.venue_id, credits });
    }
    return { ok: true, flagged };
  }),

  // Officers who worked at the venue in the last 7 days, for a rating at any time
  'feedback.recentOfficers': def(['venue'], async (_b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT DISTINCT ON (a.officer_id) a.officer_id, o.first_name || ' ' || left(o.last_name, 1) || '.' AS name, s.id AS shift_id, s.starts_at, v.name AS venue_name,
              (SELECT rating FROM venue_feedback f WHERE f.officer_id = a.officer_id AND f.venue_id = s.venue_id AND f.rating IS NOT NULL ORDER BY answered_at DESC LIMIT 1) AS last_rating
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN officers o ON o.id = a.officer_id JOIN venues v ON v.id = s.venue_id
        WHERE s.venue_id = ANY($1::uuid[]) AND s.starts_at > now() - interval '7 days' AND s.starts_at < now()
          AND EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual'))
        ORDER BY a.officer_id, s.starts_at DESC`, [scope]);
  }),

  'feedback.submitAdhoc': def(['venue'], async (b, { user }) => {
    required(b, 'officer_id', 'rating');
    const rating = Number(b.rating);
    if (!(rating >= 1 && rating <= 5)) fail(400, 'Ratings are 1 to 5 stars');
    const note = String(b.note || '').slice(0, 1000);
    const scope = await venueScope(user);
    const last = need(await one(
      `SELECT s.id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
        WHERE a.officer_id = $1 AND s.venue_id = ANY($2::uuid[]) AND s.starts_at > now() - interval '7 days' AND s.starts_at < now()
          AND EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual'))
        ORDER BY s.starts_at DESC LIMIT 1`, [b.officer_id, scope]), 'This officer has not worked here in the last 7 days');
    const sh = await getShift(last.id);
    const f = await one(
      `INSERT INTO venue_feedback (shift_id, venue_id, officer_id, rating, note, answered_at, answered_by, adhoc) VALUES ($1,$2,$3,$4,$5,now(),$6,true)
       ON CONFLICT (shift_id, officer_id) DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note, answered_at = now(), answered_by = EXCLUDED.answered_by
       RETURNING *`, [sh.id, sh.venue_id, b.officer_id, rating, note, user.id]);
    const o = await one('SELECT first_name, last_name FROM officers WHERE id = $1', [b.officer_id]);
    if (rating <= 2) {
      await createItem({ kind: 'feedback', venue_id: sh.venue_id, shift_id: sh.id, officer_id: b.officer_id, severity: 'warning',
        title: `Feedback: ${firstLast(o)} rated ${rating}/5 at ${sh.venue_name}`, reason: note ? `"${note}" — ${user.name}` : `Rated ${rating}/5 by ${user.name}.`,
        payload: { rating, note, feedback_id: f.id, shift: when(sh) }, dedupe: `fbk:${f.id}:${rating}` });
    }
    await logActivity('feedback', `${sh.venue_name} rated ${firstLast(o)} ${rating}/5`, { venue_id: sh.venue_id });
    return { ok: true };
  }),
};
