// Calendar: meetings with invites, replies and proposed times, next to each person's shifts and time off.
// Company managers invite anyone and can open anyone's calendar; everyone else invites company managers and sees their own.
import { one, q, tx } from '../lib/db.mjs';
import { fail, need } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { venueScope } from '../lib/scope.mjs';
import { notify, companyManagers, sendRawEmail, emailHtml } from '../lib/notify.mjs';
import { esc, getBrand } from '../lib/brand.mjs';
import { fmtDateTime, fmtTime, fmtDate, londonDate } from '../lib/time.mjs';
import { officerName } from '../lib/names.mjs';
import { isPlatformEmail } from '../lib/platform.mjs';
import {
  RESPONSES, WHERE, DEFAULT_REMINDERS, cleanReminders, invitable, passedReminders, icsToken, readIcsToken, buildIcs, shiftClashes, suggestTimes, whereText,
} from '../lib/calendar.mjs';
import { ALL, MGR, def } from './_def.mjs';

const APP_URL = () => process.env.APP_URL || '';
const isCo = (u) => u.role === 'company';
const RESPONSE_LABEL = { accepted: 'accepted', maybe: 'said maybe to', declined: 'declined' };

// Each person's own portal, so a notice opens the calendar they have
const BASE = { company: '/company/calendar', security: '/security/calendar', venue: '/venue/calendar', officer: '/officer/shifts' };
const linkFor = (role, email, id) => `${isPlatformEmail(email) ? BASE.company : BASE[role] || BASE.officer}?event=${id}`;

const EVENT_SQL = `SELECT e.*, u.name AS organiser_name, v.name AS venue_name, NULLIF(concat_ws(', ', NULLIF(v.address, ''), NULLIF(v.postcode, '')), '') AS venue_address,
    (SELECT company_address FROM settings WHERE id = 1) AS hq_address
  FROM calendar_events e JOIN users u ON u.id = e.organiser_id LEFT JOIN venues v ON v.id = e.venue_id`;

const ATTENDEES_SQL = `SELECT a.*, u.name, u.email, u.role, o.id AS officer_id,
    (SELECT string_agg(v.name, ', ' ORDER BY v.name) FROM venue_contacts c JOIN venues v ON v.id = c.venue_id WHERE c.user_id = u.id) AS venue_names
  FROM calendar_attendees a JOIN users u ON u.id = a.user_id LEFT JOIN officers o ON o.user_id = u.id
  WHERE a.event_id = $1 ORDER BY (a.user_id = $2) DESC, u.name`;

async function loadEvent(id) {
  return need(await one(`${EVENT_SQL} WHERE e.id = $1`, [id]), 'Meeting not found');
}

/** The event as this person may see it: attendees and company managers get it all, notes included. */
async function eventFor(id, user) {
  const e = await loadEvent(id);
  const attendees = await q(ATTENDEES_SQL, [id, e.organiser_id]);
  const me = attendees.find((a) => a.user_id === user.id);
  if (!me && !isCo(user)) fail(404, 'Meeting not found');
  return {
    ...e,
    where: whereText(e),
    attendees: attendees.map((a) => ({
      user_id: a.user_id, name: a.name, role: a.role, venue_names: a.venue_names, response: a.response, note: a.note, organiser: a.user_id === e.organiser_id,
      proposed_start: a.proposed_start, proposed_end: a.proposed_end, proposal_note: a.proposal_note, responded_at: a.responded_at,
    })),
    me: me ? { response: me.response, note: me.note, reminders: me.reminders, proposed_start: me.proposed_start, proposed_end: me.proposed_end } : null,
    can_edit: !e.cancelled_at && (e.organiser_id === user.id || isCo(user)),
    ics: me ? icsToken(e.id, user.id) : null,
  };
}

// Who this person may invite, with what the picker shows under each name
async function people(user) {
  const co = await companyManagers();
  const rows = await q(
    `SELECT u.id, u.name, u.role, u.email, o.id AS officer_id,
        (SELECT string_agg(v.name, ', ' ORDER BY v.name) FROM venue_contacts c JOIN venues v ON v.id = c.venue_id WHERE c.user_id = u.id) AS venue_names
       FROM users u LEFT JOIN officers o ON o.user_id = u.id
      WHERE u.status = 'active' AND NOT u.system AND u.id <> $1 AND ($2 OR u.id = ANY($3::uuid[]))
      ORDER BY CASE u.role WHEN 'company' THEN 0 WHEN 'security' THEN 1 WHEN 'venue' THEN 2 ELSE 3 END, u.name`, [user.id, isCo(user), co]);
  return rows.filter((r) => isCo(user) || !isPlatformEmail(r.email)).map(({ email, ...r }) => ({ ...r, role: isPlatformEmail(email) ? 'company' : r.role }));
}

