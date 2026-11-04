// Secure NFC tags (NXP NTAG 424 DNA "SUN"): every tap opens a link with a fresh encrypted code, so a copied or replayed link fails.
// Link template programmed on each tag: <APP_URL>/app/t?p={encrypted PICC data}&c={CMAC}
import crypto from 'node:crypto';

const ZERO = Buffer.alloc(16);
const aesEcb = (key, block) => { const c = crypto.createCipheriv('aes-128-ecb', key, null); c.setAutoPadding(false); return Buffer.concat([c.update(block), c.final()]); };

function dbl(b) {
  const out = Buffer.alloc(16);
  let carry = 0;
  for (let i = 15; i >= 0; i--) { out[i] = ((b[i] << 1) | carry) & 0xff; carry = b[i] >> 7; }
  if (b[0] & 0x80) out[15] ^= 0x87;
  return out;
}

/** AES-128 CMAC (RFC 4493) */
export function cmac(key, msg = Buffer.alloc(0)) {
  const k1 = dbl(aesEcb(key, ZERO));
  const k2 = dbl(k1);
  const n = Math.max(1, Math.ceil(msg.length / 16));
  const complete = msg.length > 0 && msg.length % 16 === 0;
  let x = Buffer.alloc(16);
  for (let i = 0; i < n; i++) {
    let block = Buffer.alloc(16);
    msg.copy(block, 0, i * 16, Math.min(msg.length, (i + 1) * 16));
    if (i === n - 1) {
      if (!complete) block[msg.length - i * 16] = 0x80;
      const k = complete ? k1 : k2;
      block = Buffer.from(block.map((v, j) => v ^ k[j]));
    }
    x = aesEcb(key, Buffer.from(block.map((v, j) => v ^ x[j])));
  }
  return x;
}

const hexKey = (k) => { const b = Buffer.from(String(k || ''), 'hex'); if (b.length !== 16) throw new Error('NFC key must be 16 bytes'); return b; };

function sessionMac(fileKey, uid, ctrLe) {
  const sv2 = Buffer.concat([Buffer.from('3CC300010080', 'hex'), uid, ctrLe]);
  const full = cmac(cmac(hexKey(fileKey), sv2));
  return Buffer.from([1, 3, 5, 7, 9, 11, 13, 15].map((i) => full[i]));
}

/** Check one tap. Returns { uid (hex upper), counter } or null when the code is not genuine. */
export function verifySun({ p, c }, { metaKey, fileKey }) {
  if (!/^[0-9a-fA-F]{32}$/.test(String(p || '')) || !/^[0-9a-fA-F]{16}$/.test(String(c || ''))) return null;
  const d = crypto.createDecipheriv('aes-128-cbc', hexKey(metaKey), ZERO);
  d.setAutoPadding(false);
  const plain = Buffer.concat([d.update(Buffer.from(p, 'hex')), d.final()]);
  if (plain[0] !== 0xc7) return null; // UID and counter mirrored, 7-byte UID
  const uid = plain.subarray(1, 8);
  const ctrLe = plain.subarray(8, 11);
  const expected = sessionMac(fileKey, uid, ctrLe);
  const given = Buffer.from(c, 'hex');
  if (!crypto.timingSafeEqual(expected, given)) return null;
  return { uid: uid.toString('hex').toUpperCase(), counter: ctrLe.readUIntLE(0, 3) };
}

/** What a programmed tag would produce for a UID and counter (tests and the setup check) */
export function makeSun(uidHex, counter, { metaKey, fileKey }) {
  const uid = Buffer.from(uidHex, 'hex');
  const ctrLe = Buffer.alloc(3);
  ctrLe.writeUIntLE(counter, 0, 3);
  const plain = Buffer.concat([Buffer.from([0xc7]), uid, ctrLe, crypto.randomBytes(5)]);
  const e = crypto.createCipheriv('aes-128-cbc', hexKey(metaKey), ZERO);
  e.setAutoPadding(false);
  const p = Buffer.concat([e.update(plain), e.final()]).toString('hex').toUpperCase();
  return { p, c: sessionMac(fileKey, uid, ctrLe).toString('hex').toUpperCase() };
}

export const newKey = () => crypto.randomBytes(16).toString('hex').toUpperCase();
