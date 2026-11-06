import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../index.mjs';
import { EARLY_MIN, tooEarly } from '../modules/clock.mjs';
import { profileDone } from '../modules/hr.mjs';

test('clock-in opens 15 minutes before the shift', () => {
  const start = new Date('2026-11-06T21:00:00Z');
  assert.equal(EARLY_MIN, 15);
  assert.equal(tooEarly(start, start - 16 * 60000), true);
  assert.equal(tooEarly(start, start - 14 * 60000), false);
  assert.equal(tooEarly(start, start - 15 * 60000), false);
});

test('set-up items tick themselves from the profile', () => {
  const o = { first_name: 'Sam', last_name: 'Khan', phone: '07700', address: '1 High St', postcode: 'EH1 1AA', dob: '1990-04-07', ni_number: 'QQ123456C' };
  assert.deepEqual(profileDone(o), ['profile']);
  assert.deepEqual(profileDone({ ...o, phone: '  ' }), []);
  assert.deepEqual(profileDone({ ...o, bank_sort_code: '12-34-56', bank_account: '12345678', utr: '1234567890', sia_number: '1234', sia_expiry: '2027-01-01' }), ['profile', 'bank', 'sia']);
  assert.deepEqual(profileDone({ bank_sort_code: '12-34-56', bank_account: '12345678' }), []);
});
