# Plan: Venue packs — AI-written instructions and procedures, sign before first shift, register per venue

## Context
Approved spec: `spec/spec-venue-packs-ai-written-assignment-instructions-and-proc.md`.

Today a venue has a free-text `venues.instructions` field, and nothing proves an officer has read it. We will build:
- versioned instructions and procedures, drafted by AI and published by a manager;
- a signed venue pack that is required before clock-in;
- a register per venue that managers and the client login can see.

Wherever possible we reuse what is already in the app: contract/policy e-signing (SignFlow, the `seal` step that makes the sealed PDF, `sign_events`), document markup, notifications, compliance, jobs and AI helpers.

## Data model — `functions/api/db/migrations/023_venue_packs.sql`
- **`procedures`**
  - Columns: `id`, `company scope as existing tables`, `kind` ('instructions'|'procedure'), `scope` ('general'|'venue'), `venue_id` (null for general), `title`, `status` ('draft'|'published'|'archived'), `applies_all` bool (general only), `current_version` int, `draft_body` text, `ai_drafted` bool, `created_by`, timestamps.
  - Each venue has at most one `instructions` doc (partial unique index on venue_id where kind='instructions').
- **`procedure_versions`**: `procedure_id`, `version`, `title`, `body` (docmarkup), `requires_resign` bool, `published_by`, `published_at`. Unique on (procedure_id, version). Rows are never deleted.
- **`procedure_venues`**: `procedure_id`, `venue_id`, `excluded` bool, `position` int.
  - For a general procedure, this row either adds it to a venue (chosen venues) or switches it off (`excluded` = true) when it applies to all venues.
  - It also stores the order within that venue's pack. Venue-specific docs use the same table for ordering.
- **`pack_signings`**: `id`, `officer_id`, `venue_id`, `items` jsonb `[{procedure_id, version, title, read_at}]`, `signature_png`, `signed_name`, `ip`, `ua`, `reference`, `fingerprint`, `pdf_sha256`, `pdf_document_id`, `sealed_at`, `signed_at`. Index on (officer_id, venue_id, signed_at desc).
- **`pack_reads`**: `officer_id`, `procedure_id`, `version`, `read_at`, PK (officer, procedure, version). Saves reading progress so an officer can stop and carry on later.
- **`procedure_suggestions`**: `procedure_id`, `venue_id`, `section` text, `body`, `author_id`, `status` ('open'|'accepted'|'dismissed'), `reply`, `resolved_by/at`.
- **`pack_reminders`**: (assignment_id, kind 'booked'|'day'|'2h') unique. Makes sure each reminder is only sent once.
- **Changes to existing tables:**
  - `ALTER sign_events` doc_type CHECK to add `'venue_pack'`.
  - Seed `settings.ai_module_caps.venue_packs`, like 020_orb_voice_cap.sql.
  - Data migration: one `instructions` draft per venue that has non-empty `venues.instructions`. The old text is copied in, with lines prefixed as paragraphs. The `venues.instructions` column is kept, and stays as the short note shown on the shift page.

## Pure logic — `functions/api/lib/venuePack.mjs` (+ `test/venuePack.test.mjs`)
- **`packStatus({ pack, lastSigning, lastShiftAt, now })`** returns `{ status: 'none'|'current'|'resign'|'refresher'|'unsigned', toRead: [procedure ids] }`.
  - `pack` is a list of `[{procedure_id, version, resign_versions:[...]}]`.
  - Rules:
    - No pack published → `none`.
    - Never signed → `unsigned`.
    - A document missing from the signing, or a later version with `requires_resign` since the signed version → `resign`. `toRead` lists only those documents.
    - The last shift at the venue ended more than 183 days ago (and no signing since) → `refresher`. Everything must be read again.
- **`resolvePack(venueId)`** (DB helper in the same lib or the module): finds the published instructions, plus the general docs (applies_all and not excluded, or explicitly added), plus the venue-specific docs, in `position` order with the instructions first.
- **Unit tests** cover: minor fix keeps current, real change gives resign, a new doc gives resign, a 6-month gap gives refresher, and an archived doc is dropped without forcing a re-sign.

## API — new `functions/api/modules/venuePacks.mjs` (registered with the other modules)
Roles use `def()` from `_def.mjs`, MGR/CO as for contracts. The venue role is checked with `assertVenue` from `lib/scope.mjs`.

- **Library and editing:**
  - `procedures.list` (filter: scope, venue, status), `procedures.get` (with versions), `procedures.save` (title, draft_body, scope, applies_all, venue list).
  - `procedures.publish { id, requires_resign }`: writes a version row, sets status to published, and calls `notifyResign` when `requires_resign`.
  - `procedures.archive`, `procedures.version` (returns an old body as it was signed).
