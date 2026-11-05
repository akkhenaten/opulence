// Messages: direct and group chats for everyone, plus threads the system opens
// (cover requests, shift teams, Orb for chases and cover offers, pay disputes).
import { one, q } from '../lib/db.mjs';
import { fail, required, need, HttpError } from '../lib/http.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { cleanFiles } from '../lib/files.mjs';
import { notify, companyManagers } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { extract, HAIKU, transcribe } from '../lib/ai.mjs';
import { londonDate } from '../lib/time.mjs';
import { post, preview, syncMembers, opsUser, opsMessage } from '../lib/threads.mjs';
import { publishConv, realtimeToken } from '../lib/realtime.mjs';
import { REACTION_KINDS, PIN_MAX, MANAGER_ROLES, mentionable, cleanMentions, canPin, canRequireConfirm, confirmSummary, reactionSummary, isAudio } from '../lib/chat.mjs';
import { officerReply, offerRespond, packReply } from './ops.mjs';
import { ALL, def } from './_def.mjs';

const PAGE = 40;
const EDIT_MINUTES = 15;
const PHOTO = 'COALESCE((SELECT o.photo_key FROM officers o WHERE o.user_id = u.id LIMIT 1), u.photo_key)';
const KIND_LABEL = { cover: 'Cover request', shift: 'Shift team', ops: 'Orb', pay: 'Pay query', group: 'Group' };

const sign = async (p) => ({ ...p, photo_key: undefined, photo_url: p.photo_key ? await downloadUrl(p.photo_key) : null });

async function membership(user, convId) {
  const c = need(await one('SELECT * FROM conversations WHERE id = $1', [convId]), 'Conversation not found');
  const m = await one('SELECT * FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL', [convId, user.id]);
  return { c, m };
}

/** Members read; the company manager can open any conversation for safeguarding, which is logged. */
async function canRead(user, convId) {
  const { c, m } = await membership(user, convId);
  if (m) return { c, m };
  if (user.role === 'company') {
    const seen = await one("SELECT 1 FROM audit_log WHERE user_id = $1 AND action = 'messages.safeguarding_view' AND entity_id = $2 AND created_at > now() - interval '1 day'", [user.id, convId]).catch(() => null);
    if (!seen) await audit(user, 'messages.safeguarding_view', 'conversation', convId);
    return { c, m: null, oversight: true };
  }
  fail(403, 'You are not in this conversation');
}

async function canWrite(user, convId) {
  const { c, m } = await membership(user, convId);
  if (!m) fail(403, 'You are not in this conversation');
  return { c, m };
}

const cleanAttachments = (user, list) => cleanFiles(user, list, 'messages');

const STAFF = ['company', 'security', 'officer'];
// An Everyday post shared into a chat: only staff can share, and only a post they can see
async function cleanShare(user, share) {
  if (share.type !== 'post' || !share.id) fail(400, 'Unknown share');
  if (!STAFF.includes(user.role)) fail(403, 'Only staff can share Everyday posts');
  need(await one('SELECT id FROM posts WHERE id = $1 AND deleted_at IS NULL AND hidden_at IS NULL', [share.id]), 'That post has been removed');
  return { type: 'post', id: share.id };
}

const EMOJI = { like: '👍', love: '❤️', laugh: '😂', wow: '😮', sad: '😢', clap: '👏' };
const snippet = (r) => (r.deleted_at ? 'Message deleted' : preview(r.body, r.attachments).slice(0, 100));

