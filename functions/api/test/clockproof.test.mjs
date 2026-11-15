import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { evaluate } from '../lib/proof.mjs';
import { cmac, verifySun, makeSun } from '../lib/sun.mjs';
import { checkRegistration, checkAssertion, b64url, deviceLabel } from '../lib/passkey.mjs';

// ---- Proof rule

test('phone + 2 of 3 by default; looser and stricter venue rules', () => {
  assert.equal(evaluate({ geo_ok: true, venue_code_ok: true }).met, true);
  assert.equal(evaluate({ venue_code_ok: true, selfie_ok: true }).met, true);
  const one = evaluate({ geo_ok: true });
  assert.equal(one.met, false);
  assert.deepEqual(one.missing, ['venue_code', 'selfie']);
  assert.equal(evaluate({ rule: 'any_one', selfie_ok: true }).met, true);
  assert.equal(evaluate({ rule: 'all_three', geo_ok: true, venue_code_ok: true }).met, false);
  assert.equal(evaluate({ rule: 'all_three', geo_ok: true, venue_code_ok: true, selfie_ok: true }).met, true);
});

// ---- AES-CMAC and NTAG 424 SUN

test('AES-CMAC matches RFC 4493', () => {
  const k = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex');
  assert.equal(cmac(k).toString('hex'), 'bb1d6929e95937287fa37d129b756746');
  assert.equal(cmac(k, Buffer.from('6bc1bee22e409f96e93d7e117393172a', 'hex')).toString('hex'), '070a16b46b4d4144f79bdd9dd04a287c');
  assert.equal(cmac(k, Buffer.from('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411', 'hex')).toString('hex'), 'dfa66747de9ae63030ca32611497c827');
});

const ZERO_KEYS = { metaKey: '00000000000000000000000000000000', fileKey: '00000000000000000000000000000000' };

test('SUN code from NXP AN12196 verifies to its UID and counter', () => {
  const r = verifySun({ p: 'EF963FF7828658A599F3041510671E88', c: '94EED9EE65337086' }, ZERO_KEYS);
  assert.deepEqual(r, { uid: '04DE5F1EACC040', counter: 61 });
});

test('a tampered, mis-keyed or malformed tap is rejected', () => {
  assert.equal(verifySun({ p: 'EF963FF7828658A599F3041510671E88', c: '94EED9EE65337087' }, ZERO_KEYS), null);
  const other = { metaKey: '11111111111111111111111111111111', fileKey: '22222222222222222222222222222222' };
  assert.equal(verifySun({ p: 'EF963FF7828658A599F3041510671E88', c: '94EED9EE65337086' }, other), null);
  assert.equal(verifySun({ p: 'nothex', c: '' }, ZERO_KEYS), null);
  const t = makeSun('04AABBCCDDEEFF', 7, other);
  assert.deepEqual(verifySun(t, other), { uid: '04AABBCCDDEEFF', counter: 7 });
  assert.equal(verifySun(t, ZERO_KEYS), null);
});

// ---- Passkeys: a software authenticator

const RP = { id: 'app.example.com', origin: 'https://app.example.com' };
const rpHash = crypto.createHash('sha256').update(RP.id).digest();

function cborBytes(b) { return Buffer.concat([Buffer.from([0x58, b.length]), b]); }
function coseEc(pub) {
  const jwk = pub.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  // {1: 2, 3: -7, -1: 1, -2: x, -3: y}
  return Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21]), cborBytes(x), Buffer.from([0x22]), cborBytes(y)]);
}
function authData({ flags = 0x05, count = 0, cred, cose } = {}) {
  const c = Buffer.alloc(4); c.writeUInt32BE(count);
  const parts = [rpHash, Buffer.from([flags | (cred ? 0x40 : 0)]), c];
  if (cred) { const l = Buffer.alloc(2); l.writeUInt16BE(cred.length); parts.push(Buffer.alloc(16), l, cred, cose); }
  return Buffer.concat(parts);
}
const clientData = (type, challenge, origin = RP.origin) => b64url(Buffer.from(JSON.stringify({ type, challenge, origin })));

