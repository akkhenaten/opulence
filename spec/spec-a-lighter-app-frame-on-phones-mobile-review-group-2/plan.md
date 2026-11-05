# Implementation plan: a lighter app frame on phones (mobile review, group 2)

## Context
- **Spec:** spec/spec-a-lighter-app-frame-on-phones-mobile-review-group-2.md (approved, "Build now").
- **Scope:** front-end only. There are no API, database or deploy-config changes, and no live data is touched.
- **Files:**
  - app/src/layouts/Shell.jsx
  - app/src/ui/OrbFab.jsx
  - app/src/styles.css
  - app/src/ui/index.jsx (Page padding)
  - app/src/pages/messages/Messages.jsx (inbox list padding)
  - app/src/pages/officer/Me.jsx
  - app/src/pages/shared/Live.jsx

## 1. Top bar (Shell.jsx header, :288-299)
- **WebsiteButton:**
  - Managers and venue users: wrap it in `<span className="hidden lg:block">`, so it shows on desktop only.
  - Officers: remove it from the bar.
- **EverydayButton:**
  - Officers: shown as today.
  - Managers: wrap it in `hidden lg:block`. The desktop bar is unchanged, and on phones the feed is reached from the Dashboard tab, whose `badge: 'everyday'` is already in nav.js.
- **Messages and NotificationBell:** unchanged. The bar then reads:
  - phone managers: Messages and bell
  - desktop managers: website, Everyday and bell (Messages is already `lg:hidden`)
  - officers: Everyday, Messages, bell, Manager and Sign out
- **HeaderTitle:** `pr-[13rem]` was sized for four buttons. Make it `pr-[7rem] lg:pr-[13rem]` for managers, and keep `pr-[13rem]` for officers (pass `isOfficer`).
- **Shared website link:** extract a small `WEBSITE` constant (`href="/" target="_blank" rel="noopener"`) so the More row and the account row use the same link.

## 2. More sheet as a grouped list (Shell.jsx :329-343)
- **Groups:**
  - Build `moreGroups = groups.map(g => ({ ...g, items: g.items.filter(i => !i.tab) })).filter(g => g.items.length)`.
  - This reuses the already-filtered `groups` (modules and permissions), so the counts and visibility match the sidebar.
- **Render:**
  - `SideSwitch` stays first.
  - For each group, a heading in the same style as the sidebar heading (`text-caption2 uppercase tracking-wider text-faint`). Groups with no title (venue) get no heading.
  - Each item is a `NavLink` row: `pressable flex min-h-[52px] items-center gap-3 rounded-xl px-3`, then the icon in a 36px rounded `bg-surface` square, the label (`flex-1 text-body font-semibold`), `<Badge n=…/>`, and a `ChevronRight`.
  - The active row uses the same `NAV_ON`/`bg-blue-soft text-blue` look as the sidebar.
  - The current tile grid is deleted.
- **Bottom group** (no heading, after a hairline):
  - a Help & user guide `NavLink` (`/${role}/help`, BookOpen)
  - an "Our website" `<a {...WEBSITE}>` with a Globe icon and an ExternalLink hint
  - the existing account row
- **Closing and scrolling:** the sheet already closes on navigation (the `useEffect` on `loc.pathname`). The Sheet body already scrolls; the headings are not sticky, but they are kept short.
- **No extra pages:** the More tab currently shows only when `extra.length > 0`. Keep that, so venue, company and security all still get it.

## 3. Account sheet (AccountSheet.jsx)
- Add a Row "Our website", subtitle "Opens in a new tab", with the Globe icon, opening `/` in a new tab.
- `Row` has `to`/`onClick` but no href. Use `onClick={() => window.open('/', '_blank', 'noopener')}`.
- Put it in the second List, beside Help.

## 4. Officer Me page (pages/officer/Me.jsx :44)
- Add a Row in the same way after Help: `left={<Ico icon={Globe} tone="grey" />} title="Our website"`, opening it in a new tab.

