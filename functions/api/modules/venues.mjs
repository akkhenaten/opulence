import { RULES } from '../lib/proof.mjs';
import { one, q, insert, update } from '../lib/db.mjs';
import { fail, required, pick, need } from '../lib/http.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { qrPayload } from '../lib/qr.mjs';
import { qrPosterPdf } from '../lib/pdf.mjs';
import crypto from 'node:crypto';
import { checkOwnPhoto, saveThumb, deleteObject, downloadUrl, getObjectBytes, headObject, publicUrl, putObject, photoUrls, thumbKeyOf } from '../lib/storage.mjs';
import { audit } from '../lib/audit.mjs';
import { CO, MGR, def, pub } from './_def.mjs';
import { getSettings } from './settings.mjs';
import { isSiteClient } from '../lib/siteClients.mjs';
import { cleanBlurb, publicTile, webUrl } from '../lib/siteVenues.mjs';
import { extract, HAIKU } from '../lib/ai.mjs';
import { feedbackShape, groupPublic, tickedPraise } from './reviews.mjs';
import { keepLogoBytes, keepLogoFromWeb, LOGO_MAX, LOGO_TYPES, lookUpAddress, lookUpLogos } from '../lib/venueLookup.mjs';

const VENUE_FIELDS = ['client_id', 'name', 'address', 'postcode', 'lat', 'lng', 'radius_m', 'phone', 'instructions', 'notes', 'photo_key', 'invoice_cycle', 'active', 'proof_rule', 'site_client',
  'on_website', 'city', 'website_blurb', 'website_url'];
const WEBSITE_FIELDS = ['site_client', 'on_website', 'city', 'website_blurb', 'website_url'];
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// A public copy of the venue photo for its tile on the landing page; HEIC and big files fall back to the small copy
async function publishPhoto(key) {
  if (!key) return null;
  for (const k of [key, thumbKeyOf(key)]) {
    const h = await headObject(k);
    const ext = h && PHOTO_TYPES[h.mime];
    if (!ext || h.size > 5 * 1024 * 1024) continue;
    const pubKey = `media/venues/${crypto.randomUUID()}.${ext}`;
    await putObject(pubKey, await getObjectBytes(k), h.mime);
    return publicUrl(pubKey);
  }
  return null;
}

// A venue whose photo predates its website tile gets the public copy the first time the tile is needed
async function websitePhoto(v) {
  if (v.website_photo_url || !v.photo_key) return v.website_photo_url || null;
  try {
    const url = await publishPhoto(v.photo_key);
    if (url) await q('UPDATE venues SET website_photo_url = $2 WHERE id = $1 AND website_photo_url IS NULL', [v.id, url]);
    return url;
  } catch (e) {
    console.warn('[venues] website photo', e.message);
    return null;
  }
}

const TILE_TOOL = {
  name: 'tile',
  description: 'The venue\'s city and its welcome line on the Opulence website.',
  input_schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'Town or city of the venue, e.g. Edinburgh; empty if unknown' },
      blurb: { type: 'string', description: '1-2 sentences, at most 220 characters' },
    },
    required: ['city', 'blurb'],
  },
};

/** AI: the welcome line for a venue's tile, and its city from the address */
export async function writeWebsite(v) {
  const { input } = await extract({
    model: HAIKU, module: 'website', tool: TILE_TOOL, max_tokens: 300,
    system: 'You write for Opulence Security & Services LTD, a Scottish door supervision and venue security company. '
      + 'Write 1-2 warm, professional British-English sentences (at most 220 characters) for the venue\'s tile on the Opulence website, '
      + 'welcoming it as a venue Opulence has begun looking after. Use only the venue name, its city and that Opulence provides door supervision and venue security. '
      + 'Never invent facts about the venue, its history, awards or customers. No quotation marks, no emoji. '
      + 'Also give the town or city from the address or postcode.',
    messages: [{ role: 'user', content: `Venue: ${v.name}\nAddress: ${v.address || 'unknown'}\nPostcode: ${v.postcode || 'unknown'}${v.city ? `\nCity: ${v.city}` : ''}` }],
  });
  return { city: String(input?.city || '').trim().slice(0, 60) || null, blurb: cleanBlurb(input?.blurb) };
}

