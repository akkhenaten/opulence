// Email: company users connect their own Gmail / Google Workspace or Outlook / Microsoft 365 mailbox (or a shared one),
// then read, reply and compose in the app. Mail is read live from the provider; only a small per-thread cache is kept
// (lib/mail). A personal mailbox is only ever visible to its owner; a shared one to the people it is shared with.
import crypto from 'node:crypto';
import { one, q, tx } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { randomToken } from '../lib/auth.mjs';
import { audit } from '../lib/audit.mjs';
import { claude, SONNET, HAIKU } from '../lib/ai.mjs';
import { putObject, downloadUrl, headObject, getObjectBytes } from '../lib/storage.mjs';
import { fmtDate, fmtTime } from '../lib/time.mjs';
import { seal, open, pkce, hasKey } from '../lib/mail/crypto.mjs';
import { cfg, invalidate, loadConfig } from '../lib/mail/config.mjs';
import { adapter, PROVIDERS, redirectUri, withMail } from '../lib/mail/index.mjs';
import { mapLimit, FOLDERS, lower, uniq } from '../lib/mail/common.mjs';
import { cleanHtml, cleanRecipients, escapeHtml, htmlToText, isEmail, textToHtml } from '../lib/mail/html.mjs';
import { footerHtml, getFooter } from '../lib/brand.mjs';
import { def, CO } from './_def.mjs';

const NAME = { google: 'Google', microsoft: 'Microsoft' };
const MAX_BYTES = 20 * 1024 * 1024;
const PAGE = 25;
const FRESH_MS = 2 * 60_000;

// Accounts this person can open: their own, and shared ones they connected or were given
const VISIBLE = `(a.owner_user_id = $1 OR (a.shared AND (a.created_by = $1 OR EXISTS (
  SELECT 1 FROM email_account_access g WHERE g.account_id = a.id AND g.user_id = $1))))`;

/** Pure access rule (tested): owner, or a shared box created by or granted to this user. */
export function canUse(account, userId, grants = []) {
  if (!account) return false;
  if (!account.shared) return account.owner_user_id === userId;
  return account.created_by === userId || grants.includes(userId);
}

async function account(user, id) {
  need(id, 'Pick a mailbox', 400);
  const a = await one(`SELECT a.* FROM email_accounts a WHERE a.id = $2 AND ${VISIBLE}`, [user.id, id]);
  return need(a, 'Mailbox not found');
}

const visibleIds = async (user) => (await q(`SELECT a.id FROM email_accounts a WHERE ${VISIBLE}`, [user.id])).map((r) => r.id);

const publicAccount = (a, extra = {}) => ({
  id: a.id, provider: a.provider, address: a.address, display_name: a.display_name, shared: a.shared, status: a.status,
  last_error: a.status === 'connected' ? null : a.last_error, last_sync: a.last_sync, signature: a.signature, created_at: a.created_at, ...extra,
});

// The OAuth redirect must be registered with the provider: APP_URL when set, else the app's own address (until the domain is live)
function redirectFor(b) {
  if (process.env.EMAIL_REDIRECT_URL || process.env.APP_URL) return redirectUri();
  const o = String(b.origin || '');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) fail(400, 'The app address is not set yet');
  return `${o}/app/company/email/callback`;
}

const providersState = () => Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.configured()]));

// ---------- provider setup (Settings → Email) ----------

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT = /^(common|organizations|consumers|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9-]+(\.[a-z0-9-]+)+)$/i;

function setupView(provider) {
  const c = cfg(provider);
  return {
    configured: !!(c.client_id && c.client_secret), from_env: c.from_env, client_id: c.client_id || '',
    secret_hint: c.from_env ? (c.client_secret ? `••••${c.client_secret.slice(-4)}` : null) : c.secret_hint || null,
    tenant: c.tenant || '', updated_at: c.updated_at || null,
  };
}

// ---------- cache ----------

async function upsertThreads(accountId, threads) {
  for (const t of threads.filter(Boolean)) {
    await q(`INSERT INTO email_threads (account_id, thread_id, subject, snippet, from_name, from_addr, addrs, last_at, unread, starred, folder, message_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (account_id, thread_id) DO UPDATE SET subject = EXCLUDED.subject, snippet = EXCLUDED.snippet, from_name = EXCLUDED.from_name,
               from_addr = EXCLUDED.from_addr, addrs = EXCLUDED.addrs, last_at = EXCLUDED.last_at, unread = EXCLUDED.unread, starred = EXCLUDED.starred,
               folder = EXCLUDED.folder, message_count = EXCLUDED.message_count`,
    [accountId, t.id, t.subject.slice(0, 500), t.snippet.slice(0, 300), t.from_name.slice(0, 200), t.from_addr, t.addrs.slice(0, 100), t.last_at, t.unread, t.starred, t.folder, t.count]);
  }
}

