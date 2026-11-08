# Plan: managers clock out an officer who forgot (v157)

Spec: `spec/plan-managers-clock-out-an-officer-who-forgot-v157.md` (approved, "Build now").

## Context
- **The problem.** An officer who forgets to clock out stays "On shift" on Live.
  - About 2 hours after the shift ends, `closeOpenShifts` (`functions/api/modules/jobs.mjs:75`) closes it at the scheduled end with the `no_clock_out` flag.
  - The only manual tool, `clock.manual` (`functions/api/modules/clock.mjs:255`), rejects **every** clock event, including the real clock-in and its phone, location and selfie proof, and inserts a new in and out pair.
- **The fix.** Managers, and the platform admin through `resolveActing` as a Company manager, need a **Clock out** action that only adds the missing clock-out.

## 1. API: `clock.managerOut` (`functions/api/modules/clock.mjs`, added after `clock.manual`)
```js
// A manager clocks out an officer who forgot: the real clock-in stays, a manual 'out' is added (audited, officer told)
'clock.managerOut': def(MGR, async (b, { user }) => { … })
```
- **Inputs:** `required(b, 'assignment_id', 'reason')`, with `at = b.at ? new Date(b.at) : new Date()`.
- **Load:** `SELECT a.*, s.venue_id, s.starts_at, s.ends_at, v.name AS venue_name FROM shift_assignments a JOIN shifts s … JOIN venues v … WHERE a.id = $1`, wrapped in `need(...)`.
- **Checks** (same order as `clock.manual`):
  - `assertVenue(user, a.venue_id)`;
  - `self = await guardSelf(user, a.officer_id, { venueId: a.venue_id })`;
  - `isBilled(ts)` gives the same error text.
- **State check:**
  - Load the events (`ORDER BY ts`) and use `stateOf(events)`.
  - If the state isn't `on_shift` or `on_break`, fail(400): "They're not clocked in" when the state is `not_started`, or "They've already clocked out" when it's `finished`.
  - `last = events.filter(e => e.status !== 'rejected').at(-1)`.
  - If `at <= last.ts`, fail with "Clock-out must be after HH:MM" using `fmtTime`.
  - If `at > now + 1 min`, fail with "Clock-out can't be in the future".
- **Writes:**
  - When the state is `on_break`, first insert `kind 'break_end'` at `at`.
  - Then insert `kind 'out'` with `status 'manual'`, `exception_reason = reason`, `decided_by = user.id`, `decided_at = now()`, `self_approved`.
  - Both rows are inserted in a single `INSERT … VALUES` (rows built conditionally).
- **After the writes:**
  - `t = await buildTimesheet(a.id, { force: true })`.
    - The real `out` replaces the `no_clock_out` guess from the job.
    - `afterRebuild` inside it turns approved or signed timesheets into a query, never a silent change.
    - The `manual` flag comes automatically from the manual event.
  - `if (self.selfApproved && t) UPDATE timesheets SET self_approved = true`.
- **Audit:** `audit(user, 'clock.managerOut', 'assignment', a.id, { at, reason, timesheet_id: t?.id, from: ts ? {hours, status} : null, to: t ? {hours, status} : null, ...self_approved })`.
- **Notify:** `notify(await officerUser(a.officer_id), { kind: 'clock_out', title: 'You were clocked out', body: \`${user.name} clocked you out at ${fmtTime(at)} (${a.venue_name}) — ${reason}\`, link: <officer hours/timesheet route, confirmed in app/src routes> })`.
  - `officerUser` is imported from `../lib/notify.mjs`.
  - The officer kind must not be filtered out by `NOTIFY_KINDS` prefs. Check how notify treats unknown kinds; if they're optional, use the kind the existing shift and clock notices use.
- **Return:** `{ ok: true, hours: t?.hours }`.

Also:
- **`functions/api/modules/orbCatalog.mjs:90`:** add a `clock.managerOut` entry, "Clock out an officer who forgot", next to `clock.manual`.
- **Labels:** wherever the audit-trail labels live, add `'clock.managerOut': 'Clocked out by a manager'`. That includes `Timesheets.jsx:475`, plus any server-side label map found with grep for `'clock.manual'`.

## 2. App: shared sheet `app/src/pages/shared/_clockOut.jsx`
`export function ClockOutSheet({ open, onClose, onDone, row })`, where `row = { assignment_id, officer_name, venue_name, clocked_in, starts_at, ends_at, on_break? }`.
- **Summary line:** "Clocked in **22:58** · shift ends **03:00** · The Crown & Anchor" (`time()`, `num`).
- **When:** a `Segmented` control with these options:
  - **Now**;
  - **Shift end (03:00)**;
  - **Another time**.
    - Shows `Input type="datetime-local"` using `toLondonInput`/`fromLondonInput` from `../manager/_parts.jsx`.
    - Pre-filled with the shift end, or now if that's earlier.
  - Default: Now while `ends_at` is in the future, otherwise Shift end.
- **Reason:** `Chip`s (from `_parts.jsx`) for Forgot to clock out (default), Phone died / no signal, Left early with permission, and Other.
  - Other shows a `Textarea`.
  - The sent reason is the chip label or the typed text.
