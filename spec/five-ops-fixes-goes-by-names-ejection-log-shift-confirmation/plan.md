# Implementation plan: goes-by names, ejection log, shift confirmation, Orb reassign, past incidents

The approved spec is in `spec/five-ops-fixes-goes-by-names-ejection-log-shift-confirmation.md`. This plan covers how to build it.
- Backend: `functions/api` (Node ESM; `def(roles, fn)` actions; `one`/`q`/`tx` from `lib/db.mjs`; migrations auto-run from `db/migrations/*.sql`).
- App: `app/src` (React + Vite, built into `site/app`).
- Commits: one per item, in the order below.

## 0. Migration: `functions/api/db/migrations/028_goes_by_ejections.sql`
```sql
ALTER TABLE users    ADD COLUMN IF NOT EXISTS goes_by text NOT NULL DEFAULT '';
ALTER TABLE officers ADD COLUMN IF NOT EXISTS goes_by text NOT NULL DEFAULT '';

ALTER TABLE customer_bans
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'ban' CHECK (kind IN ('ejection','ban')),
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('ejected','refused_entry')),
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'venue' CHECK (scope IN ('venue','client','all'));
ALTER TABLE customer_bans ALTER COLUMN starts_on DROP NOT NULL;
ALTER TABLE customer_bans ADD CONSTRAINT customer_bans_ban_dates CHECK (kind = 'ejection' OR starts_on IS NOT NULL);
-- widen shift log kinds (drop + re-add the 010 CHECK; look up its real name with \d first)
ALTER TABLE shift_log_entries DROP CONSTRAINT IF EXISTS shift_log_entries_kind_check;
ALTER TABLE shift_log_entries ADD CONSTRAINT shift_log_entries_kind_check CHECK (kind IN ('note','handover','incident','ban','ejection'));
CREATE INDEX IF NOT EXISTS customer_bans_kind ON customer_bans (venue_id, kind, status);
```
Existing rows become `kind='ban'`, `scope='venue'`. The existing `ends_on >= starts_on` CHECK still holds, because NULL passes it.

## 1. Item 4: Orb reassign (live bug)

**`functions/api/modules/rota.mjs`**: add `'shifts.reassign'` after `shifts.unassign` (around `:270`). Roles: `MGR`.
- **Inputs:** `shift_id`, `officer_id` (new), and either `assignment_id` or `from_officer_id`, plus `override?`.
- **Checks, reusing what `shifts.assign` does:**
  - `getShift` + `assertVenue`.
  - Refuse if the shift is cancelled.
  - Load the old active assignment (`status IN ('assigned','accepted')`). Otherwise `fail(404,'That officer is not on this shift')`.
  - Refuse if the old and new officer are the same.
  - Clock check as at `:265`.
  - `checkOfficerForShift`: blocking errors → 422; warnings without override → 409, same as `:251-252`.
- **One `tx`:**
  - Cancel the old row.
  - Upsert the new row with the same SQL as `:254-256`, setting `is_lead` from the old row.
  - No headcount check.
- **After the commit:**
  - If the shift is published:
    - Send the "Removed from shift" notify (same as `:267`) to the old officer.
    - `notifyAssigned(a, s)` + `remindPack(a.id)` for the new one.
  - `audit(user,'shift.reassign','shift',s.id,{from,to})`.
- **Returns** the new assignment.

**`functions/api/lib/orbCatalog.mjs:68-69`**:
- `shifts.assign` title becomes "Add an officer to an unfilled place on a shift".
- New `'shifts.reassign': c('rota','Replace an officer on a shift (swap one for another)','shift_id, from_officer_id or assignment_id, officer_id, override?', { link: (_r,b)=>`shifts/${b.shift_id}` })`.

**`functions/api/modules/ops.mjs:753-754`** (`find_shifts`): officers become `{ assignment_id: a.id, officer_id: a.officer_id, name: a.name, goes_by: a.goes_by, status: a.status }`.

