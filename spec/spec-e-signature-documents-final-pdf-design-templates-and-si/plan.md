# Plan: E-signature documents — final PDF design, templates and signing experience

Spec: `spec/spec-e-signature-documents-final-pdf-design-templates-and-si.md`

## Context
Right now contracts (`functions/api/modules/hr.mjs:144-215`) and pay rises (`functions/api/modules/growth.mjs:200-262`) each build a plain PDF on every request with the `Doc` class in `functions/api/lib/pdf.mjs`. The PDF has:
- Helvetica, which drops non-Latin characters through `clean()`
- the officer as the only signer
- no proof page
- no frozen copy
- "electronically signed" printed even when nothing is signed.

Templates are a raw textarea. This plan adds:
- one shared signed-document renderer
- countersignature, a certificate and sealing
- a verify page
- templates with versions and categories, including policies
- a new officer signing flow.

It reuses the existing patterns `archivePdf`/`savedPdf` (`lib/archive.mjs`), `audit`, `notify`, `runJobs` and `pub`.

## 1. Data: `functions/api/db/migrations/017_esign.sql`
- **`contract_templates`:**
  - adds `category text NOT NULL DEFAULT 'contract' CHECK (category IN ('contract','policy','pay_rise'))`, `version int NOT NULL DEFAULT 1`, `system boolean DEFAULT false`, `updated_at`, `updated_by`
  - seeds one `system` 'pay_rise' template whose wording is today's hard-coded text, written with placeholders.
- **New `contract_template_versions`** (`template_id, version, title, body, created_by, created_at`, PK `(template_id, version)`), backfilled with v1.
- **Shared signing columns** on both `contracts` and `pay_agreements`:
  - `reference text UNIQUE`, `template_version int`
  - `signatory_user_id`, `company_name_signed`, `company_title_signed`, `company_signature`, `company_signed_at`
  - `signed_ua`, `opened_at`, `fingerprint`, `pdf_sha256`, `pdf_document_id`, `sealed_at`
  - `reminders int DEFAULT 0`, `last_reminded_at`
  - on `contracts` only: `superseded_by`, `superseded_at`, and the status check widened to add `'superseded'`.
- **Sequence `esign_ref_seq`.** References look like `ORB-C|P|R-YYYY-NNNN` (contract, policy, pay rise). Existing rows are backfilled.
- **New `sign_events`:**
  - columns: `id, doc_type ('contract'|'pay_agreement'), doc_id, kind ('sent','emailed','opened','signed','sealed','reminded','voided','superseded'), actor_user_id, actor_name, ip, ua, at`
  - index on `(doc_type, doc_id, at)`
  - backfilled with 'sent' and 'signed' events from existing rows.
- **New `user_signatures`** (`user_id PK, name, title, png, updated_at`).
- **`settings.default_signatory_id`** (uuid).

## 2. Server rendering
- **Fonts:**
  - Add `@pdf-lib/fontkit`.
  - Bundle IBM Plex Sans Regular, SemiBold and Italic (Latin, Latin Extended, Greek and Cyrillic) in `functions/api/assets/fonts/`, embedded with `subset: true`.
  - `Doc.create(title, { unicode: true })` registers the fonts. `clean()` becomes font-aware and replaces only glyphs the font lacks.
  - Other PDFs (invoices and so on) keep Helvetica, so they are unchanged.
- **`lib/docmarkup.mjs` (new):**
  - `PLACEHOLDERS`: key, label and sample value for company, company_address, officer, officer_address, utr, start_date, role, venue, rate, current_rate, conditions, today, signatory and signatory_title.
  - `fill(body, values)` and `unknownPlaceholders(body)`.
  - `parse(body) → blocks`:
    - `#` makes an auto-numbered clause heading, and paragraphs under it become n.1, n.2…
    - a paragraph that already starts with `3.` keeps its own number with a hanging indent, so the seeded template still renders well
    - `- ` makes a bullet, `**x**` makes bold runs, and `---page---` forces a page break
  - It is pure and unit-tested.
