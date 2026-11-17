// A plain staff request typed in chat ("2 door staff Saturday 9pm-3am", "every Fri and Sat 10pm to 2am, 3 doormen")
// read by rules into the same shape the AI returns, so most requests cost no credits. Anything it isn't sure of
// (a change or cancel, two different dates, no times, "next Saturday") returns null and goes to the AI as before.
// The result only fills the Request cover form; the person checks it before sending.

const DAY_RE = /\b(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?s?\b/g;
const dowOf = (w) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].findIndex((d) => w.startsWith(d)) + 1;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2 };
const ROLE_WORDS = [
  [/\b(door ?staff|door ?supervisors?|door ?men|doormen|bouncers?|door)\b/, 'door'],
  [/\b(stewards?)\b/, 'steward'],
  [/\b(guards?|security officers?|security)\b/, 'guard'],
];
// Words that mean they are changing or cancelling something already booked: the AI handles those
const NOT_NEW = /\b(cancel|change|move|instead|swap|extra|more|less|fewer|reduce|replace|add another|except|not)\b/;
const COUNT_NOUN = '(?:door(?: ?staff| ?supervisors?| ?men)?|doormen|bouncers?|stewards?|guards?|security(?: officers?| staff)?|officers?|staff|people|persons?|sia)';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseIso = (s) => new Date(`${s}T00:00:00Z`);
const isoDow = (d) => ((d.getUTCDay() + 6) % 7) + 1;

// One end of a time range: with am/pm, or 24-hour with minutes ("21:00"); a bare "9" is not enough
function clock(h, m, ap) {
  h = Number(h); m = Number(m || 0);
  if (m > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  } else if (h > 24) return null;
  return `${pad(h % 24)}:${pad(m)}`;
}

/** "9pm-3am", "21:00 to 03:00", "from 10pm till 2am", "10-2am" → { start, end } */
export function timeRange(s) {
  const T = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?';
  const m = s.match(new RegExp(`\\b${T}\\s*(?:-|–|to|until|til|till)\\s*${T}(?![\\d/])`));
  if (!m) return null;
  let [, h1, m1, a1, h2, m2, a2] = m;
  // "10-2am": 10 at night to 2 in the morning; "9-11pm": both in the evening
  if (!a1 && a2 && !m1) a1 = a2 === 'am' && Number(h1) > Number(h2) ? 'pm' : a2;
  if ((!a1 && !m1) || (!a2 && !m2)) return null; // "9-3" alone: hours or a date range, not sure
  const start = clock(h1, m1, a1);
  const end = clock(h2, m2, a2);
  if (!start || !end || start === end) return null;
  return { start, end, match: m[0] };
}

/** "2 door staff", "two doormen", "x3", "3x security" → a number */
export function headcount(s) {
  const n = (w) => (/^\d+$/.test(w) ? Number(w) : NUM[w]);
  let m = s.match(new RegExp(`\\b(\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple of)\\s*(?:x\\s*)?${COUNT_NOUN}\\b`));
  if (m) return n(m[1].replace(' of', ''));
  m = s.match(/\b(?:x\s?(\d{1,2})|(\d{1,2})\s?x)\b/);
  if (m) return Number(m[1] || m[2]);
  return undefined;
}

export function roleOf(s, codes) {
  for (const [re, code] of ROLE_WORDS) if (re.test(s) && codes.includes(code)) return code;
  return undefined;
}

/** One date: today/tonight/tomorrow, a weekday ("Saturday" = the coming one, today counts), "21 Nov", "21/11", "2026-11-21" */
function oneDate(s, today) {
  const t = parseIso(today);
  const found = [];
  if (/\b(today|tonight)\b/.test(s)) found.push(today);
  if (/\btomorrow\b/.test(s)) { const d = new Date(t); d.setUTCDate(d.getUTCDate() + 1); found.push(iso(d)); }
  for (const m of s.matchAll(DAY_RE)) {
    const dow = dowOf(m[1]);
    const d = new Date(t); d.setUTCDate(d.getUTCDate() + ((dow - isoDow(t) + 7) % 7)); found.push(iso(d));
  }
  for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) found.push(`${m[1]}-${m[2]}-${m[3]}`);
  const dm = (day, mon) => {
    let d = new Date(Date.UTC(t.getUTCFullYear(), mon, day));
    if (d.getUTCDate() !== day) return null;
    if (iso(d) < today) d = new Date(Date.UTC(t.getUTCFullYear() + 1, mon, day));
    return iso(d);
  };
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\b/g)) {
    const mon = MONTHS.indexOf(m[2]);
    if (mon >= 0) found.push(dm(Number(m[1]), mon));
  }
  for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) found.push(dm(Number(m[1]), Number(m[2]) - 1));
  const uniq = [...new Set(found)];
  // A weekday and a date that agree are one date ("Sat 21 Nov"); two different dates are for the AI
  return uniq.length === 1 && uniq[0] ? uniq[0] : null;
}

/**
 * text: what the venue typed. today: 'YYYY-MM-DD' in London. codes: role codes.
 * Returns { intent:'new', shifts:[…] } or { intent:'new', recurrence:{…} } like the AI tool, or null when unsure.
 */
export function parseRequest(text, today, codes) {
  const raw = String(text || '');
  if (!raw.trim() || raw.length > 300) return null;
  const s = raw.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
  if (NOT_NEW.test(s) || /\bnext (?:week|mon|tue|wed|thu|fri|sat|sun)/.test(s)) return null;
  const times = timeRange(s);
  const count = headcount(s);
  if (!times || !count || count > 50) return null;
  // "until Christmas" after the times are taken out: an end date the rules don't read
  if (/\b(?:until|till|til)\b/.test(s.replace(times.match, ' '))) return null;
  const role = roleOf(s, codes);
  if (/\bevery\b|\beach\b|\bweekly\b|\bfortnight/.test(s)) {
    const dows = [...new Set([...s.matchAll(DAY_RE)].map((m) => dowOf(m[1])))].sort();
    if (!dows.length || /\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d\/\d|tomorrow|today|tonight/.test(s)) return null;
    return { intent: 'new', summary: raw.trim(), recurrence: {
      frequency: /fortnight|every other|alternate/.test(s) ? 'fortnightly' : 'weekly', role,
      days: dows.map((dow) => ({ dow, start: times.start, end: times.end, headcount: count })), start_date: today,
    } };
  }
  const date = oneDate(s, today);
  if (!date || date < today) return null;
  return { intent: 'new', summary: raw.trim(), shifts: [{ date, start: times.start, end: times.end, role, headcount: count }] };
}
