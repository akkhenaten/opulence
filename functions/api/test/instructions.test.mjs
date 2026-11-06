import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSendInstruction, recipients, visibleEntries } from '../lib/instructions.mjs';

const team = [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: null }];
const entries = [
  { id: 'n', kind: 'note' },
  { id: 'all', kind: 'instruction', to_user_id: null },
  { id: 'to1', kind: 'instruction', to_user_id: 'u1' },
];
const ids = (xs) => xs.map((e) => e.id);

test('an instruction goes to the whole team, or to the one officer it names', () => {
  assert.deepEqual(recipients({ to_user_id: null }, team), ['u1', 'u2']);
  assert.deepEqual(recipients({ to_user_id: 'u2' }, team), ['u2']);
  assert.deepEqual(recipients({ to_user_id: 'gone' }, team), []);
});

test('the venue sees no instructions, an officer only theirs, managers all', () => {
  assert.deepEqual(ids(visibleEntries(entries, 'venue', 'v')), ['n']);
  assert.deepEqual(ids(visibleEntries(entries, 'officer', 'u2')), ['n', 'all']);
  assert.deepEqual(ids(visibleEntries(entries, 'lead', 'u1')), ['n', 'all', 'to1']);
  assert.deepEqual(ids(visibleEntries(entries, 'mgr', 'm')), ['n', 'all', 'to1']);
});

test('instructions can be sent from two hours before the start until the end', () => {
  const sh = { status: 'published', starts_at: '2026-11-06T20:00:00Z', ends_at: '2026-11-07T03:00:00Z' };
  assert.equal(canSendInstruction(sh, +new Date('2026-11-06T17:59:00Z')), false);
  assert.equal(canSendInstruction(sh, +new Date('2026-11-06T18:00:00Z')), true);
  assert.equal(canSendInstruction(sh, +new Date('2026-11-07T02:59:00Z')), true);
  assert.equal(canSendInstruction(sh, +new Date('2026-11-07T03:00:00Z')), false);
  assert.equal(canSendInstruction({ ...sh, status: 'draft' }, +new Date('2026-11-06T21:00:00Z')), false);
});
