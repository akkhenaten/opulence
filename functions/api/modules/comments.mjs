// Venue feedback: about a member of staff, a shift, the service in general or anything else.
// The office sees every venue it covers; a venue sees its own feedback and the office's replies. Officers never see it.
import { one, q, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { notify, companyManagers, securityFor, venueContacts, withdraw } from '../lib/notify.mjs';
import { fmtDate, fmtTime } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { CO, MGR, def } from './_def.mjs';
import { createItem, logActivity } from './ops.mjs';
import { officerName, officerShort, userName } from '../lib/names.mjs';

export const ABOUT = ['staff', 'shift', 'service', 'other'];
export const TONES = ['praise', 'suggestion', 'complaint'];
const ABOUT_LABEL = { staff: 'staff', shift: 'a shift', service: 'the service', other: 'something else' };
const ACTIVE = "('assigned','accepted')";
const when = (sh) => `${fmtDate(sh.starts_at)} ${fmtTime(sh.starts_at)}–${fmtTime(sh.ends_at)}`;

/** Checked and trimmed feedback, or throws with a message the venue can act on. */
export function checkComment(b) {
  if (!ABOUT.includes(b.about)) fail(400, 'Choose what the feedback is about');
  if (!TONES.includes(b.tone)) fail(400, 'Choose praise, suggestion or complaint');
  const rating = b.rating == null || b.rating === '' ? null : Number(b.rating);
  if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) fail(400, 'Ratings are 1 to 5 stars');
  if (rating == null && b.about !== 'other') fail(400, 'Give a star rating');
  const comment = String(b.comment || '').trim();
  if (comment.length > 2000) fail(400, 'Keep the comment under 2,000 characters');
  if (!comment && rating == null) fail(400, 'Write a comment or give a rating');
  if (b.about === 'staff' && !b.officer_id) fail(400, 'Choose who the feedback is about');
  if (b.about === 'shift' && !b.shift_id) fail(400, 'Choose the shift');
  return { about: b.about, tone: b.tone, rating, comment };
}

/** Why this feedback can't go on the venue's website tile, or null when it can. */
export function canPublish(c) {
  if (c.tone !== 'praise') return 'Only praise can go on the website';
  if (!String(c.comment || '').trim()) return 'Add a comment first';
  return null;
}

/** Complaints and low ratings go to the Orb inbox for a follow-up. */
export const needsFollowUp = ({ tone, rating }) => tone === 'complaint' || (rating != null && rating <= 2);

// Shifts that have started at this venue in the last 30 days, with who was on
async function recentShifts(venueId, short) {
  const rows = await q(
    `SELECT s.id, s.starts_at, s.ends_at, r.name AS role_name,
            COALESCE(json_agg(json_build_object('officer_id', o.id, 'name', ${short ? officerShort('o') : officerName('o')}) ORDER BY a.is_lead DESC, o.first_name) FILTER (WHERE o.id IS NOT NULL), '[]') AS officers
       FROM shifts s JOIN roles r ON r.code = s.role
       LEFT JOIN shift_assignments a ON a.shift_id = s.id AND a.status IN ${ACTIVE}
       LEFT JOIN officers o ON o.id = a.officer_id
      WHERE s.venue_id = $1 AND s.status = 'published' AND s.starts_at < now() AND s.starts_at > now() - interval '30 days'
      GROUP BY s.id, r.name ORDER BY s.starts_at DESC LIMIT 40`, [venueId]);
  return rows;
}

