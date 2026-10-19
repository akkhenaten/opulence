import { one, q, tx } from '../lib/db.mjs';
import { fail, required, pick } from '../lib/http.mjs';
import { randomToken } from '../lib/auth.mjs';
import { sendRawEmail, emailHtml } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { CO, ALL, def } from './_def.mjs';

const ROLE_LABEL = { company: 'Company Manager', security: 'Security Manager', venue: 'Venue Manager', officer: 'Security Officer' };

export async function createInvite(t, { email, name, role, phone = '', can_see_pay = false }) {
  if (await t.one('SELECT 1 FROM users WHERE email = lower($1)', [email.trim()])) fail(409, 'A user with this email already exists');
  const token = randomToken();
  const u = await t.one(
    'INSERT INTO users (email, name, role, phone, can_see_pay, invite_token) VALUES (lower($1),$2,$3,$4,$5,$6) RETURNING *',
    [email.trim(), name.trim(), role, phone, !!can_see_pay, token],
  );
  return u;
}

export async function sendInvite(u) {
  await sendRawEmail(u.email, "You're invited to Orb Security",
    emailHtml(`Welcome, ${u.name}`, `You've been invited to Orb Security as a ${ROLE_LABEL[u.role]}. Set your password to get started.`, `/invite/${u.invite_token}`));
  return `/app/invite/${u.invite_token}`;
}

async function setVenues(t, userId, role, venueIds) {
  if (!Array.isArray(venueIds)) return;
  const table = role === 'venue' ? 'venue_contacts' : role === 'security' ? 'security_venues' : null;
  if (!table) return;
  await t.q(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  for (const v of venueIds) await t.q(`INSERT INTO ${table} (venue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [v, userId]);
}

export const actions = {
  'users.list': def(CO, async (b) => q(
    `SELECT u.id, u.email, u.name, u.phone, u.role, u.status, u.can_see_pay, u.last_login, u.created_at,
            COALESCE(array_agg(DISTINCT v.name) FILTER (WHERE v.name IS NOT NULL), '{}') AS venues,
            COALESCE(array_agg(DISTINCT v.id) FILTER (WHERE v.id IS NOT NULL), '{}') AS venue_ids,
            CASE WHEN u.status = 'invited' THEN '/app/invite/' || u.invite_token END AS invite_link
       FROM users u
       LEFT JOIN venue_contacts vc ON vc.user_id = u.id AND u.role = 'venue'
       LEFT JOIN security_venues sv ON sv.user_id = u.id AND u.role = 'security'
       LEFT JOIN venues v ON v.id = COALESCE(vc.venue_id, sv.venue_id)
      WHERE ($1::text IS NULL OR u.role = $1)
      GROUP BY u.id ORDER BY u.role, u.name`, [b.role || null])),

  'users.invite': def(CO, async (b, { user }) => {
    required(b, 'email', 'name', 'role');
    if (b.role === 'officer') fail(400, 'Invite officers from Staff → Add officer');
    const u = await tx(async (t) => {
      const created = await createInvite(t, b);
      await setVenues(t, created.id, b.role, b.venue_ids);
      return created;
    });
    await audit(user, 'user.invite', 'user', u.id, { role: b.role });
    return { id: u.id, invite_link: await sendInvite(u) };
  }),

  'users.update': def(CO, async (b, { user }) => {
    required(b, 'id');
    if (b.id === user.id && b.status === 'disabled') fail(400, "You can't disable yourself");
    const fields = pick(b, ['name', 'phone', 'can_see_pay']);
    if (b.status === 'disabled' || b.status === 'active') fields.status = b.status;
    const u = await tx(async (t) => {
      const keys = Object.keys(fields);
      const row = keys.length
        ? await t.one(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [b.id, ...keys.map((k) => fields[k])])
        : await t.one('SELECT * FROM users WHERE id = $1', [b.id]);
      if (!row) fail(404, 'User not found');
      await setVenues(t, row.id, row.role, b.venue_ids);
      return row;
    });
    await audit(user, 'user.update', 'user', u.id, fields);
    return { ok: true };
  }),

  'users.resetLink': def(CO, async (b, { user }) => {
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
    return { invite_link: await sendInvite(u) };
  }),

  'users.managers': def(ALL, async () => q("SELECT id, name, role FROM users WHERE role IN ('company','security') AND status = 'active' ORDER BY name")),

  'audit.list': def(CO, async (b) => q(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE ($1::text IS NULL OR a.entity = $1) AND ($2::text IS NULL OR a.entity_id = $2)
      ORDER BY a.created_at DESC LIMIT $3`, [b.entity || null, b.entity_id || null, Math.min(b.limit || 200, 500)])),
};
