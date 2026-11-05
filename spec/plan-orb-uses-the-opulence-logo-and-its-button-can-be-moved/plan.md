# Implementation plan: Opulence logo for Orb, movable Orb button

The spec is saved at `spec/plan-orb-uses-the-opulence-logo-and-its-button-can-be-moved.md`. This change is frontend only: no API or function deploy.

## 1. New `app/src/ui/OrbBrand.jsx`
```jsx
// Orb, the assistant, wears the company's mark: the gold Opulence horse on the dark round tile
export default function OrbBrand({ className = 'h-8 w-8' }) {
  return <span className={`orb-brand grid shrink-0 place-items-center rounded-full ${className}`} aria-hidden>
    <img src="/app/brand/logo-gold-192.png" alt="" className="h-[62%] w-auto" draggable={false} /></span>;
}
```
In `styles.css`, `.orb-brand` reuses the floating button's radial ink gradient and its 1.5px gold ring. Move the shared background into one rule so both the button and the tile use it.

## 2. Swap the marks
- **`ui/AskOrb.jsx`:** the header at :149 becomes `<OrbBrand className="h-7 w-7" />`, and the empty state at :170 becomes `<OrbBrand className="mx-auto mb-3 h-12 w-12" />`. Drop the `OrbMark` import.
- **`ui/OrbVoice.jsx:306`:** `<OrbBrand className={cx('relative h-24 w-24', …same state classes)} />`. In the same block, the halo becomes `rounded-full` and its `bg-blue` becomes `bg-gold`, and the turn ring uses `border-gold`. First check that the `gold` colour token exists in Tailwind, otherwise use the accent `blue` (which is the gold accent in this theme).
- **`ui/OrbFab.jsx`:** inside the existing dark button, show `<img src="/app/brand/logo-gold-192.png" className="h-7 w-auto" draggable={false} />`.

## 3. Movable button, `ui/OrbFab.jsx`
- **State:**
  - `pos`, read from `localStorage['orb.fab.pos']` as `{right, bottom}`, or `null`.
  - `drag`, a ref holding `{ x0, y0, r0, b0, moved }`.
  - `dragging`, a boolean used for styling.
- **`clamp({right, bottom})`:**
  - Size is 56. Read the current `--header-h` and `--tabbar-h` with `getComputedStyle(document.documentElement)`, and treat the safe areas as covered by those values.
  - `right` is clamped to `[8, innerWidth - 56 - 8]`.
  - `bottom` is clamped to `[tabbar + 8, innerHeight - header - 56 - 8]`.
- **Pointer handling:**
  - `onPointerDown`: record the start and the current box (`innerWidth - rect.right` and `innerHeight - rect.bottom`), then call `setPointerCapture`.
  - `onPointerMove`: if the pointer is down, compute dx and dy. Once `|d| > 6`, set `moved` and `dragging`, then `setPos(clamp({ right: r0 - dx, bottom: b0 - dy }))`.
  - `onPointerUp`: if it moved, save the clamped position to localStorage. Then clear the drag state.
  - `onClick`: if the last gesture moved, swallow the click (reset the flag) and return. Otherwise call `onClick()`.
- **Resize:** on `resize` and `orientationchange`, re-clamp the saved position.
- **Rendering:**
  - Apply `style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}`. The inline style beats the CSS `bottom` and `right` defaults, and with no saved position the existing CSS (including the action-bar lift) still applies.
  - Add `touch-action: none` to the button.
  - Add a `orb-fab-drag` class while dragging.
- **CSS, `styles.css`:** add `.orb-fab-drag { transition: none; transform: scale(1.08); box-shadow: … stronger; cursor: grabbing; }` and `.orb-fab { touch-action: none; }`.
- **Unchanged:** hiding (`orb-fab-hidden`, scroll lock, threads) and the red dot.

## Verification
- `cd app && npm run build`: ui-lint 67 or below, and vite builds.
- Mock UI (`/tmp/mock`, ROLE=company, vite on 5174, 390×844):
  1. Screenshot the button showing the horse.
  2. Open Orb (tap) and screenshot the header and empty state.
  3. Drag with `agent-browser mouse move/down/move/up` to about (60, 400). Check the position changed and `localStorage['orb.fab.pos']` is set, and that Orb did not open.
  4. Reload and check it's in the same place.
  5. Drag far off-screen and check it's clamped.
  - Kill the servers by exact PID, then run `agent-browser close --all`.
- Ship:
  1. Commit `feat: Opulence logo for Orb, movable Orb button` (with `site/` and `spec/`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  2. `openkbs site deploy`.
  3. `git push origin master --tags`.
  4. Check the live index bundle.
