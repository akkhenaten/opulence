// Passkeys (WebAuthn) for the officer's registered phone, verified with node:crypto only (no extra packages).
// A passkey belongs to the app's host name: moving the app to another domain means officers register again.
import crypto from 'node:crypto';
import { one } from './db.mjs';
import { fail } from './http.mjs';

export const b64url = (buf) => Buffer.from(buf).toString('base64url');
export const fromB64url = (s) => Buffer.from(String(s || ''), 'base64url');

export function relyingParty(appUrl = process.env.APP_URL) {
  const u = new URL(appUrl || 'https://localhost');
  return { id: u.hostname, origin: u.origin };
}

// Minimal CBOR decoder: enough for attestation objects and COSE keys
export function cborDecode(buf, pos = 0) {
  const b = Buffer.from(buf);
  const read = () => {
    const ib = b[pos++];
    const major = ib >> 5;
    const info = ib & 31;
    let len = info;
    if (info === 24) len = b[pos++];
    else if (info === 25) { len = b.readUInt16BE(pos); pos += 2; }
    else if (info === 26) { len = b.readUInt32BE(pos); pos += 4; }
    else if (info === 27) { len = Number(b.readBigUInt64BE(pos)); pos += 8; }
    else if (info > 27) throw new Error('Unsupported CBOR');
    switch (major) {
      case 0: return len;
      case 1: return -1 - len;
      case 2: { const v = b.subarray(pos, pos + len); pos += len; return Buffer.from(v); }
      case 3: { const v = b.toString('utf8', pos, pos + len); pos += len; return v; }
      case 4: return Array.from({ length: len }, () => read());
      case 5: { const m = new Map(); for (let i = 0; i < len; i++) { const k = read(); m.set(k, read()); } return m; }
      case 7: return info === 20 ? false : info === 21 ? true : null;
      default: throw new Error('Unsupported CBOR');
    }
  };
  const value = read();
  return { value, end: pos };
}

/** rpIdHash, flags, signCount and (when present) the attested credential */
export function parseAuthData(buf) {
  const b = Buffer.from(buf);
  if (b.length < 37) throw new Error('Authenticator data too short');
  const out = { rpIdHash: b.subarray(0, 32), flags: b[32], signCount: b.readUInt32BE(33) };
  out.up = !!(out.flags & 0x01);
  out.uv = !!(out.flags & 0x04);
  if (out.flags & 0x40) {
    const len = b.readUInt16BE(53);
    out.credentialId = b.subarray(55, 55 + len);
    const { value } = cborDecode(b, 55 + len);
    out.coseKey = value;
  }
  return out;
}

/** COSE public key → { publicKey (SPKI DER), alg } */
export function coseToSpki(cose) {
  const kty = cose.get(1);
  const alg = cose.get(3);
  let jwk;
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) jwk = { kty: 'EC', crv: 'P-256', x: b64url(cose.get(-2)), y: b64url(cose.get(-3)) };
  else if (kty === 3 && alg === -257) jwk = { kty: 'RSA', n: b64url(cose.get(-1)), e: b64url(cose.get(-2)) };
  else throw new Error('Unsupported key type');
  return { publicKey: crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' }), alg };
}

function checkClientData(clientDataJSON, type, challenge, rp) {
  let cd;
  try { cd = JSON.parse(fromB64url(clientDataJSON).toString('utf8')); } catch { throw new Error('Bad client data'); }
  if (cd.type !== type) throw new Error('Wrong ceremony');
  if (cd.challenge !== challenge) throw new Error('Wrong challenge');
  if (cd.origin !== rp.origin) throw new Error('Wrong origin');
  return cd;
}

function checkAuthData(ad, rp) {
  if (!ad.rpIdHash.equals(crypto.createHash('sha256').update(rp.id).digest())) throw new Error('Wrong site');
  if (!ad.up) throw new Error('No user presence');
  if (!ad.uv) throw new Error('Phone unlock (fingerprint, face or PIN) was not used');
}

