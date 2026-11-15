# Plan: Three-portal review, first slice of verified fixes

Spec: `spec/spec-three-portal-review-first-slice-of-verified-fixes.md`

## Context
The reconciled review's concrete faults were checked against the code. The medical icon crash looks fixed, but report pages have no error recovery. The contract task can lead nowhere, "Busiest hour: 00:00 (0)" shows on empty periods, the repeating-request rows overflow on phones, and Back from Time off falls back to "Me" when the page is opened directly. This slice fixes those five things. There is no database migration.

## 0. Reproduce first (no code)
- Sign in to the live app as a test officer (agent-browser). Open `/officer/incidents/new?type=<each type>` from `INCIDENT_TYPES` (`app/src/pages/officer/_parts.jsx:182`), plus the shift quick-report list in `app/src/pages/shift/ShiftView.jsx:40`, at 390px and desktop width. Nothing is submitted, and any draft that autosaves is discarded.
- If any type still throws, fix that actual cause as part of this slice before step 1.

## 1. Report pages recover instead of going blank (R01)
- **New** `app/src/ui/ErrorBoundary.jsx`: a class component (`getDerivedStateFromError` + `componentDidCatch`) that renders the existing `Page` / `Empty` / `Button` primitives from `ui/index.jsx`:
  - Title "Something went wrong with this report". Body: "Anything you'd written is saved as a draft." (Composer already autosaves drafts.)
  - **Try again** resets the boundary state. **Back** uses `nav(-1)` when `previousEntry()` exists (`ui/nav.js:51`), otherwise the role's home for shifts/incidents (`/officer/shifts`, `/<prefix>/incidents`, `/venue/...` incidents list).
  - Resets automatically when `location.key` changes, so moving away clears it.
  - `componentDidCatch` posts `client.error` with `{ page: location.pathname + search, type: ?type param, message, stack (first 1,000 chars), app_version: APP_BUILD }`. The call is fire-and-forget and never throws.
- **Wrap** every incident route element in `app/src/main.jsx`, for managers (lines ~208–211), officers (~347–350) and the venue incident routes: `incidents/new`, `incidents/:id`, `incidents/:id/edit`. Use a tiny `withReportGuard(el)` helper in main.jsx so each route stays one line.
- **Server** `functions/api/modules/appFeedback.mjs`: add `'client.error': def(ALL, …)`. It trims the fields (reusing the `cut` pattern from `checkFeedback`) and does `console.error('[client.error]', JSON.stringify({...fields, role: user.role, user_id: user.id}))`. There is no table and no email. Readable with `openkbs fn logs api`. Limit: ignore calls past 30 per user per Lambda instance (simple in-memory Map).

## 2. Contract task never dead-ends (R09 / E05)
- `functions/api/modules/hr.mjs` `onboarding.tasks` (line 178): for the `contract` row only, load the officer's newest contract (`SELECT id, status FROM contracts WHERE officer_id=$1 AND status <> 'void' ORDER BY sent_at DESC NULLS LAST LIMIT 1`):
  - `sent` → `to: /officer/contracts/<id>`, `office: false`.
  - None → `to: null`, `office: true`, `waiting: 'Waiting for the office to send your contract'`.
  - `signed` with the task still open → tick it with the existing `tickOnboarding(id, 'contract')` and return it done. This covers "clears once and stays gone", because signing already ticks it and this only repairs stragglers.
  - Other codes are unchanged. `ONBOARD_LINK.contract` stays as a fallback.
- Officer UI uses `t.waiting || 'Waiting on the office'` as the subtitle:
  - `app/src/pages/officer/Me.jsx:157–159`
  - `app/src/pages/officer/Home.jsx` (task rows, ~line 313: `sub: t.waiting || 'Waiting on the office'`)
- Old `Me#contracts` links: in `Me.jsx` (~line 169), when there are no contracts and `location.hash === '#contracts'`, render the Contracts section with the anchor and a one-line `Empty`: "No contract yet. The office will send it here."
- Manager UI `app/src/pages/people/_profileTabs.jsx` `OnboardingTab` (~line 893): for `t.code === 'contract' && t.waiting`, the button reads **Issue contract** (still `?tab=hr&sub=contracts`) instead of "Do it".
- Venues: nothing changes.

## 3. No busiest hour without data (R19 / E09)
- `app/src/pages/money/_parts.jsx` `HourStrip` (line 103):
  - If the total across hours is 0, render the strip plus "No incidents in this period" and no peak line.
  - Otherwise pick the peak by `n` desc, then hour asc, so a tie gives the earliest hour.
  - This one shared component covers both venue `Analytics.jsx:169` and company `Reports.jsx:167`.

