# Implementation plan: Contracts module — knowledge packs, AI drafting workspace, uploads, outside signers

Spec: `spec/spec-contracts-module-contract-knowledge-packs-ai-drafting-w.md`

## Context
E-signing is already built, and this plan extends it rather than replacing it:
- `contracts` table, `lib/esign.mjs` (references, events, `seal`, `pdfFor`, reminders), `lib/signdoc.mjs` `renderSigned`
- `lib/docmarkup.mjs` (`parse`/`fill`), `modules/hr.mjs` `contracts.*`, `modules/esign.mjs` (`esign.preview`, `verify`)
- `app/src/pages/people/_esign.jsx` (TemplateEditor split view, SendDocSheet), `app/src/pages/officer/SignFlow.jsx`.

New work:
- contract **packs** and a versioned **clause library** with content states
- a **compose engine** (answers → clauses → markup, particulars, manifest, findings)
- the **AI workspace**
- **uploaded** PDF/Word contracts
- **outside signers** via email link
- **variations**, and the **engagement type** on profiles.

## 1. Data model — `functions/api/db/migrations/021_contract_packs.sql`
- **`clauses`** (`id text PK` e.g. `EMP.NOTICE.STATUTORY`, `subject`, `title`, `group_id` for alternatives of one slot, `created_at`)
- **`clause_versions`** (`clause_id`, `version int`, `jurisdiction text CHECK ('all','ew','sc','ni')`, `body` markup with `{{dotted.vars}}`, `origin CHECK ('seed','company','ai')`, `bespoke bool`, `state CHECK ('draft','company','legal') DEFAULT 'draft'`, `sources jsonb`, `checked_on date`, `seed_hash text`, `approved_by`/`approved_at`, `legal_review_id`, `created_by`/`created_at`)
  - PK `(clause_id, jurisdiction, version)`
- **`clause_current`** (`clause_id`, `jurisdiction`, `version`): the version new drafts use. When seed content changes it adds a new version, and the library shows "Update available". Adopting it is the company's choice.
- **`legal_reviews`** (`id`, `reviewer_name`, `firm`, `reviewed_on`, `jurisdiction`, `scope_note`, `notes`, `letter_document_id`, `recorded_by`, `created_at`) and **`legal_review_items`** (`review_id`, `clause_id`, `jurisdiction`, `version`)
- **`law_items`** (`id text PK`, `jurisdictions text[]`, `title`, `url`, `status CHECK ('in_force','announced','not_commenced')`, `effective_date`, `checked_on`, `summary`, `seed_hash`)
- **`organisations`** (`id`, `kind` (labour_provider / subcontractor / agency / psc / other), `name`, `company_number`, `address`, `signatory_name`, `signatory_title`, `signatory_email`, `created_by`, `created_at`)
- **`contract_drafts`**:
  - `id`, `pack_id`, `jurisdiction`, `pack_version`, `officer_id NULL`, `organisation_id NULL`, `title`, `effective_date`
  - `answers jsonb` (`{qid: {value, confirmed, source}}`), `assessment jsonb`, `selections jsonb` (`{slot: {clause, on}}`), `bespoke jsonb` (`{clauseId: body}`), `acks jsonb`, `chat jsonb`
  - `amends_contract_id`, `amend_kind CHECK ('variation','replacement','extension')`
  - `status CHECK ('draft','sent')`, `contract_id`, `created_by`, `updated_at`
- **`sign_links`** (`id`, `token_hash` unique, `contract_id`, `email`, `name`, `expires_at`, `used_at`, `download_until`, `created_by`, `created_at`)
- **`contracts`** gains:
  - `officer_id DROP NOT NULL`, plus `organisation_id`
  - CHECK: exactly one of `officer_id` / `organisation_id`
  - `source CHECK ('template','pack','upload','paper') DEFAULT 'template'`, `pack_id`, `jurisdiction`, `engagement_type`, `draft_id`
  - `manifest jsonb`, `particulars jsonb`, `findings jsonb`, `supporting jsonb`
  - `upload_key`, `upload_sha256`, `upload_pages`, `ai_check jsonb`
  - `amends_id`, `amend_kind`, `start_date`, `end_date`, `signer_kind CHECK ('officer','outside')`
  - status gains `'signed_paper'`