- **Venue packs:**
  - `venuePacks.get { venue_id }`: the resolved pack, drafts, status line counts and open suggestions.
  - `venuePacks.order { venue_id, ids[] }`.
  - `venuePacks.toggle { venue_id, procedure_id, included }`.
- **AI:**
  - `venuePacks.ai.questions { venue_id }`: the questionnaire. It is a fixed core list, plus up to 4 extra questions from Haiku based on the venue type.
  - `venuePacks.ai.draft { venue_id?, procedure_id?, answers, document_ids[], topic? }`:
    - Uses `claude` from `lib/ai.mjs` with SONNET and a tool schema `{instructions_body, procedures:[{title, body, general_match?}]}`.
    - Inputs: venue row, client, roles and shift times from recent shifts, notes, incidents from the last 12 months (summaries only, no names), the selected venue documents through `fileBlock` (only where `canRead`), the answers, and a UK good-practice system prompt.
    - The output is written in docmarkup. Gaps are marked "[To confirm]". The prompt bans inventing codes, numbers or contacts.
    - Saved as drafts with `ai_drafted` = true. Uses `checkCap('venue_packs')` and logs usage.
  - `venuePacks.ai.edit { procedure_id, instruction }`: rewrites the draft, following the contracts workspace chat pattern.
- **Officer:**
  - `venuePacks.mine { venue_id }`: the pack, `packStatus`, `toRead`, and the reads so far.
  - `venuePacks.read { venue_id, procedure_id, version }`: upserts `pack_reads`.
  - `venuePacks.sign { venue_id, signed_name, signature }`:
    - Validates the PNG like `contracts.sign` in hr.mjs.
    - Requires every doc in `toRead` to have a read row for its current version; the docs that were already read and signed carry over their earlier `read_at`.
    - Inserts `pack_signings`, generates a reference with `nextReference`, adds an `event('venue_pack', …)`, seals the PDF and notifies managers.
- **Register:**
  - `venuePacks.register { venue_id, filter, q }`: officers who have signed or who are booked from today onward, with their status and signing history.
  - `venuePacks.officer { officer_id }`: for the profile list.
  - `venuePacks.export { venue_id, format:'pdf'|'csv' }`: the PDF uses the existing pdf lib, as the compliance and register exports do.
  - `venuePacks.pdf { signing_id }`: the signed PDF.
  - All of these are available to MGR and to the venue role (own venues only).
- **Suggestions:**
  - `venuePacks.suggest` (venue role and managers): notifies `managersFor(venue)`.
  - `venuePacks.resolveSuggestion { id, status, reply }`.

**Sealing the PDF** (`lib/esign.mjs`):
- Add `venue_pack` to `TABLE` (→ `pack_signings`) and `ARCHIVE_KIND`.
- Add `packInput(signing)` to build the `renderSigned` input:
  - kind 'venue_pack', typeLabel 'Venue pack';
  - blocks from `parse()` for each version body, joined with `---page---` and a heading per document;
  - ackLine "I have read and understood the assignment instructions and procedures for {venue} and agree to follow them.";
  - a table of the read times.
- `seal` already archives the PDF to the officer's documents.

## Integrations (existing files)
- **`modules/clock.mjs` / `clockProof.mjs`:**
  - In `clock.punch`, for an `in` punch only, compute `packStatus`. If it is not `none`/`current`, fail with `fail(423, 'Venue pack not signed', { code: 'venue_pack', venue_id })`. There is no override parameter.
  - Out and break punches are never blocked, so a pack changed mid-shift doesn't interrupt the shift.
  - `clock.status` returns `pack: {status, toRead}`.
- **`modules/rota.mjs`:**
  - `checkOfficerForShift` adds a non-blocking warning, "Venue pack not signed".
  - Shift/assignment list queries add a `pack_ok` flag for the badge, computed in bulk through one query per venue set.
- **Booking notification:** after a successful `shifts.assign` and the cover/offer accept in `ops.mjs`, call `remindPack(assignment, 'booked')`. It notifies `officerUser` with a link to `/officer/venue-pack/:venueId`, and is deduped through `pack_reminders`.
- **`modules/jobs.mjs`:** each run, for assignments starting within 24–25 h ('day') and 2–2.5 h ('2h') where the pack is not current, send the reminder through the same helper.
- **`modules/compliance.mjs`:**
  - New issue `venue_pack` for upcoming assigned shifts in the next 14 days. It sits in the shifts area, with fixes `remind` (existing pattern) and `unassign` / Find cover.
  - Included in `buildDigest`.
- **`notifyResign`:** when a real change is published, notify officers booked at the affected venues in the future.
- **`lib/orbCatalog.mjs`:**
  - Read entries: `venuePacks.register`, `venuePacks.get`, `procedures.list`, `procedures.get`.
  - Confirm entry: `venuePacks.ai.draft`.
  - Banned: publish, sign, read, toggle, archive.
