# Plan: Live operations, better composed on desktop

## Context
The user shared a screenshot of Live operations on a computer (one venue, Banshee, with 7 Orb cards) and asked for better composition. They left the layout choice to me. Problems:
- **Board squeezed.** Beside the Orb panel, venues still sit two per row (`xl:grid-cols-2`). One venue therefore fills half the width, its "Shift card" button floats mid-page, and row text is cut ("in 1…").
- **Orb dominates.** It has three layers of controls (heading + "7 to approve" pill, To approve/Decided, Select). Seven tall cards make the whole page scroll while the board is short.
- **Manual-only "No logo" cards contradict themselves.** They say "Tick what to apply", show a greyed "Apply selected", and offer both Dismiss and Reject.
- **Smaller issues:**
  - The venue name appears twice on each card (as a label and in the title).
  - Zero-count filter chips are as loud as real ones.
  - Refresh floats alone at the far right.
  - "Review flagged clock-ins in Exceptions." is loose centred text.

Front end only, plus one wording fix in the API. No data changes. Role checks are unchanged.

## Layout (lg and up, managers): board left, slim Orb column right
In `app/src/pages/shared/Live.jsx`:
1. **Grid:** `grid-cols-[minmax(0,1fr)_360px]`, down from 400px.
2. **Board beside Orb is one column of venues.** With `narrow`, venue groups only go two-up from `2xl` (1536px+); otherwise one column. Rows get full width, so the subtitle no longer truncates.
3. **Each venue group is one card**, so the venue reads as a unit (Section title + List, as now):
   - **Header:** venue name, "1 on site" (green dot), and the Shift card button(s) at the right edge.
   - **Rows** keep their pills.
   - The **Exception** pill becomes a link to Exceptions (`${base}/exceptions`) for non-venue users. It's a small link inside the row's right column, so a click doesn't open the drawer (stopPropagation).
4. **The Exceptions notice moves to the top.** The loose centred text is replaced by a one-line amber `Banner` above the venue cards: "N flagged clock-ins · Review in Exceptions →". It shows only when there are exceptions and only for non-venue users.
5. **Header tidy:**
   - Refresh moves from page actions into the tabs row, at its right end, next to the update time: `[Board · Activity · Settings] ……… Updated 22:09 ⟳`.
   - The page subtitle keeps only "Orb checked HH:MM" when that's known; otherwise none.
   - The venue "On site" page (no tabs) keeps the refresh in its header.
6. **Quieter filter chips:** chips with 0 render with faint text and no shadow (`Chip` gets a `quiet` prop in `ui/index.jsx`). They stay in place, so the row doesn't jump on each 15-second refresh. "All" and the active chip are never quiet.

## Orb column (`OpsPanel` in Live.jsx + `Inbox`/`ItemCard` in `pages/manager/OpsAI.jsx`)
1. **Own scroll:** `sticky top-[calc(56px+1rem)]` with `max-h-[calc(100dvh-7rem)] overflow-y-auto`, so 7 cards no longer stretch the page. A thin top and bottom fade hints that it scrolls.
2. **One header row instead of three:** "✦ Orb · 7 to approve" on the left; on the right, a small `MoreMenu` ("…") holding **Decided** and **Select several**.
   - Decided swaps the list, with a "← To approve" link back.
   - `Inbox` gets a `header` render-prop / `slim` mode so the full Ops page (approve tab on phones) keeps today's Segmented + Select.
3. **Compact cards in the panel** (`compact` already passed):
   - The venue label is dropped when the title already starts with the venue name.
   - The reason is shown in 2 lines (`line-clamp-2`), with the rest under Show details as now.
   - Buttons are `size="sm"`.
4. **Cards with nothing Orb can apply** (venue_setup/compliance where no issue has an allowed action):
   - **Primary:** **Open Setup** (or Open {officer}) instead of a disabled "Apply selected".
   - **Secondary:** **Dismiss**. This is the existing Reject flow with its reason sheet, relabelled for this case. The per-issue "Dismiss" link is hidden when the card has only one issue, to avoid two dismiss buttons.
   - **Reason text** reads "Add it by hand in Site setup, then this card clears by itself." This is shown in the front end, so cards already saved read correctly.
5. **API wording** (`functions/api/lib/venueSetup.mjs` `cardReason`): "Tick what to apply…" is only appended when at least one issue has an action. Run the existing `npm test` in `functions/api`, then `openkbs fn deploy api`.

## Not changing
- Phones and tablets keep the To approve tab and bottom sheets from R1.
- Selection, approve and reject logic and the API calls are untouched.

## Release
- **What's new card** "Live operations, laid out better", with its own AI picture in the same commit: `app/src/pages/people/_whatsnew.jsx` + prompt in `app/scripts/whatsnew-images.mjs`, run from the repo root.
- **Build and ship in `/home/user/project`, not a separate copy:**
  1. Commit with explicit paths.
  2. `npm run build`.
  3. Commit `site/`.
  4. `openkbs site deploy`.
  5. Push with tags.
- **After deploy:** check the live `index-*.js` contains `6ij75kpgf7` and not `hopedp5`.

## Verification
- `npm run build` (ui-lint stays ≤ 69, emergency and flow checks pass); `npm test` in `functions/api`.
- Local mock (`/tmp/mock`, copy of the built `site/`, API URL rewritten to :8799) at 1440×900, 1280×720 and 1920×1080 as company. Use mock data like the screenshot: 1 venue with 1 exception, plus 7 venue_setup cards (some manual-only "No logo"). Check:
  - The board fills its column and row text isn't cut.
  - Shift card sits at the card's right edge.
  - The Orb column scrolls by itself and the page height follows the board.
  - Manual-only cards show Open Setup + Dismiss.
  - Zero chips are quiet.
  - The Exceptions banner links correctly.
  - Refresh still works.
- Check the phone (390×844) is unchanged; check the venue "On site" page.
- `agent-browser close --all` after the checks.