## 4. Repeating request rows fit a phone (R22 / V01)
- `app/src/pages/manager/_cover.jsx` `DaysEditor` row (line 36):
  - Use `grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_minmax(52px,64px)] gap-1.5 sm:grid-cols-[44px_1fr_1fr_72px] sm:gap-2`.
  - Add `className="min-w-0"` and `inputClassName="min-w-0 px-2 sm:px-3"` to the three Inputs.
  - Verify at 390px and 360px. If time inputs still clip at 360px, add `max-[379px]:` rules that move Staff onto its own row (`col-span-full`).
- **New** `patternSummary(v)` in the same file, built from the form values with the existing `WEEKDAYS`, `overnight()` and `date()` helpers:
  - Days sharing the same start, end and headcount are grouped: "Every Fri and Sat, 22:00–04:00 (overnight), 2 officers".
  - Different groups are joined with "; ". "Every 2 weeks" when the frequency is fortnightly. Then "from 21 Nov", plus " until 16 Jan" when there is an end date.
  - Shown as a `Callout` above the Notes field in `RequestForm` when `rec && daysOk(v.days)`. The same summary goes in `ChangeSheet`'s future-scope editor if it uses `DaysEditor`.
- One-off requests and desktop layout are unchanged.

## 5. Back from Time off opened directly (R03 / E10)
- `app/src/pages/officer/TimeOff.jsx:20–22`: the fallback is `tab === 'availability' ? { to: '/officer/shifts', label: 'Shifts' } : { to: '/officer/me', label: 'Me' }` (both Page usages).
- History-based Back already returns to the real origin. `useUrlState` uses `replace` (`ui/nav.js:16`), so tab switches add no extra Back steps. No change is needed there.

## 6. What's new card
- Add a top entry to `UPDATES` in `app/src/pages/people/_whatsnew.jsx` (date `2026-11-15`, slug `review-fixes`, icon e.g. `ShieldAlert`). It's written for the business: reports recover instead of going blank, the contract step says who it's waiting on, analytics no longer claims a busiest hour with no incidents, repeating requests fit phones with a summary, and Back from availability returns to Shifts.
- Add a `'review-fixes'` prompt to `PROMPTS` in `app/scripts/whatsnew-images.mjs` and run `node app/scripts/whatsnew-images.mjs review-fixes`.

## Files
- New: `app/src/ui/ErrorBoundary.jsx`
- Edit: `app/src/main.jsx`, `functions/api/modules/appFeedback.mjs`, `functions/api/modules/hr.mjs`, `app/src/pages/officer/Me.jsx`, `app/src/pages/officer/Home.jsx`, `app/src/pages/people/_profileTabs.jsx`, `app/src/pages/money/_parts.jsx`, `app/src/pages/manager/_cover.jsx`, `app/src/pages/officer/TimeOff.jsx`, `app/src/pages/people/_whatsnew.jsx`, `app/scripts/whatsnew-images.mjs`

## Deploy
1. `cd app && npm run build`. This runs the ui-lint, emergency and flow checks, then outputs to `site/app`.
2. Commit `feat: …` (source and What's new card), then `openkbs fn deploy api`.
3. Commit `build: site with …` (`site/app`), then `openkbs site deploy`.
- Before testing sign-in on the live build, check that it calls Opulence's API (per memory).

## Verification (live, test records only, agent-browser at 390px and desktop)
- Every incident type opens. To prove recovery, temporarily throw from the Composer in a local `vite` dev run (not shipped): the recovery screen appears, Back returns to the shift, Try again re-renders, and `openkbs fn logs api` shows `[client.error]` after a real deploy test via `openkbs fn invoke api -d '{"action":"client.error",...}'`.
- `openkbs fn invoke api` for `onboarding.tasks` with a test officer that has no contract returns `waiting`. The officer's Me and Home show the waiting text with no link. The manager profile shows Issue contract. After `contracts.send` to that officer, the task opens `/officer/contracts/<id>`. After signing it's done, and stays done on reload. Opening `/officer/me#contracts` with no contract shows the note.
- Venue Analytics for a period with no incidents shows "No incidents in this period". A period with incidents shows the right hour. Company Reports behaves the same.
- Venue Request cover → Repeating with Fri and Sat at 390px and 360px: no horizontal scroll, all inputs usable, and the summary text matches.
- Open `/officer/time-off?tab=availability` fresh: Back reads "Shifts" and goes there. From Shifts in-app, Back still returns to Shifts.
- "No change" checks: venue account sees no contract UI, officer has no analytics, and the manager's received request list is unchanged.
- `agent-browser close --all` when done.
