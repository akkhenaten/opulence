# Implementation plan: requests end to end, one to-do source, less AI

## Context
- **Problems today:**
  - When a venue sends a staff request, it reaches the dashboard but puts no red badge on Rota.
  - Each screen counts its own to-dos, so the numbers disagree, some items appear twice, and some never refresh.
  - The request steps (sent → accepted → staffed) have gaps: past dates can be accepted, nobody tells officers, and a date can sit in two tabs.
  - Some AI runs repeat the same work over and over (advice, reply sorting, search, blurbs), so they cost credits that plain rules wouldn't.
- **Goals:**
  - One server registry of to-dos that drives every badge, Needs you and the bell.
  - Inline actions on those rows.
  - A coherent pipeline where the manager chooses Broadcast, Orb, or assign themselves on each accept.
  - Rules in place of repetitive AI.

The spec is approved and saved at `spec/requests-that-flow-end-to-end-one-to-do-list-everywhere-less.md`. It ships as two releases, each with its own What's new card and AI picture:
- **v209:** Rota badge, one to-do source, pipeline fixes, Needs you actions.
- **v210:** the AI-to-rules swaps.

Release 1 includes one migration (`067`) and an API deploy.

---
## Release 1 (v209)

### A. One to-do registry (server)
**`functions/api/lib/todo.mjs`** (new; it replaces the role switch in `lib/waiting.mjs` but keeps `waitingItems` working as a wrapper)
- **`KINDS`:** an array, one entry per to-do. Each entry has:
  - `key`
  - `roles`
  - `nav` (`ops | rota | incidents | staff | venues | money`, and for venues `overview | rota | logs | billing`)
  - `tone`
  - `one` / `many` wording
  - `link(scope)`
  - `count(scope, ctx)` (SQL)
  - optional `list(scope, ctx, limit)` returning rows `{ id, title, sub, actions }`
  - `hides: [keys]` for dedupe
- **Company and security kinds:** the counts move out of `dashboard.mjs:51-89` with these fixes:
  - `cover`: pending, plus `change_status='pending'`, `ends_at > now()`, the same filter as `coverWaiting`.
  - `shiftRequests`: adds `s.status='published'`.
  - `unfilled`: 7 days. It is **hidden for each shift that already has an open Orb cover card**, so the row counts only shifts without a card.
  - `exceptions`: 14 days, and `Exceptions.jsx` gets the same window.
  - `toApprove` and `disputed`: no change to what is counted. The link goes to `?week=<week of the oldest>`, worked out in `count` with `min(starts_at)`.
  - `incidentsToSign`: wins over `openIncidents`. `openIncidents` becomes "open, not waiting for you".
  - `cantWork`, `graceEnding`, `expiring`: each officer with an open Orb compliance card is left out.
  - `timeOff`, `streams`: as today.
  - `phones` (`device.list pending`) and `docs` (documents waiting to be checked, with no open compliance card): **new**.
  - `decisions`: open Orb cards (`ops.count`).
- **Venue kinds:** timesheets to sign, reports to sign, invoices to pay, late or no-show now, and requests waiting for the office's answer (shown only, no action). All use `narrowScope(user, b.venue_id)`.
- **Officer kinds:** answer, resign, drafts, contracts, packs, training, documents, set-up. The counts are the ones `Home.jsx useToDo` already uses, moved to the server. They are counted with no limit, so the bell matches Home.
- **Actions:**
  - `todo.summary {venue_id?}` returns `{ items:[{key,count,title,link,tone,nav}], byNav:{rota:n,...}, failed }`.
  - `todo.list {key, venue_id?, limit}` returns the rows for inline actions.
  - Registered in a new `modules/todo.mjs`, the same pattern as `notifications.mjs`.
- **Callers:**
  - `notifications.waiting` returns `todo.summary` items.
  - `managerDash` and `venueDash` drop their own counts and attach `todo` from the same function. The figure blocks (live, shifts, hoursWeek, money) stay.
- **Tests (`test/todo.test.mjs`):**
  - every kind has a link and wording;
  - the `hides` rules;
  - the count SQL matches the page filters (asserted on the source text, as the existing tests do).

### B. Badges and live refresh (app)
- **`app/src/layouts/nav.js`:** add a `badge` key to:
  - Rota (company and security: `rota`; venue: `rota`), Incidents (`incidents`), Staff (`staff`), Venues (`venues`), Money (`money`);
  - venue Logs (`logs`) and Billing (`billing`).
  - Today keeps `ops`, which is now `byNav.ops`: Orb cards plus exceptions and can't-work.
- **`app/src/layouts/Shell.jsx:281-299`:**
  - `todo.summary` is polled every 30 s, replacing `ops.count`.
  - `badges = { ...byNav, everyday, messages, email, platform }`.
  - The mobile tab bar (`:517`) renders `<Badge n={badges[it.badge]}>` on each tab icon. More adds up only the items it hides (already does).
