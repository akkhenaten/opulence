// The timesheet table and the pipeline rules behind it (spec: timesheets as a day-by-day table, §5)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rowState, redactMoney, afterRebuild, missingRates, payAmount, chargeAmount, totals, pickOfficerRate, pickVenueRate, moneyFor,
} from '../lib/timesheetState.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const H = 3600000;
const now = Date.parse('2026-11-07T20:00:00Z');

test('every booked shift has a state: upcoming, live, no-show, and each review status', () => {
  const later = new Date(now + 4 * H).toISOString();
  const ended = new Date(now - H).toISOString();
  assert.equal(rowState({ status: null, has_in: false, ends_at: later }, now), 'confirmed');
  assert.equal(rowState({ status: null, has_in: true, ends_at: later }, now), 'live');
  assert.equal(rowState({ status: null, has_in: false, ends_at: ended }, now), 'no_clock_in', 'a no-show stays visible, never drops off');
  assert.equal(rowState({ status: null, has_in: true, ends_at: ended }, now), 'live', 'clocked in, timesheet not built yet');
  for (const [status, state] of [['pending', 'awaiting'], ['disputed', 'queried'], ['approved', 'approved'], ['signed', 'signed'], ['declined', 'declined']]) {
    assert.equal(rowState({ status, ends_at: ended }, now), state);
  }
  assert.equal(rowState({ status: 'signed', locked: true, ends_at: ended }, now), 'locked');
  assert.equal(rowState({ status: 'approved', cancelled: true, ends_at: ended }, now), 'cancelled');
  assert.equal(rowState({ status: 'declined', cancelled: true, ends_at: ended }, now), 'declined');
});

test('money by role: venue sees the charge, security the officer rate (with pay access), company both', () => {
  const row = { id: 1, hours: 6, charge_rate: 24, charge_total: 144, charge_rate_set: false, charge_estimate: false, pay_rate: 14, pay_total: 84, pay_rate_set: true, pay_estimate: false, rate_note: 'agreed' };
  const venue = redactMoney(row, { role: 'venue' });
  assert.equal(venue.charge_rate, 24);
  assert.ok(!('pay_rate' in venue) && !('pay_total' in venue) && !('rate_note' in venue));
  const sec = redactMoney(row, { role: 'security', can_see_pay: true });
  assert.equal(sec.pay_rate, 14);
  assert.ok(!('charge_rate' in sec) && !('charge_total' in sec));
  const secNoPay = redactMoney(row, { role: 'security', can_see_pay: false });
  assert.ok(!('pay_rate' in secNoPay) && !('charge_rate' in secNoPay));
  assert.deepEqual(redactMoney(row, { role: 'company' }), row);
  assert.deepEqual(moneyFor({ role: 'officer' }), { charge: false, pay: false });
});

test('approval is never silently undone by a clock rebuild', () => {
  const approved = { status: 'approved', hours: 6, actual_start: '2026-11-06T20:00:00Z', actual_end: '2026-11-07T02:00:00Z' };
  assert.deepEqual(afterRebuild(approved, { ...approved }), { status: 'approved', note: null });
  const moved = afterRebuild(approved, { ...approved, hours: 6.5, actual_end: '2026-11-07T02:30:00Z' });
  assert.equal(moved.status, 'disputed');
  assert.match(moved.note, /after approval \(was 6h, now 6.5h\)/);
  assert.equal(afterRebuild({ ...approved, status: 'signed' }, { ...approved, hours: 5 }).status, 'disputed');
  assert.equal(afterRebuild({ ...approved, status: 'declined' }, { ...approved, hours: 5 }).status, 'declined');
  assert.equal(afterRebuild({ ...approved, status: 'disputed' }, { ...approved, hours: 5 }).status, 'disputed');
  assert.equal(afterRebuild(null, approved).status, 'pending');
  // Same instant written two ways is not a change
  assert.equal(afterRebuild(approved, { ...approved, actual_start: new Date('2026-11-06T20:00:00Z') }).status, 'approved');
});

test('a missing rate blocks approval instead of a £0 line', () => {
  assert.deepEqual(missingRates({ charge_rate: 24, pay_rate: 14 }), []);
  assert.deepEqual(missingRates({ charge_rate: null, pay_rate: 14 }), ['charge']);
  assert.deepEqual(missingRates({ charge_rate: 24, pay_rate: null }), ['pay']);
  assert.equal(payAmount(6, { normal: 1 }, null, {}), null);
});

test('one sum for the table, the pay run and the invoice: minimum hours and uplifts', () => {
  const fr = { normal: 0.5, night: 0.5, weekend: 0, bh: 0 };
  const vr = { rate: 20, min_hours: 4, night_uplift: 10, weekend_uplift: 0, bh_uplift: 50 };
  assert.deepEqual(chargeAmount(3, fr, 20, vr), { billable: 4, amount: 84 });
  assert.equal(chargeAmount(6, fr, 30, vr).amount, 189, 'an override rate is the base; the card keeps its uplifts');
  assert.deepEqual(chargeAmount(6, fr, null, null), { billable: 6, amount: null });
  assert.equal(payAmount(6, fr, 14, { pay_night_uplift: 0 }), 84);
});

