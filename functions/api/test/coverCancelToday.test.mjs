import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cancelWhy, bulkWhy } from '../modules/cover.mjs';

const today = '2026-11-16';

test('any date today can be cancelled, started or not; earlier days stay locked', () => {
  const startedToday = { status: 'pending', occurs_on: today, starts_at: '2026-11-16T08:00:00Z' };
  assert.equal(cancelWhy(startedToday, today), null);
  assert.equal(cancelWhy({ ...startedToday, status: 'accepted', change_status: 'none' }, today), null);
  assert.equal(cancelWhy({ ...startedToday, occurs_on: '2026-11-15' }, today), 'is in the past');
  assert.equal(cancelWhy({ ...startedToday, status: 'cancelled' }, today), 'is cancelled');
  assert.equal(cancelWhy({ ...startedToday, change_status: 'pending' }, today), 'has a change waiting');
  assert.equal(cancelWhy({ status: 'pending', occurs_on: '2026-11-20' }, today), null);
});

test('changing still stops once a date has started', () => {
  assert.equal(bulkWhy({ status: 'pending', starts_at: new Date(Date.now() - 3600000).toISOString() }), 'already started');
});

test('cancelling waits for the office only when officers are booked, and every cancel point uses the today rule', () => {
  const src = readFileSync(new URL('../modules/cover.mjs', import.meta.url), 'utf8');
  const update = src.slice(src.indexOf("'cover.update':"), src.indexOf("'cover.decideChange'"));
  assert.match(update, /if \(b\.delete\) \{ if \(cancelWhy\(occ\)/, 'update: delete uses the today rule');
  assert.match(update, /payload\.type === 'delete'\s*\? \(await staffed\(occ/, 'update: a cancel waits only when staffed');
  assert.match(update, /onSite\(occ\.id\)/, 'the office is told when someone is on site');
  const many = src.slice(src.indexOf("'cover.updateMany'"), src.indexOf("'cover.cancel'"));
  assert.match(many, /del \? cancelWhy\(occ\) : bulkWhy\(occ\)/, 'bulk cancel uses the today rule');
  assert.match(many, /!del \|\| \(await staffed\(occ\)\) > 0/, 'bulk cancel waits only when staffed');
});
