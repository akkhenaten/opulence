import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverStale } from '../modules/ops.mjs';
import { clearedCards } from '../modules/compliance.mjs';
import { withdrawKeys } from '../lib/notify.mjs';

test('cover card closes once the shift no longer needs it', () => {
  const base = { shiftStatus: 'published', filled: 1, headcount: 2 };
  assert.equal(coverStale(base), null);
  assert.equal(coverStale({ ...base, shiftStatus: 'cancelled' }), 'cancelled');
  assert.equal(coverStale({ ...base, shiftStatus: 'draft' }), 'cancelled');
  assert.equal(coverStale({ ...base, ended: true }), 'over');
  assert.equal(coverStale({ ...base, filled: 2 }), 'filled');
  // A no-show still on the shift counts towards the headcount, so their cover is still wanted
  assert.equal(coverStale({ ...base, filled: 2, replacing: 'a1', replacingActive: true }), null);
  // ...until they are taken off and someone else fills the place
  assert.equal(coverStale({ ...base, filled: 2, replacing: 'a1', replacingActive: false }), 'filled');
  // Taken off but the shift is still short: cover is still needed
  assert.equal(coverStale({ ...base, filled: 1, replacing: 'a1', replacingActive: false }), null);
});

test('withdrawing builds refs and the older dedupe keys', () => {
  const { refs, keys } = withdrawKeys({ assignments: [{ id: 'a1' }, 'a2'], shifts: ['s1', null], items: ['i1'] });
  assert.deepEqual(refs, ['asg:a1', 'asg:a2', 'shift:s1', 'ops:i1']);
  for (const k of ['late:a1', 'remind:a1', 'esc:a2', 'pack-2h:a2', 'pack_blocked:a1', 'omw:a2', 'ops:i1']) assert.ok(keys.includes(k), k);
  assert.ok(!keys.some((k) => k.includes('s1')));
  assert.deepEqual(withdrawKeys(), { refs: [], keys: [] });
});

test('compliance re-check for some officers only clears their cards', () => {
  const open = [{ id: 'c1', officer_id: 'o1' }, { id: 'c2', officer_id: 'o2' }, { id: 'c3', officer_id: 'o3' }];
  const results = [{ officer: { id: 'o2' } }];
  assert.deepEqual(clearedCards(open, results).map((c) => c.id), ['c1', 'c3']);
  assert.deepEqual(clearedCards(open, results, ['o1', 'o2']).map((c) => c.id), ['c1']);
  assert.deepEqual(clearedCards(open, [], ['o3']).map((c) => c.id), ['c3']);
});
