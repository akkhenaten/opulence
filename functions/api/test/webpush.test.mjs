import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encrypt, payloadFor } from '../lib/webpush.mjs';

const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

// What the phone does with a push (RFC 8291): the payload must come back intact
test('push payload decrypts on the device side (RFC 8291 aes128gcm)', () => {
  const ua = crypto.createECDH('prime256v1');
  const uaPub = ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const msg = JSON.stringify({ title: 'Clocked out', body: 'Your manager clocked you out at 02:10 — Café', link: '/shifts' });
  const ct = encrypt(msg, { keys: { p256dh: uaPub.toString('base64url'), auth: auth.toString('base64url') } });
  const salt = ct.subarray(0, 16);
  assert.equal(ct.readUInt32BE(16), 4096);
  const asPub = ct.subarray(21, 21 + ct[20]);
  const rest = ct.subarray(21 + ct[20]);
  const ikm = hkdf(auth, ua.computeSecret(asPub), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const d = crypto.createDecipheriv('aes-128-gcm', hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12));
  d.setAuthTag(rest.subarray(rest.length - 16));
  const pt = Buffer.concat([d.update(rest.subarray(0, rest.length - 16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2);
  assert.equal(pt.subarray(0, -1).toString(), msg);
});

test('each device can get its own payload (its unread count for the app icon)', () => {
  const data = { title: 'Hi' };
  assert.deepEqual(payloadFor(data, { user_id: 'a' }), data);
  const badges = { a: 3 };
  const per = (s) => ({ ...data, badge: badges[s.user_id] ?? 0 });
  assert.deepEqual(payloadFor(per, { user_id: 'a' }), { title: 'Hi', badge: 3 });
  assert.deepEqual(payloadFor(per, { user_id: 'b' }), { title: 'Hi', badge: 0 });
});