const fromCache = (r) => ({
  id: r.thread_id, subject: r.subject, snippet: r.snippet, from_name: r.from_name, from_addr: r.from_addr, addrs: r.addrs,
  last_at: r.last_at, unread: r.unread, starred: r.starred, folder: r.folder, count: r.message_count,
});

/** Pulls changes for one account into the cache. Used by the 5-minute job and right after connecting. */
export async function syncAccount(acc, limit = 20) {
  return withMail(acc, async (tok, a) => {
    const r = await a.sync(tok, acc.sync_cursor);
    const ids = r.ids.slice(0, limit);
    const rows = await mapLimit(ids, 4, async (id) => ({ id, t: await a.threadSummary(tok, id).catch(() => undefined) }));
    await upsertThreads(acc.id, rows.map((x) => x.t));
    const gone = rows.filter((x) => x.t === null).map((x) => x.id);
    if (gone.length) await q('DELETE FROM email_threads WHERE account_id = $1 AND thread_id = ANY($2)', [acc.id, gone]);
    await q("UPDATE email_accounts SET sync_cursor = $2, last_sync = now(), status = 'connected', last_error = NULL WHERE id = $1", [acc.id, r.cursor || acc.sync_cursor]);
    return ids.length;
  });
}

// Live first page of the inbox, written to the cache; cached rows that dropped off the page are removed
async function refreshInbox(acc) {
  const { threads, next } = await withMail(acc, (tok, a) => a.listThreads(tok, { folder: 'inbox', max: PAGE }));
  await upsertThreads(acc.id, threads);
  const ids = threads.map((t) => t.id);
  const oldest = threads.length >= PAGE ? threads.reduce((m, t) => (t.last_at < m ? t.last_at : m), threads[0].last_at) : null;
  await q(`UPDATE email_threads SET folder = 'archive' WHERE account_id = $1 AND folder = 'inbox' AND NOT (thread_id = ANY($2))
             AND ($3::timestamptz IS NULL OR last_at >= $3)`, [acc.id, ids, oldest]);
  await q('UPDATE email_accounts SET listed_at = now(), inbox_next = $2 WHERE id = $1', [acc.id, next]);
}

// ---------- matching to people in the system ----------

/** Who these addresses are: officers, venue contacts (→ venue), client billing emails, team members. email → [{type,id,label,link}] */
export async function matchAddrs(emails) {
  const list = uniq(emails.map(lower)).filter(isEmail);
  const out = {};
  if (!list.length) return out;
  const add = (email, m) => { (out[email] ||= []).some((x) => x.type === m.type && x.id === m.id) || out[email].push(m); };
  for (const r of await q(`SELECT id, lower(email) AS email, first_name || ' ' || last_name AS name FROM officers WHERE lower(email) = ANY($1)`, [list])) {
    add(r.email, { type: 'officer', id: r.id, label: r.name, link: `/company/staff/${r.id}` });
  }
  for (const r of await q(`SELECT v.id, v.name, lower(u.email) AS email, u.name AS person FROM users u
      JOIN venue_contacts vc ON vc.user_id = u.id JOIN venues v ON v.id = vc.venue_id WHERE lower(u.email) = ANY($1)`, [list])) {
    add(r.email, { type: 'venue', id: r.id, label: r.name, person: r.person, link: `/company/venues/${r.id}` });
  }
  for (const r of await q(`SELECT id, name, lower(billing_email) AS email FROM clients WHERE lower(billing_email) = ANY($1)`, [list])) {
    add(r.email, { type: 'client', id: r.id, label: r.name, link: `/company/clients?client=${r.id}` });
  }
  for (const r of await q(`SELECT id, name, lower(email) AS email FROM users WHERE lower(email) = ANY($1) AND role IN ('company','security') AND status <> 'disabled'`, [list])) {
    if (!out[r.email]?.some((m) => m.type === 'officer')) add(r.email, { type: 'team', id: r.id, label: r.name });
  }
  return out;
}

