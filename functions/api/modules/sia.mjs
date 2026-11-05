// SIA register checks. The register has no API: the app copies the details, opens the register in a new tab,
// and a manager records what it shows. Each check is kept in sia_checks; the latest one is on the officer row.
import { one, q, tx } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { assertOfficerAccess } from '../lib/scope.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { audit } from '../lib/audit.mjs';
import { notify, companyManagers } from '../lib/notify.mjs';
import { SIA_TYPES } from '../lib/licences.mjs';
import { CHECK_STATUSES, NOT_CLEARED, STATUS_LABEL, cleanSia, validSia, siaGroups, ukDate, maskDob } from '../lib/sia.mjs';
import { autoCheckEnabled, lookupLicence } from '../lib/siaChecker.mjs';
import { shapeOfficer } from './officers.mjs';
import { MGR, def } from './_def.mjs';

const history = (id) => q(
  `SELECT c.id, c.status, c.expiry, c.sector, c.licence_number, c.notes, c.source, c.created_at, u.name AS checked_by_name
     FROM sia_checks c LEFT JOIN users u ON u.id = c.checked_by WHERE c.officer_id = $1 ORDER BY c.created_at DESC LIMIT 20`, [id]);

export const actions = {
  // What the manager needs to search the register; every call is logged because it includes the date of birth
  'sia.details': def(MGR, async (b, { user }) => {
    required(b, 'officer_id');
    await assertOfficerAccess(user, b.officer_id);
    const o = need(await one(
      `SELECT o.*, a.ai->'badge'->>'number' AS badge_number, u.name AS sia_last_verified_by_name
         FROM officers o LEFT JOIN applications a ON a.officer_id = o.id LEFT JOIN users u ON u.id = o.sia_last_verified_by
        WHERE o.id = $1`, [b.officer_id]), 'Officer not found');
    const number = cleanSia(o.sia_number || o.badge_number);
    await audit(user, 'sia.details', 'officer', o.id);
    return {
      id: o.id, name: `${o.first_name} ${o.last_name}`, first_name: o.first_name, last_name: o.last_name, roles: o.roles || [], status: o.status,
      photo_url: await downloadUrl(o.photo_key), sia_type: o.sia_type, sia_expiry: o.sia_expiry,
      sia_status: o.sia_status, sia_last_verified_at: o.sia_last_verified_at, sia_last_verified_by_name: o.sia_last_verified_by_name,
      number, number_groups: siaGroups(number),
      dob: ukDate(o.dob), dob_masked: user.role === 'company' ? ukDate(o.dob) : maskDob(o.dob),
      history: await history(o.id),
      auto: autoCheckEnabled(),
    };
  }),

  // Ask the register automatically (SIA Checker); nothing is saved until the manager confirms with sia.record
  'sia.lookup': def(MGR, async (b, { user }) => {
    required(b, 'officer_id');
    await assertOfficerAccess(user, b.officer_id);
    if (!autoCheckEnabled()) fail(503, "Automatic checks aren't set up");
    const o = need(await one(
      `SELECT o.id, o.first_name, o.last_name, o.sia_number, a.ai->'badge'->>'number' AS badge_number
         FROM officers o LEFT JOIN applications a ON a.officer_id = o.id WHERE o.id = $1`, [b.officer_id]), 'Officer not found');
    const number = cleanSia(o.sia_number || o.badge_number);
    if (!validSia(number)) fail(400, 'No 16-digit licence number on file');
    const r = await lookupLicence(number);
    const same = (a, x) => String(a || '').trim().toLowerCase() === String(x || '').trim().toLowerCase();
    const name_matches = r.outcome === 'found' ? same(r.surname, o.last_name) && same(r.first_name, o.first_name) : null;
    await audit(user, 'sia.lookup', 'officer', o.id, { outcome: r.outcome, register_status: r.register_status || null });
    return { ...r, number, name_matches };
  }),

  'sia.history': def(MGR, async (b, { user }) => {
    required(b, 'officer_id');
    await assertOfficerAccess(user, b.officer_id);
    return { checks: await history(b.officer_id) };
  }),

  // Record what the register shows; anything other than Active blocks rostering and alerts company managers
  'sia.record': def(MGR, async (b, { user }) => {
    required(b, 'officer_id', 'status');
    if (!CHECK_STATUSES.includes(b.status)) fail(400, 'Pick the status the register shows');
    const expiry = b.expiry || null;
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) fail(400, 'Expiry date is not valid');
    if (!expiry && b.status !== 'not_found') fail(400, 'Add the expiry date the register shows');
    const sector = b.sector || null;
    if (sector && !SIA_TYPES.includes(sector)) fail(400, 'Unknown licence type');
    const notes = String(b.notes || '').trim().slice(0, 2000) || null;
    const source = b.source === 'auto' ? 'auto' : 'manual';
    await assertOfficerAccess(user, b.officer_id);
    const before = need(await one('SELECT * FROM officers WHERE id = $1', [b.officer_id]), 'Officer not found');
    const number = cleanSia(before.sia_number) || cleanSia((await one("SELECT ai->'badge'->>'number' AS n FROM applications WHERE officer_id = $1", [before.id]))?.n);

    const o = await tx(async (db) => {
      await db.q('INSERT INTO sia_checks (officer_id, checked_by, status, expiry, sector, licence_number, notes, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [before.id, user.id, b.status, expiry, sector, number || null, notes, source]);
      return db.one(
        `UPDATE officers SET sia_status = $2, sia_last_verified_at = now(), sia_last_verified_by = $3,
                sia_expiry = COALESCE($4::date, sia_expiry), sia_type = COALESCE($5, sia_type)
          WHERE id = $1 RETURNING *`, [before.id, b.status, user.id, expiry, sector]);
    });
    await audit(user, 'sia.check', 'officer', o.id, { status: b.status, expiry, sector, source, from_expiry: before.sia_expiry, from_status: before.sia_status });

    if (NOT_CLEARED.includes(b.status) && before.status !== 'applicant') {
      await notify(await companyManagers(), {
        kind: 'compliance', severity: 'critical', link: `/company/staff/${o.id}`, email: true,
        title: `SIA register: ${o.first_name} ${o.last_name}'s licence shows ${STATUS_LABEL[b.status]}`,
        body: `Checked by ${user.name || 'a manager'}. They can't be rostered for licensed work until a check shows Active.`,
        dedupe: `sia_register:${o.id}:${b.status}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return shapeOfficer(o, user);
  }),
};
