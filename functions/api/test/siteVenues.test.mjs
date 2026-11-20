import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cityOf, cleanBlurb, DEFAULT_BLURB, isNewVenue, NEW_DAYS, publicTile, webUrl } from '../lib/siteVenues.mjs';

test('only plain web links reach the landing page', () => {
  assert.equal(webUrl('example.com'), 'https://example.com/');
  assert.equal(webUrl(' http://bar.co.uk/menu '), 'http://bar.co.uk/menu');
  assert.equal(webUrl('javascript:alert(1)'), null);
  assert.equal(webUrl('ftp://files.example.com'), null);
  assert.equal(webUrl('localhost'), null);
  assert.equal(webUrl(`https://a.com/${'x'.repeat(300)}`), null);
  assert.equal(webUrl(''), null);
});

test('a venue tile shows only public fields, with a default line', () => {
  const v = { id: 'v1', name: 'The Dome', address: '14 George St', notes: 'Back door code 1234', city: ' Edinburgh ', website_blurb: null, website_photo_url: null, website_url: null };
  const t = publicTile(v);
  assert.deepEqual(Object.keys(t).sort(), ['blurb', 'city', 'name', 'photo', 'reviews', 'url']);
  assert.equal(t.blurb, DEFAULT_BLURB('The Dome'));
  assert.equal(t.city, 'Edinburgh');
  assert.equal(publicTile({ ...v, website_blurb: 'Welcome' }).blurb, 'Welcome');
});

test('the welcome line is one short paragraph', () => {
  assert.equal(cleanBlurb('  "Proud to   look after\n the Dome."  '), 'Proud to look after the Dome.');
  assert.equal(cleanBlurb('x'.repeat(400)).length, 220);
  assert.equal(cleanBlurb('   '), null);
});

test('the tile town comes from the venue details when no city is set', () => {
  assert.equal(cityOf({ city: ' Leith ', postcode: 'EH6 6JJ' }), 'Leith');
  assert.equal(cityOf({ postcode: 'eh1 1rf' }), 'Edinburgh');
  assert.equal(cityOf({ postcode: 'G1 3AH' }), 'Glasgow');
  assert.equal(cityOf({ postcode: 'GL1 2AB' }), null);
  assert.equal(cityOf({ address: '29 Niddry Street, Edinburgh' }), 'Edinburgh');
  assert.equal(cityOf({ address: '1 High Street' }), null);
  assert.equal(publicTile({ name: 'Banshee', postcode: 'EH1 1SR', address: '29 Niddry St' }).city, 'Edinburgh');
});

test('a venue is welcomed as new for a week after it first appears on the website', () => {
  const now = new Date('2026-11-20T18:00:00Z');
  const ago = (days) => new Date(now - days * 864e5).toISOString();
  assert.equal(NEW_DAYS, 7);
  assert.equal(isNewVenue(null, now), false);
  assert.equal(isNewVenue(ago(0), now), true);
  assert.equal(isNewVenue(ago(6.9), now), true);
  assert.equal(isNewVenue(ago(7.1), now), false);
  const v = { name: 'Fingal', website_since: ago(1) };
  assert.equal(publicTile(v, [], now).isNew, true);
  assert.equal('isNew' in publicTile({ ...v, website_since: ago(8) }, [], now), false);
  assert.equal('website_since' in publicTile(v, [], now), false);
  // Set once by the database, the first time a venue is active and shown; existing ones count from when they were added
  const sql = readFileSync(new URL('../db/migrations/069_venue_website_since.sql', import.meta.url), 'utf8');
  assert.match(sql, /SET website_since = created_at WHERE website_since IS NULL AND active AND on_website/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON venues/);
  assert.match(readFileSync(new URL('../modules/venues.mjs', import.meta.url), 'utf8'), /website_photo_url, website_since FROM venues/);
});