const matchesFor = (addrs, map, own) => {
  const seen = new Set();
  return addrs.filter((e) => e !== own).flatMap((e) => map[e] || []).filter((m) => !seen.has(m.type + m.id) && seen.add(m.type + m.id));
};

// Addresses that belong to a record, for its "Recent email" panel
async function recordAddrs(type, id) {
  if (type === 'officer') {
    return (await q(`SELECT lower(o.email) AS e FROM officers o WHERE o.id = $1 UNION SELECT lower(u.email) FROM officers o JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [id])).map((r) => r.e);
  }
  if (type === 'venue') {
    return (await q('SELECT lower(u.email) AS e FROM venue_contacts vc JOIN users u ON u.id = vc.user_id WHERE vc.venue_id = $1', [id])).map((r) => r.e);
  }
  if (type === 'client') {
    return (await q(`SELECT lower(billing_email) AS e FROM clients WHERE id = $1
      UNION SELECT lower(u.email) FROM venues v JOIN venue_contacts vc ON vc.venue_id = v.id JOIN users u ON u.id = vc.user_id WHERE v.client_id = $1`, [id])).map((r) => r.e);
  }
  if (type === 'user') return (await q('SELECT lower(email) AS e FROM users WHERE id = $1', [id])).map((r) => r.e);
  fail(400, 'Unknown record type');
}

// ---------- sending ----------

const header = (s) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 2000);

async function outgoing(user, acc, b) {
  const to = cleanRecipients(b.to), cc = cleanRecipients(b.cc), bcc = cleanRecipients(b.bcc);
  if (!b.draft && !to.length && !cc.length && !bcc.length) fail(400, 'Add at least one recipient');
  if (to.length + cc.length + bcc.length > 100) fail(400, 'Too many recipients');
  const prefix = `docs/email/${user.id.slice(0, 8)}/`;
  const attachments = [];
  let total = 0;
  for (const f of [].concat(b.attachments || []).slice(0, 20)) {
    if (!String(f?.key || '').startsWith(prefix)) fail(400, 'Upload the attachment first');
    const h = need(await headObject(f.key), 'Upload the attachment first', 400);
    total += h.size;
    if (total > MAX_BYTES) fail(400, 'Attachments can be up to 20 MB in total');
    attachments.push({ name: String(f.name || 'attachment').slice(0, 150), mime: h.mime || 'application/octet-stream', bytes: await getObjectBytes(f.key) });
  }
  // Forwarding: the original's attachments, fetched from the provider
  const fwd = b.forward;
  if (fwd?.message_id && fwd.attachments?.length) {
    await withMail(acc, async (tok, a) => {
      for (const f of fwd.attachments.slice(0, 20)) {
        const bytes = await a.getAttachment(tok, fwd.message_id, f.id);
        total += bytes.length;
        if (total > MAX_BYTES) fail(400, 'Attachments can be up to 20 MB in total');
        attachments.push({ name: String(f.name || 'attachment').slice(0, 150), mime: f.mime || 'application/octet-stream', bytes });
      }
    });
  }
  const r = b.reply;
  // Sent emails end with the company footer, above any quoted original (drafts get it when they are sent)
  let html = String(b.html || textToHtml(b.text || ''));
  if (!b.draft && !html.includes('data-co-footer')) html += `<br>${footerHtml(await getFooter(), { logo: true })}`;
  if (b.quote) html += `<br>${b.quote}`;
  return {
    from: { name: acc.display_name || user.name, email: acc.address }, to, cc, bcc,
    subject: header(b.subject).slice(0, 500), html: cleanHtml(html), attachments,
    reply: r?.thread_id ? { threadId: String(r.thread_id), id: r.id && String(r.id), messageId: header(r.message_id), references: header(r.references), all: !!r.all } : null,
  };
}

// ---------- Orb ----------

function threadText(t, own) {
  return t.messages.slice(-12).map((m) => {
    const body = (m.text || htmlToText(m.html)).split(/\n(?:On .+wrote:|From: .+\nSent: )/)[0].slice(0, 3000);
    return `From: ${m.from.name || m.from.email}${m.from.email === own ? ' (me)' : ''} <${m.from.email}>\nDate: ${m.date}\nTo: ${m.to.map((x) => x.email).join(', ')}\n\n${body}`;
  }).join('\n\n---\n\n');
}

// What the system knows about the people on the thread, so a draft reply can answer from facts
async function contextFor(matches) {
  const lines = [];
  for (const m of matches.slice(0, 5)) {
    if (m.type === 'venue') {
      const shifts = await q(`SELECT s.starts_at, s.ends_at, s.status, (SELECT count(*) FROM shift_assignments a WHERE a.shift_id = s.id AND a.status IN ('assigned','accepted')) AS staffed,
          s.headcount FROM shifts s WHERE s.venue_id = $1 AND s.starts_at BETWEEN now() AND now() + interval '7 days' ORDER BY s.starts_at LIMIT 15`, [m.id]).catch(() => []);
      lines.push(`Venue ${m.label}${m.person ? ` (contact ${m.person})` : ''}. Shifts in the next 7 days: ${shifts.length ? shifts.map((s) => `${fmtDate(s.starts_at)} ${fmtTime(s.starts_at)}-${fmtTime(s.ends_at)} ${s.staffed}/${s.headcount ?? '?'} staffed (${s.status})`).join('; ') : 'none'}`);
    } else if (m.type === 'officer') {
      const shifts = await q(`SELECT s.starts_at, s.ends_at, v.name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
          WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.starts_at > now() ORDER BY s.starts_at LIMIT 5`, [m.id]).catch(() => []);
      lines.push(`Officer ${m.label}. Next shifts: ${shifts.length ? shifts.map((s) => `${fmtDate(s.starts_at)} ${fmtTime(s.starts_at)}-${fmtTime(s.ends_at)} at ${s.name}`).join('; ') : 'none booked'}`);
    } else if (m.type === 'client') {
      const venues = await q('SELECT name FROM venues WHERE client_id = $1 ORDER BY name LIMIT 20', [m.id]);
      lines.push(`Client ${m.label}. Venues: ${venues.map((v) => v.name).join(', ') || 'none'}`);
    } else if (m.type === 'team') lines.push(`${m.label} is on our own team.`);
  }
  return lines.join('\n');
}

const textOf = (res) => (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
const paragraphs = (t) => t.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');

async function loadThread(user, b) {
  required(b, 'account_id', 'id');
  const acc = await account(user, b.account_id);
  const t = await withMail(acc, (tok, a) => a.getThread(tok, String(b.id)));
  return { acc, t };
}

// ---------- jobs ----------

/** Every 5 minutes: incremental sync of connected mailboxes (oldest first, time-boxed) and expired OAuth states. */
export async function emailSync(budgetMs = 20000) {
  await loadConfig();
  await q('DELETE FROM email_oauth_states WHERE expires_at < now()');
  const start = Date.now();
  const rows = await q("SELECT * FROM email_accounts WHERE status = 'connected' ORDER BY last_sync NULLS FIRST LIMIT 20");
  let n = 0;
  for (const acc of rows) {
    if (Date.now() - start > budgetMs) break;
    try {
      n += await syncAccount(acc);
    } catch (e) {
      console.error('[email sync]', acc.id, e.message);
      if (e.status !== 409) await q('UPDATE email_accounts SET last_error = $2, last_sync = now() WHERE id = $1', [acc.id, String(e.message).slice(0, 300)]);
    }
  }
  return n;
}

/** A user was disabled: drop their personal mailboxes (revoking where the provider allows) and their shared grants. */
export async function disconnectUser(userId) {
  for (const acc of await q('SELECT * FROM email_accounts WHERE owner_user_id = $1 AND NOT shared', [userId])) {
    await revokeQuietly(acc);
    await q('DELETE FROM email_accounts WHERE id = $1', [acc.id]);
  }
  await q('DELETE FROM email_account_access WHERE user_id = $1', [userId]);
}

async function revokeQuietly(acc) {
  try {
    await adapter(acc.provider).revoke(open(acc.token_enc));
  } catch (e) {
    console.error('[email revoke]', acc.id, e.message);
  }
}

// ---------- actions ----------

export const actions = {
  'email.setup.get': def(CO, async (b) => {
    await loadConfig();
    let redirect = null;
    try { redirect = redirectFor(b); } catch { /* the app address is not known yet */ }
    return { redirect, ready: hasKey(), providers: { google: setupView('google'), microsoft: setupView('microsoft') } };
  }),

  'email.setup.save': def(CO, async (b, { user }) => {
    required(b, 'provider', 'client_id');
    adapter(b.provider);
    await loadConfig();
    if (cfg(b.provider).from_env) fail(409, `${NAME[b.provider]} keys are set on the server`);
    if (!hasKey()) fail(503, 'Email is not set up yet');
    const client_id = String(b.client_id).trim();
    const secret = String(b.client_secret || '').trim();
    const tenant = b.provider === 'microsoft' ? String(b.tenant || '').trim() || null : null;
    if (b.provider === 'google' && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(client_id)) fail(400, 'A Google client ID ends in .apps.googleusercontent.com');
    if (b.provider === 'microsoft' && !GUID.test(client_id)) fail(400, 'The Microsoft Application (client) ID looks like 1a2b3c4d-…');
    if (tenant && !TENANT.test(tenant)) fail(400, 'The Directory (tenant) ID looks like 1a2b3c4d-… or yourcompany.onmicrosoft.com');
    if (secret.length > 500) fail(400, 'That client secret is too long');
    const existing = await one('SELECT secret_enc FROM email_providers WHERE provider = $1', [b.provider]);
    if (!secret && !existing) fail(400, 'Enter the client secret');
    await q(`INSERT INTO email_providers (provider, client_id, secret_enc, tenant, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5, now())
             ON CONFLICT (provider) DO UPDATE SET client_id = $2, secret_enc = $3, tenant = $4, updated_by = $5, updated_at = now()`,
    [b.provider, client_id, secret ? seal(secret) : existing.secret_enc, tenant, user.id]);
    invalidate();
    await audit(user, 'email.setup', 'email_provider', null, { provider: b.provider, client_id, tenant, secret: secret ? 'replaced' : 'kept' });
    await loadConfig();
    return setupView(b.provider);
  }),

  'email.setup.clear': def(CO, async (b, { user }) => {
    required(b, 'provider');
    adapter(b.provider);
    await q('DELETE FROM email_providers WHERE provider = $1', [b.provider]);
    invalidate();
    await audit(user, 'email.setup', 'email_provider', null, { provider: b.provider, removed: true });
    await loadConfig();
    return setupView(b.provider);
  }),

  'email.status': def(CO, async () => {
    await loadConfig();
    return { providers: providersState(), ready: hasKey(), redirect: process.env.EMAIL_REDIRECT_URL || process.env.APP_URL ? redirectUri() : null };
  }),

  'email.accounts': def(CO, async (_b, { user }) => {
    await loadConfig();
    const rows = await q(`SELECT a.*, (SELECT count(*)::int FROM email_threads t WHERE t.account_id = a.id AND t.folder = 'inbox' AND t.unread) AS unread
      FROM email_accounts a WHERE ${VISIBLE} ORDER BY a.shared, a.created_at`, [user.id]);
    const grants = await q(`SELECT g.account_id, u.id, u.name FROM email_account_access g JOIN users u ON u.id = g.user_id WHERE g.account_id = ANY($1) ORDER BY u.name`, [rows.map((r) => r.id)]);
    return {
      accounts: rows.map((a) => publicAccount(a, {
        unread: a.unread, mine: a.owner_user_id === user.id,
        ...(a.shared ? { users: grants.filter((g) => g.account_id === a.id).map(({ id, name }) => ({ id, name })) } : {}),
      })),
      providers: providersState(),
      ready: hasKey(),
    };
  }),

  'email.connectStart': def(CO, async (b, { user }) => {
    required(b, 'provider');
    const p = adapter(b.provider);
    await loadConfig();
    if (!p.configured() || !hasKey()) fail(503, `${NAME[b.provider]} email is not set up yet`);
    let shared = !!b.shared;
    if (b.account_id) {
      const acc = await account(user, b.account_id);
      if (acc.provider !== b.provider) fail(400, 'That mailbox is with another provider');
      shared = acc.shared;
    }
    const state = randomToken();
    const { verifier, challenge } = pkce();
    const redirect = redirectFor(b);
    await q(`INSERT INTO email_oauth_states (state, user_id, provider, verifier, shared, account_id, redirect, expires_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '15 minutes')`, [state, user.id, b.provider, verifier, shared, b.account_id || null, redirect]);
    return { url: p.authUrl({ state, challenge, redirect }) };
  }),

  'email.connectFinish': def(CO, async (b, { user }) => {
    required(b, 'state');
    await loadConfig();
    const st = await one('DELETE FROM email_oauth_states WHERE state = $1 RETURNING *', [String(b.state)]);
    if (!st || st.user_id !== user.id || new Date(st.expires_at) < new Date()) fail(400, 'This sign-in link has expired. Start connecting again.');
    if (b.error) fail(400, b.error === 'access_denied' ? 'Access was not granted' : `The provider said: ${String(b.error_description || b.error).slice(0, 200)}`);
    required(b, 'code');
    let t;
    try {
      t = await adapter(st.provider).exchange(String(b.code), st.verifier, st.redirect);
    } catch (e) {
      console.error('[email connect]', st.provider, e.status, e.message);
      fail(e.status === 400 && /offline/.test(e.message) ? 400 : 502, e.status === 400 && /offline/.test(e.message) ? e.message : `${NAME[st.provider]} sign-in did not finish: ${e.message}`);
    }
    if (!isEmail(t.address)) fail(400, 'Could not read the mailbox address');
    const sealed = { token_enc: seal(t.refresh), access_enc: seal(t.access), access_expires: new Date(t.expires) };

    const acc = await tx(async (db) => {
      const existing = (await db.one('SELECT * FROM email_accounts WHERE lower(address) = $1', [t.address]));
      if (st.account_id && existing?.id !== st.account_id) {
        const want = (await db.one('SELECT address FROM email_accounts WHERE id = $1', [st.account_id]));
        fail(400, `You signed in as ${t.address}, but this connection is for ${want?.address || 'another mailbox'}`);
      }
      if (existing) {
        const grants = (await db.q('SELECT user_id FROM email_account_access WHERE account_id = $1', [existing.id])).map((r) => r.user_id);
        if (!canUse(existing, user.id, grants)) fail(409, `${t.address} is already connected by someone else`);
        return (await db.one(`UPDATE email_accounts SET token_enc = $2, access_enc = $3, access_expires = $4, status = 'connected', last_error = NULL,
            display_name = COALESCE(NULLIF($5, ''), display_name) WHERE id = $1 RETURNING *`,
        [existing.id, sealed.token_enc, sealed.access_enc, sealed.access_expires, t.name]));
      }
      if (!st.shared) {
        const mine = (await db.one('SELECT address FROM email_accounts WHERE owner_user_id = $1 AND provider = $2 AND NOT shared', [user.id, st.provider]));
        if (mine) fail(409, `You already have ${mine.address} connected. Disconnect it first, or connect this one as a shared mailbox.`);
      }
      return (await db.one(`INSERT INTO email_accounts (provider, address, display_name, owner_user_id, shared, created_by, token_enc, access_enc, access_expires, sync_cursor)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [st.provider, t.address, t.name || '', st.shared ? null : user.id, st.shared, user.id, sealed.token_enc, sealed.access_enc, sealed.access_expires, t.cursor || null]));
    });
    await audit(user, 'email.connect', 'email_account', acc.id, { provider: acc.provider, address: acc.address, shared: acc.shared });
    await refreshInbox(acc).catch((e) => console.error('[email first list]', e.message));
    return publicAccount(acc);
  }),

  'email.disconnect': def(CO, async (b, { user }) => {
    const acc = await account(user, b.id);
    await revokeQuietly(acc);
    await q('DELETE FROM email_accounts WHERE id = $1', [acc.id]);
    await audit(user, 'email.disconnect', 'email_account', acc.id, { provider: acc.provider, address: acc.address, shared: acc.shared });
    return { ok: true };
  }),

  'email.grant': def(CO, async (b, { user }) => {
    const acc = await account(user, b.id);
    if (!acc.shared) fail(400, 'Only a shared mailbox can be shared');
    const ids = uniq([].concat(b.user_ids || []).map(String)).filter((id) => id !== acc.created_by);
    const ok = (await q("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role = 'company' AND status <> 'disabled'", [ids])).map((r) => r.id);
    await tx(async (db) => {
      await db.q('DELETE FROM email_account_access WHERE account_id = $1', [acc.id]);
      for (const id of ok) await db.q('INSERT INTO email_account_access (account_id, user_id) VALUES ($1,$2)', [acc.id, id]);
    });
    await audit(user, 'email.grant', 'email_account', acc.id, { address: acc.address, users: ok.length });
    return { ok: true, users: ok.length };
  }),

  'email.signature': def(CO, async (b, { user }) => {
    const acc = await account(user, b.id);
    await q('UPDATE email_accounts SET signature = $2 WHERE id = $1', [acc.id, String(b.signature || '').slice(0, 2000)]);
    return { ok: true };
  }),

  'email.list': def(CO, async (b, { user }) => {
    const acc = await account(user, b.account_id);
    const folder = FOLDERS.includes(b.folder) ? b.folder : 'inbox';
    const search = String(b.q || '').trim().slice(0, 200);
    let threads, next;
    if (!search && !b.page && folder === 'inbox') {
      if (acc.status === 'connected' && (!acc.listed_at || Date.now() - new Date(acc.listed_at) > FRESH_MS || b.refresh)) {
        await refreshInbox(acc).catch((e) => { if (e.status === 409 || !(acc.listed_at)) throw e; });
      }
      threads = (await q(`SELECT * FROM email_threads WHERE account_id = $1 AND folder = 'inbox' ORDER BY last_at DESC LIMIT $2`, [acc.id, PAGE])).map(fromCache);
      next = (await one('SELECT inbox_next FROM email_accounts WHERE id = $1', [acc.id]))?.inbox_next || null;
    } else {
      ({ threads, next } = await withMail(acc, (tok, a) => a.listThreads(tok, { folder, q: search || undefined, pageToken: b.page || undefined, max: PAGE })));
      await upsertThreads(acc.id, threads);
    }
    const map = await matchAddrs(threads.flatMap((t) => t.addrs));
    return { threads: threads.map(({ addrs, ...t }) => ({ ...t, matches: matchesFor(addrs, map, acc.address) })), next, account: publicAccount(acc) };
  }),

  'email.thread': def(CO, async (b, { user }) => {
    const { acc, t } = await loadThread(user, b);
    if (t.messages.some((m) => m.unread)) {
      await withMail(acc, (tok, a) => a.modify(tok, t.id, { read: true })).catch(() => null);
      if (t.summary) t.summary.unread = false;
    }
    if (t.summary) await upsertThreads(acc.id, [t.summary]);
    const map = await matchAddrs(t.summary?.addrs || []);
    return {
      id: t.id, subject: t.subject, account: publicAccount(acc), starred: !!t.summary?.starred, folder: t.summary?.folder || 'inbox',
      matches: matchesFor(t.summary?.addrs || [], map, acc.address),
      messages: t.messages.map(({ html, text, cid, ...m }) => ({ ...m, html: html ? cleanHtml(html, { cid }) : textToHtml(text) })),
    };
  }),

  'email.attachment': def(CO, async (b, { user }) => {
    required(b, 'account_id', 'message_id', 'id');
    const acc = await account(user, b.account_id);
    const bytes = await withMail(acc, (tok, a) => a.getAttachment(tok, String(b.message_id), String(b.id)));
    const name = String(b.name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const key = `docs/email-tmp/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${name}`;
    await putObject(key, bytes, String(b.mime || 'application/octet-stream'));
    return { url: await downloadUrl(key, name) };
  }),

  'email.send': def(CO, async (b, { user }) => {
    const acc = await account(user, b.account_id);
    const msg = await outgoing(user, acc, b);
    const r = await withMail(acc, (tok, a) => (b.draft ? a.saveDraft(tok, msg) : a.send(tok, msg)));
    if (!b.draft && acc.shared) {
      await audit(user, 'email.send', 'email_account', acc.id, { address: acc.address, to: msg.to.length + msg.cc.length + msg.bcc.length, subject: msg.subject.slice(0, 120) });
    }
    const tid = r?.thread_id || msg.reply?.threadId;
    if (tid) await withMail(acc, (tok, a) => a.threadSummary(tok, tid)).then((s) => upsertThreads(acc.id, [s])).catch(() => null);
    return { ok: true, draft: !!b.draft, thread_id: tid || null };
  }),

  'email.modify': def(CO, async (b, { user }) => {
    required(b, 'account_id', 'id');
    const acc = await account(user, b.account_id);
    const ch = {};
    for (const k of ['read', 'starred']) if (typeof b[k] === 'boolean') ch[k] = b[k];
    for (const k of ['archive', 'trash', 'inbox']) if (b[k]) ch[k] = true;
    if (!Object.keys(ch).length) fail(400, 'Nothing to change');
    await withMail(acc, (tok, a) => a.modify(tok, String(b.id), ch));
    const folder = ch.trash ? 'trash' : ch.archive ? 'archive' : ch.inbox ? 'inbox' : null;
    await q(`UPDATE email_threads SET unread = COALESCE($3, unread), starred = COALESCE($4, starred), folder = COALESCE($5, folder)
             WHERE account_id = $1 AND thread_id = $2`, [acc.id, String(b.id), ch.read === undefined ? null : !ch.read, ch.starred ?? null, folder]);
    return { ok: true };
  }),

  'email.contacts': def(CO, async (b) => {
    const term = `%${String(b.q || '').trim().replace(/[%_]/g, '')}%`;
    if (term.length < 4) return [];
    return q(`SELECT * FROM (
        SELECT name, lower(email) AS email, 'team' AS type FROM users WHERE status <> 'disabled' AND role IN ('company','security','venue') AND email <> '' AND NOT system
        UNION SELECT first_name || ' ' || last_name, lower(email), 'officer' FROM officers WHERE email <> '' AND status <> 'left'
        UNION SELECT name, lower(billing_email), 'client' FROM clients WHERE billing_email <> ''
      ) p WHERE (name ILIKE $1 OR email ILIKE $1) AND email LIKE '%@%' ORDER BY name LIMIT 12`, [term]);
  }),

  'email.forRecord': def(CO, async (b, { user }) => {
    required(b, 'type', 'id');
    const ids = await visibleIds(user);
    if (!ids.length) return { connected: false, threads: [] };
    const addrs = (await recordAddrs(b.type, b.id)).filter(isEmail);
    if (!addrs.length) return { connected: true, threads: [], addrs: [] };
    const rows = await q(`SELECT t.*, a.address FROM email_threads t JOIN email_accounts a ON a.id = t.account_id
      WHERE t.account_id = ANY($1) AND t.addrs && $2 AND t.folder <> 'trash' ORDER BY t.last_at DESC LIMIT 20`, [ids, addrs]);
    return { connected: true, addrs, threads: rows.map((r) => ({ ...fromCache(r), account_id: r.account_id, account: r.address })) };
  }),

  'email.search': def(CO, async (b, { user }) => {
    required(b, 'q');
    const accs = await q(`SELECT a.* FROM email_accounts a WHERE ${VISIBLE} AND a.status = 'connected' AND ($2::uuid IS NULL OR a.id = $2)`, [user.id, b.account_id || null]);
    const out = await mapLimit(accs, 3, async (acc) => {
      const r = await withMail(acc, (tok, a) => a.listThreads(tok, { q: String(b.q).slice(0, 200), max: 10 })).catch((e) => ({ error: e.message, threads: [] }));
      return { account_id: acc.id, address: acc.address, error: r.error, threads: r.threads.map(({ addrs, ...t }) => t) };
    });
    return { results: out };
  }),

  'email.summary': def(CO, async (b, { user }) => {
    const { acc, t } = await loadThread(user, b);
    const res = await claude({
      model: HAIKU, module: 'email', max_tokens: 500,
      system: 'You summarise an email thread for a manager at a UK security company. British English. 2-5 short bullet points: what it is about, what is being asked, any dates/times/venues, and what (if anything) the manager needs to do. Plain text, bullets start with "- ". No preamble.',
      messages: [{ role: 'user', content: threadText(t, acc.address) }],
    });
    return { summary: textOf(res) };
  }),

  'email.draftReply': def(CO, async (b, { user }) => {
    const { acc, t } = await loadThread(user, b);
    const map = await matchAddrs(t.summary?.addrs || []);
    const facts = await contextFor(matchesFor(t.summary?.addrs || [], map, acc.address));
    const res = await claude({
      model: SONNET, module: 'email', max_tokens: 800,
      system: `You draft an email reply for ${user.name}, writing from ${acc.address} at a UK security company. British English, polite, concise, professional.
Use only facts from the thread and the records below; never invent shifts, prices, names or commitments. If something needs checking, say it will be confirmed.
Write only the reply body (greeting to sign-off with the first name ${String(user.name || '').split(' ')[0]}), plain text, paragraphs separated by blank lines. No subject line.`,
      messages: [{ role: 'user', content: `Thread:\n\n${threadText(t, acc.address)}\n\nWhat our records say:\n${facts || '(nothing matched)'}${b.instructions ? `\n\nThe manager wants the reply to: ${String(b.instructions).slice(0, 500)}` : ''}` }],
    });
    const text = textOf(res);
    return { text, html: paragraphs(text) };
  }),
};
