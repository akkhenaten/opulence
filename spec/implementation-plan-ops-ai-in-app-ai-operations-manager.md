# Implementation plan — Ops AI (in-app AI operations manager)

## Context
The user wants an AI operations manager inside Orb Security. It should:
- chase officers who haven't clocked in
- keep a record of lates and absences
- collect feedback from venues
- check hours against pay statements and invoices
- find cover from off-duty staff
- turn venue requests into rota changes

They approved the spec as written ("Build Ops AI as written in the spec").

**The rule:** the AI prepares, a manager taps Approve. Reminders to officers and feedback requests to venues go out without approval.

**Out of v1:**
- phone calls, SMS, and a venue email inbox
- an officer chat
- automatic rota changes

**Defaults:**
- chasing: in-app notification to the officer, plus the existing email to managers
- cover: a ranked shortlist, offered as a batch, first to accept gets the shift
- venues: a request chat in the venue portal, plus a feedback prompt after each shift

**What already exists to build on** (all paths are in `functions/api` unless shown otherwise):

*Routing and database*
- Routing (`index.mjs`): modules export `actions = { 'ns.verb': def(roles, fn) }`. Role groups `ALL`, `MGR` and `CO` are in `modules/_def.mjs`.
- Jobs: on a schedule event, `index.mjs` runs `migrate()` and then `runJobs()` from `modules/jobs.mjs`. The schedule is currently `rate(10 minutes)`.
- Migrations: SQL files in `db/migrations/NNN_*.sql`, applied once each by `migrate()` in `lib/db.mjs`. The only one so far is `001_init.sql`.
- DB helpers in `lib/db.mjs`: `q`, `one`, `tx`, `insert`, `update`.

*Notifications*
- `lib/notify.mjs` has `notify(userIds, {kind,title,body,link,severity,dedupe,email})`.
- It also has the recipient helpers `managersFor(venueId)`, `companyManagers()`, `securityFor()`, `venueContacts()` and `officerUser()`.
- There is no web push. Officers get in-app notifications (the bell polls every 30 s) and email.

*Existing jobs and clock logic*
- `jobs.mjs` `lateAlerts` already flags late officers once, at grace time, and notifies managers and the officer. `grace_minutes` is in `settings`.
- `clock.mjs` `buildTimesheet` sets the timesheet flags `late`, `left_early` and `no_clock_out`.
- The live board in `clock.mjs` works out `late`, `no_show` and `left_early`.

*Rota*
- `rota.mjs` `checkOfficerForShift(officerId, shift)` returns `{blocking, warnings}`. It covers licence and compliance, bans, clashes, time off, availability, role and the weekly hours cap.
- These actions in `rota.mjs` can be reused by calling `actions[x].fn(body, { user })` with the approving manager as the user: `shifts.save`, `shifts.publish`, `shifts.cancel`, `shifts.assign`, `shifts.respond`.
- `londonToUtc` is exported from `rota.mjs`.

*Money*
- `money.mjs`: `pay.generate`, `invoices.generate`, `invoices.updateLine`, `pay.addLine` and `pay.removeLine`, plus `recalcStatement` and `recalcInvoice`.
- `timesheets.mjs` has `timesheets.edit`.

*AI and data*
- No AI is used anywhere yet. The proxy offers `claude-sonnet-5` and `claude-haiku-4-5-20251001`, at `https://proxy.openkbs.com/v1/anthropic/v1/messages` with `Authorization: Bearer OPENKBS_API_KEY`.
- Officers have no map coordinates, only a postcode.

*Frontend*
- Nav in `app/src/layouts/nav.js`; routes in `app/src/main.jsx`.
- `api()` in `app/src/api.js`; `useApi` and `useAction` in `app/src/ui/index.jsx`.
- Profile tabs: `app/src/pages/people/StaffProfile.jsx` together with `_profileTabs.jsx`.
- Officer pages `Home.jsx` and `Shifts.jsx`; venue dashboard `money/VenueDashboard.jsx`.
- Seed: `scripts/seed.mjs`. Tests: `functions/api/test/*.test.mjs` using `node --test`.

## Backend

