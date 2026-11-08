# Spec: pages give their space to the work, not the controls (all portals)

## Context
On desktop, pages stack several rows of controls between the title and what the page is actually for. The Rota page (screenshot, week of 2 Nov) uses about 230px for these, under a large title:
- a Rota / Shift requests switch
- a toolbar with the week picker, By venue/day/officer, Comfortable/Compact and All venues
- a row of counters that all read "0"
- a Hide empty venues switch

Meanwhile the space next to the title and to the right of the Week · Cover · Exceptions tabs is almost empty. The grid, which is the reason the page exists, starts halfway down the screen.

**Goal:** on every page, the main content (grid, list, table, board) starts as high as possible. Controls move into the empty space on the title and tab lines, and counters with nothing to report are not shown. The same treatment is then applied to every page in every portal.

## Decisions
- **Title:** stays, but smaller. The subtitle (such as "Week of Mon 2 Nov") sits beside it on the same line, and the page actions (⋯, New shift) stay on that line.
- **Zero counters are hidden.** A counter only shows when there's something to act on. With nothing outstanding, its row disappears.
- **Rollout:** Rota first, so the pattern can be checked, then every other page in one pass.
- **Portals:** all of them, meaning managers, officers, venues and the platform. On phones the same rule applies: one compact row, with extra filters in a sheet.

## The pattern (applies to every page)
1. **Header line:** a smaller title, then the subtitle inline (muted). Page actions sit on the right of the same line.
2. **Tab line:** the section's tabs sit on the left. The page's own controls go on the right of the same line:
   - date or week pickers
   - view switches
   - density
   - filters such as venue or status
   - search, when a page has it
   If they don't fit, the less-used ones collapse into a "Filters" button that opens a small menu or sheet.
3. **No second row of tabs.** A switch that is really another view of the section becomes a tab of the section. For example, Rota's "Shift requests" sits beside Week · Cover · Exceptions, and old links keep working.
4. **Counters:** these are shown only when they're above zero, as small chips on the tab line or just above the content. Tapping one still filters the view, as it does today.
5. **Rarely used switches** move into the ⋯ menu or the Filters menu. "Hide empty venues" is one example.
6. **Tighter spacing** between the header, the tabs and the content, without making text or tap targets smaller.
7. **Phones:**
   - the title line, then the tabs (which scroll sideways), then one row with the main control (such as the week picker) and a Filters button
   - nothing wraps onto three lines

## Rota (first page)
Rota becomes:
- **Header line:** "Rota" (smaller), with "Week of Mon 2 Nov" beside it, and ⋯ and New shift on the right.
- **Tab line:**
  - On the left: Week · Shift requests · Cover · Exceptions.
  - On the right: the week picker (‹ 2 Nov – 8 Nov ›), By venue/day/officer, the venue picker, and a Filters menu holding Comfortable/Compact and Hide empty venues.
- **Counters:** Unfilled, Drafts, Unconfirmed and Requests each appear as a chip only when not zero.
- **Result:** the grid starts directly under the tab line, about 200px higher than today.

## Every other page
- Apply the same pattern to every page built on the shared page frame, and to the pages that draw their own header (they show the section tabs themselves).
- Typical moves:
  - filter and search rows go onto the tab line
  - sub-tab switches become section tabs
  - zero summary chips are hidden
  - view and density switches go into Filters
- Pages with nothing to move just get the smaller title and the tighter spacing.

## Out of scope / unchanged
- What each page shows and does, its data, and permissions.
- The sidebar, the top bar, and the five app styles (Day, Night, Soft, Glass, Flat). Every style has to look right with the new header.
- Printable documents and certificates.

## Edge cases
- **Very long titles or subtitles:** they truncate on one line, and the full text shows on hover.
- **Pages with many filters** (for example Timesheets or the Audit log):
  - the most-used filter stays visible
  - the rest go into Filters, with a count badge showing how many are active
  - a "Clear" option in the menu removes them all
- **Active filters stay visible:** the Filters button shows a count, so nobody is confused by a filtered view.
- **Narrow desktop windows:** controls on the tab line shrink to their icons before they spill into Filters.

## Release
A What's new card with its own picture: "More room for the work on every page."

## Verification
1. On Rota at 1440×900 and 1280×720:
   - the grid starts directly under the tab line
   - every existing control still works: week change, view, density, venue, hide empty, counters
   - Shift requests opens from its tab, and old links still work
2. On a phone (375px), check that the header, tabs and controls take at most three short lines.
3. Go through every page in each portal, in all five app styles, to check that nothing overlaps or wraps badly and that no control has been lost.
4. Compare screenshots of the main pages before and after, and confirm the content starts higher on each.
