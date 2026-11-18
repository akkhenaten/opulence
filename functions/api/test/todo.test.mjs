import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KINDS, summarise, kindsFor } from '../lib/todo.mjs';

const src = readFileSync(new URL('../modules/todo.mjs', import.meta.url), 'utf8');

test('every to-do has wording, a tone and a link', () => {
  for (const k of KINDS) {
    assert.ok(k.one && k.many, k.key);
    assert.ok(['red', 'amber', 'blue'].includes(k.tone), k.key);
    assert.ok(typeof k.link === 'function' || typeof k.link === 'string', k.key);
  }
  assert.equal(new Set(KINDS.map((k) => k.key)).size, KINDS.length);
});

test('badges add up per menu item, and links point into the caller’s own portal', () => {
  const r = summarise('company', { cover: 2, coverChange: 1, unfilled: 3, incidentsToSign: 1, openIncidents: 4, toApprove: 5 }, { toApprove: { week: '2026-11-09' } });
  assert.equal(r.byNav.rota, 6);
  assert.equal(r.byNav.incidents, 1);
  assert.equal(r.byNav.money, 5);
  assert.equal(r.items.find((i) => i.key === 'cover').link, '/company/cover');
  assert.equal(r.items.find((i) => i.key === 'toApprove').link, '/company/timesheets?status=pending&week=2026-11-09');
  // Open incidents show in Needs you but are never badged nor in the bell (no counting twice)
  const open = r.items.find((i) => i.key === 'openIncidents');
  assert.equal(open.nav, null);
  assert.equal(open.bell, false);
  assert.equal(summarise('security', { cover: 1 }).items[0].link, '/security/cover');
});

test('venues and officers only see their own kinds', () => {
  // Meeting invites and proposed times are everyone's
  assert.deepEqual(kindsFor('venue').map((k) => k.key).sort(), ['invites', 'invoices', 'proposals', 'reports', 'timesheets']);
  assert.deepEqual(kindsFor('officer').map((k) => k.key).sort(), ['answer', 'invites', 'proposals', 'resign']);
  assert.ok(!kindsFor('security').some((k) => ['cantWork', 'timeOff', 'streams'].includes(k.key)));
});

test('counts use the same filters as the pages they open', () => {
  // Requests still to come; an unfilled shift with an Orb cover card is counted by the card
  assert.match(src, /cover:.*status = 'pending' AND starts_at > now\(\)/);
  assert.match(src, /NOT EXISTS \(SELECT 1 FROM ops_items i WHERE i.kind = 'cover' AND i.status = 'pending' AND i.shift_id = s.id\)/);
  // Shift requests only on published shifts
  assert.match(src, /a.status = 'requested' AND s.status = 'published'/);
  // Incidents waiting on you are not also counted as open
  assert.match(src, /sign_stage IS DISTINCT FROM \$2/);
  // Officers with an Orb compliance card are left out of the plain rows
  assert.match(src, /kind = 'compliance' AND status = 'pending'/);
});

test('meeting invites open each portal’s own calendar, and only count as failed when asked for', () => {
  assert.equal(summarise('company', { invites: 2 }, { invites: { role: 'company' } }).items[0].link, '/company/calendar?show=invites');
  assert.equal(summarise('venue', { invites: 1 }, { invites: { role: 'venue', event: 'e1' } }).items[0].link, '/venue/calendar?event=e1');
  assert.equal(summarise('officer', { proposals: 1 }, { proposals: { role: 'officer' } }).items[0].link, '/officer/shifts?show=proposals');
  assert.equal(summarise('officer', { answer: 0, resign: 0 }).failed, false);
  assert.equal(summarise('officer', { invites: null }).failed, true);
});
