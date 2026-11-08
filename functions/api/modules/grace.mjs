// Grace periods: a company manager lets an officer who can't work (compliance) keep working for a set time while they
// send their documents. Renewable twice; ends by itself once the documents are in; when it runs out they are blocked
// again and Orb's compliance card offers to take them off their shifts.
import { one, q, tx } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { notify, officerUser, companyManagers } from '../lib/notify.mjs';
import { fmtDate, londonDate, addDays } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { CO, MGR, def } from './_def.mjs';
import { blockers, compliance, GRACE_KEYS, GRACE_RISKY, GRACE_MAX_DAYS, GRACE_MAX_RENEWALS } from './officers.mjs';
import { officerDisplay } from '../lib/names.mjs';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// What the officer is asked to send for each reason
const ASK = {
  sia_missing: 'your SIA licence (front and back)', sia_expired: 'your renewed SIA licence', sia_expiry_shift: 'your renewed SIA licence',
  sia_register: 'proof your SIA licence is active', rtw_unverified: 'your passport or a right to work share code', rtw_expired: 'a new right to work share code or document',
};
export const graceAsk = (covers) => [...new Set(covers.map((k) => ASK[k]).filter(Boolean))].join(' and ');

/** The reasons a grace could cover for this officer today, plus a licence that runs out before the grace would end */
export function graceable(o, today, endsOn = addDays(today, GRACE_MAX_DAYS)) {
  const keys = blockers(o, today).map((b) => b.key).filter((k) => GRACE_KEYS.includes(k));
  const needsSia = blockers({ ...o, sia_number: null }, today).some((b) => b.key === 'sia_missing');
  if (needsSia && !keys.some((k) => k.startsWith('sia_')) && o.sia_expiry && o.sia_expiry < endsOn) keys.push('sia_expiry_shift');
  return keys;
}

/** The reasons a grace still has to cover (the rest are sorted: documents in) */
const stillBlocked = (o, covers, today, endsOn) => {
  const now = graceable(o, today, endsOn);
  return covers.filter((k) => now.includes(k) || (k === 'sia_expiry_shift' && now.includes('sia_expired')));
};

const lengthOf = (b, from) => {
  const ends = b.ends_on || addDays(from, Number(b.days) || 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ends)) || ends < from) fail(422, 'Pick how long the grace period lasts');
  if (ends > addDays(from, GRACE_MAX_DAYS)) fail(422, `A grace period can be at most ${GRACE_MAX_DAYS} days at a time`);
  return ends;
};
const reasonOf = (b) => {
  const r = String(b.reason || '').trim();
  if (r.length < 5) fail(422, 'Give a reason (a few words)');
  return r.slice(0, 500);
};
const checkRisk = (covers, acked) => {
  if (covers.some((k) => GRACE_RISKY.includes(k)) && !acked) fail(422, 'Tick that you accept the risk of letting them work without a valid licence or right to work', { needs_ack: true });
};

async function event(db, graceId, kind, user, { ends_on = null, covers = null, reason = null } = {}) {
  await db.q('INSERT INTO compliance_grace_events (grace_id, kind, ends_on, covers, reason, by_user) VALUES ($1,$2,$3,$4,$5,$6)', [graceId, kind, ends_on, covers, reason, user?.id || null]);
}

const sync = (db, officerId, g) => db.q('UPDATE officers SET grace_until = $2, grace_covers = $3, grace_lapsed_on = NULL WHERE id = $1', [officerId, g.ends_on, g.covers]);

/** Close a grace: 'documents' (sent), 'expired' (ran out, still missing) or 'ended' (a manager stopped it early) */
export async function closeGrace(g, endReason, user = null, note = '') {
  await tx(async (db) => {
    await db.q('UPDATE compliance_grace SET ended_at = now(), ended_by = $2, end_reason = $3 WHERE id = $1 AND ended_at IS NULL', [g.id, user?.id || null, endReason]);
    await event(db, g.id, endReason, user, { reason: note || null });
    await db.q('UPDATE officers SET grace_until = NULL, grace_covers = NULL, grace_lapsed_on = $2 WHERE id = $1', [g.officer_id, endReason === 'expired' ? g.ends_on : null]);
  });
  await audit(user, `compliance.grace_${endReason}`, 'officer', g.officer_id, { grace_id: g.id, ends_on: g.ends_on, covers: g.covers, note });
}

