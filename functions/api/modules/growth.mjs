// One-to-ones, the goals agreed in them, and pay-rise agreements that apply once signed and (optionally) once goals are met
import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { assertOfficerAccess } from '../lib/scope.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { notify, companyManagers, officerUser } from '../lib/notify.mjs';
import { Doc } from '../lib/pdf.mjs';
import { fmtDate, fmtDateTime, londonDate } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { getSettings } from './settings.mjs';
import { officerRate } from './money.mjs';
import { guardSelf } from '../lib/selfcheck.mjs';
import { ALL, CO, MGR, def } from './_def.mjs';

const OWN_RATE = 'Another company manager needs to change your own pay rate';

const GOAL_STATUS = ['open', 'met', 'missed', 'dropped'];
const money = (n) => `£${Number(n).toFixed(2)}`;
const today = () => londonDate(new Date());

async function goalsWithNotes(officerId) {
  const goals = await q('SELECT * FROM goals WHERE officer_id = $1 ORDER BY status = \'open\' DESC, due_on NULLS LAST, created_at DESC', [officerId]);
  const notes = goals.length ? await q(
    `SELECT n.*, u.name AS author_name FROM goal_notes n LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.goal_id = ANY($1::uuid[]) ORDER BY n.created_at`, [goals.map((g) => g.id)]) : [];
  return goals.map((g) => ({ ...g, notes: notes.filter((n) => n.goal_id === g.id) }));
}

const agreementSql = `SELECT a.*, r.name AS role_name, v.name AS venue_name, o.first_name, o.last_name, o.user_id
  FROM pay_agreements a JOIN roles r ON r.code = a.role LEFT JOIN venues v ON v.id = a.venue_id JOIN officers o ON o.id = a.officer_id`;

// Goals a conditional agreement waits on, with their current status
async function withConditions(rows) {
  const ids = [...new Set(rows.flatMap((a) => a.condition_goal_ids || []))];
  const goals = ids.length ? await q('SELECT id, title, status FROM goals WHERE id = ANY($1::uuid[])', [ids]) : [];
  return rows.map((a) => ({ ...a, signature_png: undefined, conditions: (a.condition_goal_ids || []).map((id) => goals.find((g) => g.id === id)).filter(Boolean) }));
}

async function agreement(user, id) {
  const a = need(await one(`${agreementSql} WHERE a.id = $1`, [id]), 'Agreement not found');
  if (user.role === 'officer' && a.officer_id !== user.officer_id) fail(403, 'Forbidden');
  if (user.role === 'officer' && a.status === 'draft') fail(404, 'Agreement not found');
  return a;
}

// Put signed agreements into effect once their date has come and every condition goal is met
export async function applyAgreements() {
  const due = await q(`${agreementSql} WHERE a.status = 'signed' AND a.effective_from <= $1`, [today()]);
  let applied = 0;
  for (const a of due) {
    const goals = a.condition_goal_ids?.length ? await q('SELECT id, title, status FROM goals WHERE id = ANY($1::uuid[])', [a.condition_goal_ids]) : [];
    const waiting = goals.filter((g) => g.status !== 'met');
    const name = `${a.first_name} ${a.last_name}`;
    if (waiting.length) {
      if (!a.waiting_notified_at) {
        await q('UPDATE pay_agreements SET waiting_notified_at = now() WHERE id = $1', [a.id]);
        await notify(await companyManagers(), {
          kind: 'hr', title: `Pay rise for ${name} is waiting on goals`,
          body: `${money(a.new_rate)}/h from ${fmtDate(a.effective_from)} starts once these are met: ${waiting.map((g) => `${g.title} (${g.status})`).join(', ')}.`,
          link: `/company/staff/${a.officer_id}?tab=growth`, dedupe: `agrwait:${a.id}`,
        });
      }
      continue;
    }
    // Conditions met after the agreed date: the rise starts the day they are met, never back-dated
    const from = a.condition_goal_ids?.length && a.effective_from < today() ? today() : String(a.effective_from).slice(0, 10);
    await tx(async (t) => {
      const r = await insert('officer_rates', { officer_id: a.officer_id, role: a.role, venue_id: a.venue_id, rate: a.new_rate, effective_from: from }, t);
      await t.q("UPDATE pay_agreements SET status = 'applied', applied_rate_id = $2, applied_at = now(), updated_at = now() WHERE id = $1", [a.id, r.id]);
    });
    await notify(await officerUser(a.officer_id), {
      kind: 'pay', title: 'Your pay rise has started', body: `${a.role_name}${a.venue_name ? ` at ${a.venue_name}` : ''}: ${money(a.new_rate)}/h from ${fmtDate(from)}.`, link: '/officer/me', email: true,
    });
    await notify(await companyManagers(), { kind: 'hr', title: `Pay rise applied for ${name}`, body: `${a.role_name}: ${money(a.new_rate)}/h from ${fmtDate(from)}.`, link: `/company/staff/${a.officer_id}?tab=growth` });
    await audit({ id: null, role: 'system', name: 'Orb' }, 'agreement.apply', 'officer', a.officer_id, { agreement: a.id, rate: a.new_rate, from });
    applied++;
  }
  return applied;
}

