import test from 'node:test';
import assert from 'node:assert/strict';
import { compose, evalRule, fillVars, formatValue, assessOutcomes, diff } from '../lib/compose.mjs';
import { PACKS, LAW, seedLibraryShape, sampleAnswers } from '../lib/contractContent.mjs';

const lib = (extra = {}) => ({
  'T.PAY': { title: 'Pay', versions: { all: { version: 1, body: 'You are paid {{pay.rate}} an hour.', state: 'company' } } },
  'T.PAY.SAL': { title: 'Salary', versions: { all: { version: 1, body: 'Your salary is {{pay.salary}}.', state: 'company' } } },
  'T.HOURS.ZERO': { title: 'No guaranteed hours', versions: { all: { version: 1, body: 'There are no guaranteed hours.', state: 'company' } } },
  'T.AVAIL': { title: 'Availability', versions: { all: { version: 2, body: 'You must be available {{availability.required}}.', state: 'company' } } },
  'T.SUB': { title: 'Substitution', versions: { all: { version: 1, body: 'You may send a suitably qualified substitute.', state: 'company' } } },
  'T.LAW': { title: 'Law', versions: { ew: { version: 1, body: 'English law.', state: 'company' }, sc: { version: 1, body: 'Scots law.', state: 'company', law: ['ann'] } } },
  'T.VEH': { title: 'Vehicle', versions: { all: { version: 1, body: 'A vehicle is provided.', state: 'company' } } },
  ...extra,
});

const pack = {
  id: 't', title: 'Test', clauses: [
    { id: 'pay', title: 'Pay', slots: [{ slot: 'pay', clauses: ['T.PAY', 'T.PAY.SAL'], choose: [{ when: { q: 'pay.basis', eq: 'salary' }, clause: 'T.PAY.SAL' }] }] },
    { id: 'hours', title: 'Hours', slots: [{ slot: 'hours', clauses: ['T.HOURS.ZERO'] }, { slot: 'avail', clauses: ['T.AVAIL'] }] },
    { id: 'veh', title: 'Vehicle', required: false, slots: [{ slot: 'veh', clauses: ['T.VEH'], include: { q: 'vehicle', eq: 'yes' } }] },
    { id: 'law', title: 'Law', slots: [{ slot: 'law', clauses: ['T.LAW'] }] },
  ],
  questions: [
    { id: 'pay.basis', label: 'Pay basis', type: 'choice', options: [{ value: 'hourly', label: 'Hourly' }, { value: 'salary', label: 'Salary' }], schedule: false },
    { id: 'pay.rate', label: 'Hourly rate', type: 'money', showIf: { q: 'pay.basis', eq: 'hourly' } },
    { id: 'pay.salary', label: 'Salary', type: 'money', showIf: { q: 'pay.basis', eq: 'salary' } },
    { id: 'availability.required', label: 'Availability', type: 'choice', options: [{ value: 'unrestricted', label: 'Any time', text: 'whenever we ask' }, { value: 'agreed', label: 'Agreed', text: 'at agreed times' }] },
    { id: 'hours.guaranteed', label: 'Guaranteed hours', type: 'number' },
    { id: 'vehicle', label: 'Vehicle', type: 'yesno', schedule: false },
  ],
  rules: [{ id: 'zh-unrestricted', severity: 'blocker', when: { all: [{ q: 'hours.guaranteed', eq: 0 }, { q: 'availability.required', eq: 'unrestricted' }] }, message: 'No guaranteed hours with unrestricted availability.' }],
};
const law = [{ id: 'ann', title: 'Announced law', status: 'announced', effective_date: null, jurisdictions: ['sc'] }];
const ok = (v) => ({ value: v, confirmed: true });

test('confirmed values fill the wording; missing values print a visible placeholder', () => {
  const out = compose({ pack, jurisdiction: 'ew', library: lib(), answers: { 'pay.basis': ok('hourly'), 'pay.rate': ok(15.5), vehicle: ok('no') } });
  assert.match(out.body, /You are paid £15\.50 an hour\./);
  assert.match(out.body, /You must be available \[to be confirmed: Availability\]\./);
  assert.ok(out.findings.some((f) => f.id === 'outstanding' && f.severity === 'blocker'));
  assert.equal(out.ready, false);
});

test('a prefilled value does not print until it is confirmed', () => {
  const out = compose({ pack, jurisdiction: 'ew', library: lib(), answers: { 'pay.basis': ok('hourly'), 'pay.rate': { value: 15, confirmed: false, source: 'officer' } } });
  assert.match(out.body, /\[to be confirmed: Hourly rate\]/);
  assert.ok(out.outstanding.find((o) => o.id === 'pay.rate').prefilled);
});

