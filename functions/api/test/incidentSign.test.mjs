import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStage, signerRole, fingerprintOf, venueReminderDue, managerReminderDue } from '../lib/incidentSign.mjs';
import { renderIncident } from '../lib/incidentDoc.mjs';
import { cleanDraft } from '../lib/incidentDrafts.mjs';

const at = (stage) => ({ sign_stage: stage });

test('each role signs in turn: officer, manager, venue', () => {
  assert.deepEqual(nextStage(at('officer'), 'sign', 'officer'), { sign_stage: 'manager', status: 'submitted' });
  assert.deepEqual(nextStage(at('manager'), 'sign', 'company'), { sign_stage: 'venue', status: 'closed' });
  assert.deepEqual(nextStage(at('manager'), 'sign', 'security'), { sign_stage: 'venue', status: 'closed' });
  assert.deepEqual(nextStage(at('venue'), 'sign', 'venue'), { sign_stage: 'complete', status: 'closed' });
});

test('a manager can send back or edit before signing; nobody can sign out of turn', () => {
  assert.equal(nextStage(at('manager'), 'send_back', 'company').status, 'changes_requested');
  assert.equal(nextStage(at('manager'), 'edit', 'security').resign_reason, 'edited');
  const no = (inc, action, role) => assert.throws(() => nextStage(inc, action, role), (e) => e.status === 400);
  no(at('manager'), 'sign', 'officer');
  no(at('manager'), 'sign', 'venue');
  no(at('venue'), 'sign', 'company');
  no(at('officer'), 'sign', 'company');
  no(at('complete'), 'sign', 'venue');
  no(at('venue'), 'send_back', 'company');
  no(at('manager'), 'send_back', 'officer');
  no({ sign_stage: null }, 'sign', 'officer');
  assert.equal(signerRole('venue'), 'venue');
  assert.equal(signerRole('admin'), null);
});

test('the fingerprint changes with the wording and the signers', () => {
  const inc = { ref: 'INC-1', reference: 'ORB-I-1', description: 'A man refused entry', attachments: [{ s3_key: 'a.jpg', caption: 'Door' }] };
  const sig = [{ role: 'officer', name: 'Sam', at: '2026-11-08T01:00:00Z', png: 'x' }];
  const base = fingerprintOf(inc, sig);
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(fingerprintOf({ ...inc }, sig), base);
  assert.notEqual(fingerprintOf({ ...inc, description: 'A man was refused entry' }, sig), base);
  assert.notEqual(fingerprintOf({ ...inc, attachments: [{ s3_key: 'a.jpg', caption: 'Front door' }] }, sig), base);
  assert.notEqual(fingerprintOf(inc, []), base);
  assert.equal(fingerprintOf(inc, [...sig, { ...sig[0], role: 'manager', void_at: '2026-11-08T02:00:00Z' }]), base);
});

test('the venue is reminded the next morning, then every two days', () => {
  const inc = { sign_stage: 'venue', stage_at: '2026-11-07T22:00:00Z' };
  assert.equal(venueReminderDue(inc, new Date('2026-11-07T23:00:00Z')), false); // same evening
  assert.equal(venueReminderDue(inc, new Date('2026-11-08T08:30:00Z')), false); // before 09:00
  assert.equal(venueReminderDue(inc, new Date('2026-11-08T09:05:00Z')), true);
  const reminded = { ...inc, venue_reminded_at: '2026-11-08T09:05:00Z' };
  assert.equal(venueReminderDue(reminded, new Date('2026-11-09T09:05:00Z')), false);
  assert.equal(venueReminderDue(reminded, new Date('2026-11-10T09:05:00Z')), true);
  assert.equal(venueReminderDue({ ...inc, sign_stage: 'complete' }, new Date('2026-11-09T10:00:00Z')), false);
});

test('managers are nudged once after a day', () => {
  const inc = { sign_stage: 'manager', stage_at: '2026-11-07T01:00:00Z' };
  assert.equal(managerReminderDue(inc, new Date('2026-11-07T20:00:00Z')), false);
  assert.equal(managerReminderDue(inc, new Date('2026-11-08T01:30:00Z')), true);
  assert.equal(managerReminderDue({ ...inc, manager_reminded: true }, new Date('2026-11-08T01:30:00Z')), false);
});

test('a draft keeps the writing page, within size', () => {
  const d = cleanDraft({ title: 't'.repeat(300), body: [{ id: 'a', kind: 'text', text: 'hi' }], orb: { sections: { what: 'x' } }, captions: { k: { caption: 'c' } } });
  assert.equal(d.title.length, 200);
  assert.equal(d.body.length, 1);
  assert.equal(d.orb.sections.what, 'x');
  assert.equal(cleanDraft({ body: [{ text: 'x'.repeat(130000) }] }).body, undefined);
});

// A 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('the report renders with three signatures and a certificate', async () => {
  const inc = {
    ref: 'INC-7', reference: 'ORB-I-7', version: 2, title: 'Refused entry at main door', venue_name: 'The Lanes', type: 'refused_entry', severity: 'low',
    location: 'Main door', occurred_at: '2026-11-08T00:30:00Z', created_at: '2026-11-08T01:00:00Z', officer_name: 'Sam Officer',
    description: 'A man was refused entry.', people_involved: 'One man, dark jacket.', injuries: 'None reported', actions_taken: 'Refused entry.',
    witnesses: [{ name: 'Ann', contact: '0700', statement: 'Saw it' }], sign_stage: 'complete', manager_statement: 'Agreed.', venue_comment: 'Read.',
    attachments: [{ id: '1', s3_key: 'p.png', mime: 'image/png', caption: 'The door', section: 'what' }, { id: '2', s3_key: 'f.pdf', mime: 'application/pdf', name: 'note.pdf' }],
  };
  const signatures = ['officer', 'manager', 'venue'].map((role, i) => ({ role, name: `Signer ${i}`, at: '2026-11-08T02:00:00Z', png: PNG, ip: '1.2.3.4', ua: 'Mozilla/5.0 (iPhone)' }));
  const loadBytes = async () => Buffer.from(PNG.split(',')[1], 'base64');
  const { bytes, fingerprint } = await renderIncident(inc, { company: { company_name: 'Opulence Security' }, signatures, status: 'signed', verifyUrl: 'https://example.com/verify/ORB-I-7', role: 'venue', loadBytes });
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), '%PDF');
  assert.equal(fingerprint, fingerprintOf(inc, signatures));
});

test('a manager can keep editing while the report is back with the officer', () => {
  assert.deepEqual(nextStage({ sign_stage: 'officer', status: 'changes_requested' }, 'edit', 'company'), { sign_stage: 'officer', status: 'changes_requested', resign_reason: 'edited' });
  assert.deepEqual(nextStage({ sign_stage: 'officer', status: 'submitted' }, 'edit', 'security'), { sign_stage: 'officer', status: 'submitted', resign_reason: 'edited' });
  for (const [stage, role] of [['officer', 'officer'], ['manager', 'officer'], ['officer', 'venue'], ['manager', 'venue'], ['venue', 'company']]) {
    assert.throws(() => nextStage({ sign_stage: stage }, 'edit', role), (e) => e.status === 400);
  }
  assert.throws(() => nextStage({ sign_stage: 'officer' }, 'send_back', 'company'), (e) => e.status === 400);
});
