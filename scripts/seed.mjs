// Demo data: 2 venues, 8 officers, last week worked + signed, this week rostered, statements, invoices, incidents.
// Drives the real API handler so every flow is exercised. Run once on an empty database:
//   DATABASE_URL=... node scripts/seed.mjs
// Writes demo logins to scripts/.demo-credentials.json (git-ignored).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { handler } from '../functions/api/index.mjs';
import { q, one } from '../functions/api/lib/db.mjs';
import { buildTimesheet } from '../functions/api/modules/clock.mjs';
import { londonDate, addDays } from '../functions/api/lib/time.mjs';
import { londonToUtc } from '../functions/api/modules/rota.mjs';

const CREDS = new URL('./.demo-credentials.json', import.meta.url);

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

const pw = () => `Orb-${crypto.randomBytes(6).toString('base64url')}`;
const today = londonDate(new Date());
const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
const thisMonday = addDays(today, -dow);
const lastMonday = addDays(thisMonday, -7);
const inYears = (n) => addDays(today, Math.round(365 * n));

async function main() {
  const { needed } = await call('auth.needsBootstrap');
  if (!needed) { console.log('Already set up — seed skipped.'); return; }
  const creds = {};

  creds.company = { email: 'admin@orbsecurity.demo', password: pw() };
  const { token: CO } = await call('auth.bootstrap', { ...creds.company, name: 'Alex Morgan', company_name: 'Orb Security Ltd' });
  await call('settings.update', {
    company_address: '12 Leonard Street, London EC2A 4LX', company_email: 'accounts@orbsecurity.demo', company_phone: '020 7946 0000',
    vat_number: 'GB 123 4567 89', company_number: '09876543', bank_name: 'Barclays', bank_sort_code: '20-00-00', bank_account: '43218765',
    pay_night_uplift: 10, pay_weekend_uplift: 5,
  }, CO);

  // Clients & venues
  const c1 = await call('clients.save', { name: 'Lantern Leisure Group', billing_email: 'ap@lantern.demo', billing_address: '1 Rivington St, London EC2A 3DT', vat_number: 'GB 987 6543 21' }, CO);
  const c2 = await call('clients.save', { name: 'Harbour Events Ltd', billing_email: 'finance@harbour.demo', billing_address: 'Peninsula Square, London SE10 0DX' }, CO);
  const v1 = await call('venues.save', { client_id: c1.id, name: 'The Lantern Rooms', address: '58 Great Eastern St, London', postcode: 'EC2A 3QR', lat: 51.5262, lng: -0.0800, radius_m: 120,
    phone: '020 7946 0101', instructions: 'Report to the duty manager at the main bar. Radios in the cloakroom. Capacity 450.' }, CO);
  const v2 = await call('venues.save', { client_id: c2.id, name: 'Harbour Arena', address: 'Peninsula Square, Greenwich', postcode: 'SE10 0DX', lat: 51.5030, lng: 0.0032, radius_m: 250,
    phone: '020 7946 0202', instructions: 'Staff entrance Gate C. Sign in at security control. Search policy: all bags.' }, CO);
  for (const v of [v1, v2]) {
    await call('venues.saveRate', { venue_id: v.id, role: 'door', rate: 24, night_uplift: 10, weekend_uplift: 10, bh_uplift: 50, min_hours: 4, effective_from: addDays(today, -60) }, CO);
    await call('venues.saveRate', { venue_id: v.id, role: 'steward', rate: 19.5, night_uplift: 10, weekend_uplift: 5, bh_uplift: 50, min_hours: 4, effective_from: addDays(today, -60) }, CO);
    await call('venues.saveRate', { venue_id: v.id, role: 'supervisor', rate: 29, night_uplift: 10, weekend_uplift: 10, bh_uplift: 50, min_hours: 4, effective_from: addDays(today, -60) }, CO);
  }

  // Manager logins
  const accept = async (link, who) => {
    creds[who].password = pw();
    return (await call('auth.acceptInvite', { token: link.split('/').pop(), password: creds[who].password })).token;
  };
  creds.venue = { email: 'manager@lantern.demo' };
  const vi = await call('users.invite', { email: creds.venue.email, name: 'Priya Shah', role: 'venue', venue_ids: [v1.id] }, CO);
  const VE = await accept(vi.invite_link, 'venue');
  creds.security = { email: 'ops@orbsecurity.demo' };
  const si = await call('users.invite', { email: creds.security.email, name: 'Dan Okafor', role: 'security', venue_ids: [v1.id, v2.id] }, CO);
  const SE = await accept(si.invite_link, 'security');

  // Officers
  const people = [
    ['Marcus', 'Bennett', ['door', 'supervisor'], 18.5], ['Aisha', 'Rahman', ['door'], 15.5], ['Tom', 'Kowalski', ['door'], 15.5],
    ['Grace', 'Adeyemi', ['door', 'steward'], 15.5], ['Liam', 'Walsh', ['steward'], 13], ['Sofia', 'Marin', ['steward', 'door'], 15],
    ['Jordan', 'Hayes', ['door'], 15.5], ['Ellie', 'Clarke', ['steward'], 13],
  ];
  const officers = [];
  for (const [i, [first, last, roles, rate]] of people.entries()) {
    const invite = i < 2;
    const email = `${first.toLowerCase()}@officer.demo`;
    const r = await call('officers.save', {
      first_name: first, last_name: last, email, phone: `07700 9000${String(i).padStart(2, '0')}`, roles, dob: `199${i}-0${(i % 9) + 1}-14`,
      address: `${10 + i} Example Road, London`, postcode: `E${i + 1} 4AB`, ni_number: `QQ12345${i}C`, utr: `12345678${String(i).padStart(2, '0')}`,
      bank_name: 'Monzo', bank_sort_code: '04-00-04', bank_account: `1234567${i}`,
      sia_number: roles.every((x) => x === 'steward') ? '' : `1013 0000 0000 ${String(1000 + i)}`, sia_type: 'Door Supervisor',
      sia_expiry: i === 6 ? addDays(today, 25) : inYears(1 + i / 4), rtw_type: 'British passport', rtw_verified: true, start_date: addDays(today, -200 + i * 10),
      status: 'active', invite,
    }, CO);
    if (invite) {
      creds[`officer_${first.toLowerCase()}`] = { email };
      const tok = await accept(r.invite_link, `officer_${first.toLowerCase()}`);
      await call('officers.save', { id: r.id, status: 'active' }, CO); // invites start as applicants
      officers.push({ id: r.id, first, roles, token: tok });
    } else officers.push({ id: r.id, first, roles });
    for (const role of roles) await call('officers.saveRate', { officer_id: r.id, role, rate: role === 'supervisor' ? 18.5 : rate, effective_from: addDays(today, -90) }, CO);
  }
  // Onboarding pipeline examples
  await call('officers.save', { first_name: 'Nina', last_name: 'Patel', email: 'nina@applicant.demo', roles: ['door'], status: 'applicant' }, CO);
  await call('officers.save', { first_name: 'Owen', last_name: 'Price', email: 'owen@applicant.demo', roles: ['steward'], status: 'onboarding', rtw_verified: true }, CO);

  // Rota: Thu–Sat nights at the Lantern, Sat event at the Arena, for last week and this week
  const door = officers.filter((o) => o.roles.includes('door'));
  const stew = officers.filter((o) => o.roles[0] === 'steward' && o.first !== 'Sofia');
  const plan = [];
  for (const monday of [lastMonday, thisMonday]) {
    for (const d of [3, 4, 5]) plan.push({ venue: v1, date: addDays(monday, d), role: 'door', start: '21:00', end: '03:00', team: door.slice(d - 3, d), brk: 30 });
    plan.push({ venue: v1, date: addDays(monday, 5), role: 'supervisor', start: '20:30', end: '03:30', team: [officers[0]], brk: 30 });
    plan.push({ venue: v2, date: addDays(monday, 5), role: 'steward', start: '16:00', end: '23:30', team: stew, brk: 30 });
  }
  const assignments = [];
  for (const p of plan) {
    const s = await call('shifts.save', { venue_id: p.venue.id, role: p.role, starts_at: londonToUtc(p.date, p.start),
      ends_at: londonToUtc(p.end < p.start ? addDays(p.date, 1) : p.date, p.end), headcount: p.team.length + (p.role === 'steward' ? 1 : 0), break_minutes: p.brk, status: 'draft', open: p.role === 'steward' }, CO);
    for (const o of p.team) {
      const a = await call('shifts.assign', { shift_id: s.id, officer_id: o.id, override: true }, CO);
      assignments.push({ ...a, shift: s, officer: o });
    }
    await call('shifts.publish', { ids: [s.id] }, CO);
  }
  // Today: a shift happening now so the live board and clock-in have something to show
  const nowShift = await call('shifts.save', { venue_id: v1.id, role: 'door', starts_at: new Date(Date.now() - 3600000).toISOString(), ends_at: new Date(Date.now() + 5 * 3600000).toISOString(),
    headcount: 2, break_minutes: 30, status: 'draft' }, CO);
  await call('shifts.assign', { shift_id: nowShift.id, officer_id: officers[2].id, override: true }, CO);
  const marcusNow = await call('shifts.assign', { shift_id: nowShift.id, officer_id: officers[0].id, override: true }, CO);
  await call('shifts.publish', { ids: [nowShift.id] }, CO);
  await q("INSERT INTO clock_events (assignment_id, kind, ts, lat, lng, accuracy, distance_m, qr_ok, geo_ok) VALUES ($1,'in', now() - interval '58 minutes', 51.5262, -0.0800, 8, 3, true, true)",
    [(await one('SELECT id FROM shift_assignments WHERE shift_id = $1 AND officer_id = $2', [nowShift.id, officers[2].id])).id]);

  // Last week actually worked: clock events with small realistic variations
  for (const a of assignments.filter((x) => new Date(x.shift.ends_at) < new Date())) {
    const jitter = (m) => new Date(new Date(m).getTime() + (Math.round(Math.random() * 10) - 4) * 60000).toISOString();
    await q("UPDATE shift_assignments SET status = 'accepted' WHERE id = $1", [a.id]);
    await q("INSERT INTO clock_events (assignment_id, kind, ts, lat, lng, accuracy, distance_m, qr_ok, geo_ok) VALUES ($1,'in',$2,$3,$4,10,12,true,true), ($1,'out',$5,$3,$4,12,15,false,true)",
      [a.id, jitter(a.shift.starts_at), a.shift.venue_id === v1.id ? 51.5262 : 51.5030, a.shift.venue_id === v1.id ? -0.08 : 0.0032, jitter(a.shift.ends_at)]);
    await buildTimesheet(a.id);
  }
  const pending = await call('timesheets.list', { status: 'pending' }, SE);
  await call('timesheets.approve', { ids: pending.map((t) => t.id) }, SE);
  const toSign = await call('timesheets.list', { status: 'approved' }, VE);
  if (toSign.length) await call('timesheets.dispute', { id: toSign[0].id, comment: 'Officer left around 02:30, not 03:00.' }, VE);
  await call('timesheets.sign', { ids: toSign.slice(1).map((t) => t.id) }, VE);
  const arena = (await call('timesheets.list', { status: 'approved' }, CO)).map((t) => t.id);
  await call('timesheets.sign', { ids: arena }, CO);

  // Money for last week
  const pay = await call('pay.generate', { start: lastMonday, end: addDays(lastMonday, 6) }, CO);
  const inv = await call('invoices.generate', { start: lastMonday, end: addDays(lastMonday, 6) }, CO);
  const statements = await call('pay.list', {}, CO);
  await call('pay.issue', { ids: statements.slice(0, 3).map((s) => s.id) }, CO);
  const invoices = await call('invoices.list', {}, CO);
  if (invoices[0]) await call('invoices.issue', { id: invoices[0].id }, CO);

  // Incidents
  const lastSat = addDays(lastMonday, 5);
  const marcus = officers[0];
  await call('incidents.create', {
    type: 'ejection', severity: 'medium', occurred_at: londonToUtc(addDays(lastSat, 1), '00:40'), location: 'Main bar',
    description: 'Male guest refused further service and became verbally aggressive towards bar staff. Asked to leave twice, then escorted out via the front door without further issue.',
    people_involved: 'Male, approx 30, blue jacket', actions_taken: 'Verbal de-escalation, escorted off premises, details logged in refusals book.', witnesses: [{ name: 'Sam (bar staff)', contact: 'via venue', statement: 'Saw him shouting at the till.' }],
  }, marcus.token);
  await call('incidents.create', {
    type: 'medical', severity: 'high', occurred_at: londonToUtc(addDays(lastSat, 1), '01:55'), location: 'Smoking area',
    description: 'Female guest collapsed in the smoking area. Recovery position, first aid given, ambulance called and arrived after 18 minutes.',
    injuries: 'Head bump, conscious throughout', actions_taken: 'First aid, area cleared, friend contacted.', ambulance_called: true, ambulance_ref: 'LAS-26-55821',
  }, marcus.token);

  fs.writeFileSync(CREDS, JSON.stringify(creds, null, 2));
  console.log(JSON.stringify({ ok: true, officers: officers.length, shifts: plan.length + 1, pay, inv, live_assignment: marcusNow.id }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
