# Implementation plan: glowing "Needs you" drawer on phones, icons, motion, premium polish

The spec is saved at `spec/plan-needs-you-becomes-a-glowing-drawer-on-phones-plus-icons.md`. This is a frontend-only change: no API, data model or function changes. It adds no new dependencies (CSS plus small React hooks).

## 1. Shared building blocks (done by me first; the page agents depend on them)

### `app/src/ui/motion.js`
- **`useReveal()`**
  - Returns a ref callback that adds `data-reveal` to the element.
  - One module-level `IntersectionObserver` (`rootMargin: '0px 0px -8% 0px'`) sets `data-shown` once the element is in view, then stops watching it.
  - Elements already on screen at mount get `data-shown` on the next frame, so nothing flashes.
  - The stagger comes from `--i`, the element's index among its parent's revealed children, capped at 6.
  - It does nothing when `matchMedia('(prefers-reduced-motion: reduce)')` matches.
- **`useCountUp(value, { ms = 600 })`**
  - Animates numbers with `requestAnimationFrame` and an ease-out.
  - On first show it counts up from 0. On a later change it animates from the old value to the new one.
  - Non-number values pass straight through.
  - With reduced motion it returns the value as is.
- **`useBump(value)`**
  - Returns `true` for 450ms after `value` changes, so a badge can pop.

### `app/src/styles.css` (new block near the keyframes)
- **Reveal:**
  - `[data-reveal]:not([data-shown]) { opacity:0; transform: translateY(10px) scale(.985) }`
  - `[data-shown]` transitions opacity and transform over `--dur-3` with `--ease-ios`, delayed by `calc(var(--i,0)*35ms)`.
- **Attention glow:**
  - `@keyframes attn-breathe` animates a box-shadow halo using `--attn` (red, amber or blue).
  - `.attn-glow` runs it over 2.8s, infinite.
  - `@keyframes ico-ring` is a bell wiggle; `.attn-bell` runs it every 6s via a keyframe with a long pause.
- **Icon micro-animations:**
  - The `.ico-*` classes are `ico-ring`, `ico-pop`, `ico-spin`, `ico-nudge`, `ico-rot`, `ico-beat` and `ico-fly`.
  - They play on `:hover` and `:active` of the closest `.group` (Button, IconButton, Row and Chip get `group`).
  - They also play once when the element has `data-play`.
- **`.snap-row`** (horizontal card rows):
  - Uses `scroll-snap-type: x mandatory`, and the children use `snap-start`.
  - Where `@supports (animation-timeline: view(inline))` holds, children scale from .94 to 1 and fade from .6 to 1 as they come into view.
- **Badge pop:** `.badge-bump` uses the existing `pop` keyframe.
- **Empty states:** `.float-soft` is a gentle 4px float.
- **Reduced motion:** add `[data-reveal]`, `.attn-glow`, `.attn-bell`, the `.ico-*` classes, `.snap-row > *`, `.float-soft` and `.badge-bump` to the existing `prefers-reduced-motion` block, so they lose their animation and show at full opacity.
- **Polish tokens:**
  - a `--shadow-lift` hover for `.pressable-card` on hover-capable devices
  - a `:focus-visible` ring default for links and buttons, if one isn't already set
- **App styles:** soft, glass and flat get overrides only where the glow or shadow clashes, e.g. Flat uses a solid 2px ring instead of a blurred halo.

### `app/src/ui/index.jsx`
- **`AttentionDrawer({ id='needs', title, count, tone='blue', preview=[], lead, children, empty, className })`**
  - **Bar:** a `Pressable` card.
    - The icon tile is a Bell that gets `attn-bell` when `count > 0`.
    - Then the title and the count badge, using `useCountUp` and `useBump`.
    - Below that, the `lead` text (truncated) and up to 4 preview icon dots in their tones, then a ChevronUp.
    - When `count > 0` it carries `attn-glow` with `--attn` set from `tone`.
    - When `count` is 0 it shows `empty` (green check, "All clear") and does not open.
  - **Open state:** the URL query `drawer=<id>`, read with `useSearchParams`.
    - Opening pushes a history entry. Closing goes back if we pushed one, and otherwise replaces the query.
  - **Sheet:** `<Sheet open size="lg" title={title} full>` with `children`.
  - **`useAttention(id)` helper:** returns `open()`, so chips such as Dashboard's "To approve" can open it.
- **`Section`** gets `icon` and `count` props: a small tinted icon, then the title, then the count pill.
- **`Segmented`:**
  - Options may carry `icon`.
  - The new `iconOnly` prop is a boolean or `'phone'`, using `useMedia('(max-width: 639.98px)')`. It renders the icon with `aria-label` and `title` set to the label.
- **`Tabs`** passes `iconOnly` through.
- **`Chip`:**
  - New `icon` prop.
  - New `compact` prop: icon plus number, with the label kept as `aria-label` and `title`.
  - The value uses `useCountUp`, and `badge-bump` plays on change.
