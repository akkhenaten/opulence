// Shared bits for the provider adapters.

export class MailError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

/** fetch → JSON (or bytes/text), throwing MailError with the provider's message on failure. */
export async function call(url, { token, method = 'GET', body, headers = {}, as = 'json', timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, {
      method, body, signal: ctrl.signal,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    });
  } catch (e) {
    throw new MailError(502, e.name === 'AbortError' ? 'The mail provider took too long' : 'The mail provider could not be reached');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data.error_description || data.error?.message || (typeof data.error === 'string' ? data.error : '') || `HTTP ${res.status}`;
    const code = typeof data.error === 'string' ? data.error : data.error?.code || data.error?.status;
    throw new MailError(res.status, msg, code);
  }
  if (res.status === 204 || res.status === 202) return null;
  if (as === 'bytes') return Buffer.from(await res.arrayBuffer());
  if (as === 'text') return res.text();
  return res.json().catch(() => null);
}

export const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)).toString();
export const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
export const JSONH = { 'Content-Type': 'application/json' };

/** Runs fn over items with at most n in flight; keeps order. */
export async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export const FOLDERS = ['inbox', 'sent', 'drafts', 'archive', 'trash'];
export const lower = (s) => String(s || '').trim().toLowerCase();
export const uniq = (a) => [...new Set(a.filter(Boolean))];
