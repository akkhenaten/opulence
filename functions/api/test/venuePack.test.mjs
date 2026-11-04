import test from 'node:test';
import assert from 'node:assert/strict';
import { packStatus, REFRESHER_DAYS, livePack, venuePack, packDue } from '../lib/venuePack.mjs';

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

test('Live shows signed, not signed or re-sign; a refresher counts as re-sign', () => {
  assert.deepEqual(['none', 'current', 'resign', 'refresher', 'unsigned', undefined].map(livePack), ['none', 'signed', 'resign', 'resign', 'unsigned', 'none']);
});

test('venue clients only see signed or not signed yet', () => {
  assert.deepEqual(['none', 'signed', 'resign', 'unsigned'].map(venuePack), ['none', 'signed', 'unsigned', 'unsigned']);
});

test('pack check: 20:00 shift chases at 19:45 and 20:00, tells managers at 20:15, cover at 20:30', () => {
  const offsets = { chase1: -15, chase2: 0, escalate: 15, cover: 30 };
  const startsAt = new Date('2026-11-04T20:00:00Z');
  const at = (hhmm, done = {}) => packDue({ startsAt, now: new Date(`2026-11-04T${hhmm}:00Z`), offsets, done });
  assert.deepEqual(at('19:40').due, []);
  assert.deepEqual(at('19:45'), { due: ['chase1'], chase: 'chase1', escalate: false, cover: false });
  assert.deepEqual(at('19:50', { chase1: true }).due, []);
  assert.deepEqual(at('20:00', { chase1: true }), { due: ['chase2'], chase: 'chase2', escalate: false, cover: false });
  assert.deepEqual(at('20:16', { chase1: true, chase2: true }), { due: ['escalate'], chase: null, escalate: true, cover: false });
  assert.deepEqual(at('20:31', { chase1: true, chase2: true, escalate: true }), { due: ['cover'], chase: null, escalate: false, cover: true });
});

test('pack check: a late run records both chases but sends only the second', () => {
  const offsets = { chase1: -15, chase2: 0, escalate: 15, cover: 30 };
  const r = packDue({ startsAt: new Date('2026-11-04T20:00:00Z'), now: new Date('2026-11-04T20:05:00Z'), offsets });
  assert.deepEqual(r, { due: ['chase1', 'chase2'], chase: 'chase2', escalate: false, cover: false });
  const late = packDue({ startsAt: new Date('2026-11-04T20:00:00Z'), now: new Date('2026-11-04T20:40:00Z'), offsets });
  assert.deepEqual(late, { due: ['chase1', 'chase2', 'escalate', 'cover'], chase: 'chase2', escalate: true, cover: true });
});

test('pack check follows the times set in Ops AI settings', () => {
  const r = packDue({ startsAt: new Date('2026-11-04T20:00:00Z'), now: new Date('2026-11-04T19:35:00Z'), offsets: { chase1: -30, chase2: -10, escalate: 5, cover: 20 } });
  assert.deepEqual(r.due, ['chase1']);
});
