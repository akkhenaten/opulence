import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { roundHours, bandFractions, money } from '../lib/rates.mjs';
import { notify, managersFor, venueContacts, officerUser } from '../lib/notify.mjs';
import { fmtDate, londonDate } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { getSettings } from './settings.mjs';
import { guardSelf, markOwn, otherApprover, SELF_MSG } from '../lib/selfcheck.mjs';
import { CO, MGR, def } from './_def.mjs';
import { officerName, userName } from '../lib/names.mjs';
import { officerRate, venueRate, bankHolidaySet, lastClosedPeriod } from './money.mjs';
import { buildTimesheet } from './clock.mjs';
import {
  rowState, redactMoney, moneyFor, missingRates, payAmount, chargeAmount, totals, pickOfficerRate, pickVenueRate, NEEDS_REVIEW,
} from '../lib/timesheetState.mjs';

const CANCELLED = `(a.status NOT IN ('assigned','accepted') OR s.status = 'cancelled')`;

const BASE_SQL = `
  SELECT t.*, a.officer_id, s.id AS shift_id, s.starts_at, s.ends_at, s.role, r.name AS role_name, s.venue_id, v.name AS venue_name,
         ${officerName('o')} AS officer_name, ${userName('ua')} AS approved_by_name, ${userName('us')} AS signed_by_name,
         (t.statement_id IS NOT NULL OR t.invoice_id IS NOT NULL) AS locked, ${CANCELLED} AS cancelled
    FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
    JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role JOIN officers o ON o.id = a.officer_id
    LEFT JOIN users ua ON ua.id = t.approved_by LEFT JOIN users us ON us.id = t.signed_by`;

const markSelf = (user, rows) => markOwn(user, rows);

async function loadScoped(user, ids) {
  const scope = await venueScope(user);
  return q(`${BASE_SQL} WHERE t.id = ANY($1::uuid[]) AND ($2::uuid[] IS NULL OR s.venue_id = ANY($2))`, [ids, scope]);
}

/** The rates a timesheet is approved at: an override already on it, else the rate cards on the shift's date */
async function ratesFor(t) {
  const date = londonDate(t.starts_at);
  const charge = t.charge_rate != null ? Number(t.charge_rate) : (await venueRate(t.venue_id, t.role, date))?.rate ?? null;
  const pay = t.pay_rate != null ? Number(t.pay_rate) : await officerRate(t.officer_id, t.role, t.venue_id, date);
  return { charge_rate: charge == null ? null : Number(charge), pay_rate: pay };
}

