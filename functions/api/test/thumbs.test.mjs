import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thumbKeyOf } from '../lib/storage.mjs';

test('the small photo version sits next to the photo', () => {
  assert.equal(thumbKeyOf('docs/photos/abcd1234/x-me.jpg'), 'docs/photos/abcd1234/x-me.jpg.sm.jpg');
  assert.equal(thumbKeyOf(null), null);
  assert.equal(thumbKeyOf(''), null);
});
