// Outlook.com / Microsoft 365 through Microsoft Graph (plain fetch, no SDK). A "thread" is a Graph conversationId.
import { call, form, FORM, JSONH, mapLimit, MailError, lower, uniq } from './common.mjs';
import { cfg } from './config.mjs';

const ME = 'https://graph.microsoft.com/v1.0/me';
// A single-organisation app must use its own tenant; 'common' takes work and personal accounts
const auth = () => `https://login.microsoftonline.com/${encodeURIComponent(cfg('microsoft').tenant || 'common')}/oauth2/v2.0`;
export const SCOPES = 'openid profile email offline_access User.Read Mail.ReadWrite Mail.Send';

export const configured = () => { const c = cfg('microsoft'); return !!(c.client_id && c.client_secret); };
const client = () => { const c = cfg('microsoft'); return { client_id: c.client_id, client_secret: c.client_secret }; };
const HTML_BODY = { Prefer: 'outlook.body-content-type="html"' };

export function authUrl({ state, challenge, redirect }) {
  return `${auth()}/authorize?${form({
    client_id: cfg('microsoft').client_id, redirect_uri: redirect, response_type: 'code', response_mode: 'query', scope: SCOPES,
    state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  })}`;
}

export async function exchange(code, verifier, redirect) {
  const t = await call(`${auth()}/token`, { method: 'POST', headers: FORM, body: form({ ...client(), code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code', scope: SCOPES }) });
  if (!t.refresh_token) throw new MailError(400, 'Microsoft did not give offline access. Try connecting again.');
  const me = await call(`${ME}?$select=displayName,mail,userPrincipalName`, { token: t.access_token });
  return { refresh: t.refresh_token, access: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000, address: lower(me.mail || me.userPrincipalName), name: me.displayName || '', cursor: null };
}

export async function refresh(refreshToken) {
  const t = await call(`${auth()}/token`, { method: 'POST', headers: FORM, body: form({ ...client(), refresh_token: refreshToken, grant_type: 'refresh_token', scope: SCOPES }) });
  return { access: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000, refresh: t.refresh_token || null };
}

// Microsoft has no per-app token revoke for delegated access; the person removes the app at account.microsoft.com or myapps.microsoft.com
export async function revoke() {}

const WELL_KNOWN = { inbox: 'inbox', sent: 'sentitems', drafts: 'drafts', archive: 'archive', trash: 'deleteditems' };
const folderIds = new Map();
/** Well-known folder ids for this token's mailbox (id → our folder name). */
async function folders(token) {
  if (folderIds.has(token)) return folderIds.get(token);
  const map = {};
  await Promise.all(Object.entries(WELL_KNOWN).map(async ([ours, wk]) => {
    const f = await call(`${ME}/mailFolders/${wk}?$select=id`, { token }).catch(() => null);
    if (f?.id) map[f.id] = ours;
  }));
  if (folderIds.size > 50) folderIds.clear();
  folderIds.set(token, map);
  return map;
}

const SUMMARY = 'id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isRead,flag,parentFolderId,isDraft';
const addr = (r) => ({ name: r?.emailAddress?.name || '', email: lower(r?.emailAddress?.address) });
const byDate = (a, b) => new Date(a.receivedDateTime) - new Date(b.receivedDateTime);

export function folderOf(msgs, map) {
  const f = msgs.map((m) => map[m.parentFolderId] || 'archive');
  if (f.includes('trash')) return 'trash';
  if (f.includes('inbox')) return 'inbox';
  if (f.every((x) => x === 'drafts')) return 'drafts';
  if (f.every((x) => x === 'sent' || x === 'drafts')) return 'sent';
  return 'archive';
}

/** Graph messages of one conversation → the cached summary row. */
export function summarise(msgs, map = {}) {
  if (!msgs.length) return null;
  const m = [...msgs].sort(byDate);
  const last = m[m.length - 1];
  const from = addr(last.from);
  return {
    id: last.conversationId, subject: m[0].subject || '(no subject)', snippet: (last.bodyPreview || '').slice(0, 200),
    from_name: from.name, from_addr: from.email,
    addrs: uniq(m.flatMap((x) => [x.from, ...(x.toRecipients || []), ...(x.ccRecipients || [])].map((r) => addr(r).email))),
    last_at: new Date(last.receivedDateTime || Date.now()).toISOString(),
    unread: m.some((x) => !x.isRead && !x.isDraft), starred: m.some((x) => x.flag?.flagStatus === 'flagged'),
    folder: folderOf(m, map), count: m.length,
  };
}

const conv = (id) => `$filter=${encodeURIComponent(`conversationId eq '${String(id).replace(/'/g, "''")}'`)}`;
async function conversation(token, id, select = SUMMARY, extra = {}) {
  const r = await call(`${ME}/messages?${conv(id)}&$select=${select}&$top=50`, { token, headers: extra });
  return (r.value || []).sort(byDate);
}

export async function threadSummary(token, id) {
  const [msgs, map] = await Promise.all([conversation(token, id), folders(token)]);
  return summarise(msgs, map);
}

const GRAPH_PAGE = /^https:\/\/graph\.microsoft\.com\//;
export async function listThreads(token, { folder = 'inbox', q, pageToken, max = 25 } = {}) {
  let url;
  if (pageToken) {
    if (!GRAPH_PAGE.test(pageToken)) throw new MailError(400, 'Bad page');
    url = pageToken;
  } else if (q) {
    url = `${ME}/messages?$search=${encodeURIComponent(`"${String(q).replace(/"/g, '')}"`)}&$select=${SUMMARY}&$top=50`;
  } else {
    url = `${ME}/mailFolders/${WELL_KNOWN[folder] || 'inbox'}/messages?$select=${SUMMARY}&$orderby=receivedDateTime desc&$top=50`;
  }
  const [r, map] = await Promise.all([call(url, { token }), folders(token)]);
  const groups = new Map();
  for (const m of r.value || []) {
    if (!groups.has(m.conversationId)) groups.set(m.conversationId, []);
    groups.get(m.conversationId).push(m);
  }
  const threads = [...groups.values()].map((g) => summarise(g, map)).filter(Boolean)
    .sort((a, b) => new Date(b.last_at) - new Date(a.last_at)).slice(0, max);
  return { threads, next: r['@odata.nextLink'] || null };
}

