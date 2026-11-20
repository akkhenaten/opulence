// A venue's tile on the landing page: only what the public may see, never ids, addresses or notes

export const DEFAULT_BLURB = (name) => `Opulence is proud to provide door supervision and venue security for ${name}.`;

/** A website link the page can safely show, or null; "example.com" becomes "https://example.com" */
export function webUrl(s) {
  let u = String(s ?? '').trim();
  if (!u) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u}`;
  if (u.length > 300) return null;
  try {
    const p = new URL(u);
    return ['http:', 'https:'].includes(p.protocol) && p.hostname.includes('.') ? p.href : null;
  } catch {
    return null;
  }
}

/** The welcome line, one short paragraph without wrapping quotes */
export const cleanBlurb = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/^["“'‘]+|["”'’]+$/g, '').trim().slice(0, 220) || null;

// Postcode areas to the town shown on the tile (Scotland first; the rest of the UK can be added as venues arrive)
const AREAS = { EH: 'Edinburgh', G: 'Glasgow', AB: 'Aberdeen', DD: 'Dundee', IV: 'Inverness', PH: 'Perth', KY: 'Fife', FK: 'Stirling', KA: 'Ayrshire', ML: 'Lanarkshire', PA: 'Paisley', DG: 'Dumfries', TD: 'Borders' };
const TOWNS = ['Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Inverness', 'Perth', 'Stirling', 'Paisley', 'Falkirk', 'St Andrews', 'Ayr', 'Dumfries'];

/** The tile's town: the one set on the venue, else from its postcode, else a town named in its address */
export function cityOf(v) {
  const set = String(v.city ?? '').trim();
  if (set) return set;
  const area = String(v.postcode ?? '').trim().toUpperCase().match(/^([A-Z]{1,2})\d/)?.[1];
  if (area && AREAS[area]) return AREAS[area];
  const addr = String(v.address ?? '');
  return TOWNS.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(addr)) || null;
}

// A venue is welcomed as new on the landing page for a week after it first appears there, then goes back to normal by itself
export const NEW_DAYS = 7;
export const isNewVenue = (since, now = new Date()) => !!since && now - new Date(since) < NEW_DAYS * 864e5;

export const publicTile = (v, reviews = [], now = new Date()) => ({
  name: v.name,
  city: cityOf(v),
  blurb: v.website_blurb || DEFAULT_BLURB(v.name),
  photo: v.website_photo_url || null,
  url: v.website_url || null,
  reviews,
  // Only the flag, never the date
  ...(isNewVenue(v.website_since, now) ? { isNew: true } : {}),
});
