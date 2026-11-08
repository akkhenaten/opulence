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

// Release B: sections as tabs (app/src/ui/hubs.js)
import { hubTabs, findHub } from '../../../app/src/ui/hubs.js';
const allOn = () => true;

test('security managers get no company-only or pay tabs', () => {
  const sec = { role: 'security' };
  const staff = hubTabs('staff', sec, allOn).map((t) => t.to);
  assert.ok(!staff.includes('/security/recruitment') && !staff.includes('/security/people/contracts'));
  assert.deepEqual(hubTabs('money', sec, allOn).map((t) => t.to), ['/security/timesheets']);
  assert.deepEqual(hubTabs('settings', sec, allOn), []);
  assert.ok(hubTabs('money', { role: 'security', can_see_pay: true }, allOn).some((t) => t.to === '/security/pay'));
});

test('venue sections never reach officer or pay pages', () => {
  const all = ['logs', 'feedback', 'billing'].flatMap((id) => hubTabs(id, { role: 'venue' }, allOn).map((t) => t.to));
  assert.ok(all.every((p) => p.startsWith('/venue/')));
  assert.ok(!all.some((p) => /pay|staff|officer/.test(p)));
});

test('a page finds its section; detail pages show no tab row', () => {
  const co = { role: 'company', platform: true };
  assert.equal(findHub('/company/staff/phones', co, allOn, { exact: true }).current.label, 'Phones');
  assert.equal(findHub('/company/staff/42', co, allOn, { exact: true }), null);
  assert.ok(findHub('/company/messages/9', co, allOn, {}));
  assert.ok(!hubTabs('reports', co, (m) => m !== 'analytics').some((t) => t.to.endsWith('/analytics')));
});
