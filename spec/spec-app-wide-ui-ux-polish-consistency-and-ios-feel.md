# Spec: App-wide UI/UX polish, consistency and iOS feel

## Context
Orb Security has four portals: company, security manager, venue client and officer. They all share one shell (`app/src/layouts/Shell.jsx`) and one library of building blocks (`app/src/ui/index.jsx`). That shared base is solid, but around 40 features have been built on top of it and drifted:
- **Inconsistent basics:**
  - 30 different icon sizes and 25 different text sizes, with no scale behind them;
  - 25 hard-coded colours that bypass the theme;
  - about 98 hand-made buttons that bypass the shared Button. Around 40 of them copy it with small differences.
- **Doesn't feel like an iPhone app:**
  - no page transitions; sheets, toasts and the picture viewer vanish with no close animation;
  - the whole shell flashes a spinner when a new page loads for the first time;
  - going back loses your place in a list;
  - every text box zooms the iPhone screen on tap, because the text is under 16px;
  - many buttons are smaller than a finger (32–36px).
- **Layout bugs:**
  - the officer tab bar covers the bottom of pages on desktop;
  - floating bars sit at three different hand-tuned heights;
  - some sticky headers slide under the notch;
  - the page header and the content don't line up on wide screens.

**Goal:** every portal, at every screen size, looks and behaves like one product with a calm, native-iOS feel.
- Press feedback, sheets that slide in and out, smooth page changes, no zoom jumps, no layout glitches.
- One icon size scale, one button family and one text scale.

The user chose **every portal equally** for the depth of the upgrade. The questions they skipped were set to these defaults:
- **polish the current look.** Colours, fonts and layout stay as they are; nothing gets a visual redesign.
- **ship in phases.** Each phase is deployed and checked before the next.
- **the app installs to the iPhone home screen as a full-screen app.**

## Scope
**In:**
- design tokens and scales;
- shared building blocks;
- motion;
- iOS behaviour;
- layout fixes;
- moving every page onto the shared pieces, across all four portals and the public and sign-in pages.

**Out:**
- new features;
- dark mode (deferred, though the new colour tokens make it possible later);
- a brand or colour refresh;
- backend changes;
- new npm dependencies. All motion is done in CSS, with the browser's built-in page transitions where supported.

## 1. Foundations (`app/src/styles.css`, `@theme`)
- **Text scale:** 7 named sizes replace the 25 pixel values.

  | Name | Size |
  |---|---|
  | caption | 12 |
  | footnote | 13 |
  | subhead | 14 |
  | body | 15 |
  | callout | 16 |
  | title3 | 20 |
  | title1 | 30 |

  - Text boxes always use at least 16px.
  - Pages switch from `text-[13px]` to `text-footnote`, mapped automatically: 12.5 rounds to 13, 10.5 to 11, and 11 becomes caption.
