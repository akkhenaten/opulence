// Instructions from a manager to the team on a shift: who they are for, who may see them, when they can be sent

/** The user ids an instruction is for: the one officer it names, or everyone on the shift. */
export const recipients = (entry, team) => {
  const ids = team.map((m) => m.user_id).filter(Boolean);
  return entry.to_user_id ? ids.filter((id) => id === entry.to_user_id) : ids;
};

/** The venue never sees instructions; an officer sees the ones sent to them or to the whole team; managers see all. */
export const visibleEntries = (entries, access, userId) => {
  if (access === 'mgr') return entries;
  if (access === 'venue') return entries.filter((e) => e.kind !== 'instruction');
  return entries.filter((e) => e.kind !== 'instruction' || !e.to_user_id || e.to_user_id === userId);
};

/** From two hours before the start until the end, on a published shift. */
export const canSendInstruction = (sh, now = Date.now()) =>
  sh.status === 'published' && now >= +new Date(sh.starts_at) - 2 * 3600e3 && now < +new Date(sh.ends_at);
