// Mailbox tokens at rest: AES-256-GCM under EMAIL_TOKEN_KEY (its own key, not APP_SECRET). Format v1.iv.tag.ct (base64url).
import crypto from 'node:crypto';
import { fail } from '../http.mjs';

const key = () => {
  const k = process.env.EMAIL_TOKEN_KEY;
  if (!k) fail(503, 'Email is not set up yet');
  return crypto.createHash('sha256').update(k).digest();
};

export function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), ct].map((x) => (typeof x === 'string' ? x : x.toString('base64url'))).join('.');
}

export function open(blob) {
  const [v, iv, tag, ct] = String(blob || '').split('.');
  if (v !== 'v1' || !ct) throw new Error('Bad token blob');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

// PKCE pair for the OAuth code flow
export function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}
