// Contract packs → document. Pure: no database, no network, so the same answers always give the same draft.
//
// A pack is versioned data (content/contracts/packs/*.json): questions, sections of clause slots, rules,
// supporting documents and per-jurisdiction overrides. Clause wording comes from the company's library,
// already resolved to the version each clause currently uses.
//
// Rules are small declarative conditions:
//   { all: [r…] } | { any: [r…] } | { not: r }
//   { q: 'hours.guaranteed', eq|ne|in|nin|gt|gte|lt|lte: v } | { q: 'x', empty: true }
//   { clause: 'EMP.HOURS.CUT', on: true } | { bespoke: 'ID' | '*' } | { jurisdiction: 'sc' | ['sc','ni'] }
//   { assessment: 'substitution', eq: 'no' } | { outcome: 'employment', eq: 'employee' }
//   { wording: 'regex' }   matches the wording of the clauses chosen so far, bespoke text included (case-insensitive)

export const JURISDICTIONS = { ew: 'England and Wales', sc: 'Scotland', ni: 'Northern Ireland' };
export const STATES = { draft: 'Research-based draft', company: 'Company-approved', legal: 'Legally reviewed' };
export const SEVERITIES = ['blocker', 'review', 'note'];
const VAR = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*)\s*\}\}/g;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDate = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(d || '');
};
const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

/** Every variable named in a body. */
export const varsIn = (body) => [...new Set([...String(body || '').matchAll(VAR)].map((m) => m[1]))];

/** A value as it prints: markup and placeholders are stripped so an answer can't restyle or inject wording. */
export function formatValue(question, value) {
  if (blank(value)) return '';
  const t = question?.type;
  let out;
  if (t === 'date') out = longDate(value);
  else if (t === 'money') out = money(value);
  else if (t === 'yesno') out = value === true || value === 'yes' ? 'Yes' : 'No';
  else if (t === 'choice' || t === 'select') {
    const o = (question.options || []).find((x) => String(x.value) === String(value));
    out = o ? (o.text || o.label) : String(value);
  } else out = Array.isArray(value) ? value.join(', ') : String(value);
  return out.replace(/\*\*/g, '').replace(/\{\{|\}\}/g, '').replace(/\s*\n+\s*/g, '; ').trim();
}

export const placeholder = (label) => `[to be confirmed: ${label}]`;

/** Fill {{dotted.vars}}; anything without a printable value becomes a visible placeholder. */
export function fillVars(body, values, labels = {}) {
  return String(body || '').replace(VAR, (_m, k) => (values[k] != null && values[k] !== '' ? values[k] : placeholder(labels[k] || k)));
}

const num = (v) => (typeof v === 'number' ? v : v === '' || v == null ? NaN : Number(v));

/** Evaluate a rule against the draft context. A missing rule is true. */
export function evalRule(rule, ctx) {
  if (rule == null || rule === true) return true;
  if (rule === false) return false;
  if (typeof rule === 'object' && !Object.keys(rule).length) return true;
  if (rule.all) return rule.all.every((r) => evalRule(r, ctx));
  if (rule.any) return rule.any.some((r) => evalRule(r, ctx));
  if (rule.not) return !evalRule(rule.not, ctx);
  if (rule.clause) return (ctx.clauses?.has(rule.clause) ?? false) === (rule.on !== false);
  if (rule.bespoke) return rule.bespoke === '*' ? (ctx.bespoke?.size ?? 0) > 0 : ctx.bespoke?.has(rule.bespoke) ?? false;
  if (rule.jurisdiction) return [].concat(rule.jurisdiction).includes(ctx.jurisdiction);
  if (rule.wording) return new RegExp(rule.wording, 'i').test(ctx.text || '');
  let v;
  if (rule.q) v = ctx.values?.[rule.q];
  else if (rule.assessment) v = ctx.assessment?.[rule.assessment];
  else if (rule.outcome) v = ctx.outcomes?.[rule.outcome];
  else throw new Error(`Unknown rule: ${JSON.stringify(rule)}`);
  return compare(v, rule);
}

function compare(v, r) {
  if ('empty' in r) return blank(v) === !!r.empty;
  if ('eq' in r) return String(v ?? '') === String(r.eq);
  if ('ne' in r) return String(v ?? '') !== String(r.ne);
  if ('in' in r) return r.in.map(String).includes(String(v ?? ''));
  if ('nin' in r) return !blank(v) && !r.nin.map(String).includes(String(v));
  if (!['gt', 'gte', 'lt', 'lte'].some((k) => k in r)) return !blank(v) && v !== 'no' && v !== false;
  const n = num(v);
  if (Number.isNaN(n)) return false;
  if ('gt' in r) return n > r.gt;
  if ('gte' in r) return n >= r.gte;
  if ('lt' in r) return n < r.lt;
  return n <= r.lte;
}

