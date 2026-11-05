# Five ops fixes: "goes by" names, ejection log, shift confirmation, Orb reassign, past incidents

## Context
The user (running Opulence on this Orb copy) asked for five changes, specced surgically with every affected layer updated: DB → API → Orb AI → app → help/docs → tests.
- Item 4 is a live bug, shown in a screenshot. Orb was asked to swap Matty for Goddey on Friday's Banshee shift and produced a "Reassign" card. That card was really `shifts.assign`, which failed with "Shift is already fully staffed".

Deliverables:
1. A spec file `spec/spec-goes-by-names-ejection-log-shift-confirmation-orb-reassign-past-incidents.md`, in the house format (Context / Goals / Functional requirements / User stories / Acceptance criteria / Constraints / Out of scope).
2. The implementation below, as one migration (`028`) plus one commit per item.
3. Build, deploy (`openkbs fn deploy api`, app build + `openkbs site deploy`), and verify.

User decision: nicknames are a single **"Goes by"** field. The real name stays as it is everywhere.

Defaults I'll take for the unanswered questions (each easy to change):
- **Ban options:** all four (lengths, scope, reason categories, approval as today).
- **Past incidents:** officers can report for shifts in the last 30 days; managers can report for any date.

---

## 1. "Goes by" name
- **Migration `028`:**
  - `users.goes_by text NOT NULL DEFAULT ''`
  - `officers.goes_by text NOT NULL DEFAULT ''`
- **Write paths**, kept in step the same way names are:
  - `officers.mjs:15-18`: add `goes_by` to MANAGER_FIELDS and SELF_FIELDS, and mirror it to `users` in the sync block at `:142-145`.
  - `users.mjs:70,87-90`.
  - `auth.mjs:71-87` (`updateMe`).
  - `users.mjs:147-150` (`setWorksShifts` copies it).
  - `lib/auth.mjs:68,79`: SELECT it and include it in `publicUser`.
  - `orbCatalog.mjs:18`: add `goes_by?` to `officers.save`.
- **Edit UI:**
  - A "Goes by (optional)" input in `people/StaffProfile.jsx:147,170` and `people/_parts.jsx:102,129` (add officer).
  - The same input in `officer/Profile.jsx`, `layouts/AccountSheet.jsx:73-80` and `people/Settings.jsx:546` (UserSheet).
- **Display:**
  - New `withGoesBy(name, goesBy)` in `app/src/ui/format.js`, giving `Onyeka Goddey · "Goddey"`. It returns the plain name when the field is empty or the same as the first name.
  - Use it in the staff list and profile header, the rota assign picker (`Rota.jsx:538`), and the @mention dropdowns (`messages/Thread.jsx:688-696`, `everyday/_parts.jsx:101-120`, `NewMessage.jsx:24`).
  - Rota cards and Live stay compact with the real name. Mentions still insert the full name, so the server-side mention checks (`lib/chat.mjs:12`, `everyday.mjs:155`) don't change.
- **Search:**
  - `ops.mjs:731-736` `findOfficer`: add `OR goes_by ILIKE`.
  - `ops.mjs:783` `list_officers` returns it.
  - `assistant.mjs:232` `draft_message`.
  - `officers.mjs:96` `q`.
  - `rota.mjs:55`: the candidate includes `goes_by`.
  - People feeds `messages.mjs:157,375` and `everyday.mjs:31`.
  - Client filters in `Staff.jsx:32`, `Rota.jsx:538` and the mention boxes.
  - Voice word lists `orbVoice.mjs:30-36` and `messages.mjs:125`.
  - One line in the system prompt (`assistant.mjs:346`): "people may be called by their goes-by name".

## 2. Ejection log (default) with an optional ban
- **Model:** reuse `customer_bans`, so the shift log link, photos, approval and the purge job all keep working. Migration `028`:
  - `kind text NOT NULL DEFAULT 'ban' CHECK (kind IN ('ejection','ban'))`. Existing rows stay as bans.
  - `outcome text` (`ejected` | `refused_entry`).
  - `occurred_at timestamptz`, `shift_id uuid`, `incident_id uuid`.
  - `category text`. Values: violence, drugs, theft, intoxication, abusive, underage_id, other.
  - `scope text NOT NULL DEFAULT 'venue' CHECK (scope IN ('venue','client','all'))`.
  - `starts_on` becomes nullable. The CHECK becomes `kind='ejection' OR starts_on IS NOT NULL`.
  - Widen the `shift_log_entries.kind` CHECK to add `ejection`.
