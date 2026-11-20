import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanRepeat, repeatTimes, repeatText, calendarIcs, buildIcs, newFeedToken, goodFeedToken, MAX_REPEATS, KINDS } from '../lib/calendar.mjs';
import { actions } from '../modules/calendar.mjs';

const src = readFileSync(new URL('../modules/calendar.mjs', import.meta.url), 'utf8');
const mig = readFileSync(new URL('../db/migrations/070_calendar_more.sql', import.meta.url), 'utf8');
const rota = readFileSync(new URL('../modules/rota.mjs', import.meta.url), 'utf8');
const todo = readFileSync(new URL('../modules/todo.mjs', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');

test('repeats keep London time across the clock change', () => {
  // 10:00 London on 19 Oct (BST) stays 10:00 after the clocks go back
  const w = repeatTimes('2026-10-19T09:00:00Z', '2026-10-19T10:00:00Z', { freq: 'weekly', count: 3 });
  assert.deepEqual(w.map((x) => x.starts_at), ['2026-10-19T09:00:00.000Z', '2026-10-26T10:00:00.000Z', '2026-11-02T10:00:00.000Z']);
  assert.equal(repeatTimes('2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z', { freq: 'fortnightly', count: 2 })[1].starts_at, '2026-11-16T10:00:00.000Z');
  // Monthly on the 31st falls on each month's last day
  const m = repeatTimes('2027-01-31T10:00:00Z', '2027-01-31T11:00:00Z', { freq: 'monthly', count: 3 });
  assert.deepEqual(m.map((x) => x.starts_at.slice(0, 10)), ['2027-01-31', '2027-02-28', '2027-03-31']);
  // Until a date, that day included; all-day from midnight to midnight
  const d = repeatTimes('2026-11-20T00:00:00Z', '2026-11-21T00:00:00Z', { freq: 'daily', until: '2026-11-22' });
  assert.equal(d.length, 3);
  assert.equal(d[2].ends_at, '2026-11-23T00:00:00.000Z');
  assert.equal(repeatTimes('2026-11-20T10:00:00Z', '2026-11-20T11:00:00Z', { freq: 'daily', until: '2028-01-01' }).length, MAX_REPEATS);
});

test('repeat rules are checked', () => {
  const now = Date.parse('2026-11-20T09:00:00Z');
  assert.equal(cleanRepeat(null, '2026-11-20T10:00:00Z'), null);
  assert.equal(cleanRepeat({ freq: 'yearly', count: 3 }, '2026-11-20T10:00:00Z'), null);
  assert.deepEqual(cleanRepeat({ freq: 'weekly', count: '10' }, '2026-11-20T10:00:00Z', now), { freq: 'weekly', count: 10 });
  assert.throws(() => cleanRepeat({ freq: 'weekly', count: 1 }, '2026-11-20T10:00:00Z', now), /how many times/);
  assert.throws(() => cleanRepeat({ freq: 'daily', count: 500 }, '2026-11-20T10:00:00Z', now), /up to 100/);
  assert.throws(() => cleanRepeat({ freq: 'daily', until: '2026-11-20' }, '2026-11-20T10:00:00Z', now), /end after/);
  assert.throws(() => cleanRepeat({ freq: 'daily', until: '2028-06-01' }, '2026-11-20T10:00:00Z', now), /a year ahead/);
  assert.equal(repeatText({ freq: 'weekly', count: 10 }), 'Repeats weekly, 10 times');
  assert.equal(repeatText({ freq: 'fortnightly', until: '2027-03-20' }), 'Repeats every two weeks, until 20 Mar 2027');
});

test('the subscribe feed is a named calendar with private blocks and tentative replies', () => {
  const ev = { id: 'e1', title: 'Dentist', starts_at: '2026-11-21T10:00:00Z', ends_at: '2026-11-21T11:00:00Z', kind: 'block', private: true, where_kind: 'none', organiser_name: 'Sam' };
  const ics = calendarIcs([ev, { ...ev, id: 'e2', kind: 'meeting', private: false, tentative: true, title: 'Review' }], { company: 'Opulence', name: 'Opulence — Sam' });
  assert.match(ics, /X-WR-CALNAME:Opulence — Sam/);
  assert.match(ics, /REFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  assert.match(ics, /CLASS:PRIVATE/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.doesNotMatch(ics, /Organiser: Sam\\n\\nReply/);
  // One event alone is still the plain Add to calendar file
  const one = buildIcs({ ...ev, kind: 'meeting', private: false });
  assert.doesNotMatch(one, /X-WR-CALNAME/);
  assert.equal(one.match(/BEGIN:VEVENT/g).length, 1);
  const t = newFeedToken();
  assert.ok(goodFeedToken(t));
  assert.notEqual(t, newFeedToken());
  assert.equal(goodFeedToken('short'), false);
  assert.equal(goodFeedToken(`${t.slice(0, 42)}.`), false);
});

test('tasks, blocks, series and the feed on the server', () => {
  assert.deepEqual(KINDS, ['meeting', 'task', 'block']);
  assert.match(src, /Only company managers can book someone for a task/);
  assert.match(src, /Choose who to book for the task/);
  // A private block shows as Busy to anyone else, and only its owner changes it
  assert.match(src, /const hidden = e\.private && !me/);
  assert.match(src, /const mayEdit = \(e, user\) => e\.organiser_id === user\.id \|\| \(isCo\(user\) && e\.kind !== 'block'\)/);
  assert.match(src, /e\.kind === 'block'\) \{\s+await q\('DELETE FROM calendar_events/);
  // Series: this one or this and the following; replies for all upcoming; one invite per series
  assert.match(src, /starts_at >= \$2 AND cancelled_at IS NULL ORDER BY starts_at/);
  assert.match(src, /b\.scope === 'all' && e\.series_id/);
  assert.match(todo, /count\(DISTINCT coalesce\(e\.series_id, e\.id\)\)/);
  assert.match(rota, /Time blocked out at/);
  assert.match(src, /r\.kind === 'block' \? 'Busy' : 'Meeting'/);
  // Feed: token per person, reset turns the old one off, served inline
  for (const k of ['calendar.feed', 'calendar.feedReset']) assert.deepEqual(actions[k].roles, ['company', 'security', 'venue', 'officer']);
  assert.match(src, /DO UPDATE SET token = EXCLUDED\.token/);
  assert.match(src, /u\.status = 'active'/);
  assert.match(index, /queryStringParameters\?\.feed/);
  assert.match(index, /'content-disposition': 'inline; filename="calendar\.ics"'/);
  assert.match(mig, /series_id uuid/);
  assert.match(mig, /CREATE TABLE IF NOT EXISTS calendar_feeds/);
  assert.match(mig, /token text NOT NULL UNIQUE/);
});
