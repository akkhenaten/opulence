# Plan: Dashboard + Live operations become one "Today" page

## Context
Managers split their attention between **Dashboard** (`app/src/pages/manager/Dashboard.jsx`, from `dashboard.get`) and **Live operations** (`app/src/pages/shared/Live.jsx`: board + Orb `Inbox` from `pages/manager/OpsAI.jsx`).

Problems with the current split:
- **The "now" numbers appear twice.** The Live now tile repeats the board's On site / Late / No-show figures.
- **There are two to-do lists.** Needs you is on the Dashboard; Orb's cards are only on Live.
- **Exceptions is counted in two places** (a Needs you row and a callout on the board), and the two counts are worked out differently.
- **The Dashboard never shows Orb**, even though Orb does most of the legwork.
- **Rarely-used blocks take prime space** (the Compliance lists, Staff pipeline, Recent incidents).

The user wants one efficient, uncluttered place.

**Decisions:**
- One page, **Today**.
- **One combined to-do queue**: Orb cards plus the remaining Needs you items.
- **On phones, Needs you comes first.**
- **What moves off** (user said "review and recommend"):
  - Compliance lists and Staff pipeline move off. A "can't work" row stays in the queue.
  - Money stays as one slim line.
  - The Exceptions menu item stays, but exceptions show only once on the page.

Build on the recent desktop layout of Live ops (board left, a 360 px sticky Orb column on the right). Don't undo it.

This is front-end only. No API or data changes. Role checks are unchanged. Venue logins are untouched: `/venue` and `/venue/live` ("On site") stay as they are. Officers are unaffected.

## The Today page (company + security managers, `/company` and `/security` index)
**Header** (`Page` slim, as now)
- The greeting stays, with the summary line: "Sun 8 Nov · 4 on site · 3 things need you". "Things" now includes the Orb count.
- Actions on the right:
  - the Everyday button with its unread badge (as now)
  - "Updated hh:mm" and the round-arrow refresh, which runs `ops.refresh` (moved from Live)
  - a `MoreMenu` "…" with **Orb activity** and **Orb settings** (company only)

**Status strip** (one row, under the header). This is the board's chip row moved up, plus two extra chips:
- `On site · Late · No-show · Issues · Due on · Finished · Pack not signed` filter the floor board. They keep `?show=` and stay quiet at 0.
- **Short shifts** (from `dashboard.get` shifts) scrolls to Tonight & tomorrow.
- **To approve N** (from `ops.count`) scrolls to the queue on phones and focuses it on desktop.

**Desktop (≥1024px):** grid `[minmax(0,1fr)_360px]`, the same as Live today.
- **Left column, top to bottom:**
  1. **On the floor**: the existing venue cards with the officer drawer, Clock out, Shift card and Set times. The board's Exceptions callout is dropped here, because exceptions live in the queue.
  2. **Tonight & tomorrow**: unchanged.
- **Right column, Needs you**: a sticky queue that scrolls on its own, like `OpsPanel`. One header reads "Needs you · N", with the existing "…" menu holding Decided and Select several. The queue order:
  1. **Red count rows**: clock exceptions, unfilled shifts in 7 days, disputed timesheets, and **"N officers can't work"** (new row, company only, from `d.nonCompliantCount` → Compliance page).
  2. **Orb cards**: `ItemCard` compact, approve/dismiss inline, unchanged behaviour.
  3. **Amber/blue count rows**: open incidents, cover requests, timesheets to approve, shift requests, time off, and **"N documents expiring in 60 days"** (new, company only, from `d.expiring`).
  4. When everything is empty: "All clear, nothing needs you right now."
- **Bottom, full width: "This week"**, one slim line: hours · shifts. Company managers who can see pay also get invoiced · outstanding, with overdue shown in red.

**Phone / tablet:** one column, in this order:
1. status strip (horizontal scroll)
2. Needs you
3. On the floor
4. Tonight & tomorrow
5. This week
6. PushCard / InstallCard stay where they are now

There is no separate "To approve" tab any more.

