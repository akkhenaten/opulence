// Everyday: the staff feed. Posts with photos, reactions, comments (one level of replies) and @mentions.
// Staff only (officers, company and security managers); venue users never see it. Managers moderate.
import crypto from 'node:crypto';
import { one, q, tx } from '../lib/db.mjs';
import { fail, need, required, HttpError } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { isManager } from '../lib/auth.mjs';
import { extract, fileBlock, HAIKU } from '../lib/ai.mjs';
import { downloadUrl, getObjectBytes } from '../lib/storage.mjs';
import { notify, companyManagers } from '../lib/notify.mjs';
import { moduleOn, requireModule } from '../lib/modules.mjs';
import { londonDate } from '../lib/time.mjs';
import { MGR, def } from './_def.mjs';

const STAFF = ['company', 'security', 'officer'];
const KINDS = ['like', 'love', 'laugh', 'wow', 'sad', 'clap'];
const PAGE = 20;
// Notification links go through /everyday, which the app sends to the right portal for the reader
const postLink = (id, comment) => `/everyday?post=${id}${comment ? `&comment=${comment}` : ''}`;

const PERSON = `json_build_object('id', u.id, 'name', u.name, 'role', u.role, 'photo_key', o.photo_key)`;
const VISIBLE = (alias, mgr) => `${alias}.deleted_at IS NULL${mgr ? '' : ` AND ${alias}.hidden_at IS NULL`}`;

async function signPerson(p) {
  if (!p) return p;
  const { photo_key, ...rest } = p;
  return { ...rest, photo_url: photo_key ? await downloadUrl(photo_key) : null };
}

const reactionCols = (type, alias) => `
  (SELECT coalesce(jsonb_object_agg(kind, n), '{}') FROM (SELECT kind, count(*)::int AS n FROM reactions r WHERE r.target_type = '${type}' AND r.target_id = ${alias}.id GROUP BY kind) x) AS reactions,
  (SELECT kind FROM reactions r WHERE r.target_type = '${type}' AND r.target_id = ${alias}.id AND r.user_id = $1) AS mine`;

async function loadComments(postIds, user, { limit = null } = {}) {
  if (!postIds.length) return [];
  const mgr = isManager(user);
  // With a limit: the latest N top-level comments per post (plus their replies are not loaded)
  const rows = await q(`SELECT * FROM (
      SELECT c.id, c.post_id, c.parent_id, c.body, c.mentions, c.created_at, c.edited_at, c.hidden_at, ${PERSON} AS author, ${reactionCols('comment', 'c')},
        row_number() OVER (PARTITION BY c.post_id ORDER BY c.created_at DESC) AS rn
      FROM post_comments c JOIN users u ON u.id = c.author_id LEFT JOIN officers o ON o.user_id = u.id
      WHERE c.post_id = ANY($2::uuid[]) AND ${VISIBLE('c', mgr)} ${limit ? 'AND c.parent_id IS NULL' : ''}) z
    ${limit ? `WHERE rn <= ${Number(limit)}` : ''} ORDER BY created_at`, [user.id, postIds]);
  return Promise.all(rows.map(async ({ rn, ...c }) => ({ ...c, author: await signPerson(c.author) })));
}