// Places a meeting can be: the venues this person works with
async function places(user) {
  if (user.role === 'venue') return q('SELECT v.id, v.name FROM venue_contacts c JOIN venues v ON v.id = c.venue_id WHERE c.user_id = $1 ORDER BY v.name', [user.id]);
  if (user.role === 'officer') {
    return q(`SELECT DISTINCT v.id, v.name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
               WHERE a.officer_id = $1 AND s.starts_at > now() - interval '90 days' ORDER BY v.name`, [user.officer_id]);
  }
  const scope = await venueScope(user);
  return q("SELECT id, name FROM venues WHERE status = 'active' AND ($1::uuid[] IS NULL OR id = ANY($1)) ORDER BY name", [scope]);
}

/** Shifts people are booked on in a window, by user: what free/busy and the clash warnings read. */
async function shiftsOf(userIds, from, to, { drafts = false } = {}) {
  if (!userIds.length) return [];
  return q(
    `SELECT o.user_id, s.id, s.starts_at, s.ends_at, s.venue_id, s.status, v.name AS venue_name, r.name AS role_name, ${officerName('o')} AS person, a.status AS assignment_status
       FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN officers o ON o.id = a.officer_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
      WHERE o.user_id = ANY($1::uuid[]) AND a.status IN ('assigned','accepted') AND s.status ${drafts ? "<> 'cancelled'" : "= 'published'"}
        AND s.starts_at < $3 AND s.ends_at > $2 ORDER BY s.starts_at`, [userIds, from, to]);
}

async function timeOffOf(userIds, from, to) {
  if (!userIds.length) return [];
  return q(
    `SELECT o.user_id, t.id, t.kind, t.start_date, t.end_date FROM time_off t JOIN officers o ON o.id = t.officer_id
      WHERE o.user_id = ANY($1::uuid[]) AND t.status = 'approved'
        AND t.start_date <= ($3::timestamptz AT TIME ZONE 'Europe/London')::date AND t.end_date >= ($2::timestamptz AT TIME ZONE 'Europe/London')::date`, [userIds, from, to]);
}

// Meetings people are in (and haven't declined), by user. Cancelled ones stay on the calendar, crossed out, for a day.
async function meetingsOf(userIds, from, to, { exclude = null, cancelled = false } = {}) {
  if (!userIds.length) return [];
  return q(
    `SELECT a.user_id, a.response, e.id, e.kind, e.title, e.starts_at, e.ends_at, e.all_day, e.private, e.where_kind, e.venue_id, e.cancelled_at, e.organiser_id,
            v.name AS venue_name, (SELECT count(*)::int FROM calendar_attendees x WHERE x.event_id = e.id) AS attendee_count
       FROM calendar_attendees a JOIN calendar_events e ON e.id = a.event_id LEFT JOIN venues v ON v.id = e.venue_id
      WHERE a.user_id = ANY($1::uuid[]) AND e.starts_at < $3 AND e.ends_at > $2 AND ($4::uuid IS NULL OR e.id <> $4)
        AND ${cancelled ? "(e.cancelled_at IS NULL OR e.cancelled_at > now() - interval '1 day')" : 'e.cancelled_at IS NULL'}
        AND (a.response <> 'declined' OR e.organiser_id = a.user_id)
      ORDER BY e.starts_at`, [userIds, from, to, exclude]);
}