/** Officer's rating also counts towards their venue rating, against the shift it was about or their latest shift here. */
async function rateOfficer({ venueId, officerId, shiftId, rating, note, userId }) {
  const sh = await one(
    `SELECT s.id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
      WHERE a.officer_id = $1 AND s.venue_id = $2 AND s.status = 'published' AND s.starts_at < now() AND s.starts_at > now() - interval '30 days'
        AND a.status IN ${ACTIVE} AND ($3::uuid IS NULL OR s.id = $3)
      ORDER BY s.starts_at DESC LIMIT 1`, [officerId, venueId, shiftId || null]);
  if (!sh) return null;
  const f = await one(
    `INSERT INTO venue_feedback (shift_id, venue_id, officer_id, rating, note, answered_at, answered_by, adhoc) VALUES ($1,$2,$3,$4,$5,now(),$6,true)
     ON CONFLICT (shift_id, officer_id) DO UPDATE SET rating = EXCLUDED.rating, note = EXCLUDED.note, answered_at = now(), answered_by = EXCLUDED.answered_by
     RETURNING id`, [sh.id, venueId, officerId, rating, note.slice(0, 1000), userId]);
  return f.id;
}

const LIST_SQL = (short) => `
  SELECT c.*, v.name AS venue_name, v.site_client, v.on_website, rv.status AS review_status, ${short ? officerShort('o') : officerName('o')} AS officer_name,
         s.starts_at AS shift_starts_at, s.ends_at AS shift_ends_at, ${userName('cu')} AS created_by_name, ${userName('ru')} AS replied_by_name
    FROM venue_comments c JOIN venues v ON v.id = c.venue_id
    LEFT JOIN officers o ON o.id = c.officer_id LEFT JOIN shifts s ON s.id = c.shift_id
    LEFT JOIN users cu ON cu.id = c.created_by LEFT JOIN users ru ON ru.id = c.replied_by
    LEFT JOIN reviews rv ON rv.id = c.review_id`;

