import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../index.mjs';
import { catalogFor, searchCatalog } from '../lib/orbCatalog.mjs';
import { publicUser, resolveActing } from '../lib/auth.mjs';
import {
  checkLogo, imageSize, jsonLd, ldAddress, logoCandidates, mapPlace, nameWords, normPostcode, onPage, pageText, pickPostcode, postcodesIn, rankAddresses, sameName,
} from '../lib/venueLookup.mjs';

const png = (w, h) => {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

test('UK postcodes are found and written the standard way', () => {
  assert.equal(normPostcode('eh11en'), 'EH1 1EN');
  assert.equal(normPostcode(' G2  8QW '), 'G2 8QW');
  assert.equal(normPostcode('not a postcode'), null);
  assert.deepEqual(postcodesIn('Visit us at 5 Hunter Square, Edinburgh EH1 1QW. Also EH1 1QW and G2 8QW'), ['EH1 1QW', 'G2 8QW']);
  assert.deepEqual(postcodesIn('Open 7 days, call 0131 225 1234'), []);
});

test('page text keeps line breaks as commas and drops scripts', () => {
  const t = pageText('<script>var x="EH9 9ZZ"</script><footer><p>Frankenstein</p><p>26 George IV Bridge<br>Edinburgh EH1 1EN</p></footer>');
  assert.equal(t, 'Frankenstein, 26 George IV Bridge, Edinburgh EH1 1EN,');
  assert.deepEqual(postcodesIn(t), ['EH1 1EN']);
});

test("a group page with several venues only gives the one with this venue's name next to it", () => {
  const text = 'Our bars: Biblos, 1a Chambers Street, Edinburgh EH1 1HR. Pilgrim, 1 Robertson Close, Edinburgh EH1 1LY.';
  assert.equal(pickPostcode(text, 'Pilgrim'), 'EH1 1LY');
  assert.equal(pickPostcode(text, 'Biblos Bar'), 'EH1 1HR');
  assert.equal(pickPostcode(text, 'Grand Cru'), null);
  assert.equal(pickPostcode('Find us: 5 West Register St, EH2 2AA', 'Anything'), 'EH2 2AA');
});

test('venue names match on their real words, not on "bar" or the city', () => {
  assert.deepEqual(nameWords('The Angels Share Hotel'), ['angels', 'share']);
  assert.ok(sameName('B Bar', 'Bbar Edinburgh') === false);
  assert.ok(sameName('Frankenstein', 'Frankenstein Edinburgh'));
  assert.ok(!sameName('Vega Bar', 'Glasgow Bar'));
});

test('structured data gives the address and the logo', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BarOrPub","name":"Vega",
    "logo":{"url":"/img/vega-logo.png"},"address":{"@type":"PostalAddress","streetAddress":"1 Royal Exchange Square","addressLocality":"Glasgow","postalCode":"g18aq"}}]}</script>
    <script type="application/ld+json">{ broken</script>`;
  const objs = jsonLd(html);
  assert.deepEqual(ldAddress(objs), { address: '1 Royal Exchange Square, Glasgow', postcode: 'G1 8AQ' });
  assert.equal(logoCandidates(html, 'https://vega.example/')[0].url, 'https://vega.example/img/vega-logo.png');
});

test('an address the AI makes up never passes the on-the-page check', () => {
  const text = 'Frankenstein, 26 George IV Bridge, Edinburgh EH1 1EN';
  assert.ok(onPage('26 George IV Bridge', text));
  assert.ok(!onPage('28 George Street', text));
  assert.ok(!onPage('', text));
});

test('an OpenStreetMap result becomes an address with its pin and website', () => {
  const p = mapPlace({ name: 'Frankenstein', lat: '55.9478123', lon: '-3.1919456', address: { house_number: '26', road: 'George IV Bridge', city: 'City of Edinburgh', postcode: 'EH1 1EN' }, extratags: { website: 'https://frankensteinedinburgh.co.uk' } });
  assert.deepEqual(p, { name: 'Frankenstein', address: '26 George IV Bridge, Edinburgh', postcode: 'EH1 1EN', lat: 55.947812, lng: -3.191946, website: 'https://frankensteinedinburgh.co.uk' });
  assert.equal(mapPlace({ name: 'x', lat: 'n/a', lon: '1' }), null);
  assert.equal(mapPlace({ name: 'x', lat: '1', lon: '1', extratags: { website: 'javascript:alert(1)' } }).website, null);
});

test('website and map agreeing make one strong candidate with the exact pin', () => {
  const site = { address: '26 George IV Bridge', postcode: 'EH1 1EN' };
  const map = { address: '26 George IV Bridge, Edinburgh', postcode: 'EH1 1EN', lat: 55.9478, lng: -3.1919 };
  const pins = { 'EH1 1EN': { lat: 55.94, lng: -3.19 } };
  assert.deepEqual(rankAddresses({ site, map, pins }), [{ address: '26 George IV Bridge', postcode: 'EH1 1EN', lat: 55.9478, lng: -3.1919, source: 'website', confidence: 'high' }]);
  // They disagree: the website first, the map as a second choice
  const two = rankAddresses({ site, map: { ...map, postcode: 'EH1 1QW' }, pins });
  assert.deepEqual(two.map((c) => [c.source, c.confidence, c.lat]), [['website', 'medium', 55.94], ['map', 'low', 55.9478]]);
  // Only a postcode on the website: offered, but marked low
  assert.equal(rankAddresses({ site: { address: '', postcode: 'EH1 1EN' }, pins })[0].confidence, 'low');
  assert.deepEqual(rankAddresses({}), []);
});

test('logo candidates: named logos first, then big app icons, then the share picture; no SVG, ICO or tiny favicon', () => {
  const html = `<link rel="icon" href="/favicon.ico"><link rel="icon" sizes="32x32" href="/f32.png"><link rel="apple-touch-icon" href="/apple.png">
    <meta property="og:image" content="https://cdn.example/share.jpg"><img class="site-logo" src="/logo.png"><img src="/hero.jpg"><img alt="logo" src="/logo.svg">`;
  assert.deepEqual(logoCandidates(html, 'https://bar.example/').map((c) => [c.url, c.kind]), [
    ['https://bar.example/logo.png', 'logo'], ['https://bar.example/apple.png', 'icon'], ['https://cdn.example/share.jpg', 'picture'],
  ]);
});

test('a logo must be a real, complete picture of a sensible size', () => {
  assert.deepEqual(imageSize(png(300, 120)), { width: 300, height: 120 });
  assert.deepEqual(checkLogo({ bytes: png(300, 120), truncated: false }), { mime: 'image/png', width: 300, height: 120 });
  assert.equal(checkLogo({ bytes: png(16, 16), truncated: false }), null);
  assert.equal(checkLogo({ bytes: png(300, 120), truncated: true }), null);
  assert.equal(checkLogo({ bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), truncated: false }), null);
  assert.equal(checkLogo(null), null);
});

test('Orb can find addresses and logos; using a logo waits for Confirm; each follows the venue roles', () => {
  for (const u of [{ role: 'company' }, { role: 'security', can_see_pay: false }]) {
    const names = catalogFor(u, ACTIONS).map(([n]) => n);
    for (const n of ['venues.findAddress', 'venues.findAddresses', 'venues.findLogo', 'venues.useLogo', 'venues.save']) assert.ok(names.includes(n), `${u.role} → ${n}`);
  }
  assert.ok(!catalogFor({ role: 'venue' }, ACTIONS).some(([n]) => n.startsWith('venues.find')));
  assert.ok(!catalogFor({ role: 'officer' }, ACTIONS).some(([n]) => n.startsWith('venues.find')));
  const hits = searchCatalog(catalogFor({ role: 'company' }, ACTIONS), 'find address postcode for venues').map((h) => h.action);
  assert.ok(hits.slice(0, 3).includes('venues.findAddresses'));
  assert.equal(searchCatalog(catalogFor({ role: 'company' }, ACTIONS), 'venue logo').find((h) => h.action === 'venues.useLogo').tier, 'confirm');
  for (const n of ['venues.findAddress', 'venues.findAddresses', 'venues.findLogo', 'venues.useLogo', 'venues.saveLogo']) assert.deepEqual(ACTIONS[n].roles, ['company', 'security']);
});

test('the platform admin is always a full Company manager, whatever role the login was made with', () => {
  const admin = { id: 'p1', email: 'Info@OrbSolutions.co.uk', role: 'security', status: 'active', can_see_pay: false, officer_id: null };
  const u = resolveActing(admin, undefined);
  assert.equal(u.role, 'company');
  assert.equal(u.can_see_pay, true);
  assert.equal(publicUser(u).role, 'company');
  assert.equal(publicUser(u).platform, true);
  // Company-only actions (clients, venue rates) are open to them in Orb too
  const names = catalogFor(u, ACTIONS).map(([n]) => n);
  assert.ok(names.includes('clients.save') && names.includes('venues.saveRate'));
  // With a staff record they keep "My shifts", and the manager side is Company
  const dual = { ...admin, role: 'officer', officer_id: 'o1' };
  assert.equal(resolveActing(dual, 'officer').role, 'officer');
  assert.equal(resolveActing(dual, 'officer').dual, true);
  assert.equal(resolveActing(dual, undefined).role, 'company');
  // Anyone else keeps their own role; a switched-off platform account gets nothing extra
  assert.equal(resolveActing({ ...admin, email: 'dan@example.com' }, undefined).role, 'security');
  assert.equal(resolveActing({ ...admin, status: 'disabled' }, undefined).role, 'security');
});
