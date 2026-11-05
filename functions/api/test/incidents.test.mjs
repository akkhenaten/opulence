import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../index.mjs'; // loads incidentAi first, as in production (the two modules import each other)
import { lateDays, OFFICER_BACKDATE_DAYS, withinBackdate } from '../modules/incidents.mjs';

const DAY = 86400000;

test('a report filed the same night is not late', () => {
  assert.equal(lateDays({ occurred_at: '2026-11-01T23:00:00Z', created_at: '2026-11-02T03:00:00Z' }), 0);
  assert.equal(lateDays({ occurred_at: '2026-11-01T23:00:00Z', created_at: '2026-11-02T22:59:00Z' }), 0);
});

test('a report filed days later counts whole days', () => {
  assert.equal(lateDays({ occurred_at: '2026-11-01T23:00:00Z', created_at: '2026-11-03T00:00:00Z' }), 1);
  assert.equal(lateDays({ occurred_at: '2026-10-22T23:00:00Z', created_at: '2026-11-01T23:30:00Z' }), 10);
});

test('officers can go back 30 days, not 31', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  assert.equal(OFFICER_BACKDATE_DAYS, 30);
  assert.ok(withinBackdate(new Date(now - 10 * DAY), now));
  assert.ok(withinBackdate(new Date(now - 30 * DAY + 60000), now));
  assert.ok(!withinBackdate(new Date(now - 31 * DAY), now));
});
