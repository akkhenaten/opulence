import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, fill, unknownPlaceholders, usedPlaceholders, runs, BLANK } from '../lib/docmarkup.mjs';

test('headings are numbered and the paragraphs under them become clauses', () => {
  const b = parse('Intro line.\n\n# Engagement\nFirst clause.\n\nSecond clause.\n\n# Fees\nPaid weekly.');
  assert.deepEqual(b.map((x) => [x.type, x.number]), [['para', undefined], ['heading', '1'], ['clause', '1.1'], ['clause', '1.2'], ['heading', '2'], ['clause', '2.1']]);
});

test('a paragraph that carries its own number keeps it', () => {
  const b = parse('3. Status. The Contractor is self-employed.\n\n4.2 Notice.');
  assert.deepEqual(b.map((x) => x.number), ['3', '4.2']);
  assert.equal(b[0].runs[0].text, 'Status. The Contractor is self-employed.');
});

test('bullets, bold and page breaks', () => {
  const b = parse('- one\n* two\n**Bold** start\n---page---\nafter');
  assert.deepEqual(b.map((x) => x.type), ['bullet', 'bullet', 'para', 'break', 'para']);
  assert.deepEqual(runs('a **b** c'), [{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }]);
});

test('lines of one paragraph are joined', () => {
  assert.equal(parse('one\ntwo')[0].runs[0].text, 'one two');
});

test('fill replaces known placeholders and leaves a blank for missing ones', () => {
  assert.equal(fill('{{officer}} / {{utr}} / {{conditions}}.', { officer: 'Marcus' }), `Marcus / ${BLANK} / .`);
  assert.equal(fill('{{ nope }}', {}), '{{ nope }}');
});

test('unknown and used placeholders', () => {
  assert.deepEqual(unknownPlaceholders('{{officer}} {{salary}} {{salary}}'), ['salary']);
  assert.deepEqual(usedPlaceholders('{{rate}} {{officer}} {{rate}} {{x}}'), ['rate', 'officer']);
});
