# Implementation plan: "Join the team" recruitment pipeline

## Status (2026-11-05)
All code below is written and sitting uncommitted in the working tree. Checks so far:
- Backend tests: 149 pass, 0 fail.
- All 8 `apply.*` actions load from `index.mjs`.
- App build succeeds, with ui-lint at its baseline of 67 warnings.

**What's left, in order:**
1. Commit everything, including the spec file and the rebuilt `site/app` bundle. The message is `feat: online applications — Join the team → Recruitment` with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line.
2. From the project root, run `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`.
3. `git push origin master --tags`. This pushes to the Opulence remote only.
4. Run the read-only checks from the Verification section below. No real application gets submitted on live without the user's OK.

## Context
This plan implements `spec/spec-join-the-team-in-app-recruitment-pipeline.md`, which is approved. A public Apply page lets people send a CV and an SIA badge. AI reads both, the person lands in Recruitment → Applicants, and managers then invite or reject them. Applications that go nowhere are deleted after 6 months.

Existing code it reuses:
- The officers model with status `applicant`.
- The `documents` table, using `owner_type='officer'`.
- `lib/storage.mjs`: `uploadUrl`, `headObject`, `getObjectBytes`, `downloadUrl` and `deleteObject`.
- `lib/ai.mjs`: `extract`, `fileBlock` and `canRead`.
- `lib/docx.mjs` `docxToMarkup`, for Word CVs.
- `roles.accepted_licences`, to check that a badge covers the roles applied for.
- `demo.request`, as the pattern for the honeypot and IP rate limit.
- `sendRawEmail` and `emailHtml` for emails, plus `notify` and `companyManagers()`.
- `inviteOfficerLogin`, for the onboarding login invite.

## Data: `functions/api/db/migrations/031_applications.sql`
- Allow a new officer status. Drop and re-add the officers status check with `'rejected'` added.
  - The constraint name comes from `001_init` (likely `officers_status_check`). Use `ALTER TABLE officers DROP CONSTRAINT IF EXISTS …`.
- **`applications` table**, one row per online applicant:
  ```
  officer_id uuid PK → officers ON DELETE CASCADE
  roles text[], availability text[], availability_note text, rtw_confirmed bool, consent_at timestamptz
  ip text
  ai jsonb, ai_status text NOT NULL DEFAULT 'pending' CHECK (pending|done|failed|unread), ai_error text, ai_at timestamptz
  read_token text          -- one-time token so the Apply page can trigger the AI read
  sia_checked_by uuid → users, sia_checked_at timestamptz
  rejected_at timestamptz, seen_at timestamptz   -- seen_at null = "New"
  created_at, updated_at timestamptz DEFAULT now()
  ```
  Indexes: `(ip, created_at)` and `(ai_status)`.
- **`apply_uploads` table**: `(key text PK, ip text, kind text, created_at)`. It records which upload keys a visitor was given, so `apply.submit` only accepts its own keys. It also gives a per-IP upload limit.

## Backend
### `lib/licences.mjs`
- Add `'cv'` to `DOC_KINDS` and `DOC_LABEL.cv = 'CV'`.
- Add `APPLY_ROLES = ['door','guard','cctv','steward','close']`.

### `lib/ai.mjs`
Add `recruitment: 'Recruitment'` to `MODULE_NAMES`, so the read uses its own credit cap and usage line.

### New `lib/applicants.mjs`: pure logic plus the AI read
- **`applicationFlags({ applicant, ai, roles, today, duplicates })`** is a pure function. It returns `[{ key, severity, text }]`, with one flag per case:
  - badge expired, or expiring within 60 days
  - name on the badge differs from the applicant's name (case- and space-insensitive, first and last name tokens)
  - none of the badge's licence types is in `accepted_licences` for an applied role (roles where `requires_sia=false` are skipped)
  - badge or CV not readable
  - possible duplicates, listed by name
- **`readApplication(officerId)`**:
  - Loads the CV and badge documents.
  - Builds the content blocks:
    - PDF or image: `fileBlock`.
    - `.docx`: text from `docxToMarkup` (trimmed to about 30k characters).
    - `.doc` or unreadable files: skipped and flagged.
    - Files over 4.5 MB are skipped, as in `readDocuments`.
  - Makes one `extract({ module:'recruitment', tool: APPLY_TOOL, max_tokens: 1200 })` call. `APPLY_TOOL` returns:
    - `cv`: `{ readable, summary, years_experience, employers[], qualifications[] }`
    - `badge`: `{ readable, name, number, licence_types[] (enum SIA_TYPES), expiry }`
  - Saves `applications.ai`, `ai_status='done'` and `ai_at`.
  - Fills in the SIA document row's `number` and `expiry` if they are blank. The officer profile is only updated on invite.
  - On error it sets `ai_status='failed'` and `ai_error`. On a 429 the error message reads "AI paused (credit cap)".
- **`findDuplicates(officerId)`**: other officers with the same lower(email), the same digits-only phone, or the same `sia_number`.