/** Messages as the viewer sees them: reactions, the quoted message, "Must confirm" progress. One query per extra, not per row. */
async function shapeMessages(rows, viewer, people) {
  const ids = rows.map((r) => r.id);
  const replyIds = [...new Set(rows.map((r) => r.reply_to).filter(Boolean))];
  const confirmIds = rows.filter((r) => r.must_confirm && !r.deleted_at).map((r) => r.id);
  const shareIds = [...new Set(rows.filter((r) => r.share?.type === 'post' && !r.deleted_at).map((r) => r.share.id))];
  const [reacts, replies, confirms, shared] = await Promise.all([
    ids.length ? q('SELECT message_id, user_id, kind FROM message_reactions WHERE message_id = ANY($1::uuid[])', [ids]) : [],
    replyIds.length ? q('SELECT m.id, m.body, m.attachments, m.deleted_at, m.sender_id, u.name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ANY($1::uuid[])', [replyIds]) : [],
    confirmIds.length ? q('SELECT message_id, user_id, confirmed_at FROM message_confirms WHERE message_id = ANY($1::uuid[])', [confirmIds]) : [],
    shareIds.length && STAFF.includes(viewer.role) ? q(`SELECT p.id, p.kind, p.body, p.photos->0->>'key' AS photo_key, p.video->>'poster_key' AS poster_key, p.deleted_at, p.hidden_at, u.name
      FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ANY($1::uuid[])`, [shareIds]) : [],
  ]);
  const shareCard = async (s) => {
    if (!STAFF.includes(viewer.role)) return { post_id: s.id, restricted: true };
    const p = shared.find((x) => x.id === s.id);
    if (!p || p.deleted_at || p.hidden_at) return { post_id: s.id, removed: true };
    const thumb = p.photo_key || p.poster_key;
    return { post_id: p.id, kind: p.kind, author: p.name, text: preview(p.body, []).slice(0, 140), thumb_url: thumb ? await downloadUrl(thumb) : null };
  };
  const replyBy = new Map(replies.map((r) => [r.id, r]));
  return Promise.all(rows.map(async (r) => {
    const quoted = r.reply_to && replyBy.get(r.reply_to);
    return {
      ...r,
      search: undefined,
      sender: await sign(r.sender),
      body: r.deleted_at ? '' : r.body,
      transcript: r.deleted_at ? null : r.transcript,
      attachments: r.deleted_at ? [] : await Promise.all((r.attachments || []).map(async (a) => ({ name: a.name, mime: a.mime, duration: a.duration, url: await downloadUrl(a.key, a.name) }))),
      quick: r.quick && !r.quick_used ? r.quick : null,
      pinned: !!r.pinned_at && !r.deleted_at,
      reactions: r.deleted_at ? [] : reactionSummary(reacts.filter((x) => x.message_id === r.id), viewer.id),
      reply: quoted ? {
        id: quoted.id, name: quoted.name, mine: quoted.sender_id === viewer.id, text: snippet(quoted), deleted: !!quoted.deleted_at,
        voice: !quoted.deleted_at && (quoted.attachments || []).some(isAudio),
        photo: !quoted.deleted_at && (quoted.attachments || []).some((a) => /^image\//.test(a.mime || '')),
      } : null,
      share: r.share && !r.deleted_at ? await shareCard(r.share) : null,
      confirm: r.must_confirm && !r.deleted_at ? confirmSummary(people, r, confirms.filter((c) => c.message_id === r.id), viewer) : null,
    };
  }));
}

const MSG_COLS = `m.id, m.conversation_id, m.body, m.attachments, m.quick, m.quick_used, m.edited_at, m.deleted_at, m.created_at, m.sender_id,
  m.reply_to, m.mentions, m.must_confirm, m.pinned_at, m.transcript, m.transcript_status, m.share,
  json_build_object('id', u.id, 'name', u.name, 'role', u.role, 'system', u.system, 'photo_key', ${PHOTO}) AS sender`;
const oneMessage = (id) => one(`SELECT ${MSG_COLS} FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1`, [id]);

const titleOf = (c, others) => c.title || (c.kind === 'direct' ? others[0]?.name : others.map((p) => p.name.split(' ')[0]).join(', ')) || KIND_LABEL[c.kind];

/** A message the person can act on (member of its conversation, not deleted). */
async function liveMessage(user, id) {
  const msg = need(await one('SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL', [id]), 'Message not found');
  const { c, m } = await canWrite(user, msg.conversation_id);
  return { msg, c, m };
}

// Voice notes: the vocabulary helps the transcriber spell people and places
const TERMS = ['SIA', 'door supervisor', 'steward', 'CCTV', 'rota', 'clock-in', 'ejection', 'incident report', 'radio'];
async function transcribeVoice(msg) {
  const a = (msg.attachments || []).find(isAudio);
  if (!a) return null;
  const names = await q(
    `(SELECT u.name AS w FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = $1 AND NOT u.system)
     UNION (SELECT u.goes_by FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = $1 AND u.goes_by <> '')
     UNION (SELECT name FROM venues WHERE active ORDER BY name LIMIT 60)`, [msg.conversation_id]);
  const { text } = await transcribe({ url: await downloadUrl(a.key, a.name), vocabulary: [...TERMS, ...names.map((r) => r.w).filter(Boolean)], module: 'messages' });
  return text;
}

/** Turn one voice note into text; `last` marks it failed instead of leaving it for the retry job. */
export async function runTranscript(id, { last = false } = {}) {
  const msg = await one(
    "UPDATE messages SET transcript_status = 'working' WHERE id = $1 AND transcript_status IN ('pending','retry') AND deleted_at IS NULL RETURNING *", [id]);
  if (!msg) return null;
  let text = null;
  try { text = await transcribeVoice(msg); } catch (e) { console.warn('[voice note]', e.message); }
  await q('UPDATE messages SET transcript = $2, transcript_status = $3 WHERE id = $1',
    [id, text, text != null ? 'done' : last ? 'failed' : 'retry']);
  if (text != null) await publishConv(msg.conversation_id, 'upd', { id });
  return text;
}

/** Retry voice notes the app didn't get transcribed (closed too soon, a failed first try). Runs in the 5-minute jobs. */
export async function transcriptSweep() {
  await q("UPDATE messages SET transcript_status = 'failed' WHERE transcript_status = 'working' AND created_at < now() - interval '15 minutes'");
  const rows = await q(
    `SELECT id FROM messages WHERE transcript_status IN ('pending','retry') AND deleted_at IS NULL
        AND created_at < now() - interval '2 minutes' AND created_at > now() - interval '1 day' ORDER BY created_at LIMIT 5`);
  for (const r of rows) await runTranscript(r.id, { last: true });
  return rows.length;
}

async function members(convId) {
  const rows = await q(
    `SELECT u.id, u.name, u.goes_by, u.role, u.system, ${PHOTO} AS photo_key, cm.last_read_at FROM conversation_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = $1 AND cm.left_at IS NULL ORDER BY u.system, u.name`, [convId]);
  return Promise.all(rows.map(sign));
}

// ---------- Orb: understanding typed replies ----------
const REPLY_TOOL = {
  name: 'read_reply',
  description: "Classify a staff member's reply to an automated question from the security company.",
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['on_my_way', 'cant_make_it', 'signing_now', 'accept', 'decline', 'unclear'] },
      eta_min: { type: 'integer', description: 'Minutes until they arrive, if they said (e.g. "15 late" = 15, "half an hour" = 30).' },
      reason: { type: 'string', description: "Short reason if they can't make it." },
      question: { type: 'string', description: 'If unclear: one short, friendly question to ask back.' },
    },
    required: ['intent'],
  },
};

