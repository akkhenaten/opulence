// Billing streams: one venue paying from more than one budget gets one invoice per budget.
// Every venue has a default stream; a stream can carry its own PO, recipients, bill-to, rates and the roles it claims.
import { one, q, tx, insert, update } from '../lib/db.mjs';
import { fail, required, need, pick } from '../lib/http.mjs';
import { assertVenue } from '../lib/scope.mjs';
import { audit } from '../lib/audit.mjs';
import { companyManagers, notify } from '../lib/notify.mjs';
import { def, CO } from './_def.mjs';
import { venueRate } from './money.mjs';
import { syncTimesheets, FEED_AGAIN } from './moneyFeed.mjs';
import { londonDate } from '../lib/time.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VENUE_FIELDS = ['name', 'po_ref', 'recipients', 'bill_to_name', 'bill_to_address'];
const COMPANY_FIELDS = [...VENUE_FIELDS, 'roles'];

/** The stream a new shift of this role goes to: an active stream claiming the role, otherwise the venue default. */
export async function defaultStreamFor(venueId, role, db = { one }) {
  const r = await db.one(
    `SELECT id FROM venue_streams WHERE venue_id = $1 AND status = 'active' AND ($2::text = ANY(roles) OR is_default)
      ORDER BY ($2::text = ANY(roles)) DESC, is_default DESC, created_at LIMIT 1`, [venueId, role || '']);
  return r?.id || null;
}

/** A stream id the caller picked, checked to be an active stream of this venue; else the default for the role. */
export async function streamFor(venueId, streamId, role, db = { one }) {
  if (!streamId) return defaultStreamFor(venueId, role, db);
  const s = await db.one("SELECT id FROM venue_streams WHERE id = $1 AND venue_id = $2 AND status = 'active'", [streamId, venueId]);
  if (!s) fail(400, 'Choose a billing stream of this venue');
  return s.id;
}

// Fields a user may set: venue users never set the roles a stream claims (that steers rota shifts and rates)
function cleanStream(b, user) {
  const f = pick(b, user.role === 'company' ? COMPANY_FIELDS : VENUE_FIELDS);
  if ('name' in f) {
    f.name = String(f.name || '').trim().slice(0, 80);
    if (!f.name) fail(400, 'Name the stream');
  }
  for (const k of ['po_ref', 'bill_to_name']) if (k in f) f[k] = String(f[k] || '').trim().slice(0, 120);
  if ('bill_to_address' in f) f.bill_to_address = String(f.bill_to_address || '').trim().slice(0, 400);
  if ('recipients' in f) {
    const list = (Array.isArray(f.recipients) ? f.recipients : String(f.recipients || '').split(/[,;\s]+/))
      .map((e) => String(e).trim().toLowerCase()).filter(Boolean);
    const bad = list.find((e) => !EMAIL.test(e));
    if (bad) fail(400, `Check the email address ${bad}`);
    f.recipients = [...new Set(list)].slice(0, 10);
  }
  if ('roles' in f) f.roles = [...new Set((Array.isArray(f.roles) ? f.roles : []).map(String).filter(Boolean))];
  return f;
}

/**
 * Create a stream inside a transaction (also used by the request-staff form's "+ New stream").
 * One made by a venue user works straight away but Opulence checks it before its first invoice goes out.
 */
export async function createStream(venueId, b, user, db = { one, q }) {
  const f = cleanStream(b, user);
  if (!f.name) fail(400, 'Name the stream');
  if (await db.one('SELECT 1 FROM venue_streams WHERE venue_id = $1 AND lower(name) = lower($2)', [venueId, f.name])) fail(409, 'This venue already has a stream with that name');
  const checked = user.role === 'company';
  if (f.roles?.length) await releaseRoles(venueId, null, f.roles, db);
  const s = await insert('venue_streams', { ...f, venue_id: venueId, created_by: user.id, checked_at: checked ? new Date() : null, checked_by: checked ? user.id : null }, db);
  return s;
}