## 5. Orb floating button hides while scrolling (OrbFab.jsx and styles.css)
- **The hook:** add a `useScrollAway()` inside OrbFab.
  - It uses a passive `scroll` listener on window and rAF-throttles it.
  - **Hides when:** the scroll moves down more than 8px from the last turning point, and `scrollY > 80`.
  - **Comes back when:** the scroll moves up more than 8px, scrolling has been idle for 900ms (timer), or the page is at the bottom (`innerHeight + scrollY >= scrollHeight - 4`).
  - It only runs below 1024px (`matchMedia`). On desktop it always returns false.
  - It resets to shown on `pathname` change.
- **Inner scroll areas:** the Messages inbox scrolls inside a div, not the window. Listen with `capture: true` on `document` for `scroll`, and read the target's `scrollTop`/`scrollHeight`, so inner lists also hide it. Track the last position per target with a WeakMap.
- **Slide or fade:** add `orb-fab-away` while hidden. The direction comes from the position:
  - Default (no saved pos), or `right < innerWidth/2`: the button sits on the right half, so add `orb-fab-away-r` (`translateX(calc(100% + 24px))`).
  - Left half: `orb-fab-away-l` (`translateX(calc(-100% - 24px))`).
  - Mid-screen (`bottom` above 40% of the viewport): plain `orb-fab-away` (`opacity:0; scale(.6)`).
  - All three set `pointer-events:none`.
  - The existing transition already covers transform and opacity. Reduced motion already shortens transitions to 1ms, so it becomes an instant show/hide, with no slide animation.
- **Drag:** while dragging, the away state is ignored (`dragging` wins).
- **Unchanged:** the dot, the thread hiding and `.orb-fab-hidden`.

## 6. Bottom room for the button
- **styles.css:** add `--fab-room: 0px` to `:root`, and `html.has-orb { --fab-room: 72px }` inside `@media (max-width:1023.98px)`.
- **Shell.jsx:** in the existing `useLayoutEffect`, toggle `has-orb` on `<html>` when `isMgr`, and remove it on cleanup (add `isMgr` to deps).
- **Page** (ui/index.jsx:141): `pb-[calc(var(--tabbar-h)+32px)]` becomes `pb-[calc(var(--tabbar-h)+var(--fab-room,0px)+32px)]`.
- **Messages inbox list** (Messages.jsx:61): `pb-4` becomes `pb-[calc(16px+var(--fab-room,0px))]`. Check Email.jsx for the same list pattern and do the same.

## 7. Live page (Live.jsx:74)
- Delete the "Orb" header `Button`. If `Sparkles` is still used by OpsPanel (:99), keep its import. The refresh IconButton stays.

## Verification
- **Build and lint:** `cd app && npm run build`, then `node scripts/ui-lint.mjs`. No rule count may go up; the current baselines are 1/0/38/25/1/2/0.
- **API tests:** `cd functions/api && npm test`. These are untouched; it's a sanity run, 184 should pass.
- **Browser:** mock server /tmp/mock/server.mjs on 8787 and Vite on 5174 with `VITE_API_BASE`, `orb.token='mock'`. Using agent-browser at 390×844 and 360×780:
  - Company: the bar has Messages and the bell only. More shows grouped headings (Overview, Operations, People…), with rows at least 52px (via /tmp/scan.js, 0 small taps), plus Help, website and the account row.
  - Venue and security: the More groups are correct.
  - Officer: the bar has Everyday, Messages and the bell. Me has the website row.
  - Inbox, Staff and Incidents: scrolling down hides Orb, scrolling up shows it again, and the last row clears the button at the bottom.
  - Drag still saves the position.
  - Live: no Orb header button, and the panel is present.
  - 1280×800 company: the header and sidebar look as before.
  - `/company/everyday` still lands on the Dashboard Everyday tab.
  - Run `agent-browser close --all` when finished.
- **Ship:**
  - Commit, staging with `git add app/src spec` and the Co-Authored-By trailer.
  - `openkbs site deploy` from /home/user/project. No function deploy is needed.
  - `git push origin master --tags`.
  - Live check: the bundle contains "Our website" and `orb-fab-away`.
