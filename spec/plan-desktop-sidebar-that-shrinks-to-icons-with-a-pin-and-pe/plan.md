# Implementation plan: Desktop sidebar that shrinks to icons, with a pin and per-module icon motion

Spec: spec/plan-desktop-sidebar-that-shrinks-to-icons-with-a-pin-and-pe.md (approved)

**Scope:** front end only. No database, API or function changes. Deploy is `openkbs site deploy`.

## Files
| File | Change |
|---|---|
| `app/src/layouts/Shell.jsx` | sidebar state, structure, indicator, pin, shortcut |
| `app/src/layouts/navMotion.js` | **new**: icon → motion map |
| `app/src/styles.css` | `--sidebar-w`, sidebar transitions, `nav-*` keyframes, reduced-motion entries |
| `app/src/pages/people/_whatsnew.jsx`, `app/scripts/whatsnew-images.mjs`, `app/public/whatsnew/sidebar-pin.webp` | What's new card and picture |
| `spec/plan-desktop-sidebar-…/plan.md` | this plan, saved next to the spec |

## 1. Sidebar state (`Shell.jsx`, managers only, desktop only)
- **A `useSidebar()` hook in Shell.jsx:**
  - `pinned` starts from `localStorage['orb.nav.pinned'] !== '0'`, so it defaults to pinned. It is wrapped in try/catch with `/* private mode */`.
  - `setPinned` writes the value back.
  - `peek` and `setPeek` use one timer ref: `enter()` waits 120ms before `setPeek(true)`, and `leave()` waits 300ms before `setPeek(false)`. Each clears the other's timer, and the timer is cleared on unmount.
  - `open = pinned || peek`.
- **Keyboard:**
  - `onFocus` on the panel calls `setPeek(true)`. `onBlur` with `!panel.contains(e.relatedTarget)` calls `leave()`.
  - The `[` key toggles the pin when there's no modifier and focus is not in an input, textarea, select or contentEditable. One `keydown` listener in a `useEffect`.
- **Route changes** close a peek straight away: the existing `loc.pathname` effect at Shell.jsx:230 gets `setPeek(false)` added.
- **The layout effect at Shell.jsx:252** also sets `html.style.setProperty('--sidebar-w', isOfficer ? '0px' : pinned ? '260px' : '72px')`, with `pinned` added to its deps. Cleanup removes the property.

