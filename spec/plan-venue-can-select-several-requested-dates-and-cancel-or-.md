# Plan: venue can select several requested dates and cancel or change them together

## Context
Waqas sent a weekly Steward request (7 dates). On the venue Rota → Requests tab each date is its own row. Today a venue can only open one date at a time and Cancel / Change it ("only this date" or "this and later dates", `ChangeSheet` in `manager/_cover.jsx`). They want it to work like the company's Shift requests card (`manager/Rota.jsx` `Requests`): a **Select** button, ticks on rows, **Select all**, and an action bar acting on the chosen dates, while each date stays editable on its own.

## 1. Backend: `cover.updateMany` (`functions/api/modules/cover.mjs`)
- Roles: company, security, venue. Body: `{ ids: uuid[] (1–100), delete?: true, start?, end?, headcount?, notes?, stream_id? }`. Fields left out keep each date's own value.
- Split the inside of `cover.update` into a helper `changeDate(occ, payload, user)`. It returns `{ status: 'done' | 'awaiting_approval', summary }` and sends no messages and no notifications. `cover.update` keeps its behaviour by calling the helper and then sending its message and notification as now.
- Per id:
  - `loadOcc` (venue scope check);
  - skip, with a reason, any date that is past, not pending/accepted, or already has a change waiting;
  - build the slot from the date's own `slotOf` values plus the fields sent, checked with `cleanSlot`;
  - a stream change goes through the existing `streamFor` rule;
  - pending dates change at once; booked (accepted) dates from a venue user become `change_status = 'pending'` (awaiting approval), exactly as today.
- Afterwards, **one** chat post per request thread and **one** notification to the managers per venue, instead of one per date. For example: "Waqas cancelled 3 dates (Mon 16, Tue 17, Wed 18 Nov)" and "asked to change 2 booked dates — waiting for approval". When a manager makes the change, the venue contacts get one notification. Audit `cover.update_many`.
- Returns `{ done, waiting, skipped: [{id, reason}] }`.

## 2. Venue list (`app/src/pages/venue/_requests.jsx` `CoverList`)
- Same pattern as `Requests` in `manager/Rota.jsx`. Reuse `Tick` from `manager/_parts.jsx` and `ActionBar` from ui.
  - On the Upcoming tab, a **Select** / Done button appears when there are 2 or more changeable dates, plus **Select all N**.
  - A tick appears only on dates that can still change (pending or accepted, not started, no change waiting). In picking mode, tapping a row ticks it instead of opening it.
  - A small **"Select all N dates"** link on a repeating request's row, so the whole week is one tap.
- ActionBar: "N selected" · **Cancel N** (danger confirm) · **Change N**.
- Opening one date and its Cancel / Change still work exactly as now, so single dates stay editable on their own.

## 3. Bulk change sheet (new `BulkChangeSheet` in `manager/_cover.jsx`, next to `ChangeSheet`)
- Fields: Start, Finish, Staff, Notes, and Bill to (only when the venue has more than one active stream; uses `streams.list` as in `RequestForm`).
- Each field is prefilled when every chosen date has the same value. Otherwise it is blank, with the hint "Mixed — leave blank to keep each date's own".
- Save sends only the fields the user changed.
- A warning Callout appears when the selection includes booked dates: "2 of these are already booked, so the office approves those changes".
- After saving, a toast summarises the result, for example "5 changed · 2 sent for approval · 1 skipped (already started)". Then the list reloads and selection mode ends.

## 4. What's new card
Add a card to `pages/people/_whatsnew.jsx`: "Change or cancel several requested dates at once". It gets its own picture, `app/public/whatsnew/bulk-cover.webp`, made with `openkbs image --aspect-ratio 3:2` and then `convert -resize 800x -quality 72`.

## Verification
- Add a source test in `functions/api/test/`, in the same style as the existing ones. It checks:
  - `cover.updateMany` is registered for the venue role;
  - it uses `loadOcc` for every id;
  - it notifies once per venue, not inside the loop;
  - booked dates go to approval for venue users.
- Run `npm test`, then `cd app && npm run build`.
- Commit, then run `openkbs fn deploy api`. Commit the build of `site/app`, then run `openkbs site deploy`.
- Live, read-only database check after a real use: rows changed, at most one notification per action.
