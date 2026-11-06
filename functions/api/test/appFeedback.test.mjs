import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../index.mjs';
import { CATALOG } from '../lib/orbCatalog.mjs';
import { guardPlatformAccount, inviteRole, isPlatformAdmin, isPlatformEmail, needsPlatformRole } from '../lib/platform.mjs';
import { publicUser } from '../lib/auth.mjs';
import { checkFeedback, taskText, toCsv } from '../modules/appFeedback.mjs';
import { resetGuardNeeded, sendInviteMail } from '../modules/users.mjs';

const admin = { id: 'a1', role: 'company', email: 'info@orbsolutions.co.uk', name: 'Owner', status: 'active' };
const manager = { id: 'c1', role: 'company', email: 'boss@opulence.co.uk', name: 'Boss', status: 'active' };

test('the platform admin is set by email, not by role', () => {
  assert.ok(isPlatformAdmin(admin));
  assert.ok(isPlatformEmail('  INFO@orbsolutions.co.uk '));
  assert.ok(!isPlatformAdmin(manager));
  assert.ok(!isPlatformAdmin({ ...admin, status: 'disabled' }));
  assert.equal(publicUser(admin).platform, true);
  assert.equal(publicUser(manager).platform, false);
});

test('everyone can send and see their own feedback; the inbox is for the platform admin only', async () => {
  for (const role of ['company', 'security', 'venue', 'officer']) {
    assert.ok(ACTIONS['appFeedback.send'].roles.includes(role), role);
    assert.ok(ACTIONS['appFeedback.mine'].roles.includes(role), role);
  }
  for (const name of ['appFeedback.list', 'appFeedback.get', 'appFeedback.update', 'appFeedback.reply', 'appFeedback.export', 'appFeedback.settings', 'appFeedback.setSettings']) {
    // The check runs before anything is read, so no database is needed to prove the refusal
    await assert.rejects(() => ACTIONS[name].fn({ id: 'x', reply: 'hi' }, { user: manager }), (e) => e.status === 403, name);
    await assert.rejects(() => ACTIONS[name].fn({ id: 'x' }, { user: { ...manager, role: 'officer' } }), (e) => e.status === 403, name);
  }
});

test('Orb cannot reach the feedback', () => {
  assert.ok(!Object.keys(CATALOG).some((n) => n.startsWith('appFeedback.')));
});

test('a company manager cannot put a platform email on an account or take one over', () => {
  assert.throws(() => guardPlatformAccount(manager, 'someone@x.com', 'info@orbsolutions.co.uk'), (e) => e.status === 403);
  assert.throws(() => guardPlatformAccount(manager, 'info@orbsolutions.co.uk'), (e) => e.status === 403);
  assert.doesNotThrow(() => guardPlatformAccount(manager, 'a@x.com', 'b@x.com'));
  assert.doesNotThrow(() => guardPlatformAccount(admin, 'info@orbsolutions.co.uk'));
});

test('the platform admin is always a Company manager, whatever role the login was made with', () => {
  assert.ok(needsPlatformRole({ ...admin, role: 'security' }));
  assert.ok(needsPlatformRole({ ...admin, role: 'venue' }));
  assert.ok(!needsPlatformRole(admin));
  assert.ok(!needsPlatformRole({ ...admin, role: 'security', status: 'disabled' }));
  assert.ok(!needsPlatformRole({ ...manager, role: 'security' }));
  assert.ok(!needsPlatformRole(null));
  assert.equal(inviteRole('INFO@orbsolutions.co.uk ', 'security'), 'company');
  assert.equal(inviteRole('a@x.com', 'venue'), 'venue');
});

test('a pending platform admin invite can be shared; an active account is still protected', () => {
  assert.equal(resetGuardNeeded('invited'), false);
  assert.equal(resetGuardNeeded('active'), true);
  assert.equal(resetGuardNeeded(undefined), true);
  assert.equal(typeof sendInviteMail, 'function');
});

test('feedback is checked and trimmed', () => {
  assert.deepEqual(checkFeedback({ kind: 'idea', body: '  Bigger buttons  ', page: '/officer/clock', device: 'iPhone\n Safari', app_version: 'v106' }),
    { kind: 'idea', body: 'Bigger buttons', page: '/officer/clock', device: 'iPhone Safari', app_version: 'v106' });
  assert.throws(() => checkFeedback({ kind: 'rant', body: 'x' }), /Choose/);
  assert.throws(() => checkFeedback({ kind: 'problem', body: '   ' }), /Tell us/);
  assert.throws(() => checkFeedback({ kind: 'problem', body: 'x'.repeat(2001) }), /2,000/);
});

test('copy as task and the CSV carry the details', () => {
  const f = { kind: 'problem', sender_name: 'Sam', role: 'officer', body: 'Clock in button froze', page: '/officer/clock', device: 'Android Chrome', app_version: 'v106',
    created_at: '2026-11-06T20:15:00Z', photos: [{ url: 'https://x/p1' }], status: 'new', reply: '', note: '' };
  const t = taskText(f);
  assert.match(t, /^Problem from Sam \(Officer\)/);
  assert.match(t, /Screen: \/officer\/clock/);
  assert.match(t, /Photo 1: https:\/\/x\/p1/);
  const csv = toCsv([{ ...f, body: 'Said "hi", then froze' }]);
  assert.match(csv, /"Said ""hi"", then froze"/);
  assert.equal(csv.split('\r\n').length, 2);
});
