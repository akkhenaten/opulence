# Implementation plan: one request form for making and changing requests, and the office's rota for venues

Spec: `spec/plan-one-request-form-for-making-and-changing-requests-and-t.md` (approved, "Build now")

## Context
v211 added a separate bulk-change sheet and kept a separate venue rota. The user wants two things instead. Changing a request should use the same full "Request staff" form. Venue managers should get the company rota UI, limited to their own venue(s), and its shift cards should show the ejections, bans, incidents, notes and handovers for that shift. Venues can change or cancel a booked shift from its card, and booked changes still wait for the office to approve.

## 1. Backend
### `functions/api/modules/cover.mjs`
- **`editOne(b, occ, today)`** (exported, pure)
  - Returns `{ type:'edit', slot:{ ...cleanSlot(b), date }, role, notes }`.
  - `date = b.date || occ.occurs_on`. It must be YYYY-MM-DD and on or after `today`; otherwise it fails 400 with "Pick a date from today on".
  - `role = b.role || occ.role`.
  - `notes` is handled as today: `undefined` keeps the current notes, and `''` clears them.
- **`dateClash(occ, date, db)`** (exported, pure)
  - Returns null when `date === occ.occurs_on` or the date has no series.
  - Otherwise it checks `SELECT 1 FROM cover_requests WHERE series_id=$1 AND occurs_on=$2 AND id<>$3 AND status IN ('pending','accepted')`. On a match it fails 400 with "There's already a request on <fmtDate> — change that one instead".
- **`retimeOccurrence`** (exported for the test)
  - `const day = slot.date || occ.occurs_on`, then `occRange(day, …)`.
  - The `UPDATE` also sets `occurs_on = $8`.
  - The existing `moved` check already catches a change of date. When the day changed, the officer message reads `Shift moved to ${fmtDateTime(r.starts_at)} – ${fmtTime(r.ends_at)}`; otherwise it is "Shift times changed".
- **`applyChange`, `scope 'one'` edit**
  - Already passes `role`. The summary names the moved date and the new type, e.g. "Mon 16 Nov moved to Tue 17 Nov, 21:00–03:00, 2 staff · Door supervisor". Look up the role name with `SELECT name FROM roles`.
- **`cover.update`**
  - Scope: `const scope = b.scope === 'future' && (occ.kind === 'recurring' || b.kind === 'recurring') ? 'future' : 'one'`. This lets a one-off become repeating, since `applyFuture` already handles a one-off series.
  - If `b.role` is set, check it with `need(one('SELECT 1 FROM roles WHERE code=$1'))`.
  - `b.new_stream?.name` → `createStream(...)`, then `audit 'stream.create'` and `tellCompanyNewStream`. Use its id as `b.stream_id` before the existing stream block. The stream block already uses the stream that was sent, so a change of type alone keeps the current stream.
  - For `scope 'one'`: `payload = editOne(b, occ, londonDate(new Date()))`, then `await dateClash(occ, payload.slot.date)`.
  - The `future` branch is unchanged. `cleanSeries` already reads `b.role`.
- **`cover.decideChange`**
  - Before `applyChange`, when the payload has `slot?.date`, call `await dateClash(occ, occ.change_payload.slot.date)`.
- **`cover.updateMany`**
  - Accepts `role`, validated once, and `new_stream`, created once before the loop.
  - Each date's payload becomes `{type:'edit', slot, notes, role: b.role || undefined}`.
  - Add `'role'` to the keys that count as an edit.
  - Notification links stay `/venue/rota?tab=requests`, which still works.

### `functions/api/modules/incidents.mjs`
- `incidents.list`: add `AND ($12::uuid IS NULL OR i.shift_id = $12)` and the parameter `b.shift_id || null`. Scoping and redaction stay as they are.

