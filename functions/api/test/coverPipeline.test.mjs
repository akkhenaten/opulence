import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOTIFY } from '../modules/cover.mjs';
import { ACTIONS } from '../index.mjs';
import { requestState, ACCEPT_CHOICES, lastAcceptChoice } from '../../../app/src/pages/manager/_coverState.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const cover = src('../modules/cover.mjs');

test('each requested date has exactly one state, and a waiting change wins', () => {
  assert.equal(requestState({ status: 'pending', change_status: 'none' }), 'waiting');
  assert.equal(requestState({ status: 'accepted', change_status: 'pending', filled: 2, headcount: 2 }), 'waiting');
  assert.equal(requestState({ status: 'accepted', change_status: 'none', filled: 1, headcount: 2 }), 'staffing');
  assert.equal(requestState({ status: 'accepted', change_status: 'none', filled: '2', headcount: 2 }), 'staffed');
  assert.equal(requestState({ status: 'declined' }), 'declined');
  assert.equal(requestState({ status: 'cancelled' }), 'cancelled');
});

test('accepting offers broadcast, Orb or assign myself, Broadcast the first time', () => {
  assert.deepEqual(NOTIFY, ['broadcast', 'orb', 'none']);
  assert.deepEqual(ACCEPT_CHOICES.map((c) => c.key), NOTIFY);
  assert.equal(lastAcceptChoice(), 'broadcast');
});

test('accept refuses a date that has started, and each choice reaches officers or Orb', () => {
  assert.match(cover, /already started, so it can’t be accepted/);
  assert.match(cover, /how === 'broadcast'\) await announceOpen\(/);
  assert.match(cover, /proposeCover\(\{ id: sh\.id \}, 'new'\)/);
  assert.match(cover, /await staffAccepted\(/);
});

test('several dates are accepted in one call with one choice for all', () => {
  assert.ok(ACTIONS['cover.acceptMany']);
  assert.match(cover, /'cover\.acceptMany'[\s\S]*?notify: 'none'[\s\S]*?staffAccepted\(/);
});

test('dates added to a running pattern keep its billing stream', () => {
  const rows = cover.match(/INSERT INTO cover_requests \([^)]*\)/g);
  assert.ok(rows.length >= 2);
  for (const r of rows) assert.match(r, /stream_id/);
});

test('managers hear about requests on their own portal, never their own change', () => {
  assert.match(cover, /notifyManagersAt\(/);
  assert.match(cover, /except: user\.id/);
  assert.doesNotMatch(cover, /Waiting for the company/);
});
