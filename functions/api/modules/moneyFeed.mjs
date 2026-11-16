// The live money feed: approved and signed timesheets sit on their venue's draft invoice and the officer's draft pay statement
// straight away, and follow every later change (query, decline, rate change, reopen, cancelled shift) while the draft is open.
// Issued invoices and pay runs past draft never move; only venue-signed lines are billed or paid (see moneyFeedRules.mjs).
import { one, q, tx } from '../lib/db.mjs';
import { money } from '../lib/rates.mjs';
import { londonDate } from '../lib/time.mjs';
import { getSettings } from './settings.mjs';
import { payFor, chargeFor, bankHolidaySet, recalcInvoice, recalcStatement, lineDesc, upliftNote } from './money.mjs';
import { wanted, billed, pickTarget, lineChanged, unsignedLines } from '../lib/moneyFeedRules.mjs';

const LOCK = 424243;
/** SQL to hand a timesheet back to the feed */
export const FEED_AGAIN = 'feed_dirty = true, feed_since = now()';

const ROW_SQL = `
  SELECT t.*, a.officer_id, s.starts_at, s.role, r.name AS role_name, s.venue_id, s.stream_id, v.name AS venue_name, v.invoice_cycle AS venue_cycle,
         o.first_name, o.last_name, (a.status NOT IN ('assigned','accepted') OR s.status = 'cancelled') AS cancelled,
         i.status AS invoice_status, i.venue_id AS invoice_venue, i.stream_id AS invoice_stream,
         st.status AS statement_status, st.officer_id AS statement_officer, pr.status AS run_status, st.pay_run_id AS statement_run
    FROM timesheets t JOIN shift_assignments a ON a.id = t.assignment_id JOIN shifts s ON s.id = a.shift_id
    JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role JOIN officers o ON o.id = a.officer_id
    LEFT JOIN invoices i ON i.id = t.invoice_id LEFT JOIN statements st ON st.id = t.statement_id LEFT JOIN pay_runs pr ON pr.id = st.pay_run_id
   WHERE t.id = ANY($1::uuid[])
   FOR UPDATE OF t`;

const CYCLES = ['weekly', 'fortnightly', 'monthly'];
const cycle = (v, fallback) => (CYCLES.includes(v) ? v : CYCLES.includes(fallback) ? fallback : 'weekly');

