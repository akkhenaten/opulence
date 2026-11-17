import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRequest, timeRange, headcount } from '../lib/parseRequest.mjs';
import { feedbackProblem } from '../lib/feedbackRules.mjs';
import { streetByRule } from '../lib/venueLookup.mjs';
import { searchCards, isEmergency } from '../lib/cardSearch.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CODES = ['door', 'guard', 'steward'];
const TODAY = '2026-11-17'; // a Tuesday
const p = (t) => parseRequest(t, TODAY, CODES);

test('request: one date, times and count read by rules', () => {
  assert.deepEqual(p('2 door staff Saturday 9pm-3am').shifts, [{ date: '2026-11-21', start: '21:00', end: '03:00', role: 'door', headcount: 2 }]);
  assert.deepEqual(p('Need two doormen tonight 10pm till 2am').shifts[0], { date: TODAY, start: '22:00', end: '02:00', role: 'door', headcount: 2 });
  assert.equal(p('x2 security 21:00-03:00 on 21 Nov').shifts[0].role, 'guard');
  assert.equal(p('a guard tomorrow 10-2am').shifts[0].start, '22:00');
  assert.equal(p('Sat 21 Nov 9pm-3am 2 door').shifts[0].date, '2026-11-21');
});

test('request: "every" makes a weekly pattern', () => {
  const r = p('every Fri and Sat 10pm to 2am, 3 doormen').recurrence;
  assert.equal(r.frequency, 'weekly');
  assert.deepEqual(r.days.map((d) => d.dow), [5, 6]);
  assert.equal(r.days[0].headcount, 3);
  assert.equal(p('every other saturday 9pm-3am 2 door').recurrence.frequency, 'fortnightly');
});

test('request: anything unsure goes to the AI', () => {
  for (const t of ['2 door staff saturday', '2 door staff 9-3 saturday', 'Can we have 2 more on saturday 9pm-3am',
    'cancel saturday', 'next saturday 2 door 9pm-3am', '2 door friday and saturday 9pm-3am', 'every saturday 9pm-3am 2 door until christmas', '',
    'Fri 21 Nov 2 door 9pm-3am']) assert.equal(p(t), null, t);
});

test('request: time and count helpers', () => {
  assert.equal(timeRange('9-3'), null);
  assert.deepEqual(timeRange('9pm - 11pm'), { start: '21:00', end: '23:00', match: '9pm - 11pm' });
  assert.equal(headcount('three stewards'), 3);
  assert.equal(headcount('need some cover'), undefined);
});

test('request: the action tries the rules before the AI on a first message', () => {
  const src = read('../modules/ops.mjs');
  assert.match(src, /history\.length \? null : parseRequest\(b\.text, today, codes\)/);
});

test('feedback: stars and complaint words decide, AI only for long plain notes', () => {
  assert.equal(feedbackProblem(2, ''), true);
  assert.equal(feedbackProblem(4, 'Turned up late and was on his phone'), true);
  assert.equal(feedbackProblem(5, 'Great, no issues at all'), false);
  assert.equal(feedbackProblem(5, 'Smartly dressed, great on safety'), false);
  assert.equal(feedbackProblem(4, ''), false);
  assert.equal(feedbackProblem(4, 'Lovely '.repeat(40)), null);
  assert.match(read('../modules/ops.mjs'), /let problem = feedbackProblem\(rating, note\);[\s\S]{0,80}if \(problem === null\)/);
});

test('street: rule reads the street line, else the AI', () => {
  assert.equal(streetByRule('Find us at 26 George IV Bridge, Edinburgh'), '26 George IV Bridge');
  assert.equal(streetByRule('12-14 Market Street'), '12-14 Market Street');
  assert.equal(streetByRule('80 West Bow'), '');
});

test('toolbox: word search finds cards, emergency words flag 999', () => {
  const cards = [
    { title: 'Drunk customer refused entry', tags: ['intoxication', 'refusal'], summary: 'How to refuse a drunk customer calmly. Keep distance.', steps: ['Stay calm'] },
    { title: 'Lost child', tags: ['child', 'welfare'], summary: 'A child is separated from their adult.', steps: [] },
  ];
  const hits = searchCards('a drunk guy keeps trying to get in after being refused', cards);
  assert.equal(hits[0].card.title, 'Drunk customer refused entry');
  assert.equal(hits[0].why, 'How to refuse a drunk customer calmly.');
  assert.deepEqual(searchCards('the weather is nice', cards), []);
  assert.equal(isEmergency('he has collapsed and is not breathing'), true);
  assert.equal(isEmergency('lost his coat'), false);
  assert.match(read('../modules/toolbox.mjs'), /searchCards\(/);
});

test('compliance and evidence review: no AI in the routine runs', () => {
  const comp = read('../modules/compliance.mjs');
  const run = comp.slice(comp.indexOf('export async function runCompliance'), comp.indexOf('\nexport', comp.indexOf('export async function runCompliance') + 10));
  assert.ok(run.length > 100);
  assert.doesNotMatch(run, /advise\(/);
  assert.match(comp, /'compliance\.explain'/);
  assert.match(read('../modules/incidentAi.mjs'), /ai_summary_at IS NULL/);
});

test('dead AI actions are gone', () => {
  assert.doesNotMatch(read('../modules/ops.mjs'), /'ops\.chat'/);
  assert.doesNotMatch(read('../modules/incidentAi.mjs'), /'incidents\.aiDraft'/);
});
