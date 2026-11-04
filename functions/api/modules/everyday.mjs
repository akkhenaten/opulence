// Everyday: the staff feed. Posts with photos, video, links, places and tagged people; shout-outs, polls, events and
// automatic celebrations; reactions, comments with inline replies (two levels) and @mentions; announcements that
// staff can be asked to acknowledge. Staff only (officers, company and security managers); venue users never see it.
// Managers moderate. Live updates go out on the shared "feed" channel as hints, never content.
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { one, q } from '../lib/db.mjs';
import { fail, need, required, HttpError } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { isManager } from '../lib/auth.mjs';
import { extract, fileBlock, HAIKU } from '../lib/ai.mjs';
import { downloadUrl, getObjectBytes, headObject, putObject } from '../lib/storage.mjs';
import { notify, companyManagers } from '../lib/notify.mjs';
import { moduleOn, requireModule } from '../lib/modules.mjs';
import { londonDate } from '../lib/time.mjs';
import { publishFeed } from '../lib/realtime.mjs';
import { venueScope } from '../lib/scope.mjs';
import {
  BADGES, cleanPlace, cleanPollOptions, cleanTopic, FILTERS, isPrivateHost, MUTE_DAYS, parseMeta, parseTopics, pollTally,
  promoteWaitlist, sniffMime, VIDEO_MAX_BYTES, VIDEO_MAX_S,
} from '../lib/feed.mjs';
import { MGR, def } from './_def.mjs';

const STAFF = ['company', 'security', 'officer'];
const KINDS = ['like', 'love', 'laugh', 'wow', 'sad', 'clap'];
const PAGE = 20;
const COMMENTS_PER_MINUTE = 8;
// Notification links go through /everyday, which the app sends to the right portal for the reader
const postLink = (id, comment) => `/everyday?post=${id}${comment ? `&comment=${comment}` : ''}`;

const PERSON = `json_build_object('id', u.id, 'name', u.name, 'role', u.role, 'photo_key', COALESCE(o.photo_key, u.photo_key))`;
const VISIBLE = (alias, mgr) => `${alias}.deleted_at IS NULL${mgr ? '' : ` AND ${alias}.hidden_at IS NULL`}`;
// Active staff who can be mentioned, tagged or counted for an announcement
const ACTIVE_STAFF = `u.status = 'active' AND NOT u.system AND u.role IN ('company','security','officer') AND (o.id IS NULL OR o.status IN ('active','onboarding'))`;

async function signPerson(p) {
  if (!p) return p;
  const { photo_key, ...rest } = p;
  return { ...rest, photo_url: photo_key ? await downloadUrl(photo_key) : null };
}
const signKey = (k) => (k ? downloadUrl(k) : null);

const reactionCols = (type, alias) => `
  (SELECT coalesce(jsonb_object_agg(kind, n), '{}') FROM (SELECT kind, count(*)::int AS n FROM reactions r WHERE r.target_type = '${type}' AND r.target_id = ${alias}.id GROUP BY kind) x) AS reactions,
  (SELECT kind FROM reactions r WHERE r.target_type = '${type}' AND r.target_id = ${alias}.id AND r.user_id = $1) AS mine`;

// Staff see visible comments, plus their own held ones; managers see everything not deleted
const COMMENT_VISIBLE = (mgr) => `c.deleted_at IS NULL${mgr ? '' : ' AND (c.hidden_at IS NULL OR c.author_id = $1)'}`;

/**
 * Comments for posts. preview: the latest 2 top-level comments per post, each with its first reply.
 * Otherwise everything, ordered 'newest' or 'relevant' (reactions + replies first).
 */
async function loadComments(postIds, user, { preview = false, order = 'oldest' } = {}) {
  if (!postIds.length) return [];
  const mgr = isManager(user);
  const cols = `c.id, c.post_id, c.parent_id, c.body, c.mentions, c.photo, c.created_at, c.edited_at, c.hidden_at, c.hidden_reason, ${PERSON} AS author, ${reactionCols('comment', 'c')},
    (SELECT count(*)::int FROM post_comments r WHERE r.parent_id = c.id AND ${COMMENT_VISIBLE(mgr).replaceAll('c.', 'r.')}) AS reply_count`;
  const base = `FROM post_comments c JOIN users u ON u.id = c.author_id LEFT JOIN officers o ON o.user_id = u.id
    WHERE c.post_id = ANY($2::uuid[]) AND ${COMMENT_VISIBLE(mgr)}`;
  const rows = preview
    ? await q(`WITH ranked AS (
          SELECT ${cols}, row_number() OVER (PARTITION BY coalesce(c.parent_id, c.post_id), c.parent_id IS NULL
            ORDER BY CASE WHEN c.parent_id IS NULL THEN extract(epoch FROM c.created_at) * -1 ELSE extract(epoch FROM c.created_at) END) AS rn
          ${base}),
        top AS (SELECT * FROM ranked WHERE parent_id IS NULL AND rn <= 2)
        SELECT * FROM top UNION ALL SELECT r.* FROM ranked r JOIN top t ON r.parent_id = t.id WHERE r.rn = 1
        ORDER BY created_at`, [user.id, postIds])
    : await q(`SELECT ${cols} ${base} ORDER BY c.created_at`, [user.id, postIds]);
  let list = await Promise.all(rows.map(async ({ rn, ...c }) => ({
    ...c, author: await signPerson(c.author), photo: c.photo ? { ...c.photo, url: await signKey(c.photo.key) } : null, held: !!c.hidden_at && !mgr,
  })));
  if (!preview && order !== 'oldest') {
    const score = (c) => Object.values(c.reactions || {}).reduce((a, b) => a + b, 0) + c.reply_count;
    const tops = list.filter((c) => !c.parent_id).sort((a, b) => (order === 'relevant' ? score(b) - score(a) : 0) || new Date(b.created_at) - new Date(a.created_at));
    list = [...tops, ...list.filter((c) => c.parent_id)];
  }
  return list;
}

const POST_COLS = `p.id, p.kind, p.body, p.photos, p.video, p.link, p.place, p.venue_id, p.tags, p.topics, p.shoutout, p.celebration,
  p.mentions, p.pinned_at, p.announced, p.must_ack, p.edited_at, p.created_at, p.hidden_at, p.hidden_reason`;

async function loadPosts(where, params, user, { comments = 'preview', order = 'p.created_at DESC', limit = PAGE, commentOrder } = {}) {
  const mgr = isManager(user);
  const rows = await q(`SELECT ${POST_COLS}, ${PERSON} AS author, ${reactionCols('post', 'p')},
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id = p.id AND ${COMMENT_VISIBLE(mgr)}) AS comment_count,
      EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = p.id AND s.user_id = $1) AS saved,
      (SELECT json_build_object('seen_at', a.seen_at, 'acked_at', a.acked_at) FROM post_audience a WHERE a.post_id = p.id AND a.user_id = $1) AS me_audience
    FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN officers o ON o.user_id = u.id
    WHERE ${VISIBLE('p', mgr)} AND ${where} ORDER BY ${order} LIMIT ${limit}`, [user.id, ...params]);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [cs, polls, votes, events, rsvps, audience] = await Promise.all([
    comments ? loadComments(ids, user, { preview: comments === 'preview', order: commentOrder }) : [],
    q('SELECT * FROM post_polls WHERE post_id = ANY($1::uuid[])', [ids]),
    q('SELECT post_id, option_id, user_id FROM poll_votes WHERE post_id = ANY($1::uuid[])', [ids]),
    q('SELECT * FROM feed_events WHERE post_id = ANY($1::uuid[])', [ids]),
    q(`SELECT r.post_id, r.answer, r.user_id, r.updated_at, ${PERSON} AS p FROM event_rsvps r JOIN users u ON u.id = r.user_id LEFT JOIN officers o ON o.user_id = u.id
      WHERE r.post_id = ANY($1::uuid[]) ORDER BY r.updated_at`, [ids]),
    mgr && rows.some((r) => r.pinned_at) ? audienceCounts(rows.filter((r) => r.pinned_at).map((r) => r.id)) : {},
  ]);
  const names = await mentionNames(rows.flatMap((r) => [...r.mentions, ...r.tags, ...(r.shoutout?.to || [])]).concat(cs.flatMap((c) => c.mentions)));
  const nameList = (list) => (list || []).map((id) => names[id]).filter(Boolean);
  return Promise.all(rows.map(async (p) => {
    const poll = polls.find((x) => x.post_id === p.id);
    const ev = events.find((x) => x.post_id === p.id);
    const evR = rsvps.filter((r) => r.post_id === p.id);
    const { me_audience, ...rest } = p;
    return {
      ...rest,
      author: await signPerson(p.author),
      photos: await Promise.all((p.photos || []).map(async (ph) => ({ key: ph.key, w: ph.w || null, h: ph.h || null, caption: ph.caption || '', url: await downloadUrl(ph.key) }))),
      video: p.video ? { ...p.video, url: await signKey(p.video.key), poster_url: await signKey(p.video.poster_key) } : null,
      link: p.link ? { ...p.link, image_url: await signKey(p.link.image_key) } : null,
      mentions: nameList(p.mentions),
      tags: nameList(p.tags),
      shoutout: p.shoutout ? { badge: p.shoutout.badge, to: nameList(p.shoutout.to) } : null,
      poll: poll ? pollTally(poll, votes.filter((v) => v.post_id === p.id), user.id) : null,
      event: ev ? await eventShape(ev, evR, user) : null,
      audience: p.pinned_at ? { ...(me_audience || {}), ...(audience[p.id] || {}) } : null,
      comments: cs.filter((c) => c.post_id === p.id).map((c) => ({ ...c, mentions: nameList(c.mentions) })),
      mine_post: p.author.id === user.id,
    };
  }));
}

