# Implementation plan: Live operations, better composed on desktop
Spec: `spec/plan-live-operations-better-composed-on-desktop.md`. Front end, plus one wording fix in the API. No data changes. Work, build and ship in `/home/user/project` (not a separate copy), staging paths explicitly.

## 1. `app/src/ui/index.jsx`: Chip `quiet`
- `Chip({ …, quiet })`. When `quiet && !active`: `text-faint`, `shadow-none`, `bg-transparent`. The count stays visible, so the row never shifts.

## 2. `app/src/pages/shared/Live.jsx`
**Header and tabs**
- Managers: drop `actions` from `Page`. The subtitle is only `Orb checked HH:MM` when `lastChecked`, otherwise `undefined`.
- Below the tabs, render a `flex items-center justify-between` row: `<Tabs/>` on the left. On the right, `<span class="num text-footnote text-muted">Updated HH:MM</span>` + the refresh `IconButton`, as today: spin while busy, same `refresh()`.
- Venue users (no tabs) keep today's subtitle + header refresh.

**Board(...)**
- Chips: `quiet={c === 0}` in `chip()`; "All" is never quiet.
- Exceptions banner: compute `exc = rows.filter(r => r.has_exception).length`. When `exc && base !== '/venue'`, render a `Callout tone="warn"` (check the CALLOUT key names, e.g. `warn` or `amber`) above the groups: "{exc} flagged clock-in(s)", with action `Link` "Review in Exceptions →" to `${base}/exceptions`. Remove the old centred `<p>`.
- Grid: `narrow ? '2xl:grid-cols-2' : 'lg:grid-cols-2'`.
- Each group:
  - `Tile pad={false}` with its own header row: venue name (`text-headline font-bold`), then `<Dot tone="green"/> {on} on site` muted. Shift card button(s) go at the right edge (`ml-auto`).
  - Below the header: `List`, as today, inside the tile. Check whether `List` already has its own card chrome; if so, use a plain divided list or keep `List` with `className` that strips the outer border/shadow.
  - `gap-y-4` between group tiles.
- Exception pill (non-venue): wrap in `<Link to={`${base}/exceptions`} onClick={e => e.stopPropagation()}>`.

**Layout and OpsPanel**
- Grid: `grid-cols-[minmax(0,1fr)_360px] gap-6`.
- `OpsPanel`:
  - `<aside className="sticky top-[calc(56px+1rem)] self-start flex max-h-[calc(100dvh-7rem)] flex-col">`.
  - Header row: Sparkles + "Orb" + Pill "{n} to approve", with the panel menu on the right (supplied by Inbox, see below).
  - Then a scroll body `min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1` with a mask fade (`[mask-image:linear-gradient(to_bottom,transparent,#000_12px,#000_calc(100%-16px),transparent)]`).
  - To keep the menu in the header while state lives in `Inbox`, `Inbox` gets a `slim` prop that renders its own header row, including the Orb title. `OpsPanel` becomes: `<aside …><Inbox slim n={n} …/></aside>`, and Inbox puts the list inside the scroll body.

## 3. `app/src/pages/manager/OpsAI.jsx`
**Inbox({ slim, n, … })**
- When `slim`: replace the Segmented + Select row with one header row:
  - "✦ Orb", plus a Pill "{n} to approve" when `view==='pending' && n`.
  - On the right, `MoreMenu` with items `{ label: view==='pending' ? 'Decided' : 'To approve', onClick: switch }` and, when `kinds.length`, `{ label: selecting ? 'Stop selecting' : 'Select several', onClick }`. Check the MoreMenu item shape: `{label, icon, onClick}`.
  - When `view==='decided'`, a small "← To approve" ghost button in the header.
- Not slim (the phone To approve tab): unchanged.
- The selecting chips row and the list go in the scroll wrapper. `ActionBar` is unchanged; it's fixed.

