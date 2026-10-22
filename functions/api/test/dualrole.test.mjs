import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveActing, ownOfficer } from '../lib/auth.mjs';
import { decideSelf } from '../lib/selfcheck.mjs';

const row = (role, officer_id = null) => ({ id: 'u1', role, officer_id, status: 'active' });

test('manager with a staff record on "My shifts" acts as an officer for their own record', () => {
  const u = resolveActing(row('security', 'o1'), 'officer');
  assert.equal(u.role, 'officer');
  assert.equal(u.officer_id, 'o1');
  assert.equal(u.login_role, 'security');
  assert.equal(u.self_officer_id, 'o1');
  assert.equal(u.dual, true);
  assert.equal(ownOfficer(u), 'o1');
});

test('manager side keeps the real role and hides the staff record from manager code', () => {
  const u = resolveActing(row('company', 'o1'), undefined);
  assert.equal(u.role, 'company');
  assert.equal(u.officer_id, null);
  assert.equal(u.self_officer_id, 'o1');
  assert.equal(u.dual, true);
  assert.equal(ownOfficer(u), 'o1');
});

test('_as never grants officer access to a manager without a staff record', () => {
  const u = resolveActing(row('company'), 'officer');
  assert.equal(u.role, 'company');
  assert.equal(u.dual, false);
  assert.equal(u.self_officer_id, null);
});

test('venue and officer logins ignore _as', () => {
  assert.equal(resolveActing(row('venue', 'o9'), 'officer').role, 'venue');
  assert.equal(resolveActing(row('venue', 'o9'), 'officer').dual, false);
  const o = resolveActing(row('officer', 'o2'), 'officer');
  assert.equal(o.role, 'officer');
  assert.equal(o.officer_id, 'o2');
  assert.equal(o.self_officer_id, null);
  assert.equal(ownOfficer(o), 'o2');
});

test('own hours are blocked when another manager can approve', () => {
  assert.deepEqual(decideSelf({ isOwn: true, otherApprovers: true }), { self: true, blocked: true });
});

test('own hours are allowed but flagged when nobody else can approve', () => {
  assert.deepEqual(decideSelf({ isOwn: true, otherApprovers: false }), { self: true, selfApproved: true });
});

test('someone else\'s hours are unaffected', () => {
  assert.deepEqual(decideSelf({ isOwn: false, otherApprovers: true }), { self: false, selfApproved: false });
});
