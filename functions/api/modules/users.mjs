import { one, q, tx } from '../lib/db.mjs';
import { fail, required, pick, need } from '../lib/http.mjs';
import { goesBy, randomToken } from '../lib/auth.mjs';
import { sendRawEmail, emailHtml, notify } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { photoUrls } from '../lib/storage.mjs';
import { CO, ALL, def } from './_def.mjs';
import { getBrand } from '../lib/brand.mjs';
import { seedOnboarding } from './hr.mjs';
import { disconnectUser } from './email.mjs';
import { officerName, userName } from '../lib/names.mjs';
import { guardPlatformAccount, inviteRole, isPlatformEmail } from '../lib/platform.mjs';
import { accessChanges, blocksLastCompanyManager } from '../lib/access.mjs';
import { LAST_MANAGER, appsGained, appsLine, appsOf, planAccess } from '../lib/apps.mjs';

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
export async function sendInviteMail(u, actor = null) {
  const { name } = await getBrand();
  const emailed = await sendRawEmail(u.email, `You're invited to ${name}`,
    await emailHtml(`Welcome, ${u.name}`, `You've been invited to ${name} as a ${ROLE_LABEL[u.role]}. Set your password to get started.`, `/invite/${u.invite_token}`));
  const sent = await one('UPDATE users SET invite_sent_at = now(), invite_emailed = $2 WHERE id = $1 RETURNING invite_sent_at', [u.id, emailed]);
  await audit(actor, 'user.invite_sent', 'user', u.id, { emailed });
  return { link: `/app/invite/${u.invite_token}`, emailed, sent_at: sent?.invite_sent_at || null };
}
export const sendInvite = async (u, actor = null) => (await sendInviteMail(u, actor)).link;

// A pending invite link works once, so anyone may share it; an active platform admin account is never reset by others
export const resetGuardNeeded = (status) => status !== 'invited';

export async function setVenues(t, userId, role, venueIds) {
  if (!Array.isArray(venueIds)) return;
  const table = role === 'venue' ? 'venue_contacts' : role === 'security' ? 'security_venues' : null;
  if (!table) return;
  await t.q(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  for (const v of venueIds) await t.q(`INSERT INTO ${table} (venue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [v, userId]);
}

// The names of the venues a venue or security manager can see, for the audit of what they gained or lost
async function venueNames(t, userId) {
  return (await t.q(`SELECT v.name FROM venues v WHERE v.id IN (SELECT venue_id FROM venue_contacts WHERE user_id = $1 UNION SELECT venue_id FROM security_venues WHERE user_id = $1) ORDER BY v.name`, [userId])).map((r) => r.name);
}

// Venue and security managers can be a client's contact; anyone else carries no client
async function checkClient(t, role, clientId) {
  if (!clientId || !['venue', 'security'].includes(role)) return null;
  if (!(await t.one('SELECT 1 FROM clients WHERE id = $1', [clientId]))) fail(400, 'Client not found');
  return clientId;
}

// The login list and one login: role, client, venues, the invite's last email, and the staff record behind it
async function userRows(where, params) {
  const rows = await q(
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
      WHERE NOT u.system AND ${where}
      GROUP BY u.id ORDER BY u.role, u.name`, params);
  return (await withPhotos(rows)).map((u) => ({ ...u, platform: isPlatformEmail(u.email) }));
}

// Active company managers other than this one, the platform admin left out
async function otherCompanyManagers(id) {
  const others = await q("SELECT email FROM users WHERE role = 'company' AND status = 'active' AND NOT system AND id <> $1", [id]);
  return others.filter((x) => !isPlatformEmail(x.email)).length;
}

/** The rules for switching someone's app access off, the same from every screen: not yourself, not the platform
 *  admin (unless it is them), and never the last active company manager. */
export async function assertCanDisable(actor, target) {
  if (!target) fail(404, 'User not found');
  if (target.id === actor.id) fail(400, "You can't disable yourself");
  guardPlatformAccount(actor, target.email);
  if (target.role === 'company' && blocksLastCompanyManager({ target: { ...target, platform: isPlatformEmail(target.email) }, status: 'disabled', otherActive: await otherCompanyManagers(target.id) })) fail(400, LAST_MANAGER);
}

/** Switch a login off or back on: a disabled manager's staff record is unlinked, their mailboxes disconnected, and it is audited */
export async function setLoginStatus(actor, id, status, extra = {}) {
  const target = await one('SELECT * FROM users WHERE id = $1', [id]);
  if (status === 'disabled') await assertCanDisable(actor, target);
  else guardPlatformAccount(actor, need(target, 'User not found').email);
  if (target.status === status) return { ok: true };
  await tx(async (t) => {
    await t.q('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
    if (status === 'disabled' && target.role !== 'officer') {
      const o = await t.one('UPDATE officers SET user_id = NULL WHERE user_id = $1 RETURNING id', [id]);
      if (o) await audit(actor, 'user.works_shifts', 'user', id, { on: false, officer_id: o.id, reason: 'disabled' });
    }
  });
  if (status === 'disabled') await disconnectUser(id);
  await audit(actor, 'user.update', 'user', id, { status, before: { status: target.status }, ...extra });
  return { ok: true };
}

/** Give a manager login a staff record: the one named, else one with the same email and no login, else a new one */
export async function linkStaffRecord(t, u, officerId = null) {
  if (officerId) {
    const o = await t.one('SELECT id, user_id FROM officers WHERE id = $1 FOR UPDATE', [officerId]);
    if (!o) fail(404, 'Staff record not found');
    if (o.user_id) fail(409, 'That staff record already has its own login. Merge it instead.');
    await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, u.id]);
    return o.id;
  }
  // Same email already on the staff list without a login: link that one rather than adding a duplicate
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
}