const rateMsg = (user, blocked) => `${user.role === 'company' ? 'Set a rate' : 'Ask a company manager to set a rate'} for ${blocked.map((b) => `${b.officer_name} (${b.missing.join(' and ')})`).join(', ')} first`;

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

  // The week table: every accepted officer on a published shift (worked, live, upcoming or a no-show), plus anything with a timesheet
  'timesheets.week': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'from', 'to');
    const scope = await venueScope(user);
    const rows = await q(
      `SELECT a.id AS assignment_id, a.officer_id, a.status AS assignment_status, s.id AS shift_id, s.starts_at, s.ends_at, s.break_minutes AS planned_break,
              s.role, r.name AS role_name, s.venue_id, v.name AS venue_name, ${officerName('o')} AS officer_name, o.photo_key,
              t.id, t.status, t.actual_start, t.actual_end, t.break_minutes, t.hours, t.flags, t.charge_rate, t.pay_rate, t.charge_rate_set, t.pay_rate_set,
              t.rate_note, t.decline_reason, t.dispute_comment, t.resolution, t.approved_at, t.signed_at, t.auto_signed, t.self_approved, t.queried_at,
              t.statement_id, t.invoice_id, (t.statement_id IS NOT NULL OR t.invoice_id IS NOT NULL) AS locked, ${CANCELLED} AS cancelled,
              ${userName('ua')} AS approved_by_name, ${userName('us')} AS signed_by_name, ${userName('ud')} AS declined_by_name, ${userName('uq')} AS queried_by_name,
              ci.ts AS clock_in, ci.venue_code AS in_code, ci.status AS in_status, co.ts AS clock_out
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
         JOIN roles r ON r.code = s.role JOIN officers o ON o.id = a.officer_id
         LEFT JOIN timesheets t ON t.assignment_id = a.id
         LEFT JOIN users ua ON ua.id = t.approved_by LEFT JOIN users us ON us.id = t.signed_by
         LEFT JOIN users ud ON ud.id = t.declined_by LEFT JOIN users uq ON uq.id = t.queried_by
         LEFT JOIN LATERAL (SELECT ts, venue_code, status FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in'
                              AND ce.status IN ('ok','approved','manual','exception') ORDER BY ts LIMIT 1) ci ON true
         LEFT JOIN LATERAL (SELECT ts FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'out'
                              AND ce.status IN ('ok','approved','manual','exception') ORDER BY ts DESC LIMIT 1) co ON true
        WHERE s.starts_at >= $1 AND s.starts_at < $2
          AND (t.id IS NOT NULL OR (a.status = 'accepted' AND s.status = 'published'))
          AND ($3::uuid[] IS NULL OR s.venue_id = ANY($3)) AND ($4::uuid IS NULL OR s.venue_id = $4) AND ($5::uuid IS NULL OR a.officer_id = $5)
        ORDER BY s.starts_at, v.name, officer_name`,
      [b.from, b.to, scope, b.venue_id || null, b.officer_id || null]);

    // Rate cards and bank holidays once for the whole week, resolved in memory the same way money.mjs does per row
    const s = await getSettings();
    const bh = await bankHolidaySet();
    const [orates, vrates] = await Promise.all([
      q('SELECT officer_id, role, venue_id, rate, effective_from FROM officer_rates WHERE officer_id = ANY($1::uuid[])', [[...new Set(rows.map((r) => r.officer_id))]]),
      q('SELECT * FROM venue_rates WHERE venue_id = ANY($1::uuid[])', [[...new Set(rows.map((r) => r.venue_id))]]),
    ]);
    const now = Date.now();
    const photos = {};
    for (const r of rows) if (r.photo_key && !(r.officer_id in photos)) photos[r.officer_id] = await downloadUrl(r.photo_key);
    const closed = await lastClosedPeriod();

    const shaped = rows.map(({ photo_key: _p, ...r }) => {
      const state = rowState({ status: r.status, locked: r.locked, cancelled: r.cancelled, has_in: !!r.clock_in, ends_at: r.ends_at }, now);
      const date = londonDate(r.starts_at);
      const vr = pickVenueRate(vrates, { venue_id: r.venue_id, role: r.role, date });
      const charge_rate = r.charge_rate != null ? Number(r.charge_rate) : vr ? Number(vr.rate) : null;
      const pay_rate = r.pay_rate != null ? Number(r.pay_rate) : pickOfficerRate(orates, { officer_id: r.officer_id, role: r.role, venue_id: r.venue_id, date });
      let charge_total = null;
      let pay_total = null;
      if (r.id && r.actual_start && r.actual_end) {
        const fr = bandFractions(r.actual_start, r.actual_end, s, bh);
        charge_total = chargeAmount(r.hours, fr, charge_rate, vr).amount;
        pay_total = payAmount(r.hours, fr, pay_rate, s);
      }
      return {
        ...r, state, date, photo_url: photos[r.officer_id] || null, how: r.in_status === 'manual' ? 'manual' : r.in_code || (r.clock_in ? 'gps' : null),
        charge_rate, pay_rate, charge_total, pay_total, charge_estimate: r.charge_rate == null, pay_estimate: r.pay_rate == null,
        unpaid_late: state === 'signed' && !r.statement_id && closed && date <= closed.end,
      };
    });

    const health = {
      awaiting: shaped.filter((r) => r.state === 'awaiting').length,
      queried: shaped.filter((r) => r.state === 'queried').length,
      no_clock_in: shaped.filter((r) => r.state === 'no_clock_in').length,
      cancelled: shaped.filter((r) => r.state === 'cancelled').length,
      no_rate: shaped.filter((r) => ['approved', 'signed', 'awaiting'].includes(r.state) && missingRates(r).length).length,
      unpaid_late: shaped.filter((r) => r.unpaid_late).length,
      to_review: shaped.filter((r) => NEEDS_REVIEW.has(r.state)).length,
    };
    const see = moneyFor(user);
    // Health counts about money only for those who see it; venues only ever see what they would sign
    if (!see.charge || !see.pay) delete health.no_rate;
    if (user.role === 'venue') { delete health.unpaid_late; delete health.no_clock_in; delete health.cancelled; }
    const days = {};
    for (const r of shaped) (days[r.date] ||= []).push(r);
    const dayTotals = Object.fromEntries(Object.entries(days).map(([d, list]) => [d, totals(list)]));
    const out = (await markSelf(user, shaped)).map((r) => redactMoney(r, user));
    const wk = totals(shaped);
    if (!see.charge) delete wk.charge;
    if (!see.pay) delete wk.pay;
    for (const t of Object.values(dayTotals)) { if (!see.charge) delete t.charge; if (!see.pay) delete t.pay; }
    return { rows: out, days: dayTotals, week: wk, health, see };
  }),

  'timesheets.approve': def(MGR, async (b, { user }) => {
    required(b, 'ids');
    let rows = (await loadScoped(user, b.ids)).filter((t) => t.status === 'pending' && !t.locked && !t.cancelled);
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
    // Rates are fixed here: pay runs and invoices use exactly these. No rate, no approval (never a £0 line later).
    const ready = [];
    const blocked = [];
    for (const t of rows) {
      const rates = await ratesFor(t);
      const missing = missingRates(rates);
      if (missing.length) blocked.push({ id: t.id, officer_name: t.officer_name, missing });
      else ready.push({ ...t, ...rates });
    }
    if (!ready.length) fail(400, rateMsg(user, blocked), { blocked });
    await q(
      `UPDATE timesheets t SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now(), self_approved = (t.id = ANY($3::uuid[])),
              charge_rate = x.c, pay_rate = x.p
         FROM unnest($1::uuid[], $4::numeric[], $5::numeric[]) AS x(id, c, p) WHERE t.id = x.id`,
      [ready.map((r) => r.id), user.id, selfIds, ready.map((r) => r.charge_rate), ready.map((r) => r.pay_rate)]);
    const s = await getSettings();
    for (const venueId of new Set(ready.map((r) => r.venue_id))) {
      const n = ready.filter((r) => r.venue_id === venueId).length;
      await notify(await venueContacts(venueId), {
        kind: 'timesheet', title: `${n} timesheet${n > 1 ? 's' : ''} ready to sign off`,
        body: `Please review within ${s.auto_signoff_days} days — after that they are approved automatically.`, link: '/venue/timesheets', email: true,
      });
    }
    for (const r of ready) {
      await audit(user, 'timesheet.approve', 'timesheet', r.id, { charge_rate: r.charge_rate, pay_rate: r.pay_rate, ...(selfIds.includes(r.id) ? { self_approved: true } : {}) });
    }
    return { approved: ready.length, skipped_own: own.length - selfIds.length, blocked, ...(blocked.length ? { message: rateMsg(user, blocked) } : {}) };
  }),

  // Venue sign-off (company may sign on the venue's behalf)
  'timesheets.sign': def(['company', 'venue'], async (b, { user }) => {
    required(b, 'ids');
    const rows = (await loadScoped(user, b.ids)).filter((t) => t.status === 'approved' && !t.cancelled);
    for (const t of rows) await guardSelf(user, t.officer_id, { venueId: t.venue_id });
    if (!rows.length) return { signed: 0 };
    await q("UPDATE timesheets SET status = 'signed', signed_by = $2, signed_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])", [rows.map((r) => r.id), user.id]);
    for (const r of rows) await audit(user, 'timesheet.sign', 'timesheet', r.id);
    return { signed: rows.length };
  }),

  // Query: needs a look before it can go on. Managers query pending or approved; venues query what they were asked to sign.
  'timesheets.dispute': def(['venue', 'company', 'security'], async (b, { user }) => {
    required(b, 'id', 'comment');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    await guardSelf(user, t.officer_id, { venueId: t.venue_id });
    const allowed = user.role === 'venue' ? ['approved'] : ['approved', 'pending'];
    if (!allowed.includes(t.status) || t.locked) fail(400, 'This timesheet can no longer be queried');
    await q("UPDATE timesheets SET status = 'disputed', dispute_comment = $2, queried_by = $3, queried_at = now(), updated_at = now() WHERE id = $1", [t.id, b.comment, user.id]);
    const msg = { kind: 'timesheet', severity: 'warning', title: 'Timesheet queried', body: `${t.venue_name}: ${t.officer_name} on ${fmtDate(t.starts_at)} — "${b.comment}"` };
    if (user.role === 'venue') await notify(await managersFor(t.venue_id), { ...msg, link: '/company/timesheets', email: true });
    await notify(await officerUser(t.officer_id), { ...msg, body: `Your shift at ${t.venue_name} on ${fmtDate(t.starts_at)} is being checked — "${b.comment}"`, link: '/officer/shifts' });
    await audit(user, 'timesheet.dispute', 'timesheet', t.id, { comment: b.comment });
    return { ok: true };
  }),

  // Answer a query without changing the times: back to awaiting review (Edit answers it with a correction)
  'timesheets.answer': def(MGR, async (b, { user }) => {
    required(b, 'id', 'reply');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    if (t.status !== 'disputed' || t.locked) fail(400, 'Only a queried timesheet can be answered');
    await q("UPDATE timesheets SET status = 'pending', resolution = $2, updated_at = now() WHERE id = $1", [t.id, b.reply]);
    if (t.queried_by && t.queried_by !== user.id) await notify([t.queried_by], { kind: 'timesheet', title: 'Your timesheet query was answered', body: `${t.officer_name} on ${fmtDate(t.starts_at)}: ${b.reply}`, link: user.role === 'venue' ? '/venue/timesheets' : '' });
    await audit(user, 'timesheet.answer', 'timesheet', t.id, { query: t.dispute_comment, reply: b.reply });
    return { ok: true };
  }),

  // Decline: not worked — no pay and no charge. A no-show (no timesheet yet) gets a declined zero-hour row so it is closed, not lost.
  'timesheets.decline': def(MGR, async (b, { user }) => {
    required(b, 'reason');
    const ids = b.ids || [];
    const asgIds = b.assignment_ids || [];
    if (!ids.length && !asgIds.length) fail(400, 'Choose what to decline');
    const rows = ids.length ? (await loadScoped(user, ids)).filter((t) => t.status !== 'declined' && !t.locked) : [];
    if (rows.length) {
      await q("UPDATE timesheets SET status = 'declined', decline_reason = $2, declined_by = $3, declined_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])",
        [rows.map((r) => r.id), b.reason, user.id]);
    }
    let created = [];
    if (asgIds.length) {
      const scope = await venueScope(user);
      created = await q(
        `INSERT INTO timesheets (assignment_id, hours, status, decline_reason, declined_by, declined_at)
         SELECT a.id, 0, 'declined', $2, $3, now() FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
          WHERE a.id = ANY($1::uuid[]) AND s.ends_at < now() AND ($4::uuid[] IS NULL OR s.venue_id = ANY($4))
         ON CONFLICT (assignment_id) DO NOTHING RETURNING id, assignment_id`, [asgIds, b.reason, user.id, scope]);
    }
    const all = [...rows.map((r) => ({ id: r.id, officer_id: r.officer_id, venue_name: r.venue_name, starts_at: r.starts_at })),
      ...(created.length ? await q(`${BASE_SQL} WHERE t.id = ANY($1::uuid[])`, [created.map((c) => c.id)]) : [])];
    for (const r of all) {
      await notify(await officerUser(r.officer_id), { kind: 'timesheet', title: 'Shift not counted', body: `${r.venue_name} on ${fmtDate(r.starts_at)}: ${b.reason}`, link: '/officer/shifts' });
      await audit(user, 'timesheet.decline', 'timesheet', r.id, { reason: b.reason });
    }
    return { declined: all.length, skipped: ids.length + asgIds.length - all.length };
  }),

  // Undo a decline before the period is paid: rebuilt from the clock record, or back to "No clock-in" when there is none
  'timesheets.reopen': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    if (t.status !== 'declined' || t.locked) fail(400, 'Only a declined timesheet can be reopened');
    if (t.cancelled) fail(400, 'The shift was cancelled — put the officer back on the Rota first');
    const clocked = await one("SELECT 1 FROM clock_events WHERE assignment_id = $1 AND kind = 'in' AND status IN ('ok','approved','manual')", [t.assignment_id]);
    if (clocked) {
      await q("UPDATE timesheets SET status = 'pending', decline_reason = '', declined_by = NULL, declined_at = NULL, updated_at = now() WHERE id = $1", [t.id]);
      await buildTimesheet(t.assignment_id, { force: true });
    } else {
      await q('DELETE FROM timesheets WHERE id = $1', [t.id]);
    }
    await audit(user, 'timesheet.reopen', 'timesheet', t.id, { was: t.decline_reason, to: clocked ? 'awaiting review' : 'no clock-in' });
    return { ok: true, state: clocked ? 'awaiting' : 'no_clock_in' };
  }),

  // Company managers change the charge or officer rate for one shift; the rate cards stay as they are
  'timesheets.setRate': def(CO, async (b, { user }) => {
    required(b, 'id', 'reason');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    if (t.locked) fail(400, 'On a statement or invoice — remove it from the draft first');
    if (t.status === 'declined') fail(400, 'Declined — nothing is paid or charged');
    const num = (v) => (v == null || v === '' ? null : Number(v));
    const charge = num(b.charge_rate);
    const pay = num(b.pay_rate);
    if (charge == null && pay == null) fail(400, 'Enter a rate');
    if ([charge, pay].some((v) => v != null && (!Number.isFinite(v) || v < 0 || v > 1000))) fail(400, 'Rates are £ per hour, between 0 and 1000');
    if (pay != null) await guardSelf(user, t.officer_id, { companyOnly: true });
    const chargeChanged = charge != null && charge !== (t.charge_rate == null ? null : Number(t.charge_rate));
    // A different charge on a signed timesheet goes back to the venue to sign again
    const status = chargeChanged && t.status === 'signed' ? 'approved' : t.status;
    await q(
      `UPDATE timesheets SET charge_rate = COALESCE($2, charge_rate), pay_rate = COALESCE($3, pay_rate),
              charge_rate_set = charge_rate_set OR $2::numeric IS NOT NULL, pay_rate_set = pay_rate_set OR $3::numeric IS NOT NULL,
              rate_note = $4, status = $5, updated_at = now() WHERE id = $1`, [t.id, charge, pay, b.reason, status]);
    if (status !== t.status) {
      await notify(await venueContacts(t.venue_id), { kind: 'timesheet', title: 'Timesheet updated — please re-check', body: `${t.officer_name} on ${fmtDate(t.starts_at)}: ${b.reason}`, link: '/venue/timesheets', email: true });
    }
    await audit(user, 'timesheet.rate', 'timesheet', t.id, {
      from: { charge_rate: t.charge_rate, pay_rate: t.pay_rate }, to: { charge_rate: charge ?? t.charge_rate, pay_rate: pay ?? t.pay_rate }, reason: b.reason,
    });
    return { ok: true };
  }),

  // Manager correction (also answers queries and corrects a decline). Reason required, always audited.
  'timesheets.edit': def(MGR, async (b, { user }) => {
    required(b, 'id', 'reason');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    const self = await guardSelf(user, t.officer_id, { venueId: t.venue_id });
    if (t.locked) fail(400, 'On a statement or invoice — remove it from the draft first');
    if (t.cancelled) fail(400, 'The shift was cancelled — put the officer back on the Rota first');
    const start = b.actual_start || t.actual_start;
    const end = b.actual_end || t.actual_end;
    const brk = b.break_minutes ?? t.break_minutes;
    if (!start || !end) fail(400, 'Enter the start and finish');
    if (new Date(end) <= new Date(start)) fail(400, 'End must be after start');
    const s = await getSettings();
    const hours = b.hours != null ? money(b.hours) : roundHours(start, end, brk, s.rounding_minutes);
    if (!(hours >= 0 && hours <= 24)) fail(400, 'Hours must be between 0 and 24');
    let status = { disputed: 'approved', signed: 'approved', declined: 'pending' }[t.status] || t.status;
    // Straight to approved only with both rates fixed; otherwise it waits for Approve, which asks for them
    let rates = { charge_rate: t.charge_rate, pay_rate: t.pay_rate };
    if (status === 'approved') {
      rates = await ratesFor(t);
      if (missingRates(rates).length) status = 'pending';
    }
    await q(
      `UPDATE timesheets SET actual_start = $2, actual_end = $3, break_minutes = $4, hours = $5, status = $6, resolution = $7,
         flags = array_append(array_remove(flags, 'edited'), 'edited'), updated_at = now(), self_approved = self_approved OR $8,
         charge_rate = $9, pay_rate = $10, decline_reason = CASE WHEN $6 = 'declined' THEN decline_reason ELSE '' END,
         declined_by = CASE WHEN $6 = 'declined' THEN declined_by END, declined_at = CASE WHEN $6 = 'declined' THEN declined_at END WHERE id = $1`,
      [t.id, start, end, brk, hours, status, b.reason, !!self.selfApproved, rates.charge_rate, rates.pay_rate]);
    if (t.status === 'disputed' || t.status === 'signed') {
      await notify(await venueContacts(t.venue_id), { kind: 'timesheet', title: 'Timesheet updated — please re-check', body: `${t.officer_name} on ${fmtDate(t.starts_at)}: ${b.reason}`, link: '/venue/timesheets', email: true });
    }
    await audit(user, 'timesheet.edit', 'timesheet', t.id, {
      from: { start: t.actual_start, end: t.actual_end, hours: t.hours, status: t.status }, to: { start, end, hours, status },
      reason: b.reason, ...(b.hours != null ? { hours_override: true } : {}), ...(self.selfApproved ? { self_approved: true } : {}),
    });
    return { ok: true, status };
  }),

  // The trail for one timesheet: every decision, rate change and clock correction, newest first
  'timesheets.trail': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id');
    const [t] = await loadScoped(user, [b.id]);
    need(t);
    const rows = await q(
      `SELECT a.action, a.detail, a.created_at, ${userName('u')} AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE (a.entity = 'timesheet' AND (a.entity_id = $1 OR a.detail::text LIKE '%' || $1 || '%'))
           OR (a.entity = 'assignment' AND a.entity_id = $2)
        ORDER BY a.created_at DESC LIMIT 100`, [t.id, t.assignment_id]);
    // Venues see what happened, not the officer's pay
    return user.role === 'company' || moneyFor(user).pay ? rows : rows.map((r) => r.action === 'timesheet.rate' || r.action === 'timesheet.approve' ? { ...r, detail: null } : r);
  }),

  // Officers on a published shift with no clock record — for manager follow-up (no time limit: a no-show stays until it is set or declined)
  'timesheets.missing': def(MGR, async (_b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT a.id AS assignment_id, s.starts_at, s.ends_at, v.name AS venue_name, s.venue_id, ${officerName('o')} AS officer_name
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
        WHERE s.status = 'published' AND a.status IN ('assigned','accepted') AND s.ends_at < now()
          AND NOT EXISTS (SELECT 1 FROM timesheets t WHERE t.assignment_id = a.id)
          AND ($1::uuid[] IS NULL OR s.venue_id = ANY($1))
        ORDER BY s.starts_at DESC LIMIT 500`, [scope]);
  }),

  'timesheets.venueCheck': def(['venue'], async (b, { user }) => {
    await assertVenue(user, b.venue_id);
    return { ok: true };
  }),
};
