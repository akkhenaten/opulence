import { one, q, tx } from '../lib/db.mjs';
import { fail, required } from '../lib/http.mjs';
import { hashPassword, verifyPassword, signToken, randomToken, publicUser } from '../lib/auth.mjs';
import { sendRawEmail, emailHtml } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { downloadUrl, checkOwnPhoto } from '../lib/storage.mjs';
import { ALL, pub, def } from './_def.mjs';
import { getBrand } from '../lib/brand.mjs';

const loadUser = (userId) => one(
  'SELECT u.*, o.id AS officer_id, COALESCE(o.photo_key, u.photo_key) AS photo_key FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE u.id = $1', [userId]);
// The signed-in person as the app sees them, with a short-lived link to their photo
const me = async (u) => ({ ...publicUser(u), photo_url: await downloadUrl(u.photo_key) });

const session = async (userId) => {
  const u = await loadUser(userId);
  return { token: signToken({ sub: u.id, role: u.role }), user: await me(u) };
};

const checkPw = (pw) => { if (!pw || pw.length < 8) fail(400, 'Password must be at least 8 characters'); };

export const actions = {
  'auth.needsBootstrap': pub(async () => ({ needed: !(await one("SELECT 1 FROM users WHERE role = 'company' AND NOT system")) })),

  'auth.bootstrap': pub(async (b) => {
    required(b, 'email', 'password', 'name');
    checkPw(b.password);
    if (await one("SELECT 1 FROM users WHERE role = 'company' AND NOT system")) fail(409, 'Already set up');
    const u = await one(
      "INSERT INTO users (email, name, role, password_hash, status) VALUES (lower($1), $2, 'company', $3, 'active') RETURNING id",
      [b.email.trim(), b.name.trim(), hashPassword(b.password)],
    );
    if (b.company_name) await q('UPDATE settings SET company_name = $1', [b.company_name]);
    await audit({ id: u.id }, 'bootstrap', 'user', u.id);
    return session(u.id);
  }),

  'auth.login': pub(async (b) => {
    required(b, 'email', 'password');
    const u = await one('SELECT * FROM users WHERE email = lower($1)', [b.email.trim()]);
    if (!u || u.status !== 'active' || !verifyPassword(b.password, u.password_hash)) fail(401, 'Incorrect email or password');
    await q('UPDATE users SET last_login = now() WHERE id = $1', [u.id]);
    return session(u.id);
  }),

  'auth.me': def(ALL, async (_b, { user }) => {
    const brand = await getBrand();
    return { user: await me(user), company_name: brand.name, brand };
  }),

  // Your own name, phone and photo. Email is the sign-in, so only the company manager changes it.
  // Officers' details live on their staff record too, so both stay in step.
  'auth.updateMe': def(ALL, async (b, { user }) => {
    const name = b.name === undefined ? user.name : String(b.name).replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 80) fail(400, 'Enter your name (2 to 80 characters)');
    const phone = b.phone === undefined ? user.phone : String(b.phone).trim().slice(0, 30);
    const photo = b.photo_key === undefined ? undefined : await checkOwnPhoto(user, b.photo_key, fail);
    await tx(async (t) => {
      await t.q('UPDATE users SET name = $2, phone = $3 WHERE id = $1', [user.id, name, phone]);
      if (user.officer_id) {
        const cut = name.lastIndexOf(' ');
        const [first, last] = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name, ''];
        await t.q('UPDATE officers SET first_name = $2, last_name = $3, phone = $4 WHERE id = $1', [user.officer_id, first, last, phone]);
        if (photo !== undefined) await t.q('UPDATE officers SET photo_key = $2 WHERE id = $1', [user.officer_id, photo]);
      } else if (photo !== undefined) await t.q('UPDATE users SET photo_key = $2 WHERE id = $1', [user.id, photo]);
    });
    await audit(user, 'user.self_update', 'user', user.id, Object.keys(b).filter((k) => ['name', 'phone', 'photo_key'].includes(k)));
    return { user: await me(await loadUser(user.id)) };
  }),

  'auth.inviteInfo': pub(async (b) => {
    const u = await one("SELECT name, email, role FROM users WHERE invite_token = $1 AND status = 'invited'", [b.token || '-']);
    if (!u) fail(404, 'This invite link is no longer valid');
    return u;
  }),

  'auth.acceptInvite': pub(async (b) => {
    required(b, 'token', 'password');
    checkPw(b.password);
    const u = await one(
      "UPDATE users SET password_hash = $2, status = 'active', invite_token = NULL WHERE invite_token = $1 AND status = 'invited' RETURNING id",
      [b.token, hashPassword(b.password)],
    );
    if (!u) fail(404, 'This invite link is no longer valid');
    return session(u.id);
  }),

  'auth.requestReset': pub(async (b) => {
    required(b, 'email');
    const token = randomToken();
    const u = await one(
      "UPDATE users SET reset_token = $2, reset_expires = now() + interval '2 hours' WHERE email = lower($1) AND status = 'active' RETURNING email",
      [b.email.trim(), token],
    );
    if (u) {
      await sendRawEmail(u.email, `Reset your ${(await getBrand()).name} password`,
        await emailHtml('Reset your password', 'Use the button below within 2 hours to choose a new password.', `/reset/${token}`));
    }
    return { ok: true };
  }),

  'auth.reset': pub(async (b) => {
    required(b, 'token', 'password');
    checkPw(b.password);
    const u = await one(
      'UPDATE users SET password_hash = $2, reset_token = NULL, reset_expires = NULL WHERE reset_token = $1 AND reset_expires > now() RETURNING id',
      [b.token, hashPassword(b.password)],
    );
    if (!u) fail(404, 'This reset link has expired');
    return session(u.id);
  }),

  'auth.changePassword': def(ALL, async (b, { user }) => {
    required(b, 'current', 'password');
    checkPw(b.password);
    const u = await one('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!verifyPassword(b.current, u.password_hash)) fail(400, 'Current password is incorrect');
    await q('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, hashPassword(b.password)]);
    return { ok: true };
  }),
};