test('totals count worked rows only (declined, cancelled and upcoming add nothing)', () => {
  const rows = [
    { state: 'approved', hours: 6, charge_total: 144, pay_total: 84 },
    { state: 'awaiting', hours: 4.5, charge_total: 108, pay_total: 63 },
    { state: 'declined', hours: 6, charge_total: 144, pay_total: 84 },
    { state: 'cancelled', hours: 6, charge_total: 144, pay_total: 84 },
    { state: 'confirmed', hours: null },
    { state: 'no_clock_in', hours: 0 },
  ];
  assert.deepEqual(totals(rows), { rows: 2, hours: 10.5, charge: 252, pay: 147 });
});

test('rate cards resolve like money.mjs: venue-specific first, then the latest effective', () => {
  const list = [
    { officer_id: 'o', role: 'ds', venue_id: null, rate: 13, effective_from: '2026-01-01' },
    { officer_id: 'o', role: 'ds', venue_id: null, rate: 14, effective_from: '2026-06-01' },
    { officer_id: 'o', role: 'ds', venue_id: 'v', rate: 15, effective_from: '2026-03-01' },
    { officer_id: 'o', role: 'ds', venue_id: 'v', rate: 16, effective_from: '2026-12-01' },
  ];
  assert.equal(pickOfficerRate(list, { officer_id: 'o', role: 'ds', venue_id: 'v', date: '2026-11-07' }), 15);
  assert.equal(pickOfficerRate(list, { officer_id: 'o', role: 'ds', venue_id: 'x', date: '2026-11-07' }), 14);
  assert.equal(pickOfficerRate(list, { officer_id: 'o', role: 'ss', venue_id: 'v', date: '2026-11-07' }), null);
  const vr = [{ venue_id: 'v', role: 'ds', rate: 22, effective_from: '2026-01-01' }, { venue_id: 'v', role: 'ds', rate: 24, effective_from: '2026-10-01' }];
  assert.equal(pickVenueRate(vr, { venue_id: 'v', role: 'ds', date: '2026-11-07' }).rate, 24);
  assert.equal(pickVenueRate(vr, { venue_id: 'v', role: 'ds', date: '2026-09-07' }).rate, 22);
});

test('pipeline: cancelled work is declined in one place, and undone if the officer is put back', () => {
  const sql = read('../db/migrations/046_timesheet_table.sql');
  assert.match(sql, /'pending','approved','signed','disputed','declined'/);
  assert.match(sql, /AFTER UPDATE OF status ON shift_assignments/);
  assert.match(sql, /AFTER UPDATE OF status ON shifts/);
  assert.match(sql, /decline_reason = 'Shift cancelled'/);
  assert.match(sql, /cancelled_after_billing/, 'already billed: flagged for a credit, not silently changed');
  assert.match(sql, /statement_id IS NULL AND invoice_id IS NULL/);
});

test('pipeline: approved timesheets sit on drafts at the rates fixed on approval; only signed ones are billed or paid', () => {
  const money = read('../modules/money.mjs');
  const feed = read('../modules/moneyFeed.mjs');
  assert.match(money, /t\.pay_rate != null \? Number\(t\.pay_rate\)/);
  assert.match(money, /t\.charge_rate != null \? Number\(t\.charge_rate\)/);
  // The feed is the one way timesheets reach drafts (one line each, linked in the same transaction); generate just runs it
  assert.match(feed, /UPDATE timesheets SET invoice_id = \$2 WHERE id = \$1/);
  assert.match(feed, /UPDATE timesheets SET statement_id = \$2 WHERE id = \$1/);
  assert.doesNotMatch(money, /INSERT INTO invoice_lines \(invoice_id, timesheet_id/);
  // Unlinking never changes the timesheet's status: the link is cleared and the feed looks again
  for (const src of [money, feed, read('../modules/payruns.mjs')]) {
    for (const m of src.matchAll(/UPDATE timesheets SET \$?\{?[^=]*(statement_id|invoice_id)'?\}? = NULL[^'`]*/g)) assert.doesNotMatch(m[0], /status/);
  }
});

test('pipeline: approve fixes the rates and refuses cancelled work; a rebuild uses afterRebuild', () => {
  const ts = read('../modules/timesheets.mjs');
  assert.match(ts, /charge_rate = x\.c, pay_rate = x\.p/);
  assert.match(ts, /t\.status === 'pending' && !t\.locked && !t\.cancelled/);
  assert.match(ts, /'timesheets\.dispute': def\(\['venue', 'company', 'security'\]/, 'security managers can query');
  const clock = read('../modules/clock.mjs');
  assert.match(clock, /afterRebuild\(existing/);
  assert.doesNotMatch(clock, /ELSE 'pending' END/);
});

test('venue logins: timesheets.list redacts the officer rate, rates are per role, venue rota reaches management as cover requests', () => {
  const ts = read('../modules/timesheets.mjs');
  assert.match(ts, /user\.role === 'officer' \? out : out\.map\(\(r\) => redactMoney\(r, user\)\)/);
  const venue = redactMoney({ charge_rate: 20, pay_rate: 13, pay_amount: 104, charge_amount: 160 }, { role: 'venue' });
  assert.equal(venue.pay_rate, undefined);
  assert.equal(venue.charge_rate, 20);
  const v = read('../modules/venues.mjs');
  assert.match(v, /'venues\.rateGaps': def\(CO,/);
  assert.match(v, /'venues\.saveRate': def\(CO,/);
  const cover = read('../modules/cover.mjs');
  assert.ok(!cover.includes("'/venue/cover'"), 'venue notifications open the rota');
  assert.ok(cover.includes("'/venue/rota?tab=requests'"));
});
