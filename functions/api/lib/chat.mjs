// Chat rules shared by the Messages module and its tests: reactions, @mentions, pins, "Seen" and "Must confirm".
export const REACTION_KINDS = ['like', 'love', 'laugh', 'wow', 'sad', 'clap'];
export const PIN_MAX = 3;
export const VOICE_MAX_S = 120;
export const MANAGER_ROLES = ['company', 'security'];
const isMgr = (user) => MANAGER_ROLES.includes(user?.role);

/** Kinds of chat where @mentions make sense (people talking in a group). */
export const mentionable = (kind) => ['group', 'shift', 'cover', 'pay'].includes(kind);

/** Keep only mentioned ids that are members (not the sender) and whose @Name is still in the text. */
export function cleanMentions(body, ids, members, senderId) {
  const text = String(body || '').toLowerCase();
  const want = new Set((Array.isArray(ids) ? ids : []).map(String));
  return members
    .filter((m) => want.has(String(m.id)) && m.id !== senderId && !m.system && text.includes(`@${String(m.name || '').toLowerCase()}`))
    .map((m) => m.id);
}

/** Managers in the chat can pin anywhere; whoever started a group can pin in it. */
export const canPin = (user, conv, isMember) => !!isMember && conv.kind !== 'ops' && (isMgr(user) || (conv.kind === 'group' && conv.created_by === user.id));

export const canRequireConfirm = (user, conv) => isMgr(user) && conv.kind !== 'ops';

/** Who has read up to a message: everyone but the sender and the Orb bot whose last read is at or after it. */
export function seenSummary(members, msg) {
  const others = members.filter((m) => m.id !== msg.sender_id && !m.system);
  const seen = others.filter((m) => m.last_read_at && new Date(m.last_read_at) >= new Date(msg.created_at))
    .map((m) => ({ id: m.id, name: m.name, at: m.last_read_at }));
  return { seen, total: others.length };
}

/** "Confirmed 6/9": recipients are the members other than the sender at the time asked. */
export function confirmSummary(members, msg, confirms, viewer) {
  const recipients = members.filter((m) => m.id !== msg.sender_id && !m.system);
  const done = new Map(confirms.map((c) => [c.user_id, c.confirmed_at]));
  const showList = viewer.id === msg.sender_id || isMgr(viewer);
  return {
    required: true,
    mine: done.has(viewer.id) ? done.get(viewer.id) : null,
    needed: viewer.id !== msg.sender_id && recipients.some((r) => r.id === viewer.id),
    done: recipients.filter((r) => done.has(r.id)).length,
    total: recipients.length,
    outstanding: showList ? recipients.filter((r) => !done.has(r.id)).map((r) => ({ id: r.id, name: r.name })) : null,
    confirmed: showList ? recipients.filter((r) => done.has(r.id)).map((r) => ({ id: r.id, name: r.name, at: done.get(r.id) })) : null,
  };
}

/** Reaction rows → [{ kind, count, mine }] in the fixed emoji order. */
export function reactionSummary(rows, viewerId) {
  return REACTION_KINDS.map((kind) => {
    const of = rows.filter((r) => r.kind === kind);
    return { kind, count: of.length, mine: of.some((r) => r.user_id === viewerId) };
  }).filter((r) => r.count);
}

export const isAudio = (a) => /^audio\//.test(a?.mime || '');
