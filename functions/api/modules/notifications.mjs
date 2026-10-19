import { one, q } from '../lib/db.mjs';
import { ALL, def } from './_def.mjs';

export const actions = {
  'notifications.list': def(ALL, async (b, { user }) => {
    const [items, unread] = await Promise.all([
      q(`SELECT * FROM notifications WHERE user_id = $1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL) AND ($3::bigint IS NULL OR id < $3)
          ORDER BY id DESC LIMIT 50`, [user.id, b.unread || null, b.before || null]),
      one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [user.id]),
    ]);
    return { items, unread: unread.n };
  }),

  'notifications.unreadCount': def(ALL, async (_b, { user }) => {
    const r = await one(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE severity = 'critical')::int AS critical, max(id) AS latest
         FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [user.id]);
    return { unread: r.n, critical: r.critical, latest: r.latest };
  }),

  'notifications.markRead': def(ALL, async (b, { user }) => {
    await q('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL AND ($2::bigint[] IS NULL OR id = ANY($2))', [user.id, b.ids || null]);
    return { ok: true };
  }),
};