- **`contract_templates`** gains `upload_key`, `upload_sha256`, `upload_pages` and a `state` (content state), so uploads can be saved as reusable templates.
- **`officers`** gains `engagement_type`, `engagement_contract_id`, `contract_start`, `contract_end`, `fixed_term_renewals int`. These are set when a contract is signed or filed.
- **`settings.ai_module_caps`:** no seed, so there is no default cap. `contracts` becomes a valid key.

## 2. Content as versioned data — `functions/api/content/contracts/`
- `packs/<pack>.json`, one per family: `permanent`, `fixed_term`, `casual`, `self_employed`, `psc`, `labour_provider`, `subcontract`, `agency`. Each holds:
  - `id`, `title`, `party: 'person'|'organisation'`, `engagement_type`, `version`
  - `jurisdictions: ['ew','sc','ni']`
  - `questions[]`: `id` (dotted var), `label`, `help`, `type`, `options`, `required`, `prefill` (e.g. `officer.start_date`), `section`, `showIf`
  - `assessment` questions (for D, E and F)
  - `sections[]`: `id`, `title`, `slots[]`. A slot is `{slot, clauses: [ids], default, include: rule?}`.
  - `rules[]`: `{id, severity: 'blocker'|'review'|'note', when, message, jump}`
  - `supporting[]`: `{title, contractual: bool, link?}`
  - `overrides`: per-jurisdiction slot swaps (e.g. governing law, execution wording for Scotland)
- `clauses/<subject>.json` holds the shared security library (J) plus the clauses for each pack. Each clause is `{id, title, group, versions: {all|ew|sc|ni: {body, sources[{title,url}], checked_on}}}`.
- `law.json` holds the law items with source, status and effective date.
- `rule` condition language (small and declarative):
  - `{all:[…]}` / `{any:[…]}` / `{not:…}`
  - `{q:'hours.guaranteed', eq|ne|in|gt|lt|empty: …}`
  - `{clause:'ID', on:true}` / `{bespoke:'ID'}` / `{assessment:'employment', eq:'unresolved'}`
- **`lib/contractContent.mjs`:**
  - loads the JSON at cold start
  - `seedLibrary()` runs after `migrate()` and is idempotent, keyed on `seed_hash` (sha of body + sources). It inserts a new seed version only when the hash changes, sets `clause_current` only where none exists, and upserts `law_items`.
  - Called from `index.mjs` next to `migrate()`, once per container.

## 3. Compose engine — `functions/api/lib/compose.mjs` (pure, unit-tested)
`compose({pack, jurisdiction, answers, assessment, selections, bespoke, library, law, effectiveDate})` returns:
- `body`: markup. Variables are replaced from confirmed answers. An unanswered variable prints `[to be confirmed: <label>]`; it never prints a value.
- `manifest[]`: `{slot, clause, version, state, origin: standard|alternative|bespoke}`
- `particulars[]`: `{id, label, value, confirmed}` (it also prints as **Schedule 1 — Key particulars**)
- `outstanding[]`
- `findings[]`, from:
  - pack rules
  - built-in checks: empty required section, unanswered required question, clause state `draft`, bespoke wording, unresolved assessment, contradiction between the assessment and the pack
  - linked `law_items` not in force (Note with the expected date) and law effective after the start date
- `supporting`

`evalRule` is exported for tests. `docmarkup.fill` stays as it is for old templates. Pack variables go through a new `fillVars` that allows dotted names.

