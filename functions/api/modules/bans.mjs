// The venue ban register: customers barred from a venue, for a while or for good.
// Anyone on a shift can propose a ban; the shift lead, a manager or the venue confirms it.
import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { assertVenue, venueScope } from '../lib/scope.mjs';
import { notify, managersFor, venueContacts } from '../lib/notify.mjs';
import { downloadUrl, deleteObject } from '../lib/storage.mjs';
import { cleanFiles } from '../lib/files.mjs';
import { addDays, fmtDate, londonDate } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { def } from './_def.mjs';
import { shiftAccess } from './shiftlog.mjs';

const PURGE_DAYS = 90;
const COLS = `b.*, v.name AS venue_name, pu.name AS proposed_by_name, cu.name AS confirmed_by_name, ru.name AS revoked_by_name`;
const FROM = `customer_bans b JOIN venues v ON v.id = b.venue_id LEFT JOIN users pu ON pu.id = b.proposed_by
  LEFT JOIN users cu ON cu.id = b.confirmed_by LEFT JOIN users ru ON ru.id = b.revoked_by`;

const shape = async ({ photo_key, ...b }) => ({ ...b, photo_url: await downloadUrl(photo_key), has_photo: !!photo_key });

export async function activeBans(venueId, { withProposed = false } = {}) {
  // Ended bans drop off at once; the hourly job marks them lapsed
  const rows = await q(`SELECT ${COLS} FROM ${FROM} WHERE b.venue_id = $1 AND b.status IN (${withProposed ? "'active','proposed'" : "'active'"})
      AND (b.ends_on IS NULL OR b.ends_on >= $2)
    ORDER BY b.status = 'proposed' DESC, b.created_at DESC`, [venueId, londonDate(new Date())]);
  return Promise.all(rows.map(shape));
}

/** Officers see the register only for venues they work at (a shift within 30 days either side). */
async function officerVenues(user) {
  return (await q(`SELECT DISTINCT s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
    WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.status = 'published' AND s.starts_at BETWEEN now() - interval '30 days' AND now() + interval '30 days'`,
  [user.officer_id])).map((r) => r.venue_id);
}

/** Leads may confirm bans at a venue where they lead a shift around now. */
async function leadsAt(user, venueId) {
  if (user.role !== 'officer') return false;
  return !!await one(`SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
    WHERE a.officer_id = $1 AND a.is_lead AND a.status IN ('assigned','accepted') AND s.venue_id = $2
      AND now() BETWEEN s.starts_at - interval '1 hour' AND s.ends_at + interval '12 hours'`, [user.officer_id, venueId]);
}

async function loadBan(user, id) {
  const b = need(await one('SELECT * FROM customer_bans WHERE id = $1', [id]), 'Ban not found');
  if (user.role === 'officer') {
    if (!(await officerVenues(user)).includes(b.venue_id)) fail(403, 'Forbidden');
  } else await assertVenue(user, b.venue_id);
  return b;
}

function fields(b, today) {
  const reason = String(b.reason || '').trim().slice(0, 2000);
  if (!reason) fail(400, 'Give a reason for the ban');
  const name = String(b.name || '').trim().slice(0, 200);
  const description = String(b.description || '').trim().slice(0, 2000);
  if (!name && !description) fail(400, 'Add a name or a description so the team can recognise them');
  const starts = b.starts_on || today;
  const ends = b.permanent ? null : b.ends_on || null;
  if (!b.permanent && !ends) fail(400, 'Choose an end date or make it permanent');
  if (ends && ends < starts) fail(400, 'The end date is before the start');
  return { reason, name, description, starts_on: starts, ends_on: ends };
}

async function photoKey(user, b) {
  if (!b.photo?.key) return null;
  return (await cleanFiles(user, [b.photo], 'bans', 1))[0].key;
}

const label = (b) => b.name || b.description.slice(0, 40) || 'Unnamed person';
const length = (b) => (b.ends_on ? `until ${fmtDate(b.ends_on)}` : 'permanent');