function register(challenge, opts = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const cred = crypto.randomBytes(16);
  const ad = authData({ flags: opts.flags ?? 0x05, cred, cose: coseEc(publicKey) });
  // {"fmt": "none", "attStmt": {}, "authData": ad}
  const att = Buffer.concat([Buffer.from([0xa3, 0x63]), Buffer.from('fmt'), Buffer.from([0x64]), Buffer.from('none'), Buffer.from([0x67]), Buffer.from('attStmt'), Buffer.from([0xa0, 0x68]), Buffer.from('authData'),
    Buffer.from([0x59, ad.length >> 8, ad.length & 0xff]), ad]);
  return { privateKey, res: { id: b64url(cred), clientDataJSON: clientData('webauthn.create', challenge, opts.origin), attestationObject: b64url(att) } };
}
function sign(privateKey, challenge, { count = 0, flags = 0x05, origin } = {}) {
  const ad = authData({ flags, count });
  const cd = clientData('webauthn.get', challenge, origin);
  const sig = crypto.sign('sha256', Buffer.concat([ad, crypto.createHash('sha256').update(Buffer.from(cd, 'base64url')).digest()]), { key: privateKey, dsaEncoding: 'der' });
  return { clientDataJSON: cd, authenticatorData: b64url(ad), signature: b64url(sig) };
}

test('a phone registers and then proves itself with a signed challenge', () => {
  const { privateKey, res } = register('reg-challenge');
  const cred = checkRegistration(res, { challenge: 'reg-challenge', rp: RP });
  assert.equal(cred.credentialId, res.id);
  assert.equal(cred.alg, -7);
  const device = { public_key: cred.publicKey, alg: cred.alg, sign_count: 0 };
  assert.deepEqual(checkAssertion(sign(privateKey, 'c1'), device, { challenge: 'c1', rp: RP }), { signCount: 0 });
  assert.deepEqual(checkAssertion(sign(privateKey, 'c2', { count: 5 }), device, { challenge: 'c2', rp: RP }), { signCount: 5 });
});

test('wrong origin, challenge, missing unlock, another key or a falling counter all fail', () => {
  const { privateKey, res } = register('r');
  assert.throws(() => checkRegistration(res, { challenge: 'other', rp: RP }), /challenge/);
  assert.throws(() => checkRegistration(register('r', { origin: 'https://evil.example' }).res, { challenge: 'r', rp: RP }), /origin/);
  assert.throws(() => checkRegistration(register('r', { flags: 0x01 }).res, { challenge: 'r', rp: RP }), /unlock/);
  const cred = checkRegistration(res, { challenge: 'r', rp: RP });
  const device = { public_key: cred.publicKey, alg: -7, sign_count: 10 };
  assert.throws(() => checkAssertion(sign(privateKey, 'c', { count: 10 }), device, { challenge: 'c', rp: RP }), /backwards/);
  assert.throws(() => checkAssertion(sign(privateKey, 'c', { count: 11, flags: 0x01 }), device, { challenge: 'c', rp: RP }), /unlock/);
  const stranger = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  assert.throws(() => checkAssertion(sign(stranger, 'c', { count: 11 }), device, { challenge: 'c', rp: RP }), /Signature/);
  assert.throws(() => checkAssertion(sign(privateKey, 'c', { count: 11 }), device, { challenge: 'd', rp: RP }), /challenge/);
});

test('device labels read like "iPhone · Safari"', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'), 'Pixel 8 · Chrome');
});

test('failedChecks: only explicit failures count, old events say nothing', async () => {
  const { failedChecks } = await import('../lib/proof.mjs');
  assert.deepEqual(failedChecks(null), []);
  assert.deepEqual(failedChecks({ kind: 'in', device_ok: null, geo_ok: null, qr_ok: null }), []);
  assert.deepEqual(failedChecks({ kind: 'in', device_ok: false, geo_ok: false, flags: ['new_phone'] }), ['phone', 'distance']);
  assert.deepEqual(failedChecks({ kind: 'in', venue_code: 'nfc', qr_ok: false, geo_ok: true }), []);
  assert.deepEqual(failedChecks({ kind: 'in', qr_ok: false, proof_rule: 'two_of_three', flags: ['rule_not_met'] }), ['rule']);
  assert.deepEqual(failedChecks({ kind: 'in', face_result: 'no_match' }), ['face']);
  assert.deepEqual(failedChecks({ kind: 'out', qr_ok: false, geo_ok: true }), []);
});