/** A staff record without a login gets one: the Officer app, plus a manager access if ticked. The invite is sent only on request. */
async function giveLogin(actor, o, want, b) {
  const plan = rule(() => planAccess({ before: appsOf(null), want, hasLogin: false, fromStaffRecord: true }));
  if (!o.email) fail(400, 'Add their email on Overview first');
  const taken = await one('SELECT id, name FROM users WHERE email = lower($1)', [o.email.trim()]);
  if (taken) fail(409, `${taken.name} already signs in with this email`, { existing: { user_id: taken.id, name: taken.name } });
  const role = inviteRole(o.email, plan.role);
  const u = await tx(async (t) => {
    const created = await createInvite(t, { email: o.email, name: `${o.first_name} ${o.last_name}`.trim(), role, phone: o.phone || '', goes_by: o.goes_by || '',
      can_see_pay: role === 'security' && !!b.can_see_pay });
    const clientId = await checkClient(t, role, b.client_id);
    if (clientId) await t.q('UPDATE users SET client_id = $2 WHERE id = $1', [created.id, clientId]);
    await setVenues(t, created.id, role, b.venue_ids || []);
    await t.q('UPDATE officers SET user_id = $2 WHERE id = $1', [o.id, created.id]);
    return created;
  });
  await audit(actor, 'user.invite', 'user', u.id, { email: u.email, role, officer_id: o.id });
  await audit(actor, 'user.access', 'user', u.id, { role, apps: appsLine({ ...want }), ...appsGained(appsOf(null), want), officer_id: o.id });
  if (!b.invite) return { ok: true, user_id: u.id, officer_id: o.id, invite_link: `/app/invite/${u.invite_token}`, emailed: false };
  const { link, emailed, sent_at } = await sendInviteMail(u, actor);
  return { ok: true, user_id: u.id, officer_id: o.id, invite_link: link, emailed, sent_at };
}

// The ticks' rules (lib/apps.mjs) speak as plain errors; here they become the API's 400s
const rule = (fn) => { try { return fn(); } catch (e) { return fail(e.status || 400, e.message); } };

const withPhotos = (rows) => Promise.all(rows.map(async ({ photo_key, ...u }) => ({ ...u, ...(await photoUrls(photo_key)) })));

// The audited record's name, looked up only when the id is a uuid (some entries carry other keys)
const AUDIT_RECORD_NAME = `CASE WHEN a.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN CASE a.entity
    WHEN 'officer' THEN (SELECT ${officerName('o')} FROM officers o WHERE o.id = a.entity_id::uuid)
    WHEN 'user' THEN (SELECT ${userName('x')} FROM users x WHERE x.id = a.entity_id::uuid)
    WHEN 'venue' THEN (SELECT v.name FROM venues v WHERE v.id = a.entity_id::uuid)
    WHEN 'invoice' THEN (SELECT COALESCE(NULLIF(i.number, ''), 'draft') || ' · ' || v.name FROM invoices i JOIN venues v ON v.id = i.venue_id WHERE i.id = a.entity_id::uuid)
    WHEN 'statement' THEN (SELECT COALESCE(NULLIF(st.number, ''), 'draft') || ' · ' || ${officerName('o')} FROM statements st JOIN officers o ON o.id = st.officer_id WHERE st.id = a.entity_id::uuid)
    WHEN 'incident' THEN (SELECT i.ref FROM incidents i WHERE i.id = a.entity_id::uuid)
    WHEN 'document' THEN (SELECT d.title FROM documents d WHERE d.id = a.entity_id::uuid)
    WHEN 'contract' THEN (SELECT c.title FROM contracts c WHERE c.id = a.entity_id::uuid)
    WHEN 'shift' THEN (SELECT v.name || ' · ' || to_char(s.starts_at AT TIME ZONE 'Europe/London', 'Dy DD Mon') FROM shifts s JOIN venues v ON v.id = s.venue_id WHERE s.id = a.entity_id::uuid)
    WHEN 'timesheet' THEN (SELECT ${officerName('o')} || ' · ' || v.name || ' · ' || to_char(s.starts_at AT TIME ZONE 'Europe/London', 'Dy DD Mon') FROM timesheets t JOIN shift_assignments sa ON sa.id = t.assignment_id
      JOIN shifts s ON s.id = sa.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = sa.officer_id WHERE t.id = a.entity_id::uuid)
    WHEN 'assignment' THEN (SELECT ${officerName('o')} || ' · ' || v.name || ' · ' || to_char(s.starts_at AT TIME ZONE 'Europe/London', 'Dy DD Mon') FROM shift_assignments sa
      JOIN shifts s ON s.id = sa.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = sa.officer_id WHERE sa.id = a.entity_id::uuid)
  END END`;

