# Spec: a departure-board grid flip for the landing-page tiles (Our services + venue tiles)

## Context
On the public landing page (site/index.html), the three **Our services** tiles and the ~25 **venue tiles** (plus the automatic tiles added from the app) flip today as one whole card turning on its vertical axis (rotateY, 0.8 s). The user wants a more striking, premium transition, like old airport split-flap departure boards: on click the tile breaks into a grid of cells that flip one after another in a diagonal wave, then joins back into one seamless surface showing the other side. It is built once as a reusable piece and used the same way on both tile groups.

## What the visitor sees
- **At rest** each tile looks exactly as today: same photo, caption, size, rounded corners, hover lift (hover never starts the flip).
- **Click / tap / Enter / Space** anywhere on the tile (not on a link or button inside it):
  - the tile splits into a grid of rectangular cells — **4 columns × 5 rows** on desktop, **3 × 4 on phones** (≤ 760 px);
  - each cell turns 180° top-over-bottom (around its horizontal axis), in a **diagonal wave from top-left to bottom-right**: delay grows with row + column;
  - light 3D perspective and shading: a cell darkens as it turns edge-on and lightens as it settles, so it reads as a real flap; cells never move out of place and the page layout doesn't shift;
  - the whole wave takes about **1 second** (≈ 500 ms per cell, spread over ≈ 500 ms of delays; 900–1,200 ms total);
  - the cell backs together form **one continuous picture of the back side** (the description, the reviews, "Visit venue" / "Request cover") — not the back repeated in every cell;
  - when the last cell lands, the grid lines disappear and the tile is one seamless surface again, now showing the back.
- **Click again** (or **Escape**) plays the same wave back to the front.
- **One open per group** stays: opening a tile turns any other open tile in that group back (with the same wave).
- **Clicks are ignored while a tile is mid-flip** (no double-flips, no half states).
- **Reduced motion** (system setting): no grid, no 3D — a short cross-fade between front and back.
- **Links and buttons keep working**: "Request cover" opens the form, "Visit venue ↗" opens the venue site, the reviews carousel arrows/dots/swipe work once the back is showing. Keyboard focus and screen-reader labels (aria-pressed, the back hidden from readers until shown) behave as today.
- Tiles that **navigate** (none today, supported for later via a `data-href` on the tile): play the wave, then go to the link.
- Tiles **without a back side** show the same design on both sides of the cells (the wave plays as a flourish, then it's the same tile).

## How it is built (one reusable piece in site/index.html)
- A small vanilla-JS helper **`gridFlip(tile, show, done)`** plus a CSS block, in the existing inline script/style. It replaces the current whole-card rotateY flip; `setFlip`/`wire`/`flippers` keep their roles and call it, so the static services, the static venue tiles and the app-made venue tiles (`makeTile` → `wire(t, tiles)`) all get it the same way.
- On click it builds a temporary overlay of cells over the tile. Each cell holds a picture-copy of the current face and of the target face, cropped to that cell's spot so the copies line up into one image; the target copy is pre-turned so it appears as the cell turns. Copies are inert and hidden from screen readers; they exist only during the ~1 s and are removed after.
- The real faces stay underneath; after the wave the real target face is shown flat (no rotation), so its links, buttons and the reviews carousel are the real, working elements.
- The end is detected from the last cell's transition (with a timeout fallback so a tile can never stay locked).
- Grid size is read from the screen width at click time; the stagger is worked out from rows + columns so the total stays ≈ 1 s on both grids.
- Works with the existing scroll-in glide and image parallax (the copies carry the current parallax offset, so the image doesn't jump).
- No new files, no build step, no dependencies; nothing is copied unless a tile is clicked.

## Non-goals
- No change to tile content, sizes, the grid layout, the hover effect, the reviews pipeline, or the app.
- No sound, no auto-playing flips, no flip on hover or on scroll.

## What's new
Per the release rule, a card at the top of `UPDATES` in app/src/pages/people/_whatsnew.jsx (date = deploy day): "The landing-page tiles now flip like a departure board".

## Files
- site/index.html — CSS (replace the rotateY flip rules and the reduced-motion flip rules near :175–200) and JS (`setFlip`/`wire` near :921–946 call the new `gridFlip`).
- app/src/pages/people/_whatsnew.jsx — the What's new card.

## Verification
- Serve site/ locally; with agent-browser at 1440 and 390 px: screenshot mid-wave (diagonal order visible, cells in place, back reads as one picture) and the end state (seamless, no grid lines); 4×5 vs 3×4 grid.
- Click, Enter, Space, Escape; rapid double-clicks ignored mid-flip; opening a second tile turns the first back.
- "Request cover" opens the form with the service filled; "Visit venue" link works; reviews carousel works after the flip (on an app-made tile via a mock reviews response if needed).
- Emulated reduced motion → cross-fade only.
- `cd app && npm run build` (ui-lint ≤ 67); `openkbs site deploy`; read-only live check that the page loads and the new code is present; commit and push.