### New `modules/apply.mjs`
Register it wherever the modules are combined; check `index.mjs` and `modules/index`.

Public actions:
- **`apply.uploadUrl`**: `pub`.
  - Input: `kind` (`cv|sia_front|sia_back`), `filename`, `content_type`.
  - Allowed types: PDF, `.docx`/`.doc`, and jpeg/png/webp/heic.
  - Limit: 15 per IP per hour. The IP comes from `requestContext.http.sourceIp`, as in `demo.request`.
  - It calls `uploadUrl('apply', …)`, records the key in `apply_uploads`, and returns `{ url, key }`.
- **`apply.submit`**: `pub`.
  1. Honeypot `website`: if filled, return `{ok:true}` and do nothing else.
  2. Validate the input:
     - Required: names, email, phone, postcode, at least one role from `APPLY_ROLES`, the right-to-work tick, the consent tick and the CV key.
     - The SIA front key is required unless the only role is steward.
     - SIA number, if given, is 16 digits after removing spaces.
     - Every key must be in `apply_uploads` for the same IP and created within the last 2 hours.
     - `headObject` must show the file is 10 MB or less.
  3. Rate limit: 5 applications per IP per hour, counted from `applications`.
  4. In a transaction:
     - **Dedupe**: if an officer with `status='applicant'` matches on lower(email) or the SIA number and has an applications row, update that officer and application. Otherwise insert an officer with `status='applicant'` and an applications row.
     - Insert `documents` rows: `cv` titled "CV", and `sia` titled "SIA badge (front)" / "(back)". Both have `uploaded_by` null, `owner_type='officer'`, and the mime type.
     - On a repeat application, delete the older application documents and their S3 objects.
     - Set `ai_status='pending'` and a new `read_token`, storing only its sha256 hash (as `lib/signLinks` does).
  5. Notify the company managers: `notify(ids, { kind:'applicant', title:'New application from {name} — {roles}', link:'/company/recruitment?applicant={id}', email:true })`.
  6. Email the applicant: "We've got your application", with Opulence branding from `getBrand()`.
  7. Return `{ ok:true, read_token }`.
- **`apply.read`**: `pub`.
  - Takes `{ token }` and finds the application by token hash where `ai_status='pending'`.
  - Clears the token, then calls `readApplication`.
  - The Apply page calls it without waiting, after showing the thank-you screen. The Lambda function URL finishes the run even if the tab closes.

Company-only actions (`def(CO, …)`, each one audited):
- **`apply.get({officer_id})`**: returns the application, AI results, `applicationFlags(...)` worked out live (including duplicates), the documents (id, kind, title, mime) and the officer's contact details. It also sets `seen_at`.
- **`apply.reread`**: sets `ai_status='pending'`, then runs `readApplication` in the same request.
- **`apply.siaChecked`**: sets `sia_checked_by` and `sia_checked_at` (call again with `undo` to clear them).
- **`apply.invite`**, in a transaction:
  - Set status to `onboarding`.
  - Copy the SIA number, type (first licence type) and expiry from the AI read onto the officer, only where those fields are empty.
  - Call `tickOnboarding` for the SIA document.
  - After the commit, if there's an email and no login, call `inviteOfficerLogin` and return `invite_link`.
- **`apply.reject({officer_id, email})`**: sets status `rejected` and `rejected_at`. If `email` is true, it sends the polite email ("Thank you for applying to {brand}… not able to offer you a role at this time…").

### Changes to existing code
- **`modules/hr.mjs` `onboarding.pipeline`**: LEFT JOIN `applications` and return `online` (bool), `seen` (bool) and `ai_status`. Also return `flag_count`, from a cheap SQL check: badge expiry from `ai->'badge'`, plus `ai_status <> 'done'`. The full flags come from `apply.get`.
- **`modules/officers.mjs` `officers.list`**: when no status filter is given, exclude `rejected` (`($1 IS NULL AND o.status <> 'rejected') OR o.status = $1`).
- **Status checks**: grep for code that lists all officer statuses, e.g. `shapeOfficer` and status labels in the app. Add a "Rejected" label where statuses are listed, and make sure the rota and compliance only use `active`/`onboarding`.
- **`modules/jobs.mjs` `runJobs`**:
  - Add `applicants` to the hourly block:
    - Catch-up AI reads: up to 3 applications with `ai_status='pending'` and `updated_at < now() - 2 min`.
  - Add a once-a-day retention job, using a marker row `ops_activity kind='applicant_purge'` with the London date:
    - Select officers with status `applicant` or `rejected` that have an applications row and `coalesce(rejected_at, updated_at) < now() - interval '6 months'`.
    - Delete their documents' S3 objects (`deleteObject`) and the document rows, then delete the officer (its tables cascade).
    - Remove any linked user that is not active.
    - Write an audit entry `applicant.purge` with the count.
  - Also delete `apply_uploads` rows older than 1 day, and the S3 objects for keys that were never submitted.
