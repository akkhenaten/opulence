import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTopics, cleanTopic, firstUrl, sniffMime, photoLayout, celebrationsDue, celebrationText, pollTally, cleanPollOptions,
  promoteWaitlist, isPrivateHost, cleanPlace, parseMeta, cleanEverydaySettings, MUTE_DAYS, BADGES,
} from '../lib/feed.mjs';

test('topics come from #words, lower case, once each', () => {
  assert.deepEqual(parseTopics('Great night at #Ministry #wins and more #WINS'), ['ministry', 'wins']);
  assert.deepEqual(parseTopics('email me at a#b or #1 or C# code'), []);
  assert.equal(parseTopics(Array.from({ length: 15 }, (_, i) => `#topic${i}`).join(' ')).length, 10);
  assert.equal(cleanTopic('#Venue-News!'), 'venuenews');
});

test('the first web address in the text, without trailing punctuation', () => {
  assert.equal(firstUrl('See https://example.com/a?b=1. Thanks'), 'https://example.com/a?b=1');
  assert.equal(firstUrl('no link here'), null);
});

test('image type is read from the bytes', () => {
  assert.equal(sniffMime(Buffer.from([0xff, 0xd8, 0xff])), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'image/png');
  assert.equal(sniffMime(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(sniffMime(Buffer.from('<html>')), null);
});

test('photo collage layouts', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(photoLayout), ['none', 'single', 'pair', 'one-two', 'grid', 'two-three', 'two-three']);
});

test('celebrations: birthdays only when opted in, 29 Feb on 28 Feb, anniversaries from one year', () => {
  const people = [
    { user_id: 'a', name: 'Ann Bee', dob: '1990-11-04', start_date: '2025-11-04', prefs: { birthday: true } },
    { user_id: 'b', name: 'Bo Cee', dob: '1991-11-04', start_date: '2026-11-04', prefs: {} },
    { user_id: 'c', name: 'Cy Dee', dob: '1992-02-29', start_date: null, prefs: { birthday: true } },
  ];
  const due = celebrationsDue(people, '2026-11-04');
  assert.deepEqual(due.map((d) => d.key), ['birthday:a:2026', 'anniversary:a:2026']);
  assert.equal(due[1].years, 1);
  assert.deepEqual(celebrationsDue(people, '2027-02-28').map((d) => d.key), ['birthday:c:2027']);
  assert.deepEqual(celebrationsDue(people, '2028-02-28').map((d) => d.key), []);
  assert.deepEqual(celebrationsDue(people, '2028-02-29').map((d) => d.key), ['birthday:c:2028']);
  assert.match(celebrationText({ type: 'anniversary', name: 'Ann Bee', years: 3 }), /3 years with the team today, Ann/);
});

test('poll results stay hidden until you vote, and anonymous polls never name voters', () => {
  const options = cleanPollOptions(['Yes', ' yes ', 'No', '', 'Maybe']);
  assert.deepEqual(options, [{ id: 'o1', text: 'Yes' }, { id: 'o2', text: 'No' }, { id: 'o3', text: 'Maybe' }]);
  const votes = [{ option_id: 'o1', user_id: 'a' }, { option_id: 'o2', user_id: 'b' }];
  const poll = { options, multi: false, anonymous: false, show_results: 'after_vote', closes_at: null, closed_at: null };
  const before = pollTally(poll, votes, 'z');
  assert.equal(before.results_visible, false);
  assert.equal(before.options[0].count, undefined);
  const after = pollTally(poll, votes, 'a');
  assert.deepEqual(after.mine, ['o1']);
  assert.equal(after.options[0].count, 1);
  assert.deepEqual(after.options[0].voter_ids, ['a']);
  const anon = pollTally({ ...poll, anonymous: true }, votes, 'a');
  assert.equal(anon.options[0].count, 1);
  assert.equal('voter_ids' in anon.options[0], false);
  assert.equal(pollTally({ ...poll, closed_at: new Date() }, votes, 'z').results_visible, true);
  assert.equal(pollTally({ ...poll, show_results: 'always' }, votes, 'z').results_visible, true);
});

test('waiting list moves up oldest first when places free', () => {
  const rsvps = [
    { user_id: 'a', answer: 'going' },
    { user_id: 'w2', answer: 'waitlist', updated_at: '2026-11-04T10:05:00Z' },
    { user_id: 'w1', answer: 'waitlist', updated_at: '2026-11-04T10:00:00Z' },
  ];
  assert.deepEqual(promoteWaitlist(rsvps, 2), ['w1']);
  assert.deepEqual(promoteWaitlist(rsvps, 1), []);
  assert.deepEqual(promoteWaitlist(rsvps, 5), ['w1', 'w2']);
});

test('link previews never reach private or internal addresses', () => {
  for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'nonsense']) {
    assert.equal(isPrivateHost(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) assert.equal(isPrivateHost(ip), false, ip);
});

test('place search drops homes and keeps named places', () => {
  assert.equal(cleanPlace({ type: 'house', address: { house_number: '12', road: 'High St' }, lat: '51.5', lon: '-0.1' }), null);
  assert.equal(cleanPlace({ type: 'residential', name: 'Some flats', address: {}, lat: '51.5', lon: '-0.1' }), null);
  assert.deepEqual(cleanPlace({ type: 'park', name: 'Hyde Park', address: { city: 'London', postcode: 'W2 2UH' }, lat: '51.507268', lon: '-0.165730' }),
    { name: 'Hyde Park', address: 'London, W2', lat: 51.50727, lng: -0.16573 });
});

test('page previews read og tags and fall back to the title', () => {
  const html = '<head><title>Plain &amp; simple</title><meta property="og:description" content="Desc"><meta content="/img.png" property="og:image"></head>';
  const m = parseMeta(html, 'https://www.example.com/a');
  assert.equal(m.title, 'Plain & simple');
  assert.equal(m.description, 'Desc');
  assert.equal(m.image, 'https://www.example.com/img.png');
  assert.equal(m.site, 'example.com');
});

test('Everyday settings keep known switches only', () => {
  const s = cleanEverydaySettings({ shoutouts: false, celebrations: { birthday: false, bogus: true }, featured_topics: ['#Wins', 'wins', 'Venue News'] },
    { shoutouts: true, celebrations: { birthday: true, welcome: true }, featured_topics: [] });
  assert.deepEqual(s, { shoutouts: false, celebrations: { birthday: false, welcome: true }, featured_topics: ['wins', 'venuenews'] });
  assert.throws(() => cleanEverydaySettings(null), /Invalid/);
});

test('mute lengths and badges match the app', () => {
  assert.deepEqual(MUTE_DAYS, [1, 7, 30, 90]);
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
});
