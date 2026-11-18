// Billing streams: one venue, separate invoices per budget (spec: billing streams)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickVenueRate } from '../lib/timesheetState.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test("rates: a stream's own rate beats the venue-wide one, and another stream's rate is never used", () => {
  const list = [
    { venue_id: 'v', role: 'door', stream_id: null, rate: 20, effective_from: '2026-01-01' },
    { venue_id: 'v', role: 'door', stream_id: null, rate: 21, effective_from: '2026-06-01' },
    { venue_id: 'v', role: 'door', stream_id: 'a', rate: 25, effective_from: '2026-03-01' },
    { venue_id: 'v', role: 'door', stream_id: 'b', rate: 30, effective_from: '2026-03-01' },
  ];
  assert.equal(pickVenueRate(list, { venue_id: 'v', role: 'door', date: '2026-07-01', stream_id: 'a' }).rate, 25);
  assert.equal(pickVenueRate(list, { venue_id: 'v', role: 'door', date: '2026-02-01', stream_id: 'a' }).rate, 20, 'before its own rate starts, the venue-wide rate');
  assert.equal(pickVenueRate(list, { venue_id: 'v', role: 'door', date: '2026-07-01', stream_id: 'c' }).rate, 21);
  assert.equal(pickVenueRate(list, { venue_id: 'v', role: 'door', date: '2026-07-01' }).rate, 21, 'no stream: venue-wide only');
  assert.equal(pickVenueRate(list, { venue_id: 'v', role: 'door', date: '2025-12-01', stream_id: 'b' }), null);
  const money = read('../modules/money.mjs');
  assert.match(money, /\(stream_id IS NULL OR stream_id = \$4\)\s+ORDER BY stream_id IS NULL, effective_from DESC/);
  assert.match(money, /venueRate\(t\.venue_id, t\.role, londonDate\(t\.starts_at\), db, t\.stream_id\)/);
});

test('migration: every venue has one default stream, rows without a stream take it', () => {
  const m = read('../db/migrations/066_billing_streams.sql');
  assert.match(m, /UNIQUE INDEX IF NOT EXISTS venue_streams_default ON venue_streams \(venue_id\) WHERE is_default/);
  assert.match(m, /INSERT INTO venue_streams \(venue_id, name, is_default, checked_at\)\s+SELECT v\.id, v\.name, true, now\(\)/);
  assert.match(m, /UPDATE shifts SET stream_id = venue_default_stream\(venue_id\) WHERE stream_id IS NULL/);
  assert.match(m, /UPDATE invoices SET stream_id = venue_default_stream\(venue_id\) WHERE stream_id IS NULL/);
  assert.match(m, /AFTER INSERT ON venues FOR EACH ROW EXECUTE FUNCTION venue_add_default_stream/);
  for (const t of ['shifts', 'invoices', 'cover_series', 'cover_requests']) assert.match(m, new RegExp(`BEFORE INSERT ON ${t} FOR EACH ROW EXECUTE FUNCTION fill_default_stream`));
  assert.match(m, /ALTER TABLE shifts ALTER COLUMN stream_id SET NOT NULL/);
  assert.match(m, /ALTER TABLE invoices ALTER COLUMN stream_id SET NOT NULL/);
});

test('feed: drafts are per venue and stream, and a line whose shift changed stream moves', () => {
  const f = read('../modules/moneyFeed.mjs');
  assert.match(f, /WHERE venue_id = \$1 AND stream_id = \$3 AND kind = 'invoice'/);
  assert.match(f, /INSERT INTO invoices \(venue_id, stream_id, period_start, period_end, vat_rate\)/);
  assert.match(f, /r\.invoice_stream !== r\.stream_id/);
  assert.match(f, /s\.stream_id/);
});

test('issuing: an unchecked stream is refused; recipients get it; credit notes keep the stream', () => {
  const m = read('../modules/money.mjs');
  assert.match(m, /if \(st && !st\.checked_at\) fail\(400, `Stream not yet checked by Opulence/);
  assert.match(m, /await mailRecipients\(full, contacts\)/);
  assert.match(m, /INSERT INTO invoices \(venue_id, stream_id, kind, credit_of/);
  assert.match(m, /'Stream', 'PO \/ Ref'/);
});

test('shifts: moving stream is refused once invoiced; officers never see the stream', () => {
  const s = read('../modules/streams.mjs');
  assert.match(s, /i\.status <> 'draft'/);
  assert.match(s, /raise a credit note to move it/);
  assert.match(s, /!t\.charge_rate_set && \['approved', 'signed'\]\.includes\(t\.status\)/);
  assert.match(s, /SET \$\{FEED_AGAIN\}/);
  const rota = read('../modules/rota.mjs');
  assert.match(rota, /await assertStreamMovable\(b\.id\)/);
  assert.match(rota, /if \(user\.role === 'officer'\) \{ delete out\.stream_id; delete out\.stream_name; \}/);
  const ts = read('../modules/timesheets.mjs');
  assert.match(ts, /user\.role === 'officer' \? out\.map\(\(\{ stream_id: _s, stream_name: _n/);
});

test('streams: a role goes to the stream that claims it, else the default; venue users cannot set roles', () => {
  const s = read('../modules/streams.mjs');
  assert.match(s, /ORDER BY \(\$2::text = ANY\(roles\)\) DESC, is_default DESC/);
  assert.match(s, /user\.role === 'company' \? COMPANY_FIELDS : VENUE_FIELDS/);
  assert.doesNotMatch(s.match(/const VENUE_FIELDS = \[[^\]]+\]/)[0], /roles/);
  assert.match(s, /checked_at: checked \? new Date\(\) : null/);
  assert.match(s, /'streams\.check': def\(CO/);
  assert.match(read('../index.mjs'), /staffSetup, streams, todo, [^\]]*exportsCsv\]/);
});
