import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanShareCode, rtwResultOf } from '../lib/rtw.mjs';
import { cleanStaffDetails } from '../lib/staffSetup.mjs';
import { officerIssues } from '../modules/compliance.mjs';
import { actions, rtwCheckInput } from '../modules/officers.mjs';

const TODAY = '2026-11-07';

test('a share code is 9 letters and numbers starting with W, kept as W12 345 678', () => {
  assert.equal(cleanShareCode('w2x 4ym 8kp'), 'W2X 4YM 8KP');
  assert.equal(cleanShareCode('W2X-4YM-8KP'), 'W2X 4YM 8KP');
  assert.equal(cleanShareCode('W2X4YM8KP'), 'W2X 4YM 8KP');
  assert.equal(cleanShareCode('R2X4YM8KP'), null);
  assert.equal(cleanShareCode('W2X4YM8K'), null);
  assert.equal(cleanShareCode('W2X4YM8KPQ'), null);
  assert.equal(cleanShareCode(null), null);
});

test('what the AI read off a GOV.UK check page is made safe to pre-fill', () => {
  assert.deepEqual(rtwResultOf({ readable: true, is_gov_check: true, name: 'Sam Okafor', permission: 'unlimited', expiry: '2030-01-01', concerns: [] }),
    { readable: true, is_gov_check: true, name: 'Sam Okafor', permission: 'unlimited', expiry: '', reference: '', check_date: '', concerns: [] });
  assert.equal(rtwResultOf({ permission: 'time_limited', expiry: '2027-03-01' }).expiry, '2027-03-01');
  assert.equal(rtwResultOf({ permission: 'time_limited', expiry: '1 March 2027' }).expiry, '');
  assert.equal(rtwResultOf({ permission: 'forever' }).permission, 'unknown');
  assert.equal(rtwResultOf(null).permission, 'unknown');
});

test('the staff setup form takes an optional share code', () => {
  const base = { first_name: 'Sam', last_name: 'Okafor', email: 'sam@example.com', phone: '07700900123', address: '1 High St', postcode: 'M4 1AB', consent: true };
  assert.equal(cleanStaffDetails({ ...base, rtw_share_code: 'w2x4ym8kp' }, TODAY).details.rtw_share_code, 'W2X 4YM 8KP');
  assert.equal(cleanStaffDetails(base, TODAY).details.rtw_share_code, null);
  assert.match(cleanStaffDetails({ ...base, rtw_share_code: '12345' }, TODAY).error, /share code/);
});

const officer = { id: 'o1', first_name: 'Sam', last_name: 'Okafor', roles: ['steward'], status: 'active', rtw_verified: false };
const ctx = (docs) => ({ today: TODAY, roles: { steward: { requires_sia: false } }, docs });
const keys = (o, docs = []) => officerIssues(o, ctx(docs)).map((i) => i.key);
const codeDoc = (created) => ({ id: 'd1', kind: 'rtw', title: 'Right to work share code', number: 'W2X 4YM 8KP', s3_key: null, created_at: created });

test('a share code goes to Compliance, ready to check on GOV.UK', () => {
  const k = keys(officer, [codeDoc('2026-11-01T10:00:00Z')]);
  assert.ok(k.includes('rtw:code_ready'));
  assert.ok(!k.includes('unverified:rtw'));
});

test('a share code over 80 days old asks for a new one', () => {
  const k = keys(officer, [codeDoc('2026-08-01T10:00:00Z')]);
  assert.ok(k.includes('rtw:code_old'));
  assert.ok(!k.includes('rtw:code_ready'));
});

test('no share code: not verified; ticked by hand without a saved check: flagged softly', () => {
  assert.ok(keys(officer).includes('unverified:rtw'));
  const ticked = officerIssues({ ...officer, rtw_verified: true }, ctx([])).find((i) => i.key === 'rtw:no_record');
  assert.equal(ticked.severity, 'advisory');
  assert.ok(!keys({ ...officer, rtw_verified: true, rtw_checked_at: '2026-11-07T10:00:00Z' }).includes('rtw:no_record'));
});

test('ticked by hand: Orb offers a reminder, a re-read of a passport it could not use, or untick with a grace period to send it', () => {
  const card = (o, docs = []) => officerIssues({ ...officer, rtw_verified: true, ...o }, ctx(docs)).find((i) => i.key === 'rtw:no_record');
  const grace = card({}).actions.find((a) => a.kind === 'rtw_grace');
  assert.equal(grace.company_only, true);
  assert.equal(grace.default, false);
  assert.equal(grace.params.days, 14);
  assert.match(grace.label, /Untick right to work and give Sam 14 days/);
  const blurry = { id: 'p1', kind: 'rtw', title: 'Passport', s3_key: 'k', ai_read_key: 'k', created_at: '2026-11-01T10:00:00Z', ai_read: { readable: false, is_passport: true } };
  assert.ok(card({}, [blurry]).actions.some((a) => a.kind === 'recheck' && a.params.doc_id === 'p1'));
  assert.ok(!card({}).actions.some((a) => a.kind === 'recheck'));
  // Already on a grace period, or not active: no second one from the card
  assert.ok(!card({ grace_until: '2026-11-15' }).actions.some((a) => a.kind === 'rtw_grace'));
  assert.ok(!card({ status: 'onboarding' }).actions.some((a) => a.kind === 'rtw_grace'));
});

test('a right to work check needs the saved page, the photo confirmed and an end date when time-limited', () => {
  const ok = { id: 'o1', s3_key: 'docs/officers/check.pdf', photo_matched: true, permission: 'unlimited' };
  assert.equal(rtwCheckInput(ok, TODAY).expiry, null);
  assert.equal(rtwCheckInput({ ...ok, permission: 'time_limited', expiry: '2027-03-01' }, TODAY).expiry, '2027-03-01');
  const bad = (patch) => assert.throws(() => rtwCheckInput({ ...ok, ...patch }, TODAY), (e) => e.status === 400);
  bad({ s3_key: '' });
  bad({ s3_key: 'elsewhere/x.pdf' });
  bad({ photo_matched: false });
  bad({ permission: '' });
  bad({ permission: 'time_limited', expiry: '' });
  bad({ permission: 'time_limited', expiry: '2026-01-01' });
});

test('only the company records a right to work check', () => {
  for (const k of ['officers.rtwCheck', 'officers.rtwRead']) assert.deepEqual(actions[k].roles, ['company'], k);
});
