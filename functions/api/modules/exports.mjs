// Spreadsheet exports for the ⋯ menus: each reuses its page's own list action (and so its role and venue checks),
// then keeps only the columns this user may see
import { ALL, CO, MGR, def } from './_def.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { toCsv, columnsFor } from '../lib/csv.mjs';
import { londonDate } from '../lib/time.mjs';
import { actions as officers } from './officers.mjs';
import { actions as timesheets } from './timesheets.mjs';
import { actions as incidents } from './incidents.mjs';
import { actions as hr } from './hr.mjs';
import { actions as users } from './users.mjs';
import { actions as bans } from './bans.mjs';

const day = (d) => (d ? londonDate(new Date(d)) : '');
const stamp = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '');
const file = (name) => `${name}-${londonDate(new Date())}.csv`;
const out = (name, rows, cols, user) => ({ filename: file(name), csv: toCsv(rows, columnsFor(cols, user, canSeePay), { pay: true }) });

export const COLUMNS = {
  staff: [
    { h: 'First name', v: (o) => o.first_name }, { h: 'Last name', v: (o) => o.last_name }, { h: 'Status', v: (o) => o.status },
    { h: 'Roles', v: (o) => (o.roles || []).join(' ') }, { h: 'Email', v: (o) => o.email, officer: true }, { h: 'Phone', v: (o) => o.phone, officer: true },
    { h: 'SIA number', v: (o) => o.sia_number }, { h: 'SIA expiry', v: (o) => o.sia_expiry && day(o.sia_expiry) },
  ],
  timesheets: [
    { h: 'Date', v: (r) => r.date }, { h: 'Venue', v: (r) => r.venue_name }, { h: 'Officer', v: (r) => r.officer_name }, { h: 'Role', v: (r) => r.role_name },
    { h: 'Clock in', v: (r) => stamp(r.actual_start || r.clock_in) }, { h: 'Clock out', v: (r) => stamp(r.actual_end || r.clock_out) }, { h: 'Hours', v: (r) => r.hours },
    { h: 'Status', v: (r) => r.state },
    { h: 'Pay rate', v: (r) => r.pay_rate, pay: true, officer: true }, { h: 'Pay', v: (r) => r.pay_total, pay: true, officer: true },
    { h: 'Charge rate', v: (r) => r.charge_rate, pay: true }, { h: 'Charge', v: (r) => r.charge_total, pay: true },
  ],
  incidents: [
    { h: 'Ref', v: (i) => i.ref }, { h: 'When', v: (i) => stamp(i.occurred_at) }, { h: 'Venue', v: (i) => i.venue_name }, { h: 'Type', v: (i) => i.type },
    { h: 'Severity', v: (i) => i.severity }, { h: 'Status', v: (i) => i.status }, { h: 'Officer', v: (i) => i.officer_name }, { h: 'Police ref', v: (i) => i.police_ref },
  ],
  timeoff: [
    { h: 'Officer', v: (t) => t.officer_name }, { h: 'Kind', v: (t) => t.kind }, { h: 'From', v: (t) => day(t.start_date) }, { h: 'To', v: (t) => day(t.end_date) },
    { h: 'Status', v: (t) => t.status }, { h: 'Decided by', v: (t) => t.decided_by_name }, { h: 'Reason', v: (t) => t.reason },
  ],
  audit: [
    { h: 'When', v: (a) => stamp(a.created_at) }, { h: 'Who', v: (a) => a.user_name }, { h: 'Action', v: (a) => a.action },
    { h: 'Record', v: (a) => a.entity }, { h: 'Record id', v: (a) => a.entity_id }, { h: 'Details', v: (a) => (a.detail ? JSON.stringify(a.detail) : '') },
  ],
  // People ejected, refused or banned (customers, not staff); "Logged by" is the officer or manager who wrote it up
  bans: [
    { h: 'When', v: (b) => stamp(b.occurred_at || b.created_at) }, { h: 'Venue', v: (b) => b.venue_name },
    { h: 'Outcome', v: (b) => (b.outcome === 'refused_entry' ? 'Refused entry' : b.outcome ? 'Ejected' : '') }, { h: 'Name', v: (b) => b.name },
    { h: 'Description', v: (b) => b.description }, { h: 'Category', v: (b) => b.category }, { h: 'Reason', v: (b) => b.reason },
    { h: 'Ban', v: (b) => (b.kind === 'ban' ? `${b.status}, ${b.ends_on ? `until ${day(b.ends_on)}` : 'permanent'}${b.scope && b.scope !== 'venue' ? `, ${b.scope}` : ''}` : '') },
    { h: 'Logged by', v: (b) => b.proposed_by_name },
  ],
};

export const actions = {
  'staff.exportCsv': def(MGR, async (b, ctx) => out('staff', await officers['officers.list'].fn(b, ctx), COLUMNS.staff, ctx.user)),
  'timesheets.exportCsv': def(['company', 'security', 'venue'], async (b, ctx) => {
    const r = await timesheets['timesheets.week'].fn(b, ctx);
    return out(`timesheets-${String(b.from).slice(0, 10)}`, r.rows || [], COLUMNS.timesheets, ctx.user);
  }),
  'incidents.exportCsv': def(ALL.filter((r) => r !== 'officer'), async (b, ctx) => out('incidents', await incidents['incidents.list'].fn({ ...b, limit: 500 }, ctx), COLUMNS.incidents, ctx.user)),
  'timeoff.exportCsv': def(MGR, async (b, ctx) => out('time-off', await hr['timeoff.list'].fn(b, ctx), COLUMNS.timeoff, ctx.user)),
  'bans.exportCsv': def(MGR, async (b, ctx) => out(b.kind === 'ejection' ? 'ejections' : 'bans', await bans['bans.list'].fn(b, ctx), COLUMNS.bans, ctx.user)),
  'audit.exportCsv': def(CO, async (b, ctx) => out('audit-log', await users['audit.list'].fn({ ...b, limit: 500 }, ctx), COLUMNS.audit, ctx.user)),
};
