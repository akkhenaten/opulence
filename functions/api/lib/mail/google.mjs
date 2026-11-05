// Gmail / Google Workspace through the Gmail REST API (plain fetch, no SDK).
import crypto from 'node:crypto';
import { call, form, FORM, JSONH, mapLimit, MailError, lower, uniq } from './common.mjs';
import { parseAddr, parseAddrList } from './html.mjs';
import { buildMime } from './mime.mjs';
import { cfg } from './config.mjs';

const G = 'https://gmail.googleapis.com/gmail/v1/users/me';
const UP = 'https://gmail.googleapis.com/upload/gmail/v1/users/me';
const TOKEN = 'https://oauth2.googleapis.com/token';
export const SCOPES = 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send';

export const configured = () => { const c = cfg('google'); return !!(c.client_id && c.client_secret); };
const client = () => { const c = cfg('google'); return { client_id: c.client_id, client_secret: c.client_secret }; };

export function authUrl({ state, challenge, redirect }) {
  return `https://accounts.google.com/o/oauth2/v2/auth?${form({
    client_id: cfg('google').client_id, redirect_uri: redirect, response_type: 'code', scope: SCOPES,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, code_challenge: challenge, code_challenge_method: 'S256',
  })}`;
}

export async function exchange(code, verifier, redirect) {
  const t = await call(TOKEN, { method: 'POST', headers: FORM, body: form({ ...client(), code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }) });
  if (!t.refresh_token) throw new MailError(400, 'Google did not give offline access. Remove the app at myaccount.google.com/permissions and connect again.');
  const me = await call(`${G}/profile`, { token: t.access_token });
  const info = await call('https://openidconnect.googleapis.com/v1/userinfo', { token: t.access_token }).catch(() => ({}));
  return { refresh: t.refresh_token, access: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000, address: lower(me.emailAddress), name: info?.name || '', cursor: me.historyId };
}

