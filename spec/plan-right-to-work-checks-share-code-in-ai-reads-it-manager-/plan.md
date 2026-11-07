# Implementation plan: right to work checks (share code → Compliance → GOV.UK check PDF)

## Context
The spec is approved (spec/plan-right-to-work-checks-share-code-in-ai-reads-it-manager-.md).

Staff send a share code, a picture, or both. The app reads the details into Compliance. The manager checks the code on GOV.UK by hand, uploads the PDF of the check page, and confirms the result. Only that confirmed check marks right to work as verified.

The Home Office has no API that employers can use, so the GOV.UK step itself stays manual.

## Data
**`functions/api/db/migrations/054_rtw_check.sql`**
```sql
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_checked_at timestamptz;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_checked_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_method text NOT NULL DEFAULT '';   -- 'share_code' | 'manual'
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_check_doc uuid REFERENCES documents(id) ON DELETE SET NULL;
```
- The share code lives in `documents.number` on `rtw` documents. Staff setup carries it in `details.rtw_share_code`.

## API (functions/api)

**1. New file `lib/rtw.mjs`** (pure functions, unit tested)
- `cleanShareCode(s)`:
  - strips spaces and dashes, uppercases;
  - requires `^W[A-Z0-9]{8}$`;
  - returns `'W12 345 678'`-style text, or null.
- `isShareCode(s)`.
- `GOV_CHECK_URL = 'https://www.gov.uk/view-right-to-work'` and `GOV_PROVE_URL = 'https://www.gov.uk/prove-right-to-work'`.
- `SHARE_CODE_DAYS = 90` and `rtwResultOf(read)`, which normalises the AI read of the GOV.UK PDF into:
  `{ name, permission: 'unlimited'|'time_limited'|'unknown', expiry, reference, check_date, concerns[] }`.

**2. `modules/documents.mjs`**
- **`docs.create`:**
  - for `kind === 'rtw'`, cleans `b.number` with `cleanShareCode` when it looks like a share code;
  - allows no `s3_key` only for `rtw` with a valid share code;
  - refuses anything else that has no file, keeping today's behaviour.
- **`docs.verify` on `rtw`:** stops setting `rtw_verified` and `rtw_expiry`. It only stamps `verified_by` and `verified_at` ("seen").

**3. `modules/officers.mjs`**
- Remove `rtw_verified` from `MANAGER_FIELDS`. `rtw_type` and `rtw_expiry` stay editable for corrections.
- Remove `rtw_verified` from the officers.save description in `lib/orbCatalog.mjs:20`.
- Add `rtw_checked_at`, `rtw_method`, `rtw_check_doc` and the checker's name (`LEFT JOIN users rc ON rc.id = o.rtw_checked_by`) to `officers.get`.
- **New `officers.rtwRead` (CO):** `{ s3_key, mime }`. Fetches the uploaded GOV.UK PDF or image and runs `extract()` with `HAIKU` and a `RTW_CHECK_TOOL` (same pattern as `readDocuments` in compliance.mjs:59). Returns `rtwResultOf(...)` so the sheet can pre-fill. It only reads and saves nothing.
- **New `officers.rtwCheck` (CO):**
  - **Input:** `{ id, method, s3_key, mime, permission, expiry, photo_matched, read }`.
  - **Validation:** `s3_key` is required (`docs/` prefix) and `photo_matched === true`. `time_limited` requires a future `expiry`.
  - **One transaction:**
    - insert a `documents` row: kind `rtw`, title "GOV.UK right to work check" (or "Right to work — manual check"), verified by the user, `ai_read`;
    - update officers: `rtw_verified = true`, `rtw_type = 'Share code'` or the existing type, `rtw_expiry` (null when unlimited), `rtw_checked_at = now()`, `rtw_checked_by`, `rtw_method`, `rtw_check_doc`.
  - Then `tickOnboarding(id,'rtw')` and `audit(user,'officer.rtw_check','officer',id,{method,permission,expiry})`.
- The new actions are added to the Orb catalog exclusions if needed. Orb should not call `rtwCheck`.

**4. `lib/staffSetup.mjs` and `modules/staffSetup.mjs`**
- `cleanStaffDetails`: optional `rtw_share_code`, using `cleanShareCode`; a bad value gives the error "Please check your share code (it starts with W)". It is not added to `PRIVATE_FIELDS`.
- `createFromSubmission`: if there is a share code, attach it as the `number` on the `rtw` file document. With no file, insert a file-less `rtw` document "Share code" with that number.

**5. `modules/compliance.mjs`**
- `READ_TOOL` gets a `share_code` property ("Right to work share code if shown, 9 characters starting with W").
- After a read in `readDocuments`: if `kind === 'rtw'`, the document has no number, and the read share code is valid, `UPDATE documents SET number = $2`.
- **In `officerIssues`** (for `!o.rtw_verified`), the latest `rtw` doc with a valid share code changes the issue:
  - `rtw:code_ready` "Share code ready to check on GOV.UK": severity `near(shifts)` or 'soon'; the detail gives the code and "Open their profile → Check right to work". It replaces `unverified:rtw` for that officer.
  - `rtw:code_old`, when the doc is more than 80 days old: "Share code is N days old — ask for a new one". Action: `remind(o,'rtw','a new share code')`.
