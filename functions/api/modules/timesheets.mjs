import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { roundHours } from '../lib/rates.mjs';
import { notify, managersFor, venueContacts } from '../lib/notify.mjs';
import { fmtDate } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { getSettings } from './settings.mjs';
import { guardSelf, markOwn, otherApprover, SELF_MSG } from '../lib/selfcheck.mjs';
import { MGR, def } from './_def.mjs';

const BASE_SQL = `
  SELECT t.*, a.officer_id, s.id AS shift_id, s.starts_at, s.ends_at, s.role, r.name AS role_name, s.venue_id, v.name AS venue_name,
         o.first_name || ' ' || o.last_name AS officer_name, ua.name AS approved_by_name, us.name AS signed_by_name,
         (t.statement_id IS NOT NULL OR t.invoice_id IS NOT NULL) AS locked
    FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
    JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role JOIN officers o ON o.id = a.officer_id
    LEFT JOIN users ua ON ua.id = t.approved_by LEFT JOIN users us ON us.id = t.signed_by`;

const markSelf = (user, rows) => markOwn(user, rows);

async function loadScoped(user, ids) {
  const scope = await venueScope(user);
  return q(`${BASE_SQL} WHERE t.id = ANY($1::uuid[]) AND ($2::uuid[] IS NULL OR s.venue_id = ANY($2))`, [ids, scope]);
}

