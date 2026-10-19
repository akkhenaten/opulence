// AI compliance runs: rule-based checks on licences, right to work and role documents against the rota,
// plus an AI read of uploaded licence/ID scans. Findings become Ops AI cards; a manager approves each action.
import { createHash } from 'node:crypto';
import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { getObjectBytes, headObject } from '../lib/storage.mjs';
import { extract, fileBlock, canRead, HAIKU } from '../lib/ai.mjs';
import { notify, officerUser } from '../lib/notify.mjs';
import { fmtDate, fmtTime, londonDate } from '../lib/time.mjs';
import { SIA_TYPES, DOC_LABEL } from '../lib/licences.mjs';
import { audit } from '../lib/audit.mjs';
import { venueScope } from '../lib/scope.mjs';
import { getShift } from './rota.mjs';
import { createItem, logActivity, proposeCover } from './ops.mjs';
import { CO, MGR, def } from './_def.mjs';

const ACTIVE = "('assigned','accepted')";
const NO_CLOCK_IN = "NOT EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status <> 'rejected')";
const RANK = { urgent: 3, soon: 2, advisory: 1 };
const READ_KINDS = ['sia', 'rtw', 'id'];
const sig = (...parts) => createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
const days = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const shiftLine = (sh) => `${sh.venue_name} ${fmtDate(sh.starts_at)} ${fmtTime(sh.starts_at)} (${sh.role_name})`;
const digits = (s) => String(s || '').replace(/\D/g, '');
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const docLabel = (k) => ({ sia: 'SIA licence', rtw: 'right to work' })[k] || DOC_LABEL[k] || k;

// ---------- AI document read ----------
const READ_TOOL = {
  name: 'read_document',
  description: 'What the scanned document shows',
  input_schema: {
    type: 'object',
    properties: {
      readable: { type: 'boolean', description: 'False if blurred, cropped, glare-covered or not a document' },
      doc_type: { type: 'string', description: 'e.g. SIA licence card, UK passport, share code letter, driving licence' },
      name: { type: 'string', description: 'Full name as printed' },
      number: { type: 'string', description: 'Licence or document number as printed' },
      licence_type: { type: 'string', enum: [...SIA_TYPES, 'other', 'none'], description: 'SIA licence sector if this is an SIA licence' },
      expiry: { type: 'string', description: 'Expiry date as YYYY-MM-DD, empty if none shown' },
      concerns: { type: 'array', items: { type: 'string' }, description: 'Only real problems: looks edited, details obscured, wrong document type, photo missing. Empty when fine.' },
    },
    required: ['readable', 'concerns'],
  },
};

export async function readDocuments(limit = 4) {
  const docs = await q(
    `SELECT d.* FROM documents d JOIN officers o ON o.id = d.owner_id
      WHERE d.owner_type = 'officer' AND d.kind = ANY($1) AND d.s3_key IS NOT NULL AND d.ai_read_key IS DISTINCT FROM d.s3_key
        AND o.status IN ('active','onboarding','applicant')
      ORDER BY d.created_at DESC LIMIT $2`, [READ_KINDS, limit]);
  let n = 0;
  let credits = 0;
  for (const d of docs) {
    let read;
    try {
      const head = await headObject(d.s3_key);
      const mime = d.mime || head?.mime;
      if (!head || !canRead(mime) || head.size > 4.5 * 1024 * 1024) read = { skipped: !head ? 'File missing' : 'Not a photo or PDF the AI can read' };
      else {
        const r = await extract({
          model: HAIKU, max_tokens: 600,
          system: 'You read UK identity and security licence documents for a security company\'s compliance check. Report only what is printed. Never guess missing details.',
          messages: [{ role: 'user', content: [{ type: 'text', text: `Uploaded as: ${docLabel(d.kind)} — "${d.title}"` }, fileBlock(await getObjectBytes(d.s3_key), mime)] }],
          tool: READ_TOOL,
        });
        credits += r.credits;
        read = r.input || { error: 'No answer' };
        if (read.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(read.expiry)) read.expiry = '';
      }
    } catch (e) {
      if (e.status === 429) break;
      console.error('[compliance] read failed', d.id, e.message);
      read = { error: e.message };
    }
    await q('UPDATE documents SET ai_read = $2, ai_read_key = $3, ai_read_at = now() WHERE id = $1', [d.id, read, d.s3_key]);
    n++;
  }
  if (n) await logActivity('compliance', `Read ${plural(n, 'uploaded document')} for compliance checks`, { credits });
  return n;
}

