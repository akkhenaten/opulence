// Calendar rules that need no database: who may invite whom, the .ics file and its signed link, reminder timing,
// clash wording and the next free times. modules/calendar.mjs does the reading and writing.
import crypto from 'node:crypto';
import { hmac } from './auth.mjs';
import { fmtTime, fmtDate, londonParts, addDays } from './time.mjs';

export const RESPONSES = ['accepted', 'maybe', 'declined'];
// A meeting; a task (a company manager books someone's time for a job); a block of my own time, which others see as Busy
export const KINDS = ['meeting', 'task', 'block'];
export const KIND_LABEL = { meeting: 'meeting', task: 'task', block: 'time block' };
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

/** The VEVENT lines for one event. Published, not an invite: replies are made in the app. */
export function icsEvent(e, { appUrl = '' } = {}) {
  const lines = [
    'BEGIN:VEVENT', `UID:${e.id}@calendar`, `SEQUENCE:${e.seq || 0}`, `DTSTAMP:${icsDate(e.updated_at || new Date())}`,
    ...(e.all_day
      // All-day events run from local midnight to the midnight after their last day, which is DTEND as the spec wants it
      ? [`DTSTART;VALUE=DATE:${icsDay(e.starts_at)}`, `DTEND;VALUE=DATE:${icsDay(e.ends_at)}`]
      : [`DTSTART:${icsDate(e.starts_at)}`, `DTEND:${icsDate(e.ends_at)}`]),
    `SUMMARY:${icsText(e.cancelled_at ? `Cancelled: ${e.title}` : e.title)}`,
  ];
  const where = whereText(e);
  if (where) lines.push(`LOCATION:${icsText(where)}`);
  const desc = [e.organiser_name && e.kind !== 'block' && `Organiser: ${e.organiser_name}`, e.notes, e.video_url && e.where_kind === 'video' && `Join: ${e.video_url}`, appUrl && `Reply or see who's coming: ${appUrl}`].filter(Boolean).join('\n\n');
  if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
  if (e.video_url && e.where_kind === 'video') lines.push(`URL:${icsText(e.video_url)}`);
  if (e.private) lines.push('CLASS:PRIVATE');
  if (e.transparent) lines.push('TRANSP:TRANSPARENT');
  lines.push(`STATUS:${e.cancelled_at ? 'CANCELLED' : e.tentative ? 'TENTATIVE' : 'CONFIRMED'}`);
  for (const m of e.reminders || []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:-PT${m}M`, 'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

/** Several events as one calendar: a repeating meeting's file, or someone's subscribe feed (name and refresh set). */
export function calendarIcs(events, { company = 'Opulence', name = '', appUrl = () => '' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${icsText(company)}//Calendar//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  // Outlook, Apple and Google check a subscribed calendar about every hour (Google decides for itself)
  if (name) lines.push(`X-WR-CALNAME:${icsText(name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H');
  for (const e of events) lines.push(...icsEvent(e, { appUrl: appUrl(e) }));
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** One event as an .ics file Outlook, Apple and Google can add. */
export const buildIcs = (e, { company = 'Opulence', appUrl = '' } = {}) => calendarIcs([e], { company, appUrl: () => appUrl });

// The subscribe link: a long random token per person, kept in calendar_feeds; resetting it turns the old link off
export const newFeedToken = () => crypto.randomBytes(32).toString('base64url');
export const goodFeedToken = (t) => /^[A-Za-z0-9_-]{43}$/.test(String(t || ''));

// ---- Repeating meetings: each time is its own row sharing a series_id, so one can be moved or cancelled alone ----
export const REPEATS = { daily: 'daily', weekly: 'weekly', fortnightly: 'every two weeks', monthly: 'monthly' };
export const MAX_REPEATS = 100;
export const MAX_REPEAT_DAYS = 366;

// London wall-clock time to an instant, right on both sides of the clock change
function fromLondon(date, hour, minute) {
  const wall = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const offset = (t) => {
    const p = londonParts(t);
    return Date.parse(`${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00Z`) - Math.floor(t / 60000) * 60000;
  };
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
function addMonths(date, n, day) {
  const [y, m] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

/** The repeat rule from the form, checked: { freq, count } or { freq, until } (a London date), or null for no repeat. */
export function cleanRepeat(r, startsAt, now = Date.now()) {
  if (!r || !REPEATS[r.freq]) return null;
  const startDay = londonParts(startsAt).date;
  if (r.until) {
    const until = String(r.until).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= startDay) throw new Error('The repeat must end after the first date');
    if (daysBetween(londonParts(now).date, until) > MAX_REPEAT_DAYS) throw new Error('Repeats can run up to a year ahead');
    return { freq: r.freq, until };
  }
  const count = Math.trunc(Number(r.count));
  if (!(count >= 2)) throw new Error('Choose how many times it repeats');
  if (count > MAX_REPEATS) throw new Error(`Repeats can run up to ${MAX_REPEATS} times`);
  return { freq: r.freq, count };
}

/** Every time of a repeating event, first one included: London time kept across the clock change, monthly on the same day (or the month's last). */
export function repeatTimes(startsAt, endsAt, rule) {
  const s = londonParts(startsAt);
  const e = londonParts(endsAt);
  const endDays = daysBetween(s.date, e.date);
  const day = Number(s.date.slice(8, 10));
  const out = [];
  for (let i = 0; out.length < MAX_REPEATS; i++) {
    const date = rule.freq === 'monthly' ? addMonths(s.date, i, day) : addDays(s.date, i * { daily: 1, weekly: 7, fortnightly: 14 }[rule.freq]);
    if (rule.until && date > rule.until) break;
    if (rule.count && out.length >= rule.count) break;
    out.push({ starts_at: fromLondon(date, s.hour, s.minute).toISOString(), ends_at: fromLondon(addDays(date, endDays), e.hour, e.minute).toISOString() });
  }
  return out;
}

/** "Repeats weekly, 10 times" / "Repeats monthly until 20 Mar 2027" */
export function repeatText(rule, times) {
  if (!rule) return '';
  return `Repeats ${REPEATS[rule.freq]}, ${rule.until ? `until ${fmtDate(rule.until)}` : `${times ?? rule.count} times`}`;
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

// Paid meetings and tasks: the rate typed for one (blank: each officer's usual rate), and what was held
export const MAX_PAY_RATE = 500;
export function cleanPayRate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Math.round(Number(String(v).replace(/[£,\s]/g, '')) * 100) / 100;
  if (!Number.isFinite(n) || n <= 0) throw new Error('Type the rate per hour, e.g. 12.50, or leave it blank for each officer’s usual rate');
  if (n > MAX_PAY_RATE) throw new Error(`A rate can be up to £${MAX_PAY_RATE} an hour`);
  return n;
}

export const payHours = (start, end) => Math.round(((new Date(end) - new Date(start)) / 3600000) * 100) / 100;

/**
 * Who was paid for what. people: the officers on it ({ officer_id, response }); choices: { [officer_id]: 'booked' |
 * 'absent' | { starts_at, ends_at } } (missing: as booked unless they declined). Times must be within 12 hours of the
 * booked ones and last up to 16 hours.
 */
export function heldRows(e, people, choices = {}) {
  return people.map((p) => {
    const c = choices[p.officer_id] ?? (p.response === 'declined' ? 'absent' : 'booked');
    if (c === 'absent') return { officer_id: p.officer_id, attended: false, starts_at: null, ends_at: null, hours: 0 };
    const t = c === 'booked' ? { starts_at: e.starts_at, ends_at: e.ends_at } : c;
    const start = new Date(t?.starts_at);
    const end = new Date(t?.ends_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Choose the times they were there');
    if (end <= start) throw new Error('The end must be after the start');
    if (end - start > 16 * 3600000) throw new Error('Paid time can be up to 16 hours');
    const far = 12 * 3600000;
    if (Math.abs(start - new Date(e.starts_at)) > far || Math.abs(end - new Date(e.ends_at)) > far) throw new Error('The times must be on the day it was booked');
    return { officer_id: p.officer_id, attended: true, starts_at: start.toISOString(), ends_at: end.toISOString(), hours: payHours(start, end) };
  });
}

/** The pay statement line: "Meeting: Toolbox talk · 20 Nov 2026 14:00–15:30" */
export const payLineText = (e, start, end) => `${e.kind === 'task' ? 'Task' : 'Meeting'}: ${e.title} · ${fmtDate(start)} ${fmtTime(start)}–${fmtTime(end)}`;