**`functions/api/modules/assistant.mjs` `runAction` (`:286-309`)**, before the step is pushed to the card:
- If `name === 'shifts.assign'` and the shift is full (`getShift` + `filledCount`, exported from rota.mjs), return `{ error: 'That shift is full. To swap someone, use shifts.reassign with from_officer_id.' }`. The model then corrects itself, and no failing line reaches the card.
- If `name === 'shifts.reassign'`, build the label from the data: venue, `fmtDate`/times, `old name → new name`. The model's `detail` is not used.

**System prompt** (`assistant.mjs:349`, the "How you work" list): one bullet: "To swap or replace someone on a shift, use shifts.reassign. shifts.assign only fills empty places. People may be called by their goes-by name."

**`app/src/pages/manager/Rota.jsx` detail sheet (`:480-500`)**:
- A "Replace" button on each active assignment row.
- It opens the existing candidates picker (`shifts.candidates`) in replace mode, which calls `shifts.reassign({ shift_id, assignment_id, officer_id })`.
- On a 409 it reuses the existing override confirm.

**Docs:** add `shifts.reassign` to `app/API.md:~112`.

## 2. Item 3: Unconfirmed vs confirmed
Data already exists: `assigned` = unconfirmed, `accepted` = confirmed.
- **`app/src/pages/manager/Rota.jsx`:**
  - Add `const confirmState = (s) => …` returning `'short' | 'unconfirmed' | 'confirmed'`. The check: is `filled < headcount`, or is any ACTIVE assignment `assigned`?
  - **ShiftCard `:165`:**
    - Pill tone: red or grey (draft) when short.
    - Amber with text `{filled}/{headcount} · Unconfirmed` when full but anyone still `assigned`.
    - Green when every active assignment is `accepted`.
    - The left bar (`:160`) is amber when unconfirmed.
  - **Names line `:155,174`:** each name gets a 6px dot, amber or green, rendered as spans instead of `join`.
  - **OfficerChip `:182-185`:** `accepted` → `bg-green-soft`; `assigned` → `bg-amber-soft` plus the text "Unconfirmed".
  - **Detail sheet pill `:492`:** use the new `AssignPill`.
- **`app/src/ui/index.jsx`:**
  - Add an exported `AssignPill({status})`: `assigned` → amber "Unconfirmed", `accepted` → green "Confirmed", anything else → `<Pill status>`.
  - Leave the global `STATUS_TONE` alone, so other pages don't change.
  - Use `AssignPill` in `pages/people/_profileTabs.jsx:~436`.
- **`functions/api/modules/dashboard.mjs:21-31`** (`upcomingShifts`): `team` becomes `json_agg(json_build_object('name', …, 'status', a.status))`.
  - Update `manager/Dashboard.jsx:128-130` and `money/VenueDashboard.jsx:99-103` to read `t.name`, with a dot coloured by `t.status`, and the same pill rule.
  - Check other `upcomingShifts.team` consumers with grep.
- **`functions/api/modules/clock.mjs:~275`** (`live.board`): select `a.status AS assignment_status`. `shared/Live.jsx:~93` shows an amber "Unconfirmed" pill for rows that haven't clocked in and have `assigned` status.
- **`manager/VenueCover.jsx:74,78`:** the label becomes "Booked {filled} of {headcount} · {confirmed} confirmed". The server side (`cover.mjs` / wherever `filled` is computed for that page) adds a `confirmed` count of `accepted` assignments.

## 3. Item 5: Past incidents
**`functions/api/modules/incidents.mjs`:**
- New constant `OFFICER_BACKDATE_DAYS = 30`.
- **Officer branch (`:133-141`):** add `AND s.starts_at > now() - interval '30 days'` to the assignment query. The error becomes "You can only report incidents for a shift you worked in the last 30 days. Ask the office for anything older."
- **Manager branch (`:142-145`):**
  - If `shift_id` is given, it must belong to `venue_id`. Use the shift's venue.
  - If `officer_id` is given, it must be assigned to that shift (when given) or exist.
- **`incidents.update`:** when an officer changes `occurred_at`, re-run the same ±2h / 30-day check against `cur.shift_id`.
- **Late filing:** add helper `lateDays(inc)` = whole days between `occurred_at` and `created_at` when more than 24h apart.
  - Notification body appends ` · reported N days later`. Skip the urgent venue alert when the incident is more than 7 days old.
  - PDF meta (`:250`) gets a "Reported" line.
