# Implementation plan: incident reports as one flowing page, Orb writes the report, then officer, manager and venue sign

The spec is saved at `spec/spec-incident-reports-become-one-flowing-page-notes-orb-writ.md`.

## Context
Today the officer files an incident through a 6-step wizard (`app/src/pages/officer/IncidentForm.jsx`, 784 lines). Drafts already autosave through `useIncidentDraft` (`officer/_draft.js`).

The owner wants three changes:
- **Writing:** writing feels like Notion. The officer writes notes and adds photos, people and facts with small icons. Orb then writes a factual, neutral report that includes the photos.
- **Signing:** the officer edits the result, signs it and sends it. The manager signs it (or sends it back, edits it, or adds a statement). The venue manager signs to say they have read it.
- **Filing:** the report ends up as a sealed, signed PDF on file at the venue.

**Key decision:** keep `incidents.status` as it is (`submitted`, `changes_requested`, `closed`) so lists, analytics, the CSV export and `reviewMany` keep working. A new `sign_stage` column tracks the chain: `manager` (waiting for the manager), `officer` (sent back, or waiting for the officer to sign again after a manager's edit), `venue`, then `complete`. It is null for older reports.

## 1. Database: `functions/api/db/migrations/062_incident_signing.sql`

**`incidents`, new columns**
- `title text DEFAULT ''`
- `notes text DEFAULT ''`: the officer's original notes, kept as the record
- `body jsonb DEFAULT '[]'`: the blocks of the writing page
- `orb_versions jsonb DEFAULT '[]'`: each `{at, sections}` Orb returns
- `manager_statement text DEFAULT ''`
- `venue_comment text DEFAULT ''`
- `sign_stage text CHECK (sign_stage IN ('officer','manager','venue','complete'))`
- `resign_reason text DEFAULT ''`: `sent_back` or `edited`, plus the manager's note in `review_comment`
- `reference text UNIQUE`
- `fingerprint text`, `pdf_sha256 text`, `pdf_document_id uuid`, `sealed_at timestamptz`
- `venue_reminded_at timestamptz`

**`incident_attachments`, new columns**
- `caption text DEFAULT ''`
- `section text DEFAULT ''`: which report section the photo sits in (`what`, `people`, `injuries`, `actions`, or blank)

**New table `incident_signatures`**
- Columns: `id`, `incident_id`, `version`, `role` (`officer`, `manager` or `venue`), `user_id`, `name`, `title`, `png`, `ip`, `ua`, `at`, `void_at`.
- A signature is voided when the text it signed changes. The history keeps the voided ones.

## 2. Backend (`functions/api`)

### `lib/incidentSign.mjs` (new, pure, unit-tested)
- `nextStage(inc, action, role)` is the transition table:
  - officer `sign` → `manager`
  - manager `send_back` → `officer` (status `changes_requested`)
  - manager `edit` → `officer` (`resign_reason='edited'`, status stays `submitted`)
  - manager `sign` → `venue` (status `closed`)
  - venue `sign` → `complete`
  - Anything else throws a 400 with a plain message.
- `fingerprintOf(inc, signatures)`: sha256 of the report text fields, the photo keys and captions, and the signers. It reuses the approach in `lib/signdoc.mjs:fingerprintOf`.
- `venueReminderDue(inc, now)`: due the next morning at 09:00 London time, then every 2 days.

### `lib/incidentDoc.mjs` (new)
- `renderIncident(inc, {company, signatures, events, status, verifyUrl, role})` builds the PDF.
- It moves the body of today's `incidents.pdf` (`modules/incidents.mjs:342-397`) here and adds:
  - the title;
  - photos placed under their section, with captions;
  - the manager's statement and the venue's comment;
  - a **three-box signature row** (name, role, time, signature image);
  - a **certificate page**: reference, fingerprint, each signer with their device (`device()` from `signdoc.mjs`) and IP, a verify QR code (`qrPng`), and the timeline;
  - a watermark ("AWAITING MANAGER SIGNATURE" or "AWAITING VENUE SIGNATURE") until it is complete.
- It uses `Doc` from `lib/pdf.mjs` and keeps venue users from seeing witness contact details.

### `modules/incidents.mjs`
- **`cleanDraft`** (`lib/incidentDrafts.mjs`) now allows `title`, `body`, `orb` (the latest written sections and any unanswered questions) and `captions`.
- **`incidents.create`** also takes `title`, `notes`, `body`, `orb_versions`, `captions` and `signature: {png}`.
  - When a signature is sent (the new page always sends one), the report is inserted with `sign_stage='manager'` and `reference = nextReference('incident')`. Add `incident: 'I'` to `PREFIX` in `lib/esign.mjs`.
  - It inserts the officer's `incident_signatures` row, recording the request's IP and user agent (`uaOf`).
  - Managers filing a report sign as the manager straight away (`sign_stage='venue'`, status `closed`).
  - The current notifications stay; the manager's message reads "Incident to sign".
- **New `incidents.sign`** (officer, company, security, venue):
  - It loads the report and checks access (`canSee`). Venue users go through `assertVenue`.
  - It checks the stage against the role using `nextStage`.
  - **Manager:** uses their saved `user_signatures` png when no pad image is sent. It can take a `statement`, which is saved as `manager_statement` together with a version snapshot.
  - **Venue:** takes an optional `comment`.
  - It inserts the signature, updates `sign_stage`, `status` and `reviewed_by`, and records an audit entry.
  - **Notifications:**
    - The officer signs → the venue's managers get "Incident to sign".
    - The manager signs → the venue's contacts get "Incident report to sign" (`/venue/incidents/:id`), and the officer gets "Signed by manager".
    - The venue signs → seal the PDF, then tell the manager and the officer "Complete".
  - **Sealing:** call `renderIncident` with status `signed`, then `archivePdf` (owner: the officer if there is one, otherwise the company; kind `incident`), and store the fingerprint, `pdf_sha256`, `pdf_document_id` and `sealed_at`.
- **`incidents.review`:**
  - `changes_requested` also sets `sign_stage='officer'` and `resign_reason='sent_back'`, and voids the officer's signature.
  - `close` remains for older reports only (when `sign_stage` is null). The new flow closes through `sign`.
- **`incidents.update`:**
  - When a **manager** edits a report at stage `manager`, it voids the officer's signature, sets `sign_stage='officer'` and `resign_reason='edited'`, and notifies the officer ("Your manager edited INC-… — check and sign again").
  - When the **officer** updates a report at stage `officer`, it stays at `officer` until they sign. The page calls `update`, then `sign`.
  - It now also takes `title`, `body`, `notes` and `captions`.
- **`incidents.get`:** adds `signatures` (including voided ones) and the `sign_stage` fields.
- **`incidents.pdf`:**
  - Once sealed, it returns `savedPdf(pdf_document_id)`.
  - Otherwise it returns a live `renderIncident` with a watermark.
  - Reports without a `sign_stage` render as they do today.
- **`incidents.list`:** adds `sign_stage`, and a `to_sign` filter (whichever stage matches the caller's role).

### `modules/incidentAi.mjs`
- **New `incidents.aiWrite`** (officer, company, security):
  - Input: `{notes, body, keys, captions, shift_id, occurred_at, chips, instruction?, section?}`.
  - It reuses `loadBlocks`, `RULES` and `extract` with a new `WRITE_TOOL`, which returns:
    - `title`;
    - `sections: {what, people, injuries, actions, force_justification}`, each as paragraphs;
    - `photos: [{index, section, caption}]`;
    - `chips` (`type`, `severity`, `location`, `police_called`, `ambulance_called`, `force_used`, plus their sources);
    - `questions[]`.
  - When `instruction` and `section` are given, Orb rewrites only that section. That is the "Redo" button.
  - It records an audit entry `incident.ai_write`. It respects `aiOn`.
- `incidents.aiDraft` stays for compatibility. The page no longer uses it.

### `modules/esign.mjs`
- `esign.verify` also accepts `ORB-I-…` and looks up `incidents`. It returns the title "Incident report", the officer, the manager signer, the venue and the hash match.

### `modules/jobs.mjs`
- Venue signing reminders: for reports at stage `venue` where `venueReminderDue` is true, notify `venueContacts` using `dedupe` and update `venue_reminded_at`.
- Remind managers once after 24 hours at stage `manager`.

### Tests: `test/incidentSign.test.mjs`
- Transitions, including the invalid ones.
- The fingerprint changes when the text changes.
- Timing of venue reminders.

`renderIncident` gets a smoke test that renders with three signatures and a certificate page and checks that the PDF bytes start with `%PDF`.

## 3. Frontend (`app/src`)

New folder `pages/shared/incident/`:
- **`Composer.jsx`**: the page that replaces `Wizard`. `IncidentForm.jsx` keeps `DraftLoader`, `EditLoader` and the manager mode, and renders `<Composer>` instead of `<Wizard>`.
  - **Top bar:** Back, then the save status (reusing the `SaveStatus` logic, with small animated icons), then a primary **Orb ✦** button.
  - **Title:** a borderless, large `Textarea` with "Untitled incident".
  - **Chips row (`Props.jsx`):**
    - type (a tile popover from `INCIDENT_TYPES`) and severity (`SEVERITIES`);
    - time and shift (officer) or venue, shift and officer (manager), reusing the `StepWhen` and `ManagerWhen` contents inside Sheets;
    - location;
    - police, ambulance and force (Yes/No plus a reference number; force also needs a justification).
    - Chips that are empty are dimmed. Chips Orb has filled show a ✦ until someone taps to confirm them.
  - **Body (`Blocks.jsx`):** `body: [{id, kind}]`, where `kind` is one of:
    - `text` (an autoGrow `Textarea` with no border)
    - `photo` (keys and captions, a thumbnail grid opening `PhotoEditor` and `Lightbox`)
    - `file`
    - `person` (name, role, contact, statement, injuries)
    - `police`, `ambulance` or `force` (fact cards that stay in step with the chips)
  - Each block has a hover or long-press handle menu: move up, move down, delete.
  - Derived fields go to the draft and the API: `notes` (the joined text), `witnesses` (from person blocks), `attachments` (from photo and file blocks through the existing `useUploads`), plus the chip values.
  - **`InsertBar.jsx`:**
    - The icons are Camera, Image, Paperclip, UserPlus, Mic (the existing `MicButton`, inserting at the cursor), Siren, Ambulance and Hand.
    - On phones it is pinned above the keyboard (`position: sticky; bottom: env(keyboard-inset-height)`, falling back to the bottom of the viewport); on desktop it sits inline.
    - Typing `/` on an empty line opens the same items as a menu you can filter (`SlashMenu`, keyboard arrows plus Enter). Choosing one removes the `/` text and inserts the block after it.
  - **Autosave** is unchanged. The snapshot becomes `{data: {...chips, title, body, orb}, attachments, step: 0}`. Old drafts with no `body` are converted on load: their `notes` and `description` become text blocks, `witnesses` become person blocks, and attachments become a photo block.
- **`OrbWrite.jsx`**: the "Final version" view.
  - It calls `incidents.aiWrite` and shows a writing shimmer while it waits.
  - Questions appear first, each with an answer box. Answering asks Orb to redo the report.
  - Sections are shown as editable paragraphs, with photos placed under them and their captions editable.
  - Each section has a ✦ Redo button that takes an instruction.
  - "Back to notes" returns to the writing page.
  - Orb's gap check is a client-side checklist built from the existing `problems` rules (`IncidentForm.jsx:197`). Each gap jumps to the place to fix it.
  - **Approve & sign** opens `SignSheet`.
- **`SignSheet.jsx`:**
  - It shows `SignaturePad` (`ui/SignaturePad.jsx`), the name, and a declaration line for each role.
  - Officer: "I confirm this is a true and accurate account".
  - Manager: "Reviewed and approved", using the saved signature with a "Use saved signature" toggle, and an optional statement.
  - Venue: "Received and read", plus an optional comment.
  - It calls `incidents.create` or `update` and then `sign`.
- **`SignStrip.jsx`:** three steps (officer, manager, venue), each showing an avatar or a pending state, the name, the time and a small signature image. Voided signatures appear in the history.

**`pages/shared/IncidentDetail.jsx`**
- The header is restyled to show the title and chips.
- The report sections show with photos inline, followed by the manager's statement and the venue's comment, then `SignStrip`.
- The action bar changes with stage and role:
  - Manager at stage `manager`: **Sign**, Send back, Edit (manager edit, routed to `incidents/:id/edit` in company and security), and Add statement (inside the sign sheet).
  - Officer at stage `officer`: **Check & sign** (opens edit).
  - Venue at stage `venue`: **Sign**.
  - Manager at stage `venue`: Remind venue.
  - Download PDF is always available.
- Add the route `incidents/:id/edit` for the company and security portals (`main.jsx:210`).

**Lists and dashboards**
- `pages/shared/Incidents.jsx`:
  - a stage chip ("Awaiting manager", "Sent back", "Re-sign", "Awaiting venue", "Complete");
  - a "To sign" filter chip with a count.
- Manager Today (`manager/Dashboard.jsx` queue): incidents to sign go into "Needs you".
- Venue dashboard (`money/VenueDashboard.jsx` `NeedsYou`): "Incident reports to sign".
- Officer Home `useToDo`: "Sign your report again" when the stage is `officer`.

**Clean-up**
- Delete the wizard pieces from `IncidentForm.jsx`: `Wizard`, the Step* components, `StepChips`, `DraftSheet` and `ReviewCard`.
- Keep the routing and loaders.

## 4. Release
- What's new card at the top of `pages/people/_whatsnew.jsx`: "Write incidents like notes, sign them together". It uses the `PenLine` icon and image `incident-notes-sign`, dated 2026-11-08. Add the image prompt to `app/scripts/whatsnew-images.mjs` and run `node app/scripts/whatsnew-images.mjs incident-notes-sign`.

## 5. Build, verify, deploy
1. Run `cd functions/api && npm test` (the new tests and the existing incident and draft tests).
2. Run `cd app && npm run build`. ui-lint must stay at or under 70, using only the icon sizes 14, 16, 18, 20 and 24.
3. Grep `site/app/assets/index-*.js` for the Opulence API id `6ij75kpgf7kiwtvwo3nke763dm0oejxo`.
4. Run `openkbs fn deploy api` (the migration runs on startup through `lib/db.mjs`), then call `incidents.types` with curl to check the function answers.
5. Smoke-test with agent-browser at 375×812: the sign-in page renders and the console shows no errors. Pages behind sign-in need a login, so tell the user. Then run `agent-browser close --all`.
6. Make a `feat:` commit (code, migration, tests, What's new card and image), then a `build: site with …` commit. Run `openkbs site deploy`, then `git push origin master`.
