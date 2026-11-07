import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVenueFromText } from '../lib/venuePick.mjs';
import { cleanVenueManager } from '../lib/staffSetup.mjs';
import { venueTiles } from '../modules/dashboard.mjs';
import { actions as ops } from '../modules/ops.mjs';

const VENUES = [{ id: 'a', name: 'The Loft' }, { id: 'b', name: "Bar Nova" }, { id: 'c', name: 'Nova' }];
const base = { first_name: 'Sam', last_name: 'Lee', email: 'sam@x.com', phone: '07700 900123', consent: true };

test('a message is matched to the one venue it names, never guessed', () => {
  assert.equal(pickVenueFromText('Need 2 door staff at the loft on Saturday', VENUES)?.id, 'a');
  assert.equal(pickVenueFromText('2 more for Saturday please', VENUES), null);
  assert.equal(pickVenueFromText('Loft and Bar Nova both need cover', VENUES), null);
  // "Bar Nova" also contains "Nova", so it is ambiguous and we ask
  assert.equal(pickVenueFromText('Bar Nova Friday', VENUES), null);
  assert.equal(pickVenueFromText('THE-LOFT, friday', VENUES)?.id, 'a');
  assert.equal(pickVenueFromText('The Loftiest bar', VENUES), null);
});

test('a venue manager can list several venues; venue_name stays the first', () => {
  const r = cleanVenueManager({ ...base, venue_names: [' The Loft ', 'Bar Nova', 'the loft', ''] });
  assert.deepEqual(r.details.venue_names, ['The Loft', 'Bar Nova']);
  assert.equal(r.details.venue_name, 'The Loft');
  assert.deepEqual(cleanVenueManager({ ...base, venue_name: 'Bar Nova' }).details.venue_names, ['Bar Nova']);
  assert.match(cleanVenueManager({ ...base, venue_names: ['', ' '] }).error, /venue you manage/);
});

test('venue tiles count each venue on its own', () => {
  const rows = [{ venue_id: 'a', state: 'on_shift' }, { venue_id: 'a', state: 'late' }, { venue_id: 'b', state: 'no_show' }, { venue_id: 'b', state: 'on_break' }];
  const t = venueTiles(VENUES.slice(0, 2), rows, { toSign: [{ venue_id: 'b', n: 3 }], incidents: [{ venue_id: 'a', n: 1 }], next: [{ venue_id: 'a', starts_at: '2026-11-08T21:00:00Z' }] });
  assert.deepEqual(t[0], { venue_id: 'a', on_site: 1, late: 1, next_shift: '2026-11-08T21:00:00Z', to_sign: 0, cover: 0, incidents: 1 });
  assert.deepEqual(t[1], { venue_id: 'b', on_site: 1, late: 1, next_shift: null, to_sign: 3, cover: 0, incidents: 0 });
});

test('only venue managers rate staff ad hoc', () => {
  assert.deepEqual(ops['feedback.submitAdhoc'].roles, ['venue']);
});