- **`lib/guide.mjs`**: add a Recruitment paragraph on online applications, AI reading, the SIA register check, invite/reject, and the 6-month deletion. Add the route note to `assistant.mjs` as well.

### Tests: `functions/api/test/apply.test.mjs`
- `applicationFlags` cases:
  - expired and expiring badges
  - name mismatch (and a match despite case or spacing differences)
  - door role with a "Security Guarding" badge is not covered; guard role with a Door Supervisor badge is covered
  - steward-only needs no badge
  - unreadable files
  - duplicates
- Role checks: `apply.uploadUrl`, `apply.submit` and `apply.read` are `pub`. `apply.get`, `apply.invite`, `apply.reject`, `apply.reread` and `apply.siaChecked` are company-only.
- Submit validation helper (export `cleanApplication(b)`): missing fields, bad email, SIA number format, roles outside the allowed list.

## App
- **`app/src/api.js`**: add `publicUpload(file, kind)`. It calls `api('apply.uploadUrl', …)`, then PUTs the file to the returned URL and returns the key. The existing `upload` stays as it is.
- **New `app/src/pages/public/Apply.jsx`**, routed at `/apply` with the public routes in `main.jsx` (lazy-loaded):
  - Layout:
    - Uses the `PublicSign` `Frame` style: Logo header, `max-w-2xl`, and `PoweredBy`.
    - Brand comes from `useAuth().brand`.
    - Title is "Join the {brand} team".
  - Built with `useForm`. Fields:
    - names, email, phone, postcode, optional SIA number
    - `Chips` for roles (labels from the spec)
    - `Chips` for availability (Weekdays / Weekends / Nights / Events), plus an availability note `Textarea`
    - file pickers for the CV (`.pdf,.doc,.docx,image/*`) and the SIA badge front and back (`image/*,.pdf`), with a 10 MB check in the browser and the file name shown once picked
    - `Check` for the right-to-work and privacy consent ticks
    - a hidden honeypot field
  - The privacy notice text follows the spec: what is collected, why, that AI reads the documents, and deletion after 6 months.
  - The badge field is hidden or optional when the only role picked is Steward.
  - On submit:
    - Uploads the files with a "Uploading…" busy state, then calls `apply.submit`.
    - Shows the thank-you screen.
    - Then fires `api('apply.read', {token}).catch(()=>{})` without waiting.
    - Errors are shown inline.
- **`app/src/pages/people/Recruitment.jsx`**:
  - `Card`:
    - Shows a "New" pill when `online && !seen`, an "Applied online" label, and a warning pill with the flag count when there is at least one flag.
    - For online applicants, clicking the card opens `ApplicationSheet` instead of the profile link.
    - Manual applicants are unchanged.
  - `?applicant=<id>` in the URL opens the sheet, for links from notifications.
- **New `app/src/pages/people/_application.jsx`**: `ApplicationSheet({ id, onClose, onDone })`, using `apply.get`.
  - Contact details, roles and availability (`KV`).
  - An "AI summary" `Section`: summary, years, employers and qualifications. While the read is pending it shows "Reading documents…", polling every 5 s.
  - An SIA section: number, types and expiry from the badge, and the checked status.
  - Flags, as pills or rows by severity.
  - Files: buttons that call `docs.url` and open the link.
  - Actions:
    - Check SIA register: an external link to `https://services.sia.homeoffice.gov.uk/rolh`.
    - Mark SIA checked.
    - Read again: shown when the status is failed or unread.
    - Invite to onboarding: shows `CopyLink` with the invite link if no email was sent.
    - Reject: a confirm sheet with a "Send a polite email" `Toggle`, on by default.
    - Open full profile.
- **Labels**: find the app's officer status label map (e.g. `format.js` or Staff) and add `rejected: 'Rejected'`.
- **`ui-lint`**: the baseline must stay at 67 or below.

## Landing site: `site/index.html`
Replace the mailto button with `<a class="btn" href="/app/apply">Apply now</a>`. Keep a small "or email us" text link for people who prefer email.

## Deploy
1. `cd functions/api && npm test`; `cd app && npm run build`.
2. Commit with the message `feat: online applications — Join the team → Recruitment`.
3. `openkbs fn deploy api -s 'rate(5 minutes)'` (migration 031 runs on the first call), then `openkbs site deploy`.
4. `git push origin master --tags`.

## Verification
- Tests and build pass.
- Check the live database for the `applications` table and the new status check.
- Read-only checks against production:
  - `apply.submit` with a honeypot value returns ok and creates no row.
  - `apply.get` without signing in returns "Please sign in again".
- Load `/app/apply` in agent-browser, check the form renders on a phone-sized screen, then close the browser.
- I won't submit a real application on the live system without the user's OK, because it would email the managers.
- I'll ask the user to send one test application from their phone, then check:
  - the confirmation email
  - the notification
  - the card in Applicants, with the AI summary and SIA details
  - invite and reject
