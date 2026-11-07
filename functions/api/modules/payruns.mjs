// Pay runs: officers review their statement before it is issued; queries become threads the office resolves
import { one, q, tx } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { notify, officerUser, companyManagers } from '../lib/notify.mjs';
import { ensureThread, post } from '../lib/threads.mjs';
import { fmtDate, fmtDateTime } from '../lib/time.mjs';
import { gbp, money } from '../lib/rates.mjs';
import { audit } from '../lib/audit.mjs';
import { actions as moneyActions, recalcStatement } from './money.mjs';
import { holdBackUnsigned, syncTimesheets, FEED_AGAIN } from './moneyFeed.mjs';
import { guardSelf, markOwn, otherApprover } from '../lib/selfcheck.mjs';
import { CO, MGR, def } from './_def.mjs';

const requirePay = (user) => { if (!canSeePay(user)) fail(403, 'You do not have access to pay information'); };
const period = (r) => `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`;

const RUN_SQL = `
  SELECT r.*, u.name AS created_by_name,
         count(st.id)::int AS statements, COALESCE(sum(st.total), 0) AS total, COALESCE(sum(st.hours), 0) AS hours,
         count(*) FILTER (WHERE st.review_status = 'pending')::int AS pending,
         count(*) FILTER (WHERE st.review_status = 'approved')::int AS approved,
         count(*) FILTER (WHERE st.review_status = 'disputed')::int AS disputed,
         count(*) FILTER (WHERE st.review_status = 'no_response')::int AS no_response,
         count(*) FILTER (WHERE st.review_status = 'resolved')::int AS resolved,
         count(*) FILTER (WHERE st.held)::int AS held,
         count(*) FILTER (WHERE st.status = 'issued')::int AS issued,
         count(*) FILTER (WHERE st.status = 'paid')::int AS paid,
         (SELECT count(*)::int FROM statement_disputes d JOIN statements s2 ON s2.id = d.statement_id WHERE s2.pay_run_id = r.id AND d.status = 'open') AS open_disputes
    FROM pay_runs r LEFT JOIN statements st ON st.pay_run_id = r.id LEFT JOIN users u ON u.id = r.created_by`;

export async function runSummary(id) {
  return one(`${RUN_SQL} WHERE r.id = $1 GROUP BY r.id, u.name`, [id]);
}

async function loadRun(id) {
  return need(await one('SELECT * FROM pay_runs WHERE id = $1', [id]), 'Pay run not found');
}

const touch = (t, id, status) => t.q('UPDATE pay_runs SET status = COALESCE($2, status), updated_at = now() WHERE id = $1', [id, status || null]);

async function tellOfficer(officerId, msg) {
  await notify(await officerUser(officerId), { kind: 'pay', ...msg });
}

