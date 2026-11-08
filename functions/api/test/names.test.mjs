import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayName, officerDisplay, officerName, userName } from '../lib/names.mjs';

test('officerName and userName prefer goes_by in SQL', () => {
  assert.equal(officerName('o'), "COALESCE(NULLIF(btrim(o.goes_by), ''), o.first_name || ' ' || o.last_name)");
  assert.equal(officerName(''), "COALESCE(NULLIF(btrim(goes_by), ''), first_name || ' ' || last_name)");
  assert.equal(userName('cu'), "COALESCE(NULLIF(btrim(cu.goes_by), ''), cu.name)");
});

test('displayName and officerDisplay use goes_by, else the full name', () => {
  assert.equal(officerDisplay({ goes_by: 'Kris', first_name: 'Krzysztof', last_name: 'Nowak' }), 'Kris');
  assert.equal(officerDisplay({ goes_by: '  ', first_name: 'Krzysztof', last_name: 'Nowak' }), 'Krzysztof Nowak');
  assert.equal(officerDisplay({ first_name: 'Ann', last_name: 'Lee' }), 'Ann Lee');
  assert.equal(displayName({ goes_by: '', name: 'Ann Lee' }), 'Ann Lee');
  assert.equal(displayName({ goes_by: 'Annie', name: 'Ann Lee' }), 'Annie');
  assert.equal(displayName(null), '');
});

test('nameMatches ignores capitals, accents, punctuation, spacing and middle names', async () => {
  const { nameMatches } = await import('../lib/names.mjs');
  const yes = [
    ['JOHN SCOTT', 'John', 'Scott'], ['john scott', 'John', 'SCOTT'], ['JOSE GARCIA', 'José', 'García'],
    ['SEAN OBRIEN', 'Seán', "O'Brien"], ['AMY MCDONALD', 'Amy', 'Mc Donald'], ['AMY MC DONALD', 'Amy', 'McDonald'],
    ['ANN SMITH JONES', 'Ann', 'Smith-Jones'], ['ONYEKA CHIDI GODDEY', 'Onyeka', 'Goddey'], ['GODDEY ONYEKA', 'Onyeka', 'Goddey'],
    ['JOHN SCOTT', '', 'Scott'], ['', 'John', 'Scott'], ['JOHN SCOTT', '', ''], ['MARY-JANE SCOTT', 'Mary Jane', 'Scott'],
  ];
  for (const [p, f, l] of yes) assert.ok(nameMatches(p, f, l), `${p} vs ${f} ${l}`);
  assert.ok(!nameMatches('SAMUEL OKAFOR', 'Sam', 'Okafor'));
  assert.ok(!nameMatches('JOHN SMITH', 'John', 'Scott'));
  assert.ok(!nameMatches('KATHLEEN BROWN', 'Kathleen', 'Lee'));
});

test('nameFit accepts an initial with the surname, never a different initial', async () => {
  const { nameFit } = await import('../lib/names.mjs');
  assert.equal(nameFit('SCOTT SCANLON', 'Scott', 'Scanlon'), 'full');
  assert.equal(nameFit('S SCANLON', 'Scott', 'Scanlon'), 'initial');
  assert.equal(nameFit('S. J. SCANLON', 'Scott', 'Scanlon'), 'initial');
  assert.equal(nameFit('SCANLON S', 'Scott', 'Scanlon'), 'initial');
  assert.equal(nameFit('SAMUEL OKAFOR', 'Sam', 'Okafor'), 'initial');
  assert.equal(nameFit('J SCANLON', 'Scott', 'Scanlon'), 'no');
  assert.equal(nameFit('SCANLON', 'Scott', 'Scanlon'), 'no');
  assert.equal(nameFit('S SMITH', 'Scott', 'Scanlon'), 'no');
  assert.equal(nameFit('STEVEN SCANLON', 'Scott', 'Scanlon'), 'no');
});