- **`bans.mjs`:**
  - `fields()`: for ejections, `reason`, `outcome` and `occurred_at` are required, and length and dates are not allowed.
  - **Recording:** `propose` and `create` default to `kind='ejection'`. An ejection is saved straight away as `status='active'` (it's a record, so no approval is needed). Its shift log entry has kind `ejection`.
  - **Adding a ban:** "Also ban" sets kind `ban` plus a length, start date, scope and category, and runs today's approval flow.
  - **Upgrade:** new action `bans.escalate`, which turns an existing ejection into a ban with its options.
  - **Filters:**
    - `activeBans()` matches `kind='ban'` and widens the venue match by scope: `venue` = same venue; `client` = any venue of the same client (`venues.client_id` or the existing grouping, checked during the build); `all` = any of the company's venues.
    - `lapseDue()` only applies to `kind='ban'`.
    - `bans.list` gets a `kind` filter.
    - Notifications and shift log text are reworded.
  - **Photos:** an ejection's photo is purged after 90 days, through the same `banJobs` path.
- **UI:**
  - `shift/_bans.jsx`: `BanSheet` becomes "Log ejection".
    - Fields: outcome (Ejected / Refused entry), time (defaults to now), category, description and photo, reason.
    - An **"Also ban this person"** switch reveals length (Tonight, 1 week, 1 month, 6 months, 12 months, pick date, permanent), start date and scope (This venue / All this client's venues / All our venues).
    - Cards get an ejection style and an "Upgrade to ban" button.
  - `ShiftView.jsx`:
    - The section becomes "Ejections & bans". The main button is "Log ejection". The KIND map adds `ejection`.
    - The sign-off warning still covers only proposed bans.
    - Allow "Make incident" from an ejection, pre-filling incident type `ejection` / `refused_entry`.
  - `shift/Bans.jsx`:
    - Retitle to "Ejection log". Tabs: Ejections (default) · Current bans · Ended · Lifted · All.
    - Fix the bug where venue users with several venues always get `venues.data[0]`: add a venue picker.
  - Labels to rename: `nav.js:89`, `VenueDetail.jsx:60`, `Rota.jsx:459`, and the `ShiftLogs.jsx:22` counts (adding "N ejections").
- **Orb and help:**
  - `orbCatalog.mjs:102-104`: descriptions, `kind` argument, and add `bans.escalate`.
  - `guide.mjs:222-224,305`.

## 3. Assigned vs confirmed on the rota
`shift_assignments.status` already tells them apart (`assigned` = not confirmed, `accepted` = confirmed), and `shiftsWithAssignments` already returns each officer's status. **No migration.**
- **`Rota.jsx:152-177` ShiftCard:**
  - **Pill colour:**
    - Short → red (grey if draft).
    - Full but anyone still `assigned` → amber `1/1 · Unconfirmed`.
    - Full and everyone `accepted` → green.
  - **Names:** each name gets a dot, amber for unconfirmed and green for confirmed.
  - **Side bar:** a 3px bar on the left, amber for unconfirmed.
- **Elsewhere on the rota:**
  - `OfficerChip` (`Rota.jsx:179-188`): green background when accepted, amber "Unconfirmed" when assigned.
  - Detail sheet: `Pill` labels (`ui/index.jsx:431-433`): `assigned` → amber "Unconfirmed", `accepted` → green "Confirmed". That also updates `_profileTabs.jsx:428-440`.
- **Dashboards:**
  - `dashboard.mjs:21-31` `upcomingShifts`: `team` becomes `{name, status}` objects.
  - `manager/Dashboard.jsx:128-130` and `money/VenueDashboard.jsx:99-103` show the same pill rule and coloured names.
- **Live:**
  - `clock.mjs:270-305`: add `a.status`.
  - `shared/Live.jsx`: an "Unconfirmed" pill on rows for officers who haven't started.
- **Wording fix:**
  - `manager/VenueCover.jsx:74,78`: "Officers confirmed" will count only `accepted`, with a separate figure for booked.
  - `Cover.jsx:56,99` stays as "staffed".
- **Status after a swap:** a manager reassign (item 4) gives the new officer `assigned`, so they show as unconfirmed until they accept.

## 4. Orb reassign bug
- **Root cause:**
  - Orb only has `shifts.assign`, which adds a person and checks headcount, and `shifts.unassign`.
  - The card label is free text the AI writes, so the card said "Reassign… from Matty" while the step only tried to add Goddey.
  - Nothing replaces one officer with another in one go.
- **New `shifts.reassign`** in `rota.mjs`, next to `shifts.assign`:
  - Inputs: `{shift_id, from_officer_id | assignment_id, officer_id, override?}`.
  - Inside one `tx`:
    1. Load the active assignment.
    2. Refuse if the old officer has clocked in (same check as `:265`).
    3. Run `checkOfficerForShift` for the new officer, honouring blocking errors and 409 override warnings like `:250-252`.
    4. Cancel the old row and upsert the new row as `assigned`, carrying over `is_lead`.
    5. No headcount check.
  - After it commits:
    - If the shift is published, notify the old officer "Removed from shift" and run `notifyAssigned` + `remindPack` for the new one.
    - `audit('shift.reassign')`.
- **Orb wiring:**
  - `orbCatalog.mjs`: add `shifts.reassign`, titled "Replace an officer on a shift", with a link to the shift.
  - Change the `shifts.assign` title to "Add an officer to an unfilled place on a shift".
  - `ops.mjs:746-754` `find_shifts` returns `{assignment_id, officer_id, name, goes_by, status}` per officer.
  - `assistant.mjs:346` system prompt: "To swap or replace someone use shifts.reassign; shifts.assign only fills empty places."
  - **Card label:**
    - `runAction` (`assistant.mjs:281-309`) builds the label for `shifts.reassign` from the data: "Banshee · Fri 6 Nov 20:00–03:30: Matty Southwell → Onyeka Goddey".
    - It refuses a `shifts.assign` on a full shift, with a hint to use reassign, so the AI corrects itself before the Confirm card appears.
- **Manager UI:** a "Replace" button next to each officer in the rota detail sheet (`Rota.jsx:492`). It opens the existing candidates picker and calls `shifts.reassign`.
- **Docs:** `app/API.md:111`.

## 5. Report a past incident
- **Server (`incidents.mjs`):**
  - **Officer create (`:133-141`):** keep the rule that the officer was assigned and the time is within ±2h of that shift. Add a check that the shift started within the last 30 days.
  - **`incidents.update` (`:171`):** re-check the same rule when an officer changes `occurred_at`.
  - **Manager create (`:142-145`):** validate that `shift_id` and `officer_id` belong to the venue. No age limit.
- **Officer app (`officer/IncidentForm.jsx`):**
  - Load `shifts.mine` from 30 days back instead of 3 (`:73`).
  - Replace the 6-shift cap (`:233`) with a "Show earlier shifts" list grouped by date.
  - The first step asks "When did it happen?": *Tonight / on this shift* or *Earlier: pick a shift*.
  - Picking a past shift sets the time to that shift's start, with the `datetime-local` limited to the shift ±2h.
  - Rewrite the message at `:230` to "last 30 days".
- **Manager report:**
  - Route `/company/incidents/new` in `main.jsx` (near `:140`), using the same `IncidentForm` in manager mode.
  - Manager mode adds pickers for venue, shift on that date (optional) and officer (optional), and allows any past time.
  - Add a "Report incident" button for company/security users in `shared/Incidents.jsx:33`.
- **Shift page:** "Report incident" in `ShiftView.jsx:142-145` also shows for ended shifts within 30 days.
- **Late reports are visible:**
  - **Label:** a report filed more than 24h after it happened shows "Reported N days later":
    - list card `Incidents.jsx:65`
    - detail `IncidentDetail.jsx:66-71`
    - PDF meta `incidents.mjs:250`
    - notification body `:163`
  - **Lists:** `incidents.list` gets `sort=reported`. The dashboard "recent incidents" (`dashboard.mjs:33-35`) sorts by `created_at`, so late reports aren't buried.
  - **AI context:** `incidentAi.mjs:93` `reportText` and the `aiDraft` context (`:184`) include "Reported: …".
- **Help:** `guide.mjs:150-153,331-333` and the Orb catalogue descriptions.

---

## Order of work
1. Write the spec file.
2. Migration `028_goes_by_ejections.sql`.
3. Item 4: the live bug.
4. Item 3.
5. Item 5.
6. Item 2.
7. Item 1.
8. `cd app && npm run build`.
9. `openkbs fn deploy api -s 'rate(5 minutes)'`, re-checking the bundle stays under ~4 MB.
10. `openkbs site deploy`.

## Verification
- **Tests:** extend `functions/api/test/orb.test.mjs`, `ops.test.mjs`, `chat.test.mjs` and `dualrole.test.mjs`, plus new tests for incidents and bans, then run `npm test` in `functions/api`. The 7 tests that already fail on @aws-sdk/client-s3 are a separate, known issue.
- **Live check** with agent-browser on the deployed app, using a test company created in this empty project:
  1. Create a 1-headcount shift and assign officer A. The card shows an amber "1/1 · Unconfirmed". After A accepts, it turns green.
  2. Ask Orb "change Friday's shift from A to B". The card reads "A → B", Confirm succeeds, and B shows as unconfirmed.
  3. Log an ejection with no ban: it appears in the Ejection log, not under "Banned here". Upgrade it to a ban with client scope: it appears at the client's other venue.
  4. The officer reports an incident for a shift 10 days ago: it is accepted and shows "Reported 10 days later". A shift 40 days ago is refused. A manager files one for any date.
  5. Set "Goes by" = "Goddey". The staff search, the @mention box and Orb ("assign Goddey…") all find them.
- Run `agent-browser close --all` after the browser checks.
