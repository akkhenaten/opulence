// Everyday rules shared by the feed module, its jobs and the tests: topics, badges, polls, events,
// celebrations, link safety and place search. No database access here.
import { fail } from './http.mjs';

export const BADGES = [
  { id: 'above', label: 'Above and beyond', emoji: '🌟' },
  { id: 'calm', label: 'Calm under pressure', emoji: '🧊' },
  { id: 'team', label: 'Great teamwork', emoji: '🤝' },
  { id: 'customer', label: 'Customer hero', emoji: '💬' },
  { id: 'eyes', label: 'Sharp eyes', emoji: '👀' },
  { id: 'safety', label: 'Safety first', emoji: '🦺' },
  { id: 'welcome', label: 'Welcome aboard', emoji: '👋' },
];
export const MUTE_DAYS = [1, 7, 30, 90];
export const VIDEO_MAX_S = 60;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const CELEBRATIONS = ['birthday', 'anniversary', 'welcome', 'qualification'];
export const FILTERS = ['all', 'announcements', 'shoutouts', 'events', 'polls', 'venues', 'saved'];

/** "#Wins at #VenueNews" → ['wins', 'venuenews'] */
export function parseTopics(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/(?:^|[^\p{L}\p{N}_&])#([\p{L}][\p{L}\p{N}_]{1,39})/gu)) {
    const t = m[1].toLowerCase();
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 10);
}