export async function refresh(refreshToken) {
  const t = await call(TOKEN, { method: 'POST', headers: FORM, body: form({ ...client(), refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  return { access: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000, refresh: t.refresh_token || null };
}

export async function revoke(token) {
  await call(`https://oauth2.googleapis.com/revoke?${form({ token })}`, { method: 'POST', headers: FORM }).catch(() => null);
}

// Folders → Gmail list filters
const FOLDER = {
  inbox: { labelIds: 'INBOX' },
  sent: { labelIds: 'SENT' },
  drafts: { labelIds: 'DRAFT' },
  trash: { labelIds: 'TRASH', includeSpamTrash: 'true' },
  archive: { q: '-in:inbox -in:sent -in:drafts -in:trash -in:spam -in:chats' },
};

const header = (m, name) => (m.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

/** Where a thread lives, from its messages' labels: trash, inbox, drafts (all drafts), sent (all ours), else archive. */
export function folderOf(msgs) {
  const all = (l) => msgs.every((m) => (m.labelIds || []).some((x) => l.includes(x)));
  const any = (l) => msgs.some((m) => (m.labelIds || []).includes(l));
  if (any('TRASH')) return 'trash';
  if (any('INBOX')) return 'inbox';
  if (all(['DRAFT'])) return 'drafts';
  if (all(['SENT', 'DRAFT'])) return 'sent';
  return 'archive';
}

/** A Gmail thread (format=metadata or full) → the cached summary row. */
export function summarise(t) {
  const msgs = t.messages || [];
  if (!msgs.length) return null;
  const last = msgs[msgs.length - 1];
  const labels = new Set(msgs.flatMap((m) => m.labelIds || []));
  const addrs = uniq(msgs.flatMap((m) => ['From', 'To', 'Cc'].flatMap((h) => parseAddrList(header(m, h)).map((a) => a.email))));
  const from = parseAddr(header(last, 'From'));
  return {
    id: t.id, subject: header(msgs[0], 'Subject') || '(no subject)', snippet: decodeEntities(last.snippet || ''),
    from_name: from.name, from_addr: from.email, addrs,
    last_at: new Date(Number(last.internalDate || Date.now())).toISOString(),
    unread: labels.has('UNREAD'), starred: labels.has('STARRED'), folder: folderOf(msgs), count: msgs.length,
  };
}

const decodeEntities = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const META = 'format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date';

export async function threadSummary(token, id) {
  try {
    return summarise(await call(`${G}/threads/${encodeURIComponent(id)}?${META}`, { token }));
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function listThreads(token, { folder = 'inbox', q, pageToken, max = 25 } = {}) {
  const f = q ? { q } : FOLDER[folder] || FOLDER.inbox;
  const params = new URLSearchParams({ maxResults: String(max) });
  for (const [k, v] of Object.entries(f)) params.set(k, v);
  if (pageToken) params.set('pageToken', pageToken);
  const list = await call(`${G}/threads?${params}`, { token });
  const threads = (await mapLimit(list.threads || [], 8, (t) => threadSummary(token, t.id))).filter(Boolean);
  return { threads, next: list.nextPageToken || null };
}

const b64url = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Walks a message payload: bodies, attachments, inline (cid) parts. */
export function walk(payload) {
  const out = { html: '', text: '', attachments: [], inline: [] };
  const visit = (p) => {
    if (!p) return;
    const mime = (p.mimeType || '').toLowerCase();
    const cid = ((p.headers || []).find((h) => h.name.toLowerCase() === 'content-id')?.value || '').replace(/[<>]/g, '');
    const disp = (p.headers || []).find((h) => h.name.toLowerCase() === 'content-disposition')?.value || '';
    if (p.parts?.length) return p.parts.forEach(visit);
    if (p.filename || p.body?.attachmentId) {
      const a = { id: p.body?.attachmentId || '', name: p.filename || 'attachment', size: p.body?.size || 0, mime: mime || 'application/octet-stream', data: p.body?.data || null };
      if (cid && !/attachment/i.test(disp)) out.inline.push({ ...a, cid });
      else out.attachments.push(a);
      return;
    }
    if (mime === 'text/html' && !out.html) out.html = b64url(p.body?.data).toString('utf8');
    else if (mime === 'text/plain' && !out.text) out.text = b64url(p.body?.data).toString('utf8');
  };
  visit(payload);
  return out;
}

export async function getThread(token, id) {
  const t = await call(`${G}/threads/${encodeURIComponent(id)}?format=full`, { token });
  const messages = await mapLimit(t.messages || [], 4, async (m) => {
    const w = walk(m.payload);
    // Small inline images become data: URIs so the sandboxed body can show them
    const cid = {};
    for (const a of w.inline.filter((x) => x.size < 300_000).slice(0, 10)) {
      const data = a.data || (a.id ? (await call(`${G}/messages/${m.id}/attachments/${a.id}`, { token }).catch(() => null))?.data : null);
      if (data) cid[a.cid] = `data:${a.mime};base64,${b64url(data).toString('base64')}`;
    }
    return {
      id: m.id, from: parseAddr(header(m, 'From')), to: parseAddrList(header(m, 'To')), cc: parseAddrList(header(m, 'Cc')),
      date: new Date(Number(m.internalDate || Date.now())).toISOString(), subject: header(m, 'Subject'),
      html: w.html, text: w.text, cid, attachments: w.attachments.map(({ data, ...a }) => a),
      message_id: header(m, 'Message-ID') || header(m, 'Message-Id'), references: header(m, 'References'),
      unread: (m.labelIds || []).includes('UNREAD'), draft: (m.labelIds || []).includes('DRAFT'),
    };
  });
  return { id: t.id, subject: messages[0]?.subject || '(no subject)', messages, summary: summarise(t) };
}

export async function getAttachment(token, messageId, attId) {
  const a = await call(`${G}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attId)}`, { token });
  return b64url(a.data);
}

// Gmail multipart upload: JSON metadata + the raw RFC 822 message
async function upload(token, url, meta, raw) {
  const b = `=_g_${crypto.randomBytes(8).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: message/rfc822\r\n\r\n`),
    raw, Buffer.from(`\r\n--${b}--`),
  ]);
  return call(url, { token, method: 'POST', body, headers: { 'Content-Type': `multipart/related; boundary=${b}` }, timeout: 60000 });
}

/** msg: { from, to, cc, bcc, subject, html, attachments[{name,mime,bytes}], reply?: { threadId, messageId, references } } */
export async function send(token, msg) {
  const raw = buildMime({ ...msg, inReplyTo: msg.reply?.messageId, references: msg.reply?.references });
  const meta = msg.reply?.threadId ? { threadId: msg.reply.threadId } : {};
  const r = await upload(token, `${UP}/messages/send?uploadType=multipart`, meta, raw);
  return { id: r?.id, thread_id: r?.threadId };
}

export async function saveDraft(token, msg) {
  const raw = buildMime({ ...msg, inReplyTo: msg.reply?.messageId, references: msg.reply?.references });
  const r = await upload(token, `${UP}/drafts?uploadType=multipart`, { message: msg.reply?.threadId ? { threadId: msg.reply.threadId } : {} }, raw);
  return { id: r?.id, thread_id: r?.message?.threadId };
}

export async function modify(token, id, { read, starred, archive, trash, inbox }) {
  const tid = encodeURIComponent(id);
  if (trash) return call(`${G}/threads/${tid}/trash`, { token, method: 'POST' });
  const add = [], remove = [];
  if (read === true) remove.push('UNREAD');
  if (read === false) add.push('UNREAD');
  if (starred === true) add.push('STARRED');
  if (starred === false) remove.push('STARRED');
  if (archive) remove.push('INBOX');
  if (inbox) add.push('INBOX');
  if (inbox) await call(`${G}/threads/${tid}/untrash`, { token, method: 'POST' }).catch(() => null);
  if (add.length || remove.length) await call(`${G}/threads/${tid}/modify`, { token, method: 'POST', headers: JSONH, body: JSON.stringify({ addLabelIds: add, removeLabelIds: remove }) });
  return null;
}

/** Threads changed since the cursor (a historyId). Falls back to the latest inbox threads when there is none or it expired. */
export async function sync(token, cursor) {
  if (cursor) {
    try {
      const ids = new Set();
      let pageToken, latest = cursor;
      for (let i = 0; i < 3; i++) {
        const p = new URLSearchParams({ startHistoryId: cursor, maxResults: '100' });
        for (const t of ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']) p.append('historyTypes', t);
        if (pageToken) p.set('pageToken', pageToken);
        const h = await call(`${G}/history?${p}`, { token });
        for (const rec of h.history || []) {
          for (const k of ['messages', 'messagesAdded', 'messagesDeleted', 'labelsAdded', 'labelsRemoved']) {
            for (const x of rec[k] || []) { const m = x.message || x; if (m.threadId) ids.add(m.threadId); }
          }
        }
        latest = h.historyId || latest;
        pageToken = h.nextPageToken;
        if (!pageToken) break;
      }
      return { ids: [...ids], cursor: latest };
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  const me = await call(`${G}/profile`, { token });
  const list = await call(`${G}/threads?labelIds=INBOX&maxResults=25`, { token });
  return { ids: (list.threads || []).map((t) => t.id), cursor: me.historyId, full: true };
}
