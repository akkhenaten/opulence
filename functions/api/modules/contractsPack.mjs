// Contract packs: the clause library and its approvals, legal reviews, law items, and drafts built in the workspace.
// A draft is answers + clause choices; compose() turns it into the agreement, the particulars and the findings.
import { PDFDocument } from 'pdf-lib';
import { one, q, tx, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { notify, officerUser } from '../lib/notify.mjs';
import { parse } from '../lib/docmarkup.mjs';
import { renderSigned } from '../lib/signdoc.mjs';
import { Doc, MUTED } from '../lib/pdf.mjs';
import { nameSafe } from '../lib/archive.mjs';
import { compose, slotsFor, varsIn, longDate, formatValue, JURISDICTIONS, STATES } from '../lib/compose.mjs';
import { PACKS, PACK_LIST, loadLibrary, loadLaw } from '../lib/contractContent.mjs';
import { nextReference, event, companySigner, signerColumns, uaOf } from '../lib/esign.mjs';
import { issueLink } from '../lib/signLinks.mjs';
import { getSettings } from './settings.mjs';
import { claude, SONNET } from '../lib/ai.mjs';
import { CO, def } from './_def.mjs';

const J = Object.keys(JURISDICTIONS);
const oneLine = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean).join(', ');
const packOf = (id) => PACKS[id] || fail(400, 'Unknown contract pack');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The company's own postcode suggests the law that usually applies: BT is Northern Ireland, these areas are Scotland
const SCOTTISH = /^(AB|DD|DG|EH|FK|G|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE)\d/;
export function jurisdictionOf(address) {
  const m = String(address || '').toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b(?![\s\S]*\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b)/);
  if (!m) return 'ew';
  if (m[1].startsWith('BT')) return 'ni';
  return SCOTTISH.test(m[1]) ? 'sc' : 'ew';
}

// ---- Prefill: values the app already knows, offered to the manager to confirm (never printed until confirmed)

function known(s, o, org) {
  return {
    'company.name': s.company_name, 'company.address': oneLine(s.company_address), 'company.number': s.company_number,
    ...(o ? {
      'officer.name': `${o.first_name} ${o.last_name}`.trim(), 'officer.address': [oneLine(o.address), o.postcode].filter(Boolean).join(', '),
      'officer.role': (o.roles || [])[0] || '', 'officer.sia_type': o.sia_type || '', 'officer.start_date': o.start_date || '', 'officer.email': o.email || '',
    } : {}),
    ...(org ? {
      'organisation.name': org.name, 'organisation.address': oneLine(org.address), 'organisation.number': org.company_number,
      'organisation.signatory': org.signatory_name, 'organisation.signatory_title': org.signatory_title,
    } : {}),
  };
}

function prefill(pack, values) {
  const out = {};
  for (const qn of pack.questions || []) {
    const v = qn.prefill && values[qn.prefill];
    if (v != null && v !== '') out[qn.id] = { value: String(v).slice(0, 2000), confirmed: false, source: qn.prefill };
  }
  return out;
}

