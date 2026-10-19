# Implementation plan — Rota layout in every view

Spec: `spec/rota-layout-fix-every-view-by-day-by-venue-by-officer.md`. This is frontend only: no API, data or function changes.

## Files
- `app/src/pages/manager/Rota.jsx`: the main work. Company and security managers share this component, so both get the changes.
- `app/src/pages/officer/_parts.jsx`: the officer shift card. This gets a no-wrap fix only, and only if the 390px check shows wrapping.

## Rota.jsx changes

**Shared constants and helpers (top of file)**
- `const COLS = 'grid-cols-[150px_repeat(7,minmax(0,1fr))]'` and `const DAYS = (week) => Array.from({ length: 7 }, (_, i) => addDays(week, i))`.
- `const shortOf = (s) => s.filled < s.headcount`.

**`ShiftCard`**
- The time goes on its own line: `num whitespace-nowrap font-bold`, at 13px in compact mode and 15px otherwise.
- If `showVenue` is set, the venue name follows (truncated).
- Next comes one flex row: the role (`truncate text-muted`) on the left and the `filled/headcount` `Pill` (`shrink-0`) on the right.
- The Draft, Open and request pills keep their existing row.
- Officer names are shown when not compact, as now.
- Short-staffed published shifts drop `ring-1 ring-red/20` in favour of a left accent: `relative overflow-hidden`, with an `absolute inset-y-0 left-0 w-[3px] bg-red` span.
- Padding is `p-2` in compact mode and `p-3.5` otherwise.

**`DayList` ("By day")**
- **Phone (below `md`):**
  - One continuous list. Each day header is `sticky top-14 z-10 -mx-4 bg-bg/90 px-4 py-2 backdrop-blur` (the Shell top bar is `h-14`), showing the day label, a blue "Today" when it applies, and a "+ Add" button.
  - Each day's cards sit in `space-y-2`.
  - Runs of consecutive empty days are folded into one muted line, for example "Tue 20 – Wed 21 · No shifts", with "+ Add" adding to the first of those days.
  - A `ref` on today's header plus `useEffect` calls `scrollIntoView({ block: 'start' })` once, but only when the week shown is the current week.
- **Tablet and desktop:**
  - The grid is `md:grid md:grid-cols-2 lg:grid-cols-7 gap-3`, with each column `min-w-0`.
  - Each column is a Bento-style rounded panel (`rounded-tile bg-surface/60 p-2`) with a header (day label in small caps, blue if today, plus "+") and stacked full cards.
  - An empty day shows a dashed "No shifts" block.
  - At `lg`, Mon–Sun sit in one row with equal columns.
- **How it's built:** a single `DayList` renders two blocks. The phone block is `md:hidden` and the grid block is `hidden md:grid`. Both are derived from one `byDay` map built with `useMemo`.

**`GridFrame`, `VenueGrid`, `OfficerGrid` (tablet and desktop, `hidden md:block`)**
- Use `COLS` everywhere in place of `grid-cols-[180px_repeat(7,1fr)]`.
- The scroller keeps `overflow-x-auto`. The frame's `min-w` drops to `860px`.
- The first cell of each row is `sticky left-0 z-10 bg-surface border-r border-line`, and the header's corner cell matches. The frame's `overflow-hidden` moves to an inner wrapper so `sticky` works. Sticky positioning fails inside an `overflow-hidden` ancestor that is not the scroller, so the rounded corners come from the scroller element itself (`rounded-tile overflow-x-auto`).
- In venue cells the "+" goes from `opacity-0` to `opacity-40 hover:opacity-100`.

**New phone agendas (`md:hidden`)**
- `VenueAgenda`:
  - One `Tile` per venue, titled with the venue name and with a "+" action.
  - Inside it, a `divide-y` list of day rows: a 64px day label (blue if today) on the left, and the day's full `ShiftCard`s (`showVenue={false}`) on the right.
  - Empty-day runs are folded with the same helper as `DayList`. Pull this into a `foldDays(days, hasShifts)` helper so both use it.
- `OfficerAgenda`:
  - An "Unfilled" tile first, red-tinted with a places count, holding cards grouped by day.
  - Then one `Tile` per officer, with `Avatar`, name and weekly hours in the header.
  - Rows show day, time and venue as compact buttons, using the same colours as the grid (blue-soft for assigned, amber-soft for requested, grey for draft).
  - The officer list and hours reuse the `useMemo` and `durationH` logic in `OfficerGrid`. Pull it into a `useOfficerRows(rows)` hook that both use.
- The `Rota` render switch shows the grid and the agenda side by side (`<><VenueGrid/><VenueAgenda/></>`). Each one hides itself at the wrong breakpoint.

**Toolbar (`Rota`)**
- **Phone:**
  - Week switcher and "Today" sit on one row, with the venue `Select` full width below.
  - The `Segmented` view switch becomes full width (`w-full md:w-auto`), and each option becomes `flex-1` through a `className` passed to the options container.
  - Add an optional `full` prop to `Segmented` in `ui/index.jsx` that sets `flex w-full` and gives the buttons `flex-1`. Defaults stay unchanged, so other screens are unaffected.
- **Page actions on phone:**
  - "Copy last week" becomes an icon-only `IconButton` below `sm`; the label already hides.
  - "New shift" stays as the primary button.
  - "Publish N" stays.
  - Add `shrink-0` so the actions sit next to the title instead of wrapping under it: on phones, `Page` gets `items-center`. Do this with a small `Page` tweak: `items-end` becomes `items-center sm:items-end`.

## Verification
1. `cd app && npm run build`, which must be clean.
2. Commit (`fix: rota layout in every view`, with bullet points and Co-Authored-By), then run `openkbs site deploy`.
3. With agent-browser, using `/tmp/login.sh company`, open `/app/company/rota` and take screenshots:
   - **390px:** By day, By venue and By officer, scrolled. Check for no sideways scroll (`document.documentElement.scrollWidth <= 390`), time strings that don't wrap, sticky day headers and visible add buttons.
   - **820px:** both grids. Header and row column edges must match. Check with eval that the `left` positions of every row's nth cell are equal. Scroll the grid sideways and confirm the name column stays put.
   - **1440px:** By day shows Mon–Sun in one row, and the grids line up.
4. Repeat 390px By day as `security`, and check the officer Shifts list as `officer_marcus`. If it wraps, add `whitespace-nowrap` in `officer/_parts.jsx`.
5. Check the browser console for errors, then run `agent-browser close --all`.