### 1. Migration `db/migrations/002_ops_ai.sql`
**New settings columns**
- `ops_jobs jsonb`, default `{"chase":true,"cover":true,"feedback":true,"venue_requests":true,"reconcile":true,"chat":true}`
- `ops_escalate_minutes int 10`, `ops_offer_wait_minutes int 30`, `ops_reconcile_dow int 1` (Monday)
- `ops_ai_cap_credits int` (default set from the price list, about the cost of a few hundred chats)
- `ops_ai_used numeric 0`, `ops_ai_month text`

**New `shift_assignments` columns**
- `chased_at`, `reply` (`on_my_way` or `cant_make_it`), `reply_eta_min`, `reply_reason`, `replied_at`, `escalated_at`

**New tables**
- **`attendance_events`**:
  - columns: `officer_id`, `assignment_id`, `kind` (`late`, `no_show`, `left_early`, `cant_make_it`), `minutes`, `reason`, `notified`, `excused`, `note`, `created_at`
  - unique on `(assignment_id, kind)`
- **`venue_feedback`**:
  - columns: `shift_id`, `venue_id`, `officer_id`, `rating` (1–5), `note`, `requested_at`, `reminded_at`, `answered_at`, `answered_by`
  - unique on `(shift_id, officer_id)`
- **`ops_items`** (the inbox):
  - `kind`: `cover`, `venue_request`, `reconcile` or `feedback`
  - `status`: `pending`, `approved`, `rejected`, `done` or `expired`
  - `title`, `reason`, `payload jsonb`, `venue_id`, `shift_id`, `officer_id`
  - `dedupe` (unique), `decided_by`, `decided_at`, `result jsonb`, `created_at`
- **`cover_offers`**:
  - columns: `item_id`, `shift_id`, `officer_id`, `batch`, `status`, `offered_at`, `responded_at`
  - `status` is one of `offered`, `accepted`, `declined`, `filled_by_other` or `expired`
- **`venue_requests`**: `venue_id`, `user_id`, `text`, `parsed jsonb`, `status` (`requested`, `confirmed`, `declined`), `decline_reason`, `item_id`, `created_at`
- **`ops_activity`**: `kind`, `text`, `ref_type`, `ref_id`, `venue_id`, `credits`, `created_at`. This is the audit trail of what the AI did.

### 2. `lib/ai.mjs` — AI calls through the proxy
- **No SDK; it calls the API with `fetch`.** This keeps the bundle small.
  - `claude({ model, system, messages, tools, max_tokens })` sends the request and returns the Anthropic response.
  - Before each call it checks the monthly cap. When `ops_ai_month` changes it resets `ops_ai_used`.
  - Credits are calculated from `usage` and the prices on `/v1/models` (fetched once and cached), then added to `ops_ai_used`.
  - When the cap is reached it throws HttpError 429, "Ops AI paused: monthly credit cap reached", and notifies company managers once per month (dedupe `aicap:YYYY-MM`).
- **Models:**
  - `claude-sonnet-5` for manager chat.
  - `claude-haiku-4-5-20251001` for reading venue requests and summarising feedback.
- **Pure functions** `creditsFor(usage, price)` and `monthKey()` are exported so they can be unit-tested.

### 3. `modules/ops.mjs` — core logic, actions and jobs
**Helpers**
- `logActivity(kind, text, ref)`
- `createItem({kind, title, reason, payload, dedupe, venue_id, shift_id, officer_id})`. It uses `ON CONFLICT (dedupe) DO NOTHING` and notifies `managersFor(venue)` with kind `ops`, linking to `/…/ops`.
- `reliability(officerId)`: worked on time ÷ shifts assigned over 90 days, ignoring excused events.

**`rankCover(shift, exclude)`**
1. Pre-filter in SQL to active officers with no overlapping active shift.
2. Run `checkOfficerForShift` for each and drop anyone with `blocking` issues.
3. Score the rest. Weights:
   - reliability, ×0.5
   - shifts at this venue in the last 180 days, ×0.3, capped
   - postcode area (outward code) matches the venue's, ×0.2. This stands in for distance because officers have no coordinates.
   - a warning (for example near the hours cap) lowers the score