/** Pure check of a registration response against the expected challenge. Returns the credential to store. */
export function checkRegistration(res, { challenge, rp = relyingParty() }) {
  checkClientData(res.clientDataJSON, 'webauthn.create', challenge, rp);
  const att = cborDecode(fromB64url(res.attestationObject)).value;
  const ad = parseAuthData(att.get('authData'));
  checkAuthData(ad, rp);
  if (!ad.credentialId) throw new Error('No credential in response');
  const { publicKey, alg } = coseToSpki(ad.coseKey);
  return { credentialId: b64url(ad.credentialId), publicKey, alg, signCount: ad.signCount };
}

/** Pure check of an assertion against a stored device. Returns the new sign count. */
export function checkAssertion(res, device, { challenge, rp = relyingParty() }) {
  const cdBytes = fromB64url(res.clientDataJSON);
  checkClientData(res.clientDataJSON, 'webauthn.get', challenge, rp);
  const adBytes = fromB64url(res.authenticatorData);
  const ad = parseAuthData(adBytes);
  checkAuthData(ad, rp);
  const data = Buffer.concat([adBytes, crypto.createHash('sha256').update(cdBytes).digest()]);
  const key = crypto.createPublicKey({ key: Buffer.from(device.public_key), format: 'der', type: 'spki' });
  const sig = fromB64url(res.signature);
  const ok = device.alg === -7 ? crypto.verify('sha256', data, { key, dsaEncoding: 'der' }, sig) : crypto.verify('sha256', data, key, sig);
  if (!ok) throw new Error('Signature does not match');
  // Synced passkeys always report 0; a counter that goes backwards means a cloned key
  const stored = Number(device.sign_count || 0);
  if ((stored > 0 || ad.signCount > 0) && ad.signCount <= stored) throw new Error('Passkey counter went backwards');
  return { signCount: ad.signCount };
}

// ---- Challenges (single use, 5 minutes)

export async function newChallenge(userId, purpose) {
  const challenge = b64url(crypto.randomBytes(32));
  await one("INSERT INTO passkey_challenges (user_id, purpose, challenge, expires_at) VALUES ($1,$2,$3, now() + interval '5 minutes') RETURNING id", [userId, purpose, challenge]);
  return challenge;
}

// The challenge the browser signed, taken from its client data, and spent
export async function spendChallenge(userId, purpose, clientDataJSON) {
  let challenge;
  try { challenge = JSON.parse(fromB64url(clientDataJSON).toString('utf8')).challenge; } catch { /* checked below */ }
  const row = challenge && await one(
    `UPDATE passkey_challenges SET used_at = now() WHERE challenge = $1 AND user_id = $2 AND purpose = $3 AND used_at IS NULL AND expires_at > now() RETURNING challenge`,
    [challenge, userId, purpose]);
  if (!row) fail(400, 'This phone check has expired. Try again.');
  return row.challenge;
}

export async function registerOptions(user, existing = []) {
  const rp = relyingParty();
  return {
    challenge: await newChallenge(user.id, 'register'),
    rp: { id: rp.id, name: 'Orb Security' },
    user: { id: b64url(Buffer.from(user.id)), name: user.email || user.name, displayName: user.name },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
    attestation: 'none',
    excludeCredentials: existing.map((id) => ({ type: 'public-key', id })),
    timeout: 60000,
  };
}

export async function assertionOptions(user, credentialIds) {
  return {
    challenge: await newChallenge(user.id, 'clock'),
    rpId: relyingParty().id,
    allowCredentials: credentialIds.map((id) => ({ type: 'public-key', id })),
    userVerification: 'required',
    timeout: 60000,
  };
}

// Short "iPhone · Safari" style label from the browser's user agent
export function deviceLabel(ua = '') {
  const s = String(ua);
  const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? (s.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|\))/)?.[1]?.trim() || 'Android') : /Mac OS X/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows PC' : 'Phone';
  const br = /EdgA?\//.test(s) ? 'Edge' : /SamsungBrowser/.test(s) ? 'Samsung Internet' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /FxiOS|Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'browser';
  return `${os} · ${br}`.slice(0, 80);
}
