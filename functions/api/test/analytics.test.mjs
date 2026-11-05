import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prevRange, checkRange, pctChange, per1000, weekdayBuckets, hourBuckets, spanDays } from '../lib/analytics.mjs';
import { withChange } from '../modules/analytics.mjs';
import { canCount } from '../modules/shiftlog.mjs';

test('prevRange is the same length, ending the day before', () => {
  assert.deepEqual(prevRange('2026-10-09', '2026-11-05'), { from: '2026-09-11', to: '2026-10-08' });
  assert.deepEqual(prevRange('2026-11-01', '2026-11-01'), { from: '2026-10-31', to: '2026-10-31' });
  assert.equal(spanDays('2026-03-01', '2026-03-31'), 31);
});

test('checkRange rejects bad or reversed ranges', () => {
  assert.equal(checkRange('2026-11-01', '2026-11-30'), null);
  assert.match(checkRange('', '2026-11-30'), /date range/);
  assert.match(checkRange('2026-11-30', '2026-11-01'), /before/);
  assert.match(checkRange('2024-01-01', '2026-01-01'), /year/);
});

test('pctChange and per1000 handle missing figures', () => {
  assert.equal(pctChange(12, 10), 20);
  assert.equal(pctChange(5, 10), -50);
  assert.equal(pctChange(3, 0), null);
  assert.equal(pctChange(null, 4), null);
  assert.equal(per1000(3, 1200), 2.5);
  assert.equal(per1000(3, 0), null);
});

test('weekday and hour buckets fill the gaps', () => {
  const w = weekdayBuckets([{ dow: 5, n: 4 }, { dow: 6, n: 9 }]);
  assert.equal(w.length, 7);
  assert.deepEqual(w[4], { label: 'Fri', value: 4 });
  assert.equal(w[0].value, 0);
  const h = hourBuckets([{ hour: 23, n: 2 }]);
  assert.equal(h.length, 24);
  assert.deepEqual(h[23], { hour: 23, n: 2 });
});

test('withChange adds the previous figures and % change', () => {
  const sec = (x) => ({ attendance: { late: x }, incidents: { total: x }, satisfaction: { avg: x }, customers: { total: x } });
  const out = withChange(sec(15), sec(10));
  assert.equal(out.attendance.prev.late, 10);
  assert.equal(out.attendance.change.late, 50);
  assert.equal(out.customers.change.total, 50);
});

test('canCount: lead from clock-in to 12h after, venue 7 days, manager always', () => {
  const end = Date.parse('2026-11-01T03:00:00Z');
  assert.equal(canCount({ access: 'lead', endsAt: end, clockedIn: false, now: end - 3600e3 }), false);
  assert.equal(canCount({ access: 'lead', endsAt: end, clockedIn: true, now: end + 11 * 3600e3 }), true);
  assert.equal(canCount({ access: 'lead', endsAt: end, clockedIn: true, now: end + 13 * 3600e3 }), false);
  assert.equal(canCount({ access: 'officer', endsAt: end, clockedIn: true, now: end }), false);
  assert.equal(canCount({ access: 'venue', endsAt: end, now: end + 6 * 86400e3 }), true);
  assert.equal(canCount({ access: 'venue', endsAt: end, now: end + 8 * 86400e3 }), false);
  assert.equal(canCount({ access: 'mgr', endsAt: end, now: end + 90 * 86400e3 }), true);
});