- **Notes:**
  - Muted line: "Their clock-in stays as recorded. They'll get a notification, and the timesheet updates."
  - On a break: "Their break ends at the same time."
- **Footer:** Cancel, then **Clock out** (icon `LogOut`), using `useAction` → `api('clock.managerOut', { assignment_id, at, reason })` and the toast `${name} clocked out`.
  - On success, call `onDone()` and dispatch `window.dispatchEvent(new Event('orb:ops'))` so Live and its count catch up.
- **Sheet:** `Sheet size="sm"`, no raw `<button>`, icon sizes 16/18/20 (ui-lint stays at 69 or below).

## 3. Entry points
- **Live** (`app/src/pages/shared/Live.jsx`):
  - In `Detail` (:232), when `!venue && ON.includes(row.state)`, the footer's main button becomes **Clock out**. "Open shift card" moves into `more`.
  - A `clockOut` state renders `<ClockOutSheet row={{...row, on_break: row.state === 'on_break'}} onDone={onDone} />`.
  - In the `Board` row `right`, when `ON.includes(r.state) && now > ends_at`, add `<Pill tone="amber">Past shift end</Pill>`. This applies to managers only (`!venue`) and is computed in the client.
  - The detail KV gets "Clocked out —" unchanged.
- **Rota** (`app/src/pages/manager/Rota.jsx` ShiftDetail `MoreMenu`, :672):
  - Add `a.clocked_in && !a.clocked_out && { label: 'Clock out', icon: LogOut, onClick: () => setClockingOut(a) }`.
  - Render `ClockOutSheet` with `{ assignment_id: a.id, officer_name: a.name, venue_name: s.venue_name, clocked_in: a.clocked_in, starts_at: s.starts_at, ends_at: s.ends_at }`, with `onDone` → `changed()`.
  - Rota has no break state. The server handles a break, so the sheet just omits the break note.
- **Timesheets** (`app/src/pages/shared/Timesheets.jsx`):
  - In `Detail` (:479), when `isManager && !t.locked && t.flags?.includes('no_clock_out')`, add the action `{ key:'clockout', label:'Set clock-out time', icon: LogOut }` and make it the main one when no approve or sign applies.
  - It opens `ClockOutSheet`, defaulting to Another time, with `clocked_in` from the row's clock-in field (the `clock_in` lateral, `timesheets.mjs:81`).
  - The server allows this because the events are still `on_shift` (there's no `out` event); the auto-close only wrote the timesheet.
  - Add it to `RowActions` `more` as well.
- **Officer (no new UI):**
  - Their clock screen already shows `finished` from the events.
  - The notification carries the time and reason.

## 4. What's new
- Top card in `app/src/pages/people/_whatsnew.jsx`:
  - `{ month:'November 2026', date:'2026-11-08', icon: LogOut, title:'Clock out an officer who forgot', image:'/whatsnew/manager-clock-out.webp', … }`.
  - The points cover: Live button, Past shift end pill, Rota menu, Timesheets fix for auto-closed shifts, clock-in kept, officer notified, audited.
- Add a `manager-clock-out` prompt to `app/scripts/whatsnew-images.mjs`.
  - Generate it **from the repo root** with `node app/scripts/whatsnew-images.mjs manager-clock-out`.
  - Look at the image before use.

## Verification
1. **API:** check the module loads with `node -e "import('./functions/api/modules/clock.mjs')"` in functions/api. Then trace `buildTimesheet` for in 22:58 plus a manual out at 03:00: end is 03:00, the flags include `manual`, and `no_clock_out` is gone.
2. **Build:** `npm run build` in app/. ui-lint must stay at 69 or below, and the emergency and flow checks must pass.
3. **Mock** (`/tmp/mock/server.mjs`):
   - one `live.board` row `on_shift` with `ends_at` in the past;
   - one rota assignment with `clocked_in` and no out;
   - one timesheet row flagged `no_clock_out`;
   - `clock.managerOut` returns `{ok:true}`.
   - Run `recopy.sh`, then `run.sh security`.
   - Screenshots at 1280 and 390:
     - Live drawer → Clock out → sheet with the options → toast;
     - the Past shift end pill;
     - the Rota menu item;
     - Timesheets "Set clock-out time".
   - Then run `agent-browser close --all` and stop the mock by PID.

## Ship
- **Commit (explicit paths):**
  - `functions/api/modules/clock.mjs`, `orbCatalog.mjs`;
  - `app/src/pages/shared/_clockOut.jsx`, `Live.jsx`, `Rota.jsx`, `Timesheets.jsx`;
  - `_whatsnew.jsx`, `whatsnew-images.mjs`, `app/public/whatsnew/manager-clock-out.webp`;
  - the spec md.
  - Then commit `site/`.
- **Deploy:** `openkbs fn deploy api`, then `openkbs site deploy` (v157; tag by hand if needed), then `git push origin master --tags`.
- **Live check:** the live `index-*.js` contains `6ij75kpgf7` and not `hopedp5`, and the webp returns 200.