## 2. One form: `app/src/pages/manager/_cover.jsx`
- **`RequestForm({ venues, roles, draft, edit, onClose, onDone })`**
  - With no `edit`, nothing changes.
  - With `edit` (an array of `cover.list` rows):
    - **Prefill** comes from the helper `editStart(edit)`:
      - one row: `role`, `date: occurs_on`, `slotOf`, `notes`, `stream_id`, `frequency`, `days`, `has_end` and `end_date` from the row;
      - several rows: each field comes from `same()`, which leaves it blank when the dates differ (the rule from `BulkChangeSheet`).
    - **`mode`** is chosen with a Segmented control:
      - a recurring row: `'one'` (Only this date) or `'future'` (This and later dates);
      - a one-off row: `'one'` (One date) or `'future'` (Repeating);
      - several rows: always `'one'`, with no Segmented control and no Date field.
    - **Layout:** a `rec` view is shown when `mode === 'future'`. Its "Starting" date is replaced by the fixed text `From <dayLabel(edit[0].occurs_on)>`.
    - **Venue:** shown as text, not a Select.
    - **Officer type and Bill to:** when the dates differ, both get a "Keep each date's own" option with value `''`.
    - **Hints:** blank fields with mixed values show "Mixed — leave blank to keep each date's own".
    - **Booked dates:** when a venue user changes accepted dates, a warning Callout appears (text from `ChangeSheet`). The `isMgr` value comes from `useAuth().user.role`.
    - **Saving:**
      - The helper `changedFields(start, v)` returns only the fields that changed. Save stays disabled until something changed and the form is valid.
      - Save is labelled "Ask for approval" when a venue user touches booked dates, otherwise "Save".
      - With one row it sends `cover.update {id, scope: mode, kind: mode==='future' ? 'recurring' : undefined, ...}`:
        - in `'one'` mode, the one-date fields plus `role`, `date`, `notes` and the stream;
        - in `'future'` mode, the repeating fields plus `role`, `notes` and the stream.
      - With several rows it sends `cover.updateMany {ids, ...changed}`, and the toast comes from `bulkToast(false)`.
      - The stream part, `stream_id` or `new_stream`, is built the same way as for create.
    - **Footer:** a danger-text "Cancel date" / "Cancel N dates" on the left. It confirms, then calls `cover.update {id, scope: mode, delete:true}` for one row, or `updateMany {ids, delete:true}` for several. On the right, Back and Save.
- **Remove `ChangeSheet` and `BulkChangeSheet`.**
- **`describeChange`:** mention `slot.date` when it differs ("move to Tue 17 Nov") and a type change when `role` differs.
- **Callers**
  - `manager/Cover.jsx:108`: `<RequestForm edit={[c]} venues=… roles=… onClose onDone />`. `roles` and `venues` come from that page, using the same loaders as the form; check what is already there.
  - `venue/_requests.jsx`:
    - `Detail` opens `RequestForm edit={[c]}` from both "Change" and "Cancel". "Cancel" opens the same form, and its Cancel button is the delete.
    - In `CoverList`, "Change N" opens `RequestForm edit={chosen}`, and the separate bulk cancel stays.
    - Both need `roles` and `venues`; load them with `useApi('roles.list')`, and take venues from `useVenue().venues`.

## 3. Shared rota: `app/src/pages/manager/Rota.jsx`
- `const isVenue = useAuth().user.role === 'venue'` and `const vctx = useVenue()`. `useVenue` returns null outside `VenueProvider`, so guard it.
- **Data**
  - `venues = isVenue ? { data: vctx.venues.map(v => ({...v, active: true})) } : useApi('venues.list')`. Keep the hook order stable: call `useApi('venues.list', {}, { skip: isVenue })` and pick one.
  - `reqs = useApi('shifts.pendingRequests', {}, { skip: isVenue })`.
  - `cover = useApi('cover.list', {}, { skip: !isVenue, poll: 60000 })`.
  - `tabCounts = useRotaCounts(isVenue ? { cover, venue: true } : { reqs })`.
  - In `_rotaCounts.js`, `venue` skips `pendingRequests` and returns `{ Requests: waiting }`.
  - A venue with one venue never shows the venue Select. When it has more than one, `?venue=` works as it does today.
- **Hidden when `isVenue`:** `pubItem`, `MoreMenu`, New shift, `ShiftForm`, the `drafts` and `requests` FILTERS, and the `officers` VIEW. The view list is filtered, so an `?view=officers` URL falls back to venues.
- **Venue actions**
  - A `Request staff` button.
  - The grid's `onAdd(date, vid)` opens `RequestForm` with `draft={{ venue_id: vid, date, quiet: true }}`.
  - `?new=1` and `location.state.draft` open it too, ported from `venue/Rota.jsx`.
  - `onDone` reloads `shifts` and `cover`.
- **Request cards**
  - New `RequestCard({ c, showVenue, onOpen })`, using the dashed markup from `venue/Rota.jsx` `Week`.
  - New `cellRequests(list, day, vid)`: rows where `status==='pending'`, the date falls on `day` (London date of `starts_at`), and the venue matches.
  - `VenueGrid`, `DayGrid` and `PhoneDay` get an optional `requests` prop and render the cards after the shifts in each cell.
  - Tapping a card opens `RequestForm edit={[c]}`.
