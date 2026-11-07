// AI compliance runs: rule-based checks on licences, right to work and role documents against the rota,
// plus an AI read of uploaded licence/ID scans. Findings become Orb cards; a manager approves each action.
import { createHash } from 'node:crypto';
import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { getObjectBytes, headObject } from '../lib/storage.mjs';
import { extract, fileBlock, canRead, HAIKU } from '../lib/ai.mjs';
import { notify, withdraw, officerUser, companyManagers, emailHtml, sendRawEmail } from '../lib/notify.mjs';
import { getBrand } from '../lib/brand.mjs';
import { downloadUrl, photoUrls } from '../lib/storage.mjs';
import { fmtDate, fmtTime, londonDate } from '../lib/time.mjs';
import { SIA_TYPES, DOC_LABEL, TRAINING_KINDS } from '../lib/licences.mjs';
import { audit } from '../lib/audit.mjs';
import { venueScope } from '../lib/scope.mjs';
import { getShift } from './rota.mjs';
import { createItem, logActivity, proposeCover } from './ops.mjs';
import { afterShiftChange } from './shiftSync.mjs';
import { trainingStatus } from './academy.mjs';
import { moduleOn } from '../lib/modules.mjs';
import { lawAlerts } from '../lib/contractContent.mjs';
import { CO, MGR, def } from './_def.mjs';
import { statusesFor, pairKey, OK } from '../lib/venuePack.mjs';
import { NOT_CLEARED, STATUS_LABEL, RECHECK_DAYS, daysSinceCheck, siaCheckOn } from '../lib/sia.mjs';
import { officerDisplay } from '../lib/names.mjs';
import { cleanShareCode, SHARE_CODE_OLD } from '../lib/rtw.mjs';

const ACTIVE = "('assigned','accepted')";
const NO_CLOCK_IN = "NOT EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status <> 'rejected')";
const RANK = { urgent: 3, soon: 2, advisory: 1 };
const READ_KINDS = ['sia', 'rtw', 'id'];
const sig = (...parts) => createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
const days = (from, to) => Math.round((new Date(to) - new Date(from)) / 86400000);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const shiftLine = (sh) => `${sh.venue_name} ${fmtDate(sh.starts_at)} ${fmtTime(sh.starts_at)} (${sh.role_name})`;
const digits = (s) => String(s || '').replace(/\D/g, '');
const siaFmt = (x) => digits(x).replace(/(\d{4})(?=\d)/g, '$1 ');
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
      share_code: { type: 'string', description: 'Right to work share code if shown (9 letters and numbers starting with W), else empty' },
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
        AND NOT (o.status = 'applicant' AND EXISTS (SELECT 1 FROM applications ap WHERE ap.officer_id = o.id))
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
    // A share code read off a screenshot goes onto the document, ready to check on GOV.UK
    const code = d.kind === 'rtw' && !d.number && cleanShareCode(read?.share_code);
    if (code) await q('UPDATE documents SET number = $2 WHERE id = $1', [d.id, code]);
    n++;
  }
  if (n) await logActivity('compliance', `Read ${plural(n, 'uploaded document')} for compliance checks`, { credits });
  return n;
}

// ---------- Rules ----------
const PACK_TITLE = { unsigned: 'Site pack not signed', resign: 'Site pack changed, needs signing again', refresher: 'Site pack refresher due' };
const remind = (o, kind, what) => ({ kind: 'remind', label: `Remind ${o.first_name} to upload ${what}`, params: { doc_kind: kind, what }, default: true });
const unassign = (shifts) => ({ kind: 'unassign', label: `Take them off ${shifts.length === 1 ? 'the at-risk shift' : `${shifts.length} at-risk shifts`} and find cover`, params: { assignment_ids: shifts.map((s) => s.assignment_id) }, default: false });
const correct = (field, from, to, label) => ({ kind: 'correct', label, params: { field, from, to }, company_only: true, default: false });
const remindTraining = (o, t, refresher = false) => ({ kind: 'remind', label: `Remind ${o.first_name} to ${refresher ? 'redo' : 'complete'} "${t.title}"`, params: { course_id: t.course_id, what: `"${t.title}"`, refresher }, default: true });
const recheck = (d) => ({ kind: 'recheck', label: `Mark "${d.title}" for re-check`, params: { doc_id: d.id }, default: false });