// A role is claimed by one stream at a time
async function releaseRoles(venueId, keepId, roles, db) {
  await db.q('UPDATE venue_streams SET roles = array(SELECT unnest(roles) EXCEPT SELECT unnest($3::text[])) WHERE venue_id = $1 AND id IS DISTINCT FROM $2 AND roles && $3::text[]',
    [venueId, keepId, roles]);
}

/** Tell Opulence a venue added a stream that needs checking before it bills. */
export async function tellCompanyNewStream(s, user) {
  if (user.role === 'company') return;
  const v = await one('SELECT name FROM venues WHERE id = $1', [s.venue_id]);
  await notify(await companyManagers(), {
    kind: 'invoice', title: `${v?.name || 'A venue'} added a billing stream`,
    body: `"${s.name}" — check its PO, recipient and rates before its first invoice goes out.`,
    link: `/company/venues/${s.venue_id}?tab=streams`, ref: `stream:${s.id}`, dedupe: `stream-new:${s.id}`,
  });
}

/** Refuses a stream move once any of the shift's lines is on an issued invoice: that needs a credit note. */
export async function assertStreamMovable(shiftId, db = { one }) {
  const inv = await db.one(
    `SELECT i.number FROM shift_assignments a JOIN timesheets t ON t.assignment_id = a.id JOIN invoices i ON i.id = t.invoice_id
      WHERE a.shift_id = $1 AND i.status <> 'draft' ORDER BY i.issue_date LIMIT 1`, [shiftId]);
  if (inv) fail(409, `Invoiced on ${inv.number || 'an issued invoice'} — raise a credit note to move it`);
}

/**
 * After a shift moved stream: unbilled approved/signed timesheets take the new stream's charge rate (unless someone set
 * one by hand), and the feed moves their lines onto the new stream's draft.
 */
export async function afterStreamMove(shift) {
  const ts = await q(
    `SELECT t.id, t.status, t.charge_rate_set FROM shift_assignments a JOIN timesheets t ON t.assignment_id = a.id
      WHERE a.shift_id = $1 AND NOT timesheet_billed(NULL, t.invoice_id)`, [shift.id]);
  if (!ts.length) return;
  const vr = await venueRate(shift.venue_id, shift.role, londonDate(shift.starts_at), undefined, shift.stream_id);
  const reprice = ts.filter((t) => !t.charge_rate_set && ['approved', 'signed'].includes(t.status)).map((t) => t.id);
  if (vr && reprice.length) await q('UPDATE timesheets SET charge_rate = $2 WHERE id = ANY($1::uuid[])', [reprice, vr.rate]);
  await q(`UPDATE timesheets SET ${FEED_AGAIN} WHERE id = ANY($1::uuid[])`, [ts.map((t) => t.id)]);
  try { await syncTimesheets(ts.map((t) => t.id)); } catch (e) { console.warn('[streams] feed sync later:', e.message); }
}

async function loadStream(id, user) {
  const s = need(await one('SELECT * FROM venue_streams WHERE id = $1', [id]), 'Stream not found');
  await assertVenue(user, s.venue_id);
  return s;
}

