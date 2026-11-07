// Invoices fed live from approved timesheets (spec: invoices fed live from approved timesheets)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { periodFor, nextPeriod, wanted, billed, pickTarget, isLate, unsignedLines, lineChanged } from '../lib/moneyFeedRules.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('periods: weeks run Monday to Sunday, fortnights from a fixed Monday, months are calendar months', () => {
  assert.deepEqual(periodFor('weekly', '2026-11-07'), { start: '2026-11-02', end: '2026-11-08' });
  assert.deepEqual(periodFor('weekly', '2026-11-02'), { start: '2026-11-02', end: '2026-11-08' });
  assert.deepEqual(periodFor('weekly', '2026-11-08'), { start: '2026-11-02', end: '2026-11-08' });
  assert.deepEqual(periodFor('monthly', '2026-02-14'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodFor('monthly', '2026-12-31'), { start: '2026-12-01', end: '2026-12-31' });
  const f = periodFor('fortnightly', '2026-11-07');
  assert.equal((Date.parse(f.end) - Date.parse(f.start)) / 86400000, 13);
  assert.ok(f.start <= '2026-11-07' && '2026-11-07' <= f.end);
  assert.deepEqual(periodFor('fortnightly', f.start), f, 'every day of a fortnight gives the same fortnight');
  assert.deepEqual(periodFor('fortnightly', f.end), f);
  assert.deepEqual(nextPeriod('weekly', { start: '2026-11-02', end: '2026-11-08' }), { start: '2026-11-09', end: '2026-11-15' });
});

test('a line is wanted once approved or signed, while the shift is on', () => {
  assert.equal(wanted({ status: 'approved' }), true);
  assert.equal(wanted({ status: 'signed' }), true);
  for (const status of ['pending', 'disputed', 'declined']) assert.equal(wanted({ status }), false, status);
  assert.equal(wanted({ status: 'approved', cancelled: true }), false);
});

test('billed means an issued invoice, or a statement issued or in a pay run past draft; drafts never lock', () => {
  assert.equal(billed({}), false);
  assert.equal(billed({ invoice_id: 'i', invoice_status: 'draft' }), false);
  assert.equal(billed({ invoice_id: 'i', invoice_status: 'issued' }), true);
  assert.equal(billed({ statement_id: 's', statement_status: 'draft', run_status: 'draft' }), false);
  assert.equal(billed({ statement_id: 's', statement_status: 'draft', run_status: 'in_review' }), true);
  assert.equal(billed({ statement_id: 's', statement_status: 'issued', run_status: 'issued' }), true);
});

test('which draft: its own period, a new one for an open period, else the next open draft (late)', () => {
  const draft = (id, s, e) => ({ id, period_start: s, period_end: e });
  const wk = (s, e) => ({ period_start: s, period_end: e });
  // the draft for the week holds the date
  assert.deepEqual(pickTarget({ kind: 'weekly', date: '2026-11-04', today: '2026-11-07', drafts: [draft('a', '2026-11-02', '2026-11-08')], closed: [] }), { use: 'a', late: false });
  // nothing issued for that week yet: open its own draft, even for an older week (go-live backlog)
  assert.deepEqual(pickTarget({ kind: 'weekly', date: '2026-10-20', today: '2026-11-07', drafts: [draft('a', '2026-11-02', '2026-11-08')], closed: [] }),
    { create: { start: '2026-10-19', end: '2026-10-25' }, late: false });
  // the week is already issued: the latest open draft, marked late
  assert.deepEqual(pickTarget({ kind: 'weekly', date: '2026-10-28', today: '2026-11-07', drafts: [draft('a', '2026-11-02', '2026-11-08')], closed: [wk('2026-10-26', '2026-11-01')] }), { use: 'a', late: true });
  // issued and no draft open: a new draft for the current period
  assert.deepEqual(pickTarget({ kind: 'weekly', date: '2026-10-28', today: '2026-11-07', drafts: [], closed: [wk('2026-10-26', '2026-11-01')] }),
    { create: { start: '2026-11-02', end: '2026-11-08' }, late: true });
  // the current period issued early too: step on to the next one
  assert.deepEqual(pickTarget({ kind: 'weekly', date: '2026-11-03', today: '2026-11-05', drafts: [], closed: [wk('2026-11-02', '2026-11-08')] }),
    { create: { start: '2026-11-09', end: '2026-11-15' }, late: true });
  // an older draft never takes a late line from a newer issued week
  assert.deepEqual(pickTarget({ kind: 'weekly', date: '2026-11-03', today: '2026-11-07', drafts: [draft('old', '2026-10-19', '2026-10-25')], closed: [wk('2026-11-02', '2026-11-08')] }),
    { create: { start: '2026-11-09', end: '2026-11-15' }, late: true });
});