async function eventShape(ev, rsvps, user) {
  const count = (a) => rsvps.filter((r) => r.answer === a).length;
  return {
    title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, capacity: ev.capacity, cancelled_at: ev.cancelled_at,
    counts: { going: count('going'), maybe: count('maybe'), no: count('no'), waitlist: count('waitlist') },
    mine: rsvps.find((r) => r.user_id === user.id)?.answer || null,
    going: await Promise.all(rsvps.filter((r) => r.answer === 'going').slice(0, 6).map((r) => signPerson(r.p))),
  };
}

async function audienceCounts(ids) {
  const total = (await one(`SELECT count(*)::int AS n FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE ${ACTIVE_STAFF}`)).n;
  const rows = await q(`SELECT post_id, count(*) FILTER (WHERE seen_at IS NOT NULL)::int AS seen, count(*) FILTER (WHERE acked_at IS NOT NULL)::int AS acked
    FROM post_audience WHERE post_id = ANY($1::uuid[]) GROUP BY post_id`, [ids]);
  return Object.fromEntries(ids.map((id) => {
    const r = rows.find((x) => x.post_id === id);
    return [id, { total, seen_count: r?.seen || 0, ack_count: r?.acked || 0 }];
  }));
}

async function mentionNames(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = await q('SELECT id, name FROM users WHERE id = ANY($1::uuid[])', [uniq]);
  return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

// Only active staff can be mentioned or tagged; a mention also needs their name in the text
async function cleanPeople(ids, text = null) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const rows = await q(`SELECT u.id, u.name FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE u.id = ANY($1::uuid[]) AND ${ACTIVE_STAFF}`,
    [ids.filter((x) => typeof x === 'string').slice(0, 20)]);
  return rows.filter((r) => text == null || String(text).includes(`@${r.name}`)).map((r) => r.id);
}

async function assertNotMuted(user) {
  const m = await one('SELECT until FROM feed_mutes WHERE user_id = $1 AND until > now()', [user.id]);
  if (m) fail(403, `A manager paused your Everyday posting until ${new Date(m.until).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. You can still read the feed.`);
}

async function assertCanPost(user) {
  const u = await one('SELECT feed_rules_at FROM users WHERE id = $1', [user.id]);
  if (!u.feed_rules_at) fail(409, 'Please read the community rules first', { need_rules: true });
  await assertNotMuted(user);
}

const feedPrefix = (user) => `docs/feed/${user.id.slice(0, 8)}/`;
const dim = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);

/** Photos from the composer: [{ key, w, h, caption }] (or the older photo_keys list). Keys already on the post are kept. */
function parsePhotos(user, b, existing = []) {
  const list = Array.isArray(b.photos) ? b.photos : Array.isArray(b.photo_keys) ? b.photo_keys.map((key) => ({ key })) : null;
  if (!list) return existing;
  if (list.length > 10) fail(400, 'Up to 10 photos per post');
  return list.map((ph) => {
    const key = String(ph?.key || '');
    if (!existing.some((x) => x.key === key) && !key.startsWith(feedPrefix(user))) fail(400, 'Invalid photo');
    return { key, w: dim(ph.w), h: dim(ph.h), caption: String(ph.caption || '').trim().slice(0, 300) };
  });
}

async function parseVideo(user, v, existing = null) {
  if (!v) return null;
  if (existing && v.key === existing.key) return existing;
  const key = String(v.key || '');
  const poster = String(v.poster_key || '');
  if (!key.startsWith(feedPrefix(user)) || !poster.startsWith(feedPrefix(user))) fail(400, 'Invalid video');
  const h = await headObject(key);
  if (!h || !/^video\//.test(h.mime || '')) fail(400, "That file isn't a video we can play");
  if (h.size > VIDEO_MAX_BYTES) fail(400, 'Videos can be up to 50 MB');
  const duration = Number(v.duration);
  if (!(duration > 0) || duration > VIDEO_MAX_S + 1) fail(400, `Videos can be up to ${VIDEO_MAX_S} seconds`);
  return { key, poster_key: poster, duration: Math.round(duration), w: dim(v.w), h: dim(v.h), mime: h.mime };
}

/** A venue tag is read from our venues (never trusted from the app); any other place keeps name + rounded point. */
async function parsePlace(p) {
  if (!p) return null;
  if (p.venue_id) {
    const v = need(await one('SELECT id, name, address, postcode, lat, lng FROM venues WHERE id = $1 AND active', [p.venue_id]), 'Venue not found');
    return { name: v.name, address: [v.address, v.postcode].filter(Boolean).join(', ').slice(0, 200), lat: v.lat, lng: v.lng, venue_id: v.id };
  }
  const name = String(p.name || '').trim().slice(0, 120);
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!name || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) fail(400, 'Pick a place from the list');
  return { name, address: String(p.address || '').slice(0, 200), lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
}

// ---------- Link previews ----------
async function safeFetch(url, { maxBytes, accept }) {
  let target = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const u = new URL(target);
    if (!['http:', 'https:'].includes(u.protocol) || (u.port && !['80', '443'].includes(u.port))) throw new Error('blocked');
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateHost(a.address))) throw Object.assign(new Error('blocked'), { blocked: true });
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EverydayLinkPreview/1.0)', Accept: accept } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { target = new URL(r.headers.get('location'), u).href; continue; }
    if (!r.ok) throw new Error(`status ${r.status}`);
    const reader = r.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { reader.cancel().catch(() => {}); break; }
      chunks.push(value);
    }
    return { url: u.href, type: r.headers.get('content-type') || '', bytes: Buffer.concat(chunks) };
  }
  throw new Error('too many redirects');
}

async function linkPreview(raw) {
  let url;
  try { url = new URL(String(raw).trim()).href; } catch { fail(400, "That doesn't look like a web address"); }
  if (!/^https?:/.test(url)) fail(400, "That doesn't look like a web address");
  const cached = await one("SELECT data FROM link_previews WHERE url = $1 AND fetched_at > now() - interval '7 days'", [url]);
  if (cached) return cached.data;
  let data;
  try {
    const page = await safeFetch(url, { maxBytes: 512 * 1024, accept: 'text/html,application/xhtml+xml' });
    if (!/html/i.test(page.type)) throw new Error('not html');
    const meta = parseMeta(page.bytes.toString('utf8'), page.url);
    let image_key = null;
    if (meta.image) {
      try {
        const img = await safeFetch(meta.image, { maxBytes: 2 * 1024 * 1024, accept: 'image/*' });
        const mime = sniffMime(img.bytes);
        if (mime && img.bytes.length < 2 * 1024 * 1024) {
          image_key = `docs/feed/links/${crypto.createHash('sha1').update(meta.image).digest('hex')}.${mime.split('/')[1]}`;
          await putObject(image_key, img.bytes, mime);
        }
      } catch { /* a preview without its picture is fine */ }
    }
    data = { url, title: meta.title, description: meta.description, site: meta.site, image_key };
  } catch (e) {
    if (e.blocked) fail(400, "We can't preview that address");
    data = { url, title: '', description: '', site: new URL(url).hostname.replace(/^www\./, ''), image_key: null };
  }
  await q('INSERT INTO link_previews (url, data) VALUES ($1, $2) ON CONFLICT (url) DO UPDATE SET data = EXCLUDED.data, fetched_at = now()', [url, data]);
  return data;
}

// ---------- AI check ----------
const CHECK_TOOL = {
  name: 'check_post', description: 'Report anything in the post that should not go on a staff feed',
  input_schema: {
    type: 'object',
    properties: {
      warnings: { type: 'array', items: { type: 'string' }, description: 'Short, friendly sentences addressed to the poster ("This photo shows..."). Empty if the post is fine.' },
      serious: { type: 'boolean', description: 'True only for threats, harassment, hate, sexual content, or clear evidence from a real incident (injuries, ID documents, CCTV screens)' },
    },
    required: ['warnings', 'serious'],
  },
};

