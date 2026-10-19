# Plan: Incident attachments + AI vision, and the AI compliance run

The spec is saved at `spec/spec-incident-attachments-with-ai-vision-ai-staff-compliance.md`. The plan reuses the existing pieces:
- incident attachments, the viewer and the PDF (`functions/api/modules/incidents.mjs`, `app/src/pages/shared/IncidentDetail.jsx`)
- the officer report wizard (`app/src/pages/officer/IncidentForm.jsx`)
- the Ops AI cards, decide, jobs and settings (`functions/api/modules/ops.mjs`, `app/src/pages/manager/OpsAI.jsx`)
- the AI helpers `claude`/`extract` with the credit cap (`functions/api/lib/ai.mjs`); image and PDF blocks pass straight through
- `compliance()` (`functions/api/modules/officers.mjs`), `proposeCover` (ops.mjs), and `upload()` (`app/src/api.js`)

## 1. Database: `functions/api/db/migrations/003_evidence_compliance.sql`
Migrations run automatically through `migrate()`.
- **incident_attachments:** add `size_bytes int`, `removed_at timestamptz` and `removed_by uuid`. Removal is a soft delete, so it shows in history.
- **incidents:** add `ai_assisted bool DEFAULT false`, `ai_summary jsonb` (`{captions:[{attachment_id,text}], summary, mismatches:[], missing:[]}`), `ai_summary_sig text` and `ai_summary_at timestamptz`.
- **roles:** add `accepted_licences text[] DEFAULT '{}'` and `required_docs text[] DEFAULT '{}'`, then set the defaults:
  - door: Door Supervisor
  - guard: Security Guarding, Door Supervisor
  - supervisor: Door Supervisor, Security Guarding
  - cctv: CCTV (Public Space Surveillance)
  - close: Close Protection
  - steward: none
- **documents:** add `ai_read jsonb` (`{name, number, licence_type, expiry, readable, concerns[]}`), `ai_read_key text` (re-read when `s3_key` changes) and `ai_read_at`.
- **compliance_dismissals:** `(officer_id, issue_key)` as the primary key, plus `sig`, `reason`, `dismissed_by` and `created_at`.
- **ops_items:** drop and re-create the `kind` check constraint so it includes `'compliance'`.
- **settings:** add `ops_compliance_dow int DEFAULT 1`.
  - Existing `ops_jobs` keys are untouched. The new keys `compliance` and `incident_ai` default to on through `jobOn`.

## 2. Backend
**`lib/storage.mjs`**
- Add `headObject(key)`, which returns the size and type, using `HeadObjectCommand`.

**`lib/ai.mjs`**
- Add `fileBlock(bytes, mime)`. It returns an image block (jpeg, png, webp, gif) or a `document` block for PDF, or null for anything else.
- The existing `checkCap` and credits accounting already cover vision calls.

**`modules/incidents.mjs`**
- **Attachment rules**
  - Allowed types: images, PDF, `.docx` and text. The server enforces this list.
  - `saveAttachments` does a `headObject` check. It refuses files over 15 MB and refuses more than 20 live attachments, then stores `size_bytes`.
  - Keys must sit under `docs/incidents/<uploader-uid8>/` or already belong to the incident.
- **Who can add:** officers until the report is closed (unchanged); company and security managers at any time.
- **New `incidents.removeAttachment {id}`**
  - Allowed for the uploader until closed, and for company managers at any time.
  - It soft-deletes the file and writes an audit entry.
  - `get` returns `removed[]` (name, by, when) for the history view and excludes removed files elsewhere, including the PDF.
- **`ai_assisted`** is accepted on create and update.
- **Uploader details:** `get` returns `uploaded_by_name` and the size for each attachment.
- **AI fields:** `get` hides `ai_summary` from venue and officer users.
- **PDF:** after the photos, list the names of the other attachments.
- **New `incidents.aiDraft` (officer)**
  - Input: `{keys[], notes, shift_id, current fields}`. The keys are the officer's own fresh uploads or the incident's attachments.
  - It loads the bytes (at most 12 images and 3 PDFs), builds the context (venue, shift, time) and calls `extract` with SONNET.
  - The tool `draft_report` returns, per field, `{value, source: 'notes'|'photo'|'both'}` for type, severity, description, location, people_involved, injuries, damage (merged into description), actions_taken, police_called and ambulance_called. It also returns a list of `questions` where the notes and the photos conflict.
  - The system prompt sets the rules:
    - Never identify people or guess names, ethnicity or age beyond broad terms.
    - Visible text (signs, plates, documents) may be read.
    - Never invent facts.
  - Gated by `jobOn('incident_ai')`.
