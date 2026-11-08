import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapSide } from '../lib/shiftDue.mjs';
import { assignedLink } from '../modules/rota.mjs';
import { ACTIONS } from '../index.mjs';

test('an NFC tap clocks in officers, and managers who are due on shift there', () => {
  assert.equal(tapSide({ manager: false }), 'officer');
  assert.equal(tapSide({ manager: true, dual: false, due: false }), 'check');
  assert.equal(tapSide({ manager: true, dual: true, due: false }), 'check');
  assert.equal(tapSide({ manager: true, dual: true, due: true }), 'officer');
});

test('a new shift alert opens the shift itself, where the officer can accept it', () => {
  assert.equal(assignedLink({ id: 's1' }), '/officer/shifts/s1');
  assert.equal(assignedLink({}), '/officer/shifts');
});

test('unused venue actions are gone', () => {
  for (const a of ['venueRequests.list', 'timesheets.venueCheck']) assert.equal(ACTIONS[a], undefined, a);
  assert.ok(ACTIONS['venueRequests.create'], 'the chat-to-cover-form draft stays');
});
