# Implementation plan: App-wide UI/UX polish and iOS feel

## Context
The spec is saved at `spec/spec-app-wide-ui-ux-polish-consistency-and-ios-feel.md` and approved. It asks to polish the current look, not redesign it, across all four portals and every screen size, and to ship in phases.

Today's code:
- One shell: `app/src/layouts/Shell.jsx`.
- One shared UI library: `app/src/ui/index.jsx`.
- Tailwind v4 with every token in the `@theme` block of `app/src/styles.css`.
- `BrowserRouter` from react-router-dom 6.28. It is not a data router, so `<ScrollRestoration>` and `viewTransition` are not available and need small replacements written here.
- No animation library. No new dependencies will be added.

Measured drift:
- 25 `text-[Npx]` sizes and 30 icon sizes;
- 25 raw hex colours;
- 98 raw `<button>`s;
- inputs at 15px, so iOS zooms in on focus;
- tap targets of 32–36px;
- sheets, toasts and the lightbox close with no exit animation;
- one top-level Suspense, so the whole shell flashes on a lazy route load;
- forced `scrollTo(0,0)` on every navigation;
- three hand-tuned bottom offsets and missing safe-area insets.

## Progress so far (paused here)
- **1a done:** `app/src/styles.css` has the type, colour, radius and motion tokens, the animation classes and the new reduced-motion rule. `--color-star` was renamed to `--color-amber-bright`, and `--color-red-bright` (#F87171) was added for the dark Dashboard tile.
- **1b written, not applied:** `app/scripts/ui-codemod.mjs`. The dry run reports **922 changes** across about 60 files. It skips `<Avatar size>` and `learn/Certificate.jsx`. #E9ECF1 maps to `bg-fill` and #FDF3F3 to `bg-red-soft/70`.
- **Next on resume:** look at the dry-run list (the biggest files are `ui/index.jsx` with 43 and `shared/IncidentDetail.jsx` with 37), apply the codemod, run `vite build`, then continue from 1c.
- Nothing has been committed or deployed for this work yet.

## Phase 1: Foundations, primitives, shell, PWA (one deploy)

### 1a. `app/src/styles.css`
- **Type scale tokens** in `@theme`, using Tailwind v4 `--text-*` with a line height:
  - `caption2` 11, `caption` 12, `footnote` 13, `subhead` 14, `body` 15, `callout` 16;
  - `headline` 17, `title3` 20, `title2` 24, `title1` 30, `large` 34.
  - This is the spec's seven sizes plus the in-between sizes the app really uses, so existing sizes map to a token without changing the look.
  - Display numbers of 40px and up stay explicit and are allowed exceptions.
- **Colour tokens** for the stray hex values:
  - `--color-fill` #EEF0F3, `--color-fill-strong` #E8EAEE
  - `--color-blue-press` #dbe7ff, `--color-red-press` #fbdcdc
  - `--color-toggle-off` #E3E5E8, `--color-star` #FBBF24
  - The Avatar tints are mapped too.
- **Radius tokens:** `--radius-control: 14px`, `--radius-sheet: 28px`. Arbitrary values map to these.
- **Motion tokens:**
  - easings: `--ease-ios: cubic-bezier(.32,.72,0,1)`, `--ease-out: cubic-bezier(.2,.8,.2,1)`;
  - durations: `--dur-1: 160ms`, `--dur-2: 240ms`, `--dur-3: 360ms`;
  - keyframes: `sheet-down`, `fade-out`, `pop` (scale .96 to 1), `modal-in` and `modal-out` (scale plus fade), `toast-in` and `toast-out`, `page-in-right`, `page-in-left`, `page-fade`, `shimmer`.
- **Reduced motion:** replace the current rule with one that keeps fades but removes movement. Transforms are dropped and durations shortened to 1ms, except `.animate-spin`, which keeps turning. The `page-*` and `sheet-*` animations turn into a fade.
- **iOS rules:**
  - `html { touch-action: manipulation; }` and `-webkit-text-size-adjust: 100%`;
  - `.overscroll-contain` on sheet and scroll bodies;
  - `.safe-x` (left and right insets) on the header, the main area and the tab bar;
  - `:root { --header-h: 56px; --tabbar-h: calc(58px + env(safe-area-inset-bottom)); }` for anything that docks to these bars;
  - `.pressable` class: `transition: transform var(--dur-1) var(--ease-ios), background-color var(--dur-1)`, and `:active` scales to .97;
  - all `h-screen` / `min-h-screen` / `vh` uses become `dvh` versions (`min-h-dvh`, `max-h-[92dvh]`).

### 1b. Codemod: `app/scripts/ui-codemod.mjs` (Node, regex only, run once and commit)
- **Text sizes:** `text-[Npx]` becomes the nearest scale token: 10, 10.5 and 11 go to caption2; 12 and 12.5 go to caption; 18 goes to headline; 19 goes to title3; 26 goes to title2; 28 goes to title1.
- **Icon sizes:** lucide `size={N}` snaps to {14, 16, 18, 20, 24}. Sizes of 28 and up are hero sizes and are left alone. `strokeWidth={2.2}` is removed, so the default of 2 applies.
- **Colours and radii:** raw hex and arbitrary radius classes become the tokens from 1a.
- **Dry run first:** `--dry` prints a per-file diff count, which I'll check before applying.
- **Exclusions:** the certificate print page (`learn/Certificate.jsx`) and the Leaflet styles.

### 1c. Lint: `app/scripts/ui-lint.mjs` (Node), wired into the build
Wired in as `"build": "node scripts/ui-lint.mjs --report && vite build"`. The report never fails the build. It counts:
- leftover `text-[`, off-scale icon sizes and raw hex;
- raw `<button` outside `src/ui/`;
- inputs below 16px;
- `h-8` / `h-9` on tappable elements.

The goal is zero by the end of phase 4. A `// ui-ok` comment marks an allowed exception on a line.

### 1d. `app/src/ui/index.jsx` (and new files under `app/src/ui/`)
- **`usePresence(open, ms)` hook** returns `{mounted, closing}`, so Sheet, Toast and Lightbox can play their close animation before unmounting.
- **Button:**
  - sizes: `sm` h-9 (36, allowed only in dense desktop tables and toolbars) with a 44px hit area through `before:` inset; `md` h-11 (44); `lg` h-[52px];
  - new variants: `link` (blue text, no background, padding −2) and `plain` (ink text, hover fill);
  - new props: `iconOnly`, `iconRight`;
  - the `.pressable` class plus `active:opacity-90`;
  - icon sizes 16 / 18 / 20 by button size;
  - the busy state keeps the label width steady, so nothing jumps.
- **IconButton:**
  - tones `ghost` (default), `soft` (bg-fill) and `solid` (surface plus shadow-tile, as used by the header buttons);
  - `size` md = 40 visible with a 44px hit area, lg = 48;
  - an optional `badge` count;
  - icon size 20.
- **Pressable (new):** `({as=Link|'button', to, onClick, className, children})`. One press scale (.98 for cards, through `.pressable-card`) plus an `active:bg-fill` highlight option. Tile (when it has `to`) and Row use it internally.
- **Field, Input, Textarea, Select:**
  - `inputCls` gets `text-callout` (16px) and h-11;
  - the `error` prop is passed through to Field (the fix);
  - `aria-invalid` and a red border when there is an error;
  - an `AlertCircle` icon on the message.
- **`SearchInput` (new):** a Search icon, a clear button, `type="search"`, `enterKeyHint="search"`, at 16px.
- **Segmented and Tabs:**
  - an animated thumb, an absolutely positioned white pill that slides with `--ease-ios`, measured with a ref and `ResizeObserver`;
  - buttons at least 36px high;
  - colours from the bg-fill-strong token;
  - Tabs keep the edge-to-edge scroll wrapper and scroll the active tab into view.
- **Toggle:** colours from tokens; the knob moves with `--ease-ios`.
- **Sheet:**
  - closes with an animation through `usePresence`: `sheet-down` on phones, `modal-out` from `sm` up;
  - opens with a modal scale on desktop instead of the slide;
  - drag the handle or header down to dismiss on phones, using pointer events: past 120px or a fast flick it closes, otherwise it springs back;
  - iOS-safe scroll lock: `position:fixed` on body with the saved `scrollY`, restored on close;
  - `overscroll-contain` and `safe-b` on the body when there's no footer;
  - the close button becomes IconButton tone soft.
  - ConfirmProvider inherits all of this.
- **Toast:**
  - animates in and out (`toast-in`/`toast-out`);
  - errors get `role="alert"`, the rest `role="status"`;
  - tap to dismiss, or swipe up;
  - an optional `{action:{label,onClick}}`, for example "Undo", using the signature `toast(msg, kind, opts)`. Existing callers don't change.
- **Lightbox (new, `ui/Lightbox.jsx`):**
  - lifts the incident version from `pages/shared/IncidentDetail.jsx:346`: swipe, scroll lock and safe-top;
  - adds a zoom-in from the thumbnail's rectangle (FLIP on open), double-tap and pinch zoom (pointer events, scale 1–3), an animated close and arrow keys.
  - `pages/everyday/_parts.jsx:101` re-exports it. IncidentDetail and `learn/_blocks.jsx` import it from `ui`.
- **Skeletons (new):**
  - `Skeleton` (shimmer block), `SkeletonRows({n})`, `SkeletonTiles({n})`, `SkeletonPage`;
  - `Load` gets `skeleton="rows|tiles|page"`, defaulting to the spinner;
  - Spinner gets `role="status"` and an `aria-label`.
- **Moved into `ui` (duplicates merged):**
  - `Check`, from `manager/_parts.jsx:60` and `money/_parts.jsx:15`; one rounded-square version with a `round` option;
  - `Progress`, from `officer/_parts.jsx:119` and `people/_parts.jsx:163`, taking `value`/`max` and accepting `done`/`total`, with an animated fill;
  - `Chip` and `Chips`, from `manager/_parts.jsx:46` and `people/_parts.jsx:95`.
  - The old files re-export the ui versions, so existing imports keep working.
- **`ActionBar` (new):**
  - fixed, `bottom: calc(var(--tabbar-h) + 12px)` on phones, or 24px where there is no tab bar (`lg` for managers);
  - centred pill with shadow-sheet, enters with `toast-in`.
  - Replaces `shared/Timesheets.jsx:103`, `money/Pay.jsx:181`, `people/Settings.jsx:132` and `officer/IncidentForm.jsx:150`.
- **Page:**
  - back link: `nav(-1)` when `window.history.state?.idx > 0`, otherwise `back.to`;
  - a 44px tap target with a ChevronLeft icon;
  - an IntersectionObserver sentinel after the h1 sets `data-collapsed` on `<html>`, so the Shell header shows the compact title (passed through a small `PageTitle` context);
  - bottom padding: `pb-[calc(var(--tabbar-h)+24px)]`, with `lg:pb-12` only when no tab bar is showing (Shell sets an `html.has-tabbar` class);
  - the width (`max-w-6xl` or `wide`) is shared with the header through the same context.
- **Dot:** a `label` prop renders as `sr-only` text.
- **Empty and ErrorBox:** ErrorBox's retry becomes `Button variant="link"`.

### 1e. `app/src/layouts/Shell.jsx` and `app/src/main.jsx`
- **`main.jsx`:**
  - `<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>`;
  - the top-level Suspense stays only for the public routes.
- **Shell:**
  - wraps `<Outlet/>` in `<Suspense fallback={<SkeletonPage/>}>`, so the sidebar and tab bar never unmount;
  - the content wrapper is keyed by `location.pathname` and gets the `page-in-right` class on PUSH, `page-in-left` on POP (`useNavigationType`) and `page-fade` on REPLACE or when switching tabs. This is CSS only, under 240ms.
- **Scroll memory:** a `useScrollMemory()` hook in `ui/useScrollMemory.js`:
  - saves `scrollY` per `location.key` in sessionStorage;
  - restores it on POP after the next paint (retrying for up to 500ms while the data loads);
  - scrolls to the top on PUSH;
  - it replaces the `window.scrollTo(0,0)` at Shell:113.
- **Header:**
  - same max width as the page (from the context);
  - shows the compact page title in the centre when `data-collapsed` is set, fading in;
  - safe-x;
  - the Bell and Everyday buttons become `IconButton tone="solid" badge`;
  - sign-out becomes an IconButton (44px).
- **Tab bar:**
  - an active indicator that pops (`pop` keyframe on the active icon) and a press scale;
  - tapping the active tab scrolls smoothly to the top;
  - `text-caption2`;
  - sets `html.has-tabbar` (always for officers; below `lg` for the others);
  - the "More" button uses the same component.
- **Notification sheet:** uses `SkeletonRows` and `Empty`; the rows use Pressable.
- **Sticky elements:** `top: calc(var(--header-h) + env(safe-area-inset-top))`, used by `manager/Rota.jsx:216` and Pay.

### 1f. Pull to refresh: `app/src/ui/usePullRefresh.js`
- Touch events on `window` when `scrollY===0`, with a rubber-band indicator (a Loader2 rotating with the pull distance).
- Past 70px it calls `onRefresh()` (the page's `q.reload`) and holds until the promise settles.
- Only works in standalone mode or on touch devices.
- Used in phase 2.

### 1g. PWA (`app/index.html`, `app/public/`)
- **Status bar:** `apple-mobile-web-app-status-bar-style` becomes `black-translucent` (the header already pads for safe-top).
- **Splash screens:** `apple-touch-startup-image` links for 6 common iPhone sizes, generated once with `app/scripts/splash.mjs`. It draws an SVG of the logo on #F2F4F7 and saves it as PNG through the already-installed agent-browser screenshot, so no new dependency.
- **Manifest icons:** split into separate `any` and `maskable` entries. The maskable one is generated with 20% padding the same way.
- **Theme colour:** `theme-color` stays #F2F4F7.

## Phase 2: Officer app
- **Files:** `pages/officer/*` (Home, Clock, Shifts, ShiftDetail, Pay, Profile, Documents, TimeOff, IncidentForm, _parts, _notify), `pages/learn/*`, `pages/everyday/*` (PostCard has 24 raw buttons), and `ui/Chat.jsx`.
- **Pattern for every file:**
  - raw buttons become Button, IconButton, Pressable or `variant="link"`;
  - raw inputs become Input or SearchInput;
  - the hand-made segmented control in `TimeOff.jsx:134` becomes Segmented;
  - list loads switch to `skeleton="rows"`, and the home page to `tiles`;
  - pull to refresh on Home, Shifts, Everyday and Learn;
  - the hand-made bottom bar in IncidentForm becomes ActionBar.
- The lint count for these folders reaches zero.

## Phase 3: Company and security portals
- **Files:** `pages/manager/*` (Rota, Cover, OpsAI, Dashboard, Exceptions), `pages/people/*` (`_profileTabs.jsx`, Settings, Staff), `pages/money/*` (Pay, Invoices, Venues, VenueDetail), `pages/team/*`, and `pages/shared/*` (Timesheets, Incidents, IncidentDetail).
- **Same pattern as phase 2, plus:**
  - the 7 hand-made search boxes become SearchInput;
  - the Timesheets and Toolbox tabs that copy `Tabs` switch to Tabs;
  - Segmented used as page tabs in Cover, Rota, OpsAI and Exceptions becomes Tabs;
  - the Pay and Timesheets bulk bars become ActionBar;
  - IncidentDetail uses the shared Lightbox.

## Phase 4: Venue portal, sign-in and public pages, final sweep
- **Files:** `pages/venue/*` (Requests reuses Chat's send button and suggestion chips), and `pages/auth/AuthPages.jsx`. There the `Err` box becomes the inline Field error plus ErrorBox, and inputs go to 16px.
- **Final lint:** a full `ui-lint` run must report 0, apart from lines marked `// ui-ok`.

## Deploy (each phase)
1. Run `cd app && npm run build`. The lint report prints first; the bundle must stay within 5% of today's 1.7 MB of assets.
2. Commit with `type: title`, bullets, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   - Phase 1: `feat: Smoother, more consistent app — iOS-style motion, sheets and buttons`.
3. Run `openkbs site deploy`. Front end only; no function deploy needed.
4. Post a plain-language comment on the board card for this spec.

## Verification (each phase, with agent-browser, then `agent-browser close --all`)
1. **Lint:** the counts drop as expected for the folders the phase covers.
2. **Viewports** 390×844, 768×1024 and 1440×900, for each demo role (company, security, venue, officer_marcus) on the main pages:
   - `document.documentElement.scrollWidth === innerWidth`, so no sideways scroll;
   - the last element of the page sits above the tab bar's top edge (compare `getBoundingClientRect`);
   - every input has `getComputedStyle(input).fontSize` of at least 16px;
   - the main-flow buttons are at least 44px tall, or at least 36px for `sm` in desktop tables.
3. **Motion:**
   - Open a sheet, click the backdrop, and check that the node is still there about 100ms later (closing) and gone after 400ms.
   - Toast enter and exit.
   - Page change adds a `page-in-*` class.
   - With reduced motion emulated (`agent-browser set media reduced-motion` or an emulated CSS media feature), the app still works and the spinner still rotates.
4. **Navigation:**
   - Scroll the Staff list, open a profile, go Back: `scrollY` is restored.
   - The first visit to a lazily loaded page keeps the sidebar and tab bar on screen and shows the skeleton.
   - The large title collapses into the header after scrolling.
5. **Main flows still work:**
   - officer: clock screen, incident form submit, course, quiz, Everyday post and lightbox;
   - manager: Rota assign, Timesheet bulk approve through ActionBar, Course edit and save;
   - venue: a request;
   - sign-in and sign-out.
6. **Before-and-after screenshots** of about 8 key screens per portal, viewed for consistency and regressions.
7. **PWA:** the manifest loads, the splash links resolve with 200, and the icons are listed separately.
