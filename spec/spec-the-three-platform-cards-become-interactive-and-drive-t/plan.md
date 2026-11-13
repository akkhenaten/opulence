# Implementation plan: interactive platform cards that drive the portal example

## Context
- The approved spec is `spec/spec-the-three-platform-cards-become-interactive-and-drive-t.md`.
- **Why:** the user said the three `#platform` pillars "look poor". The fix makes them eye-catching cards. The active card lights up and switches the venue-portal mock to a matching screen. The cards cycle by themselves on desktop, swipe on phones, and degrade cleanly.
- **Scope:** all changes are in `site/index.html`, plus the What's new card and picture. No API changes.

## 1. Markup (`site/index.html`, `#platform`, ~lines 372–421)
**Cards**
- `.pillars` gets `data-tabs` and `role="tablist"` (added by JS only, so no-JS stays semantic articles).
- Each `<article class="pillar">` gains:
  - `data-pane="live|admin|comply"`.
  - An inline SVG icon `<span class="ic">`, 40 px, gold stroke. Each icon has a draw-in path plus one tiny animated part:
    - live: an eye with a pulsing pupil.
    - admin: a clock whose hand sweeps, then becomes a tick.
    - comply: a shield whose check strokes in.
  - A `<div class="bar"><i></i></div>` progress line.
- The wording stays word for word.

**Portal**
- Inside `.device`, after `.bar`, the existing three tiles are wrapped in `<div class="pane" data-pane="live">`.
- Two more panes are added, `hidden`, built from the existing `.tile` / `.officer` / `.chip` / `.sign` classes:
  - **admin:**
    - A timesheet tile ("Last night · Timesheet · 3 officers · 21 hrs") with a `.sign` button that becomes "Signed ✓".
    - A "Clock-in verified on site" line with a chip.
    - "Invoice · 21 hrs · matches" with a chip.
    - A rota strip of 7 day cells, Sat empty then filled "AR".
  - **comply:**
    - Three officer rows with "SIA ✓" and "RTW ✓" chips, one with a warn chip "Renews 28d".
    - "Shift log · 3 refusals recorded".
    - "Venue procedures · acknowledged 3/3".
- **Panes stack in one grid cell** (`.panes { display: grid } .pane { grid-area: 1/1 }`), so the device height is the tallest pane and there is no layout jump. A non-active pane gets `visibility: hidden; opacity: 0` rather than `display: none` when JS runs.
- **No JS:** only `live` is shown, because the others carry the `hidden` attribute and JS removes it.
- **Announcements:** an `aria-live="polite"` visually-hidden `<span class="vh" data-say>` inside the figure announces "Showing: More efficient".

## 2. CSS (Platform block, ~lines 98–127)
**Cards**
- `.pillar` becomes `position: relative; overflow: hidden` with a transition on border-color, background, box-shadow and transform.
- `--mx` / `--my` drive a radial gold glow (`::before`) that follows the cursor on hover (pointer fine only).
- **When JS is running (`.pillars[data-tabs]`):**
  - **Inactive cards:**
    - `opacity: .62`.
    - `ul` collapsed with the `grid-template-rows: 0fr → 1fr` technique (a wrapper div around the `ul` makes this work).
    - The points are hidden from the accessibility tree via the `inert` attribute set by JS.
  - **Active card (`[aria-selected=true]`):**
    - Gold border `rgba(201,164,92,.55)`.
    - A gold gradient wash and a `translateY(-2px)` lift.
    - The list items stagger in (`li` animation, `--i` delay).
- **Progress `.bar i`:** `transform: scaleX(0 → 1)` over `var(--dwell)` while `.pillars.auto` is set. It is paused on hover/focus via `animation-play-state`.
- **Icons:** stroke-dasharray draw-in on activation, plus the small loop animations. All of it is under `html.anim` only.

**Phones (`@media (max-width: 920px)`)**
- `.pillars[data-tabs]` becomes a horizontal flex with `overflow-x: auto; scroll-snap-type: x mandatory`. Cards are `flex: 0 0 86%`, with scrollbar hidden and scroll padding.
- All cards are fully open on phones (no collapse), and the active state is only the glow.
- `.dots` (3 buttons) go under the cards.
- The portal follows directly below, which is already the case (`.platform` is 1 column).

**Panes**
- Cross-fade with opacity `.45s` and translateY 8 px.
- The `admin` pane's sign button animates to "Signed" via a class added 900 ms after activation.
- The rota cell fills, and the live pane's officer row "clocks in".

**Reduced motion / no `html.anim`**
- No keyframes and no autoplay; panes switch instantly.

