# Plan: automatic SIA register check via SIA Checker

## Context
The user doesn't want to type details into the SIA website: "when I press check register, the information should be put in by yourself."
- A web app can't fill in a form on another website, and the SIA register doesn't accept pre-filled links. Its routes are only `/search`, `/search/licence-number` and `/results`.
- The SIA has no public API (its FOI answer, 24 Aug 2026).
- The user chose **SIA Checker** (docs.siachecker.co.uk). It is a paid service that looks licences up on the public register for you.

The outcome: pressing **Verify SIA licence** makes Opulence's server ask SIA Checker. The result (status, expiry, licence type, name) fills the form, and the manager taps **Confirm & save**. A person still signs off each check, which was the recommended default. Checks run only when someone presses the button, so there are no background checks using up the allowance.

SIA Checker API (from its docs):
- `POST https://api.siachecker.co.uk/v1/licences/verify` with `Authorization: Bearer <key>` and body `{ "licenceNumber": "16 digits" }`.
- 200 returns `{ status: "FOUND", licence: { firstName, surname, licenceNumber, role, licenceSector, expiryDate: "YYYY-MM-DD", status: "Active" } }`.
- 202 means `PENDING` (resend), 404 `NOT_FOUND`, 409 `TOO_MANY_RESULTS`, 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 429 `QUOTA_EXCEEDED`, and 502/503 mean the SIA side is down.
- Results are cached for 24 h, and repeat lookups are free.

## Backend (`functions/api`)
1. **New `lib/siaChecker.mjs`**:
   - `autoCheckEnabled()` returns `!!process.env.SIACHECKER_API_KEY`.
   - `lookupLicence(number)`:
     - POST with `AbortSignal.timeout(8000)`.
     - On 202 PENDING, retry up to 3 times, 1.5 s apart.
     - Returns `mapResult(httpStatus, json)`.
   - `mapResult` is pure and exported for tests. It returns `{ outcome: 'found'|'not_found'|'pending'|'unavailable'|'quota'|'bad_key'|'error', status, expiry, sector, first_name, surname, role, register_status, message }`.
     - **Status:** register text maps to our values (`Active`→active, `Expired`→expired, `Suspended`→suspended, `Revoked`→revoked, anything with "investigation"→investigation). Anything else becomes `null`, so the manager picks it.
     - **Sector:** maps to `SIA_TYPES` in `lib/licences.mjs`: "Door Supervision"→Door Supervisor, "Security Guarding", anything with "CCTV"/"Public Space"→CCTV (Public Space Surveillance), "Close Protection", "Cash and Valuables in Transit", "Key Holding", "Vehicle Immobilis…"→Vehicle Immobilising. Unknown becomes `null`.
2. **`modules/sia.mjs`**:
   - `sia.details` gains `auto: autoCheckEnabled()`.
   - New `sia.lookup` (MGR):
     - Takes `officer_id`, runs `assertOfficerAccess`, and takes the number the same way `sia.details` does.
     - Fails 400 "No 16-digit licence number on file" unless `validSia`, and 503 "Automatic checks aren't set up" when there's no key.
     - Calls `lookupLicence` and adds `name_matches`, comparing surname and first name case-insensitively with the officer.
     - Runs `audit(user, 'sia.lookup', 'officer', id, { outcome, register_status })`. It doesn't change any data.
   - `sia.record` accepts `source: 'auto'|'manual'` (default manual) and stores it.
3. **Migration `db/migrations/033_sia_check_source.sql`**: `ALTER TABLE sia_checks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto'));`. The `history()` select includes `c.source`.
4. **`lib/guide.mjs`** (Help entry `sia_check`): rewrite it for the automatic flow. Keep the manual fallback text.

## Frontend (`app/src`)
1. **`pages/people/SiaVerify.jsx`**:
   - `start(o)` now only opens the panel. No copy and no `window.open`, so no popup problems on iPhone.
   - **When `d.auto` and the number is valid**, the panel calls `sia.lookup` on open (`useAction`/`api`) and shows "Checking the SIA register…". Then:
     - **Found:** a result card ("SIA register: Active · Door Supervision · Front Line · expires 26 Oct 2026 · ALEX RIVERTON"), and the form is pre-filled with status, expiry and sector, notes "Automatic check (SIA Checker)" and source `auto`. If `name_matches` is false, an amber warning says "The name on the register is different — check it's the right person."
     - **Not found:** pre-fill status `not_found`, with the amber hint "Not found — check the licence number on the profile."
     - **Pending / unavailable / error / quota / bad key:** a short message (for example "The SIA register isn't answering right now", or "Monthly check allowance used up"), a **Check again** button, and the manual section opened.
     - A **Check again** button is always available.
   - **Manual section** (the copy chips, the "Open register" link and the tips): collapsed under "Check on the SIA website instead" when auto is on, and shown as now when it's off. Tapping "Open register" also copies the licence number. That tap is a user gesture, so the clipboard works.
   - **History** shows "Automatic" or "Manual" next to each check.
2. **`ui/sia.js`**: no change except that `SIA_REGISTER` and `SIA_REGISTER_GOVUK` stay.

## Key setup
- After deploying, call `request_secrets` (fn `api`, key `SIACHECKER_API_KEY`, label "SIA Checker API key (siachecker.co.uk → your account → API keys)"), then `openkbs fn deploy api -s 'rate(5 minutes)'`.
- Until a key is saved, the panel works manually as it does today.
- The user signs up and pays at siachecker.co.uk. I can't do that for them.

## Verification
- **Tests**: `test/sia.test.mjs` adds `mapResult` cases: found Active with Door Supervision, Expired, not_found 404, pending 202, quota 429, bad key 401, 503, and an unknown sector or status. Then `npm test` (154 + new).
- **Build**: `npm run build` with ui-lint at 67 or below.
- **Mock**: add `sia.lookup` (found / not found / unavailable through env `SIAL`) and `auto: true` in `sia.details` to /tmp/mock. At 390×844, check the auto-fill, the name warning, the failure state, and the manual fallback when `auto` is false. Then `agent-browser close --all` and stop the servers by PID.
- **Ship**:
  1. Commit `feat: automatic SIA register check via SIA Checker`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  2. `openkbs fn deploy api -s 'rate(5 minutes)'`.
  3. `openkbs site deploy`.
  4. `git push origin master --tags`.
- **Live check**: once the key is in, run one lookup on a licence the user names, with their OK. It uses one check from their allowance and saves nothing until Confirm.
