import { rgb } from 'pdf-lib';
import { one } from './db.mjs';
import { getObjectBytes } from './storage.mjs';

// The company's own branding: name, logo, one colour and the app style. Falls back to Orb Security's look.
export const DEFAULT_COLOR = '#C9A45C';

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

const HEX = /^#[0-9a-f]{6}$/i;
const DARK_TEXT = '#0B0B0C';
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const colorOf = (hex) => (HEX.test(hex || '') ? hex : DEFAULT_COLOR);
export const hexToRgb = (hex) => rgb(...channels(colorOf(hex)));

const luminance = (hex) => {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const toHex = (c) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

// Text on a solid fill of this colour: white or near-black, whichever reads better (always 4.5:1 or more),
// so any brand colour works for buttons
export const onColor = (hex) => (contrast(colorOf(hex), '#ffffff') >= contrast(colorOf(hex), DARK_TEXT) ? '#ffffff' : DARK_TEXT);

// The brand colour as text or thin lines on white paper: darkened until it reads (4.5:1)
export function inkColor(hex) {
  const h = colorOf(hex);
  let c = channels(h);
  for (let t = 0.1; contrast(toHex(c), '#ffffff') < 4.5 && t <= 1; t += 0.1) c = channels(h).map((v) => v * (1 - t));
  return toHex(c);
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
