// Conversations shared by Messages, cover requests, shifts and Orb
import { one, q } from './db.mjs';
import { notify } from './notify.mjs';
import { publishConv } from './realtime.mjs';

let opsUserId = null;
/** The "Orb" system sender — has no password and can never sign in. */
export async function opsUser() {
  if (!opsUserId) opsUserId = (await one('SELECT id FROM users WHERE system LIMIT 1'))?.id;
  return opsUserId;
}

export async function syncMembers(convId, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  await q(
    `INSERT INTO conversation_members (conversation_id, user_id, last_read_at) SELECT $1, unnest($2::uuid[]), now() - interval '1 second'
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL WHERE conversation_members.left_at IS NOT NULL`, [convId, ids]);
}

/** One conversation per (kind, ref_id); members are added (never removed) on each call. */
export async function ensureThread(kind, refId, memberIds = [], title = '', createdBy = null) {
  let c = refId ? await one('SELECT * FROM conversations WHERE kind = $1 AND ref_id = $2', [kind, refId]) : null;
  if (!c) {
    c = await one(
      `INSERT INTO conversations (kind, ref_id, title, created_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (kind, ref_id) WHERE ref_id IS NOT NULL DO UPDATE SET title = conversations.title RETURNING *`, [kind, refId, title, createdBy]);
  }
  await syncMembers(c.id, memberIds);
  return c;
}

export const preview = (body, attachments) => (body || '').trim().slice(0, 120)
  || (attachments?.some((a) => /^audio\//.test(a.mime || '')) ? 'Voice message' : attachments?.length ? 'Sent a photo' : '');

/** Post a message; members other than the sender get a push (one per conversation until they read it).
 * skipPush: people who get their own notice instead (an @mention). */
export async function post(convId, senderId, { body = '', attachments = [], quick = null, email = false, replyTo = null, mentions = [], mustConfirm = false, skipPush = [], share = null } = {}) {
  const voice = (attachments || []).some((a) => /^audio\//.test(a.mime || ''));
  const m = await one(
    `INSERT INTO messages (conversation_id, sender_id, body, attachments, quick, reply_to, mentions, must_confirm, transcript_status, share)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [convId, senderId, String(body).slice(0, 4000), JSON.stringify(attachments || []), quick ? JSON.stringify(quick) : null,
      replyTo, mentions || [], !!mustConfirm, voice ? 'pending' : null, share]);
  await q('UPDATE conversations SET last_message_at = now() WHERE id = $1', [convId]);
  await q('UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2', [convId, senderId]);
  const [c, sender, to] = await Promise.all([
    one('SELECT kind, title FROM conversations WHERE id = $1', [convId]),
    one('SELECT name FROM users WHERE id = $1', [senderId]),
    q(`SELECT m.user_id FROM conversation_members m JOIN users u ON u.id = m.user_id
        WHERE m.conversation_id = $1 AND m.user_id <> $2 AND m.left_at IS NULL AND NOT m.muted AND u.status = 'active'`, [convId, senderId]),
  ]);
  const pushTo = to.filter((r) => !skipPush.includes(r.user_id));
  if (pushTo.length) {
    // Dedupe per unread stretch: the key changes once they have read past it
    const title = c.kind === 'direct' ? sender.name : `${sender.name}${c.title ? ` · ${c.title}` : ''}`;
    for (const r of pushTo) {
      const seen = await one('SELECT last_read_at FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [convId, r.user_id]);
      await notify([r.user_id], {
        kind: 'message', title, body: share && !body ? 'Shared a post from Everyday' : preview(body, attachments), link: `/messages/${convId}`,
        severity: quick || mustConfirm ? 'warning' : 'info', email, dedupe: `msg:${convId}:${new Date(seen.last_read_at).getTime()}${quick || mustConfirm ? `:${m.id}` : ''}`,
      });
    }
  }
  await publishConv(convId, 'msg', { id: m.id });
  return m;
}

/** A message from Orb into the person's own Orb conversation, with optional quick-reply buttons. */
export async function opsMessage(userId, body, quick = null, { email = false } = {}) {
  if (!userId) return null;
  const sys = await opsUser();
  const c = await ensureThread('ops', userId, [userId, sys], 'Orb');
  return post(c.id, sys, { body, quick, email });
}

/** Someone taken off a shift leaves its team chat, unless they still have a place there (on the shift again, or a manager). */
export async function leaveThread(kind, refId, userId) {
  await q(
    `UPDATE conversation_members m SET left_at = now() FROM conversations c, users u
      WHERE c.id = m.conversation_id AND c.kind = $1 AND c.ref_id = $2 AND m.user_id = $3 AND u.id = m.user_id AND u.role = 'officer' AND m.left_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM shift_assignments a JOIN officers o ON o.id = a.officer_id
                         WHERE a.shift_id = c.ref_id AND o.user_id = m.user_id AND a.status IN ('assigned','accepted'))`, [kind, refId, userId]);
}

/** Mark quick replies of a kind as answered so the buttons disappear. */
export async function closeQuick(userId, match) {
  const c = await one("SELECT id FROM conversations WHERE kind = 'ops' AND ref_id = $1", [userId]);
  if (!c) return;
  await q("UPDATE messages SET quick_used = $3 WHERE conversation_id = $1 AND quick_used IS NULL AND quick->>'ref' = $2", [c.id, match.ref, match.used || 'done']);
}
