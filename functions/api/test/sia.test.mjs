import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSia, validSia, siaGroups, ukDate, maskDob, checkDue } from '../lib/sia.mjs';
import { compliance } from '../modules/officers.mjs';
import { officerIssues } from '../modules/compliance.mjs';

const today = '2026-11-05';
const roles = { door: { name: 'Door Supervisor', requires_sia: true }, steward: { name: 'Steward', requires_sia: false } };
const base = {
  id: 'o1', first_name: 'Sam', last_name: 'Khan', roles: ['door'], status: 'active', rtw_verified: true,
  sia_number: '1234 5678 9012 3456', sia_type: 'Door Supervisor', sia_expiry: '2028-01-01', sia_status: 'active', sia_last_verified_at: '2026-10-26T10:00:00Z',
};
const shift = { assignment_id: 'a1', role: 'door', venue_name: 'Club', role_name: 'Door Supervisor', starts_at: '2026-11-07T20:00:00Z', ends_at: '2026-11-08T03:00:00Z' };
const keys = (o, ctx = {}) => officerIssues(o, { today, roles, ...ctx }).map((i) => i.key);

test('licence number and dates for the register search', () => {
  assert.equal(cleanSia(' 1234-5678 9012 3456 '), '1234567890123456');
  assert.ok(validSia('1234-5678-9012-3456'));
  assert.ok(!validSia('123456789012345'));
  assert.ok(!validSia('12345678901234567'));
  assert.equal(siaGroups('1234567890123456'), '1234-5678-9012-3456');
  assert.equal(ukDate('1990-04-07'), '07/04/1990');
  assert.equal(maskDob('1990-04-07'), '••/••/1990');
  assert.equal(ukDate(null), '');
  assert.ok(checkDue({ sia_last_verified_at: null }, today));
  assert.ok(checkDue({ sia_last_verified_at: '2026-08-06T09:00:00Z' }, today));
  assert.ok(!checkDue({ sia_last_verified_at: '2026-10-26T09:00:00Z' }, today));
});

test('a licence not active on the register blocks rostering', () => {
  for (const s of ['expired', 'suspended', 'revoked', 'investigation', 'not_found']) {
    const c = compliance({ ...base, sia_status: s }, today);
    assert.equal(c.ok, false, s);
    assert.ok(c.issues.some((i) => i.startsWith('SIA register shows')), s);
  }
  assert.equal(compliance({ ...base, sia_status: 'pending' }, today).ok, true);
  assert.equal(compliance({ ...base, sia_status: 'active' }, today).ok, true);
  assert.equal(compliance({ ...base, roles: ['steward'], sia_status: 'suspended' }, today).ok, true);
});

test('Ops AI: register status and re-checks', () => {
  const susp = officerIssues({ ...base, sia_status: 'suspended' }, { today, roles, shifts: [shift] }).find((i) => i.key === 'register:sia');
  assert.equal(susp.severity, 'urgent');
  assert.ok(susp.actions.some((a) => a.kind === 'unassign' && a.default));
  assert.ok(keys({ ...base, sia_last_verified_at: null, sia_status: 'pending' }, { shifts: [shift] }).includes('recheck:sia'));
  assert.ok(!keys({ ...base, sia_last_verified_at: null, sia_status: 'pending' }).includes('recheck:sia'));
  assert.ok(keys({ ...base, sia_last_verified_at: '2026-08-06T09:00:00Z' }).includes('recheck:sia'));
  assert.ok(!keys(base, { shifts: [shift] }).includes('recheck:sia'));
  assert.ok(!keys({ ...base, status: 'applicant', sia_last_verified_at: null }, { shifts: [shift] }).includes('recheck:sia'));
  assert.ok(!keys({ ...base, roles: ['steward'], sia_status: 'revoked' }).includes('register:sia'));
});
