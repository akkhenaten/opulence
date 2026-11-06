import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../index.mjs';
import { canSeeGuide, canSeeFlow, GUIDE_LEVELS } from '../lib/emergency.mjs';

const admin = { id: 'a1', role: 'company', email: 'info@orbsolutions.co.uk', status: 'active' };
const boss = { id: 'c1', role: 'company', email: 'boss@opulence.co.uk', status: 'active' };
const sec = { id: 's1', role: 'security', email: 's@opulence.co.uk', status: 'active' };
const officer = { id: 'o1', role: 'officer', email: 'o@opulence.co.uk', status: 'active' };
const venue = { id: 'v1', role: 'venue', email: 'v@club.co.uk', status: 'active' };

test('the Emergency guide is platform admin only until opened up', () => {
  assert.deepEqual(GUIDE_LEVELS, ['platform', 'managers', 'everyone']);
  for (const level of GUIDE_LEVELS) assert.ok(canSeeGuide(admin, level));
  for (const u of [boss, sec, officer, venue]) assert.equal(canSeeGuide(u, 'platform'), false);
  assert.ok(canSeeGuide(boss, 'managers') && canSeeGuide(sec, 'managers'));
  assert.equal(canSeeGuide(officer, 'managers'), false);
  assert.equal(canSeeGuide(venue, 'managers'), false);
  for (const u of [boss, sec, officer, venue]) assert.ok(canSeeGuide(u, 'everyone'));
  assert.equal(canSeeGuide(null, 'everyone'), false);
  assert.equal(canSeeGuide({ ...admin, status: 'disabled' }, 'platform'), false);
});

test('only the platform admin can change who sees the guide', async () => {
  const a = ACTIONS['toolbox.setEmergencyGuide'];
  assert.ok(a);
  await assert.rejects(() => a.fn({ level: 'everyone' }, { user: boss }), (e) => e.status === 403);
  await assert.rejects(() => a.fn({ level: 'everyone' }, { user: venue }), (e) => e.status === 403);
  await assert.rejects(() => a.fn({ level: 'nobody' }, { user: admin }), (e) => e.status === 400);
});

test('the flowchart is live for everyone unless the platform admin takes it offline', () => {
  for (const u of [admin, boss, sec, officer, venue]) assert.ok(canSeeFlow(u, true));
  assert.ok(canSeeFlow(admin, false));
  for (const u of [boss, sec, officer, venue]) assert.equal(canSeeFlow(u, false), false);
  assert.equal(canSeeFlow(null, true), false);
});

test('only the platform admin can record the flowchart permissions', async () => {
  const a = ACTIONS['toolbox.setFlowLicensed'];
  assert.ok(a);
  await assert.rejects(() => a.fn({ licensed: true }, { user: boss }), (e) => e.status === 403);
  await assert.rejects(() => a.fn({ licensed: true }, { user: sec }), (e) => e.status === 403);
  await assert.rejects(() => a.fn({ licensed: 'yes' }, { user: admin }), (e) => e.status === 400);
});

test('only the platform admin can take the flowchart offline', async () => {
  const a = ACTIONS['toolbox.setFlowLive'];
  assert.ok(a);
  await assert.rejects(() => a.fn({ live: false }, { user: boss }), (e) => e.status === 403);
  await assert.rejects(() => a.fn({ live: false }, { user: officer }), (e) => e.status === 403);
  await assert.rejects(() => a.fn({ live: 'no' }, { user: admin }), (e) => e.status === 400);
});