const dayStart = (iso) => new Date(`${iso}T00:00:00Z`);
// Approved time off is busy for the whole London day(s); a wide window either side covers British Summer Time
const offAsBusy = (t) => ({ starts_at: new Date(dayStart(String(t.start_date).slice(0, 10)).getTime() - 3600000).toISOString(), ends_at: new Date(dayStart(String(t.end_date).slice(0, 10)).getTime() + 86400000).toISOString() });
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** Each attendee's busy times on the meeting's day, the shift clashes and the next three times everyone is free. */
export async function freeBusy(user, { user_ids = [], starts_at, ends_at, where_kind, venue_id, exclude_id = null }) {
  const ids = [...new Set([user.id, ...user_ids])].slice(0, 30);
  const start = new Date(starts_at);
  const end = new Date(ends_at);
  if (!(end > start)) fail(400, 'The end must be after the start');
  const day = londonDate(start);
  const from = new Date(dayStart(day).getTime() - 3 * 3600000).toISOString();
  const to = new Date(dayStart(day).getTime() + 27 * 3600000).toISOString();
  // Suggestions look two weeks ahead
  const far = new Date(start.getTime() + 15 * 86400000).toISOString();
  const [users, shifts, meetings, off] = await Promise.all([
    q('SELECT id, name, email, role FROM users WHERE id = ANY($1::uuid[])', [ids]),
    shiftsOf(ids, start.toISOString() < from ? start.toISOString() : from, far, { drafts: isCo(user) }),
    meetingsOf(ids, from < start.toISOString() ? from : start.toISOString(), far, { exclude: exclude_id }),
    timeOffOf(ids, from, far),
  ]);
  const name = Object.fromEntries(users.map((u) => [u.id, u.id === user.id ? 'You' : u.name]));
  const show = (uid) => isCo(user) || uid === user.id;
  const inDay = (b) => new Date(b.starts_at) < new Date(to) && new Date(b.ends_at) > new Date(from);
  const rows = ids.filter((id) => name[id]).map((uid) => ({
    user_id: uid,
    name: name[uid],
    busy: [
      ...shifts.filter((s) => s.user_id === uid && inDay(s)).map((s) => ({ kind: 'shift', starts_at: s.starts_at, ends_at: s.ends_at, label: show(uid) ? `Shift · ${s.venue_name}` : 'Busy' })),
      ...meetings.filter((m) => m.user_id === uid && inDay(m)).map((m) => ({ kind: 'meeting', starts_at: m.starts_at, ends_at: m.ends_at, label: show(uid) && !m.private ? m.title : 'Busy' })),
      ...off.filter((t) => t.user_id === uid).map(offAsBusy).filter(inDay).map((b) => ({ kind: 'off', ...b, label: show(uid) ? 'Time off' : 'Away' })),
    ].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
  }));
  const meeting = { starts_at, ends_at, where_kind, venue_id };
  const clashes = shiftClashes(meeting, shifts.map((s) => (s.user_id === user.id ? { ...s, person: 'You', self: true } : s)));
  const offClash = off.filter((t) => iso(t.start_date) <= day && iso(t.end_date) >= day).map((t) => `${name[t.user_id] === 'You' ? 'You are' : `${name[t.user_id]} is`} on time off that day`);
  const meetClash = meetings.filter((m) => new Date(m.starts_at) < end && new Date(m.ends_at) > start)
    .map((m) => `${name[m.user_id] === 'You' ? 'You have' : `${name[m.user_id]} has`} ${show(m.user_id) && !m.private ? `“${m.title}”` : 'another meeting'} at ${fmtTime(m.starts_at)}`);
  const busy = [...shifts, ...meetings, ...off.map(offAsBusy)];
  const suggestions = suggestTimes(start, Math.round((end - start) / 60000), busy);
  return { rows, clashes: [...new Set([...clashes, ...offClash, ...meetClash])], suggestions };
}