## 2. Structure: replaces Shell.jsx:272-297
```jsx
<aside className="sticky top-0 z-40 hidden h-dvh shrink-0 lg:block side-spacer" style={{ width: pinned ? 260 : 72 }}
  onMouseEnter={enter} onMouseLeave={leave}>
  <div data-style="control" data-open={open || undefined} ref={panelRef}
    className={cx('side-panel absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-line px-3 py-5',
      !pinned && open && 'shadow-sheet')}
    style={{ width: open ? 260 : 72 }} onFocus={…} onBlur={…}>
```
- **CSS:** `.side-spacer, .side-panel { transition: width var(--dur-3) var(--ease-ios), box-shadow var(--dur-2); }`. The panel's background comes from `data-style="control"`, as today. I'll check the background is opaque so the peek covers the page; if not, add `bg-bg`.
- **Logo row:** `<Logo place="sidebar" tone="light" compact={!open} />` plus a small pin button, shown only when `open`. (As built: the pin sits in the panel's top-right corner, `absolute right-1.5 top-1.5`, so it never cuts off the company name.)
  - The button is a `Pressable` with `h-7 w-7 rounded-full grid place-items-center text-faint hover:text-gold before:absolute before:-inset-2 relative`, using the `before:` tap area that ui-lint expects.
  - `aria-pressed={pinned}`, plus `aria-label` and `title` "Keep the menu open ([)" or "Let the menu shrink ([)".
  - The icon is lucide `Pin` (size 16) with `transition-transform` and `rotate-45` when unpinned.
  - It fades in with `side-fade`.
- **SideSwitch:** wrapped in `<div className="side-fade">`. It is rendered only when `open`, so the segmented control never squeezes into 48px. Its height collapses: when closed it is replaced by a 0-height placeholder. That's acceptable because the switch only appears for dual-role managers.
- **Section titles:** one element with two states. When open, it's the title text. When closed, it's a centred `mx-auto h-px w-6 bg-line` hairline. A fade between them via `side-fade`, and a fixed `h-4` row so the list doesn't jump.
- **Nav item** (also used for Help, with the same props):
  ```jsx
  <NavLink … aria-label={it.label} title={open ? undefined : it.label} style={{ '--i': idx }}
    className={({ isActive }) => cx(NAV_ITEM, 'group', isActive ? NAV_ON : NAV_OFF)}>
    <span className={cx('nav-ic relative', `nav-m-${motionFor(it.icon)}`)}>
      <it.icon size={18} />
      {!open && badges[it.badge] > 0 && <Badge n={…} className="absolute -right-2.5 -top-2 ring-2 ring-[var(--color-bg)]" />}
    </span>
    <span className="side-label flex flex-1 items-center gap-2 whitespace-nowrap">{label}<Tag/><Badge/></span>
  </NavLink>
  ```
  - `NAV_ITEM` keeps `px-3`. At 72px wide minus `px-3` padding, the 48px item centres an 18px icon at `px-3` + 15px, so the icon column stays in the same place open or shut and nothing slides sideways.
- **Labels:** `.side-label { transition: opacity var(--dur-2), transform var(--dur-2) var(--ease-out); transition-delay: calc(var(--i,0) * 15ms) }`. `[data-open] .side-label` is shown; without `data-open` it is `opacity:0; transform:translateX(-8px); pointer-events:none`. The panel's `overflow-hidden` clips it, so it needs no width animation. `.side-fade` uses the same rule without the stagger.
- **User card:** keeps the same markup with the text block wrapped in `side-label`. When closed, the `Pressable` padding goes from `p-3` to `p-1.5`, and the avatar drops to size 32 so it fits the 48px column.
- **Nav scroll:** `<nav>` keeps `overflow-y-auto no-scrollbar` and gets `overflow-x-hidden`.

## 3. Gliding active indicator (`Shell.jsx`)
- **Element:** `<nav className="relative …">` holds `<span aria-hidden ref={pillRef} className="nav-pill pointer-events-none absolute left-0 right-0 top-0 rounded-xl bg-blue-soft before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--accent-fill)]" />` placed first, with the groups wrapped in `relative` so they stay above it.
- **Positioning:** a `useLayoutEffect([loc.pathname, groups.length, open])` finds `navRef.current.querySelector('a[aria-current="page"]')`.
  - If found, it sets `pill.style.transform = translateY(${a.offsetTop}px)`, `height = a.offsetHeight + 'px'` and `opacity = 1`; otherwise `opacity = 0`.
  - On the first measurement the transition is skipped: set `data-ready` after a frame. That way it doesn't fly in from the top.
- **Transition:** `.nav-pill[data-ready] { transition: transform var(--dur-3) var(--ease-ios), height var(--dur-2), opacity var(--dur-2) }`.
- **Styles:** `NAV_ON` becomes `'text-blue'` for links inside `<nav>`. The Help link sits outside `<nav>`, so it gets the old full style, kept as `NAV_ON_STATIC`.

## 4. Per-module icon motion (`navMotion.js` and `styles.css`)
- **`navMotion.js`:**
  ```js
  import { LayoutGrid, MessagesSquare, Mail, Radio, CalendarDays, … } from 'lucide-react';
  const M = new Map([[LayoutGrid, 'tiles'], [MessagesSquare, 'wiggle'], [Mail, 'lift'], [Radio, 'waves'], [CalendarDays, 'flip'], [CalendarOff, 'flip'],
    [Megaphone, 'shake'], [Siren, 'shake'], [ClipboardCheck, 'tick'], [ShieldAlert, 'pulse'], [ShieldCheck, 'pulse'], [TriangleAlert, 'pulse'],
    [Users, 'bob'], [UserPlus, 'bob'], [GraduationCap, 'tip'], [BookOpenCheck, 'tilt'], [BookText, 'tilt'], [BookOpen, 'tilt'],
    [Banknote, 'slide'], [ReceiptText, 'slide'], [BarChart3, 'grow'], [LineChart, 'grow'], [Settings, 'turn'], [Building2, 'rise']]);
  export const motionFor = (icon) => M.get(icon) || 'lift';
  ```
- **Keyframes** (about 13 `@keyframes nav-*`, placed after styles.css:228):
  - Whole-icon motions on the `svg`, with `transform-box: fill-box; transform-origin: center`:
    - `wiggle`: rotate ±10°
    - `lift`: translateY -3px and back
    - `flip`: rotateX 0 to 360°, with perspective
    - `shake`: translateX ±2px three times
    - `pulse`: scale 1 to 1.18 to 1
    - `bob`: translateY -2px twice
    - `tip`: rotate -14° then back
    - `tilt`: skewY or rotate 8°
    - `slide`: translateX 3px and back
    - `turn`: rotate 90°
    - `rise`: translateY 2px to -2px to 0
  - Part-level motions (lucide's SVG children are stable):
    - `tiles`: `svg > rect:nth-child(n)` scale 0.6 to 1 with an `animation-delay` of n×60ms
    - `waves`: `svg > path` opacity 0.2 to 1, outer arcs delayed
    - `tick`: `ClipboardCheck`'s check path (`path:last-child`) with `stroke-dasharray:20; stroke-dashoffset` 20 to 0
    - `grow`: `BarChart3` / `LineChart` paths with `scaleY` from the bottom
    - Before writing these, I'll check the actual child order in `node_modules/lucide-react/dist/esm/icons/*.js`.
- **Triggers:** `@media (hover:hover) { .group:hover .nav-m-X svg… { animation: nav-X 480ms var(--ease-out) } }`, and the same for `.group.active` (NavLink adds the `active` class) when it becomes active.
  - Only the change from inactive to active plays: the indicator's layout effect adds a `data-just` attribute to the newly active link for 600ms, and CSS uses `[data-just] .nav-ic svg`. This stops every active icon animating on first load.
- **Reduced motion:** extend the block at styles.css:229 with `.nav-ic svg, .nav-ic svg * { animation: none !important; }`. Width, label and pill transitions are already forced to 1ms by the global rule.

## 5. Docked bars follow the width
- `styles.css:133` becomes `@media (min-width:1024px){ html.has-sidebar .action-bar { left: var(--sidebar-w, 260px); transition: left var(--dur-3) var(--ease-ios); } }`.
- The `.orb-fab` is right-docked, so it isn't affected. I'll grep for other `260px` uses and convert any found.

## 6. What's new
- **`whatsnew-images.mjs`:** add a `'sidebar-pin'` prompt (dark gold sidebar folding into an icon rail, a small brass pin, motion lines).
- **Generate it** with the existing script: `cd /home/user/project/app && node scripts/whatsnew-images.mjs sidebar-pin`, run as its own command.
- **`_whatsnew.jsx`:** a new top card dated 2026-11-07, icon `Pin`, titled "A sidebar that gets out of the way". The lede and points cover: unpin to shrink to icons, hover to peek without moving the page, the pin or `[`, badges kept as dots, the gold bar that glides, and icons with their own little motion.

## 7. Verification
1. `cd /home/user/project/app && npm run build`: ui-lint stays at 67 or below, and the emergency and flow checks pass.
2. **Browser:** restart the stand-in from /tmp/feedtest (PGlite plus http.mjs, and vite on 5199 with `VITE_API_BASE`), then use agent-browser at 1280×800 as the company manager. Nothing touches live.
   - Pinned matches the current look.
   - Unpinning shrinks to 72px; check the badge dots and that the content reflows once.
   - Hovering peeks over the page with a shadow and no content shift (compare the main column's `getBoundingClientRect().left` before and during). Leaving closes it after about 300ms.
   - Pinning from a peek pushes the page. The setting survives a reload.
   - Clicking Rota then Incidents makes the pill glide (screenshot mid-transition).
   - Hovering icons plays their motions.
   - `[` toggles the pin.
   - With `prefers-reduced-motion` emulated, nothing animates.
3. At 390px: there is no sidebar and the tab bar is unchanged.
4. `agent-browser close --all`, and stop the stand-in processes.
5. `node --test` in functions/api is not needed (no API change), but I'll run it as a sanity check.

## 8. Ship
- **Commit 1**, explicitly staged: Shell.jsx, navMotion.js, styles.css, the What's new files and the spec/plan files.
- **Commit 2:** `build: site with the shrinking sidebar` (site/app).
- Both end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Then `openkbs site deploy` and `git push origin master --tags`.