- **`lib/signdoc.mjs` (new), the composition from the spec:**
  - `renderSigned({ kind, company, doc, blocks, terms, signers, events, status, preview })` returns `{ bytes, fingerprint }`.
  - Header band: logo, a type label in the brand colour, and the title, then the company line and a 2pt brand rule.
  - Key-facts strip: reference, issued date, parties, version.
  - Clauses: a heading never sits alone at the bottom of a page.
  - Pay-rise terms panel.
  - Two signature boxes, kept together on one page, with an "Awaiting signature" state.
  - Certificate page: the QR comes from the existing `qrPng`, pointing at `https://<site>/app/verify/<ref>`, plus the signers table and the timeline.
  - Final pass on every page: a status watermark (AWAITING SIGNATURE, VOID or PREVIEW – SAMPLE DATA), a running footer (`Ref · STATUS · Page x of y`), and the existing `credit()`.
  - `fingerprint` is the SHA-256 of the canonical content: body, terms, signer names and times, and the signature images. It is printed on the certificate.
  - `pdf_sha256` is the hash of the final file bytes. It is stored and used by verify.
- **`lib/esign.mjs` (new), shared by both document types:**
  - `nextReference(type)` and `event(docType, id, kind, ctx)`.
  - `companySigner(userId)`: the signature snapshot. It throws a 400 with `setup: true` if there is no saved signature.
  - `ua(event)`.
  - `seal(docType, row, render)`: renders, then `archivePdf` into the officer's documents (kind `contract`/`policy`/`agreement`), stores the hashes, `pdf_document_id` and `sealed_at`, and adds a 'sealed' event.
  - `pdfFor(row, render)`: returns the sealed copy through `savedPdf`. A row that is signed but not sealed (legacy) is sealed on first download, with a "signed before certificates were introduced" note. Otherwise it renders live with a watermark.
  - `esignReminders()`: sends reminders at 3 and 7 days using the `reminders` count, and is wired into `runJobs` in `modules/jobs.mjs`.

## 3. API
- **New `modules/esign.mjs`** (registered like the others in `lib/modules.mjs`):
  - `esign.mySignature.get|save|remove` (CO): the manager's own saved signature, with name and title.
  - `esign.signatories` (CO): managers with a saved signature, plus the default. `settings.update` accepts `default_signatory_id`.
  - `esign.preview` (CO) `{category, title, body, values?}` returns `{ pdf, blocks, unknown }`, rendered with sample data and the PREVIEW watermark.
  - `esign.placeholders` (CO).
  - `esign.remind` (CO) `{type, id}`.
  - `esign.verify` (**pub**) `{reference, sha256?}` returns reference, type, status, signer names, completion date, fingerprint and `match`. The PDF hash is computed in the browser with `crypto.subtle`, so no file is uploaded and no document text is ever returned.
- **`hr.mjs` contracts:**
  - `saveTemplate`:
    - category and versioning: wording changes bump the version and insert a version row
    - system templates can't be deactivated
    - for a policy with `resign: true`, every signed contract on an older version is marked superseded and a new one is sent to the same people
  - `templates`: returns the version list, plus the signed/asked counts for policies.
  - `send`:
    - takes `officer_ids[]`, values overrides and `signatory_id`
    - fills the placeholders and snapshots the company signature
    - assigns a reference and adds 'sent' and 'emailed' events, then notifies as today.
  - `get`: on the officer's first view it sets `opened_at` and adds an 'opened' event with IP and user agent. It also returns `blocks`, the company signer, the events and the reference.
  - `sign`: stores the user agent and caps `signed_name` at 120 characters, adds a 'signed' event, then seals.
  - `void`: only allowed while the status is `'sent'`.
  - `pdf`: goes through `pdfFor`.
  - `list`: adds `reference`, `opened_at` and category.
- **`growth.mjs` pay agreements**, the same pattern:
  - `send` adds the reference, signatory snapshot and events.
  - `get` records 'opened' and returns blocks.
  - `sign` seals once it has signed and applied.
  - `pdf` goes through `pdfFor`, and its body is the `pay_rise` template filled with rate, role, venue, dates and conditions, plus the terms panel.
- **Audit:** every send, remind, void, supersede, signature save and default-signatory change goes through `audit()`.

