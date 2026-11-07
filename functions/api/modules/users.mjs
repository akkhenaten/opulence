import { one, q, tx } from '../lib/db.mjs';
import { fail, required, pick } from '../lib/http.mjs';
import { goesBy, randomToken } from '../lib/auth.mjs';
import { sendRawEmail, emailHtml } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { photoUrls } from '../lib/storage.mjs';
import { CO, ALL, def } from './_def.mjs';
import { getBrand } from '../lib/brand.mjs';
import { seedOnboarding } from './hr.mjs';
import { disconnectUser } from './email.mjs';
import { officerName, userName } from '../lib/names.mjs';
import { guardPlatformAccount, inviteRole, isPlatformEmail } from '../lib/platform.mjs';

const ROLE_LABEL = { company: 'Company Manager', security: 'Security Manager', venue: 'Venue Manager', officer: 'Security Officer' };

export async function createInvite(t, { email, name, role, phone = '', can_see_pay = false, goes_by = '' }) {
  if (await t.one('SELECT 1 FROM users WHERE email = lower($1)', [email.trim()])) fail(409, 'A user with this email already exists');
  const token = randomToken();
  const u = await t.one(
    'INSERT INTO users (email, name, role, phone, can_see_pay, invite_token, goes_by) VALUES (lower($1),$2,$3,$4,$5,$6,$7) RETURNING *',
    [email.trim(), name.trim(), role, phone, !!can_see_pay, token, goesBy(goes_by)],
  );
  return u;
}

/** Emails the invite; `emailed` is false when the mail service didn't take it, so the screen says to share the link.
 *  The time and result are kept on the login, so its screens can say later whether the invite went out. */
export async function sendInviteMail(u) {
  const { name } = await getBrand();
  const emailed = await sendRawEmail(u.email, `You're invited to ${name}`,
    await emailHtml(`Welcome, ${u.name}`, `You've been invited to ${name} as a ${ROLE_LABEL[u.role]}. Set your password to get started.`, `/invite/${u.invite_token}`));
  const sent = await one('UPDATE users SET invite_sent_at = now(), invite_emailed = $2 WHERE id = $1 RETURNING invite_sent_at', [u.id, emailed]);
  await audit(null, 'user.invite_sent', 'user', u.id, { emailed });
  return { link: `/app/invite/${u.invite_token}`, emailed, sent_at: sent?.invite_sent_at || null };
}
export const sendInvite = async (u) => (await sendInviteMail(u)).link;

// A pending invite link works once, so anyone may share it; an active platform admin account is never reset by others
export const resetGuardNeeded = (status) => status !== 'invited';

