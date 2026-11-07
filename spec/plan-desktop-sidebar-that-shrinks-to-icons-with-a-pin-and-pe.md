# Plan: Desktop sidebar that shrinks to icons, with a pin and per-module icon motion

## Context
On desktop (lg, 1024px+), the manager sidebar is a fixed 260px column (`app/src/layouts/Shell.jsx:272`). The user wants it to:
- shrink to icons only,
- open with an animation,
- have a tiny pin that keeps it open,
- and give each module button its own animation.

**Decided:** hover peek over the page. When unpinned, the sidebar rests as a 72px icon strip. Hovering slides it open to 260px *over* the page, so the content never jumps. Pinned, it takes its full room as it does today.

**Not answered, so I used my recommendations (easy to change):**
- Item motion: a per-module icon hover motion, plus a gold active bar that glides between items.
- Default state: open and pinned, so nothing changes until someone unpins it. The choice is remembered per browser.

## 1. Collapse, peek and pin: `Shell.jsx` and `styles.css`
- **State.** `pinned` is read from `localStorage['orb.nav.pinned']` (default true, try/catch `/* private mode */`, as in `ui/style.js`). `peek` is a hover state: it opens after 120ms, so a mouse passing over doesn't open it, and closes 300ms after the mouse leaves. Keyboard focus inside the sidebar (`onFocus`/`onBlur` within) also opens it. `open = pinned || peek`.
- **Structure.** The `<aside>` stays sticky in the flex row as a spacer whose width is `pinned ? 260 : 72`. Inside it sits an absolutely positioned panel (`h-dvh`, `z-40`, `data-style="control"`, the current classes) whose width is `open ? 260 : 72`.
  - When peeking (unpinned and open), the panel gets `shadow-sheet` and overlays the page.
  - Both widths use `transition-[width] duration-[var(--dur-3)] ease-ios`.
- **`--sidebar-w` on `<html>`** (260px or 72px), set in the existing layout effect (Shell.jsx:252). `styles.css:133` becomes `left: var(--sidebar-w, 260px)`, with a matching transition, so docked action bars follow the width.
- **When shrunk:**
  - **Labels:** wrapped in a span with `transition-[opacity,transform]`; shrunk, they are `opacity-0 -translate-x-2` and take no space (`w-0 overflow-hidden`). When opening, they fade in with a stagger of `--i * 15ms` per item.
  - **Section titles** become a short hairline divider.
  - **Badges** turn into a dot with a count on the icon's corner, using the absolute pattern from the More button (Shell.jsx:347). `Tag` is hidden.
  - **Logo** uses its existing `compact` prop.
  - **SideSwitch:** icon-only, or hidden. I'll check `SideSwitch.jsx` for a compact mode first.
  - **Help and the user card:** icon and avatar only.
  - **Tooltips:** `title` plus `aria-label` on every link, since there's no Tooltip component.
- **Pin:** an `IconButton` (Pin / PinOff, size 16) in the logo row, visible only when open. It fades in with the labels and has a `before:` tap area for the ui-lint small-tap rule.
  - Pinning while peeking: the spacer grows to 260, so the page glides aside under the already-open panel.
  - Unpinning: the panel and spacer shrink together.
  - The icon rotates 45° between the two states.
- **Shortcut:** `[` toggles the pin when not typing in a field. The pin's title shows the hint.

## 2. Gliding active indicator: `Shell.jsx`
- One absolutely positioned element inside `<nav>` holds the soft pill and the 3px gold bar that `NAV_ON` draws today. A `useLayoutEffect` on `loc.pathname`, `groups` and `open` measures the active NavLink (`offsetTop` / `offsetHeight`, found via `[aria-current="page"]`) and sets `transform: translateY()` / `height`, with `transition: transform var(--dur-3) var(--ease-ios)`.
- If no item is active, it is hidden. `NAV_ON` keeps only the text colour.
- The Help link sits outside `<nav>` and keeps its current static active style.

## 3. Per-module icon motion: new `app/src/layouts/navMotion.js` and `styles.css`
- **Mapping:** a map keyed by the lucide icon component, so every role picks it up with no `nav.js` edits:

  | Icon | Motion |
  |---|---|
  | LayoutGrid | tiles pop in turn (`rect:nth-child`) |
  | MessagesSquare | bubble wiggles |
  | Mail | envelope lifts |
  | Radio | waves ripple outward (the outer arcs fade out and back) |
  | CalendarDays | flips (rotateX) |
  | Megaphone | shakes |
  | ClipboardCheck | the tick draws itself (`stroke-dashoffset` on the check path) |
  | ShieldAlert / ShieldCheck | pulse |
  | Users / UserPlus | bob |
  | GraduationCap | cap tips |
  | BookOpenCheck / BookText | tilt open |
  | Banknote / ReceiptText | slide-out |
  | BarChart3 / LineChart | bars or line grow |
  | Settings | quarter turn |
  | Building2 | rise |
  | anything else | a default lift (2px up, scale 1.08) |

- **Markup:** the NavLink gets the class `group`, and the icon is wrapped in `<span className={cx('nav-ic', \`nav-m-${motion}\`)}>`.
- **CSS:** `.group:hover .nav-m-wiggle svg { animation: nav-wiggle 450ms var(--ease-out) }`, and so on: about 12 small `@keyframes nav-*` next to the existing ones (styles.css:160-228). Each plays once per hover. The same motion plays once when an item becomes active, via `.active .nav-ic` on NavLink.
- **Reduced motion:** add `.nav-ic svg, .nav-ic svg *` to the `prefers-reduced-motion` block (styles.css:229) with `animation: none`. Transitions there are already cut to 1ms, which also covers the width, labels and indicator.

## 4. What's new (standing rule)
- Add a card in `app/src/pages/people/_whatsnew.jsx`: "A sidebar that gets out of the way" (Pin, unpin, hover to peek, icons that move). Its picture goes in a new prompt `'sidebar-pin'` in `app/scripts/whatsnew-images.mjs`, generated to `app/public/whatsnew/sidebar-pin.webp`.

## Files
- `app/src/layouts/Shell.jsx`: the main work
- `app/src/layouts/navMotion.js`: new
- `app/src/styles.css`: keyframes, `--sidebar-w`, reduced motion
- `app/src/layouts/SideSwitch.jsx`: a compact mode, if one is needed
- What's new files: listed above

## Verification
- `cd app && npm run build`: ui-lint stays at 67 or below, and the other checks pass.
- **Browser at 1280px**, against the vite dev server with the stand-in API, or a login on the deployed preview after deploy:
  - Pinned looks as it does today.
  - After unpinning: the 72px strip; badge dots; hover peek over the page with no content shift; leaving closes it.
  - Pinning from a peek pushes the page.
  - The choice survives a reload.
  - The active bar glides between pages.
  - Icon hover motions play.
  - `[` toggles the pin.
  - The action bar follows the width.
  - With reduced motion emulated, nothing animates.
- At 390px nothing changes: there is no sidebar and the tab bar is untouched.
- Afterwards, run `agent-browser close --all`.
- **Shipping:** commit with explicitly staged paths plus a build commit, then `openkbs site deploy` and push. This is site-only, with no API deploy.