- **New `incidents.aiReview {id, force}` (MGR)**
  - It builds the evidence summary with SONNET: the report text plus attachments, through the `evidence_review` tool.
  - It saves `ai_summary` and sets `ai_summary_sig` to a hash of the attachment ids, version and status.
  - **Automatic refresh:** a new ops job `evidenceScan`, run each 5-minute tick, handles up to 2 submitted incidents whose signature is stale. A stale signature means a new submission, new attachments or an edit.
  - **Manual refresh:** Refresh calls the same function inline.

**`modules/compliance.mjs` (new)**
- **`officerIssues(officer, ctx)`** is deterministic. Each issue is `{key, severity, title, advice, sig, actions[]}`. It produces:
  - `expiry_shift:<doc>:<shift>` when the SIA, right to work or a required document expires on or before a rostered or accepted shift. Urgent if the shift is within 7 days.
  - `expiry_soon:<doc>` when something expires within 60 days and no newer document has been uploaded. "Soon" if within 30 days, otherwise Advisory.
  - `licence_role:<role>` when the officer's licences don't cover a role on their profile, plus `licence_shift:<shift>` for each rostered shift in that role (Urgent if within 7 days).
    - The officer's licences are `sia_type` plus `ai_read.licence_type` from verified SIA documents.
  - `doc_mismatch:<doc>:<field>`: the AI-read name, number or expiry differs from the profile or the document record.
  - `doc_suspect:<doc>`: the scan is unreadable, or the AI raised concerns. Urgent.
  - `missing_doc:<kind>` (from `roles.required_docs`), `unverified:<doc>` and `onboarding` when steps are open.
  - **Suggested actions per issue:**
    - `remind {doc_kind}`
    - `unassign {assignment_ids}`
    - `correct {field, from, to}` (company managers only)
    - `recheck {doc_id}`
- **`readDocuments(limit)`**
  - It covers officer documents of kind sia, rtw or id that have an image or PDF and where `ai_read_key` differs from `s3_key`.
  - It calls `extract` with HAIKU and `fileBlock`, then stores `ai_read`.
- **`runCompliance()`**
  1. Read up to 8 documents.
  2. Work out the issues for active and onboarding officers.
  3. Skip issues whose dismissal `sig` still matches.
  4. For each officer with issues, either update their open pending `compliance` card (payload issues, title, severity) or call `createItem({kind:'compliance', officer_id, venue_id: <venue of the earliest at-risk shift or null>})`.
  5. Pending cards whose issues have all cleared are auto-closed (status `done`, `result.auto_closed`).
  6. Log activity: "Checked N officers, M need attention".
  7. Card advice is one short HAIKU call per new or changed card. If the cap is reached or the call fails, it falls back to template text.

**`modules/ops.mjs`**
- **New jobs** in `JOBS`:
  - `compliance`: weekly on `ops_compliance_dow` from 06:00, with a once-a-day guard following the reconcile pattern.
  - `docRead`: up to 4 documents per tick.
  - `evidenceScan`.
- **`decideCompliance(it, b, user)`** runs the action ids the manager ticked (`b.edits.actions`):
  - `remind`: in-app notice and email to the officer, linking to `/officer/documents`.
  - `unassign`: cancel the assignment if there is no clock-in, notify the officer, then call `proposeCover(shift, 'compliance', {exclude:[officer]})`.
  - `correct`: update the officer field and audit it.
  - `recheck`: clear `verified_at` and `verified_by` and add an HR note.
- Add `decideCompliance` to the decide map.
- **New `ops.dismissIssue {id, key, reason}`.** It inserts the dismissal and removes the issue from the payload; if no issues remain, the card becomes `rejected`.
- **New `ops.complianceRun` (CO)** for Run now.
- **`OPS_SETTINGS`** gains `ops_compliance_dow`.
- **Chat tool `compliance_status {from?, to?, officer?}`** returns live issues, filtered to at-risk shifts in the date range. A line is added to the system prompt.
- **Scoping:** `scopedItem` already limits security managers to cards with a `venue_id` in their scope. Cards with a null venue are company-only, which matches the spec.

**`modules/settings.mjs`**
- **New `roles.update` (CO).** It saves `requires_sia`, `accepted_licences` (validated against the SIA types list) and `required_docs` (validated against the document kinds).