4. Return the top officers with a one-line reason each. The scoring function is pure and unit-tested.

**`proposeCover(shift, cause)`**
- Creates a `cover` item with payload `{shift_id, officer_ids: top 3, candidates: top 8 with reasons}`.
- Dedupe is `cover:<shift>:<batch>`.

**Actions**

*Managers (MGR). Security managers only see their own venues, using the same scoping as `securityFor`.*
- `ops.inbox`, `ops.count` (for the nav badge), `ops.activity`
- `ops.decide({id, decision, edits, reason})`:
  - **cover:** creates a batch of `cover_offers` for the chosen officers and notifies them (in-app and email, linking to `/officer/shifts?tab=offers`). The item status becomes `approved`.
  - **venue_request:**
    - New shifts are inserted through `rota.actions['shifts.save']` and then published with `shifts.publish`.
    - A change uses `shifts.save`; a cancellation uses `shifts.cancel`.
    - The venue request is marked confirmed and the venue is notified.
    - A cover proposal follows for each new shift.
    - If rejected: the request is marked declined, the reason is saved, and the venue is notified.
  - **reconcile:** applies the suggested fix with the manager as the user.
    - A timesheet that isn't locked is fixed with `timesheets.edit`.
    - A line on a draft statement or invoice is set to the timesheet hours with `invoices.updateLine`, or with `pay.removeLine` then `pay.addLine`, and then recalculated.
    - If the statement or invoice has already been issued, the card is information only. The manager marks it reviewed, and it links to the invoice so they can issue a credit note themselves.
  - **feedback:** marks the item reviewed. An optional "add to HR notes" inserts an `hr_notes` row.
  - Every decision goes into `audit` and `ops_activity`.
- `ops.chat({messages})`: see section 4.
- `ops.runNow`: runs the ops jobs on demand. This is for the demo and for testing.
- `attendance.list({officer_id})`: events, 30- and 90-day counts, reliability %, and venue ratings.
- `attendance.update({id, excused, note})`

*Company only (CO)*
- `ops.settings.get` and `ops.settings.save`. The new fields are also added to `FIELDS` in `settings.mjs`.

*Officers*
- `ops.reply({assignment_id, reply, eta_min, reason})`:
  - Saves the reply.
  - "Can't make it" records a `cant_make_it` event and triggers escalation straight away.
- `ops.myOffers`
- `ops.offerRespond({offer_id, accept})`. Accepting runs in one `tx`:
  1. Lock the shift (`FOR UPDATE`).
  2. Check `filled < headcount` and that `checkOfficerForShift` has no blocking issues. If either fails, return 409 "Already filled" or "No longer eligible".
  3. Upsert the assignment with status `accepted` and mark the offer accepted.
  4. If the shift is now full, set the other offers to `filled_by_other` and notify those officers.
  5. Notify managers.

*Venues*
- `venueRequests.create({text, history})`:
  - Haiku reads the text using a tool schema `{intent: new|change|cancel|unclear, question, shifts:[{date,start,end,role,headcount,notes,shift_id?}]}`.
  - It is given the venue's upcoming shifts and the role list, so it can match a change or cancellation to an existing shift.
  - If the request is `unclear`, it returns the question to ask back. Otherwise it saves a `venue_requests` row and a `venue_request` item, and replies "Request sent to Orb, we'll confirm".
  - The result is validated on the server: dates must be in the future, start and end must be HH:MM, headcount 1–20, and the role must exist.
- `venueRequests.list`
- `feedback.pending`
- `feedback.submit({shift_id, ratings:[{officer_id, rating, note}]})`

**Jobs, `runOpsJobs(s)`.** These are called from `runJobs`, each in its own try/catch, and each can be switched off in `ops_jobs`.
1. **chase:** extends `lateAlerts`.
   - The officer's message becomes "You haven't clocked in at X — tap to reply". It links to `/officer` (the Home banner), and `chased_at` is set.
   - The manager email stays as it is now.
