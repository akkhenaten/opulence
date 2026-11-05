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

export const publicTile = (v, reviews = []) => ({
  name: v.name,
  city: v.city?.trim() || null,
  blurb: v.website_blurb || DEFAULT_BLURB(v.name),
  photo: v.website_photo_url || null,
  url: v.website_url || null,
  reviews,
});