export async function setVenues(t, userId, role, venueIds) {
  if (!Array.isArray(venueIds)) return;
  const table = role === 'venue' ? 'venue_contacts' : role === 'security' ? 'security_venues' : null;
  if (!table) return;
  await t.q(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  for (const v of venueIds) await t.q(`INSERT INTO ${table} (venue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [v, userId]);
}

// Venue and security managers can be a client's contact; anyone else carries no client
async function checkClient(t, role, clientId) {
  if (!clientId || !['venue', 'security'].includes(role)) return null;
  if (!(await t.one('SELECT 1 FROM clients WHERE id = $1', [clientId]))) fail(400, 'Client not found');
  return clientId;
}

const withPhotos = (rows) => Promise.all(rows.map(async ({ photo_key, ...u }) => ({ ...u, ...(await photoUrls(photo_key)) })));

export const actions = {
  'users.list': def(CO, async (b) => withPhotos(await q(
    `SELECT u.id, u.email, u.name, u.goes_by, u.phone, u.role, COALESCE((SELECT o.photo_key FROM officers o WHERE o.user_id = u.id LIMIT 1), u.photo_key) AS photo_key, u.status, u.can_see_pay, u.last_login, u.created_at,
            u.client_id, (SELECT c.name FROM clients c WHERE c.id = u.client_id) AS client_name,
            COALESCE(array_agg(DISTINCT v.name) FILTER (WHERE v.name IS NOT NULL), '{}') AS venues,
            COALESCE(array_agg(DISTINCT v.id) FILTER (WHERE v.id IS NOT NULL), '{}') AS venue_ids,
            CASE WHEN u.status = 'invited' THEN '/app/invite/' || u.invite_token END AS invite_link, u.invite_sent_at, u.invite_emailed,
            (SELECT o.id FROM officers o WHERE o.user_id = u.id LIMIT 1) AS officer_id,
            (SELECT ${officerName('o')} FROM officers o WHERE o.user_id = u.id LIMIT 1) AS officer_name
       FROM users u
       LEFT JOIN venue_contacts vc ON vc.user_id = u.id AND u.role = 'venue'
       LEFT JOIN security_venues sv ON sv.user_id = u.id AND u.role = 'security'
       LEFT JOIN venues v ON v.id = COALESCE(vc.venue_id, sv.venue_id)
      WHERE NOT u.system AND ($1::text IS NULL OR u.role = $1)
      GROUP BY u.id ORDER BY u.role, u.name`, [b.role || null]))
    .then((rows) => rows.map((u) => ({ ...u, platform: isPlatformEmail(u.email) })))),

  'users.invite': def(CO, async (b, { user }) => {
    required(b, 'email', 'name', 'role');
    b.role = inviteRole(b.email, b.role);
    if (b.role === 'officer') fail(400, 'Invite officers from Staff → Add officer');
    const u = await tx(async (t) => {
      const created = await createInvite(t, b);
      const clientId = await checkClient(t, b.role, b.client_id);
      if (clientId) await t.q('UPDATE users SET client_id = $2 WHERE id = $1', [created.id, clientId]);
      await setVenues(t, created.id, b.role, b.venue_ids);
      return created;
    });
    await audit(user, 'user.invite', 'user', u.id, { role: b.role, client_id: b.client_id || null });
    const { link, emailed } = await sendInviteMail(u);
    return { id: u.id, invite_link: link, emailed };
  }),

  'users.update': def(CO, async (b, { user }) => {
    required(b, 'id');
    if (b.id === user.id && b.status === 'disabled') fail(400, "You can't disable yourself");
    const target = await one('SELECT email FROM users WHERE id = $1', [b.id]);
    // Only the platform admin changes their own account (access, venues, pay, status); nobody gives another account their email
    guardPlatformAccount(user, target?.email, b.email);
    const fields = pick(b, ['name', 'goes_by', 'phone', 'can_see_pay', 'email']);
    if (fields.goes_by !== undefined) fields.goes_by = goesBy(fields.goes_by);
    if (b.status === 'disabled' || b.status === 'active') fields.status = b.status;
    if (fields.name !== undefined && String(fields.name).trim().length < 2) fail(400, 'Enter a name');
    if (fields.email !== undefined) {
      fields.email = String(fields.email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email)) fail(400, 'Enter a valid email');
      const cur = await one('SELECT role, email FROM users WHERE id = $1', [b.id]);
      if (cur?.role === 'officer' && cur.email !== fields.email) fail(400, "Change an officer's email on their staff profile");
      if (await one('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [fields.email, b.id])) fail(409, 'A user with this email already exists');
    }
    const u = await tx(async (t) => {
      if ('client_id' in b) {
        const cur = await t.one('SELECT role FROM users WHERE id = $1', [b.id]);
        if (!cur) fail(404, 'User not found');
        fields.client_id = await checkClient(t, cur.role, b.client_id);
      }
      const keys = Object.keys(fields);
      const row = keys.length
        ? await t.one(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [b.id, ...keys.map((k) => fields[k])])
        : await t.one('SELECT * FROM users WHERE id = $1', [b.id]);
      if (!row) fail(404, 'User not found');
      // A linked staff record (an officer, or a manager who also works shifts) carries the same name, phone and email
      if (fields.name !== undefined || fields.goes_by !== undefined || fields.phone !== undefined || fields.email !== undefined) {
        const cut = row.name.lastIndexOf(' ');
        await t.q('UPDATE officers SET first_name = $2, last_name = $3, phone = $4, email = $5, goes_by = $6 WHERE user_id = $1',
          [row.id, cut > 0 ? row.name.slice(0, cut) : row.name, cut > 0 ? row.name.slice(cut + 1) : '', row.phone || '', row.email, row.goes_by || '']);
      }
      // A disabled manager's staff record stays, without a login (it can be invited again as an officer)
      if (fields.status === 'disabled' && row.role !== 'officer') {
        const o = await t.one('UPDATE officers SET user_id = NULL WHERE user_id = $1 RETURNING id', [row.id]);
        if (o) await audit(user, 'user.works_shifts', 'user', row.id, { on: false, officer_id: o.id, reason: 'disabled' });
      }
      await setVenues(t, row.id, row.role, b.venue_ids);
      return row;
    });
    // Their own mailboxes go with them; shared ones stay with the people they are shared with
    if (fields.status === 'disabled') await disconnectUser(u.id);
    await audit(user, 'user.update', 'user', u.id, fields);
    return { ok: true };
  }),

  'users.resetLink': def(CO, async (b, { user }) => {
    const target = await one('SELECT email, status FROM users WHERE id = $1', [b.id]);
    if (resetGuardNeeded(target?.status)) guardPlatformAccount(user, target?.email);
    const token = randomToken();
    const u = await one("UPDATE users SET reset_token = $2, reset_expires = now() + interval '48 hours' WHERE id = $1 RETURNING id, status, invite_token", [b.id, token]);
    if (!u) fail(404, 'User not found');
    await audit(user, 'user.reset_link', 'user', u.id);
    if (u.status === 'invited') return { link: `/app/invite/${u.invite_token}` };
    return { link: `/app/reset/${token}` };
  }),

  'users.resendInvite': def(CO, async (b) => {
    const u = await one("SELECT * FROM users WHERE id = $1 AND status = 'invited'", [b.id]);
    if (!u) fail(404, 'No pending invite');
    const { link, emailed, sent_at } = await sendInviteMail(u);
    return { invite_link: link, emailed, sent_at };
  }),

  // A company or security manager who also works shifts: create or link their staff record (one login, two sides)
  'users.setWorksShifts': def(CO, async (b, { user }) => {
    required(b, 'id');
    const u = await one("SELECT * FROM users WHERE id = $1 AND NOT system", [b.id]);
    if (!u) fail(404, 'User not found');
    guardPlatformAccount(user, u.email);
    if (!['company', 'security'].includes(u.role)) fail(400, 'Only company and security managers can also work shifts');
    const linked = await one('SELECT id FROM officers WHERE user_id = $1', [u.id]);
    if (!b.on) {
      if (!linked) return { ok: true };
      await q('UPDATE officers SET user_id = NULL WHERE id = $1', [linked.id]);
      await audit(user, 'user.works_shifts', 'user', u.id, { on: false, officer_id: linked.id });
      return { ok: true };
    }
    if (linked) return { ok: true, officer_id: linked.id };
    const officerId = await tx(async (t) => {
      if (b.officer_id) {
        const o = await t.one('SELECT id, user_id FROM officers WHERE id = $1 FOR UPDATE', [b.officer_id]);
        if (!o) fail(404, 'Staff record not found');
        if (o.user_id) fail(409, 'That staff record already has its own login. Merge it instead.');
        await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, u.id]);
        return o.id;
      }
      // Same email or phone already on the staff list without a login: link that one rather than adding a duplicate
      const same = await t.one('SELECT id FROM officers WHERE lower(email) = $1 AND user_id IS NULL LIMIT 1', [u.email]);
      if (same) {
        await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [same.id, u.id]);
        return same.id;
      }
      const cut = u.name.lastIndexOf(' ');
      const o = await t.one(
        `INSERT INTO officers (first_name, last_name, email, phone, status, user_id, goes_by) VALUES ($1,$2,$3,$4,'active',$5,$6) RETURNING id`,
        [cut > 0 ? u.name.slice(0, cut) : u.name, cut > 0 ? u.name.slice(cut + 1) : '', u.email, u.phone || '', u.id, u.goes_by || '']);
      await seedOnboarding(t, o.id);
      return o.id;
    });
    await audit(user, 'user.works_shifts', 'user', u.id, { on: true, officer_id: officerId });
    return { ok: true, officer_id: officerId };
  }),

  // Someone who had a second email just for the officer app: move their staff record onto the manager login
  'users.mergeOfficerLogin': def(CO, async (b, { user }) => {
    required(b, 'manager_id', 'officer_user_id');
    const m = await one("SELECT * FROM users WHERE id = $1 AND role IN ('company','security') AND status IN ('active','invited') AND NOT system", [b.manager_id]);
    if (!m) fail(404, 'Manager login not found');
    const ou = await one("SELECT * FROM users WHERE id = $1 AND role = 'officer'", [b.officer_user_id]);
    if (!ou) fail(404, 'Officer login not found');
    guardPlatformAccount(user, m.email, ou.email);
    if (await one('SELECT 1 FROM officers WHERE user_id = $1', [m.id])) fail(409, 'This manager already has a staff record');
    const o = await one('SELECT id FROM officers WHERE user_id = $1', [ou.id]);
    if (!o) fail(400, 'That officer login has no staff record');
    await tx(async (t) => {
      await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, m.id]);
      await t.q("UPDATE users SET status = 'disabled', invite_token = NULL, reset_token = NULL, reset_expires = NULL WHERE id = $1", [ou.id]);
      // Their inbox, conversations, phone notifications and saved toolbox cards come with them
      await t.q('UPDATE notifications SET user_id = $2 WHERE user_id = $1', [ou.id, m.id]);
      await t.q('UPDATE push_subscriptions SET user_id = $2 WHERE user_id = $1', [ou.id, m.id]);
      await t.q('UPDATE conversation_members c SET user_id = $2 WHERE user_id = $1 AND NOT EXISTS (SELECT 1 FROM conversation_members x WHERE x.conversation_id = c.conversation_id AND x.user_id = $2)', [ou.id, m.id]);
      await t.q('DELETE FROM conversation_members WHERE user_id = $1', [ou.id]);
      await t.q('INSERT INTO toolbox_favourites (user_id, card_id) SELECT $2, card_id FROM toolbox_favourites WHERE user_id = $1 ON CONFLICT DO NOTHING', [ou.id, m.id]);
      await t.q('DELETE FROM toolbox_favourites WHERE user_id = $1', [ou.id]);
    });
    await audit(user, 'user.merge_officer', 'user', m.id, { officer_user: ou.id, officer_email: ou.email, officer_id: o.id });
    return { ok: true, officer_id: o.id };
  }),

  'users.managers': def(ALL, async () => q("SELECT id, name, role FROM users WHERE role IN ('company','security') AND status = 'active' ORDER BY name")),

  'audit.list': def(CO, async (b) => q(
    `SELECT a.*, ${userName('u')} AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE ($1::text IS NULL OR a.entity = $1) AND ($2::text IS NULL OR a.entity_id = $2)
      ORDER BY a.created_at DESC LIMIT $3`, [b.entity || null, b.entity_id || null, Math.min(b.limit || 200, 500)])),
};