- **`app/src/api.js:44-60`:**
  - Rename `SHIFT_CHANGES` to `TODO_CHANGES` and add `timesheets.(approve|sign|answer|dispute|decline|reopen)`, `incidents.(sign|review|submit)`, `timeoff.decide(Many)?`, `docs.verify`, `device.decide`, `clock.decide`, `streams.check`, `contracts.sign`, `venuePacks.sign`, `cover.(acceptMany|updateMany)`.
  - These fire `orb:ops` and `orb:notify`.
- **Other screens:**
  - `functions/api/lib/realtime.mjs` publishes `{type:'todo'}` to the company and the affected venue's users after those actions. A helper `todoChanged(venueId)` is called from each action.
  - `app/src/realtime.js` turns `todo` into `orb:ops`.

### C. Request pipeline (`functions/api/modules/cover.mjs`, `app/src/pages/manager/_cover.jsx`, `Cover.jsx`)
**`cover.accept` and bulk accept:**
- New body field `notify: 'broadcast' | 'orb' | 'none'` (default `'broadcast'`).
- Refuse past dates (`starts_at > now()`, also for a single date).
- After the transaction, for each new shift:
  - `broadcast`: set `open = true`, call `afterShiftChange`, and send the open-shift notice. Lift the notice from `shifts.setOpen` (`rota.mjs:544-559`) into an exported helper `announceOpen(shift)`.
  - `orb`: `proposeCover({ id }, 'unfilled', { batch })`, as `ops.mjs:840` does.
  - `none`: no notice.
- Remember the choice: `users.prefs.cover_notify` (check that the prefs column exists; if not, add it in migration `067_user_prefs.sql` as `jsonb DEFAULT '{}'`).
- **Accept sheet (UI):** a new `AcceptSheet` in `_cover.jsx` with three choice rows and the remembered default. It is used by the Cover drawer, bulk accept (`Cover.jsx:66`), Needs you and the bell. "I'll assign myself" goes to `rota?shift=<id>&assign=1` as now.
- **"Broadcast now"** on the shift page for an unopened, short shift: calls the existing `shifts.setOpen {open:true}`, which already announces.

**`requestState(c)`** in `_cover.jsx`:
- Returns `waiting | staffing | staffed | cancelled | declined`.
- `waiting` = pending, or a change pending (this wins).
- `staffed` = `confirmed >= headcount`.
- It replaces `isStaffed`/`isFilled` and the `LABEL` lookups. The Cover tab filters use it, so each date sits in one tab.

**Other fixes:**
- `cover.list` adds `(SELECT id FROM shifts WHERE cover_request_id = c.id LIMIT 1) AS shift_id` (check the column name in `createShift`), which fixes `rotaLink`.
- `decideChange` approve: keep resetting `change_status` to `'none'`, and delete `'approved'` from the UI lookups (dead state).
- `applyFuture` insert (`:220`) includes `stream_id`.
- Manager notifications in `cover.mjs` use `notifyManagers` from `ops.mjs` (export it), which sets the correct link for each portal.
- **Wording:**
  - `ops.mjs:1044` venue notice: "Staff confirmed for <date>", or "Replacement confirmed" only when it really replaces someone (that case has `cause` 'no-show' / 'cant_make_it').
  - `_requests.jsx:75/89/100`: "the office" everywhere.

**Docs and tests:**
- `docs/requests-pipeline.md`: a table of each step × state × who is notified × where it shows × action.
- `test/coverPipeline.test.mjs`:
  - accept refuses past dates;
  - `notify` branches call `announceOpen` / `proposeCover` (source asserts);
  - `applyFuture` keeps the stream;
  - `requestState` cases (import from a small shared `app/src/pages/manager/_coverState.js`, a pure module the test can import, the same as `_rotaCounts.js`).

### D. Needs you with actions
**New `app/src/pages/manager/_needs.jsx`:**
- **`NeedRow`:** an expandable row. When opened it loads `todo.list {key}` and shows up to 5 items, each with inline buttons and "See all" (the link).
- **Item actions, all existing API actions:**
  - `cover`: Accept (opens `AcceptSheet`) / Decline (reason)
  - `coverChange`: Approve / Decline (`cover.decideChange`)
  - `shiftRequests`: `shifts.decideRequest(s)`
  - `toApprove`: `timesheets.approve {ids}`, plus Approve all
  - `disputed`: Reply (inline input → `timesheets.answer`)
  - `exceptions`: `clock.decide`
  - `timeOff`: `timeoff.decide`
  - `phones`: `device.decide`
  - `docs`: `docs.verify`
  - `streams`: `streams.check`
  - `incidentsToSign`: Open only
- **Venue items:**
  - timesheets to sign: Sign all (`timesheets.sign`) / Query (sheet)
  - reports to sign: Open
- **After an action:** the item is removed straight away (optimistic). On error it is put back with a toast. Success fires `orb:ops`.