// With related: the records that belong to the one asked for, so a page's History shows its parts too
// (an officer's documents, contracts, statements and HR notes; a shift's assignments and timesheets). Ids stay as $2.
export const RELATED = {
  officer: [
    ['document', "SELECT id::text FROM documents WHERE owner_type = 'officer' AND owner_id = $2::uuid"],
    ['contract', 'SELECT id::text FROM contracts WHERE officer_id = $2::uuid'],
    ['statement', 'SELECT id::text FROM statements WHERE officer_id = $2::uuid'],
    ['hr_note', 'SELECT id::text FROM hr_notes WHERE officer_id = $2::uuid'],
  ],
  shift: [
    ['assignment', 'SELECT id::text FROM shift_assignments WHERE shift_id = $2::uuid'],
    ['timesheet', 'SELECT t.id::text FROM timesheets t JOIN shift_assignments sa ON sa.id = t.assignment_id WHERE sa.shift_id = $2::uuid'],
  ],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The WHERE clause for audit.list: one record ($1 entity, $2 id), and with related its child records. */
export function auditWhere(b) {
  const parts = b.related && RELATED[b.entity] && UUID.test(String(b.entity_id || '')) ? RELATED[b.entity] : [];
  const own = '($1::text IS NULL OR a.entity = $1) AND ($2::text IS NULL OR a.entity_id = $2)';
  if (!parts.length) return own;
  return `((${own}) OR ${parts.map(([e, sql]) => `(a.entity = '${e}' AND a.entity_id IN (${sql}))`).join(' OR ')})`;
}

export const actions = {
  'users.list': def(CO, async (b) => userRows('($1::text IS NULL OR u.role = $1)', [b.role || null])),

  // One login as in the list, for a person's page when they have no staff record
  'users.get': def(CO, async (b) => {
    required(b, 'id');
    return need((await userRows('u.id = $1::uuid', [b.id]))[0], 'User not found');
  }),

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
    const target = await one('SELECT * FROM users WHERE id = $1', [b.id]);
    // Only the platform admin changes their own account (access, venues, pay, status); nobody gives another account their email
    guardPlatformAccount(user, target?.email, b.email);
    // Someone must stay able to run the company: the last active company manager can't be disabled
    if (b.status === 'disabled' && target?.status !== 'disabled') await assertCanDisable(user, target);
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
    let venuesBefore = [];
    let venuesAfter = [];
    const u = await tx(async (t) => {
      venuesBefore = await venueNames(t, b.id);
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
      venuesAfter = await venueNames(t, row.id);
      return row;
    });
    // Their own mailboxes go with them; shared ones stay with the people they are shared with
    if (fields.status === 'disabled') await disconnectUser(u.id);
    // The new values as before, plus what each changed field was and the venues gained or lost by name
    await audit(user, 'user.update', 'user', u.id, { ...fields, ...accessChanges(target || {}, fields, venuesBefore, venuesAfter) });
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

  'users.resendInvite': def(CO, async (b, { user }) => {
    const u = await one("SELECT * FROM users WHERE id = $1 AND status = 'invited'", [b.id]);
    if (!u) fail(404, 'No pending invite');
    const { link, emailed, sent_at } = await sendInviteMail(u, user);
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
    const officerId = await tx((t) => linkStaffRecord(t, u, b.officer_id || null));
    await audit(user, 'user.works_shifts', 'user', u.id, { on: true, officer_id: officerId });
    return { ok: true, officer_id: officerId };
  }),

  // The Access tab: tick what a person can use (Officer app, and Office, Security manager or Venue manager), their
  // venues and pay, in one save. The same login carries both; venues move with the access, it is audited and they are told.
  'users.setAccess': def(CO, async (b, { user }) => {
    const want = { officer: !!b.officer, manager: b.manager || null };
    let u = null;
    let linked = null;
    if (b.id) {
      u = need(await one('SELECT * FROM users WHERE id = $1 AND NOT system', [b.id]), 'User not found');
      linked = await one('SELECT id FROM officers WHERE user_id = $1', [u.id]);
    } else {
      required(b, 'officer_id');
      linked = need(await one('SELECT * FROM officers WHERE id = $1', [b.officer_id]), 'Staff record not found');
      if (linked.user_id) u = await one('SELECT * FROM users WHERE id = $1', [linked.user_id]);
    }
    if (!u) return giveLogin(user, linked, want, b);
    guardPlatformAccount(user, u.email);
    if (u.status === 'disabled') fail(400, 'Their app access is switched off. Reactivate them first.');
    const before = appsOf(u, !!linked);
    const lastCompanyManager = u.role === 'company' && u.status === 'active' && !isPlatformEmail(u.email) && (await otherCompanyManagers(u.id)) === 0;
    const plan = rule(() => planAccess({ before, want, isSelf: u.id === user.id, lastCompanyManager }));
    const role = plan.role;
    const canSeePay = role === 'company' ? u.can_see_pay : role === 'security' ? ('can_see_pay' in b ? !!b.can_see_pay : u.can_see_pay) : false;
    let venuesBefore = [];
    let venuesAfter = [];
    let officerId = linked?.id || null;
    let clientId = null;
    await tx(async (t) => {
      venuesBefore = await venueNames(t, u.id);
      const keepIds = (await t.q('SELECT venue_id FROM venue_contacts WHERE user_id = $1 UNION SELECT venue_id FROM security_venues WHERE user_id = $1', [u.id])).map((r) => r.venue_id);
      clientId = await checkClient(t, role, 'client_id' in b ? b.client_id : u.client_id);
      await t.q('UPDATE users SET role = $2, client_id = $3, can_see_pay = $4 WHERE id = $1', [u.id, role, clientId, canSeePay]);
      // Venues follow the access: moving between Security and Venue manager keeps the same venues unless new ones are given
      await t.q('DELETE FROM venue_contacts WHERE user_id = $1', [u.id]);
      await t.q('DELETE FROM security_venues WHERE user_id = $1', [u.id]);
      await setVenues(t, u.id, role, Array.isArray(b.venue_ids) ? b.venue_ids : keepIds);
      if (plan.link === 'link') officerId = await linkStaffRecord(t, { ...u, role }, b.link_officer_id || null);
      if (plan.link === 'unlink') { await t.q('UPDATE officers SET user_id = NULL WHERE user_id = $1', [u.id]); officerId = null; }
      venuesAfter = await venueNames(t, u.id);
    });
    const fields = { role, can_see_pay: canSeePay, client_id: clientId };
    const changes = accessChanges(u, fields, venuesBefore, venuesAfter);
    if (!plan.changed && !Object.keys(changes).length) return { ok: true, officer_id: officerId, changed: false };
    const after = { ...want, venues: venuesAfter, can_see_pay: canSeePay };
    await audit(user, 'user.access', 'user', u.id, { ...fields, apps: appsLine(after), ...appsGained(before, want), officer_id: linked?.id || officerId, ...changes });
    if (u.status === 'active') await notify([u.id], { kind: 'hr', title: 'Your access changed', body: `You can now use: ${appsLine(after)}.` });
    return { ok: true, officer_id: officerId, changed: true };
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

  // record_name: the name or number of the record (an invoice number, a person, a venue), when it still exists
  // related: true adds the record's parts (see RELATED); offset pages through a record's History
  'audit.list': def(CO, async (b) => q(
    `SELECT a.*, ${userName('u')} AS user_name, ${AUDIT_RECORD_NAME} AS record_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE ${auditWhere(b)}
      ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`, [b.entity || null, b.entity_id || null, Math.min(b.limit || 200, 500), Math.max(Number(b.offset) || 0, 0)])),

  // How many entries a record's History has (with its parts), for the collapsed "History · N changes" line
  'audit.count': def(CO, async (b) => {
    required(b, 'entity', 'entity_id');
    return one(`SELECT count(*)::int AS n FROM audit_log a WHERE ${auditWhere(b)}`, [b.entity, String(b.entity_id)]);
  }),
};