- **OpsAI cap label:** add `venue_packs: 'Venue packs'` in `app/src/pages/manager/OpsAI.jsx`.

## App (React, `app/src`)
- **Manager: `pages/people/procedures/Library.jsx`** (route `people/procedures`, linked from the Documents/Contracts nav and the Toolbox admin):
  - a list of general and venue procedures with status chips;
  - a "New procedure" / "Draft with AI" sheet.
- **Manager: `pages/people/procedures/Editor.jsx`** (route `people/procedures/:id`):
  - a docmarkup textarea with a live `DocPaper`/`Blocks` preview;
  - the AI disclaimer, and an AI edit box (pattern from `contracts/AskAi.jsx`);
  - scope (all venues or chosen venues);
  - Publish sheet with "Minor wording fix — no re-sign" and "Real change — officers must sign again";
  - version history with view-as-signed;
  - open suggestions with Accept, Reply and Dismiss.
- **`pages/money/VenueDetail.jsx`:** a new tab "Instructions & procedures" (`VenuePackTab.jsx` next to it):
  - the status line;
  - the ordered pack list with reorder (up/down buttons, phone-friendly), the general on/off switch and Add venue procedure;
  - a "Create with AI" sheet: questionnaire answers, tick the venue documents to use, upload a new one through the existing DocumentsTab upload, then Draft;
  - the register (search, filter chips, export PDF/CSV, PDF links per signing).
- **Officer: `pages/officer/VenuePack.jsx`** (route `/officer/venue-pack/:venueId`):
  - a document list with "3 of 6 read" and "already read" marks;
  - each document opens in `DocPaper` with read-to-end (reusing `useReadProgress` from SignFlow — export it) and the tick "I have read and understood this", which calls `venuePacks.read`;
  - then the sign step reuses the SignFlow sign/done steps. Refactor SignFlow so its Sign and Done steps are exported, and add `CONSENT.venue_pack`.
  - Accepts `?then=clock` to return to clock-in after signing.
- **`pages/officer/Clock.jsx`:** when `clock.status.pack.status` is not current, or a punch returns code `venue_pack`, show an inline card "Sign the venue pack to clock in". It opens VenuePack in-flow, and after signing it retries the punch automatically.
- **`pages/shift/ShiftView.jsx`:**
  - a "Site instructions & procedures" entry in the Toolbox section, opening a read-only pack view (`pages/officer/SitePack.jsx`) with search. Pack JSON is cached in localStorage so it works on a weak signal;
  - a "Read and sign" banner when not current.
- **Rota:** a small "Pack not signed" badge on assignment chips/rows where `pack_ok` is false.
- **Officer profile (manager):** a "Venue packs" list on the profile documents area, using `venuePacks.officer`.
- **Venue role `pages/venue/Site.jsx`:** the published pack (read only), the register with exports and PDFs, and a "Suggest a change" sheet per document.
- **Compliance page:** labels and fix buttons for `venue_pack`.
- All new UI uses existing `ui/index.jsx` components, so it works in both Classic and Control Room styles.

## Ship steps
1. Implement the migration, lib, module and tests, then the integrations, then the UI.
2. Run `cd functions/api && npm test`, which must stay green with the new tests.
3. Run `cd app && npx vite build`.
4. Check the API bundle size stays under 4 MB.
5. Deploy with `openkbs fn deploy api` (the migration auto-applies).

## Verification (demo DB, then cleaned up)
1. Create a test venue with instructions text and check the migrated draft appears.
2. Run AI Draft with answers and an uploaded PDF. Check the drafts contain "[To confirm]" and no invented codes.
3. Publish the instructions and a general "all venues" procedure. Switch it off on another venue and check the pack differs.
4. Book a test officer and check the notification, the rota badge, the compliance item and the warning from `checkOfficerForShift`.
5. Try a clock-in punch through the API and expect a 423. Then go through the browser flow at 390px: read each document, tick, sign, then clock-in continues. Check the register shows Current, and that the PDF is on the officer's documents with the sign_event.
6. Publish a minor fix and check the officer stays Current. Publish a real change and check Needs re-sign with only that document to read.
7. Set the last shift to 7 months ago and check Refresher due.
8. On the venue login, check the register shows only its own venue, a suggestion reaches the manager, and edit actions are refused.
9. Export the register as PDF and CSV.
10. Take screenshots in Classic and Control Room at 390 and 1280 px, then run `agent-browser close --all`.
11. Remove all test rows and storage objects, and verify the count is 0.
12. Commit the feature (app/src, functions/api, spec), then a separate build commit for site/. Deploy the site with `openkbs site deploy`, push, and move the board card to Review with a plain-language comment.
