# Plan: managers clock out an officer who forgot (v157)

## Context
- **The problem.** When an officer forgets to clock out, nobody can close their shift by hand today.
  - They stay "On shift" on Live operations.
  - Two hours after the shift ends, the job `closeOpenShifts` (`functions/api/modules/jobs.mjs:75`) closes it at the scheduled end and flags it `no_clock_out`.
- **What exists today.** The only manual tool is "Set times manually" (`clock.manual`, `clock.mjs:255`).
  - It **throws away the officer's real clock-in** and its proof (phone, location, selfie) and replaces both times.
  - So it's the wrong tool for this case.
- **The request.** Managers, and the platform admin acting as a Company manager, should be able to clock an officer out directly.
- **The outcome.** A **Clock out** action that keeps the real clock-in, records a manual clock-out at a chosen time, rebuilds the timesheet, tells the officer, and is audited.

## Server: `clock.managerOut` (`functions/api/modules/clock.mjs`, beside `clock.manual`)
- **Roles:** `def(MGR, …)`. The platform admin already counts as a Company manager through `resolveActing`.
- **Body:** `{ assignment_id, at?, reason }`.
  - `at` defaults to now.
  - `reason` is required, with a preset "Forgot to clock out".
- **Checks** (all reused from `clock.manual`):
  - load the assignment, shift and officer;
  - `assertVenue`, `guardSelf(user, officerId, { venueId })`, and refuse if `isBilled`;
  - the events' `stateOf` must be `on_shift` or `on_break`, otherwise fail "They're not clocked in";
  - `at` must be after the last valid event and not in the future.
- **Writes:**
  - If they're on a break, first insert `break_end` at `at`.
  - Then insert `kind:'out'` with `status:'manual'`, `decided_by: user.id`, `decided_at: now()`, `exception_reason: reason`.
  - The original `in` and its proof are untouched.
- **Then:**
  - `buildTimesheet(a.id, { force: true })`. This also covers a shift the job already auto-closed: the real `out` replaces the `no_clock_out` guess. Then run `afterRebuild` as `clock.manual` does.
  - `audit(user, 'clock.managerOut', 'assignment', a.id, { at, reason, timesheet_id })`.
  - `notify(officerUser(officerId), { kind:'clock', title:'You were clocked out', body:\`${user.name} clocked you out at HH:MM — ${reason}\`, link:'/officer/timesheets' })`. This sends in-app plus push.
- **Other:**
  - Add `'clock.managerOut': 'Clocked out by a manager'` beside the `clock.manual` label (`Timesheets.jsx:475`), so it reads well in the timesheet trail.
  - Add it to Orb's catalogue (`orbCatalog.mjs:90`) next to "Record hours manually".

## App: one shared sheet, three places to open it
- **New `app/src/pages/shared/_clockOut.jsx`, `ClockOutSheet({ open, onClose, row, onDone })`:**
  - Header: "Clock out Sam Patel".
  - Line: "Clocked in 22:58 at The Crown & Anchor · shift ends 03:00".
  - **When** choice:
    - **Now**, the default while the shift is still running;
    - **At shift end (03:00)**, the default once the shift has ended;
    - **Another time**, a time input.
  - Reason chips: Forgot to clock out (default), Phone died / no signal, Left early, Other (text).
  - Note: "Their clock-in stays as recorded. They'll get a notification."
  - Button **Clock out**, using `useAction` → `api('clock.managerOut')` and the toast "Sam Patel clocked out".
- **Where it opens:**
  1. **Live operations** (`app/src/pages/shared/Live.jsx`):
     - The Detail drawer (:232) for an `on_shift`/`on_break` officer gets a **Clock out** button next to Call.
     - "Set times manually" stays in the menu.
     - Board rows for officers still on shift after `ends_at` show an amber "Past shift end" pill, so forgotten clock-outs stand out.
  2. **Rota** (`Rota.jsx` ShiftDetail, per-officer `MoreMenu` :672) gets **Clock out** when `clocked_in && !clocked_out`.
  3. **Timesheets** (`app/src/pages/shared/Timesheets.jsx`): a row flagged `no_clock_out` gets **Set clock-out time**. This opens the same sheet, defaulting to Another time, and fixes the auto-closed shifts.
- **Not included:**
  - Venue logins never see it.
  - The officer's shift card (ShiftView Team) is not changed.

## What's new
- Add a card at the top of `_whatsnew.jsx`: "Clock out an officer who forgot".
- Add a `manager-clock-out` prompt to `app/scripts/whatsnew-images.mjs`. Run it from the repo root, and look at the image before use.

## Verification
1. **Mock** (`/tmp/mock/server.mjs`):
   - add `live.board` rows with one officer still on shift past the end;
   - make `clock.managerOut` return ok.
   - Load the module locally with `node -e "import('./functions/api/modules/clock.mjs')"`.
2. **Build:** `npm run build` in app/. ui-lint must stay at 69 or below, and the emergency and flow checks must pass.
3. **Screenshots** with agent-browser at 1280 and 390:
   - Live drawer → Clock out → sheet → toast;
   - Rota drawer menu item;
   - Timesheets "Set clock-out time" on a `no_clock_out` row.
   - Then run `agent-browser close --all` and stop the mock by PID.
4. **Logic check by reading the code:** for clock-in 22:58 and a manager clock-out at 03:00, `buildTimesheet` gives a timesheet with start 22:58 (paid from the scheduled start), end 03:00, the `manual` flag, and no `no_clock_out` flag.

## Ship
- Commit with explicit paths (clock.mjs, orbCatalog.mjs, _clockOut.jsx, Live.jsx, Rota.jsx, Timesheets.jsx, _whatsnew.jsx, whatsnew-images.mjs, the webp, the spec md), then commit the `site/` build.
- Deploy: `openkbs fn deploy api`, then `openkbs site deploy` (v157).
- Push: `git push origin master --tags`.
- Check the live `index-*.js` contains `6ij75kpgf7` and not `hopedp5`, and that the webp returns 200.
