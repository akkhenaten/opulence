# Plan: Orb uses the Opulence logo, and its button can be moved

## Context
The user sent two phone screenshots:
1. The Orb assistant still shows the original Orb mark: a blue tile with a ring and a dot, in the chat header and on the "What can I do for you?" screen. The floating button shows the ring too. **It should use the company's own logo, the gold Opulence horse** that is already in the app header (`/app/brand/logo-gold-192.png`).
2. The floating Orb button is pinned to the bottom right, where it sits over content such as the "Get the Orb app" card. **It should float freely: drag it anywhere, and it stays where it was left**, including after a reload.

## Changes

### 1. Logo, in the new `app/src/ui/OrbBrand.jsx`
- Add `OrbBrand({ className })`: a round, dark tile using the same radial ink gradient and gold ring as the floating button, with the gold horse `<img src="/app/brand/logo-gold-192.png">` centred inside.
- Swap it in wherever the assistant shows `OrbMark`:
  - `ui/AskOrb.jsx:149`: the header (h-7).
  - `ui/AskOrb.jsx:170`: the empty state (h-12).
  - `ui/OrbVoice.jsx:306`: the voice view (h-24). The speaking and muted classes stay.
  - `ui/OrbFab.jsx:13`: the floating button shows just the horse image (h-8) on its existing dark round button.
- `OrbMark.jsx` stays as it is for anything else that uses it.

### 2. A movable button, in `ui/OrbFab.jsx` and `index.css`
- **Pointer handling** (`onPointerDown`, `onPointerMove`, `onPointerUp` with `setPointerCapture`):
  - A move of more than 6 px counts as a drag. The button follows the finger, using `touch-action: none` on the button so the page doesn't scroll.
  - A tap with less movement than that still opens Orb, as it does today.
  - After a drag, the click that follows is swallowed, so dropping the button doesn't open Orb.
- **Position:**
  - Store it as `{ right, bottom }` in px, measured from the viewport's right and bottom edges, so it keeps its place relative to the thumb area on any screen.
  - Save it in `localStorage['orb.fab.pos']` when the drag ends.
  - Apply it as an inline `style` that overrides the CSS `bottom`/`right` defaults.
- **Keeping it on screen:**
  - Clamp the position so the button stays fully visible. It can't go under the top app header (`--header-h` plus the safe-area top) or below the tab bar (`--tabbar-h` plus the safe-area bottom).
  - Clamp again on window resize and rotation.
- **No saved position:** the current placement stays, including the CSS rule that lifts it above action bars.
- **During a drag:** a slight lift (scale 1.08, stronger shadow), and transitions are off so it tracks the finger exactly.
- **Unchanged:** it still hides on message threads, while Orb is open and when scroll is locked. The red "something new" dot stays.

## Verification
- `cd app && npm run build`: ui-lint 67 or below, and vite builds.
- Mock UI (`/tmp/mock`, ROLE=company, vite on 5174, 390×844):
  1. A screenshot of the button showing the gold horse.
  2. Open Orb, and screenshot the header and the empty state with the horse.
  3. Use `agent-browser mouse` down, move, up to drag the button to the middle left. Check it moved and that `orb.fab.pos` is saved.
  4. Reload, and check it's in the same place.
  5. A short tap still opens Orb. A drag doesn't open it.
  6. Drag past the edges, and check it's clamped and still fully visible.
  - Kill the servers by exact PID, then run `agent-browser close --all`.
- Ship:
  1. Commit `feat: Opulence logo for Orb, movable Orb button` (with `site/`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  2. `openkbs site deploy`.
  3. `git push origin master --tags`.
  4. Check the live bundle.
