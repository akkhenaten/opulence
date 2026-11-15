import { fmtDate } from './time.mjs';

const TZ = 'Europe/London';
const same = (a, b) => (a ?? '') === (b ?? '') || ((typeof a === 'boolean' || typeof b === 'boolean') && !!a === !!b);

/** What a login change did, for the audit entry: the old value of each field that really changed,
 *  and the venues gained and lost by name (the venue page removes people through the same update). */
export function accessChanges(before = {}, fields = {}, venuesBefore = [], venuesAfter = []) {
  const prev = {};
  for (const [k, v] of Object.entries(fields)) if (!same(before[k], v)) prev[k] = before[k] ?? null;
  const out = {};
  if (Object.keys(prev).length) out.before = prev;
  const added = venuesAfter.filter((n) => !venuesBefore.includes(n));
  const removed = venuesBefore.filter((n) => !venuesAfter.includes(n));
  if (added.length) out.venues_added = added;
  if (removed.length) out.venues_removed = removed;
  return out;
}

/** Disabling the last active company manager would leave nobody to run the company (the platform admin doesn't count).
 *  otherActive: active company managers other than the target, platform admin left out. */
export const blocksLastCompanyManager = ({ target, status, otherActive }) =>
  !!target && target.role === 'company' && target.status === 'active' && status === 'disabled' && !target.platform && otherActive === 0;

const day = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

/** The alert to managers when an officer marks themselves unavailable over shifts they already accepted */
export function unavailableClashNotice(name, from, to, booked = []) {
  if (!booked.length) return null;
  const dates = from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;
  const [first, ...more] = booked;
  return {
    title: 'Unavailable on a booked shift',
    body: `${name} marked unavailable ${dates}: booked ${day(first.starts_at)} at ${first.venue_name}${more.length ? ` and ${more.length} more` : ''}. Nothing was cancelled.`,
  };
}
