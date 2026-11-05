import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMentions, canPin, canRequireConfirm, seenSummary, confirmSummary, reactionSummary, mentionable } from '../lib/chat.mjs';

const sam = { id: 's', name: 'Sam Lee', role: 'officer', last_read_at: '2026-11-04T21:05:00Z' };
const jo = { id: 'j', name: 'Jo Khan', role: 'officer', last_read_at: '2026-11-04T20:00:00Z' };
const boss = { id: 'b', name: 'Pat Boss', role: 'company', last_read_at: '2026-11-04T21:10:00Z' };
const bot = { id: 'o', name: 'Orb', role: 'company', system: true, last_read_at: '2026-11-04T22:00:00Z' };
const people = [sam, jo, boss, bot];
const msg = { id: 'm1', sender_id: 'b', created_at: '2026-11-04T21:00:00Z' };

test('mentions keep members still named in the text, never the sender or the bot', () => {
  assert.deepEqual(cleanMentions('Thanks @Sam Lee and @jo khan', ['s', 'j', 'x'], people, 'b'), ['s', 'j']);
  assert.deepEqual(cleanMentions('Thanks all', ['s'], people, 'b'), []);                 // name deleted from the text
  assert.deepEqual(cleanMentions('@Pat Boss @Orb', ['b', 'o'], people, 'b'), []);
  assert.deepEqual(cleanMentions('@Sam Lee', 'nope', people, 'b'), []);
});

test('mentions only in group-like chats', () => {
  assert.ok(mentionable('group') && mentionable('shift') && mentionable('cover'));
  assert.ok(!mentionable('direct') && !mentionable('ops'));
});

test('managers pin anywhere they are a member; group starters pin in their group', () => {
  assert.ok(canPin(boss, { kind: 'direct' }, true));
  assert.ok(!canPin(boss, { kind: 'direct' }, false));
  assert.ok(!canPin(boss, { kind: 'ops' }, true));
  assert.ok(canPin(sam, { kind: 'group', created_by: 's' }, true));
  assert.ok(!canPin(sam, { kind: 'group', created_by: 'j' }, true));
  assert.ok(!canPin(sam, { kind: 'shift', created_by: 's' }, true));
});

test('only managers can ask for confirmation', () => {
  assert.ok(canRequireConfirm(boss, { kind: 'group' }));
  assert.ok(!canRequireConfirm(sam, { kind: 'group' }));
  assert.ok(!canRequireConfirm(boss, { kind: 'ops' }));
});

test('seen counts people other than the sender and the bot who read past the message', () => {
  const r = seenSummary(people, msg);
  assert.equal(r.total, 2);
  assert.deepEqual(r.seen.map((p) => p.id), ['s']);
});

test('confirm progress: the list is for the sender and managers only', () => {
  const confirms = [{ user_id: 's', confirmed_at: '2026-11-04T21:06:00Z' }];
  const forBoss = confirmSummary(people, msg, confirms, boss);
  assert.equal(forBoss.done, 1);
  assert.equal(forBoss.total, 2);
  assert.deepEqual(forBoss.outstanding.map((p) => p.id), ['j']);
  assert.equal(forBoss.needed, false);
  const forJo = confirmSummary(people, msg, confirms, jo);
  assert.equal(forJo.outstanding, null);
  assert.equal(forJo.needed, true);
  assert.equal(forJo.mine, null);
  assert.equal(confirmSummary(people, msg, confirms, sam).mine, '2026-11-04T21:06:00Z');
});

test('reactions are counted in the fixed order with my own marked', () => {
  const r = reactionSummary([{ kind: 'clap', user_id: 's' }, { kind: 'like', user_id: 'j' }, { kind: 'like', user_id: 's' }], 's');
  assert.deepEqual(r, [{ kind: 'like', count: 2, mine: true }, { kind: 'clap', count: 1, mine: true }]);
});
