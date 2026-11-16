# Plan: Billing streams (one venue, separate invoices per budget)

Spec: `spec/spec-billing-streams-one-venue-separate-invoices-per-budget.md`

## Context
Today the live feed (`functions/api/modules/moneyFeed.mjs`) gives each venue one draft invoice per period. Some venues, starting with New Eidyn (Concierge desk vs Site management for contractors), pay from separate budgets. They need one invoice per budget, each with its own PO, recipients, bill-to and rates. Streams sit between the venue and the invoice. Every venue gets a default stream, so a venue that never adds a second one behaves exactly as it does today.

## 1. Data: `functions/api/db/migrations/066_billing_streams.sql` (idempotent)
- `venue_streams`: `id, venue_id → venues ON DELETE CASCADE, name, po_ref, recipients text[] DEFAULT '{}', bill_to_name, bill_to_address, roles text[] DEFAULT '{}', is_default bool, status ('active'|'archived'), checked_at timestamptz, checked_by, created_by, created_at`.
  - Indexes: `UNIQUE (venue_id, lower(name))`, and a partial `UNIQUE (venue_id) WHERE is_default`.
- Backfill: one default stream per venue (named after the venue, `checked_at = now()`). An `AFTER INSERT` trigger on `venues` creates one for each new venue.
- `shifts.stream_id`, `cover_series.stream_id`, `cover_requests.stream_id`, `invoices.stream_id`, all `→ venue_streams`. Backfill each with its venue's default.
  - `ALTER … SET NOT NULL` on shifts and invoices after the backfill.
  - A `BEFORE INSERT` trigger on `shifts` and `invoices` fills a missing `stream_id` with the venue default. Old code paths and `copyWeek` stay safe.
  - Index `invoices (venue_id, stream_id, status)`.
- `venue_rates.stream_id` (nullable; NULL means the venue-wide rate). The unique-per-date lookup includes `stream_id`.

## 2. Backend
**`functions/api/modules/streams.mjs`** (new; registered where the other modules are). Actions:
- `streams.list {venue_id}`: company, security and venue roles; scoped with `assertVenue`. For venue users, rates and pay details are left out.
- `streams.save`:
  - Company: every field.
  - Venue manager: name, PO, recipients and bill-to only, never rates or roles. A stream they create gets `checked_at = NULL`. Validates email addresses and that names are unique.
- `streams.check`: company only; sets `checked_at` and `checked_by`.
- `streams.setDefault`, `streams.archive` / `unarchive`: the default stream can't be archived.
- `defaultStreamFor(venueId, role, db)` helper: an active stream that claims the role, otherwise the default. Every action writes to the audit log.

**Rates** (`money.mjs`, `timesheets.mjs`, `lib/timesheetState.mjs`, `venues.mjs`, `ops.mjs:309`):
- `venueRate(venueId, role, date, db, streamId)` looks only at rows where `stream_id IS NULL OR stream_id = $streamId`, and sorts the stream's own row first, then by `effective_from DESC`.
- Pass the stream through:
  - `chargeFor` and `ratesFor` get `t.stream_id`, which the feed's `ROW_SQL` and the timesheets `BASE_SQL` now select from `s.stream_id`.
  - `pickVenueRate` gets the same rule in memory.
- `currentVenueRates`, `venues.rates` and `rateGaps`: rate gaps treat a venue-wide row as covering every stream.
- `venues.saveRate`: accepts `stream_id`, which must belong to the venue. `venues.rates` returns `stream_id` and the stream name.

**Feed** (`moneyFeed.mjs`):
- `ROW_SQL` adds `s.stream_id` and `i.stream_id AS invoice_stream`.
- The "line belongs elsewhere" test becomes `invoice_venue !== venue_id || invoice_stream !== stream_id`.
- `draftInvoice` filters by `venue_id AND stream_id`, and inserts with `stream_id`.
- `pickTarget` / `moneyFeedRules.mjs` don't change; they already work on the list they are given.

**Shifts / cover**:
- `rota.mjs`:
  - `shifts.save` and `bulkCreate` accept `stream_id`, which must be an active stream of the venue. Without one, they use `defaultStreamFor`. A change of venue resets the stream to the new venue's default.
  - On a stream change: refuse if any timesheet on the shift passes `timesheet_billed`, with the message "Invoiced on INV-… — raise a credit note to move it". Otherwise:
    - re-price the unbilled timesheets where `charge_rate_set = false` and the status is approved or signed, via `venueRate(…, newStream)`;
    - mark all of them with `FEED_AGAIN`;
    - call `syncRecent()`;
    - write `shift.stream` to the audit log.
  - `copyWeek` copies `stream_id`. `shiftsWithAssignments` returns `stream_id` and `stream_name` to company, security and venue roles, never to officers.
- `cover.mjs`:
  - `cleanSeries` and `cover.create` take `stream_id`. It is required when the venue has more than one active stream; otherwise it falls back to `defaultStreamFor`.
  - `cover.create` also accepts an inline `new_stream {name, po_ref, recipient}`. In the same transaction it creates the stream (unchecked when a venue user creates it) and uses it.
  - `materialise` copies the stream onto `cover_requests`; `createShift` copies it onto the shift. `cover.update` can change the stream of pending dates. `cover.list` returns `stream_name`.

