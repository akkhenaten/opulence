// Orb's venue setup cards: a venue missing its address, map pin, logo or a confirmed clock-in radius gets one card,
// with what Orb found online ready to save. Nothing is saved until a manager approves.
import { one, q, update } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { withdraw } from '../lib/notify.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { audit } from '../lib/audit.mjs';
import { lookUpAddress, lookUpLogos, postcodePin, keepLogoFromWeb } from '../lib/venueLookup.mjs';
import { webUrl } from '../lib/siteVenues.mjs';
import { buildIssues, cardReason, cardTitle, clampRadius, defaultActions, toRaise } from '../lib/venueSetup.mjs';
import { createItem, logActivity } from './ops.mjs';
import { setLogo } from './venues.mjs';
import { MGR, def } from './_def.mjs';

const KEYS_SIG = (keys) => keys.map((k) => `${k.key}:${k.sig}`).join('|');
// Web lookups per run: the rest wait for the next run (every 5 minutes), so a first run never stalls the jobs
const LOOKUPS_PER_RUN = 3;

async function findFor(v, keys) {
  const has = (k) => keys.some((m) => m.key === k);
  const [address, pin, logos] = await Promise.all([
    has('address') ? lookUpAddress(v).catch(() => null) : null,
    has('pin') ? postcodePin(v.postcode).catch(() => null) : null,
    has('logo') ? lookUpLogos(v).catch(() => null) : null,
  ]);
  return { address: address && { best: address.candidates?.[0] || null, website: address.website }, pin, logos: logos?.logos || [], website: logos?.website || null };
}

/** Raise, refresh or close venue setup cards. venueIds: only these venues (right after a manager changed one). */
export async function runVenueSetup({ venueIds = null, lookups = LOOKUPS_PER_RUN } = {}) {
  const venues = await q(
    `SELECT v.id, v.name, v.city, v.address, v.postcode, v.lat, v.lng, v.radius_m, v.radius_confirmed_at, v.logo_url, v.website_url,
            (SELECT count(*)::int FROM shifts s WHERE s.venue_id = v.id AND s.status = 'published' AND s.starts_at BETWEEN now() AND now() + interval '14 days') AS soon
       FROM venues v WHERE v.active AND ($1::uuid[] IS NULL OR v.id = ANY($1)) ORDER BY v.name`, [venueIds]);
  const [open, dismissed] = await Promise.all([
    q("SELECT * FROM ops_items WHERE kind = 'venue_setup' AND status = 'pending' AND ($1::uuid[] IS NULL OR venue_id = ANY($1))", [venueIds]),
    q('SELECT venue_id, issue_key, sig FROM venue_setup_dismissals WHERE ($1::uuid[] IS NULL OR venue_id = ANY($1))', [venueIds]),
  ]);
  let created = 0;
  let updated = 0;
  let left = lookups;
  const keep = new Set();
  for (const v of venues) {
    const keys = toRaise(v, dismissed.filter((d) => d.venue_id === v.id));
    if (!keys.length) continue;
    const card = open.find((c) => c.venue_id === v.id);
    const keysSig = KEYS_SIG(keys);
    if (card) keep.add(card.id);
    if (card && card.payload.keys_sig === keysSig) continue;
    if (left <= 0) continue;
    left -= 1;
    const issues = buildIssues(v, keys, await findFor(v, keys), { soon: v.soon });
    const payload = { venue_id: v.id, venue_name: v.name, severity: issues[0].severity, issues, keys_sig: keysSig, logo_preview: issues.find((i) => i.key === 'logo')?.actions[0]?.params.url || null };
    if (card) {
      await q('UPDATE ops_items SET title = $2, reason = $3, payload = $4 WHERE id = $1', [card.id, cardTitle(v, issues), cardReason(issues), payload]);
      updated++;
    } else {
      const it = await createItem({ kind: 'venue_setup', title: cardTitle(v, issues), reason: cardReason(issues), payload, venue_id: v.id, dedupe: `venue_setup:${v.id}:${keysSig}`, quiet: true });
      if (it) { keep.add(it.id); created++; }
    }
  }
  // Cards whose venue is now complete (or inactive) close by themselves
  const cleared = open.filter((c) => !keep.has(c.id));
  for (const c of cleared) await q("UPDATE ops_items SET status = 'done', decided_at = now(), result = $2 WHERE id = $1 AND status = 'pending'", [c.id, { auto_closed: true }]);
  await withdraw({ items: cleared.map((c) => c.id) });
  return { checked: venues.length, created, updated, cleared: cleared.length, waiting: venues.length && left <= 0 ? 'more next run' : undefined };
}

