// The company's app style: 'classic' (light, iOS feel) or 'control' (dark Control Room).
// Colours come from tokens in styles.css; here we only set data-style on <html> and, for
// Control Room, the accent taken from the brand colour (amber when none is set).
export const STYLES = ['classic', 'control'];
export const CONTROL_ACCENT = '#F5A524';
const CONTROL_PANEL = '#161B22';
const DARK_TEXT = '#0E1116';
const CHROME = { classic: '#F2F4F7', control: '#0E1116' };
const KEY = 'orb.style';
const ACCENT_VARS = ['--color-blue', '--color-blue-ink', '--accent-fill', '--color-on-accent'];

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

// Accent colours for Control Room: the fill keeps the true colour, text on dark is lightened until it reads (4.5:1)
export function controlAccent(brand) {
  const fill = /^#[0-9a-f]{6}$/i.test(brand || '') && brand.toLowerCase() !== '#0a6cff' ? brand : CONTROL_ACCENT;
  let text = fill;
  for (let t = 0.1; contrast(text, CONTROL_PANEL) < 4.5 && t <= 1; t += 0.1) text = mix(fill, '#ffffff', t);
  const on = contrast(fill, '#ffffff') >= contrast(fill, DARK_TEXT) ? '#ffffff' : DARK_TEXT;
  return { '--accent-fill': fill, '--color-blue': text, '--color-blue-ink': mix(text, '#ffffff', 0.15), '--color-on-accent': on };
}

// Inline variables for an element (or <html>) showing the given style
export const styleVars = (style, brand) => (style === 'control' ? controlAccent(brand) : {});

let fontsLoaded = false;
function loadControlFonts() {
  if (fontsLoaded || typeof document === 'undefined') return;
  fontsLoaded = true;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
}

let saved = { style: 'classic', color: null };
function paint(style, color) {
  const s = STYLES.includes(style) ? style : 'classic';
  const root = document.documentElement;
  root.dataset.style = s;
  for (const k of ACCENT_VARS) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(styleVars(s, color))) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[s]);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', s === 'control' ? 'black' : 'default');
  if (s === 'control') loadControlFonts();
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