export const actions = {
  'bans.list': def(['company', 'security', 'venue', 'officer'], async (b, { user }) => {
    let venues;
    if (user.role === 'officer') venues = await officerVenues(user);
    else venues = await venueScope(user);
    if (b.venue_id && user.role === 'officer' && !venues.includes(b.venue_id)) fail(403, 'Forbidden');
    else if (b.venue_id) await assertVenue(user, b.venue_id);
    const status = ['active', 'proposed', 'lapsed', 'revoked', 'rejected', 'all'].includes(b.status) ? b.status : 'current';
    await lapseDue();
    const rows = await q(
      `SELECT ${COLS} FROM ${FROM}
        WHERE ($1::uuid[] IS NULL OR b.venue_id = ANY($1)) AND ($2::uuid IS NULL OR b.venue_id = $2)
          AND ($3 = 'all' OR ($3 = 'current' AND b.status IN ('active','proposed')) OR b.status = $3)
        ORDER BY b.status = 'proposed' DESC, b.status = 'active' DESC, b.created_at DESC LIMIT 300`,
      [venues, b.venue_id || null, user.role === 'officer' && !['active', 'current'].includes(status) ? 'active' : status]);
    return Promise.all(rows.map(shape));
  }),

  /** From the shift page: someone on the shift proposes; if they lead the shift it is active straight away. */
  'bans.propose': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'shift_id');
    const ax = await shiftAccess(user, b.shift_id);
    if (!ax.canWrite) fail(403, 'You can add bans while the shift is on');
    const today = londonDate(new Date());
    const f = fields(b, today);
    const direct = ax.access === 'lead' || ax.access === 'mgr';
    const key = await photoKey(user, b);
    const ban = await one(
      `INSERT INTO customer_bans (venue_id, name, description, photo_key, reason, starts_on, ends_on, status, proposed_by, confirmed_by, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [ax.sh.venue_id, f.name, f.description, key, f.reason, f.starts_on, f.ends_on, direct ? 'active' : 'proposed', user.id, direct ? user.id : null, direct ? new Date() : null]);
    // It also goes in the shift log so the night's record is complete
    await q('INSERT INTO shift_logs (shift_id) VALUES ($1) ON CONFLICT DO NOTHING', [b.shift_id]);
    const entry = b.entry_id
      ? await one('UPDATE shift_log_entries SET ban_id = $2, kind = \'ban\' WHERE id = $1 AND shift_id = $3 RETURNING id', [b.entry_id, ban.id, b.shift_id])
      : await one('INSERT INTO shift_log_entries (shift_id, author_user_id, kind, body) VALUES ($1,$2,\'ban\',$3) RETURNING id',
        [b.shift_id, user.id, `Ban ${direct ? 'added' : 'proposed'}: ${label(f)} (${length(f)}). ${f.reason}`]);
    if (entry) await q('UPDATE customer_bans SET source_entry_id = $2 WHERE id = $1', [ban.id, entry.id]);
    if (!direct) {
      const lead = await one(`SELECT o.user_id FROM shift_assignments a JOIN officers o ON o.id = a.officer_id WHERE a.shift_id = $1 AND a.is_lead AND a.status IN ('assigned','accepted')`, [b.shift_id]);
      await notify([lead?.user_id, ...await managersFor(ax.sh.venue_id)].filter(Boolean), {
        kind: 'shift', title: 'Ban to confirm', body: `${ax.sh.venue_name}: ${label(f)} (${length(f)}) — ${f.reason.slice(0, 100)}`, link: `/officer/shifts/${b.shift_id}`, dedupe: `ban:${ban.id}`,
      });
    }
    await audit(user, direct ? 'ban.create' : 'ban.propose', 'customer_ban', ban.id, { venue_id: ax.sh.venue_id, shift_id: b.shift_id });
    return shape(ban);
  }),

  'bans.create': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const f = fields(b, londonDate(new Date()));
    const ban = await one(
      `INSERT INTO customer_bans (venue_id, name, description, photo_key, reason, starts_on, ends_on, status, proposed_by, confirmed_by, confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$8,now()) RETURNING *`,
      [b.venue_id, f.name, f.description, await photoKey(user, b), f.reason, f.starts_on, f.ends_on, user.id]);
    const v = await one('SELECT name FROM venues WHERE id = $1', [b.venue_id]);
    const others = [...await managersFor(b.venue_id), ...await venueContacts(b.venue_id)].filter((id) => id !== user.id);
    await notify(others, { kind: 'shift', title: 'New ban', body: `${v.name}: ${label(f)} (${length(f)})`, link: '', dedupe: `ban:${ban.id}` });
    await audit(user, 'ban.create', 'customer_ban', ban.id, { venue_id: b.venue_id });
    return shape(ban);
  }),

  'bans.confirm': def(['officer', 'company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id');
    const ban = await loadBan(user, b.id);
    if (user.role === 'officer' && !await leadsAt(user, ban.venue_id)) fail(403, 'Only the shift lead can confirm bans');
    if (ban.status !== 'proposed') fail(400, 'This ban has already been decided');
    const approve = b.approve !== false;
    const row = await one(
      `UPDATE customer_bans SET status = $2, confirmed_by = $3, confirmed_at = now(), revoked_reason = $4, updated_at = now(),
         photo_purge_after = CASE WHEN $2 = 'rejected' THEN $5::date ELSE photo_purge_after END WHERE id = $1 RETURNING *`,
      [ban.id, approve ? 'active' : 'rejected', user.id, approve ? '' : String(b.reason || '').slice(0, 500), addDays(londonDate(new Date()), 7)]);
    if (ban.proposed_by !== user.id) {
      await notify([ban.proposed_by], { kind: 'shift', title: approve ? 'Ban confirmed' : 'Ban not confirmed', body: `${label(ban)}${approve ? ` (${length(ban)})` : b.reason ? `: ${b.reason}` : ''}`, link: '', dedupe: `bandec:${ban.id}` });
    }
    await audit(user, approve ? 'ban.confirm' : 'ban.reject', 'customer_ban', ban.id, {});
    return shape(row);
  }),

  'bans.update': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id');
    const ban = await loadBan(user, b.id);
    if (!['active', 'proposed'].includes(ban.status)) fail(400, 'Only current bans can be changed');
    const f = fields({ ...ban, ...b, permanent: b.permanent ?? !ban.ends_on, starts_on: b.starts_on || ban.starts_on }, ban.starts_on);
    let key = ban.photo_key;
    if (b.photo === null) key = null;
    else if (b.photo?.key && b.photo.key !== ban.photo_key) key = await photoKey(user, b);
    if (key !== ban.photo_key) await deleteObject(ban.photo_key).catch(() => {});
    const row = await one(
      'UPDATE customer_bans SET name = $2, description = $3, reason = $4, starts_on = $5, ends_on = $6, photo_key = $7, updated_at = now() WHERE id = $1 RETURNING *',
      [ban.id, f.name, f.description, f.reason, f.starts_on, f.ends_on, key]);
    await audit(user, 'ban.update', 'customer_ban', ban.id, {});
    return shape(row);
  }),

  'bans.revoke': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id');
    const ban = await loadBan(user, b.id);
    if (!['active', 'proposed'].includes(ban.status)) fail(400, 'This ban is no longer in force');
    const row = await one(
      `UPDATE customer_bans SET status = 'revoked', revoked_by = $2, revoked_reason = $3, photo_purge_after = $4, updated_at = now() WHERE id = $1 RETURNING *`,
      [ban.id, user.id, String(b.reason || '').trim().slice(0, 500), addDays(londonDate(new Date()), PURGE_DAYS)]);
    await audit(user, 'ban.revoke', 'customer_ban', ban.id, {});
    return shape(row);
  }),
};

/** Daily housekeeping: temporary bans lapse after their end date; photos are deleted 90 days after a ban ends. */
// Also run on every list so the register never shows an ended ban as current
async function lapseDue() {
  const today = londonDate(new Date());
  return q(
    `UPDATE customer_bans SET status = 'lapsed', photo_purge_after = $2, updated_at = now() WHERE status = 'active' AND ends_on < $1 RETURNING id`,
    [today, addDays(today, PURGE_DAYS)]);
}

export async function banJobs() {
  const today = londonDate(new Date());
  const lapsed = await lapseDue();
  const purge = await q('SELECT id, photo_key FROM customer_bans WHERE photo_key IS NOT NULL AND photo_purge_after < $1', [today]);
  for (const r of purge) {
    await deleteObject(r.photo_key).catch(() => {});
    await q('UPDATE customer_bans SET photo_key = NULL WHERE id = $1', [r.id]);
  }
  return lapsed.length + purge.length;
}