export const actions = {
  /** Venues and shifts to choose from, for the venue itself or a manager logging it on the venue's behalf. */
  'comments.options': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    const venues = await q(`SELECT id, name FROM venues WHERE ($1::uuid[] IS NULL OR id = ANY($1)) AND active ORDER BY name`, [scope]);
    const venueId = b.venue_id || (venues.length === 1 ? venues[0].id : null);
    if (!venueId) return { venues, venue_id: null, shifts: [], officers: [] };
    await assertVenue(user, venueId);
    // A venue that has since closed can still be picked when it was asked for by name (its page, a filter link)
    if (!venues.some((v) => v.id === venueId)) {
      const v = await one('SELECT id, name FROM venues WHERE id = $1', [venueId]);
      if (v) venues.push(v);
    }
    const shifts = await recentShifts(venueId, user.role === 'venue');
    const seen = new Map();
    for (const s of shifts) for (const o of s.officers) if (!seen.has(o.officer_id)) seen.set(o.officer_id, { ...o, last_shift_at: s.starts_at });
    return { venues, venue_id: venueId, shifts, officers: [...seen.values()] };
  }),

  'comments.save': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const c = checkComment(b);
    const venue = need(await one('SELECT id, name FROM venues WHERE id = $1', [b.venue_id]), 'Venue not found');
    let sh = null;
    if (b.shift_id) {
      sh = need(await one(`SELECT id, venue_id, starts_at, ends_at FROM shifts WHERE id = $1 AND status = 'published' AND starts_at < now()`, [b.shift_id]), 'Shift not found');
      if (sh.venue_id !== venue.id) fail(400, 'That shift was not at this venue');
    }
    let officerId = null;
    if (c.about === 'staff' || b.officer_id) {
      officerId = b.officer_id;
      const worked = await one(
        `SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
          WHERE a.officer_id = $1 AND s.venue_id = $2 AND s.status = 'published' AND a.status IN ${ACTIVE} AND s.starts_at < now() AND s.starts_at > now() - interval '30 days'
            AND ($3::uuid IS NULL OR s.id = $3)`, [officerId, venue.id, sh?.id || null]);
      if (!worked) fail(400, sh ? 'That officer was not on this shift' : 'That officer has not worked here in the last 30 days');
    }
    const feedbackId = c.about === 'staff' && c.rating != null
      ? await rateOfficer({ venueId: venue.id, officerId, shiftId: sh?.id, rating: c.rating, note: c.comment, userId: user.id }) : null;
    const row = await insert('venue_comments', {
      venue_id: venue.id, about: c.about, officer_id: officerId, shift_id: sh?.id || null, rating: c.rating, tone: c.tone, comment: c.comment,
      feedback_id: feedbackId, created_by: user.id, on_behalf: user.role !== 'venue',
    });
    const o = officerId ? await one(`SELECT ${officerName('o')} AS name FROM officers o WHERE o.id = $1`, [officerId]) : null;
    const subject = o ? o.name : sh ? `the shift ${when(sh)}` : ABOUT_LABEL[c.about];
    const stars = c.rating != null ? ` (${c.rating}/5)` : '';
    const title = `${venue.name}: ${c.tone} about ${subject}${stars}`;
    if (needsFollowUp(c)) {
      await createItem({ kind: 'feedback', venue_id: venue.id, shift_id: sh?.id || null, officer_id: officerId, severity: 'warning',
        title: `Feedback: ${title}`, reason: c.comment ? `"${c.comment}" — ${user.name}` : `Rated ${c.rating}/5 by ${user.name}.`,
        payload: { comment_id: row.id, about: c.about, tone: c.tone, rating: c.rating, note: c.comment, shift: sh ? when(sh) : null }, dedupe: `cmt:${row.id}` });
    } else {
      const n = { kind: 'feedback', title: `Feedback: ${title}`, body: c.comment.slice(0, 200), dedupe: `cmt:${row.id}`, ref: `cmt:${row.id}` };
      await notify(await companyManagers(), { ...n, link: '/company/feedback' });
      await notify(await securityFor(venue.id), { ...n, link: '/security/feedback' });
    }
    await logActivity('feedback', `${venue.name} left ${c.tone} about ${subject}${stars}`, { venue_id: venue.id });
    await audit(user, 'comments.save', 'venue_comment', row.id, { venue_id: venue.id, about: c.about, tone: c.tone, rating: c.rating });
    return row;
  }),

  'comments.list': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    const venue = user.role === 'venue';
    return q(
      `${LIST_SQL(venue)}
        WHERE ($1::uuid[] IS NULL OR c.venue_id = ANY($1)) AND ($2::uuid IS NULL OR c.venue_id = $2) AND ($3::text IS NULL OR c.about = $3)
          AND ($4::text IS NULL OR c.tone = $4) AND ($5::text IS NULL OR c.status = $5) AND ($6::uuid IS NULL OR c.officer_id = $6)
          AND ($7::date IS NULL OR c.created_at >= $7::date) AND ($8::date IS NULL OR c.created_at < $8::date + 1)
        ORDER BY c.created_at DESC LIMIT 200`,
      [scope, b.venue_id || null, b.about || null, b.tone || null, b.status || null, venue ? null : b.officer_id || null, b.from || null, b.to || null]);
  }),

  /** The office answers and, by default, closes the feedback; staff feedback can go on the officer's HR notes. */
  'comments.reply': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const c = need(await one('SELECT * FROM venue_comments WHERE id = $1', [b.id]), 'Feedback not found');
    await assertVenue(user, c.venue_id);
    const reply = String(b.reply || '').trim().slice(0, 2000);
    const status = b.resolve === false ? 'open' : 'resolved';
    if (!reply && status === 'open') fail(400, 'Write a reply');
    const row = await one(
      `UPDATE venue_comments SET reply = CASE WHEN $2 = '' THEN reply ELSE $2 END, status = $3,
              replied_by = CASE WHEN $2 = '' THEN replied_by ELSE $4 END, replied_at = CASE WHEN $2 = '' THEN replied_at ELSE now() END
        WHERE id = $1 RETURNING *`, [c.id, reply, status, user.id]);
    if (b.hr_note && c.officer_id) {
      const v = await one('SELECT name FROM venues WHERE id = $1', [c.venue_id]);
      await insert('hr_notes', { officer_id: c.officer_id, kind: 'venue_feedback', title: `${v.name}: ${c.tone}`, body: `${c.comment}${c.rating != null ? ` (rating ${c.rating}/5)` : ''}`, author_id: user.id });
    }
    // The Orb card for this feedback is dealt with here too
    const items = await q(
      `UPDATE ops_items SET status = 'done', decided_by = $2, decided_at = now(), result = '{"reviewed":true}'
        WHERE kind = 'feedback' AND status = 'pending' AND payload->>'comment_id' = $1 RETURNING id`, [c.id, user.id]);
    if (items.length) await withdraw({ items: items.map((i) => i.id) });
    if (reply) {
      await notify(await venueContacts(c.venue_id), { kind: 'feedback', title: 'Reply to your feedback', body: reply.slice(0, 200), link: '/venue/feedback', dedupe: `cmt-reply:${c.id}:${Date.now()}` });
    }
    await audit(user, 'comments.reply', 'venue_comment', c.id, { status, replied: !!reply, hr_note: !!b.hr_note });
    return row;
  }),

  /** The office ticks praise onto the venue's website tile, or takes it down again. */
  'comments.setPublic': def(CO, async (b, { user }) => {
    required(b, 'id');
    const c = need(await one('SELECT * FROM venue_comments WHERE id = $1', [b.id]), 'Feedback not found');
    await assertVenue(user, c.venue_id);
    const on = !!b.public;
    if (on) {
      const why = canPublish(c);
      if (why) fail(400, why);
    }
    await q(`UPDATE venue_comments SET public = $2, published_by = CASE WHEN $2 THEN $3::uuid END, published_at = CASE WHEN $2 THEN now() END
              WHERE id = $1`, [c.id, on, user.id]);
    await audit(user, on ? 'comments.publish' : 'comments.unpublish', 'venue_comment', c.id, { venue_id: c.venue_id });
    return { ok: true, public: on };
  }),
};

