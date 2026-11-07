// Orb's venue setup cards: what a venue is missing, what Orb proposes, and what bulk approve applies
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIssues, cardTitle, clampRadius, defaultActions, missing, toRaise } from '../lib/venueSetup.mjs';

const full = { name: 'The Crown', address: '1 High St', postcode: 'SW1A 1AA', lat: 51.5, lng: -0.1, logo_url: '/logo.png', radius_m: 150, radius_confirmed_at: new Date() };
const keys = (v) => missing(v).map((m) => m.key);

test('a complete venue raises nothing', () => {
  assert.deepEqual(keys(full), []);
});

test('missing address, pin, logo and an unconfirmed radius are each raised', () => {
  assert.deepEqual(keys({ ...full, address: '', lat: null, lng: null }), ['address']);
  assert.deepEqual(keys({ ...full, lat: null, lng: null }), ['pin']);
  assert.deepEqual(keys({ ...full, logo_url: null }), ['logo']);
  assert.deepEqual(keys({ ...full, radius_confirmed_at: null }), ['radius']);
});

test('a dismissal holds until the details behind it change', () => {
  const v = { ...full, logo_url: null, website_url: 'https://a.co' };
  const d = [{ issue_key: 'logo', sig: missing(v)[0].sig }];
  assert.deepEqual(toRaise(v, d), []);
  assert.equal(toRaise({ ...v, website_url: 'https://b.co' }, d).length, 1);
});

test('issues carry what Orb found; booked shifts make the address urgent', () => {
  const v = { ...full, address: '', postcode: '', lat: null, lng: null, logo_url: null, radius_confirmed_at: null, website_url: '' };
  const found = { address: { best: { address: '1 High St', postcode: 'SW1A 1AA', lat: 51.5, lng: -0.1, source: 'website' }, website: 'https://crown.co.uk' }, logos: [{ url: 'https://crown.co.uk/logo.png' }] };
  const issues = buildIssues(v, missing(v), found, { soon: 2 });
  assert.equal(issues[0].key, 'address');
  assert.equal(issues[0].severity, 'soon');
  assert.deepEqual(issues.flatMap((i) => i.actions.map((a) => a.id)), ['address', 'website', 'logo', 'radius']);
  assert.match(cardTitle(v, issues), /^The Crown: no address or map pin \(\+2 more\)$/);
  // The website is company-only: a security manager's bulk approve leaves it out
  assert.deepEqual(defaultActions(issues, 'manager'), ['address', 'logo', 'radius']);
  assert.deepEqual(defaultActions(issues, 'company'), ['address', 'website', 'logo', 'radius']);
});

test('nothing found means nothing to apply, only a pointer to Site setup', () => {
  const v = { ...full, logo_url: null };
  const [logo] = buildIssues(v, missing(v), {});
  assert.deepEqual(logo.actions, []);
  assert.match(logo.detail, /Site setup/);
});

test('the radius stays within sensible bounds', () => {
  assert.equal(clampRadius(5), 25);
  assert.equal(clampRadius(5000), 1000);
  assert.equal(clampRadius('abc'), 150);
});

test('bulk decisions take one kind at a time and use the default choices', () => {
  const src = fs.readFileSync(new URL('../modules/ops.mjs', import.meta.url), 'utf8');
  assert.match(src, /'ops\.decideMany'/);
  assert.match(src, /Pick cards of one kind/);
  assert.match(src, /venue_setup: decideVenueSetup/);
});