export async function currentVenueRates(venueId, onDate = new Date().toISOString().slice(0, 10)) {
  return q(
    `SELECT DISTINCT ON (role) r.*, ro.name AS role_name FROM venue_rates r JOIN roles ro ON ro.code = r.role
      WHERE venue_id = $1 AND effective_from <= $2 AND stream_id IS NULL ORDER BY role, effective_from DESC`, [venueId, onDate]);
}

// Venue managers never see the security company's internal notes about their site
const clientView = (user, v) => {
  if (user.role !== 'venue') return v;
  const { notes, ...rest } = v;
  return rest;
};

// Lookups call other people's servers: a fair limit per manager (60 venues in 10 minutes, 25 at a time)
const BULK_MAX = 25;
const lookups = new Map();
function limitLookups(user, n) {
  const now = Date.now();
  const list = (lookups.get(user.id) || []).filter((t) => now - t < 600000);
  if (list.length + n > 60) fail(429, 'That is a lot of lookups. Try again in a few minutes.');
  for (let i = 0; i < n; i += 1) list.push(now);
  lookups.set(user.id, list);
  if (lookups.size > 1000) lookups.clear();
}

export async function setLogo(user, id, logo, meta) {
  const cur = await one('SELECT logo_key FROM venues WHERE id = $1', [id]);
  const v = await update('venues', id, logo);
  if (cur?.logo_key && cur.logo_key !== logo.logo_key && cur.logo_key.startsWith('media/venues/logos/')) await deleteObject(cur.logo_key).catch(() => {});
  await audit(user, 'venue.logo', 'venue', id, meta);
  // A new (or removed) logo updates Orb's setup card straight away; Orb's own approve decides that card itself
  if (meta?.via !== 'orb') await import('./venueSetup.mjs').then((m) => m.runVenueSetup({ venueIds: [id], lookups: 0 })).catch((e) => console.warn('[venues] setup check', e.message));
  return { id: v.id, logo_url: v.logo_url };
}

// The landing page's "what we save venues" figures. Venues are live; staff is the live officer count but never below our
// current team of about 35 until everyone is onboarded. A venue averages 3 shifts a week with 3 officers; each officer
// saves the venue about 10 minutes of admin a week and each shift about 5 minutes chasing a busy security manager.
// Valued at £16 an hour of venue admin time plus 15% employer NI. Totals only; the rate is not shown on the page
const SAVE = { STAFF_MIN: 35, SHIFTS: 3, OFFICER_MIN: 10, CHASE_MIN: 5, WEEKS: 52, RATE: 16, NI: 0.15 };
function venueStats(counts) {
  const venues = counts.venues, staff = Math.max(counts.staff, SAVE.STAFF_MIN);
  const week = staff * SAVE.OFFICER_MIN + venues * SAVE.SHIFTS * SAVE.CHASE_MIN;
  const hoursYear = Math.round(week * SAVE.WEEKS / 60);
  return { venues, staff, hoursYear, moneyYear: Math.round(hoursYear * SAVE.RATE * (1 + SAVE.NI) / 10) * 10 };
}

