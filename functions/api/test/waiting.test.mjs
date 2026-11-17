import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitingItems } from '../lib/waiting.mjs';
import { guideFor } from '../lib/guide.mjs';

test('waiting for you lists only what is waiting, with links for the role', () => {
  const m = waitingItems('security', { decisions: 3, exceptions: 0, unfilled: 0, disputed: 0, cover: 0, coverChange: 0, incidentsToSign: 0, openIncidents: 0, toApprove: 0, shiftRequests: 0, phones: 0 });
  assert.deepEqual(m.items, [{ key: 'decisions', count: 3, title: '3 cards from Orb to approve', link: '/security#needs' }]);
  assert.equal(m.failed, false);
  const o = waitingItems('officer', { answer: 1, resign: 2 });
  assert.deepEqual(o.items.map((i) => i.title), ['1 shift waiting for your answer', '2 incident reports to sign']);
  const v = waitingItems('venue', { timesheets: 2, reports: 0, invoices: 1 });
  assert.deepEqual(v.items.map((i) => i.link), ['/venue/timesheets?show=review', '/venue/invoices']);
});

test('a count that could not be read is left out and flagged, never shown as nothing', () => {
  const r = waitingItems('security', { decisions: null, incidentsToSign: 1 });
  assert.deepEqual(r.items.map((i) => i.key), ['incidentsToSign']);
  assert.equal(r.failed, true);
});

const text = (role) => guideFor(role, 'X').flatMap((c) => c.sections.map((s) => `${s.title}\n${s.body}`)).join('\n');

test('Help sends each role to its own screens', () => {
  const venue = text('venue');
  assert.ok(!venue.includes('My account (managers)'));
  assert.ok(!venue.includes('Send feedback'));
  assert.ok(venue.includes('Report an app problem or idea in My account'));
  assert.ok(venue.includes('not on Everyday'));
  const officer = text('officer');
  assert.ok(officer.includes('open Me and tap Install the app'));
  assert.ok(/Register your clock-in phone/.test(officer));
  assert.ok(officer.includes("doesn't affect whether you can work"));
  assert.ok(!/\{(account|everyday)\}/.test(text('company')));
});
