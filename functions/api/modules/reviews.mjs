// Client reviews for the public website. Venue managers and company managers record what a client said;
// a venue manager's review waits for a company manager to publish it. The landing page reads published ones.
import { one, q } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { venueScope } from '../lib/scope.mjs';
import { notify, companyManagers } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { SITE_CLIENTS, isSiteClient } from '../lib/siteClients.mjs';
import { def, pub } from './_def.mjs';
import { userName } from '../lib/names.mjs';

const STATUSES = ['pending', 'published', 'hidden'];
const VIEW = ['company', 'security', 'venue'];

export const statusOnCreate = (role) => (role === 'company' ? 'published' : 'pending');

/** Only what the website shows: never ids, people or venues. */
export const publicShape = (r) => ({ quote: r.quote, reviewer: r.reviewer, reviewer_role: r.reviewer_role, rating: r.rating ?? null, received_on: r.received_on ?? null });

/** Published reviews by website client, in the managers' order, newest first after that. */
export function groupPublic(rows) {
  const out = {};
  const sorted = [...rows].sort((a, b) => (a.sort - b.sort) || (new Date(b.created_at) - new Date(a.created_at)));
  for (const r of sorted) (out[r.client] ||= []).push(publicShape(r));
  return out;
}

/** Praise the office ticked onto the site: the venue speaks, never a person. */
export const feedbackShape = (c) => ({ quote: String(c.comment || '').trim().slice(0, 600), reviewer: c.venue_name, reviewer_role: 'Venue', rating: c.rating ?? null, received_on: c.created_at ?? null });

/** Reviews first, then the newest ticked feedback, per website client. */
export function mergePublic(by, feedback) {
  const out = { ...by };
  for (const c of feedback) out[c.site_client] = [...(out[c.site_client] || []), feedbackShape(c)];
  return out;
}

/** Website clients this person may file reviews for: every one for company managers, their own linked venues' for venue managers. */
async function myClients(user) {
  if (user.role === 'company') return SITE_CLIENTS.map((c) => c.slug);
  if (user.role !== 'venue') return [];
  const scope = await venueScope(user);
  return (await q('SELECT DISTINCT site_client FROM venues WHERE id = ANY($1::uuid[]) AND site_client IS NOT NULL', [scope])).map((r) => r.site_client);
}

// Security managers read every review; venue managers only their own clients'
async function visibleClients(user) {
  return user.role === 'venue' ? myClients(user) : null;
}

const text = (v, max) => String(v ?? '').trim().slice(0, max);

export function fields(b) {
  const rating = b.rating === null || b.rating === '' || b.rating === undefined ? null : Number(b.rating);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) fail(400, 'Rating must be 1 to 5 stars');
  const f = { quote: text(b.quote, 600), reviewer: text(b.reviewer, 80), reviewer_role: text(b.reviewer_role, 80), rating, received_on: b.received_on || null };
  if (!f.quote) fail(400, 'Add the review text');
  return f;
}

async function own(user, id) {
  const r = need(await one('SELECT * FROM reviews WHERE id = $1', [id]), 'Review not found');
  if (user.role === 'company') return r;
  if (r.created_by !== user.id || r.status !== 'pending') fail(403, 'Only the office can change a review once it has been checked');
  return r;
}