/** The wording a clause uses in a jurisdiction: its own version, else the shared one. */
export const versionFor = (library, id, j) => library?.[id]?.versions?.[j] || library?.[id]?.versions?.all || null;

/** Slots of a section after the jurisdiction's overrides. */
export function slotsFor(pack, section, j) {
  const ov = pack.overrides?.[j] || {};
  return (section.slots || []).filter((s) => !s.jurisdictions || s.jurisdictions.includes(j)).map((s) => (ov[s.slot] ? { ...s, ...ov[s.slot] } : s));
}

/** Questions that apply, given the answers so far. */
export const visibleQuestions = (pack, ctx) => (pack.questions || []).filter((qn) => (!qn.jurisdictions || qn.jurisdictions.includes(ctx.jurisdiction)) && evalRule(qn.showIf, ctx));

/** Suggested outcomes of the status assessment, from its answers. */
export function assessOutcomes(pack, answers = {}) {
  const a = pack.assessment;
  if (!a) return null;
  const ctx = { assessment: answers };
  const done = (a.questions || []).every((qn) => !blank(answers[qn.id]));
  const pick = (list) => {
    if (!done) return 'unresolved';
    const hit = (list || []).find((o) => evalRule(o.when, ctx));
    return hit ? hit.result : 'unresolved';
  };
  return { employment: pick(a.outcomes?.employment), tax: pick(a.outcomes?.tax), complete: done };
}

/**
 * Build a draft.
 * answers:    { qid: { value, confirmed, source } }
 * assessment: { answers: { qid: value }, employment, tax, reason, assessed_by }  (recorded outcomes win over suggestions)
 * selections: { slot: { clause, on } }
 * bespoke:    { clauseId: { body, approved_by_name?, approved_at? } }
 * library:    { clauseId: { title, group, versions: { all|ew|sc|ni: { version, body, state, origin, sources, law } } } }
 * law:        [{ id, title, url, status, effective_date, jurisdictions }]
 */