- **`incidents.list` (`:98-100`):** `sort=reported` → `ORDER BY i.created_at DESC`.

**`functions/api/modules/dashboard.mjs:33-35`:** `recentIncidents` orders by `created_at DESC`.

**`functions/api/modules/incidentAi.mjs:93`** (`reportText`) and the `aiDraft` context (`:184`): add a `Reported: fmtDateTime(created_at)` line.

**`app/src/pages/officer/IncidentForm.jsx`:**
- `shifts.mine` uses `from: addDays(today,-30)` (`:73`).
- New first choice: "When did it happen?" (Segmented):
  - **This shift / just now:** keeps the current auto-pick.
  - **Earlier:** a list of past shifts grouped by date, with a "Show more" button replacing the cap of 6 at `:233`.
- Picking a past shift sets `occurred_at` to that shift's start. The `datetime-local` gets `min`/`max` = the shift ±2h (capped at now).
- Rewrite the copy at `:230`.
- The review step shows "Reported later" when the time is more than 24h ago.
- **Manager mode** (`mode="manager"` prop, when `user.role !== 'officer'`):
  - A venue picker (`venues.list`).
  - An optional shift on that date (`shifts.list` for the venue and date).
  - An optional officer (from that shift's assignments, or `officers.list`).
  - No time limit other than not in the future.
  - It sends `venue_id`, `shift_id` and `officer_id`.

**Routes:** `app/src/main.jsx` adds `company/incidents/new` and `security/incidents/new` → `IncidentForm`. `shared/Incidents.jsx:33` shows a "Report incident" button to company and security users.

**Labels:**
- `shared/Incidents.jsx:65` and `IncidentDetail.jsx:66-71` show an amber "Reported N days later" pill.
- `shift/ShiftView.jsx:142-145` also shows "Report incident" for shifts that ended within 30 days.

## 4. Item 2: Ejection log + optional ban
**`functions/api/modules/bans.mjs`:**
- **Constants:**
  - `CATEGORIES = ['violence','drugs','theft','intoxication','abusive','underage_id','other']`
  - `OUTCOMES = ['ejected','refused_entry']`
  - `SCOPES = ['venue','client','all']`
- **`fields(b, today)`**, split by `kind = b.ban ? 'ban' : 'ejection'`:
  - Shared: reason, name or description, category (optional, validated), plus `outcome` and `occurred_at`. Both are required for an ejection; for a ban they are optional and carried over from the ejection.
  - Ban only: today's start/end/permanent logic plus `scope`.
  - An ejection returns `starts_on: null, ends_on: null`.
- **`bans.propose`** (shift page):
  - The INSERT gains `kind, outcome, occurred_at, shift_id, category, scope`.
  - An ejection is always `status='active'` (a record, not something to approve).
  - A ban keeps today's direct/proposed rule.
  - The shift log entry kind is `'ejection'` or `'ban'`, with body text for each ("Ejected: …" / "Refused entry: …").
  - Notify only on a proposed ban, as today.
- **`bans.create`** (office/venue): the same new columns.
  - An ejection notifies no one.
  - A ban keeps the "New ban" notify.
- **New `bans.escalate`** (roles: officer, company, security, venue):
  - Load the ejection.
  - Officers must have `shiftAccess(...).canWrite` on its `shift_id`, or be a lead.
  - Set `kind='ban'` with ban `fields` (length, scope, category).
  - Status `active` if the person is a manager/venue/lead, else `proposed` with the same notify as propose.
  - Audit `ban.escalate`.
- **`activeBans(venueId)`:**
  - Add `b.kind = 'ban'`.
  - The venue match becomes `(b.venue_id = $1 OR (b.scope = 'client' AND bv.client_id IS NOT NULL AND bv.client_id = (SELECT client_id FROM venues WHERE id = $1)) OR b.scope = 'all')`.
  - Join `venues bv` for the ban's own venue. The returned row includes `venue_name`, so cards say "Banned at Bar 50 (all of this client's venues)".
