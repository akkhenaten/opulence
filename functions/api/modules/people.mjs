// A person is one page, whether they have a staff record, a login or both: find the page for any id, and add anyone
// (an officer, an applicant, an office or venue manager) from one sheet. The rules for each app live in lib/apps.mjs.
import { one, tx, insert } from '../lib/db.mjs';
import { fail, required, pick } from '../lib/http.mjs';
import { goesBy } from '../lib/auth.mjs';
import { audit } from '../lib/audit.mjs';
import { assertOfficerAccess } from '../lib/scope.mjs';
import { inviteRole } from '../lib/platform.mjs';
import { MANAGER_ROLES } from '../lib/apps.mjs';
import { CO, MGR, def } from './_def.mjs';
import { createInvite, sendInviteMail, setVenues } from './users.mjs';
import { MANAGER_FIELDS, assertNotDuplicate } from './officers.mjs';
import { seedOnboarding } from './hr.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who already has this email: a login (with its staff record) or a staff record without one */
export async function existingByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  const u = await one(
    `SELECT u.id AS user_id, u.name, u.role, u.status, (SELECT o.id FROM officers o WHERE o.user_id = u.id LIMIT 1) AS officer_id
       FROM users u WHERE u.email = $1 AND NOT u.system`, [e]);
  if (u) return { ...u, can_add_officer: !u.officer_id && ['company', 'security'].includes(u.role) && u.status !== 'disabled' };
  const o = await one(`SELECT id AS officer_id, trim(first_name || ' ' || last_name) AS name FROM officers WHERE lower(email) = $1 LIMIT 1`, [e]);
  return o ? { ...o, user_id: null, can_add_officer: false } : null;
}

export const actions = {
  // Any id to the person's page: a staff record's id, or a login's (which goes to its staff record when it has one)
  'people.resolve': def(MGR, async (b, { user }) => {
    required(b, 'id');
    if (!UUID.test(b.id)) fail(404, 'Person not found');
    const o = await one('SELECT id, user_id FROM officers WHERE id = $1', [b.id]);
    const u = o ? null : await one('SELECT u.id, (SELECT o.id FROM officers o WHERE o.user_id = u.id LIMIT 1) AS officer_id FROM users u WHERE u.id = $1 AND NOT u.system', [b.id]);
    if (!o && !u) fail(404, 'Person not found');
    const officerId = o ? o.id : u.officer_id;
    if (officerId) {
      await assertOfficerAccess(user, officerId);
      return { officer_id: officerId, user_id: o ? o.user_id : u.id };
    }
    if (user.role !== 'company') fail(403, 'Only company managers can open this page');
    return { officer_id: null, user_id: u.id };
  }),

  // Add person: a staff record, a login, or both, from one sheet. The invite goes out only with "Create and send invite".
  'people.add': def(CO, async (b, { user }) => {
    required(b, 'first_name', 'last_name');
    const manager = b.manager || null;
    if (manager && !MANAGER_ROLES.includes(manager)) fail(400, 'Pick Office, Security manager or Venue manager');
    if (manager === 'venue' && b.officer) fail(400, 'Venue managers use their own portal, so untick Officer app first');
    const email = String(b.email || '').trim().toLowerCase();
    const login = !!(manager || b.officer);
    if (login && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter their email so they can sign in');
    // One email, one person: say who has it so the screen can open their page (or add the Officer app to a manager)
    const existing = await existingByEmail(email);
    if (existing) fail(409, `${existing.name} already uses this email`, { existing });
    const staffRecord = !manager || !!b.officer;
    if (staffRecord && b.sia_number) await assertNotDuplicate({ one }, { email: '', sia_number: b.sia_number });
    const name = `${b.first_name} ${b.last_name}`.trim();
    const role = manager ? inviteRole(email, manager) : 'officer';
    const res = await tx(async (t) => {
      let u = null;
      if (login) {
        u = await createInvite(t, { email, name, role, phone: b.phone || '', goes_by: b.goes_by || '', can_see_pay: role === 'security' && !!b.can_see_pay });
        if (['venue', 'security'].includes(role) && b.client_id) {
          if (!(await t.one('SELECT 1 FROM clients WHERE id = $1', [b.client_id]))) fail(400, 'Client not found');
          await t.q('UPDATE users SET client_id = $2 WHERE id = $1', [u.id, b.client_id]);
        }
        await setVenues(t, u.id, role, b.venue_ids || []);
      }
      let o = null;
      if (staffRecord) {
        const f = pick(b, MANAGER_FIELDS);
        f.email = email;
        if (f.goes_by !== undefined) f.goes_by = goesBy(f.goes_by);
        o = await insert('officers', { ...f, status: b.status === 'applicant' ? 'applicant' : 'active', user_id: u?.id || null }, t);
        await seedOnboarding(t, o.id);
      }
      return { u, o };
    });
    if (res.o) await audit(user, 'officer.create', 'officer', res.o.id, res.u ? { linked_user: res.u.id } : undefined);
    if (res.u) await audit(user, 'user.invite', 'user', res.u.id, { email, role, officer_id: res.o?.id || null });
    const out = { ok: true, officer_id: res.o?.id || null, user_id: res.u?.id || null, invite_link: res.u ? `/app/invite/${res.u.invite_token}` : null, emailed: false };
    if (res.u && b.invite) Object.assign(out, await sendInviteMail(res.u, user).then(({ link, emailed, sent_at }) => ({ invite_link: link, emailed, sent_at })));
    return out;
  }),
};
