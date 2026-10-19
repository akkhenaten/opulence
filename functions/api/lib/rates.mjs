import { londonParts } from './time.mjs';

const SLOT_MIN = 15;

export function roundHours(start, end, breakMinutes = 0, roundingMinutes = 15) {
  const minutes = Math.max(0, (new Date(end) - new Date(start)) / 60000 - (breakMinutes || 0));
  const r = roundingMinutes > 0 ? Math.round(minutes / roundingMinutes) * roundingMinutes : minutes;
  return Math.round((r / 60) * 100) / 100;
}

// Fraction of the shift falling into each band (by London local time). Highest band wins: bh > weekend > night > normal.
export function bandFractions(start, end, { night_start = 22, night_end = 6 } = {}, bankHolidays = new Set()) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const counts = { normal: 0, night: 0, weekend: 0, bh: 0 };
  let total = 0;
  for (let t = s; t < e; t += SLOT_MIN * 60000) {
    const p = londonParts(t);
    let band = 'normal';
    if (bankHolidays.has(p.date)) band = 'bh';
    else if (p.weekday === 'Sat' || p.weekday === 'Sun') band = 'weekend';
    else if (night_start > night_end ? p.hour >= night_start || p.hour < night_end : p.hour >= night_start && p.hour < night_end) band = 'night';
    const w = Math.min(SLOT_MIN, (e - t) / 60000);
    counts[band] += w;
    total += w;
  }
  if (!total) return { normal: 1, night: 0, weekend: 0, bh: 0 };
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / total]));
}

// Money for `hours` at `base`, spread across bands with percentage uplifts.
export function bandedAmount(hours, fractions, base, { night = 0, weekend = 0, bh = 0 } = {}) {
  const up = { normal: 0, night, weekend, bh };
  let amount = 0;
  for (const band of Object.keys(fractions)) amount += hours * fractions[band] * base * (1 + Number(up[band] || 0) / 100);
  return Math.round(amount * 100) / 100;
}

export const money = (n) => Math.round(Number(n || 0) * 100) / 100;
export const gbp = (n) => `£${money(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