/** A typed answer, checked against its question. null clears it. */
function cleanValue(qn, v) {
  if (v == null || v === '') return null;
  switch (qn.type) {
    case 'money': case 'number': {
      const n = Number(String(v).replace(/[£,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) fail(400, `"${qn.label}" must be a number`);
      return n;
    }
    case 'date':
      if (!DATE.test(String(v))) fail(400, `"${qn.label}" must be a date`);
      return String(v);
    case 'yesno':
      if (!['yes', 'no'].includes(v)) fail(400, `Answer yes or no for "${qn.label}"`);
      return v;
    case 'choice':
      if (!(qn.options || []).some((o) => o.value === v)) fail(400, `Pick one of the options for "${qn.label}"`);
      return v;
    default:
      return String(v).trim().slice(0, qn.type === 'textarea' ? 4000 : 500);
  }
}

// Every {{var}} in new wording must be something the pack asks; anything else would print a placeholder forever
function checkVars(pack, body) {
  const ids = new Set((pack ? [pack] : PACK_LIST).flatMap((p) => (p.questions || []).map((qn) => qn.id)));
  const bad = varsIn(body).filter((k) => !ids.has(k));
  if (bad.length) fail(400, `The wording uses {{${bad[0]}}}, which the questions do not ask. Use one of the pack's values or type the words.`, { unknown: bad });
}

// ---- Drafts

async function loadDraft(id) {
  return need(await one('SELECT * FROM contract_drafts WHERE id = $1', [id]), 'Draft not found');
}

async function partyOf(d) {
  if (d.officer_id) {
    const o = await one('SELECT id, first_name, last_name, email, user_id, status, engagement_type FROM officers WHERE id = $1', [d.officer_id]);
    return o && { kind: 'officer', id: o.id, name: `${o.first_name} ${o.last_name}`.trim(), email: o.email, has_login: !!o.user_id, engagement_type: o.engagement_type };
  }
  const g = await one('SELECT * FROM organisations WHERE id = $1', [d.organisation_id]);
  return g && { kind: 'organisation', id: g.id, name: g.name, email: g.signatory_email, signatory: g.signatory_name, org_kind: g.kind };
}

async function build(d, ctx = {}) {
  const pack = packOf(d.pack_id);
  const [library, law, before] = await Promise.all([
    ctx.library || loadLibrary(), ctx.law || loadLaw(),
    d.amends_contract_id && one('SELECT title, reference, signed_at, manifest, particulars FROM contracts WHERE id = $1', [d.amends_contract_id]),
  ]);
  const r = compose({
    pack, jurisdiction: d.jurisdiction, answers: d.answers, assessment: d.assessment, selections: d.selections, bespoke: d.bespoke,
    acks: d.acks, library, law, effectiveDate: d.effective_date,
    amend: before ? { kind: d.amend_kind, before: { ...before, manifest: before.manifest || [], particulars: before.particulars || [] } } : null,
  });
  return { pack, library, law, r };
}

// The wording a slot can use: the pack's alternatives plus company clauses written for that slot
function slotChoices(pack, j, library) {
  const out = {};
  for (const section of pack.clauses || []) {
    for (const slot of slotsFor(pack, section, j)) {
      const ids = [...slot.clauses, ...Object.keys(library).filter((id) => library[id].group === slot.slot && !slot.clauses.includes(id))];
      out[slot.slot] = {
        section: section.id, optional: !!slot.optional, why: slot.why || null,
        clauses: ids.map((id) => {
          const v = library[id]?.versions?.[j] || library[id]?.versions?.all;
          return { id, title: library[id]?.title || id, state: v?.state || null, version: v?.version ?? null, body: v?.body || '', sources: v?.sources || [] };
        }),
      };
    }
  }
  return out;
}

async function view(d, ctx) {
  const { pack, library, r } = await build(d, ctx);
  const [party, amends] = await Promise.all([partyOf(d),
    d.amends_contract_id && one('SELECT id, title, reference, signed_at, status FROM contracts WHERE id = $1', [d.amends_contract_id])]);
  const { rules, ...packView } = pack;
  return {
    draft: d, party, amends: amends || null, pack: d.amend_kind === 'variation' ? { ...packView, doc_title: 'Contract variation' } : packView, jurisdictions: JURISDICTIONS, states: STATES,
    result: { ...r, blocks: parse(r.body) }, slots: slotChoices(pack, d.jurisdiction, library),
  };
}

const docFor = (d, pack, party, body, reference = 'DRAFT') => ({
  kind: 'contract', typeLabel: d.amend_kind === 'variation' ? 'Contract variation' : pack.doc_title || 'Contract', title: d.title, reference, issuedAt: new Date(), version: null,
  officerName: party?.name || 'Party', blocks: parse(body),
});

/** Apply a patch from the workspace. Every field is optional. */
function applyPatch(d, pack, b, user) {
  const qById = Object.fromEntries((pack.questions || []).map((qn) => [qn.id, qn]));
  const answers = { ...d.answers };
  for (const [k, a] of Object.entries(b.answers || {})) {
    const qn = qById[k] || fail(400, `Unknown question ${k}`);
    if (a === null) { delete answers[k]; continue; }
    const cur = answers[k] || {};
    const value = 'value' in a ? cleanValue(qn, a.value) : cur.value;
    if (value == null) { delete answers[k]; continue; }
    // A typed value is the manager's own; a prefill stays unconfirmed until they say so
    const changed = 'value' in a && value !== cur.value;
    answers[k] = { value, confirmed: a.confirmed ?? (changed ? true : !!cur.confirmed), source: changed ? 'manager' : cur.source || 'manager', at: new Date().toISOString() };
  }
  const slotIds = new Set((pack.clauses || []).flatMap((s) => J.flatMap((j) => slotsFor(pack, s, j).map((x) => x.slot))));
  const selections = { ...d.selections };
  for (const [slot, s] of Object.entries(b.selections || {})) {
    if (!slotIds.has(slot)) fail(400, `Unknown clause slot ${slot}`);
    if (s === null) delete selections[slot];
    else selections[slot] = { ...(s.clause ? { clause: String(s.clause).slice(0, 80) } : {}), ...('on' in s ? { on: !!s.on } : {}) };
  }
  const bespoke = { ...d.bespoke };
  for (const [id, x] of Object.entries(b.bespoke || {})) {
    if (x === null || !String(x.body || '').trim()) { delete bespoke[id]; continue; }
    const body = String(x.body).slice(0, 20000);
    checkVars(pack, body);
    bespoke[id] = { body, by_name: user.name, at: new Date().toISOString(), ...(bespoke[id]?.body === body ? { approved_at: bespoke[id].approved_at, approved_by_name: bespoke[id].approved_by_name } : {}) };
  }
  const acks = { ...d.acks };
  for (const [id, a] of Object.entries(b.acks || {})) {
    if (a === null) delete acks[id];
    else acks[id] = { by: user.name, at: new Date().toISOString(), note: String(a.note || '').slice(0, 500) };
  }
  let assessment = d.assessment;
  if (b.assessment) {
    const qa = Object.fromEntries((pack.assessment?.questions || []).map((x) => [x.id, x]));
    const ans = { ...(assessment.answers || {}) };
    for (const [k, v] of Object.entries(b.assessment.answers || {})) {
      if (!qa[k]) fail(400, `Unknown assessment question ${k}`);
      if (v == null || v === '') delete ans[k];
      else if (!(qa[k].options || []).some((o) => o.value === v)) fail(400, `Pick one of the options for "${qa[k].label}"`);
      else ans[k] = v;
    }
    assessment = { ...assessment, answers: ans };
    for (const k of ['employment', 'tax']) if (k in b.assessment) assessment[k] = b.assessment[k] ? String(b.assessment[k]).slice(0, 40) : null;
    if ('reason' in b.assessment) assessment.reason = String(b.assessment.reason || '').slice(0, 2000);
    assessment.assessed_by = user.name;
    assessment.assessed_at = new Date().toISOString();
  }
  const patch = { answers, selections, bespoke, acks, assessment };
  if (b.title != null) patch.title = String(b.title).trim().slice(0, 200) || d.title;
  if (b.effective_date !== undefined) patch.effective_date = b.effective_date && DATE.test(b.effective_date) ? b.effective_date : null;
  return patch;
}

async function saveDraft(id, patch) {
  const cols = Object.keys(patch);
  const vals = cols.map((c) => (typeof patch[c] === 'object' && patch[c] !== null ? JSON.stringify(patch[c]) : patch[c]));
  return one(`UPDATE contract_drafts SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 AND status = 'draft' RETURNING *`, [id, ...vals]);
}

// Approve versions still in Research-based draft. Returns how many changed.
async function approveVersions(items, user, t = null) {
  const run = t ? t.q.bind(t) : q;
  let n = 0;
  for (const it of items) {
    const r = await run(`UPDATE clause_versions SET state = 'company', approved_by = $4, approved_by_name = $5, approved_at = now()
      WHERE clause_id = $1 AND jurisdiction = $2 AND version = $3 AND state = 'draft' RETURNING clause_id`, [it.clause_id, it.jurisdiction, it.version, user.id, user.name]);
    n += r.length;
  }
  return n;
}

// The current versions a pack uses in one jurisdiction (every alternative and conditional clause)
function packVersions(pack, j, library) {
  const ids = new Set();
  for (const s of pack.clauses || []) for (const slot of slotsFor(pack, s, j)) slot.clauses.forEach((id) => ids.add(id));
  return [...ids].map((id) => {
    const jj = library[id]?.versions?.[j] ? j : 'all';
    const v = library[id]?.versions?.[jj];
    return v && { clause_id: id, jurisdiction: jj, version: v.version, state: v.state };
  }).filter(Boolean);
}

/** The officer's profile records the engagement in the latest signed contract (record only: pay and tax are unchanged). */
export async function recordEngagement(c) {
  if (!c.officer_id || !c.engagement_type) return;
  await q(`UPDATE officers SET engagement_type = $2, engagement_contract_id = $1, contract_start = COALESCE($3, contract_start), contract_end = $4,
      fixed_term_renewals = fixed_term_renewals + $5 WHERE id = $6`,
  [c.id, c.engagement_type, c.start_date, c.end_date, c.amend_kind === 'extension' ? 1 : 0, c.officer_id]);
  if (c.amends_id && c.amend_kind !== 'variation') {
    // The contract replaced, and every contract it only varied: a variation leaves the agreement before it in force
    const gone = await q(`WITH RECURSIVE chain AS (
        SELECT id, amends_id, amend_kind FROM contracts WHERE id = $1
        UNION SELECT p.id, p.amends_id, p.amend_kind FROM contracts p JOIN chain ON p.id = chain.amends_id AND chain.amend_kind = 'variation')
      UPDATE contracts SET status = 'superseded' WHERE id IN (SELECT id FROM chain) AND status IN ('signed','signed_paper') RETURNING id`, [c.amends_id]);
    for (const g of gone) await event('contract', g.id, 'superseded', {});
  }
}

// ---- Contract file: the agreement plus the report of what went into it

async function contractFile(d, pack, party, r, s, agreementBytes) {
  const doc = await Doc.create(`${d.title} - contract file`, { unicode: true });
  await doc.header(s, 'Contract file', `${pack.title} · ${JURISDICTIONS[d.jurisdiction]}`);
  doc.meta([['Party', party?.name], ['Pack', pack.title]], [['Effective date', d.effective_date ? longDate(d.effective_date) : 'Not set'], ['Status', r.ready ? 'Ready to send' : 'Not ready']]);
  doc.text(r.legal ? 'Every clause is recorded as legally reviewed.' : 'Draft pending legal review. Wording not recorded as legally reviewed is a research-based draft or approved by the company only.', { size: 8.5, color: MUTED });

  doc.section('Key particulars');
  doc.table([{ label: 'Item', width: 0.45 }, { label: 'Value', width: 0.55 }], r.particulars.map((p) => [p.label, p.value ?? 'To be confirmed']));
  doc.section('Clauses used');
  doc.table([{ label: 'Clause', width: 0.42 }, { label: 'Version', width: 0.14 }, { label: 'Status', width: 0.24 }, { label: 'Wording', width: 0.2 }],
    r.manifest.map((m) => [m.title, m.version ? `${m.jurisdiction} v${m.version}` : 'Bespoke', STATES[m.state], m.origin]));
  doc.section('Outstanding information');
  if (r.outstanding.length) doc.table([{ label: 'Item', width: 0.7 }, { label: 'Prefilled', width: 0.3 }], r.outstanding.map((o) => [o.label, o.prefilled ? 'Waiting to confirm' : '']));
  else doc.text('Nothing outstanding.', { size: 9.5 });
  doc.section('Review findings');
  if (!r.findings.length) doc.text('No findings.', { size: 9.5 });
  for (const f of r.findings) {
    doc.text(`${{ blocker: 'Blocker', review: 'Needs review', note: 'Note' }[f.severity]}${f.ack ? ` (acknowledged by ${f.ack.by})` : ''}: ${f.message}`, { size: 9.5 });
    if (f.ack?.note) doc.text(`Note: ${f.ack.note}`, { size: 8.5, color: MUTED });
  }
  doc.section('Change comparison');
  const ch = d.changes || null;
  if (!ch || (!ch.values?.length && !ch.clauses?.length)) doc.text(d.amends_contract_id ? 'No changes from the signed contract.' : 'This is a new agreement, so there is nothing to compare.', { size: 9.5 });
  else {
    for (const v of ch.values || []) doc.text(`${v.label}: ${v.was ?? 'not set'} → ${v.now ?? 'removed'}`, { size: 9.5 });
    for (const c of ch.clauses || []) doc.text(`${(c.now || c.was).title}: ${c.change}`, { size: 9.5 });
  }
  doc.section('Supporting documents');
  doc.table([{ label: 'Document', width: 0.7 }, { label: 'Contractual', width: 0.3 }], r.supporting.map((x) => [x.title, x.contractual ? 'Yes, forms part' : 'No']));
  await doc.credit();

  const out = await PDFDocument.load(agreementBytes);
  const rep = await PDFDocument.load(await doc.pdf.save());
  (await out.copyPages(rep, rep.getPageIndices())).forEach((p) => out.addPage(p));
  return out.save();
}

// ---- Sending: freeze the composed agreement into a contract the party signs

/** Before anything is created: an officer without a login needs the manager's go-ahead for a link, and a link needs an email */
export function checkReachable(party, b = {}) {
  if (party.kind === 'officer' && party.has_login) return;
  if (party.kind === 'officer' && !b.link) fail(400, `${party.name} has no login yet. Invite them, or send a signing link by email.`, { needs_link: true });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(party.email || '').trim())) {
    fail(400, party.kind === 'organisation' ? `Add the email address of the person who signs for ${party.name} first.` : `${party.name} has no email address on their profile, so a signing link cannot be sent.`, { needs_email: true });
  }
}

