// The shift page: who's on, the lead (head doorman), the shift log and the handover to the next team
import { one, q, tx } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { assertVenue, venueScope } from '../lib/scope.mjs';
import { notify, managersFor, venueContacts, officerUser } from '../lib/notify.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { cleanFiles, signFiles } from '../lib/files.mjs';
import { ensureThread, opsUser } from '../lib/threads.mjs';
import { fmtDate, fmtTime } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { ALL, MGR, def } from './_def.mjs';
import { activeBans, shiftEjections } from './bans.mjs';
import { officerName, userName } from '../lib/names.mjs';

const ACTIVE = "('assigned','accepted')";
const KINDS = ['note', 'handover', 'incident', 'ban', 'ejection'];
const when = (sh) => `${fmtDate(sh.starts_at)} ${fmtTime(sh.starts_at)}–${fmtTime(sh.ends_at)}`;
const PHOTO = 'COALESCE((SELECT o.photo_key FROM officers o WHERE o.user_id = u.id LIMIT 1), u.photo_key)';

/**
 * Who this person is on the shift: 'mgr', 'venue', 'lead' or 'officer'.
 * Officers only see shifts they are booked on; they can write from an hour before the start to six hours after the end.
 */
export async function shiftAccess(user, shiftId) {
  const sh = need(await one(
    `SELECT s.*, v.name AS venue_name, v.address AS venue_address, v.postcode, v.lat, v.lng, v.instructions, v.phone AS venue_phone, r.name AS role_name
       FROM shifts s JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role WHERE s.id = $1`, [shiftId]), 'Shift not found');
  if (user.role === 'officer') {
    const a = await one(`SELECT * FROM shift_assignments WHERE shift_id = $1 AND officer_id = $2 AND status IN ${ACTIVE}`, [shiftId, user.officer_id]);
    if (!a || sh.status !== 'published') fail(403, 'You are not on this shift');
    const now = Date.now();
    const open = now > new Date(sh.starts_at) - 3600e3 && now < +new Date(sh.ends_at) + 6 * 3600e3;
    return { sh, a, access: a.is_lead ? 'lead' : 'officer', canWrite: open };
  }
  await assertVenue(user, sh.venue_id);
  if (user.role === 'venue') {
    if (sh.status !== 'published') fail(404, 'Shift not found');
    return { sh, a: null, access: 'venue', canWrite: false };
  }
  return { sh, a: null, access: 'mgr', canWrite: true };
}

const canCurate = (ax) => ax.access === 'mgr' || (ax.access === 'lead' && ax.canWrite);

export async function shiftThread(sh) {
  const team = (await q(`SELECT o.user_id FROM shift_assignments a JOIN officers o ON o.id = a.officer_id WHERE a.shift_id = $1 AND a.status IN ${ACTIVE} AND o.user_id IS NOT NULL`, [sh.id])).map((r) => r.user_id);
  return ensureThread('shift', sh.id, [...team, ...(await managersFor(sh.venue_id)), await opsUser()], `${sh.venue_name} · ${when(sh)}`);
}

async function getLog(shiftId) {
  return (await one(
    `SELECT l.*, ${userName('u')} AS signed_by_name FROM shift_logs l LEFT JOIN users u ON u.id = l.signed_by WHERE l.shift_id = $1`, [shiftId]))
    || { shift_id: shiftId, status: 'open', handover_summary: '', signed_by: null, signed_at: null };
}

async function entries(shiftId, { keptOnly = false } = {}) {
  const rows = await q(
    `SELECT e.*, ${userName('u')} AS author_name, ${PHOTO} AS author_photo, ${userName('cu')} AS curated_by_name, i.ref AS incident_ref, b.status AS ban_status
       FROM shift_log_entries e JOIN users u ON u.id = e.author_user_id LEFT JOIN users cu ON cu.id = e.curated_by
       LEFT JOIN incidents i ON i.id = e.incident_id LEFT JOIN customer_bans b ON b.id = e.ban_id
      WHERE e.shift_id = $1 ${keptOnly ? "AND e.state = 'kept'" : ''} ORDER BY e.created_at`, [shiftId]);
  return Promise.all(rows.map(async ({ author_photo, ...e }) => ({ ...e, author_photo_url: await downloadUrl(author_photo), photos: await signFiles(e.photos) })));
}

