// The compliance queue: who acts next, the profile / upload / Orb comparison, shifts affected, and who may open a document
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectedShifts, checkedBy, compareRows, handledSig, ownerLabel, ownerOf, whyItMatters } from '../lib/complianceQueue.mjs';
import { assertOfficerAccess } from '../lib/scope.mjs';
import { actions } from '../modules/compliance.mjs';

const D = '6f1c2e9a-1b2c-4d5e-8f90-123456789abc';

test('the officer acts on missing, expiring and unfinished items; the office on checks and decisions', () => {
  assert.equal(ownerOf('missing:first_aid'), 'officer');
  assert.equal(ownerOf('expiry_shift:sia'), 'officer');
  assert.equal(ownerOf('training:c1'), 'officer');
  assert.equal(ownerOf('venue_pack:v1'), 'officer');
  assert.equal(ownerOf('rtw:code_old'), 'officer');
  for (const k of [`unverified:${D}`, `doc_mismatch:${D}:expiry`, 'renewal:sia', 'register:sia', 'grace_expired', 'contract_end', '']) assert.equal(ownerOf(k), 'office', k);
});

test('the owner pill says what the next step is', () => {
  assert.equal(ownerLabel({ key: 'missing:first_aid' }), 'Officer to upload');
  assert.equal(ownerLabel({ key: 'expiry_soon:sia' }), 'Officer to renew');
  assert.equal(ownerLabel({ key: 'venue_pack:v1' }), 'Officer to sign');
  assert.equal(ownerLabel({ key: 'training:c1' }), 'Officer to complete');
  assert.equal(ownerLabel({ key: 'register:sia' }), 'Office to check the register');
  assert.equal(ownerLabel({ key: `unverified:${D}` }), 'Office to check');
  assert.equal(ownerLabel({ key: 'grace_expired' }), 'Office to decide');
});

test("Orb applying its reading is Orb's check, never a person's", () => {
  assert.equal(checkedBy(null), 'none');
  assert.equal(checkedBy({ verified_at: null }), 'none');
  assert.equal(checkedBy({ verified_at: '2026-11-01', verified_by: null, auto_applied_at: '2026-11-01' }), 'orb');
  assert.equal(checkedBy({ verified_at: '2026-11-01', verified_by: 'u1', auto_applied_at: null }), 'person');
});

test('the comparison marks values that differ, ignoring spaces and case', () => {
  const o = { first_name: 'Sam', last_name: 'Reed', sia_number: '1234 5678 9012 3456', sia_expiry: '2027-03-03' };
  const d = { number: '1234567890123456', expiry: '2027-03-03', ai_read: { number: '1234 5678 9012 3456', expiry: '2027-03-30', name: 'SAMUEL REED', has_photo: true } };
  const rows = compareRows('sia', o, d);
  assert.deepEqual(rows.map((r) => [r.field, r.mismatch]), [['number', false], ['expiry', true], ['name', false], ['photo', false]]);
  assert.equal(rows[1].orb, '2027-03-30');
});

test('a name Orb read that is not theirs, and no photo, are flagged', () => {
  const rows = compareRows('sia', { first_name: 'Sam', last_name: 'Reed' }, { ai_read: { name: 'Alex Morgan', has_photo: false } });
  assert.deepEqual(rows.map((r) => [r.field, r.mismatch]), [['name', true], ['photo', true]]);
});

test('a document with nothing to compare gives no rows', () => {
  assert.deepEqual(compareRows('first_aid', { first_name: 'Sam', last_name: 'Reed' }, null), []);
});

test('shifts affected are the ones Remove from shifts names, within 14 days', () => {
  const now = new Date('2026-11-15T12:00:00Z').getTime();
  const shifts = [
    { assignment_id: 'a1', shift_id: 's1', venue_name: 'Club One', starts_at: '2026-11-20T21:00:00Z' },
    { assignment_id: 'a2', shift_id: 's2', venue_name: 'Bar 9', starts_at: '2026-12-20T21:00:00Z' },
    { assignment_id: 'a3', shift_id: 's3', venue_name: 'The Vaults', starts_at: '2026-11-18T21:00:00Z' },
  ];
  const issue = { actions: [{ kind: 'unassign', params: { assignment_ids: ['a1', 'a2'] } }] };
  assert.deepEqual(affectedShifts(issue, shifts, now).map((s) => s.assignment_id), ['a1']);
  assert.deepEqual(affectedShifts({ actions: [], shift: shifts[2] }, shifts, now).map((s) => s.shift_id), ['s3']);
  assert.deepEqual(affectedShifts({ actions: [] }, shifts, now), []);
});

test('a handled finding comes back when its urgency changes', () => {
  assert.notEqual(handledSig({ sig: 'x', severity: 'soon' }), handledSig({ sig: 'x', severity: 'urgent' }));
  assert.notEqual(handledSig({ sig: 'x', severity: 'soon' }), 'x');
});

test('why it matters names the date it stops counting', () => {
  assert.match(whyItMatters('licence', '2027-03-03'), /after 2027-03-03/);
  assert.match(whyItMatters('rtw'), /legal check/);
});

test('only managers reach the queue; venue users and other officers are refused a document', async () => {
  for (const name of ['compliance.overview', 'compliance.document', 'compliance.act']) assert.deepEqual(actions[name].roles, ['company', 'security'], name);
  await assert.rejects(assertOfficerAccess({ role: 'venue', id: 'u1' }, 'o1'), (e) => e.status === 403 || /No access/.test(e.message));
  await assert.rejects(assertOfficerAccess({ role: 'officer', id: 'u2', officer_id: 'o2' }, 'o1'), (e) => e.status === 403 || /No access/.test(e.message));
});

test('the queue action only takes actions of the finding it is about', async () => {
  await assert.rejects(actions['compliance.act'].fn({ officer_id: 'o1', key: 'missing:first_aid', action_ids: ['expiry_soon:sia|remind'] }, { user: { role: 'company', id: 'u1' } }), /Pick at least one action/);
});