export const actions = {
  'timesheets.list': def(['company', 'security', 'venue', 'officer'], async (b, { user }) => {
    const scope = await venueScope(user);
    const params = [user.role === 'officer' ? null : scope, b.status || null, b.from || null, b.to || null, b.venue_id || null,
      user.role === 'officer' ? user.officer_id : b.officer_id || null];
    const rows = await q(
      `${BASE_SQL}
        WHERE ($1::uuid[] IS NULL OR s.venue_id = ANY($1)) AND ($2::text IS NULL OR t.status = $2)
          AND ($3::timestamptz IS NULL OR s.starts_at >= $3) AND ($4::timestamptz IS NULL OR s.starts_at < $4)
          AND ($5::uuid IS NULL OR s.venue_id = $5) AND ($6::uuid IS NULL OR a.officer_id = $6)
          ${user.role === 'venue' ? "AND t.status IN ('approved','signed','disputed')" : ''}
        ORDER BY s.starts_at DESC LIMIT 500`, params);
    return markSelf(user, rows);
  }),

  'timesheets.approve': def(MGR, async (b, { user }) => {
    required(b, 'ids');
    let rows = (await loadScoped(user, b.ids)).filter((t) => t.status === 'pending' && !t.locked);
    // Your own hours go to another manager; only when nobody else could approve them are they approved here and flagged
    const own = rows.filter((t) => user.self_officer_id && t.officer_id === user.self_officer_id);
    const selfIds = [];
    for (const t of own) {
      if (await otherApprover(user, { venueId: t.venue_id })) {
        if (rows.length === own.length) fail(403, SELF_MSG, { self: true });
        rows = rows.filter((r) => r.id !== t.id);
      } else selfIds.push(t.id);
    }
    if (!rows.length) return { approved: 0 };
    await q("UPDATE timesheets SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now(), self_approved = (id = ANY($3::uuid[])) WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id), user.id, selfIds]);
    const s = await getSettings();
    for (const venueId of new Set(rows.map((r) => r.venue_id))) {
      const n = rows.filter((r) => r.venue_id === venueId).length;
      await notify(await venueContacts(venueId), {
        kind: 'timesheet', title: `${n} timesheet${n > 1 ? 's' : ''} ready to sign off`,
        body: `Please review within ${s.auto_signoff_days} days — after that they are approved automatically.`, link: '/venue/timesheets', email: true,
      });
    }
    await audit(user, 'timesheet.approve', 'timesheet', null, { ids: rows.map((r) => r.id), ...(selfIds.length ? { self_approved: selfIds } : {}) });
    return { approved: rows.length, skipped_own: own.length - selfIds.length };
  }),

  // Venue sign-off (company may sign on the venue's behalf)
  'timesheets.sign': def(['company', 'venue'], async (b, { user }) => {
    required(b, 'ids');
    const rows = (await loadScoped(user, b.ids)).filter((t) => t.status === 'approved');
    for (const t of rows) await guardSelf(user, t.officer_id, { venueId: t.venue_id });
    if (!rows.length) return { signed: 0 };
    await q("UPDATE timesheets SET status = 'signed', signed_by = $2, signed_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id), user.id]);
    await audit(user, 'timesheet.sign', 'timesheet', null, { ids: rows.map((r) => r.id) });
    return { signed: rows.length };
  }),

  'timesheets.dispute': def(['venue', 'company'], async (b, { user }) => {
    required(b, 'id', 'comment');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    await guardSelf(user, t.officer_id, { venueId: t.venue_id });
    if (!['approved', 'pending'].includes(t.status) || t.locked) fail(400, 'This timesheet can no longer be disputed');
    await q("UPDATE timesheets SET status = 'disputed', dispute_comment = $2, updated_at = now() WHERE id = $1", [t.id, b.comment]);
    await notify(await managersFor(t.venue_id), {
      kind: 'timesheet', severity: 'warning', title: 'Timesheet queried', body: `${t.venue_name}: ${t.officer_name} on ${fmtDate(t.starts_at)} — "${b.comment}"`, link: '/company/timesheets?status=disputed', email: true,
    });
    await audit(user, 'timesheet.dispute', 'timesheet', t.id, { comment: b.comment });
    return { ok: true };
  }),

  // Manager correction (also resolves disputes). Reason required, always audited.
  'timesheets.edit': def(MGR, async (b, { user }) => {
    required(b, 'id', 'reason');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    const self = await guardSelf(user, t.officer_id, { venueId: t.venue_id });
    if (t.locked) fail(400, 'On a statement or invoice — remove it from the draft first');
    const start = b.actual_start || t.actual_start;
    const end = b.actual_end || t.actual_end;
    const brk = b.break_minutes ?? t.break_minutes;
    if (new Date(end) <= new Date(start)) fail(400, 'End must be after start');
    const s = await getSettings();
    const hours = b.hours != null ? Number(b.hours) : roundHours(start, end, brk, s.rounding_minutes);
    const status = t.status === 'disputed' ? 'approved' : t.status === 'signed' ? 'approved' : t.status;
    await q(
      `UPDATE timesheets SET actual_start = $2, actual_end = $3, break_minutes = $4, hours = $5, status = $6, resolution = $7,
         flags = array_append(array_remove(flags, 'edited'), 'edited'), updated_at = now(), self_approved = self_approved OR $8 WHERE id = $1`,
      [t.id, start, end, brk, hours, status, b.reason, !!self.selfApproved]);
    if (t.status === 'disputed' || t.status === 'signed') {
      await notify(await venueContacts(t.venue_id), { kind: 'timesheet', title: 'Timesheet updated — please re-check', body: `${t.officer_name} on ${fmtDate(t.starts_at)}: ${b.reason}`, link: '/venue/timesheets', email: true });
    }
    await audit(user, 'timesheet.edit', 'timesheet', t.id, { from: { start: t.actual_start, end: t.actual_end, hours: t.hours }, to: { start, end, hours }, reason: b.reason, ...(self.selfApproved ? { self_approved: true } : {}) });
    return { ok: true };
  }),

  // Officers on a published shift with no clock record — for manager follow-up
  'timesheets.missing': def(MGR, async (_b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT a.id AS assignment_id, s.starts_at, s.ends_at, v.name AS venue_name, s.venue_id, o.first_name || ' ' || o.last_name AS officer_name
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
        WHERE s.status = 'published' AND a.status IN ('assigned','accepted') AND s.ends_at < now() AND s.ends_at > now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM timesheets t WHERE t.assignment_id = a.id)
          AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1))
        ORDER BY s.starts_at DESC`, [scope]);
  }),

  'timesheets.venueCheck': def(['venue'], async (b, { user }) => {
    await assertVenue(user, b.venue_id);
    return { ok: true };
  }),
};