async function tellOfficer(officerId, title, body, tier = 'action') {
  await notify(await officerUser(officerId), { kind: 'compliance', severity: 'warning', title, body, link: '/officer/documents', email: true, tier });
}

const officerOf = async (id) => need(await one('SELECT * FROM officers WHERE id = $1', [id]), 'Officer not found');
const openGrace = (officerId) => one('SELECT * FROM compliance_grace WHERE officer_id = $1 AND ended_at IS NULL', [officerId]);

/** The daily round: close graces whose documents are in, remind 3 and 1 days before the end, and close the ones that ran out */
export async function graceJob() {
  const today = londonDate(new Date());
  const open = await q('SELECT g.*, row_to_json(o.*) AS officer FROM compliance_grace g JOIN officers o ON o.id = g.officer_id WHERE g.ended_at IS NULL');
  const out = { documents: 0, expired: 0, reminded: 0 };
  for (const g of open) {
    const o = g.officer;
    const left = stillBlocked(o, g.covers, today, g.ends_on < today ? addDays(today, 1) : g.ends_on);
    if (!left.length) {
      await closeGrace(g, 'documents', null, 'Documents in');
      const who = [...new Set([g.granted_by, ...(await companyManagers())].filter(Boolean))];
      await notify(who, { kind: 'compliance', title: `${officerDisplay(o)} is compliant`, body: 'Their documents are in, so their grace period has closed.', link: `/company/staff/${o.id}?tab=compliance` });
      out.documents++;
    } else if (g.ends_on < today) {
      await closeGrace(g, 'expired', null, `Still missing: ${graceAsk(left)}`);
      await tellOfficer(o.id, 'Your grace period has ended', `You can't clock in or take shifts until the office has ${graceAsk(left)}. Upload ${left.length > 1 ? 'them' : 'it'} under Documents.`, 'urgent');
      out.expired++;
      const { runCompliance } = await import('./compliance.mjs');
      await runCompliance({ officerIds: [o.id] });
    } else {
      const daysLeft = Math.round((new Date(g.ends_on) - new Date(today)) / 86400000);
      if ((daysLeft === 3 || daysLeft === 1) && g.reminded_on !== today) {
        await q('UPDATE compliance_grace SET reminded_on = $2 WHERE id = $1', [g.id, today]);
        await tellOfficer(o.id, `Grace period ends in ${plural(daysLeft, 'day')}`, `Upload ${graceAsk(left)} by ${fmtDate(g.ends_on)}, or you won't be able to clock in or take shifts after it.`);
        if (g.granted_by) await notify([g.granted_by], { kind: 'compliance', title: `${officerDisplay(o)}'s grace period ends in ${plural(daysLeft, 'day')}`, body: `Still missing: ${graceAsk(left)}.`, link: `/company/people/compliance?view=cantwork` });
        out.reminded++;
      }
    }
  }
  return out;
}

