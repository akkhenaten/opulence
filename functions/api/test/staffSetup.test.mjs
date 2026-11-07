import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStaffDetails, cleanVenueManager, withoutPrivate, officerFromDetails } from '../lib/staffSetup.mjs';
import { catalogFor } from '../lib/orbCatalog.mjs';
import { actions } from '../modules/staffSetup.mjs';

const TODAY = '2026-11-07';
const good = {
  first_name: 'Sam', last_name: 'Okafor', email: 'Sam@Example.com', phone: '07700 900123', address: '1 High St, Manchester', postcode: 'm4 1ab',
  dob: '1990-05-01', ni_number: 'qq 12 34 56 c', sia_number: '1234 5678 9012 3456', sia_expiry: '2028-01-01',
  bank_name: 'Monzo', bank_sort_code: '04-00-04', bank_account: '1234 5678', ec_name: 'Ada Okafor', ec_relationship: 'Sister', ec_phone: '07700 900456',
  consent: true, sia_front_key: 'docs/staffsetup/a.jpg', photo_key: 'docs/staffsetup/b.jpg', nonsense_key: 'x',
};

test('complete details are cleaned', () => {
  const { details: d, files, error } = cleanStaffDetails(good, TODAY);
  assert.equal(error, undefined);
  assert.equal(d.email, 'sam@example.com');
  assert.equal(d.postcode, 'M4 1AB');
  assert.equal(d.ni_number, 'QQ123456C');
  assert.equal(d.sia_number, '1234567890123456');
  assert.equal(d.bank_sort_code, '040004');
  assert.equal(d.bank_account, '12345678');
  assert.equal(d.consent, undefined);
  assert.deepEqual(files, { sia_front: 'docs/staffsetup/a.jpg', photo: 'docs/staffsetup/b.jpg' });
});

test('only name, contact, address and consent are required', () => {
  const min = { first_name: 'Sam', last_name: 'Okafor', email: 'sam@example.com', phone: '07700900123', address: '1 High St', postcode: 'M4 1AB', consent: true };
  assert.equal(cleanStaffDetails(min, TODAY).error, undefined);
});

test('missing or bad fields are explained', () => {
  const err = (patch) => cleanStaffDetails({ ...good, ...patch }, TODAY).error;
  assert.match(err({ last_name: '' }), /name/);
  assert.match(err({ email: 'nope' }), /email/);
  assert.match(err({ phone: '123' }), /phone/);
  assert.match(err({ address: '' }), /address/);
  assert.match(err({ postcode: '12345' }), /postcode/);
  assert.match(err({ dob: '2015-01-01' }), /date of birth/);
  assert.match(err({ ni_number: 'AB12' }), /National Insurance/);
  assert.match(err({ sia_number: '1234' }), /16 digits/);
  assert.match(err({ bank_sort_code: '1234' }), /sort code/);
  assert.match(err({ bank_account: '123' }), /account number/);
  assert.match(err({ bank_account: '' }), /both/);
  assert.match(err({ ec_phone: '' }), /emergency contact/);
  assert.match(err({ consent: 'yes' }), /agree/);
});

test('the list and Orb never see date of birth, NI or bank details', () => {
  const { details } = cleanStaffDetails(good, TODAY);
  const out = withoutPrivate(details);
  for (const k of ['dob', 'ni_number', 'bank_name', 'bank_sort_code', 'bank_account']) assert.equal(out[k], undefined, k);
  assert.equal(out.email, 'sam@example.com');
});

test('a submission becomes an active profile with no login', () => {
  const { details } = cleanStaffDetails(good, TODAY);
  const o = officerFromDetails(details, 'docs/staffsetup/b.jpg');
  assert.equal(o.status, 'active');
  assert.equal(o.user_id, undefined);
  assert.equal(o.photo_key, 'docs/staffsetup/b.jpg');
  assert.equal(o.ni_number, 'QQ123456C');
});

test('the form is public, everything else is platform admin only', () => {
  for (const k of ['staffSetup.info', 'staffSetup.uploadUrl', 'staffSetup.submit']) assert.equal(actions[k].public, true, k);
  for (const k of ['staffSetup.link', 'staffSetup.toggle', 'staffSetup.rotate', 'staffSetup.list', 'staffSetup.get', 'staffSetup.create', 'staffSetup.discard']) {
    assert.equal(actions[k].platform, true, k);
  }
});

test('a company manager is refused; the honeypot quietly accepts', async () => {
  const boss = { id: 'u1', role: 'company', email: 'boss@example.com', status: 'active' };
  for (const k of ['staffSetup.list', 'staffSetup.create', 'staffSetup.toggle']) {
    await assert.rejects(actions[k].fn({ id: 'x' }, { user: boss }), (e) => e.status === 403, k);
  }
  assert.deepEqual(await actions['staffSetup.submit'].fn({ website: 'spam' }, {}), { ok: true });
});

test('Orb offers staff setup only to the platform admin', () => {
  const names = (user) => catalogFor(user, actions).map(([n]) => n);
  const boss = { id: 'u1', role: 'company', email: 'boss@example.com', status: 'active' };
  const admin = { id: 'u2', role: 'company', email: 'info@orbsolutions.co.uk', status: 'active' };
  assert.deepEqual(names(boss), []);
  assert.deepEqual(names(admin).sort(), ['staffSetup.create', 'staffSetup.list']);
});

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const vm = { first_name: 'Ana', last_name: 'Reid', email: 'Ana@Venue.co.uk', phone: '07700 900789', job_title: 'General Manager', venue_ids: [V1, V1, 'nope'], consent: true };

test('a venue manager ticks known venues only, or writes one that is not listed', () => {
  const { details: d, files, error } = cleanVenueManager(vm, [V1, V2]);
  assert.equal(error, undefined);
  assert.equal(d.email, 'ana@venue.co.uk');
  assert.deepEqual(d.venue_ids, [V1]);
  assert.equal(d.job_title, 'General Manager');
  assert.deepEqual(files, {});
  const other = cleanVenueManager({ ...vm, venue_ids: [], other_venue: 'The Loft' }, [V1]);
  assert.deepEqual(other.details.venue_ids, []);
  assert.equal(other.details.other_venue, 'The Loft');
});

test('a venue manager needs a name, contact, a venue and consent', () => {
  const err = (patch) => cleanVenueManager({ ...vm, ...patch }, [V1]).error;
  assert.match(err({ first_name: '' }), /name/);
  assert.match(err({ email: 'x' }), /email/);
  assert.match(err({ phone: '12' }), /phone/);
  assert.match(err({ venue_ids: [] }), /venue/);
  assert.match(err({ venue_ids: [V2] }), /venue/);
  assert.match(err({ consent: false }), /agree/);
});

test('the venue managers link is platform admin only too', async () => {
  const boss = { id: 'u1', role: 'company', email: 'boss@example.com', status: 'active' };
  for (const k of ['staffSetup.link', 'staffSetup.toggle', 'staffSetup.rotate']) {
    await assert.rejects(actions[k].fn({ kind: 'venue' }, { user: boss }), (e) => e.status === 403, k);
  }
});