**Removed from the page:**
- the dark Live now tile (replaced by the strip)
- the Compliance tile (replaced by the two queue rows; the full lists are on the Compliance page)
- the Staff pipeline tile (it's on Recruitment)
- the Recent incidents tile (open incidents are a queue row; the full list is on Incidents)

## Routing and nav
- **`app/src/layouts/nav.js`:**
  - The Dashboard entry is renamed **Today** for company and security. It keeps `LayoutGrid`, `tab: true` and `end: true`.
  - Its badge becomes the Orb to-approve count (`ops`), so the badge still points to where approvals are. Everyday unread stays on the Everyday button. Check how `Shell.jsx` maps `badge` keys (:216, :233) and adjust if one item needs the ops key.
  - The **Live operations** entries are removed for company and security. The venue "On site" entry stays.
- **`app/src/main.jsx` `managerRoutes`:**
  - `live` becomes `LiveRedirect`:
    - `?tab=activity` or `?tab=settings` → new route `orb?tab=…`
    - anything else → the Today page (`..`), keeping `?show=`
  - `ops` (`OpsRedirect`, :149) points the same way.
  - Existing links keep working this way: AskOrb "Open in Live operations", PayRuns, Compliance `openCard`, notifications. Update the visible wording of those buttons from "Open in Live operations" to "Open in Today" or "Open Orb", whichever fits.
- **New small page `/company|security/orb`** ("Orb"): tabs **Activity** and **Settings** (company), reusing `Activity` and `OpsSettings` from OpsAI.jsx unchanged. The "Live operations › Settings" text in Compliance.jsx:145 and contracts/AskAi.jsx:121 becomes "Today › … › Orb settings".

## Code changes
- **`app/src/pages/shared/Live.jsx`:** pull out reusable pieces and export them:
  - `useLiveBoard()`: the `live.board` 15 s poll, the `orb:ops` listener, the filter in the URL, `openId`, and prev/next order.
  - `StatusChips`: today's chip row, with optional extra chips.
  - `Board`: gains `hideExceptions` and `hideChips` props.
  - `Detail` / `ManualForm`.
  - The default `Live` export stays only for the venue "On site" page (and still works for managers if reached directly), so the venue view is untouched.
- **`app/src/pages/manager/OpsAI.jsx` `Inbox`:**
  - Add `before` / `after` slots, rendered inside the scrolling list above and below the cards.
  - Add a `title` override, so the slim header reads "Needs you · N", with N = the Orb count plus the count-row totals.
  - Show the empty state only when the slots are empty too.
  - Selection, approve, reject and the API calls are untouched.
- **`app/src/pages/manager/Dashboard.jsx`:** recompose as above.
  - Reuse `NEEDS` / `needsFor` (split into red and later tones) and `TileLink`.
  - Reuse the existing `Tonight & tomorrow` markup and `Stat`.
  - Drop `PeopleList`, the Live now tile, the pipeline and incidents tiles.
  - Desktop/phone switch with `useMedia('(min-width: 1024px)')`, the same as Live.
  - The refresh logic moves here from Live.
  - The phone order uses plain stacking.
- **`app/src/main.jsx`:** add `LiveRedirect` and the `orb` route. **`app/src/layouts/nav.js`:** as above.
- **What's new card** ("Today: everything in one place", with its own AI picture): `app/src/pages/people/_whatsnew.jsx` plus the prompt in `app/scripts/whatsnew-images.mjs`, run from the repo root, in the same commit.

## Ship
1. Commit with explicit paths (other chats share the tree).
2. `cd app && npm run build`, then commit `site/`.
3. `openkbs site deploy`.
4. `git push origin master --tags`.
5. Check the live `index-*.js` contains `6ij75kpgf7` and not `hopedp5`.

No fn deploy (the API is unchanged).

## Verification
- `cd app && npm run build`: ui-lint must not go above the current count, and the emergency and flow checks must pass.
- Local mock (`/tmp/mock`, a copy of the built `site/` with the API URL rewritten to :8799). Use a busy day (2 venues, a late officer, a no-show, 1 exception, 7 Orb cards including manual-only ones, short shifts, a non-compliant officer, expiring documents) and a quiet day (all 0).

Check:
- **Company manager at 1440×900 and 1920×1080:**
  - The strip filters the board.
  - The queue order is red rows → Orb cards → other rows.
  - Approving or dismissing a card updates the count, the nav badge and the summary line.
  - The officer drawer, Clock out and Shift card work.
  - Refresh runs the checks.
  - "…" opens Orb activity and settings.
- **390×844 phone:** the order is strip, Needs you, floor, tonight, week. The Orb button doesn't cover the last link.
- **Security manager:** no money, no compliance rows, no Orb settings.
- **Venue login:** `/venue` and `/venue/live` unchanged, with no officer data or pay.
- **Redirects:**
  - `/company/live`, `/company/live?show=late` and `/company/ops?tab=settings` land correctly.
  - The AskOrb and Compliance "Open" buttons land correctly.
- **Dark theme:** check every view above.
- Run `agent-browser close --all` at the end.