// ---------- Rules ----------
const remind = (o, kind, what) => ({ kind: 'remind', label: `Remind ${o.first_name} to upload ${what}`, params: { doc_kind: kind, what }, default: true });
const unassign = (shifts) => ({ kind: 'unassign', label: `Take them off ${shifts.length === 1 ? 'the at-risk shift' : `${shifts.length} at-risk shifts`} and find cover`, params: { assignment_ids: shifts.map((s) => s.assignment_id) }, default: false });
const correct = (field, from, to, label) => ({ kind: 'correct', label, params: { field, from, to }, company_only: true, default: false });
const recheck = (d) => ({ kind: 'recheck', label: `Mark "${d.title}" for re-check`, params: { doc_id: d.id }, default: false });

// Every issue for one officer. ctx: { today, roles: {code: role}, docs, shifts, openTasks }
export function officerIssues(o, { today, roles, docs = [], shifts = [], openTasks = 0 }) {
  const issues = [];
  const add = (i) => issues.push({ ...i, actions: (i.actions || []).map((a) => ({ ...a, id: `${i.key}|${a.kind}` })) });
  const near = (list) => (list.length && days(today, londonDate(list[0].starts_at)) <= 7 ? 'urgent' : 'soon');
  const latest = (kind) => docs.filter((d) => d.kind === kind).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const needsSia = (code) => roles[code]?.requires_sia !== false;
  const siaRoles = (o.roles || []).filter(needsSia);
  const siaShifts = shifts.filter((s) => needsSia(s.role));

  // Expiry against the rota (shift end date, so overnight shifts count) and coming up soon
  const expiring = [
    { doc: 'sia', expiry: o.sia_expiry, shifts: siaShifts, applies: siaRoles.length || siaShifts.length },
    { doc: 'rtw', expiry: o.rtw_verified ? o.rtw_expiry : null, shifts, applies: true },
  ];
  const required = new Set((o.roles || []).flatMap((r) => roles[r]?.required_docs || []));
  for (const kind of required) {
    const d = latest(kind);
    if (d?.expiry) expiring.push({ doc: kind, expiry: d.expiry, shifts: shifts.filter((s) => (roles[s.role]?.required_docs || []).includes(kind)), applies: true });
  }
  for (const e of expiring) {
    if (!e.applies || !e.expiry) continue;
    const label = docLabel(e.doc);
    const newer = docs.find((d) => d.kind === e.doc && d.expiry && d.expiry > e.expiry);
    if (newer) {
      add({
        key: `renewal:${e.doc}`, severity: 'advisory', sig: sig(e.expiry, newer.id),
        title: `Renewed ${label} uploaded — profile still shows ${fmtDate(e.expiry)}`,
        detail: `"${newer.title}" runs to ${fmtDate(newer.expiry)}. Check it and update the profile.`,
        actions: ['sia', 'rtw'].includes(e.doc) ? [correct(`${e.doc}_expiry`, e.expiry, newer.expiry, `Update ${label} expiry to ${fmtDate(newer.expiry)}`)] : [],
      });
      continue;
    }
    const atRisk = e.shifts.filter((s) => londonDate(s.ends_at) > e.expiry);
    const left = days(today, e.expiry);
    if (atRisk.length) {
      add({
        key: `expiry_shift:${e.doc}`, severity: near(atRisk), sig: sig(e.expiry, atRisk.map((s) => s.assignment_id)),
        title: `${cap(label)} ${left < 0 ? 'expired' : 'expires'} ${fmtDate(e.expiry)} — rostered after that`,
        detail: `${plural(atRisk.length, 'shift')} after expiry: ${atRisk.slice(0, 4).map(shiftLine).join('; ')}${atRisk.length > 4 ? '…' : ''}`,
        shift: atRisk[0], actions: [remind(o, e.doc, `a renewed ${label}`), unassign(atRisk)],
      });
    } else if (left <= 60) {
      add({
        key: `expiry_soon:${e.doc}`, severity: left < 0 ? 'urgent' : left <= 30 ? 'soon' : 'advisory', sig: sig(e.expiry),
        title: left < 0 ? `${cap(label)} expired ${fmtDate(e.expiry)}` : `${cap(label)} expires in ${plural(left, 'day')} (${fmtDate(e.expiry)})`,
        detail: left < 0 ? 'They cannot be rostered for licensed work until it is renewed.' : 'No renewal uploaded yet.',
        actions: [remind(o, e.doc, `a renewed ${label}`)],
      });
    }
  }

  // Missing licence or right to work
  if ((siaRoles.length || siaShifts.length) && (!o.sia_number || !o.sia_expiry)) {
    add({ key: 'missing:sia', severity: siaShifts.length ? near(siaShifts) : 'soon', sig: sig(o.sia_number, o.sia_expiry), title: 'No SIA licence on the profile', detail: siaShifts.length ? `Rostered on ${plural(siaShifts.length, 'licensed shift')}.` : '', shift: siaShifts[0], actions: [remind(o, 'sia', 'their SIA licence'), ...(siaShifts.length ? [unassign(siaShifts)] : [])] });
  }
  if (!o.rtw_verified) {
    add({ key: 'unverified:rtw', severity: shifts.length ? near(shifts) : 'soon', sig: sig(o.rtw_type), title: 'Right to work not verified', detail: shifts.length ? `Rostered on ${plural(shifts.length, 'shift')}.` : 'Check and verify on the profile.', shift: shifts[0], actions: [remind(o, 'rtw', 'right to work proof')] });
  }

  // Licence type against the roles on the profile and the shifts rostered
  const siaDoc = latest('sia');
  const licences = new Set([o.sia_type, siaDoc?.verified_at && siaDoc?.ai_read?.licence_type].filter((t) => t && SIA_TYPES.includes(t)));
  if (o.sia_number) {
    for (const code of new Set([...(o.roles || []), ...shifts.map((s) => s.role)])) {
      const accepted = roles[code]?.accepted_licences || [];
      if (!needsSia(code) || !accepted.length || accepted.some((t) => licences.has(t))) continue;
      const inRole = shifts.filter((s) => s.role === code);
      const name = roles[code]?.name || code;
      add({
        key: `licence_role:${code}`, severity: inRole.length ? near(inRole) : 'advisory', sig: sig([...licences].sort(), accepted, inRole.map((s) => s.assignment_id)),
        title: `${licences.size ? [...licences].join(' + ') : 'Licence type unknown'} — not valid for ${name}`,
        detail: `${name} needs ${accepted.join(' or ')}.${inRole.length ? ` Rostered: ${inRole.slice(0, 4).map(shiftLine).join('; ')}` : ' The role is on their profile.'}`,
        shift: inRole[0], actions: inRole.length ? [unassign(inRole), remind(o, 'sia', `a ${accepted[0]} licence`)] : [remind(o, 'sia', `a ${accepted[0]} licence`)],
      });
    }
  }

  // Required documents for their roles
  for (const kind of required) {
    if (docs.some((d) => d.kind === kind && (!d.expiry || d.expiry >= today))) continue;
    const inRole = shifts.filter((s) => (roles[s.role]?.required_docs || []).includes(kind));
    add({ key: `missing:${kind}`, severity: inRole.length ? 'soon' : 'advisory', sig: sig(kind), title: `No ${docLabel(kind)} on file`, detail: `Required for ${(o.roles || []).filter((r) => (roles[r]?.required_docs || []).includes(kind)).map((r) => roles[r]?.name || r).join(', ')}.`, shift: inRole[0], actions: [remind(o, kind, `their ${docLabel(kind)}`)] });
  }

  // What the AI read on the scans against the profile
  for (const kind of READ_KINDS) {
    const d = latest(kind);
    const r = d?.ai_read;
    if (!r || r.error || r.skipped) continue;
    if (r.readable === false || (r.concerns || []).length) {
      add({ key: `doc_suspect:${d.id}`, severity: 'urgent', sig: sig(d.s3_key), title: `"${d.title}" needs a human look`, detail: r.readable === false ? 'The scan could not be read clearly.' : r.concerns.join('; '), actions: [recheck(d), remind(o, kind, `a clear photo of their ${docLabel(kind)}`)] });
      continue;
    }
    const nm = words(r.name);
    if (nm.length && !(nm.includes(words(o.first_name)[0]) && nm.includes(words(o.last_name).pop()))) {
      add({ key: `doc_mismatch:${d.id}:name`, severity: 'soon', sig: sig(d.s3_key, o.first_name, o.last_name), title: `Name on "${d.title}" doesn't match the profile`, detail: `Scan reads "${r.name}"; profile is ${o.first_name} ${o.last_name}.`, actions: [recheck(d)] });
    }
    if (kind === 'sia' && digits(r.number) && digits(o.sia_number) && digits(r.number) !== digits(o.sia_number)) {
      add({ key: `doc_mismatch:${d.id}:number`, severity: 'soon', sig: sig(d.s3_key, o.sia_number), title: 'SIA number on the card differs from the profile', detail: `Card reads ${r.number}; profile has ${o.sia_number}.`, actions: [correct('sia_number', o.sia_number, digits(r.number), `Update profile SIA number to ${digits(r.number)}`), recheck(d)] });
    }
    const profileExpiry = kind === 'sia' ? o.sia_expiry : kind === 'rtw' ? o.rtw_expiry : d.expiry;
    if (r.expiry && profileExpiry && r.expiry !== profileExpiry) {
      add({
        key: `doc_mismatch:${d.id}:expiry`, severity: r.expiry < profileExpiry ? 'urgent' : 'advisory', sig: sig(d.s3_key, profileExpiry),
        title: `Expiry on "${d.title}" is ${fmtDate(r.expiry)}, profile says ${fmtDate(profileExpiry)}`,
        detail: r.expiry < profileExpiry ? 'The real expiry may be earlier than the rota checks assume.' : 'The profile may be out of date.',
        actions: [...(['sia', 'rtw'].includes(kind) ? [correct(`${kind}_expiry`, profileExpiry, r.expiry, `Update ${docLabel(kind)} expiry to ${fmtDate(r.expiry)}`)] : []), recheck(d)],
      });
    }
  }

  // Scans waiting for a manager to verify
  for (const d of docs.filter((x) => x.s3_key && !x.verified_at && [...READ_KINDS, ...required].includes(x.kind) && days(x.created_at, today) >= 3)) {
    add({ key: `unverified:${d.id}`, severity: 'advisory', sig: sig(d.s3_key), title: `"${d.title}" uploaded ${fmtDate(d.created_at)} but not verified`, detail: 'Check it on the officer\'s Documents tab.', actions: [] });
  }
  if (o.status === 'onboarding' && openTasks) {
    add({ key: 'onboarding', severity: shifts.length ? 'soon' : 'advisory', sig: sig(openTasks, shifts.length), title: `Onboarding not finished (${plural(openTasks, 'step')} open)`, detail: shifts.length ? `Already rostered on ${plural(shifts.length, 'shift')}.` : '', shift: shifts[0], actions: [remind(o, 'onboarding', 'the rest of their onboarding documents')] });
  }
  return issues.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

// Live issues for every active/onboarding officer (or one), without dismissed ones
export async function computeIssues({ officerId = null } = {}) {
  const today = londonDate(new Date());
  const [officers, roleRows, docs, shifts, tasks, dismissed] = await Promise.all([
    q("SELECT * FROM officers WHERE status IN ('active','onboarding') AND ($1::uuid IS NULL OR id = $1)", [officerId]),
    q('SELECT * FROM roles'),
    q("SELECT * FROM documents WHERE owner_type = 'officer' AND ($1::uuid IS NULL OR owner_id = $1)", [officerId]),
    q(`SELECT a.id AS assignment_id, a.officer_id, s.id AS shift_id, s.role, s.starts_at, s.ends_at, s.venue_id, v.name AS venue_name, r.name AS role_name
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
        WHERE a.status IN ${ACTIVE} AND s.status <> 'cancelled' AND s.ends_at > now() AND s.starts_at < now() + interval '60 days' AND ${NO_CLOCK_IN}
          AND ($1::uuid IS NULL OR a.officer_id = $1) ORDER BY s.starts_at`, [officerId]),
    q('SELECT officer_id, count(*)::int AS n FROM onboarding_tasks WHERE NOT done AND ($1::uuid IS NULL OR officer_id = $1) GROUP BY officer_id', [officerId]),
    q('SELECT * FROM compliance_dismissals WHERE ($1::uuid IS NULL OR officer_id = $1)', [officerId]),
  ]);
  const roles = Object.fromEntries(roleRows.map((r) => [r.code, r]));
  return officers.map((o) => {
    const issues = officerIssues(o, {
      today, roles, docs: docs.filter((d) => d.owner_id === o.id), shifts: shifts.filter((s) => s.officer_id === o.id),
      openTasks: tasks.find((t) => t.officer_id === o.id)?.n || 0,
    }).filter((i) => !dismissed.some((d) => d.officer_id === o.id && d.issue_key === i.key && d.sig === i.sig));
    return { officer: o, issues };
  }).filter((r) => r.issues.length);
}

// ---------- Cards ----------
function templateAdvice(o, issues) {
  const top = issues[0];
  const urgent = issues.filter((i) => i.severity === 'urgent').length;
  return `${urgent ? `${plural(urgent, 'urgent issue')} for ${o.first_name}. ` : ''}${top.title}.${issues.length > 1 ? ` Plus ${plural(issues.length - 1, 'other item')}.` : ''} Tick the actions to take and tap Apply selected.`;
}

async function advise(o, issues) {
  try {
    const r = await extract({
      model: HAIKU, max_tokens: 300,
      system: 'You advise a UK security company manager on staff compliance (SIA licensing, right to work). Write 1–3 short plain sentences: what matters most and what to do first. No greeting, no markdown. Never say an officer is definitely non-compliant when a document only needs checking.',
      messages: [{ role: 'user', content: `Officer: ${o.first_name} ${o.last_name}\nIssues:\n${issues.map((i) => `- [${i.severity}] ${i.title}. ${i.detail || ''}`).join('\n')}` }],
      tool: { name: 'advice', description: 'Advice for the manager', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    });
    return { text: r.input?.text || templateAdvice(o, issues), credits: r.credits };
  } catch {
    return { text: templateAdvice(o, issues), credits: 0 };
  }
}

const cardTitle = (o, issues) => `${o.first_name} ${o.last_name}: ${issues[0].title}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`;

export async function runCompliance({ manual = false } = {}) {
  const read = await readDocuments(8);
  const results = await computeIssues();
  const open = await q("SELECT * FROM ops_items WHERE kind = 'compliance' AND status = 'pending'");
  let created = 0;
  let updated = 0;
  let credits = 0;
  for (const { officer: o, issues } of results) {
    const severity = issues[0].severity;
    const at = issues.map((i) => i.shift).filter(Boolean).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
    const issuesSig = sig(issues.map((i) => [i.key, i.sig, i.severity]));
    const card = open.find((c) => c.officer_id === o.id);
    if (card && card.payload.sig === issuesSig) continue;
    const advice = await advise(o, issues);
    credits += advice.credits;
    const payload = { officer_id: o.id, officer_name: `${o.first_name} ${o.last_name}`, severity, issues, sig: issuesSig };
    if (card) {
      await q('UPDATE ops_items SET title = $2, reason = $3, payload = $4, venue_id = $5 WHERE id = $1', [card.id, cardTitle(o, issues), advice.text, payload, at?.venue_id || null]);
      updated++;
    } else {
      await createItem({
        kind: 'compliance', title: cardTitle(o, issues), reason: advice.text, payload, officer_id: o.id, venue_id: at?.venue_id || null,
        severity: severity === 'urgent' ? 'critical' : 'warning', dedupe: `compliance:${o.id}:${issuesSig}`,
      });
      created++;
    }
  }
  const cleared = open.filter((c) => !results.some((r) => r.officer.id === c.officer_id));
  for (const c of cleared) await q("UPDATE ops_items SET status = 'done', decided_at = now(), result = $2 WHERE id = $1", [c.id, { auto_closed: true }]);
  const { n: checked } = await one("SELECT count(*)::int AS n FROM officers WHERE status IN ('active','onboarding')");
  await logActivity('compliance', `Compliance check${manual ? ' (run by hand)' : ''}: ${plural(checked, 'officer')} checked, ${results.length} need attention${cleared.length ? `, ${cleared.length} cleared` : ''}`, { credits });
  return { checked, attention: results.length, created, updated, cleared: cleared.length, documents_read: read };
}

// Runs the actions a manager ticked on a compliance card
export async function decideCompliance(it, b, user) {
  const chosen = new Set(b.edits?.actions || []);
  const actions = (it.payload.issues || []).flatMap((i) => i.actions.map((a) => ({ ...a, issue: i })));
  const picked = actions.filter((a) => chosen.has(a.id));
  if (!picked.length) fail(400, 'Tick at least one action, or dismiss the issues instead');
  const o = need(await one('SELECT * FROM officers WHERE id = $1', [it.officer_id]), 'Officer not found');
  const done = [];
  const reminders = [...new Set(picked.filter((a) => a.kind === 'remind').map((a) => a.params.what))];
  if (reminders.length) {
    await notify(await officerUser(o.id), {
      kind: 'compliance', severity: 'warning', title: 'Please update your documents',
      body: `The office needs ${reminders.join(', ')}. Upload ${reminders.length > 1 ? 'them' : 'it'} in the app under Documents.`, link: '/officer/documents', email: true,
    });
    done.push(`Reminded ${o.first_name} (${reminders.join(', ')})`);
  }
  for (const a of picked.filter((x) => x.kind === 'unassign')) {
    const rows = await q(
      `UPDATE shift_assignments a SET status = 'cancelled' WHERE a.id = ANY($1::uuid[]) AND a.officer_id = $2 AND a.status IN ${ACTIVE} AND ${NO_CLOCK_IN} RETURNING a.shift_id`,
      [a.params.assignment_ids, o.id]);
    for (const r of rows) {
      const sh = await getShift(r.shift_id);
      await notify(await officerUser(o.id), { kind: 'shift', severity: 'warning', title: 'Taken off a shift', body: `${sh.venue_name} · ${fmtDate(sh.starts_at)} ${fmtTime(sh.starts_at)}. ${a.issue.title}. Contact the office if this is wrong.`, link: '/officer/shifts' });
      const prev = await one("SELECT max((payload->>'batch')::int) AS b FROM ops_items WHERE kind = 'cover' AND shift_id = $1", [sh.id]);
      if (sh.status === 'published') await proposeCover(sh, 'Officer taken off for compliance', { batch: (prev?.b || 0) + 1, exclude: [o.id] });
    }
    done.push(`Took ${o.first_name} off ${plural(rows.length, 'shift')}${rows.length ? ' — cover cards prepared' : ''}`);
  }
  for (const a of picked.filter((x) => x.kind === 'correct')) {
    if (user.role !== 'company') fail(403, 'Only a company manager can change profile details');
    if (!['sia_number', 'sia_expiry', 'rtw_expiry'].includes(a.params.field)) fail(400, 'Unknown field');
    await q(`UPDATE officers SET ${a.params.field} = $2 WHERE id = $1`, [o.id, a.params.to]);
    await audit(user, 'officer.update', 'officer', o.id, { [a.params.field]: { from: a.params.from, to: a.params.to }, via: 'compliance' });
    done.push(`Updated ${a.params.field.replace('_', ' ')} to ${a.params.to}`);
  }
  for (const a of picked.filter((x) => x.kind === 'recheck')) {
    const d = await one("UPDATE documents SET verified_at = NULL, verified_by = NULL WHERE id = $1 AND owner_id = $2 RETURNING title", [a.params.doc_id, o.id]);
    if (!d) continue;
    await q("INSERT INTO hr_notes (officer_id, kind, title, body, author_id) VALUES ($1, 'note', 'Document re-check', $2, $3)", [o.id, `"${d.title}" marked for re-check — ${a.issue.title}.`, user.id]);
    done.push(`Marked "${d.title}" for re-check`);
  }
  return { done };
}

export const actions = {
  'ops.complianceRun': def(CO, async () => runCompliance({ manual: true })),

  // Dismiss one issue on a card; it only comes back if the data behind it changes
  'ops.dismissIssue': def(MGR, async (b, { user }) => {
    required(b, 'id', 'key');
    const it = need(await one("SELECT * FROM ops_items WHERE id = $1 AND kind = 'compliance'", [b.id]), 'Item not found');
    const scope = await venueScope(user);
    if (scope && (!it.venue_id || !scope.includes(it.venue_id))) fail(403, 'No access to this item');
    if (it.status !== 'pending') fail(409, `Already ${it.status}`);
    const issue = need((it.payload.issues || []).find((i) => i.key === b.key), 'Issue not found');
    await q(`INSERT INTO compliance_dismissals (officer_id, issue_key, sig, reason, dismissed_by) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (officer_id, issue_key) DO UPDATE SET sig = EXCLUDED.sig, reason = EXCLUDED.reason, dismissed_by = EXCLUDED.dismissed_by, created_at = now()`,
      [it.officer_id, issue.key, issue.sig, String(b.reason || '').slice(0, 300), user.id]);
    const rest = it.payload.issues.filter((i) => i.key !== b.key);
    const o = { first_name: it.payload.officer_name.split(' ')[0], last_name: it.payload.officer_name.split(' ').slice(1).join(' ') };
    if (rest.length) {
      await q('UPDATE ops_items SET payload = $2, title = $3 WHERE id = $1', [it.id, { ...it.payload, issues: rest, severity: rest[0].severity, sig: null }, cardTitle(o, rest)]);
    } else {
      await q("UPDATE ops_items SET status = 'rejected', decided_by = $2, decided_at = now(), result = $3 WHERE id = $1", [it.id, user.id, { dismissed: true, reason: b.reason || '' }]);
    }
    await audit(user, 'compliance.dismiss', 'officer', it.officer_id, { key: issue.key, reason: b.reason || '' });
    await logActivity('decision', `${user.name} dismissed: ${issue.title} (${it.payload.officer_name})`, { ref_type: 'ops_item', ref_id: it.id, venue_id: it.venue_id });
    return { ok: true, remaining: rest.length };
  }),
};