async function loadPosts(where, params, user, { comments = 2, order = 'p.created_at DESC', limit = PAGE } = {}) {
  const mgr = isManager(user);
  const rows = await q(`SELECT p.id, p.body, p.photos, p.mentions, p.pinned_at, p.edited_at, p.created_at, p.hidden_at, p.hidden_reason,
      ${PERSON} AS author, ${reactionCols('post', 'p')},
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id = p.id AND ${VISIBLE('c', mgr)}) AS comment_count
    FROM posts p JOIN users u ON u.id = p.author_id LEFT JOIN officers o ON o.user_id = u.id
    WHERE ${VISIBLE('p', mgr)} AND ${where} ORDER BY ${order} LIMIT ${limit}`, [user.id, ...params]);
  const cs = comments ? await loadComments(rows.map((r) => r.id), user, { limit: comments === 'all' ? null : comments }) : [];
  const names = await mentionNames(rows.flatMap((r) => r.mentions).concat(cs.flatMap((c) => c.mentions)));
  return Promise.all(rows.map(async (p) => ({
    ...p,
    author: await signPerson(p.author),
    photos: await Promise.all((p.photos || []).map(async (ph) => ({ key: ph.key, url: await downloadUrl(ph.key) }))),
    mentions: p.mentions.map((id) => names[id]).filter(Boolean),
    comments: cs.filter((c) => c.post_id === p.id).map((c) => ({ ...c, mentions: c.mentions.map((id) => names[id]).filter(Boolean) })),
    mine_post: p.author.id === user.id,
  })));
}

async function mentionNames(ids) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return {};
  const rows = await q('SELECT id, name FROM users WHERE id = ANY($1::uuid[])', [uniq]);
  return Object.fromEntries(rows.map((r) => [r.id, { id: r.id, name: r.name }]));
}

// Only active staff can be mentioned, and only if their name is in the text
async function cleanMentions(ids, text) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const rows = await q("SELECT id, name FROM users WHERE id = ANY($1::uuid[]) AND status = 'active' AND role IN ('company','security','officer')", [ids.slice(0, 20)]);
  return rows.filter((r) => String(text).includes(`@${r.name}`)).map((r) => r.id);
}

async function assertCanPost(user) {
  const u = await one(`SELECT u.feed_rules_at, m.until FROM users u LEFT JOIN feed_mutes m ON m.user_id = u.id AND m.until > now() WHERE u.id = $1`, [user.id]);
  if (!u.feed_rules_at) fail(409, 'Please read the community rules first', { need_rules: true });
  if (u.until) fail(403, `You can't post or comment until ${new Date(u.until).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Ask a manager if you think this is a mistake.`);
}

function photoKeys(user, keys) {
  const list = Array.isArray(keys) ? keys : [];
  if (list.length > 10) fail(400, 'Up to 10 photos per post');
  const prefix = `docs/feed/${user.id.slice(0, 8)}/`;
  if (list.some((k) => !String(k).startsWith(prefix))) fail(400, 'Invalid photo');
  return list;
}

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
async function precheck(body, keys) {
  const hash = crypto.createHash('sha1').update(JSON.stringify([String(body || ''), keys])).digest('hex');
  const cached = await one('SELECT result FROM feed_checks WHERE hash = $1', [hash]);
  if (cached) return cached.result;
  if (!String(body || '').trim() && !keys.length) return { warnings: [], serious: false };
  let result;
  try {
    const images = (await Promise.all(keys.map((k) => getObjectBytes(k).then((bytes) => fileBlock(bytes, 'image/jpeg')).catch(() => null)))).filter(Boolean);
    const { input } = await extract({
      model: HAIKU, module: 'everyday', max_tokens: 400, tool: CHECK_TOOL,
      system: `You check posts before they go on the internal social feed of a UK security company (officers and managers). Friendly team posts, photos of colleagues, events, training and achievements are fine.
Warn about: abuse, threats, harassment or discrimination; details of real incidents or members of the public (names, what happened to whom); faces of members of the public or customers; personal data such as car number plates, phone numbers, addresses, ID cards or licences; CCTV screens, radios channels, rotas, door codes or other venue security details.
Be brief. Do not warn about ordinary photos of staff or venues from outside. Use "they" for people.`,
      messages: [{ role: 'user', content: [...images, { type: 'text', text: `Post text: ${String(body || '(no text)').slice(0, 3000)}${images.length ? `\n${images.length} photo(s) attached above.` : ''}` }] }],
    });
    result = { warnings: (input?.warnings || []).map(String).slice(0, 5), serious: !!input?.serious };
  } catch (e) {
    if (!(e instanceof HttpError)) console.warn('[everyday] precheck failed:', e.message);
    return { warnings: [], serious: false, skipped: true };
  }
  await q('INSERT INTO feed_checks (hash, result) VALUES ($1, $2) ON CONFLICT (hash) DO NOTHING', [hash, result]);
  return result;
}

