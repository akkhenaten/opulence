// The rules behind the live money feed: an approved timesheet sits on a draft invoice and a draft pay statement straight away,
// follows every later change while the draft is open, and is only billed or paid once the venue has signed it off.
import { addDays } from './time.mjs';

// Fortnights run Monday to Sunday from a fixed Monday, so every fortnight is the same two weeks whatever day you ask
const FORTNIGHT_ANCHOR = '2024-01-01';

const dayNo = (iso) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 86400000);

/** The period (weekly, fortnightly or monthly) that contains a date */
export function periodFor(kind, date) {
  if (kind === 'monthly') {
    const [y, m] = date.split('-').map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { start: `${date.slice(0, 7)}-01`, end };
  }
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = addDays(date, -dow);
  if (kind === 'fortnightly') {
    const off = ((dayNo(monday) - dayNo(FORTNIGHT_ANCHOR)) % 14 + 14) % 14;
    const start = addDays(monday, -off);
    return { start, end: addDays(start, 13) };
  }
  return { start: monday, end: addDays(monday, 6) };
}

export const nextPeriod = (kind, p) => periodFor(kind, addDays(p.end, 1));

const iso = (d) => (d == null ? null : String(d instanceof Date ? d.toISOString() : d).slice(0, 10));
const covers = (c, date) => iso(c.period_start) <= date && date <= iso(c.period_end);
const overlaps = (c, p) => iso(c.period_start) <= p.end && iso(c.period_end) >= p.start;

/** Wanted on a draft: approved or signed, and the shift still on */
export const wanted = (ts) => ['approved', 'signed'].includes(ts.status) && !ts.cancelled;

/** Billed: on an issued invoice, or on a statement that is issued or whose pay run has left draft. Billed lines never move. */
export const billed = (r) => !!((r.invoice_id && r.invoice_status && r.invoice_status !== 'draft')
  || (r.statement_id && ((r.statement_status && r.statement_status !== 'draft') || (r.run_status && r.run_status !== 'draft'))));

/**
 * Where a line for `date` goes.
 * drafts: open drafts for this venue / officer ({ id, period_start, period_end }); closed: issued (or past-draft) ones.
 * 1. the draft whose period holds the date; 2. a new draft for that period if nothing has been issued for it;
 * 3. late (the period is already issued): the latest open draft, else a new draft for the current period, stepping on past issued ones.
 */
export function pickTarget({ kind, date, today, drafts, closed }) {
  const own = drafts.find((d) => covers(d, date));
  if (own) return { use: own.id, late: false };
  if (!closed.some((c) => covers(c, date))) return { create: periodFor(kind, date), late: false };
  const later = drafts.filter((d) => iso(d.period_end) >= date).sort((a, b) => iso(b.period_end).localeCompare(iso(a.period_end)))[0];
  if (later) return { use: later.id, late: true };
  let p = periodFor(kind, today > date ? today : date);
  for (let i = 0; i < 60 && closed.some((c) => overlaps(c, p)); i++) p = nextPeriod(kind, p);
  return { create: p, late: true };
}

/** A line is late when its shift date falls before the draft's period (it missed its own, already issued period) */
export const isLate = (workDate, container) => !!(workDate && container?.period_start && iso(workDate) < iso(container.period_start));

/** Only signed lines are billed or paid; returns the timesheet lines to move on to the next draft at issue */
export const unsignedLines = (lines) => lines.filter((l) => l.timesheet_id && l.ts_status !== 'signed');

/** Whether a stored line differs from freshly worked-out values (numbers compared to the penny / hundredth of an hour) */
export function lineChanged(cur, next) {
  for (const k of Object.keys(next)) {
    const a = cur[k];
    const b = next[k];
    if (typeof b === 'number' || (b != null && typeof a === 'number')) {
      if (Math.round(Number(a ?? 0) * 100) !== Math.round(Number(b ?? 0) * 100)) return true;
    } else if (k === 'work_date' ? iso(a) !== iso(b) : String(a ?? '') !== String(b ?? '')) return true;
  }
  return false;
}