export function compose({ pack, jurisdiction, answers = {}, assessment = {}, selections = {}, bespoke = {}, library = {}, law = [], effectiveDate = null, acks = {} }) {
  const j = jurisdiction;
  const qById = Object.fromEntries((pack.questions || []).map((qn) => [qn.id, qn]));
  const values = Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, a?.value]));
  const suggested = assessOutcomes(pack, assessment.answers || {});
  const outcomes = suggested ? { employment: assessment.employment || null, tax: assessment.tax || null } : {};
  const ctx = { jurisdiction: j, values, assessment: assessment.answers || {}, outcomes, clauses: new Set(), bespoke: new Set(Object.keys(bespoke).filter((k) => bespoke[k]?.body)) };

  const visible = visibleQuestions(pack, ctx);
  const visibleIds = new Set(visible.map((qn) => qn.id));
  const labels = Object.fromEntries((pack.questions || []).map((qn) => [qn.id, qn.label]));
  // Only confirmed answers print; a prefilled value waits for the manager to confirm it
  const printed = {};
  for (const qn of visible) {
    const a = answers[qn.id];
    if (a && a.confirmed && !blank(a.value)) printed[qn.id] = formatValue(qn, a.value);
  }

  const findings = [];
  const add = (f) => { if (!findings.some((x) => x.id === f.id)) findings.push(f); };
  const manifest = [];
  const parts = [];
  const lawIds = new Set(pack.law || []);

  for (const section of pack.clauses || []) {
    if (section.jurisdictions && !section.jurisdictions.includes(j)) continue;
    if (!evalRule(section.include, ctx)) continue;
    const bodies = [];
    for (const slot of slotsFor(pack, section, j)) {
      if (!evalRule(slot.include, ctx)) continue;
      const sel = selections[slot.slot] || {};
      if (slot.optional && !(sel.on ?? slot.on ?? false)) continue;
      const allowed = [...slot.clauses, ...Object.keys(library).filter((id) => library[id].group === slot.slot && !slot.clauses.includes(id))];
      const def0 = slot.default && allowed.includes(slot.default) ? slot.default : slot.clauses[0];
      // An alternative's own rule picks it automatically unless the manager chose one
      const auto = slot.choose ? (slot.choose.find((c) => evalRule(c.when, ctx))?.clause || def0) : def0;
      const id = sel.clause && allowed.includes(sel.clause) ? sel.clause : auto;
      const v = versionFor(library, id, j);
      if (!v) {
        add({ id: `missing:${id}`, severity: 'blocker', message: `Wording for ${id} is missing for ${JURISDICTIONS[j]}.`, jump: { slot: slot.slot } });
        continue;
      }
      const own = bespoke[id]?.body;
      const body = own || v.body;
      const state = own ? (bespoke[id].approved_at ? 'company' : 'draft') : v.state;
      ctx.clauses.add(id);
      (v.law || []).forEach((x) => lawIds.add(x));
      manifest.push({
        section: section.id, slot: slot.slot, clause: id, title: library[id]?.title || id, version: own ? null : v.version,
        jurisdiction: library[id]?.versions?.[j] ? j : 'all', state, origin: own ? 'bespoke' : id === def0 ? 'standard' : 'alternative',
        optional: !!slot.optional, alternatives: allowed.length, why: slot.why || null, ...(own ? { body: own } : {}),
      });
      bodies.push(body.trim());
      ctx.text = `${ctx.text || ''}\n${body}`;
    }
    if (!bodies.length) {
      if (section.required !== false) add({ id: `empty:${section.id}`, severity: 'blocker', message: `The "${section.title}" section is empty.`, jump: { section: section.id } });
      continue;
    }
    parts.push(`# ${section.title}`, ...bodies);
  }

  // Schedule 1: the particulars, confirmed or visibly outstanding
  const particulars = visible.filter((qn) => qn.particular !== false && qn.type !== 'note').map((qn) => ({
    id: qn.id, label: qn.label, section: qn.section || null, value: printed[qn.id] ?? null,
    confirmed: !!printed[qn.id], prefilled: !!answers[qn.id]?.source && !answers[qn.id]?.confirmed,
  }));
  // An optional question left blank is simply not listed
  const schedule = particulars.filter((p) => qById[p.id]?.schedule !== false && (p.confirmed || qById[p.id]?.required !== false));
  if (schedule.length) {
    parts.push('---page---', '#! Schedule 1 — Key particulars');
    parts.push(...schedule.map((p) => `- **${p.label}:** ${p.value ?? placeholder(p.label)}`));
  }

  const supporting = (pack.supporting || []).filter((s) => evalRule(s.when, ctx)).map((s) => ({ title: s.title, contractual: !!s.contractual, link: s.link || null }));
  const forming = supporting.filter((s) => s.contractual);
  if (forming.length) {
    parts.push('#! Documents forming part of this agreement');
    parts.push(...forming.map((s) => `- ${s.title}`));
  }

  const used = new Set();
  const body = fillVars(parts.join('\n\n'), printed, labels).replace(/\[to be confirmed: [^\]]+\]/g, (m) => (used.add(m), m));

  // ---- Findings
  const outstanding = visible.filter((qn) => qn.type !== 'note' && (qn.required !== false || varsUsed(parts).has(qn.id)) && !printed[qn.id])
    .map((qn) => ({ id: qn.id, label: qn.label, section: qn.section || null, prefilled: !!answers[qn.id]?.source && !blank(answers[qn.id]?.value) }));
  for (const k of varsUsed(parts)) {
    if (!qById[k]) add({ id: `undeclared:${k}`, severity: 'blocker', message: `The wording uses {{${k}}}, which no question answers.`, jump: null });
    else if (!visibleIds.has(k)) add({ id: `hidden:${k}`, severity: 'blocker', message: `The wording needs "${labels[k]}", but that question does not apply to this draft. Check the earlier answers.`, jump: { question: k } });
  }
  if (outstanding.length) {
    const pre = outstanding.filter((o) => o.prefilled).length;
    add({
      id: 'outstanding', severity: 'blocker', jump: { question: outstanding[0].id },
      message: `${outstanding.length} ${outstanding.length === 1 ? 'value is' : 'values are'} still to be confirmed${pre ? ` (${pre} prefilled, waiting for you to confirm)` : ''}. Nothing is filled in for you.`,
    });
  }

  if (suggested) {
    const exp = pack.assessment.expects || {};
    if (!suggested.complete) add({ id: 'assessment:incomplete', severity: 'blocker', message: 'Finish the status assessment: it is based on how the work really happens.', jump: { assessment: true } });
    for (const kind of ['employment', 'tax']) {
      const rec = outcomes[kind];
      const label = kind === 'employment' ? 'employment-rights status' : 'tax status';
      if (!rec || rec === 'unresolved' || !String(assessment.reason || '').trim()) {
        add({ id: `assessment:${kind}`, severity: 'blocker', message: `Record the ${label} outcome and a reason before sending.`, jump: { assessment: true } });
      } else if (exp[kind] && !exp[kind].includes(rec)) {
        add({ id: `assessment:${kind}:pack`, severity: 'blocker', message: `The recorded ${label} (${rec.replace(/_/g, ' ')}) does not fit this pack. ${pack.assessment.mismatch || 'Choose the pack that matches how the work happens.'}`, jump: { assessment: true } });
      }
      if (rec && suggested[kind] !== 'unresolved' && rec !== suggested[kind]) {
        add({ id: `assessment:${kind}:differs`, severity: 'review', message: `The answers suggest ${suggested[kind].replace(/_/g, ' ')} for ${label}, but ${rec.replace(/_/g, ' ')} was recorded. Check the reason is sound.`, jump: { assessment: true } });
      }
    }
  }

  for (const r of pack.rules || []) {
    if (evalRule(r.when, ctx)) add({ id: `rule:${r.id}`, severity: r.severity, message: r.message, jump: r.jump || null, law: r.law || null, source: 'rule' });
  }

  const drafts = manifest.filter((m) => m.state === 'draft');
  if (drafts.length) add({ id: 'state:draft', severity: 'blocker', message: `${drafts.length} ${drafts.length === 1 ? 'clause is a' : 'clauses are'} Research-based draft. Approve the wording for use by your company before sending.`, jump: { clause: drafts[0].clause } });
  for (const m of manifest.filter((x) => x.origin === 'bespoke')) {
    add({ id: `bespoke:${m.clause}`, severity: 'review', message: `"${m.title}" uses wording written for this document only. It has not been checked against the library.`, jump: { clause: m.clause } });
  }

  const start = effectiveDate || answers['start.date']?.value || null;
  for (const item of law) {
    if (!lawIds.has(item.id) || (item.jurisdictions && !item.jurisdictions.includes(j))) continue;
    const when = item.effective_date ? longDate(item.effective_date) : 'a date not yet announced';
    if (item.status !== 'in_force') {
      add({ id: `law:${item.id}`, severity: 'note', message: `${item.title}: ${item.status === 'announced' ? 'announced' : 'not yet in force'}, expected ${when}. It is not written in as current law.`, law: item.id, url: item.url });
    } else if (start && item.effective_date && item.effective_date > String(start).slice(0, 10)) {
      add({ id: `law:${item.id}`, severity: 'review', message: `${item.title} takes effect on ${when}, after this contract starts. Plan to review the contract then.`, law: item.id, url: item.url });
    }
  }

  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  for (const f of findings) if (f.severity === 'review' && acks[f.id]) f.ack = acks[f.id];
  const ready = !findings.some((f) => f.severity === 'blocker') && findings.filter((f) => f.severity === 'review').every((f) => f.ack);
  const legal = manifest.length > 0 && manifest.every((m) => m.state === 'legal');
  return { body, manifest, particulars, outstanding, findings, supporting, suggested, outcomes, ready, legal, placeholders: used.size };
}