**ItemCard({ compact })** (pass `compact` through from Inbox)
- Venue label: hide `it.venue_name` when `it.title.startsWith(it.venue_name)`. This applies everywhere, not just compact.
- Reason:
  - In compact mode, `line-clamp-2`, with a "More" toggle when long (local state).
  - The override for nothing-to-apply cards (below) replaces the reason text.
- Buttons: `size={compact ? 'sm' : undefined}`.
- **Nothing to apply:** `const manual = ISSUE_CARDS.includes(it.kind) && !(p.issues||[]).some(i => i.actions.some(allowed))`. When `pending && manual`:
  - **Primary:**
    - venue_setup: `Button to={`${base}/venues/${it.venue_id}?tab=setup`} icon={MapPin}` "Open Setup".
    - compliance with `p.officer_id`: "Open {officer_name}".
  - **Secondary:** `Button variant="ghost" icon={X}` "Dismiss". It opens the existing `RejectSheet`, with the same reject decision.
  - **Reason:**
    - venue_setup: "Add it by hand in Site setup, then this card clears by itself."
    - compliance: "Fix it on their profile, then this card clears by itself."
  - Hide the soft "Open Setup / Open officer" buttons inside `ComplianceBody`. Pass a `manual` prop.
  - Hide the per-issue Dismiss when `manual && issues.length === 1`.
- Otherwise the buttons are unchanged.
- `useBase()` already gives `base`; ItemCard currently reads only `user`, so add `base`.

## 4. `functions/api/lib/venueSetup.mjs`
- `cardReason`: append "Tick what to apply. Nothing is saved until you approve." only when `issues.some(i => i.actions.length)`. When nothing can be applied, end with "Then this card clears by itself."
- Add a case to `functions/api/test/venueSetup.test.mjs` (import `cardReason`) covering:
  - a manual-only logo issue, whose reason has no "Tick";
  - an issue with actions, whose reason has "Tick".
- Run `npm test` in `functions/api`, then `openkbs fn deploy api`.

## 5. What's new card
- At the top of `UPDATES` in `app/src/pages/people/_whatsnew.jsx`:
  - icon `Radio`; title "Live operations, laid out better"; image `live-ops-layout`; `date: '2026-11-07'`.
  - 4–5 points: board uses the full column; Orb scrolls on its own; cards that need a hand fix go straight to Setup; flagged clock-ins banner; quieter empty filters.
- Prompt in `app/scripts/whatsnew-images.mjs`. Run `node app/scripts/whatsnew-images.mjs live-ops-layout` from the repo root, then view the webp.

## 6. Verify
1. `npm run build` in `app/`: ui-lint ≤ 69, the emergency and flow checks pass, vite builds.
2. Local mock:
   - Copy `site/` → `/tmp/livecopy` and rewrite the `6ij75…` URL to `http://localhost:8799/`.
   - Extend `/tmp/mock/server.mjs`:
     - a Banshee-like single venue with 1 on shift with an exception;
     - 7 venue_setup cards, several manual-only `No logo` with `actions: []`;
     - `ops.count` n=7.
3. In the browser, as company, at 1440×900, 1280×720 and 1920×1080, check:
   - the board is one column, the row is not truncated, Shift card is at the right edge;
   - the Orb column scrolls by itself and the page doesn't grow;
   - manual cards show Open Setup + Dismiss, and the venue name appears once;
   - zero chips are quiet;
   - the banner links to Exceptions; the exception pill click doesn't open the drawer;
   - Refresh spins and toasts;
   - the "…" menu switches to Decided and back, and Select several shows the action bar.
4. Also check the phone (390×844 To approve tab unchanged) and the venue role On site page.
5. Run `agent-browser close --all`.

## 7. Ship
1. Check `git status`, and that master is clean of others' edits to these files.
2. Commit with explicit paths: Live.jsx, OpsAI.jsx, ui/index.jsx, venueSetup.mjs + test, _whatsnew.jsx, whatsnew-images.mjs, webp.
3. `npm run build`, then commit `site/`.
4. `openkbs site deploy`, then `git push origin master --tags`.
5. Check the live `index-*.js` contains `6ij75kpgf7` and not `hopedp5`.
