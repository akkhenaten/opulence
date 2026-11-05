// Email bodies and addresses. The app also renders bodies in a sandboxed iframe with a strict CSP; this is the first layer.

const DROP_BLOCKS = /<(script|style\s+[^>]*src|iframe|object|embed|applet|frame|frameset|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const DROP_TAGS = /<\/?(script|iframe|object|embed|applet|frame|frameset|base|meta|link|form|input|button|textarea|select)\b[^>]*>/gi;

/** Strips scripts, frames, forms, event handlers and javascript: URLs from an HTML body. */
export function cleanHtml(html, { cid = {} } = {}) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(DROP_BLOCKS, '').replace(DROP_TAGS, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/\s(href|src|action|formaction|background|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'\s>]*\2?/gi, ' $1="#"');
  s = s.replace(/expression\s*\(/gi, 'x(');
  s = s.replace(/src\s*=\s*("|')cid:([^"']+)\1/gi, (m, q, id) => (cid[id] ? `src="${cid[id]}"` : 'src=""'));
  // Links open outside the app
  s = s.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
  return s;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const textToHtml = (t) => `<div style="white-space:pre-wrap">${escapeHtml(t)}</div>`;

/** Plain text from HTML, for snippets and Orb. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
export const isEmail = (s) => EMAIL.test(String(s || '').trim());

/** "Name <a@b.com>" → { name, email } */
export function parseAddr(s) {
  const t = String(s || '').trim();
  const m = t.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: '', email: t.toLowerCase() };
}

/** Splits a header list on commas outside quotes. */
export function parseAddrList(s) {
  const out = [];
  let cur = '', inQ = false, inA = false;
  for (const ch of String(s || '')) {
    if (ch === '"') inQ = !inQ;
    if (ch === '<') inA = true;
    if (ch === '>') inA = false;
    if (ch === ',' && !inQ && !inA) { if (cur.trim()) out.push(parseAddr(cur)); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(parseAddr(cur));
  return out.filter((a) => a.email);
}

/** Recipients as given by the app ([{name,email}] or strings), checked and de-duplicated. */
export function cleanRecipients(list) {
  const seen = new Set();
  const out = [];
  for (const x of [].concat(list || [])) {
    const a = typeof x === 'string' ? parseAddr(x) : { name: String(x?.name || '').trim(), email: String(x?.email || '').trim().toLowerCase() };
    if (!isEmail(a.email) || seen.has(a.email)) continue;
    seen.add(a.email);
    out.push(a);
  }
  return out;
}
