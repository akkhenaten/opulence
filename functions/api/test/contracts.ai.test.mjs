import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statedBy } from '../modules/contractsPack.mjs';

test('Contracts AI may only fill typed values the manager wrote', () => {
  const money = { type: 'money' };
  assert.ok(statedBy(money, 13.5, 'Pay her £13.50 an hour'));
  assert.ok(!statedBy(money, 13.5, 'Pay her the usual rate'));
  assert.ok(statedBy({ type: 'number' }, 4, 'make notice 4 weeks'));
  assert.ok(statedBy({ type: 'number' }, 1200, 'a cap of 1,200 hours'));
  const date = { type: 'date' };
  assert.ok(statedBy(date, '2026-12-01', 'she starts on 1st December'));
  assert.ok(statedBy(date, '2026-12-01', 'start date 01/12/2026'));
  assert.ok(statedBy(date, '2026-12-01', 'starting December 1 2026'));
  assert.ok(!statedBy(date, '2026-12-01', 'starts on 1st December 2027'));
  assert.ok(!statedBy(date, '2026-12-01', 'starts next month'));
  assert.ok(statedBy({ type: 'text' }, 'Head Door Supervisor', 'her job title is head door supervisor'));
  assert.ok(!statedBy({ type: 'text' }, 'Head Door Supervisor', 'make her a supervisor'));
  // Picking one of a question's own options is not inventing a value
  assert.ok(statedBy({ type: 'choice' }, 'statutory', 'use the legal minimum notice'));
});
