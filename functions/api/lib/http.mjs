export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(data, statusCode = 200) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(data) };
}

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };
export const need = (cond, message = 'Not found', status = 404) => { if (!cond) fail(status, message); return cond; };

export function required(body, ...keys) {
  const missing = keys.filter((k) => body[k] === undefined || body[k] === null || body[k] === '');
  if (missing.length) fail(400, `Missing: ${missing.join(', ')}`);
}

// Pick only allowed keys from an object (used for updates)
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k] === '' && /(_date|expiry|dob|_at)$/.test(k) ? null : obj[k];
  return out;
}