export const cleanTopic = (t) => String(t || '').replace(/^#/, '').toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 40);

/** The first web address in the text, if any. */
export function firstUrl(text) {
  const m = /\bhttps?:\/\/[^\s<>"')\]]+/i.exec(String(text || ''));
  return m ? m[0].replace(/[.,!?;:]+$/, '') : null;
}

/** Image type from the file's first bytes (uploads can lie about their type). */
export function sniffMime(bytes) {
  const b = bytes || [];
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Collage layout name for n photos (the app draws the same rule). */
export const photoLayout = (n) => (n <= 0 ? 'none' : n === 1 ? 'single' : n === 2 ? 'pair' : n === 3 ? 'one-two' : n === 4 ? 'grid' : 'two-three');

const pad = (n) => String(n).padStart(2, '0');
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Celebrations due on `today` (YYYY-MM-DD, London). people: [{ user_id, name, dob, start_date, prefs }]
 * Birthdays only with prefs.birthday; 29 Feb birthdays fall on 28 Feb in other years. Anniversaries from 1 year.
 */
export function celebrationsDue(people, today) {
  const [y, m, d] = today.split('-').map(Number);
  const md = `${pad(m)}-${pad(d)}`;
  const out = [];
  for (const p of people) {
    if (p.dob && p.prefs?.birthday === true) {
      let bmd = String(p.dob).slice(5, 10);
      if (bmd === '02-29' && !leap(y)) bmd = '02-28';
      if (bmd === md) out.push({ type: 'birthday', user_id: p.user_id, name: p.name, key: `birthday:${p.user_id}:${y}` });
    }
    if (p.start_date) {
      const s = String(p.start_date).slice(0, 10);
      let smd = s.slice(5);
      if (smd === '02-29' && !leap(y)) smd = '02-28';
      const years = y - Number(s.slice(0, 4));
      if (years >= 1 && smd === md) out.push({ type: 'anniversary', user_id: p.user_id, name: p.name, years, key: `anniversary:${p.user_id}:${y}` });
    }
  }
  return out;
}

/** Words for a celebration post. */
export function celebrationText(c) {
  const first = String(c.name || '').split(' ')[0];
  if (c.type === 'birthday') return `Happy birthday, ${first}! 🎂 Have a brilliant day from all the team.`;
  if (c.type === 'anniversary') return `${c.years} year${c.years === 1 ? '' : 's'} with the team today, ${first}! 🎉 Thank you for everything you do.`;
  if (c.type === 'welcome') return `Please welcome ${c.name} to the team! 👋 Say hello and help them feel at home.`;
  if (c.type === 'qualification') return `Congratulations ${first} on passing ${c.course || 'a course'}! 🎓`;
  return '';
}

/**
 * Poll results for one viewer. votes: [{ option_id, user_id }]
 * Results show after voting, when the poll always shows them, or once it is closed.
 * Anonymous polls never carry voter ids.
 */
export function pollTally(poll, votes, viewerId) {
  const voters = new Set(votes.map((v) => v.user_id));
  const mine = votes.filter((v) => v.user_id === viewerId).map((v) => v.option_id);
  const closed = !!poll.closed_at || (poll.closes_at && new Date(poll.closes_at) <= new Date());
  const show = closed || poll.show_results === 'always' || mine.length > 0;
  return {
    multi: poll.multi, anonymous: poll.anonymous, show_results: poll.show_results, closes_at: poll.closes_at, closed,
    total: voters.size, mine,
    options: poll.options.map((o) => {
      const of = votes.filter((v) => v.option_id === o.id);
      return { id: o.id, text: o.text, ...(show ? { count: of.length, ...(poll.anonymous ? {} : { voter_ids: of.map((v) => v.user_id).slice(0, 50) }) } : {}) };
    }),
    results_visible: show,
  };
}

/** Poll options from the composer: 2 to 6 distinct, non-empty. */
export function cleanPollOptions(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const text = String(raw?.text ?? raw ?? '').trim().slice(0, 120);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push({ id: `o${out.length + 1}`, text });
  }
  return out.slice(0, 6);
}

/** Going count, and who moves up from the waiting list (oldest first) when places free up. */
export function promoteWaitlist(rsvps, capacity) {
  const going = rsvps.filter((r) => r.answer === 'going').length;
  if (!capacity || going >= capacity) return [];
  return rsvps.filter((r) => r.answer === 'waitlist')
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
    .slice(0, capacity - going).map((r) => r.user_id);
}

/** True for addresses a link preview must never fetch (internal, loopback, link-local, metadata). */
export function isPrivateHost(ip) {
  const s = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!s) return true;
  if (s.includes(':')) {
    if (s === '::1' || s === '::') return true;
    if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80')) return true;
    const v4 = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    return v4 ? isPrivateHost(v4[1]) : false;
  }
  const p = s.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/**
 * A place search result (OpenStreetMap Nominatim, jsonv2 with addressdetails) → { name, address, lat, lng },
 * or null for anything that pins down a house or flat: those are people's homes.
 */
export function cleanPlace(r) {
  if (!r) return null;
  const a = r.address || {};
  if (a.house_number || a.house_name || ['house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace'].includes(r.type)
    || r.addresstype === 'house' || (r.addresstype === 'building' && !r.name)) return null;
  const name = r.name || a.road || String(r.display_name || '').split(',')[0];
  if (!name) return null;
  const town = a.city || a.town || a.village || a.suburb || a.county || '';
  return {
    name: String(name).slice(0, 120),
    address: [a.road !== name ? a.road : null, town, a.postcode?.split(' ')[0]].filter(Boolean).join(', ').slice(0, 200),
    lat: Number(Number(r.lat).toFixed(5)), lng: Number(Number(r.lon).toFixed(5)),
  };
}

/** Readable preview fields from an HTML page. */
export function parseMeta(html, url) {
  const head = String(html || '').slice(0, 200000);
  const tag = (re) => { const m = re.exec(head); return m ? decode(m[1]).trim() : ''; };
  const meta = (name) => tag(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || tag(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'));
  let image = meta('og:image') || meta('twitter:image');
  try { if (image) image = new URL(image, url).href; } catch { image = ''; }
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return {
    url,
    title: (meta('og:title') || meta('twitter:title') || tag(/<title[^>]*>([^<]*)<\/title>/i)).slice(0, 200),
    description: (meta('og:description') || meta('description') || meta('twitter:description')).slice(0, 300),
    site: (meta('og:site_name') || host).slice(0, 80),
    image: /^https?:\/\//.test(image) ? image : '',
  };
}
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** Company Everyday settings from the Settings screen, merged onto what is stored. */
export function cleanEverydaySettings(input, current = {}) {
  if (!input || typeof input !== 'object') fail(400, 'Invalid Everyday settings');
  const out = { shoutouts: current.shoutouts !== false, celebrations: { ...(current.celebrations || {}) }, featured_topics: current.featured_topics || [] };
  if ('shoutouts' in input) out.shoutouts = !!input.shoutouts;
  if (input.celebrations && typeof input.celebrations === 'object') {
    for (const k of CELEBRATIONS) if (k in input.celebrations) out.celebrations[k] = !!input.celebrations[k];
  }
  if (Array.isArray(input.featured_topics)) out.featured_topics = [...new Set(input.featured_topics.map(cleanTopic).filter(Boolean))].slice(0, 8);
  return out;
}

/** .ics text for an event (the app builds the same file offline; kept here for tests). */
export const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