export const actions = {
  // Everything for the profile tab: meetings, goals, agreements and how venues rated them since the last meeting
  'growth.officer': def(MGR, async (b, { user }) => {
    required(b, 'officer_id');
    await assertOfficerAccess(user, b.officer_id);
    const [meetings, goals, agreements] = await Promise.all([
      q('SELECT m.*, u.name AS manager_name FROM one_to_ones m LEFT JOIN users u ON u.id = m.manager_id WHERE m.officer_id = $1 ORDER BY held_on DESC, created_at DESC', [b.officer_id]),
      goalsWithNotes(b.officer_id),
      canSeePay(user) ? q(`${agreementSql} WHERE a.officer_id = $1 ORDER BY a.created_at DESC`, [b.officer_id]).then(withConditions) : [],
    ]);
    const since = meetings[0]?.held_on || null;
    const rating = await one(
      `SELECT round(avg(rating)::numeric, 1) AS avg, count(*)::int AS n FROM venue_feedback
        WHERE officer_id = $1 AND rating IS NOT NULL AND ($2::date IS NULL OR answered_at >= $2::date)`, [b.officer_id, since]);
    return { meetings, goals, agreements, can_see_pay: canSeePay(user), rating: { avg: rating.avg == null ? null : Number(rating.avg), count: rating.n, since } };
  }),

  // The officer's own view: shared meetings, all their goals, agreements sent to them
  'growth.mine': def(['officer'], async (_b, { user }) => {
    const [meetings, goals, agreements] = await Promise.all([
      q(`SELECT m.id, m.held_on, m.notes, m.rating, u.name AS manager_name FROM one_to_ones m LEFT JOIN users u ON u.id = m.manager_id
          WHERE m.officer_id = $1 AND m.shared_with_officer ORDER BY held_on DESC`, [user.officer_id]),
      goalsWithNotes(user.officer_id),
      q(`${agreementSql} WHERE a.officer_id = $1 AND a.status <> 'draft' ORDER BY a.created_at DESC`, [user.officer_id]).then(withConditions),
    ]);
    return { meetings, goals, agreements };
  }),

  'oneToOnes.save': def(MGR, async (b, { user }) => {
    required(b, 'officer_id');
    await assertOfficerAccess(user, b.officer_id);
    const rating = b.rating == null || b.rating === '' ? null : Number(b.rating);
    if (rating != null && !(rating >= 1 && rating <= 5)) fail(400, 'Rating is 1 to 5');
    const f = { held_on: b.held_on || today(), notes: String(b.notes || '').slice(0, 10000), rating, shared_with_officer: !!b.shared_with_officer };
    const m = await tx(async (t) => {
      const row = b.id
        ? need(await t.one('UPDATE one_to_ones SET held_on = $3, notes = $4, rating = $5, shared_with_officer = $6, updated_at = now() WHERE id = $1 AND officer_id = $2 RETURNING *',
          [b.id, b.officer_id, f.held_on, f.notes, f.rating, f.shared_with_officer]), 'Meeting not found')
        : await insert('one_to_ones', { officer_id: b.officer_id, manager_id: user.id, ...f }, t);
      for (const g of (b.goals || []).slice(0, 10)) {
        if (!String(g.title || '').trim()) continue;
        await insert('goals', { officer_id: b.officer_id, one_to_one_id: row.id, title: String(g.title).trim().slice(0, 200), target: String(g.target || '').slice(0, 500), due_on: g.due_on || null, created_by: user.id }, t);
      }
      return row;
    });
    if (f.shared_with_officer) {
      await notify(await officerUser(b.officer_id), { kind: 'hr', title: 'Notes from your one-to-one', body: `${user.name} shared the notes from ${fmtDate(f.held_on)}.`, link: '/officer/me/growth', dedupe: `1to1:${m.id}` });
    }
    await audit(user, b.id ? 'one_to_one.update' : 'one_to_one.create', 'officer', b.officer_id, { id: m.id });
    return m;
  }),

  'oneToOnes.delete': def(MGR, async (b, { user }) => {
    const m = need(await one('SELECT * FROM one_to_ones WHERE id = $1', [b.id]), 'Meeting not found');
    await assertOfficerAccess(user, m.officer_id);
    await q('DELETE FROM one_to_ones WHERE id = $1', [m.id]);
    await audit(user, 'one_to_one.delete', 'officer', m.officer_id, { id: m.id });
    return { ok: true };
  }),

  'goals.save': def(MGR, async (b, { user }) => {
    required(b, 'officer_id', 'title');
    await assertOfficerAccess(user, b.officer_id);
    const f = { title: String(b.title).trim().slice(0, 200), target: String(b.target || '').slice(0, 500), due_on: b.due_on || null };
    const g = b.id
      ? need(await one('UPDATE goals SET title = $3, target = $4, due_on = $5, updated_at = now() WHERE id = $1 AND officer_id = $2 RETURNING *', [b.id, b.officer_id, f.title, f.target, f.due_on]), 'Goal not found')
      : await insert('goals', { officer_id: b.officer_id, one_to_one_id: b.one_to_one_id || null, ...f, created_by: user.id });
    await audit(user, b.id ? 'goal.update' : 'goal.create', 'officer', b.officer_id, { id: g.id, title: g.title });
    return g;
  }),

  'goals.setStatus': def(MGR, async (b, { user }) => {
    required(b, 'id', 'status');
    if (!GOAL_STATUS.includes(b.status)) fail(400, 'Unknown status');
    const g = need(await one('SELECT * FROM goals WHERE id = $1', [b.id]), 'Goal not found');
    await assertOfficerAccess(user, g.officer_id);
    await q('UPDATE goals SET status = $2, updated_at = now() WHERE id = $1', [g.id, b.status]);
    if (b.status !== 'open') {
      await notify(await officerUser(g.officer_id), {
        kind: 'hr', title: b.status === 'met' ? 'Goal met' : `Goal ${b.status}`, body: g.title, link: '/officer/me/growth', dedupe: `goal:${g.id}:${b.status}`,
      });
    }
    await audit(user, 'goal.status', 'officer', g.officer_id, { id: g.id, status: b.status });
    // A met goal may be the last thing a signed pay rise was waiting on
    const pending = b.status === 'met' ? await applyAgreements() : 0;
    return { ok: true, applied: pending };
  }),

  'goals.addNote': def(ALL.filter((r) => r !== 'venue'), async (b, { user }) => {
    required(b, 'goal_id', 'body');
    const g = need(await one('SELECT * FROM goals WHERE id = $1', [b.goal_id]), 'Goal not found');
    await assertOfficerAccess(user, g.officer_id);
    const n = await insert('goal_notes', { goal_id: g.id, author_user_id: user.id, body: String(b.body).trim().slice(0, 2000) });
    if (user.role === 'officer') {
      await notify(await companyManagers(), { kind: 'hr', title: `Goal update from ${user.name}`, body: `${g.title}: ${n.body.slice(0, 140)}`, link: `/company/staff/${g.officer_id}?tab=growth` });
    } else {
      await notify(await officerUser(g.officer_id), { kind: 'hr', title: 'Note on your goal', body: `${g.title}: ${n.body.slice(0, 140)}`, link: '/officer/me/growth' });
    }
    return n;
  }),

  // ---- Pay-rise agreements (company only: they change pay) ----
  'payAgreements.save': def(CO, async (b, { user }) => {
    required(b, 'officer_id', 'role', 'new_rate', 'effective_from');
    const rate = Number(b.new_rate);
    if (!(rate > 0 && rate < 1000)) fail(400, 'Enter the new hourly rate');
    await guardSelf(user, b.officer_id, { companyOnly: true, message: OWN_RATE });
    const conds = (b.condition_goal_ids || []).filter(Boolean);
    if (conds.length) {
      const ok = await q('SELECT id FROM goals WHERE id = ANY($1::uuid[]) AND officer_id = $2', [conds, b.officer_id]);
      if (ok.length !== conds.length) fail(400, 'Conditions must be this officer\'s goals');
    }
    const current = await officerRate(b.officer_id, b.role, b.venue_id || null, b.effective_from);
    const f = { role: b.role, venue_id: b.venue_id || null, new_rate: rate, effective_from: b.effective_from, condition_goal_ids: conds, current_rate: current, one_to_one_id: b.one_to_one_id || null };
    let a;
    if (b.id) {
      a = need(await one(
        `UPDATE pay_agreements SET role = $2, venue_id = $3, new_rate = $4, effective_from = $5, condition_goal_ids = $6, current_rate = $7, updated_at = now()
          WHERE id = $1 AND status = 'draft' RETURNING *`, [b.id, f.role, f.venue_id, f.new_rate, f.effective_from, f.condition_goal_ids, f.current_rate]), 'Only drafts can be changed');
    } else {
      a = await insert('pay_agreements', { officer_id: b.officer_id, ...f, created_by: user.id });
    }
    await audit(user, b.id ? 'agreement.update' : 'agreement.create', 'officer', b.officer_id, { id: a.id, rate, from: b.effective_from });
    return a;
  }),

  'payAgreements.send': def(CO, async (b, { user }) => {
    const cur = need(await one('SELECT officer_id FROM pay_agreements WHERE id = $1', [b.id]), 'Agreement not found or already sent');
    await guardSelf(user, cur.officer_id, { companyOnly: true, message: OWN_RATE });
    const a = need(await one("UPDATE pay_agreements SET status = 'sent', updated_at = now() WHERE id = $1 AND status = 'draft' RETURNING *", [b.id]), 'Agreement not found or already sent');
    const [uid] = await officerUser(a.officer_id);
    if (!uid) fail(400, 'This officer has no login yet, so they cannot sign. Invite them first.');
    await notify([uid], { kind: 'pay', title: 'Pay rise to sign', body: `${money(a.new_rate)}/h from ${fmtDate(a.effective_from)}. Read and sign it in the app.`, link: `/officer/agreements/${a.id}`, email: true });
    await audit(user, 'agreement.send', 'officer', a.officer_id, { id: a.id });
    return { ok: true };
  }),

  'payAgreements.void': def(CO, async (b, { user }) => {
    const a = need(await one("UPDATE pay_agreements SET status = 'void', updated_at = now() WHERE id = $1 AND status IN ('draft','sent','signed') RETURNING *", [b.id]), 'Agreement not found or already applied');
    await audit(user, 'agreement.void', 'officer', a.officer_id, { id: a.id });
    return { ok: true };
  }),

  'payAgreements.get': def(['company', 'officer'], async (b, { user }) => {
    const [a] = await withConditions([await agreement(user, b.id)]);
    return a;
  }),

  'payAgreements.sign': def(['officer'], async (b, { user, ip }) => {
    required(b, 'id', 'signature', 'signed_name');
    if (!String(b.signature).startsWith('data:image/png;base64,') || b.signature.length > 400000) fail(400, 'Invalid signature');
    const a = need(await one(
      `UPDATE pay_agreements SET status = 'signed', signature_png = $3, signed_name = $4, signed_at = now(), signed_ip = $5, updated_at = now()
        WHERE id = $1 AND officer_id = $2 AND status = 'sent' RETURNING *`, [b.id, user.officer_id, b.signature, String(b.signed_name).slice(0, 120), ip]), 'Agreement not found or already signed');
    await notify(await companyManagers(), { kind: 'hr', title: 'Pay rise agreement signed', body: `${b.signed_name} signed: ${money(a.new_rate)}/h from ${fmtDate(a.effective_from)}`, link: `/company/staff/${a.officer_id}?tab=growth` });
    await audit(user, 'agreement.sign', 'pay_agreement', a.id, { ip });
    const applied = await applyAgreements();
    return { ok: true, applied };
  }),

  'payAgreements.pdf': def(['company', 'officer'], async (b, { user }) => {
    const a = await agreement(user, b.id);
    const [full] = await withConditions([a]);
    const s = await getSettings();
    const name = `${a.first_name} ${a.last_name}`;
    const d = await Doc.create('Pay rise agreement');
    await d.header(s, 'Pay rise agreement', name);
    d.meta(
      [['Role', a.role_name], ['Venue', a.venue_name || 'All venues'], ['Starts', fmtDate(a.effective_from)]],
      [['Current rate', a.current_rate != null ? `${money(a.current_rate)}/h` : '-'], ['New rate', `${money(a.new_rate)}/h`], ['Status', a.status]],
    );
    d.text(`${s.company_name} agrees to pay ${name} ${money(a.new_rate)} per hour for ${a.role_name} work${a.venue_name ? ` at ${a.venue_name}` : ''} from ${fmtDate(a.effective_from)}${full.conditions.length ? ', once the goals below are met. If they are met after that date, the new rate starts on the day they are met' : ''}.`, { size: 10, gap: 6 });
    if (full.conditions.length) {
      d.section('Conditions');
      for (const g of full.conditions) d.text(`• ${g.title} (${g.status})`, { size: 10 });
    }
    d.section('Signature');
    if (a.signature_png) await d.image(a.signature_png, { width: 180 });
    d.meta([['Signed by', a.signed_name || 'Not signed'], ['Signed at', a.signed_at ? fmtDateTime(a.signed_at) : '-']], [['IP address', a.signed_ip || '-']]);
    d.footer(`${s.company_name} - electronically signed`);
    return { filename: `${name} - Pay rise agreement - ${fmtDate(a.effective_from)}.pdf`, pdf: await d.base64() };
  }),
};
