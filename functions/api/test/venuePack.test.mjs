import test from 'node:test';
import assert from 'node:assert/strict';
import { packStatus, REFRESHER_DAYS } from '../lib/venuePack.mjs';

const now = new Date('2026-11-04T09:00:00Z');
const daysAgo = (n) => new Date(now - n * 86400000);
const pack = [
  { procedure_id: 'ins', version: 2, resign_versions: [1] },     // v2 was a minor fix
  { procedure_id: 'fire', version: 3, resign_versions: [1, 3] }, // v3 was a real change
];
const signing = (items, at = daysAgo(10)) => ({ signed_at: at, items });

test('no published pack never blocks', () => {
  assert.deepEqual(packStatus({ pack: [], signing: null, now }), { status: 'none', toRead: [] });
});

test('never signed: every document to read', () => {
  assert.deepEqual(packStatus({ pack, signing: null, now }), { status: 'unsigned', toRead: ['ins', 'fire'] });
});

test('a minor fix keeps the signature current', () => {
  const r = packStatus({ pack, signing: signing([{ procedure_id: 'ins', version: 1 }, { procedure_id: 'fire', version: 3 }]), now });
  assert.equal(r.status, 'current');
});

test('a real change asks for that document only', () => {
  const r = packStatus({ pack, signing: signing([{ procedure_id: 'ins', version: 2 }, { procedure_id: 'fire', version: 2 }]), now });
  assert.deepEqual(r, { status: 'resign', toRead: ['fire'] });
});

test('a document added since signing needs reading', () => {
  const r = packStatus({ pack, signing: signing([{ procedure_id: 'ins', version: 2 }]), now });
  assert.deepEqual(r, { status: 'resign', toRead: ['fire'] });
});

test('an archived document dropped from the pack does not force a re-sign', () => {
  const items = [{ procedure_id: 'ins', version: 2 }, { procedure_id: 'fire', version: 3 }, { procedure_id: 'old', version: 1 }];
  assert.equal(packStatus({ pack, signing: signing(items), now }).status, 'current');
});

test('six months away from the venue: refresher, everything again', () => {
  const items = [{ procedure_id: 'ins', version: 2 }, { procedure_id: 'fire', version: 3 }];
  const old = signing(items, daysAgo(400));
  assert.deepEqual(packStatus({ pack, signing: old, lastShiftAt: daysAgo(REFRESHER_DAYS + 5), now }), { status: 'refresher', toRead: ['ins', 'fire'] });
  assert.equal(packStatus({ pack, signing: old, lastShiftAt: daysAgo(20), now }).status, 'current');
  assert.equal(packStatus({ pack, signing: old, lastShiftAt: null, now }).status, 'refresher');
});