// AI pre-check, cached by content so posting after checking costs nothing extra.
// If AI is paused (credit cap) or down, the post goes through unchecked.
async function precheck(body, keys, { what = 'post' } = {}) {
  const hash = crypto.createHash('sha1').update(JSON.stringify([String(body || ''), keys])).digest('hex');
  const cached = await one('SELECT result FROM feed_checks WHERE hash = $1', [hash]);
  if (cached) return cached.result;
  if (!String(body || '').trim() && !keys.length) return { warnings: [], serious: false };
  let result;
  try {
    const images = (await Promise.all(keys.map(async (k) => {
      const bytes = await getObjectBytes(k);
      const mime = sniffMime(bytes);
      return mime && mime !== 'image/gif' ? fileBlock(bytes, mime) : null;
    }).map((p) => p.catch(() => null)))).filter(Boolean);
    const { input } = await extract({
      model: HAIKU, module: 'everyday', max_tokens: 400, tool: CHECK_TOOL,
      system: `You check ${what}s before they go on the internal social feed of a UK security company (officers and managers). Friendly team posts, photos of colleagues, events, training and achievements are fine.
Warn about: abuse, threats, harassment or discrimination; details of real incidents or members of the public (names, what happened to whom); faces of members of the public or customers; personal data such as car number plates, phone numbers, addresses, ID cards or licences; CCTV screens, radios channels, rotas, door codes or other venue security details.
Be brief. Do not warn about ordinary photos of staff or venues from outside. A still frame stands for a short video. Use "they" for people.`,
      messages: [{ role: 'user', content: [...images, { type: 'text', text: `${what === 'comment' ? 'Comment' : 'Post'} text: ${String(body || '(no text)').slice(0, 3000)}${images.length ? `\n${images.length} image(s) attached above.` : ''}` }] }],
    });
    result = { warnings: (input?.warnings || []).map(String).slice(0, 5), serious: !!input?.serious };
  } catch (e) {
    if (!(e instanceof HttpError)) console.warn('[everyday] precheck failed:', e.message);
    return { warnings: [], serious: false, skipped: true };
  }
  await q('INSERT INTO feed_checks (hash, result) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING', [hash, result]);
  return result;
}

const checkText = (body, photos) => [body, ...photos.map((p) => p.caption).filter(Boolean).map((c) => `Photo caption: ${c}`)].filter(Boolean).join('\n');
const checkKeys = (photos, video) => [...photos.map((p) => p.key), ...(video ? [video.poster_key] : [])];

async function flagPost(user, postId, check, body, verb = 'post') {
  await q("INSERT INTO feed_reports (target_type, target_id, reason) VALUES ('post', $1, $2)", [postId, `Orb AI: ${check.warnings.join(' ') || 'may break the community rules'}`]);
  await notify(await companyManagers(), {
    kind: 'feed', severity: 'warning', title: `Everyday ${verb} by ${user.name} flagged for review`, body: snippet(check.warnings[0] || body), link: postLink(postId), dedupe: `feedflag:${postId}:${verb}`,
  });
}

async function targetOf(type, id, user) {
  if (!['post', 'comment'].includes(type)) fail(400, 'Unknown item');
  const row = type === 'post'
    ? await one('SELECT id, author_id, id AS post_id, body, kind, hidden_at, deleted_at FROM posts WHERE id = $1', [id])
    : await one('SELECT id, author_id, post_id, body, hidden_at, deleted_at FROM post_comments WHERE id = $1', [id]);
  if (!row || row.deleted_at || (row.hidden_at && !isManager(user))) fail(404, 'This has been removed');
  return row;
}

const snippet = (t, n = 80) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const changed = (post_id) => publishFeed('feed.update', { post_id });
const allStaff = async (except) => (await q(`SELECT u.id FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE ${ACTIVE_STAFF} AND u.id <> $1`, [except])).map((r) => r.id);
const everydaySettings = async () => (await one('SELECT everyday FROM settings WHERE id = 1'))?.everyday || {};

/** Venues "My venues" means: officers — where they worked in the last 90 days; security managers — their venues; company — all (null). */
async function myVenues(user) {
  if (user.role === 'company') return null;
  if (user.role === 'security') return venueScope(user);
  return (await q(`SELECT DISTINCT s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN officers o ON o.id = a.officer_id
    WHERE o.user_id = $1 AND a.status IN ('assigned','accepted') AND s.starts_at > now() - interval '90 days' AND s.starts_at < now() + interval '30 days'`, [user.id])).map((r) => r.venue_id);
}

/** WHERE fragment + params for the feed filters; params start at $2 ($1 is the viewer). */
async function feedWhere(b, user) {
  const parts = [];
  const params = [];
  const p = (v) => { params.push(v); return `$${params.length + 1}`; };
  const filter = FILTERS.includes(b.filter) ? b.filter : 'all';
  if (filter === 'announcements') parts.push('(p.pinned_at IS NOT NULL OR p.announced)');
  if (filter === 'shoutouts') parts.push("p.kind = 'shoutout'");
  if (filter === 'events') parts.push("p.kind = 'event'");
  if (filter === 'polls') parts.push("p.kind = 'poll'");
  if (filter === 'saved') parts.push('EXISTS (SELECT 1 FROM saved_posts s WHERE s.post_id = p.id AND s.user_id = $1)');
  if (filter === 'venues') {
    const v = await myVenues(user);
    parts.push(v === null ? 'p.venue_id IS NOT NULL' : `p.venue_id = ANY(${p(v)}::uuid[])`);
  }
  const topic = cleanTopic(b.topic);
  if (topic) parts.push(`${p(topic)} = ANY(p.topics)`);
  const text = String(b.q || '').trim().slice(0, 100);
  if (text) {
    const t = p(text);
    const like = p(`%${text.replace(/[%_\\]/g, '\\$&')}%`);
    const tag = p(cleanTopic(text));
    parts.push(`(p.search @@ websearch_to_tsquery('english', ${t}) OR u.name ILIKE ${like} OR p.place->>'name' ILIKE ${like} OR ${tag} = ANY(p.topics)
      OR EXISTS (SELECT 1 FROM post_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL AND c.search @@ websearch_to_tsquery('english', ${t})))`);
  }
  return { where: parts.length ? parts.join(' AND ') : 'true', params, plain: filter === 'all' && !topic && !text };
}

/** The parts every post kind shares: text, photos, video, link, place, tags, topics. */
async function postFields(user, b, existing = null) {
  const body = String(b.body ?? existing?.body ?? '').trim().slice(0, 5000);
  const photos = parsePhotos(user, b, existing?.photos || []);
  const video = 'video' in b ? await parseVideo(user, b.video, existing?.video) : existing?.video || null;
  const place = 'place' in b ? await parsePlace(b.place) : existing?.place || null;
  const tags = 'tags' in b ? await cleanPeople(b.tags) : existing?.tags || [];
  let link = existing?.link || null;
  if (b.link_url === null || b.remove_link) link = null;
  else if (b.link_url && b.link_url !== link?.url) link = await linkPreview(b.link_url);
  return { body, photos, video, place, venue_id: place?.venue_id || null, tags, topics: parseTopics(body), link };
}

async function tellTagged(user, postId, ids, body) {
  await notify(ids.filter((id) => id !== user.id), { kind: 'tag', title: `${user.name} tagged you in a post`, body: snippet(body), link: postLink(postId), dedupe: `tag:${postId}` });
}

