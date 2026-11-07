// Everyday on a timer: celebration posts (birthdays, work anniversaries, welcomes) in the morning, event reminders
// the day before and an hour before, and old AI check results cleared out. Celebrations are posted by Orb and keyed,
// so running twice never posts twice.
import { one, q } from '../lib/db.mjs';
import { notify } from '../lib/notify.mjs';
import { moduleOn } from '../lib/modules.mjs';
import { londonParts } from '../lib/time.mjs';
import { publishFeed } from '../lib/realtime.mjs';
import { celebrationsDue, celebrationText } from '../lib/feed.mjs';

const postLink = (id) => `/everyday?post=${id}`;
const settingsOf = async () => (await one('SELECT everyday FROM settings WHERE id = 1'))?.everyday || {};

/**
 * Post one celebration as Orb. c: { type, user_id, name, key, years?, course? }. Returns the post id, or null when
 * switched off or already posted. Never throws: a celebration must not break whatever triggered it.
 */
export async function celebrate(c) {
  try {
    if (!(await moduleOn('everyday'))) return null;
    if ((await settingsOf()).celebrations?.[c.type] === false) return null;
    const orb = await one('SELECT id FROM users WHERE system LIMIT 1');
    if (!orb) return null;
    const post = await one(`INSERT INTO posts (author_id, kind, body, celebration, tags) VALUES ($1, 'celebration', $2, $3, $4)
      ON CONFLICT ((celebration->>'key')) WHERE kind = 'celebration' DO NOTHING RETURNING id`,
    [orb.id, celebrationText(c), { type: c.type, user_id: c.user_id, key: c.key, years: c.years || null, course: c.course || null }, [c.user_id]]);
    if (!post) return null;
    const title = { birthday: 'Happy birthday! The team is celebrating you on Everyday', anniversary: 'Happy work anniversary! See your post on Everyday',
      welcome: 'Welcome to the team! Say hello on Everyday', qualification: 'Your new qualification is on Everyday' }[c.type];
    await notify([c.user_id], { kind: 'celebration', title, body: celebrationText(c), link: postLink(post.id), dedupe: `celebration:${c.key}` });
    await publishFeed('feed.post', { id: post.id, author_id: orb.id });
    return post.id;
  } catch (e) {
    console.warn('[everyday] celebration failed:', e.message);
    return null;
  }
}

async function celebrations() {
  const now = londonParts(new Date());
  if (now.hour < 7 || now.hour > 9) return 'not the morning';
  const people = await q(`SELECT u.id AS user_id, u.name, o.dob, o.start_date, u.feed_prefs AS prefs FROM users u JOIN officers o ON o.user_id = u.id
    WHERE u.status = 'active' AND NOT u.system AND o.status = 'active'`);
  const due = celebrationsDue(people, now.date);
  // Welcomes are posted the moment a new joiner first signs in (auth.acceptInvite)
  let posted = 0;
  for (const c of due) if (await celebrate(c)) posted += 1;
  return posted;
}

// Going and Maybe hear about an event the day before and an hour before
async function eventReminders() {
  let sent = 0;
  for (const [col, within, word] of [['reminded_day_at', '24 hours', 'Tomorrow'], ['reminded_hour_at', '1 hour', 'In an hour']]) {
    const due = await q(`UPDATE feed_events e SET ${col} = now() FROM posts p
      WHERE p.id = e.post_id AND p.deleted_at IS NULL AND p.hidden_at IS NULL AND e.cancelled_at IS NULL AND e.${col} IS NULL
        AND e.starts_at > now() AND e.starts_at <= now() + interval '${within}' RETURNING e.post_id, e.title, e.starts_at`);
    for (const ev of due) {
      const ids = (await q("SELECT user_id FROM event_rsvps WHERE post_id = $1 AND answer IN ('going','maybe')", [ev.post_id])).map((r) => r.user_id);
      const at = new Date(ev.starts_at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      await notify(ids, { kind: 'event', title: `${word}: ${ev.title}`, body: at, link: postLink(ev.post_id), dedupe: `eventremind:${ev.post_id}:${col}` });
      sent += ids.length;
    }
  }
  return sent;
}

export async function feedJobs() {
  if (!(await moduleOn('everyday'))) return 'off';
  const out = { reminders: await eventReminders() };
  if (new Date().getUTCMinutes() < 5) {
    out.celebrations = await celebrations();
    out.checksCleared = (await q("DELETE FROM feed_checks WHERE created_at < now() - interval '30 days' RETURNING hash")).length;
    await q("DELETE FROM link_previews WHERE fetched_at < now() - interval '30 days'");
  }
  return out;
}