function varsUsed(parts) {
  const s = new Set();
  for (const p of parts) for (const m of String(p).matchAll(VAR)) s.add(m[1]);
  return s;
}

/** Change comparison between a signed contract and its variation or replacement. */
export function diff(before = {}, after = {}) {
  const bp = Object.fromEntries((before.particulars || []).map((p) => [p.id, p]));
  const ap = Object.fromEntries((after.particulars || []).map((p) => [p.id, p]));
  const values = [];
  for (const id of new Set([...Object.keys(bp), ...Object.keys(ap)])) {
    const was = bp[id]?.value ?? null;
    const now = ap[id]?.value ?? null;
    if (was !== now) values.push({ id, label: ap[id]?.label || bp[id]?.label || id, was, now });
  }
  const key = (m) => m.slot;
  const bm = Object.fromEntries((before.manifest || []).map((m) => [key(m), m]));
  const am = Object.fromEntries((after.manifest || []).map((m) => [key(m), m]));
  const clauses = [];
  for (const slot of new Set([...Object.keys(bm), ...Object.keys(am)])) {
    const b = bm[slot];
    const a = am[slot];
    if (!b) clauses.push({ slot, change: 'added', now: a });
    else if (!a) clauses.push({ slot, change: 'removed', was: b });
    else if (b.clause !== a.clause || b.version !== a.version || b.origin !== a.origin || (a.origin === 'bespoke' && b.body !== a.body)) clauses.push({ slot, change: 'changed', was: b, now: a });
  }
  return { values, clauses };
}
