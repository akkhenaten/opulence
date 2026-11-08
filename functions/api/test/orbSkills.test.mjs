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

test('Orb finds the right security guidance, Scotland first', async () => {
  const { searchKnowledge, TOPICS } = await import('../lib/securityKnowledge.mjs');
  assert.equal(searchKnowledge('can a door supervisor arrest someone')[0].topic, 'Use of force, ejections and arrest');
  assert.equal(searchKnowledge('what ID is accepted for Challenge 25')[0].topic, 'Licensed premises in Scotland');
  assert.equal(searchKnowledge('share code expired')[0].topic, 'Right to work checks');
  assert.equal(searchKnowledge('drugs found in a bag search')[0].topic, 'Searching, drugs and weapons');
  assert.deepEqual(searchKnowledge('zz qq'), []);
  assert.ok(TOPICS.every((t) => t.body.length < 3000));
});

test('compliance advice gets SIA and right to work guidance only for those issues', async () => {
  const { adviceGuidance } = await import('../modules/compliance.mjs');
  assert.match(adviceGuidance([{ key: 'sia_expired' }]), /SIA licences/);
  assert.doesNotMatch(adviceGuidance([{ key: 'sia_expired' }]), /Right to work checks/);
  assert.match(adviceGuidance([{ key: 'unverified:rtw' }]), /Right to work checks/);
  assert.equal(adviceGuidance([{ key: 'contract_end' }]), '');
});

test("Opulence's starting house rules fit in the box", async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync(new URL('../db/migrations/059_opulence_house_rules.sql', import.meta.url), 'utf8');
  const text = sql.split('$rules$')[1];
  assert.ok(text.length <= HOUSE_RULES_MAX);
  assert.equal(cleanRules(text), text.trim());
});

test('the Orb settings section of the guide is for company managers only', async () => {
  const { guideFor } = await import('../lib/guide.mjs');
  const ids = (role) => guideFor(role, 'X').flatMap((c) => c.sections.map((s) => s.id));
  assert.ok(ids('company').includes('orb-settings'));
  assert.ok(!ids('security').includes('orb-settings'));
  assert.ok(ids('security').includes('knowledge'));
});
