import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkComment, needsFollowUp } from '../modules/comments.mjs';

const ok = { about: 'service', tone: 'praise', rating: 4, comment: '  Great night  ' };

test('checkComment trims and keeps the rating', () => {
  assert.deepEqual(checkComment(ok), { about: 'service', tone: 'praise', rating: 4, comment: 'Great night' });
});

test('checkComment rejects bad input', () => {
  assert.throws(() => checkComment({ ...ok, about: 'pay' }), /about/);
  assert.throws(() => checkComment({ ...ok, tone: 'meh' }), /praise/);
  assert.throws(() => checkComment({ ...ok, rating: 6 }), /1 to 5/);
  assert.throws(() => checkComment({ ...ok, rating: null }), /star rating/);
  assert.throws(() => checkComment({ ...ok, about: 'staff' }), /who/);
  assert.throws(() => checkComment({ ...ok, about: 'shift' }), /shift/);
  assert.throws(() => checkComment({ ...ok, comment: 'x'.repeat(2001) }), /2,000/);
  assert.throws(() => checkComment({ about: 'other', tone: 'suggestion', comment: ' ' }), /comment or/);
});

test('rating is optional for "other"', () => {
  assert.equal(checkComment({ about: 'other', tone: 'suggestion', comment: 'More staff on Fridays' }).rating, null);
});

test('complaints and low ratings need a follow-up', () => {
  assert.equal(needsFollowUp({ tone: 'complaint', rating: 5 }), true);
  assert.equal(needsFollowUp({ tone: 'praise', rating: 2 }), true);
  assert.equal(needsFollowUp({ tone: 'suggestion', rating: null }), false);
  assert.equal(needsFollowUp({ tone: 'praise', rating: 3 }), false);
});
