# Implementation plan: select several requested dates, cancel or change them together

Spec: `spec/plan-venue-can-select-several-requested-dates-and-cancel-or-.md` (approved)

## Context
On the venue Rota → Requests tab, a venue can only cancel or change one date at a time. Waqas's weekly request has 7 rows, and acting on several means one sheet per date. This change adds a Select mode with ticks and an action bar, like the company's Shift requests, plus one server action that does the work and sends one message instead of seven.

## 1. Backend: `functions/api/modules/cover.mjs` (no migration)
- **Pure helpers** (exported, so tests can reach them):
  - `bulkSlot(own, b)`: returns `{ start: b.start || own.start, end: b.end || own.end, headcount: b.headcount ?? own.headcount }`. `own` is the date's London times, taken from `fmtTime(occ.starts_at)` / `fmtTime(occ.ends_at)` (check `fmtTime` returns HH:MM; otherwise use the same London helper that `retimeOccurrence` uses). The result then goes through `cleanSlot`.
  - `bulkWhy(occ, now)`: returns a skip reason or null: "already started", "is <status>", or "has a change waiting".
  - `datesLabel(list)`: returns "Mon 16, Tue 17 and Wed 18 Nov". It uses `fmtDate`, joins with commas and "and", and after 6 dates says "+N more".
- **`cover.updateMany`**: `def(['company','security','venue'], …)`.
  - `required(b,'ids')`; ids must be 1–100 unique uuids.
  - `edit = !b.delete && ['start','end','headcount','notes','stream_id'].some(k => b[k] !== undefined && b[k] !== '')`. Fail 400 with "Nothing to change" when it is neither a delete nor an edit.
  - For each id, in order:
    - `loadOcc(user,id)`, which checks scope; if it throws, record a skip with "not found".
    - `bulkWhy` → skip.
    - Stream: when `b.stream_id` differs, and the date is pending or the user is a manager, `streamFor(occ.venue_id, b.stream_id, occ.role)` and update `cover_requests.stream_id` (plus the shift's stream for accepted dates when the user is a manager, as `cover.update` does; reuse the same code path). For a booked date by a venue user, skip the stream with the reason "booked — ask the office to move it".
    - Payload: `{type:'delete'}`, or, only when slot or notes fields were sent, `{type:'edit', slot: cleanSlot(bulkSlot(own,b)), notes}`.
    - A venue user on an accepted date: the same `UPDATE … change_status='pending'` as `cover.update` → `waiting`.
    - Otherwise `applyChange(occ,'one',payload,user.id)` → `done`.
  - Errors on a single date are caught and become a skip, so one bad date never stops the rest.
  - Afterwards, group by venue and by thread root:
    - one `post` per cover thread (`coverThread`), for example "Cancelled Mon 16, Tue 17 Nov. Asked to change Fri 20 Nov — waiting for approval";
    - one `notify` per venue: managers when a venue user acted (severity warning, `email: true` if anything is waiting), venue contacts when a manager acted;
    - `audit(user,'cover.update_many','venue',venueId,{done,waiting,skipped,type})`.
  - Returns `{ done: n, waiting: n, skipped: [{id, date, reason}] }`.
- `cover.update` itself is unchanged, to keep the risk low. The shared pieces (`applyChange`, `streamFor`, `coverThread`) are reused rather than refactored.
- Registration: the actions object is already spread into ACTIONS, so nothing extra is needed. Check that with `ACTIONS['cover.updateMany']` in the test.

## 2. Venue list: `app/src/pages/venue/_requests.jsx` → `CoverList`
- New props: `onDone` (reload), plus the stream list for the sheet (or the sheet fetches it).
- New state: `picking` and `sel` (Set). `changeable = (c) => ['pending','accepted'].includes(c.status) && new Date(c.starts_at) > now && c.change_status !== 'pending'`.
- On the Upcoming tab with 2 or more changeable rows:
  - a right-aligned **Select** / **Done** button, plus **Select all N** / **Clear selection**, copied from `manager/Rota.jsx` `Requests`;
  - `Tick` (`Check` from `manager/_parts.jsx`) on changeable rows;
  - a row tap toggles while picking;
  - a recurring row shows a small link button "All N dates", which ticks every changeable date with the same `series_id`.
- Leaving the Past tab or pressing Done clears the selection.
- `ActionBar show={picking && chosen.length}`, with:
  - "N selected";
  - **Cancel N** (secondary): confirm "Cancel N dates?". The body names the booked ones that need approval. Calls `cover.updateMany {ids, delete:true}`.
  - **Change N** (primary): opens `BulkChangeSheet`.
- Toast text comes from the result: "3 cancelled · 2 sent for approval · 1 skipped". Skipped reasons go in a toast detail if the toast supports it; otherwise `ErrorBox`-style text in the sheet. Then `stop()` and `onDone()`.
- `venue/Rota.jsx`: pass `onDone={() => cover.reload()}` to `CoverList`.

## 3. `BulkChangeSheet` in `app/src/pages/manager/_cover.jsx` (exported, beside `ChangeSheet`)
- Props: `{ dates, onClose, onDone }`.
- `same(fn)` returns the shared value or ''. Fields:
  - Start and Finish: `slotOf`;
  - Staff: `headcount`;
  - Notes;
  - Bill to: a `Select` over `useApi('streams.list',{venue_id}, {skip: venues.size>1})`, shown when there are 2 or more active streams and every chosen date is at one venue.
- When a field is blank and the dates differ, its hint reads "Mixed — leave blank to keep each date's own".
- Only fields that differ from their starting value are sent. Save stays disabled until something changed. The overnight hint is the same as `ChangeSheet`.
- A warning Callout appears when any chosen date has `status === 'accepted'`: "N of these are booked, so the office approves those changes. The rest change now."
- Calls `api('cover.updateMany', {ids, ...changed})`.

## 4. What's new card
- Add a new first entry in `app/src/pages/people/_whatsnew.jsx`: "Change or cancel several requested dates at once", icon `ListChecks`, image `'bulk-cover'`, dated 2026-11-16.
- Make the picture with `openkbs image --aspect-ratio 3:2`, then `convert -resize 800x -quality 72`, saved to `app/public/whatsnew/bulk-cover.webp`.

## 5. Tests: `functions/api/test/coverBulk.test.mjs`
- `bulkSlot` keeps each date's own values for fields left out, and uses the fields that were sent.
- `bulkWhy`: past, cancelled and change-waiting dates are skipped; pending and accepted future dates are not.
- `datesLabel` joins the dates and shortens long lists.
- `ACTIONS['cover.updateMany']` exists and allows the venue role. Check how other tests read roles off `def`.
- A source check: the `notify(` call sits outside the per-id loop. Read the module text and check that the notify call comes after the loop's end marker comment.

## 6. Build, deploy, verify
1. `cd functions/api && npm test`; `cd app && npm run build`, which also runs the lint, flow and emergency checks.
2. `git add` only my files, then commit with "feat: select several requested dates and cancel or change them together" and the Co-Authored-By line. Run `openkbs fn deploy api`.
3. Rebuild, commit `site/app` ("build: site with bulk request changes"), then run `openkbs site deploy`.
4. Read-only check against the live API code path:
   - `openkbs fn invoke api` can't authenticate as the venue. So check that the action is registered: a call without auth should answer 401, not "unknown action".
   - Live data is untouched by me. The user tries it on Waqas's request.
5. Move the board card to Done with a business-language comment.