export const actions = {
  'venues.list': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    const rows = await q(
      `SELECT v.*, c.name AS client_name,
              (SELECT count(*) FROM shifts s WHERE s.venue_id = v.id AND s.status = 'published' AND s.starts_at > now()) AS upcoming_shifts,
              (SELECT count(*) FROM incidents i WHERE i.venue_id = v.id AND i.status <> 'closed') AS open_incidents
         FROM venues v LEFT JOIN clients c ON c.id = v.client_id
        WHERE ($1::uuid[] IS NULL OR v.id = ANY($1)) AND ($2::boolean OR v.active)
        ORDER BY v.active DESC, v.name`, [scope, !!b.include_inactive]);
    return Promise.all(rows.map(async (v) => ({ ...clientView(user, v), ...(await photoUrls(v.photo_key)) })));
  }),

  'venues.get': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id');
    await assertVenue(user, b.id);
    const v = need(await one('SELECT v.*, c.name AS client_name FROM venues v LEFT JOIN clients c ON c.id = v.client_id WHERE v.id = $1', [b.id]));
    const [contacts, security, rates, docs] = await Promise.all([
      q(`SELECT u.id, u.name, u.email, u.phone, u.status, u.client_id, array(SELECT x.venue_id FROM venue_contacts x WHERE x.user_id = u.id) AS venue_ids
           FROM venue_contacts vc JOIN users u ON u.id = vc.user_id WHERE vc.venue_id = $1 ORDER BY u.name`, [b.id]),
      q(`SELECT u.id, u.name, u.email, u.phone, u.status, u.client_id, array(SELECT x.venue_id FROM security_venues x WHERE x.user_id = u.id) AS venue_ids
           FROM security_venues sv JOIN users u ON u.id = sv.user_id WHERE sv.venue_id = $1 ORDER BY u.name`, [b.id]),
      user.role === 'venue' || canSeePay(user) ? currentVenueRates(b.id) : [],
      q("SELECT id, kind, title, expiry, created_at, mime FROM documents WHERE owner_type = 'venue' AND owner_id = $1 ORDER BY created_at DESC", [b.id]),
    ]);
    const fb = await one("SELECT count(*)::int AS n FROM venue_comments WHERE venue_id = $1 AND status = 'open'", [b.id]);
    return { ...clientView(user, v), photo_url: await downloadUrl(v.photo_key), contacts, security, rates, documents: docs, feedback_open: fb.n };
  }),

  // Company and security managers run venues; the client and invoicing set-up stay with the company
  'venues.save': def(MGR, async (b, { user }) => {
    if (typeof b.name === 'string') b.name = b.name.trim();
    const f = pick(b, VENUE_FIELDS);
    if (user.role !== 'company') { delete f.client_id; delete f.invoice_cycle; for (const k of WEBSITE_FIELDS) delete f[k]; }
    if (f.website_url !== undefined) {
      f.website_url = String(f.website_url ?? '').trim() ? webUrl(f.website_url) : null;
      if (f.website_url === null && String(b.website_url ?? '').trim()) fail(400, 'Enter a full website address, e.g. https://example.com');
    }
    if (f.website_blurb !== undefined) f.website_blurb = cleanBlurb(f.website_blurb);
    if (f.city !== undefined) f.city = String(f.city ?? '').trim().slice(0, 60) || null;
    if (f.on_website !== undefined) f.on_website = !!f.on_website;
    if (f.site_client === '') f.site_client = null;
    if (f.site_client && !isSiteClient(f.site_client)) fail(400, 'Unknown website client');
    if (f.proof_rule !== undefined && !RULES[f.proof_rule]) fail(400, 'Unknown clock-in rule');
    // Saving the radius in Site setup confirms it, so Orb stops asking
    if (f.radius_m !== undefined) f.radius_confirmed_at = new Date();
    if (b.id) await assertVenue(user, b.id);
    // A new venue photo must be an image this manager just uploaded; an unchanged key passes through
    if (f.photo_key !== undefined) {
      const cur = b.id ? await one('SELECT photo_key FROM venues WHERE id = $1', [b.id]) : null;
      if (f.photo_key !== (cur?.photo_key ?? null)) {
        f.photo_key = await checkOwnPhoto(user, f.photo_key, fail);
        f.website_photo_url = await publishPhoto(f.photo_key);
        if (f.photo_key) await saveThumb(user, f.photo_key, b.photo_thumb_key);
      }
    }
    let v;
    if (b.id) v = await update('venues', b.id, f);
    else {
      required(b, 'name');
      v = await insert('venues', f);
      if (user.role === 'security') await q('INSERT INTO security_venues (venue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [v.id, user.id]);
    }
    await audit(user, b.id ? 'venue.update' : 'venue.create', 'venue', v.id, f);
    // Orb's venue setup card for this venue closes as soon as the details are complete
    import('./venueSetup.mjs').then((m) => m.runVenueSetup({ venueIds: [v.id], lookups: 0 })).catch((e) => console.warn('[venues] setup check', e.message));
    // No welcome line of its own: the website shows the default line and the city from the address (siteVenues.publicTile).
    // AI writes one only when a manager taps Write with AI (venues.writeWebsite)
    if (v.on_website && v.photo_key && !v.website_photo_url) v.website_photo_url = await websitePhoto(v);
    return v;
  }),

  // "Write with AI" in venue → Details → Website: a suggestion only, saved with the form
  'venues.writeWebsite': def(CO, async (b, { user }) => {
    required(b, 'id');
    const v = need(await one('SELECT name, address, postcode, city FROM venues WHERE id = $1', [b.id]), 'Venue not found');
    const w = await writeWebsite({ ...v, ...Object.fromEntries(['name', 'address', 'postcode', 'city'].filter((k) => b[k] != null).map((k) => [k, b[k]])) });
    await audit(user, 'venue.ai_text', 'venue', b.id);
    return w;
  }),

  // "Let Orb fill this in" and Orb: where the venue is, from its website and OpenStreetMap. A suggestion only, nothing is saved.
  'venues.findAddress': def(MGR, async (b, { user }) => {
    required(b, 'id');
    await assertVenue(user, b.id);
    limitLookups(user, 1);
    const v = need(await one('SELECT id, name, city, website_url FROM venues WHERE id = $1', [b.id]), 'Venue not found');
    return { venue_id: v.id, name: v.name, ...(await lookUpAddress(v)) };
  }),

  // Orb's bulk lookup: the given venues, or every active venue still missing its address, postcode or map pin
  'venues.findAddresses': def(MGR, async (b, { user }) => {
    const scope = await venueScope(user);
    const given = Array.isArray(b.ids) ? b.ids.map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, BULK_MAX) : [];
    const ids = given.length ? given : null;
    const rows = await q(
      `SELECT id, name, city, website_url FROM venues
        WHERE ($1::uuid[] IS NULL OR id = ANY($1)) AND ($2::uuid[] IS NOT NULL OR (active AND (coalesce(address, '') = '' OR coalesce(postcode, '') = '' OR lat IS NULL)))
          AND ($3::uuid[] IS NULL OR id = ANY($3))
        ORDER BY name LIMIT ${BULK_MAX + 1}`, [ids, ids, scope]);
    if (!rows.length) return { found: [], not_found: [], note: ids ? 'None of those venues are yours to look up.' : 'Every venue already has an address, postcode and map pin.' };
    limitLookups(user, rows.length);
    const deadline = Date.now() + 100000;
    const found = [];
    const notFound = [];
    const notDone = [];
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < Math.min(rows.length, BULK_MAX)) {
        const v = rows[next++];
        if (Date.now() > deadline) { notDone.push(v.name); continue; }
        const r = await lookUpAddress(v).catch(() => ({ candidates: [] }));
        if (r.candidates.length) found.push({ venue_id: v.id, name: v.name, best: r.candidates[0], others: r.candidates.slice(1), website: r.website });
        else notFound.push(v.name);
      }
    }));
    found.sort((a, b) => a.name.localeCompare(b.name));
    return {
      found, not_found: notFound.sort(), not_done: notDone.concat(rows.length > BULK_MAX ? ['…and more: ask again for the rest'] : []),
      note: 'Suggestions only. Save each with venues.save (address, postcode, lat, lng) on the Confirm card and say where it came from.',
    };
  }),

  // Logos on the venue's website, checked to be real pictures; a suggestion only
  'venues.findLogo': def(MGR, async (b, { user }) => {
    required(b, 'id');
    await assertVenue(user, b.id);
    limitLookups(user, 1);
    const v = need(await one('SELECT id, name, city, website_url FROM venues WHERE id = $1', [b.id]), 'Venue not found');
    return { venue_id: v.id, name: v.name, ...(await lookUpLogos(v)) };
  }),

  // Use a logo found on the web: a copy is kept, so the venue's site going down never breaks it
  'venues.useLogo': def(MGR, async (b, { user }) => {
    required(b, 'id', 'url');
    await assertVenue(user, b.id);
    const logo = await keepLogoFromWeb(b.url);
    if (!logo) fail(400, "That picture can't be used as a logo. Pick another or upload one.");
    return setLogo(user, b.id, logo, { from: String(b.url).slice(0, 300) });
  }),

  // A logo the manager uploaded (files.uploadUrl purpose "photo"); '' or null removes it
  'venues.saveLogo': def(MGR, async (b, { user }) => {
    required(b, 'id');
    await assertVenue(user, b.id);
    if (!b.key) return setLogo(user, b.id, { logo_key: null, logo_url: null }, { removed: true });
    const key = await checkOwnPhoto(user, b.key, fail);
    const h = await headObject(key);
    if (!LOGO_TYPES[h?.mime] || h.size > LOGO_MAX) fail(400, 'The logo must be a PNG, JPEG or WebP picture under 1 MB');
    return setLogo(user, b.id, await keepLogoBytes(await getObjectBytes(key), h.mime), { uploaded: true });
  }),

  // The landing page: a tile for every venue shown on the website, with the reviews filed under its old card's slug
  // and the praise the office ticked. photos and hide stay empty for pages still cached from before.
  'venues.public': pub(async () => {
    const [published, praise, venues, counts] = await Promise.all([
      q("SELECT * FROM reviews WHERE status = 'published'"),
      tickedPraise(),
      q('SELECT id, name, city, address, postcode, photo_key, site_client, active, on_website, website_blurb, website_url, website_photo_url FROM venues ORDER BY name'),
      one("SELECT (SELECT count(*) FROM venues WHERE active)::int AS venues, (SELECT count(*) FROM officers o JOIN users u ON u.id = o.user_id WHERE o.status = 'active' AND u.status <> 'disabled' AND NOT u.system)::int AS staff"),
    ]);
    const shown = venues.filter((v) => v.active && v.on_website);
    await Promise.all(shown.map(async (v) => { v.website_photo_url = await websitePhoto(v); }));
    const pubBy = groupPublic(published);
    return {
      reviews: {},
      photos: {},
      hide: [],
      stats: venueStats(counts),
      tiles: shown.map((v) => publicTile(v, [
        ...((v.site_client && pubBy[v.site_client]) || []),
        ...praise.filter((c) => c.venue_id === v.id).map(feedbackShape),
      ])),
    };
  }),

  'venues.rates': def(['company', 'security', 'venue'], async (b, { user }) => {
    await assertVenue(user, b.venue_id);
    if (user.role === 'security' && !canSeePay(user)) fail(403, 'No access to rates');
    // stream_id NULL = the venue-wide rate; a stream's own rate wins on that stream's shifts
    return q(`SELECT r.*, ro.name AS role_name, vs.name AS stream_name FROM venue_rates r JOIN roles ro ON ro.code = r.role
                LEFT JOIN venue_streams vs ON vs.id = r.stream_id WHERE r.venue_id = $1 ORDER BY role, r.stream_id NULLS FIRST, effective_from DESC`, [b.venue_id]);
  }),

  // Per role on this venue's shifts (last 120 days and ahead): shifts with no charge rate on their date, the first such date,
  // and the timesheets waiting on one (Approve refuses them until there is a rate)
  'venues.rateGaps': def(CO, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    return q(
      `WITH sh AS (
         SELECT s.id, s.role, (s.starts_at AT TIME ZONE 'Europe/London')::date AS day FROM shifts s
          WHERE s.venue_id = $1 AND s.status <> 'cancelled' AND s.starts_at > now() - interval '120 days'
            AND NOT EXISTS (SELECT 1 FROM venue_rates vr WHERE vr.venue_id = s.venue_id AND vr.role = s.role AND (vr.stream_id IS NULL OR vr.stream_id = s.stream_id)
                              AND vr.effective_from <= (s.starts_at AT TIME ZONE 'Europe/London')::date))
       SELECT sh.role, count(DISTINCT sh.id)::int AS shifts, min(sh.day)::text AS first_day,
              count(t.id) FILTER (WHERE t.status IN ('pending','disputed') AND t.charge_rate IS NULL)::int AS waiting
         FROM sh LEFT JOIN shift_assignments a ON a.shift_id = sh.id LEFT JOIN timesheets t ON t.assignment_id = a.id
        GROUP BY sh.role`, [b.venue_id]);
  }),

  // One rate per role per date: saving again on the same date corrects it rather than stacking a duplicate
  'venues.saveRate': def(CO, async (b, { user }) => {
    required(b, 'venue_id', 'role', 'rate');
    await assertVenue(user, b.venue_id);
    need(await one('SELECT 1 FROM roles WHERE code = $1', [b.role]), 'Unknown role');
    const f = pick(b, ['venue_id', 'role', 'rate', 'night_uplift', 'weekend_uplift', 'bh_uplift', 'min_hours', 'effective_from', 'stream_id']);
    f.stream_id = f.stream_id || null;
    if (f.stream_id) need(await one('SELECT 1 FROM venue_streams WHERE id = $1 AND venue_id = $2', [f.stream_id, f.venue_id]), 'Choose a billing stream of this venue', 400);
    const n = (k, max) => { if (f[k] == null || f[k] === '') { delete f[k]; return; } f[k] = Number(f[k]); if (!Number.isFinite(f[k]) || f[k] < 0 || f[k] > max) fail(400, 'Check the rate, uplifts and minimum hours'); };
    n('rate', 1000); n('night_uplift', 500); n('weekend_uplift', 500); n('bh_uplift', 500); n('min_hours', 24);
    if (!(f.rate > 0)) fail(400, 'Enter a rate per hour');
    if (f.effective_from && !/^\d{4}-\d{2}-\d{2}$/.test(f.effective_from)) fail(400, 'Choose the date the rate starts');
    const same = f.effective_from && await one('SELECT id FROM venue_rates WHERE venue_id = $1 AND role = $2 AND effective_from = $3 AND stream_id IS NOT DISTINCT FROM $4', [f.venue_id, f.role, f.effective_from, f.stream_id]);
    const r = same ? await update('venue_rates', same.id, f) : await insert('venue_rates', f);
    await audit(user, 'venue.rate', 'venue', b.venue_id, r);
    return r;
  }),

  'venues.deleteRate': def(CO, async (b, { user }) => {
    await q('DELETE FROM venue_rates WHERE id = $1', [b.id]);
    await audit(user, 'venue.rate_delete', 'venue_rate', b.id);
    return { ok: true };
  }),

  'venues.qr': def(MGR, async (b, { user }) => {
    await assertVenue(user, b.id);
    const v = need(await one('SELECT * FROM venues WHERE id = $1', [b.id]));
    return { payload: qrPayload(v), version: v.qr_version };
  }),

  'venues.qrRegenerate': def(CO, async (b, { user }) => {
    const v = need(await one('UPDATE venues SET qr_version = qr_version + 1 WHERE id = $1 RETURNING *', [b.id]));
    await audit(user, 'venue.qr_regenerate', 'venue', v.id, { version: v.qr_version });
    return { payload: qrPayload(v), version: v.qr_version };
  }),

  'venues.qrPoster': def(MGR, async (b, { user }) => {
    await assertVenue(user, b.id);
    const v = need(await one('SELECT * FROM venues WHERE id = $1', [b.id]));
    return { filename: `QR-${v.name}.pdf`, pdf: await qrPosterPdf(v, qrPayload(v), await getSettings()) };
  }),

  'clients.list': def(CO, async () => q(
    `SELECT c.*, (SELECT count(*) FROM venues v WHERE v.client_id = c.id) AS venue_count,
            (SELECT count(DISTINCT u.id) FROM users u WHERE NOT u.system AND u.status <> 'disabled'
                AND (u.client_id = c.id OR u.id IN (SELECT vc.user_id FROM venue_contacts vc JOIN venues v ON v.id = vc.venue_id WHERE v.client_id = c.id))) AS contact_count,
            COALESCE((SELECT array_agg(v.id) FROM venues v WHERE v.client_id = c.id), '{}') AS venue_ids
       FROM clients c ORDER BY name`)),

  // A client with its venues and the people who speak for it: linked to the client, or managing one of its venues
  'clients.get': def(CO, async (b) => {
    required(b, 'id');
    const c = need(await one('SELECT * FROM clients WHERE id = $1', [b.id]), 'Client not found');
    const [venues, contacts] = await Promise.all([
      q('SELECT id, name, active, site_client FROM venues WHERE client_id = $1 ORDER BY active DESC, name', [b.id]),
      q(`SELECT u.id, u.name, u.email, u.role, u.status, COALESCE(u.client_id = $1, false) AS linked,
                COALESCE(array_agg(DISTINCT v.name) FILTER (WHERE v.name IS NOT NULL), '{}') AS venues
           FROM users u
           LEFT JOIN venue_contacts vc ON vc.user_id = u.id
           LEFT JOIN venues v ON v.id = vc.venue_id AND v.client_id = $1
          WHERE NOT u.system AND (u.client_id = $1 OR v.id IS NOT NULL)
          GROUP BY u.id ORDER BY u.status = 'disabled', u.name`, [b.id]),
    ]);
    return { ...c, venues, contacts };
  }),

  'clients.setVenue': def(CO, async (b, { user }) => {
    required(b, 'venue_id');
    if (b.client_id) need(await one('SELECT 1 FROM clients WHERE id = $1', [b.client_id]), 'Client not found');
    const v = need(await one('UPDATE venues SET client_id = $2 WHERE id = $1 RETURNING id, client_id', [b.venue_id, b.client_id || null]), 'Venue not found');
    await audit(user, 'venue.update', 'venue', v.id, { client_id: v.client_id });
    return v;
  }),

  'clients.save': def(CO, async (b) => {
    const f = pick(b, ['name', 'billing_email', 'billing_address', 'vat_number']);
    if (b.id) return update('clients', b.id, f);
    required(b, 'name');
    return insert('clients', f);
  }),
};
