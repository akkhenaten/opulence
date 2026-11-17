# Plan: one request form for making and changing requests, and the office's rota for venues

## Context
The user didn't like the v211 result. Two problems:
1. **Editing used other screens.** `ChangeSheet` changes only times, staff and notes. `BulkChangeSheet` also changes Bill to. Neither looks like "Request staff". The user wants *"the same modal when editing as the one when creating, full options"*: officer type, date, one-off or repeating, days, end, headcount, Bill to (including a new stream) and notes.
2. **The venue rota was built separately.** `venue/Rota.jsx` has its own `Week` and `ShiftCard`. The plan was to use the same modules and adjust them where needed. The venue should get the company `manager/Rota.jsx` UI (grid views, cards, drawer), limited to its own venue(s), with no company operations. Its shift cards should open the shift's ejections, bans, incidents, notes and handovers.

Decision from the user: a venue manager can **change or cancel a booked shift from its card**. This opens the same full form, and booked changes still wait for the office to approve. I went with the recommended defaults where the user didn't answer: officers show name, SIA badge and clock state, with no phone. Requested dates the office hasn't booked yet show as dashed cards in the grid.

---

## 1. Backend: `functions/api/modules/cover.mjs` (no migration)
- **Date and officer type on a single-date edit**
  - New pure, exported `editOne(b, occ, today)`. It returns `{type:'edit', slot:{...cleanSlot(b), date}, role, notes}`.
  - `date` defaults to `occ.occurs_on`. It must be YYYY-MM-DD and not before today.
  - `role` defaults to `occ.role`. The caller checks that it exists in `roles`.
  - `cover.update` uses it for `scope:'one'`.
- **`retimeOccurrence`**
  - It uses `slot.date || occ.occurs_on` for `occRange` and also sets `occurs_on`.
  - Moving the date counts as `moved`, so the team is told. The message reads "Shift moved to Fri 20 Nov · 21:00 – 03:00" when the day changes.
- **Moving onto a date that already has a request**
  - New `dateClash(occ, date)`. It looks for a pending or accepted request in the same `series_id` on that date. If there is one, it fails with 400: "There's already a request on Fri 20 Nov — change that one instead."
  - It is checked in `cover.update`, and again in `cover.decideChange` before `applyChange`. A booked date can wait for approval, so the clash is checked a second time.
- **Making a one-off repeat**
  - `scope:'future'` is allowed on a one-off when `b.kind === 'recurring'`. `applyFuture` already ends the old series and starts a recurring one from this date.
  - Today the action forces `'one'` unless the date is already part of a repeating request.
- **New billing stream from the edit form**
  - `cover.update` and `cover.updateMany` accept `new_stream` the same way `cover.create` does: `createStream`, then `audit 'stream.create'`, then `tellCompanyNewStream`. Its id is then used as `stream_id`.
  - In `updateMany` the stream is created once, before the per-date loop.
- **Changing the officer type keeps the current stream**
  - Don't look the stream up again when only `role` changes; keep the current stream unless one was picked.
- **`cover.updateMany` accepts `role`**
  - Validate it once. It is added to each date's payload `{…slot, notes, role}`, and `bulkSlot` stays as it is.
- **`applyChange` summary**
  - The one-date text names a new date and type when they changed, e.g. "Mon 16 Nov moved to Tue 17 Nov, 21:00–03:00, 2 staff · Door supervisor". This feeds the thread post, the notifications and `describeChange`.

## 2. One form: `app/src/pages/manager/_cover.jsx` → `RequestForm`
New prop `edit`: an array of `cover.list` rows (one or more). Without `edit`, "Request staff" works exactly as it does today.
- **Title and footer**
  - Title: "Change request" or "Change N dates". The venue is shown as text, not a Select.
  - Footer: on the left, a danger-text **Cancel date / Cancel N dates** button, which asks to confirm.
  - On the right, **Back** and **Save**. Save reads **Ask for approval** when a venue user touches booked dates. It is disabled until something changes.
