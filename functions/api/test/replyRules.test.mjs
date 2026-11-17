import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etaMinutes, replyByRules } from '../lib/replyRules.mjs';

const r = (t, k) => replyByRules(t, k);

test('chase: on my way, with minutes when given', () => {
  assert.deepEqual(r('omw 10', 'chase'), { intent: 'on_my_way', eta_min: 10 });
  assert.deepEqual(r('on my way, 15 mins', 'chase'), { intent: 'on_my_way', eta_min: 15 });
  assert.deepEqual(r("I'll be there in half an hour", 'chase'), { intent: 'on_my_way', eta_min: 30 });
  assert.equal(r('no worries omw', 'chase').intent, 'on_my_way');
  assert.equal(r('stuck in traffic 20m', 'chase').eta_min, 20);
});

test("chase: can't make it keeps their words as the reason", () => {
  assert.deepEqual(r('cant tonight sorry', 'chase'), { intent: 'cant_make_it', reason: 'cant tonight sorry' });
});

test('pack and offer', () => {
  assert.equal(r('doing it now', 'pack').intent, 'signing_now');
  assert.equal(r('yeah go on', 'offer').intent, 'accept');
  assert.equal(r('👍', 'offer').intent, 'accept');
  assert.equal(r('I can', 'offer').intent, 'accept');
  assert.equal(r("I can't", 'offer').intent, 'decline');
  assert.equal(r('nah im busy', 'offer').intent, 'decline');
});

test('long, mixed or questions go to the AI', () => {
  assert.equal(r('what time does it start?', 'offer').intent, 'unclear');
  assert.equal(r('not now', 'pack').intent, 'unclear');
  assert.equal(r('yes but I cant until 9', 'offer').intent, 'unclear');
  assert.equal(r('x'.repeat(81), 'chase').intent, 'unclear');
  assert.equal(r('', 'chase').intent, 'unclear');
});

test('eta words', () => {
  assert.equal(etaMinutes('an hour'), 60);
  assert.equal(etaMinutes('1.5 hours'), 90);
  assert.equal(etaMinutes('soon'), undefined);
});

test('classifyReply tries the rules before the AI', () => {
  const src = readFileSync(new URL('../modules/messages.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function classifyReply'));
  assert.ok(fn.indexOf('replyByRules(') < fn.indexOf('extract('));
});
