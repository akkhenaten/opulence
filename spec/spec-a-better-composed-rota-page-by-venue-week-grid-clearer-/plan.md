# Plan: a better composed Rota page (v155)

## Context
The spec was approved ("Build now") and is saved in `spec/spec-a-better-composed-rota-page-by-venue-week-grid-clearer-.md`. Here is what it asks for:
- The Rota opens on a by-venue week grid that fits a 1280px screen.
- A totals row under the grid.
- Quick filters.
- Shift cards whose states don't rely on colour alone, in two densities.
- A tidier header and shift drawer, with ‹ › stepping between shifts.
- A day-at-a-time view on phones.

This is a front-end change only. The API, data and permissions stay the same, and no money is shown.

## Files
- **`app/src/pages/manager/Rota.jsx`**: this holds nearly all of the work.
- `app/src/pages/people/_whatsnew.jsx` and `app/scripts/whatsnew-images.mjs`: the What's new card, plus `app/public/whatsnew/rota-layout.webp`.
- `/tmp/mock/server.mjs`: rota fixtures used only for screenshots. It is not committed.

## Steps

### 1. State and derived data (`Rota` component)
- **URL state:** `useUrlState({ tab:'rota', shift:'', week, venue:'', view:'venues', f:'', empty:'1' })`.
  - `f` is a comma list of `unfilled|drafts|unconfirmed|requests`.
  - `empty='1'` means empty venues are hidden.
  - If a `view` is already in the address, it still wins.
- **Density:** a small `useState` seeded from `localStorage['rota.density']` and written back on change, with values `'comfortable'|'compact'`. There is no kit hook for this, so it is kept local to Rota.
- **`counts`** comes from `rows`:
  - unfilled is `isShort && status!=='cancelled'`;
  - drafts is `status==='draft'`;
  - unconfirmed is `shiftState(s)==='unconfirmed'`;
  - requests is `assignments.some(a=>a.status==='requested')`.
- **`shown`** is `rows` filtered by the active chips. Chips combine with OR, so turning on Unfilled and Drafts shows either kind.
- All views receive `shown`.
- **`order`** is the flat list of visible shifts in on-screen order (venue then day for venues, day then time for days, and so on). It is built by the same helper the grids use, so ‹ › in the drawer follows what the manager sees.

### 2. Header and toolbar
- **Header:** `Page actions={<PageActions items=[…]/>}` with these items:
  - Publish N (soft Send, only when there are drafts). Its label adds " (2 hidden by filters)" when `drafts.length > shownDrafts`, and it still publishes **all** drafts.
  - New shift (`main`).
  - Next to them, a `MoreMenu` holding Repeat shift…, Copy last week, and Print (`window.print()`).
  - This replaces the SplitButton.
- **Week bar row**, one line on desktop:
  - the existing stepper and Today;
  - Segmented By venue / By day / By officer;
  - a density Segmented (icons `Rows3`/`Rows2`, `hidden lg:flex`).
- **`FilterBar` row:**
  - `filters=[{key:'venue', label:'Venue', value:venueId, options:[All venues, …]}]`;
  - children: four `Chip` (`label`, `value`=count, `tone` red/grey/amber/amber, `quiet` when 0, `active`, `onClick` toggles in `f`), plus a `Toggle` "Hide empty venues" when the view is venues.
  - On phones, FilterBar already folds the venue picker into "Filters (n)". The chips go in a `flex overflow-x-auto` single line so the controls take one row.

### 3. Week grid (`GridFrame`, `VenueGrid`, `OfficerGrid`)
- **Layout:**
  - `COLS = 'grid-cols-[176px_repeat(7,minmax(140px,1fr))]'` and `min-w-[1156px]`. This fits the 1280 content width with the `wide` page; check it in a screenshot and drop the first column to 160px if needed.
  - Day header row `sticky top-0 z-20` inside the scroll box. The box gets `max-h-[calc(100dvh-…)] overflow-auto` so both sticky axes work.
  - **Today's column** gets `bg-blue-soft/40` on the header and cells, through a `dayTone(d)` helper. Past days get `opacity-70` on their header text only, so the cards stay readable.
- **No nested boxes:**
  - Drop the outer `rounded-tile border` box and use one plain surface with `divide-y`.
  - Cells keep `border-l border-line`, with no padding boxes around cards.
  - The faint "+" stays.
