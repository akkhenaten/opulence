// Pure helpers for the Analytics module: periods, changes and rates
import { addDays } from './time.mjs';

const DAY = 86400e3;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Days from `from` to `to`, both counted. */
export const spanDays = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY) + 1;

/** The period of the same length that ends the day before `from`. */
export function prevRange(from, to) {
  const n = spanDays(from, to);
  const pto = addDays(from, -1);
  return { from: addDays(pto, -(n - 1)), to: pto };
}

/** Checked range: London dates, from ≤ to, at most a year and a bit. */
export function checkRange(from, to) {
  if (!ISO.test(from || '') || !ISO.test(to || '')) return 'Choose a date range';
  const n = spanDays(from, to);
  if (n < 1) return 'The start date must be before the end date';
  if (n > 400) return 'Choose a range of up to a year';
  return null;
}

/** Percentage change from `prev` to `cur`; null when there is nothing to compare with. */
export function pctChange(cur, prev) {
  if (cur == null || prev == null || !Number(prev)) return null;
  return Math.round(((Number(cur) - Number(prev)) / Math.abs(Number(prev))) * 100);
}

/** Incidents per 1,000 customers, one decimal; null without customer numbers. */
export function per1000(incidents, customers) {
  if (!Number(customers)) return null;
  return Math.round((Number(incidents) / Number(customers)) * 10000) / 10;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Rows of { dow: 1..7 (ISO, Monday = 1), n } → all seven days in order, missing days as 0. */
export function weekdayBuckets(rows, key = 'n') {
  const by = Object.fromEntries((rows || []).map((r) => [Number(r.dow), Number(r[key]) || 0]));
  return WEEKDAYS.map((label, i) => ({ label, value: by[i + 1] || 0 }));
}

/** Rows of { hour, n } → 24 hours, missing hours as 0. */
export function hourBuckets(rows) {
  const by = Object.fromEntries((rows || []).map((r) => [Number(r.hour), Number(r.n) || 0]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, n: by[hour] || 0 }));
}

/** Average to one decimal, null for no values. */
export const avg1 = (sum, n) => (Number(n) ? Math.round((Number(sum) / Number(n)) * 10) / 10 : null);
