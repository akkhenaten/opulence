// One door to the mail providers: picks the adapter, keeps the access token fresh, marks broken connections.
import { q } from '../db.mjs';
import { fail } from '../http.mjs';
import { seal, open } from './crypto.mjs';
import { MailError } from './common.mjs';
import { loadConfig } from './config.mjs';
import * as google from './google.mjs';
import * as microsoft from './microsoft.mjs';

export const PROVIDERS = { google, microsoft };
export const adapter = (p) => PROVIDERS[p] || fail(400, 'Unknown mail provider');

export const redirectUri = () => process.env.EMAIL_REDIRECT_URL || `${(process.env.APP_URL || '').replace(/\/$/, '')}/app/company/email/callback`;

// The token is gone for good: the person revoked access, changed their password, or the admin blocked the app
const DEAD = (e) => e.status === 400 && /invalid_grant|interaction_required|consent_required/i.test(`${e.code} ${e.message}`);

async function markBroken(account, e, status = 'reconnect') {
  await q('UPDATE email_accounts SET status = $2, last_error = $3, access_enc = NULL WHERE id = $1', [account.id, status, String(e.message || e).slice(0, 300)]);
}

/** A working access token for the account, refreshing (and re-sealing a rotated refresh token) when needed. */
export async function accessToken(account, force = false) {
  await loadConfig();
  if (!force && account.access_enc && account.access_expires && new Date(account.access_expires) > new Date(Date.now() + 60_000)) {
    return open(account.access_enc);
  }
  let t;
  try {
    t = await adapter(account.provider).refresh(open(account.token_enc));
  } catch (e) {
    if (e instanceof MailError && (DEAD(e) || e.status === 401)) {
      await markBroken(account, e);
      fail(409, `${account.address} needs reconnecting`, { reconnect: account.id });
    }
    throw e;
  }
  const access_enc = seal(t.access);
  const expires = new Date(t.expires);
  const token_enc = t.refresh ? seal(t.refresh) : account.token_enc;
  await q(`UPDATE email_accounts SET access_enc = $2, access_expires = $3, token_enc = $4,
             status = CASE WHEN status = 'reconnect' THEN status ELSE 'connected' END, last_error = NULL WHERE id = $1`,
  [account.id, access_enc, expires, token_enc]);
  Object.assign(account, { access_enc, access_expires: expires, token_enc });
  return t.access;
}

/** Runs fn(token, adapter) for the account; one retry with a fresh token on 401. Provider errors become clear HTTP errors. */
export async function withMail(account, fn) {
  const a = adapter(account.provider);
  try {
    try {
      return await fn(await accessToken(account), a);
    } catch (e) {
      if (!(e instanceof MailError) || e.status !== 401) throw e;
      return await fn(await accessToken(account, true), a);
    }
  } catch (e) {
    if (!(e instanceof MailError)) throw e;
    if (e.status === 401 || e.status === 403) {
      await markBroken(account, e);
      fail(409, `${account.address} needs reconnecting`, { reconnect: account.id });
    }
    if (e.status === 404) fail(404, 'That email is no longer there');
    if (e.status === 429) fail(429, 'The mail provider is busy, try again in a minute');
    fail(502, `${account.provider === 'google' ? 'Gmail' : 'Outlook'}: ${e.message}`);
  }
}
