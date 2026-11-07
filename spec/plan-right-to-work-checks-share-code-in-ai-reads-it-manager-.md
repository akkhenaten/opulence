# Plan: right to work checks — share code in, AI reads it, manager checks on GOV.UK and uploads the PDF

## Context
The user asked how to check staff right to work (RTW) when officers send a share code, and whether the check can be automatic.

**Facts that shape the plan**
- The Home Office offers no API that employers can use. The legal check is the employer using GOV.UK "View a job applicant's right to work details" (https://www.gov.uk/view-right-to-work) with:
  - the share code (9 characters, starting with W);
  - the person's date of birth.
- The manager must then:
  - check that the photo matches the person;
  - save the profile page as a PDF;
  - keep it for the length of employment plus 2 years.
- A screenshot of the share code, or of a passport, that the officer uploads is **not** a valid check on its own. A share code lasts about 90 days.
- Time-limited permission needs a follow-up check before it expires.
- So the app can't do the check itself. It can gather everything, read it with AI, take the manager straight to GOV.UK, store the PDF as the record, and chase follow-ups.

**User's wish (verbatim)**
"When staff upload their share code, we should have a pipeline to add the sharecode or picture into the compliance bit, picks details and when we check manually be able to upload a pdf of the check page."

**What exists today**
- `officers.rtw_type`, `officers.rtw_expiry` and `officers.rtw_verified`, with no record of who checked, when, or how.
- `documents` rows of kind `rtw`. The officer can type a share code into the free-text `documents.number` (`app/src/pages/officer/Documents.jsx:12`).
- The staff setup form (`app/src/pages/public/StaffForm.jsx`) takes an optional RTW file but no share code. It already collects DOB.
- The AI scan read is `readDocuments()` in `functions/api/modules/compliance.mjs:59`, which already reads `rtw`. The issue rules are at lines 181 and 225–256.
- `docs.verify` (`modules/documents.mjs:68`) marks `rtw_verified` from the scan. That is not a real RTW check.
- Expiry alerts: `jobs.mjs:95` `expiryAlerts()` already covers `rtw_expiry` at 60, 30, 7 and 0 days.

## Change

### 1. Share code captured everywhere staff send RTW
- **Officer app, Documents → Right to work** (`officer/Documents.jsx`):
  - a choice of "I have a share code" or "British/Irish passport or other document";
  - a share code field, validated and stored as `W12 345 678`-style uppercase in `documents.number`;
  - an optional photo or screenshot, so a share code alone, with no file, is allowed;
  - a link to "Get a share code" (gov.uk/prove-right-to-work).
- **Staff setup form** (`StaffForm.jsx`, `lib/staffSetup.mjs`): an optional `rtw_share_code` field, cleaned and validated.
  - On Create profile, it becomes an `rtw` document with the number set (and the uploaded file, if any).
- **New pure helper** `cleanShareCode()` in `functions/api/lib/rtw.mjs`: 9 letters and digits, first letter W, returned formatted. It has unit tests.
- **`docs.create`** accepts kind `rtw` with a number and no file when the number is a valid share code.

### 2. Into Compliance automatically, with the details picked out
- **AI read:** `READ_TOOL` gains a `share_code` property. `readDocuments()` already reads `rtw` scans.
  - If a share code is read from a picture and the document has no number, the read value fills `documents.number`.
  - The AI also reads name, expiry and document type, as it does today.
- **New compliance rules** in `officerIssues()`:
  - "Right to work: share code ready to check" (soon, or urgent if rostered). The action is "Check on GOV.UK", which opens the staff profile's check sheet.
  - "Share code is over 80 days old — ask for a new one" (advisory). The action reminds the officer.
  - "Right to work marked checked but no GOV.UK check saved" (advisory) for older records that were ticked by hand. Nothing is changed automatically.
  - "Follow-up check due" when a time-limited `rtw_expiry` is within 30 days. This reuses the existing expiry logic. The wording changes to "do a follow-up check".
- **The Compliance page** already lists these under the "Right to work" filter. No page rebuild is needed.

### 3. Manager's "Check right to work" sheet (staff profile)
- Replaces the RTW half of `ComplianceSheet` in `app/src/pages/people/_profileTabs.jsx`. It opens from the profile, the Documents tab, and the Compliance issue.
- **Step 1:** the share code and date of birth, each with a Copy button, plus an "Open GOV.UK check" button (https://www.gov.uk/view-right-to-work, new tab).
  - Short steps: enter the code and DOB, check the photo matches the person, download the PDF.
  - If they have no share code (British/Irish passport): manual check steps (see the original in person, copy it, date it) and an upload of the copy.
- **Step 2:** upload the GOV.UK PDF. Uses the existing `upload()`, stored as `documents` kind `rtw`, title "GOV.UK right to work check".
  - The AI reads it straight away, and the sheet pre-fills the result: name, permission type, expiry or "no time limit", and the reference.
  - It warns if the name doesn't match the profile.
- **Step 3:** confirm the result:
  - Unlimited, or Time-limited until a date. Time-limited sets `rtw_expiry`.
  - Tick "I checked the photo matches this person".
  - Saving sets `rtw_verified` and records the check.
- **New action `officers.rtwCheck`** (company role), so the record can't be saved without the PDF or the manual copy. It saves:
  - `rtw_verified`, `rtw_type`, `rtw_expiry`;
  - the check document, marked verified by the manager;
  - an audit entry `officer.rtw_check`.
- **`docs.verify`** on an `rtw` scan no longer sets `rtw_verified`. It only marks the scan as seen, and the confirm text points to "Check right to work".
- **Profile Documents/compliance area:** shows "Right to work checked on GOV.UK by Ana, 7 Nov 2026 · no time limit / follow-up by 3 Mar 2027", with the PDF one tap away.

### 4. Data
Migration `054_rtw_check.sql`, adding to `officers`:
- `rtw_checked_at timestamptz`
- `rtw_checked_by uuid REFERENCES users`
- `rtw_method text` ('share_code' | 'manual')
- `rtw_check_doc uuid REFERENCES documents`

The share code stays in `documents.number`. It is not private data, but it is shown only to managers and the officer, as documents are today.

### 5. Orb and the release
- `orbCatalog`: Orb can list "share codes waiting to be checked". Read-only. Orb can't do the check.
- A What's new card plus its picture (memory rule): prompt in `app/scripts/whatsnew-images.mjs`, card in `_whatsnew.jsx`.

## Verification
- **API tests:**
  - `cleanShareCode` (valid, lower case, spaces, wrong first letter, wrong length);
  - the staff setup share code becomes an `rtw` document;
  - `officers.rtwCheck` refuses without a PDF, and is company-only;
  - the compliance rules: share code waiting, old share code, ticked without a check, follow-up due;
  - `docs.verify` on `rtw` no longer sets `rtw_verified`;
  - all existing tests pass.
- ui-lint stays at 67 or below; the vite build passes.
- **Local browser against the mock** (/tmp/ssmock.mjs, vite):
  - an officer adds a share code;
  - the Compliance row appears;
  - the manager sheet: copy, open GOV.UK, upload a sample PDF, pre-filled result, save;
  - the profile shows the check line.
- **Live:** deploy the API and site, and push. No test data on live. The AI read of the GOV.UK PDF can only be confirmed when the user uploads a real check.