2. **escalate:** for assignments that were chased, still have no clock-in, and haven't been escalated. Any of these conditions triggers it:
   - no reply and now is past start + grace + `ops_escalate_minutes`
   - the reply was "can't make it"
   - the reply was "on my way" and now is past `replied_at` + ETA + 5 minutes
   What it does:
   - sets `escalated_at`
   - sends managers a critical notification with email
   - calls `proposeCover(shift, 'no-show')`
3. **attendance:**
   - Insert `no_show` for active assignments on shifts that have ended with no clock-in.
   - Insert `late` (with minutes) and `left_early` from the flags on timesheets updated since the last run.
   - `notified` means the officer replied, or the absence was a "can't make it".
4. **coverScan:** finds published shifts starting within 72 hours that are short of officers and have no open `cover` item, and runs `proposeCover`.
5. **offerExpiry:**
   - Targets approved cover items on shifts that are still short and still in the future.
   - Applies when the latest batch is older than `ops_offer_wait_minutes`.
   - Those offers expire, and the AI proposes the next batch, leaving out officers who were already offered the shift.
   - Once the shift fills, the item becomes `done`.
6. **feedback:**
   - For published shifts that ended within the last 48 hours, create `venue_feedback` rows for each officer who worked, and notify the venue contacts.
   - After 24 hours with no answer, send one reminder with email.
   - A rating of 2 or less, or a problem in the note, creates a `feedback` item. Haiku labels the note as a problem or not.
7. **reconcile:**
   - Runs weekly on `ops_reconcile_dow` (dedupe on the ISO week) for the previous week.
   - Also runs at the end of `pay.generate` and `invoices.generate` (wrapped in try/catch so it never blocks them).
   - A pure function `reconcileRow({rota_h, clock_h, ts_h, stmt_h, inv_h, min_hours, rounding})` returns any mismatches and a suggested fix.
   - It flags differences over 0.25 h between clocked hours (after rounding) and the timesheet, the statement and the invoice. The invoice is compared after `min_hours` is applied.
   - Rota hours are shown for context only.
   - Dedupe is `reconcile:<timesheet>:<figures hash>`.

- **Schedule:** change to `rate(5 minutes)` in `openkbs.json` and in the deploy flag, so chasing and escalation are timely.

### 4. Manager chat (`ops.chat`)
- **Model:** Claude Sonnet 5, with a system prompt about the role, today's date in London, the rule "never change anything — use propose_change", and short British business English.
- **History:** kept on the client, last 20 turns.
- **Read-only tools.** Each reuses existing queries and respects the user's venue scope:
  - `find_shifts({from, to, venue, unfilled_only})`, via `shiftsWithAssignments`
  - `cover_candidates({shift_id})`, via `rankCover`
  - `officer_attendance({officer, from, to})`
  - `officer_hours({officer, from, to})`
  - `list_officers`, `list_venues`
- **One write tool:** `propose_change({kind: 'cover'|'rota', ...})`. It only creates an inbox card (`cover` via `proposeCover`; `rota` as a `venue_request`-style card marked as from a manager) and the reply links to it.
- **Limits:** at most 6 tool rounds. The function timeout goes up to 60 s (`openkbs.json` and `-t 60`).

## Frontend (`app/src`)
**Nav and badge**
- In `layouts/nav.js`, add "Ops AI" (lucide `Sparkles`) to the company and security navs, near the top, with `badge: 'ops'`.
- `Shell.jsx` polls `ops.count` every 30 s for manager roles and shows the badge in the sidebar item and the More sheet.
- Venues get a "Requests" item (lucide `MessageSquarePlus`).

**`pages/manager/OpsAI.jsx`**, route `ops` in the shared `managerRoutes` in `main.jsx`. It has four tabs.
- **Inbox:**
  - One card per item: a coloured kind pill, title, the AI's reason, and Approve / Edit / Reject buttons.
  - **Cover:** Edit opens a Sheet with a checklist of candidates, showing each one's reason and reliability.
  - **Venue request:** an editable list of draft shifts (date, start, end, role, headcount), plus the venue's original message.
  - **Reconcile:** a small table of figures (rota, clock, timesheet, statement, invoice), with the mismatched cells in red and the suggested fix.
  - **Feedback:** the rating and the note.
