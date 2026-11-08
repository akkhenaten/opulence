import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tapSide } from '../lib/shiftDue.mjs';
import { assignedLink, swapLink } from '../modules/rota.mjs';
import { toCsv, columnsFor } from '../lib/csv.mjs';
import { COLUMNS } from '../modules/exports.mjs';
import { DEMO_STATUSES } from '../modules/demo.mjs';
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

// Release C: fewer steps
import { docKindFor, freshStatement, packTodos, weekendAsk } from '../../../app/src/pages/officer/_todo.js';

test('Home lists site packs to read only for shifts in the next 14 days', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const list = [
    { venue_id: 'a', status: 'unsigned', next_shift: '2026-11-20T20:00:00Z' },
    { venue_id: 'b', status: 'current', next_shift: '2026-11-09T20:00:00Z' },
    { venue_id: 'c', status: 'resign', next_shift: '2026-11-10T20:00:00Z' },
    { venue_id: 'd', status: 'refresher', next_shift: '2026-12-30T20:00:00Z' },
    { venue_id: 'e', status: 'unsigned', next_shift: null },
  ];
  assert.deepEqual(packTodos(list, now).map((v) => v.venue_id), ['c', 'a']);
  assert.deepEqual(packTodos(undefined, now), []);
});

test('a compliance warning opens the upload sheet on the right document', () => {
  assert.equal(docKindFor('SIA licence expired'), 'sia');
  assert.equal(docKindFor('No right to work evidence'), 'rtw');
  assert.equal(docKindFor('Something else'), null);
});

test('invoices can be issued all at once', () => {
  assert.ok(ACTIONS['invoices.issueMany']);
});

test('spreadsheet cells survive commas, quotes and line breaks', () => {
  const csv = toCsv([{ a: 'Smith, J', b: 'said "no"\nthen left' }, { a: null, b: 0 }], [{ h: 'Name', v: (r) => r.a }, { h: 'Note', v: (r) => r.b }]);
  assert.equal(csv, '"Name","Note"\n"Smith, J","said ""no""\nthen left"\n"","0"');
});

test('exports leave out pay without pay access, and officer pay and contact details for venues', () => {
  const pay = (u) => u.role === 'company' || !!u.can_see_pay;
  const heads = (key, user) => columnsFor(COLUMNS[key], user, pay).map((c) => c.h);
  assert.ok(heads('timesheets', { role: 'company' }).includes('Pay'));
  assert.ok(!heads('timesheets', { role: 'security' }).includes('Pay rate'));
  assert.ok(heads('timesheets', { role: 'security', can_see_pay: true }).includes('Charge'));
  const venue = heads('timesheets', { role: 'venue', can_see_pay: true });
  assert.ok(!venue.includes('Pay') && !venue.includes('Pay rate'));
  assert.ok(!heads('staff', { role: 'venue' }).includes('Email'));
  for (const a of ['staff.exportCsv', 'timesheets.exportCsv', 'incidents.exportCsv', 'timeoff.exportCsv', 'audit.exportCsv']) assert.ok(ACTIONS[a], a);
  assert.ok(!ACTIONS['incidents.exportCsv'].roles.includes('officer'));
  assert.deepEqual(ACTIONS['audit.exportCsv'].roles, ['company']);
});

test('bulk decisions, swaps, venue requests and demo status exist with the right roles', () => {
  assert.deepEqual(ACTIONS['timeoff.decideMany'].roles, ['company', 'security']);
  assert.deepEqual(ACTIONS['incidents.reviewMany'].roles, ['company', 'security']);
  assert.deepEqual(ACTIONS['shifts.swapAsk'].roles, ['officer']);
  assert.deepEqual(ACTIONS['feedback.dontSend'].roles, ['venue']);
  assert.ok(!ACTIONS['messages.office'].roles.includes('officer'));
  assert.deepEqual(ACTIONS['demo.setStatus'].roles, ['company']);
  assert.deepEqual(DEMO_STATUSES, ['new', 'contacted', 'won', 'lost']);
  assert.equal(swapLink('s9'), '/company/rota?shift=s9&assign=1');
});

test('demo status rejects anything outside the list', async () => {
  await assert.rejects(() => ACTIONS['demo.setStatus'].fn({ id: 'x', status: 'maybe' }, { user: { role: 'company' } }), /Invalid status/);
});

test('"Free this weekend?" asks Wednesday to Friday, only with no weekend shift', () => {
  const wed = new Date(2026, 10, 11, 10); // Wednesday 11 November 2026
  assert.deepEqual(weekendAsk([], wed), { from: '2026-11-13', to: '2026-11-15' });
  assert.equal(weekendAsk([], new Date(2026, 10, 9, 10)), null); // Monday
  assert.equal(weekendAsk([{ starts_at: new Date(2026, 10, 14, 21).toISOString() }], wed), null);
  assert.ok(weekendAsk([{ starts_at: new Date(2026, 10, 17, 21).toISOString() }], wed));
});

test('the latest pay statement shows on Home for 7 days after it is issued', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  assert.ok(freshStatement({ status: 'issued', issued_at: '2026-11-03T09:00:00Z' }, now));
  assert.equal(freshStatement({ status: 'issued', issued_at: '2026-10-30T09:00:00Z' }, now), null);
  assert.equal(freshStatement({ status: 'draft', issued_at: '2026-11-07T09:00:00Z' }, now), null);
  assert.equal(freshStatement(null, now), null);
});

test('the ejections register is a tab of Incidents for managers only', () => {
  for (const role of ['company', 'security']) assert.ok(hubTabs('incidents', { role }).some((t) => t.to === `/${role}/ejections`), role);
  assert.deepEqual(hubTabs('incidents', { role: 'venue' }), []);
  assert.deepEqual(hubTabs('incidents', { role: 'officer' }), []);
  assert.deepEqual(ACTIONS['bans.exportCsv'].roles, ['company', 'security']);
  assert.ok(COLUMNS.bans.every((c) => !c.pay && !c.officer));
  const csv = toCsv([{ occurred_at: '2026-11-07T23:40:00Z', venue_name: 'The Vault', outcome: 'refused_entry', name: 'Tall man, "red cap"', reason: 'Drunk', kind: 'ejection' }], COLUMNS.bans);
  assert.match(csv, /"Refused entry"/);
  assert.match(csv, /"Tall man, ""red cap"""/);
});