export const actions = {
  'everyday.feed': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    const { where, params, plain } = await feedWhere(b, user);
    const before = b.before || null;
    // Announcements that this person still has to acknowledge come first
    const pinned = before || !plain ? [] : await loadPosts('p.pinned_at IS NOT NULL', [], user, {
      order: 'p.must_ack AND NOT EXISTS (SELECT 1 FROM post_audience a WHERE a.post_id = p.id AND a.user_id = $1 AND a.acked_at IS NOT NULL) DESC, p.pinned_at DESC', limit: 5,
    });
    const n = params.length + 2;
    const posts = await loadPosts(`${plain ? 'p.pinned_at IS NULL AND ' : ''}${where} AND ($${n}::timestamptz IS NULL OR p.created_at < $${n})`, [...params, before], user);
    const me = await one('SELECT feed_rules_at FROM users WHERE id = $1', [user.id]);
    return { pinned, posts, next: posts.length === PAGE ? posts[posts.length - 1].created_at : null, rules_accepted: !!me.feed_rules_at };
  }),

  'everyday.post': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    const [post] = await loadPosts('p.id = $2', [b.id], user, { comments: 'all', limit: 1, commentOrder: b.comment_order === 'newest' ? 'newest' : b.comment_order === 'relevant' ? 'relevant' : 'oldest' });
    return need(post, 'This post has been removed');
  }),

  // Fresh copies of posts on screen, after a live update
  'everyday.posts': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => typeof x === 'string').slice(0, 30);
    if (!ids.length) return [];
    return loadPosts('p.id = ANY($2::uuid[])', [ids], user, { limit: 30 });
  }),

  'everyday.people': def(STAFF, async () => {
    await requireModule('everyday');
    const rows = await q(`SELECT ${PERSON} AS p FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE ${ACTIVE_STAFF} ORDER BY u.name`);
    return Promise.all(rows.map((r) => signPerson(r.p)));
  }),

  'everyday.profile': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'user_id');
    const p = need(await one(`SELECT ${PERSON} AS p, o.start_date, u.created_at,
        (SELECT count(*)::int FROM posts x WHERE x.author_id = u.id AND x.deleted_at IS NULL AND x.hidden_at IS NULL) AS posts
      FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE u.id = $1 AND u.role IN ('company','security','officer')`, [b.user_id]), 'Not found');
    const muted = isManager(user) ? await one('SELECT until, reason FROM feed_mutes WHERE user_id = $1 AND until > now()', [b.user_id]) : null;
    const badgeRows = await q(`SELECT shoutout->>'badge' AS badge, count(*)::int AS n FROM posts
      WHERE kind = 'shoutout' AND deleted_at IS NULL AND hidden_at IS NULL AND shoutout->'to' ? $1::text GROUP BY 1`, [b.user_id]);
    const tab = b.tab === 'tagged' ? 'tagged' : 'posts';
    const limit = Number(b.limit) > 0 ? Math.min(Number(b.limit), PAGE) : 12;
    const posts = await loadPosts(
      `${tab === 'tagged' ? "($2 = ANY(p.tags) OR p.shoutout->'to' ? $2::text OR p.celebration->>'user_id' = $2::text)" : 'p.author_id = $2'} AND ($3::timestamptz IS NULL OR p.created_at < $3)`,
      [b.user_id, b.before || null], user, { comments: b.full ? 'preview' : 0, limit });
    const events = await q(`SELECT e.post_id, e.title, e.starts_at FROM event_rsvps r JOIN feed_events e ON e.post_id = r.post_id JOIN posts x ON x.id = e.post_id
      WHERE r.user_id = $1 AND r.answer = 'going' AND e.cancelled_at IS NULL AND e.starts_at > now() AND x.deleted_at IS NULL AND x.hidden_at IS NULL ORDER BY e.starts_at LIMIT 5`, [b.user_id]);
    return {
      person: await signPerson(p.p), since: String(p.start_date || londonDate(p.created_at)).slice(0, 4), post_count: p.posts, muted,
      badges: BADGES.map((x) => ({ ...x, count: badgeRows.find((r) => r.badge === x.id)?.n || 0 })).filter((x) => x.count),
      posts, next: posts.length === limit ? posts[posts.length - 1].created_at : null, events,
    };
  }),

  // This person's own Everyday choices
  'everyday.prefs': def(STAFF, async (b, { user }) => {
    if (b.set && typeof b.set === 'object') {
      const set = Object.fromEntries(Object.entries(b.set).filter(([k]) => ['birthday', 'welcome'].includes(k)).map(([k, v]) => [k, !!v]));
      await q('UPDATE users SET feed_prefs = feed_prefs || $2::jsonb WHERE id = $1', [user.id, JSON.stringify(set)]);
    }
    const r = await one('SELECT feed_prefs FROM users WHERE id = $1', [user.id]);
    return { birthday: r.feed_prefs?.birthday === true, welcome: r.feed_prefs?.welcome !== false };
  }),

  'everyday.precheck': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    const photos = parsePhotos(user, b);
    const video = b.video?.poster_key && String(b.video.poster_key).startsWith(feedPrefix(user)) ? { poster_key: b.video.poster_key } : null;
    return precheck(checkText(b.body, photos), checkKeys(photos, video));
  }),

  'everyday.linkPreview': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'url');
    await limitRate(`link:${user.id}`, 10, 60000);
    const d = await linkPreview(b.url);
    return { ...d, image_url: await signKey(d.image_key) };
  }),

  // Company venues first, then any named place in the UK (never a house address)
  'everyday.places': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    const text = String(b.q || '').trim().slice(0, 80);
    const like = `%${text.replace(/[%_\\]/g, '\\$&')}%`;
    const venues = (await q(`SELECT id, name, address, postcode, lat, lng FROM venues WHERE active AND ($1 = '' OR name ILIKE $2 OR postcode ILIKE $2) ORDER BY name LIMIT 8`, [text, like]))
      .map((v) => ({ venue_id: v.id, name: v.name, address: [v.address, v.postcode].filter(Boolean).join(', '), lat: v.lat, lng: v.lng }));
    let places = [];
    if (text.length >= 3) {
      await limitRate(`place:${user.id}`, 1, 1000);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: text, format: 'jsonv2', addressdetails: '1', countrycodes: 'gb', limit: '10' })}`, {
          headers: { 'User-Agent': 'EverydayStaffFeed/1.0 (place tags; contact via openkbs.com)', 'Accept-Language': 'en-GB' }, signal: AbortSignal.timeout(4000),
        });
        if (r.ok) places = (await r.json()).map(cleanPlace).filter(Boolean).filter((p, i, all) => all.findIndex((x) => x.name === p.name && x.address === p.address) === i).slice(0, 8);
      } catch (e) { console.warn('[everyday] place search:', e.message); }
    }
    return { venues, places };
  }),

  'everyday.create': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    await assertCanPost(user);
    const kind = ['shoutout', 'poll', 'event'].includes(b.kind) ? b.kind : 'post';
    const f = await postFields(user, b);
    if (kind !== 'post' && f.video) fail(400, 'Videos go in an ordinary post');
    let shoutout = null;
    let poll = null;
    let event = null;
    if (kind === 'shoutout') {
      if ((await everydaySettings()).shoutouts === false) fail(403, 'Shout-outs are turned off');
      if (!BADGES.some((x) => x.id === b.badge)) fail(400, 'Pick a badge');
      const to = (await cleanPeople(b.to)).filter((id) => id !== user.id);
      if (!to.length) fail(400, 'Pick who the shout-out is for');
      shoutout = { badge: b.badge, to };
    } else if (kind === 'poll') {
      if (!f.body) fail(400, 'Write the question');
      const options = cleanPollOptions(b.options);
      if (options.length < 2) fail(400, 'Add at least two different answers');
      const closes = b.closes_at ? new Date(b.closes_at) : null;
      if (closes && !(closes > new Date())) fail(400, 'The closing time must be in the future');
      poll = { options, multi: !!b.multi, anonymous: !!b.anonymous, show_results: b.show_results === 'always' ? 'always' : 'after_vote', closes_at: closes };
    } else if (kind === 'event') {
      if (!isManager(user)) fail(403, 'Only managers can create events');
      event = cleanEvent(b);
    } else if (!f.body && !f.photos.length && !f.video) fail(400, 'Write something or add a photo');
    const check = await precheck(checkText([event?.title, f.body].filter(Boolean).join('\n'), f.photos), checkKeys(f.photos, f.video));
    const mentions = await cleanPeople(b.mentions, f.body);
    const post = await one(`INSERT INTO posts (author_id, kind, body, photos, video, link, place, venue_id, tags, topics, shoutout, mentions, ai_check)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [user.id, kind, f.body, JSON.stringify(f.photos), f.video, f.link, f.place, f.venue_id, f.tags, f.topics, shoutout, mentions, check]);
    if (poll) await q('INSERT INTO post_polls (post_id, options, multi, anonymous, show_results, closes_at) VALUES ($1,$2,$3,$4,$5,$6)', [post.id, JSON.stringify(poll.options), poll.multi, poll.anonymous, poll.show_results, poll.closes_at]);
    if (event) await q('INSERT INTO feed_events (post_id, title, starts_at, ends_at, capacity) VALUES ($1,$2,$3,$4,$5)', [post.id, event.title, event.starts_at, event.ends_at, event.capacity]);
    if (check.serious) await flagPost(user, post.id, check, f.body);
    await notify(mentions.filter((id) => id !== user.id), { kind: 'mention', title: `${user.name} mentioned you on Everyday`, body: snippet(f.body), link: postLink(post.id), dedupe: `mention:${post.id}` });
    await tellTagged(user, post.id, f.tags.filter((id) => !mentions.includes(id)), f.body);
    if (shoutout) {
      const badge = BADGES.find((x) => x.id === shoutout.badge);
      await notify(shoutout.to, { kind: 'shoutout', title: `${badge.emoji} ${user.name} gave you a shout-out: ${badge.label}`, body: snippet(f.body), link: postLink(post.id), dedupe: `shoutout:${post.id}` });
    }
    if (event) {
      await notify(await allStaff(user.id), { kind: 'event', title: `New event: ${event.title}`, body: new Date(event.starts_at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), link: postLink(post.id), dedupe: `event:${post.id}` });
    }
    await publishFeed('feed.post', { id: post.id, author_id: user.id });
    return { id: post.id };
  }),

  'everyday.edit': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    await assertCanPost(user);
    const p = need(await one('SELECT * FROM posts WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL', [b.id, user.id]), 'Post not found');
    if (p.kind === 'celebration') fail(400, "Celebration posts can't be edited");
    const f = await postFields(user, b, p);
    if (p.kind !== 'post' && f.video) fail(400, 'Videos go in an ordinary post');
    if (p.kind === 'post' && !f.body && !f.photos.length && !f.video) fail(400, 'Write something or add a photo');
    if (p.kind === 'poll' && !f.body) fail(400, 'Write the question');
    const check = await precheck(checkText(f.body, f.photos), checkKeys(f.photos, f.video));
    const mentions = await cleanPeople(b.mentions || p.mentions, f.body);
    await q(`UPDATE posts SET body = $2, photos = $3, video = $4, link = $5, place = $6, venue_id = $7, tags = $8, topics = $9, mentions = $10, ai_check = $11, edited_at = now() WHERE id = $1`,
      [p.id, f.body, JSON.stringify(f.photos), f.video, f.link, f.place, f.venue_id, f.tags, f.topics, mentions, check]);
    // An edit that turns a post into something serious is flagged just like a new one
    if (check.serious && !p.ai_check?.serious) await flagPost(user, p.id, check, f.body, 'edit');
    const added = mentions.filter((id) => !p.mentions.includes(id) && id !== user.id);
    await notify(added, { kind: 'mention', title: `${user.name} mentioned you on Everyday`, body: snippet(f.body), link: postLink(p.id), dedupe: `mention:${p.id}` });
    await tellTagged(user, p.id, f.tags.filter((id) => !p.tags.includes(id) && !added.includes(id)), f.body);
    await changed(p.id);
    return { ok: true };
  }),

  'everyday.delete': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'id');
    const table = b.target_type === 'comment' ? 'post_comments' : 'posts';
    const r = need(await one(`UPDATE ${table} SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL RETURNING id, ${table === 'posts' ? 'id AS post_id' : 'post_id'}`, [b.id, user.id]), 'Not found');
    await changed(r.post_id);
    return { ok: true };
  }),

  // A tagged person takes themselves off a post
  'everyday.untag': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    need(await one('UPDATE posts SET tags = array_remove(tags, $2) WHERE id = $1 AND $2 = ANY(tags) RETURNING id', [b.id, user.id]), 'You are not tagged in this post');
    await changed(b.id);
    return { ok: true };
  }),

  // The person a celebration is about can take it down
  'everyday.hideCelebration': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    need(await one("UPDATE posts SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND kind = 'celebration' AND celebration->>'user_id' = $2::text AND deleted_at IS NULL RETURNING id", [b.id, user.id]), 'Post not found');
    await changed(b.id);
    return { ok: true };
  }),

  'everyday.comment': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id');
    await assertCanPost(user);
    const post = await targetOf('post', b.post_id, user);
    const body = String(b.body || '').trim().slice(0, 2000);
    const photo = b.photo ? parseCommentPhoto(user, b.photo) : null;
    if (!body && !photo) fail(400, 'Write a comment');
    const recent = await one("SELECT count(*)::int AS n FROM post_comments WHERE author_id = $1 AND created_at > now() - interval '1 minute'", [user.id]);
    if (recent.n >= COMMENTS_PER_MINUTE) fail(429, 'Slow down a little — try again in a minute');
    let parent = null;
    if (b.parent_id) {
      parent = need(await one('SELECT id, parent_id, author_id FROM post_comments WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL', [b.parent_id, post.id]), 'That comment has been removed');
      // Replies stay one level deep: a reply to a reply joins the same thread
      if (parent.parent_id) parent = await one('SELECT id, parent_id, author_id FROM post_comments WHERE id = $1', [parent.parent_id]);
    }
    const check = await precheck(body, photo ? [photo.key] : [], { what: 'comment' });
    const mentions = await cleanPeople(b.mentions, body);
    // A serious comment is held: only its author and managers see it until a manager decides
    const c = await one(`INSERT INTO post_comments (post_id, parent_id, author_id, body, mentions, photo, ai_check, hidden_at, hidden_reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,${check.serious ? "now(), 'Held for review'" : 'NULL, NULL'}) RETURNING id`,
    [post.id, parent?.id || null, user.id, body, mentions, photo, check]);
    if (check.serious) {
      await q("INSERT INTO feed_reports (target_type, target_id, reason) VALUES ('comment', $1, $2)", [c.id, `Orb AI: ${check.warnings.join(' ') || 'may break the community rules'}`]);
      await notify(await companyManagers(), { kind: 'feed', severity: 'warning', title: `Everyday comment by ${user.name} held for review`, body: snippet(check.warnings[0] || body), link: '/everyday?view=moderation', dedupe: `feedflag:${c.id}` });
      return { id: c.id, held: true };
    }
    const told = new Set([user.id]);
    const tell = async (ids, n) => { const to = ids.filter((id) => !told.has(id)); to.forEach((id) => told.add(id)); if (to.length) await notify(to, n); };
    const text = body || 'Sent a photo';
    await tell(mentions, { kind: 'mention', title: `${user.name} mentioned you in a comment`, body: snippet(text), link: postLink(post.id, c.id), dedupe: `mention:${c.id}` });
    if (parent) await tell([parent.author_id], { kind: 'comment', title: `${user.name} replied to your comment`, body: snippet(text), link: postLink(post.id, c.id), dedupe: `reply:${c.id}` });
    await tell([post.author_id], { kind: 'comment', title: `${user.name} commented on your post`, body: snippet(text), link: postLink(post.id, c.id), dedupe: `comment:${c.id}` });
    await changed(post.id);
    return { id: c.id };
  }),

  'everyday.editComment': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    await assertCanPost(user);
    const old = need(await one('SELECT * FROM post_comments WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL', [b.id, user.id]), 'Comment not found');
    const body = String(b.body ?? old.body).trim().slice(0, 2000);
    const photo = 'photo' in b ? (b.photo ? (b.photo.key === old.photo?.key ? old.photo : parseCommentPhoto(user, b.photo)) : null) : old.photo;
    if (!body && !photo) fail(400, 'Write a comment');
    const check = await precheck(body, photo ? [photo.key] : [], { what: 'comment' });
    const mentions = await cleanPeople(b.mentions || old.mentions, body);
    const hold = check.serious && !old.hidden_at;
    await q(`UPDATE post_comments SET body = $2, photo = $3, mentions = $4, ai_check = $5, edited_at = now()${hold ? ", hidden_at = now(), hidden_reason = 'Held for review'" : ''} WHERE id = $1`,
      [old.id, body, photo, mentions, check]);
    if (hold) {
      await q("INSERT INTO feed_reports (target_type, target_id, reason) VALUES ('comment', $1, $2)", [old.id, `Orb AI: ${check.warnings.join(' ') || 'may break the community rules'}`]);
      await notify(await companyManagers(), { kind: 'feed', severity: 'warning', title: `Everyday comment by ${user.name} held for review`, body: snippet(check.warnings[0] || body), link: '/everyday?view=moderation', dedupe: `feedflag:${old.id}:edit` });
      return { ok: true, held: true };
    }
    const added = mentions.filter((id) => !old.mentions.includes(id) && id !== user.id);
    await notify(added, { kind: 'mention', title: `${user.name} mentioned you in a comment`, body: snippet(body), link: postLink(old.post_id, old.id), dedupe: `mention:${old.id}` });
    await changed(old.post_id);
    return { ok: true };
  }),

  'everyday.react': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'target_id');
    await assertNotMuted(user);
    const t = await targetOf(b.target_type, b.target_id, user);
    if (!b.kind) {
      await q('DELETE FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3', [b.target_type, t.id, user.id]);
      await changed(t.post_id);
      return { ok: true };
    }
    if (!KINDS.includes(b.kind)) fail(400, 'Unknown reaction');
    await q(`INSERT INTO reactions (target_type, target_id, user_id, kind) VALUES ($1,$2,$3,$4)
      ON CONFLICT (target_type, target_id, user_id) DO UPDATE SET kind = EXCLUDED.kind`, [b.target_type, t.id, user.id, b.kind]);
    if (t.author_id !== user.id && t.kind !== 'celebration') {
      // One reaction notice per item per day, so a popular post doesn't flood the author
      await notify([t.author_id], {
        kind: 'reaction', title: `${user.name} reacted to your ${b.target_type}`, body: snippet(t.body), link: postLink(t.post_id),
        dedupe: `react:${b.target_type}:${t.id}:${londonDate(new Date())}`,
      });
    }
    await changed(t.post_id);
    return { ok: true };
  }),

  'everyday.reactions': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'target_id');
    await targetOf(b.target_type, b.target_id, user);
    const rows = await q(`SELECT r.kind, ${PERSON} AS p FROM reactions r JOIN users u ON u.id = r.user_id LEFT JOIN officers o ON o.user_id = u.id
      WHERE r.target_type = $1 AND r.target_id = $2 ORDER BY r.created_at DESC`, [b.target_type, b.target_id]);
    return Promise.all(rows.map(async (r) => ({ kind: r.kind, person: await signPerson(r.p) })));
  }),

  'everyday.report': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'target_id');
    await assertNotMuted(user);
    const t = await targetOf(b.target_type, b.target_id, user);
    const dup = await one("SELECT id FROM feed_reports WHERE target_type = $1 AND target_id = $2 AND reporter_id = $3 AND status = 'open'", [b.target_type, t.id, user.id]);
    if (!dup) {
      await q('INSERT INTO feed_reports (target_type, target_id, reporter_id, reason) VALUES ($1,$2,$3,$4)', [b.target_type, t.id, user.id, String(b.reason || '').slice(0, 500)]);
      await notify(await companyManagers(), { kind: 'feed', severity: 'warning', title: `Everyday ${b.target_type} reported`, body: `${snippet(b.reason || 'No reason given', 60)} · "${snippet(t.body, 60)}"`, link: '/everyday?view=moderation', dedupe: `report:${t.id}` });
    }
    return { ok: true };
  }),

  'everyday.save': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    if (b.on === false) await q('DELETE FROM saved_posts WHERE user_id = $1 AND post_id = $2', [user.id, b.id]);
    else {
      await targetOf('post', b.id, user);
      await q('INSERT INTO saved_posts (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, b.id]);
    }
    return { ok: true, saved: b.on !== false };
  }),

  'everyday.topics': def(STAFF, async () => {
    await requireModule('everyday');
    const featured = (await everydaySettings()).featured_topics || [];
    const trending = await q(`SELECT t AS topic, count(*)::int AS n FROM posts p, unnest(p.topics) t
      WHERE p.deleted_at IS NULL AND p.hidden_at IS NULL AND p.created_at > now() - interval '30 days' GROUP BY t ORDER BY n DESC, t LIMIT 10`);
    return { featured, trending: trending.filter((t) => !featured.includes(t.topic)) };
  }),

  // ---------- Polls ----------
  'everyday.vote': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id');
    await assertNotMuted(user);
    await targetOf('post', b.post_id, user);
    const poll = need(await one('SELECT * FROM post_polls WHERE post_id = $1', [b.post_id]), 'Poll not found');
    if (poll.closed_at || (poll.closes_at && new Date(poll.closes_at) <= new Date())) fail(409, 'This poll has closed');
    const ids = [...new Set((Array.isArray(b.option_ids) ? b.option_ids : [b.option_ids]).filter(Boolean).map(String))];
    if (ids.some((id) => !poll.options.some((o) => o.id === id))) fail(400, 'Unknown answer');
    if (!poll.multi && ids.length > 1) fail(400, 'Pick one answer');
    await q('DELETE FROM poll_votes WHERE post_id = $1 AND user_id = $2', [poll.post_id, user.id]);
    if (ids.length) await q('INSERT INTO poll_votes (post_id, option_id, user_id) SELECT $1, unnest($2::text[]), $3', [poll.post_id, ids, user.id]);
    await changed(poll.post_id);
    const votes = await q('SELECT option_id, user_id FROM poll_votes WHERE post_id = $1', [poll.post_id]);
    return pollTally(poll, votes, user.id);
  }),

  'everyday.closePoll': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id');
    const p = need(await one('SELECT author_id FROM posts WHERE id = $1 AND deleted_at IS NULL', [b.post_id]), 'Poll not found');
    if (p.author_id !== user.id && !isManager(user)) fail(403, 'Only the person who asked, or a manager, can close this poll');
    need(await one('UPDATE post_polls SET closed_at = now() WHERE post_id = $1 AND closed_at IS NULL RETURNING post_id', [b.post_id]), 'Already closed');
    await changed(b.post_id);
    return { ok: true };
  }),

  // Who picked an answer, for named polls only
  'everyday.voters': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id');
    await targetOf('post', b.post_id, user);
    const poll = need(await one('SELECT * FROM post_polls WHERE post_id = $1', [b.post_id]), 'Poll not found');
    if (poll.anonymous) fail(403, 'This poll is anonymous');
    const rows = await q(`SELECT v.option_id, ${PERSON} AS p FROM poll_votes v JOIN users u ON u.id = v.user_id LEFT JOIN officers o ON o.user_id = u.id
      WHERE v.post_id = $1 ORDER BY v.created_at`, [poll.post_id]);
    const tally = pollTally(poll, await q('SELECT option_id, user_id FROM poll_votes WHERE post_id = $1', [poll.post_id]), user.id);
    if (!tally.results_visible) fail(403, 'Vote first to see the results');
    return Promise.all(rows.map(async (r) => ({ option_id: r.option_id, person: await signPerson(r.p) })));
  }),

  // ---------- Events ----------
  'everyday.rsvp': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id', 'answer');
    await assertNotMuted(user);
    if (!['going', 'maybe', 'no'].includes(b.answer)) fail(400, 'Unknown answer');
    await targetOf('post', b.post_id, user);
    const ev = need(await one('SELECT * FROM feed_events WHERE post_id = $1', [b.post_id]), 'Event not found');
    if (ev.cancelled_at) fail(409, 'This event was cancelled');
    if (new Date(ev.ends_at || ev.starts_at) < new Date()) fail(409, 'This event has finished');
    const before = await one('SELECT answer FROM event_rsvps WHERE post_id = $1 AND user_id = $2', [ev.post_id, user.id]);
    let answer = b.answer;
    if (answer === 'going' && ev.capacity && before?.answer !== 'going') {
      const going = (await one("SELECT count(*)::int AS n FROM event_rsvps WHERE post_id = $1 AND answer = 'going'", [ev.post_id])).n;
      if (going >= ev.capacity) answer = 'waitlist';
    }
    await q(`INSERT INTO event_rsvps (post_id, user_id, answer) VALUES ($1,$2,$3)
      ON CONFLICT (post_id, user_id) DO UPDATE SET answer = EXCLUDED.answer, updated_at = CASE WHEN event_rsvps.answer = EXCLUDED.answer THEN event_rsvps.updated_at ELSE now() END`, [ev.post_id, user.id, answer]);
    if (before?.answer === 'going' && answer !== 'going') await fillPlaces(ev);
    await changed(ev.post_id);
    return { answer };
  }),

  'everyday.attendees': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id');
    await targetOf('post', b.post_id, user);
    const rows = await q(`SELECT r.answer, ${PERSON} AS p FROM event_rsvps r JOIN users u ON u.id = r.user_id LEFT JOIN officers o ON o.user_id = u.id
      WHERE r.post_id = $1 ORDER BY r.updated_at`, [b.post_id]);
    return Promise.all(rows.map(async (r) => ({ answer: r.answer, person: await signPerson(r.p) })));
  }),

  'everyday.events': def(STAFF, async (_b, { user }) => {
    if (!(await moduleOn('everyday'))) return [];
    const rows = await q(`SELECT e.post_id, e.title, e.starts_at, e.ends_at, e.capacity, p.place,
        (SELECT answer FROM event_rsvps r WHERE r.post_id = e.post_id AND r.user_id = $1) AS mine,
        (SELECT count(*)::int FROM event_rsvps r WHERE r.post_id = e.post_id AND r.answer = 'going') AS going,
        p.photos->0->>'key' AS cover_key
      FROM feed_events e JOIN posts p ON p.id = e.post_id
      WHERE e.cancelled_at IS NULL AND coalesce(e.ends_at, e.starts_at + interval '2 hours') > now() AND p.deleted_at IS NULL AND p.hidden_at IS NULL
      ORDER BY e.starts_at LIMIT 10`, [user.id]);
    return Promise.all(rows.map(async ({ cover_key, ...r }) => ({ ...r, cover_url: await signKey(cover_key) })));
  }),

  'everyday.eventEdit': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id');
    const ev = need(await one('SELECT e.* FROM feed_events e JOIN posts p ON p.id = e.post_id WHERE e.post_id = $1 AND p.deleted_at IS NULL', [b.post_id]), 'Event not found');
    if (ev.cancelled_at) fail(409, 'This event was cancelled');
    const next = cleanEvent({ title: b.title ?? ev.title, starts_at: b.starts_at ?? ev.starts_at, ends_at: 'ends_at' in b ? b.ends_at : ev.ends_at, capacity: 'capacity' in b ? b.capacity : ev.capacity }, { allowPast: true });
    const moved = new Date(next.starts_at).getTime() !== new Date(ev.starts_at).getTime();
    await q(`UPDATE feed_events SET title = $2, starts_at = $3, ends_at = $4, capacity = $5${moved ? ', reminded_day_at = NULL, reminded_hour_at = NULL' : ''} WHERE post_id = $1`,
      [ev.post_id, next.title, next.starts_at, next.ends_at, next.capacity]);
    if ('body' in b || 'place' in b || 'photos' in b) {
      const p = await one('SELECT * FROM posts WHERE id = $1', [ev.post_id]);
      const f = await postFields(p.author_id === user.id ? user : { id: p.author_id }, b, p);
      await q('UPDATE posts SET body = $2, photos = $3, place = $4, venue_id = $5, topics = $6, edited_at = now() WHERE id = $1', [p.id, f.body, JSON.stringify(f.photos), f.place, f.venue_id, f.topics]);
    }
    if ((next.capacity || 0) > (ev.capacity || 0) || (!next.capacity && ev.capacity)) await fillPlaces({ ...ev, capacity: next.capacity });
    const people = (await q("SELECT user_id FROM event_rsvps WHERE post_id = $1 AND answer IN ('going','maybe','waitlist')", [ev.post_id])).map((r) => r.user_id);
    await notify(people.filter((id) => id !== user.id), { kind: 'feed', title: `Event changed: ${next.title}`, body: whenText(next.starts_at), link: postLink(ev.post_id), dedupe: `eventedit:${ev.post_id}:${Date.now()}` });
    await audit(user, 'everyday.event.edit', 'post', ev.post_id, { title: next.title, starts_at: next.starts_at });
    await changed(ev.post_id);
    return { ok: true };
  }),

  'everyday.eventCancel': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id');
    const ev = need(await one('UPDATE feed_events SET cancelled_at = now() WHERE post_id = $1 AND cancelled_at IS NULL RETURNING *', [b.post_id]), 'Event not found or already cancelled');
    const people = (await q("SELECT user_id FROM event_rsvps WHERE post_id = $1 AND answer IN ('going','maybe','waitlist')", [ev.post_id])).map((r) => r.user_id);
    await notify(people.filter((id) => id !== user.id), { kind: 'feed', severity: 'warning', title: `Event cancelled: ${ev.title}`, body: String(b.reason || '').slice(0, 200) || whenText(ev.starts_at), link: postLink(ev.post_id), dedupe: `eventcancel:${ev.post_id}` });
    await audit(user, 'everyday.event.cancel', 'post', ev.post_id, { title: ev.title, reason: b.reason || '' });
    await changed(ev.post_id);
    return { ok: true };
  }),

  // ---------- Announcements ----------
  // Pinned posts that came on screen for about a second
  'everyday.seenPosts': def(STAFF, async (b, { user }) => {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => typeof x === 'string').slice(0, 50);
    if (ids.length) {
      await q(`INSERT INTO post_audience (post_id, user_id, seen_at) SELECT id, $1, now() FROM posts WHERE id = ANY($2::uuid[]) AND pinned_at IS NOT NULL AND author_id <> $1
        ON CONFLICT (post_id, user_id) DO UPDATE SET seen_at = coalesce(post_audience.seen_at, now())`, [user.id, ids]);
    }
    return { ok: true };
  }),

  'everyday.ack': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    need(await one('SELECT id FROM posts WHERE id = $1 AND must_ack AND deleted_at IS NULL AND hidden_at IS NULL', [b.id]), 'Nothing to acknowledge');
    await q(`INSERT INTO post_audience (post_id, user_id, seen_at, acked_at) VALUES ($1, $2, now(), now())
      ON CONFLICT (post_id, user_id) DO UPDATE SET seen_at = coalesce(post_audience.seen_at, now()), acked_at = coalesce(post_audience.acked_at, now())`, [b.id, user.id]);
    await audit(user, 'everyday.ack', 'post', b.id, { summary: `${user.name} confirmed they read an announcement` });
    return { ok: true };
  }),

  'everyday.audience': def(MGR, async (b) => {
    await requireModule('everyday');
    required(b, 'id');
    const p = need(await one('SELECT id, author_id, must_ack, ack_reminded_at FROM posts WHERE id = $1 AND deleted_at IS NULL', [b.id]), 'Post not found');
    const rows = await q(`SELECT ${PERSON} AS p, a.seen_at, a.acked_at FROM users u LEFT JOIN officers o ON o.user_id = u.id
      LEFT JOIN post_audience a ON a.post_id = $1 AND a.user_id = u.id WHERE ${ACTIVE_STAFF} AND u.id <> $2 ORDER BY a.acked_at NULLS LAST, a.seen_at NULLS LAST, u.name`, [p.id, p.author_id]);
    const people = await Promise.all(rows.map(async (r) => ({ person: await signPerson(r.p), seen_at: r.seen_at, acked_at: r.acked_at })));
    const remindAt = p.ack_reminded_at ? new Date(new Date(p.ack_reminded_at).getTime() + 3600000) : null;
    return { must_ack: p.must_ack, people, can_remind_at: remindAt && remindAt > new Date() ? remindAt : null };
  }),

  'everyday.ackRemind': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    const p = await one(`UPDATE posts SET ack_reminded_at = now() WHERE id = $1 AND must_ack AND deleted_at IS NULL
      AND (ack_reminded_at IS NULL OR ack_reminded_at < now() - interval '1 hour') RETURNING id, author_id, body`, [b.id]);
    if (!p) fail(429, 'You can send one reminder an hour');
    const rest = (await q(`SELECT u.id FROM users u LEFT JOIN officers o ON o.user_id = u.id
      WHERE ${ACTIVE_STAFF} AND u.id <> $2 AND NOT EXISTS (SELECT 1 FROM post_audience a WHERE a.post_id = $1 AND a.user_id = u.id AND a.acked_at IS NOT NULL)`, [p.id, p.author_id])).map((r) => r.id);
    await notify(rest, { kind: 'feed', title: 'Please read and confirm this announcement', body: snippet(p.body, 120), link: postLink(p.id), dedupe: `ackremind:${p.id}:${Date.now()}` });
    await audit(user, 'everyday.ack.remind', 'post', p.id, { count: rest.length });
    return { reminded: rest.length };
  }),

  'everyday.seen': def(STAFF, async (_b, { user }) => {
    await q('UPDATE users SET feed_seen_at = now() WHERE id = $1', [user.id]);
    return { ok: true };
  }),

  // Header badge; quiet (not an error) when the module is off
  'everyday.unread': def(STAFF, async (_b, { user }) => {
    if (!(await moduleOn('everyday'))) return { unread: 0, off: true };
    const r = await one(`SELECT count(*)::int AS n FROM posts p, users u WHERE u.id = $1 AND p.author_id <> $1 AND p.deleted_at IS NULL AND p.hidden_at IS NULL
      AND p.created_at > coalesce(u.feed_seen_at, now() - interval '7 days')`, [user.id]);
    return { unread: r.n };
  }),

  'everyday.latest': def(STAFF, async (_b, { user }) => {
    if (!(await moduleOn('everyday'))) return [];
    return loadPosts('true', [], user, { comments: 0, limit: 3 });
  }),

  'everyday.acceptRules': def(STAFF, async (_b, { user }) => {
    await q('UPDATE users SET feed_rules_at = coalesce(feed_rules_at, now()) WHERE id = $1', [user.id]);
    return { ok: true };
  }),

  // ---------- Managers ----------
  'everyday.pin': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    const ack = !!(b.on && b.must_ack);
    const p = need(await one(`UPDATE posts SET pinned_at = ${b.on ? 'now()' : 'NULL'}${b.on ? ', must_ack = $2, announced = announced OR $3' : ''}
      WHERE id = $1 AND deleted_at IS NULL RETURNING id, author_id, body`, b.on ? [b.id, ack, !!b.announce || ack] : [b.id]), 'Post not found');
    if (b.on && (b.announce || ack)) {
      // Must-acknowledge announcements always reach everyone; plain ones respect "Announcements" being switched off
      await notify(await allStaff(user.id), {
        kind: ack ? 'feed' : 'announcement', title: ack ? `Please read and confirm: announcement from ${user.name}` : `Announcement from ${user.name}`,
        body: snippet(p.body, 120), link: postLink(p.id), dedupe: `announce:${p.id}`,
      });
    }
    await audit(user, b.on ? 'everyday.pin' : 'everyday.unpin', 'post', p.id, { announce: !!b.announce || ack, must_ack: ack });
    await changed(p.id);
    return { ok: true };
  }),

  'everyday.hide': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'id');
    const table = b.target_type === 'comment' ? 'post_comments' : 'posts';
    const reason = String(b.reason || '').trim().slice(0, 300);
    const t = need(await one(`UPDATE ${table} SET hidden_at = now(), hidden_by = $2, hidden_reason = $3${table === 'posts' ? ', pinned_at = NULL' : ''}
      WHERE id = $1 AND hidden_at IS NULL RETURNING id, author_id, body, ${table === 'posts' ? 'id AS post_id' : 'post_id'}`, [b.id, user.id, reason]), 'Already hidden or removed');
    await q("UPDATE feed_reports SET status = 'actioned', resolved_by = $3, resolved_at = now() WHERE target_type = $1 AND target_id = $2 AND status = 'open'", [b.target_type, t.id, user.id]);
    await notify([t.author_id], { kind: 'feed', title: `A manager hid your ${b.target_type} on Everyday`, body: `${reason ? `Reason: ${reason}. ` : ''}"${snippet(t.body, 60)}"`, link: postLink(t.post_id, b.target_type === 'comment' ? t.id : null), dedupe: `hidden:${t.id}` });
    await audit(user, 'everyday.hide', b.target_type, t.id, { reason });
    await changed(t.post_id);
    return { ok: true };
  }),

  'everyday.unhide': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'id');
    const table = b.target_type === 'comment' ? 'post_comments' : 'posts';
    const t = need(await one(`UPDATE ${table} SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE id = $1 RETURNING ${table === 'posts' ? 'id AS post_id' : 'post_id'}`, [b.id]), 'Not found');
    await q("UPDATE feed_reports SET status = 'dismissed', resolved_by = $3, resolved_at = now() WHERE target_type = $1 AND target_id = $2 AND status = 'open'", [b.target_type, b.id, user.id]);
    await audit(user, 'everyday.unhide', b.target_type, b.id);
    await changed(t.post_id);
    return { ok: true };
  }),

  // Permanent removal by a manager; the audit record keeps what was removed
  'everyday.remove': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'id');
    const table = b.target_type === 'comment' ? 'post_comments' : 'posts';
    const reason = String(b.reason || '').trim().slice(0, 300);
    const t = need(await one(`SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NULL`, [b.id]), 'Already removed');
    if (table === 'posts') await q('UPDATE posts SET deleted_at = now(), deleted_by = $2, removed_reason = $3, pinned_at = NULL WHERE id = $1', [t.id, user.id, reason]);
    else await q('UPDATE post_comments SET deleted_at = now(), deleted_by = $2 WHERE id = $1', [t.id, user.id]);
    await q("UPDATE feed_reports SET status = 'actioned', resolved_by = $3, resolved_at = now() WHERE target_type = $1 AND target_id = $2 AND status = 'open'", [b.target_type, t.id, user.id]);
    if (t.author_id !== user.id) {
      await notify([t.author_id], { kind: 'feed', title: `A manager removed your ${b.target_type} from Everyday`, body: `${reason ? `Reason: ${reason}. ` : ''}"${snippet(t.body, 60)}"`, link: '/everyday', dedupe: `removed:${t.id}` });
    }
    const author = await one('SELECT name FROM users WHERE id = $1', [t.author_id]);
    await audit(user, 'everyday.remove', b.target_type, t.id, {
      reason, author: author?.name, author_id: t.author_id, body: t.body, photos: t.photos || t.photo || null, video: t.video || null, created_at: t.created_at,
      summary: `Removed a ${b.target_type} by ${author?.name || 'someone'}${reason ? `: ${reason}` : ''}`,
    });
    await changed(table === 'posts' ? t.id : t.post_id);
    return { ok: true };
  }),

  'everyday.reports': def(MGR, async () => {
    await requireModule('everyday');
    const reports = await q(`SELECT r.id, r.target_type, r.target_id, r.reason, r.created_at, ru.name AS reporter_name,
        coalesce(p.body, c.body) AS body, coalesce(p.id, c.post_id) AS post_id, coalesce(p.hidden_at, c.hidden_at) AS hidden_at,
        au.id AS author_id, au.name AS author_name
      FROM feed_reports r LEFT JOIN users ru ON ru.id = r.reporter_id
      LEFT JOIN posts p ON r.target_type = 'post' AND p.id = r.target_id
      LEFT JOIN post_comments c ON r.target_type = 'comment' AND c.id = r.target_id
      LEFT JOIN users au ON au.id = coalesce(p.author_id, c.author_id)
      WHERE r.status = 'open' AND coalesce(p.deleted_at, c.deleted_at) IS NULL ORDER BY r.created_at DESC`);
    const hidden = await q(`SELECT 'post' AS target_type, p.id, p.id AS post_id, p.body, p.hidden_at, p.hidden_reason AS reason, u.name AS author_name, h.name AS hidden_by_name
        FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN users h ON h.id = p.hidden_by WHERE p.hidden_at IS NOT NULL AND p.deleted_at IS NULL
      UNION ALL SELECT 'comment', c.id, c.post_id, c.body, c.hidden_at, coalesce(c.hidden_reason, ''), u.name, coalesce(h.name, 'Orb AI')
        FROM post_comments c JOIN users u ON u.id = c.author_id LEFT JOIN users h ON h.id = c.hidden_by WHERE c.hidden_at IS NOT NULL AND c.deleted_at IS NULL
      ORDER BY hidden_at DESC LIMIT 50`);
    const mutes = await q('SELECT m.user_id, m.until, m.reason, u.name, b.name AS by_name FROM feed_mutes m JOIN users u ON u.id = m.user_id LEFT JOIN users b ON b.id = m.by WHERE m.until > now() ORDER BY m.until');
    return { reports, hidden, mutes };
  }),

  'everyday.resolve': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id', 'status');
    if (!['actioned', 'dismissed'].includes(b.status)) fail(400, 'Unknown status');
    need(await one("UPDATE feed_reports SET status = $2, resolved_by = $3, resolved_at = now() WHERE id = $1 AND status = 'open' RETURNING id", [b.id, b.status, user.id]), 'Report not found');
    await audit(user, `everyday.report.${b.status}`, 'feed_report', b.id);
    return { ok: true };
  }),

  'everyday.mute': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'user_id');
    const days = Number(b.days || 7);
    if (!MUTE_DAYS.includes(days)) fail(400, `Pause for ${MUTE_DAYS.join(', ')} days`);
    const target = need(await one("SELECT id, role FROM users WHERE id = $1 AND role IN ('company','security','officer')", [b.user_id]), 'Person not found');
    if (target.id === user.id) fail(400, "You can't mute yourself");
    if (target.role === 'company' && user.role !== 'company') fail(403, 'Only a company manager can mute a company manager');
    const reason = String(b.reason || '').trim().slice(0, 300);
    await q(`INSERT INTO feed_mutes (user_id, until, reason, by) VALUES ($1, now() + make_interval(days => $2), $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason, by = EXCLUDED.by`, [target.id, days, reason, user.id]);
    await notify([target.id], { kind: 'feed', severity: 'warning', title: `You can't post on Everyday for ${days} day${days === 1 ? '' : 's'}`, body: reason ? `Reason: ${reason}` : 'A manager paused your posting. You can still read the feed.', link: '/everyday' });
    await audit(user, 'everyday.mute', 'user', target.id, { days, reason });
    return { ok: true };
  }),

  'everyday.unmute': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'user_id');
    await q('DELETE FROM feed_mutes WHERE user_id = $1', [b.user_id]);
    await audit(user, 'everyday.unmute', 'user', b.user_id);
    return { ok: true };
  }),
};