## 4. API — new `functions/api/modules/contractsPack.mjs`
Registered like the other modules. All actions are `CO` unless stated.
- **Library:**
  - `contracts.packs`: list packs with per-jurisdiction state counts.
  - `contracts.library`: clauses with current version, all versions, state, sources, update available.
  - `contracts.clause.save`: company alternative or edited copy, a new bespoke version in draft state.
  - `contracts.clause.adopt`: set `clause_current`.
  - `contracts.clause.approve`: one or many versions, or a whole pack variant.
  - `contracts.legalReview.record`: the scope resolves to exact versions; each becomes `state='legal'`; the letter is uploaded through the existing `files.uploadUrl` + `docs.create` (kind `other`, owner company).
  - `contracts.law`
- **Drafts:**
  - `contracts.draft.create` takes a pack, jurisdiction, party and effective date. It prefills answers from the officer, venue and settings, marked unconfirmed.
  - Also `contracts.draft.get`, `.save` (patch answers, selections, bespoke, acks), `.list`, `.duplicate`, `.delete`.
  - `contracts.draft.preview` returns `{pdf, findings, manifest, particulars, outstanding}`. It uses `compose` then `renderSigned`, with a new `status:'draft'` watermark "DRAFT – PENDING LEGAL REVIEW" when any manifest item is not `legal`.
  - `contracts.draft.approveAll`: approve the draft-state clauses used, recording the name.
  - `contracts.draft.send` works in four steps:
    1. refuse if there are blockers or unacknowledged review items, or any clause is still a draft
    2. snapshot body, manifest, particulars, findings and supporting into a `contracts` row with `source='pack'`
    3. company signer
    4. officer with a login → existing notify; officer without a login, or an organisation → sign link.
  - `contracts.draft.bundle`: the "contract file" PDF covering the agreement plus the 6 report sections, via the `pdf.mjs` `Doc`.
- **Amend:**
  - `contracts.amend`: from a signed contract, create a draft with its answers and `amend_kind`.
  - `variation`: the composed body lists only the changed particulars and clauses.
  - `replacement`: on sign, the old contract becomes `superseded`.
  - `extension`: sets a new `term.end_date` and increments `fixed_term_renewals` on sign.
  - The change comparison is computed by `compose.diff(oldManifest/particulars, new)`.
