import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { statusOnCreate, publicShape, groupPublic } from '../modules/reviews.mjs';
import { SITE_CLIENTS, isSiteClient } from '../lib/siteClients.mjs';

const site = new URL('../../../site/', import.meta.url);

test('a venue manager\'s review waits for the office; a company manager\'s goes live', () => {
  assert.equal(statusOnCreate('company'), 'published');
  assert.equal(statusOnCreate('venue'), 'pending');
  assert.equal(statusOnCreate('security'), 'pending');
});

test('the website only gets the words, the name and the stars', () => {
  const r = { id: 'x', client: 'bbar', quote: 'Great team', reviewer: 'Sam', reviewer_role: 'GM', rating: 5, received_on: '2026-10-01',
    status: 'published', venue_id: 'v', created_by: 'u', approved_by: 'u', sort: 0 };
  assert.deepEqual(publicShape(r), { quote: 'Great team', reviewer: 'Sam', reviewer_role: 'GM', rating: 5, received_on: '2026-10-01' });
  assert.equal(publicShape({ quote: 'q', reviewer: '', reviewer_role: '' }).rating, null);
});

test('published reviews group by client in the managers\' order, newest first after that', () => {
  const g = groupPublic([
    { client: 'bbar', quote: 'old', sort: 1, created_at: '2026-01-01' },
    { client: 'bbar', quote: 'first', sort: 0, created_at: '2026-01-01' },
    { client: 'bbar', quote: 'new', sort: 1, created_at: '2026-06-01' },
    { client: 'hoxton', quote: 'h', sort: 0, created_at: '2026-01-01' },
  ]);
  assert.deepEqual(g.bbar.map((r) => r.quote), ['first', 'new', 'old']);
  assert.deepEqual(Object.keys(g), ['bbar', 'hoxton']);
  assert.deepEqual(groupPublic([]), {});
});

test('the landing page has no hand-made tiles; every old card slug still has its photos', () => {
  const html = readFileSync(new URL('index.html', site), 'utf8');
  assert.doesNotMatch(html, /data-client=/, 'every tile comes from a venue');
  assert.match(html, /action: 'venues\.public'/);
  assert.equal(new Set(SITE_CLIENTS.map((c) => c.slug)).size, SITE_CLIENTS.length);
  for (const { slug: s } of SITE_CLIENTS) {
    for (const f of [`${s}-480.webp`, `${s}-960.webp`, `${s}-960.jpg`]) assert.ok(existsSync(new URL(`img/opulence/clients/${f}`, site)), f);
  }
  assert.ok(isSiteClient('w-hotel'));
  assert.ok(!isSiteClient('nope'));
});
