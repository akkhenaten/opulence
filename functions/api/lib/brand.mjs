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
export const clearBrand = () => { cached = null; sender = null; footer = null; };

// Who app emails come from: the company name as the sender name, and replies going to the company's own email.
// Kept apart from getBrand, which is public.
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
export const senderOf = (s) => {
  const fromName = String(s?.company_name || 'Orb Security').replace(/[\r\n"<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Orb Security';
  const email = String(s?.company_email || '').trim();
  return EMAIL.test(email) ? { fromName, replyTo: email } : { fromName };
};
let sender = null;
let senderAt = 0;
export async function getSender() {
  if (!sender || Date.now() - senderAt > 60_000) {
    sender = senderOf(await one('SELECT company_name, company_email FROM settings WHERE id = 1'));
    senderAt = Date.now();
  }
  return sender;
}

// The company footer on every email: name, address, phone and email, company and VAT numbers, from Settings.
// Blank details are left out, with their separators.
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
export const footerOf = (s) => {
  const address = String(s?.company_address || '').split(/\r?\n/).map(clean).filter(Boolean).join(', ').replace(/,(\s*,)+/g, ',');
  const phone = clean(s?.company_phone);
  const email = clean(s?.company_email);
  const reg = [s?.company_number && `Company no. ${clean(s.company_number)}`, s?.vat_number && `VAT ${clean(s.vat_number)}`].filter(Boolean);
  return {
    name: clean(s?.company_name) || 'Orb Security', address, phone, email: EMAIL.test(email) ? email : '', reg,
    logo_url: s?.logo_url || null, color: s?.brand_color || DEFAULT_COLOR,
  };
};
let footer = null;
let footerAt = 0;
export async function getFooter() {
  if (!footer || Date.now() - footerAt > 60_000) {
    footer = footerOf(await one(`SELECT company_name, company_address, company_phone, company_email, company_number, vat_number, logo_url, brand_color
      FROM settings WHERE id = 1`));
    footerAt = Date.now();
  }
  return footer;
}

/** The footer as email HTML (plain blocks, so the text part reads well too). logo: the mailbox version, with logo and a brand-colour rule. */
export function footerHtml(f, { logo = false } = {}) {
  const link = 'color:#6B7280;text-decoration:none';
  const contact = [
    f.phone && `<a href="tel:${esc(f.phone.replace(/[^\d+]/g, ''))}" style="${link}">${esc(f.phone)}</a>`,
    f.email && `<a href="mailto:${esc(f.email)}" style="${link}">${esc(f.email)}</a>`,
  ].filter(Boolean).join(' · ');
  const lines = [
    `<div style="font-weight:700;color:#374151">${esc(f.name)}</div>`,
    f.address && `<div>${esc(f.address)}</div>`,
    contact && `<div>${contact}</div>`,
    f.reg.length && `<div>${f.reg.map(esc).join(' · ')}</div>`,
  ].filter(Boolean).join('');
  const top = logo ? `border-top:2px solid ${esc(f.color)};padding-top:12px;margin-top:16px;` : '';
  const img = logo && f.logo_url
    ? `<img src="${esc(f.logo_url)}" alt="${esc(f.name)}" height="28" style="display:block;height:28px;max-width:180px;object-fit:contain;margin-bottom:8px">` : '';
  return `<div data-co-footer="1" style="${top}font-family:-apple-system,Segoe UI,sans-serif;font-size:12px;line-height:1.5;color:#6B7280">${img}${lines}</div>`;
}

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