// Every issue for one officer. ctx: { today, roles: {code: role}, docs, shifts, openTasks }
export function officerIssues(o, { today, roles, docs = [], shifts = [], openTasks = 0, training = [], certs = [], packs = [] }) {
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
        detail: e.doc === 'rtw' ? 'Do a follow-up right to work check before then: ask for a new share code and tap Check right to work.'
          : left < 0 ? 'They cannot be rostered for licensed work until it is renewed.' : 'No renewal uploaded yet.',
        actions: [remind(o, e.doc, `a renewed ${label}`)],
      });
    }
  }

  // Missing licence or right to work
  if ((siaRoles.length || siaShifts.length) && (!o.sia_number || !o.sia_expiry)) {
    add({ key: 'missing:sia', severity: siaShifts.length ? near(siaShifts) : 'soon', sig: sig(o.sia_number, o.sia_expiry), title: o.sia_type ? 'SIA licence number or expiry missing on the profile' : 'No SIA licence on the profile', detail: siaShifts.length ? `Rostered on ${plural(siaShifts.length, 'licensed shift')}.` : '', shift: siaShifts[0], actions: [remind(o, 'sia', 'their SIA licence'), ...(siaShifts.length ? [unassign(siaShifts)] : [])] });
  }
  // What a manager saw on the SIA public register: not Active blocks licensed work; checks go stale after 90 days
  const needsLicence = siaCheckOn() && (siaRoles.length || siaShifts.length);
  if (needsLicence && NOT_CLEARED.includes(o.sia_status)) {
    add({
      key: 'register:sia', severity: 'urgent', sig: sig(o.sia_status, o.sia_last_verified_at),
      title: `SIA register shows the licence as ${STATUS_LABEL[o.sia_status]}`,
      detail: `Checked ${fmtDate(o.sia_last_verified_at)}. They can't be rostered for licensed work until a check shows Active.${siaShifts.length ? ` Rostered on ${plural(siaShifts.length, 'licensed shift')}.` : ''}`,
      shift: siaShifts[0], actions: [...(siaShifts.length ? [{ ...unassign(siaShifts), default: true }] : []), remind(o, 'sia', 'proof their SIA licence is active')],
    });
  } else if (needsLicence && o.sia_number && o.status !== 'applicant') {
    const since = daysSinceCheck(o.sia_last_verified_at, today);
    if ((since === null && siaShifts.length) || since > RECHECK_DAYS) {
      add({
        key: 'recheck:sia', severity: siaShifts.length ? near(siaShifts) : 'advisory', sig: sig(o.sia_last_verified_at),
        title: since === null ? 'SIA licence never checked on the register' : `SIA register check is ${plural(since, 'day')} old`,
        detail: `Use "Verify SIA licence" on their profile.${siaShifts.length ? ` Rostered on ${plural(siaShifts.length, 'licensed shift')}.` : ''}`,
        shift: siaShifts[0], actions: [],
      });
    }
  }
  // Right to work: a share code waiting to be checked on GOV.UK, or nothing to check yet
  const codeDoc = docs.filter((d) => d.kind === 'rtw' && cleanShareCode(d.number)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (!o.rtw_verified && codeDoc) {
    const age = days(londonDate(codeDoc.created_at), today);
    if (age > SHARE_CODE_OLD) {
      add({ key: 'rtw:code_old', severity: shifts.length ? near(shifts) : 'soon', sig: sig(codeDoc.id), title: `Right to work share code is ${plural(age, 'day')} old — ask for a new one`, detail: 'Share codes stop working after 90 days.', shift: shifts[0], actions: [remind(o, 'rtw', 'a new right to work share code')] });
    } else {
      add({ key: 'rtw:code_ready', severity: shifts.length ? near(shifts) : 'soon', sig: sig(codeDoc.id), title: 'Right to work share code ready to check on GOV.UK', detail: `Share code ${cleanShareCode(codeDoc.number)}. Open their profile and tap Check right to work.${shifts.length ? ` Rostered on ${plural(shifts.length, 'shift')}.` : ''}`, shift: shifts[0], actions: [] });
    }
  } else if (!o.rtw_verified) {
    add({ key: 'unverified:rtw', severity: shifts.length ? near(shifts) : 'soon', sig: sig(o.rtw_type), title: 'Right to work not verified', detail: shifts.length ? `Rostered on ${plural(shifts.length, 'shift')}.` : 'Ask for their share code, or check their passport, then tap Check right to work on the profile.', shift: shifts[0], actions: [remind(o, 'rtw', 'their right to work share code')] });
  } else if (!o.rtw_checked_at) {
    add({ key: 'rtw:no_record', severity: 'advisory', sig: sig(o.rtw_type, o.rtw_expiry), title: 'Right to work ticked by hand, no check saved', detail: 'Do the check again and upload the GOV.UK page (or your copy of their passport) with Check right to work.', actions: [] });
  }

  // A fixed-term contract coming to an end: extend it, replace it or let it end
  if (o.contract_end) {
    const left = days(today, o.contract_end);
    const renewed = o.fixed_term_renewals || 0;
    if (left <= 30) {
      add({
        key: 'contract_end', severity: left < 0 ? 'soon' : 'advisory', sig: sig(o.contract_end, o.engagement_contract_id),
        title: left < 0 ? `Fixed-term contract ended ${fmtDate(o.contract_end)}` : `Fixed-term contract ends in ${plural(left, 'day')} (${fmtDate(o.contract_end)})`,
        detail: `${renewed ? `Extended ${plural(renewed, 'time')} so far. ` : ''}Extend or replace it from their Contracts tab, or let it end.${renewed >= 3 ? ' After four years of successive fixed-term contracts an employee may count as permanent: take advice before extending again.' : ''}`,
      });
    }
  }

  // Licence type against the roles on the profile and the shifts rostered
  const siaDoc = latest('sia');
  const licences = new Set([o.sia_type, siaDoc?.verified_at && siaDoc?.ai_read?.licence_type].filter((t) => t && SIA_TYPES.includes(t)));
  if (o.sia_number || o.sia_type) {
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
      add({ key: `doc_mismatch:${d.id}:number`, severity: 'soon', sig: sig(d.s3_key, o.sia_number), title: 'SIA number on the card differs from the profile', detail: `Card reads ${r.number}; profile has ${o.sia_number}.`, actions: [correct('sia_number', o.sia_number, siaFmt(r.number), `Update profile SIA number to ${siaFmt(r.number)}`), recheck(d)] });
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
  for (const d of docs.filter((x) => x.s3_key && !x.verified_at && [...READ_KINDS, ...required].includes(x.kind) && !(x.kind === 'rtw' && (o.rtw_verified || x === codeDoc)) && days(x.created_at, today) >= 3)) {
    add({ key: `unverified:${d.id}`, severity: 'advisory', sig: sig(d.s3_key), title: `"${d.title}" uploaded ${fmtDate(d.created_at)} but not verified`, detail: 'Check it on the officer\'s Documents tab.', actions: [] });
  }
  if (o.status === 'onboarding' && openTasks) {
    add({ key: 'onboarding', severity: shifts.length ? 'soon' : 'advisory', sig: sig(openTasks, shifts.length), title: `Onboarding not finished (${plural(openTasks, 'step')} open)`, detail: shifts.length ? `Already rostered on ${plural(shifts.length, 'shift')}.` : '', shift: shifts[0], actions: [remind(o, 'onboarding', 'the rest of their onboarding documents')] });
  }
  // Mandatory training: overdue (urgent after 14 days), or a certificate that has lapsed
  for (const t of training) {
    const cert = t.cert;
    const covered = cert && (!cert.expires_at || cert.expires_at > (t.due_date || today));
    if (covered) continue;
    if (t.due_date && t.due_date < today) {
      const late = days(t.due_date, today);
      add({ key: `training:${t.course_id}`, severity: late > 14 ? 'urgent' : 'soon', sig: sig(t.due_date, cert?.id), title: `Mandatory training overdue: ${t.title}`, detail: `Due ${fmtDate(t.due_date)} (${plural(late, 'day')} ago).`, actions: [remindTraining(o, t)] });
    } else if (cert?.expires_at && cert.expires_at < today) {
      add({ key: `training:${t.course_id}`, severity: 'advisory', sig: sig(t.due_date, cert.id), title: `Training certificate expired: ${t.title}`, detail: `Expired ${fmtDate(cert.expires_at)}.`, actions: [remindTraining(o, t)] });
    }
  }
  // Outside certificates (first aid, CCTV, other courses) that are not a role requirement: refreshers coming up
  const outside = new Map();
  for (const d of docs.filter((x) => TRAINING_KINDS.includes(x.kind) && x.expiry && !required.has(x.kind))) {
    const k = `${d.kind}:${String(d.title).trim().toLowerCase()}`;
    if (!outside.has(k) || d.expiry > outside.get(k).expiry) outside.set(k, d);
  }
  for (const d of outside.values()) {
    const left = days(today, d.expiry);
    if (left > 60) continue;
    add({
      key: `refresher:${d.kind}:${sig(String(d.title).trim().toLowerCase())}`, severity: left <= 30 ? 'soon' : 'advisory', sig: sig(d.id, d.expiry),
      title: left < 0 ? `${d.title} expired ${fmtDate(d.expiry)}` : `${d.title} expires in ${plural(left, 'day')} (${fmtDate(d.expiry)})`,
      detail: `${cap(docLabel(d.kind))}${d.provider ? ` from ${d.provider}` : ''}. Book a refresher and upload the new certificate.`,
      actions: [remind(o, d.kind, `a renewed ${docLabel(d.kind)}`)],
    });
  }
  // Academy certificates running out (mandatory courses already overdue are covered above)
  for (const c of certs) {
    if (!c.expires_at || issues.some((i) => i.key === `training:${c.course_id}`)) continue;
    const left = days(today, c.expires_at);
    if (left > 60) continue;
    add({
      key: `refresher:course:${c.course_id}`, severity: left <= 30 ? 'soon' : 'advisory', sig: sig(c.id, c.expires_at),
      title: left < 0 ? `Academy certificate expired: ${c.title}` : `Academy refresher due in ${plural(left, 'day')}: ${c.title}`,
      detail: `Certificate ${left < 0 ? 'ran out' : 'runs out'} ${fmtDate(c.expires_at)}.`,
      actions: [remindTraining(o, c, true)],
    });
  }
  // Booked at a venue in the next 14 days without a current signature on its site pack (clock-in waits for it)
  for (const p of packs) {
    const first = p.shifts[0];
    const soonest = days(today, londonDate(first.starts_at));
    add({
      key: `venue_pack:${p.venue_id}`, severity: soonest <= 2 ? 'urgent' : 'soon', sig: sig(p.status, p.reference),
      title: `${PACK_TITLE[p.status] || 'Site pack not signed'}: ${p.venue_name}`,
      detail: `Booked on ${plural(p.shifts.length, 'shift')} there, first ${fmtDate(first.starts_at)}. They cannot clock in until it is signed.`, shift: first,
      actions: [{ kind: 'remind', label: `Remind ${o.first_name} to sign the ${p.venue_name} site pack`, params: { venue_id: p.venue_id, what: `the ${p.venue_name} site pack` }, default: true }, unassign(p.shifts)],
    });
  }
  return issues.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

// Latest Academy certificate per officer and course (published courses only)
export const latestCertificates = (officerId = null) => q(
  `SELECT DISTINCT ON (c.officer_id, c.course_id) c.id, c.officer_id, c.course_id, c.issued_at, c.expires_at, co.title, co.mandatory
     FROM certificates c JOIN courses co ON co.id = c.course_id AND co.status = 'published'
    WHERE ($1::uuid IS NULL OR c.officer_id = $1) ORDER BY c.officer_id, c.course_id, c.issued_at DESC`, [officerId]);

// Live issues for every active/onboarding officer (or one), without dismissed ones
export async function computeIssues({ officerId = null } = {}) {
  const today = londonDate(new Date());
  const [officers, roleRows, docs, shifts, tasks, dismissed, training, certs] = await Promise.all([
    q("SELECT * FROM officers WHERE status IN ('active','onboarding') AND ($1::uuid IS NULL OR id = $1)", [officerId]),
    q('SELECT * FROM roles'),
    q("SELECT * FROM documents WHERE owner_type = 'officer' AND ($1::uuid IS NULL OR owner_id = $1)", [officerId]),
    q(`SELECT a.id AS assignment_id, a.officer_id, s.id AS shift_id, s.role, s.starts_at, s.ends_at, s.venue_id, v.name AS venue_name, r.name AS role_name
         FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
        WHERE a.status IN ${ACTIVE} AND s.status <> 'cancelled' AND s.ends_at > now() AND s.starts_at < now() + interval '60 days' AND ${NO_CLOCK_IN}
          AND ($1::uuid IS NULL OR a.officer_id = $1) ORDER BY s.starts_at`, [officerId]),
    q('SELECT officer_id, count(*)::int AS n FROM onboarding_tasks WHERE NOT done AND ($1::uuid IS NULL OR officer_id = $1) GROUP BY officer_id', [officerId]),
    q('SELECT * FROM compliance_dismissals WHERE ($1::uuid IS NULL OR officer_id = $1)', [officerId]),
    moduleOn('academy').then((on) => (on ? trainingStatus(officerId) : [])),
    moduleOn('academy').then((on) => (on ? latestCertificates(officerId) : [])),
  ]);
  const roles = Object.fromEntries(roleRows.map((r) => [r.code, r]));
  const packs = await packIssues(shifts);
  return officers.map((o) => {
    const issues = officerIssues(o, {
      today, roles, docs: docs.filter((d) => d.owner_id === o.id), shifts: shifts.filter((s) => s.officer_id === o.id), packs: packs.filter((p) => p.officer_id === o.id),
      openTasks: tasks.find((t) => t.officer_id === o.id)?.n || 0, training: training.filter((t) => t.officer_id === o.id), certs: certs.filter((c) => c.officer_id === o.id),
    }).filter((i) => !dismissed.some((d) => d.officer_id === o.id && d.issue_key === i.key && d.sig === i.sig));
    return { officer: o, issues };
  }).filter((r) => r.issues.length);
}

/** Officer/venue pairs booked in the next 14 days whose venue pack is not signed and current */
async function packIssues(shifts) {
  const soon = shifts.filter((s) => new Date(s.starts_at) < new Date(Date.now() + 14 * 86400000));
  const groups = new Map();
  for (const s of soon) {
    const k = pairKey(s.officer_id, s.venue_id);
    if (!groups.has(k)) groups.set(k, { officer_id: s.officer_id, venue_id: s.venue_id, venue_name: s.venue_name, shifts: [] });
    groups.get(k).shifts.push(s);
  }
  if (!groups.size) return [];
  const st = await statusesFor([...groups.values()]);
  return [...groups.entries()].map(([k, g]) => ({ ...g, status: st.get(k).status, reference: st.get(k).signing?.reference || '' })).filter((g) => !OK.has(g.status));
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
      system: 'You advise a UK security company manager on staff compliance (SIA licensing, right to work). Write 1–3 short plain sentences: what matters most and what to do first. No greeting, no markdown. Never say an officer is definitely non-compliant when a document only needs checking. Refer to the officer by first name or "they" — never he, she, his or her. Only SIA licensing and right to work are legal requirements; other documents are company rules, so do not call them legal or regulatory. Do not invent deadlines, dates or facts that are not in the list.',
      messages: [{ role: 'user', content: `Officer: ${o.first_name} ${o.last_name}\nIssues:\n${issues.map((i) => `- [${i.severity}] ${i.title}. ${i.detail || ''}`).join('\n')}` }],
      tool: { name: 'advice', description: 'Advice for the manager', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    });
    return { text: r.input?.text || templateAdvice(o, issues), credits: r.credits };
  } catch {
    return { text: templateAdvice(o, issues), credits: 0 };
  }
}

