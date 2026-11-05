import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, outward, reconcileRow, validateRequest, toRange } from '../modules/ops.mjs';
import { creditsFor, monthKey } from '../lib/ai.mjs';

test('postcode outward code', () => {
  assert.equal(outward('M4 1AB'), 'M4');
  assert.equal(outward('sw1a1aa'), 'SW1A');
  assert.equal(outward(''), '');
});

test('cover scoring prefers reliable, familiar, nearby officers', () => {
  const venue = 'M4 1AB';
  const best = scoreCandidate({ reliability: 1, venueShifts: 5, officerPostcode: 'M4 6TT', venuePostcode: venue });
  const far = scoreCandidate({ reliability: 1, venueShifts: 5, officerPostcode: 'LS1 2AB', venuePostcode: venue });
  const area = scoreCandidate({ reliability: 1, venueShifts: 5, officerPostcode: 'M20 2AB', venuePostcode: venue });
  const flaky = scoreCandidate({ reliability: 0.5, venueShifts: 5, officerPostcode: 'M4 6TT', venuePostcode: venue });
  const warned = scoreCandidate({ reliability: 1, venueShifts: 5, officerPostcode: 'M4 6TT', venuePostcode: venue, warnings: 1 });
  assert.equal(best, 1);
  assert.ok(best > area && area > far);
  assert.ok(best > flaky && best > warned);
  // No history gets a fair middle score
  assert.equal(scoreCandidate({ reliability: null, venueShifts: 0 }), 0.43);
});

test('reconcile flags timesheet, statement and invoice mismatches', () => {
  const clean = reconcileRow({ clock_h: 8, ts_h: 8, stmt_h: 8, inv_h: 8 });
  assert.equal(clean.issues.length, 0);
  const r = reconcileRow({ clock_h: 8, ts_h: 7, stmt_h: 7, inv_h: 7 });
  assert.deepEqual(r.fix, { timesheet_hours: 8, statement_hours: 8, invoice_hours: 8 });
  // A manager-edited timesheet is the truth; minimum billable hours apply to invoices only
  const e = reconcileRow({ clock_h: 8, ts_h: 3, stmt_h: 3.5, inv_h: 3, min_hours: 4, edited: true });
  assert.deepEqual(e.fix, { statement_hours: 3, invoice_hours: 4 });
  // Within tolerance
  assert.equal(reconcileRow({ clock_h: 8, ts_h: 8.25, stmt_h: 8.25, inv_h: 8.25 }).issues.length, 0);
});

test('venue request validation', () => {
  const ctx = { today: '2026-10-19', roles: ['door', 'guard'], shiftIds: ['s1'] };
  const ok = validateRequest({ intent: 'new', shifts: [{ date: '2026-10-24', start: '21:00', end: '03:00', role: 'door', headcount: 2 }] }, ctx);
  assert.equal(ok.ok, true);
  assert.equal(validateRequest({ intent: 'new', shifts: [{ date: '2026-10-01', start: '21:00', end: '03:00', role: 'door', headcount: 2 }] }, ctx).ok, false);
  assert.equal(validateRequest({ intent: 'new', shifts: [{ date: '2026-10-24', start: '9pm', end: '03:00', role: 'door', headcount: 2 }] }, ctx).ok, false);
  assert.equal(validateRequest({ intent: 'new', shifts: [{ date: '2026-10-24', start: '21:00', end: '03:00', role: 'chef', headcount: 2 }] }, ctx).ok, false);
  assert.equal(validateRequest({ intent: 'new', shifts: [{ date: '2026-10-24', start: '21:00', end: '03:00', role: 'door', headcount: 40 }] }, ctx).ok, false);
  assert.equal(validateRequest({ intent: 'cancel', shifts: [{ shift_id: 's1' }] }, ctx).ok, true);
  assert.equal(validateRequest({ intent: 'cancel', shifts: [{ shift_id: 'nope' }] }, ctx).ok, false);
  assert.equal(validateRequest({ intent: 'unclear', question: 'Which day?' }, ctx).errors[0], 'Which day?');
});

test('overnight times roll to the next day in London time', () => {
  const r = toRange('2026-10-24', '21:00', '03:00');
  assert.equal(r.starts_at.toISOString(), '2026-10-24T20:00:00.000Z'); // BST
  assert.equal(r.ends_at.toISOString(), '2026-10-25T03:00:00.000Z'); // clocks go back that night
});

test('AI credits and month key', () => {
  assert.equal(creditsFor({ input_tokens: 1000, output_tokens: 1000 }, { inputPrice: 450, outputPrice: 2250 }), 2700);
  assert.equal(creditsFor({ input_tokens: 500, cache_read_input_tokens: 500, output_tokens: 0 }, { inputPrice: 150, outputPrice: 750 }), 150);
  assert.equal(monthKey(new Date('2026-10-31T23:30:00Z')), '2026-10');
  assert.equal(monthKey(new Date('2026-03-31T23:30:00Z')), '2026-04'); // BST
});

test('refresh: compliance at most every 10 minutes; managers only', async () => {
  const { complianceDue, actions } = await import('../modules/ops.mjs');
  const now = Date.now();
  assert.equal(complianceDue(null, now), true);
  assert.equal(complianceDue(new Date(now - 5 * 60_000), now), false);
  assert.equal(complianceDue(new Date(now - 11 * 60_000), now), true);
  const roles = actions['ops.refresh'].roles;
  assert.ok(roles.includes('company') && roles.includes('security'));
  assert.ok(!roles.includes('officer') && !roles.includes('venue'));
});
