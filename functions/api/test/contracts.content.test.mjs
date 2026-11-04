import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContent, PACKS, CLAUSES, LAW, seedLibraryShape, sampleAnswers, seedHash } from '../lib/contractContent.mjs';
import { compose } from '../lib/compose.mjs';
import { parse } from '../lib/docmarkup.mjs';

test('contract content validates: sources, variables, slots, rules and law links', () => {
  const errors = validateContent();
  assert.deepEqual(errors, []);
});

test('the validator catches hard-coded figures and missing sources', () => {
  const bad = [{ id: 'EMP.BAD', title: 'Bad', versions: { all: { body: 'You get £500 and 4 weeks notice.', sources: [], checked_on: '2026-11-04' } } }];
  const errors = validateContent({ packs: [], clauses: bad, law: LAW });
  assert.ok(errors.some((e) => /money/.test(e)));
  assert.ok(errors.some((e) => /hard-coded figure/.test(e)));
  assert.ok(errors.some((e) => /sources/.test(e)));
});

test('content loads: packs, clauses and law items', () => {
  assert.ok(PACKS.permanent);
  assert.ok(CLAUSES.length > 30);
  assert.ok(LAW.some((l) => l.status === 'not_commenced'));
  assert.equal(seedHash({ body: 'a', sources: [] }), seedHash({ body: 'a', sources: [] }));
  assert.notEqual(seedHash({ body: 'a', sources: [] }), seedHash({ body: 'b', sources: [] }));
});

for (const j of ['ew', 'sc', 'ni']) {
  test(`permanent pack composes for ${j} with every value confirmed`, () => {
    const pack = PACKS.permanent;
    const out = compose({ pack, jurisdiction: j, answers: sampleAnswers(pack), library: seedLibraryShape('company'), law: LAW, effectiveDate: '2026-12-01' });
    assert.equal(out.outstanding.length, 0);
    assert.ok(!out.findings.some((f) => f.severity === 'blocker'), JSON.stringify(out.findings.filter((f) => f.severity === 'blocker')));
    assert.ok(!/\[to be confirmed/.test(out.body));
    const law = { ew: 'England and Wales', sc: 'Scotland', ni: 'Northern Ireland' }[j];
    assert.match(out.body, new RegExp(`law of ${law}`));
    if (j === 'ni') {
      assert.match(out.body, /Article 33/);
      assert.match(out.body, /Labour Relations Agency/);
      assert.ok(out.findings.some((f) => f.id === 'law:ni-good-jobs-bill' && f.severity === 'note'));
      assert.ok(!out.findings.some((f) => f.id === 'law:era2025-unfair-dismissal-six-months'));
    } else {
      assert.match(out.body, /Employment Rights Act 1996/);
      assert.ok(out.findings.some((f) => f.id === 'law:era2025-unfair-dismissal-six-months' && f.severity === 'note'));
    }
    if (j === 'sc') assert.match(out.body, /Contract \(Third Party Rights\) \(Scotland\) Act 2017/);
    // Renders through the existing markup parser: numbered sections plus an unnumbered schedule
    const blocks = parse(out.body);
    assert.ok(blocks.some((b) => b.type === 'heading' && b.number === '1'));
    assert.ok(blocks.some((b) => b.type === 'heading' && b.number === '' && /Schedule 1/.test(b.runs[0].text)));
  });
}

test('every pack composes in every jurisdiction with sample answers: nothing left unfilled', () => {
  assert.equal(Object.keys(PACKS).length, 8);
  for (const pack of Object.values(PACKS)) {
    for (const j of pack.jurisdictions) {
      const out = compose({ pack, jurisdiction: j, answers: sampleAnswers(pack), library: seedLibraryShape('company'), law: LAW, effectiveDate: '2026-12-01' });
      const at = `${pack.id}/${j}`;
      assert.equal(out.outstanding.length, 0, `${at}: ${out.outstanding.map((o) => o.id).join(', ')}`);
      assert.ok(!/\[to be confirmed/.test(out.body), at);
      assert.ok(!/\{\{/.test(out.body), `${at}: unfilled variable`);
      const law = { ew: 'England and Wales', sc: 'Scotland', ni: 'Northern Ireland' }[j];
      assert.match(out.body, new RegExp(`law of ${law}`), at);
      assert.ok(parse(out.body).some((b) => b.type === 'heading' && b.number === '1'), at);
    }
  }
});
