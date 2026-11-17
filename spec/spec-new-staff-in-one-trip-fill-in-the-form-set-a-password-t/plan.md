# Plan: New staff in one trip — form with password, office taps Make live

## Context
Right now the shared staff form only gets a new officer halfway. It has no password. Only the platform admin sees the submission. There are two create buttons, and a second invite email is needed before the officer can sign in. The SIA back and the right-to-work answers don't land in their sections.

The approved spec, saved earlier: officers set their password on the form. Company managers and the platform admin see new forms in People, Needs you and the bell. One **Make live** tap creates the active staff record and an active Officer app login with their own password, then sends a "You're live" email.

## Data
- **New migration** `functions/api/db/migrations/067_staff_setup_password.sql`:
  - `ALTER TABLE staff_setup_submissions ADD COLUMN IF NOT EXISTS password_hash text;`
  - It is applied automatically by `migrate()` in `lib/db.mjs` on the next API run.
  - The hash is kept only in this column, never in `details`. `list`/`get` never return it; they return only `has_password: bool`.

## Server — `functions/api`
### `lib/staffSetup.mjs`
- **Uploads:**
  - `SETUP_FILES` gains `sia_back: 'SIA badge (back)'`.
  - `rtw` is relabelled "Passport or ID photo page".
  - `DOC_KIND` gains `sia_back: 'sia'`. The passport is filed as `id` instead of `rtw`, so Orb's passport read in `docAuto` can verify right to work. The share code stays as an `rtw` document.
- **Field-level errors.** `cleanStaffDetails` returns `{ error, field }` (for example `field: 'postcode'`). The existing messages stay the same.
- **Password check.** New `checkSetupPassword(pw, confirm)`. It returns `{error, field:'password'|'password_confirm'}`. The rule is the same as `checkPw` in `modules/auth.mjs:25` (at least 8 characters), plus the two entries must match.

### `modules/staffSetup.mjs`
- **`staffSetup.submit` (pub, officer kind):**
  - Runs `checkSetupPassword`.
  - If `users` already has that email, it fails with `409 'This email already has a login. Sign in, or ask the office to update your details.'` and `{field:'email'}`.
  - It inserts `password_hash = hashPassword(pw)` (from `lib/auth.mjs`).
  - It notifies company managers as well as platform admins, linking to `/company/staff?forms=1`.
  - Errors carry `field` in `extra`.
- **Who can act.** `list` / `get` / `create` / `discard` change from `plat` to `def(CO, …)` for officer forms. Venue-manager forms (`kind:'venue'`) still check for the platform admin inside the action. `link` / `toggle` / `rotate` stay `plat`.
- **`createFromSubmission` becomes Make live:**
  - **Race guard.** It claims the row with `DELETE … WHERE id=$1 RETURNING *` inside the transaction. If no row comes back, it fails with `409 'Already made live'` and `{officer_id}` when it can find one.
  - **Duplicates.** The existing `assertNotDuplicate` / `duplicateOf` checks for email and SIA stay. A 409 carries `{officer_id}` so the sheet can offer Open their page.
  - **With `password_hash`,** in the same transaction:
    - insert `users` with role officer, `status 'active'`, that `password_hash`, and no `invite_token`;
    - link `officers.user_id`;
    - reuse the `linkableManager` check from `modules/officers.mjs`.
  - **After commit:**
    - `celebrate({type:'welcome', …})` when `welcomeDue`, as in `acceptInvite`;
    - send the "You're live at <company> — sign in with <email>" email through `sendRawEmail` + `emailHtml` (link `/login`).
  - **Without `password_hash` (older forms):** the current `createOfficerLogin` + `sendInviteMail` path.
  - **Files.** SIA back is filed as an `sia` document. The passport is filed as `id`.
  - **Return value:** `{ id, name, live:true, emailed, rtw_checked, invited? }`. The `invite` parameter goes away, and the Orb catalog entry keeps working.
