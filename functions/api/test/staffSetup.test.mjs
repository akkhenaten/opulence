import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStaffDetails, cleanVenueManager, checkSetupPassword, withoutPrivate, officerFromDetails, DOC_KIND, SETUP_FILES } from '../lib/staffSetup.mjs';
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

test('a blank "known as" becomes an empty name, never null (the column refuses null)', () => {
  const { details } = cleanStaffDetails({ ...good, goes_by: '' }, TODAY);
  assert.equal(officerFromDetails(details).goes_by, '');
});

test('the form is public; the links are the platform admin\'s; forms are for company managers', () => {
  for (const k of ['staffSetup.info', 'staffSetup.uploadUrl', 'staffSetup.submit']) assert.equal(actions[k].public, true, k);
  for (const k of ['staffSetup.link', 'staffSetup.toggle', 'staffSetup.rotate']) assert.equal(actions[k].platform, true, k);
  for (const k of ['staffSetup.list', 'staffSetup.get', 'staffSetup.create', 'staffSetup.discard']) {
    assert.equal(actions[k].platform, undefined, k);
    assert.deepEqual(actions[k].roles, ['company'], k);
  }
});

test('a company manager cannot change the link; the honeypot quietly accepts', async () => {
  const boss = { id: 'u1', role: 'company', email: 'boss@example.com', status: 'active' };
  for (const k of ['staffSetup.toggle', 'staffSetup.rotate', 'staffSetup.link']) {
    await assert.rejects(actions[k].fn({ id: 'x' }, { user: boss }), (e) => e.status === 403, k);
  }
  assert.deepEqual(await actions['staffSetup.submit'].fn({ website: 'spam' }, {}), { ok: true });
});

test('Orb offers the waiting forms to company managers, never to security managers', () => {
  const names = (user) => catalogFor(user, actions).map(([n]) => n).sort();
  const boss = { id: 'u1', role: 'company', email: 'boss@example.com', status: 'active' };
  const sec = { id: 'u3', role: 'security', email: 'sec@example.com', status: 'active' };
  const admin = { id: 'u2', role: 'company', email: 'info@orbsolutions.co.uk', status: 'active' };
  assert.deepEqual(names(boss), ['staffSetup.create', 'staffSetup.list']);
  assert.deepEqual(names(sec), []);
  assert.deepEqual(names(admin), ['staffSetup.create', 'staffSetup.list']);
});

test('a bad field says which field it is', () => {
  const field = (patch) => cleanStaffDetails({ ...good, ...patch }, TODAY).field;
  assert.equal(field({ postcode: '12345' }), 'postcode');
  assert.equal(field({ email: 'nope' }), 'email');
  assert.equal(field({ bank_account: '' }), 'bank_account');
  assert.equal(field({ consent: false }), 'consent');
  assert.equal(cleanStaffDetails(good, TODAY).field, undefined);
});

test('the password on the form: 8 characters, typed twice the same', () => {
  assert.equal(checkSetupPassword('short', 'short').field, 'password');
  assert.equal(checkSetupPassword(undefined, undefined).field, 'password');
  assert.equal(checkSetupPassword('longenough1', 'longenough2').field, 'password_confirm');
  assert.deepEqual(checkSetupPassword('longenough1', 'longenough1'), {});
});

test('both sides of the SIA card are filed under SIA, the passport under ID', () => {
  assert.deepEqual(cleanStaffDetails({ ...good, sia_back_key: 'docs/staffsetup/c.jpg' }, TODAY).files.sia_back, 'docs/staffsetup/c.jpg');
  assert.equal(DOC_KIND.sia_front, 'sia');
  assert.equal(DOC_KIND.sia_back, 'sia');
  assert.equal(DOC_KIND.rtw, 'id');
  assert.match(SETUP_FILES.rtw, /Passport/);
  assert.equal(DOC_KIND.photo, undefined);
});

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const vm = { first_name: 'Ana', last_name: 'Reid', email: 'Ana@Venue.co.uk', phone: '07700 900789', job_title: 'General Manager', venue_name: ' The Loft ', venue_ids: [V1, V2], consent: true };

test('a venue manager types their venue; a list of venues is never taken from them', () => {
  const { details: d, files, error } = cleanVenueManager(vm);
  assert.equal(error, undefined);
  assert.equal(d.email, 'ana@venue.co.uk');
  assert.equal(d.venue_name, 'The Loft');
  assert.equal(d.venue_ids, undefined);
  assert.equal(d.job_title, 'General Manager');
  assert.deepEqual(files, {});
  assert.deepEqual(cleanVenueManager({ ...vm, photo_key: 'docs/staffsetup/p.jpg', rtw_key: 'docs/staffsetup/x.pdf' }).files, { photo: 'docs/staffsetup/p.jpg' });
});

test('the venue managers form never lists the venues', async () => {
  assert.deepEqual(Object.keys(await actions['staffSetup.info'].fn({}, {})), ['open']);
});

test('a venue manager needs a name, contact, a venue and consent', () => {
  const err = (patch) => cleanVenueManager({ ...vm, ...patch }).error;
  assert.match(err({ first_name: '' }), /name/);
  assert.match(err({ email: 'x' }), /email/);
  assert.match(err({ phone: '12' }), /phone/);
  assert.match(err({ venue_name: '  ' }), /venue/);
  assert.match(err({ consent: false }), /agree/);
});

test('the venue managers link is platform admin only too', async () => {
  const boss = { id: 'u1', role: 'company', email: 'boss@example.com', status: 'active' };
  for (const k of ['staffSetup.link', 'staffSetup.toggle', 'staffSetup.rotate']) {
    await assert.rejects(actions[k].fn({ kind: 'venue' }, { user: boss }), (e) => e.status === 403, k);
  }
});

test('a venue manager\'s bad field says which field it is', () => {
  const field = (patch) => cleanVenueManager({ ...vm, ...patch }).field;
  assert.equal(field({ email: 'x' }), 'email');
  assert.equal(field({ venue_name: '' }), 'venue_names');
  assert.equal(field({ consent: false }), 'consent');
  assert.equal(cleanVenueManager(vm).field, undefined);
});

test('both forms take a password; a double is never made live and its discard says who it is', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../modules/staffSetup.mjs', import.meta.url), 'utf8');
  const submit = src.slice(src.indexOf("'staffSetup.submit'"), src.indexOf("'staffSetup.link'"));
  assert.match(submit, /checkSetupPassword\(b\.password, b\.password_confirm\)/);
  assert.doesNotMatch(submit, /kind === 'officer' \? hashPassword/);
  const create = src.slice(src.indexOf("'staffSetup.create'"), src.indexOf("'staffSetup.discard'"));
  assert.match(create, /fail\(409, `Already on file: \$\{dup\.name\}`, \{ duplicate: dup \}\)/);
  const discard = src.slice(src.indexOf("'staffSetup.discard'"));
  assert.match(discard, /return \{ ok: true, duplicate: dup \}/);
  assert.doesNotMatch(src, /ownsKind/);
});