/** A new review at the end of its client's list; a pending one asks the company managers to approve it. */
export async function insertReview(user, f, status) {
  const { n } = await one('SELECT COALESCE(max(sort), -1) + 1 AS n FROM reviews WHERE client = $1', [f.client]);
  const r = await one(
    `INSERT INTO reviews (client, quote, reviewer, reviewer_role, rating, received_on, status, sort, venue_id, created_by, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [f.client, f.quote, f.reviewer, f.reviewer_role, f.rating, f.received_on || null, status, n, f.venue_id || null, user.id,
      status === 'published' ? user.id : null, status === 'published' ? new Date() : null]);
  if (status === 'pending') {
    const name = SITE_CLIENTS.find((c) => c.slug === f.client).name;
    await notify(await companyManagers(), {
      kind: 'review', title: 'New review to approve', body: `${name}: “${f.quote.slice(0, 90)}${f.quote.length > 90 ? '…' : ''}” — added by ${user.name}`,
      link: '/company/reviews?status=pending', ref: `review:${r.id}`,
    });
  }
  return r;
}

export const actions = {
  'reviews.clients': def(VIEW, async (b, { user }) => {
    const seen = await visibleClients(user);
    const counts = await q(`SELECT client, status, count(*)::int AS n FROM reviews WHERE ($1::text[] IS NULL OR client = ANY($1)) GROUP BY 1, 2`, [seen]);
    return {
      clients: SITE_CLIENTS.map(({ slug, name, city }) => ({ slug, name, city })),
      mine: await myClients(user),
      counts: counts.reduce((m, r) => ({ ...m, [r.client]: { ...m[r.client], [r.status]: r.n } }), {}),
    };
  }),

  'reviews.list': def(VIEW, async (b, { user }) => {
    const seen = await visibleClients(user);
    return q(
      `SELECT r.*, ${userName('u')} AS created_by_name, ${userName('a')} AS approved_by_name, v.name AS venue_name
         FROM reviews r LEFT JOIN users u ON u.id = r.created_by LEFT JOIN users a ON a.id = r.approved_by LEFT JOIN venues v ON v.id = r.venue_id
        WHERE ($1::text[] IS NULL OR r.client = ANY($1)) AND ($2::text IS NULL OR r.client = $2) AND ($3::text IS NULL OR r.status = $3)
          AND ($4::text = '' OR r.quote ILIKE '%' || $4 || '%' OR r.reviewer ILIKE '%' || $4 || '%')
        ORDER BY r.client, r.sort, r.created_at DESC`,
      [seen, b.client || null, STATUSES.includes(b.status) ? b.status : null, text(b.search, 80)]);
  }),

  'reviews.save': def(['company', 'venue'], async (b, { user }) => {
    const f = fields(b);
    if (b.id) {
      await own(user, b.id);
      const r = await one('UPDATE reviews SET quote = $2, reviewer = $3, reviewer_role = $4, rating = $5, received_on = $6, updated_at = now() WHERE id = $1 RETURNING *',
        [b.id, f.quote, f.reviewer, f.reviewer_role, f.rating, f.received_on]);
      await audit(user, 'review.update', 'review', r.id, { client: r.client });
      return r;
    }
    required(b, 'client');
    if (!isSiteClient(b.client)) fail(400, 'Pick a client from the website list');
    if (!(await myClients(user)).includes(b.client)) fail(403, 'You can only add reviews for your own venue');
    const venue = user.role === 'venue'
      ? (await one('SELECT id FROM venues WHERE id = ANY($1::uuid[]) AND site_client = $2 LIMIT 1', [await venueScope(user), b.client]))?.id : null;
    const r = await insertReview(user, { ...f, client: b.client, venue_id: venue }, statusOnCreate(user.role));
    await audit(user, 'review.create', 'review', r.id, { client: r.client, status: r.status });
    return r;
  }),

  'reviews.setStatus': def(['company'], async (b, { user }) => {
    required(b, 'id', 'status');
    if (!STATUSES.includes(b.status)) fail(400, 'Unknown status');
    const publishing = b.status === 'published';
    const r = need(await one(
      `UPDATE reviews SET status = $2, updated_at = now(), approved_by = CASE WHEN $3 THEN $4::uuid ELSE approved_by END,
              approved_at = CASE WHEN $3 THEN now() ELSE approved_at END WHERE id = $1 RETURNING *`, [b.id, b.status, publishing, user.id]), 'Review not found');
    if (b.status !== 'pending') await q('DELETE FROM notifications WHERE ref = $1', [`review:${r.id}`]);
    await audit(user, publishing ? 'review.publish' : b.status === 'hidden' ? 'review.hide' : 'review.unpublish', 'review', r.id, { client: r.client });
    return r;
  }),

  'reviews.delete': def(['company', 'venue'], async (b, { user }) => {
    required(b, 'id');
    const r = await own(user, b.id);
    await q('DELETE FROM reviews WHERE id = $1', [r.id]);
    await q('DELETE FROM notifications WHERE ref = $1', [`review:${r.id}`]);
    await audit(user, 'review.delete', 'review', r.id, { client: r.client, quote: r.quote.slice(0, 120) });
    return { ok: true };
  }),

  'reviews.reorder': def(['company'], async (b, { user }) => {
    required(b, 'client');
    const ids = (b.ids || []).filter(Boolean);
    await q('UPDATE reviews r SET sort = x.i - 1 FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, i) WHERE r.id = x.id AND r.client = $1', [b.client, ids]);
    await audit(user, 'review.reorder', 'review', null, { client: b.client });
    return { ok: true };
  }),

  // The landing page: published reviews only, grouped by website client
  'reviews.public': pub(async () => mergePublic(
    groupPublic(await q("SELECT * FROM reviews WHERE status = 'published'")),
    await q(`SELECT * FROM (
               SELECT c.comment, c.rating, c.created_at, v.name AS venue_name, v.site_client,
                      ROW_NUMBER() OVER (PARTITION BY v.site_client ORDER BY c.created_at DESC) AS n
                 FROM venue_comments c JOIN venues v ON v.id = c.venue_id
                WHERE c.public AND c.tone = 'praise' AND v.active AND v.site_client IS NOT NULL AND btrim(c.comment) <> '') x
              WHERE n <= 10 ORDER BY created_at DESC`))),
};
