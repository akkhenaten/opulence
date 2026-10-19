// Compliance and incident-evidence demo data, run once after seed.mjs:
//   openkbs storage upload <mock SIA card png> docs/officers/seed/sia-jordan.png
//   openkbs storage upload <incident photo png> docs/incidents/seed0000/bottle-doorway.png
//   DATABASE_URL=... node scripts/seed-compliance.mjs
// Sets up one case for each compliance check and an incident whose photo contradicts the text.
import fs from 'node:fs';
import { q, one } from '../functions/api/lib/db.mjs';
import { londonDate, addDays } from '../functions/api/lib/time.mjs';

const creds = JSON.parse(fs.readFileSync(new URL('./.demo-credentials.json', import.meta.url)));
const officerByEmail = (email) => one('SELECT o.* FROM officers o JOIN users u ON u.id = o.user_id WHERE lower(u.email) = lower($1)', [email]);
const officerByName = (first, last) => one('SELECT * FROM officers WHERE first_name = $1 AND last_name = $2', [first, last]);
const H = 3600000;

// A published door shift `days` from now, 20:00–03:00 London, with the officer accepted
async function doorShift(venueId, officerId, days) {
  const start = new Date(`${addDays(londonDate(new Date()), days)}T19:00:00Z`);
  const s = await one(`INSERT INTO shifts (venue_id, role, starts_at, ends_at, break_minutes, headcount, status, notes)
    VALUES ($1, 'door', $2, $3, 30, 1, 'published', 'compliance-demo') RETURNING id`, [venueId, start, new Date(start.getTime() + 7 * H)]);
  await q("INSERT INTO shift_assignments (shift_id, officer_id, status, responded_at) VALUES ($1,$2,'accepted',now())", [s.id, officerId]);
  return s.id;
}

async function main() {
  if (await one("SELECT 1 FROM shifts WHERE notes = 'compliance-demo'")) { console.log('Compliance demo already seeded — skipped.'); return; }
  const today = londonDate(new Date());
  const company = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [creds.company.email]);
  const marcus = await officerByEmail(creds.officer_marcus.email);
  const ellie = await officerByName('Ellie', 'Clarke');
  const jordan = await officerByName('Jordan', 'Hayes');
  const lantern = await one("SELECT id FROM venues WHERE name = 'The Lantern Rooms'");
  const arena = await one("SELECT id FROM venues WHERE name = 'Harbour Arena'");

  // 1. Marcus's SIA licence runs out in 3 days and he is booked in 5
  await q('UPDATE officers SET sia_expiry = $2 WHERE id = $1', [marcus.id, addDays(today, 3)]);
  const s1 = await doorShift(lantern.id, marcus.id, 5);

  // 2. Ellie holds a CCTV-only licence but is booked on a door shift
  await q("UPDATE officers SET sia_type = 'CCTV (Public Space Surveillance)' WHERE id = $1", [ellie.id]);
  const s2 = await doorShift(arena.id, ellie.id, 4);

  // 3. Jordan's uploaded licence shows a different number to the profile (AI reads it on the next run)
  await q(`INSERT INTO documents (owner_type, owner_id, kind, title, number, expiry, s3_key, mime, verified_by, verified_at, uploaded_by)
    VALUES ('officer', $1, 'sia', 'SIA licence (front)', $2, $3, 'docs/officers/seed/sia-jordan.png', 'image/png', $4, now(), $4)`,
  [jordan.id, jordan.sia_number, jordan.sia_expiry, company.id]);

  // 4. Door supervisors now need a first aid certificate
  await q("UPDATE roles SET required_docs = '{first_aid}' WHERE code = 'door'");

  // 5. A report that says nobody was hurt, with a photo of blood and a dressed cut
  const inc = await one(`INSERT INTO incidents (venue_id, officer_id, reported_by, type, severity, occurred_at, location, description, injuries, actions_taken)
    VALUES ($1, $2, (SELECT user_id FROM officers WHERE id = $2), 'disorder', 'low', now() - interval '20 hours', 'Main door',
      'Male customer became argumentative at the door after being refused re-entry. Dropped his bottle and left on foot. No injuries.', '',
      'Spoke to the customer calmly and watched him leave.') RETURNING id, ref`, [lantern.id, marcus.id]);
  await q(`INSERT INTO incident_attachments (incident_id, s3_key, mime, name, uploaded_by, size_bytes)
    VALUES ($1, 'docs/incidents/seed0000/bottle-doorway.png', 'image/png', 'doorway.png', (SELECT user_id FROM officers WHERE id = $2), $3)`,
  [inc.id, marcus.id, 856776]);

  console.log(JSON.stringify({ ok: true, marcus_shift: s1, ellie_shift: s2, incident: inc.ref }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
