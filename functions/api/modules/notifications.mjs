import { one, q } from '../lib/db.mjs';
import { ALL, def } from './_def.mjs';
import { OPTIONAL_KINDS } from '../lib/notify.mjs';
import { pushToSubs, vapidKeys } from '../lib/webpush.mjs';
import { fail } from '../lib/http.mjs';
import { venueScope } from '../lib/scope.mjs';
import { waitingItems } from '../lib/waiting.mjs';
import { actions as incidents } from './incidents.mjs';
import { actions as ops } from './ops.mjs';

export const actions = {
  'notifications.list': def(ALL, async (b, { user }) => {
    const [items, unread] = await Promise.all([
      q(`SELECT * FROM notifications WHERE user_id = $1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL) AND ($3::bigint IS NULL OR id < $3)
          ORDER BY id DESC LIMIT 50`, [user.id, b.unread || null, b.before || null]),
      one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [user.id]),
    ]);
    return { items, unread: unread.n };
  }),

  // To-dos for the bell's "Waiting for you", counted from the work itself; a count that can't be read is left out
  'notifications.waiting': def(ALL, async (_b, ctx) => {
    const { user } = ctx;
    const safe = (p) => Promise.resolve().then(p).catch(() => null);
    const reports = safe(async () => (await incidents['incidents.list'].fn({ to_sign: true, limit: 500 }, ctx)).length);
    if (user.role === 'officer') {
      if (!user.officer_id) return waitingItems('officer', { answer: 0, reports: 0 });
      const [answer, r] = await Promise.all([safe(async () => {
        const [booked, offers] = await Promise.all([
          one(`SELECT count(*)::int AS n FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
                WHERE a.officer_id = $1 AND a.status = 'assigned' AND s.status = 'published' AND s.ends_at > now()`, [user.officer_id]),
          ops['ops.myOffers'].fn({}, ctx),
        ]);
        return booked.n + offers.offers.filter((o) => o.status === 'offered').length;
      }), reports]);
      return waitingItems('officer', { answer, reports: r });
    }
    if (user.role === 'venue') {
      const scope = await venueScope(user);
      const [timesheets, invoices, r] = await Promise.all([
        safe(async () => (await one(`SELECT count(*)::int AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
                                      WHERE t.status = 'approved' AND s.venue_id = ANY($1)`, [scope])).n),
        safe(async () => (await one(`SELECT count(*)::int AS n FROM invoices WHERE kind = 'invoice' AND venue_id = ANY($1) AND status IN ('issued','overdue')`, [scope])).n),
        reports]);
      return waitingItems('venue', { timesheets, invoices, reports: r });
    }
    const [decisions, r] = await Promise.all([safe(async () => (await ops['ops.count'].fn({}, ctx)).n), reports]);
    return waitingItems(user.role, { decisions, reports: r });
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

  'notifications.prefs.get': def(ALL, async (_b, { user }) => {
    const r = await one(`SELECT notify_prefs, (SELECT notify_defaults FROM settings WHERE id = 1) AS defaults,
                                (SELECT count(*)::int FROM push_subscriptions WHERE user_id = $1) AS devices FROM users WHERE id = $1`, [user.id]);
    // A person's own choice wins, then the company default, then on
    const defaults = Object.fromEntries(OPTIONAL_KINDS.map((k) => [k, r.defaults?.[k] !== false]));
    // own: the kinds the person chose themselves; the rest follow the company default
    return { prefs: Object.fromEntries(OPTIONAL_KINDS.map((k) => [k, r.notify_prefs?.[k] ?? defaults[k]])), defaults, own: OPTIONAL_KINDS.filter((k) => r.notify_prefs?.[k] != null), devices: r.devices };
  }),

  'notifications.prefs.save': def(ALL, async (b, { user }) => {
    const prefs = Object.fromEntries(OPTIONAL_KINDS.filter((k) => k in (b.prefs || {})).map((k) => [k, !!b.prefs[k]]));
    await q('UPDATE users SET notify_prefs = notify_prefs || $2::jsonb WHERE id = $1', [user.id, JSON.stringify(prefs)]);
    return { ok: true };
  }),

  'push.publicKey': def(ALL, async () => ({ key: (await vapidKeys()).publicKey })),

  'push.subscribe': def(ALL, async (b, { user }) => {
    const s = b.subscription || {};
    if (!/^https:\/\//.test(s.endpoint || '') || !s.keys?.p256dh || !s.keys?.auth) fail(400, 'Invalid push subscription');
    await q(`INSERT INTO push_subscriptions (user_id, endpoint, keys) VALUES ($1, $2, $3)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`, [user.id, s.endpoint, { p256dh: s.keys.p256dh, auth: s.keys.auth }]);
    return { ok: true };
  }),

  // A test notice to this device only, on the person's own tap: what the push service answered
  'push.test': def(ALL, async (b, { user }) => {
    const s = await one('SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [user.id, b.endpoint || '']);
    if (!s) return { ok: false, status: 0, reason: 'not saved' };
    const [r] = await pushToSubs([s], { title: 'Test notification', body: 'Phone notifications are working on this device.', link: '' });
    return { ok: r.status >= 200 && r.status < 300, status: r.status, reason: r.reason };
  }),

  'push.unsubscribe': def(ALL, async (b, { user }) => {
    await q('DELETE FROM push_subscriptions WHERE user_id = $1 AND ($2::text IS NULL OR endpoint = $2)', [user.id, b.endpoint || null]);
    return { ok: true };
  }),
};