export const actions = {
  'streams.list': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const rows = await q(
      `SELECT s.*, u.name AS checked_by_name,
              (SELECT count(*)::int FROM shifts sh WHERE sh.stream_id = s.id AND sh.status <> 'cancelled') AS shifts,
              (SELECT count(*)::int FROM invoices i WHERE i.stream_id = s.id AND i.status <> 'void') AS invoices
         FROM venue_streams s LEFT JOIN users u ON u.id = s.checked_by
        WHERE s.venue_id = $1 ORDER BY s.is_default DESC, s.status, lower(s.name)`, [b.venue_id]);
    return rows.map((s) => ({ ...s, checked: !!s.checked_at }));
  }),

  'streams.save': def(['company', 'venue'], async (b, { user }) => {
    if (!b.id) {
      required(b, 'venue_id');
      await assertVenue(user, b.venue_id);
      const s = await tx((db) => createStream(b.venue_id, b, user, db));
      await audit(user, 'stream.create', 'venue', s.venue_id, s);
      await tellCompanyNewStream(s, user);
      return s;
    }
    const s = await loadStream(b.id, user);
    const f = cleanStream(b, user);
    if (f.name && f.name.toLowerCase() !== s.name.toLowerCase()
      && await one('SELECT 1 FROM venue_streams WHERE venue_id = $1 AND lower(name) = lower($2) AND id <> $3', [s.venue_id, f.name, s.id])) fail(409, 'This venue already has a stream with that name');
    const r = await tx(async (db) => {
      if (f.roles?.length) await releaseRoles(s.venue_id, s.id, f.roles, db);
      return update('venue_streams', s.id, f, db);
    });
    await audit(user, 'stream.update', 'venue', s.venue_id, { id: s.id, ...f });
    return r;
  }),

  // Opulence has looked over the PO, recipients and rates; the stream may now be invoiced
  'streams.check': def(CO, async (b, { user }) => {
    const s = await loadStream(b.id, user);
    const r = await one('UPDATE venue_streams SET checked_at = now(), checked_by = $2 WHERE id = $1 RETURNING *', [s.id, user.id]);
    await q("UPDATE notifications SET read_at = now() WHERE ref = $1 AND read_at IS NULL", [`stream:${s.id}`]);
    await audit(user, 'stream.check', 'venue', s.venue_id, { id: s.id, name: s.name });
    return r;
  }),

  'streams.setDefault': def(CO, async (b, { user }) => {
    const s = await loadStream(b.id, user);
    if (s.status !== 'active') fail(400, 'Restore the stream before making it the default');
    await tx(async (db) => {
      await db.q('UPDATE venue_streams SET is_default = false WHERE venue_id = $1 AND is_default', [s.venue_id]);
      await db.q('UPDATE venue_streams SET is_default = true WHERE id = $1', [s.id]);
    });
    await audit(user, 'stream.default', 'venue', s.venue_id, { id: s.id, name: s.name });
    return { ok: true };
  }),

  // Archived streams keep their shifts and invoices; new work can't be put on them
  'streams.archive': def(CO, async (b, { user }) => {
    const s = await loadStream(b.id, user);
    if (s.is_default) fail(400, 'Make another stream the default before archiving this one');
    const live = await one(
      `SELECT count(*)::int AS n FROM shifts WHERE stream_id = $1 AND status <> 'cancelled' AND starts_at > now()`, [s.id]);
    if (live.n) fail(400, `${live.n} upcoming shift${live.n === 1 ? ' is' : 's are'} on this stream — move ${live.n === 1 ? 'it' : 'them'} first`);
    const r = await one("UPDATE venue_streams SET status = 'archived', roles = '{}' WHERE id = $1 RETURNING *", [s.id]);
    await audit(user, 'stream.archive', 'venue', s.venue_id, { id: s.id, name: s.name });
    return r;
  }),

  'streams.unarchive': def(CO, async (b, { user }) => {
    const s = await loadStream(b.id, user);
    const r = await one("UPDATE venue_streams SET status = 'active' WHERE id = $1 RETURNING *", [s.id]);
    await audit(user, 'stream.unarchive', 'venue', s.venue_id, { id: s.id, name: s.name });
    return r;
  }),
};

/** SQL for a shift's stream name, only when its venue bills more than one stream (one-stream venues show nothing new) */
export const streamNameSql = (shift = 's') => `(SELECT CASE WHEN (SELECT count(*) FROM venue_streams x WHERE x.venue_id = ${shift}.venue_id AND x.status = 'active') > 1
  THEN vs.name END FROM venue_streams vs WHERE vs.id = ${shift}.stream_id)`;