/** Start or extend: shared by the sheet and Orb's grace-ended card */
export async function renewGrace(officerId, b, user) {
  const today = londonDate(new Date());
  const reason = reasonOf(b);
  const g = need(await one(
    `SELECT * FROM compliance_grace WHERE officer_id = $1 AND (ended_at IS NULL OR end_reason = 'expired') ORDER BY created_at DESC LIMIT 1`, [officerId]), 'No grace period to extend');
  if (g.ended_at && await openGrace(officerId)) fail(409, 'Already on a grace period');
  if (g.renewals >= GRACE_MAX_RENEWALS) fail(422, `This grace period has been extended ${GRACE_MAX_RENEWALS} times already. Start a new one only if you must, with a reason.`, { max_renewals: true });
  const from = g.ends_on > today ? g.ends_on : today;
  const ends = lengthOf(b, from);
  const o = await officerOf(officerId);
  const covers = [...new Set([...g.covers, ...(b.add || []).filter((k) => GRACE_KEYS.includes(k))])];
  checkRisk(covers, g.risk_ack || b.risk_ack);
  const next = await tx(async (db) => {
    const r = await db.one(`UPDATE compliance_grace SET ends_on = $2, covers = $3, renewals = renewals + 1, risk_ack = risk_ack OR $4, ended_at = NULL, ended_by = NULL, end_reason = NULL, reminded_on = NULL
                             WHERE id = $1 RETURNING *`, [g.id, ends, covers, !!b.risk_ack]);
    await event(db, g.id, 'renew', user, { ends_on: ends, covers, reason });
    await sync(db, officerId, r);
    return r;
  });
  await audit(user, 'compliance.grace_renew', 'officer', officerId, { grace_id: g.id, ends_on: ends, covers, reason, renewal: next.renewals });
  await tellOfficer(officerId, `You can work until ${fmtDate(ends)}`, `Your grace period has been extended. Upload ${graceAsk(stillBlocked(o, covers, today, ends)) || 'your documents'} by then under Documents.`);
  return next;
}

