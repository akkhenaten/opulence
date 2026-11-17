# Build plan: slice 10: compliance queue, History on records, contracts by step, learning

Spec: `../spec-three-portal-review-slice-10-compliance-queue-and-traceable-records.md` (approved; defaults 1–4 accepted).
Release v207: API + app + migration 065. No rule changes.

## 1. Compliance queue (R05)

### Server: `functions/api/modules/compliance.mjs`
- **`compliance.overview` rows gain these fields** (the issue objects already carry what is needed):
  - `doc_id`, using `keyDoc(i.key)`.
  - `expiry` and `days_left`, from the issue's document or the profile expiry already used by `expiry_*`/`renewal` (`e.expiry`).
  - `checked`: `none` / `orb` / `person`, read from `documents.verified_by` / `auto_applied_at` and the existing Orb-check wording. These are read only, never set.
  - `owner`, via a pure `ownerOf(key)` helper in a new `lib/complianceOwner.mjs`:
    - `missing:`, `expiry_*`, `renewal:`, `training:`, `refresher:` and `venue_pack:` give **officer**;
    - `unverified:`, `doc_mismatch:`, `doc_suspect:`, `doc_name_*`, `doc_number_unread:`, `doc_misfiled:` and `licence_role:` give **office**;
    - grace rows give **office** with their end date;
    - any key it doesn't know gives **office**.
  - `affected`, taken from the issue's `unassign` action `params.assignment_ids`, joined to shift, venue and start. When there are none, it falls back to `i.shift`.
  - `actions`: the matching issue's actions from the Orb card payload, with their `id`, `kind`, `label` and `company_only`. Actions marked `company_only` are dropped for security managers.
  - `group`: `${officer.id}:${doc_id || doc || key}`, so the client can make one queue row per officer and document.
- **New `compliance.document {officer_id, doc_id?, doc?}`** (MGR):
  - Returns `profile`: `sia_number`, `sia_expiry` or `rtw_expiry` for the kind.
  - Returns `upload`: `documents.number`, `expiry`, `title`, `created_at`, and the verified flag/by/at.
  - Returns `orb`: from `ai_read`, only `number`, `expiry`, `name`, `has_photo`, `concerns` and `face.result`.
  - Returns `file`: a signed link through the same helper the profile Documents tab uses.
  - Uses the same role check as `compliance.overview`. For a security manager, the same scope check as the Documents tab: find which one it is and reuse it.
- **New `compliance.act {card_id, key, action_ids}`** (MGR):
  - Loads the card with `scopedItem` (or the same scope check as `ops.dismissIssue`).
  - Runs `decideCompliance` on a card copy that holds **only that issue**, so the verify vs re-check/correct guard and every rule stay the one code path.
  - Then removes the issue from the card exactly as `ops.dismissIssue` does: `rest` gives the payload and title update, and the card closes with `done` when nothing remains.
  - Writes an audit entry (`compliance.act`) and an activity line.
  - **Check first** how a card that was approved or done stops its issues coming back, through dedupe or sig. Record the handled issue the same way, so a reminded issue doesn't come straight back on the next run, the same as with a whole-card approve.
  - **Unchanged:** `ops.decide` on Today, and grace actions (`grace.mjs`).

### App: `pages/people/Compliance.jsx` + new `pages/people/_complianceQueue.jsx`
- **View switch:** `?view=queue` (the default) or `?view=person`, which is today's `Body` unchanged. The current filters (who, area, sev) stay in the address and apply to both views.
- **`Queue`:** groups `rows` by `group` and sorts them can't-work → grace → severity → soonest shift.
  - Each row is one line: Avatar · name · `doc_label` (or the title) · status (expiry, or "uploaded, not checked") · an owner pill (Officer to … / Office to check / Office: grace ends …).
  - Uses `List` and `Row`.
- **Desktop (`lg`):** the list stays on the left. `?doc=<group>` opens `DocPanel` in the existing side `Sheet` (`open side full`, `onPrev`/`onNext`), the same pattern as Users & access. Up and down arrows step through rows.
- **Phone:** the same `?doc=` opens the sheet full screen. Back closes it and keeps the list scroll and filters.
- **`DocPanel`**, using `useApi('compliance.document', …)` and these parts:
  1. A status line using the existing wording helpers ("In date · not checked", "Checked by Orb", grace).
  2. A comparison table: Field | On profile | On the upload | Read by Orb. A cell that differs gets a red "Doesn't match" caption.
  3. Why it matters: `detail`, plus the role line from the issue.
  4. Shifts affected: rows linking to `${base}/shifts/:id`, or "No booked shifts affected".
  5. Actions: buttons from `actions`. Each runs `compliance.act` with one action id, but Remind and Remove from shifts may be combined through the `unassign` confirm. Verify, and Re-check or Correct, are offered as separate buttons. The server refuses doing both, and the client also greys out the other one after a choice.
  6. Grace buttons, reused from `_graceSheet.jsx`.
  7. View file, and Open profile → Documents.
