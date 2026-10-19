# Rota layout fix — every view (By day, By venue, By officer)

## Context
On a phone, the Rota's "By venue" view (screenshot from the user) looks broken:
- **Columns don't line up between rows.** Each venue row is its own CSS grid using `repeat(7,1fr)`, and `1fr` grows to fit its content. A wide card (e.g. "16:00–23:30" plus a pill) widens its column in that row only, so the vertical lines and the day headers drift apart.
- **The venue name scrolls off-screen.** The grid is 980px wide inside a sideways scroller, so on a 390px phone you can't tell which row is which venue.
- **The cards are cramped.** The time wraps onto two lines ("16:00– / 23:30"), and the pill sits on top of it.
- **The "+" add button only shows on mouse hover,** so phones can't use it.

The goal is a clean, aligned rota on desktop and a native-feeling (iOS) layout on phones.

## Changes (one file: `app/src/pages/manager/Rota.jsx`)

1. **Same column widths in every row.** Add one constant, `const COLS = 'grid-cols-[150px_repeat(7,minmax(0,1fr))]'`, and use it in the `GridFrame` header, each `VenueGrid` row, and the `OfficerGrid` "Unfilled" and officer rows (it replaces `grid-cols-[180px_repeat(7,1fr)]` in all of them). With `minmax(0,1fr)`, every row has exactly the same columns, whatever is inside.
2. **Venue/officer name stays visible when scrolling sideways (tablet/desktop grid).** Make the first cell of each row `sticky left-0 z-10 bg-surface` with a right border, and make the header's empty corner cell sticky the same way.
3. **Tidier compact card** (`ShiftCard` with `compact`):
   - The time goes on one line (`whitespace-nowrap text-[13px]`).
   - Below it, one row holds the role (truncated) and the `filled/headcount` pill.
   - The Draft, Open and request pills keep their current line.
   - Tighter padding (`p-2`).
   - The heavy red ring on short-staffed shifts is replaced by a subtle red left accent.
4. **Phone layout: agenda instead of a wide grid.** Below the `md` breakpoint, "By venue" and "By officer" show a vertical list (`md:hidden`), and the grid shows only from `md` up (`hidden md:block`):
   - **By venue:** one Bento tile per venue, with the name as the tile title. Inside it are day rows: the day label on the left, and on the right that day's shifts as full-width `ShiftCard`s, or a muted "No shifts" with a visible "+ Add" button.
   - **By officer:** one tile per officer (avatar, name, weekly hours) listing their shifts by day, plus a red "Unfilled" tile first.
   - Days with no shifts are folded into a single muted line, so the list stays short.
5. **The add button works on touch.** In the grid, the "+" is always faintly visible (`opacity-40`, full opacity on hover). In the agenda, "+ Add" is a normal text button.

6. **"By day" gets the same treatment** so that all three views look like one system:
   - **Desktop:** a 7-column week board (`lg:grid-cols-7`, equal `minmax(0,1fr)` columns). Each day is a column with a sticky header (day label, plus a "Today" accent in blue) and stacked cards. This replaces today's 4-column wrap, which puts Fri–Sun on a second row and misaligns them with Mon–Thu.
   - **Tablet:** 2 columns.
   - **Phone:** one agenda list. Day headers stick to the top while scrolling (iOS grouped-list style), empty days fold into one muted line with "+ Add", and today is scrolled into view on load.
   - **Cards:** full-size cards use the new layout from step 3: the time on one line, the venue, then the role and the pill on one row, then officer names.
7. **Shared toolbar on phone:**
   - The week switcher, venue filter and By day/venue/officer control stack neatly at 390px.
   - The segmented control becomes full width.
   - "Copy last week" and "New shift" fold into a compact header action, so nothing wraps or gets cut off.
8. The **security manager rota** uses the same component, so it gets all of this automatically. I'll also check the officer **Shifts** list at 390px and apply the same card style if anything wraps there.

This reuses the existing `ShiftCard`, `Section`/`Tile`, `Pill`, `Avatar`, `dayLabel`, `range` and `durationH` helpers already in the file and in `ui/index.jsx`. No backend changes.

## Verification
- `cd app && npm run build`.
- With agent-browser on the deployed site, log in as the company manager, open Rota:
  - At 390px, take screenshots of all three views and the officer Shifts list. Expected: a vertical agenda with no sideways scrolling, times on one line, and visible add buttons.
  - At 820px and 1440px, take screenshots of both views. Expected: grid lines line up across all rows and with the day headers, and the name column stays fixed while scrolling sideways.
- At 1440px, "By day" should show Mon–Sun in one row with equal columns.
- Repeat a quick check as the security manager.
- Commit, run `openkbs site deploy`, then `agent-browser close --all`.
