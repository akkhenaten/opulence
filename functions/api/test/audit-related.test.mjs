// A record's History can include its parts: an officer's documents and contracts, a shift's assignments and timesheets
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actions, auditWhere, RELATED } from '../modules/users.mjs';

const ID = '6f1c2e9a-1b2c-4d5e-8f90-123456789abc';

test('without related, only the record itself', () => {
  const w = auditWhere({ entity: 'officer', entity_id: ID });
  assert.doesNotMatch(w, /documents/);
});

test("an officer's history takes in their documents, contracts, statements and HR notes", () => {
  const w = auditWhere({ entity: 'officer', entity_id: ID, related: true });
  for (const e of ['document', 'contract', 'statement', 'hr_note']) assert.match(w, new RegExp(`a.entity = '${e}'`));
});

test("a shift's history takes in its assignments and timesheets", () => {
  const w = auditWhere({ entity: 'shift', entity_id: ID, related: true });
  assert.match(w, /'assignment'/);
  assert.match(w, /'timesheet'/);
});

test('related is ignored for records without parts or ids that are not record ids', () => {
  assert.doesNotMatch(auditWhere({ entity: 'invoice', entity_id: ID, related: true }), / OR \(a\.entity/);
  assert.doesNotMatch(auditWhere({ entity: 'officer', entity_id: "x' OR 1=1 --", related: true }), /documents/);
});

test('related lookups only use the id parameter, never text from the request', () => {
  for (const parts of Object.values(RELATED)) for (const [, sql] of parts) assert.match(sql, /\$2::uuid/);
});

test('history stays with company managers', () => {
  assert.deepEqual(actions['audit.list'].roles, ['company']);
  assert.deepEqual(actions['audit.count'].roles, ['company']);
});
