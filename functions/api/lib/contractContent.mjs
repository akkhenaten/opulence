// Contract packs, the seeded clause library and law items (content/contracts), plus the seeder and validator.
// Seeded wording is never overwritten: changed wording becomes a new version and the company chooses to adopt it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { q, tx } from './db.mjs';
import { varsIn, versionFor, slotsFor, compose, JURISDICTIONS } from './compose.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content', 'contracts');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const jsonFiles = (d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(d, f)) : []);

export const PACK_LIST = jsonFiles(path.join(DIR, 'packs')).map(readJson);
export const PACKS = Object.fromEntries(PACK_LIST.map((p) => [p.id, p]));
export const CLAUSES = jsonFiles(path.join(DIR, 'clauses')).flatMap(readJson);
export const CLAUSE_BY_ID = Object.fromEntries(CLAUSES.map((c) => [c.id, c]));
export const LAW = readJson(path.join(DIR, 'law.json'));

const sha = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const seedHash = (v) => sha({ body: v.body, sources: v.sources || [] });

let seeded = false;
/** Insert new seed wording and law items. Cheap when nothing changed: one read, no writes. */
export async function seedLibrary() {
  if (seeded) return;
  const have = await q('SELECT clause_id, jurisdiction, version, seed_hash FROM clause_versions');
  const hashes = new Set(have.filter((r) => r.seed_hash).map((r) => `${r.clause_id}|${r.jurisdiction}|${r.seed_hash}`));
  const missing = [];
  for (const c of CLAUSES) {
    for (const [j, v] of Object.entries(c.versions)) if (!hashes.has(`${c.id}|${j}|${seedHash(v)}`)) missing.push([c, j, v]);
  }
  const lawRows = await q('SELECT id, seed_hash FROM law_items');
  const lawHave = Object.fromEntries(lawRows.map((r) => [r.id, r.seed_hash]));
  const lawMissing = LAW.filter((l) => lawHave[l.id] !== sha(l));
  if (missing.length || lawMissing.length) {
    await tx(async (t) => {
      await t.q('SELECT pg_advisory_xact_lock(424243)');
      for (const [c, j, v] of missing) {
        const h = seedHash(v);
        if (await t.one('SELECT 1 FROM clause_versions WHERE clause_id = $1 AND jurisdiction = $2 AND seed_hash = $3', [c.id, j, h])) continue;
        await t.q(`INSERT INTO clauses (id, subject, title, group_id) VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET subject = EXCLUDED.subject, title = EXCLUDED.title`, [c.id, c.subject || '', c.title, c.group || null]);
        const { n } = await t.one('SELECT COALESCE(MAX(version), 0) + 1 AS n FROM clause_versions WHERE clause_id = $1 AND jurisdiction = $2', [c.id, j]);
        await t.q(`INSERT INTO clause_versions (clause_id, jurisdiction, version, body, origin, state, sources, checked_on, seed_hash)
          VALUES ($1, $2, $3, $4, 'seed', 'draft', $5, $6, $7)`, [c.id, j, n, v.body, JSON.stringify(v.sources || []), v.checked_on || null, h]);
        await t.q('INSERT INTO clause_current (clause_id, jurisdiction, version) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [c.id, j, n]);
      }
      for (const l of lawMissing) {
        await t.q(`INSERT INTO law_items (id, jurisdictions, title, url, status, effective_date, checked_on, summary, seed_hash)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET jurisdictions = EXCLUDED.jurisdictions, title = EXCLUDED.title, url = EXCLUDED.url, status = EXCLUDED.status,
            effective_date = EXCLUDED.effective_date, checked_on = EXCLUDED.checked_on, summary = EXCLUDED.summary, seed_hash = EXCLUDED.seed_hash`,
        [l.id, l.jurisdictions, l.title, l.url || '', l.status, l.effective_date, l.checked_on || null, l.summary || '', sha(l)]);
      }
    });
    console.log('[contracts] seeded', missing.length, 'clause versions,', lawMissing.length, 'law items');
  }
  seeded = true;
}

/** The library compose() reads: each clause's current version per jurisdiction, with its law links from the content. */
export async function loadLibrary() {
  const rows = await q(`SELECT c.id, c.title, c.group_id, v.jurisdiction, v.version, v.body, v.state, v.origin, v.sources, v.checked_on
    FROM clauses c JOIN clause_current cc ON cc.clause_id = c.id
    JOIN clause_versions v ON v.clause_id = cc.clause_id AND v.jurisdiction = cc.jurisdiction AND v.version = cc.version`);
  const lib = {};
  for (const r of rows) {
    const seed = CLAUSE_BY_ID[r.id];
    const e = (lib[r.id] ||= { title: r.title, group: r.group_id || null, versions: {} });
    e.versions[r.jurisdiction] = {
      version: r.version, body: r.body, state: r.state, origin: r.origin, sources: r.sources, checked_on: r.checked_on,
      law: (seed?.versions?.[r.jurisdiction] || seed?.versions?.all)?.law || [],
    };
  }
  return lib;
}

export const loadLaw = () => q('SELECT id, jurisdictions, title, url, status, effective_date, checked_on, summary FROM law_items ORDER BY effective_date NULLS LAST, id');

/** The seeded content as compose() library, every version in its seed state. Used by tests and the validator. */
export function seedLibraryShape(state = 'draft') {
  return Object.fromEntries(CLAUSES.map((c) => [c.id, {
    title: c.title, group: c.group || null,
    versions: Object.fromEntries(Object.entries(c.versions).map(([j, v]) => [j, { version: 1, body: v.body, state, origin: 'seed', sources: v.sources, law: v.law || [] }])),
  }]));
}

// ---- Validator (test/contracts.content.test.mjs runs it; the Library page can show it too)

const RULE_KEYS = ['all', 'any', 'not', 'q', 'clause', 'bespoke', 'jurisdiction', 'assessment', 'outcome', 'wording'];
const Q_TYPES = ['text', 'textarea', 'date', 'money', 'number', 'choice', 'yesno', 'note'];
const SEV = ['blocker', 'review', 'note'];
const MONEY = /£\s?\d/;
const FIGURE = /\b\d+(\.\d+)?\s*(weeks?|days?|hours?|months?|years?)\b/i;

function walkRule(rule, fn) {
  if (rule == null || typeof rule !== 'object') return;
  fn(rule);
  (rule.all || rule.any || []).forEach((r) => walkRule(r, fn));
  if (rule.not) walkRule(rule.not, fn);
}

/** Sample answers for a pack: every question confirmed with a plausible value. */
export function sampleAnswers(pack) {
  const out = {};
  for (const qn of pack.questions || []) {
    let v = 'Sample';
    if (qn.type === 'date') v = '2026-12-01';
    else if (qn.type === 'money') v = 15.5;
    else if (qn.type === 'number') v = 30;
    else if (qn.type === 'yesno') v = 'yes';
    else if (qn.type === 'choice') v = qn.options?.[0]?.value;
    out[qn.id] = { value: v, confirmed: true };
  }
  return out;
}

export function validateContent({ packs = PACK_LIST, clauses = CLAUSES, law = LAW } = {}) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const lawIds = new Set(law.map((l) => l.id));
  const byId = {};

  for (const l of law) {
    if (!['in_force', 'announced', 'not_commenced'].includes(l.status)) err(`law ${l.id}`, `bad status ${l.status}`);
    if (!l.url) err(`law ${l.id}`, 'no source url');
    if (!(l.jurisdictions || []).every((j) => JURISDICTIONS[j])) err(`law ${l.id}`, 'bad jurisdiction');
  }
  if (lawIds.size !== law.length) err('law', 'duplicate ids');

  for (const c of clauses) {
    if (byId[c.id]) err(`clause ${c.id}`, 'duplicate id');
    byId[c.id] = c;
    if (!/^[A-Z]+(\.[A-Z0-9_]+)+$/.test(c.id)) err(`clause ${c.id}`, 'id must be SUBJECT.TOPIC in upper case');
    if (!c.title) err(`clause ${c.id}`, 'no title');
    const vs = Object.entries(c.versions || {});
    if (!vs.length) err(`clause ${c.id}`, 'no versions');
    if (!c.versions?.all && !['ew', 'sc', 'ni'].every((j) => c.versions?.[j])) err(`clause ${c.id}`, 'needs an "all" version or one for every jurisdiction');
    for (const [j, v] of vs) {
      const w = `clause ${c.id} [${j}]`;
      if (!['all', 'ew', 'sc', 'ni'].includes(j)) err(w, 'bad jurisdiction key');
      if (!String(v.body || '').trim()) err(w, 'empty body');
      if (/^\s*#/m.test(v.body || '')) err(w, 'headings belong to the pack, not the clause');
      if (!(v.sources || []).length || !(v.sources || []).every((s) => s.title && /^https:\/\//.test(s.url || ''))) err(w, 'every version needs sources with a title and an https url');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.checked_on || '')) err(w, 'checked_on date missing');
      for (const x of v.law || []) if (!lawIds.has(x)) err(w, `unknown law item ${x}`);
      if ('state' in v) err(w, 'seeded wording must not set a state (it is always a Research-based draft)');
      for (const para of String(v.body || '').split(/\n\s*\n/)) {
        const text = para.replace(/\{\{[^}]+\}\}/g, '').replace(/\b(Act|Order|Regulations|section|Article|regulations?)\s+\d+/gi, '');
        if (MONEY.test(text)) err(w, `hard-coded money amount: "${para.slice(0, 80)}…"`);
        if (FIGURE.test(text) && !/statutory/i.test(para)) err(w, `hard-coded figure (use a variable, or mark a statutory figure as statutory): "${para.slice(0, 80)}…"`);
      }
    }
  }

  const ids = new Set();
  for (const p of packs) {
    const w = `pack ${p.id}`;
    if (ids.has(p.id)) err(w, 'duplicate id');
    ids.add(p.id);
    for (const k of ['title', 'summary', 'party', 'engagement_type', 'doc_title']) if (!p[k]) err(w, `missing ${k}`);
    if (!['person', 'organisation'].includes(p.party)) err(w, 'party must be person or organisation');
    if (!(p.jurisdictions || []).length || !p.jurisdictions.every((j) => JURISDICTIONS[j])) err(w, 'bad jurisdictions');
    for (const x of p.law || []) if (!lawIds.has(x)) err(w, `unknown law item ${x}`);
    const sections = new Set((p.sections || []).map((s) => s.id));
    const qIds = new Set();
    const qById = {};
    for (const qn of p.questions || []) {
      if (qIds.has(qn.id)) err(w, `duplicate question ${qn.id}`);
      qIds.add(qn.id);
      qById[qn.id] = qn;
      if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(qn.id)) err(w, `question id ${qn.id} must be dotted lower case`);
      if (!qn.label) err(w, `question ${qn.id} has no label`);
      if (!Q_TYPES.includes(qn.type)) err(w, `question ${qn.id} has bad type ${qn.type}`);
      if (qn.type === 'choice' && !(qn.options || []).length) err(w, `question ${qn.id} needs options`);
      if (!sections.has(qn.section)) err(w, `question ${qn.id} points to unknown section ${qn.section}`);
    }
    const aIds = new Set((p.assessment?.questions || []).map((x) => x.id));
    const checkRule = (rule, where) => walkRule(rule, (r) => {
      const keys = Object.keys(r).filter((k) => RULE_KEYS.includes(k));
      if (!keys.length) err(w, `${where}: rule has no known key: ${JSON.stringify(r)}`);
      if (r.q && !qIds.has(r.q)) err(w, `${where}: unknown question ${r.q}`);
      if (r.assessment && !aIds.has(r.assessment)) err(w, `${where}: unknown assessment question ${r.assessment}`);
      if (r.clause && !byId[r.clause]) err(w, `${where}: unknown clause ${r.clause}`);
      if (r.bespoke && r.bespoke !== '*' && !byId[r.bespoke]) err(w, `${where}: unknown clause ${r.bespoke}`);
      if (r.outcome && !['employment', 'tax'].includes(r.outcome)) err(w, `${where}: outcome must be employment or tax`);
      if (r.wording) { try { new RegExp(r.wording, 'i'); } catch { err(w, `${where}: bad regex`); } }
    });
    for (const qn of p.questions || []) checkRule(qn.showIf, `question ${qn.id}`);
    if (p.assessment) {
      for (const kind of ['employment', 'tax']) for (const o of p.assessment.outcomes?.[kind] || []) checkRule(o.when, `assessment ${kind}`);
      if (!(p.assessment.questions || []).every((x) => x.id && x.label && (x.options || []).length)) err(w, 'assessment questions need id, label and options');
    }
    const slotIds = new Set();
    for (const s of p.clauses || []) {
      checkRule(s.include, `section ${s.id}`);
      for (const sl of s.slots || []) {
        if (slotIds.has(sl.slot)) err(w, `duplicate slot ${sl.slot}`);
        slotIds.add(sl.slot);
        if (!(sl.clauses || []).length) err(w, `slot ${sl.slot} has no clauses`);
        for (const id of sl.clauses || []) if (!byId[id]) err(w, `slot ${sl.slot}: unknown clause ${id}`);
        for (const ch of sl.choose || []) {
          checkRule(ch.when, `slot ${sl.slot}`);
          if (!(sl.clauses || []).includes(ch.clause)) err(w, `slot ${sl.slot}: choose picks ${ch.clause}, which is not in the slot`);
        }
        checkRule(sl.include, `slot ${sl.slot}`);
      }
    }
    for (const [j, ov] of Object.entries(p.overrides || {})) {
      if (!JURISDICTIONS[j]) err(w, `override for unknown jurisdiction ${j}`);
      for (const [slot, o] of Object.entries(ov)) {
        if (!slotIds.has(slot)) err(w, `override ${j}: unknown slot ${slot}`);
        for (const id of o.clauses || []) if (!byId[id]) err(w, `override ${j}: unknown clause ${id}`);
      }
    }
    for (const r of p.rules || []) {
      if (!SEV.includes(r.severity)) err(w, `rule ${r.id}: bad severity`);
      if (!r.message) err(w, `rule ${r.id}: no message`);
      checkRule(r.when, `rule ${r.id}`);
      if (r.jump?.question && !qIds.has(r.jump.question)) err(w, `rule ${r.id}: jump to unknown question`);
      if (r.jump?.slot && !slotIds.has(r.jump.slot)) err(w, `rule ${r.id}: jump to unknown slot`);
      for (const x of r.law || []) if (!lawIds.has(x)) err(w, `rule ${r.id}: unknown law item ${x}`);
    }
    for (const s of p.supporting || []) checkRule(s.when, `supporting ${s.title}`);

    // Every jurisdiction resolves every clause and every variable it uses
    const library = seedLibraryShape();
    for (const j of p.jurisdictions || []) {
      for (const s of p.clauses || []) {
        for (const sl of slotsFor(p, s, j)) {
          for (const id of sl.clauses || []) {
            const v = versionFor(library, id, j);
            if (!v) { err(w, `[${j}] clause ${id} has no wording`); continue; }
            for (const k of varsIn(v.body)) if (!qById[k]) err(w, `[${j}] clause ${id} uses {{${k}}}, which no question declares`);
          }
        }
      }
      const out = compose({ pack: p, jurisdiction: j, answers: sampleAnswers(p), library, law, assessment: p.assessment ? { answers: {} } : {} });
      for (const f of out.findings) if (/^(missing|undeclared|hidden|empty):/.test(f.id)) err(w, `[${j}] sample draft: ${f.message}`);
    }
  }
  return errors;
}