export const actions = {
  'payRuns.list': def(MGR, async (b, { user }) => {
    requirePay(user);
    return q(`${RUN_SQL} WHERE ($1::text IS NULL OR r.status = $1) GROUP BY r.id, u.name ORDER BY r.period_start DESC, r.created_at DESC LIMIT $2`,
      [b.status || null, Math.min(Number(b.limit) || 100, 200)]);
  }),

  'payRuns.get': def(MGR, async (b, { user }) => {
    requirePay(user);
    required(b, 'id');
    const run = need(await runSummary(b.id), 'Pay run not found');
    const [statements, disputes, invoices, lines] = await Promise.all([
      q(`SELECT st.id, st.officer_id, st.number, st.status, st.review_status, st.reviewed_at, st.held, st.total, st.hours, st.pdf_document_id, st.self_approved,
                st.officer_id = $2 AS is_self,
                o.first_name || ' ' || o.last_name AS officer_name,
                (SELECT count(*)::int FROM statement_disputes d WHERE d.statement_id = st.id AND d.status = 'open') AS open_disputes
           FROM statements st JOIN officers o ON o.id = st.officer_id WHERE st.pay_run_id = $1 ORDER BY o.last_name, o.first_name`, [b.id, user.self_officer_id]),
      q(`SELECT d.*, st.officer_id, st.officer_id = $2 AS is_self, o.first_name || ' ' || o.last_name AS officer_name, st.total AS statement_total, u.name AS resolved_by_name
           FROM statement_disputes d JOIN statements st ON st.id = d.statement_id JOIN officers o ON o.id = st.officer_id
           LEFT JOIN users u ON u.id = d.resolved_by
          WHERE st.pay_run_id = $1 ORDER BY d.status = 'open' DESC, d.created_at`, [b.id, user.self_officer_id]),
      // Invoices billing the same hours (fed from the same timesheets), plus any made from this run before the live feed
      q(`SELECT i.id, i.number, i.status, i.gross, i.venue_id, v.name AS venue_name FROM invoices i JOIN venues v ON v.id = i.venue_id
          WHERE i.kind = 'invoice' AND (i.pay_run_id = $1 OR i.id IN (
            SELECT il.invoice_id FROM invoice_lines il JOIN statement_lines sl ON sl.timesheet_id = il.timesheet_id JOIN statements st ON st.id = sl.statement_id WHERE st.pay_run_id = $1))
          ORDER BY i.status = 'draft', v.name`, [b.id]),
      // Every line in the run for the day table: the hours with their timesheet's state, and manual extras
      q(`SELECT l.id, l.statement_id, l.kind, l.timesheet_id, l.description, l.work_date, l.hours, l.rate, l.amount, ts.status AS ts_status, ts.auto_signed AS ts_auto_signed,
                st.officer_id, o.first_name || ' ' || o.last_name AS officer_name
           FROM statement_lines l JOIN statements st ON st.id = l.statement_id JOIN officers o ON o.id = st.officer_id LEFT JOIN timesheets ts ON ts.id = l.timesheet_id
          WHERE st.pay_run_id = $1 ORDER BY l.work_date NULLS LAST, o.last_name, l.description`, [b.id]),
    ]);
    return { ...run, statements: await markOwn(user, statements, { companyOnly: true }), disputes: await markOwn(user, disputes, { companyOnly: true }), invoices, lines };
  }),

  // Officers see their statement and have until the deadline to approve it or query a line
  'payRuns.sendForReview': def(CO, async (b, { user }) => {
    required(b, 'id');
    const days = Math.round(Number(b.deadline_days ?? 3));
    if (!(days >= 1 && days <= 7)) fail(400, 'Choose a deadline between 1 and 7 days');
    const run = await loadRun(b.id);
    if (!['draft', 'in_review'].includes(run.status)) fail(400, 'This pay run has already been finalised');
    let held = [];
    const sent = await tx(async (t) => {
      await t.q('SELECT pg_advisory_xact_lock(424243)');
      // Officers check only the hours their venue has signed off; the rest move to the next draft run on their own
      if (run.status === 'draft') held = (await holdBackUnsigned(t, { runId: b.id })).moved;
      const rows = await t.q(
        `UPDATE statements SET review_status = 'pending' WHERE pay_run_id = $1 AND status = 'draft' AND review_status IS NULL
         RETURNING id, officer_id, total, period_start, period_end`, [b.id]);
      if (!rows.length && run.status === 'draft') fail(400, held.length ? 'Nothing in this pay run is signed off by the venues yet' : 'There are no statements in this pay run');
      // Short deadlines need no separate reminder: the request itself is the reminder
      await t.q(`UPDATE pay_runs SET status = 'in_review', review_deadline = now() + make_interval(days => $2),
                   reminded_at = CASE WHEN $2 <= 2 THEN now() ELSE NULL END, updated_at = now() WHERE id = $1`, [b.id, days]);
      return rows;
    });
    await syncTimesheets(held);
    const deadline = (await loadRun(b.id)).review_deadline;
    for (const st of sent) {
      await tellOfficer(st.officer_id, {
        title: 'Please check your pay statement', body: `${period(st)}: ${gbp(st.total)}. Approve it or tell us what's wrong by ${fmtDateTime(deadline)}.`,
        link: `/officer/pay/${st.id}`, email: true, dedupe: `payreview:${st.id}`,
      });
    }
    await audit(user, 'pay_run.send_for_review', 'pay_run', b.id, { days, statements: sent.length, held_back: held.length, via: b.via });
    return { sent: sent.length, review_deadline: deadline, held_back: held.length };
  }),

  // Officer: approve the statement, or query one line (or the whole statement) with a comment
  'pay.review': def(['officer'], async (b, { user }) => {
    required(b, 'statement_id');
    const st = need(await one('SELECT st.*, o.first_name || \' \' || o.last_name AS officer_name FROM statements st JOIN officers o ON o.id = st.officer_id WHERE st.id = $1', [b.statement_id]));
    if (st.officer_id !== user.officer_id) fail(403, 'Forbidden');
    const run = st.pay_run_id && await loadRun(st.pay_run_id);
    if (!run || run.status !== 'in_review' || st.status !== 'draft' || !st.review_status) fail(400, 'This statement is not open for review');
    if (b.approve) {
      const open = await one("SELECT count(*)::int AS n FROM statement_disputes WHERE statement_id = $1 AND status = 'open'", [st.id]);
      if (open.n) fail(400, 'Your query is with the office. They will reply in the thread.');
      await q("UPDATE statements SET review_status = 'approved', reviewed_at = now() WHERE id = $1", [st.id]);
      await audit(user, 'pay.review_approve', 'statement', st.id);
      return { review_status: 'approved' };
    }
    const dsp = b.dispute || {};
    const comment = String(dsp.comment || '').trim();
    if (comment.length < 3) fail(400, 'Tell us what looks wrong');
    const line = dsp.line_id ? need(await one('SELECT * FROM statement_lines WHERE id = $1 AND statement_id = $2', [dsp.line_id, st.id]), 'Line not found') : null;
    const d = await one(
      `INSERT INTO statement_disputes (statement_id, line_id, line_description, comment, raised_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [st.id, line?.id || null, line ? `${line.description} · ${gbp(line.amount)}` : 'Whole statement', comment.slice(0, 2000), user.id]);
    const managers = await companyManagers();
    const conv = await ensureThread('pay', d.id, [user.id, ...managers], `Pay query · ${st.officer_name}`, user.id);
    await q('UPDATE statement_disputes SET conversation_id = $2 WHERE id = $1', [d.id, conv.id]);
    await q("UPDATE statements SET review_status = 'disputed', reviewed_at = now() WHERE id = $1", [st.id]);
    await post(conv.id, user.id, { body: `Query on my pay statement (${period(st)})\n${d.line_description}\n\n${comment}` });
    await notify(managers, {
      kind: 'pay', severity: 'warning', title: `Pay query from ${st.officer_name}`, body: `${d.line_description}: ${comment.slice(0, 120)}`,
      link: `/company/pay/runs/${run.id}`, email: true,
    });
    await audit(user, 'pay.review_dispute', 'statement', st.id, { dispute: d.id, line: line?.id });
    return { review_status: 'disputed', dispute_id: d.id, conversation_id: conv.id };
  }),

  // Office answers a query: optional corrections, a reply in the thread, then resolved
  'payRuns.resolveDispute': def(CO, async (b, { user }) => {
    required(b, 'dispute_id', 'resolution');
    const d = need(await one('SELECT d.*, st.officer_id, st.status AS st_status, st.pay_run_id FROM statement_disputes d JOIN statements st ON st.id = d.statement_id WHERE d.id = $1', [b.dispute_id]));
    if (d.status !== 'open') fail(400, 'This query is already resolved');
    if (d.st_status !== 'draft') fail(400, 'The statement has already been issued');
    const self = await guardSelf(user, d.officer_id, { companyOnly: true, message: 'Another company manager needs to answer a query on your own pay' });
    const changes = [];
    await tx(async (t) => {
      // Correct the hours on a line (amount follows the line's rate)
      if (b.line_hours != null && d.line_id) {
        const l = need(await t.one("SELECT * FROM statement_lines WHERE id = $1 AND kind = 'hours'", [d.line_id]), 'Only hours lines can be corrected');
        const hours = Number(b.line_hours);
        if (!(hours >= 0 && hours <= 24)) fail(400, 'Hours must be between 0 and 24');
        await t.q('UPDATE statement_lines SET hours = $2, amount = $3 WHERE id = $1', [l.id, hours, money(hours * Number(l.rate))]);
        changes.push(`hours ${Number(l.hours)} → ${hours}`);
      }
      if (b.adjustment?.amount) {
        const kind = ['bonus', 'expense', 'deduction'].includes(b.adjustment.kind) ? b.adjustment.kind : 'bonus';
        const amt = Math.abs(Number(b.adjustment.amount)) * (kind === 'deduction' ? -1 : 1);
        if (!Number.isFinite(amt)) fail(400, 'Invalid amount');
        await t.q('INSERT INTO statement_lines (statement_id, kind, description, amount) VALUES ($1,$2,$3,$4)',
          [d.statement_id, kind, String(b.adjustment.description || 'Correction after pay query').slice(0, 200), money(amt)]);
        changes.push(`${kind} ${gbp(amt)}`);
      }
      await recalcStatement(t, d.statement_id);
      await t.q("UPDATE statement_disputes SET status = 'resolved', resolution = $2, resolved_by = $3, resolved_at = now(), updated_at = now() WHERE id = $1",
        [d.id, String(b.resolution).slice(0, 2000), user.id]);
      if (self.selfApproved) await t.q('UPDATE statements SET self_approved = true WHERE id = $1', [d.statement_id]);
      const left = await t.one("SELECT count(*)::int AS n FROM statement_disputes WHERE statement_id = $1 AND status = 'open'", [d.statement_id]);
      if (!left.n) await t.q("UPDATE statements SET review_status = 'resolved' WHERE id = $1", [d.statement_id]);
      await touch(t, d.pay_run_id);
    });
    const st = await one('SELECT total FROM statements WHERE id = $1', [d.statement_id]);
    if (d.conversation_id) {
      await post(d.conversation_id, user.id, { body: `${b.resolution}${changes.length ? `\n\nChanged: ${changes.join(', ')}. New total ${gbp(st.total)}.` : ''}` });
    }
    await tellOfficer(d.officer_id, { title: 'Your pay query is resolved', body: String(b.resolution).slice(0, 140), link: `/officer/pay/${d.statement_id}` });
    await audit(user, 'pay_run.resolve_dispute', 'statement_dispute', d.id, { changes, via: b.via, ...(self.selfApproved ? { self_approved: true } : {}) });
    return { ok: true, total: st.total, changes };
  }),

  // Close the review: no open queries; anyone who did not respond is approved on their behalf or held back
  'payRuns.finalise': def(CO, async (b, { user }) => {
    required(b, 'id');
    const run = await loadRun(b.id);
    if (!['draft', 'in_review'].includes(run.status)) fail(400, 'This pay run is already finalised');
    const open = await one(
      "SELECT count(*)::int AS n FROM statement_disputes d JOIN statements st ON st.id = d.statement_id WHERE st.pay_run_id = $1 AND d.status = 'open'", [b.id]);
    if (open.n) fail(400, `Resolve the ${open.n === 1 ? 'open pay query' : `${open.n} open pay queries`} first`, { open_disputes: open.n });
    const waiting = await one(
      "SELECT count(*)::int AS n FROM statements WHERE pay_run_id = $1 AND status = 'draft' AND review_status IN ('pending','no_response')", [b.id]);
    if (waiting.n && !['approve', 'hold'].includes(b.no_response)) {
      fail(400, `${waiting.n} ${waiting.n === 1 ? 'officer has' : 'officers have'} not responded. Choose to approve on their behalf or hold them back.`, { needs_choice: waiting.n });
    }
    // Your own statement is never approved on your behalf by you while another company manager could do it
    const own = user.self_officer_id && await one(
      `SELECT id, review_status FROM statements WHERE pay_run_id = $1 AND officer_id = $2 AND status = 'draft'
          AND (review_status IS NULL OR review_status IN ('pending','no_response'))`, [b.id, user.self_officer_id]);
    const ownWouldApprove = own && (own.review_status === null || b.no_response === 'approve');
    let selfStatement = null;
    if (ownWouldApprove) {
      if (await otherApprover(user, { companyOnly: true })) {
        fail(403, 'Your own statement is in this pay run. Approve it yourself in My shifts → Pay, or ask another company manager to finalise.', { self: true });
      }
      selfStatement = own.id;
    }
    let heldBack = [];
    const out = await tx(async (t) => {
      await t.q('SELECT pg_advisory_xact_lock(424243)');
      // Straight from draft: only signed-off hours go into the run; the rest move to the next draft run
      if (run.status === 'draft') {
        heldBack = (await holdBackUnsigned(t, { runId: b.id })).moved;
        if (!(await t.one('SELECT 1 FROM statements WHERE pay_run_id = $1 LIMIT 1', [b.id]))) fail(400, 'Nothing in this pay run is signed off by the venues yet');
      }
      if (selfStatement) await t.q('UPDATE statements SET self_approved = true WHERE id = $1', [selfStatement]);
      // Never sent for review: the manager is approving every statement
      const direct = await t.q("UPDATE statements SET review_status = 'approved', reviewed_at = now() WHERE pay_run_id = $1 AND status = 'draft' AND review_status IS NULL RETURNING id", [b.id]);
      const rows = await t.q(
        `UPDATE statements SET ${b.no_response === 'hold' ? 'held = true, review_status = \'no_response\'' : "review_status = 'approved', reviewed_at = now()"}
          WHERE pay_run_id = $1 AND status = 'draft' AND review_status IN ('pending','no_response') RETURNING id, officer_id`, [b.id]);
      await touch(t, b.id, 'reconciled');
      return { direct: direct.length, rows };
    });
    await syncTimesheets(heldBack);
    // Orb checks rota, clock, timesheet and statement hours line up before anything is issued
    let reconcile = null;
    try {
      const { runReconcile } = await import('./ops.mjs');
      reconcile = await runReconcile(String(run.period_start).slice(0, 10), String(run.period_end).slice(0, 10));
    } catch (e) {
      console.error('[payruns] reconcile failed', e);
    }
    await audit(user, 'pay_run.finalise', 'pay_run', b.id, { no_response: b.no_response || null, affected: out.rows.length, direct: out.direct, via: b.via, held_back: heldBack.length, ...(selfStatement ? { self_approved: selfStatement } : {}) });
    return { ok: true, held: b.no_response === 'hold' ? out.rows.length : 0, approved_on_behalf: b.no_response === 'approve' ? out.rows.length : 0, held_back: heldBack.length, reconcile };
  }),

  'payRuns.issue': def(CO, async (b, ctx) => {
    required(b, 'id');
    const run = await loadRun(b.id);
    if (!['reconciled', 'issued'].includes(run.status)) fail(400, run.status === 'paid' ? 'This pay run is already paid' : 'Finalise the review first');
    const ids = (await q("SELECT id FROM statements WHERE pay_run_id = $1 AND status = 'draft' AND NOT held", [b.id])).map((r) => r.id);
    const res = ids.length ? await moneyActions['pay.issue'].fn({ ids, via: b.via }, ctx) : { issued: 0 };
    await q("UPDATE pay_runs SET status = 'issued', updated_at = now() WHERE id = $1 AND status = 'reconciled'", [b.id]);
    await audit(ctx.user, 'pay_run.issue', 'pay_run', b.id, { issued: res.issued, via: b.via });
    return { issued: res.issued };
  }),

  'payRuns.markPaid': def(CO, async (b, ctx) => {
    required(b, 'id');
    const ids = (await q("SELECT id FROM statements WHERE pay_run_id = $1 AND status = 'issued'", [b.id])).map((r) => r.id);
    if (!ids.length) fail(400, 'Nothing issued to mark as paid');
    return moneyActions['pay.markPaid'].fn({ ids, via: b.via }, ctx);
  }),

  // A held statement goes out with the next issue once released
  'payRuns.release': def(CO, async (b, { user }) => {
    required(b, 'statement_id');
    const cur = need(await one('SELECT officer_id FROM statements WHERE id = $1', [b.statement_id]), 'Statement not found');
    const self = await guardSelf(user, cur.officer_id, { companyOnly: true, message: 'Another company manager needs to release your own statement' });
    const st = need(await one("UPDATE statements SET held = false, review_status = 'approved', reviewed_at = now(), self_approved = self_approved OR $2 WHERE id = $1 AND held AND status = 'draft' RETURNING id, pay_run_id", [b.statement_id, !!self.selfApproved]), 'Statement is not held');
    await audit(user, 'pay_run.release', 'statement', st.id, self.selfApproved ? { self_approved: true } : undefined);
    return { ok: true };
  }),

  // Only while nothing in it has been issued
  'payRuns.delete': def(CO, async (b, { user }) => {
    required(b, 'id');
    await tx(async (t) => {
      const run = need(await t.one('SELECT * FROM pay_runs WHERE id = $1 FOR UPDATE', [b.id]));
      const issued = await t.one("SELECT count(*)::int AS n FROM statements WHERE pay_run_id = $1 AND status <> 'draft'", [b.id]);
      if (issued.n || ['issued', 'paid'].includes(run.status)) fail(400, 'Issued pay runs cannot be deleted');
      if (run.status === 'draft' && await t.one('SELECT 1 FROM statement_lines l JOIN statements st ON st.id = l.statement_id WHERE st.pay_run_id = $1 AND l.timesheet_id IS NOT NULL LIMIT 1', [b.id])) {
        fail(400, 'This draft run follows approved timesheets. Decline or query them on the Timesheets page and their lines drop off.');
      }
      // Its hours go back to the feed and land on the next draft run
      await t.q(`UPDATE timesheets SET statement_id = NULL, ${FEED_AGAIN} WHERE statement_id IN (SELECT id FROM statements WHERE pay_run_id = $1)`, [b.id]);
      await t.q('DELETE FROM statements WHERE pay_run_id = $1', [b.id]);
      await t.q('UPDATE invoices SET pay_run_id = NULL WHERE pay_run_id = $1', [b.id]);
      await t.q('DELETE FROM pay_runs WHERE id = $1', [b.id]);
    });
    await audit(user, 'pay_run.delete', 'pay_run', b.id);
    return { ok: true };
  }),
};

// Every 5 minutes: a reminder 48 hours before the deadline; at the deadline silence becomes "no response"
export async function payRunJobs() {
  const out = { reminded: 0, expired: 0 };
  const remind = await q(
    `UPDATE pay_runs SET reminded_at = now() WHERE status = 'in_review' AND reminded_at IS NULL
        AND review_deadline - interval '48 hours' <= now() AND review_deadline > now() RETURNING id, review_deadline`);
  for (const r of remind) {
    const sts = await q("SELECT id, officer_id, total, period_start, period_end FROM statements WHERE pay_run_id = $1 AND review_status = 'pending'", [r.id]);
    for (const st of sts) {
      await tellOfficer(st.officer_id, {
        title: 'Reminder: check your pay statement', body: `${period(st)}: ${gbp(st.total)}. Please respond by ${fmtDateTime(r.review_deadline)}.`,
        link: `/officer/pay/${st.id}`, email: true, dedupe: `payremind:${st.id}`,
      });
      out.reminded++;
    }
  }
  const expired = await q(
    `UPDATE statements st SET review_status = 'no_response' FROM pay_runs r
      WHERE r.id = st.pay_run_id AND r.status = 'in_review' AND r.review_deadline <= now() AND st.review_status = 'pending'
      RETURNING st.pay_run_id`);
  out.expired = expired.length;
  for (const runId of new Set(expired.map((e) => e.pay_run_id))) {
    const r = await loadRun(runId);
    const n = expired.filter((e) => e.pay_run_id === runId).length;
    await notify(await companyManagers(), {
      kind: 'pay', title: 'Pay review deadline passed', body: `${period(r)}: ${n} ${n === 1 ? 'officer' : 'officers'} did not respond. Finalise the run when ready.`,
      link: `/company/pay/runs/${runId}`, dedupe: `paydeadline:${runId}`,
    });
  }
  return out;
}