## 4. App (React, `app/src`)
- **Settings** (`pages/people/Settings.jsx`):
  - **"Your signature" card**: drawn with the reused `SignaturePad`, which moves out of `officer/Contract.jsx` into a shared `ui/SignaturePad.jsx`, plus name and job title. There is also a "Default company signatory" picker.
  - **Templates tab rebuilt:**
    - the list is grouped Contracts / Policies / Pay rise
    - the editor is a textarea with a toolbar (Heading, Bold, Bullet, Page break) and a placeholder picker that inserts at the cursor
    - unknown placeholders are flagged
    - on wide screens, a live PDF preview in an iframe calls `esign.preview` 600ms after typing stops; on phones it is a "Preview" tab rendering `blocks` as paper pages
    - version history is listed
    - saving a policy with signers on older versions asks "Ask everyone to sign the new version / Keep existing signatures".
- **Send sheet** (`_profileTabs.jsx` `SendContractSheet`, also used by `StaffContracts.jsx`):
  1. Officers: several can be picked for a policy, or "All active".
  2. Template.
  3. Placeholder values: prefilled, with missing ones warned.
  4. Signatory: if there isn't one, a link to set one up.
  5. Preview.
  6. Send.
- **Registers** (`StaffContracts.jsx`, the profile Contracts tab, Growth pay rises):
  - status pills for Awaiting / Opened / Signed / Void / Superseded
  - the reference
  - a Remind action
  - Void hidden once signed
  - a policy summary row reading "12 / 15 signed" with the list of who hasn't signed.
- **Officer signing:**
  - A new shared `pages/officer/SignFlow.jsx` with three steps:
    1. **Read:** `blocks` rendered as paper pages, with the company signature box filled in. A progress bar is driven by IntersectionObserver on the last block, which unlocks "Continue to sign".
    2. **Sign:** name, the large pad and the consent toggle with the new wording.
    3. **Done:** the reference and "Download signed PDF".
  - `Contract.jsx` and `Agreement.jsx` become thin wrappers around it. Already-signed documents open straight on step 3 and show both signatures.
  - The paper pages use the `bg-paper` light reset, so they stay light in Control Room.
- **Public verify page:**
  - `pages/auth/Verify.jsx`, at route `/verify/:ref` next to the login routes in `main.jsx`.
  - It shows the result card and has a "Check a PDF" file picker that hashes the file locally and compares.
- **Officer Documents** shows the sealed copies automatically, because they are `documents` rows.

## 5. Tests
- **`functions/api/test/docmarkup.test.mjs`:** parse covers headings with auto numbers, manual numbers, bullets, bold and page breaks. Also fill and unknownPlaceholders.
- **`test/signdoc.test.mjs`:** builds a sample with a long body and a non-Latin name, then checks:
  - the page count is at least 3 and the last page is the certificate
  - the same input gives the same fingerprint
  - a different body gives a different fingerprint.

## 6. Ship
1. Run `npm test` in `functions/api` and `npm run build` in `app`.
2. Check the function zip stays under about 4 MB with the fonts and fontkit.
3. Commit `feat: E-signature documents — branded PDFs, countersign, certificate, policies`.
4. Run `openkbs fn deploy api` and `openkbs site deploy`.

## 7. Verify (live)
- **API script** (temporary, run from `functions/api` and deleted afterwards):
  1. A manager saves a signature and sends a contract to Marcus.
  2. Marcus opens it, which records the opened event, and signs.
  3. Check that the PDF has the certificate and the "Signed" status, and that `pdf_sha256` matches.
  4. Change the brand colour, then confirm the downloaded PDF bytes are identical, and set the colour back.
  5. `esign.verify` returns match for the real hash and a mismatch for a changed one.
  6. Voiding a signed contract returns 400. An officer calling preview returns 403.
  7. Send a policy to 2 officers, save v2 with re-sign, and check one is superseded and new ones are sent.
  8. A legacy signed contract seals on first download.
  9. Clean up the test rows.
- **agent-browser at 390px and 1280px:**
  - the Settings signature card and the template editor with live preview
  - the send sheet
  - the officer read, sign and done steps, in Classic and Control Room
  - the public verify page
  - the PDF pages rendered to PNG and read: header, clauses, signature boxes, certificate and watermark
- Then `agent-browser close --all`.
- **Board:** a business-language comment on the spec card, then move it to Review.
