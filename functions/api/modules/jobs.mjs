// Scheduled work, run every 10 minutes by the platform timer (event.source === 'schedule').
import { q } from '../lib/db.mjs';
import { notify, managersFor, officerUser, companyManagers } from '../lib/notify.mjs';
import { fmtDate, fmtTime, londonDate, addDays } from '../lib/time.mjs';
import { buildTimesheet } from './clock.mjs';
import { getSettings } from './settings.mjs';

// Late / no-show: published assignment, past grace, no valid clock-in
async function lateAlerts(s) {
  const rows = await q(
    `UPDATE shift_assignments a SET late_alerted = true
       FROM shifts s, officers o, venues v
      WHERE s.id = a.shift_id AND o.id = a.officer_id AND v.id = s.venue_id
        AND a.status IN ('assigned','accepted') AND s.status = 'published' AND NOT a.late_alerted
        AND s.starts_at + make_interval(mins => $1) < now() AND s.ends_at > now()
        AND NOT EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status <> 'rejected')
      RETURNING a.id, a.officer_id, s.venue_id, s.starts_at, v.name AS venue_name, o.first_name || ' ' || o.last_name AS officer_name`, [s.grace_minutes]);
  for (const r of rows) {
    await notify(await managersFor(r.venue_id), {
      kind: 'late', severity: 'warning', title: `${r.officer_name} not clocked in`, body: `${r.venue_name} · shift started ${fmtTime(r.starts_at)}`,
      link: '/company/live', dedupe: `late:${r.id}`, email: true,
    });
    await notify(await officerUser(r.officer_id), {
      kind: 'late', severity: 'warning', title: 'You have not clocked in', body: `${r.venue_name} started at ${fmtTime(r.starts_at)}. Clock in now or contact your supervisor.`,
      link: '/officer/clock', dedupe: `late:${r.id}`,
    });
  }
  return rows.length;
}

async function reminders() {
  const rows = await q(
    `UPDATE shift_assignments a SET reminded = true FROM shifts s, venues v
      WHERE s.id = a.shift_id AND v.id = s.venue_id AND a.status IN ('assigned','accepted') AND s.status = 'published' AND NOT a.reminded
        AND s.starts_at BETWEEN now() AND now() + interval '2 hours'
      RETURNING a.id, a.officer_id, s.starts_at, v.name AS venue_name, v.postcode`);
  for (const r of rows) {
    await notify(await officerUser(r.officer_id), {
      kind: 'reminder', title: `Shift at ${fmtTime(r.starts_at)} today`, body: `${r.venue_name}${r.postcode ? `, ${r.postcode}` : ''}. Scan the venue QR code to clock in.`,
      link: '/officer', dedupe: `remind:${r.id}`, email: true,
    });
  }
  return rows.length;
}

// Shifts that ended with a clock-in but no clock-out (2 h grace) — build a flagged timesheet
async function closeOpenShifts() {
  const rows = await q(
    `SELECT a.id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
      WHERE s.ends_at < now() - interval '2 hours' AND s.ends_at > now() - interval '14 days'
        AND EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status IN ('ok','approved','manual'))
        AND NOT EXISTS (SELECT 1 FROM timesheets t WHERE t.assignment_id = a.id)`);
  for (const r of rows) await buildTimesheet(r.id);
  return rows.length;
}

// Approved timesheets the venue has not acted on within N days are signed automatically
async function autoSignoff(s) {
  const rows = await q(
    `UPDATE timesheets SET status = 'signed', signed_at = now(), auto_signed = true, updated_at = now()
      WHERE status = 'approved' AND approved_at < now() - make_interval(days => $1) RETURNING id`, [s.auto_signoff_days]);
  return rows.length;
}

// SIA / right-to-work / document expiry at 60, 30, 7 and 0 days
async function expiryAlerts() {
  const today = londonDate(new Date());
  const marks = [60, 30, 7, 0];
  const dates = marks.map((d) => addDays(today, d));
  const officers = await q(
    `SELECT id, first_name || ' ' || last_name AS name, sia_expiry, rtw_expiry FROM officers
      WHERE status IN ('active','onboarding') AND (sia_expiry = ANY($1::date[]) OR rtw_expiry = ANY($1::date[]))`, [dates]);
  const docs = await q(
    `SELECT d.id, d.title, d.expiry, d.owner_id, o.first_name || ' ' || o.last_name AS name FROM documents d JOIN officers o ON o.id = d.owner_id
      WHERE d.owner_type = 'officer' AND d.kind NOT IN ('sia','rtw') AND o.status IN ('active','onboarding') AND d.expiry = ANY($1::date[])`, [dates]);
  const company = await companyManagers();
  let n = 0;
  const send = async (officerId, name, what, expiry, key) => {
    const days = marks[dates.indexOf(expiry)];
    const when = days === 0 ? 'expires today' : `expires in ${days} days (${fmtDate(expiry)})`;
    const severity = days <= 7 ? 'critical' : 'warning';
    await notify(company, { kind: 'expiry', severity, title: `${name}: ${what} ${days === 0 ? 'expires today' : `in ${days} days`}`, body: `${what} ${when}.`, link: `/company/staff/${officerId}`, dedupe: `${key}:${expiry}:${days}`, email: days <= 30 });
    await notify(await officerUser(officerId), { kind: 'expiry', severity, title: `Your ${what} ${when}`, body: days === 0 ? 'You cannot be rostered or clock in until it is renewed.' : 'Upload the renewed document in the app.', link: '/officer/documents', dedupe: `${key}:${expiry}:${days}`, email: true });
    n++;
  };
  for (const o of officers) {
    if (dates.includes(o.sia_expiry)) await send(o.id, o.name, 'SIA licence', o.sia_expiry, `sia:${o.id}`);
    if (dates.includes(o.rtw_expiry)) await send(o.id, o.name, 'right to work', o.rtw_expiry, `rtw:${o.id}`);
  }
  for (const d of docs) await send(d.owner_id, d.name, d.title, d.expiry, `doc:${d.id}`);
  return n;
}

async function overdueInvoices() {
  const rows = await q(
    `UPDATE invoices SET status = 'overdue' WHERE status = 'issued' AND kind = 'invoice' AND due_date < (now() AT TIME ZONE 'Europe/London')::date
      RETURNING id, number, gross`);
  if (rows.length) {
    await notify(await companyManagers(), {
      kind: 'invoice', severity: 'warning', title: `${rows.length} invoice${rows.length > 1 ? 's' : ''} now overdue`, body: rows.map((r) => r.number).join(', '), link: '/company/invoices?status=overdue',
    });
  }
  return rows.length;
}

export async function runJobs() {
  const s = await getSettings();
  const result = {};
  for (const [name, fn] of Object.entries({ lateAlerts, reminders, closeOpenShifts, autoSignoff, expiryAlerts, overdueInvoices })) {
    try {
      result[name] = await fn(s);
    } catch (e) {
      console.error(`[jobs] ${name} failed:`, e);
      result[name] = `error: ${e.message}`;
    }
  }
  console.log('[jobs]', JSON.stringify(result));
  return result;
}