- **`ShiftCard`:** a `Pill tone="amber"` reading "Change waiting" when `s.change_waiting`. For venues, set it on the rows by mapping `cover` by `cover_request_id`.
- **Requests tab:** `tab === 'requests'` for a venue renders `<CoverList q={cover} many={vctx.many} onOpen={setReq} onNew={…} onDone={cover.reload} />` and `Detail` from `venue/_requests.jsx`. The page subtitle is "Your staff requests".
- **Drawer:** `openId && (isVenue ? <VenueShiftDetail …/> : <ShiftDetail …/>)`.
- **New `VenueShiftDetail({ id, row, cover, onClose, onChanged, onPrev, onNext })`, in `Rota.jsx`**
  - `useApi('shifts.detail', { id })`, shown in a `Sheet` with the same ‹ › handling.
  - **Header:** status pills, then a KV block with When, Officer type, Bill to (from `row.stream_name`) and Notes.
  - **Body:** `<ShiftBody d={d} reload={q.reload} role="venue" />`, exported from `shift/ShiftView.jsx`. It already includes the team, the shift's ejections, the venue's bans and the signed log entries.
  - **Footer:**
    - "Open shift page" links to `/venue/logs/${id}`.
    - If `row.cover_request_id` is set and the shift starts in the future, "Change" and "Cancel" open `RequestForm edit={[cover row]}`. The cover row is found with `cover.data.find(c => c.id === row.cover_request_id)`.
    - Otherwise the footnote reads "Set up by the office — message them to change it".
- **`shift/ShiftView.jsx`**
  - Rename `Body` to `ShiftBody` and export it; keep the local usages.
  - Venues get a read-only `HandoverBlock` with `onAdd={null}` when `d.previous_handover` is present. Check that it renders read-only when `onAdd` is null.
  - New `ShiftIncidents({ shiftId })`, shown for venues: `useApi('incidents.list', { shift_id })`, a `Section` titled "Incidents", rows linking to `/venue/incidents/:id` with ref, title, severity pill and time. Nothing renders when the list is empty.
- **Routes** (`app/src/main.jsx`)
  - `/venue/rota` uses the company `Rota`, which is already lazily imported.
  - Add `<Route path="shifts/:id" element={<ShiftView />} />` under `/venue`.
  - Remove the `VenueRota` import and delete `app/src/pages/venue/Rota.jsx`.
- **Hubs** (`ui/hubs.js`): add `venue.rota = { title: 'Rota', tabs: [{ to: 'rota', label: 'Week' }, { to: 'rota?tab=requests', label: 'Requests' }] }`. With it, the Page tab row and `tabCounts` 'Requests' show.
- **ShiftView back link:** `from` defaults to Rota for venues, so it already returns there.

## 4. What's new
- Add a first entry in `app/src/pages/people/_whatsnew.jsx`, dated 2026-11-16, with the image `'venue-rota'` and an icon that exists in lucide (CalendarCog, else CalendarDays). Title: "Change a request in the same form you made it". The body adds: "venues see the office's rota, and a shift card shows its ejections, bans, incidents and handovers".
- Picture: `openkbs image --aspect-ratio 3:2 -o /tmp/vr.png "<clean illustration: a weekly shift rota grid on a tablet at a venue bar, security officer cards, warm evening light>"`, then `convert /tmp/vr.png -resize 800x -quality 72 app/public/whatsnew/venue-rota.webp`.

## 5. Tests: `functions/api/test/coverEdit.test.mjs` (pattern of `coverBulk.test.mjs`)
- `editOne`:
  - with no date or role sent, it keeps `occurs_on` and `role`;
  - a new date and role are taken;
  - a past date or `'2026-13-01'` throws;
  - a bad slot still throws.
- `retimeOccurrence` with a fake db `{ q: async (sql, p) => (calls.push([sql, p]), []), one: async () => ({ name: 'V' }) }`:
  - it writes `occurs_on='2026-11-20'`;
  - `starts_at` falls on the 20th in London time, and an overnight `end` falls on the 21st.
  - If `syncAfter` or `notifyShiftOfficers` need real DB access, check only the first `UPDATE` call's parameters, and stub where possible. Otherwise, fall back to testing `occRange` together with the `UPDATE` SQL containing `occurs_on` (a source check).
- Source check: in `'cover.decideChange'`, `dateClash(` appears before `applyChange(`.
- Source check: `'cover.updateMany'` reads `b.role`.
- The existing `coverBulk.test.mjs` still passes. Update its notify-outside-the-loop check if `new_stream` code moves the markers.

## 6. Build, deploy, verify
1. `cd functions/api && npm test`; `cd app && npm run build`, which also runs the lint, flow and emergency checks.
2. `grep -rn "ChangeSheet\|BulkChangeSheet\|venue/Rota" app/src` should find nothing.
3. Stage only my files. Commit "feat: change a request in the same form you made it; venues get the office's rota with their shift logs" with the Co-Authored-By line, then `openkbs fn deploy api`.
4. Rebuild. Commit `site/app` as "build: site with shared rota and request editing", then `openkbs site deploy`.
5. Live probe on the 6ij75 URL: `cover.update` and `incidents.list` answer "Please sign in again", not "Unknown action". Use read-only psql to confirm the venue's cover rows are unchanged.
6. Create a board card with `openkbs board` and move it to Done with a business-language comment. Ask the user to try it as Waqas and Matthew (no demo logins):
   - change a booked date's day and type;
   - make a one-off repeat;
   - change several dates at once;
   - open a shift card.
