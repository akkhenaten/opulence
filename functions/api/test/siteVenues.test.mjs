import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBlurb, DEFAULT_BLURB, publicTile, webUrl } from '../lib/siteVenues.mjs';

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