export const actions = {
  // Who can't work right now, and who is working on a grace period
  'compliance.blocked': def(MGR, async () => {
    const today = londonDate(new Date());
    const [officers, graces, next] = await Promise.all([
      q("SELECT * FROM officers WHERE status = 'active' ORDER BY first_name, last_name"),
      q(`SELECT DISTINCT ON (g.officer_id) g.*, u.name AS granted_by_name FROM compliance_grace g LEFT JOIN users u ON u.id = g.granted_by
          WHERE g.ended_at IS NULL OR g.end_reason = 'expired' ORDER BY g.officer_id, g.created_at DESC`),
      q(`SELECT DISTINCT ON (a.officer_id) a.officer_id, s.starts_at, v.name AS venue_name FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id
          WHERE a.status IN ('assigned','accepted') AND s.status <> 'cancelled' AND s.ends_at > now() ORDER BY a.officer_id, s.starts_at`),
    ]);
    const blocked = [];
    const onGrace = [];
    for (const o of officers) {
      const c = compliance(o, today);
      const last = graces.find((x) => x.officer_id === o.id);
      const g = last && !last.ended_at ? last : null;
      if (c.ok && !g) continue;
      const brief = (x) => ({ id: x.id, ends_on: x.ends_on, covers: x.covers, reason: x.reason, renewals: x.renewals, risk_ack: x.risk_ack, granted_by: x.granted_by_name, days_left: Math.round((new Date(x.ends_on) - new Date(today)) / 86400000) });
      const row = {
        officer: { id: o.id, first_name: o.first_name, last_name: o.last_name, name: officerDisplay(o), photo_url: await downloadUrl(o.photo_key) },
        issues: c.issues, graced: c.graced, keys: graceable(o, today), next: next.find((n) => n.officer_id === o.id) || null, lapsed_on: o.grace_lapsed_on,
      };
      if (g) onGrace.push({ ...row, grace: brief(g) });
      else blocked.push({ ...row, lapsed: last && o.grace_lapsed_on ? brief(last) : null });
    }
    onGrace.sort((a, b) => a.grace.ends_on.localeCompare(b.grace.ends_on));
    return { blocked, onGrace, max_days: GRACE_MAX_DAYS, max_renewals: GRACE_MAX_RENEWALS, risky: GRACE_RISKY };
  }),

  // One person's grace periods, newest first, with what happened to each
  'compliance.grace.history': def(MGR, async (b) => {
    required(b, 'officer_id');
    const graces = await q('SELECT g.*, u.name AS granted_by_name FROM compliance_grace g LEFT JOIN users u ON u.id = g.granted_by WHERE g.officer_id = $1 ORDER BY g.created_at DESC LIMIT 10', [b.officer_id]);
    const events = graces.length ? await q('SELECT e.*, u.name AS by_name FROM compliance_grace_events e LEFT JOIN users u ON u.id = e.by_user WHERE e.grace_id = ANY($1::uuid[]) ORDER BY e.created_at', [graces.map((g) => g.id)]) : [];
    const o = await officerOf(b.officer_id);
    const today = londonDate(new Date());
    return { graces: graces.map((g) => ({ ...g, events: events.filter((e) => e.grace_id === g.id) })), keys: graceable(o, today), max_days: GRACE_MAX_DAYS, max_renewals: GRACE_MAX_RENEWALS, risky: GRACE_RISKY };
  }),

  'compliance.grace.grant': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    const today = londonDate(new Date());
    const o = await officerOf(b.officer_id);
    if (o.status !== 'active') fail(422, 'Only active staff can be given a grace period');
    if (await openGrace(o.id)) fail(409, 'Already on a grace period; extend it instead');
    const reason = reasonOf(b);
    const ends = lengthOf(b, today);
    const possible = graceable(o, today, ends);
    const covers = b.covers?.length ? b.covers.filter((k) => possible.includes(k)) : possible;
    if (!covers.length) fail(422, 'Nothing for a grace period to cover: they can already work');
    checkRisk(covers, b.risk_ack);
    const g = await tx(async (db) => {
      const r = await db.one(`INSERT INTO compliance_grace (officer_id, covers, starts_on, ends_on, reason, risk_ack, granted_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [o.id, covers, today, ends, reason, !!b.risk_ack, user.id]);
      await event(db, r.id, 'grant', user, { ends_on: ends, covers, reason });
      await sync(db, o.id, r);
      return r;
    });
    await audit(user, 'compliance.grace_grant', 'officer', o.id, { grace_id: g.id, ends_on: ends, covers, reason, risk_ack: !!b.risk_ack, issues: blockers(o, today).map((x) => x.text) });
    await tellOfficer(o.id, `You can work until ${fmtDate(ends)}`, `Upload ${graceAsk(covers)} by then under Documents, or you won't be able to clock in or take shifts after it.`);
    return { ok: true, grace: g };
  }),

  'compliance.grace.renew': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    return { ok: true, grace: await renewGrace(b.officer_id, b, user) };
  }),

  // A new reason turned up during the grace (say the licence expired): cover it too, same end date
  'compliance.grace.cover': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    const g = need(await openGrace(b.officer_id), 'Not on a grace period');
    const reason = reasonOf(b);
    const o = await officerOf(b.officer_id);
    const add = (b.add || []).filter((k) => graceable(o, londonDate(new Date()), g.ends_on).includes(k) && !g.covers.includes(k));
    if (!add.length) fail(422, 'Nothing new to cover');
    const covers = [...g.covers, ...add];
    checkRisk(covers, g.risk_ack || b.risk_ack);
    await tx(async (db) => {
      const r = await db.one('UPDATE compliance_grace SET covers = $2, risk_ack = risk_ack OR $3 WHERE id = $1 RETURNING *', [g.id, covers, !!b.risk_ack]);
      await event(db, g.id, 'cover', user, { ends_on: g.ends_on, covers: add, reason });
      await sync(db, o.id, r);
    });
    await audit(user, 'compliance.grace_cover', 'officer', o.id, { grace_id: g.id, add, reason, risk_ack: !!b.risk_ack });
    return { ok: true };
  }),

  'compliance.grace.end': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    const g = need(await openGrace(b.officer_id), 'Not on a grace period');
    await closeGrace(g, 'ended', user, String(b.reason || '').slice(0, 500));
    const o = await officerOf(b.officer_id);
    const c = compliance(o);
    if (!c.ok) await tellOfficer(o.id, 'Your grace period has ended', `You can't clock in or take shifts until the office has ${graceAsk(g.covers)}. Upload ${g.covers.length > 1 ? 'them' : 'it'} under Documents.`);
    return { ok: true };
  }),
};

