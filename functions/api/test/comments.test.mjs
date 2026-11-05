import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPublish, checkComment, needsFollowUp } from '../modules/comments.mjs';
import { mergePublic } from '../modules/reviews.mjs';

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

test('only praise with a comment can go on the site', () => {
  const praise = { tone: 'praise', comment: 'Brilliant door team', review_id: null };
  assert.equal(canPublish(praise), null);
  assert.equal(canPublish({ ...praise, review_id: 'r1' }), null);
  assert.match(canPublish({ ...praise, tone: 'complaint' }), /Only praise/);
  assert.match(canPublish({ ...praise, tone: 'suggestion' }), /Only praise/);
  assert.match(canPublish({ ...praise, comment: '  ' }), /Add a comment/);
  assert.equal(canPublish({ ...praise, site_client: null }), null);
});

test('ticked feedback joins the website quotes under the venue name only', () => {
  const by = { banshee: [{ quote: 'Old', reviewer: 'A', reviewer_role: 'GM', rating: 5, received_on: null }] };
  const out = mergePublic(by, [{ id: 'c1', venue_id: 'v1', created_by: 'u1', comment: ` ${'x'.repeat(700)} `, rating: 4, created_at: '2026-11-05', venue_name: 'Banshee', site_client: 'banshee' }]);
  assert.equal(out.banshee.length, 2);
  assert.equal(out.banshee[0].quote, 'Old');
  assert.deepEqual(Object.keys(out.banshee[1]).sort(), ['quote', 'rating', 'received_on', 'reviewer', 'reviewer_role']);
  assert.equal(out.banshee[1].reviewer, 'Banshee');
  assert.equal(out.banshee[1].reviewer_role, 'Venue');
  assert.equal(out.banshee[1].quote.length, 600);
  assert.equal(by.banshee.length, 1);
});
