# Build plan: UI / UX review (spec saved in `spec/ui-ux-review-opulence-app-desktop-mobile.md`)

## Context
The approved review found three high-impact problems:
- **Officers' shift-time actions are buried.** Clock in and Report incident sit below banners and cards.
- **Live operations on phones puts Orb's queue above the board.** The board itself also has two filter controls for the same filter.
- **Lists forget their filters, and every detail opens as a centred modal.** Many records and forms also lack a sticky save or a guard against losing changes.

It also has a page-by-page table of smaller fixes. This plan builds all of it.
- **Front end only.** No API changes and no new data: every page reuses the actions it already calls.
- **Role checks unchanged.** Venue logins never see staff pay; Pay tabs stay behind `canSeePay`.

## Shipping
Three releases. Each one follows the usual steps:
1. Commit (staging paths explicitly, since another chat edits this tree).
2. `npm run build` in `app/`.
3. Commit `site/`.
4. `openkbs site deploy`.
5. Push with tags.

Each release also has its own What's new card with an AI picture, in the same commit (`app/src/pages/people/_whatsnew.jsx`, a prompt in `app/scripts/whatsnew-images.mjs` run from the project root, and the image in `app/public/whatsnew/`).
- **R1:** shared pieces, the officer shift bar, Live operations.
- **R2:** lists and drawers, the Staff and Venue records, Settings.
- **R3:** everything else in the table.

---

## R1. Shared pieces (`app/src/ui/`)
1. **`useUrlState(defaults)`** in `ui/nav.js`.
   - Wraps `useSearchParams`. Returns `[state, set, clear]`.
   - Writes with `replace: true`, so Back still leaves the page; default values are dropped from the URL.
   - Back already restores scroll through `useScrollMemory`, so filters and position come back together.
2. **`Sheet` gains `side` and `full` options** in `ui/index.jsx`.
   - `side`: from lg up, a right-hand drawer (480px, full height). It slides in from the right and has no backdrop blur, so the list stays readable. Below lg it falls back to the bottom sheet.
   - Optional `onPrev` / `onNext`: ↑/↓ keys and two header icon buttons move between records. Pages pass these from their list order.
   - `full`: below sm the sheet becomes full screen (100dvh, no drag-to-close, sticky footer). Used for long forms.
   - Both are opt-in props, so existing sheets don't change.
3. **`dirty` prop on `Sheet`** plus a **`useDirtyGuard(dirty)` hook**.
   - With `dirty`, closing by X, Escape, backdrop or drag asks through the existing `useConfirm`: "Discard changes?", buttons "Keep editing" / "Discard".
   - `useDirtyGuard` covers pages:
     - `beforeunload`, the same pattern as `pages/people/procedures/Editor.jsx`.
     - A capture-phase click listener on in-app `<a>` links that confirms before navigating.
     - The app uses `BrowserRouter`, so `useBlocker` isn't available.
4. **`Tabs` on phones.** The native "Section" select for more than 5 tabs is replaced by the scrolling `Segmented` row, with an edge-fade mask. The selected tab is already scrolled into view.
5. **`FilterBar`** (new, in `ui/index.jsx`).
   - Props: `filters: [{key,label,value,options,display}]`, `onChange`, `onClear`.
   - From sm up the filters render inline as `Select`s. On phones they collapse into a **`Filters (n)`** button that opens a bottom sheet with "Clear all" / "Apply".
   - Below it, an **active-filter row** of removable chips ("Crown & Anchor ✕") plus **Clear all**. Shown at every width.
6. **`SplitButton`** (new): a main button with a ▾ that opens the existing `MoreMenu` sheet of alternatives. Tab-focusable, with `aria-haspopup`.
7. **Small fixes in the same file:**
   - `Segmented` option `min-h` goes from 38 to 44px.
   - Chips get a visible `focus-visible` ring.

