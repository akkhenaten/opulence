import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../index.mjs';
import { COVERS, fields } from '../modules/bans.mjs';

const TODAY = '2026-11-05';
const NOW = new Date('2026-11-05T23:00:00Z');
const base = { name: 'Red jacket', reason: 'Fighting at the bar' };
const throws = (fn, re) => assert.throws(fn, (e) => re.test(e.message));

test('an ejection needs no dates and is always venue-scoped', () => {
  const f = fields({ ...base, ban: false, outcome: 'refused_entry', scope: 'all' }, TODAY, NOW);
  assert.equal(f.kind, 'ejection');
  assert.equal(f.outcome, 'refused_entry');
  assert.equal(f.starts_on, null);
  assert.equal(f.ends_on, null);
  assert.equal(f.scope, 'venue');
  assert.deepEqual(f.occurred_at, NOW);
});

test('an ejection defaults to ejected and refuses a time in the future', () => {
  assert.equal(fields({ ...base, ban: false }, TODAY, NOW).outcome, 'ejected');
  throws(() => fields({ ...base, ban: false, occurred_at: '2026-11-06T02:00:00Z' }, TODAY, NOW), /future/);
});

test('a ban needs a length or permanent, and a known scope', () => {
  throws(() => fields({ ...base, ban: true }, TODAY, NOW), /end date or make it permanent/);
  throws(() => fields({ ...base, ban: true, ends_on: '2026-11-01' }, TODAY, NOW), /before the start/);
  throws(() => fields({ ...base, ban: true, permanent: true, scope: 'planet' }, TODAY, NOW), /scope/);
  const f = fields({ ...base, ban: true, ends_on: '2027-11-05', scope: 'client', outcome: 'ejected' }, TODAY, NOW);
  assert.equal(f.kind, 'ban');
  assert.equal(f.starts_on, TODAY);
  assert.equal(f.scope, 'client');
  assert.equal(f.outcome, 'ejected');
});

test('older callers that send neither ban nor kind mean a ban', () => {
  const f = fields({ ...base, permanent: true }, TODAY, NOW);
  assert.equal(f.kind, 'ban');
  assert.equal(f.outcome, null);
  assert.equal(f.occurred_at, null);
});

test('unknown categories and outcomes fail, a name or description is needed', () => {
  throws(() => fields({ ...base, ban: false, category: 'rudeness' }, TODAY, NOW), /category/);
  throws(() => fields({ ...base, ban: false, outcome: 'arrested' }, TODAY, NOW), /ejected or refused/);
  throws(() => fields({ reason: 'x', ban: false }, TODAY, NOW), /name or a description/);
  assert.equal(fields({ ...base, ban: false, category: 'drugs' }, TODAY, NOW).category, 'drugs');
});

test('COVERS widens only bans, by client or to every venue', () => {
  const sql = COVERS('$1');
  assert.match(sql, /b\.venue_id = ANY\(\$1\)/);
  assert.match(sql, /b\.kind = 'ban'/);
  assert.match(sql, /b\.scope = 'all'/);
  assert.match(sql, /b\.scope = 'client' AND v\.client_id/);
});