- **`bans.list`:**
  - New `kind` filter (`ejection` | `ban` | all).
  - The `current` filter applies to `kind='ban'` only.
  - The officer venue check (`officerVenues`) is unchanged.
  - Bans with `scope` `client` or `all` also appear in the register of the other venues they cover. Use the same OR in the list query when `venue_id` is given.
- **Housekeeping:**
  - `lapseDue()`: add `AND kind = 'ban'`.
  - `banJobs()`: also set `photo_purge_after = created_at + 90 days` for ejections that have a photo and no purge date.
- **Escalated ejections:** `bans.update` keeps working for both kinds. An ejection stays an ejection unless escalated.

**`functions/api/modules/shiftlog.mjs`:**
- `KINDS` (`:15`) adds `'ejection'`.
- The `shiftlog.list` counts (`:221`) add `ejections`.
- `shifts.detail` (`:108`) also returns `ejections` for that shift: `kind='ejection' AND shift_id = $1`.

**`app/src/pages/shift/_bans.jsx`:**
- `BanSheet` becomes "Log ejection" (title "Log ejection", or "Edit"):
  1. Outcome Segmented (Ejected / Refused entry).
  2. Time (`datetime-local`, default now).
  3. Category chips.
  4. Photo, name, description, reason (as today).
  5. A Switch, "Also ban this person", which reveals:
     - Starts.
     - Length. `LENGTHS` adds 1 week (7) and 12 months (365).
     - Scope Segmented (This venue / All this client's venues / All our venues).
- Body: `{ ban: bool, outcome, occurred_at, category, scope, ... }`.
- Escalate mode (prop `escalate={ejection}`) opens with the ban section only and calls `bans.escalate`.
- `BanCard` shows the ejection style: an outcome pill, time, and an "Upgrade to ban" button for staff.
- Scope label on ban cards.

**`app/src/pages/shift/ShiftView.jsx`:**
- The section (`:76-95`) becomes "Ejections & bans". It lists tonight's ejections, then the "Banned here" bans.
- Primary button "Log ejection".
- `KIND` map (`:23-28`) adds `ejection`.
- "Make incident" is allowed for ejection entries (`:326`). It pre-fills incident `type` from the outcome and passes `log_entry_id`.
- Sign-off warning (`:352`) unchanged (proposed bans only).

**`app/src/pages/shift/Bans.jsx`:**
- Title "Ejection log".
- Tabs: Ejections (default) · Current bans · Ended · Lifted · All.
- The add button opens `BanSheet` with `venueId`.
- Venue users with several venues get a venue Select instead of `venues.data[0]`.

**Labels:**
- `layouts/nav.js:89` → "Ejection log".
- `money/VenueDetail.jsx:60` tab → "Ejections & bans".
- `manager/Rota.jsx:459` → "Shift page, log and ejections".
- `shift/ShiftLogs.jsx:22` adds "N ejections".

**Orb + help:**
- `orbCatalog.mjs:102-104`:
  - `bans.list` args become `venue_id?, kind? (ejection|ban), status?`.
  - Add `bans.escalate` (confirm).
- `lib/guide.mjs:222-224,305`: describe the ejection log and the ban options.

## 5. Item 1: "Goes by"
**Backend writes:**
- `officers.mjs:15-18`: add `goes_by` to `MANAGER_FIELDS` and `SELF_FIELDS`. The sync block (`:142-145`) also writes `users.goes_by` when it changes.
- `users.mjs:70`: `pick` gets `goes_by`. Mirror it to officers at `:87-90`. `setWorksShifts` (`:147-150`) copies it.
- `auth.mjs:71-87` (`updateMe`): accept `goes_by` (trimmed, max 40) and write it to both tables.
- `lib/auth.mjs:68,79`: select `goes_by` and return it from `publicUser`.
- `lib/orbCatalog.mjs:18`: `officers.save` args gain `goes_by?`.

**Search:**
- `ops.mjs` `findOfficer` (`:731`): `OR goes_by ILIKE $2`.
- `list_officers` (`:783`) returns `goes_by`.
- `officers.mjs:96` `q`: concatenate `o.goes_by` into the searched text.
- `assistant.mjs:232` (`draft_message`): `OR u.goes_by ILIKE`.
- `rota.mjs:55` (`checkOfficerForShift` officer object) adds `goes_by`.
- `shiftsWithAssignments` (`:66-95`) adds `o.goes_by` to each assignment.
- People feeds: `messages.mjs:157,375` and `everyday.mjs:31` (PERSON json) add `goes_by`.
- Voice word lists: `orbVoice.mjs:30-36` and `messages.mjs:125` add non-empty `goes_by`.

**App:**
- `app/src/ui/format.js`: `export const withGoesBy = (name, gb) => gb && !name.toLowerCase().includes(gb.toLowerCase()) ? `${name} · “${gb}”` : name;`
  - Because of the `includes` check, "Onyeka Goddey" + "Goddey" displays as just the name. The field still makes them searchable.
- Inputs, labelled "Goes by (optional)" with placeholder "e.g. Goddey":
  - `people/StaffProfile.jsx:147,170` (`EDIT_KEYS` + input)
  - `people/_parts.jsx:102,129`
  - `officer/Profile.jsx`
  - `layouts/AccountSheet.jsx:73-80`
  - `people/Settings.jsx:546`
- Display + filter:
  - `people/Staff.jsx:32` (filter + `withGoesBy` in the row).
  - StaffProfile header.
  - Rota candidates picker (`Rota.jsx:538`, filter + label).
  - Mention boxes: `messages/Thread.jsx:688-696`, `everyday/_parts.jsx:101-120`, `messages/NewMessage.jsx:24`. Filter on `goes_by` too and show the label, but still insert `@full name`.

## 6. Spec copy
The spec is already saved at `spec/five-ops-fixes-goes-by-names-ejection-log-shift-confirmation.md`. Don't write it again.

## Build & deploy
1. Run `cd functions/api && npm test`. The 7 tests that already fail on `@aws-sdk/client-s3` are expected.
2. `cd app && npm run build` (ui-lint + vite → `site/app`).
3. Commit each item: `fix: Orb can swap an officer on a full shift`, `feat: unconfirmed shifts show amber on the rota`, `feat: report past incidents`, `feat: ejection log with optional ban`, `feat: goes-by names`, and `build: rebuild app bundle`.
4. `openkbs fn deploy api -s 'rate(5 minutes)'`. Check the zip stays under ~4 MB; node_modules are already pruned.
5. `openkbs site deploy`. Migration 028 runs on the first API call or scheduled run. Confirm with `openkbs fn logs api`.

## Tests to add (`functions/api/test`, `node --test`, same style as `orb.test.mjs` / `ops.test.mjs`)
- `orb.test.mjs`:
  - The catalogue includes `shifts.reassign`.
  - `runAction` refuses `shifts.assign` on a full shift with the reassign hint.
  - The reassign label is built from the data.
- `ops.test.mjs`: `find_shifts` returns `assignment_id`/`status`.
- New `bans.test.mjs` (pure parts): `fields()` for ejection vs ban (an ejection needs no dates; a ban needs a length) and the scope SQL builder. Export `fields` for the test.
- New `incidents.test.mjs`: `lateDays()` and the 30-day rule helper. Export them.
- `dualrole.test.mjs`: `goes_by` syncs from users to officers.

## End-to-end check (agent-browser on https://dtsh89leafq7z.cloudfront.net/app, in a throwaway test company set up in this empty project, then removed or left clearly named)
1. Create a 1-headcount published shift and assign A. The card shows an amber "1/1 · Unconfirmed". After A accepts in the officer view, it turns green.
2. Ask Orb "change that shift from A to B". The card reads "A → B". Confirm: B is on the shift and unconfirmed, A is removed.
3. As an officer, log an ejection with no ban: it appears in the Ejection log and not under "Banned here". Upgrade it to a ban with client scope: it shows at the client's other venue.
4. As an officer, report an incident on a shift 10 days ago: accepted, and it shows "Reported 10 days later". 40 days ago is refused. As a manager, report one at any date.
5. Set Goes by "Goddey": the staff search, the @mention box and Orb ("who is Goddey working with Friday") all find them.
6. Run `agent-browser close --all`.