**Where `NeedRow` is used:**
- `Dashboard.jsx:32-46,242-258`: `NEEDS` is replaced by `todo` from `dashboard.get`, and `NeedRows` renders `NeedRow`. `summaryLine` counts after dedupe.
- `money/VenueDashboard.jsx:183-216`: the Needs you rows use `NeedRow`. Rows that only repeat a tile (timesheets, invoices) are dropped, and the tile gets the action instead.
- `money/VenueOverview.jsx:39-51`: uses `todo.list` filtered to that venue.

**The bell:**
- `Shell.jsx:62-86` "Waiting for you" renders the same `NeedRow`s, with the same component and the same actions.

**Officer Home (`officer/Home.jsx`):**
- Remove the separate SIA expiry line (`:182-184`) and keep the `expiringDocs` row. Wording: "SIA licence expires in N days".
- Remove the pack To do row when the next-shift card already shows the pack banner.
- Fix `signing` (`:342`): match `r.key === 'contract'`, not the icon.
- Pull to refresh reloads every To do source.

### E. What's new card
- `people/_whatsnew.jsx`: card "Requests that reach officers, and one list of what needs you". Prompt in `app/scripts/whatsnew-images.mjs`. Generate the picture.

### Release steps
1. `npm test` in `functions/api`.
2. `npm run build` (ui-lint ≤70).
3. Commit the source, then `openkbs fn deploy api` (migration 067 runs on start).
4. Commit the build, grep for the API id, `openkbs site deploy` (v209), push.

---
## Release 2 (v210): AI → rules

| Change | File(s) |
|---|---|
| Advice from `templateAdvice()` always. A new `compliance.explain {officer_id}` button action calls `advise()` | `modules/compliance.mjs:575-600`; button on the Orb compliance card (`OpsAI.jsx`) |
| Evidence review: runs only the first time (`ai_reviewed_version IS NULL`). Edits no longer queue it. "Check again" calls the existing `incidents.aiReview` | `modules/incidentAi.mjs:142-178`, `evidenceScan` in `ops.mjs` |
| `classifyReply`: new `lib/replyRules.mjs` (yes / no / omw / ETA "10 mins" / can't / signing). AI only when the rules return `unclear` | `modules/messages.mjs:203-240` |
| `toolbox.suggest`: Postgres `to_tsvector` search over title, summary, steps and tags, plus a `EMERGENCY_WORDS` list. AI only when there are 0 hits | `modules/toolbox.mjs:141` |
| `writeWebsite`: a template "<Name> in <town> — licensed door and event security by <company>" (town from postcodes.io) | `modules/venues.mjs:66` |
| `streetFromText`: regex for the line before the postcode. `venueSetup` skips venues with a decided card | `lib/venueLookup.mjs:279`, `modules/venueSetup.mjs:47` |
| `rtwRead`: `pdf-parse` (check what's already in `package.json`) for the GOV.UK text layer. Vision only when there's no text | `modules/officers.mjs:315` |
| `feedback.submit`: stars ≤2 or a keyword hit counts as a problem. AI only for notes over 200 characters | `modules/ops.mjs:1475` |
| `venueRequests.create`: new `lib/parseRequest.mjs` (day/date, time range, count, role words, "every"). AI only when it fails | `modules/ops.mjs:1423` |
| Remove the dead `ops.chat` and `incidents.aiDraft` (grep that nothing calls them first) | `ops.mjs:1250`, `incidentAi.mjs:290` |
| Move `academy.tutor` and the email summary to Haiku | `academy.mjs:415`, `email.mjs:535` |
| `creditsFor`: cache-read tokens at 10% of the input price | `lib/ai.mjs:12` |

**Tests:**
- `replyRules`, `parseRequest`, street regex, toolbox search SQL (source assert), `creditsFor` cache maths;
- a source assert that `advise()` isn't called from the jobs.

**What's new card:** "Orb spends credits only where it needs to think".

**Release:** the same steps as release 1, plus an API deploy (v210).

---
## Verification (both releases)
- **Mock (port 8797):** add `todo.summary`, `todo.list` and the accept `notify` handling. Seed:
  - a pending request, a change request, a past pending date;
  - an Orb cover card for one unfilled shift;
  - one incident to sign and open;
  - a pending phone and a document to check.
- **agent-browser at 1280 and 390:**
  - **Venue:** sends a request (test record).
  - **Company:** the Rota badge shows in the sidebar and on the phone tab, Today, and the bell, with the same number.
  - **Accept from Needs you:**
    - Broadcast: the officer sees an open shift.
    - Orb: a card appears.
    - Assign myself: the rota opens.
  - All the counts clear together.
  - Every inline action removes its row in Needs you, the bell and the badge.
  - No item shows twice.
  - **Officer Home:** one SIA line.
- **Console:** no new errors. Then run `agent-browser close --all`.
- **Release 2:** the mock logs no AI call for a typed "yes", "omw 10", toolbox search, website blurb or advice. The tests pass.