function parseCommentPhoto(user, ph) {
  const key = String(ph?.key || '');
  if (!key.startsWith(feedPrefix(user))) fail(400, 'Invalid photo');
  return { key, w: dim(ph.w), h: dim(ph.h) };
}

function cleanEvent(b, { allowPast = false } = {}) {
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) fail(400, 'Give the event a title');
  const starts = new Date(b.starts_at);
  if (Number.isNaN(starts.getTime())) fail(400, 'Pick when the event starts');
  if (!allowPast && starts < new Date()) fail(400, 'The event must start in the future');
  const ends = b.ends_at ? new Date(b.ends_at) : null;
  if (ends && !(ends > starts)) fail(400, 'The event must end after it starts');
  const capacity = b.capacity ? Math.round(Number(b.capacity)) : null;
  if (capacity != null && !(capacity >= 1 && capacity <= 10000)) fail(400, 'Places must be a number from 1');
  return { title, starts_at: starts.toISOString(), ends_at: ends ? ends.toISOString() : null, capacity };
}

const whenText = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Places freed up: people on the waiting list move to Going, oldest first, and are told
async function fillPlaces(ev) {
  const rsvps = await q('SELECT user_id, answer, updated_at FROM event_rsvps WHERE post_id = $1', [ev.post_id]);
  const up = ev.capacity ? promoteWaitlist(rsvps, ev.capacity) : rsvps.filter((r) => r.answer === 'waitlist').map((r) => r.user_id);
  if (!up.length) return;
  await q("UPDATE event_rsvps SET answer = 'going', updated_at = now() WHERE post_id = $1 AND user_id = ANY($2::uuid[])", [ev.post_id, up]);
  await notify(up, { kind: 'feed', title: `A place came up — you're going to ${ev.title}`, body: whenText(ev.starts_at), link: postLink(ev.post_id), dedupe: `eventplace:${ev.post_id}` });
}

const buckets = new Map();
async function limitRate(key, n, ms) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < ms);
  if (list.length >= n) fail(429, 'Slow down a little and try again');
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 5000) buckets.clear();
}