export async function getThread(token, id) {
  const [msgs, map] = await Promise.all([
    conversation(token, id, `${SUMMARY},body,internetMessageId,hasAttachments`, HTML_BODY), folders(token),
  ]);
  if (!msgs.length) throw new MailError(404, 'This conversation is no longer there');
  const messages = await mapLimit(msgs, 4, async (m) => {
    const cid = {};
    let attachments = [];
    if (m.hasAttachments || /cid:/i.test(m.body?.content || '')) {
      const list = (await call(`${ME}/messages/${m.id}/attachments?$select=id,name,size,contentType,isInline`, { token }).catch(() => ({}))).value || [];
      attachments = list.filter((a) => !a.isInline).map((a) => ({ id: a.id, name: a.name || 'attachment', size: a.size || 0, mime: a.contentType || 'application/octet-stream' }));
      for (const a of list.filter((x) => x.isInline && x.size < 300_000).slice(0, 10)) {
        const full = await call(`${ME}/messages/${m.id}/attachments/${a.id}`, { token }).catch(() => null);
        if (full?.contentId && full.contentBytes) cid[full.contentId.replace(/[<>]/g, '')] = `data:${full.contentType || 'image/png'};base64,${full.contentBytes}`;
      }
    }
    const html = m.body?.contentType === 'html' ? m.body.content : '';
    return {
      id: m.id, from: addr(m.from), to: (m.toRecipients || []).map(addr), cc: (m.ccRecipients || []).map(addr),
      date: new Date(m.receivedDateTime).toISOString(), subject: m.subject || '', html, text: html ? '' : m.body?.content || '', cid, attachments,
      message_id: m.internetMessageId || '', references: '', unread: !m.isRead, draft: !!m.isDraft,
    };
  });
  return { id, subject: msgs[0].subject || '(no subject)', messages, summary: summarise(msgs, map) };
}

export async function getAttachment(token, messageId, attId) {
  return call(`${ME}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attId)}/$value`, { token, as: 'bytes', timeout: 60000 });
}

const recips = (list) => (list || []).map((a) => ({ emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) } }));
const CHUNK = 320 * 1024 * 11;