async function ensureLog(shiftId, t = { q }) {
  await t.q('INSERT INTO shift_logs (shift_id) VALUES ($1) ON CONFLICT DO NOTHING', [shiftId]);
}

async function loadEntry(user, id) {
  const e = need(await one('SELECT * FROM shift_log_entries WHERE id = $1', [id]), 'Entry not found');
  const ax = await shiftAccess(user, e.shift_id);
  return { e, ax, log: await getLog(e.shift_id) };
}

export const actions = {
  /** Everything for the shift, shaped for who is asking. */
  'shifts.detail': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const ax = await shiftAccess(user, b.id);
    const { sh } = ax;
    const venue = ax.access === 'venue';
    const team = await q(
      `SELECT a.id AS assignment_id, a.officer_id, a.status, a.is_lead, ${officerName('o')} AS name, o.photo_key, o.phone, o.roles, o.user_id,
              (SELECT min(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual')) AS clocked_in,
              (SELECT max(ts) FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'out' AND ce.status IN ('ok','approved','manual')) AS clocked_out
         FROM shift_assignments a JOIN officers o ON o.id = a.officer_id
        WHERE a.shift_id = $1 AND a.status IN ${ACTIVE} ORDER BY a.is_lead DESC, o.first_name`, [sh.id]);
    const log = await getLog(sh.id);
    const prev = await one(
      `SELECT s.id AS shift_id, s.starts_at, s.ends_at, l.handover_summary, l.signed_at, ${userName('u')} AS signed_by_name
         FROM shifts s JOIN shift_logs l ON l.shift_id = s.id LEFT JOIN users u ON u.id = l.signed_by
        WHERE s.venue_id = $1 AND s.id <> $2 AND l.status = 'signed' AND s.starts_at < $3 ORDER BY s.starts_at DESC LIMIT 1`, [sh.venue_id, sh.id, sh.starts_at]);
    const showEntries = !venue || log.status === 'signed';
    const thread = venue ? null : await shiftThread(sh);
    const clock = ax.a ? await q('SELECT kind, ts, status FROM clock_events WHERE assignment_id = $1 ORDER BY ts', [ax.a.id]) : [];
    return {
      shift: {
        id: sh.id, venue_id: sh.venue_id, venue_name: sh.venue_name, venue_address: sh.venue_address, postcode: sh.postcode, lat: sh.lat, lng: sh.lng,
        venue_phone: sh.venue_phone, instructions: sh.instructions, role: sh.role, role_name: sh.role_name, starts_at: sh.starts_at, ends_at: sh.ends_at,
        break_minutes: sh.break_minutes, headcount: sh.headcount, notes: sh.notes, status: sh.status,
      },
      me: { access: ax.access, can_write: ax.canWrite && log.status === 'open' || ax.access === 'mgr', can_curate: canCurate(ax), assignment_id: ax.a?.id || null, assignment_status: ax.a?.status || null, is_lead: !!ax.a?.is_lead, clock },
      team: await Promise.all(team.map(async ({ photo_key, phone, roles, user_id, ...m }) => ({
        ...m, photo_url: await downloadUrl(photo_key), head_door: (roles || []).includes('head_door'), ...(venue ? {} : { phone, user_id }),
      }))),
      log,
      entries: showEntries ? await entries(sh.id, { keptOnly: venue }) : [],
      previous_handover: prev,
      bans: await activeBans(sh.venue_id, { withProposed: ax.access !== 'venue' }),
      ejections: await shiftEjections(sh.id),
      thread_id: thread?.id || null,
    };
  }),

  /** One lead per shift. The head doorman role is expected but the manager may choose anyone on the shift. */
  'shifts.setLead': def(MGR, async (b, { user }) => {
    required(b, 'shift_id');
    const ax = await shiftAccess(user, b.shift_id);
    let a = null;
    await tx(async (t) => {
      await t.q('UPDATE shift_assignments SET is_lead = false WHERE shift_id = $1 AND is_lead', [b.shift_id]);
      if (b.assignment_id) {
        a = need(await t.one(`UPDATE shift_assignments SET is_lead = true WHERE id = $1 AND shift_id = $2 AND status IN ${ACTIVE} RETURNING *`, [b.assignment_id, b.shift_id]), 'That person is not on this shift');
      }
    });
    let warning = null;
    if (a) {
      const o = await one('SELECT first_name, roles FROM officers WHERE id = $1', [a.officer_id]);
      if (!(o.roles || []).includes('head_door')) warning = `${o.first_name} isn't set up as a Head Doorman. They can still lead this shift.`;
      await notify(await officerUser(a.officer_id), {
        kind: 'shift', title: 'You are leading this shift', body: `${ax.sh.venue_name} · ${when(ax.sh)}. You look after the shift log and sign off the handover.`,
        link: `/officer/shifts/${ax.sh.id}`, dedupe: `lead:${a.id}`,
      });
    }
    await audit(user, 'shift.set_lead', 'shift', b.shift_id, { assignment_id: b.assignment_id || null });
    return { ok: true, warning };
  }),

  // ---------- Shift log ----------
  'shiftlog.add': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'shift_id');
    const ax = await shiftAccess(user, b.shift_id);
    if (!ax.canWrite) fail(403, 'The log opens an hour before the shift and closes six hours after it ends');
    const log = await getLog(b.shift_id);
    if (log.status === 'signed' && ax.access !== 'mgr') fail(400, 'This log has been signed off');
    const kind = KINDS.includes(b.kind) ? b.kind : 'note';
    const body = String(b.body || '').trim().slice(0, 4000);
    const photos = await cleanFiles(user, b.photos, 'shiftlog');
    if (!body && !photos.length) fail(400, 'Write a note or add a photo');
    await ensureLog(b.shift_id);
    const e = await one('INSERT INTO shift_log_entries (shift_id, author_user_id, kind, body, photos) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [b.shift_id, user.id, kind, body, JSON.stringify(photos)]);
    await audit(user, 'shiftlog.add', 'shift', b.shift_id, { entry_id: e.id, kind });
    return e;
  }),

  'shiftlog.update': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'id');
    const { e, ax, log } = await loadEntry(user, b.id);
    if (e.author_user_id !== user.id) fail(403, 'You can only edit your own notes');
    if (log.status === 'signed' || !ax.canWrite) fail(400, 'This log can no longer be changed');
    const body = String(b.body ?? e.body).trim().slice(0, 4000);
    const photos = b.photos === undefined ? e.photos : [...(e.photos || []).filter((p) => b.photos.some((x) => x.key === p.key)), ...await cleanFiles(user, b.photos.filter((x) => !(e.photos || []).some((p) => p.key === x.key)), 'shiftlog')];
    if (!body && !photos.length) fail(400, 'Write a note or add a photo');
    return one('UPDATE shift_log_entries SET body = $2, photos = $3, kind = COALESCE($4, kind), updated_at = now() WHERE id = $1 RETURNING *',
      [e.id, body, JSON.stringify(photos), KINDS.includes(b.kind) ? b.kind : null]);
  }),

  /** The lead decides what stays in the final log; removed notes are kept for managers but hidden from the venue. */
  'shiftlog.curate': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'id', 'state');
    if (!['kept', 'removed'].includes(b.state)) fail(400, 'Choose keep or remove');
    const { e, ax, log } = await loadEntry(user, b.id);
    if (!canCurate(ax)) fail(403, 'Only the shift lead or a manager can tidy the log');
    if (log.status === 'signed' && ax.access !== 'mgr') fail(400, 'This log has been signed off');
    const body = b.body === undefined ? e.body : String(b.body).trim().slice(0, 4000);
    const row = await one('UPDATE shift_log_entries SET state = $2, body = $3, curated_by = $4, curated_at = now(), updated_at = now() WHERE id = $1 RETURNING *',
      [e.id, b.state, body, user.id]);
    await audit(user, 'shiftlog.curate', 'shift', e.shift_id, { entry_id: e.id, state: b.state, edited: body !== e.body });
    return row;
  }),

  'shiftlog.sign': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'shift_id');
    const ax = await shiftAccess(user, b.shift_id);
    if (!canCurate(ax)) fail(403, 'Only the shift lead or a manager can sign off the log');
    if (new Date(ax.sh.starts_at) > new Date()) fail(400, 'You can sign off once the shift has started');
    const summary = String(b.handover_summary || '').trim().slice(0, 4000);
    if (!summary) fail(400, 'Write a short handover for the next team');
    await ensureLog(b.shift_id);
    const log = await one(`UPDATE shift_logs SET status = 'signed', handover_summary = $2, signed_by = $3, signed_at = now() WHERE shift_id = $1 RETURNING *`,
      [b.shift_id, summary, user.id]);
    const { sh } = ax;
    await notify(await venueContacts(sh.venue_id), {
      kind: 'shift', title: 'Shift log ready', body: `${sh.venue_name} · ${when(sh)}: ${summary.slice(0, 140)}`, link: `/venue/logs/${sh.id}`, dedupe: `log:${sh.id}`,
    });
    // The next team at this venue sees the handover on their shift page
    const next = await one(`SELECT id, starts_at, ends_at FROM shifts WHERE venue_id = $1 AND status = 'published' AND starts_at >= $2 AND starts_at < $2::timestamptz + interval '7 days' ORDER BY starts_at LIMIT 1`, [sh.venue_id, sh.ends_at]);
    if (next) {
      const team = (await q(`SELECT o.user_id FROM shift_assignments a JOIN officers o ON o.id = a.officer_id WHERE a.shift_id = $1 AND a.status IN ${ACTIVE} AND o.user_id IS NOT NULL`, [next.id])).map((r) => r.user_id);
      await notify(team, { kind: 'shift', title: `Handover from ${sh.venue_name}`, body: summary.slice(0, 160), link: `/officer/shifts/${next.id}`, dedupe: `handover:${sh.id}` });
    }
    await audit(user, 'shiftlog.sign', 'shift', sh.id, {});
    return log;
  }),

  'shiftlog.reopen': def(MGR, async (b, { user }) => {
    required(b, 'shift_id');
    await shiftAccess(user, b.shift_id);
    await q("UPDATE shift_logs SET status = 'open' WHERE shift_id = $1", [b.shift_id]);
    await audit(user, 'shiftlog.reopen', 'shift', b.shift_id, {});
    return { ok: true };
  }),

  /** Signed logs for a venue (managers and the venue). */
  'shiftlog.list': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    if (b.venue_id) await assertVenue(user, b.venue_id);
    return q(
      `SELECT s.id AS shift_id, s.venue_id, v.name AS venue_name, s.starts_at, s.ends_at, r.name AS role_name, l.status, l.handover_summary, l.signed_at, ${userName('u')} AS signed_by_name,
              (SELECT count(*) FROM shift_log_entries e WHERE e.shift_id = s.id AND e.state = 'kept')::int AS entries,
              (SELECT count(*) FROM shift_log_entries e WHERE e.shift_id = s.id AND e.state = 'kept' AND e.kind = 'incident')::int AS incidents,
              (SELECT count(*) FROM shift_log_entries e WHERE e.shift_id = s.id AND e.state = 'kept' AND e.kind = 'ban')::int AS bans,
              (SELECT count(*) FROM shift_log_entries e WHERE e.shift_id = s.id AND e.state = 'kept' AND e.kind = 'ejection')::int AS ejections
         FROM shift_logs l JOIN shifts s ON s.id = l.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role LEFT JOIN users u ON u.id = l.signed_by
        WHERE ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) AND ($2::uuid IS NULL OR s.venue_id = $2)
          AND ($3::text = 'all' OR l.status = 'signed') AND ($4::timestamptz IS NULL OR s.starts_at >= $4) AND ($5::timestamptz IS NULL OR s.starts_at < $5)
        ORDER BY s.starts_at DESC LIMIT 200`,
      [scope, b.venue_id || null, user.role === 'venue' ? 'signed' : (b.status || 'all'), b.from || null, b.to || null]);
  }),
};