- **`Stat` and `Tile` values:** numbers go through `useCountUp`. They are parsed only when they are plain numbers; money and text strings are left alone.
- **`Tile`, `List`, `PhotoCard` and `Empty`** attach `useReveal`. `Empty`'s icon gets a tinted circle and `float-soft`.
- **`Row`** (when it has `to` or `onClick`), **`Button`** and **`IconButton`** get the `group` class, so icon animations fire on hover and press. Icons choose their animation through `ico-*` classes on the icon. A small `icoAnim(Icon)` map assigns them: Bell→ring, Check→pop, Refresh→spin, Arrow/Chevron→nudge, Plus→rot, Heart→beat, Send→fly. It's used by `Button`, `IconButton`, `Row` and `Section` automatically.
- **`Button iconOnly='phone'`** shows the icon only below sm, with `aria-label` and `title` set to the children text.

### `app/src/ui/hub.jsx`
- **`HubTabs`:**
  - A sliding underline: measure the current link (the same approach as Segmented's thumb) and render one absolutely positioned bar that transitions `left` and `width`.
  - Optional `t.icon` comes from `hubs.js`.
  - The count badge uses `useBump`.
- **`hubs.js`** keeps its data, plus optional `icon` names resolved in `hub.jsx` from a small lucide map, so `hubs.js` stays plain.

### `app/src/layouts/Shell.jsx`
- **Bottom tab bar:**
  - The active tab gets a pill behind its icon that slides between tabs.
  - Badges get `badge-bump` when their number changes.
- **Toasts:** add an icon by tone, and play a check `ico-pop` on success.

## 2. Attention drawers on pages (done by me)
- **`pages/manager/Dashboard.jsx`**
  - Below `lg`, replace `<section id="needs">{queue}</section>` with `<AttentionDrawer title="Needs you" count={total} tone={red rows? 'red' : orb? 'blue' : 'amber'} preview={list icons + Sparkles for Orb} lead={first need's text}>{queue}</AttentionDrawer>`.
  - The "To approve" chip and `scrollTo('needs')` call the drawer's `open()` on phones.
  - Desktop is unchanged.
- **`pages/officer/Home.jsx`**
  - Restructure `ToDo` so it returns `rows` through a `useToDo(d, packs)` hook.
  - Combine those rows with the "Needs your answer" shifts into one `AttentionDrawer title="To do"`.
  - The answer shifts render first inside, as `ShiftCard`s with their buttons.
  - The tone is red if any row is red, otherwise amber or blue.
  - The bar sits where "Needs your answer" was. The short status rows stay inline.
  - At lg and up it renders inline as today. Officers mainly use phones, but this keeps desktop unchanged.
- **`pages/officer/Me.jsx`:** "Needs your attention" and "Getting set up" both go inside one `AttentionDrawer title="Needs your attention"`, with the count being items to sign or fix plus open tasks.
- **`pages/money/VenueDashboard.jsx`:** `NeedsYou` renders through `AttentionDrawer` below lg, using the same items.

## 3. Page pass: icons and polish (3 parallel agents, same split as the last rollout)
I'll brief each agent with the new primitives and these rules:
- Add `icon` to `Section` headings on dashboards and home pages.
- Add `icon` to `Chip`s, with `compact` on phones.
- Add icons to view and density `Segmented` options, with `iconOnly="phone"` where the meaning is clear (Grid/List, By venue/day/officer, Comfortable/Compact).
- Primary page actions get `iconOnly="phone"`.
- Horizontal card rows use `snap-row` (Everyday events, officer offers).
- No behaviour changes.

The split:
- **Agent A:** manager, people, shared and shift pages.
- **Agent B:** money, platform, learn, team, email, everyday and help pages.
- **Agent C:** officer and venue pages.

Agents build only into `/tmp/build-*` and don't edit `src/ui`, `src/layouts` or `styles.css`.

## 4. Release
- Add a What's new card at the top of `UPDATES` in `pages/people/_whatsnew.jsx`: "A smoother, more polished app". It uses the Sparkles icon, image `polish-motion`, and today's date.
- Add an image prompt to `app/scripts/whatsnew-images.mjs` and run `node app/scripts/whatsnew-images.mjs polish-motion`.

## 5. Verification and deploy
- `cd app && npm run build`. The ui-lint total must stay at or under 70; new icon sizes use the existing size tokens, and any raw `<button>` goes through `Pressable`.
- Grep `site/app/assets/index-*.js` for the Opulence API id `6ij75kpgf7kiwtvwo3nke763dm0oejxo`.
- Run the local preview (`npx vite preview`, or open the built `site/app` through a static server) with agent-browser at 375×812. The login screen renders, but pages behind sign-in can't be reached without credentials. If the existing dev or mock setup allows it, render `AttentionDrawer` and the reveal on a harmless page. Otherwise rely on the build and the user's review.
- Commit `feat:` (code, card and image), then commit `build: site with …`. Run `openkbs site deploy`, then `git push origin master`.
- Close the browser with `agent-browser close --all`.
