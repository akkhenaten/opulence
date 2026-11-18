// Calendar rules that need no database: who may invite whom, the .ics file and its signed link, reminder timing,
// clash wording and the next free times. modules/calendar.mjs does the reading and writing.
import crypto from 'node:crypto';
import { hmac } from './auth.mjs';
import { fmtTime, londonParts } from './time.mjs';

export const RESPONSES = ['accepted', 'maybe', 'declined'];
export const WHERE = ['none', 'venue', 'hq', 'address', 'phone', 'video'];
export const DEFAULT_REMINDERS = [1440, 30];
// Up to a week before, at most four per person
export const cleanReminders = (list) => [...new Set((Array.isArray(list) ? list : []).map(Number).filter((m) => Number.isInteger(m) && m >= 0 && m <= 10080))]
  .sort((a, b) => b - a).slice(0, 4);

/** Company managers (and the platform admin, who signs in as one) invite anyone; everyone else only company managers. */
export function invitable(role, ids, companyIds) {
  if (role === 'company') return { ok: true, refused: [] };
  const co = new Set(companyIds);
  const refused = ids.filter((id) => !co.has(id));
  return { ok: !refused.length, refused };
}

/** The reminders already past at this start time, so a meeting booked for this afternoon doesn't fire "tomorrow". */
export const passedReminders = (reminders, startsAt, now = Date.now()) => reminders.filter((m) => new Date(startsAt).getTime() - m * 60000 <= now);

export const reminderLabel = (m) => (m === 0 ? 'At the start' : m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? '' : 's'} before` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'} before` : `${m} minutes before`);

// The Add to calendar link: one per event and person, so it can't be swapped for someone else's
export const icsToken = (eventId, userId) => `${eventId}.${userId}.${hmac(`${eventId}:${userId}`, 'ics')}`;
export function readIcsToken(token) {
  const [eventId, userId, sig] = String(token || '').split('.');
  if (!eventId || !userId || !sig) return null;
  const want = hmac(`${eventId}:${userId}`, 'ics');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return { eventId, userId };
}

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDay = (d) => londonParts(d).date.replace(/-/g, '');
const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
// Lines longer than 75 octets fold onto a continuation line starting with a space (RFC 5545)
function fold(line) {
  const out = [];
  let rest = Buffer.from(line);
  while (rest.length > 75) {
    let cut = out.length ? 74 : 75;
    while (cut > 0 && (rest[cut] & 0xc0) === 0x80) cut--;
    out.push(rest.subarray(0, cut).toString());
    rest = rest.subarray(cut);
  }
  out.push(rest.toString());
  return out.join('\r\n ');
}

/** Where, as one line: the venue, HQ or address, the phone number or the video link. */
export function whereText(e) {
  if (e.where_kind === 'venue') return [e.venue_name, e.venue_address].filter(Boolean).join(', ');
  if (e.where_kind === 'hq') return ['Head office', e.hq_address].filter(Boolean).join(', ');
  if (e.where_kind === 'address') return e.address || '';
  if (e.where_kind === 'phone') return e.phone ? `Phone call: ${e.phone}` : 'Phone call';
  if (e.where_kind === 'video') return e.video_url || 'Video call';
  return '';
}

/** One event as an .ics file Outlook, Apple and Google can add. Published, not an invite: replies are made in the app. */
export function buildIcs(e, { company = 'Opulence', appUrl = '' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${icsText(company)}//Calendar//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${e.id}@calendar`, `SEQUENCE:${e.seq || 0}`, `DTSTAMP:${icsDate(e.updated_at || new Date())}`,
    ...(e.all_day
      // All-day events run from local midnight to the midnight after their last day, which is DTEND as the spec wants it
      ? [`DTSTART;VALUE=DATE:${icsDay(e.starts_at)}`, `DTEND;VALUE=DATE:${icsDay(e.ends_at)}`]
      : [`DTSTART:${icsDate(e.starts_at)}`, `DTEND:${icsDate(e.ends_at)}`]),
    `SUMMARY:${icsText(e.cancelled_at ? `Cancelled: ${e.title}` : e.title)}`,
  ];
  const where = whereText(e);
  if (where) lines.push(`LOCATION:${icsText(where)}`);
  const desc = [e.organiser_name && `Organiser: ${e.organiser_name}`, e.notes, e.video_url && e.where_kind === 'video' && `Join: ${e.video_url}`, appUrl && `Reply or see who's coming: ${appUrl}`].filter(Boolean).join('\n\n');
  if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
  if (e.video_url && e.where_kind === 'video') lines.push(`URL:${icsText(e.video_url)}`);
  lines.push(`STATUS:${e.cancelled_at ? 'CANCELLED' : 'CONFIRMED'}`);
  for (const m of e.reminders || []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

const overlaps = (a, b) => new Date(a.starts_at) < new Date(b.ends_at) && new Date(a.ends_at) > new Date(b.starts_at);

/**
 * Shifts that clash with a meeting, as warnings ("Sam is on at The Loft 20:00–02:00"). A meeting at the same venue
 * during their shift is an on-site check-in: no warning.
 */
export function shiftClashes(meeting, shifts) {
  return shifts.filter((s) => overlaps(meeting, s) && !(meeting.where_kind === 'venue' && meeting.venue_id && meeting.venue_id === s.venue_id))
    .map((s) => `${s.person} ${s.self ? 'are' : 'is'} on at ${s.venue_name} ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`);
}

/**
 * The next free times for everyone, from `from`, in 30-minute steps between 08:00 and 20:00 London time, over two weeks.
 * busy: [{ starts_at, ends_at }] for all attendees together.
 */
export function suggestTimes(from, minutes, busy, { count = 3, now = Date.now(), dayStart = 8, dayEnd = 20 } = {}) {
  const step = 30 * 60000;
  const len = minutes * 60000;
  let t = Math.ceil(Math.max(new Date(from).getTime(), now) / step) * step;
  const stop = t + 14 * 86400000;
  const spans = busy.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
  const out = [];
  for (; t < stop && out.length < count; t += step) {
    const a = londonParts(t);
    const b = londonParts(t + len);
    const startMin = a.hour * 60 + a.minute;
    const endMin = b.hour * 60 + b.minute;
    if (a.date !== b.date && endMin !== 0) continue;
    if (startMin < dayStart * 60 || (endMin === 0 ? 24 * 60 : endMin) > dayEnd * 60) continue;
    if (spans.some(([s, e]) => s < t + len && e > t)) continue;
    out.push({ starts_at: new Date(t).toISOString(), ends_at: new Date(t + len).toISOString() });
    t += len - step;
  }
  return out;
}