- **After an action:** the overview reloads and moves to the next row. A toast states what was done, using the server's `done` lines.
- **Loading and errors:** `Load` and `LoadFail` ("Couldn't load this document · Try again"). An empty queue reads "Nothing waiting".

### Tests (`test/compliance-queue.test.mjs`)
- `ownerOf` for each key family.
- The `compliance.act` single-issue path: other issues stay on the card, and the card closes when the last one goes.
- `company_only` actions are filtered for security managers.
- Verify plus re-check on the same document is still refused.

## 2. History on records (R24)

### Server: `users.mjs` `audit.list`
- Add `related: true`, used only together with `entity` + `entity_id`. It builds the OR list:
  - `officer`:
    - the officer;
    - `document` ids where `owner_type = 'officer' AND owner_id = id`;
    - `contract` ids by `officer_id`;
    - `statement` ids by `officer_id`;
    - entries whose entity is `officer_rate` or `hr_note` with that officer. Check which `entity_id` those audits write first.
  - `venue`: the venue, plus `venue_rate` entries (check the same way).
  - `shift`: the shift, plus `assignment` ids for that shift.
  - `invoice` / `statement` / `timesheet` / `contract`: the record alone.
- It stays `def(CO, …)` and uses the index `audit_log_entity` (063). The limit is 50 per call, and `before` is a cursor for Show more.
- `AUDIT_RECORD_NAME` gains `timesheet` and `assignment` (officer · shift) names.

### App
- **Generalise** `AccessHistory` (Settings.jsx:766) into `components`/`ui` `RecordHistory({entity, id, related, title='History'})`:
  - Collapsed by default as "History · N changes"; it only fetches when opened, except for the count line.
  - The count needs a cheap `audit.count {entity, entity_id, related}`, or else the label shows just "History" until it is opened. Choose the second if a count adds a second query per page.
  - 10 entries at a time, using the `_auditText.js` wording, with "Technical detail" one tap away, as on the Audit page.
  - `AccessHistory` becomes a use of it.
- **Rendered only when** `user.role === 'company'`, on these pages:
  - Staff profile: a new section at the bottom of the overview tab (find the right tab in `StaffProfile.jsx`).
  - Venue page.
  - Shift page, manager view.
  - Timesheet sheet in `shared/Timesheets.jsx`, under the existing hours History.
  - Invoice and statement detail.
  - The contract sheet in `StaffContracts.jsx`.
- **`Audit.jsx` record links:** add shift (`/shifts/:id`), timesheet (`/timesheets?ts=`), contract (the contracts list with `?contract=`) and pay run.

### Tests
- `audit.list related` for an officer returns that officer's document and contract entries and not another officer's.
- A security token gets a 403.

## 3. Contracts by step (R09)

### Server
- `hr.mjs` contract list rows add:
  - `template_version`;
  - `source` (template / pack / upload), which already exists for the filter;
  - `superseded_by_version` and `superseded_at`, via a join on `superseded_by`.
- Contracts summary for the strip, preferably in the existing list response: `signatory_set` (default company signatory), `templates_ready` (published templates count) and `awaiting` (sent and not signed).

### App
- **`StaffContracts.jsx`:** a `StepStrip` above the views with 4 compact tiles:
  - **Signatory**, linking to `/company/settings?tab=templates#signatory`.
  - **Templates**, linking to `?tab=templates`.
  - **Send**, opening the existing Start / Upload / Send sheets.
  - **Track**, which sets `status=awaiting`.
  - When no signatory is set, the strip says "No signatory yet: contracts can't be sent". Check that sending really is blocked without one; if it isn't, the line says "will go out without a company signature" instead, so the wording matches the rule.
  - On a phone the strip is a horizontal row of chips, not a grid.
- **Rows:** add the subtitle "From {template} v{n}", or "Uploaded file", or "From pack {name}". A superseded contract gets "Replaced by v{n} on {date}".
- **Contract sheet:** a version line, plus `RecordHistory`.
- **Settings → Templates & contracts** (`Settings.jsx` and `_esign.jsx` `TemplatesTab`), split into three `Section`s:
  - **Who signs for the company:** `SigningTile`, with `id="signatory"`.
  - **Templates.**
  - **Clause library and legal review (advanced):** `Library` inside a collapsed section with Show/Hide. It opens by default when the address has `#library` or `?library=`, so existing links keep working; find the current entry links.

## 4. Learning (R20)

### Migration `db/migrations/065_course_versions.sql`
- Creates `course_versions(id uuid pk default gen_random_uuid(), course_id uuid references courses on delete cascade, version int, title text, content jsonb, published_at timestamptz default now(), published_by uuid, unique(course_id, version))`.
- `IF NOT EXISTS` throughout, so running it twice is safe.

