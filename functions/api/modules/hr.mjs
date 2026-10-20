import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { assertOfficerAccess } from '../lib/scope.mjs';
import { notify, companyManagers, officerUser } from '../lib/notify.mjs';
import { Doc } from '../lib/pdf.mjs';
import { fmtDate, fmtDateTime } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { getSettings } from './settings.mjs';
import { ALL, CO, MGR, def } from './_def.mjs';

const ONBOARDING = [
  ['profile', 'Personal details completed'],
  ['sia', 'SIA licence uploaded'],
  ['rtw', 'Right to work evidence uploaded'],
  ['id', 'Photo ID uploaded'],
  ['poa', 'Proof of address uploaded'],
  ['bank', 'Bank details and UTR provided'],
  ['contract', 'Contractor agreement signed'],
  ['verified', 'Documents verified by the company'],
  ['induction', 'Induction completed'],
];

export async function seedOnboarding(t, officerId) {
  for (let i = 0; i < ONBOARDING.length; i++) {
    await t.q('INSERT INTO onboarding_tasks (officer_id, code, title, sort) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [officerId, ONBOARDING[i][0], ONBOARDING[i][1], i]);
  }
}

export async function tickOnboarding(officerId, code) {
  await q('UPDATE onboarding_tasks SET done = true, done_at = now() WHERE officer_id = $1 AND code = $2 AND NOT done', [officerId, code]);
}

const ownOrManager = (user, officerId) => (user.role === 'officer' ? user.officer_id : officerId);

export const actions = {
  // ---- Time off & absence ----
  'timeoff.list': def(['company', 'security', 'officer'], async (b, { user }) => q(
    `SELECT t.*, o.first_name || ' ' || o.last_name AS officer_name, u.name AS decided_by_name
       FROM time_off t JOIN officers o ON o.id = t.officer_id LEFT JOIN users u ON u.id = t.decided_by
      WHERE ($1::uuid IS NULL OR t.officer_id = $1) AND ($2::text IS NULL OR t.status = $2)
        AND ($3::date IS NULL OR t.end_date >= $3) AND ($4::date IS NULL OR t.start_date <= $4)
      ORDER BY t.start_date DESC LIMIT 300`,
    [user.role === 'officer' ? user.officer_id : b.officer_id || null, b.status || null, b.from || null, b.to || null])),

  'timeoff.request': def(['company', 'security', 'officer'], async (b, { user }) => {
    required(b, 'kind', 'start_date', 'end_date');
    if (b.end_date < b.start_date) fail(400, 'End date is before start date');
    const officerId = ownOrManager(user, b.officer_id);
    // Sickness logged by a manager, or anything a manager enters, is approved straight away
    const status = user.role === 'officer' ? (b.kind === 'unavailable' ? 'approved' : 'pending') : 'approved';
    const t = await insert('time_off', {
      officer_id: officerId, kind: b.kind, start_date: b.start_date, end_date: b.end_date, reason: b.reason || '', status,
      ...(status === 'approved' && user.role !== 'officer' ? { decided_by: user.id, decided_at: new Date() } : {}),
    });
    if (status === 'pending') {
      const o = await one('SELECT first_name, last_name FROM officers WHERE id = $1', [officerId]);
      await notify(await companyManagers(), { kind: 'timeoff', title: 'Time off request', body: `${o.first_name} ${o.last_name}: ${b.kind} ${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`, link: '/company/hr/time-off' });
    }
    return t;
  }),

  'timeoff.decide': def(MGR, async (b, { user }) => {
    required(b, 'id', 'status');
    if (!['approved', 'rejected'].includes(b.status)) fail(400, 'Invalid status');
    const t = need(await one("UPDATE time_off SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1 RETURNING *", [b.id, b.status, user.id]));
    await notify(await officerUser(t.officer_id), { kind: 'timeoff', title: `Time off ${b.status}`, body: `${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}`, link: '/officer/time-off', email: true });
    await audit(user, `timeoff.${b.status}`, 'time_off', t.id);
    return t;
  }),

  'timeoff.cancel': def(['company', 'security', 'officer'], async (b, { user }) => {
    const t = need(await one('SELECT * FROM time_off WHERE id = $1', [b.id]));
    if (user.role === 'officer' && t.officer_id !== user.officer_id) fail(403, 'Forbidden');
    if (user.role === 'officer' && t.status !== 'pending') fail(400, 'Already decided — contact the office to change it');
    await q("UPDATE time_off SET status = 'cancelled' WHERE id = $1", [b.id]);
    return { ok: true };
  }),

  // ---- HR notes: notes, commendations, warnings, reviews, training, venue feedback ----
  'hrnotes.list': def(['company', 'security', 'officer'], async (b, { user }) => {
    const id = ownOrManager(user, b.officer_id);
    await assertOfficerAccess(user, id);
    return q(
      `SELECT n.*, u.name AS author_name FROM hr_notes n LEFT JOIN users u ON u.id = n.author_id
        WHERE officer_id = $1 AND ($2::boolean OR visible_to_officer) AND ($3::text IS NULL OR kind = $3) ORDER BY created_at DESC`,
      [id, user.role !== 'officer', b.kind || null]);
  }),

  'hrnotes.create': def(MGR, async (b, { user }) => {
    required(b, 'officer_id', 'kind', 'title');
    if (user.role === 'security' && !['note', 'commendation', 'venue_feedback', 'training'].includes(b.kind)) fail(403, 'Only the company can record warnings and reviews');
    const n = await insert('hr_notes', {
      officer_id: b.officer_id, kind: b.kind, title: b.title, body: b.body || '', level: b.level || '', visible_to_officer: !!b.visible_to_officer, author_id: user.id,
    });
    if (n.visible_to_officer) await notify(await officerUser(b.officer_id), { kind: 'hr', title: `New ${b.kind.replace('_', ' ')} on your profile`, body: b.title, link: '/officer/profile' });
    await audit(user, 'hrnote.create', 'officer', b.officer_id, { kind: b.kind });
    return n;
  }),

  'hrnotes.delete': def(CO, async (b, { user }) => {
    await q('DELETE FROM hr_notes WHERE id = $1', [b.id]);
    await audit(user, 'hrnote.delete', 'hr_note', b.id);
    return { ok: true };
  }),

  // ---- Onboarding & recruitment ----
  'onboarding.pipeline': def(CO, async () => q(
    `SELECT o.id, o.first_name || ' ' || o.last_name AS name, o.email, o.phone, o.status, o.roles, o.created_at, u.status AS login_status,
            count(t.*) FILTER (WHERE t.done) AS done, count(t.*) AS total
       FROM officers o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN onboarding_tasks t ON t.officer_id = o.id
      WHERE o.status IN ('applicant','onboarding') GROUP BY o.id, u.status ORDER BY o.created_at DESC`)),

  'onboarding.tasks': def(['company', 'officer'], async (b, { user }) => {
    const id = ownOrManager(user, b.officer_id);
    return q('SELECT * FROM onboarding_tasks WHERE officer_id = $1 ORDER BY sort', [id]);
  }),

  'onboarding.toggle': def(CO, async (b) => {
    await q('UPDATE onboarding_tasks SET done = $3, done_at = CASE WHEN $3 THEN now() END WHERE officer_id = $1 AND code = $2', [b.officer_id, b.code, !!b.done]);
    return { ok: true };
  }),

  'onboarding.setStatus': def(CO, async (b, { user }) => {
    required(b, 'officer_id', 'status');
    if (!['applicant', 'onboarding', 'active', 'suspended'].includes(b.status)) fail(400, 'Invalid status');
    if (b.status === 'active') {
      const o = await one('SELECT * FROM officers WHERE id = $1', [b.officer_id]);
      const { compliance } = await import('./officers.mjs');
      const c = compliance({ ...o, status: 'active' });
      if (!c.ok && !b.force) fail(422, `Not compliant: ${c.issues.join(', ')}`, { issues: c.issues });
      if (!o.start_date) await q('UPDATE officers SET start_date = CURRENT_DATE WHERE id = $1', [b.officer_id]);
    }
    await q('UPDATE officers SET status = $2 WHERE id = $1', [b.officer_id, b.status]);
    // Hiring can send the app login at the same time, so nobody is left active without one
    let invite_link = null;
    if (b.status === 'active' && b.invite) {
      const o = await one('SELECT user_id, email FROM officers WHERE id = $1', [b.officer_id]);
      if (!o.user_id && o.email) invite_link = await (await import('./officers.mjs')).inviteOfficerLogin(b.officer_id);
    }
    if (b.status === 'active' && !invite_link) await notify(await officerUser(b.officer_id), { kind: 'hr', title: "You're all set", body: 'Your account is active. You can now be offered shifts.', link: '/officer', email: true });
    await audit(user, 'officer.status', 'officer', b.officer_id, { status: b.status, invite: !!invite_link });
    return { ok: true, invite_link };
  }),

  // ---- Contracts / e-signing ----
  'contracts.templates': def(CO, async () => q('SELECT * FROM contract_templates ORDER BY active DESC, created_at DESC')),
  'contracts.saveTemplate': def(CO, async (b) => {
    required(b, 'title', 'body');
    if (b.id) return one('UPDATE contract_templates SET title = $2, body = $3, active = $4 WHERE id = $1 RETURNING *', [b.id, b.title, b.body, b.active !== false]);
    return insert('contract_templates', { title: b.title, body: b.body });
  }),

  'contracts.send': def(CO, async (b, { user }) => {
    required(b, 'officer_id', 'template_id');
    const [tpl, o, s] = await Promise.all([
      need(await one('SELECT * FROM contract_templates WHERE id = $1', [b.template_id])),
      need(await one('SELECT * FROM officers WHERE id = $1', [b.officer_id])),
      getSettings(),
    ]);
    const body = tpl.body.replaceAll('{{company}}', s.company_name).replaceAll('{{officer}}', `${o.first_name} ${o.last_name}`).replaceAll('{{utr}}', o.utr || '________');
    const c = await insert('contracts', { officer_id: o.id, template_id: tpl.id, title: tpl.title, body });
    await notify(await officerUser(o.id), { kind: 'contract', title: 'Contract ready to sign', body: tpl.title, link: `/officer/contracts/${c.id}`, email: true });
    await audit(user, 'contract.send', 'officer', o.id, { contract: c.id });
    return c;
  }),

  'contracts.list': def(['company', 'officer'], async (b, { user }) => {
    // Company-wide register when a manager asks without an officer
    if (user.role === 'company' && !b.officer_id) {
      return q(
        `SELECT c.id, c.title, c.status, c.signed_name, c.signed_at, c.created_at, c.officer_id, o.first_name || ' ' || o.last_name AS officer_name
           FROM contracts c JOIN officers o ON o.id = c.officer_id
          WHERE ($1::text IS NULL OR c.status = $1) AND ($2::text IS NULL OR (o.first_name || ' ' || o.last_name || ' ' || c.title) ILIKE '%' || $2 || '%')
          ORDER BY c.created_at DESC LIMIT 500`, [b.status || null, b.q?.trim() || null]);
    }
    return q('SELECT id, title, status, signed_name, signed_at, created_at FROM contracts WHERE officer_id = $1 ORDER BY created_at DESC', [ownOrManager(user, b.officer_id)]);
  }),

  'contracts.get': def(['company', 'officer'], async (b, { user }) => {
    const c = need(await one('SELECT * FROM contracts WHERE id = $1', [b.id]));
    if (user.role === 'officer' && c.officer_id !== user.officer_id) fail(403, 'Forbidden');
    return c;
  }),

  'contracts.sign': def(['officer'], async (b, { user, ip }) => {
    required(b, 'id', 'signature', 'signed_name');
    if (!String(b.signature).startsWith('data:image/png;base64,') || b.signature.length > 400000) fail(400, 'Invalid signature');
    const c = need(await one(
      "UPDATE contracts SET status = 'signed', signature = $3, signed_name = $4, signed_at = now(), signed_ip = $5 WHERE id = $1 AND officer_id = $2 AND status = 'sent' RETURNING *",
      [b.id, user.officer_id, b.signature, b.signed_name, ip]), 'Contract not found or already signed');
    await tickOnboarding(user.officer_id, 'contract');
    await notify(await companyManagers(), { kind: 'contract', title: 'Contract signed', body: `${b.signed_name} signed "${c.title}"`, link: `/company/staff/${user.officer_id}` });
    await audit(user, 'contract.sign', 'contract', c.id, { ip });
    return { ok: true };
  }),

  'contracts.void': def(CO, async (b, { user }) => {
    await q("UPDATE contracts SET status = 'void' WHERE id = $1", [b.id]);
    await audit(user, 'contract.void', 'contract', b.id);
    return { ok: true };
  }),

  'contracts.pdf': def(['company', 'officer'], async (b, { user }) => {
    const c = need(await one('SELECT c.*, o.first_name, o.last_name FROM contracts c JOIN officers o ON o.id = c.officer_id WHERE c.id = $1', [b.id]));
    if (user.role === 'officer' && c.officer_id !== user.officer_id) fail(403, 'Forbidden');
    const s = await getSettings();
    const d = await Doc.create(c.title);
    d.header(s, 'Agreement', c.title);
    d.text(c.body, { size: 10, gap: 5 });
    d.section('Signature');
    if (c.signature) await d.image(c.signature, { width: 180 });
    d.meta([['Signed by', c.signed_name || 'Not signed'], ['Signed at', c.signed_at ? fmtDateTime(c.signed_at) : '-']], [['IP address', c.signed_ip || '-'], ['Contractor', `${c.first_name} ${c.last_name}`]]);
    d.footer(`${s.company_name} - electronically signed via Orb Security`);
    return { filename: `${c.title} - ${c.first_name} ${c.last_name}.pdf`, pdf: await d.base64() };
  }),

  // ---- Offboarding ----
  'offboarding.save': def(CO, async (b, { user }) => {
    required(b, 'officer_id', 'leave_date');
    await tx(async (t) => {
      await t.q(
        `INSERT INTO offboarding (officer_id, leave_date, reason, kit_returned, rehire_eligible, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (officer_id) DO UPDATE SET leave_date = EXCLUDED.leave_date, reason = EXCLUDED.reason, kit_returned = EXCLUDED.kit_returned,
           rehire_eligible = EXCLUDED.rehire_eligible, notes = EXCLUDED.notes`,
        [b.officer_id, b.leave_date, b.reason || '', !!b.kit_returned, b.rehire_eligible !== false, b.notes || '', user.id]);
      await t.q("UPDATE officers SET status = 'left' WHERE id = $1", [b.officer_id]);
      await t.q(
        `UPDATE shift_assignments a SET status = 'cancelled' FROM shifts s
          WHERE s.id = a.shift_id AND a.officer_id = $1 AND s.starts_at > ($2::date + interval '1 day') AND a.status IN ('assigned','accepted','requested')`,
        [b.officer_id, b.leave_date]);
      if (b.disable_login !== false) await t.q("UPDATE users SET status = 'disabled' FROM officers o WHERE o.user_id = users.id AND o.id = $1", [b.officer_id]);
    });
    await audit(user, 'officer.offboard', 'officer', b.officer_id, { reason: b.reason });
    return { ok: true };
  }),

  'offboarding.rehire': def(CO, async (b, { user }) => {
    await q("UPDATE officers SET status = 'onboarding' WHERE id = $1", [b.officer_id]);
    await q("UPDATE users SET status = 'active' FROM officers o WHERE o.user_id = users.id AND o.id = $1 AND users.password_hash IS NOT NULL", [b.officer_id]);
    await q('DELETE FROM offboarding WHERE officer_id = $1', [b.officer_id]);
    await audit(user, 'officer.rehire', 'officer', b.officer_id);
    return { ok: true };
  }),
};