async function targetOf(type, id, user) {
  if (!['post', 'comment'].includes(type)) fail(400, 'Unknown item');
  const row = type === 'post'
    ? await one('SELECT id, author_id, id AS post_id, body, hidden_at, deleted_at FROM posts WHERE id = $1', [id])
    : await one('SELECT id, author_id, post_id, body, hidden_at, deleted_at FROM post_comments WHERE id = $1', [id]);
  if (!row || row.deleted_at || (row.hidden_at && !isManager(user))) fail(404, 'This has been removed');
  return row;
}

const snippet = (t, n = 80) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

export const actions = {
  'everyday.feed': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    const pinned = b.before ? [] : await loadPosts('p.pinned_at IS NOT NULL', [], user, { order: 'p.pinned_at DESC', limit: 5 });
    const posts = await loadPosts('p.pinned_at IS NULL AND ($2::timestamptz IS NULL OR p.created_at < $2)', [b.before || null], user);
    const me = await one('SELECT feed_rules_at FROM users WHERE id = $1', [user.id]);
    return { pinned, posts, next: posts.length === PAGE ? posts[posts.length - 1].created_at : null, rules_accepted: !!me.feed_rules_at };
  }),

  'everyday.post': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    const [post] = await loadPosts('p.id = $2', [b.id], user, { comments: 'all', limit: 1 });
    return need(post, 'This post has been removed');
  }),

  'everyday.people': def(STAFF, async () => {
    await requireModule('everyday');
    const rows = await q(`SELECT ${PERSON} AS p FROM users u LEFT JOIN officers o ON o.user_id = u.id
      WHERE u.status = 'active' AND u.role IN ('company','security','officer') AND (o.id IS NULL OR o.status IN ('active','onboarding')) ORDER BY u.name`);
    return Promise.all(rows.map((r) => signPerson(r.p)));
  }),

  'everyday.profile': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'user_id');
    const p = need(await one(`SELECT ${PERSON} AS p, o.start_date, u.created_at,
        (SELECT count(*)::int FROM posts x WHERE x.author_id = u.id AND x.deleted_at IS NULL AND x.hidden_at IS NULL) AS posts
      FROM users u LEFT JOIN officers o ON o.user_id = u.id WHERE u.id = $1 AND u.role IN ('company','security','officer')`, [b.user_id]), 'Not found');
    const muted = isManager(user) ? await one('SELECT until, reason FROM feed_mutes WHERE user_id = $1 AND until > now()', [b.user_id]) : null;
    return {
      person: await signPerson(p.p), since: String(p.start_date || londonDate(p.created_at)).slice(0, 4), post_count: p.posts, muted,
      posts: await loadPosts('p.author_id = $2', [b.user_id], user, { comments: 0, limit: 12 }),
    };
  }),

  'everyday.precheck': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    return precheck(b.body, photoKeys(user, b.photo_keys));
  }),

  'everyday.create': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    await assertCanPost(user);
    const body = String(b.body || '').trim().slice(0, 5000);
    const keys = photoKeys(user, b.photo_keys);
    if (!body && !keys.length) fail(400, 'Write something or add a photo');
    const check = await precheck(body, keys);
    const mentions = await cleanMentions(b.mentions, body);
    const post = await one('INSERT INTO posts (author_id, body, photos, mentions, ai_check) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [user.id, body, JSON.stringify(keys.map((key) => ({ key }))), mentions, check]);
    if (check.serious) {
      await q("INSERT INTO feed_reports (target_type, target_id, reason) VALUES ('post', $1, $2)", [post.id, `Orb AI: ${check.warnings.join(' ') || 'may break the community rules'}`]);
      await notify(await companyManagers(), { kind: 'feed', severity: 'warning', title: `Everyday post by ${user.name} flagged for review`, body: snippet(check.warnings[0] || body), link: postLink(post.id), dedupe: `feedflag:${post.id}` });
    }
    await notify(mentions.filter((id) => id !== user.id), { kind: 'mention', title: `${user.name} mentioned you on Everyday`, body: snippet(body), link: postLink(post.id), dedupe: `mention:${post.id}` });
    return { id: post.id };
  }),

  'everyday.edit': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'id');
    await assertCanPost(user);
    const p = need(await one('SELECT * FROM posts WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL', [b.id, user.id]), 'Post not found');
    const body = String(b.body ?? p.body).trim().slice(0, 5000);
    const keys = b.photo_keys ? [...p.photos.map((x) => x.key).filter((k) => b.photo_keys.includes(k)), ...photoKeys(user, b.photo_keys.filter((k) => !p.photos.some((x) => x.key === k)))] : p.photos.map((x) => x.key);
    if (keys.length > 10) fail(400, 'Up to 10 photos per post');
    if (!body && !keys.length) fail(400, 'Write something or add a photo');
    const check = await precheck(body, keys);
    const mentions = await cleanMentions(b.mentions || p.mentions, body);
    await q('UPDATE posts SET body = $2, photos = $3, mentions = $4, ai_check = $5, edited_at = now() WHERE id = $1', [p.id, body, JSON.stringify(keys.map((key) => ({ key }))), mentions, check]);
    const added = mentions.filter((id) => !p.mentions.includes(id) && id !== user.id);
    await notify(added, { kind: 'mention', title: `${user.name} mentioned you on Everyday`, body: snippet(body), link: postLink(p.id), dedupe: `mention:${p.id}` });
    return { ok: true };
  }),

  'everyday.delete': def(STAFF, async (b, { user }) => {
    required(b, 'target_type', 'id');
    const table = b.target_type === 'comment' ? 'post_comments' : 'posts';
    const r = await one(`UPDATE ${table} SET deleted_at = now() WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL RETURNING id`, [b.id, user.id]);
    need(r, 'Not found');
    return { ok: true };
  }),

  'everyday.comment': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'post_id', 'body');
    await assertCanPost(user);
    const post = await targetOf('post', b.post_id, user);
    const body = String(b.body).trim().slice(0, 2000);
    if (!body) fail(400, 'Write a comment');
    let parent = null;
    if (b.parent_id) {
      parent = need(await one('SELECT id, parent_id, author_id FROM post_comments WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL', [b.parent_id, post.id]), 'That comment has been removed');
      // Replies stay one level deep: a reply to a reply joins the same thread
      if (parent.parent_id) parent = await one('SELECT id, parent_id, author_id FROM post_comments WHERE id = $1', [parent.parent_id]);
    }
    const mentions = await cleanMentions(b.mentions, body);
    const c = await one('INSERT INTO post_comments (post_id, parent_id, author_id, body, mentions) VALUES ($1,$2,$3,$4,$5) RETURNING id', [post.id, parent?.id || null, user.id, body, mentions]);
    const told = new Set([user.id]);
    const tell = async (ids, n) => { const to = ids.filter((id) => !told.has(id)); to.forEach((id) => told.add(id)); if (to.length) await notify(to, n); };
    await tell(mentions, { kind: 'mention', title: `${user.name} mentioned you in a comment`, body: snippet(body), link: postLink(post.id, c.id), dedupe: `mention:${c.id}` });
    if (parent) await tell([parent.author_id], { kind: 'comment', title: `${user.name} replied to your comment`, body: snippet(body), link: postLink(post.id, c.id), dedupe: `reply:${c.id}` });
    await tell([post.author_id], { kind: 'comment', title: `${user.name} commented on your post`, body: snippet(body), link: postLink(post.id, c.id), dedupe: `comment:${c.id}` });
    return { id: c.id };
  }),

  'everyday.editComment': def(STAFF, async (b, { user }) => {
    required(b, 'id', 'body');
    await assertCanPost(user);
    const body = String(b.body).trim().slice(0, 2000);
    if (!body) fail(400, 'Write a comment');
    need(await one('UPDATE post_comments SET body = $3, edited_at = now() WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL RETURNING id', [b.id, user.id, body]), 'Comment not found');
    return { ok: true };
  }),

  'everyday.react': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'target_id');
    const t = await targetOf(b.target_type, b.target_id, user);
    if (!b.kind) {
      await q('DELETE FROM reactions WHERE target_type = $1 AND target_id = $2 AND user_id = $3', [b.target_type, t.id, user.id]);
      return { ok: true };
    }
    if (!KINDS.includes(b.kind)) fail(400, 'Unknown reaction');
    await q(`INSERT INTO reactions (target_type, target_id, user_id, kind) VALUES ($1,$2,$3,$4)
      ON CONFLICT (target_type, target_id, user_id) DO UPDATE SET kind = EXCLUDED.kind`, [b.target_type, t.id, user.id, b.kind]);
    if (t.author_id !== user.id) {
      // One reaction notice per item per day, so a popular post doesn't flood the author
      await notify([t.author_id], {
        kind: 'reaction', title: `${user.name} reacted to your ${b.target_type}`, body: snippet(t.body), link: postLink(t.post_id),
        dedupe: `react:${b.target_type}:${t.id}:${londonDate(new Date())}`,
      });
    }
    return { ok: true };
  }),

  'everyday.reactions': def(STAFF, async (b, { user }) => {
    required(b, 'target_type', 'target_id');
    await targetOf(b.target_type, b.target_id, user);
    const rows = await q(`SELECT r.kind, ${PERSON} AS p FROM reactions r JOIN users u ON u.id = r.user_id LEFT JOIN officers o ON o.user_id = u.id
      WHERE r.target_type = $1 AND r.target_id = $2 ORDER BY r.created_at DESC`, [b.target_type, b.target_id]);
    return Promise.all(rows.map(async (r) => ({ kind: r.kind, person: await signPerson(r.p) })));
  }),

  'everyday.report': def(STAFF, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'target_id');
    const t = await targetOf(b.target_type, b.target_id, user);
    const dup = await one("SELECT id FROM feed_reports WHERE target_type = $1 AND target_id = $2 AND reporter_id = $3 AND status = 'open'", [b.target_type, t.id, user.id]);
    if (!dup) {
      await q('INSERT INTO feed_reports (target_type, target_id, reporter_id, reason) VALUES ($1,$2,$3,$4)', [b.target_type, t.id, user.id, String(b.reason || '').slice(0, 500)]);
      await notify(await companyManagers(), { kind: 'feed', severity: 'warning', title: `Everyday ${b.target_type} reported`, body: `${snippet(b.reason || 'No reason given', 60)} · "${snippet(t.body, 60)}"`, link: '/company/everyday?tab=moderation', dedupe: `report:${t.id}` });
    }
    return { ok: true };
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
    const p = need(await one(`UPDATE posts SET pinned_at = ${b.on ? 'now()' : 'NULL'} WHERE id = $1 AND deleted_at IS NULL RETURNING id, author_id, body`, [b.id]), 'Post not found');
    if (b.on && b.announce) {
      const everyone = (await q("SELECT id FROM users WHERE status = 'active' AND role IN ('company','security','officer') AND id <> $1", [user.id])).map((r) => r.id);
      await notify(everyone, { kind: 'announcement', title: `Announcement from ${user.name}`, body: snippet(p.body, 120), link: postLink(p.id), dedupe: `announce:${p.id}` });
    }
    await audit(user, b.on ? 'everyday.pin' : 'everyday.unpin', 'post', p.id, { announce: !!b.announce });
    return { ok: true };
  }),

  'everyday.hide': def(MGR, async (b, { user }) => {
    await requireModule('everyday');
    required(b, 'target_type', 'id');
    const table = b.target_type === 'comment' ? 'post_comments' : 'posts';
    const reason = String(b.reason || '').trim().slice(0, 300);
    const t = need(await one(`UPDATE ${table} SET hidden_at = now(), hidden_by = $2${table === 'posts' ? ', hidden_reason = $3, pinned_at = NULL' : ''} WHERE id = $1 AND hidden_at IS NULL RETURNING id, author_id, body`,
      table === 'posts' ? [b.id, user.id, reason] : [b.id, user.id]), 'Already hidden or removed');
    await q("UPDATE feed_reports SET status = 'actioned', resolved_by = $3, resolved_at = now() WHERE target_type = $1 AND target_id = $2 AND status = 'open'", [b.target_type, t.id, user.id]);
    await notify([t.author_id], { kind: 'feed', title: `A manager hid your ${b.target_type} on Everyday`, body: `${reason ? `Reason: ${reason}. ` : ''}"${snippet(t.body, 60)}"`, link: '', dedupe: `hidden:${t.id}` });
    await audit(user, 'everyday.hide', b.target_type, t.id, { reason });
    return { ok: true };
  }),

  'everyday.unhide': def(MGR, async (b, { user }) => {
    required(b, 'target_type', 'id');
    const table = b.target_type === 'comment' ? 'post_comments' : 'posts';
    need(await one(`UPDATE ${table} SET hidden_at = NULL, hidden_by = NULL WHERE id = $1 RETURNING id`, [b.id]), 'Not found');
    await audit(user, 'everyday.unhide', b.target_type, b.id);
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
      UNION ALL SELECT 'comment', c.id, c.post_id, c.body, c.hidden_at, '', u.name, h.name
        FROM post_comments c JOIN users u ON u.id = c.author_id LEFT JOIN users h ON h.id = c.hidden_by WHERE c.hidden_at IS NOT NULL AND c.deleted_at IS NULL
      ORDER BY hidden_at DESC LIMIT 50`);
    const mutes = await q('SELECT m.user_id, m.until, m.reason, u.name, b.name AS by_name FROM feed_mutes m JOIN users u ON u.id = m.user_id LEFT JOIN users b ON b.id = m.by WHERE m.until > now() ORDER BY m.until');
    return { reports, hidden, mutes };
  }),

  'everyday.resolve': def(MGR, async (b, { user }) => {
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
    if (!(days >= 1 && days <= 365)) fail(400, 'Mute for 1 to 365 days');
    const target = need(await one("SELECT id, role FROM users WHERE id = $1 AND role IN ('company','security','officer')", [b.user_id]), 'Person not found');
    if (target.id === user.id) fail(400, "You can't mute yourself");
    if (target.role === 'company' && user.role !== 'company') fail(403, 'Only a company manager can mute a company manager');
    const reason = String(b.reason || '').trim().slice(0, 300);
    await q(`INSERT INTO feed_mutes (user_id, until, reason, by) VALUES ($1, now() + make_interval(days => $2), $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason, by = EXCLUDED.by`, [target.id, days, reason, user.id]);
    await notify([target.id], { kind: 'feed', severity: 'warning', title: `You can't post on Everyday for ${days} day${days === 1 ? '' : 's'}`, body: reason ? `Reason: ${reason}` : 'A manager paused your posting. You can still read the feed.', link: '' });
    await audit(user, 'everyday.mute', 'user', target.id, { days, reason });
    return { ok: true };
  }),

  'everyday.unmute': def(MGR, async (b, { user }) => {
    required(b, 'user_id');
    await q('DELETE FROM feed_mutes WHERE user_id = $1', [b.user_id]);
    await audit(user, 'everyday.unmute', 'user', b.user_id);
    return { ok: true };
  }),
};
