// Realtime events over the platform MQTT service. Each person reads their own channel (user:<id>), and staff also read
// the shared "feed" channel (Everyday hints only: which post changed, never its content). Browsers never publish:
// every event comes from here, so nobody can fake a message or a "seen".
import { q } from './db.mjs';

const BASE = () => `https://project.openkbs.com/projects/${process.env.OPENKBS_PROJECT_ID}/mqtt`;
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENKBS_API_KEY}` });
export const channelFor = (userId) => `user:${userId}`;
export const FEED_CHANNEL = 'feed';
const STAFF = ['company', 'security', 'officer'];

async function tokenFor(user, channels) {
  const r = await fetch(`${BASE()}/token`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ userId: String(user.id), subscribe: channels, publish: [], presence: false }),
  });
  if (!r.ok) {
    console.warn('[realtime] token refused:', r.status, (await r.text()).slice(0, 200));
    return null;
  }
  return r.json();
}

/** A 15-minute token that can read this person's channel (plus the shared feed channel for staff) and nothing else. */
export async function realtimeToken(user) {
  if (!process.env.OPENKBS_PROJECT_ID || !process.env.OPENKBS_API_KEY) return null;
  const own = channelFor(user.id);
  if (STAFF.includes(user.role)) {
    const d = await tokenFor(user, [own, FEED_CHANNEL]);
    if (d) return { ...d, channel: own, channels: [own, FEED_CHANNEL] };
  }
  const d = await tokenFor(user, [own]);
  return d && { ...d, channel: own, channels: [own] };
}

/** An Everyday hint to everyone reading the feed channel. Best effort, like publishTo. */
export async function publishFeed(event, data) {
  if (!process.env.OPENKBS_PROJECT_ID || !process.env.OPENKBS_API_KEY) return;
  try {
    const r = await fetch(`${BASE()}/publish`, {
      method: 'POST', headers: headers(), signal: AbortSignal.timeout(2000),
      body: JSON.stringify({ channel: FEED_CHANNEL, event, data }),
    });
    if (!r.ok) console.warn('[realtime] feed publish', r.status);
  } catch (e) {
    console.warn('[realtime] feed publish', e.message);
  }
}

/** Best effort: a slow or missing broker never fails the action, apps fall back to polling. */
export async function publishTo(userIds, event, data) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length || !process.env.OPENKBS_PROJECT_ID || !process.env.OPENKBS_API_KEY) return;
  await Promise.allSettled(ids.map((id) => fetch(`${BASE()}/publish`, {
    method: 'POST', headers: headers(), signal: AbortSignal.timeout(2000),
    body: JSON.stringify({ channel: channelFor(id), event, data }),
  }).then((r) => { if (!r.ok) console.warn('[realtime] publish', r.status); })));
}

/** Everyone currently in the conversation (minus `except`), people only. */
export async function publishConv(convId, event, data = {}, { except = null } = {}) {
  try {
    const rows = await q(
      `SELECT m.user_id FROM conversation_members m JOIN users u ON u.id = m.user_id
        WHERE m.conversation_id = $1 AND m.left_at IS NULL AND NOT u.system AND ($2::uuid IS NULL OR m.user_id <> $2)`, [convId, except]);
    await publishTo(rows.map((r) => r.user_id), event, { c: convId, ...data });
  } catch (e) {
    console.warn('[realtime]', e.message);
  }
}
