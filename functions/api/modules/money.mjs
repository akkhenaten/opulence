import { one, q, tx } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { bandFractions, bandedAmount, money, gbp } from '../lib/rates.mjs';
import { Doc } from '../lib/pdf.mjs';
import { notify, officerUser, venueContacts } from '../lib/notify.mjs';
import { fmtDate, fmtTime, londonDate, addDays } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { getSettings } from './settings.mjs';
import { archivePdf, savedPdf, longDate } from '../lib/archive.mjs';
import { guardSelf, markOwn } from '../lib/selfcheck.mjs';
import { ALL, CO, def } from './_def.mjs';

const OWN_PAY = 'Another company manager needs to change your own pay statement';

// ---------- Rate resolution ----------
export async function officerRate(officerId, role, venueId, date) {
  const r = await one(
    `SELECT rate FROM officer_rates WHERE officer_id = $1 AND role = $2 AND (venue_id = $3 OR venue_id IS NULL) AND effective_from <= $4
      ORDER BY venue_id IS NULL, effective_from DESC LIMIT 1`, [officerId, role, venueId, date]);
  return r ? Number(r.rate) : null;
}

export async function venueRate(venueId, role, date) {
  return one('SELECT * FROM venue_rates WHERE venue_id = $1 AND role = $2 AND effective_from <= $3 ORDER BY effective_from DESC LIMIT 1', [venueId, role, date]);
}

const bankHolidays = async () => new Set((await q('SELECT day FROM bank_holidays')).map((r) => r.day));

async function payFor(t, s, bh) {
  const date = londonDate(t.starts_at);
  const rate = await officerRate(t.officer_id, t.role, t.venue_id, date);
  const fr = bandFractions(t.actual_start, t.actual_end, s, bh);
  const amount = rate == null ? 0 : bandedAmount(Number(t.hours), fr, rate, { night: s.pay_night_uplift, weekend: s.pay_weekend_uplift, bh: s.pay_bh_uplift });
  return { rate, amount, fr };
}

const TS_SQL = `
  SELECT t.*, a.officer_id, ps.review_status AS ps_review, ps.held AS ps_held, pr.status AS pr_status, ps.pay_run_id AS ps_run, s.starts_at, s.ends_at, s.role, r.name AS role_name, s.venue_id, v.name AS venue_name, o.first_name, o.last_name
    FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
    JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role JOIN officers o ON o.id = a.officer_id
    LEFT JOIN statements ps ON ps.id = t.statement_id LEFT JOIN pay_runs pr ON pr.id = ps.pay_run_id`;

const periodWhere = `t.status = 'signed' AND (s.starts_at AT TIME ZONE 'Europe/London')::date BETWEEN $1 AND $2`;

const lineDesc = (t) => `${t.role_name} · ${t.venue_name} · ${fmtDate(t.actual_start)} ${fmtTime(t.actual_start)}–${fmtTime(t.actual_end)}`;
// Explains a blended hourly rate: "£24.00/h base, incl. night +10%"
const upliftNote = (fr, vr) => {
  const ups = [['night', vr.night_uplift], ['weekend', vr.weekend_uplift], ['bank holiday', vr.bh_uplift, 'bh']]
    .filter(([k, pct, key]) => fr[key || k] > 0 && Number(pct) > 0).map(([k, pct]) => `${k} +${Number(pct)}%`);
  return ups.length ? ` · £${Number(vr.rate).toFixed(2)}/h base, incl. ${ups.join(', ')}` : '';
};

function requirePay(user) {
  if (!canSeePay(user)) fail(403, 'You do not have access to pay information');
}

export async function recalcStatement(t, id) {
  await t.q(
    `UPDATE statements SET total = COALESCE((SELECT sum(amount) FROM statement_lines WHERE statement_id = $1), 0),
       hours = COALESCE((SELECT sum(hours) FROM statement_lines WHERE statement_id = $1 AND kind = 'hours'), 0) WHERE id = $1`, [id]);
}

export async function recalcInvoice(t, id) {
  await t.q(
    `UPDATE invoices SET net = COALESCE((SELECT sum(amount) FROM invoice_lines WHERE invoice_id = $1), 0),
       vat = round(COALESCE((SELECT sum(amount) FROM invoice_lines WHERE invoice_id = $1), 0) * vat_rate / 100, 2),
       gross = COALESCE((SELECT sum(amount) FROM invoice_lines WHERE invoice_id = $1), 0) + round(COALESCE((SELECT sum(amount) FROM invoice_lines WHERE invoice_id = $1), 0) * vat_rate / 100, 2)
     WHERE id = $1`, [id]);
}

// ---------- PDFs ----------
const statementSql = `SELECT st.*, o.first_name || ' ' || o.last_name AS officer_name, o.utr, o.email, r.run_date, r.status AS run_status
  FROM statements st JOIN officers o ON o.id = st.officer_id LEFT JOIN pay_runs r ON r.id = st.pay_run_id WHERE st.id = $1`;

