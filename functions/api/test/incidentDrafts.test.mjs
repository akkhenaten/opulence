import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDraft, draftProgress, reminderDue } from '../lib/incidentDrafts.mjs';

test('a draft keeps only the form fields, trimmed to size', () => {
  const d = cleanDraft({ type: 'assault', description: 'x'.repeat(30000), location: 'y'.repeat(5000), force_used: 1, hacker: 'drop me',
    witnesses: [{ name: 'Sam', extra: 1 }, null], manager: { venue_id: 'not-an-id', shift_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' } });
  assert.equal(d.hacker, undefined);
  assert.equal(d.description.length, 20000);
  assert.equal(d.location.length, 4000);
  assert.equal(d.force_used, true);
  assert.deepEqual(d.witnesses, [{ name: 'Sam', contact: '', statement: '' }]);
  assert.deepEqual(d.manager, { venue_id: '', shift_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', officer_id: '' });
  assert.deepEqual(cleanDraft(null), {});
});

test('progress counts the five writing steps', () => {
  assert.deepEqual(draftProgress({}).done, 1); // no force used, so nothing to justify
  const full = { type: 'theft', severity: 'low', description: 'Took a bag', occurred_at: '2026-11-05T23:40', location: 'Bar', people_involved: 'Male, 30' };
  assert.equal(draftProgress(full).done, 5);
  const p = draftProgress({ ...full, force_used: true });
  assert.equal(p.done, 4);
  assert.deepEqual(p.missing, ['Why force was necessary']);
});

test('reminders: after the shift, the next morning, then before expiry', () => {
  const created = '2026-11-05T23:00:00Z';
  const dr = { created_at: created, updated_at: created, reminded_after_shift: false, reminded_morning: false, warned_expiry: false };
  const end = '2026-11-06T03:00:00Z';
  assert.equal(reminderDue(dr, end, '2026-11-06T03:30:00Z'), null);
  assert.equal(reminderDue(dr, end, '2026-11-06T04:00:00Z'), 'after_shift');
  const sent = { ...dr, reminded_after_shift: true };
  assert.equal(reminderDue(sent, end, '2026-11-06T09:30:00Z'), null);
  assert.equal(reminderDue(sent, end, '2026-11-06T10:05:00Z'), 'morning'); // GMT: 10:05 London
  assert.equal(reminderDue({ ...sent, reminded_morning: true }, end, '2026-11-06T10:05:00Z'), null);
  // Summer time: 09:30 UTC is 10:30 London
  const summer = { ...sent, created_at: '2026-07-01T22:00:00Z', updated_at: '2026-07-01T22:00:00Z' };
  assert.equal(reminderDue(summer, '2026-07-02T02:00:00Z', '2026-07-02T09:30:00Z'), 'morning');
  // No shift: an hour after it was started
  assert.equal(reminderDue(dr, null, '2026-11-06T00:01:00Z'), 'after_shift');
  const done = { ...sent, reminded_morning: true };
  assert.equal(reminderDue(done, end, '2026-12-02T23:00:00Z'), 'expiry_warn');
  assert.equal(reminderDue({ ...done, warned_expiry: true }, end, '2026-12-02T23:00:00Z'), null);
  assert.equal(reminderDue({ ...done, warned_expiry: true }, end, '2026-12-05T23:00:00Z'), 'expire');
});