// Applies the ticked choices on a venue setup card (bulk approve sends none: the defaults are used)
export async function decideVenueSetup(it, b, user) {
  await assertVenue(user, it.venue_id);
  const issues = it.payload.issues || [];
  const chosen = new Set(b.edits?.actions || defaultActions(issues, user.role));
  const picked = issues.flatMap((i) => i.actions).filter((a) => chosen.has(a.id) && (!a.company_only || user.role === 'company'));
  if (!picked.length) fail(400, 'Tick at least one thing to apply, or decline the card');
  const v = need(await one('SELECT * FROM venues WHERE id = $1', [it.venue_id]), 'Venue not found');
  const done = [];
  const skipped = [];
  const f = {};
  for (const a of picked) {
    const p = a.params;
    if (a.kind === 'address') {
      if (String(v.address || '').trim() && String(v.postcode || '').trim()) { skipped.push('The address was already filled in'); continue; }
      f.address = p.address || v.address || '';
      f.postcode = p.postcode;
      if (p.lat != null && v.lat == null) { f.lat = p.lat; f.lng = p.lng; }
      done.push(`Saved the address ${[f.address, f.postcode].filter(Boolean).join(', ')}${f.lat != null ? ' and the map pin' : ''}`);
    } else if (a.kind === 'pin') {
      if (v.lat != null) { skipped.push('The map pin was already set'); continue; }
      f.lat = p.lat; f.lng = p.lng;
      done.push(`Dropped the map pin at ${v.postcode}`);
    } else if (a.kind === 'website') {
      if (v.website_url) { skipped.push('The website was already set'); continue; }
      const url = webUrl(p.url);
      if (url) { f.website_url = url; done.push(`Saved the website ${url}`); }
    } else if (a.kind === 'radius') {
      f.radius_m = clampRadius(b.edits?.radius_m ?? p.radius_m);
      f.radius_confirmed_at = new Date();
      done.push(`Confirmed the clock-in radius at ${f.radius_m} m`);
    } else if (a.kind === 'logo') {
      if (v.logo_url) { skipped.push('A logo was already set'); continue; }
      const logo = await keepLogoFromWeb(p.url).catch(() => null);
      if (!logo) { skipped.push("The logo couldn't be copied from their website; upload one in Site setup"); continue; }
      await setLogo(user, v.id, logo, { from: String(p.url).slice(0, 300), via: 'orb' });
      done.push('Saved the logo');
    }
  }
  if (Object.keys(f).length) {
    await update('venues', v.id, f);
    await audit(user, 'venue.update', 'venue', v.id, { ...f, via: 'orb' });
  }
  if (!done.length) fail(409, skipped.join('. ') || 'Nothing left to apply');
  return { done, skipped };
}

/** Declining a card (or one issue on it) keeps those details quiet until they change. */
export async function dismissVenueIssues(it, keys, user, reason = '') {
  for (const i of (it.payload.issues || []).filter((x) => keys.includes(x.key))) {
    await q(`INSERT INTO venue_setup_dismissals (venue_id, issue_key, sig, reason, dismissed_by) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (venue_id, issue_key) DO UPDATE SET sig = EXCLUDED.sig, reason = EXCLUDED.reason, dismissed_by = EXCLUDED.dismissed_by, created_at = now()`,
      [it.venue_id, i.key, i.sig, String(reason || '').slice(0, 300), user.id]);
  }
}

export const actions = {
  // One issue on a venue setup card: the rest of the card stays
  'ops.dismissVenueIssue': def(MGR, async (b, { user }) => {
    required(b, 'id', 'key');
    const it = need(await one("SELECT * FROM ops_items WHERE id = $1 AND kind = 'venue_setup'", [b.id]), 'Item not found');
    const scope = await venueScope(user);
    if (scope && !scope.includes(it.venue_id)) fail(403, 'No access to this item');
    if (it.status !== 'pending') fail(409, `Already ${it.status}`);
    const issue = need((it.payload.issues || []).find((i) => i.key === b.key), 'Issue not found');
    await dismissVenueIssues(it, [issue.key], user, b.reason);
    const rest = it.payload.issues.filter((i) => i.key !== b.key);
    if (rest.length) {
      await q('UPDATE ops_items SET payload = $2, title = $3, reason = $4 WHERE id = $1',
        [it.id, { ...it.payload, issues: rest, severity: rest[0].severity, keys_sig: null }, cardTitle({ name: it.payload.venue_name }, rest), cardReason(rest)]);
    } else {
      await q("UPDATE ops_items SET status = 'rejected', decided_by = $2, decided_at = now(), result = $3 WHERE id = $1", [it.id, user.id, { dismissed: true, reason: b.reason || '' }]);
      await withdraw({ items: [it.id] });
    }
    await audit(user, 'venue_setup.dismiss', 'venue', it.venue_id, { key: issue.key, reason: b.reason || '' });
    await logActivity('decision', `${user.name} dismissed: ${issue.title} (${it.payload.venue_name})`, { ref_type: 'ops_item', ref_id: it.id, venue_id: it.venue_id });
    return { ok: true, remaining: rest.length };
  }),
};