async function loadStatement(id) {
  const st = need(await one(statementSql, [id]));
  st.lines = await q('SELECT * FROM statement_lines WHERE statement_id = $1 ORDER BY kind = \'hours\' DESC, work_date, description', [id]);
  return st;
}

async function loadInvoice(id) {
  const inv = need(await one(
    `SELECT i.*, v.name AS venue_name, v.address AS venue_address, v.postcode, c.name AS client_name, c.billing_address, c.billing_email, c.vat_number AS client_vat,
            ci.number AS credit_of_number
       FROM invoices i JOIN venues v ON v.id = i.venue_id LEFT JOIN clients c ON c.id = v.client_id LEFT JOIN invoices ci ON ci.id = i.credit_of WHERE i.id = $1`, [id]));
  inv.lines = await q('SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY work_date NULLS LAST, description', [id]);
  return inv;
}

const statementFilename = (st, o) => `${o.first_name} ${o.last_name} — Pay statement — ${longDate(st.run_date || st.issued_at || st.period_end)}.pdf`;
const invoiceFilename = (inv) => `${inv.venue_name} — ${inv.kind === 'credit' ? 'Credit note' : 'Invoice'} ${inv.number || 'draft'} — ${longDate(inv.issue_date || new Date())}.pdf`;

export async function buildStatementPdf(st) {
  const s = await getSettings();
  const o = await one('SELECT * FROM officers WHERE id = $1', [st.officer_id]);
  const d = await Doc.create(`Remittance ${st.number || 'draft'}`);
  await d.header(s, 'Remittance statement', st.number || 'DRAFT');
  d.meta(
    [['Contractor', `${o.first_name} ${o.last_name}`], ['UTR', o.utr || 'Not provided'], ['Address', [o.address, o.postcode].filter(Boolean).join(', ')]],
    [['Period', `${fmtDate(st.period_start)} - ${fmtDate(st.period_end)}`], ['Paid to', o.bank_account ? `${o.bank_sort_code} / ****${o.bank_account.slice(-4)}` : '-'], ['Status', st.status.toUpperCase()]],
  );
  d.section('Hours worked');
  d.table(
    [{ label: 'Shift', width: 0.58 }, { label: 'Hours', width: 0.12, align: 'right' }, { label: 'Rate', width: 0.14, align: 'right' }, { label: 'Amount', width: 0.16, align: 'right' }],
    st.lines.filter((l) => l.kind === 'hours').map((l) => [l.description, Number(l.hours).toFixed(2), gbp(l.rate), gbp(l.amount)]),
  );
  const extras = st.lines.filter((l) => l.kind !== 'hours');
  if (extras.length) {
    d.section('Adjustments');
    d.table([{ label: 'Item', width: 0.2 }, { label: 'Description', width: 0.64 }, { label: 'Amount', width: 0.16, align: 'right' }],
      extras.map((l) => [l.kind, l.description, gbp(l.amount)]));
  }
  d.totals([['Total hours', Number(st.hours).toFixed(2)], ['Total payable', gbp(st.total), true]]);
  d.space(10);
  d.text('You are a self-employed contractor. No tax or National Insurance has been deducted. You are responsible for declaring this income to HMRC.', { size: 8.5, color: undefined });
  d.footer(`${s.company_name} · Remittance statement ${st.number || 'draft'}`);
  return { filename: statementFilename(st, o), pdf: await d.base64() };
}

export async function buildInvoicePdf(inv) {
  const s = await getSettings();
  const title = inv.kind === 'credit' ? 'Credit note' : 'Invoice';
  const d = await Doc.create(`${title} ${inv.number || 'draft'}`);
  await d.header(s, title, inv.number || 'DRAFT');
  d.meta(
    [['Bill to', inv.client_name || inv.venue_name], ['Address', inv.billing_address || [inv.venue_address, inv.postcode].filter(Boolean).join(', ')], ['Venue', inv.venue_name]],
    [['Issue date', inv.issue_date ? fmtDate(inv.issue_date) : '-'], ['Due date', inv.due_date ? fmtDate(inv.due_date) : '-'],
      ['Period', inv.period_start ? `${fmtDate(inv.period_start)} - ${fmtDate(inv.period_end)}` : '-'], ...(inv.credit_of_number ? [['Credit against', inv.credit_of_number]] : [])],
  );
  d.section('Services');
  d.table(
    [{ label: 'Description', width: 0.56 }, { label: 'Hours', width: 0.12, align: 'right' }, { label: 'Rate', width: 0.14, align: 'right' }, { label: 'Amount', width: 0.18, align: 'right' }],
    inv.lines.map((l) => [l.description, l.hours != null ? Number(l.hours).toFixed(2) : '', l.rate != null ? gbp(l.rate) : '', gbp(l.amount)]),
  );
  d.totals([['Net', gbp(inv.net)], [`VAT @ ${Number(inv.vat_rate)}%`, gbp(inv.vat)], ['Total', gbp(inv.gross), true]]);
  if (inv.notes) { d.section('Notes'); d.text(inv.notes, { size: 9 }); }
  d.section('Payment');
  d.text(`Bank: ${s.bank_name || '-'}   Sort code: ${s.bank_sort_code || '-'}   Account: ${s.bank_account || '-'}   Reference: ${inv.number || ''}`, { size: 9 });
  d.footer([s.company_name, s.company_number && `Company no. ${s.company_number}`, s.vat_number && `VAT no. ${s.vat_number}`].filter(Boolean).join(' · '));
  return { filename: invoiceFilename(inv), pdf: await d.base64() };
}