const cardTitle = (o, issues) => `${officerDisplay(o)}: ${issues[0].title}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`;

/** Open cards that no longer have an issue behind them. officerIds: only those people were checked. */
export const clearedCards = (open, results, officerIds = null) =>
  open.filter((c) => (!officerIds || officerIds.includes(c.officer_id)) && !results.some((r) => r.officer.id === c.officer_id));

/** officerIds: re-check just these people straight after a rota change (no document reading, nothing logged). */
export async function runCompliance({ manual = false, officerIds = null } = {}) {
  const read = officerIds ? 0 : await readDocuments(8);
  const results = officerIds ? (await Promise.all(officerIds.map((officerId) => computeIssues({ officerId })))).flat() : await computeIssues();
  const open = await q("SELECT * FROM ops_items WHERE kind = 'compliance' AND status = 'pending' AND ($1::uuid[] IS NULL OR officer_id = ANY($1))", [officerIds]);
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
    const payload = { officer_id: o.id, officer_name: officerDisplay(o), severity, issues, sig: issuesSig };
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
  const cleared = clearedCards(open, results, officerIds);
  for (const c of cleared) await q("UPDATE ops_items SET status = 'done', decided_at = now(), result = $2 WHERE id = $1", [c.id, { auto_closed: true }]);
  await withdraw({ items: cleared.map((c) => c.id) });
  if (officerIds) return { checked: officerIds.length, attention: results.length, created, updated, cleared: cleared.length };
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
  const reminders = [...new Set(picked.filter((a) => a.kind === 'remind' && !a.params.course_id && !a.params.venue_id).map((a) => a.params.what))];
  for (const a of picked.filter((x) => x.kind === 'remind' && x.params.venue_id)) {
    await notify(await officerUser(o.id), {
      kind: 'venue_pack', severity: 'warning', title: `Please read and sign ${a.params.what}`,
      body: 'You are booked there soon. Clock-in stays blocked until the site pack is read and signed.', link: `/officer/venue-pack/${a.params.venue_id}`, email: true,
    });
    done.push(`Reminded ${o.first_name} to sign ${a.params.what}`);
  }
  for (const a of picked.filter((x) => x.kind === 'remind' && x.params.course_id)) {
    await notify(await officerUser(o.id), {
      kind: 'compliance', severity: 'warning', title: `Please ${a.params.refresher ? 'redo' : 'complete'} your training: ${a.params.what.replace(/"/g, '')}`,
      body: a.params.refresher ? 'Your certificate is running out. Open the course under Learn and pass the quiz again to renew it.' : 'This course is mandatory. Open it in the app under Learn and pass the quiz to get your certificate.',
      link: `/officer/learn/academy/${a.params.course_id}`,
    });
    done.push(`Reminded ${o.first_name} to complete ${a.params.what}`);
  }
  if (reminders.length) {
    await notify(await officerUser(o.id), {
      kind: 'compliance', severity: 'warning', title: 'Please update your documents',
      body: `The office needs ${reminders.join(', ')}. Upload ${reminders.length > 1 ? 'them' : 'it'} in the app under Documents.`, link: '/officer/documents', email: true,
    });
    done.push(`Reminded ${o.first_name} (${reminders.join(', ')})`);
  }
  for (const a of picked.filter((x) => x.kind === 'unassign')) {
    const rows = await q(
      `UPDATE shift_assignments a SET status = 'cancelled' WHERE a.id = ANY($1::uuid[]) AND a.officer_id = $2 AND a.status IN ${ACTIVE} AND ${NO_CLOCK_IN} RETURNING a.id, a.shift_id`,
      [a.params.assignment_ids, o.id]);
    for (const r of rows) {
      await afterShiftChange({ removed: [{ ...r, officer_id: o.id }] });
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
    done.push(`Updated ${{ sia_number: 'SIA number', sia_expiry: 'SIA expiry', rtw_expiry: 'right to work expiry' }[a.params.field]} to ${a.params.field.endsWith('expiry') ? fmtDate(a.params.to) : a.params.to}`);
  }
  for (const a of picked.filter((x) => x.kind === 'recheck')) {
    const d = await one("UPDATE documents SET verified_at = NULL, verified_by = NULL WHERE id = $1 AND owner_id = $2 RETURNING title", [a.params.doc_id, o.id]);
    if (!d) continue;
    await q("INSERT INTO hr_notes (officer_id, kind, title, body, author_id) VALUES ($1, 'note', 'Document re-check', $2, $3)", [o.id, `"${d.title}" marked for re-check — ${a.issue.title}.`, user.id]);
    done.push(`Marked "${d.title}" for re-check`);
  }
  return { done };
}

// ---------- Training records, refreshers and the overview screen ----------
const SEV_ORDER = { urgent: 0, soon: 1, advisory: 2 };

async function staffList() {
  const rows = await q("SELECT id, first_name, last_name, photo_key, roles, status FROM officers WHERE status IN ('active','onboarding') ORDER BY first_name, last_name");
  return Promise.all(rows.map(async ({ photo_key, ...o }) => ({ ...o, ...(await photoUrls(photo_key)) })));
}

// Outside certificates (newest first) and Academy certificates in one list per officer
async function trainingRecords() {
  const today = londonDate(new Date());
  const [docs, certs, assigned] = await Promise.all([
    q(`SELECT id, owner_id AS officer_id, kind, title, provider, issued_on, expiry, verified_at, s3_key IS NOT NULL AS has_file, created_at
         FROM documents WHERE owner_type = 'officer' AND kind = ANY($1) ORDER BY created_at DESC`, [TRAINING_KINDS]),
    moduleOn('academy').then((on) => (on ? latestCertificates() : [])),
    moduleOn('academy').then((on) => (on ? q(`SELECT a.officer_id, a.course_id, a.due_date, co.title FROM course_assignments a JOIN courses co ON co.id = a.course_id AND co.status = 'published'`) : [])),
  ]);
  const left = (d) => (d ? days(today, d) : null);
  const outside = docs.map((d) => ({ source: 'outside', id: d.id, officer_id: d.officer_id, kind: d.kind, title: d.title, provider: d.provider, issued_on: d.issued_on, expires_on: d.expiry, days_left: left(d.expiry), verified: !!d.verified_at, has_file: d.has_file }));
  const academy = certs.map((c) => ({ source: 'academy', id: c.id, officer_id: c.officer_id, course_id: c.course_id, kind: 'academy', title: c.title, provider: 'Academy', issued_on: String(c.issued_at).slice(0, 10), expires_on: c.expires_at, days_left: left(c.expires_at), mandatory: c.mandatory }));
  const todo = assigned.filter((a) => !certs.some((c) => c.officer_id === a.officer_id && c.course_id === a.course_id && (!c.expires_at || !a.due_date || c.expires_at > a.due_date)))
    .map((a) => ({ officer_id: a.officer_id, course_id: a.course_id, title: a.title, due_date: a.due_date, overdue: !!a.due_date && a.due_date < today }));
  return { outside, academy, todo };
}

// Keep only the newest record per officer and certificate name (a renewal replaces the old one)
const newest = (list) => {
  const m = new Map();
  for (const r of list) {
    const k = `${r.officer_id}:${r.course_id || `${r.kind}:${String(r.title).trim().toLowerCase()}`}`;
    if (!m.has(k) || (r.expires_on || '9999') > (m.get(k).expires_on || '9999')) m.set(k, r);
  }
  return [...m.values()];
};

export const actions = {
  // Every member of staff: Academy courses passed / to do and outside certificates
  'academy.staffRecords': def(MGR, async () => {
    const [staff, rec] = await Promise.all([staffList(), trainingRecords()]);
    const certs = newest([...rec.academy, ...rec.outside]);
    return staff.map((o) => {
      const mine = certs.filter((c) => c.officer_id === o.id).sort((a, b) => (a.expires_on || '9999').localeCompare(b.expires_on || '9999'));
      const todo = rec.todo.filter((t) => t.officer_id === o.id);
      return {
        officer: o, certificates: mine, todo,
        expired: mine.filter((c) => c.days_left !== null && c.days_left < 0).length,
        expiring: mine.filter((c) => c.days_left !== null && c.days_left >= 0 && c.days_left <= 60).length,
        overdue: todo.filter((t) => t.overdue).length,
      };
    });
  }),

  // Certificates that have run out or run out within 60 days, from the Academy and from outside providers
  'academy.refreshersDue': def(MGR, async (b) => {
    const within = Math.min(Math.max(Number(b.days) || 60, 1), 365);
    const [staff, rec] = await Promise.all([staffList(), trainingRecords()]);
    const byId = new Map(staff.map((o) => [o.id, o]));
    return newest([...rec.academy, ...rec.outside])
      .filter((c) => byId.has(c.officer_id) && c.days_left !== null && c.days_left <= within)
      .map((c) => ({ ...c, officer: byId.get(c.officer_id) }))
      .sort((a, b) => a.days_left - b.days_left);
  }),

  // Nudge one person about a certificate that is running out
  'academy.remindRefresher': def(MGR, async (b, { user }) => {
    required(b, 'source', 'id');
    const c = b.source === 'academy'
      ? need(await one('SELECT c.officer_id, c.course_id, c.expires_at AS expires_on, co.title FROM certificates c JOIN courses co ON co.id = c.course_id WHERE c.id = $1', [b.id]), 'Certificate not found')
      : need(await one("SELECT owner_id AS officer_id, kind, title, expiry AS expires_on FROM documents WHERE id = $1 AND owner_type = 'officer'", [b.id]), 'Certificate not found');
    const ended = c.expires_on && c.expires_on < londonDate(new Date());
    const when = c.expires_on ? `${ended ? 'ran out' : 'runs out'} ${fmtDate(c.expires_on)}` : 'needs renewing';
    await notify(await officerUser(c.officer_id), {
      kind: 'training', severity: 'warning', title: `Refresher due: ${c.title}`,
      body: c.course_id ? `Your certificate ${when}. Open the course under Learn and pass the quiz again to renew it.` : `Your certificate ${when}. Book the refresher and upload the new certificate under Documents.`,
      link: c.course_id ? `/officer/learn/academy/${c.course_id}` : '/officer/documents', email: true,
    });
    await audit(user, 'training.remind', 'officer', c.officer_id, { title: c.title, source: b.source });
    return { ok: true };
  }),

  // Every open issue as one row, worst first, with the Orb card that carries the actions
  'compliance.overview': def(MGR, async () => {
    const [results, cards] = await Promise.all([
      computeIssues(),
      q("SELECT id, officer_id, reason FROM ops_items WHERE kind = 'compliance' AND status = 'pending'"),
    ]);
    const rows = [];
    for (const { officer: o, issues } of results) {
      const card = cards.find((c) => c.officer_id === o.id);
      const photo = await downloadUrl(o.photo_key);
      for (const i of issues) {
        rows.push({
          officer: { id: o.id, first_name: o.first_name, last_name: o.last_name, photo_url: photo, status: o.status },
          key: i.key, severity: i.severity, title: i.title, detail: i.detail, area: area(i.key),
          shift: i.shift ? { venue_name: i.shift.venue_name, starts_at: i.shift.starts_at } : null,
          card_id: card?.id || null, advice: card?.reason || '',
        });
      }
    }
    const at = (r) => (r.shift?.starts_at ? new Date(r.shift.starts_at).getTime() : Infinity);
    rows.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || at(a) - at(b));
    const { n: checked } = await one("SELECT count(*)::int AS n FROM officers WHERE status IN ('active','onboarding')");
    const last = await one("SELECT created_at FROM ops_activity WHERE kind = 'compliance' ORDER BY created_at DESC LIMIT 1");
    return { rows, checked, people: results.length, last_run: last?.created_at || null };
  }),

  // The weekly email, for checking what managers will receive
  'compliance.digestPreview': def(CO, async () => buildDigest()),

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

// Which part of compliance an issue belongs to (filters on the Compliance screen)
function area(key) {
  if (/^(training|refresher)/.test(key) || /:(first_aid|cctv|training)$/.test(key)) return 'training';
  if (/(sia|licence_role)/.test(key)) return 'licence';
  if (/rtw/.test(key)) return 'rtw';
  if (/^venue_pack/.test(key)) return 'venue_pack';
  return 'documents';
}

// ---------- Weekly digest email to company managers ----------
export async function buildDigest() {
  const [results, law] = await Promise.all([computeIssues(), lawAlerts(90).catch(() => [])]);
  const all = results.flatMap(({ officer: o, issues }) => issues.map((i) => ({ ...i, name: officerDisplay(o) })))
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const count = (s) => all.filter((i) => i.severity === s).length;
  const { name } = await getBrand();
  const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tone = { urgent: '#DC2626', soon: '#D97706', advisory: '#6B7280' };
  const title = all.length ? `Compliance this week: ${results.length === 1 ? '1 person needs' : `${results.length} people need`} attention` : 'Compliance this week: all clear';
  const body = all.length
    ? `<b style="color:${tone.urgent}">${count('urgent')} urgent</b> · <b style="color:${tone.soon}">${count('soon')} soon</b> · ${count('advisory')} to note</p>
<table style="width:100%;border-collapse:collapse;margin:8px 0 4px">${all.slice(0, 10).map((i) => `<tr><td style="padding:8px 0;border-top:1px solid #E5E7EB;vertical-align:top;width:10px"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${tone[i.severity]}"></span></td><td style="padding:8px 0 8px 8px;border-top:1px solid #E5E7EB;color:#0B1220;font-size:14px"><b>${esc(i.name)}</b><br><span style="color:#4B5563">${esc(i.title)}</span></td></tr>`).join('')}</table>
<p style="color:#4B5563;line-height:1.5">${all.length > 10 ? `And ${plural(all.length - 10, 'more item')}. ` : ''}Open Compliance to see everything and approve the actions.`
    : 'Nobody has an expired or missing licence, right to work, certificate or training this week.';
  const lawHtml = law.length ? `<p style="color:#0B1220;font-weight:600;margin:16px 0 4px">Law changes coming</p>${law.map((l) => `<p style="color:#4B5563;margin:4px 0;line-height:1.5"><a href="${esc(l.url)}" style="color:#0B1220">${esc(l.title)}</a>: from ${fmtDate(l.effective_date)}, touches ${plural(l.contracts, 'signed contract')}. Review the wording before then.</p>`).join('')}` : '';
  return { subject: `${name} — ${title}`, title, html: await emailHtml(title, body + lawHtml, '/company/people/compliance'), issues: all.length, law: law.length };
}

export async function sendDigest() {
  const d = await buildDigest();
  const users = await q("SELECT email FROM users WHERE id = ANY($1::uuid[]) AND status = 'active'", [await companyManagers()]);
  const res = await Promise.allSettled(users.map((u) => sendRawEmail(u.email, d.subject, d.html)));
  const sent = res.filter((r) => r.status === 'fulfilled' && r.value !== false).length;
  if (sent) await logActivity('compliance', `Weekly compliance email sent to ${plural(sent, 'manager')}`);
  return { sent, issues: d.issues };
}