- **One date, already part of a repeating request**
  - The top Segmented control reads **Only this date** / **This and later dates**.
  - *Only this date*: the full one-date fields, prefilled: Date, Start, Finish, How many officers, plus Officer type, Bill to and Notes.
  - *This and later dates*: the full repeating fields, prefilled from the row: frequency, `DaysEditor` from `c.days`, "From Mon 16 Nov" shown as fixed text, Ends on a date / Last date, Officer type, Bill to and Notes.
- **One date that isn't repeating**
  - The Segmented control reads **One date** / **Repeating**, as when making a request. Choosing Repeating sends `scope:'future', kind:'recurring'`.
- **Several dates** (selected on Requests)
  - The one-date fields without Date. The rule from `BulkChangeSheet` carries over: fields where the dates differ start blank, with the hint "Mixed — leave blank to keep each date's own". Officer type and Bill to get a "Keep each date's own" option.
  - Only changed fields are sent to `cover.updateMany`.
- **Shared by all edits**
  - The Bill to block, including **+ New stream**, the overnight hint, the summary callouts (`oneOffSummary` / `patternSummary`) and the warning callout for booked dates (wording from `ChangeSheet`).
- **What is sent**
  - One date: `cover.update {id, scope, role, date, start, end, headcount, notes, stream_id | new_stream}`, or `{… frequency, days, end_date, kind}` for future dates.
  - Several: `cover.updateMany`.
  - Toasts reuse the current texts and `bulkToast`.
- **Keeping the component readable**
  - Prefill and change detection go in `editStart(edit)` and `changedFields(start, v)` helpers in the same file.
- **Old sheets go**
  - Delete `ChangeSheet` and `BulkChangeSheet`.
  - Switch their callers to `RequestForm edit=[c]` or `edit={chosen}`: `manager/Cover.jsx:108` (managers get the same form and never need approval), `venue/_requests.jsx` `Detail` and `CoverList`.
  - Update `describeChange` so a pending change mentions the date or type.

## 3. Venue rota = company rota: `app/src/pages/manager/Rota.jsx`
- **Routes** (`app/src/main.jsx`)
  - `/venue/rota` loads `manager/Rota.jsx`.
  - Add `/venue/shifts/:id` → `ShiftView`, so `${base}/shifts/${id}` links work for venues.
  - Delete `venue/Rota.jsx`. Keep `/venue/cover` redirecting to `/venue/rota?tab=requests`.
- **Hubs** (`ui/hubs.js`)
  - Add `venue.rota = { title:'Rota', tabs:[{to:'rota',label:'Week'},{to:'rota?tab=requests',label:'Requests'}] }`.
  - Check that the venue sidebar's Rota entry matches the hub key.
- **`isVenue = user.role === 'venue'` in `Rota`** (the same branching style as `shared/Timesheets.jsx`)
  - **Data**
    - Skip `shifts.pendingRequests`.
    - Venues come from `useVenue()` instead of `venues.list` filtering, with `?venue=` used only when the venue manager has more than one venue.
    - Load `cover.list` (filtered to their venues) for request cards and the Requests tab.
    - `useRotaCounts({cover, venue:true})` returns `{Requests: waiting}`.
    - `shifts.list` is already scoped and only returns published shifts.
  - **Hidden for venues**
    - Publish, the More menu (Repeat, Copy week), New shift and `ShiftForm`.
    - The Drafts and Requests filter chips. Unfilled and Unconfirmed stay.
    - The "By officer" view, because officer ids are removed from venue data on purpose.
  - **Shown instead**
    - A **Request staff** button.
    - The grid's "+" cell (`onAdd(date, venue)`) opens `RequestForm` with that date and venue.
    - Move over `?new=1` and `location.state.draft`.
  - **Request cards**
    - Move the dashed card from `venue/Rota.jsx` into `Rota.jsx` as `RequestCard`. It reads "Requested · waiting for reply", with time, type and staff, and is used for `status==='pending'` rows that have no shift.
    - VenueGrid, DayGrid and PhoneDay cells show them under the shifts, through a `cellRequests(reqs, day, venueId)` helper beside `cellShifts`.
    - Tapping one opens `RequestForm edit=[c]`.
  - **Shift cards**
    - The same `ShiftCard`, plus a "Change waiting" pill when its request has `change_status==='pending'`.
  - **Requests tab** (`?tab=requests`)
    - Renders the existing `CoverList` (Select, Cancel N, Change N → `RequestForm edit`).