- **`auth.login` (`modules/auth.mjs:43`).** If there is no user but an officer submission with that email exists, it fails with `401 "The office hasn't finished checking your details yet."`.

### To-do list
- `modules/todo.mjs`: add `SQL.staffForms`, which counts officer-kind submissions. It is counted for company managers (and so for the platform admin), not for security managers.
- `lib/todo.mjs` `summarise`: add the item "New staff forms" → `/company/staff?forms=1`. It then shows in Needs you and the bell.

## Client — `app/src`
- **`pages/public/StaffForm.jsx`:**
  - **Cards, in order:**
    - You;
    - Contact & address (the email hint says "you sign in with this");
    - SIA (number, expiry, front + back);
    - Right to work (share code with the GOV.UK link, plus the passport upload);
    - Pay;
    - Emergency contact;
    - Other documents (proof of address, photo);
    - Your password (password + confirm, with the hint);
    - Consent.
  - **Field errors** come from `e.data.field` and show under that field, which is scrolled into view.
  - **The done screen** shows the sign-in email and a sign-in link.
- **New `pages/people/_staffForm.jsx`:**
  - Holds the review sheet moved out of `StaffSetup.jsx`. It is laid out in sections:
    - You, Contact, SIA (front/back thumbnails);
    - Right to work (share code, **Check on GOV.UK**, passport);
    - Pay (private, with Show);
    - Emergency, Documents.
  - **Status line** ("Ready to work once live" / "can't be rostered until: …"). It is computed from the same fields `blockers()` uses: SIA number + expiry, and RTW, which isn't checked at Make live unless Orb verifies it.
  - **Possible duplicate:** a callout with Open their page.
  - **Buttons:** Discard (confirm) and **Make live**. For forms without a password, the sheet notes "No password on this form — we'll email them an invite link."
  - **Make live** calls `staffSetup.create`, then `docs.read`, shows the toast "<Name> is live", and navigates to `/company/staff/<id>?tab=compliance` (if RTW isn't checked) or the overview.
  - Also exports `StaffFormsCallout`, which lists the forms and opens the sheet.
- **`pages/people/Staff.jsx`.** A callout at the top, "N new staff forms to check", for company managers. `?forms=1` opens the list.
- **`pages/people/StaffSetup.jsx`.** Keeps the link cards and lists, and uses the shared sheet.
- **What's new.** A card in `pages/people/_whatsnew.jsx`, plus a prompt in `app/scripts/whatsnew-images.mjs`. Generate the image with `node app/scripts/whatsnew-images.mjs <key>`.
- **Mock API** (`/tmp/mock/server.mjs`) gets handlers for local preview: submit, list, get, create.

## Tests — `test/staffSetup.test.mjs`
- Update the gate test: list/get/create/discard are open to company managers; link/toggle/rotate stay platform-only; venue kind stays platform-only.
- `cleanStaffDetails` returns `field`.
- `checkSetupPassword`: too short, mismatch, good.
- `sia_back` is accepted, and `DOC_KIND.rtw === 'id'`.
- Then run `npm test`, where all 443+ must pass.

## Release
1. `cd functions/api && npm test`
2. Lint the changed jsx; ui-lint must stay at or below 73.
3. Commit.
4. `openkbs fn deploy api` (the migration runs on first call).
5. `cd app && npm run build`, then grep `site/app` for the API id `6ij75…`.
6. Commit `site/app`.
7. `openkbs site deploy`
8. `git push`

## Verification
- **Local preview** with the mock: the form shows its sections, password card, field errors and the done screen. People shows the callout, the sheet and Make live, then lands on the person's Compliance tab.
- **Live, test data only** (`*@example.test`):
  - submit the form with a password;
  - sign in before Make live and get the "office hasn't finished" message;
  - as the company manager, the People callout and Needs you count are there;
  - Make live, then sign in with the form's password;
  - re-submitting the same email is blocked;
  - Discard a second test form.
  - Afterwards, remove the test person and login.
- Run `agent-browser close --all` when done.