test('alternatives: picked by the answers, overridden by the manager', () => {
  const answers = { 'pay.basis': ok('salary'), 'pay.salary': ok(30000) };
  let out = compose({ pack, jurisdiction: 'ew', library: lib(), answers });
  assert.match(out.body, /Your salary is £30,000\./);
  assert.equal(out.manifest.find((m) => m.slot === 'pay').origin, 'alternative');
  out = compose({ pack, jurisdiction: 'ew', library: lib(), answers, selections: { pay: { clause: 'T.PAY' } } });
  assert.equal(out.manifest.find((m) => m.slot === 'pay').clause, 'T.PAY');
  // A company alternative in the slot's group is allowed; an unrelated clause is ignored
  const extra = { 'C.PAY.WEEKLY': { title: 'Weekly pay', group: 'pay', versions: { all: { version: 1, body: 'Paid weekly.', state: 'company' } } } };
  out = compose({ pack, jurisdiction: 'ew', library: lib(extra), answers, selections: { pay: { clause: 'C.PAY.WEEKLY' } } });
  assert.match(out.body, /Paid weekly\./);
  out = compose({ pack, jurisdiction: 'ew', library: lib(), answers, selections: { pay: { clause: 'T.VEH' } } });
  assert.equal(out.manifest.find((m) => m.slot === 'pay').clause, 'T.PAY.SAL');
});

test('conditional clauses are left out when their condition is false', () => {
  const base = { 'pay.basis': ok('hourly') };
  assert.doesNotMatch(compose({ pack, jurisdiction: 'ew', library: lib(), answers: { ...base, vehicle: ok('no') } }).body, /vehicle/);
  assert.match(compose({ pack, jurisdiction: 'ew', library: lib(), answers: { ...base, vehicle: ok('yes') } }).body, /A vehicle is provided/);
});

test('blocker: zero guaranteed hours with unrestricted availability', () => {
  const answers = { 'pay.basis': ok('hourly'), 'pay.rate': ok(13), 'availability.required': ok('unrestricted'), 'hours.guaranteed': ok(0), vehicle: ok('no') };
  const out = compose({ pack, jurisdiction: 'ew', library: lib(), answers });
  assert.ok(out.findings.some((f) => f.id === 'rule:zh-unrestricted' && f.severity === 'blocker'));
  answers['availability.required'] = ok('agreed');
  const fixed = compose({ pack, jurisdiction: 'ew', library: lib(), answers });
  assert.ok(!fixed.findings.some((f) => f.id === 'rule:zh-unrestricted'));
  assert.equal(fixed.ready, true);
});

test('blocker: self-employed with no real right of substitution but substitution wording', () => {
  const se = {
    ...pack,
    clauses: [...pack.clauses, { id: 'sub', title: 'Substitution', slots: [{ slot: 'sub', clauses: ['T.SUB'] }] }],
    assessment: {
      questions: [{ id: 'substitution', label: 'Can they send someone else?', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }],
      outcomes: { employment: [{ result: 'self_employed', when: { assessment: 'substitution', eq: 'yes' } }, { result: 'worker', when: {} }], tax: [{ result: 'self_employed', when: { assessment: 'substitution', eq: 'yes' } }, { result: 'employed', when: {} }] },
      expects: { employment: ['self_employed'], tax: ['self_employed'] },
    },
    rules: [{ id: 'sham-substitution', severity: 'blocker', when: { all: [{ assessment: 'substitution', eq: 'no' }, { clause: 'T.SUB' }] }, message: 'The contract gives a right of substitution that does not exist in practice.' }],
  };
  const answers = { 'pay.basis': ok('hourly'), 'pay.rate': ok(20), 'availability.required': ok('agreed'), 'hours.guaranteed': ok(0), vehicle: ok('no') };
  const out = compose({ pack: se, jurisdiction: 'ew', library: lib(), answers, assessment: { answers: { substitution: 'no' }, employment: 'self_employed', tax: 'self_employed', reason: 'Says so' } });
  assert.ok(out.findings.some((f) => f.id === 'rule:sham-substitution' && f.severity === 'blocker'));
  assert.ok(out.findings.some((f) => f.id === 'assessment:employment:differs' && f.severity === 'review'));
  assert.deepEqual(assessOutcomes(se, { substitution: 'no' }), { employment: 'worker', tax: 'employed', complete: true });
  const unrecorded = compose({ pack: se, jurisdiction: 'ew', library: lib(), answers, assessment: { answers: {} } });
  assert.ok(unrecorded.findings.some((f) => f.id === 'assessment:incomplete'));
  const wrongPack = compose({ pack: se, jurisdiction: 'ew', library: lib(), answers, assessment: { answers: { substitution: 'no' }, employment: 'worker', tax: 'employed', reason: 'Controlled shifts' } });
  assert.ok(wrongPack.findings.some((f) => f.id === 'assessment:employment:pack' && f.severity === 'blocker'));
});

test('blocker: wording that cuts guaranteed hours because a client site changes', () => {
  const p = PACKS.permanent;
  const answers = sampleAnswers(p);
  const library = seedLibraryShape('company');
  const clean = compose({ pack: p, jurisdiction: 'ew', answers, library, law: LAW });
  assert.ok(!clean.findings.some((f) => f.id === 'rule:hours-cut-client-site'));
  const bespoke = { 'EMP.HOURS.CHANGE': { body: 'We may reduce your guaranteed hours if a client site closes or the client contract ends.' } };
  const out = compose({ pack: p, jurisdiction: 'ew', answers, library, law: LAW, bespoke });
  assert.ok(out.findings.some((f) => f.id === 'rule:hours-cut-client-site' && f.severity === 'blocker'));
  assert.ok(out.findings.some((f) => f.id === 'bespoke:EMP.HOURS.CHANGE' && f.severity === 'review'));
  assert.equal(out.manifest.find((m) => m.clause === 'EMP.HOURS.CHANGE').origin, 'bespoke');
});

