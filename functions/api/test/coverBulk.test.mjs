import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bulkSlot, bulkWhy, datesLabel } from '../modules/cover.mjs';
import { ACTIONS } from '../index.mjs';

test('a bulk change keeps each date\'s own times unless new ones are sent', () => {
  const own = { start: '18:30', end: '23:30', headcount: 1 };
  assert.deepEqual(bulkSlot(own, {}), own);
  assert.deepEqual(bulkSlot(own, { end: '00:30', headcount: '2' }), { start: '18:30', end: '00:30', headcount: 2 });
  assert.deepEqual(bulkSlot(own, { start: '', headcount: null }), own);
});

test('only future dates that are waiting or booked, with no change pending, can be changed together', () => {
  const later = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 3600000).toISOString();
  assert.equal(bulkWhy({ status: 'pending', starts_at: later }), null);
  assert.equal(bulkWhy({ status: 'accepted', starts_at: later, change_status: 'none' }), null);
  assert.equal(bulkWhy({ status: 'pending', starts_at: past }), 'already started');
  assert.equal(bulkWhy({ status: 'cancelled', starts_at: later }), 'is cancelled');
  assert.equal(bulkWhy({ status: 'accepted', starts_at: later, change_status: 'pending' }), 'has a change waiting');
});

test('dates read as a short list', () => {
  assert.equal(datesLabel(['2026-11-16']), 'Mon 16 Nov');
  assert.equal(datesLabel(['2026-11-16', '2026-11-17', '2026-11-18']), 'Mon 16 Nov, Tue 17 Nov and Wed 18 Nov');
  assert.match(datesLabel(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']), /\+2 more$/);
});

test('venues can change several dates at once, with one notification per venue rather than per date', () => {
  assert.ok(ACTIONS['cover.updateMany'], 'registered');
  assert.ok(ACTIONS['cover.updateMany'].roles.includes('venue'));
  const src = readFileSync(new URL('../modules/cover.mjs', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf("'cover.updateMany'"), src.indexOf("'cover.cancel'"));
  const loopEnd = body.indexOf('// End of the per-date loop');
  assert.ok(loopEnd > 0);
  assert.ok(body.indexOf('loadOcc(user, id)') < loopEnd, 'each date is scope-checked');
  assert.equal(body.slice(0, loopEnd).includes('notify('), false, 'no notification inside the loop');
  assert.ok(body.slice(loopEnd).includes('notify('));
  assert.match(body, /occ\.status === 'accepted' && !mgr[\s\S]*change_status = 'pending'/, 'booked dates wait for approval');
});