- **VenueGrid:** when `empty==='1'` and no filter is on, venues with no shifts in `shown` drop out. When a filter is on, only venues with matching shifts show.
- **`TotalsRow`:** used in GridFrame (`sticky bottom-0 bg-surface border-t`).
  - Per day: a red "N unfilled" Pressable that sets `f` to unfilled, a grey "N drafts", and "Nh booked" (`durationH × filled`, from `rows` so it isn't affected by filters).
  - The first cell shows the week totals.
  - Plain text with a `Dot` makes each state readable without colour.

### 4. ShiftCard rewrite
- **Signature:** `ShiftCard({ s, onOpen, showVenue, density })`. The `compact` boolean prop maps to `density==='compact'`.
- **Comfortable** (about 56px) has two lines:
  - line 1: time `num font-bold`, role truncated, `filled/headcount` right-aligned;
  - line 2: an `AvatarStack` (up to 3 `Avatar size={20}` with initials, then "+N"), dashed empty circles for each open place (`headcount - filled`, up to 4), then badges (Draft, Open, N requests).
- **Compact** (about 32px) is one line: time, role, filled, and the state icon.
- **States:** these keep the current logic and are added to both densities.
  - short: 3px red left bar plus filled in red;
  - unconfirmed: amber bar plus a `Clock` icon (`aria-label="Unconfirmed"`);
  - draft: `border-dashed` plus "Draft" text, as a pill in comfortable and a small "Draft" word in compact;
  - Open: blue "Open";
  - requests: amber "N req".
- **Hover preview:** a `title` attribute listing names with their status (e.g. "Sam Scott — confirmed"). This avoids a new popover component and also works with screen readers through `aria-label`.
- **Styling:** inside grid cells, cards drop `shadow-tile` and the hover lift. They use a `bg-surface border` flat look with fixed min-heights (`min-h-14` or `min-h-8`), so every card is the same size whatever its state.
- **Shared parts:** `OfficerChip` and the agenda views share the new `AvatarStack` helper.

### 5. By day (desktop)
- In `DayList`, the desktop board becomes `hidden lg:grid lg:grid-cols-7` with the 140px minimum and the same sticky, scrolling frame.
- Between md and lg it goes through the scroll frame instead of wrapping.
- It uses `density`.

### 6. Phone
- **New `DayStrip({ week, day, setDay, rows })`:**
  - seven pills (weekday letter plus date) in `md:hidden`;
  - a red `Dot` under days with unfilled places;
  - today is pre-selected when it falls in the week, otherwise Monday;
  - the selected day is local state, reset when the week changes.
- **New `PhoneDay`** replaces the phone parts of DayList and VenueAgenda, for both the venues and days views:
  - the chosen day's shifts are grouped by venue;
  - groups with unfilled places come first, and within a group shifts are short-first then sorted by time;
  - comfortable cards;
  - "+ Add" per day.
- **Unchanged on phones:** OfficerAgenda stays as it is. The Requests tab is unchanged.

### 7. Shift drawer
- **Per officer row:**
  - Requests: Decline and Approve stay visible as IconButtons.
  - Active assignments: one `MoreMenu` with these items:
    - make or remove lead (`Crown`);
    - Replace and Remove, only when not clocked in;
    - Remove is `danger`.
  - This takes the place of the three IconButtons at Rota.jsx:558-566.
- **Prev/next:**
  - `ShiftDetail` receives `onPrev`/`onNext` from Rota, which uses `order.indexOf(openId)` and passes `undefined` at the ends.
  - These are passed to `<Sheet side onPrev onNext>`, which already supports arrows and ↑ ↓.

### 8. What's new
- **Card:** at the top of UPDATES, `{ month:'November 2026', date:'2026-11-07', icon: CalendarRange, title:'A clearer Rota', image:'/whatsnew/rota-layout.webp', … }`. The points cover:
  - the venue week grid;
  - totals;
  - filters;
  - the new cards and density;
  - drawer ‹ ›;
  - the phone day strip.
- **Picture:** add a `rota-layout` prompt in the house style to `whatsnew-images.mjs`. Generate it with `node app/scripts/whatsnew-images.mjs rota-layout` and look at it before use.

## Verification
1. **Fixtures:** add to `/tmp/mock/server.mjs`:
   - three venues, two roles;
   - about 14 shifts for the current week covering short, unconfirmed, draft, open, requested, full and a venue with none;
   - `shifts.get` returning the matching shift with assignments;
   - `shifts.pendingRequests`.
2. **Build:** run `npm run build` in app/. ui-lint must stay at 69 or below, using Pressable or Chip with no raw `<button>`, and the emergency and flow checks must pass.
3. **Desktop screenshots** of the copied site against the mock, using agent-browser:
   - **1280×800 and 1440×900:**
     - check: By venue is the default, all 7 days show with no sideways scroll, and today is tinted;
     - scroll down: the header and venue column stay in place and the totals row is visible;
     - tap unfilled in totals: the filter turns on;
     - compact density: cards are one line, the clock icon shows, and the choice survives a reload;
     - drawer: ‹ › and arrow keys step through shifts, and the officer "…" menu works.
   - **1024×768:** the grid scrolls sideways with the venue column kept.
4. **Phone screenshots (390×844):** the day strip has dots, the first shift is visible without scrolling, "Filters (n)" works, and the header "…" holds Repeat, Copy and Print.
5. **Close the browser:** run `agent-browser close --all`, and stop the mock by its PID.

## Ship (v155)
1. Commit with explicit paths: Rota.jsx, _whatsnew.jsx, whatsnew-images.mjs and the webp.
2. Run `npm run build`, then commit `site/`.
3. Run `openkbs site deploy`.
   - The API is unchanged, so there is no fn deploy. Tag v155 by hand with `git tag v155` if site deploy doesn't tag it.
4. Run `git push origin master --tags`.
5. Check the live `index-*.js` contains `6ij75kpgf7` and not `hopedp5`.
