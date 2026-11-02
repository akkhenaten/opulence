import { rgb } from 'pdf-lib';
import { one } from './db.mjs';
import { getObjectBytes } from './storage.mjs';

// The company's own branding: name, logo, one colour and the app style. Falls back to Orb Security's look.
export const DEFAULT_COLOR = '#0A6CFF';

export const brandOf = (s) => ({ name: s?.company_name || 'Orb Security', logo_url: s?.logo_url || null, color: s?.brand_color || DEFAULT_COLOR, style: s?.ui_style || 'classic' });

let cached = null;
let cachedAt = 0;
export async function getBrand() {
  if (!cached || Date.now() - cachedAt > 60_000) {
    cached = brandOf(await one('SELECT company_name, logo_url, brand_color, ui_style FROM settings WHERE id = 1'));
    cachedAt = Date.now();
  }
  return cached;
}
export const clearBrand = () => { cached = null; };

// Logo bytes for PDFs, kept per key (a new upload gets a new key)
const logos = new Map();
export async function logoBytes(key) {
  if (!key) return null;
  if (!logos.has(key)) {
    try { logos.set(key, await getObjectBytes(key)); } catch (e) { console.warn('[brand] logo not loaded:', e.message); return null; }
  }
  return logos.get(key);
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
export const hexToRgb = (hex) => rgb(...channels(/^#[0-9a-f]{6}$/i.test(hex || '') ? hex : DEFAULT_COLOR));

// White text on this colour must have at least 3:1 contrast (WCAG large text / buttons)
export function readable(hex) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05) >= 3;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