export async function deliver(c, party, user, b = {}) {
  if (party.kind === 'officer') {
    const uid = await officerUser(party.id);
    if (uid.length) {
      await notify(uid, { kind: 'contract', title: 'Contract ready to sign', body: `${c.title} · Ref ${c.reference}`, link: `/officer/contracts/${c.id}`, email: true });
      await event('contract', c.id, 'emailed', {});
      return { via: 'app' };
    }
    if (!b.link) return { via: 'none' };
  }
  // A business, or an officer with no login: a one-time link by email
  const l = await issueLink(c, { user });
  await event('contract', c.id, 'link', { user, name: l.email });
  await audit(user, 'link.issue', 'contract', c.id, { reference: c.reference, email: l.email, emailed: l.emailed });
  return {
    via: 'link', email: l.email, emailed: l.emailed,
    ...(l.emailed ? {} : { warning: l.error || 'The contract is ready, but the email could not be sent. Check the address, then use Resend link.' }),
  };
}


// ---- Contracts AI: suggests changes as proposals; nothing changes until the manager applies one

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const digits = (t) => (String(t).match(/\d+(?:[.,]\d+)*/g) || []).map((x) => Number(x.replace(/,/g, '')));

/** A typed value the AI proposes must be one the manager actually wrote: it may not invent pay, hours, dates or names */
export function statedBy(qn, value, said) {
  const text = said.toLowerCase();
  if (['choice', 'yesno'].includes(qn.type)) return true;
  if (qn.type === 'money' || qn.type === 'number') return digits(said).some((n) => Math.abs(n - Number(value)) < 0.005);
  if (qn.type === 'date') {
    const [y, m, d] = String(value).split('-').map(Number);
    if (text.includes(String(value))) return true;
    const dm = new RegExp(`\\b0?${d}(st|nd|rd|th)?\\s+(of\\s+)?(${MONTHS[m - 1]}|${MONTHS[m - 1].slice(0, 3)})\\b`).test(text)
      || new RegExp(`\\b(${MONTHS[m - 1]}|${MONTHS[m - 1].slice(0, 3)})\\s+0?${d}(st|nd|rd|th)?\\b`).test(text);
    const numeric = new RegExp(`\\b0?${d}[/.-]0?${m}[/.-](${y}|${String(y).slice(2)})\\b`).test(text);
    return numeric || (dm && (!/\b20\d\d\b/.test(text) || text.includes(String(y))));
  }
  const v = String(value).toLowerCase().replace(/\s+/g, ' ').trim();
  return v.length > 0 && text.replace(/\s+/g, ' ').includes(v);
}

const AI_TOOLS = [
  {
    name: 'propose_answer', description: 'Propose an answer to one of the Guide questions. Only a value the manager has written in this conversation, or one of the question\'s options.',
    input_schema: { type: 'object', properties: { question: { type: 'string', description: 'Question id' }, value: { type: 'string' }, why: { type: 'string' } }, required: ['question', 'value', 'why'] },
  },
  {
    name: 'propose_alternative', description: 'Propose switching a clause slot to another wording from its alternatives.',
    input_schema: { type: 'object', properties: { slot: { type: 'string' }, clause: { type: 'string', description: 'Clause id from the slot\'s alternatives' }, why: { type: 'string' } }, required: ['slot', 'clause', 'why'] },
  },
  {
    name: 'propose_toggle', description: 'Propose switching an optional clause on or off.',
    input_schema: { type: 'object', properties: { slot: { type: 'string' }, on: { type: 'boolean' }, why: { type: 'string' } }, required: ['slot', 'on', 'why'] },
  },
  {
    name: 'propose_wording', description: 'Propose new wording for a clause used in this document only. Plain English, the document\'s markup (## sub-heading, - bullet, **bold**), and {{question.id}} for any value the questions ask. Never type a value the questions provide.',
    input_schema: { type: 'object', properties: { clause: { type: 'string', description: 'Clause id currently in the document' }, body: { type: 'string' }, why: { type: 'string' } }, required: ['clause', 'body', 'why'] },
  },
  {
    name: 'point_to_question', description: 'Point the manager at a Guide question they need to answer themselves.',
    input_schema: { type: 'object', properties: { question: { type: 'string' }, text: { type: 'string' } }, required: ['question', 'text'] },
  },
];