**Slide-in**
- Drop `.pillars` from the slide-in list in JS: line ~667 `['.pillars', '.services', …]` becomes `['.services', '.awards']`. Its transform would fight the active lift and the mobile carousel. The cards instead use the existing `data-reveal` rise on the `.pillars` container.

## 3. JS (new block after the `slide()` setup, reusing `motion` and `once()`)
**Setup**
```js
// The platform cards: choosing one lights it up and switches the portal example to match; they take turns on their own
var tabs = document.querySelector('.pillars'), panes = document.querySelectorAll('.device .pane');
```
- **`select(i, user)`:**
  - Sets `aria-selected` and `tabindex` (roving) on the cards, `inert` on non-active point lists, and `hidden=false` on all panes.
  - Toggles `.on` on the matching pane.
  - Restarts the pane animations (remove/re-add the class with a reflow).
  - Updates `[data-say]`.
  - If `user` is true, stops autoplay for good (`stopped = true`).
  - On phones, it also scrolls the card into view with `scrollIntoView({inline: 'center', block: 'nearest'})`, but only if the trigger was a dot or keyboard.
- **Roles:** each card gets `role="tab"`, `aria-controls` (the pane id) and `tabindex`. Each pane gets `role="tabpanel"`.
- **Events:**
  - `click` on a card calls `select(i, true)`.
  - On the tablist, `keydown` with ArrowLeft/ArrowRight/Home/End calls select and focus.
  - Dots: a click calls `select(i, true)` and scrolls.
- **Autoplay (desktop only):**
  - Conditions: `motion && matchMedia('(min-width: 921px)').matches`. A `setInterval`-like `setTimeout` chain with a 7000 ms dwell runs only while the section is in view. Visibility comes from an IntersectionObserver on `#platform`, created directly rather than with `once()`, because it is not a one-shot.
  - Pause on `mouseenter`/`focusin` of `.platform` and resume on leave.
  - `.pillars.auto` toggles the progress bar.
- **Phones:**
  - An IntersectionObserver on the cards (`root: tabs`, `threshold: .6`) calls `select(i, false)` as each card snaps in view.
  - The dots reflect the active card.
- **Initial state:** `select(0)`.
- **Cursor glow:** on `pointermove`, set `--mx`/`--my` on the card. Pointer: fine only.

## 4. What's new (house rule: every release gets its own card and picture)
- **`app/src/pages/people/_whatsnew.jsx`:** add a new card at the top of `UPDATES`:
  - Date `2026-11-13` and an icon from lucide (e.g. `MousePointerClick`, added to the import).
  - Title: "Your website's platform cards come alive".
  - Image `landing-platform-cards`.
  - Points:
    - Choosing a card switches the portal example.
    - The cards cycle by themselves.
    - Swipe on phones.
    - Keyboard and screen readers supported.
    - Still for reduced motion.
- **`app/scripts/whatsnew-images.mjs`:** add the prompt (a laptop showing three dark cards, one glowing gold, beside a phone showing a portal screen; no text). Run `node app/scripts/whatsnew-images.mjs landing-platform-cards` and view the result via agent-browser.

## 5. Build and ship
1. `cd app && npm run build`. Check that `6ij75kpgf7` is in `site/app` and `hopedp5` is not.
2. Commit the feat (`site/index.html`, What's new files, image, spec), then the build.
3. `openkbs site deploy` from a clean tree to get the version tag (v194).

## Verification (agent-browser, local `python3 -m http.server 8765` from `site/`, then live)
**Desktop 1280**
- Screenshot the section.
- Autoplay advances after ~7 s (check `aria-selected` changes).
- Hover pauses it.
- Clicking card iii shows the comply pane and stops autoplay (no change after 8 s).
- The device height is constant across panes.
- `scrollWidth == innerWidth`.

**Mobile 375**
- The cards are a snap carousel.
- Scrolling `.pillars` to card 2 switches the pane and the dots.
- No page horizontal scroll.
- Screenshot it.

**Reduced motion** (`set media dark reduced-motion`)
- No autoplay.
- A click switches instantly.

**Accessibility snapshot**
- A tablist with 3 tabs, one selected, and a tabpanel.
- Arrow keys move the selection.

**No JS**
- Static check: the panes other than live carry `hidden`, and the cards hold their full text.

**Regressions**
- Live figures still count up.
- Clients tiles load.
- Services flip works.
- Request cover opens.
- `errors` is empty.

**Finally**
- Repeat the key checks live, then `agent-browser close --all`.
- Do not use `pkill -f` patterns that match the shell's own command line. Stop the server by PID (`$!`).
