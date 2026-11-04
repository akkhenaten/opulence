// Messages: direct and group chats for everyone, plus threads the system opens
// (cover requests, shift teams, Orb Ops for chases and cover offers, pay disputes).
import { one, q } from '../lib/db.mjs';
import { fail, required, need, HttpError } from '../lib/http.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { cleanFiles } from '../lib/files.mjs';
import { notify, companyManagers } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { extract, HAIKU } from '../lib/ai.mjs';
import { post, syncMembers, opsUser, opsMessage } from '../lib/threads.mjs';
import { officerReply, offerRespond, packReply } from './ops.mjs';
import { ALL, def } from './_def.mjs';

const PAGE = 40;
const EDIT_MINUTES = 15;
const PHOTO = 'COALESCE((SELECT o.photo_key FROM officers o WHERE o.user_id = u.id LIMIT 1), u.photo_key)';
const KIND_LABEL = { cover: 'Cover request', shift: 'Shift team', ops: 'Orb Ops', pay: 'Pay query', group: 'Group' };

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

async function shapeMessages(rows) {
  return Promise.all(rows.map(async (r) => ({
    ...r,
    sender: await sign(r.sender),
    body: r.deleted_at ? '' : r.body,
    attachments: r.deleted_at ? [] : await Promise.all((r.attachments || []).map(async (a) => ({ name: a.name, mime: a.mime, url: await downloadUrl(a.key, a.name) }))),
    quick: r.quick && !r.quick_used ? r.quick : null,
  })));
}

const MSG_COLS = `m.id, m.conversation_id, m.body, m.attachments, m.quick, m.quick_used, m.edited_at, m.deleted_at, m.created_at, m.sender_id,
  json_build_object('id', u.id, 'name', u.name, 'role', u.role, 'system', u.system, 'photo_key', ${PHOTO}) AS sender`;

async function members(convId) {
  const rows = await q(
    `SELECT u.id, u.name, u.role, u.system, ${PHOTO} AS photo_key, cm.last_read_at FROM conversation_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = $1 AND cm.left_at IS NULL ORDER BY u.system, u.name`, [convId]);
  return Promise.all(rows.map(sign));
}

// ---------- Orb Ops: understanding typed replies ----------
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
              (SELECT json_build_object('body', CASE WHEN m.deleted_at IS NULL THEN m.body ELSE 'Message deleted' END, 'photos', jsonb_array_length(m.attachments), 'sender_id', m.sender_id, 'sender', u.name, 'at', m.created_at)
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

  'messages.thread': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const { c, m, oversight } = await canRead(user, b.id);
    const rows = await q(
      `SELECT ${MSG_COLS} FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1 AND ($2::timestamptz IS NULL OR m.created_at < $2) ORDER BY m.created_at DESC LIMIT ${PAGE + 1}`, [c.id, b.before || null]);
    const more = rows.length > PAGE;
    const list = await shapeMessages(rows.slice(0, PAGE).reverse());
    const people = await members(c.id);
    const others = people.filter((p) => p.id !== user.id);
    const title = c.title || (c.kind === 'direct' ? others[0]?.name : others.map((p) => p.name.split(' ')[0]).join(', ')) || KIND_LABEL[c.kind];
    return {
      conversation: { ...c, title, label: KIND_LABEL[c.kind] || null, muted: !!m?.muted, member: !!m, oversight: !!oversight, can_add: c.kind === 'group' && !!m, can_leave: c.kind === 'group' && !!m },
      members: people, messages: list, more,
    };
  }),

  'messages.read': def(ALL, async (b, { user }) => {
    required(b, 'id');
    await q('UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2', [b.id, user.id]);
    await q("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND kind = 'message' AND link = $2 AND read_at IS NULL", [user.id, `/messages/${b.id}`]).catch(() => {});
    return { ok: true };
  }),

  'messages.send': def(ALL, async (b, { user }) => {
    required(b, 'conversation_id');
    const { c } = await canWrite(user, b.conversation_id);
    const body = String(b.body || '').trim();
    const attachments = await cleanAttachments(user, b.attachments);
    if (!body && !attachments.length) fail(400, 'Write a message or add a photo');
    if (body.length > 4000) fail(400, 'Messages can be up to 4,000 characters');
    const m = await post(c.id, user.id, { body, attachments });
    if (c.kind === 'ops' && body) await handleOpsText(user, c, body);
    const [row] = await shapeMessages([await one(`SELECT ${MSG_COLS} FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1`, [m.id])]);
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
    return { ok: true };
  }),

  'messages.delete': def(ALL, async (b, { user }) => {
    required(b, 'id');
    const m = need(await one('SELECT * FROM messages WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL', [b.id, user.id]), 'Message not found');
    await q('UPDATE messages SET deleted_at = now() WHERE id = $1', [m.id]);
    await audit(user, 'messages.delete', 'message', m.id);
    return { ok: true };
  }),

  // Everyone can message everyone who is active
  'messages.people': def(ALL, async (_b, { user }) => {
    const rows = await q(
      `SELECT u.id, u.name, u.role, ${PHOTO} AS photo_key,
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

  // For people who are not in Orb Ops conversations (e.g. venue staff), confirm the system user exists
  'messages.opsId': def(ALL, async () => ({ id: await opsUser() })),
};