- **Colours:** the 25 stray hex values become tokens:
  - `fill` (#EEF0F3)
  - `fill-strong` (#E8EAEE)
  - `blue-press`
  - `red-press`
  - `toggle-off`
  - `star`
- **Radius scale:** `sm` 10, `md` 14 (controls), `lg` 18, `tile` 22 and `sheet` 28. The arbitrary 7, 9 and 20px values go.
- **Motion tokens:**
  - `--ease-ios: cubic-bezier(.32,.72,0,1)`
  - `--ease-out`
  - durations of 160, 240 and 360ms
  - new keyframes: `sheet-down`, `fade-out`, `pop`, `slide-in-right`, `shimmer`
- **Reduced motion:** the current rule switches everything off. It changes to shorten movement to a simple fade, and spinners keep turning.
- **iOS basics:**
  - `touch-action: manipulation` (stops double-tap zoom);
  - `overscroll-behavior: contain` on sheets and scroll areas;
  - `dvh` instead of `vh`;
  - left and right safe-area insets;
  - one `--tabbar-h` variable for everything that floats above the tab bar.
- **Icons:** a `ICON` scale (xs 14, sm 16, md 18, lg 20, xl 24) with strokeWidth 2 everywhere. Every `size={…}` on a lucide icon moves to the scale. Hero and empty-state icons are the only exceptions.

## 2. Shared building blocks (`app/src/ui/index.jsx`)
- **Button:**
  - sizes `sm` 36, `md` 44, `lg` 52, so taps register reliably;
  - new variants `link` (blue text) and `plain`;
  - a new prop `iconOnly`;
  - press feedback is a scale to 0.97 plus a dimmed state, timed with `--ease-ios`.
- **IconButton:** a 44px tap area (the visible circle can stay 36px); tones `ghost`, `soft` and `solid`; an optional badge count. This replaces the 11 hand-made round buttons.
- **Pressable:** a new wrapper for tappable cards and rows. It gives one consistent press scale and highlight; today's mixed scale values move onto it. Used by Tile, Row, ShiftCard, the Rota officer chip, course cards and the like.
- **Sheet:**
  - an animated close on Escape, the backdrop or the X;
  - drag the handle down to dismiss on phones;
  - a scale-and-fade (not a slide) for the desktop pop-up;
  - a scroll lock that also works on iOS;
  - the bottom safe-area gap even when there is no footer;
  - `overscroll-behavior: contain`.
- **Toast:**
  - animates in and out;
  - errors are announced immediately to screen readers (`role="alert"`) and can be swiped or tapped away;
  - optional action button, such as "Undo".
- **Lightbox:** one shared viewer in `ui/Lightbox.jsx`, merging the two copies.
  - Base it on the better incident version: swipe, scroll lock, safe areas.
  - Add a zoom-in from the thumbnail, pinch or double-tap zoom, and an animated close.
  - Everyday, Academy and incidents all use it.
- **Skeleton:**
  - new `Skeleton`, `SkeletonRow` and `SkeletonTile` pieces with a shimmer;
  - `Load` takes a `skeleton="list|tiles|detail"` option, so the main lists show page-shaped placeholders instead of a spinner.
- **Inputs:**
  - text 16px, height 44px;
  - the `error` message is finally passed through to the field, shown in red with an icon;
  - a new `SearchInput` (magnifier, clear button, 16px) replaces the 7 hand-made search boxes.
- **Tabs and Segmented:**
  - an animated sliding highlight;
  - 36px minimum height;
  - one rule: Tabs for page sections, Segmented for 2–3 filters;
  - it replaces the hand-made copies in TimeOff, Timesheets and the Toolbox.
- **Duplicates merged:**
  - Check, now in the `ui` library;
  - Progress, in `ui` with an animated fill;
  - Chip and Chips, in `ui`.
- **ActionBar:** a new floating bar for bulk selection, docked above the tab bar using `--tabbar-h`. It replaces the Timesheets and Pay bars and the floating save buttons in Settings and IncidentForm.
- **Accessibility:**
  - spinners and skeletons get `role="status"` and `aria-busy`;
  - Dot gets a hidden text label;
  - evidence tiles get alt text.

## 3. Shell and navigation (`layouts/Shell.jsx`, `main.jsx`)
- **Page transitions:**
  - Turn on React Router's `v7_startTransition`.
  - Add a `Suspense` inside the shell, so a page loading for the first time shows a skeleton in the content area while the sidebar and tab bar stay put.
  - Page changes use the browser's View Transitions where supported (Safari 18+ and Chrome): a slide in from the right when going deeper and a slide back when returning, otherwise a fade. Older browsers get no animation.
- **Back and scroll:**
  - Back uses the browser history when there is one, so it returns you to where you were, with a fallback to today's route.
  - `<ScrollRestoration>` behaviour keeps your scroll position when you return to lists. This replaces the forced scroll to the top.
- **Large title that collapses:**
  - the big page title shrinks into the header as you scroll (iOS-style), using an IntersectionObserver;
  - the header and the content share one max width.
- **Tab bar:**
  - an animated active indicator;
  - the icon "pops" when pressed;
  - tapping the active tab scrolls to the top;
  - the bar height is exposed as `--tabbar-h`.
- **Officer layout on desktop:** content padding accounts for the tab bar, so nothing is hidden. The officer layout stays centred at max 672px.
- **Sticky elements** (Rota day headers, the Pay bar) sit below the header plus the notch, using `top: calc(56px + env(safe-area-inset-top))`.
- **Pull to refresh:** on the officer home and feeds (Home, Shifts, Everyday, Notifications), done with a small hook (`ui/usePullRefresh.js`) that calls the page's existing `reload`.

## 4. Install as an app (PWA)
- **Splash screens:** `apple-touch-startup-image` splash screens for common iPhone sizes, generated once from the logo onto the brand background.
- **Status bar:** `black-translucent` when installed.
- **Manifest icons:** separate `any` and `maskable` icons in the manifest.
- **Theme colours:** `theme-color` matches the header.

## 5. Moving pages onto the shared pieces (all portals)
The same pattern applies to every page:
- raw `<button>` becomes Button, IconButton, Pressable or a link button;
- hand-made inputs become Input or SearchInput;
- `text-[Npx]` becomes the text scale;
- icon sizes move to `ICON`;
- hex colours become tokens;
- spinners in lists become skeletons;
- floating bars become ActionBar.

The worst offenders go first:
- `everyday/PostCard.jsx` (24 raw buttons)
- `manager/Rota.jsx`
- `shared/IncidentDetail.jsx`
- `officer/IncidentForm.jsx`
- `officer/Clock.jsx`
- `people/_profileTabs.jsx`
- `ui/Chat.jsx`
- `venue/Requests.jsx`

A small checker script (`app/scripts/ui-lint.mjs`, using plain Node and regex) reports any leftover raw sizes, hex colours and raw buttons. It runs before each phase's deploy, and the target is zero outside the agreed exceptions.

## 6. Phases (each phase is built, deployed and checked on its own)
1. **Foundations and building blocks:** sections 1 and 2, the Shell (section 3) and the PWA (section 4). Pages that already use the shared pieces upgrade automatically, which covers most of the app.
2. **Officer app** (22 pages): Home, Clock, Shifts, Pay, Learn, Everyday, Incidents, Profile; move them over and add pull to refresh.
3. **Company and security portals** (29 and 20 pages): Rota, Timesheets, Pay runs, Staff, Settings, Academy, Toolbox, Ops AI, Venues, Invoices.
4. **Venue portal, sign-in and public pages**, then a final checker run across the whole app.

## 7. Verification (every phase)
- Run `cd app && npm run build`. The bundle size must stay within about 5% of today's.
- Run the checker script and track the counts going down.
- **Browser checks** with agent-browser at 390×844 (iPhone), 768 (iPad) and 1440 (desktop), for each portal using the demo accounts:
  - no horizontal scroll (`scrollWidth`);
  - nothing hidden under the tab bar or notch;
  - sheets open and close with animation, and drag-to-close works;
  - toasts animate in and out;
  - Back keeps the list scroll position;
  - the large title collapses;
  - tapping a text box doesn't zoom the page (computed font-size ≥16);
  - tap targets are at least 44px (computed `getBoundingClientRect` on the buttons in the main flows).
- **Reduced motion:** with it emulated, everything still works and spinners still turn.
- **Before-and-after screenshots** of the key screens in each portal, reviewed for consistency.
- **Regression pass on the main flows:**
  - officer: clock in, an incident report, a course and quiz, an Everyday post;
  - manager: a Rota assign, Timesheet approval, a pay run, Course edit;
  - venue: a request.
- Run `agent-browser close --all` after each session.
- Post a plain-language comment on the board after each phase.

## Effort and risk
- About 4 phases of work. Phase 1 has the widest impact and the most risk, because it touches shared pieces used by every page, so it gets the full screenshot pass.
- No data, API or permission changes; rollback is a redeploy of the previous site version.