- **Activity:** a dated list from `ops.activity`.
- **Chat:** a message list and input. Example prompts are shown as chips: "Unfilled shifts next week", "Who can cover Saturday?", "Marcus's lates this month". Links to inbox cards are rendered as buttons.
- **Settings (company only):** job toggles, escalation minutes, offer wait, reconcile day, and the monthly credit cap with used/cap shown in credits.
- The page uses the existing `Page`, `Tabs`, `Tile`, `Pill`, `Sheet` and `Segmented` components, with the bento white/blue/grey look. It is built mobile-first, with the same care as the Rota fix.

**Officer app**
- `officer/Home.jsx`:
  - A red banner when the officer has been chased and hasn't replied. "On my way" opens an ETA picker (5, 10, 15 or 30 minutes); "Can't make it" asks for a reason. It uses `dashboard.get`, extended with `chase`.
  - A "Cover offers" card with Accept / Decline.
- `officer/Shifts.jsx`: an "Offers" tab (`?tab=offers`).

**Venue portal**
- `pages/venue/Requests.jsx`: a chat to request staff. It shows the AI's replies or clarifying questions, and a list of requests with their status (Requested, Confirmed or Declined).
- `money/VenueDashboard.jsx`: a "Rate last night's officers" tile (1–5 stars per officer, optional note), backed by `feedback.pending` and `feedback.submit`.

**Staff profile**
- An "Attendance" tab (`AttendanceTab` in `people/_profileTabs.jsx`):
  - 30- and 90-day counts and reliability %
  - an event list where managers can excuse an event or add a note
  - venue ratings
- Registered in `StaffProfile.jsx`.

## Demo data and tests
**`scripts/seed-ops.mjs`** runs once against the live database using the same `call()` approach as `seed.mjs`. It adds:
- a published shift that started 15 minutes ago, assigned to Aisha, with no clock-in, so the AI chases her
- a deliberate hours mismatch on Marcus's draft statement line
- pending venue feedback for last week's shifts

It then runs `ops.runNow`.

**`functions/api/test/ops.test.mjs`** covers `rankCover` scoring, `reconcileRow`, `creditsFor` and `monthKey`, and validation of parsed venue requests.

## Deploy
1. `cd functions/api && npm test`
2. `cd app && npm run build`
3. Commit: `feat: Ops AI operations manager`, with bullet points and Co-Authored-By.
4. `openkbs fn deploy api --schedule "rate(5 minutes)" -t 60`. Check the zip is under about 4 MB; no new dependencies are added.
5. `openkbs site deploy`
6. Run `seed-ops.mjs` with `DATABASE_URL` exported from the project root, without printing it.

## Verification (agent-browser, live site)
1. **Officer chase:** as Aisha (`/tmp/login.sh officer_aisha`), the chase banner shows. Reply "Can't make it". Then as company, `ops.runNow` produces an escalation notification and a Cover card in the inbox.
2. **Cover:** approve the card. As another offered officer, accept in Offers. The Rota shows the officer assigned and the card is Done. A second officer accepting gets "Already filled".
3. **Venue request:** as venue, type "Need 2 extra door staff Saturday 9pm–3am". A request appears. As company, approve the drafts. The shifts are published on the Rota and the venue shows Confirmed. An unclear message gets a clarifying question back.
4. **Feedback:** as venue, rate an officer 2 with a note. A feedback card appears and the rating shows on the officer's Attendance tab.
5. **Reconcile:** run it. A card shows Marcus's figures with the mismatch in red. Approve, and the statement line is corrected.
6. **Chat:** ask "Unfilled shifts next week", "Who can cover Harbour Arena Saturday?" and "Marcus's lates this month". The answers match the database. "Assign Ellie to it" produces an inbox card, not a change.
7. **Security manager:** sees only their own venues' items.
8. **Credit cap:** `ops.settings` shows the credits used.
9. **Layout:** check at 390 px and 1440 px, with no horizontal overflow. Check the console for errors, then run `agent-browser close --all`.
10. **Board:** add a plain-language comment on the board card, then report briefly to the user.
