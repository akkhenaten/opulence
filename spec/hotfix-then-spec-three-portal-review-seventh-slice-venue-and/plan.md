# Build plan: hotfix (v203), then slice 7

## Context
- **Why the hotfix:** v202 crashes the company and security Timesheets page. `WeekStrip` reads `toReview`, which only exists in `Timesheets()`.
- **What slice 7 does** (spec approved, saved in `spec/hotfix-then-spec-…md`):
  - venue request wording and summaries;
  - billing empty states;
  - Back to Analytics;
  - titles and Back labels;
  - officer Me and Home order;
  - count-up only on first show.
- **App only, no API change.** The request summary is built in the app from the fields the list already returns (`starts_at`, `ends_at`, `headcount`, `role_name`, `kind`, `pattern`). The server `describe()` in `functions/api/modules/cover.mjs:86` already says "staff", not "officers".

## Step 0: Hotfix (released alone, before slice 7)
- **File:** `app/src/pages/shared/Timesheets.jsx`
  - Line 211: pass `toReview={toReview}`.
  - Line 254: add `toReview` to WeekStrip's props.
- **Check:** `npm run build`, then agent-browser as boss at 390 and 1280: the company Timesheets page loads, and the "N to review" chip matches the Needs review tab.
- **Release:**
  1. Commit `fix: company Timesheets week summary crash (v202)`.
  2. Commit the build (`site/app`).
  3. Check the Opulence API id with grep.
  4. `openkbs site deploy` (v203), then `git push --follow-tags`.

## Slice 7

### 1. Staff requests (R22): `app/src/pages/manager/_cover.jsx`, `venue/_requests.jsx`, `manager/Cover.jsx`
- **New helpers in `_cover.jsx`:**
  - `oneOffSummary({ date, start, end, headcount }, roleName)` returns "Fri 21 Nov, 22:00–04:00 (overnight), 2 door staff". It reuses `overnight` and `dateShort`/`dayLabel`.
  - `requestLine(c)` returns the same line for a list row. It uses `dayLabel(c.starts_at)` and `range()`, plus "· N dates" when grouped.
- **Repeating summary:** `patternSummary(v, roleName)` uses the role name in place of "officer(s)". The no-role fallback is "staff".
- **RequestForm:**
  - Title becomes "Request staff".
  - One-off mode gets `<Callout icon={CalendarDays}>{oneOffSummary(...)}</Callout>` once the fields are valid. The role name comes from `roles.find(r => r.code === v.role)`.
  - Submit stays "Send request".
- **Status labels:**
  - Venue side: `LABEL` becomes pending "Waiting for reply", accepted "Being staffed", filled "Staffed", cancelled "Cancelled". "Declined" stays.
  - Company side: the Cover.jsx tab "Staffing" becomes "Being staffed", and "Filled" becomes "Staffed".
- **Venue wording:**
  - In `_requests.jsx`, "booking" and "booked cover" become "request" or "confirmed request" (lines 40, 58, 69).
  - In `_cover.jsx` ChangeSheet, the title, button and confirm "Cancel cover" / "Change cover" become "Cancel request" / "Change request". The callout at line 170 becomes "This request is already confirmed…". The comment at line 8 changes too.
  - In Cover.jsx, the company's "Cancel cover" button becomes "Cancel request".
- **Request rows:**
  - In `_requests.jsx` CoverList and in Cover.jsx rows, the subtitle becomes `requestLine(c)`, with the venue name when there are several venues.
  - The title stays `role_name`, and the headcount moves into the line.
- **Sweep:** grep for "Request cover" and update any venue entry buttons, e.g. the venue rota and VenueDashboard. Leave the What's new history text and "Shift requests" alone.

### 2. Venue billing (R15)
- **`shared/Timesheets.jsx`:**
  - Venue `tools` only includes the Segmented control when `all.length > 0`.
  - Venue empty body: "No timesheets this week." with the line "Confirmed shifts show here once officers accept them."
  - In WeekStrip, `no_rate` and `unpaid_late` get `!isVenue &&`.
- **`money/Invoices.jsx` VenueInvoices:**
  - The Segmented control shows only when `rows.length > 0`.
  - The credit option shows only if `rows.some(i => i.kind === 'credit')`.
  - Add a venue body to the empty filters: outstanding "Nothing to pay. New invoices show here when the office issues them.", paid "No paid invoices yet.", credit "No credit notes."

### 3. Back to Analytics (R19)
- **Shared bar in `ui/index.jsx`:** add `BackTo({ to, label })`, the soft "Back to …" bar now in `Timesheets.jsx:199-203`. It uses history when the previous entry is the same path, otherwise `nav(to)`. It accepts in-app paths only (`/^\/[a-z]/`). Timesheets reuses it.
- **Parameter:** Incidents and Feedback already use `from` and `to` as dates, so the return path goes in a new parameter, `back=` (encoded path + query).
- **`money/Analytics.jsx` Sections:**
  - `ctx` gains `&back=${encodeURIComponent(location.pathname + location.search)}`.
  - Late and Absent tiles get `to={`${base}/timesheets?week=${mondayOf(range.to)}&venue=…&from=<same path>&from_label=Analytics`}`, which opens the last week of the period.
  - Pass `base` and the location into this section.
- **`shared/Incidents.jsx`** (and `money/Feedback.jsx`): read `sp.get('back')` and render `<BackTo to={back} label="Analytics" />` above the FilterChip. Clearing the period chip keeps `back`.
- **Feedback `clearF`:**
  - Replace `clearUrl()` with `setUrl({ tone: '', about: '', status: mgr ? 'open' : '', from: '', to: '' })`, so the venue and `back` stay.
  - Drop `shared.setVenueId('')`.
