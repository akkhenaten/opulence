import test from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, newToken, linkState, nameMatches } from '../lib/signLinks.mjs';

const soon = new Date(Date.now() + 864e5);
const past = new Date(Date.now() - 1000);

test('tokens are random, url-safe, and only their hash is stored', () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), a);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
});

test('a link works only while sent, unexpired, unused and not replaced', () => {
  const sent = { status: 'sent' };
  assert.equal(linkState({ expires_at: soon }, sent), 'ok');
  assert.equal(linkState({ expires_at: past }, sent), 'expired');
  assert.equal(linkState({ expires_at: soon, revoked_at: past }, sent), 'revoked');
  assert.equal(linkState({ expires_at: soon }, { status: 'void' }), 'void');
  assert.equal(linkState({ expires_at: soon }, { status: 'superseded' }), 'void');
  assert.equal(linkState(null, sent), 'invalid');
  // Signed: the signer's own link stays open for the download window, any other link is spent
  assert.equal(linkState({ expires_at: past, used_at: past, download_until: soon }, { status: 'signed' }), 'signed');
  assert.equal(linkState({ expires_at: past, used_at: past, download_until: past }, { status: 'signed' }), 'used');
  assert.equal(linkState({ expires_at: soon }, { status: 'signed' }), 'used');
});

test('the typed name must share a name with the person the link went to', () => {
  assert.ok(nameMatches('Sarah O\'Neill', 'sarah oneill'));
  assert.ok(nameMatches('Sarah O\'Neill', 'S. O\'Neill'));
  assert.ok(nameMatches('Mark Jones', 'Mark Anthony Jones'));
  assert.ok(nameMatches('', 'Anyone'));
  assert.ok(!nameMatches('Mark Jones', 'Paul Smith'));
});
