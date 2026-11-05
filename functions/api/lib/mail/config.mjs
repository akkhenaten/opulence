// Provider OAuth app keys: env vars when set (studio secrets), else the ones saved in Settings → Email (email_providers).
import { q } from '../db.mjs';
import { open } from './crypto.mjs';

const ENV = {
  google: () => ({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, tenant: null }),
  microsoft: () => ({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, tenant: process.env.MS_TENANT || null }),
};

let cache = null;
let loadedAt = 0;

/** Reads the saved keys (cached for a minute per warm Lambda). Call before using cfg(). */
export async function loadConfig() {
  if (cache && Date.now() - loadedAt < 60_000) return;
  const rows = await q('SELECT * FROM email_providers');
  setCache(rows);
}

function setCache(rows) {
  cache = {};
  for (const r of rows) {
    let secret = null;
    try {
      secret = open(r.secret_enc);
    } catch (e) {
      console.error('[email config]', r.provider, e.message);
    }
    cache[r.provider] = { client_id: r.client_id, client_secret: secret, tenant: r.tenant || null, secret_hint: secret ? `••••${secret.slice(-4)}` : null, updated_at: r.updated_at };
  }
  loadedAt = Date.now();
}

export const invalidate = () => { cache = null; };
export const setCacheForTest = (rows) => setCache(rows);

/** { client_id, client_secret, tenant, from_env, ... } for a provider. */
export function cfg(provider) {
  const env = ENV[provider]?.() || {};
  if (env.client_id && env.client_secret) return { ...env, from_env: true };
  return { ...(cache?.[provider] || {}), from_env: false };
}
