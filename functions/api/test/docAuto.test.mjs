// The cards Compliance raised on real uploads, and what Orb now does with each
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../lib/docAuto.mjs';
import { cardSet, mergedRead, passportSet, rtwShown, setFor } from '../lib/docSets.mjs';
import { officerIssues } from '../modules/compliance.mjs';

const today = '2026-11-08';
const roles = { door: { name: 'Door Supervisor', requires_sia: true } };
const officer = (x) => ({
  id: 'o1', status: 'active', roles: ['door'], rtw_verified: true, rtw_checked_at: '2026-10-01T10:00:00Z', rtw_method: 'share_code',
  sia_type: 'Door Supervisor', sia_status: 'active', sia_last_verified_at: '2026-11-01T10:00:00Z', ...x,
});
let n = 0;
const doc = (kind, read, x = {}) => ({ id: `d${++n}`, kind, title: kind === 'sia' ? 'SIA licence' : 'Passport', s3_key: `k${n}`, created_at: '2026-11-07T10:00:00Z', ai_read: { readable: true, concerns: [], ...read }, ...x });
const match = { result: 'match', note: 'Same person', against: 'profile' };
const run = (o, d, docs) => decide(o, d, mergedRead(setFor(d, docs, o), o).read, today);
const keys = (o, docs) => officerIssues(o, { today, roles, docs }).map((i) => i.key);

test('Augustine: the back reads <UNKNOWN> and part of the number, the front shows the photo, so the card applies', () => {
  const o = officer({ first_name: 'Augustine', last_name: 'Ezefuna', sia_number: '1019 6178 4979 1453', sia_expiry: '2028-05-01' });
  const back = doc('sia', { name: '<UNKNOWN>', number: '49791453', licence_type: 'Door Supervisor', expiry: '2028-05-01' }, { created_at: '2026-11-07T10:05:00Z' });
  const front = doc('sia', { name: '<UNKNOWN>', has_photo: true, face: match, licence_type: 'Door Supervisor' });
  const act = run(o, back, [back, front]);
  assert.equal(act?.kind, 'sia');
  assert.equal(act.number, '1019 6178 4979 1453');
  assert.deepEqual(keys(o, [back, front]).filter((k) => k.startsWith('doc_')), []);
});

test('Augustine without photo or number agreeing: the unreadable name is a gentle card, not a mismatch', () => {
  const o = officer({ first_name: 'Augustine', last_name: 'Ezefuna', sia_number: '', sia_expiry: '2028-05-01' });
  const d = doc('sia', { name: '<UNKNOWN>', licence_type: 'Door Supervisor', expiry: '2028-05-01' });
  assert.equal(run(o, d, [d]), null);
  assert.deepEqual(keys(o, [d]).filter((k) => k.startsWith('doc_')), [`doc_name_unread:${d.id}`]);
});

test('Aduloju: A. ADULOJILII with a matching photo applies, taking the card\'s earlier expiry', () => {
  const o = officer({ first_name: 'Ayodeji', last_name: 'Aduloju', sia_number: '', sia_expiry: '2029-02-07' });
  const d = doc('sia', { name: 'A. ADULOJILII', number: '1234567812345678', licence_type: 'Door Supervisor', expiry: '2029-02-03', has_photo: true, face: match });
  const act = run(o, d, [d]);
  assert.equal(act?.kind, 'sia');
  assert.equal(act.expiry, '2029-02-03');
  assert.equal(act.shortened, true);
  const far = doc('sia', { ...d.ai_read, expiry: '2028-12-01' });
  assert.equal(run(o, far, [far]), null);
  const exp = officerIssues(o, { today, roles, docs: [d] }).find((i) => i.key.endsWith(':expiry'));
  assert.equal(exp.severity, 'advisory');
});

test('Aaron Scott: SCOTT with a 17-digit read is a "not read fully" card; the BEATTIE passport stays a mismatch', () => {
  const o = officer({ first_name: 'Aaron', last_name: 'Scott', sia_number: '1015 9720 4554 8575', sia_expiry: '2028-01-01' });
  const sia = doc('sia', { name: 'SCOTT', number: '10169720465486776', licence_type: 'Door Supervisor', expiry: '2028-01-01' });
  assert.equal(run(o, sia, [sia]), null);
  const k = keys(o, [sia]);
  assert.ok(k.includes(`doc_number_unread:${sia.id}`));
  assert.ok(!k.some((x) => x.endsWith(':number')));
  assert.ok(k.includes(`doc_name_initial:${sia.id}`));
  const pass = doc('id', { name: 'AARON JAMES BEATTIE', is_passport: true, nationality: 'GBR', expiry: '2030-01-01', has_photo: true, face: match });
  assert.ok(keys(o, [pass]).includes(`doc_mismatch:${pass.id}:name`));
  assert.equal(run({ ...o, rtw_checked_at: null }, pass, [pass]), null);
});

