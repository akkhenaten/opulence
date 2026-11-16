import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bulkSkip, oldestFirst, shiftLabel, MAX_BULK } from '../modules/rota.mjs';
import { ACTIONS } from '../index.mjs';

const later = new Date(Date.now() + 86400e3).toISOString();
const earlier = new Date(Date.now() - 86400e3).toISOString();

test('a skipped shift is named by its day and venue', () => {
  assert.equal(shiftLabel({ starts_at: '2026-11-21T20:00:00Z', venue_name: 'The Ivy' }), 'Sat 21 Nov · The Ivy');
});

test('each bulk action leaves out the shifts it does not fit, with the reason', () => {
  const draft = { status: 'draft', ends_at: later };
  const pub = { status: 'published', ends_at: later };
  assert.equal(bulkSkip({ ...pub, status: 'cancelled' }, 'assign'), 'cancelled');
  assert.equal(bulkSkip({ ...pub, ends_at: earlier }, 'assign'), 'already finished');
  assert.equal(bulkSkip(draft, 'assign'), null);
  assert.equal(bulkSkip(pub, 'publish'), 'already published');
  assert.equal(bulkSkip(draft, 'open'), 'still a draft');
  assert.equal(bulkSkip(draft, 'requests'), 'still a draft');
  assert.equal(bulkSkip(pub, 'open'), null);
});

test('requests are taken in the order they came in', () => {
  const r = oldestFirst([{ id: 'b', created_at: '2026-11-02' }, { id: 'a', created_at: '2026-11-01' }]);
  assert.deepEqual(r.map((x) => x.id), ['a', 'b']);
});

test('bulk actions exist for managers and stay within one limit', () => {
  for (const k of ['shifts.candidatesMany', 'shifts.assignMany', 'shifts.decideRequests', 'shifts.setOpen', 'shifts.cancelMany']) assert.ok(ACTIONS[k], k);
  assert.equal(MAX_BULK, 200);
});

test('bulk assign checks every shift like a single assign, asks about warnings once and tells the officer once', () => {
  const src = readFileSync(new URL('../modules/rota.mjs', import.meta.url), 'utf8');
  const many = src.slice(src.indexOf("'shifts.assignMany'"), src.indexOf("'shifts.decideRequests'"));
  assert.match(many, /checkOfficerForShift\(b\.officer_id, s\)/);
  assert.match(many, /s\.filled >= s\.headcount && 'full'/);
  assert.match(many, /if \(!b\.override\)[\s\S]*needs_override: true/);
  assert.match(many, /filledCount\(s\.id\)\) >= s\.headcount/, 'checked again just before booking');
  assert.equal((many.match(/notifyGrouped\(/g) || []).length, 1, 'one message per officer');
  const cancel = src.slice(src.indexOf("'shifts.cancelMany'"), src.indexOf("'shifts.pendingRequests'"));
  assert.match(cancel, /someone has clocked in/);
  assert.match(cancel, /cancelShift\(s, user, b\.reason, \{ quiet: true \}\)/);
});
