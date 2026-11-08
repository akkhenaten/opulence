import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TIER, tierOf } from '../lib/notify.mjs';

test('tiers: severity lifts, an explicit tier wins, unknown kinds wait under the bell', () => {
  assert.equal(tierOf('ops', 'critical'), 'urgent');
  assert.equal(tierOf('feed', 'warning'), 'action');
  assert.equal(tierOf('shift', 'warning', 'urgent'), 'urgent');
  assert.equal(tierOf('contract', 'info', 'fyi'), 'fyi');
  assert.equal(tierOf('no_such_kind'), 'fyi');
  assert.equal(tierOf('reaction'), 'fyi');
  assert.equal(tierOf('shift'), 'action');
});

// Every kind a notice is sent with has a tier, so a new kind can't quietly stop reaching phones
test('every notify kind in the API has a tier', () => {
  const files = ['lib', 'modules'].flatMap((d) => fs.readdirSync(new URL(`../${d}/`, import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => new URL(`../${d}/${f}`, import.meta.url)));
  const kinds = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:notify|notifyManagers|tellOfficer|tell)\((?:(?!\n\s*\}\);)[\s\S]){0,600}?kind: (?:[a-z]+ \? )?'([a-z_]+)'(?: : '([a-z_]+)')?/g)) {
      kinds.add(m[1]);
      if (m[2]) kinds.add(m[2]);
    }
  }
  assert.ok(kinds.size > 20, `found only ${kinds.size} kinds`);
  const missing = [...kinds].filter((k) => !(k in TIER));
  assert.deepEqual(missing, []);
});
