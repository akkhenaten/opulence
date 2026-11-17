import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appsOf, planAccess, appsLine, appsGained, LAST_MANAGER } from '../lib/apps.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const plan = (before, want, o = {}) => planAccess({ before, want, ...o });
const err = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

test('apps: a login is read as ticks', () => {
  assert.deepEqual(appsOf({ role: 'officer' }), { officer: true, manager: null });
  assert.deepEqual(appsOf({ role: 'security' }, true), { officer: true, manager: 'security' });
  assert.deepEqual(appsOf({ role: 'company' }), { officer: false, manager: 'company' });
  assert.deepEqual(appsOf(null), { officer: false, manager: null });
});

test('access: one manager portal, Officer app pairs with Office or Security only', () => {
  assert.equal(plan({ officer: true }, { officer: true, manager: 'security' }).role, 'security');
  assert.equal(plan({ officer: true }, { officer: true, manager: 'security' }).link, 'keep');
  assert.equal(plan({ manager: 'company' }, { officer: true, manager: 'company' }).link, 'link');
  assert.equal(plan({ officer: true, manager: 'security' }, { manager: 'venue' }).link, 'unlink');
  assert.equal(plan({ officer: true, manager: 'security' }, { officer: true }).role, 'officer');
  assert.match(err(() => plan({ manager: 'security' }, { officer: true, manager: 'venue' })), /Venue managers use their own portal/);
  assert.match(err(() => plan({ manager: 'security' }, { manager: 'boss' })), /Pick Office/);
});

test('access: nothing ticked, your own access, the last company manager, a staff record without a login', () => {
  assert.match(err(() => plan({ officer: true }, {})), /Deactivate/);
  assert.match(err(() => plan({}, {}, { hasLogin: false })), /Tick what they can use/);
  assert.match(err(() => plan({ manager: 'company' }, { manager: 'security' }, { isSelf: true })), /Another company manager/);
  assert.equal(plan({ manager: 'company' }, { manager: 'company' }, { isSelf: true }).changed, false);
  assert.equal(err(() => plan({ manager: 'company' }, { manager: 'security' }, { lastCompanyManager: true })), LAST_MANAGER);
  assert.equal(plan({ manager: 'company' }, { officer: true, manager: 'company' }, { lastCompanyManager: true }).link, 'link');
  assert.match(err(() => plan({}, { manager: 'company' }, { hasLogin: false, fromStaffRecord: true })), /Tick Officer app/);
  assert.equal(plan({}, { officer: true, manager: 'company' }, { hasLogin: false, fromStaffRecord: true }).role, 'company');
});

test('apps line and what a change gives and takes', () => {
  assert.equal(appsLine({ officer: true, manager: 'security', venues: ['Club One', 'The Vaults'], can_see_pay: true }),
    'Officer app and Security manager for Club One and The Vaults · can see pay');
  assert.equal(appsLine({ manager: 'company' }), 'Office (all venues) · can see pay');
  assert.equal(appsLine({ manager: 'venue', venues: [] }), 'Venue manager for no venues yet');
  assert.equal(appsLine({}), 'No app');
  assert.deepEqual(appsGained({ officer: true }, { officer: true, manager: 'security' }), { gained: ['Security manager'], lost: [] });
  assert.deepEqual(appsGained({ manager: 'security' }, { manager: 'venue' }), { gained: ['Venue manager'], lost: ['Security manager'] });
});

test('setAccess clears both venue tables before setting the new ones, and is audited and told', () => {
  const src = read('../modules/users.mjs');
  const body = src.slice(src.indexOf("'users.setAccess'"), src.indexOf("'users.setAccess'") + 4000);
  assert.match(body, /DELETE FROM venue_contacts[\s\S]*DELETE FROM security_venues[\s\S]*setVenues\(/);
  assert.match(body, /audit\(user, 'user\.access'/);
  assert.match(body, /notify\(\[u\.id\], \{ kind: 'hr'/);
  assert.match(body, /Reactivate them first/);
});

test('one switch-off: users.update, offboarding and rehire share the rules', () => {
  const hr = read('../modules/hr.mjs');
  assert.doesNotMatch(hr, /UPDATE users SET status/);
  assert.match(hr, /if \(switchOff\) await assertCanDisable\(user, acct\);\s*const removed = await tx/);
  assert.match(hr, /setLoginStatus\(user, acct\.id, 'disabled'/);
  assert.match(hr, /setLoginStatus\(user, acct\.id, 'active'/);
  assert.match(read('../modules/users.mjs'), /await assertCanDisable\(user, target\)/);
});

test('Add person checks the email before creating anything', () => {
  const src = read('../modules/people.mjs');
  const add = src.slice(src.indexOf("'people.add'"));
  assert.ok(add.indexOf('existingByEmail(email)') > 0 && add.indexOf('existingByEmail(email)') < add.indexOf('createInvite('));
  assert.match(read('../index.mjs'), /\[auth, users, people,/);
});