- `rtw:no_record` (advisory): `o.rtw_verified && !o.rtw_checked_at`, "Right to work ticked by hand, no GOV.UK check saved". No action, and nothing is changed automatically.
- The rtw expiry rows get follow-up wording: "Follow-up right to work check due …".
- `area(key)` maps the `rtw:` keys to 'rtw'.
- The rtw `unverified:${doc}` "uploaded but not verified" issue is skipped for `rtw` docs that already have a `code_ready` issue, so there are no duplicates.
- The officers SELECT used by `computeIssues` must include `rtw_checked_at`.

**6. `jobs.mjs` `expiryAlerts`**
- The rtw message wording becomes "follow-up right to work check due". The dedupe key is unchanged.

## App (app/src)

**`pages/officer/Documents.jsx`**
- For `kind === 'rtw'`, the AddSheet shows:
  - a Segmented choice "Share code / Passport or other";
  - a share code input (uppercase, live-formatted, validated client-side with the same regex);
  - a link "Get a share code on GOV.UK".
- The file is optional when a valid code is given. `ok` is computed accordingly. The upload is skipped when there is no file.

**`pages/public/StaffForm.jsx`**
- An optional "Right to work share code" input next to the RTW file, with the hint "Starts with W — get one at gov.uk/prove-right-to-work. British or Irish passport holders can skip this."

**New `pages/people/RtwCheckSheet.jsx`**, opened from the profile's Right to work tile
- **Step 1, Find:**
  - the share code (from the latest rtw doc) and DOB, each with a copy button (reuse the `CopyLink`-style copy or `navigator.clipboard` with a toast);
  - a `Button` "Open GOV.UK check" → `window.open(GOV_CHECK_URL)`;
  - three short steps;
  - a "No share code (British/Irish passport)" toggle switches to manual steps.
- **Step 2, Upload:** pick a PDF or image, `upload(file,'officer')`, then `officers.rtwRead` shows a spinner and then the pre-filled result. A name mismatch shows a Callout warning.
- **Step 3, Confirm:**
  - Segmented "No time limit / Time-limited", with an expiry date;
  - a Toggle "I checked the photo matches this person";
  - Save → `officers.rtwCheck`.

**`pages/people/_profileTabs.jsx`**
- In the Right to work tile:
  - the primary "Check right to work" button (company role);
  - a status line: "Checked on GOV.UK by X, date · no time limit / follow-up by date", plus a "View check" link (`docs.url` of `rtw_check_doc`).
- `ComplianceSheet` loses the `rtw_verified` toggle and keeps `rtw_type` and `rtw_expiry` for corrections.
- The `docs.verify` confirm text for rtw becomes "Marks the upload as seen. Use Check right to work to record the GOV.UK check."
- The profile opens the sheet when the URL has `?rtw=check`.

**`pages/people/Compliance.jsx`**
- `openStaff` for rows with area 'rtw' navigates to `staff/:id?tab=compliance&rtw=check`.
- Check that `StaffProfile.jsx` reads `tab` from the query.

**What's new:** the card 'rtw-check' (icon BadgeCheck) in `_whatsnew.jsx`, with a prompt in `scripts/whatsnew-images.mjs`; generate the .webp.

## Tests (`functions/api/test/rtw.test.mjs`)
- `cleanShareCode`: valid, lower case with spaces, dashes, wrong first letter, wrong length, null.
- `rtwResultOf`: unlimited, time-limited with a date, bad date dropped.
- `cleanStaffDetails` with a good or bad share code.
- `officerIssues`:
  - a share code doc gives `rtw:code_ready` and no `unverified:rtw`;
  - a code 85 days old gives `rtw:code_old`;
  - verified without `rtw_checked_at` gives `rtw:no_record`.
- `officers.rtwCheck` refuses a security manager (403) and refuses missing `s3_key` or `photo_matched` (400), with input validated before any DB call.
- `MANAGER_FIELDS` no longer saves `rtw_verified`: if exported, assert it; otherwise skip.

## Release
- `cd functions/api && npm test`, `node app/scripts/ui-lint.mjs` (≤ 67), then `node app/scripts/whatsnew-images.mjs rtw-check`.
- Commit the source, then `openkbs fn deploy api -s 'rate(5 minutes)'`. Migration 054 runs on cold start; wake it with `staffSetup.info`.
- `cd app && npm run build`, commit site, `openkbs site deploy`, `git push origin master --tags`.

## Verification
- API tests pass.
- Local browser: add mock handlers to /tmp/ssmock.mjs for `docs.list` with a share code doc, `officers.rtwRead` and `officers.rtwCheck`. Then check:
  - officer AddSheet: share-code-only upload is enabled;
  - the staff profile tile;
  - the check sheet steps (copy, GOV.UK button, upload, pre-fill, confirm);
  - the Compliance row deep-link.
- Run `agent-browser close --all` after.
- Live: confirm the migration in the logs. No test data and no checks on live. The AI read of a real GOV.UK PDF gets confirmed when the user does their first check.
