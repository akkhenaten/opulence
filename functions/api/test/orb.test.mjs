import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../index.mjs';
import { CATALOG, BANNED, catalogFor, sanitize, searchCatalog, tierOf } from '../lib/orbCatalog.mjs';
import { searchGuide } from '../modules/assistant.mjs';

const company = { id: 'u1', role: 'company', name: 'Alex' };
const security = { id: 'u2', role: 'security', name: 'Dan', can_see_pay: false };

test('every catalogue entry is a real action with a valid tier', () => {
  for (const [name, d] of Object.entries(CATALOG)) {
    assert.ok(ACTIONS[name], `${name} is not an action`);
    assert.ok(['read', 'auto', 'confirm'].includes(d.tier), `${name} has tier ${d.tier}`);
    assert.ok(d.title && d.area, `${name} needs a title and area`);
  }
});

test('nothing sensitive is in the catalogue', () => {
  for (const name of Object.keys(CATALOG)) assert.ok(!BANNED.test(name), `${name} must not be in the catalogue`);
  for (const name of ['auth.login', 'files.upload', 'users.resetLink', 'settings.setLogo', 'assistant.send', 'pay.pdf']) assert.ok(BANNED.test(name), name);
  // Money changes only go through the purpose-built pay cards
  for (const name of ['pay.generate', 'payRuns.issue', 'invoices.issue', 'invoices.markPaid']) assert.ok(!CATALOG[name], name);
});

test('undo actions exist', () => {
  for (const [name, d] of Object.entries(CATALOG)) {
    if (!d.undo) continue;
    const u = d.undo({ id: 'r1' }, { officer_id: 'o1', code: 'c', done: true, target: 'officers', ids: ['o1'], course_id: 'c1' });
    if (u) assert.ok(ACTIONS[u.action], `${name} undo ${u.action} missing`);
  }
});

test('a security manager without pay access gets no company-only or pay actions', () => {
  const names = catalogFor(security, ACTIONS).map(([n]) => n);
  for (const n of names) assert.ok(ACTIONS[n].roles.includes('security'), n);
  assert.ok(!names.some((n) => /^(pay|payRuns|payAgreements|invoices)\./.test(n)));
  assert.ok(!names.includes('settings.update') && !names.includes('contracts.send') && !names.includes('clients.save'));
  assert.ok(names.includes('shifts.save') && names.includes('hrnotes.create'));
  const withPay = catalogFor({ ...security, can_see_pay: true }, ACTIONS).map(([n]) => n);
  assert.ok(withPay.includes('payRuns.list'));
  assert.ok(!withPay.includes('invoices.list'), 'invoices are company only');
});

test('the company gets everything in the catalogue', () => {
  const names = catalogFor(company, ACTIONS).map(([n]) => n);
  for (const n of ['settings.update', 'contracts.send', 'invoices.list', 'users.invite', 'shifts.publish']) assert.ok(names.includes(n), n);
});

test('new draft shifts run straight away; edits and published shifts need Confirm', () => {
  const d = CATALOG['shifts.save'];
  assert.equal(tierOf(d, { venue_id: 'v' }), 'auto');
  assert.equal(tierOf(d, { id: 's1' }), 'confirm');
  assert.equal(tierOf(d, { status: 'published' }), 'confirm');
  assert.deepEqual(d.prepare({ venue_id: 'v', status: 'draft' }).status, 'draft');
  assert.equal(tierOf(CATALOG['shifts.publish'], {}), 'confirm');
});

test('plain HR notes run straight away; warnings, reviews and notes the officer sees need Confirm', () => {
  const h = CATALOG['hrnotes.create'];
  assert.equal(tierOf(h, { kind: 'note' }), 'auto');
  assert.equal(tierOf(h, { kind: 'warning' }), 'confirm');
  assert.equal(tierOf(h, { kind: 'review' }), 'confirm');
  assert.equal(tierOf(h, { kind: 'commendation', visible_to_officer: true }), 'confirm');
});

test('sanitize drops secrets and trims bulk', () => {
  const out = sanitize({ name: 'A', password_hash: 'x', token: 't', signature_png: 'p', api_key: 'k', nested: { reset_token: 'r', ok: 1 },
    list: Array.from({ length: 60 }, (_, i) => i), long: 'x'.repeat(3000) });
  assert.equal(out.name, 'A');
  for (const k of ['password_hash', 'token', 'signature_png', 'api_key']) assert.ok(!(k in out), k);
  assert.deepEqual(out.nested, { ok: 1 });
  assert.equal(out.list.length, 41);
  assert.deepEqual(out.list[40], { more: 20 });
  assert.ok(out.long.length <= 1501);
});

test('find_actions search ranks by title', () => {
  const hits = searchCatalog(catalogFor(company, ACTIONS), 'add hr note');
  assert.equal(hits[0].action, 'hrnotes.create');
  assert.ok(searchCatalog(catalogFor(security, ACTIONS), 'send contract').every((h) => h.action !== 'contracts.send'));
});

test('the guide search finds how to send a policy', () => {
  const hits = searchGuide('company', 'Acme', 'send a policy to everyone');
  assert.ok(hits.length);
  assert.ok(hits.some((h) => /polic/i.test(`${h.section} ${h.body}`)));
});