## R1. Officer shift bar
- **New file `app/src/layouts/ShiftBar.jsx`**, mounted in `layouts/Shell.jsx` for the officer side, above the tab bar.
- **Data:** `useApi('clock.status')` with a 60s poll, the same as `pages/officer/Home.jsx:23`. Reuse `clockOpensAt` from wherever Home imports it.
- **When it shows:** while clocked in, or within the clock-in window (from opening until the shift ends).
- **Contents:**
  - Status text ("On shift · since 21:02" / "Clock-in opens 20:45").
  - Primary **Clock in** / **Clock out** / **End break**, linking to `/officer/clock`.
  - Icon buttons **Report incident** (`/officer/incidents/new`, only once that's allowed) and **Emergency** (red, `/guide/emergency` or flow when `flow_visible`).
- **Layout:**
  - New CSS variable `--shiftbar-h`, added to `--tabbar-h` consumers (`.action-bar`, Page bottom padding, the IncidentForm footer) in `styles.css`.
  - Hidden on `/officer/clock`, the incident form and the guide.
- **`pages/officer/Home.jsx`:**
  - The Next shift tile moves first.
  - Offer, chase, "can't work" and SIA tiles become one-line rows below it, each opening its page (offers → `/officer/shifts?tab=offers`).
- **`pages/shift/ShiftView.jsx`, officer view:**
  - The Report-incident tiles move directly under the header card.
  - Disabled tiles carry a caption: "Opens 1 hour before your shift".
- **`pages/officer/Clock.jsx`:** pass step numbers into the step heading ("Step 2 of 4").

## R1. Live operations (`pages/shared/Live.jsx`, `pages/manager/OpsAI.jsx`)
- **Tabs (managers):** `Board` · `To approve (n)` · `Activity` · `Settings`.
  - The `To approve` tab renders only below lg; `useMediaQuery` or a CSS-hidden tab plus a lg redirect to Board.
  - From lg the OpsPanel stays in the right-hand column, as now.
  - Below lg the Board no longer renders the OpsPanel.
- **Filter:**
  - The Segmented duplicate is removed.
  - One chip row: All · On site · Late · No-show · Issues · Due on · Finished · Pack not signed (managers).
  - Late and No-show become separate filter values; today both map to `issues`.
  - State in `?show=` via `useUrlState`.
- **Header:**
  - Drop `photo="control"`.
  - Subtitle "Updated HH:MM". The refresh icon stays.
  - The same applies to the venue "On site" page.
- **Row detail:** `Sheet side`, with prev/next through the visible rows.
  - Footer: primary **Open shift card**, secondary **Call**.
  - Set times manually and Review exception go in the "…" menu.
  - Venues get **Open shift card** linking to `/venue/logs/:id`, read-only as today.
- **OpsAI venue-setup cards:** each issue shows its title, with a **Show details** inline expand for the detail text and the choices. Selection and approval logic are untouched.

---

## R2. Lists with URL filters, FilterBar and drawers
Every page in this release follows the same pattern:
- local `useState` filters move to `useUrlState`;
- secondary filters go into `FilterBar`;
- record details open in `Sheet side`;
- long forms use `Sheet full` with `dirty`.

**Timesheets** (`pages/shared/Timesheets.jsx`)
- **URL state:** `week`, `venue` and `officer` join the existing `show`.
- **WeekStrip:** collapses to one line (Hours · Charge · Pay, the pay figure only with `canSeePay`) with **Show breakdown**.
- **Desktop row actions:** a labelled primary (**Approve** or **Sign off**, whichever applies) plus a `MoreMenu` for Query, Decline, Set times and Edit times.
- **Detail footer:** one primary by state, **Query** as secondary, and the rest in "…".

**Rota** (`pages/manager/Rota.jsx`)
- **URL state:** `week`, `venue` and `view`.
- **Header:** a `SplitButton` **New shift** ▾ with Repeat shift… and Copy last week. Publish N stays a soft button.
- **Shift detail:** `Sheet side`; the `?shift=` URL key is kept.
- **ShiftForm:** `Sheet full` + `dirty`.
- **Requests tab:** select mode + `ActionBar` (**Approve N** / **Decline N**), reusing the existing per-row calls in a loop.

**Cover** (`pages/manager/Cover.jsx`, `_cover.jsx`)
- The tab goes into `?tab=`.
- Details open in `Sheet side`.
- "Staff it in the rota" links to `/rota?shift=<id>` when the request has a created shift; otherwise to its week.

**Exceptions** (`pages/manager/Exceptions.jsx`)
- Select mode + `ActionBar` **Approve N** / **Reject N**. Reject N asks for a reason in one sheet, then loops the existing approve/reject action.

**Staff** (`pages/people/Staff.jsx`)
- **URL state:** `q`, `role`, `compliance` and `status`.
- **Grid · List segmented** in `?view=`. List view uses `Table`: name, role, SIA expiry, status, compliance — fields the list already loads. Check during build and drop any column that isn't there.

**Venues** (`pages/money/Venues.jsx`)
- URL state for search and status.
- A "Setup incomplete" badge on the card when the list row lacks address, pin or logo (the same rules as `venueSetup.missing`, checked on the fields the list returns).

**Compliance** (`pages/people/Compliance.jsx`)
- Severity and area go in the URL; area becomes a `Select`.
- Header: **Run check now** primary, Weekly email in "…".

## R2. Records
**StaffProfile** (`pages/people/StaffProfile.jsx`, `_profileTabs.jsx`)
- **Tabs:** `Overview` · `Compliance` · `Work` · `Pay` · `HR`. Each group has a `Segmented` sub-view inside it.
  - Compliance: Compliance · Documents · Training.
  - Work: Shifts · Attendance · Availability · Time off.
  - Pay: Rates.
  - HR: One-to-ones · HR notes · Contracts · Onboarding · Offboarding.
- **Visibility:** the existing per-tab access filtering applies to the sub-views; a group with no visible sub-views is hidden.
- **URL:** `?tab=&sub=` is synced on every switch. Old `?tab=documents`-style links map to their group.
- **Header:** Edit is the primary; Invite/Resend, Status and Suspend go in `PageActions`.
- **Edit sheet:** `full` + `dirty`.
- **Availability:** a floating save bar, the Settings pattern.

**VenueDetail** (`pages/money/VenueDetail.jsx`)
- **Header:** the Bento above the tabs becomes a compact row: 48px logo, name, address and Active pill. Log feedback and Deactivate go in "…".
- **Geofence / Access tiles** move to the top of Setup.
- **Tabs:** `Setup` · `People` · `Instructions` · `Feedback (n)` · `Records` · `Analytics`.
  - Setup holds location, codes and rates, then the Details form.
  - Records holds a Documents · Shift logs · Ejections & bans segmented.
  - Old `?tab=` values map across, extending the existing map at L27/L34.
- **Details form:**
  - "Active" and "Show on website" become checkboxes (`Check` with a label).
  - A floating **Unsaved changes · Save changes** `ActionBar tone="light"`, plus `useDirtyGuard`.
- **Instructions:** the procedure on/off checkbox becomes a `Toggle`; it already saves straight away.

**Settings** (`pages/people/Settings.jsx`)
- **Tabs:** Company · Users & access · Workforce rules · Templates & contracts · Notifications & email · Demo requests. Old `?tab=` values are mapped.
- **Guard:** switching tabs with unsaved form edits asks first.
- **Company tab:** immediate toggles go under a "Changes save straight away" caption.

## R3. The rest of the table
- **Nav** (`layouts/nav.js`):
  - Company: Exceptions under Operations, with the same badge key as Security.
  - Company and Security: Reviews under Clients & sites. Venue keeps its current set.
- **Dashboard** (`pages/manager/Dashboard.jsx`):
  - On phones, Needs you comes first when not empty (CSS `order-first` below lg).
  - The InstallCard moves to the end.
- **Officer Shifts:**
  - Opens on Offers when any are pending and no `?tab=` is set.
  - ShiftCalendar Month/Week goes in `?view=`.
  - Clock history moves into "…".
- **Officer Profile and TimeOff:**
  - Profile gets the floating save bar + `useDirtyGuard`.
  - TimeOff's tab goes in the URL, and Availability gets the save bar.
- **Recruitment:**
  - No photo.
  - On phones, a stage `Segmented` (`Applicants (n)` · `Onboarding (n)` · `Started (n)`) replaces the swipe columns.
  - The applicant sheet becomes `side`.
- **Invoices / InvoiceDetail:**
  - Invoices: **Bring up to date** primary, Export in "…". The status segmented is cut to 5, with Void / Credit notes in a select. Search goes in the URL.
  - InvoiceDetail: one primary by status. Credit note and Delete draft go in "…".
- **Pay:**
  - Tabs `Pay runs` · `Statements (n)`. The Bento collapses to a summary line.
  - The PayRun "Invoices" link stops passing dates Invoices ignores. It links to `/company/invoices` with the status that matters; the invoices API has no period filter.
- **Reports / Analytics:** the range goes in the URL. The range row is sticky under the top bar (`sticky top-14`), with section jump chips.
- **Reviews:** a Publish/Hide `Toggle` plus "…" for Edit, Move up, Move down and Delete.
- **Feedback:** "+ Give feedback" moves to the header primary; FilterBar active chips.
- **Audit:** `SearchInput`; filters in the URL.
- **Messages:** a "…" button on message hover/focus (desktop) and in the bubble (phone), opening the same actions as long-press.
- **Everyday:** pills get `min-h-10`; composer icons get aria-labels.
- **Learn:** an Emergency guide card at the top, matching Toolbox.
- **Venue Overview:** a Needs you row above the tiles when not empty, using data the page already loads.
- **Auth:** a show/hide toggle on password fields.

## Verification (each release)
- `npm run build` in `app/`: ui-lint, emergency and flow checks, vite. `npm test` in `functions/api` stays green.
- Render through the local mock against the built `site/app`, at 1440×900, 1280×720 and iPhone 14:
  - The mock's API base is rewritten as before.
  - The mock returns `[]` for list actions, with sample data for the pages being checked.
  - Roles: company, security, officer, venue.
  - Before/after screenshots.
- **Checks:**
  - Filters survive opening a record and pressing Back.
  - The drawer's ↑/↓ and Escape work.
  - The dirty guard fires on X, Escape, backdrop, tab switch and link click.
  - The shift bar appears and disappears with the clock window.
  - Tab and focus order on each changed page.
- After deploying, load the live site to confirm it renders, then `agent-browser close --all`.
