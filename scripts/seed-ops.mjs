// Ops AI demo data, run once after seed.mjs:
//   DATABASE_URL=... node scripts/seed-ops.mjs
// Adds a shift Aisha hasn't clocked in for, an hours mismatch on Marcus's draft pay, and venue feedback to give.
import fs from 'node:fs';
import { handler } from '../functions/api/index.mjs';
import { q, one } from '../functions/api/lib/db.mjs';
import { recalcStatement } from '../functions/api/modules/money.mjs';
import { londonDate, addDays } from '../functions/api/lib/time.mjs';

const creds = JSON.parse(fs.readFileSync(new URL('./.demo-credentials.json', import.meta.url)));

async function call(action, body = {}, token) {
  const res = await handler({
    requestContext: { http: { method: 'POST' } },
    headers: { 'x-forwarded-for': '127.0.0.1', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...body }),
  });
  const data = JSON.parse(res.body);
  if (res.statusCode >= 400) throw new Error(`${action} → ${res.statusCode}: ${data.error}`);
  return data;
}

const officerByEmail = (email) => one('SELECT o.* FROM officers o JOIN users u ON u.id = o.user_id WHERE lower(u.email) = lower($1)', [email]);

async function main() {
  const { token: CO } = await call('auth.login', creds.company);
  if (await one("SELECT 1 FROM shifts WHERE notes = 'ops-demo'")) { console.log('Ops demo already seeded — skipped.'); return; }
  const aisha = await officerByEmail(creds.officer_aisha.email);
  const marcus = await officerByEmail(creds.officer_marcus.email);
  const lantern = await one("SELECT id FROM venues WHERE name = 'The Lantern Rooms'");

  // 1. A shift that started 15 minutes ago with Aisha booked and no clock-in
  const s = await call('shifts.save', { venue_id: lantern.id, role: 'door', starts_at: new Date(Date.now() - 15 * 60000).toISOString(),
    ends_at: new Date(Date.now() + 6 * 3600000).toISOString(), headcount: 1, break_minutes: 30, status: 'draft', notes: 'ops-demo' }, CO);
  const a = await call('shifts.assign', { shift_id: s.id, officer_id: aisha.id, override: true }, CO);
  await call('shifts.publish', { ids: [s.id] }, CO);
  await q("UPDATE shift_assignments SET status = 'accepted' WHERE id = $1", [a.id]);

  // 2. One hour missing from a line on Marcus's draft pay statement (falls back to any draft statement)
  const line = await one(
    `SELECT l.*, st.period_start, st.period_end FROM statement_lines l JOIN statements st ON st.id = l.statement_id
      WHERE st.status = 'draft' AND l.kind = 'hours' AND l.timesheet_id IS NOT NULL AND l.hours > 2
      ORDER BY (st.officer_id = $1) DESC, l.work_date DESC LIMIT 1`, [marcus.id]);
  if (line) {
    await q('UPDATE statement_lines SET hours = hours - 1, amount = round((hours - 1) * rate, 2) WHERE id = $1', [line.id]);
    await recalcStatement({ q, one }, line.statement_id);
  }

  // 3. Last week's Lantern shifts waiting for the venue's star ratings
  const fb = await q(
    `INSERT INTO venue_feedback (shift_id, venue_id, officer_id, requested_at)
     SELECT s.id, s.venue_id, a.officer_id, now() FROM shifts s JOIN shift_assignments a ON a.shift_id = s.id
      WHERE s.venue_id = $1 AND s.status = 'published' AND s.ends_at < now() AND s.ends_at > now() - interval '10 days' AND a.status = 'accepted'
        AND EXISTS (SELECT 1 FROM timesheets t WHERE t.assignment_id = a.id)
     ON CONFLICT DO NOTHING RETURNING id`, [lantern.id]);

  // 4. Let Ops AI look at it all: chase Aisha and check last week's hours
  const today = londonDate(new Date());
  const run = await call('ops.runNow', { reconcile: true, start: line ? String(line.period_start).slice(0, 10) : addDays(today, -14), end: line ? String(line.period_end).slice(0, 10) : today }, CO);
  console.log(JSON.stringify({ ok: true, chase_shift: s.id, mismatch_line: line?.id || null, feedback_rows: fb.length, run }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
