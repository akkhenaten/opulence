import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessChanges, blocksLastCompanyManager, unavailableClashNotice } from '../lib/access.mjs';

test('access changes keep only fields that changed, with their old value', () => {
  const r = accessChanges({ name: 'Sam Reed', phone: '0700', can_see_pay: false }, { name: 'Sam Reed', phone: '0711', can_see_pay: false });
  assert.deepEqual(r, { before: { phone: '0700' } });
});

test('access changes name the venues gained and lost', () => {
  const r = accessChanges({}, {}, ['Club One', 'The Vaults'], ['The Vaults', 'Bar 9']);
  assert.deepEqual(r.venues_added, ['Bar 9']);
  assert.deepEqual(r.venues_removed, ['Club One']);
  assert.equal(r.before, undefined);
});

test('no change means an empty record', () => {
  assert.deepEqual(accessChanges({ can_see_pay: null }, { can_see_pay: false }, ['A'], ['A']), {});
});

test('the last active company manager cannot be disabled', () => {
  const target = { role: 'company', status: 'active' };
  assert.equal(blocksLastCompanyManager({ target, status: 'disabled', otherActive: 0 }), true);
  assert.equal(blocksLastCompanyManager({ target, status: 'disabled', otherActive: 1 }), false);
  assert.equal(blocksLastCompanyManager({ target, status: 'active', otherActive: 0 }), false);
});

test('the guard ignores other roles, already disabled logins and the platform admin', () => {
  assert.equal(blocksLastCompanyManager({ target: { role: 'security', status: 'active' }, status: 'disabled', otherActive: 0 }), false);
  assert.equal(blocksLastCompanyManager({ target: { role: 'company', status: 'invited' }, status: 'disabled', otherActive: 0 }), false);
  assert.equal(blocksLastCompanyManager({ target: { role: 'company', status: 'active', platform: true }, status: 'disabled', otherActive: 0 }), false);
});

test('unavailable over a booked shift: one shift, then several', () => {
  const one = unavailableClashNotice('Ade Bello', '2026-11-20', '2026-11-20', [{ starts_at: '2026-11-20T22:00:00Z', venue_name: 'Club One' }]);
  assert.equal(one.title, 'Unavailable on a booked shift');
  assert.match(one.body, /^Ade Bello marked unavailable 20 Nov 2026: booked Fri 20 Nov at Club One\. Nothing was cancelled\.$/);
  const two = unavailableClashNotice('Ade Bello', '2026-11-20', '2026-11-22', [{ starts_at: '2026-11-20T22:00:00Z', venue_name: 'Club One' }, { starts_at: '2026-11-21T22:00:00Z', venue_name: 'Bar 9' }]);
  assert.match(two.body, /20 Nov 2026 – 22 Nov 2026: booked Fri 20 Nov at Club One and 1 more/);
  assert.equal(unavailableClashNotice('X', '2026-11-20', '2026-11-20', []), null);
});