- **AI** (`checkCap('contracts')`, then `claude({module:'contracts'})`):
  - `contracts.ai.chat` (SONNET):
    - The system prompt carries the pack, the questions with confirmed answers, the manifest, the findings, and the alternative wording for each slot.
    - Tools: `propose_alternative`, `propose_toggle`, `propose_answer` (only a value stated in the manager's message; checked server-side by substring/number match, otherwise rejected), `propose_bespoke` (text), `ask` (points to a question).
    - Returns `{reply, proposals}`; proposals are applied only via `.save` from the Apply card.
    - The chat is stored in `draft.chat`. The system prompt forbids claiming legal review or inventing values.
  - `contracts.ai.checkUpload` (`extract`, HAIKU→SONNET for long files):
    - input: the PDF via `fileBlock`, or the Word text, plus the pack's required sections and rules as a checklist
    - output: `{particulars[], findings[{severity, section, text}]}`, saved to `contracts.ai_check` or the upload draft.
- **Uploads:**
  - `contracts.upload.prepare`: the key comes from `files.uploadUrl` (folder `contracts`).
    - PDF: load with pdf-lib, refuse if encrypted, count pages, store the sha.
    - Word: new `lib/docx.mjs` unzips with **fflate** and walks `word/document.xml` (headings → `#`, numbering → bullets, `w:b` → `**`, tables → rows). It returns markup, so the Word upload continues as a pack-less in-app document.
  - `contracts.upload.preview`: the uploaded pages with the footer stamp, then the signature page and certificate.
  - `contracts.upload.send`, `contracts.upload.fileSigned` (paper: `status='signed_paper'`, stored to the profile documents, engagement set).
  - `contracts.upload.saveTemplate`
- **Signing engine (`lib/esign.mjs` + `lib/signdoc.mjs`):**
  - `renderSigned` gains `doc.partyLabel` and `doc.partyRole`, so the box says "Signed for {org}" and the certificate says "Outside signatory — {org}". It also gains `doc.attachment: {title, pages}`, which renders a "signature page" body ("This page forms part of '{title}', {n} pages, ref …").
  - New `lib/uploadSeal.mjs` `mergeUpload(originalBytes, appendixBytes, {reference, status})`:
    - stamps every original page's bottom margin with "Ref · Page x of y" (plus the "AWAITING SIGNATURE" or "VOID" watermark when unsigned)
    - appends the pages
    - the fingerprint comes from `fingerprintOf` with `blocks = [{para: 'sha256:'+upload_sha256}]`
  - `contractInput` and `pdfFor`/`seal` branch on `source='upload'`.
  - `seal` archives to the officer, or for organisations to `owner_type 'company'` with the organisation in the title.
- **Outside signing (public, `pub`):**
  - `sign.link.open`: the token is hashed with sha256; the action checks expiry and use, marks the document opened and returns the document (blocks, or a short-lived presigned URL for the upload PDF).
  - `sign.link.sign`: the same validation as `contracts.sign`, plus a loose name match against `sign_links.name`. It seals and sets `used_at` and `download_until = now()+30d`.
  - `sign.link.pdf` works until `download_until`.
  - `contracts.link.resend` (CO) issues a new token, voids the old one and is audited.
  - Email goes through `sendRawEmail` with `emailHtml`. If email isn't verified, the send fails with a clear message, and the send sheet checks it up front.
  - `esign.verify` regex accepts the same references. Its join changes to `LEFT JOIN officers` / `organisations`.
  - Rate-limit: no more than 20 opens per token per hour, using the `sign_events` count.
- **Engagement on sign** (both sign paths, plus paper):
  - update `officers.engagement_type`, `contract_start`, `contract_end` and `engagement_contract_id`, and `tickOnboarding('contract')`
  - when the source is `pack`/`upload` with an `amends_id` replacement, supersede the old contract.
- **Registers:**
  - `contracts.list` gains filters: `source`, `pack_id`, `jurisdiction`, `engagement_type`, `organisation_id`, `drafts`. It does a LEFT JOIN to `organisations`.
  - `contracts.organisations` and `.saveOrganisation`.
  - `contracts.agencyWeeks(officer_id)` counts distinct ISO weeks with completed shifts since `contract_start`.
- **Alerts:**
  - `compliance.computeIssues` adds fixed-term contracts ending within 30 days, and law items in force within 90 days that are linked to clauses in signed contracts.
  - These show on the dashboard and in `buildDigest`.
- **Reminders:** `esignReminders` also covers outside-signer links; it re-emails the same link while it's valid.
- **Settings and Orb:**
  - `modules/settings.mjs` l.86 and `lib/ai.mjs` names (l.58) gain `contracts`.
  - `lib/orbCatalog.mjs`: drafts and packs are readable. `contracts.draft.send`, `upload.send` and `link.resend` are outward. `sign.link.*` and the AI actions are blocked.
- **Audit**, via `audit()`: `draft.create/save`, `clause.approve`, `clause.save`, `legal_review.record`, `contract.send` (`source`), `link.issue`, `link.open`, `link.sign`, `contract.amend`, `upload.file_signed`, and `ai.apply` (sent by `.save` when the patch comes from a proposal id).

## 5. Frontend (`app/src`)
- **Shared and routes:**
  - New folder `pages/people/contracts/`.
  - `main.jsx` routes: `people/contracts/draft/:id` → `Workspace`, and a public `/sign/:token` → `pages/auth/PublicSign.jsx`.
  - `api.js` `upload()` gains the `contracts` purpose.
  - Lazy `ui/PdfPages.jsx` uses **pdfjs-dist** (dynamic `import()`, so it only loads where uploads are shown) to render canvases for every page and report scroll progress.
- **`StaffContracts.jsx`:**
  - tabs All / Drafts / Awaiting / Signed / Organisations / Policies, plus the new filters
  - header buttons: **Create contract** (`StartSheet`), **Upload contract** (`UploadSheet`), **Send template** (the existing `SendDocSheet`).
- **`StartSheet.jsx`:** party picker (officer search / applicant / organisation with an inline new-organisation form), pack (the "Not sure?" helper is a 3-question decision tree from the pack JSON), jurisdiction (defaults from the company address postcode prefix: BT → NI, Scottish postcodes → SC) and effective date. Then `contracts.draft.create` → navigate to the workspace.
- **`Workspace.jsx`:** full-screen. It reuses the `TemplateEditor` grid pattern and `usePreview`'s debounce (`_esign.jsx` l.175, l.276).
  - **Left tabs:**
    - **Guide** (`Guide.jsx`): sections, question inputs by type, prefill chips with "Confirm", answered/total per section, and the assessment step for D, E and F.
    - **Clauses** (`ClauseList.jsx`): manifest rows with state badges, alternatives segmented control, conditional switch with a "why" tooltip, and **Edit wording** (textarea + toolbar reused from `_esign.jsx`).
    - **Ask AI** (`AskAi.jsx`): chat bubbles. Proposal cards show the diff with Apply/Dismiss. When the cap is hit, a notice appears and the tab is disabled.
  - **Right:** the PDF iframe (existing blob pattern); below it, `ReviewList.jsx`, grouped Blockers / Needs review / Notes. Clicking an item jumps to its question or clause. Each Needs-review item has an "Acknowledge" button with a note.
  - **Footer:** autosave state, **Contract file**, **Approve & send** (opens the existing signatory → preview → send step, adapted from `SendDocSheet`).
  - **Phones:** `Segmented` tabs Guide / Clauses / AI / Preview / Review.
- **`ContractFile.jsx`:** 7 tabs (Agreement, Particulars, Clauses, Outstanding, Findings, Changes, Supporting) and a "Download bundle" button. It opens from drafts, from register rows and from the profile.
- **`UploadSheet.jsx`:** the four steps: file → who and what → AI check (optional button, shows its results) → signatory, preview (`PdfPages`), send. Toggles: "Already signed on paper" (date fields; files directly) and "Save as reusable".
- **`Settings.jsx`** gets a **Contract library** tab (`Library.jsx`):
  - pack × jurisdiction grid with state counts
  - clause drawer: wording, versions, sources, Approve, Adopt update, Add company wording
  - **Record legal review** sheet: scope picker, reviewer fields, letter upload
  - law items list, with items due in the next 90 days highlighted.
- **Profile `ContractsTab`** (`_profileTabs.jsx` l.682): current-contract card (engagement type, start/end, renewals, Extend/Amend), history including variations, and agency weeks with the qualifying date (12 weeks) for agency workers.
- **Officer and public signing:**
  - `SignFlow.jsx` takes either `blocks` (DocPaper) or `pdfUrl` (PdfPages) and gates reading progress on both.
  - `PublicSign.jsx` wraps `SignFlow` for link signers, with branding, expired/used states, and the download on the Done step.
- **Ops AI:** `pages/manager/OpsAI.jsx` `AI_MODULES` gains `contracts` ("Contracts AI").

## 6. Writing the content (all 8 packs × E&W / Scotland / NI)
1. Fix the JSON schema (§2) with one complete pack (`permanent`), compose tests and the content validator first.
2. Research the sources with WebFetch: the GOV.UK pages cited in the brief, ACAS, SIA (labour vs subcontracting, ACS workbook), HMRC (IR35/off-payroll, security operatives), legislation.gov.uk (ERA 1996, Employment Rights (NI) Order 1996, WTR 1998 / WT (NI) Regs 2016, AWR 2010 / AW (NI) Regs 2011, the Conduct of Employment Agencies Regs 2003), and the Employment Rights Act 2025 timeline (announced/not commenced). Record URLs and the `checked_on` date.
3. Draft the clause files in parallel with Agent subagents. Each gets the schema, the brief's section list for its pack, the shared drafting rules and the source list:
   - permanent + fixed-term
   - casual
   - self-employed + PSC
   - labour provider + subcontract
   - agency pack
   - shared security clauses (J) + Scotland/NI overrides (governing law, execution, NI statute names).
   
   Each subagent writes only its own files.
4. The **content validator** (`test/contracts.content.test.mjs`) checks that:
   - every pack × jurisdiction resolves all its slots
   - every variable used is declared
   - rule references are valid
   - every clause version has sources and `checked_on`
   - no clause body hard-codes a money amount or a notice/hours figure (regex for `£\d` and number+weeks/hours outside statutory references whitelisted by tag)
   - every clause is seeded in state `draft`.

## 7. Dependencies and deploy
- API: add `fflate` (Word unzip). pdf-lib is already there.
- App: add `pdfjs-dist`, lazy-loaded.
- `cd functions/api && npm test`, then `openkbs fn deploy api`. Migration 021 and the seed run on the first request.
- Build the app as the repo already does, then `openkbs site deploy`.
- Commit by phase (`feat: …` with the Co-Authored-By line), push to origin master, and move the board card to Review with a comment.

## 8. Build order
1. Migration 021, content schema, `contractContent` seeder, `compose` engine and tests, the permanent pack (E&W/SC/NI).
2. Draft API, preview watermark, workspace UI (Guide, Clauses, Review, PDF), approve and send to an officer with a login, contract file.
3. AI chat with proposals; Contracts AI cap.
4. The remaining 7 packs and the shared clause library (parallel subagents), validator green.
5. Uploads (PDF merge and stamp, Word → markup, AI check, paper filing, reusable uploads), `PdfPages`, SignFlow PDF mode.
6. Organisations, sign links, `PublicSign`, outside-signer reminders, verify join.
7. Amend/variation/extension, change comparison, engagement on profile, agency weeks, alerts in compliance and the digest, Library page with approvals and legal reviews, Orb catalog, OpsAI module.
8. End-to-end verification and deploy.

## Verification
- **Unit tests** (`npm test`):
  - compose: variables fill everywhere; unanswered → `[to be confirmed: …]`; conditional include; alternatives.
  - The three blocker cases fire:
    - zero-hours plus unrestricted availability
    - self-employed with no real substitution plus substitution wording
    - cutting hours because the site is a client's.
  - An announced law item gives a Note.
  - The variation diff.
  - `docx.mjs` on a fixture.
  - `mergeUpload` keeps the original page count + appendix and stamps pages.
  - Token hashing and expiry for sign links.
  - The content validator.
  - All existing tests still pass.
- **Live API script** (curl as `admin@orbsecurity.demo` + psql), each with a pass/fail check:
  - **Pack flow:** create a permanent E&W draft for a demo officer, answer it, see the preview watermark, try to send (refused), approve all, send, sign as the officer, then confirm the sealed copy and fingerprint on `/verify`, `officers.engagement_type`, and that the contract file holds all 7 parts.
  - **Upload:** upload a sample PDF to an organisation, check the link email, sign through `sign.link.sign`, confirm the sealed page count and that verify matches; an expired or used link is refused.
  - **Paper and amend:** paper filing; amend → variation → sign → change comparison present; replacement supersedes.
  - **AI:** chat proposal for "make notice 4 weeks" returns an Apply card, and a value the manager didn't state is rejected. `ai_usage` gets a `contracts` row.
  - **Legal review:** recording a review changes only the versions in scope.
- **Browser** (agent-browser at 390px and 1280px, Classic and Control Room), with screenshots of:
  - the workspace, Ask AI, the review list, the upload sheet with PDF pages, the public sign page, the Library and the profile Contracts card.
  - Then `agent-browser close --all`.
- Clean up any demo test rows afterwards.
