# Spec: select several shifts on the rota like in Windows, then assign, approve, publish or cancel them together

## Context
The office staffs the rota one shift at a time. To put the same officer on five Friday shifts, or to approve a pile of officer requests, a manager has to open each shift separately. The user asked for Windows-style selection on the rota: Shift+click, Ctrl+click and select all, followed by actions on everything selected.

## Who it is for
- **Office managers** (company and security managers) on the office Rota, which has the Week, Day and Officer views.
- Venue managers don't assign or publish, so their rota is unchanged. They do get the same select keys on their own lists (see section 4).

## 1. Selecting shifts on the rota
- **Desktop:**
  - **Click** works as now and opens the shift.
  - **Ctrl+click** (Cmd+click on Mac) adds a shift to the selection, or removes it, without opening it.
  - **Shift+click** selects a **rectangle on the grid**: every shown shift in the days and rows between the last shift picked and this one. For example, Mon–Fri for The Ivy and New Eidyn. In the Officer view the rows are officers.
  - **Ctrl+A** (Cmd+A) selects every shift shown, after filters. **Esc** clears the selection.
- **Phone:** press and hold a shift to start selecting. After that, taps add or remove shifts. Shift+click has no equivalent on a phone, and **Select all** is a button in the bar.
- Selected shifts show a tick and a blue edge. The selection keeps through filter and density changes, but clears when the week changes.
- The dashed venue-request cards on the rota can't be selected; they belong to Venue requests (section 3).

## 2. The bar for the selection
The bar shows "N selected", then the actions below. Each action:
- works on the shifts it applies to;
- **skips the rest and lists each skipped one with its reason** (e.g. "Sat 21 Nov · The Ivy — full", "Fri 20 Nov — clashes with New Eidyn");
- ends with one summary toast, e.g. "4 assigned · 1 skipped (full)".

- **Assign an officer.** Pick one officer from a list. It shows how many of the selected shifts each officer can take.
  - Each shift gets the same checks as assigning one shift today: licence, the role's type, clashes, rest time and bans.
  - Shifts that are blocked or already full are skipped.
  - When only warnings come up, they are listed once with **Assign anyway** for all.
  - The officer gets **one** notification listing all the new shifts, not one per shift.
- **Approve requests / Decline requests.** Acts on every officer request ("✋ req") on the selected shifts, with the same checks as approving one. When a shift has more requests than places, it approves them in the order they came in and skips the rest. Each officer is told once.
- **Publish.** Publishes the selected drafts, through the publish step that already takes several shifts.
- **Offer as open / Stop offering.** Turns "Open" on or off for the selected published shifts.
- **Cancel / Delete.** One confirm, e.g. "Cancel 3 shifts and delete 2 drafts? Officers booked on them are told."
  - Published shifts are cancelled.
  - Drafts are deleted.
  - Shifts that someone has already clocked in on are skipped.
  - Shifts that came from a venue's request: cancelling one also cancels that requested date, and the venue is told, as cancelling one shift does today.
- Actions that don't fit any selected shift are greyed out with the reason as a hint. For example, Publish is greyed out when no drafts are selected.

## 3. Venue requests (office)
- On the office's request cards, Shift+click, Ctrl+click and long-press select dates **across cards**.
- The bar offers **Accept**, **Decline** (with one reason), **Approve change** and **Decline change**, alongside the existing Cancel and Change.

## 4. The same keys on every list that already has Select
On each of these lists, Shift+click selects a range (from the last ticked row to this one, in the order shown), Ctrl+click toggles, Ctrl+A selects everything that can be ticked, Esc clears, and long-press starts selecting on a phone:
- Rota → Requests (officer requests);
- Timesheets;
- Exceptions;
- Orb's To approve (still one kind at a time);
- venue request cards, for both the venue and the office.

The rule for which rows can be ticked stays as it is on each list. It is one shared piece of behaviour, so it works the same everywhere.

## Out of scope
- Changing times, venue or role of several shifts at once.
- Assigning different officers to different shifts in one step ("auto-fill").
- Drag-to-select with the mouse.
- Selecting on the venue managers' rota grid.

## Edge cases
- A shift-click without any earlier pick works like Ctrl+click.
- Shifts hidden by a filter are never selected by Shift or Ctrl+A.
- Ctrl+A only takes over in select mode or on the rota grid. It never takes over while typing in a field.
- A shift changed by someone else while it was selected is checked again when the action runs, and skipped with the reason if it no longer fits.
- Large selections: up to 200 shifts per action. Above that, the bar asks the manager to narrow the selection.

## Done when
- On the office rota, Ctrl+click picks shifts, Shift+click picks a rectangle across days and venues, Ctrl+A picks everything shown, and Esc clears.
- On a phone, long-press starts selecting.
- With five Friday shifts selected, **Assign** puts one officer on all of them. A full or clashing shift is skipped with its reason, and the officer gets one notification.
- Approve requests, Decline requests, Publish, Open on or off, and Cancel or Delete each work on a mixed selection and report what they skipped.
- Office Venue requests can accept or decline several dates across requests at once.
- The same keys work on Rota → Requests, Timesheets, Exceptions, Orb's To approve and the request cards.
- Server tests cover the bulk assign and approve rules.
- A What's new card with its own picture.