/** Save the issued statement's PDF to the officer's documents (once). Never throws. */
export async function archiveStatement(id, userId = null) {
  try {
    const st = await loadStatement(id);
    if (st.status === 'draft' || st.pdf_document_id) return st.pdf_document_id;
    const out = await buildStatementPdf(st);
    const doc = await archivePdf({ ownerType: 'officer', ownerId: st.officer_id, kind: 'pay_statement', filename: out.filename, bytes: out.pdf, number: st.number || '', userId });
    await q('UPDATE statements SET pdf_document_id = $2 WHERE id = $1 AND pdf_document_id IS NULL', [id, doc.id]);
    return doc.id;
  } catch (e) {
    console.error('[archive] statement', id, e);
    return null;
  }
}

/** Save the issued invoice / credit note PDF to the venue's documents (once). Never throws. */
export async function archiveInvoice(id, userId = null) {
  try {
    const inv = await loadInvoice(id);
    if (inv.status === 'draft' || inv.pdf_document_id) return inv.pdf_document_id;
    const out = await buildInvoicePdf(inv);
    const doc = await archivePdf({ ownerType: 'venue', ownerId: inv.venue_id, kind: 'invoice', filename: out.filename, bytes: out.pdf, number: inv.number || '', userId });
    await q('UPDATE invoices SET pdf_document_id = $2 WHERE id = $1 AND pdf_document_id IS NULL', [id, doc.id]);
    return doc.id;
  } catch (e) {
    console.error('[archive] invoice', id, e);
    return null;
  }
}

// ---------- Periods ----------
function suggestPeriod(kind, today = londonDate(new Date())) {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  if (kind === 'monthly') {
    const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
    return { start: first, end: last };
  }
  const lastMonday = addDays(today, -dow - 7);
  return { start: kind === 'fortnightly' ? addDays(lastMonday, -7) : lastMonday, end: addDays(lastMonday, 6) };
}

// Orb checks the new figures; never blocks generation
async function reconcileAfter(start, end) {
  try {
    const { runReconcile } = await import('./ops.mjs');
    const { getSettings } = await import('./settings.mjs');
    if (((await getSettings()).ops_jobs || {}).reconcile !== false) await runReconcile(start, end);
  } catch (e) {
    console.error('[ops] reconcile after generate failed:', e);
  }
}

