import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../index.mjs';
import { shortNotice } from '../modules/rota.mjs';

test('pulling out within 24 hours of the start is short notice', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  assert.equal(shortNotice(new Date(now + 23 * 3600000), now), true);
  assert.equal(shortNotice(new Date(now + 25 * 3600000), now), false);
});