// The fields a meeting is saved from, checked
function clean(b) {
  const title = String(b.title || '').trim().slice(0, 200);
  if (!title) fail(400, 'Give the meeting a title');
  const start = new Date(b.starts_at);
  const end = new Date(b.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) fail(400, 'Choose a date and time');
  if (end <= start) fail(400, 'The end must be after the start');
  if (end - start > 14 * 86400000) fail(400, 'A meeting can last up to two weeks');
  const where_kind = WHERE.includes(b.where_kind) ? b.where_kind : 'none';
  const video = String(b.video_url || '').trim().slice(0, 500);
  if (where_kind === 'video' && video && !/^https:\/\//i.test(video)) fail(400, 'Paste the full video link, starting https://');
  if (where_kind === 'venue' && !b.venue_id) fail(400, 'Choose the venue');
  return {
    title, kind: 'meeting', starts_at: start.toISOString(), ends_at: end.toISOString(), all_day: !!b.all_day, where_kind,
    venue_id: where_kind === 'venue' ? b.venue_id : null,
    address: where_kind === 'address' ? String(b.address || '').trim().slice(0, 300) : '',
    phone: where_kind === 'phone' ? String(b.phone || '').trim().slice(0, 60) : '',
    video_url: where_kind === 'video' ? video : '',
    notes: String(b.notes || '').trim().slice(0, 4000),
  };
}

async function checkInvites(user, ids) {
  if (!ids.length) return;
  const found = await q("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND status = 'active' AND NOT system", [ids]);
  if (found.length !== ids.length) fail(400, 'Someone on the list can no longer be invited');
  const r = invitable(user.role, ids, await companyManagers());
  if (!r.ok) fail(403, 'You can invite company managers only');
}

// What the notices say about a meeting
const when = (e) => (e.all_day ? fmtDate(e.starts_at) : `${fmtDateTime(e.starts_at)}–${fmtTime(e.ends_at)}`);
const line = (e) => [when(e), whereText(e)].filter(Boolean).join(' · ');

/**
 * Bell and phone for each person; for invites, time changes and cancellations an email too, with their own
 * Add to calendar link (the .ics opens straight into Outlook, Apple or Google).
 */
async function tell(userIds, e, { title, body, mail = false, severity = 'info' }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  const users = await q("SELECT id, email, role FROM users WHERE id = ANY($1::uuid[]) AND status = 'active'", [ids]);
  for (const u of users) {
    const link = linkFor(u.role, u.email, e.id);
    await notify([u.id], { kind: 'meeting', title, body, link, severity, email: false, ref: `meet:${e.id}` });
    if (!mail) continue;
    try {
      const [{ name }, html] = await Promise.all([
        getBrand(),
        emailHtml(esc(title), `${esc(body)}<br><br><a href="${APP_URL()}/app${link}" style="color:#4B5563">Reply or see who’s coming</a>`, `/ics/${icsToken(e.id, u.id)}`, e.cancelled_at ? 'Update my calendar' : 'Add to calendar'),
      ]);
      await sendRawEmail(u.email, `${name} — ${title}`, html);
    } catch (err) {
      console.warn('[calendar] email not sent:', err.message);
    }
  }
}

async function attendeeIds(eventId) {
  return (await q('SELECT user_id FROM calendar_attendees WHERE event_id = $1', [eventId])).map((r) => r.user_id);
}

/** Create or change a meeting. A new time asks everyone again; notes or place changes keep their replies. */
async function save(b, user) {
  const f = clean(b);
  const wanted = [...new Set((Array.isArray(b.attendee_ids) ? b.attendee_ids : []).filter(Boolean))].slice(0, 50);
  const reminders = b.reminders === undefined ? DEFAULT_REMINDERS : cleanReminders(b.reminders);
  if (!b.id) {
    await checkInvites(user, wanted.filter((id) => id !== user.id));
    const ids = wanted.filter((id) => id !== user.id);
    const e = await tx(async (t) => {
      const row = await t.one(
        `INSERT INTO calendar_events (kind, title, starts_at, ends_at, all_day, where_kind, venue_id, address, phone, video_url, notes, organiser_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
        [f.kind, f.title, f.starts_at, f.ends_at, f.all_day, f.where_kind, f.venue_id, f.address, f.phone, f.video_url, f.notes, user.id]);
      await t.q(`INSERT INTO calendar_attendees (event_id, user_id, response, responded_at, reminders, reminded) VALUES ($1,$2,'accepted',now(),$3,$4)`,
        [row.id, user.id, reminders, passedReminders(reminders, f.starts_at)]);
      for (const id of ids) {
        await t.q('INSERT INTO calendar_attendees (event_id, user_id, reminders, reminded) VALUES ($1,$2,$3,$4)', [row.id, id, DEFAULT_REMINDERS, passedReminders(DEFAULT_REMINDERS, f.starts_at)]);
      }
      return row;
    });
    const full = await loadEvent(e.id);
    await tell(ids, full, { title: `Invite: ${f.title}`, body: `${user.name} invited you · ${line(full)}`, mail: true });
    await audit(user, 'calendar.create', 'calendar_event', e.id, { title: f.title, starts_at: f.starts_at, attendees: ids });
    return eventFor(e.id, user);
  }

  const before = await loadEvent(b.id);
  if (before.cancelled_at) fail(409, 'This meeting was cancelled');
  if (before.organiser_id !== user.id && !isCo(user)) fail(403, 'Only the organiser can change this meeting');
  const had = await attendeeIds(before.id);
  // The organiser stays on it, whoever is editing
  const keep = new Set([...wanted, before.organiser_id]);
  const added = [...keep].filter((id) => !had.includes(id));
  const removed = had.filter((id) => !keep.has(id));
  // Someone who isn't a company manager can only add company managers; the ones already on it stay
  await checkInvites(user, added.filter((id) => id !== user.id));
  const moved = new Date(before.starts_at).getTime() !== new Date(f.starts_at).getTime() || new Date(before.ends_at).getTime() !== new Date(f.ends_at).getTime() || before.all_day !== f.all_day;
  const changed = ['title', 'where_kind', 'venue_id', 'address', 'phone', 'video_url', 'notes'].some((k) => String(before[k] ?? '') !== String(f[k] ?? ''));
  await tx(async (t) => {
    await t.q(
      `UPDATE calendar_events SET title = $2, starts_at = $3, ends_at = $4, all_day = $5, where_kind = $6, venue_id = $7, address = $8, phone = $9, video_url = $10,
              notes = $11, seq = seq + $12::int, updated_at = now() WHERE id = $1`,
      [before.id, f.title, f.starts_at, f.ends_at, f.all_day, f.where_kind, f.venue_id, f.address, f.phone, f.video_url, f.notes, moved || changed ? 1 : 0]);
    if (removed.length) await t.q('DELETE FROM calendar_attendees WHERE event_id = $1 AND user_id = ANY($2::uuid[])', [before.id, removed]);
    for (const id of added) {
      await t.q('INSERT INTO calendar_attendees (event_id, user_id, reminders, reminded) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [before.id, id, DEFAULT_REMINDERS, passedReminders(DEFAULT_REMINDERS, f.starts_at)]);
    }
    if (moved) {
      // Everyone but the organiser is asked again; proposals for the old time are dropped; reminders start over
      await t.q(
        `UPDATE calendar_attendees SET response = CASE WHEN user_id = $2 THEN response ELSE 'pending' END, responded_at = CASE WHEN user_id = $2 THEN responded_at END,
                note = CASE WHEN user_id = $2 THEN note ELSE '' END, proposed_start = NULL, proposed_end = NULL, proposal_note = '',
                reminded = ARRAY(SELECT m FROM unnest(reminders) m WHERE $3::timestamptz - make_interval(mins => m) <= now())
          WHERE event_id = $1`, [before.id, before.organiser_id, f.starts_at]);
    }
  });
  const e = await loadEvent(before.id);
  const stay = had.filter((id) => keep.has(id) && id !== user.id);
  const by = user.id === before.organiser_id ? user.name : `${user.name} for ${before.organiser_name}`;
  if (moved) await tell(stay, e, { title: `New time: ${e.title}`, body: `${by} moved it to ${line(e)}. Please reply again.`, mail: true });
  else if (changed) await tell(stay, e, { title: `Updated: ${e.title}`, body: `${by} changed the details · ${line(e)}`, mail: true });
  await tell(added.filter((id) => id !== user.id), e, { title: `Invite: ${e.title}`, body: `${by} invited you · ${line(e)}`, mail: true });
  await tell(removed.filter((id) => id !== user.id), { ...e, cancelled_at: new Date() }, { title: `Removed: ${e.title}`, body: `${by} took you off this meeting · ${when(before)}`, mail: true });
  await audit(user, 'calendar.update', 'calendar_event', e.id, {
    moved: moved ? { from: before.starts_at, to: f.starts_at } : undefined, changed: changed || undefined, added, removed,
    ...(user.id !== before.organiser_id ? { on_behalf_of: before.organiser_id } : {}),
  });
  return eventFor(e.id, user);
}

/** One event as an .ics file, from a signed per-person link (the email's Add to calendar button). */
export async function icsFile(token) {
  const t = readIcsToken(token);
  if (!t) return null;
  const a = await one('SELECT reminders FROM calendar_attendees WHERE event_id = $1 AND user_id = $2', [t.eventId, t.userId]);
  const e = await one(`${EVENT_SQL} WHERE e.id = $1`, [t.eventId]);
  if (!e) return null;
  const { name } = await getBrand();
  // Someone taken off the meeting gets it as cancelled, so their own calendar drops it
  const cancelled = e.cancelled_at || !a ? e.cancelled_at || new Date() : null;
  const role = (await one('SELECT role, email FROM users WHERE id = $1', [t.userId])) || {};
  return {
    name: `${e.title.replace(/[^\w\s-]/g, '').trim().slice(0, 40) || 'meeting'}.ics`,
    body: buildIcs({ ...e, cancelled_at: cancelled, reminders: a?.reminders || [] }, { company: name, appUrl: `${APP_URL()}/app${linkFor(role.role, role.email, e.id)}` }),
  };
}

// Reminders: every 5 minutes, each person's own (1 day and 30 minutes before unless they changed them). When several
// are due at once only the nearest is sent.
export async function calendarReminders() {
  const due = await q(
    `SELECT a.event_id, a.user_id, array_agg(m) AS due, min(m) AS nearest
       FROM calendar_attendees a JOIN calendar_events e ON e.id = a.event_id, unnest(a.reminders) m
      WHERE e.cancelled_at IS NULL AND a.response <> 'declined' AND e.starts_at > now() AND e.starts_at - make_interval(mins => m) <= now() AND NOT (m = ANY(a.reminded))
      GROUP BY a.event_id, a.user_id LIMIT 500`);
  for (const r of due) {
    const done = await one(
      `UPDATE calendar_attendees SET reminded = ARRAY(SELECT DISTINCT unnest(reminded || $3::int[])) WHERE event_id = $1 AND user_id = $2
         AND NOT (reminded @> $3::int[]) RETURNING user_id`, [r.event_id, r.user_id, r.due]);
    if (!done) continue;
    const e = await loadEvent(r.event_id);
    const u = await one('SELECT role, email FROM users WHERE id = $1', [r.user_id]);
    const soon = r.nearest < 120;
    await notify([r.user_id], {
      kind: 'meeting', title: `${soon ? 'Soon' : fmtDate(e.starts_at) === fmtDate(new Date()) ? 'Today' : 'Tomorrow'}: ${e.title}`, body: line(e),
      link: linkFor(u?.role, u?.email, e.id), dedupe: `meet-remind:${e.id}:${e.seq}:${r.nearest}`, ref: `meet:${e.id}`, email: false,
    });
  }
  return due.length;
}

export const actions = {
  // Everything on one calendar for a window: meetings, shifts and time off. Company managers can open anyone's.
  'calendar.range': def(ALL, async (b, { user }) => {
    const from = new Date(b.from);
    const to = new Date(b.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) fail(400, 'Choose a date range');
    if (to - from > 45 * 86400000) fail(400, 'Show up to six weeks at a time');
    const uid = b.user_id && b.user_id !== user.id ? (isCo(user) ? b.user_id : fail(403, 'You can only see your own calendar')) : user.id;
    const who = need(await one('SELECT id, name, role FROM users WHERE id = $1', [uid]), 'Person not found');
    const [meetings, shifts, off] = await Promise.all([
      meetingsOf([uid], from.toISOString(), to.toISOString(), { cancelled: true }),
      user.role === 'venue' ? [] : shiftsOf([uid], from.toISOString(), to.toISOString(), { drafts: isCo(user) && uid !== user.id }),
      user.role === 'venue' ? [] : timeOffOf([uid], from.toISOString(), to.toISOString()),
    ]);
    const mine = uid === user.id;
    return {
      user: who,
      events: meetings.map((m) => ({
        id: m.id, kind: m.kind, starts_at: m.starts_at, ends_at: m.ends_at, all_day: m.all_day, cancelled: !!m.cancelled_at, response: m.response,
        organiser: m.organiser_id === uid, venue_name: m.venue_name, attendee_count: m.attendee_count,
        title: !mine && m.private ? 'Busy' : m.title,
      })),
      shifts: shifts.map((s) => ({ id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, venue_name: s.venue_name, role_name: s.role_name, status: s.status, assignment_status: s.assignment_status })),
      time_off: off.map((t) => ({ id: t.id, kind: t.kind, start_date: iso(t.start_date), end_date: iso(t.end_date) })),
    };
  }),

  'calendar.get': def(ALL, (b, { user }) => eventFor(need(b.id, 'Meeting not found'), user)),

  // Who can be invited and where a meeting can be
  'calendar.options': def(ALL, async (_b, { user }) => {
    const [list, venues, hq] = await Promise.all([people(user), places(user), one('SELECT company_address FROM settings WHERE id = 1')]);
    return { people: list, venues, hq_address: hq?.company_address || '', can_invite_anyone: isCo(user) };
  }),

  'calendar.freeBusy': def(ALL, async (b, { user }) => {
    const ids = (Array.isArray(b.user_ids) ? b.user_ids : []).filter(Boolean);
    // Only people this person may invite (and those already on the meeting) are looked up
    if (!isCo(user) && ids.length) {
      const already = b.exclude_id ? await attendeeIds(b.exclude_id) : [];
      const co = await companyManagers();
      if (ids.some((id) => id !== user.id && !co.includes(id) && !already.includes(id))) fail(403, 'You can invite company managers only');
    }
    return freeBusy(user, { ...b, user_ids: ids });
  }),

  'calendar.save': def(ALL, (b, { user }) => save(b, user)),

  // Dragged on the calendar: the same as changing the time in the form
  'calendar.move': def(ALL, async (b, { user }) => {
    const e = await eventFor(need(b.id, 'Meeting not found'), user);
    return save({ ...e, starts_at: b.starts_at, ends_at: b.ends_at, attendee_ids: e.attendees.map((a) => a.user_id), reminders: undefined }, user);
  }),

  'calendar.cancel': def(ALL, async (b, { user }) => {
    const e = await loadEvent(need(b.id, 'Meeting not found'));
    if (e.cancelled_at) return eventFor(e.id, user);
    if (e.organiser_id !== user.id && !isCo(user)) fail(403, 'Only the organiser can cancel this meeting');
    const note = String(b.note || '').trim().slice(0, 500);
    await q('UPDATE calendar_events SET cancelled_at = now(), cancelled_by = $2, cancel_note = $3, seq = seq + 1, updated_at = now() WHERE id = $1', [e.id, user.id, note]);
    const after = await loadEvent(e.id);
    const by = user.id === e.organiser_id ? user.name : `${user.name} for ${e.organiser_name}`;
    await tell((await attendeeIds(e.id)).filter((id) => id !== user.id), after, { title: `Cancelled: ${e.title}`, body: `${by} cancelled ${when(e)}${note ? `: “${note}”` : ''}`, mail: true, severity: 'warning' });
    await audit(user, 'calendar.cancel', 'calendar_event', e.id, { note, ...(user.id !== e.organiser_id ? { on_behalf_of: e.organiser_id } : {}) });
    return eventFor(e.id, user);
  }),

  // Accept, maybe or decline, with a note; the organiser hears about it
  'calendar.respond': def(ALL, async (b, { user }) => {
    if (!RESPONSES.includes(b.response)) fail(400, 'Choose accept, maybe or decline');
    const e = await loadEvent(need(b.id, 'Meeting not found'));
    if (e.cancelled_at) fail(409, 'This meeting was cancelled');
    if (e.organiser_id === user.id) fail(400, 'You organised this meeting');
    const note = String(b.note || '').trim().slice(0, 500);
    const a = need(await one(
      `UPDATE calendar_attendees SET response = $3, note = $4, responded_at = now() WHERE event_id = $1 AND user_id = $2 RETURNING *`, [e.id, user.id, b.response, note]), 'You are not on this meeting');
    await tell([e.organiser_id], e, { title: `${user.name} ${RESPONSE_LABEL[b.response]} ${e.title}`, body: [when(e), note && `“${note}”`].filter(Boolean).join(' · ') });
    await audit(user, 'calendar.respond', 'calendar_event', e.id, { response: a.response, note: note || undefined });
    return eventFor(e.id, user);
  }),

  // Can't make it then: suggest another time. The organiser accepts (it moves for everyone) or declines it.
  'calendar.propose': def(ALL, async (b, { user }) => {
    const e = await loadEvent(need(b.id, 'Meeting not found'));
    if (e.cancelled_at) fail(409, 'This meeting was cancelled');
    if (e.organiser_id === user.id) fail(400, 'You organised this meeting: change its time instead');
    const start = new Date(b.starts_at);
    const end = new Date(b.ends_at);
    if (Number.isNaN(start.getTime()) || !(end > start)) fail(400, 'Choose a new time that ends after it starts');
    if (start < new Date()) fail(400, 'Choose a time that is still to come');
    const note = String(b.note || '').trim().slice(0, 500);
    // Proposing a new time is a "not at this time": their reply waits on the organiser
    need(await one(
      `UPDATE calendar_attendees SET proposed_start = $3, proposed_end = $4, proposal_note = $5, response = CASE WHEN response = 'accepted' THEN 'maybe' ELSE response END,
              responded_at = now() WHERE event_id = $1 AND user_id = $2 RETURNING user_id`, [e.id, user.id, start.toISOString(), end.toISOString(), note]), 'You are not on this meeting');
    await tell([e.organiser_id], e, { title: `${user.name} proposed a new time`, body: `${e.title}: ${fmtDateTime(start)}–${fmtTime(end)} instead of ${when(e)}${note ? ` · “${note}”` : ''}`, severity: 'warning' });
    await audit(user, 'calendar.propose', 'calendar_event', e.id, { starts_at: start.toISOString(), ends_at: end.toISOString(), note: note || undefined });
    return eventFor(e.id, user);
  }),

  'calendar.decideProposal': def(ALL, async (b, { user }) => {
    const e = await loadEvent(need(b.id, 'Meeting not found'));
    if (e.organiser_id !== user.id && !isCo(user)) fail(403, 'Only the organiser can answer a proposed time');
    const a = need(await one('SELECT a.*, u.name FROM calendar_attendees a JOIN users u ON u.id = a.user_id WHERE event_id = $1 AND user_id = $2 AND proposed_start IS NOT NULL', [e.id, b.user_id]), 'That proposal was already answered');
    if (!b.accept) {
      await q("UPDATE calendar_attendees SET proposed_start = NULL, proposed_end = NULL, proposal_note = '' WHERE event_id = $1 AND user_id = $2", [e.id, a.user_id]);
      await tell([a.user_id], e, { title: `New time not taken: ${e.title}`, body: `It stays at ${line(e)}. Please reply to the original time.` });
      await audit(user, 'calendar.declineProposal', 'calendar_event', e.id, { from: a.user_id });
      return eventFor(e.id, user);
    }
    const full = await eventFor(e.id, user);
    const moved = await save({ ...full, starts_at: a.proposed_start, ends_at: a.proposed_end, attendee_ids: full.attendees.map((x) => x.user_id), reminders: undefined }, user);
    // The person who asked for this time has, in effect, accepted it
    await q("UPDATE calendar_attendees SET response = 'accepted', responded_at = now() WHERE event_id = $1 AND user_id = $2", [e.id, a.user_id]);
    await audit(user, 'calendar.acceptProposal', 'calendar_event', e.id, { from: a.user_id, starts_at: a.proposed_start });
    return { ...moved, attendees: moved.attendees.map((x) => (x.user_id === a.user_id ? { ...x, response: 'accepted' } : x)) };
  }),

  // My own reminders for this meeting
  'calendar.reminders': def(ALL, async (b, { user }) => {
    const e = await loadEvent(need(b.id, 'Meeting not found'));
    const list = cleanReminders(b.reminders);
    need(await one('UPDATE calendar_attendees SET reminders = $3, reminded = $4 WHERE event_id = $1 AND user_id = $2 RETURNING user_id', [e.id, user.id, list, passedReminders(list, e.starts_at)]), 'You are not on this meeting');
    return eventFor(e.id, user);
  }),

  // The next meeting for Home, and the invites waiting for a reply
  'calendar.upcoming': def(ALL, async (_b, { user }) => {
    const rows = await q(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, e.all_day, a.response, u.name AS organiser_name, e.organiser_id = $1 AS organiser,
              (SELECT string_agg(x.name, ', ' ORDER BY x.name) FROM calendar_attendees y JOIN users x ON x.id = y.user_id WHERE y.event_id = e.id AND y.user_id <> $1) AS with_names
         FROM calendar_attendees a JOIN calendar_events e ON e.id = a.event_id JOIN users u ON u.id = e.organiser_id
        WHERE a.user_id = $1 AND e.cancelled_at IS NULL AND e.ends_at > now() AND a.response <> 'declined'
        ORDER BY e.starts_at LIMIT 20`, [user.id]);
    // New times people proposed for meetings this person organised, waiting on their answer
    const proposals = await q(
      `SELECT e.id, e.title, e.starts_at, e.ends_at, a.user_id, u.name, a.proposed_start, a.proposed_end, a.proposal_note
         FROM calendar_attendees a JOIN calendar_events e ON e.id = a.event_id JOIN users u ON u.id = a.user_id
        WHERE e.organiser_id = $1 AND a.proposed_start IS NOT NULL AND a.proposed_start > now() AND e.cancelled_at IS NULL
        ORDER BY e.starts_at LIMIT 20`, [user.id]);
    return { next: rows.find((r) => r.response !== 'pending') || null, invites: rows.filter((r) => r.response === 'pending'), proposals };
  }),

  // The rota's By officer view: meetings officers are in, as bars. Titles only for company managers.
  'calendar.forRota': def(MGR, async (b, { user }) => {
    const from = new Date(b.from);
    const to = new Date(b.to);
    if (Number.isNaN(from.getTime()) || !(to > from) || to - from > 45 * 86400000) fail(400, 'Choose a date range');
    const rows = await q(
      `SELECT o.id AS officer_id, e.id, e.title, e.starts_at, e.ends_at, e.private, a.response
         FROM calendar_attendees a JOIN calendar_events e ON e.id = a.event_id JOIN officers o ON o.user_id = a.user_id
        WHERE e.cancelled_at IS NULL AND a.response <> 'declined' AND e.starts_at < $2 AND e.ends_at > $1
        ORDER BY e.starts_at`, [from.toISOString(), to.toISOString()]);
    return rows.map((r) => ({ ...r, title: isCo(user) && !r.private ? r.title : 'Meeting' }));
  }),
};

export { buildIcs };
