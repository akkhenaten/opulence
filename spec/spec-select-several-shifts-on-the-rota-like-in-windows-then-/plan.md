# Plan: Windows-style multi-select on the office rota + shared select keys on every list

## Context
Office managers staff the rota one shift at a time (open card → Assign → pick officer). The approved spec adds Ctrl/Cmd+click, Shift+click (rectangle on the grid), Ctrl+A, Esc and phone long-press, plus a bar that assigns, approves/declines requests, publishes, opens/closes and cancels/deletes many shifts at once with skipped shifts listed by reason. The same keys go onto every list that already has Select.

## 1. Shared selection hook — `app/src/ui/useSelect.js` (new, re-exported from `ui/index.jsx`)
`useSelect({ ids, can = () => true, range })` → `{ sel:Set, picking, has, start, stop, toggle, setAll, click(e,id), press(id), keys }`
- `click(e, id)`: Ctrl/Meta → toggle (start picking); Shift → add `range(anchor, id)` (default: linear slice of `ids` in shown order, filtered by `can`); no anchor → toggle; plain click returns `false` so the caller opens the item as before (or toggles when already `picking`, which is what the lists do today).
- Long-press: reuse `useLongPress` timing idea from `ui/index.jsx:635` — `press(id)` returns pointer handlers that start picking with that id after 450 ms and swallow the following click (`fired()` pattern).
- Keys: one `keydown` listener while mounted & `active` — Ctrl/Cmd+A selects all `can` ids (skip if focus is in input/textarea/select/contenteditable or a Sheet is open), Esc clears/stops.
- Selection drops ids no longer in `ids` (filters/week change) — for the rota, cleared explicitly on week change.
- `Check` (`ui/index.jsx:1144`): pass the event — `onChange(!checked, e)` — so tick boxes honour Shift/Ctrl too (back-compatible).
- Visual: `selected` ring (`ring-2 ring-blue` + small tick badge) as a shared class `SELECTED`.

## 2. Office rota grid — `app/src/pages/manager/Rota.jsx`
- In `Rota()` (office only, `!isVenue`): `const pick = useSelect({ ids: order ids, can: selectable, range: rect })`.
  - `selectable(s)`: not cancelled and not ended.
  - Cell coordinates built from the same data that draws the grid: Venues view → row = index in `gridVenues`, Day view → one row, Officer view → row = "Unfilled" + officers from `useOfficerRows` (a shift may be in several rows; the anchor remembers the row it was clicked in). `rect(a, b)` = selectable shown shifts with row and day between the two.
  - Clear on `week`/`venueId` change; keep across filter/density changes (selection is intersected with `shown`).
- `ShiftCard`, `OfficerChip`: new props `selected`, `onPick(e)`, `press`. `onClick={(e) => (onPick?.(e) ? null : onOpen(s))}`; hide the ↗ link while picking. Pass through `VenueGrid`, `DayGrid`, `OfficerGrid`, `PhoneDay`, `OfficerAgenda` via the shared `props` object (`pick` added once). `RequestCard` (venue dashed cards) untouched.
- New `RotaBar` component (in a new `app/src/pages/manager/_rotaBulk.jsx` to keep Rota.jsx from growing): `ActionBar` with "N selected", Select all (phone), Clear, and buttons greyed with a `title` hint when no selected shift fits:
  - **Assign…** → `BulkAssignSheet`: officer list from new `shifts.candidatesMany`; each row shows "fits 4 of 5" and the reasons for the rest; tap → if any warnings, one confirm "Assign anyway" listing them → `shifts.assignMany`.
  - **Approve requests / Decline requests** → `shifts.decideRequests`.
  - **Publish** (drafts) → existing `shifts.publish { ids }`.
  - **Offer as open / Stop offering** → `shifts.setOpen`.
  - **Cancel / Delete** → one `useConfirm` ("Cancel 3 shifts and delete 2 drafts? Officers booked on them are told.") → `shifts.cancelMany`.
  - Each result `{ done, skipped:[{id, label, why}] }` → toast "4 assigned · 1 skipped"; if skipped, a small Sheet "Not done" listing `label — why`; then reload and clear.
- >200 selected: buttons disabled with "Select up to 200 shifts".

