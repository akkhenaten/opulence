// The company's app style: 'classic' (Day: light and warm), 'control' (Night: black and gold), 'soft' (neumorphic),
// 'glass' (frosted panels on a colourful blurred background) or 'flat' (no shadows, bold solid colours).
// Colours come from tokens in styles.css; here we set data-style on <html> and the accent taken
// from the brand colour (Opulence gold when none is set).
import { useSyncExternalStore } from 'react';

export const STYLES = ['classic', 'control', 'soft', 'glass', 'flat'];
export const BRAND_GOLD = '#C9A45C';
export const CONTROL_ACCENT = BRAND_GOLD;
const CONTROL_PANEL = '#131315';
const DARK_TEXT = '#0B0B0C';
// Browser chrome matches the top bar: black in Day and Night, the page colour in the light styles
const CHROME = { classic: '#0B0B0C', control: '#0B0B0C', soft: '#E7E3DB', glass: '#EEF0FB', flat: '#F2F4F7' };
// The page each light style's accent text has to read on (4.5:1)
const PAGE = { classic: '#ffffff', soft: '#E7E3DB', glass: '#F1F2FA', flat: '#F2F4F7' };
// Styles whose top bar and sidebar follow the page instead of the black chrome
export const OWN_CHROME = ['soft', 'glass', 'flat'];
const KEY = 'orb.style';
const ACCENT_VARS = ['--color-blue', '--color-blue-ink', '--color-blue-soft', '--color-blue-press', '--accent-fill', '--color-on-accent'];

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
export const mix = (hex, target, t) => toHex(channels(hex).map((c, i) => c + (channels(target)[i] - c) * t));

// The brand colour, or gold when none is set (or it's still the old Orb blue)
const accentOf = (brand) => (/^#[0-9a-f]{6}$/i.test(brand || '') && brand.toLowerCase() !== '#0a6cff' ? brand : BRAND_GOLD);
// Text on a solid fill of this colour: white or near-black, whichever reads better
export const onColor = (hex) => (contrast(hex, '#ffffff') >= contrast(hex, DARK_TEXT) ? '#ffffff' : DARK_TEXT);

// Accent colours for the light styles: the fill keeps the true colour, text on the page is darkened until it reads (4.5:1)
export function dayAccent(brand, page = '#ffffff') {
  const fill = accentOf(brand);
  let text = fill;
  for (let t = 0.1; contrast(text, page) < 4.5 && t <= 1; t += 0.1) text = mix(fill, '#000000', t);
  return {
    '--accent-fill': fill, '--color-blue': text, '--color-blue-ink': mix(text, '#000000', 0.18), '--color-on-accent': onColor(fill),
    '--color-blue-soft': mix(fill, '#ffffff', 0.86), '--color-blue-press': mix(fill, '#ffffff', 0.76),
  };
}

// The brand colour as text or thin lines on white paper (documents, certificates)
export const inkColor = (brand) => dayAccent(brand)['--color-blue'];

// Accent colours for Night: the fill keeps the true colour, text on dark is lightened until it reads (4.5:1)
export function controlAccent(brand) {
  const fill = accentOf(brand);
  let text = fill;
  for (let t = 0.1; contrast(text, CONTROL_PANEL) < 4.5 && t <= 1; t += 0.1) text = mix(fill, '#ffffff', t);
  return { '--accent-fill': fill, '--color-blue': text, '--color-blue-ink': mix(text, '#ffffff', 0.15), '--color-on-accent': onColor(fill) };
}

// Inline variables for an element (or <html>) showing the given style
export const styleVars = (style, brand) => (style === 'control' ? controlAccent(brand) : dayAccent(brand, PAGE[style]));

// Each style's own typeface, loaded the first time it is shown (Day's fonts are in index.html)
const FONTS = {
  control: 'family=IBM+Plex+Mono:wght@400;500;600',
  soft: 'family=Nunito:wght@400;500;600;700;800',
  glass: 'family=Outfit:wght@400;500;600;700',
  flat: 'family=Lato:wght@400;700;900',
};
const fontsLoaded = new Set();
export function loadStyleFonts(style) {
  if (!FONTS[style] || fontsLoaded.has(style) || typeof document === 'undefined') return;
  fontsLoaded.add(style);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?${FONTS[style]}&display=swap`;
  document.head.appendChild(l);
}

// The style showing right now (saved or previewed), for parts that draw differently per style
const listeners = new Set();
const current = () => (typeof document === 'undefined' ? 'classic' : document.documentElement.dataset.style || 'classic');
export const useAppStyle = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, current);

let saved = { style: 'classic', color: null };
function paint(style, color) {
  const s = STYLES.includes(style) ? style : 'classic';
  const root = document.documentElement;
  root.dataset.style = s;
  for (const k of ACCENT_VARS) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(styleVars(s, color))) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[s]);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', OWN_CHROME.includes(s) ? 'default' : 'black');
  loadStyleFonts(s);
  for (const f of listeners) f();
  return s;
}

// The company's saved style; remembered on this device so the next start paints it before React loads
export function applyStyle(style, color) {
  const s = paint(style, color);
  saved = { style: s, color: color || null };
  try { localStorage.setItem(KEY, JSON.stringify({ style: s, vars: styleVars(s, color) })); } catch { /* private mode */ }
}
// Settings preview: the whole app, this device only, until saved or restored
export const previewStyle = (style) => paint(style, saved.color);
export const restoreStyle = () => paint(saved.style, saved.color);
