# Plan: cancel today's dates, and one card per request

## Context
Two things are wrong today. Venues can't cancel a date once its start time has passed, even when it falls today (the server and the screen both treat it as "already started"). And the Requests list shows one row per date, so a repeating request turns into dozens of rows. The approved spec (`spec/spec-cancel-today-s-dates-and-requests-shown-the-way-they-we.md`) asks for two changes: any date today can be cancelled, and each request appears once, as an expandable card that holds its dates. The venue and the office both get this.

## 1. Server — `functions/api/modules/cover.mjs`
- **New helper `cancelWhy(occ, today = londonToday())`**, exported:
  - It returns `is <status>` unless the status is pending or accepted.
  - It returns `'is in the past'` when `occ.occurs_on < today`.
  - It returns `'has a change waiting'` when `change_status === 'pending'`.
  - Otherwise it returns null. Started dates today are allowed.
  - `londonToday()` is a 'YYYY-MM-DD' in Europe/London, from `Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London'})`. Reuse one if a helper already exists; grep first.
- **New helper `staffed(occId, db)`:** counts active assignments on the occurrence's live shifts, using the same tables `cancelOccurrence` touches. It runs in one query and returns the count.
- **New helper `onSite(occId, db)`:** checks whether anyone clocked in on those shifts today without clocking out (`clock_events`). It is used only for the note.
- **`cover.update`, delete path only:**
  - Replace the `starts_at < now` fail with `cancelWhy`.
  - Decide whether office approval is needed from `staffed > 0` (any staffed date in scope for future), instead of `status === 'accepted'`.
  - When an officer is on site, the thread message and the manager notification add "an officer is on site".
  - Non-delete updates keep the existing started check.
- **`cover.updateMany` delete:** use `cancelWhy` instead of `bulkWhy`. Dates with nobody booked are cancelled now; booked ones are set to change pending, with one message and one notification per venue, as today. `bulkWhy` stays for change.
- **`cover.decideChange`:** no change. A delete that is approved already runs `cancelOccurrence`.
- **Tests:** `functions/api/test/coverCancelToday.test.mjs`, following the pattern of `coverBulk.test.mjs`. They cover:
  - cancelWhy for yesterday (locked), today after its start (null), a change waiting, and a cancelled date;
  - update and delete for today when nobody is booked (cancelled) and when booked (pending approval);
  - updateMany skipping yesterday but not today.

## 2. Shared rules (front end) — `app/src/pages/manager/_cover.jsx`
- Export `canCancel(c)`, the same rule as the server, with London today from the existing date helpers (`isoDate`). Export `canChange(c)`, the old `changeable` rule (start time in the future, pending or accepted, no change waiting).
- RequestForm's Cancel button follows `canCancel` on the edited dates. Save follows `canChange`.

## 3. Shared request cards — new `app/src/pages/manager/_requestCards.jsx`
- **`groupRequests(list)`:**
  - The group key is `root_id || series_id || id`.
  - Each group holds `upcoming` (live and `ends_at > now`, sorted), `folded` (cancelled, declined or past), `counts` by state (booked, waiting, change waiting, cancelled, past), `next`, `pill` (most urgent: pending > accepted > filled > declined > cancelled), and `waiting`.
  - Pattern segments come from distinct `series_id`, shown as "from <date>: pattern" via `patternSummary`.
  - Groups are ordered waiting first, then by next date. On the Past tab, newest first.
- **`RequestCards({list, many, past, onOpen, actions})`:** a List of cards.
  - Header: role, venue if `many`, pattern, budget, counts line, next date, Pill.
  - Tap to expand. Upcoming date rows (`Row`, with a Pill and "Change waiting") call `onOpen(c, groupDates)`. The fold line "N cancelled · M past" toggles greyed read-only rows.
  - `actions(group)` renders the card's own buttons, so venue and office differ.
  - In-card select mode: a Tick per upcoming row, plus an ActionBar with Cancel N / Change N, using the existing bulk calls.

## 4. Venue — `app/src/pages/venue/_requests.jsx`
- Rewrite the body of `CoverList` with `RequestCards`. Drop the page-wide Select and the "All N dates" option.
- The card actions:
  - **Change whole:** `ChangeRequest edit={[next changeable date]}`, with the form opening in `mode='future'`. Add an `initialMode` prop to RequestForm and ChangeRequest. It is disabled when nothing can change, and the reason is shown.
  - **Cancel whole:** split the upcoming ids that `canCancel` allows into "cancel now" (pending, or `filled == 0`) and "needs approval". Confirm with "N cancel now, M need the office's approval", then call `api('cover.updateMany', {ids, type:'delete'})` and show `bulkToast`.
  - **Select dates:** in-card select.
  - **Message:** a link to the conversation, shown only when `conversation_id` is set.
- In `Detail`, replace `live` with `canChange` for Change and `canCancel` for Cancel.

## 5. Office — `app/src/pages/manager/Cover.jsx`
- Replace `group()` with `groupRequests`. FILTERS keep filtering per date before grouping, so tab counts stay per date.
- Card actions: Accept all / Decline all on pending dates (the existing scope series call), and Message.
- Date rows open the existing `Detail`: accept or decline one date, approve or decline a change, Change or Cancel. Detail's `live` gets the same canChange/canCancel split.
- The approval note shows the server's "on site" text from the thread. No extra UI.

## 6. Rota — `app/src/pages/manager/Rota.jsx`
- In `VenueShiftDetail`, Cancel uses `canCancel(req)`. Change still needs `ahead`.

## 7. What's new
- A new top card in `app/src/pages/people/_whatsnew.jsx`, "Cancel today's dates, and requests shown as you made them".
- Its own picture at `app/public/whatsnew/request-cards.webp`, made with `openkbs image --aspect-ratio 3:2`, then `convert -resize 800x -quality 72`.

## Deploy
1. `cd functions/api && npm test`.
2. `cd app && npm run build`, which runs ui-lint and the flow checks.
3. Commit the source.
4. Commit `site/app` as "build: …".
5. `openkbs fn deploy api`, then `openkbs site deploy`.
6. Move the board card to Done with a comment in business language.

## Verification
- Server tests pass.
- Live probe: `cover.update` answers "Please sign in again", not "Unknown action".
- Read-only psql after deploy confirms the New Eidyn data still groups as expected:
  - the bcd4a5d7 root has 1 pending and 40 cancelled;
  - the 083b1121 root has 7 dates.
- Ask the user to check as Waqas and Matthew (no demo logins from here):
  - Waqas cancels today's 08:00 date (it goes at once) and today's 18:30 date ("Change waiting").
  - Matthew approves it.
  - The cards show "40 cancelled" folded and the nightly request as one card with 7 dates.
