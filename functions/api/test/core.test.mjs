import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundHours, bandFractions, bandedAmount } from '../lib/rates.mjs';
import { distanceM, insideFence } from '../lib/geo.mjs';
import { qrPayload, parseQr } from '../lib/qr.mjs';
import { signToken, verifyToken, hashPassword, verifyPassword } from '../lib/auth.mjs';
import { londonDate, addDays } from '../lib/time.mjs';

const NIGHT = { night_start: 22, night_end: 6 };

test('rounding to the nearest 15 minutes with breaks', () => {
  assert.equal(roundHours('2026-10-20T18:00:00Z', '2026-10-21T02:07:00Z', 0, 15), 8);
  assert.equal(roundHours('2026-10-20T18:00:00Z', '2026-10-21T02:08:00Z', 30, 15), 7.75);
  assert.equal(roundHours('2026-10-20T18:00:00Z', '2026-10-20T17:00:00Z'), 0);
});

test('night band split in London time (BST and GMT)', () => {
  // Tue 20 Oct 2026 is BST (UTC+1): 20:00–02:00 local → 2h normal, 4h night
  const f = bandFractions('2026-10-20T19:00:00Z', '2026-10-21T01:00:00Z', NIGHT);
  assert.ok(Math.abs(f.normal - 2 / 6) < 1e-9);
  assert.ok(Math.abs(f.night - 4 / 6) < 1e-9);
  // Tue 3 Nov 2026 is GMT: 20:00–02:00 UTC = local
  const g = bandFractions('2026-11-03T20:00:00Z', '2026-11-04T02:00:00Z', NIGHT);
  assert.ok(Math.abs(g.night - 4 / 6) < 1e-9);
});

test('weekend beats night, bank holiday beats everything', () => {
  const sat = bandFractions('2026-10-24T21:00:00Z', '2026-10-25T01:00:00Z', NIGHT); // Sat night (BST/GMT switch)
  assert.equal(sat.weekend, 1);
  const bh = bandFractions('2026-12-25T10:00:00Z', '2026-12-25T18:00:00Z', NIGHT, new Set(['2026-12-25']));
  assert.equal(bh.bh, 1);
});

test('banded amount applies uplifts by share of hours', () => {
  assert.equal(bandedAmount(8, { normal: 0.5, night: 0.5, weekend: 0, bh: 0 }, 15, { night: 10 }), 126);
  assert.equal(bandedAmount(4, { normal: 0, night: 0, weekend: 0, bh: 1 }, 20, { bh: 50 }), 120);
  assert.equal(bandedAmount(6, { normal: 1, night: 0, weekend: 0, bh: 0 }, 13.5), 81);
});

test('geofence allows GPS accuracy up to the cap', () => {
  const venue = { lat: 51.5074, lng: -0.1278, radius_m: 100 };
  const d = distanceM(51.5074, -0.1278, 51.5084, -0.1278);
  assert.ok(d > 105 && d < 120);
  assert.equal(insideFence({ lat: 51.5084, lng: -0.1278, accuracy: 5 }, venue, 50).ok, false);
  assert.equal(insideFence({ lat: 51.5084, lng: -0.1278, accuracy: 30 }, venue, 50).ok, true);
  assert.equal(insideFence({ lat: 51.5120, lng: -0.1278, accuracy: 500 }, venue, 50).ok, false);
  assert.equal(insideFence({ lat: null, lng: null }, venue).ok, false);
});

test('QR codes verify and reject tampering or old versions', () => {
  const v = { id: '6f1c3b8e-0000-4000-8000-000000000001', qr_version: 3 };
  const p = qrPayload(v);
  assert.deepEqual(parseQr(p), { venueId: v.id, version: 3 });
  assert.equal(parseQr(p.replace('.3.', '.2.')), null);
  assert.equal(parseQr(`${p.slice(0, -1)}x`), null);
  assert.equal(parseQr('hello'), null);
});

test('login tokens and passwords', () => {
  const t = signToken({ sub: 'u1', role: 'venue' });
  assert.equal(verifyToken(t).sub, 'u1');
  const [h, b] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'u1', role: 'company', exp: 9e9 })).toString('base64url');
  assert.equal(verifyToken(`${h}.${forged}.${t.split('.')[2]}`), null);
  assert.equal(verifyToken(signToken({ sub: 'x' }, -10)), null);
  const hash = hashPassword('correct horse');
  assert.equal(verifyPassword('correct horse', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);
  assert.ok(b);
});

test('London dates', () => {
  assert.equal(londonDate('2026-10-20T23:30:00Z'), '2026-10-21'); // BST
  assert.equal(londonDate('2026-11-20T23:30:00Z'), '2026-11-20'); // GMT
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
