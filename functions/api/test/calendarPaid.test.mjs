import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanPayRate, heldRows, payHours, payLineText, MAX_PAY_RATE } from '../lib/calendar.mjs';
import { KINDS } from '../lib/todo.mjs';
import { actions } from '../modules/calendar.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = read('../modules/calendar.mjs');
const mig = read('../db/migrations/071_calendar_paid.sql');
const money = read('../modules/money.mjs');
const runs = read('../modules/payruns.mjs');
const todo = read('../modules/todo.mjs');

const e = { kind: 'meeting', title: 'Toolbox talk', starts_at: '2026-11-18T10:00:00Z', ends_at: '2026-11-18T11:30:00Z' };

test('a typed rate: blank is each officer’s usual rate, £ and commas are fine, nothing silly', () => {
  assert.equal(cleanPayRate(''), null);
  assert.equal(cleanPayRate(null), null);
  assert.equal(cleanPayRate('£12.50'), 12.5);
  assert.equal(cleanPayRate(' 13 '), 13);
  assert.equal(cleanPayRate(14.25), 14.25);
  assert.throws(() => cleanPayRate('0'), /rate per hour/);
  assert.throws(() => cleanPayRate('abc'), /rate per hour/);
  assert.throws(() => cleanPayRate(MAX_PAY_RATE + 1), /up to £500/);
});

test('paid hours are rounded to the hundredth', () => {
  assert.equal(payHours(e.starts_at, e.ends_at), 1.5);
  assert.equal(payHours('2026-11-18T10:00:00Z', '2026-11-18T10:20:00Z'), 0.33);
});

test('Was this held?: as booked by default, declined ones as not there, edited times checked', () => {
  const people = [{ officer_id: 'a', response: 'accepted' }, { officer_id: 'b', response: 'declined' }, { officer_id: 'c', response: 'pending' }];
  const rows = heldRows(e, people);
  assert.deepEqual(rows.map((r) => [r.officer_id, r.attended, r.hours]), [['a', true, 1.5], ['b', false, 0], ['c', true, 1.5]]);
  const edited = heldRows(e, people, { a: { starts_at: '2026-11-18T10:15:00Z', ends_at: '2026-11-18T11:00:00Z' }, b: 'booked', c: 'absent' });
  assert.deepEqual(edited.map((r) => [r.attended, r.hours]), [[true, 0.75], [true, 1.5], [false, 0]]);
  assert.throws(() => heldRows(e, people, { a: { starts_at: '', ends_at: '' } }), /Choose the times/);
  assert.throws(() => heldRows(e, people, { a: { starts_at: '2026-11-18T11:00:00Z', ends_at: '2026-11-18T10:00:00Z' } }), /end must be after/);
  assert.throws(() => heldRows(e, people, { a: { starts_at: '2026-11-18T00:00:00Z', ends_at: '2026-11-18T20:00:00Z' } }), /up to 16 hours/);
  assert.throws(() => heldRows(e, people, { a: { starts_at: '2026-11-20T10:00:00Z', ends_at: '2026-11-20T11:00:00Z' } }), /day it was booked/);
});

test('the payslip line says what it was and when', () => {
  assert.match(payLineText(e, e.starts_at, e.ends_at), /^Meeting: Toolbox talk · .+ 10:00–11:30$/);
  assert.match(payLineText({ ...e, kind: 'task' }, e.starts_at, e.ends_at), /^Task: Toolbox talk/);
});

test('paid time is stored per officer, kept once paid, and its pay line points back to it', () => {
  assert.match(mig, /ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false/);
  assert.match(mig, /event_id uuid NOT NULL REFERENCES calendar_events\(id\) ON DELETE RESTRICT/);
  assert.match(mig, /UNIQUE \(event_id, officer_id\)/);
  assert.match(mig, /statement_lines ADD COLUMN IF NOT EXISTS calendar_pay_id/);
});

test('only company managers set Paid and confirm it; held ones are locked', () => {
  assert.deepEqual(actions['calendar.held'].roles, ['company']);
  assert.match(src, /if \(!isCo\(user\) \|\| kind === 'block' \|\| organiserRole !== 'company'/);
  assert.match(src, /if \(before\.held_at\) fail\(409, HELD_LOCKED\)/);
  assert.match(src, /if \(e\.held_at\) fail\(409/);
  assert.match(src, /if \(!isCo\(user\)\) return base;/);
  assert.match(src, /if \(had\.some\(\(r\) => r\.locked\)\) fail\(409/);
  assert.match(src, /pg_advisory_xact_lock\(\$1\)', \[LOCK\]/);
  assert.match(src, /audit\(user, 'calendar\.held'/);
});

test('a meeting’s pay line can only be changed from the calendar', () => {
  assert.match(money, /if \(l\.calendar_pay_id\) fail\(400/);
  assert.match(runs, /if \(l\.calendar_pay_id\) fail\(400/);
  assert.match(runs, /l\.calendar_pay_id IS NOT NULL LIMIT 1/);
});

test('Needs you: company managers see paid meetings to confirm once they have ended', () => {
  const k = KINDS.find((x) => x.key === 'held');
  assert.deepEqual(k.roles, ['company']);
  assert.equal(k.link({ role: 'company', event: null }), '/calendar?show=held');
  assert.equal(k.link({ role: 'company', event: 'x' }), '/calendar?event=x');
  assert.match(todo, /e\.paid AND e\.held_at IS NULL AND e\.cancelled_at IS NULL AND e\.ends_at <= now\(\)/);
  assert.match(todo, /const MEET = \['invites', 'proposals', 'held'\]/);
});