export async function classifyReply(text, kind) {
  const allowed = { chase: 'on_my_way or cant_make_it', pack: 'signing_now or cant_make_it' }[kind] || 'accept or decline';
  const asked = {
    chase: 'Their shift has started and they have not clocked in. We asked if they are on their way.',
    pack: "Their shift is about to start or has started, and they cannot clock in until they read and sign the venue's site pack. We asked them to sign it now (\"doing it now\", \"on it\" = signing_now).",
  }[kind] || 'We offered them an extra cover shift and asked if they can take it.';
  const { input } = await extract({
    model: HAIKU, max_tokens: 300, tool: REPLY_TOOL, module: 'ops',
    system: `You read short replies from UK security staff. ${asked} Choose ${allowed}, or unclear if you cannot tell. Slang is common ("omw", "5 mins", "cant tonight sorry", "yeah go on").`,
    messages: [{ role: 'user', content: String(text).slice(0, 500) }],
  });
  return input || { intent: 'unclear' };
}

async function answerQuick(user, msg, value, extra = {}) {
  const [kind, ref] = String(msg.quick?.ref || '').split(':');
  try {
    if (kind === 'chase') {
      if (!['on_my_way', 'cant_make_it'].includes(value)) fail(400, 'Unknown reply');
      await officerReply({ assignment_id: ref, reply: value, eta_min: extra.eta_min, reason: extra.reason }, user);
    } else if (kind === 'pack') {
      await packReply({ assignment_id: ref, reply: value, reason: extra.reason }, user);
    } else if (kind === 'offer') {
      if (!['accept', 'decline'].includes(value)) fail(400, 'Unknown reply');
      await offerRespond({ offer_id: ref, accept: value === 'accept' }, user);
    } else fail(400, 'This message has no reply buttons');
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    await q('UPDATE messages SET quick_used = $2 WHERE id = $1', [msg.id, 'closed']);
    await opsMessage(user.id, `${e.message}.`);
  }
}

async function handleOpsText(user, conv, text) {
  if (!user.officer_id) return;
  const open = await one(
    "SELECT * FROM messages WHERE conversation_id = $1 AND quick IS NOT NULL AND quick_used IS NULL AND created_at > now() - interval '18 hours' ORDER BY created_at DESC LIMIT 1", [conv.id]);
  if (!open) {
    await opsMessage(user.id, "I'm Orb's automatic assistant, so I can only answer shift questions I've asked you. To reach the office, start a new message to a manager.");
    return;
  }
  const kind = String(open.quick.ref).split(':')[0];
  let r;
  try { r = await classifyReply(text, kind); } catch (e) { console.error('classifyReply', e.message); r = { intent: 'unclear' }; }
  if (r.intent === 'unclear' || !open.quick.options.some((o) => o.value === r.intent)) {
    await opsMessage(user.id, r.question || 'Sorry, I didn\'t catch that — please tap one of the buttons above.');
    return;
  }
  await answerQuick(user, open, r.intent, { eta_min: r.eta_min, reason: r.reason || text });
}

