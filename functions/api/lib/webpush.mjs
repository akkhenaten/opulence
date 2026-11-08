// Web Push (VAPID + aes128gcm, RFC 8291/8292) with Node crypto only.
import crypto from 'node:crypto';
import { one, q } from './db.mjs';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

let keys;
/** VAPID key pair, created once and kept in app_secrets. */
export async function vapidKeys() {
  if (keys) return keys;
  let row = await one("SELECT value FROM app_secrets WHERE name = 'vapid'");
  if (!row) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const value = JSON.stringify({ priv: privateKey.export({ format: 'jwk' }), pub: publicKey.export({ format: 'jwk' }) });
    await q("INSERT INTO app_secrets (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING", [value]);
    row = await one("SELECT value FROM app_secrets WHERE name = 'vapid'");
  }
  const { priv, pub } = JSON.parse(row.value);
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  keys = { privateKey: crypto.createPrivateKey({ key: priv, format: 'jwk' }), publicKey: b64u(raw) };
  return keys;
}

function vapidJwt(endpoint, privateKey) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:support@openkbs.com' }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64u(sig)}`;
}

const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

export function encrypt(payload, sub) {
  const uaPublic = Buffer.from(sub.keys.p256dh, 'base64url');
  const authSecret = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** Send one push: { status, reason } — status 0 on network failure, reason is the push service's answer when it refused. */
export async function sendPush(sub, data) {
  const { privateKey, publicKey } = await vapidKeys();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high', Authorization: `vapid t=${vapidJwt(sub.endpoint, privateKey)}, k=${publicKey}` },
      body: encrypt(JSON.stringify(data), sub),
      signal: ctrl.signal,
    });
    const reason = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 200);
    return { status: res.status, reason };
  } catch (e) {
    return { status: 0, reason: e.name === 'AbortError' ? 'timed out' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

const host = (endpoint) => { try { return new URL(endpoint).host; } catch { return '?'; } };

/** What one subscription is sent: data, or data(sub) when each device gets its own (e.g. its unread count). */
export const payloadFor = (data, sub) => (typeof data === 'function' ? data(sub) : data);

/** Push to these subscriptions; logs refusals and drops the ones the browser has revoked. Returns one result per subscription. */
export async function pushToSubs(subs, data) {
  const results = await Promise.all(subs.map((s) => sendPush(s, payloadFor(data, s)).then((r) => ({ s, ...r }))));
  for (const r of results) if (r.status < 200 || r.status >= 300) console.warn('[push] refused:', host(r.s.endpoint), r.status, r.reason);
  const gone = results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.s.id);
  if (gone.length) await q('DELETE FROM push_subscriptions WHERE id = ANY($1::uuid[])', [gone]);
  return results;
}

/** Push to every subscription of these users. badges: { user_id: unread } sets the app icon count on each person's devices. */
export async function pushToUsers(userIds, data, badges = null) {
  if (!userIds.length) return;
  const subs = await q('SELECT id, user_id, endpoint, keys FROM push_subscriptions WHERE user_id = ANY($1::uuid[])', [userIds]);
  await pushToSubs(subs, badges ? (s) => ({ ...data, badge: badges[s.user_id] ?? 0 }) : data);
}
