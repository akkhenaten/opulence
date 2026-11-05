import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanApplication, applicationFlags, sameName, needsBadge } from '../lib/applicants.mjs';
import { actions } from '../modules/apply.mjs';

const good = {
  first_name: 'Sam', last_name: 'Okafor', email: 'Sam@Example.com', phone: '07700 900123', postcode: 'm4 1ab',
  roles: ['door', 'nonsense'], availability: ['nights', 'x'], rtw: true, consent: true, cv_key: 'docs/apply/a-cv.pdf', sia_front_key: 'docs/apply/b.jpg',
};

test('a complete application is cleaned', () => {
  const a = cleanApplication(good);
  assert.equal(a.error, undefined);
  assert.equal(a.email, 'sam@example.com');
  assert.equal(a.postcode, 'M4 1AB');
  assert.deepEqual(a.roles, ['door']);
  assert.deepEqual(a.availability, ['nights']);
});

test('missing or bad fields are explained', () => {
  assert.match(cleanApplication({ ...good, first_name: '' }).error, /name/);
  assert.match(cleanApplication({ ...good, email: 'nope' }).error, /email/);
  assert.match(cleanApplication({ ...good, postcode: '12345' }).error, /postcode/);
  assert.match(cleanApplication({ ...good, roles: ['ceo'] }).error, /role/);
  assert.match(cleanApplication({ ...good, sia_number: '1234' }).error, /16 digits/);
  assert.equal(cleanApplication({ ...good, sia_number: '1234 5678 9012 3456' }).sia_number, '1234567890123456');
  assert.match(cleanApplication({ ...good, cv_key: '' }).error, /CV/);
  assert.match(cleanApplication({ ...good, sia_front_key: '' }).error, /SIA badge/);
  assert.match(cleanApplication({ ...good, rtw: 'yes' }).error, /right to work/);
  assert.match(cleanApplication({ ...good, consent: false }).error, /privacy/);
});

test('stewards apply without an SIA badge', () => {
  assert.equal(needsBadge(['steward']), false);
  assert.equal(needsBadge(['steward', 'door']), true);
  assert.equal(cleanApplication({ ...good, roles: ['steward'], sia_front_key: '' }).error, undefined);
});

test('badge name match ignores case, accents and middle names', () => {
  const ap = { first_name: 'Sam', last_name: 'Okafor' };
  assert.ok(sameName(ap, 'SAM J OKAFOR'));
  assert.ok(sameName({ first_name: 'José', last_name: 'García' }, 'JOSE GARCIA'));
  assert.ok(!sameName(ap, 'SAMUEL OKAFOR'));
});

const ROLES = {
  door: { code: 'door', name: 'Door Supervisor', requires_sia: true, accepted_licences: ['Door Supervisor'] },
  guard: { code: 'guard', name: 'Security Guard', requires_sia: true, accepted_licences: ['Security Guarding', 'Door Supervisor'] },
  steward: { code: 'steward', name: 'Steward', requires_sia: false, accepted_licences: [] },
};
const applicant = { first_name: 'Sam', last_name: 'Okafor' };
const flagKeys = (app, roles, extra = {}) => applicationFlags({ applicant, application: app, roles, today: '2026-11-05', ...extra }).map((f) => f.key);
const read = (badge) => ({ ai_status: 'done', ai: { cv: { readable: true }, badge: { readable: true, name: 'SAM OKAFOR', licence_types: ['Door Supervisor'], expiry: '2028-01-01', ...badge } } });

test('a clean application has no flags', () => {
  assert.deepEqual(flagKeys(read({}), [ROLES.door, ROLES.guard]), []);
});

test('expired and expiring badges are flagged', () => {
  assert.deepEqual(flagKeys(read({ expiry: '2026-10-01' }), [ROLES.door]), ['expired']);
  assert.deepEqual(flagKeys(read({ expiry: '2026-12-20' }), [ROLES.door]), ['expiring']);
});

test('a name mismatch is flagged', () => {
  assert.deepEqual(flagKeys(read({ name: 'JOHN SMITH' }), [ROLES.door]), ['name']);
});

test('the badge must cover the roles applied for', () => {
  assert.deepEqual(flagKeys(read({ licence_types: ['Security Guarding'] }), [ROLES.door]), ['cover']);
  assert.deepEqual(flagKeys(read({ licence_types: ['Door Supervisor'] }), [ROLES.guard]), []);
});

test('steward-only applications need no badge', () => {
  assert.deepEqual(flagKeys({ ai_status: 'done', ai: { cv: { readable: true }, badge: { readable: false } } }, [ROLES.steward]), []);
  assert.deepEqual(flagKeys({ ai_status: 'done', ai: { cv: { readable: true }, badge: { readable: false } } }, [ROLES.door]), ['badge_unreadable']);
});

test('unreadable files, failed reads and duplicates are flagged', () => {
  assert.deepEqual(flagKeys({ ai_status: 'done', ai: { cv: { readable: false }, badge: read({}).ai.badge } }, [ROLES.door]), ['cv_unreadable']);
  assert.deepEqual(flagKeys({ ai_status: 'failed', ai_error: 'AI paused' }, [ROLES.door]), ['unread']);
  assert.deepEqual(flagKeys(read({}), [ROLES.door], { duplicates: [{ name: 'Sam Okafor', status: 'active' }] }), ['duplicate']);
});

test('apply actions: the form is public, the review is company-only', () => {
  for (const k of ['apply.uploadUrl', 'apply.submit', 'apply.read']) assert.equal(actions[k].public, true, k);
  for (const k of ['apply.get', 'apply.reread', 'apply.siaChecked', 'apply.invite', 'apply.reject']) assert.deepEqual(actions[k].roles, ['company'], k);
});
