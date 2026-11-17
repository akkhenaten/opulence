# Plan: make venue staff requests impossible to miss on the company side

## Context
Waqas (New Eidyn) sent a weekly Steward request for Mon 16 to Sun 22 Nov. Matthew believes nothing arrived. The live data shows it did:
- the recurring series exists with 7 pending dates;
- Matthew got two notifications at 09:37: a bell item "New cover request · New Eidyn" (by email too), and a chat thread "Waqas Kazim · New Eidyn · cover request";
- Today → Needs you counts it ("7 cover requests to answer").

Two places Matthew looked show nothing, so it looks as if nothing arrived:
1. **Rota → Shift requests.** This tab is only for officers asking to work open shifts. Venue requests live under the **Cover** tab, and that tab shows no number. Only the tab for Shift requests has a count (`tabCounts` in `manager/Rota.jsx:131`, set on that page only).
2. **Venue page → Needs action** (`money/VenueOverview.jsx`). This only lists hours, invoices and feedback, so it said "Nothing waiting" while 7 dates were waiting at New Eidyn.

## Changes
1. **Numbers on the Rota tab row, the same on every Rota tab**
   - New hook `useRotaCounts()` in `app/src/pages/manager/_rotaCounts.js`. It reads:
     - `shifts.pendingRequests` (already used in Rota.jsx:55);
     - `cover.list {status:'pending'}`, which returns the pending dates plus any pending change requests. Its count also includes the dates where `change_status = 'pending'`.
   - It returns `{ 'Shift requests': n, 'Venue requests': m }`.
   - Pass it as `tabCounts` from `Rota.jsx`, `Cover.jsx` and `Exceptions.jsx`, so the numbers show whichever tab is open.
2. **Clearer names**
   - In `ui/hubs.js`, rename the Cover tab to **"Venue requests"**, so it is clearly separate from "Shift requests" (officers).
   - Rename the Cover page title to "Venue requests", subtitle "Venues asking for officers: answer each date or the whole series".
   - The Shift requests empty state gains a line: "Looking for a venue's request? See Venue requests", with a link to `cover`.
3. **Venue page → Needs action**
   - In `VenueOverview.jsx`, add `useApi('cover.list', { venue_id: v.id, status: 'pending' })`, for company and security only. The venue portal has its own Requests tab.
   - Group the result by series: one row per series, plus single one-off dates. The title is "Steward · 7 dates from Mon 16 Nov" and the subtitle is "Venue request waiting for your answer". Rows link to `${base}/cover?id=<request>`, or to `cover` if the page has no deep link. Check Cover.jsx for an existing id param and reuse it.
   - Include it in the loading and LoadFail handling. The empty text becomes "…no venue requests, no hours to sign…".
4. **Links in notifications.** `cover.mjs` links to `/company/cover`. That stays valid, since the address doesn't change, only the label. No backend change is needed.
5. **What's new card** (memory rule) in `pages/people/_whatsnew.jsx`: "Venue requests you can't miss". It gets its own picture, `app/public/whatsnew/venue-requests.webp`, made with `openkbs image --aspect-ratio 3:2`, then `convert -resize 800x -quality 72`.

## Verification
- `cd app && npm run build`, which runs the lint, flow and emergency checks.
- Commit the source, then commit the build of `site/app`, then run `openkbs site deploy`. There is no API change.
- With agent-browser as Matthew (company):
  - the Rota tab row shows "Venue requests 7" on the Week, Shift requests and Venue requests tabs;
  - the New Eidyn page → Needs action lists the Steward series and opens it;
  - the bell item opens the Venue requests page.
- Then run `agent-browser close --all`.
- Check that a venue with nothing pending still shows "Nothing waiting".
