// Findings group by the document they are about, and one scan can't be both verified and sent for a re-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionDoc, decideCompliance, docOf, officerIssues } from '../modules/compliance.mjs';

const today = '2026-11-08';
const roles = { door: { name: 'Door Supervisor', requires_sia: true } };
const D = '6f1c2e9a-1b2c-4d5e-8f90-123456789abc';

test('each finding names its document; person-level items have none', () => {
  const docs = [{ id: D, kind: 'sia' }];
  assert.equal(docOf(`doc_mismatch:${D}:expiry`, docs), 'sia');
  assert.equal(docOf(`unverified:${D}`, docs), 'sia');
  assert.equal(docOf('expiry_shift:sia'), 'sia');
  assert.equal(docOf('register:sia'), 'sia');
  assert.equal(docOf('licence_role:door'), 'sia');
  assert.equal(docOf('unverified:rtw'), 'rtw');
  assert.equal(docOf('rtw:code_old'), 'rtw');
  assert.equal(docOf('missing:first_aid'), 'first_aid');
  for (const k of ['onboarding', 'contract_end', 'grace_expired', 'training:c1', 'venue_pack:v1']) assert.equal(docOf(k), null, k);
});

test('officerIssues tags SIA findings with their document', () => {
  const o = { id: 'o1', status: 'active', roles: ['door'], first_name: 'Sam', sia_type: 'Door Supervisor', sia_number: '', sia_expiry: null };
  const issues = officerIssues(o, { today, roles, docs: [] });
  const sia = issues.find((i) => i.key === 'missing:sia');
  assert.equal(sia.doc, 'sia');
});

test('a correction belongs to the scan its finding read', () => {
  assert.equal(actionDoc({ kind: 'correct', params: { field: 'sia_expiry' }, issue: { key: `doc_mismatch:${D}:expiry` } }), D);
  assert.equal(actionDoc({ kind: 'recheck', params: { doc_id: D } }), D);
  assert.equal(actionDoc({ kind: 'remind', params: {} }), null);
});

test('the server refuses verified plus re-check on the same scan, in plain words', async () => {
  const it = { officer_id: 'o1', payload: { issues: [{ key: `doc_name_unread:${D}`, actions: [
    { id: 'a|verify_doc', kind: 'verify_doc', params: { doc_id: D } },
    { id: 'a|recheck', kind: 'recheck', params: { doc_id: D } },
  ] }] } };
  await assert.rejects(decideCompliance(it, { edits: { actions: ['a|verify_doc', 'a|recheck'] } }, { role: 'company' }),
    (e) => e.status === 400 && /verified or sent for a re-check, not both/.test(e.message));
});

test('the server refuses verified plus a correction from the same scan', async () => {
  const it = { officer_id: 'o1', payload: { issues: [
    { key: `doc_mismatch:${D}:number`, actions: [{ id: 'b|correct', kind: 'correct', params: { field: 'sia_number' } }] },
    { key: `doc_number_unread:${D}`, actions: [{ id: 'c|verify_doc', kind: 'verify_doc', params: { doc_id: D } }] },
  ] } };
  await assert.rejects(decideCompliance(it, { edits: { actions: ['b|correct', 'c|verify_doc'] } }, { role: 'company' }), (e) => e.status === 400);
});
