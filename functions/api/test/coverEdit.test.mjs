import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editOne, retimeOccurrence } from '../modules/cover.mjs';

const occ = { id: 'c1', occurs_on: '2026-11-18', role: 'door', notes: 'Back door', venue_id: 'v1', starts_at: '2026-11-18T21:00:00Z', ends_at: '2026-11-19T03:00:00Z', headcount: 2 };
const slot = { start: '21:00', end: '03:00', headcount: 2 };

test('a one-date edit keeps the day and officer type unless new ones are sent', () => {
  const kept = editOne(slot, occ, '2026-11-16');
  assert.equal(kept.slot.date, '2026-11-18');
  assert.equal(kept.role, 'door');
  assert.equal(kept.notes, undefined);
  const moved = editOne({ ...slot, date: '2026-11-20', role: 'steward', notes: '' }, occ, '2026-11-16');
  assert.equal(moved.slot.date, '2026-11-20');
  assert.equal(moved.role, 'steward');
  assert.equal(moved.notes, '', 'blank notes clear them');
});

test('a date can not move into the past or to a day that does not exist', () => {
  assert.throws(() => editOne({ ...slot, date: '2026-11-10' }, occ, '2026-11-16'), /from today/);
  assert.throws(() => editOne({ ...slot, date: '2026-13-01' }, occ, '2026-11-16'), /valid date/);
  assert.throws(() => editOne({ ...slot, start: '21:00', end: '21:00' }, occ, '2026-11-16'), /same time/);
});

test('moving a date writes the new day and times, overnight finish on the next morning', async () => {
  const calls = [];
  const db = { later: [], q: async (sql, p) => { calls.push([sql, p]); return []; }, one: async () => ({ name: 'V' }) };
  await retimeOccurrence(occ, { ...slot, date: '2026-11-20' }, {}, db);
  const [sql, p] = calls[0];
  assert.match(sql, /occurs_on = \$8/);
  assert.equal(p[7], '2026-11-20');
  assert.equal(p[1].toISOString(), '2026-11-20T21:00:00.000Z');
  assert.equal(p[2].toISOString(), '2026-11-21T03:00:00.000Z');
});

test('approving a waiting change checks the asked-for day is still free; bulk edits take the officer type', () => {
  const src = readFileSync(new URL('../modules/cover.mjs', import.meta.url), 'utf8');
  const decide = src.slice(src.indexOf("'cover.decideChange'"), src.indexOf("'cover.updateMany'"));
  assert.ok(decide.indexOf('dateClash(') > 0 && decide.indexOf('dateClash(') < decide.indexOf('applyChange('));
  const many = src.slice(src.indexOf("'cover.updateMany'"), src.indexOf("'cover.cancel'"));
  assert.match(many, /role: has\('role'\)/);
  const update = src.slice(src.indexOf("'cover.update'"), src.indexOf("'cover.decideChange'"));
  assert.match(update, /editOne\(b, occ/);
  assert.match(update, /dateClash\(occ, payload\.slot\.date\)/);
});
