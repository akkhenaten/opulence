// The rules behind the timesheet table: one state per row, who sees which money, what a clock rebuild may do to a reviewed
// timesheet, and the one place pay and charge amounts are worked out (the table, pay runs and invoices all use these).
import { bandedAmount, money } from './rates.mjs';

const BY_STATUS = { pending: 'awaiting', disputed: 'queried', approved: 'approved', signed: 'signed', declined: 'declined' };

/** Row state for the table. r: { status (timesheet, or null), locked, cancelled, has_in, starts_at, ends_at } */
export function rowState(r, now = Date.now()) {
  if (r.status) {
    if (r.locked) return 'locked';
    if (r.cancelled && r.status !== 'declined') return 'cancelled';
    return BY_STATUS[r.status] || 'awaiting';
  }
  if (r.has_in) return 'live';
  if (now < new Date(r.ends_at).getTime()) return 'confirmed';
  return 'no_clock_in';
}

/** States that still need a manager (the week strip's "to review") */
export const NEEDS_REVIEW = new Set(['awaiting', 'queried', 'no_clock_in', 'cancelled']);
/** States whose hours and money count in the day and week totals */
export const COUNTED = new Set(['awaiting', 'queried', 'approved', 'signed', 'locked']);

const CHARGE = ['charge_rate', 'charge_total', 'charge_rate_set', 'charge_estimate'];
const PAY = ['pay_rate', 'pay_total', 'pay_rate_set', 'pay_estimate'];

/** What money a role may see: venues the charge, security managers the officer rate (with pay access), company both, officers neither */
export function moneyFor(user) {
  if (user.role === 'company') return { charge: true, pay: true };
  if (user.role === 'venue') return { charge: true, pay: false };
  if (user.role === 'security') return { charge: false, pay: !!user.can_see_pay };
  return { charge: false, pay: false };
}

export function redactMoney(row, user) {
  const see = moneyFor(user);
  const out = { ...row };
  if (!see.charge) for (const k of CHARGE) delete out[k];
  if (!see.pay) for (const k of PAY) delete out[k];
  if (!see.charge || !see.pay) delete out.rate_note;
  return out;
}

const same = (a, b) => (a == null && b == null) || (a != null && b != null && new Date(a).getTime() === new Date(b).getTime());

/**
 * What a rebuild from clock events does to an existing timesheet's status.
 * A reviewed timesheet is never silently sent back: if its times change it becomes a query with a note saying what moved.
 */
export function afterRebuild(existing, next) {
  if (!existing) return { status: 'pending', note: null };
  if (existing.status === 'declined') return { status: 'declined', note: null };
  if (existing.status === 'disputed') return { status: 'disputed', note: null };
  if (existing.status === 'pending') return { status: 'pending', note: null };
  const changed = Number(existing.hours) !== Number(next.hours) || !same(existing.actual_start, next.actual_start) || !same(existing.actual_end, next.actual_end);
  if (!changed) return { status: existing.status, note: null };
  return { status: 'disputed', note: `Clock record changed after ${existing.status === 'signed' ? 'sign-off' : 'approval'} (was ${Number(existing.hours)}h, now ${Number(next.hours)}h)` };
}

/** Which rates a timesheet is missing; Approve refuses until both are there */
export const missingRates = (r) => [r.charge_rate == null && 'charge', r.pay_rate == null && 'pay'].filter(Boolean);

/** Officer pay for a shift: base rate across night / weekend / bank-holiday bands with the pay uplifts from settings */
export function payAmount(hours, fractions, rate, s) {
  if (rate == null) return null;
  return bandedAmount(Number(hours), fractions, Number(rate), { night: s.pay_night_uplift, weekend: s.pay_weekend_uplift, bh: s.pay_bh_uplift });
}

/** Venue charge: the venue's minimum hours, then base rate across bands with the venue's uplifts */
export function chargeAmount(hours, fractions, base, vr) {
  const billable = Math.max(Number(hours), vr ? Number(vr.min_hours || 0) : 0);
  if (base == null) return { billable, amount: null };
  return { billable, amount: bandedAmount(billable, fractions, Number(base), { night: vr?.night_uplift, weekend: vr?.weekend_uplift, bh: vr?.bh_uplift }) };
}

/** Day and week totals over the counted rows (declined, cancelled and not-yet-worked rows add nothing) */
export function totals(rows) {
  const t = { hours: 0, charge: 0, pay: 0, rows: 0 };
  for (const r of rows) {
    if (!COUNTED.has(r.state)) continue;
    t.rows++;
    t.hours += Number(r.hours || 0);
    t.charge += Number(r.charge_total || 0);
    t.pay += Number(r.pay_total || 0);
  }
  return { rows: t.rows, hours: money(t.hours), charge: money(t.charge), pay: money(t.pay) };
}

/** The officer rate on a date: venue-specific beats general, then the latest effective (same order as money.officerRate) */
export function pickOfficerRate(list, { officer_id, role, venue_id, date }) {
  const hit = list.filter((r) => r.officer_id === officer_id && r.role === role && (r.venue_id == null || r.venue_id === venue_id) && r.effective_from <= date)
    .sort((a, b) => (a.venue_id == null) - (b.venue_id == null) || (a.effective_from < b.effective_from ? 1 : -1))[0];
  return hit ? Number(hit.rate) : null;
}

/** The venue rate card row on a date (same order as money.venueRate) */
export function pickVenueRate(list, { venue_id, role, date }) {
  return list.filter((r) => r.venue_id === venue_id && r.role === role && r.effective_from <= date)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0] || null;
}

export const DECLINE_REASONS = ['No-show', 'Sent home', 'Wrong booking', 'Duplicate', 'Shift cancelled'];