### Server: `academy.mjs`
- `snapshotCourse(db, courseId, user)` reads the course's title, lessons or cards, and quiz. It inserts with `ON CONFLICT (course_id, version) DO UPDATE` only while the version is current, so that re-saving without a bump refreshes the snapshot of the current version.
- It is called after each place where `version = version + …` runs on a published course (:247, :462, :520, :541) and when a course is published.
- **New actions:**
  - `academy.versions {course_id}` returns version, published_at, by and the number passed (`quiz_attempts.course_version`).
  - `academy.version {course_id, version}` returns the content.
  - `academy.similar` returns pairs of non-archived courses whose normalised titles are near-identical (shared tokens / small edit distance, done in JS) with the title, the number of lessons, assigned and passed.
- `academy.courses` rows add `assigned` (the `course_assignments` count).

### App
- **`team/_training.jsx` staff records** (and the profile Training tab, if it shares the logic):
  - No certificates and no to-do gives a grey **No training assigned**, in place of "No certificates yet" plus the green Up to date.
  - Certificates and no to-do gives a green **Requirements met**.
  - An outside certificate with `!verified || !has_file` adds a blue **Not checked** pill.
- **`team/Academy.jsx` Courses:**
  - A Required course reads "Required · N assigned", or "Required · nobody assigned yet · Assign", which opens the existing assign sheet.
  - Archived courses fold into one row, "N archived · Show", which loads them with `archived: true`. This replaces the checkbox.
  - A "Looks similar to …" link on paired rows opens `CompareSheet`, which shows both courses side by side with Open buttons.
- **`CourseEditor.jsx`:**
  - A hint next to the Required toggle.
  - A **Versions** section that lists versions and opens one read-only. Versions published before this release show the line "Published before versions were kept".
- **Officer Learn** (`learn/Card.jsx:69` and the list that renders it): an unavailable course or card becomes one muted line, "No longer available · your certificate stays valid". `learn/Course.jsx:22` stays as it is.

### Tests
- A snapshot is written when a course is published and again on the next version.
- `academy.similar` pairs near-identical titles and leaves different ones apart.

## 5. What's new
- **Card:** a new top card `compliance-and-history` (icon `ListChecks` or `History`) in `people/_whatsnew.jsx`, with 6–7 points written in plain business language.
- **Image:**
  - Add a prompt in `app/scripts/whatsnew-images.mjs`.
  - Run it **from the repo root**: `node app/scripts/whatsnew-images.mjs compliance-and-history`.
  - Check that `app/public/whatsnew/compliance-and-history.webp` exists and looks right.

## Mock (`/tmp/mock/server.mjs`)
- **`compliance.overview` rows:** 3 officers, with each of these:
  - an expiring licence (officer owner, 2 affected shifts);
  - an unverified upload (office);
  - a name mismatch (office);
  - a person on grace.
  Each row carries actions with ids.
- **New handlers:**
  - `compliance.document`: profile, upload and Orb values, with one mismatch;
  - `compliance.act`;
  - `audit.list` with `related`: 14 entries;
  - `academy.versions` / `version` / `similar`.
- **Changed handlers:**
  - `academy.courses` gains `assigned`, plus archived courses;
  - `academy.staffRecords` gets the none / met / not-checked states;
  - contracts rows get the version and superseded fields;
  - the strip summary has a toggle, `nosig.txt`.

## Verification
- `cd functions/api && npm test`: 368 plus the new tests.
- `cd app && npm run build`: ui-lint ≤70, emergency-check and flow-check.
- **agent-browser at 1280 and 390:**
  - **Compliance:**
    - the queue, owner pills and By person;
    - arrows, the panel table with Doesn't match, affected shifts and actions;
    - Verify then re-check refused;
    - the phone full screen and Back keeping its place.
  - **Security token:** no Correct and no History.
  - **History** on the staff profile, venue, shift, timesheet, invoice and contract, with Show more.
  - **Contracts:** the strip (and `nosig`), row version lines, Replaced by, and the Settings sections with Advanced collapsed. The old library link still opens it.
  - **Learning:** the three pills, Required · N assigned / nobody, archived folded, the Similar compare and Versions read-only. Officer Learn shows a gone course as one line.
  - **Console errors,** then `agent-browser close --all`.

## Release
1. **Commit** only the slice 10 files: the API modules, lib, tests, migration 065, app src, the What's new script and image. Leave the spec folders untracked.
2. **Migration:** apply 065 the same way 064 was applied (check the deploy notes and history for 064), then run `openkbs fn deploy api`.
3. **Site build:** `npm run build`, then commit `site/app` as "build: site with the tenth slice of the three-portal review".
4. **API check:** `grep -l 6ij75kpgf7kiwtvwo3nke763dm0oejxo site/app/assets/index-*.js`.
5. **Deploy and push:** `openkbs site deploy` (v207), then `git push --follow-tags`. Check that v207 is on the remote.
