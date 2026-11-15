import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compliance, graceOn } from '../modules/officers.mjs';
import { graceable, graceAsk } from '../modules/grace.mjs';

const today = '2026-11-08';
const base = { id: 'o1', first_name: 'Sam', last_name: 'Khan', roles: ['door'], status: 'active', rtw_verified: true, sia_number: '1234567890123456', sia_expiry: '2028-01-01' };

test('a grace lets a blocked officer work until the end of its last day, then blocks again', () => {
  const o = { ...base, sia_number: null, rtw_verified: false };
  assert.deepEqual(compliance(o, today).issues, ['No SIA licence on file', 'Right to work not verified']);
  const graced = { ...o, grace_until: '2026-11-22', grace_covers: ['sia_missing', 'rtw_unverified'] };
  const c = compliance(graced, today);
  assert.equal(c.ok, true);
  assert.deepEqual(c.graced, ['No SIA licence on file', 'Right to work not verified']);
  assert.equal(c.grace.ends_on, '2026-11-22');
  assert.equal(c.grace.days_left, 14);
  assert.equal(compliance(graced, '2026-11-22').ok, true);
  assert.equal(compliance(graced, '2026-11-23').ok, false);
  assert.equal(graceOn(graced, '2026-11-23'), null);
});

test('a grace only covers the reasons it was given for', () => {
  const o = { ...base, sia_number: null, grace_until: '2026-11-22', grace_covers: ['sia_missing'] };
  assert.equal(compliance(o, today).ok, true);
  const later = { ...o, rtw_verified: false };
  assert.deepEqual(compliance(later, today).issues, ['Right to work not verified']);
});

test('not active is never graced', () => {
  const o = { ...base, status: 'suspended', grace_until: '2026-11-22', grace_covers: ['sia_missing'] };
  assert.deepEqual(compliance(o, today).issues, ['Status: suspended']);
  assert.deepEqual(graceable(o, today), []);
});

test('covering a licence that runs out during the grace covers it once it has run out', () => {
  const o = { ...base, sia_expiry: '2026-11-12' };
  assert.deepEqual(graceable(o, today, '2026-11-22'), ['sia_expiry_shift']);
  assert.deepEqual(graceable(o, today, '2026-11-10'), []);
  const graced = { ...o, grace_until: '2026-11-22', grace_covers: ['sia_expiry_shift'] };
  assert.equal(compliance(graced, '2026-11-15').ok, true);
  assert.deepEqual(compliance({ ...o }, '2026-11-15').issues, ['SIA licence expired']);
});

test('stewards need no SIA licence, so nothing about it is graceable', () => {
  const o = { ...base, roles: ['steward'], sia_number: null, sia_expiry: null, rtw_verified: false };
  assert.deepEqual(graceable(o, today), ['rtw_unverified']);
});

test('the officer is asked for each missing thing once', () => {
  assert.equal(graceAsk(['sia_expired', 'sia_expiry_shift', 'rtw_unverified']), 'your renewed SIA licence and your passport or a right to work share code');
});

test('help: venue managers get their own password answer and no officer or company-only answers', async () => {
  const { guideFor } = await import('../lib/guide.mjs');
  const ids = (role) => guideFor(role).flatMap((c) => c.sections.map((s) => s.id));
  const venue = ids('venue');
  assert.ok(venue.includes('password_venue') && !venue.includes('password'));
  for (const id of ['clockfail', 'logo', 'email']) assert.ok(!venue.includes(id), id);
  assert.ok(ids('officer').includes('clockfail') && !ids('officer').includes('logo'));
  assert.ok(ids('company').includes('logo') && !ids('company').includes('password_venue'));
});
