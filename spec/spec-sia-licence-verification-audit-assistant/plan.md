# Implementation plan: SIA licence verification and audit assistant

## Context
This implements `spec/spec-sia-licence-verification-audit-assistant.md`, which is approved. The SIA has no API, so the app makes the manual check on the register fast:
- copy the details and open the register in one click;
- an assistant sheet with copy buttons and a result form;
- a history of every check that can't be edited or deleted.

A licence that is not Active blocks rostering and raises Ops AI cards.

What I found in the code:
- **Applicants are rows in `officers`** with `status 'applicant'` (`modules/apply.mjs:98`). One history table keyed on `officer_id` therefore covers applicants and staff, and nothing needs copying across at hire.
- `compliance(o)` in `modules/officers.mjs:22` feeds rota blocking (`checkOfficerForShift`, `modules/rota.mjs:19`). Adding the register status there blocks shifts with no rota changes.
- `officerIssues()` in `modules/compliance.mjs:103` is a pure function that produces Ops AI cards. It already has `unassign()` and `remind()` actions and the `near()` severity helper.
- `shapeOfficer` removes `dob` for everyone except company managers and the officer themselves (`PRIVATE`, `officers.mjs:14`).
- `audit()` is in `lib/audit.mjs`; `notify()` and `companyManagers()` are in `lib/notify.mjs`.
- Migrations run automatically from `db/migrations` (`lib/db.mjs:68`).
- The app already has `Sheet`, `Select`, `Field`, `Textarea`, `toast`, `Avatar`, `SIA_TYPES` (`pages/people/_parts.jsx:8`) and `siaFmt`.

## 1. Data: `functions/api/db/migrations/032_sia_checks.sql`
```sql
ALTER TABLE officers
  ADD COLUMN IF NOT EXISTS sia_status text NOT NULL DEFAULT 'pending'
    CHECK (sia_status IN ('pending','active','expired','suspended','revoked','investigation','not_found')),
  ADD COLUMN IF NOT EXISTS sia_last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS sia_last_verified_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS sia_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  checked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active','expired','suspended','revoked','investigation','not_found')),
  expiry date, sector text, licence_number text, notes text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sia_checks_officer ON sia_checks (officer_id, created_at DESC);
```
- Each existing applicant gets a check row backfilled from `applications.sia_checked_at` and `sia_checked_by`, with status `active` and a note "Marked checked before the assistant". Their officer row then shows the same last-checked data.
- The "date of birth" and "surname" fields in the request map to the existing `officers.dob` and `last_name` columns. The request's `sia_expiry_date` is the existing `sia_expiry`.

## 2. Backend
**New `functions/api/lib/sia.mjs`** holds the shared constants and pure helpers, so the tests can cover them:
- `SIA_STATUSES`, `NOT_CLEARED = ['expired','suspended','revoked','investigation','not_found']`, `STATUS_LABEL`, `RECHECK_DAYS = 90` and `SIA_REGISTER_URL`.
- `cleanSia(n)` strips everything except digits; `validSia(n)` checks there are exactly 16 digits.
- `ukDate(iso)` formats a date as DD/MM/YYYY; `maskDob(iso)` returns `••/••/YYYY`.

