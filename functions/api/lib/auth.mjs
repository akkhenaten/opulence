import crypto from 'node:crypto';
import { one, tx } from './db.mjs';
import { fail } from './http.mjs';
import { audit } from './audit.mjs';
import { isPlatformAdmin, needsPlatformRole } from './platform.mjs';

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

// The name someone is known by on shift ("Goddey"), searchable alongside their full name
export const goesBy = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

export const randomToken = () => crypto.randomBytes(24).toString('base64url');

// A manager who also works shifts has one login with a linked staff record.
// `as` = 'officer' (the "My shifts" side) makes the request an officer request for their own record;
// otherwise they are a plain manager and the link is kept aside as self_officer_id (for "no approving your own hours").
export function resolveActing(row, as) {
  const loginRole = row.role;
  const dual = (loginRole === 'company' || loginRole === 'security') && !!row.officer_id;
  if (!dual) return { ...row, login_role: loginRole, self_officer_id: null, dual: false };
  if (as === 'officer') return { ...row, role: 'officer', login_role: loginRole, self_officer_id: row.officer_id, dual: true };
  return { ...row, officer_id: null, login_role: loginRole, self_officer_id: row.officer_id, dual: true };
}

export async function userFromEvent(event, body = {}) {
  const h = event.headers || {};
  const raw = (h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(raw);
  if (!payload) return null;
  const user = await one(
    `SELECT u.id, u.email, u.name, u.goes_by, u.phone, u.role, u.status, u.can_see_pay, o.id AS officer_id,
            COALESCE(o.photo_key, u.photo_key) AS photo_key
       FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE u.id = $1`,
    [payload.sub],
  );
  if (!user || user.status !== 'active') return null;
  return resolveActing(await ensurePlatformRole(user), body._as);
}

/** A platform admin login made with another role is moved to Company manager the first time it is used */
export async function ensurePlatformRole(row) {
  if (!needsPlatformRole(row)) return row;
  await tx(async (t) => {
    await t.q("UPDATE users SET role = 'company', client_id = NULL, can_see_pay = true WHERE id = $1", [row.id]);
    await t.q('DELETE FROM security_venues WHERE user_id = $1', [row.id]);
    await t.q('DELETE FROM venue_contacts WHERE user_id = $1', [row.id]);
  });
  await audit(row, 'user.platform_role', 'user', row.id, { from: row.role });
  return { ...row, role: 'company', can_see_pay: true };
}

export function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, goes_by: u.goes_by || '', phone: u.phone || '', role: u.role, officer_id: u.officer_id || null, can_see_pay: u.can_see_pay,
    login_role: u.login_role || u.role, self_officer_id: u.self_officer_id || null, dual: !!u.dual,
    platform: isPlatformAdmin(u),
  };
}

export const isManager = (u) => u.role === 'company' || u.role === 'security';
// The staff record that belongs to the signed-in person, whichever side they are on
export const ownOfficer = (u) => u.self_officer_id || (u.role === 'officer' ? u.officer_id : null);
export const canSeePay = (u) => u.role === 'company' || (u.role === 'security' && u.can_see_pay);
export const requireOfficer = (u) => u.officer_id || fail(403, 'Officer profile not linked');