export const actions = {
  'pay.suggestPeriod': def(CO, async () => {
    const s = await getSettings();
    return { pay: suggestPeriod(s.pay_period), invoice: suggestPeriod(s.invoice_cycle), pay_period: s.pay_period, invoice_cycle: s.invoice_cycle };
  }),

  // Signed timesheets in a period not yet paid / invoiced — what a run would include
  'pay.preview': def(CO, async (b) => {
    required(b, 'start', 'end');
    const [unpaid, uninvoiced, unsigned] = await Promise.all([
      one(`SELECT count(*) AS n, COALESCE(sum(t.hours),0) AS hours FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE ${periodWhere} AND t.statement_id IS NULL`, [b.start, b.end]),
      one(`SELECT count(*) AS n, COALESCE(sum(t.hours),0) AS hours FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id WHERE ${periodWhere} AND t.invoice_id IS NULL`, [b.start, b.end]),
      one(`SELECT count(*) AS n FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
            WHERE t.status <> 'signed' AND (s.starts_at AT TIME ZONE 'Europe/London')::date BETWEEN $1 AND $2`, [b.start, b.end]),
    ]);
    return { unpaid, uninvoiced, unsigned: Number(unsigned.n) };
  }),

  // ---------- Officer statements (self-employed remittance) ----------
  'pay.generate': def(CO, async (b, { user }) => {
    required(b, 'start', 'end');
    const s = await getSettings();
    const bh = await bankHolidays();
    const rows = await q(`${TS_SQL} WHERE ${periodWhere} AND t.statement_id IS NULL ORDER BY o.last_name, s.starts_at`, [b.start, b.end]);
    if (!rows.length) return { created: 0, timesheets: 0, missing_rates: [], pay_run_id: null };
    // One run per period: a second generate for the same period adds to the run while it is still open
    let run = await one("SELECT * FROM pay_runs WHERE period_start = $1 AND period_end = $2 AND status IN ('draft','in_review') ORDER BY created_at DESC LIMIT 1", [b.start, b.end]);
    run ||= await one('INSERT INTO pay_runs (period_start, period_end, run_date, created_by, created_via) VALUES ($1,$2,(now() AT TIME ZONE \'Europe/London\')::date,$3,$4) RETURNING *',
      [b.start, b.end, user.id, b.via === 'ai' ? 'ai' : 'user']);
    const pending = run.status === 'in_review' ? 'pending' : null;
    const byOfficer = {};
    for (const t of rows) (byOfficer[t.officer_id] ||= []).push(t);
    const missingRates = [];
    let created = 0;
    for (const [officerId, list] of Object.entries(byOfficer)) {
      await tx(async (t) => {
        const st = await t.one('INSERT INTO statements (officer_id, period_start, period_end, pay_run_id, review_status) VALUES ($1,$2,$3,$4,$5) RETURNING id', [officerId, b.start, b.end, run.id, pending]);
        for (const ts of list) {
          const p = await payFor(ts, s, bh);
          if (p.rate == null) missingRates.push(`${ts.first_name} ${ts.last_name} (${ts.role_name})`);
          await t.q(
            'INSERT INTO statement_lines (statement_id, kind, timesheet_id, description, work_date, hours, rate, amount) VALUES ($1,\'hours\',$2,$3,$4,$5,$6,$7)',
            [st.id, ts.id, lineDesc(ts), londonDate(ts.starts_at), ts.hours, Number(ts.hours) ? money(p.amount / Number(ts.hours)) : p.rate || 0, p.amount]);
          await t.q('UPDATE timesheets SET statement_id = $2 WHERE id = $1', [ts.id, st.id]);
        }
        await recalcStatement(t, st.id);
      });
      created++;
    }
    await audit(user, 'pay.generate', 'pay_run', run.id, { start: b.start, end: b.end, created, via: b.via || 'user' });
    await reconcileAfter(b.start, b.end);
    return { created, timesheets: rows.length, missing_rates: [...new Set(missingRates)], pay_run_id: run.id };
  }),

  'pay.list': def(ALL, async (b, { user }) => {
    if (user.role === 'venue') fail(403, 'Forbidden');
    if (user.role !== 'officer') requirePay(user);
    return q(
      `SELECT st.*, o.first_name || ' ' || o.last_name AS officer_name, o.bank_sort_code IS NOT NULL AND o.bank_sort_code <> '' AS has_bank,
              r.status AS run_status, r.review_deadline
         FROM statements st JOIN officers o ON o.id = st.officer_id LEFT JOIN pay_runs r ON r.id = st.pay_run_id
        WHERE ($1::uuid IS NULL OR st.officer_id = $1) AND ($2::text IS NULL OR st.status = $2) AND ($3::boolean OR st.status <> 'draft' OR st.review_status IS NOT NULL)
          AND ($5::uuid IS NULL OR st.pay_run_id = $5)
          AND ($4::date IS NULL OR st.period_start = $4)
        ORDER BY st.period_end DESC, officer_name LIMIT 500`,
      [user.role === 'officer' ? user.officer_id : b.officer_id || null, b.status || null, user.role !== 'officer', b.period_start || null, b.pay_run_id || null])
      .then((rows) => markOwn(user, rows, { companyOnly: true }));
  }),

  'pay.get': def(['company', 'security', 'officer'], async (b, { user }) => {
    const st = await loadStatement(b.id);
    if (user.role === 'officer' ? st.officer_id !== user.officer_id || (st.status === 'draft' && !st.review_status) : !canSeePay(user)) fail(403, 'Forbidden');
    Object.assign(st, (await markOwn(user, [{ officer_id: st.officer_id }], { companyOnly: true }))[0], { officer_id: st.officer_id });
    const disputes = await q(
      `SELECT d.*, u.name AS resolved_by_name FROM statement_disputes d LEFT JOIN users u ON u.id = d.resolved_by WHERE d.statement_id = $1 ORDER BY d.created_at`, [b.id]);
    const run = st.pay_run_id ? await one('SELECT id, status, review_deadline, run_date FROM pay_runs WHERE id = $1', [st.pay_run_id]) : null;
    return { ...st, disputes, run };
  }),

  'pay.addLine': def(CO, async (b, { user }) => {
    required(b, 'statement_id', 'kind', 'description', 'amount');
    if (!['bonus', 'expense', 'deduction'].includes(b.kind)) fail(400, 'Invalid line type');
    await tx(async (t) => {
      const st = await t.one("SELECT status, officer_id FROM statements WHERE id = $1 FOR UPDATE", [b.statement_id]);
      if (!st || st.status !== 'draft') fail(400, 'Only draft statements can be changed');
      if ((await guardSelf(user, st.officer_id, { companyOnly: true, message: OWN_PAY })).selfApproved) await t.q('UPDATE statements SET self_approved = true WHERE id = $1', [b.statement_id]);
      const amt = Math.abs(Number(b.amount)) * (b.kind === 'deduction' ? -1 : 1);
      await t.q('INSERT INTO statement_lines (statement_id, kind, description, amount) VALUES ($1,$2,$3,$4)', [b.statement_id, b.kind, b.description, money(amt)]);
      await recalcStatement(t, b.statement_id);
    });
    await audit(user, 'pay.add_line', 'statement', b.statement_id, { kind: b.kind, amount: b.amount, description: b.description });
    return { ok: true };
  }),

  'pay.removeLine': def(CO, async (b, { user }) => {
    await tx(async (t) => {
      const l = need(await t.one("SELECT l.*, st.status, st.officer_id FROM statement_lines l JOIN statements st ON st.id = l.statement_id WHERE l.id = $1", [b.id]));
      if (l.status !== 'draft') fail(400, 'Only draft statements can be changed');
      if ((await guardSelf(user, l.officer_id, { companyOnly: true, message: OWN_PAY })).selfApproved) await t.q('UPDATE statements SET self_approved = true WHERE id = $1', [l.statement_id]);
      if (l.timesheet_id) await t.q('UPDATE timesheets SET statement_id = NULL WHERE id = $1', [l.timesheet_id]);
      await t.q('DELETE FROM statement_lines WHERE id = $1', [b.id]);
      await recalcStatement(t, l.statement_id);
    });
    await audit(user, 'pay.remove_line', 'statement_line', b.id);
    return { ok: true };
  }),

  'pay.delete': def(CO, async (b, { user }) => {
    await tx(async (t) => {
      const st = need(await t.one('SELECT * FROM statements WHERE id = $1', [b.id]));
      if (st.status !== 'draft') fail(400, 'Only draft statements can be deleted');
      await t.q('UPDATE timesheets SET statement_id = NULL WHERE statement_id = $1', [b.id]);
      await t.q('DELETE FROM statements WHERE id = $1', [b.id]);
    });
    await audit(user, 'pay.delete', 'statement', b.id);
    return { ok: true };
  }),

  'pay.issue': def(CO, async (b, { user }) => {
    required(b, 'ids');
    const rows = await q(
      `UPDATE statements SET status = 'issued', issued_at = now(), number = 'RS-' || to_char(period_end, 'YYMMDD') || '-' || upper(substr(id::text, 1, 4))
        WHERE id = ANY($1::uuid[]) AND status = 'draft' AND NOT held
          AND (pay_run_id IS NULL OR (review_status IN ('approved','resolved') AND pay_run_id IN (SELECT id FROM pay_runs WHERE status IN ('reconciled','issued'))))
        RETURNING *`, [b.ids]);
    for (const st of rows) await archiveStatement(st.id, user.id);
    for (const st of rows) {
      await notify(await officerUser(st.officer_id), {
        kind: 'pay', title: 'Your remittance statement is ready', body: `${fmtDate(st.period_start)} – ${fmtDate(st.period_end)}: ${gbp(st.total)}`, link: `/officer/pay/${st.id}`, email: true,
      });
    }
    await audit(user, 'pay.issue', 'statement', null, { ids: rows.map((r) => r.id), via: b.via });
    return { issued: rows.length, skipped: b.ids.length - rows.length };
  }),

  'pay.markPaid': def(CO, async (b, { user }) => {
    required(b, 'ids');
    const rows = await q("UPDATE statements SET status = 'paid', paid_at = now() WHERE id = ANY($1::uuid[]) AND status = 'issued' RETURNING id, officer_id, total", [b.ids]);
    for (const st of rows) await notify(await officerUser(st.officer_id), { kind: 'pay', title: 'Payment sent', body: `${gbp(st.total)} is on its way to your bank.`, link: `/officer/pay/${st.id}` });
    // A run is paid once every statement in it that was issued is paid
    await q(`UPDATE pay_runs r SET status = 'paid', updated_at = now() WHERE r.status = 'issued'
               AND r.id IN (SELECT pay_run_id FROM statements WHERE id = ANY($1::uuid[]))
               AND NOT EXISTS (SELECT 1 FROM statements st WHERE st.pay_run_id = r.id AND st.status = 'issued')`, [rows.map((r) => r.id)]);
    await audit(user, 'pay.mark_paid', 'statement', null, { ids: rows.map((r) => r.id), via: b.via });
    return { paid: rows.length };
  }),

  // The saved copy once issued (identical bytes every time); drafts are built on the fly
  'pay.pdf': def(['company', 'security', 'officer'], async (b, ctx) => {
    const st = await actions['pay.get'].fn(b, ctx);
    if (st.status !== 'draft') {
      const saved = await savedPdf(st.pdf_document_id || await archiveStatement(st.id));
      if (saved) return saved;
    }
    return buildStatementPdf(await loadStatement(st.id));
  }),

  // Bank payment CSV for a period (or chosen statements)
  'pay.exportCsv': def(CO, async (b) => {
    const rows = await q(
      `SELECT st.number, st.total, st.period_start, st.period_end, st.status, o.first_name, o.last_name, o.utr, o.bank_name, o.bank_sort_code, o.bank_account
         FROM statements st JOIN officers o ON o.id = st.officer_id
        WHERE (($1::uuid[] IS NOT NULL AND st.id = ANY($1)) OR ($1::uuid[] IS NULL AND st.period_start = $2)) AND st.status <> 'draft'
        ORDER BY o.last_name`, [b.ids || null, b.period_start || null]);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['Name', 'Sort code', 'Account', 'Amount', 'Reference', 'UTR', 'Period', 'Status'].join(',')]
      .concat(rows.map((r) => [`${r.first_name} ${r.last_name}`, r.bank_sort_code, r.bank_account, Number(r.total).toFixed(2), r.number, r.utr, `${r.period_start} to ${r.period_end}`, r.status].map(esc).join(',')))
      .join('\n');
    return { filename: `payments-${b.period_start || 'selected'}.csv`, csv };
  }),

  // ---------- Venue invoices ----------
  'invoices.generate': def(CO, async (b, { user }) => {
    required(b, 'start', 'end');
    const s = await getSettings();
    const bh = await bankHolidays();
    const all = await q(
      `${TS_SQL}
        WHERE ${periodWhere} AND t.invoice_id IS NULL AND ($3::uuid IS NULL OR s.venue_id = $3) AND ($4::uuid IS NULL OR ps.pay_run_id = $4)
        ORDER BY v.name, s.starts_at`,
      [b.start, b.end, b.venue_id || null, b.pay_run_id || null]);
    const ok = (t) => t.pr_status && ['reconciled', 'issued', 'paid'].includes(t.pr_status) && ['approved', 'resolved'].includes(t.ps_review) && !t.ps_held;
    const rows = all.filter(ok);
    const skipped = all.length - rows.length;
    const byVenue = {};
    for (const t of rows) (byVenue[t.venue_id] ||= []).push(t);
    const missing = [];
    let created = 0;
    for (const [venueId, list] of Object.entries(byVenue)) {
      await tx(async (t) => {
        const runs = [...new Set(list.map((x) => x.ps_run))];
        const inv = await t.one('INSERT INTO invoices (venue_id, period_start, period_end, vat_rate, pay_run_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [venueId, b.start, b.end, s.vat_rate, runs.length === 1 ? runs[0] : null]);
        for (const ts of list) {
          const date = londonDate(ts.starts_at);
          const vr = await venueRate(venueId, ts.role, date);
          if (!vr) missing.push(`${ts.venue_name} (${ts.role_name})`);
          const billable = Math.max(Number(ts.hours), vr ? Number(vr.min_hours) : 0);
          const fr = bandFractions(ts.actual_start, ts.actual_end, s, bh);
          const amount = vr ? bandedAmount(billable, fr, Number(vr.rate), { night: vr.night_uplift, weekend: vr.weekend_uplift, bh: vr.bh_uplift }) : 0;
          const pay = await payFor(ts, s, bh);
          await t.q(
            'INSERT INTO invoice_lines (invoice_id, timesheet_id, description, work_date, hours, rate, amount, pay_cost) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [inv.id, ts.id, `${lineDesc(ts)} · ${ts.first_name} ${ts.last_name[0]}.${vr ? upliftNote(fr, vr) : ''}`, date, billable, billable ? money(amount / billable) : 0, amount, pay.amount]);
          await t.q('UPDATE timesheets SET invoice_id = $2 WHERE id = $1', [ts.id, inv.id]);
        }
        await recalcInvoice(t, inv.id);
      });
      created++;
    }
    await audit(user, 'invoice.generate', 'invoice', null, { start: b.start, end: b.end, created, skipped, via: b.via });
    if (created) await reconcileAfter(b.start, b.end);
    // Skipped: signed hours not yet approved by the officer in a finalised pay run
    return { created, timesheets: rows.length, skipped, missing_rates: [...new Set(missing)] };
  }),

  'invoices.list': def(['company', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `SELECT i.*, v.name AS venue_name, c.name AS client_name FROM invoices i JOIN venues v ON v.id = i.venue_id LEFT JOIN clients c ON c.id = v.client_id
        WHERE ($1::uuid[] IS NULL OR i.venue_id = ANY($1)) AND ($2::text IS NULL OR i.status = $2) AND ($3::uuid IS NULL OR i.venue_id = $3)
          ${user.role === 'venue' ? "AND i.status NOT IN ('draft','void')" : ''}
        ORDER BY i.created_at DESC LIMIT 500`, [scope, b.status || null, b.venue_id || null]);
  }),

  'invoices.get': def(['company', 'venue'], async (b, { user }) => {
    const inv = await loadInvoice(b.id);
    await assertVenue(user, inv.venue_id);
    if (user.role === 'venue' && ['draft', 'void'].includes(inv.status)) fail(404, 'Not found');
    if (user.role === 'venue') for (const l of inv.lines) delete l.pay_cost;
    return inv;
  }),

  'invoices.addLine': def(CO, async (b, { user }) => {
    required(b, 'invoice_id', 'description', 'amount');
    await tx(async (t) => {
      const inv = await t.one('SELECT status FROM invoices WHERE id = $1 FOR UPDATE', [b.invoice_id]);
      if (!inv || inv.status !== 'draft') fail(400, 'Only draft invoices can be changed');
      await t.q('INSERT INTO invoice_lines (invoice_id, description, hours, rate, amount) VALUES ($1,$2,$3,$4,$5)',
        [b.invoice_id, b.description, b.hours || null, b.rate || null, money(b.amount)]);
      await recalcInvoice(t, b.invoice_id);
    });
    await audit(user, 'invoice.add_line', 'invoice', b.invoice_id, { description: b.description, amount: b.amount });
    return { ok: true };
  }),

  'invoices.updateLine': def(CO, async (b, { user }) => {
    required(b, 'id');
    await tx(async (t) => {
      const l = need(await t.one('SELECT l.*, i.status FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE l.id = $1', [b.id]));
      if (l.status !== 'draft') fail(400, 'Only draft invoices can be changed');
      const hours = b.hours ?? l.hours;
      const rate = b.rate ?? l.rate;
      const amount = b.amount ?? (hours != null && rate != null ? money(hours * rate) : l.amount);
      await t.q('UPDATE invoice_lines SET description = $2, hours = $3, rate = $4, amount = $5 WHERE id = $1', [b.id, b.description ?? l.description, hours, rate, amount]);
      await recalcInvoice(t, l.invoice_id);
    });
    await audit(user, 'invoice.update_line', 'invoice_line', b.id, b);
    return { ok: true };
  }),

  'invoices.removeLine': def(CO, async (b, { user }) => {
    await tx(async (t) => {
      const l = need(await t.one('SELECT l.*, i.status FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE l.id = $1', [b.id]));
      if (l.status !== 'draft') fail(400, 'Only draft invoices can be changed');
      if (l.timesheet_id) await t.q('UPDATE timesheets SET invoice_id = NULL WHERE id = $1', [l.timesheet_id]);
      await t.q('DELETE FROM invoice_lines WHERE id = $1', [b.id]);
      await recalcInvoice(t, l.invoice_id);
    });
    await audit(user, 'invoice.remove_line', 'invoice_line', b.id);
    return { ok: true };
  }),

  'invoices.update': def(CO, async (b) => {
    const inv = need(await one('SELECT status FROM invoices WHERE id = $1', [b.id]));
    if (inv.status !== 'draft') fail(400, 'Only draft invoices can be changed');
    await q('UPDATE invoices SET notes = COALESCE($2, notes) WHERE id = $1', [b.id, b.notes ?? null]);
    return { ok: true };
  }),

  'invoices.delete': def(CO, async (b, { user }) => {
    await tx(async (t) => {
      const inv = need(await t.one('SELECT * FROM invoices WHERE id = $1', [b.id]));
      if (inv.status !== 'draft') fail(400, 'Issued invoices cannot be deleted — raise a credit note');
      await t.q('UPDATE timesheets SET invoice_id = NULL WHERE invoice_id = $1', [b.id]);
      await t.q('DELETE FROM invoices WHERE id = $1', [b.id]);
    });
    await audit(user, 'invoice.delete', 'invoice', b.id);
    return { ok: true };
  }),

  'invoices.issue': def(CO, async (b, { user }) => {
    required(b, 'id');
    const inv = await tx(async (t) => {
      const cur = need(await t.one('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [b.id]));
      if (cur.status !== 'draft') fail(400, 'Already issued');
      const s = await t.one('UPDATE settings SET invoice_seq = invoice_seq + 1 RETURNING invoice_prefix, invoice_seq, payment_terms_days');
      return t.one(
        `UPDATE invoices SET status = 'issued', number = $2, issue_date = (now() AT TIME ZONE 'Europe/London')::date,
           due_date = (now() AT TIME ZONE 'Europe/London')::date + $3::int WHERE id = $1 RETURNING *`,
        [b.id, `${s.invoice_prefix}${s.invoice_seq}`, s.payment_terms_days]);
    });
    const v = await one('SELECT name FROM venues WHERE id = $1', [inv.venue_id]);
    await notify(await venueContacts(inv.venue_id), {
      kind: 'invoice', title: `Invoice ${inv.number}`, body: `${v.name} · ${gbp(inv.gross)} due ${fmtDate(inv.due_date)}`, link: `/venue/invoices/${inv.id}`, email: true,
    });
    const docId = await archiveInvoice(inv.id, user.id);
    await audit(user, 'invoice.issue', 'invoice', inv.id, { number: inv.number, gross: inv.gross, via: b.via });
    return { ...inv, pdf_document_id: docId };
  }),

  'invoices.markPaid': def(CO, async (b, { user }) => {
    const inv = need(await one("UPDATE invoices SET status = 'paid', paid_at = COALESCE($2::timestamptz, now()) WHERE id = $1 AND status IN ('issued','overdue') RETURNING *", [b.id, b.paid_at || null]), 'Invoice not outstanding');
    await audit(user, 'invoice.paid', 'invoice', inv.id);
    return inv;
  }),

  'invoices.credit': def(CO, async (b, { user }) => {
    required(b, 'id', 'reason');
    const orig = need(await one("SELECT * FROM invoices WHERE id = $1 AND kind = 'invoice' AND status IN ('issued','paid','overdue')", [b.id]), 'Invoice not found');
    const amount = money(b.amount != null ? Math.min(Math.abs(Number(b.amount)), Number(orig.net)) : Number(orig.net));
    const cn = await tx(async (t) => {
      const s = await t.one('UPDATE settings SET invoice_seq = invoice_seq + 1 RETURNING invoice_prefix, invoice_seq');
      const c = await t.one(
        `INSERT INTO invoices (venue_id, kind, credit_of, number, period_start, period_end, vat_rate, status, issue_date, notes)
         VALUES ($1,'credit',$2,$3,$4,$5,$6,'issued',(now() AT TIME ZONE 'Europe/London')::date,$7) RETURNING *`,
        [orig.venue_id, orig.id, `${s.invoice_prefix}CN${s.invoice_seq}`, orig.period_start, orig.period_end, orig.vat_rate, b.reason]);
      await t.q('INSERT INTO invoice_lines (invoice_id, description, amount) VALUES ($1,$2,$3)', [c.id, `Credit against ${orig.number}: ${b.reason}`, -amount]);
      await recalcInvoice(t, c.id);
      if (amount >= Number(orig.net) && orig.status !== 'paid') await t.q("UPDATE invoices SET status = 'void' WHERE id = $1", [orig.id]);
      return t.one('SELECT * FROM invoices WHERE id = $1', [c.id]);
    });
    cn.pdf_document_id = await archiveInvoice(cn.id, user.id);
    await notify(await venueContacts(orig.venue_id), { kind: 'invoice', title: `Credit note ${cn.number}`, body: `${gbp(-cn.gross)} against ${orig.number}`, link: `/venue/invoices/${cn.id}`, email: true });
    await audit(user, 'invoice.credit', 'invoice', orig.id, { credit: cn.id, amount, reason: b.reason });
    return cn;
  }),

  'invoices.pdf': def(['company', 'venue'], async (b, ctx) => {
    const inv = await actions['invoices.get'].fn(b, ctx);
    if (inv.status !== 'draft') {
      const saved = await savedPdf(inv.pdf_document_id || await archiveInvoice(inv.id));
      if (saved) return saved;
    }
    return buildInvoicePdf(inv);
  }),

  'invoices.exportCsv': def(CO, async (b) => {
    const rows = await q(
      `SELECT i.number, i.kind, i.issue_date, i.due_date, i.net, i.vat, i.gross, i.status, v.name AS venue, c.name AS client
         FROM invoices i JOIN venues v ON v.id = i.venue_id LEFT JOIN clients c ON c.id = v.client_id
        WHERE i.status NOT IN ('draft') AND ($1::date IS NULL OR i.issue_date >= $1) AND ($2::date IS NULL OR i.issue_date <= $2) ORDER BY i.issue_date, i.number`,
      [b.from || null, b.to || null]);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['Number', 'Type', 'Issue date', 'Due date', 'Client', 'Venue', 'Net', 'VAT', 'Gross', 'Status'].join(',')]
      .concat(rows.map((r) => [r.number, r.kind, r.issue_date, r.due_date, r.client, r.venue, r.net, r.vat, r.gross, r.status].map(esc).join(','))).join('\n');
    return { filename: `invoices-${b.from || 'all'}-${b.to || ''}.csv`, csv };
  }),

  // ---------- Reports ----------
  'reports.margin': def(CO, async (b) => {
    required(b, 'from', 'to');
    return q(
      `SELECT v.id, v.name AS venue_name, sum(l.hours) AS hours, sum(l.amount) AS revenue, sum(l.pay_cost) AS pay_cost, sum(l.amount) - sum(l.pay_cost) AS margin
         FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id JOIN venues v ON v.id = i.venue_id
        WHERE i.status <> 'void' AND i.kind = 'invoice' AND l.work_date BETWEEN $1 AND $2
        GROUP BY v.id ORDER BY revenue DESC`, [b.from, b.to]);
  }),

  'reports.hours': def(CO, async (b) => {
    required(b, 'from', 'to');
    return q(
      `SELECT to_char(date_trunc('week', s.starts_at AT TIME ZONE 'Europe/London'), 'YYYY-MM-DD') AS week, v.name AS venue_name, sum(t.hours) AS hours
         FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
        WHERE (s.starts_at AT TIME ZONE 'Europe/London')::date BETWEEN $1 AND $2 GROUP BY 1, 2 ORDER BY 1, 2`, [b.from, b.to]);
  }),

  'reports.overdue': def(CO, async () =>
    q("SELECT i.*, v.name AS venue_name FROM invoices i JOIN venues v ON v.id = i.venue_id WHERE i.status = 'overdue' ORDER BY due_date")),
};