- **Shift drawer for venues** (inside `ShiftDetail`, used when `isVenue`)
  - Don't call `shifts.get` (managers only). Use `shifts.detail`, which is already open to venues and already hides phones and user ids.
  - **Top:** status pills, then When, Officer type, Bill to and Notes, then the team: name, SIA, lead, clocked in/out.
  - **Body:** the shared shift card from `shift/ShiftView.jsx`, exported as `ShiftBody` (it is `Body` today).
    - **Ejections & bans:** this shift's ejections and the bans that apply at the venue.
    - **Incidents:** a new **Incidents** section showing incidents raised on this shift. Each one links to `/venue/incidents/:id`.
    - **Shift notes and the signed log:** notes, handovers and incident entries.
    - **Handover from last shift:** a read-only `HandoverBlock` (`onAdd=null`). Today it is hidden for venues; `previous_handover` is already returned to them.
  - **Footer**
    - **Open shift page** links to `/venue/logs/:id`.
    - When the shift came from a request and hasn't started: **Change** and **Cancel**, which open `RequestForm edit=[that request]` (found in `cover.list` by `cover_request_id`).
    - A shift the office added by hand gets the line "Set up by the office — message them to change it" and no edit.
  - The ‹ › stepping through shifts works as it does today.
- **Incidents filter** (`functions/api/modules/incidents.mjs`)
  - `incidents.list` accepts an optional `shift_id` filter (the column exists in `001_init.sql`).
  - The current venue scoping and redaction stay.
- The company rota looks and behaves exactly as it does today.

## 4. What's new
- Add a new first card in `app/src/pages/people/_whatsnew.jsx`: "Change a request in the same form you made it, and your rota now looks like the office's". It is dated 2026-11-16, with the image `'venue-rota'` and the `CalendarCog` icon (fall back to `CalendarDays` if that icon doesn't exist).
- Make the picture with `openkbs image --aspect-ratio 3:2`, then `convert -resize 800x -quality 72`, saved as `app/public/whatsnew/venue-rota.webp`. It goes in the same commit.

## 5. Tests: `functions/api/test/coverEdit.test.mjs`
- `editOne` keeps the date and type when they aren't sent, takes a new date and type when they are, rejects a past or malformed date, and still applies the `cleanSlot` rules.
- Call `retimeOccurrence` with a fake `db` and check that it writes the new `occurs_on` and `starts_at` on the moved day, overnight shifts included. Export it for the test.
- A source check that `cover.decideChange` calls `dateClash` before `applyChange`.
- Keep the existing `coverBulk.test.mjs` passing, and add a case where `updateMany` gets `role`.

## 6. Build, deploy, verify
1. `cd functions/api && npm test`, then `cd app && npm run build` (lint, flow and emergency checks).
2. Grep that nothing imports `ChangeSheet`, `BulkChangeSheet` or `venue/Rota.jsx` any more.
3. Commit only my files: "feat: change a request in the same form you made it; venues get the office's rota with their shift logs". Then `openkbs fn deploy api`.
4. Rebuild, commit `site/app` ("build: site with shared rota and request editing"), then `openkbs site deploy`.
5. Live probe on the 6ij75 API: `cover.update` and `incidents.list` answer "Please sign in again", not "Unknown action". Use read-only psql to check Waqas's request rows are unchanged.
6. There is no demo login, so the user tries it as Waqas and Matthew:
   - change a booked date's day and type;
   - make a one-off repeat;
   - change several dates at once;
   - open a shift card and see its ejections, bans and incidents.
7. Make a board card and move it to Done with a comment in business language.