function aiSystem(v, d) {
  const { pack, party, result, slots } = v;
  const visible = new Set(result.visible || []);
  const qs = (pack.questions || []).filter((qn) => visible.has(qn.id) && qn.type !== 'note').map((qn) => {
    const a = d.answers[qn.id];
    const now = a?.confirmed ? JSON.stringify(a.value) : a ? `unconfirmed prefill ${JSON.stringify(a.value)}` : 'not answered';
    return `- ${qn.id} (${qn.type}${qn.options ? `: ${qn.options.map((o) => o.value).join('|')}` : ''}) "${qn.label}" = ${now}`;
  });
  const bySlot = Object.fromEntries(result.manifest.map((m) => [m.slot, m]));
  const sl = Object.entries(slots).map(([id, x]) => {
    const m = bySlot[id];
    return `- slot ${id}${x.optional ? ' (optional)' : ''}: ${m ? `uses ${m.clause} "${m.title}" [${m.origin}, ${m.state}]` : 'not included'}${x.clauses.length > 1 ? `; alternatives: ${x.clauses.map((c) => `${c.id} "${c.title}"`).join(', ')}` : ''}`;
  });
  const findings = result.findings.map((f) => `- [${f.severity}] ${f.message}`);
  const rules = `You are Contracts AI inside a UK security company's contract workspace. The manager is drafting "${d.title}" (${pack.title}) with ${party?.name || 'the other party'}, under the law of ${JURISDICTIONS[d.jurisdiction]}.

How you help:
- Explain clauses, findings and the choices available in plain, short English. You are not a lawyer and this is not legal advice; say so when a question needs one.
- Make changes only by calling the propose_* tools. The manager sees each proposal as a card and decides. Never say a change has been made.
- Never invent a value. Pay, hours, dates, names, addresses and notice periods come from the manager. If they have not said it, use point_to_question.
- Prefer an alternative from the library over new wording. Propose new wording only when no alternative fits; it is flagged for review.
- Never claim wording is legally reviewed or compliant. Everything here is a draft pending legal review unless its state is "legal".
- Always answer in words as well as any proposals. Plain text only: no markdown headings or bold; short dash lists are fine.
- Keep the reply under 120 words unless the manager asks for detail.`;
  const ctx = `Questions (id, type, label = current answer):\n${qs.join('\n')}\n\nClauses by slot:\n${sl.join('\n')}\n\nCurrent findings:\n${findings.join('\n') || '- none'}`;
  return [{ type: 'text', text: rules }, { type: 'text', text: ctx }];
}

/** Turn the model's tool calls into proposals the manager can apply, dropping any that break the rules */
function toProposals(uses, v, d, pack, said) {
  const qById = Object.fromEntries((pack.questions || []).map((qn) => [qn.id, qn]));
  const visible = new Set(v.result.visible || []);
  const used = Object.fromEntries(v.result.manifest.map((m) => [m.clause, m]));
  const out = [];
  const rejected = [];
  for (const u of uses) {
    const x = u.input || {};
    const id = `p_${Math.random().toString(36).slice(2, 10)}`;
    try {
      if (u.name === 'propose_answer' || u.name === 'point_to_question') {
        const qn = qById[x.question];
        if (!qn || !visible.has(qn.id)) throw new Error('That question is not part of this document');
        if (u.name === 'point_to_question') { out.push({ id, kind: 'ask', question: qn.id, label: qn.label, why: String(x.text || '').slice(0, 400) }); continue; }
        const value = cleanValue(qn, x.value);
        if (value == null) throw new Error('Empty value');
        if (!statedBy(qn, value, said)) {
          rejected.push({ label: qn.label, reason: 'You have not given this value, so it was not filled in. Answer it in the Guide.' });
          out.push({ id, kind: 'ask', question: qn.id, label: qn.label, why: 'Only you can give this value.' });
          continue;
        }
        const was = d.answers[qn.id];
        out.push({ id, kind: 'answer', label: qn.label, was: was?.confirmed ? formatValue(qn, was.value) : null, now: formatValue(qn, value), why: String(x.why || '').slice(0, 400), jump: { question: qn.id }, patch: { answers: { [qn.id]: { value, confirmed: true } } } });
      } else if (u.name === 'propose_alternative') {
        const slot = v.slots[x.slot];
        const c = slot?.clauses.find((k) => k.id === x.clause);
        if (!c) throw new Error('That wording is not an alternative for this clause');
        const cur = v.result.manifest.find((m) => m.slot === x.slot);
        if (cur?.clause === c.id) continue;
        out.push({ id, kind: 'alternative', label: c.title, was: cur?.title || null, now: c.title, state: c.state, why: String(x.why || '').slice(0, 400), jump: { slot: x.slot }, patch: { selections: { [x.slot]: { clause: c.id } } } });
      } else if (u.name === 'propose_toggle') {
        const slot = v.slots[x.slot];
        if (!slot?.optional) throw new Error('That clause cannot be switched off');
        const on = !!x.on;
        if (on === v.result.manifest.some((m) => m.slot === x.slot)) continue;
        out.push({ id, kind: 'toggle', label: slot.clauses[0]?.title || x.slot, now: on, why: String(x.why || '').slice(0, 400), jump: { slot: x.slot }, patch: { selections: { [x.slot]: { on } } } });
      } else if (u.name === 'propose_wording') {
        const m = used[x.clause];
        if (!m) throw new Error('That clause is not in this document');
        const body = String(x.body || '').trim().slice(0, 8000);
        if (!body) throw new Error('Empty wording');
        checkVars(pack, body);
        const was = d.bespoke?.[m.clause]?.body || v.slots[m.slot]?.clauses.find((k) => k.id === m.clause)?.body || '';
        out.push({ id, kind: 'wording', label: m.title, was, now: body, why: String(x.why || '').slice(0, 400), jump: { slot: m.slot }, patch: { bespoke: { [m.clause]: { body } } } });
      }
    } catch (e) {
      rejected.push({ label: x.question || x.slot || x.clause || u.name, reason: e.message });
    }
  }
  return { proposals: out.slice(0, 8), rejected };
}

const CHAT_KEEP = 40;
const setChat = (id, chat) => one('UPDATE contract_drafts SET chat = $2 WHERE id = $1 RETURNING chat', [id, JSON.stringify(chat.slice(-CHAT_KEEP))]);