## 3. Frontend
**`officer/IncidentForm.jsx`**
- **Step order:** a new first step, **Evidence**, covers photos, files, rough notes and Draft with AI. The steps become Evidence, What, When & where, People, Actions, Review. Evidence is optional.
- **Upload as you go:** files upload as soon as they are added (with a spinner per tile), so their keys exist for the draft. Submit reuses those keys.
- **Limits:** 20 total including saved files, and 15 MB each.
- **"Add file"** accepts `.pdf`, `.docx` and `.txt`.
- **Draft with AI** opens a sheet. Each suggested field shows the current value against the suggestion, with a "seen in photo" tag where relevant, and Accept, Edit or Skip. A summary of the questions sits at the top.
  - Accepting fills the field and sets `ai_assisted`.
  - If the cap is reached or the AI is switched off, the sheet shows a friendly message.

**`shared/IncidentDetail.jsx`**
- **Attachment list:** each file shows its size, who added it and when, plus a remove button where allowed. A "Removed files" line appears in history.
- **Managers' tools:**
  - An **Add files** button (the upload helper, then `addAttachments`).
  - An **AI-assisted** pill.
  - An **Evidence review** panel (company and security managers only). It shows the per-photo captions, the summary, mismatches, missing information and Refresh.
  - Each mismatch or missing item has a **Request changes** button, which opens `ReviewPanel`'s change sheet with the text pre-filled (new `prefill` prop).

**`manager/OpsAI.jsx`**
- **`ComplianceBody`:**
  - Shows the officer link, a severity pill, the advice, and the issues with their titles.
  - Each issue has checkboxes for its suggested actions (the safe ones are ticked by default) and a Dismiss button that opens a reason sheet.
  - The approve label is "Apply selected".
- **Settings:** new toggles for "Compliance checks" and "AI on incidents", a compliance day selector, and a **Run compliance check** button.

**`people/Settings.jsx`**
- Tapping a role row opens a sheet to edit SIA required, accepted licence types (chips from `SIA_TYPES`) and required documents (chips from `DOC_KINDS`).

**`people/_profileTabs.jsx`**
- The Documents tab shows an "AI read: number · expiry · type" line and any concerns under each read document.

## 4. Test data: `scripts/seed-compliance.mjs`
The script uses the API as the company user and skips anything already seeded.
- **Licence expiring before a shift:** set Marcus's SIA expiry to 3 days from today and give him a shift in 5 days.
- **CCTV-only licence on a door shift:** set a CCTV-only licence on an officer and roster them on a Door Supervisor shift.
- **Mismatched licence photo:**
  - Render a mock SIA licence card as HTML.
  - Screenshot it to PNG with agent-browser.
  - Upload it as an SIA document whose number differs from the profile.
- **Missing first aid:** set `required_docs` to first_aid on the door role.
- **Incident evidence:**
  - Create one test incident photo of a broken bottle and a cut hand with `openkbs image --fast`.
  - Attach it to an incident whose text says "no injuries".

## 5. Deploy
1. `cd app && npm run build`.
2. Commit everything, including `site/`, with a `feat:` message.
3. `openkbs fn deploy api --schedule "rate(5 minutes)" -t 60`.
4. `openkbs site deploy`.
5. The migration runs on the first invocation.

## 6. Verification
Checked in the browser with `/tmp/login.sh` and agent-browser, plus read-only database queries.
1. **Attachments**
   - As an officer, add photos and a PDF, then use Draft with AI. Suggestions appear field by field, photo facts are tagged, and nothing is filled until accepted. Submit; managers see the AI-assisted tag.
   - As a manager, add a PDF to a submitted report.
   - Uploads of 16 MB, an unsupported type, or a 21st file are refused by both the UI and the API.
   - Remove a file; it appears in history.
   - As a venue manager, attachments are visible, with no add button and no AI panel.
2. **Evidence review**
   - The "no injuries" incident shows a mismatch about the cut hand.
   - Request changes is pre-filled, and the officer gets the notice.
   - Adding a file refreshes the summary on the next tick.
   - The captions never name a person.
3. **Compliance**
   - Run compliance check creates cards for all 4 seeded cases with the right severities.
   - Approving "Take off at-risk shifts" cancels the assignment and a cover card appears.
   - "Remind officer" creates the notification.
   - "Correct profile detail" updates the number and writes an audit entry.
   - A second run makes no duplicates.
   - A dismissed issue doesn't return. Uploading a renewed licence closes the card on the next run.
   - A security manager sees only the cards in their scope.
4. **AI off and cap**
   - With AI on incidents switched off, or the cap set to 0, the AI buttons explain why and uploads and the rule-based checks still work.
   - The rule-based checks still run; card advice falls back to the template text.
5. **Layout:** no overflow at 390 px or 1440 px.
6. **Credits:** the credits used are reported.
7. **Board and browser:** comment on the spec card in business language and move it to Review. Run `agent-browser close --all`.