export const actions = {
  'messages.inbox': def(ALL, async (b, { user }) => {
    const rows = await q(
      `SELECT c.id, c.kind, c.title, c.ref_id, c.last_message_at, cm.muted,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.created_at > cm.last_read_at AND m.sender_id <> $1 AND m.deleted_at IS NULL) AS unread,
              (SELECT json_build_object('body', CASE WHEN m.deleted_at IS NOT NULL THEN 'Message deleted' WHEN m.body = '' AND m.share IS NOT NULL THEN 'Shared a post' ELSE m.body END, 'photos', jsonb_array_length(m.attachments), 'voice', m.deleted_at IS NULL AND m.transcript_status IS NOT NULL, 'sender_id', m.sender_id, 'sender', u.name, 'at', m.created_at)
                 FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last,
              (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'role', u.role, 'system', u.system, 'photo_key', ${PHOTO}) ORDER BY u.name)
                 FROM conversation_members x JOIN users u ON u.id = x.user_id WHERE x.conversation_id = c.id AND x.left_at IS NULL AND x.user_id <> $1) AS others
         FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL
        WHERE EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id) OR c.kind IN ('direct','group')
        ORDER BY c.last_message_at DESC LIMIT 200`, [user.id]);
    return Promise.all(rows.map(async (r) => {
      const others = await Promise.all((r.others || []).slice(0, 4).map(sign));
      const title = r.title || (r.kind === 'direct' ? others[0]?.name : others.map((o) => o.name.split(' ')[0]).join(', ')) || KIND_LABEL[r.kind];
      return { ...r, title, label: KIND_LABEL[r.kind] || null, others, member_count: (r.others || []).length + 1 };
    }));
  }),

  'messages.unread': def(ALL, async (_b, { user }) => {
    const r = await one(
      `SELECT count(DISTINCT c.id)::int AS n FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
        WHERE cm.user_id = $1 AND cm.left_at IS NULL AND NOT cm.muted
          AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.created_at > cm.last_read_at AND m.sender_id <> $1 AND m.deleted_at IS NULL)`, [user.id]);
    return { unread: r.n };
  }),

  // Newest page, an older page (before), or the stretch around one message (around: id) for jumping to a search hit or a quote
  'messages.thread': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const { c, m, oversight } = await canRead(user, b.id);
    let rows, more, newer = false;
    if (b.around) {
      const at = need(await one('SELECT created_at FROM messages WHERE id = $1 AND conversation_id = $2', [b.around, c.id]), 'Message not found').created_at;
      const half = PAGE / 2;
      const [before, after] = await Promise.all([
        q(`SELECT ${MSG_COLS} FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = $1 AND m.created_at <= $2 ORDER BY m.created_at DESC LIMIT ${half + 1}`, [c.id, at]),
        q(`SELECT ${MSG_COLS} FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = $1 AND m.created_at > $2 ORDER BY m.created_at LIMIT ${half + 1}`, [c.id, at]),
      ]);
      more = before.length > half;
      newer = after.length > half;
      rows = [...after.slice(0, half).reverse(), ...before.slice(0, half)];
    } else {
      rows = await q(
        `SELECT ${MSG_COLS} FROM messages m JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = $1 AND ($2::timestamptz IS NULL OR m.created_at < $2) ORDER BY m.created_at DESC LIMIT ${PAGE + 1}`, [c.id, b.before || null]);
      more = rows.length > PAGE;
      rows = rows.slice(0, PAGE);
    }
    const people = await members(c.id);
    const list = await shapeMessages(rows.reverse(), user, people);
    const others = people.filter((p) => p.id !== user.id);
    const pinned = await q(
      `SELECT m.id, m.body, m.attachments, m.deleted_at, m.created_at, u.name FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1 AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.pinned_at DESC LIMIT ${PIN_MAX}`, [c.id]);
    // "Must confirm" messages this person still has to confirm stay at the top until they do
    const toConfirm = m ? await q(
      `SELECT m.id, m.body, m.attachments, m.deleted_at, m.created_at, u.name FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1 AND m.must_confirm AND m.deleted_at IS NULL AND m.sender_id <> $2
          AND NOT EXISTS (SELECT 1 FROM message_confirms x WHERE x.message_id = m.id AND x.user_id = $2)
        ORDER BY m.created_at DESC LIMIT 5`, [c.id, user.id]) : [];
    const brief = (r, extra) => ({ id: r.id, name: r.name, text: snippet(r), at: r.created_at, ...extra });
    return {
      conversation: {
        ...c, title: titleOf(c, others), label: KIND_LABEL[c.kind] || null, muted: !!m?.muted, member: !!m, oversight: !!oversight,
        can_add: c.kind === 'group' && !!m, can_leave: c.kind === 'group' && !!m,
        can_pin: canPin(user, c, !!m), can_confirm: !!m && canRequireConfirm(user, c), can_mention: mentionable(c.kind),
      },
      members: people, messages: list, more, newer,
      pinned: [...toConfirm.map((r) => brief(r, { confirm: true })), ...pinned.map((r) => brief(r, {}))],
    };
  }),

  'messages.read': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const r = await one('UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL RETURNING last_read_at', [b.id, user.id]);
    if (r) await publishConv(b.id, 'read', { u: user.id, at: r.last_read_at });
    await q("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND kind = 'message' AND link = $2 AND read_at IS NULL", [user.id, `/messages/${b.id}`]).catch(() => {});
    return { ok: true };
  }),

  'messages.send': def(ALL, async (b, { user }) => {
    required(b, 'conversation_id');
    const { c } = await canWrite(user, b.conversation_id);
    const body = String(b.body || '').trim();
    const attachments = await cleanAttachments(user, b.attachments);
    const share = b.share ? await cleanShare(user, b.share) : null;
    if (!body && !attachments.length && !share) fail(400, 'Write a message or add a photo');
    if (body.length > 4000) fail(400, 'Messages can be up to 4,000 characters');
    if (attachments.filter(isAudio).length > 1) fail(400, 'Send one voice message at a time');
    if (b.must_confirm && !canRequireConfirm(user, c)) fail(403, 'Only managers can ask people to confirm a message');
    let replyTo = null;
    if (b.reply_to) replyTo = need(await one('SELECT id FROM messages WHERE id = $1 AND conversation_id = $2', [b.reply_to, c.id]), 'The message you replied to is gone').id;
    const people = await members(c.id);
    const mentions = mentionable(c.kind) ? cleanMentions(body, b.mentions, people, user.id) : [];
    // A mention gets its own notice (even in a muted chat), so they don't also get the plain message push,
    // unless they switched mention notices off
    const mentionOn = mentions.length ? (await q(
      "SELECT id FROM users WHERE id = ANY($1::uuid[]) AND COALESCE(notify_prefs->>'mention', (SELECT notify_defaults->>'mention' FROM settings WHERE id = 1)) IS DISTINCT FROM 'false'", [mentions])).map((r) => r.id) : [];
    const m = await post(c.id, user.id, { body, attachments, replyTo, mentions, mustConfirm: !!b.must_confirm, skipPush: mentionOn, share });
    if (mentions.length) {
      await notify(mentions, {
        kind: 'mention', title: `${user.name} mentioned you${c.title ? ` in ${c.title}` : ''}`, body: preview(body, attachments), link: `/messages/${c.id}?m=${m.id}`, dedupe: `mmention:${m.id}`,
      });
    }
    if (c.kind === 'ops' && body) await handleOpsText(user, c, body);
    const [row] = await shapeMessages([await oneMessage(m.id)], user, people);
    return row;
  }),

  'messages.reply': def(ALL, async (b, { user }) => {
    required(b, 'message_id', 'value');
    const msg = need(await one('SELECT * FROM messages WHERE id = $1', [b.message_id]), 'Message not found');
    const { c } = await canWrite(user, msg.conversation_id);
    if (c.kind !== 'ops' || !msg.quick) fail(400, 'This message has no reply buttons');
    if (msg.quick_used) fail(409, 'Already answered');
    const opt = msg.quick.options.find((o) => o.value === b.value);
    if (!opt) fail(400, 'Unknown reply');
    await post(c.id, user.id, { body: opt.label });
    await answerQuick(user, msg, b.value, { eta_min: b.eta_min });
    return { ok: true };
  }),

  'messages.edit': def(ALL, async (b, { user }) => {
    required(b, 'id', 'body');
    const m = need(await one('SELECT * FROM messages WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL', [b.id, user.id]), 'Message not found');
    if (Date.now() - new Date(m.created_at) > EDIT_MINUTES * 60000) fail(400, `Messages can only be edited for ${EDIT_MINUTES} minutes`);
    const body = String(b.body).trim();
    if (!body) fail(400, 'Write a message');
    await q('UPDATE messages SET body = $2, edited_at = now() WHERE id = $1', [m.id, body.slice(0, 4000)]);
    await publishConv(m.conversation_id, 'upd', { id: m.id });
    return { ok: true };
  }),

  'messages.delete': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const m = need(await one('SELECT * FROM messages WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL', [b.id, user.id]), 'Message not found');
    await q('UPDATE messages SET deleted_at = now(), pinned_at = NULL WHERE id = $1', [m.id]);
    await audit(user, 'messages.delete', 'message', m.id);
    await publishConv(m.conversation_id, 'upd', { id: m.id });
    return { ok: true };
  }),

  // Everyone can message everyone who is active
  'messages.people': def(ALL, async (_b, { user }) => {
    const rows = await q(
      `SELECT u.id, u.name, u.goes_by, u.role, ${PHOTO} AS photo_key,
              COALESCE((SELECT string_agg(DISTINCT v.name, ', ') FROM venue_contacts vc JOIN venues v ON v.id = vc.venue_id WHERE vc.user_id = u.id), '') AS venues
         FROM users u LEFT JOIN officers o ON o.user_id = u.id
        WHERE u.status = 'active' AND NOT u.system AND u.id <> $1 AND (o.id IS NULL OR o.status IN ('active','onboarding'))
        ORDER BY u.role = 'officer', u.name`, [user.id]);
    return Promise.all(rows.map(sign));
  }),

  'messages.startDirect': def(ALL, async (b, { user }) => {
    required(b, 'user_id');
    if (b.user_id === user.id) fail(400, 'Choose someone else');
    need(await one("SELECT 1 FROM users WHERE id = $1 AND status = 'active' AND NOT system", [b.user_id]), 'Person not found');
    const found = await one(
      `SELECT c.id FROM conversations c WHERE c.kind = 'direct'
          AND EXISTS (SELECT 1 FROM conversation_members x WHERE x.conversation_id = c.id AND x.user_id = $1)
          AND EXISTS (SELECT 1 FROM conversation_members x WHERE x.conversation_id = c.id AND x.user_id = $2) LIMIT 1`, [user.id, b.user_id]);
    if (found) return { id: found.id };
    const c = await one("INSERT INTO conversations (kind, created_by) VALUES ('direct', $1) RETURNING id", [user.id]);
    await syncMembers(c.id, [user.id, b.user_id]);
    return { id: c.id };
  }),

  'messages.createGroup': def(ALL, async (b, { user }) => {
    required(b, 'user_ids');
    const title = String(b.title || '').trim().slice(0, 80);
    const ids = (await q("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND status = 'active' AND NOT system", [b.user_ids])).map((r) => r.id);
    if (ids.length < 2) fail(400, 'Choose at least two people for a group');
    const c = await one("INSERT INTO conversations (kind, title, created_by) VALUES ('group', $1, $2) RETURNING id", [title, user.id]);
    await syncMembers(c.id, [user.id, ...ids]);
    await post(c.id, user.id, { body: `${user.name} started ${title ? `"${title}"` : 'a group'}` });
    return { id: c.id };
  }),

  'messages.addMembers': def(ALL, async (b, { user }) => {
    required(b, 'id', 'user_ids');
    const { c } = await canWrite(user, b.id);
    if (c.kind !== 'group') fail(400, 'People can only be added to groups');
    const people = await q("SELECT id, name FROM users WHERE id = ANY($1::uuid[]) AND status = 'active' AND NOT system", [b.user_ids]);
    await syncMembers(c.id, people.map((p) => p.id));
    if (people.length) await post(c.id, user.id, { body: `${user.name} added ${people.map((p) => p.name).join(', ')}` });
    return { ok: true };
  }),

  'messages.leave': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const { c } = await canWrite(user, b.id);
    if (c.kind !== 'group') fail(400, 'You can only leave groups');
    await post(c.id, user.id, { body: `${user.name} left the group` });
    await q('UPDATE conversation_members SET left_at = now() WHERE conversation_id = $1 AND user_id = $2', [c.id, user.id]);
    return { ok: true };
  }),

  'messages.mute': def(ALL, async (b, { user }) => {
    required(b, 'id');
    await canWrite(user, b.id);
    await q('UPDATE conversation_members SET muted = $3 WHERE conversation_id = $1 AND user_id = $2', [b.id, user.id, !!b.muted]);
    return { ok: true };
  }),

  'messages.rename': def(ALL, async (b, { user }) => {
    required(b, 'id', 'title');
    const { c } = await canWrite(user, b.id);
    if (c.kind !== 'group') fail(400, 'Only groups can be renamed');
    await q('UPDATE conversations SET title = $2 WHERE id = $1', [c.id, String(b.title).trim().slice(0, 80)]);
    return { ok: true };
  }),

  // Flag a message to the company managers (bullying, safety, anything worrying)
  'messages.report': def(ALL, async (b, { user }) => {
    required(b, 'message_id');
    const m = need(await one('SELECT * FROM messages WHERE id = $1', [b.message_id]), 'Message not found');
    await canRead(user, m.conversation_id);
    await q('INSERT INTO message_reports (message_id, user_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [m.id, user.id, String(b.reason || '').slice(0, 500)]);
    await notify((await companyManagers()).filter((id) => id !== user.id), {
      kind: 'message', severity: 'warning', title: `${user.name} reported a message`, body: b.reason || 'Open the conversation to review it.', link: `/messages/${m.conversation_id}`, email: true,
    });
    await audit(user, 'messages.report', 'message', m.id);
    return { ok: true };
  }),

  // ---------- Reactions, typing, pins, "Must confirm", voice notes, search, realtime ----------
  'messages.react': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const { msg, c } = await liveMessage(user, b.id);
    if (!b.kind) {
      await q('DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2', [msg.id, user.id]);
    } else {
      if (!REACTION_KINDS.includes(b.kind)) fail(400, 'Unknown reaction');
      await q(`INSERT INTO message_reactions (message_id, user_id, kind) VALUES ($1,$2,$3)
        ON CONFLICT (message_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now()`, [msg.id, user.id, b.kind]);
      // One notice per message per day, never in a chat the author muted, never to Orb
      const author = await one(
        `SELECT cm.muted, u.system FROM conversation_members cm JOIN users u ON u.id = cm.user_id
          WHERE cm.conversation_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL`, [c.id, msg.sender_id]);
      if (msg.sender_id !== user.id && author && !author.muted && !author.system) {
        await notify([msg.sender_id], {
          kind: 'reaction', title: `${user.name} reacted ${EMOJI[b.kind]} to your message`, body: preview(msg.body, msg.attachments),
          link: `/messages/${c.id}?m=${msg.id}`, dedupe: `mreact:${msg.id}:${londonDate(new Date())}`,
        });
      }
    }
    await publishConv(c.id, 'upd', { id: msg.id });
    return { ok: true };
  }),

  'messages.reactions': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const msg = need(await one('SELECT conversation_id FROM messages WHERE id = $1', [b.id]), 'Message not found');
    await canRead(user, msg.conversation_id);
    const rows = await q(`SELECT r.kind, u.id, u.name, u.role, ${PHOTO} AS photo_key FROM message_reactions r JOIN users u ON u.id = r.user_id
      WHERE r.message_id = $1 ORDER BY r.created_at DESC`, [b.id]);
    return Promise.all(rows.map(sign));
  }),

  // The app calls this at most every few seconds while someone types; it is only relayed, never stored
  'messages.typing': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const { c } = await canWrite(user, b.id);
    if (c.kind !== 'ops') await publishConv(c.id, 'typing', { u: user.id, name: user.name.split(' ')[0] }, { except: user.id });
    return { ok: true };
  }),

  'messages.pin': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const { msg, c, m } = await liveMessage(user, b.id);
    if (!canPin(user, c, !!m)) fail(403, c.kind === 'group' ? 'Only managers and whoever started the group can pin messages' : 'Only managers can pin messages');
    if (b.pinned === false) {
      await q('UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = $1', [msg.id]);
    } else if (!msg.pinned_at) {
      const n = await one('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1 AND pinned_at IS NOT NULL AND deleted_at IS NULL', [c.id]);
      if (n.n >= PIN_MAX) fail(400, `Up to ${PIN_MAX} messages can be pinned. Unpin one first.`);
      await q('UPDATE messages SET pinned_at = now(), pinned_by = $2 WHERE id = $1', [msg.id, user.id]);
    }
    await publishConv(c.id, 'upd', { id: msg.id });
    return { ok: true };
  }),

  // "Got it" on a message a manager asked everyone to confirm
  'messages.confirm': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const { msg, c } = await liveMessage(user, b.id);
    if (!msg.must_confirm) fail(400, 'This message doesn\'t need confirming');
    if (msg.sender_id === user.id) fail(400, 'You sent this message');
    const r = await one('INSERT INTO message_confirms (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING confirmed_at', [msg.id, user.id]);
    if (r) {
      await audit(user, 'messages.confirm', 'message', msg.id);
      await publishConv(c.id, 'upd', { id: msg.id });
    }
    return { ok: true };
  }),

  // Remind only the people who haven't confirmed yet (once an hour at most)
  'messages.confirmChase': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const msg = need(await one('SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1 AND m.deleted_at IS NULL', [b.id]), 'Message not found');
    const { c } = await canRead(user, msg.conversation_id);
    if (!msg.must_confirm) fail(400, 'This message doesn\'t need confirming');
    if (msg.sender_id !== user.id && !MANAGER_ROLES.includes(user.role)) fail(403, 'Only the sender or a manager can chase');
    const people = await members(c.id);
    const done = new Set((await q('SELECT user_id FROM message_confirms WHERE message_id = $1', [msg.id])).map((r) => r.user_id));
    const outstanding = people.filter((p) => p.id !== msg.sender_id && !p.system && !done.has(p.id)).map((p) => p.id);
    if (!outstanding.length) return { sent: 0 };
    await notify(outstanding, {
      kind: 'message', severity: 'warning', title: `Please confirm ${msg.sender_name.split(' ')[0]}'s message`, body: preview(msg.body, msg.attachments),
      link: `/messages/${c.id}?m=${msg.id}`, dedupe: `mconfirm:${msg.id}:${new Date().toISOString().slice(0, 13)}`,
    });
    await audit(user, 'messages.confirm_chase', 'message', msg.id, { people: outstanding.length });
    return { sent: outstanding.length };
  }),

  // The app calls this right after sending a voice note; the jobs pick up any it missed
  'messages.transcribe': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const msg = need(await one('SELECT id, sender_id FROM messages WHERE id = $1', [b.id]), 'Message not found');
    if (msg.sender_id !== user.id) fail(403, 'Only the sender can do this');
    return { transcript: await runTranscript(msg.id) };
  }),

  // Search the chats the person is in (from when they joined): text and voice note transcripts
  'messages.search': def(ALL, async (b, { user }) => {
    const text = String(b.q || '').trim().slice(0, 100);
    if (text.length < 2) return { results: [] };
    const like = `%${text.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    const rows = await q(
      `SELECT m.id, m.conversation_id, m.body, m.transcript, m.attachments, m.created_at, m.sender_id, u.name AS sender
         FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $1 AND cm.left_at IS NULL
         JOIN users u ON u.id = m.sender_id
        WHERE m.deleted_at IS NULL AND m.created_at >= cm.joined_at AND ($3::uuid IS NULL OR m.conversation_id = $3)
          AND (m.search @@ websearch_to_tsquery('english', $2) OR m.body ILIKE $4 OR m.transcript ILIKE $4)
        ORDER BY m.created_at DESC LIMIT 50`, [user.id, text, b.conversation_id || null, like]);
    const convIds = [...new Set(rows.map((r) => r.conversation_id))];
    const convs = convIds.length ? await q(
      `SELECT c.id, c.kind, c.title,
              (SELECT json_agg(json_build_object('id', u.id, 'name', u.name) ORDER BY u.name) FROM conversation_members x JOIN users u ON u.id = x.user_id
                WHERE x.conversation_id = c.id AND x.left_at IS NULL AND x.user_id <> $2) AS others
         FROM conversations c WHERE c.id = ANY($1::uuid[])`, [convIds, user.id]) : [];
    const byId = new Map(convs.map((c) => [c.id, { id: c.id, kind: c.kind, title: titleOf(c, c.others || []) }]));
    const around = (s) => {
      const i = s.toLowerCase().indexOf(text.toLowerCase());
      return i > 60 ? `…${s.slice(i - 40, i + 100)}` : s.slice(0, 140);
    };
    return {
      results: rows.map((r) => {
        const inBody = r.body && r.body.toLowerCase().includes(text.toLowerCase());
        const src = r.body && (inBody || !r.transcript) ? r.body : r.transcript || preview(r.body, r.attachments);
        return { id: r.id, conversation: byId.get(r.conversation_id), sender: r.sender, mine: r.sender_id === user.id, at: r.created_at, text: around(src), voice: !inBody && !!r.transcript };
      }),
    };
  }),

  // Realtime: a short-lived token that can only read the person's own channel
  'messages.realtime': def(ALL, async (_b, { user }) => ({ token: await realtimeToken(user).catch((e) => { console.warn('[realtime]', e.message); return null; }) })),

  // For people who are not in Orb conversations (e.g. venue staff), confirm the system user exists
  'messages.opsId': def(ALL, async () => ({ id: await opsUser() })),
};