**New `functions/api/modules/sia.mjs`**, registered next to the other modules in the actions index:
- **`sia.details`** (MGR, `{ officer_id }`):
  - Returns `{ name, first_name, last_name, photo_url, roles, sia_type, sia_expiry, sia_status, number }` (the number comes from `officers.sia_number`, or else the applicant's `applications.ai.badge.number`), plus `dob`, `dob_masked` and `history` (the last 20 checks, with `checked_by_name`).
  - `dob` is the full DD/MM/YYYY for company and security managers, so the copy button works. The screen shows `dob_masked` to security managers.
  - Each call writes `audit(user, 'sia.details', 'officer', id)`, so every access to the DOB is logged.
- **`sia.record`** (MGR, `{ officer_id, status, expiry?, sector?, notes? }`):
  - Validates the status. Expiry is required unless the status is `not_found`. The sector must be one of `SIA_TYPES` or empty.
  - In one transaction: inserts a `sia_checks` row, then updates the officer's `sia_status`, `sia_last_verified_at` and `sia_last_verified_by`, plus `sia_expiry` and `sia_type` when given.
  - Writes `audit(user, 'sia.check', 'officer', id, { status, expiry, from_expiry })`.
  - If the status is not cleared, notifies company managers: severity critical, linking to the staff profile.
  - Returns the updated officer through `shapeOfficer`.
- **`apply.siaChecked`** stays for older clients but is no longer used by the app.

**`modules/officers.mjs` `compliance()`:** when the officer needs a licence and `NOT_CLEARED` includes `sia_status`, push the issue `SIA licence ${label} on the register`. That blocks rostering through `checkOfficerForShift`. `pending` does not block.

**`modules/compliance.mjs` `officerIssues()`** gets two new rules:
- **`register:sia`**, when the status is not cleared:
  - Severity is `urgent`.
  - The title is "SIA register shows the licence as Suspended", with a sig of the status and `sia_last_verified_at`.
  - Actions: `unassign(siaShifts)` (default true) when shifts exist, and `remind()`.
- **`recheck:sia`**, when the officer needs a licence, has `sia_number`, and either:
  - was never checked and has `siaShifts`, or
  - was last checked more than 90 days ago (`today` minus `sia_last_verified_at`).
  - Severity is `near(siaShifts)` when there are shifts, otherwise `advisory`.
  - The sig is the last-checked date, so the card goes away after a new check.
  - It has no actions; the card says "Use Verify SIA licence on their profile". Any existing "open profile" link pattern is reused.
- Skip `recheck` for applicants (`status 'applicant'`). The Recruitment page covers them.

## 3. App
**New `app/src/pages/people/SiaVerify.jsx`:**
- **`useSiaVerify()`** returns `{ start(o), sheet }`. `start` runs synchronously inside the click, which browsers need for clipboard access and new tabs:
  1. `cleanSia`, then `navigator.clipboard.writeText(digits)` with a toast saying it was copied, or that copying didn't work.
  2. `window.open(SIA_REGISTER, '_blank', 'noopener')`.
  3. Opens the sheet, which then loads `sia.details`.
- **`SiaVerifySheet`**, built on the existing `Sheet` (a bottom sheet on phones, a modal on desktop):
  - **Header:** `Avatar`, name, and the roles and licence type on file.
  - **Warning box** when the number isn't 16 digits.
  - **Copy chips:** Licence `XXXX-XXXX-XXXX-XXXX`, Surname, First name and DOB. They are small `Pressable` pills with a ✓ "Copied" state for 1.5 s. On screen, security managers see the DOB as `dob_masked`; the copy uses `dob`.
  - **Tip:** search by licence number first.
  - **Form:**
    - status, a `Select` with the six statuses;
    - expiry date, pre-filled from the profile;
    - sector, a `Select` of `SIA_TYPES`, pre-filled;
    - notes, a `Textarea`.
    - Warnings show while filling in: the expiry differs from the profile, or the sector doesn't cover their roles. The sector warning uses the role's `accepted_licences` if the roles are loaded; otherwise there is no warning.
  - **Footer:** Cancel and **Confirm & save check**. Saving calls `sia.record`, shows a toast, runs `onSaved`, and closes.
  - **History:** a collapsible list of past checks at the bottom.
- The 16-digit and date helpers are mirrored in a small `app/src/ui/sia.js`, with the register URL constant in one place.

**Wiring:**
- **`_profileTabs.jsx` `ComplianceTab`, SIA tile:**
  - Adds a "Verify SIA licence" button, shown to `isMgr` (company or security).
  - Adds a "Register" row showing a status pill (green Active, red for not cleared, grey Pending check) and "Checked 3 Nov 2026 by Sam K.". The pill turns amber when the last check is more than 90 days old.
  - `isMgr` is passed in from `StaffProfile.jsx`, next to `isCo`.
- **`DocumentsTab`:** SIA rows (`d.kind === 'sia'`) get a `ShieldCheck` IconButton, "Verify on SIA register", for managers. Managers can open the badge photo with the Eye button and check it in the same session.
- **`_application.jsx`:** the "Check SIA register" and "Mark SIA checked" buttons become one "Verify SIA licence" button, plus the last-check pill. `siaChecked` is removed from this page. Security managers can now check applicants too, if they can open the applicant page; this follows the existing page access.
- **`officers.get`** already uses `SELECT *`, so the new columns flow through. The checker's name for the tile comes from a join added to the profile query (`sia_last_verified_by_name`).
- **Help:** add a short "Checking an SIA licence on the register" entry next to the existing compliance help.

## 4. Tests: `functions/api/test/sia.test.mjs`
- `cleanSia` and `validSia`: spaces and dashes are stripped; 15 or 17 digits are invalid.
- `ukDate` and `maskDob` output.
- `compliance()` blocks for each not-cleared status, but not for `pending`, and not for a steward-only officer.
- `officerIssues()`:
  - suspended with shifts gives an urgent `register:sia` card with an unassign action;
  - never checked with an upcoming shift gives `recheck:sia`;
  - checked 91 days ago gives `recheck:sia`;
  - checked 10 days ago gives no card;
  - applicants get no recheck card.

## 5. Verification
- `cd functions/api && npm test`: all tests pass.
- `cd app && npm run build`: ui-lint stays at 67 or below. Use the `Pressable`/`Button` components, not raw `<button>`.
- Local check with the mock API from earlier (`/tmp/mock/server.mjs`, with `sia.details` and `sia.record` responses added), using agent-browser at 390×844 and 1280×800:
  - as a company manager: the Compliance tab tile, the sheet, the copy chips' "Copied" state, a save, and the pill;
  - as a security manager: the DOB is masked on screen;
  - as an officer: no button and no history.
  - Then `agent-browser close --all`.
- No test checks on live data. Live only gets the migration, which adds `pending` to everyone.
- Ship:
  1. Commit with the message `feat: SIA register verification assistant and check history`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  2. `openkbs fn deploy api -s 'rate(5 minutes)'`, which runs the migration.
  3. `openkbs site deploy`.
  4. `git push origin master --tags`.
- **Expected after deploy:** existing staff with upcoming shifts will get "Register check due" cards in Ops AI on the next 5-minute run, because nobody has been checked yet. That is what the spec asks for, and I'll tell the user.