// The open draft of the venue's billing stream for this date (or the next one, for a late line), opened if there is none.
// Each stream bills on its own: issuing one stream's invoice leaves the others' drafts open.
async function draftInvoice(t, r, date, today, s) {
  const list = await t.q(
    `SELECT id, period_start, period_end, status FROM invoices
      WHERE venue_id = $1 AND stream_id = $3 AND kind = 'invoice' AND status <> 'void' AND period_start IS NOT NULL AND period_end >= $2::date - 62`, [r.venue_id, date, r.stream_id]);
  const kind = cycle(r.venue_cycle, s.invoice_cycle);
  const pick = pickTarget({ kind, date, today, drafts: list.filter((d) => d.status === 'draft'), closed: list.filter((d) => d.status !== 'draft') });
  if (pick.use) return pick.use;
  const inv = await t.one('INSERT INTO invoices (venue_id, stream_id, period_start, period_end, vat_rate) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [r.venue_id, r.stream_id, pick.create.start, pick.create.end, s.vat_rate]);
  return inv.id;
}

// The officer's draft statement in the open pay run for this date (or the next one), opened if there is none
async function draftStatement(t, r, date, today, s) {
  const runs = await t.q('SELECT id, period_start, period_end, status FROM pay_runs WHERE period_end >= $1::date - 62', [date]);
  const pick = pickTarget({ kind: cycle(s.pay_period), date, today, drafts: runs.filter((x) => x.status === 'draft'), closed: runs.filter((x) => x.status !== 'draft') });
  const run = pick.use ? runs.find((x) => x.id === pick.use)
    : await t.one(`INSERT INTO pay_runs (period_start, period_end, run_date, created_via) VALUES ($1,$2,(now() AT TIME ZONE 'Europe/London')::date,'auto') RETURNING *`,
      [pick.create.start, pick.create.end]);
  const st = await t.one("SELECT id FROM statements WHERE pay_run_id = $1 AND officer_id = $2 AND status = 'draft' ORDER BY created_at LIMIT 1", [run.id, r.officer_id])
    || await t.one('INSERT INTO statements (officer_id, period_start, period_end, pay_run_id) VALUES ($1,$2,$3,$4) RETURNING id', [r.officer_id, run.period_start, run.period_end, run.id]);
  return st.id;
}

async function invoiceValues(t, r, s, bh) {
  const c = await chargeFor(r, s, bh, t);
  const pay = await payFor(r, s, bh, t);
  const amount = c.amount ?? 0;
  return {
    description: `${lineDesc(r)} · ${r.first_name} ${r.last_name[0]}.${c.vr ? upliftNote(c.fr, c.vr, c.base) : ''}`,
    work_date: londonDate(r.starts_at), hours: Number(c.billable || 0), rate: c.billable ? money(amount / c.billable) : 0, amount: money(amount), pay_cost: money(pay.amount),
  };
}

async function statementValues(t, r, s, bh) {
  const p = await payFor(r, s, bh, t);
  const hours = Number(r.hours || 0);
  return { description: lineDesc(r), work_date: londonDate(r.starts_at), hours, rate: hours ? money(p.amount / hours) : p.rate || 0, amount: money(p.amount) };
}

async function upsertLine(t, table, owner, ownerId, tsId, vals) {
  const cur = await t.one(`SELECT * FROM ${table} WHERE ${owner} = $1 AND timesheet_id = $2 ORDER BY id LIMIT 1`, [ownerId, tsId]);
  const cols = Object.keys(vals);
  if (!cur) {
    const extra = table === 'statement_lines' ? ['kind'] : [];
    const all = [owner, 'timesheet_id', ...extra, ...cols];
    await t.q(`INSERT INTO ${table} (${all.join(', ')}) VALUES (${all.map((_, i) => `$${i + 1}`).join(', ')})`,
      [ownerId, tsId, ...(extra.length ? ['hours'] : []), ...cols.map((k) => vals[k])]);
    return true;
  }
  if (!lineChanged(cur, vals)) return false;
  await t.q(`UPDATE ${table} SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [cur.id, ...cols.map((k) => vals[k])]);
  return true;
}

/**
 * Bring the draft lines of these timesheets in line with them. Idempotent: running it twice changes nothing.
 * Returns how many lines were added, changed or dropped.
 */
export async function syncTimesheets(ids) {
  ids = [...new Set((ids || []).filter(Boolean))];
  if (!ids.length) return { synced: 0, changed: 0 };
  const s = await getSettings();
  const bh = await bankHolidaySet();
  const today = londonDate(new Date());
  return tx(async (t) => {
    await t.q('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    const rows = await t.q(ROW_SQL, [ids]);
    const touchedInv = new Set();
    const touchedSt = new Set();
    let changed = 0;
    for (const r of rows) {
      const want = wanted(r);
      const date = londonDate(r.starts_at);

      // Venue side
      if (!billed({ invoice_id: r.invoice_id, invoice_status: r.invoice_status })) {
        let invId = r.invoice_status ? r.invoice_id : null; // a dangling id (draft deleted) counts as none
        if (invId && (!want || r.invoice_venue !== r.venue_id || r.invoice_stream !== r.stream_id)) {
          await t.q('DELETE FROM invoice_lines WHERE invoice_id = $1 AND timesheet_id = $2', [invId, r.id]);
          touchedInv.add(invId);
          invId = null;
          changed++;
        }
        if (want) {
          invId ||= await draftInvoice(t, r, date, today, s);
          if (await upsertLine(t, 'invoice_lines', 'invoice_id', invId, r.id, await invoiceValues(t, r, s, bh))) { touchedInv.add(invId); changed++; }
        }
        if (invId !== r.invoice_id) await t.q('UPDATE timesheets SET invoice_id = $2 WHERE id = $1', [r.id, invId]);
      }

      // Pay side
      if (!billed({ statement_id: r.statement_id, statement_status: r.statement_status, run_status: r.run_status })) {
        let stId = r.statement_status ? r.statement_id : null;
        if (stId && (!want || r.statement_officer !== r.officer_id)) {
          await t.q('DELETE FROM statement_lines WHERE statement_id = $1 AND timesheet_id = $2', [stId, r.id]);
          touchedSt.add(stId);
          stId = null;
          changed++;
        }
        if (want) {
          stId ||= await draftStatement(t, r, date, today, s);
          if (await upsertLine(t, 'statement_lines', 'statement_id', stId, r.id, await statementValues(t, r, s, bh))) { touchedSt.add(stId); changed++; }
        }
        if (stId !== r.statement_id) await t.q('UPDATE timesheets SET statement_id = $2 WHERE id = $1', [r.id, stId]);
      }
    }
    await t.q('UPDATE timesheets SET feed_dirty = false WHERE id = ANY($1::uuid[])', [rows.map((r) => r.id)]);
    await tidy(t, [...touchedInv], [...touchedSt]);
    return { synced: rows.length, changed };
  });
}

// Totals follow the lines; a draft the feed has emptied goes (with its pay run, if that is empty too)
async function tidy(t, invIds, stIds) {
  for (const id of invIds) await recalcInvoice(t, id);
  for (const id of stIds) await recalcStatement(t, id);
  if (invIds.length) {
    await t.q(`DELETE FROM invoices i WHERE i.id = ANY($1::uuid[]) AND i.status = 'draft' AND NOT EXISTS (SELECT 1 FROM invoice_lines WHERE invoice_id = i.id)`, [invIds]);
  }
  if (stIds.length) {
    const runs = (await t.q('SELECT DISTINCT pay_run_id FROM statements WHERE id = ANY($1::uuid[]) AND pay_run_id IS NOT NULL', [stIds])).map((x) => x.pay_run_id);
    await t.q(`DELETE FROM statements st WHERE st.id = ANY($1::uuid[]) AND st.status = 'draft'
                 AND NOT EXISTS (SELECT 1 FROM statement_lines WHERE statement_id = st.id) AND NOT EXISTS (SELECT 1 FROM statement_disputes WHERE statement_id = st.id)`, [stIds]);
    if (runs.length) await t.q("DELETE FROM pay_runs r WHERE r.id = ANY($1::uuid[]) AND r.status = 'draft' AND NOT EXISTS (SELECT 1 FROM statements WHERE pay_run_id = r.id)", [runs]);
  }
}

/** After a request: timesheets changed in the last few moments (the backlog is left to the sweep) */
export async function syncRecent(limit = 50) {
  const ids = (await q('SELECT id FROM timesheets WHERE feed_dirty AND feed_since IS NOT NULL ORDER BY feed_since LIMIT $1', [limit])).map((r) => r.id);
  return ids.length ? syncTimesheets(ids) : { synced: 0, changed: 0 };
}

/**
 * Every 5 minutes (and on Generate): everything marked for the feed, then a re-check of every line on an open draft so
 * rate-card or shift changes never leave a draft stale. The first run after go-live pulls the existing backlog onto drafts.
 * Drafts only: nothing is issued, sent or emailed here.
 */
export async function sweep({ batches = 10, size = 100 } = {}) {
  // Nothing to do for these: never wanted and on nothing, or billed on both sides
  await q(`UPDATE timesheets SET feed_dirty = false WHERE feed_dirty AND invoice_id IS NULL AND statement_id IS NULL AND status NOT IN ('approved','signed')`);
  await q(`UPDATE timesheets t SET feed_dirty = false WHERE feed_dirty AND t.invoice_id IS NOT NULL AND t.statement_id IS NOT NULL
             AND timesheet_billed(NULL, t.invoice_id) AND timesheet_billed(t.statement_id, NULL)`);
  const out = { synced: 0, changed: 0 };
  const add = (r) => { out.synced += r.synced; out.changed += r.changed; };
  for (let i = 0; i < batches; i++) {
    const ids = (await q('SELECT id FROM timesheets WHERE feed_dirty ORDER BY feed_since NULLS LAST, id LIMIT $1', [size])).map((r) => r.id);
    if (!ids.length) break;
    add(await syncTimesheets(ids));
  }
  const open = (await q(
    `SELECT DISTINCT l.timesheet_id AS id FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id WHERE i.status = 'draft' AND l.timesheet_id IS NOT NULL
     UNION SELECT DISTINCT l.timesheet_id FROM statement_lines l JOIN statements st ON st.id = l.statement_id LEFT JOIN pay_runs r ON r.id = st.pay_run_id
      WHERE st.status = 'draft' AND COALESCE(r.status, 'draft') = 'draft' AND l.timesheet_id IS NOT NULL
     LIMIT 2000`)).map((r) => r.id);
  for (let i = 0; i < open.length; i += size) add(await syncTimesheets(open.slice(i, i + size)));
  return out;
}

/**
 * Take the lines whose timesheet the venue has not signed off out of an invoice or a pay run that is about to leave draft.
 * Runs inside the caller's transaction; the caller syncs the returned timesheets afterwards so they land on the next draft.
 */
export async function holdBackUnsigned(t, { invoiceId, runId }) {
  const lines = invoiceId
    ? await t.q('SELECT l.id, l.timesheet_id, ts.status AS ts_status, l.invoice_id AS owner FROM invoice_lines l LEFT JOIN timesheets ts ON ts.id = l.timesheet_id WHERE l.invoice_id = $1', [invoiceId])
    : await t.q(`SELECT l.id, l.timesheet_id, ts.status AS ts_status, l.statement_id AS owner FROM statement_lines l JOIN statements st ON st.id = l.statement_id
                  LEFT JOIN timesheets ts ON ts.id = l.timesheet_id WHERE st.pay_run_id = $1 AND st.status = 'draft'`, [runId]);
  const move = unsignedLines(lines);
  if (move.length) {
    const table = invoiceId ? 'invoice_lines' : 'statement_lines';
    await t.q(`DELETE FROM ${table} WHERE id = ANY($1::uuid[])`, [move.map((l) => l.id)]);
    await t.q(`UPDATE timesheets SET ${invoiceId ? 'invoice_id' : 'statement_id'} = NULL, ${FEED_AGAIN} WHERE id = ANY($1::uuid[])`, [move.map((l) => l.timesheet_id)]);
    const owners = [...new Set(move.map((l) => l.owner))];
    if (invoiceId) await recalcInvoice(t, invoiceId);
    else {
      for (const id of owners) await recalcStatement(t, id);
      await t.q(`DELETE FROM statements st WHERE st.id = ANY($1::uuid[]) AND NOT EXISTS (SELECT 1 FROM statement_lines WHERE statement_id = st.id)`, [owners]);
    }
  }
  return { moved: move.map((l) => l.timesheet_id), kept: lines.length - move.length };
}

/** Billed on either side, for code outside SQL (clock rebuilds, manual times) */
export async function isBilled(ts) {
  if (!ts || (!ts.statement_id && !ts.invoice_id)) return false;
  return (await one('SELECT timesheet_billed($1, $2) AS b', [ts.statement_id || null, ts.invoice_id || null])).b;
}