## 3. Server — `functions/api/modules/rota.mjs`
Pure helpers (exported, tested): `shiftLabel(s)` ("Sat 21 Nov · The Ivy"), `bulkSkip(s, kind, now)` (cancelled / ended / not a draft / not published / started), `orderRequests(reqs, places)` (oldest first, cut at free places), `MAX_BULK = 200`.
New actions, all `def(MGR, …)`, `required(b,'ids')`, `ids.length <= MAX_BULK`, venue scope via `venueScope`, loading shifts with one query, processing **in start-time order, one by one** (so the overlap check in `checkOfficerForShift` sees earlier inserts):
- `shifts.candidatesMany { ids }` → per active officer `{ ...officer, fits, warnings:[{label, w}], blocked:[{label, why}] }`, sorted by fits desc.
- `shifts.assignMany { ids, officer_id, override }` → same checks as `shifts.assign` (blocking → skip with reason, full → "full", warnings without override → returns `needs_override` with the list and assigns nothing). Inserts with the same SQL as `shifts.assign`; `afterShiftChange` once with all shift ids; `remindPack` per assignment; **one** `notify` for the officer on the published ones (same shape as the grouped message in `shifts.publish`); one audit `shift.assign_many`.
- `shifts.decideRequests { ids, approve }` → requested assignments on those shifts; approve uses `orderRequests` + `checkOfficerForShift(..., { ignoreAssignment })`; extras skipped "full"; decline rejects all. Clears `req:` notifications; one notify per officer (grouped).
- `shifts.setOpen { ids, open }` → `UPDATE shifts SET open = $2 WHERE id = ANY … AND status = 'published' AND ends_at > now()`; when turning on, the same "N open shifts available" notice as publish.
- `shifts.cancelMany { ids, reason }` → drafts: same body as `shifts.delete`; published: skip if any clock-in exists ("someone is clocked in"), else existing `cancelShift`. Same side-effects as cancelling one today (note: `cancelShift` does not touch the venue's requested date; the bulk path behaves identically, so the spec's "also cancels the requested date" line is matched only if the single cancel does — no new cover side-effect added).
- `shifts.publish` reused unchanged.

## 4. Lists getting the shared keys
Swap each list's own Set/array + toggle for `useSelect` (keeps its existing `can` rule and bar):
- `Rota.jsx` `Requests()` (622) — and wire `click(e,id)` on row + Tick.
- `app/src/pages/shared/Timesheets.jsx` (`sel`, `selectable`, `toggle` at 73–114, `TableRow`/`RowCard` ticks).
- `app/src/pages/manager/Exceptions.jsx` (`picked` 25–30, Tick 67).
- `app/src/pages/manager/OpsAI.jsx` (`sel` 42–52, native checkbox 184 → read `e.shiftKey` from its onClick; one kind at a time stays).
- `app/src/pages/manager/_requestCards.jsx`: `pick` becomes `useSelect` over `live` dates; venue: within one card as now; `office` prop → across cards (ids across all open groups). New optional props `onAcceptDates`, `onDeclineDates`, `onDecideChanges` add bar buttons; `Cover.jsx` wires them to a client loop over existing `cover.accept {id}`, `cover.decline {id, reason}`, `cover.decideChange {id, approve, reason}` (one reason prompt for decline), with a "N done · M skipped" toast — same pattern as `decideAll` in Rota `Requests()`.

## 5. What's new + tests
- `functions/api/test/rotaBulk.test.mjs`: `bulkSkip`, `orderRequests`, `shiftLabel`; source checks that `assignMany` runs `checkOfficerForShift` per shift, skips when full, refuses without override on warnings, and notifies once per officer; actions registered in `ACTIONS`.
- Top card in `app/src/pages/people/_whatsnew.jsx` + `app/public/whatsnew/rota-multiselect.webp` (`openkbs image --aspect-ratio 3:2`, `convert -resize 800x -quality 72`), same commit.

## Verification
1. `cd functions/api && npm test` — all pass incl. new file.
2. `cd app && npm run build` — ui-lint / flow-check / vite clean.
3. Commit source, then `build:` commit of `site/app`; `openkbs fn deploy api`; `openkbs site deploy`.
4. Live probe: POST `shifts.assignMany` to the api URL without auth → "Please sign in again" (action exists).
5. Read-only DB sanity: count of draft/published shifts this week to suggest test data.
6. Ask the user to try on the live site as an office manager: Ctrl+click 3 shifts, Shift+click a rectangle, Ctrl+A, assign one officer (one full shift skipped with reason), publish, cancel; long-press on phone; Shift+click on Timesheets.
7. Board: comment on the card in business language and move it to Done.
