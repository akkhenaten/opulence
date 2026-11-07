// The old hand-made client cards become venues, and the landing page builds every tile from venues (spec: every client card becomes a real venue)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SITE_CLIENTS } from '../lib/siteClients.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const sql = read('../db/migrations/047_site_clients_to_venues.sql');
const rows = [...sql.matchAll(/^\s+\('([a-z0-9-]+)', '((?:[^']|'')*)', (NULL|'[^']*'), '((?:[^']|'')*)', (NULL|'[^']*')\)/gm)]
  .map((m) => ({ slug: m[1], name: m[2], city: m[3], blurb: m[4], url: m[5] }));

test('one venue per old card, Shanghai left out (it already exists as a venue)', () => {
  const want = SITE_CLIENTS.filter((c) => c.slug !== 'shanghai');
  assert.equal(rows.length, 22);
  assert.deepEqual(rows.map((r) => r.slug), want.map((c) => c.slug));
  for (const [i, c] of want.entries()) {
    assert.equal(rows[i].name, c.name);
    assert.equal(rows[i].blurb, c.blurb);
    assert.equal(rows[i].url, c.url ? `'${c.url}'` : 'NULL');
  }
  assert.doesNotMatch(sql, /'shanghai'/);
});

test('the Scotland-wide cards have no city, so they sit under Across Scotland', () => {
  for (const r of rows) assert.equal(r.city, ['carbon-lounge', 'days-festival'].includes(r.slug) ? 'NULL' : `'${SITE_CLIENTS.find((c) => c.slug === r.slug).city}'`);
});

test('the seed never makes a second venue: a slug or a same-named venue already there is kept', () => {
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM venues y WHERE y\.site_client = s\.slug\)\s+AND NOT EXISTS \(SELECT 1 FROM venues y WHERE lower\(btrim\(y\.name\)\) = lower\(s\.name\)\)/);
  assert.match(sql, /DISTINCT ON \(s\.slug\)/);
  assert.match(sql, /COALESCE\(v\.city, m\.city\)/, 'a linked venue keeps its own text');
  assert.match(sql, /'\/img\/opulence\/clients\/' \|\| s\.slug \|\| '-960\.jpg'/);
});

test('venues.public: every shown venue is a tile, with the reviews filed under its old card', () => {
  const src = read('../modules/venues.mjs');
  const pubSrc = src.slice(src.indexOf("'venues.public'"), src.indexOf("'venues.rates'"));
  assert.doesNotMatch(pubSrc, /!v\.site_client/);
  assert.match(pubSrc, /pubBy\[v\.site_client\]/);
  assert.match(pubSrc, /c\.venue_id === v\.id/);
});