test('announced law gives a Note and is never written in as current law', () => {
  const out = compose({ pack, jurisdiction: 'sc', library: lib(), law, answers: {} });
  const n = out.findings.find((f) => f.id === 'law:ann');
  assert.equal(n.severity, 'note');
  assert.match(n.message, /announced/);
  assert.match(out.body, /Scots law\./);
  assert.ok(!compose({ pack, jurisdiction: 'ew', library: lib(), law, answers: {} }).findings.some((f) => f.id === 'law:ann'));
});

test('law that starts after the contract does is flagged for review', () => {
  const later = [{ id: 'ann', title: 'New right', status: 'in_force', effective_date: '2027-01-01', jurisdictions: ['sc'] }];
  const out = compose({ pack, jurisdiction: 'sc', library: lib(), law: later, answers: {}, effectiveDate: '2026-12-01' });
  assert.equal(out.findings.find((f) => f.id === 'law:ann').severity, 'review');
});

test('Research-based draft wording blocks sending; acknowledging review items makes it ready', () => {
  const draftLib = lib({ 'T.VEH': { title: 'Vehicle', versions: { all: { version: 1, body: 'A vehicle.', state: 'draft' } } } });
  const answers = { 'pay.basis': ok('hourly'), 'pay.rate': ok(13), 'availability.required': ok('agreed'), 'hours.guaranteed': ok(5), vehicle: ok('yes') };
  const out = compose({ pack, jurisdiction: 'ew', library: draftLib, answers });
  assert.ok(out.findings.some((f) => f.id === 'state:draft' && f.severity === 'blocker'));
  assert.equal(out.legal, false);
  const bespoke = { 'T.VEH': { body: 'A van.', approved_by_name: 'Jo', approved_at: '2026-11-04' } };
  const b = compose({ pack, jurisdiction: 'ew', library: draftLib, answers, bespoke });
  assert.equal(b.ready, false);
  const acked = compose({ pack, jurisdiction: 'ew', library: draftLib, answers, bespoke, acks: { 'bespoke:T.VEH': { by: 'Jo', note: 'Checked' } } });
  assert.equal(acked.ready, true);
});

test('missing wording for a jurisdiction is a blocker', () => {
  const out = compose({ pack, jurisdiction: 'ni', library: lib(), answers: {} });
  assert.ok(out.findings.some((f) => f.id === 'missing:T.LAW'));
});

test('answers cannot inject markup or variables', () => {
  assert.equal(formatValue({ type: 'text' }, '**bold** {{pay.rate}}\nnext'), 'bold pay.rate; next');
  assert.equal(fillVars('A {{x.y}} B', {}, { 'x.y': 'Thing' }), 'A [to be confirmed: Thing] B');
});

test('rules: all, any, not, comparisons, jurisdiction, wording', () => {
  const ctx = { jurisdiction: 'sc', values: { a: 5, b: 'yes', c: '' }, clauses: new Set(['X']), bespoke: new Set(), text: 'We may cut hours' };
  assert.equal(evalRule({ all: [{ q: 'a', gt: 4 }, { q: 'b' }] }, ctx), true);
  assert.equal(evalRule({ any: [{ q: 'a', lt: 4 }, { q: 'c', empty: true }] }, ctx), true);
  assert.equal(evalRule({ not: { clause: 'X' } }, ctx), false);
  assert.equal(evalRule({ jurisdiction: ['ew', 'ni'] }, ctx), false);
  assert.equal(evalRule({ wording: 'cut\\s+hours' }, ctx), true);
  assert.equal(evalRule({ q: 'a', in: [5, 6] }, ctx), true);
  assert.equal(evalRule({ bespoke: '*' }, ctx), false);
});

test('change comparison lists changed values and clauses', () => {
  const before = { particulars: [{ id: 'pay.rate', label: 'Hourly rate', value: '£13' }], manifest: [{ slot: 'pay', clause: 'T.PAY', version: 1, origin: 'standard' }, { slot: 'veh', clause: 'T.VEH', version: 1, origin: 'standard' }] };
  const after = { particulars: [{ id: 'pay.rate', label: 'Hourly rate', value: '£14' }], manifest: [{ slot: 'pay', clause: 'T.PAY', version: 2, origin: 'standard' }, { slot: 'law', clause: 'T.LAW', version: 1, origin: 'standard' }] };
  const d = diff(before, after);
  assert.deepEqual(d.values, [{ id: 'pay.rate', label: 'Hourly rate', was: '£13', now: '£14' }]);
  assert.deepEqual(d.clauses.map((c) => `${c.slot}:${c.change}`).sort(), ['law:added', 'pay:changed', 'veh:removed']);
});