- **`money/VenueDashboard.jsx:271`:** the tile goes to `/venue/analytics?range=this` ("This month" in `PRESETS`).

### 4. Titles and Back (R03)
- **`money/VenueDashboard.jsx` 49/56:** `backLabel="Overview"`.
- **`shared/Live.jsx:70`:** the title is `user.role === 'venue' || board.venue ? 'On site' : 'Live'`, so venues see "On site" while loading.
- **`shared/IncidentDetail.jsx:37`:** the Back label is officer ? 'Reports' : 'Incidents'. The current check treats company and security like officers.
- **Officer pages:**
  - `Profile.jsx` title becomes "Profile and bank".
  - `Documents.jsx` title becomes "Documents and licence".
  - `TimeOff.jsx`: "Time off and availability" on both tabs. Back is fixed to Me, so switching tabs doesn't change it. History still wins when you came from Shifts, because Page uses `previousEntry`.
- **Back to Me:**
  - Add `back={{ to: '/officer/me', label: 'Me' }}` to the officer pages `Pay.jsx` (list), `Clock.jsx`, `Incidents` (officer branch in `shared/Incidents.jsx`) and `Help.jsx` (officer base only).
  - Page already prefers the real previous page and its title, so "where you came from" happens automatically. The fixed `to` is only the fallback for pages opened directly.
- **No change needed:** Contract, VenuePack, Thread, Quiz and Guide already go through Page's `back`. Page uses history first, so I'll only check them in the browser and fix any that set `to` without going through Page.
- **`money/PayRuns.jsx:53`:** no-access title becomes "Pay runs".
- **Venue info:**
  - `layouts/nav.js:54`: drop `phoneOnly` so the desktop sidebar shows "Venue info".
  - VenueDashboard gets a small "Venue info" soft link next to the venue subtitle (address, instructions, contacts, site pack) going to `/venue/site`.

### 5. Officer Me and Home (R02, R23, E24)
- **`officer/Me.jsx`:**
  - Move `{account}` out of the `Load` render function to after `</Load>`, so it shows on error and while loading.
  - Inside Load, while `tasks`, `contracts` or `fix` have neither data nor an error, show one muted line: "Checking your to-dos…".
- **`officer/Home.jsx`:**
  - Move `<InstallCard>` and `<PushCard>` from above `Load` to the end of the page.
  - In `Body`, render first: the issues and grace rows (split out of the List at 147-164), then `answer` on large screens or the AttentionDrawer on phones, then Next shift. Pay and SIA rows stay after Next shift.
  - While `ops` or `packsQ` are loading with no data, show "Checking your to-dos…" where the To do list goes.
  - `Nothing()` becomes one line: a Row with the CalendarDays icon, "Nothing booked", and right-hand "See open shifts" going to `/officer/shifts?tab=open`. The ink tile goes.
- **`ui/motion.js` `useCountUp(value, ms, key)`:**
  - A module-level `Map` keeps the last value shown per key. When the key was seen before, the number starts at its last value, so a remount after refresh doesn't roll up from 0. Reduced motion still shows the value straight away.
  - Callers in `ui/index.jsx` (362 Stat, 1091 Chip, 1173 AttentionDrawer) pass a key: the label, or the drawer id.

### 6. What's new card
- **Card:** `app/src/pages/people/_whatsnew.jsx` gets a new top card, `'requests-and-way-back'` (icon `Megaphone`). It covers points 1–5 in business wording and says "Cover requests are now called staff requests on the venue side".
- **Picture:** add a prompt to `app/scripts/whatsnew-images.mjs` and run `node app/scripts/whatsnew-images.mjs requests-and-way-back` from the root. This creates `app/public/whatsnew/requests-and-way-back.webp`.

## Mock additions (`/tmp/mock/server.mjs`)
- `cover.list`: one-off and repeating rows (pending, accepted, filled), plus `roles`.
- Venue `timesheets.week`: empty when `from` is a future week.
- `invoices.list`: empty for one venue id.
- Analytics `incidents` and `comments`: respond as now.
- `officers.get`: fails with a 500 when `localStorage['mock.fail']` is set. The mock reads an `x-mock-fail` header, or a token variant `officer-fail`.
- Officer dashboard `issues: ['SIA licence expired']`.

## Verification
- **agent-browser at 390 and 1280:**
  - **Venue:**
    - Request staff sheet: one-off and repeating summaries.
    - Request list lines and statuses.
    - Empty and populated Timesheets and Invoices.
    - Analytics → Incidents / Feedback / Late → Back to Analytics keeps the range. Clearing Feedback keeps the venue.
    - "Venue info" in the sidebar and on Overview.
    - Back labels read "Overview" and "On site".
  - **Officer:**
    - Me with `officers.get` failing still shows Account and Sign out.
    - Home order puts the "You can't work" row above Next shift; "Nothing booked" is one line; Install and Push sit at the bottom.
    - Titles and Back on Profile, Documents, Time off, Pay, Clock, Reports and Help.
    - Navigating away and back doesn't roll counts from 0.
  - **Company:** Timesheets (the hotfix), Cover tabs and labels, Incident detail Back "Incidents".
- **Build checks:** `npm run build` with ui-lint ≤70, emergency-check and flow-check passing. Then `cd functions/api && npm test` (359 pass, unchanged).
- **Release:**
  1. Commit the slice 7 files only (never `spec/live-spot-check-current-task/`).
  2. No function deploy.
  3. `npm run build`, then commit `site/app`.
  4. Grep the API id.
  5. `openkbs site deploy` (v204), then `git push --follow-tags`.
  6. Run `agent-browser close --all`.
