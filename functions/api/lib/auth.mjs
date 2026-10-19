import crypto from 'node:crypto';
import { one } from './db.mjs';
import { fail } from './http.mjs';

// In Lambda a missing secret must never fall back to a guessable value
const SECRET = () => {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  // Platform key is injected into every function and survives redeploys; derive a dedicated signing key from it
  if (process.env.OPENKBS_API_KEY) return crypto.createHmac('sha256', process.env.OPENKBS_API_KEY).update('orb-session-v1').digest('hex');
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) throw new Error('APP_SECRET is not configured');
  return 'dev-secret-local-only';
};

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function hmac(data, purpose = 'jwt') {
  return crypto.createHmac('sha256', `${SECRET()}:${purpose}`).update(data).digest('base64url');
}

export function signToken(payload, ttlSec = 60 * 60 * 24 * 14) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${head}.${body}.${hmac(`${head}.${body}`)}`;
}

export function verifyToken(token) {
  const [head, body, sig] = (token || '').split('.');
  if (!sig) return null;
  const expected = hmac(`${head}.${body}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Date.now() / 1000) return null;
  return payload;
}

export const randomToken = () => crypto.randomBytes(24).toString('base64url');

export async function userFromEvent(event) {
  const h = event.headers || {};
  const raw = (h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(raw);
  if (!payload) return null;
  const user = await one(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.can_see_pay, o.id AS officer_id
       FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE u.id = $1`,
    [payload.sub],
  );
  if (!user || user.status !== 'active') return null;
  return user;
}

export function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, officer_id: u.officer_id || null, can_see_pay: u.can_see_pay };
}

export const isManager = (u) => u.role === 'company' || u.role === 'security';
export const canSeePay = (u) => u.role === 'company' || (u.role === 'security' && u.can_see_pay);
export const requireOfficer = (u) => u.officer_id || fail(403, 'Officer profile not linked');