**Invoices** (`money.mjs`):
- `loadInvoice` joins `venue_streams`. It returns `stream_name, po_ref, recipients, bill_to_name, bill_to_address, stream_checked`, plus `venue_stream_count`.
- `buildInvoicePdf`:
  - Bill to: `bill_to_name || client_name || venue_name`. Address: `bill_to_address || billing_address || venue address`.
  - Meta rows: "Venue" shows `Venue · Stream` when the venue has more than one stream, and a "PO / Ref" row appears when one is set.
  - `invoiceFilename` adds the stream name when the venue has more than one.
- `issueInvoice`:
  - Refuse with "Stream not yet checked by Opulence" when `checked_at` is NULL.
  - The notify body includes the stream.
  - Then email each stream recipient once through the project email-send API (as `lib/notify.mjs` already does for email). Skip any address that belongs to a venue contact.
- `invoices.credit`: copies `stream_id`. Its email goes to the same recipients.
- `invoices.list`: adds `stream_id, stream_name, stream_checked` and a `b.stream_id` filter. It also returns `streams_in_use` (true when any venue has more than one active stream), which the UI uses to show the column.
- `invoices.generate`: accepts a `stream_id` filter.
- `invoices.exportCsv`: adds Stream and PO columns.
- `reports.margin`: unchanged (per venue).

**Needs you**:
- `dashboard.mjs` company counts: `streamsToCheck` = active streams with `checked_at IS NULL`.
- `streams.save` notifies company managers when a venue user creates a stream: "New Eidyn added a billing stream 'X' — check PO, recipient and rates", linking to the venue's Billing streams section.

## 3. Frontend (`app/src`)
- `pages/money/VenueDetail.jsx`: a new "Billing streams" setup section (company and venue managers) next to Charge rates.
  - Each stream's card shows its name, default badge, PO, recipients, bill-to, roles it claims (company only), an "Unchecked — check" button (company), and archive / make default.
  - Add/edit happens in a sheet, following the section patterns already in this file.
- `RatesTab`: a stream selector above the rates ("Venue-wide" plus each stream). It shows only when the venue has more than one stream, and saves `stream_id`.
- `pages/manager/_cover.jsx` (request form): a "Bill to stream" select appears when the venue has more than one active stream. Its "+ New stream" option opens inline fields (name, PO, recipient email). The pending and accepted lists show a stream chip.
- `pages/manager/Rota.jsx`:
  - The shift editor gets a stream select when the venue has more than one stream. It defaults by role on create and shows the server's refusal message on invoiced shifts.
  - A small stream chip on shift cells and cards at venues with more than one stream.
- Timesheets table: a stream chip beside the venue name (from `BASE_SQL`).
- `pages/money/Invoices.jsx`: when `streams_in_use`, a Stream column, a stream filter, and draft rows titled "Venue · Stream" with an amber "Stream not yet checked" chip.
- `pages/money/InvoiceDetail.jsx`:
  - The header shows the stream and PO, and bill-to uses the stream's details.
  - Issue is disabled with an explanation while the stream is unchecked.
  - The notes placeholder now points to the PO field on the stream.
- `pages/manager/Dashboard.jsx` NEEDS: `{ key: 'streamsToCheck', to: '/venues', icon: Wallet, tone: 'amber', one: 'new billing stream to check', many: 'new billing streams to check', company: true }`.
- `pages/people/_whatsnew.jsx`: card "One venue, separate invoices per budget", with a picture made by `openkbs image` into `site/` (memory rule: every release gets its own card and its own picture).
- Officer screens: no change, and no stream data reaches them.

## 4. Tests (`functions/api/test/billingStreams.test.mjs`, same style as `moneyFeed.test.mjs`)
- `pickVenueRate` prefers the stream row, then the venue-wide row, and never uses another stream's row.
- Migration text: backfill, NOT NULL, default-stream triggers, partial unique default.
- Source checks:
  - the feed filters drafts by stream and moves lines whose stream changed;
  - issuing refuses unchecked streams;
  - stream changes on billed shifts are refused;
  - officer shift queries never select stream columns.
- `defaultStreamFor` picks by role.
- Run `npm test` in `functions/api`, plus the existing `moneyFeed`, `timesheets` and `streamline` tests.

## 5. Deploy & verify
1. `cd functions/api && npm test`; `cd app && npm run build`. The build output goes into `site/`, as in recent build commits.
2. Commit (`feat: billing streams …`), then `openkbs fn deploy api` (migrations run on boot). Commit the build and run `openkbs site deploy`.
3. Live check with agent-browser, then `agent-browser close --all`:
   - As company: on New Eidyn, add the streams "Concierge desk" (claims the Concierge role, PO-CON-1, a recipient) and "Site management – contractors".
   - As the venue manager: request staff against "Site management", and add a third stream inline. Confirm the Needs you card appears.
   - Accept the request, create a Concierge shift in the rota, approve and sign timesheets (or use existing demo ones). Confirm there are two drafts with the right PO, bill-to and PDF.
   - Move a shift between streams and confirm its line moves. Issue one draft and confirm the other stays a draft, and that an unchecked stream refuses to issue.
   - Check that a venue with one stream looks unchanged.
4. Move the spec card to Done with a business-language comment.