// Builds a draft (a reply draft when replying, so Outlook threads it), adds attachments, returns its id
async function draft(token, msg) {
  let id;
  if (msg.reply?.id) {
    const d = await call(`${ME}/messages/${encodeURIComponent(msg.reply.id)}/${msg.reply.all ? 'createReplyAll' : 'createReply'}`, { token, method: 'POST', headers: JSONH, body: '{}' });
    id = d.id;
    await call(`${ME}/messages/${id}`, { token, method: 'PATCH', headers: JSONH, body: JSON.stringify({
      body: { contentType: 'HTML', content: msg.html }, toRecipients: recips(msg.to), ccRecipients: recips(msg.cc), bccRecipients: recips(msg.bcc),
      ...(msg.subject ? { subject: msg.subject } : {}),
    }) });
  } else {
    const d = await call(`${ME}/messages`, { token, method: 'POST', headers: JSONH, body: JSON.stringify({
      subject: msg.subject || '', body: { contentType: 'HTML', content: msg.html }, toRecipients: recips(msg.to), ccRecipients: recips(msg.cc), bccRecipients: recips(msg.bcc),
    }) });
    id = d.id;
  }
  for (const a of msg.attachments || []) {
    const bytes = Buffer.from(a.bytes);
    if (bytes.length <= 3 * 1024 * 1024) {
      await call(`${ME}/messages/${id}/attachments`, { token, method: 'POST', headers: JSONH, timeout: 60000, body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.mime || 'application/octet-stream', contentBytes: bytes.toString('base64'),
      }) });
      continue;
    }
    const s = await call(`${ME}/messages/${id}/attachments/createUploadSession`, { token, method: 'POST', headers: JSONH, body: JSON.stringify({
      AttachmentItem: { attachmentType: 'file', name: a.name, size: bytes.length, contentType: a.mime || 'application/octet-stream' },
    }) });
    for (let at = 0; at < bytes.length; at += CHUNK) {
      const part = bytes.subarray(at, Math.min(at + CHUNK, bytes.length));
      // The upload URL carries its own auth; sending the bearer token too is rejected
      await call(s.uploadUrl, { method: 'PUT', body: part, timeout: 60000, headers: {
        'Content-Type': 'application/octet-stream', 'Content-Length': String(part.length), 'Content-Range': `bytes ${at}-${at + part.length - 1}/${bytes.length}`,
      } });
    }
  }
  return id;
}

/** msg: { to, cc, bcc, subject, html, attachments[{name,mime,bytes}], reply?: { id (Graph message id), all } } */
export async function send(token, msg) {
  const id = await draft(token, msg);
  await call(`${ME}/messages/${id}/send`, { token, method: 'POST' });
  return { id, thread_id: msg.reply?.threadId || null };
}

export async function saveDraft(token, msg) {
  return { id: await draft(token, msg), thread_id: msg.reply?.threadId || null };
}

export async function modify(token, id, { read, starred, archive, trash, inbox }) {
  const [msgs, map] = await Promise.all([conversation(token, id, 'id,parentFolderId,isRead,flag'), folders(token)]);
  const patch = {};
  if (read !== undefined) patch.isRead = !!read;
  if (starred !== undefined) patch.flag = { flagStatus: starred ? 'flagged' : 'notFlagged' };
  await mapLimit(msgs, 4, async (m) => {
    const f = map[m.parentFolderId];
    if (Object.keys(patch).length) await call(`${ME}/messages/${m.id}`, { token, method: 'PATCH', headers: JSONH, body: JSON.stringify(patch) });
    const to = trash ? (f !== 'trash' && 'deleteditems') : archive ? (f === 'inbox' && 'archive') : inbox ? ((f === 'trash' || f === 'archive') && 'inbox') : null;
    if (to) await call(`${ME}/messages/${m.id}/move`, { token, method: 'POST', headers: JSONH, body: JSON.stringify({ destinationId: to }) });
  });
  return null;
}

/** Conversations changed in the inbox since the cursor (a Graph delta/next link). First run looks back 14 days. */
export async function sync(token, cursor) {
  let url = cursor && GRAPH_PAGE.test(cursor) ? cursor : null;
  if (!url) {
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    url = `${ME}/mailFolders/inbox/messages/delta?$select=conversationId&$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}`;
  }
  const ids = new Set();
  for (let i = 0; i < 5; i++) {
    let r;
    try {
      r = await call(url, { token, headers: { Prefer: 'odata.maxpagesize=50' } });
    } catch (e) {
      // An expired delta token: start again
      if (cursor && (e.status === 410 || /sync/i.test(e.code || ''))) return sync(token, null);
      throw e;
    }
    for (const m of r.value || []) if (m.conversationId) ids.add(m.conversationId);
    if (r['@odata.deltaLink']) return { ids: [...ids], cursor: r['@odata.deltaLink'] };
    url = r['@odata.nextLink'];
    if (!url) break;
  }
  return { ids: [...ids], cursor: url || null };
}