test('Hand-ticked right to work: a British passport whose photo matches the SIA card saves Orb\'s check', () => {
  const o = officer({ first_name: 'Onyeka', last_name: 'Goddey', rtw_checked_at: null, rtw_method: '' });
  const pass = doc('rtw', { name: 'ONYEKA CHIDI GODDEY', is_passport: true, nationality: 'GBR', expiry: '2031-03-01', has_photo: true, face: { ...match, against: 'sia' } }, { verified_at: '2026-10-01T10:00:00Z' });
  const act = run(o, pass, [pass]);
  assert.equal(act?.kind, 'rtw');
  assert.equal(act.upgrade, true);
  assert.equal(run({ ...o, rtw_checked_at: '2026-10-01T10:00:00Z' }, pass, [pass]), null);
  assert.equal(run({ ...o, rtw_checked_at: null }, { ...pass, ai_read: { ...pass.ai_read, nationality: 'NGA' } }, [{ ...pass, ai_read: { ...pass.ai_read, nationality: 'NGA' } }]), null);
});

test('Blade: a passport with a finger over it stays for a person', () => {
  const o = officer({ first_name: 'Stanley', last_name: 'Scanlon', rtw_verified: false, rtw_checked_at: null });
  const pass = doc('id', { name: 'STANLEY SCANLON', is_passport: true, nationality: 'GBR', expiry: '2031-01-01', has_photo: true, face: match, concerns: ['Finger obscuring part of the page'] });
  assert.equal(run(o, pass, [pass]), null);
  assert.ok(keys(o, [pass]).includes(`doc_suspect:${pass.id}`));
});

test('Amina: a right to work document 24 days earlier than a hand-entered expiry moves the expiry; a GOV.UK check stands', () => {
  const o = officer({ first_name: 'Amina', last_name: 'Khan', rtw_expiry: '2027-01-18', rtw_method: '', rtw_checked_at: null });
  const d = doc('rtw', { name: 'AMINA KHAN', expiry: '2026-12-25' }, { title: 'Residence permit' });
  assert.deepEqual(run(o, d, [d]), { kind: 'rtw_expiry', expiry: '2026-12-25', fit: 'full', proof: { number: false, photo: false } });
  assert.equal(run({ ...o, rtw_method: 'share_code' }, d, [d]), null);
});

test('A Nigerian passport: the not-verified card says it needs a share code', () => {
  const o = officer({ first_name: 'Hemza', last_name: 'Berkani', rtw_verified: false, rtw_checked_at: null });
  const pass = doc('id', { name: 'HEMZA BERKANI', is_passport: true, nationality: 'NGA', expiry: '2031-01-01', has_photo: true, face: match });
  const card = officerIssues(o, { today, roles, docs: [pass] }).find((i) => i.key === 'unverified:rtw');
  assert.match(card.detail, /NGA: needs a share code/);
});

test('Sets: front and back within 30 days go together; an old card and the GOV.UK check page do not', () => {
  const a = doc('sia', {}, { created_at: '2026-11-07T10:00:00Z' });
  const b = doc('sia', {}, { created_at: '2026-11-01T10:00:00Z' });
  const old = doc('sia', {}, { created_at: '2025-01-01T10:00:00Z' });
  assert.deepEqual(cardSet([old, b, a]).map((d) => d.id), [a.id, b.id]);
  const gov = doc('rtw', { is_passport: true }, { created_at: '2026-11-08T10:00:00Z' });
  const pass = doc('id', { is_passport: true });
  assert.deepEqual(passportSet([gov, pass], { rtw_check_doc: gov.id, rtw_method: 'share_code' }).map((d) => d.id), [pass.id]);
});

test('Aaron: a passport uploaded as Right to work shows on the profile before Orb has read it as one', () => {
  const up = { ...doc('rtw', {}), ai_read: null };
  const check = doc('rtw', {}, { title: 'Right to work — manual check', created_at: '2026-11-08T10:00:00Z' });
  assert.deepEqual(rtwShown([check, up], {}).map((d) => d.id), [up.id]);
  const pass = doc('id', { is_passport: true });
  assert.deepEqual(rtwShown([check, up, pass], {}).map((d) => d.id), [pass.id]);
});