test('late lines, the issue gate and change detection', () => {
  assert.equal(isLate('2026-10-31', { period_start: '2026-11-02' }), true);
  assert.equal(isLate('2026-11-03', { period_start: '2026-11-02' }), false);
  assert.equal(isLate(null, { period_start: '2026-11-02' }), false, 'manual lines have no date');
  const lines = [{ timesheet_id: 1, ts_status: 'signed' }, { timesheet_id: 2, ts_status: 'approved' }, { timesheet_id: null }];
  assert.deepEqual(unsignedLines(lines).map((l) => l.timesheet_id), [2], 'only timesheet lines the venue has not signed move on; manual lines stay');
  const cur = { description: 'Door · Bar · 31 Oct 18:00–23:00', work_date: '2026-10-31', hours: 5, rate: 24, amount: 120 };
  assert.equal(lineChanged(cur, { ...cur }), false);
  assert.equal(lineChanged({ ...cur, amount: '120.00' }, { ...cur, amount: 120 }), false, 'numeric strings from pg compare as numbers');
  assert.equal(lineChanged(cur, { ...cur, amount: 150 }), true);
  assert.equal(lineChanged(cur, { ...cur, description: `${cur.description} · night +10%` }), true, 'long descriptions compare in full');
  assert.equal(lineChanged({ ...cur, work_date: new Date('2026-10-31T00:00:00Z') }, cur), false);
});

test('migration: one billed rule, drafts unlocked for the cancel trigger, changes marked for the feed', () => {
  const sql = read('../db/migrations/048_money_feed.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION timesheet_billed/);
  assert.match(sql, /status <> 'draft'/);
  assert.match(sql, /COALESCE\(r\.status, 'draft'\) <> 'draft'/, 'a pay run past draft locks its statements');
  assert.match(sql, /NOT timesheet_billed\(statement_id, invoice_id\)/, 'a cancel declines timesheets that are only on drafts');
  assert.doesNotMatch(sql.split('timesheet_follow_assignment')[1], /statement_id IS NULL AND invoice_id IS NULL/);
  assert.match(sql, /feed_dirty boolean NOT NULL DEFAULT true/, 'the existing backlog is picked up by the first sweep');
  assert.match(sql, /'auto'/);
});

test('wiring: generate is a sweep, issue holds back unsigned lines, timesheet lines follow their timesheet', () => {
  const money = read('../modules/money.mjs');
  const payruns = read('../modules/payruns.mjs');
  const ts = read('../modules/timesheets.mjs');
  const index = read('../index.mjs');
  assert.doesNotMatch(money, /pr_status/, 'invoices no longer wait for the pay run');
  assert.match(money, /holdBackUnsigned\(t, \{ invoiceId: b\.id \}\)/);
  assert.match(money, /follows its timesheet/);
  assert.match(payruns, /holdBackUnsigned\(t, \{ runId: b\.id \}\)/);
  assert.match(ts, /timesheet_billed\(t\.statement_id, t\.invoice_id\) AS locked/);
  assert.doesNotMatch(ts, /t\.statement_id IS NOT NULL OR t\.invoice_id IS NOT NULL/);
  assert.match(index, /syncRecent\(\)/);
  assert.match(read('../modules/jobs.mjs'), /moneyFeed = await sweep\(\)/);
});