export const actions = {
  'contracts.packs': def(CO, async () => {
    const [library, s] = await Promise.all([loadLibrary(), getSettings()]);
    const packs = PACK_LIST.map((p) => ({
      id: p.id, title: p.title, summary: p.summary, party: p.party, engagement_type: p.engagement_type, doc_title: p.doc_title, decision: p.decision || null,
      jurisdictions: Object.fromEntries((p.jurisdictions || J).map((j) => {
        const vs = packVersions(p, j, library);
        return [j, { draft: vs.filter((v) => v.state === 'draft').length, company: vs.filter((v) => v.state === 'company').length, legal: vs.filter((v) => v.state === 'legal').length }];
      })),
    }));
    return { packs, jurisdiction: jurisdictionOf(s.company_address), jurisdictions: JURISDICTIONS, states: STATES };
  }),

  'contracts.library': def(CO, async () => {
    const [clauses, versions, current] = await Promise.all([
      q('SELECT id, subject, title, group_id FROM clauses ORDER BY id'),
      q(`SELECT clause_id, jurisdiction, version, body, origin, bespoke, state, sources, checked_on, approved_by_name, approved_at, legal_review_id, created_at
           FROM clause_versions ORDER BY clause_id, jurisdiction, version DESC`),
      q('SELECT clause_id, jurisdiction, version FROM clause_current'),
    ]);
    const cur = Object.fromEntries(current.map((r) => [`${r.clause_id}|${r.jurisdiction}`, r.version]));
    const usedBy = {};
    for (const p of PACK_LIST) for (const s of p.clauses || []) for (const j of J) for (const slot of slotsFor(p, s, j)) slot.clauses.forEach((id) => (usedBy[id] ||= new Set()).add(p.id));
    const byClause = {};
    for (const v of versions) (byClause[v.clause_id] ||= []).push(v);
    return clauses.map((c) => {
      const vs = byClause[c.id] || [];
      const juris = [...new Set(vs.map((v) => v.jurisdiction))];
      return {
        ...c, packs: [...(usedBy[c.id] || [])],
        jurisdictions: Object.fromEntries(juris.map((j) => {
          const all = vs.filter((v) => v.jurisdiction === j);
          const current = all.find((v) => v.version === cur[`${c.id}|${j}`]) || all[0];
          const latestSeed = all.find((v) => v.origin === 'seed');
          return [j, { current, update: latestSeed && latestSeed.version > current.version ? latestSeed : null, versions: all }];
        })),
      };
    });
  }),

  // Company wording: a new version of a clause, or a new alternative for a slot
  'contracts.clause.save': def(CO, async (b, { user }) => {
    required(b, 'body');
    const body = String(b.body).slice(0, 20000);
    const j = ['all', ...J].includes(b.jurisdiction) ? b.jurisdiction : 'all';
    checkVars(b.pack_id ? packOf(b.pack_id) : null, body);
    const sources = Array.isArray(b.sources) ? b.sources.filter((x) => /^https:\/\//.test(x?.url)).slice(0, 10).map((x) => ({ title: String(x.title || x.url).slice(0, 200), url: String(x.url).slice(0, 500) })) : [];
    const row = await tx(async (t) => {
      let id = b.clause_id;
      if (!id) {
        required(b, 'title', 'group');
        const base = `CO.${String(b.group).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
        const { n } = await t.one("SELECT count(*)::int + 1 AS n FROM clauses WHERE id LIKE $1 || '.%'", [base]);
        id = `${base}.${n}`;
        await t.q('INSERT INTO clauses (id, subject, title, group_id) VALUES ($1, $2, $3, $4)', [id, 'company', String(b.title).slice(0, 200), String(b.group).slice(0, 80)]);
      } else need(await t.one('SELECT 1 FROM clauses WHERE id = $1', [id]), 'Clause not found');
      const { n } = await t.one('SELECT COALESCE(MAX(version), 0) + 1 AS n FROM clause_versions WHERE clause_id = $1 AND jurisdiction = $2', [id, j]);
      const v = await t.one(`INSERT INTO clause_versions (clause_id, jurisdiction, version, body, origin, state, sources, checked_on, created_by)
        VALUES ($1, $2, $3, $4, $5, 'draft', $6, CURRENT_DATE, $7) RETURNING *`, [id, j, n, body, b.origin === 'ai' ? 'ai' : 'company', JSON.stringify(sources), user.id]);
      await t.q(`INSERT INTO clause_current (clause_id, jurisdiction, version) VALUES ($1, $2, $3)
        ON CONFLICT (clause_id, jurisdiction) DO UPDATE SET version = EXCLUDED.version`, [id, j, n]);
      return v;
    });
    await audit(user, 'clause.save', 'clause', row.clause_id, { jurisdiction: j, version: row.version, summary: `New wording for ${row.clause_id}` });
    return row;
  }),

  'contracts.clause.adopt': def(CO, async (b, { user }) => {
    required(b, 'clause_id', 'jurisdiction', 'version');
    need(await one('SELECT 1 FROM clause_versions WHERE clause_id = $1 AND jurisdiction = $2 AND version = $3', [b.clause_id, b.jurisdiction, b.version]), 'Version not found');
    await q('UPDATE clause_current SET version = $3 WHERE clause_id = $1 AND jurisdiction = $2', [b.clause_id, b.jurisdiction, b.version]);
    await audit(user, 'clause.adopt', 'clause', b.clause_id, { jurisdiction: b.jurisdiction, version: b.version });
    return { ok: true };
  }),

  // Approve wording for use by the company: listed versions, or every draft clause a pack uses in one jurisdiction
  'contracts.clause.approve': def(CO, async (b, { user }) => {
    let items = Array.isArray(b.items) ? b.items.slice(0, 500) : [];
    if (b.pack_id) {
      if (!J.includes(b.jurisdiction)) fail(400, 'Pick a jurisdiction');
      items = packVersions(packOf(b.pack_id), b.jurisdiction, await loadLibrary());
    }
    if (!items.length) fail(400, 'Nothing to approve');
    const n = await tx((t) => approveVersions(items, user, t));
    await audit(user, 'clause.approve', 'clause', b.pack_id || items[0].clause_id, { approved: n, pack: b.pack_id || null, jurisdiction: b.jurisdiction || null, summary: `${n} clause versions approved for company use` });
    return { approved: n };
  }),

  // A solicitor's review, recorded by the manager: only the exact versions in scope become Legally reviewed
  'contracts.legalReview.record': def(CO, async (b, { user }) => {
    required(b, 'reviewer_name', 'reviewed_on', 'jurisdiction');
    if (!DATE.test(b.reviewed_on)) fail(400, 'Enter the review date');
    if (![...J, 'all'].includes(b.jurisdiction)) fail(400, 'Pick a jurisdiction');
    const library = await loadLibrary();
    let items = Array.isArray(b.items) ? b.items : [];
    if (b.pack_ids?.length) {
      const js = b.jurisdiction === 'all' ? J : [b.jurisdiction];
      const seen = new Set();
      items = b.pack_ids.flatMap((p) => js.flatMap((j) => packVersions(packOf(p), j, library))).filter((v) => !seen.has(`${v.clause_id}|${v.jurisdiction}`) && seen.add(`${v.clause_id}|${v.jurisdiction}`));
    }
    if (!items.length) fail(400, 'Choose the packs or clauses the review covered');
    const letter = b.letter_document_id ? need(await one("SELECT id FROM documents WHERE id = $1 AND owner_type = 'company'", [b.letter_document_id]), 'Letter not found').id : null;
    const review = await tx(async (t) => {
      const r = await insert('legal_reviews', {
        reviewer_name: String(b.reviewer_name).slice(0, 200), firm: String(b.firm || '').slice(0, 200), reviewed_on: b.reviewed_on, jurisdiction: b.jurisdiction,
        scope_note: String(b.scope_note || '').slice(0, 2000), notes: String(b.notes || '').slice(0, 4000), letter_document_id: letter, recorded_by: user.id,
      }, t);
      for (const it of items) {
        const v = await t.one(`UPDATE clause_versions SET state = 'legal', legal_review_id = $4 WHERE clause_id = $1 AND jurisdiction = $2 AND version = $3 RETURNING clause_id`,
          [it.clause_id, it.jurisdiction, it.version, r.id]);
        if (v) await t.q('INSERT INTO legal_review_items (review_id, clause_id, jurisdiction, version) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [r.id, it.clause_id, it.jurisdiction, it.version]);
      }
      return r;
    });
    await audit(user, 'legal_review.record', 'legal_review', review.id, { reviewer: review.reviewer_name, firm: review.firm, items: items.length, summary: `Legal review by ${review.reviewer_name} recorded for ${items.length} clause versions` });
    return { ...review, items: items.length };
  }),

  'contracts.legalReviews': def(CO, async () => q(
    `SELECT r.*, u.name AS recorded_by_name, d.title AS letter_title, (SELECT count(*)::int FROM legal_review_items i WHERE i.review_id = r.id) AS items
       FROM legal_reviews r LEFT JOIN users u ON u.id = r.recorded_by LEFT JOIN documents d ON d.id = r.letter_document_id ORDER BY r.reviewed_on DESC, r.created_at DESC`)),

  'contracts.law': def(CO, async () => {
    const law = await loadLaw();
    const packs = Object.fromEntries(law.map((l) => [l.id, PACK_LIST.filter((p) => (p.law || []).includes(l.id)).map((p) => p.id)]));
    return law.map((l) => ({ ...l, packs: packs[l.id] }));
  }),

  'contracts.organisations': def(CO, async () => q('SELECT * FROM organisations ORDER BY name')),

  'contracts.saveOrganisation': def(CO, async (b, { user }) => {
    required(b, 'name');
    const kinds = ['labour_provider', 'subcontractor', 'agency', 'psc', 'other'];
    const email = String(b.signatory_email || '').trim().toLowerCase().slice(0, 200);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email for the signatory');
    const row = {
      kind: kinds.includes(b.kind) ? b.kind : 'other', name: String(b.name).trim().slice(0, 200), company_number: String(b.company_number || '').trim().slice(0, 40),
      address: String(b.address || '').slice(0, 500), signatory_name: String(b.signatory_name || '').trim().slice(0, 120),
      signatory_title: String(b.signatory_title || '').trim().slice(0, 120), signatory_email: email,
    };
    const o = b.id
      ? need(await one(`UPDATE organisations SET kind = $2, name = $3, company_number = $4, address = $5, signatory_name = $6, signatory_title = $7, signatory_email = $8
          WHERE id = $1 RETURNING *`, [b.id, ...Object.values(row)]), 'Organisation not found')
      : await insert('organisations', { ...row, created_by: user.id });
    await audit(user, b.id ? 'organisation.update' : 'organisation.create', 'organisation', o.id, { name: o.name, kind: o.kind });
    return o;
  }),

  // ---- Drafts

  'contracts.draft.create': def(CO, async (b, { user }) => {
    required(b, 'pack_id', 'jurisdiction');
    const pack = packOf(b.pack_id);
    if (!(pack.jurisdictions || J).includes(b.jurisdiction)) fail(400, 'This pack is not available for that jurisdiction');
    const s = await getSettings();
    let o = null;
    let org = null;
    if (pack.party === 'organisation') {
      if (!b.organisation_id) fail(400, 'Pick the business this agreement is with');
      org = need(await one('SELECT * FROM organisations WHERE id = $1', [b.organisation_id]), 'Organisation not found');
    } else {
      if (!b.officer_id) fail(400, 'Pick the person this contract is for');
      o = need(await one('SELECT * FROM officers WHERE id = $1', [b.officer_id]), 'Officer not found');
    }
    const party = o ? `${o.first_name} ${o.last_name}` : org.name;
    const d = await insert('contract_drafts', {
      pack_id: pack.id, pack_version: pack.version || 1, jurisdiction: b.jurisdiction, officer_id: o?.id || null, organisation_id: org?.id || null,
      title: String(b.title || `${pack.doc_title} - ${party}`).slice(0, 200), effective_date: DATE.test(b.effective_date || '') ? b.effective_date : null,
      answers: JSON.stringify(prefill(pack, known(s, o, org))), created_by: user.id,
    });
    await audit(user, 'draft.create', 'contract_draft', d.id, { pack: pack.id, jurisdiction: d.jurisdiction, party, summary: `Contract draft started for ${party}` });
    return view(d);
  }),

  'contracts.draft.get': def(CO, async (b) => view(await loadDraft(b.id))),

  // The profile's current engagement: type, dates and extensions from the latest signed contract (record only),
  // plus for agency workers the calendar weeks worked since the contract started
  'contracts.engagement': def(CO, async (b) => {
    required(b, 'officer_id');
    const o = need(await one('SELECT id, engagement_type, engagement_contract_id, contract_start, contract_end, fixed_term_renewals FROM officers WHERE id = $1', [b.officer_id]), 'Officer not found');
    const [c, open] = await Promise.all([
      o.engagement_contract_id && one('SELECT id, title, reference, status, source, pack_id, jurisdiction, signed_at, start_date, end_date FROM contracts WHERE id = $1', [o.engagement_contract_id]),
      q("SELECT id, title, amend_kind, amends_contract_id, updated_at FROM contract_drafts WHERE officer_id = $1 AND status = 'draft' AND amends_contract_id IS NOT NULL ORDER BY updated_at DESC", [o.id]),
    ]);
    let agency = null;
    if (o.engagement_type === 'agency_worker') {
      // A week counts when at least one shift that week was clocked in (UK weeks, Monday to Sunday)
      const r = await one(`SELECT count(DISTINCT date_trunc('week', s.starts_at AT TIME ZONE 'Europe/London'))::int AS weeks
                             FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
                            WHERE a.officer_id = $1 AND s.starts_at < now() AND ($2::date IS NULL OR s.starts_at >= $2::date)
                              AND EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status <> 'rejected')`,
      [o.id, o.contract_start]);
      agency = { weeks: r.weeks, qualifying_weeks: 12 };
    }
    return { ...o, contract: c || null, pack_title: c?.pack_id ? PACKS[c.pack_id]?.title || null : null, amendments: open, agency };
  }),

  // Change a signed contract: a variation lists only what changes; a replacement or extension is a whole new agreement
  // that supersedes the old one when signed. Built in the workspace from the signed contract's answers.
  'contracts.amend': def(CO, async (b, { user }) => {
    required(b, 'id', 'kind');
    const KIND = { variation: 'Variation', replacement: 'Replacement', extension: 'Extension' };
    if (!KIND[b.kind]) fail(400, 'Pick a variation, replacement or extension');
    const c = need(await one("SELECT * FROM contracts WHERE id = $1 AND status IN ('signed', 'signed_paper') AND category = 'contract'", [b.id]), 'Only a signed contract can be changed');
    const open = await one("SELECT * FROM contract_drafts WHERE amends_contract_id = $1 AND status = 'draft' ORDER BY created_at DESC LIMIT 1", [c.id]);
    if (open) return view(open);
    const src = c.source === 'pack' && c.draft_id && await one('SELECT * FROM contract_drafts WHERE id = $1', [c.draft_id]);
    if (!src) {
      // Uploaded, template or paper contracts have no answers to start from: a new contract replaces them
      if (b.kind !== 'replacement') fail(400, 'This contract was not built in the workspace, so it can only be replaced with a new one.', { needs_pack: true });
      required(b, 'pack_id', 'jurisdiction');
      const pack = packOf(b.pack_id);
      if (!(pack.jurisdictions || J).includes(b.jurisdiction)) fail(400, 'This pack is not available for that jurisdiction');
      const [s, o, org] = await Promise.all([getSettings(),
        c.officer_id && one('SELECT * FROM officers WHERE id = $1', [c.officer_id]), c.organisation_id && one('SELECT * FROM organisations WHERE id = $1', [c.organisation_id])]);
      if ((pack.party === 'organisation') !== !!org) fail(400, pack.party === 'organisation' ? 'This pack is for agreements with a business' : 'This pack is for agreements with a person');
      const d = await insert('contract_drafts', {
        pack_id: pack.id, pack_version: pack.version || 1, jurisdiction: b.jurisdiction, officer_id: c.officer_id, organisation_id: c.organisation_id,
        title: c.title, effective_date: DATE.test(b.effective_date || '') ? b.effective_date : null, answers: JSON.stringify(prefill(pack, known(s, o, org))),
        amends_contract_id: c.id, amend_kind: 'replacement', created_by: user.id,
      });
      await audit(user, 'contract.amend', 'contract', c.id, { kind: 'replacement', draft: d.id, reference: c.reference, summary: `Replacement started for ${c.reference}` });
      return view(d);
    }
    const pack = packOf(src.pack_id);
    if (b.kind === 'extension' && !(pack.questions || []).some((qn) => qn.id === 'term.end_date')) fail(400, 'Only a fixed-term contract can be extended');
    const answers = { ...src.answers };
    // An extension needs a new end date: the old one waits to be changed and confirmed
    if (b.kind === 'extension' && answers['term.end_date']) answers['term.end_date'] = { ...answers['term.end_date'], confirmed: false };
    const d = await insert('contract_drafts', {
      pack_id: src.pack_id, pack_version: src.pack_version, jurisdiction: src.jurisdiction, officer_id: c.officer_id, organisation_id: c.organisation_id,
      title: (() => { const base = c.title.replace(/^((Variation|Extension) - )+/, ''); return (b.kind === 'replacement' ? base : `${KIND[b.kind]} - ${base}`).slice(0, 200); })(),
      effective_date: DATE.test(b.effective_date || '') ? b.effective_date : null, answers: JSON.stringify(answers),
      selections: JSON.stringify(src.selections || {}), bespoke: JSON.stringify(src.bespoke || {}), assessment: JSON.stringify(src.assessment || {}),
      amends_contract_id: c.id, amend_kind: b.kind, created_by: user.id,
    });
    await audit(user, 'contract.amend', 'contract', c.id, { kind: b.kind, draft: d.id, reference: c.reference, summary: `${KIND[b.kind]} started for ${c.reference}` });
    return view(d);
  }),

  'contracts.draft.list': def(CO, async (b) => {
    const rows = await q(
      `SELECT d.id, d.pack_id, d.jurisdiction, d.title, d.status, d.effective_date, d.updated_at, d.created_at, d.contract_id, d.amend_kind, d.officer_id, d.organisation_id,
              COALESCE(o.first_name || ' ' || o.last_name, g.name) AS party_name, u.name AS created_by_name
         FROM contract_drafts d LEFT JOIN officers o ON o.id = d.officer_id LEFT JOIN organisations g ON g.id = d.organisation_id LEFT JOIN users u ON u.id = d.created_by
        WHERE ($1::text IS NULL OR d.status = $1) AND ($2::uuid IS NULL OR d.officer_id = $2) ORDER BY d.updated_at DESC LIMIT 300`,
      [b.status || 'draft', b.officer_id || null]);
    return rows.map((r) => ({ ...r, pack_title: PACKS[r.pack_id]?.title || r.pack_id }));
  }),

  'contracts.draft.save': def(CO, async (b, { user }) => {
    required(b, 'id');
    const d = await loadDraft(b.id);
    if (d.status !== 'draft') fail(400, 'This draft has been sent. Amend the contract instead.');
    const pack = packOf(d.pack_id);
    const patch = applyPatch(d, pack, b, user);
    if (b.proposal_id) patch.chat = (d.chat || []).map((m) => (m.proposals ? { ...m, proposals: m.proposals.map((p) => (p.id === b.proposal_id ? { ...p, status: 'applied' } : p)) } : m));
    const saved = need(await saveDraft(d.id, patch), 'Draft not found');
    if (b.proposal_id) await audit(user, 'ai.apply', 'contract_draft', d.id, { proposal: String(b.proposal_id).slice(0, 80), summary: 'Applied a Contracts AI suggestion' });
    return view(saved);
  }),

  'contracts.draft.duplicate': def(CO, async (b, { user }) => {
    const d = await loadDraft(b.id);
    const pack = packOf(d.pack_id);
    // The copy keeps the terms; values about the person or business are cleared and prefilled again for the new party
    let o = null;
    let org = null;
    if (b.officer_id) o = need(await one('SELECT * FROM officers WHERE id = $1', [b.officer_id]), 'Officer not found');
    if (b.organisation_id) org = need(await one('SELECT * FROM organisations WHERE id = $1', [b.organisation_id]), 'Organisation not found');
    if (!o && !org) { o = d.officer_id && await one('SELECT * FROM officers WHERE id = $1', [d.officer_id]); org = d.organisation_id && await one('SELECT * FROM organisations WHERE id = $1', [d.organisation_id]); }
    const personal = new Set((pack.questions || []).filter((qn) => /^(officer|organisation)\./.test(qn.prefill || '') || qn.personal).map((qn) => qn.id));
    const answers = Object.fromEntries(Object.entries(d.answers).filter(([k]) => !personal.has(k)));
    const s = await getSettings();
    Object.assign(answers, Object.fromEntries(Object.entries(prefill(pack, known(s, o, org))).filter(([k]) => personal.has(k) || !answers[k])));
    const party = o ? `${o.first_name} ${o.last_name}` : org.name;
    const copy = await insert('contract_drafts', {
      pack_id: d.pack_id, pack_version: d.pack_version, jurisdiction: d.jurisdiction, officer_id: o?.id || null, organisation_id: org?.id || null,
      title: `${pack.doc_title} - ${party}`, effective_date: d.effective_date, answers: JSON.stringify(answers), selections: JSON.stringify(d.selections),
      bespoke: JSON.stringify(d.bespoke), assessment: JSON.stringify(o?.id === d.officer_id && org?.id === d.organisation_id ? d.assessment : {}), created_by: user.id,
    });
    await audit(user, 'draft.create', 'contract_draft', copy.id, { from: d.id, party, summary: `Contract draft copied for ${party}` });
    return view(copy);
  }),

  'contracts.draft.delete': def(CO, async (b, { user }) => {
    const d = need(await one("DELETE FROM contract_drafts WHERE id = $1 AND status = 'draft' RETURNING id, title", [b.id]), 'Only unsent drafts can be deleted');
    await audit(user, 'draft.delete', 'contract_draft', d.id, { title: d.title });
    return { ok: true };
  }),

  // Live PDF: watermarked "Draft - pending legal review" until every clause is legally reviewed
  'contracts.draft.preview': def(CO, async (b, { user }) => {
    const d = await loadDraft(b.id);
    const { pack, r } = await build(d);
    const [s, signer, party] = await Promise.all([getSettings(), companySigner(b.signatory_id || null, user.id).catch(() => null), partyOf(d)]);
    const { bytes } = await renderSigned({
      company: s, doc: docFor(d, pack, party, r.body),
      signers: { company: signer ? { name: signer.name, title: signer.title, png: signer.png, at: new Date() } : null, officer: null },
      events: [], status: r.legal ? 'proof' : 'draft', verifyUrl: '',
    });
    return { pdf: Buffer.from(bytes).toString('base64'), findings: r.findings, manifest: r.manifest, particulars: r.particulars, outstanding: r.outstanding, ready: r.ready, legal: r.legal };
  }),

  // One click for the manager: every Research-based draft clause in this document becomes Company-approved, bespoke wording too
  'contracts.draft.approveAll': def(CO, async (b, { user }) => {
    const d = await loadDraft(b.id);
    if (d.status !== 'draft') fail(400, 'This draft has been sent');
    const { r } = await build(d);
    const items = r.manifest.filter((m) => m.state === 'draft' && m.origin !== 'bespoke').map((m) => ({ clause_id: m.clause, jurisdiction: m.jurisdiction, version: m.version }));
    const bespoke = { ...d.bespoke };
    let nb = 0;
    for (const m of r.manifest.filter((x) => x.origin === 'bespoke' && x.state === 'draft')) {
      bespoke[m.clause] = { ...bespoke[m.clause], approved_at: new Date().toISOString(), approved_by_name: user.name };
      nb++;
    }
    const n = await tx(async (t) => {
      const c = await approveVersions(items, user, t);
      if (nb) await t.q('UPDATE contract_drafts SET bespoke = $2, updated_at = now() WHERE id = $1', [d.id, JSON.stringify(bespoke)]);
      return c;
    });
    await audit(user, 'clause.approve', 'contract_draft', d.id, { approved: n, bespoke: nb, summary: `${n + nb} clauses approved for company use from a draft` });
    return view(await loadDraft(d.id));
  }),

  'contracts.draft.send': def(CO, async (b, { user, ip, event: ev }) => {
    const d = await loadDraft(b.id);
    if (d.status !== 'draft') fail(400, 'This draft has already been sent');
    const { pack, r } = await build(d);
    if (!r.ready) {
      const blockers = r.findings.filter((f) => f.severity === 'blocker');
      fail(400, blockers.length ? `Not ready to send: ${blockers[0].message}` : 'Acknowledge each item that needs review before sending.', { findings: r.findings });
    }
    const party = need(await partyOf(d), 'The person or business on this draft no longer exists');
    const signer = await companySigner(b.signatory_id || null, user.id);
    checkReachable(party, b);
    const val = (k) => d.answers[k]?.confirmed ? d.answers[k].value : null;
    const c = await tx(async (t) => {
      const row = await insert('contracts', {
        officer_id: d.officer_id, organisation_id: d.organisation_id, category: 'contract', title: d.title, body: r.body, reference: await nextReference('contract', t),
        sent_at: new Date(), ...signerColumns(signer), source: 'pack', pack_id: d.pack_id, jurisdiction: d.jurisdiction, engagement_type: pack.engagement_type,
        draft_id: d.id, manifest: JSON.stringify(r.manifest), particulars: JSON.stringify(r.particulars), findings: JSON.stringify(r.findings),
        supporting: JSON.stringify(r.supporting), changes: r.changes ? JSON.stringify(r.changes) : null,
        start_date: val('start.date') || d.effective_date, end_date: val('term.end_date'), amends_id: d.amends_contract_id, amend_kind: d.amend_kind,
        signer_kind: party.kind === 'officer' && party.has_login ? 'officer' : 'outside',
      }, t);
      await t.q("UPDATE contract_drafts SET status = 'sent', contract_id = $2, updated_at = now() WHERE id = $1", [d.id, row.id]);
      return row;
    });
    await event('contract', c.id, 'sent', { user, ip, ua: uaOf(ev) });
    const delivered = await deliver(c, party, user, b);
    await audit(user, 'contract.send', 'contract', c.id, { source: 'pack', pack: d.pack_id, jurisdiction: d.jurisdiction, reference: c.reference, party: party.name, via: delivered.via });
    return { id: c.id, reference: c.reference, ...delivered };
  }),

  // The contract file: the agreement, then particulars, clauses, outstanding information, findings, changes and supporting documents
  'contracts.draft.bundle': def(CO, async (b, { user }) => {
    let d;
    let body;
    let r;
    let pack;
    if (b.contract_id) {
      const c = need(await one('SELECT * FROM contracts WHERE id = $1 AND source = $2', [b.contract_id, 'pack']), 'Contract not found');
      d = { ...(c.draft_id ? await one('SELECT * FROM contract_drafts WHERE id = $1', [c.draft_id]) : {}), title: c.title, officer_id: c.officer_id, organisation_id: c.organisation_id, changes: c.changes, pack_id: c.pack_id, jurisdiction: c.jurisdiction };
      pack = packOf(c.pack_id);
      r = { manifest: c.manifest || [], particulars: c.particulars || [], findings: c.findings || [], supporting: c.supporting || [], outstanding: [], ready: true, legal: (c.manifest || []).every((m) => m.state === 'legal') };
      body = c.body;
    } else {
      d = await loadDraft(b.id);
      ({ pack, r } = await build(d));
      body = r.body;
      d = { ...d, changes: r.changes };
    }
    const [s, party] = await Promise.all([getSettings(), partyOf(d)]);
    const { bytes } = await renderSigned({ company: s, doc: docFor(d, pack, party, body, b.contract_id ? 'SNAPSHOT' : 'DRAFT'), signers: {}, events: [], status: r.legal ? 'proof' : 'draft', verifyUrl: '' });
    const out = await contractFile(d, pack, party, r, s, bytes);
    return { filename: nameSafe(`${d.title} - contract file.pdf`), pdf: Buffer.from(out).toString('base64') };
  }),

  // ---- Contracts AI

  'contracts.ai.chat': def(CO, async (b, { user }) => {
    required(b, 'id', 'message');
    const message = String(b.message).trim().slice(0, 2000);
    if (!message) fail(400, 'Type a message');
    const d = await loadDraft(b.id);
    if (d.status !== 'draft') fail(400, 'This draft has been sent');
    const v = await view(d);
    const pack = packOf(d.pack_id);
    const history = (d.chat || []).slice(-12);
    // What the manager has said in this conversation: the only source for typed values
    const said = [...history.filter((m) => m.role === 'user').map((m) => m.text), message].join('\n');
    const messages = [...history.map((m) => ({ role: m.role, content: m.text || '…' })), { role: 'user', content: message }];
    const ask = () => claude({ model: SONNET, module: 'contracts', system: aiSystem(v, d), messages, tools: AI_TOOLS, max_tokens: 2048 });
    let r = await ask();
    // An empty answer now and then: ask once more rather than show nothing
    if (!(r.content || []).some((c) => (c.type === 'text' && c.text.trim()) || c.type === 'tool_use')) r = await ask();
    const text = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    const { proposals, rejected } = toProposals((r.content || []).filter((c) => c.type === 'tool_use'), v, d, pack, said);
    const reply = text || (proposals.length ? 'Here is what I suggest.' : 'I could not suggest a change for that.');
    const at = new Date().toISOString();
    const chat = await setChat(d.id, [...(d.chat || []), { role: 'user', text: message, by: user.name, at }, { role: 'assistant', text: reply, proposals, rejected, at }]);
    await audit(user, 'ai.chat', 'contract_draft', d.id, { proposals: proposals.length, summary: 'Asked Contracts AI about a draft' });
    return { chat: chat.chat };
  }),

  // Mark a proposal applied or dismissed, so the chat shows what happened to it
  'contracts.ai.resolve': def(CO, async (b) => {
    required(b, 'id', 'proposal_id');
    const d = await loadDraft(b.id);
    const status = b.status === 'applied' ? 'applied' : 'dismissed';
    const chat = (d.chat || []).map((m) => (m.proposals ? { ...m, proposals: m.proposals.map((p) => (p.id === b.proposal_id ? { ...p, status } : p)) } : m));
    return { chat: (await setChat(d.id, chat)).chat };
  }),

  'contracts.ai.clear': def(CO, async (b) => {
    required(b, 'id');
    await loadDraft(b.id);
    return { chat: (await setChat(b.id, [])).chat };
  }),
};