// "Don't send them again": the venue asks, the company decides on an Orb card with the bar pre-ticked.
// Only for officers who worked at one of this venue login's venues in the last 90 days; nothing about the officer comes back.
actions['feedback.dontSend'] = def(['venue'], async (b, { user }) => {
  required(b, 'officer_id', 'venue_id');
  await assertVenue(user, b.venue_id);
  const reason = String(b.reason || '').trim().slice(0, 1000);
  const v = need(await one('SELECT id, name FROM venues WHERE id = $1', [b.venue_id]), 'Venue not found');
  const worked = await one(
    `SELECT s.id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
      WHERE a.officer_id = $1 AND s.venue_id = $2 AND a.status IN ${ACTIVE} AND s.starts_at < now() AND s.starts_at > now() - interval '90 days'
      ORDER BY s.starts_at DESC LIMIT 1`, [b.officer_id, v.id]);
  if (!worked) fail(400, 'That officer has not worked here recently');
  const o = await one(`SELECT ${officerName('o')} AS name FROM officers o WHERE o.id = $1`, [b.officer_id]);
  await createItem({ kind: 'feedback', venue_id: v.id, shift_id: worked.id, officer_id: b.officer_id, severity: 'warning',
    title: `Feedback: ${v.name} asks not to have ${o.name} back`, reason: reason ? `"${reason}" — ${user.name}` : `Asked by ${user.name}.`,
    payload: { ban_asked: true, note: reason || 'Asked not to have them back' }, dedupe: `dontsend:${v.id}:${b.officer_id}` });
  await logActivity('feedback', `${v.name} asked not to have ${o.name} back`, { venue_id: v.id });
  await audit(user, 'feedback.dont_send', 'officer', b.officer_id, { venue_id: v.id });
  return { ok: true };
});
