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
