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

test('officer reports must carry the shift; managers may file without one', async () => {
  const { requireShift } = await import('../modules/incidents.mjs');
  assert.throws(() => requireShift({ role: 'officer' }, null), /Open the shift/);
  assert.doesNotThrow(() => requireShift({ role: 'officer' }, 'shift-1'));
  assert.doesNotThrow(() => requireShift({ role: 'company' }, null));
});

test('set-up document items tick from what is on file', async () => {
  const { docsDone } = await import('../modules/hr.mjs');
  assert.deepEqual(docsDone(['rtw', 'poa', 'training']), ['rtw', 'poa']);
  assert.deepEqual(docsDone(['sia']), []);
});

test('the officer ejection list only covers their own entries', async () => {
  const { MINE_SQL } = await import('../modules/bans.mjs');
  assert.match(MINE_SQL, /WHERE b\.proposed_by = \$1 ORDER BY/);
  assert.doesNotMatch(MINE_SQL, /\bOR\b/);
});

test('ejections can be logged on your own shift up to 30 days after it, but no bans', async () => {
  const { lateEjectionOk, LATE_EJECTION_DAYS } = await import('../modules/shiftlog.mjs');
  const { lateCheck } = await import('../modules/bans.mjs');
  const end = new Date('2026-11-01T03:00:00Z');
  const ax = { a: { id: 'asg' }, sh: { ends_at: end } };
  const day = 86400e3;
  assert.equal(LATE_EJECTION_DAYS, 30);
  assert.equal(lateEjectionOk(ax, +end + 29 * day), true);
  assert.equal(lateEjectionOk(ax, +end + 31 * day), false);
  assert.equal(lateEjectionOk(ax, +end - 60000), false);
  assert.equal(lateEjectionOk({ a: null, sh: ax.sh }, +end + day), false);
  assert.throws(() => lateCheck(true, { kind: 'ban' }), /Ask the office/);
  assert.doesNotThrow(() => lateCheck(true, { kind: 'ejection' }));
  assert.doesNotThrow(() => lateCheck(false, { kind: 'ban' }));
});
