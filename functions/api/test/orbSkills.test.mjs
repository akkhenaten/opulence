import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileFix, reconcileRow } from '../modules/ops.mjs';
import { evidenceAsk } from '../modules/incidentAi.mjs';
import { officerIssues } from '../modules/compliance.mjs';
import { houseRulesBlock, cleanRules, HOUSE_RULES_MAX } from '../lib/houseRules.mjs';
import { CATALOG, needsTap } from '../lib/orbCatalog.mjs';
import { ACTIONS } from '../index.mjs';

const TODAY = '2026-11-08';

test('the hours check fixes to the rota or the clocked hours, whichever the manager picks', () => {
  const fig = { rota_h: 8, clock_h: 9, ts_h: 9, stmt_h: 9, inv_h: 9, min_hours: 0 };
  assert.deepEqual(reconcileFix(fig, 'rota'), { timesheet_hours: 8, statement_hours: 8, invoice_hours: 8 });
  assert.deepEqual(reconcileFix(fig, 'clock'), {});
  // The invoice never drops below the venue's minimum
  assert.deepEqual(reconcileFix({ ...fig, min_hours: 10 }, 'rota'), { timesheet_hours: 8, statement_hours: 8, invoice_hours: 10 });
  // No clocked hours: falls back to Orb's own pick
  const noClock = { rota_h: 6, clock_h: null, ts_h: 7, stmt_h: null, inv_h: null };
  assert.deepEqual(reconcileFix(noClock, 'clock'), reconcileRow(noClock).fix);
  assert.deepEqual(reconcileFix(noClock, 'rota'), { timesheet_hours: 6 });
});

test("the incident evidence card asks the officer for what doesn't match and what's missing", () => {
  assert.equal(evidenceAsk({ mismatches: ['The photo shows two people, the report says one'], missing: ['Time police arrived'] }),
    'Please check: The photo shows two people, the report says one\nPlease add: Time police arrived');
  assert.equal(evidenceAsk({ missing: Array.from({ length: 9 }, (_, i) => `x${i}`) }).split('\n').length, 6);
  assert.equal(evidenceAsk({}), '');
});

const officer = { id: 'o1', first_name: 'Sam', last_name: 'Okafor', roles: ['steward'], status: 'active', rtw_verified: true, rtw_type: 'british_passport', rtw_checked_at: '2026-01-01' };
const ctx = { today: TODAY, roles: { steward: { requires_sia: false } } };

test('a fixed-term contract about to end can be left to end from the card', () => {
  const iss = officerIssues({ ...officer, contract_end: '2026-11-20' }, ctx).find((i) => i.key === 'contract_end');
  const a = iss.actions.find((x) => x.kind === 'let_end');
  assert.ok(a);
  assert.equal(a.company_only, true);
  assert.equal(a.default, false);
});

test('unverified right to work only offers to take them off shifts when they have shifts', () => {
  const iss = officerIssues({ ...officer, rtw_verified: false }, ctx).find((i) => i.key === 'unverified:rtw');
  assert.ok(iss);
  assert.deepEqual(iss.actions.map((a) => a.kind), ['remind']);
});

test("house rules are tidied, capped and fenced off from Orb's own rules", () => {
  assert.equal(houseRulesBlock(''), '');
  assert.equal(houseRulesBlock('   \n '), '');
  assert.equal(cleanRules('a\r\n\n\n\nb'), 'a\n\nb');
  assert.equal(cleanRules('x'.repeat(5000)).length, HOUSE_RULES_MAX);
  const block = houseRulesBlock('Prefer officers who know the venue');
  assert.match(block, /<house_rules>\nPrefer officers who know the venue\n<\/house_rules>$/);
  assert.match(block, /Confirm taps/);
});

test("Orb's new skills exist, and the ones that reach people need a tap", () => {
  for (const name of ['docs.request', 'docs.update', 'compliance.blocked', 'compliance.grace.grant', 'compliance.grace.renew', 'compliance.grace.end', 'ops.complianceRun', 'sia.lookup', 'sia.record', 'ops.offerCover']) {
    assert.ok(CATALOG[name], `${name} in the catalogue`);
    assert.ok(ACTIONS[name], `${name} is a real action`);
  }
  assert.ok(needsTap({ action: 'docs.request', body: { officer_id: 'o1', kind: 'sia' } }));
  assert.ok(needsTap({ action: 'ops.offerCover', body: { shift_id: 's1', officer_ids: ['o1'] } }));
  assert.ok(needsTap({ action: 'ops.decide', body: { id: 'i1', decision: 'approve', edits: { reply: 'Thanks' } } }));
  assert.equal(needsTap({ action: 'ops.decide', body: { id: 'i1', decision: 'reject', then: 'next' } }), null);
});
