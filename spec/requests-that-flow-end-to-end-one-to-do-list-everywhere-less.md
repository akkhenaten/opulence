# Requests that flow end to end, one to-do list everywhere, less AI where rules will do

## Context
The user reported four things:
1. A venue's staff request reaches the company dashboard, but the **Rota** nav button shows no red mark.
2. The **whole request pipeline** has to be understood and made coherent, from creation until officers are assigned: where requests show, how people act on them, and how they update.
3. **Needs you** should offer **more actions in place**. Each action must show its effect everywhere, with no duplicates.
4. **AI is used for repetitive work** that rules could do. Move that to system work so credits go only on human-like tasks.

### What the investigation found
**Rota badge**
- `app/src/layouts/nav.js:16,33,49` gives Rota no `badge` key.
- `Shell.jsx:298` builds badges only for ops, everyday, messages, email and platform.
- The mobile tab bar shows no badges at all (`Shell.jsx:517-525`).
- `cover.create` never makes an Orb card, so `ops.count` doesn't include requests.

**Request pipeline breaks**
- **Accept creates published shifts nobody is told about.** `cover.accept` (`cover.mjs:578`) → `createShift` sends no open-shift notice and no `proposeCover`. Officers only hear about it from `coverScan` when the shift is less than 72 hours away (`ops.mjs:555`).
- A past pending date can still be accepted.
- `change_status='approved'` is never written.
- An accepted date with a change waiting shows in two Cover tabs at once.
- "Staffed" counts officers who are assigned but haven't confirmed (`_cover.jsx:11` uses `filled`, not `confirmed`). There are also two different staffed checks, `isStaffed` and `isFilled`.
- `rotaLink` uses `c.shift_id`, which `cover.list` never returns (`Cover.jsx:117`).
- Manager notifications from `cover.mjs` always link to `/company/cover`, even for the security portal.
- Venues are told "Replacement confirmed" for new cover (`ops.mjs:1044`).
- The cancel toast says "office" but the screen says "Orb" (`_requests.jsx:75/89/100`).
- Splitting a series drops its `stream_id` (`cover.mjs:220`).
- The AI venue-request path proposes cover straight away; the form path doesn't.

**Counts disagree**
- Today's "cover requests" (`dashboard.mjs:55`) counts pending dates with no date limit and leaves out change requests.
- Cover and Rota use `coverWaiting` with a window instead.
- Timesheet counts cover all time, but the link opens only the current week.
- Exceptions use 14 days on Today but no window on the page.
- Shift requests aren't filtered to published shifts.

**Needs you**
- Every row except Orb cards is a link only, but inline API actions exist for almost all of them (table below).
- **Duplicates:**
  - One incident can show three times on Today: to sign, open, and an Orb card.
  - Unfilled shifts appear as a row, a chip, an Orb card and in Tonight.
  - Compliance cards sit beside the can't-work, grace and expiring rows.
  - Venue Overview repeats the timesheets and invoices tiles.
  - Officer Home lists the SIA licence twice with different wording, and the site pack twice.
  - Bug at `Home.jsx:342`: a report to re-sign hides the contract set-up step.
- **The bell disagrees:**
  - The company bell counts Orb cards only.
  - The venue bell counts every venue, while Overview counts only the venue picked.
  - The officer bell's count doesn't match Home.
- **Refresh:** only `shifts.*`, `cover.*` and `ops.*` actions fire `orb:ops` / `orb:notify` (`api.js:44`). Timesheets, incidents, time off, documents, phones, exceptions and streams don't, so the other lists wait up to 30–60 s.

**AI**
- 33 call sites, all through `lib/ai.mjs`, logged to `ai_usage`. These are repetitive or rule-like:
  - `compliance.advise` (Haiku) runs after every weekly check, rota sync and document read. A `templateAdvice()` fallback already exists (`compliance.mjs:575`).
  - The incident evidence review (Sonnet + images) runs **automatically** on every incident with attachments, and **again after each edit** (`incidentAi.mjs:170`).
  - `messages.classifyReply` (Haiku) runs on typed replies to chases and offers; the buttons already exist.
  - `toolbox.suggest` (Haiku) does what a search would.
  - `venues.writeWebsite` (Haiku) writes a 220-character blurb.
  - `venueLookup.streetFromText` (Haiku) runs from a 5-minute job, and **repeats** for venues whose card was decided but not dismissed (`venueSetup.mjs:47`).
  - `venueRequests.create` (Haiku) parses typed requests.
  - `officers.rtwRead` (Haiku vision) reads GOV.UK PDFs, which have a text layer.
  - `feedback.submit` (Haiku) flags problems in notes.
  - Dead code: `ops.chat` and `incidents.aiDraft`.
- `creditsFor` (`ai.mjs:12`) bills cache-read tokens at the full price, so the ledger overstates Orb's spend.

## Approach

### 1. One to-do source for the bell, Needs you and nav badges
- **Make `functions/api/lib/waiting.mjs` the single registry.** Each to-do kind is defined once with:
  - `key`
  - `roles`
  - `count(sql, scope)`
  - `list(sql, scope)`
  - `title`
  - `link`
  - `nav` (which nav item it badges)
  - inline `actions`
  - `dedupe` (which other kinds it hides)
- New action `todo.summary` returns `{ items, byNav }` for the user's scope, honouring the chosen venue the same way `narrowScope` does.
- **Callers:**
  - `notifications.waiting` and the company and venue dashboard counts call the registry. The counting code in `dashboard.mjs:51-89,123-136` is removed.
  - `Shell.jsx` badges use `byNav`: **Rota** (cover requests and changes, shift requests, unfilled shifts in the next 7 days), Today (Orb cards plus exceptions and can't-work), People (documents and phones to approve, time off), Money (timesheets, streams) and Logs (incidents to sign).
  - The mobile tab bar shows the same badge, and More adds up only its hidden items.
- **Shared rules for every kind:**
  - one date window per kind, the same on the page it links to;
  - timesheet links open the week of the oldest item (`?week=`);
  - the cover count includes change requests and leaves out past dates.
- **Dedupe:**
  - An incident shows once: "to sign" wins over "open", and the Orb incident card attaches to that row.
  - Unfilled shifts with an Orb cover card show as the card only.
  - Compliance cards absorb the can't-work, grace and expiring rows for the same officer.
  - A reconcile card absorbs the timesheet row for the same timesheet.
  - Venue Overview: the tiles stay, and Needs you shows only what needs action, without repeating a tile.
  - Officer Home: one SIA line (from `expiringDocs`), one site-pack prompt (on the shift card). Fix the `signing` bug.
- **Live updates:**
  - Extend `SHIFT_CHANGES` in `app/src/api.js:44` into a list of to-do-changing actions: `timesheets.*`, `incidents.sign/review`, `timeoff.decide*`, `docs.verify`, `device.decide`, `clock.decide`, `streams.check`, `contracts.sign`, `venuePacks.sign`. They fire `orb:ops` and `orb:notify`.
  - Publish a small MQTT `todo` event per company and venue from the server after these actions (`lib/realtime.mjs`), so other people's screens update too.
  - Officer Home pull-to-refresh reloads the To do lists.

### 2. Needs you with actions in place (no new rules, existing API actions)
| Item | Inline actions |
|---|---|
| Cover request | Accept (asks Broadcast / Orb / Assign myself, see 3) · Decline with reason · Open |
| Change to a booked request | Approve · Decline with reason |
| Shift request from officer | Approve · Decline (bulk when several) |
| Timesheet to approve | Approve · Open (bulk Approve all for the week) |
| Queried timesheet | Reply (inline text) · Open |
| Clock exception | Approve · Reject |
| Time off | Approve · Decline |
| New clock-in phone | Approve · Reject (`device.decide`), **newly listed** |
| Document to check | Verify · Open (`docs.verify`), **newly listed** where there's no compliance card |
| Billing stream | Mark checked |
| Incident to sign | Open to read and sign (it must be read, so it stays a link) |
| Venue: timesheets to sign | Sign all · Query · Open |
| Venue: incident to sign | Open |
| Officer: shift / offer | Accept · Decline (already there) |

- **Shared component:** a new `NeedRow` in `app/src/pages/manager/Dashboard.jsx`, reused on Venue Overview and the venue page, built on the Orb card pattern (`OpsAI.jsx` Inbox).
- **Behaviour after an action:** the row is removed straight away. If it fails, it comes back with the error. Undo is offered only where a reverse action exists.
- **The bell** shows the same items with the same buttons ("Waiting for you"), so a decision made in either place clears both.

### 3. The request pipeline, made coherent
**States, the same everywhere:**
- Waiting for reply = pending, or a change pending.
- Being staffed = accepted and `confirmed < headcount`.
- Staffed = `confirmed >= headcount`.
- Cancelled / Declined.

Code changes:
- One helper `requestState()` in `_cover.jsx`, also used by `lib/waiting.mjs`. It replaces `isStaffed`/`isFilled`, and each date appears in only one tab.

**Accept:**
- Refuse dates already past.
- **The manager chooses, on each acceptance, how officers find out (decided).** Accept opens a small choice, wherever the accept happens (Needs you, the bell, the Cover drawer, bulk accept):
  - **Broadcast to officers:** the shift is open, and eligible officers get the open-shift notice. This is the same step as publishing: `afterShiftChange` plus the notice at `rota.mjs:295`.
  - **Ask Orb to propose officers:** call `proposeCover` straight away. The manager approves the named officers in the Orb card, as on the AI venue-request path.
  - **I'll assign myself:** today's behaviour. It goes to `rota?shift=…&assign=1`, the shift isn't open, and nobody is told yet.
  - **Default:** the manager's last choice, remembered per user. The first default is Broadcast.
  - **Bulk accept** applies one choice to every date picked.
  - Later, the shift page gets a "Broadcast now" action for shifts accepted with "I'll assign myself".
- **Implementation:** `cover.accept` and bulk accept take `notify: 'broadcast' | 'orb' | 'none'`. `open` is set to true for broadcast. The existing `coverScan` 72-hour safety net stays for all three choices.
- **Not changed:** who is eligible.

**Other fixes:**
- `cover.list` returns `shift_id`, so "Open in rota" goes to the shift.
- Write `change_status='approved'` on approve, or drop the state from the code.
- `applyFuture` copies `stream_id`.
- `cover.mjs` notifies managers through `notifyManagers` (from `ops.mjs`), which gives the correct link for each portal.
- **Wording:** venues get "Staff confirmed for <date>" (not "Replacement"); the cancel screen and toast both say "the office".

**Pipeline doc:** write `docs/requests-pipeline.md`. It covers each step, its state, who is notified, where it shows (Today, Rota badge, Cover tabs, venue Rota and Requests, bell, officer Open shifts and offers) and its action. Tests check it against the code.

### 4. Move repetitive AI to system work
| Today (AI) | Becomes |
|---|---|
| `compliance.advise` after every check | `templateAdvice()` always; AI only when a manager presses "Explain" on a card |
| Incident evidence review automatic, on every edit | Runs once when first submitted (no re-run on edits); "Check again" button for managers |
| `classifyReply` on typed replies | Rules first (yes / no / omw / "10 mins" / can't / signing), AI only when the rules can't tell |
| `toolbox.suggest` | Postgres full-text search on title, summary and tags, plus an emergency keyword list; AI fallback only when nothing matches |
| `venues.writeWebsite` | Template from name and town (postcodes.io already used) |
| `streetFromText` in the 5-minute job | Regex for the line before the postcode; stop repeat lookups for decided venues |
| `rtwRead` on GOV.UK PDFs | Parse the PDF text layer; vision only for photos or scans |
| `feedback.submit` problem flag | Score from the star rating plus a keyword list; AI only for long notes |
| `venueRequests.create` | Date and time parser first ("Fri 22:00–04:00 x2 door"); AI only when the parse fails |
| Dead `ops.chat`, `incidents.aiDraft` | Removed |
| `academy.tutor`, email summary | Move to Haiku |
| Credits ledger | Bill cache reads at the cache price in `creditsFor` |

**Stays AI:**
- Orb chat and voice
- writing incident reports
- reading documents, CVs and contracts
- face checks
- course, procedure and pack drafting
- Everyday moderation
- email drafts

**Settings → Orb:** shows what each module spent this month (from `ai_usage`), already partly there.

**Defaults (questions not answered; change them on review):**
- **Incident evidence AI:** runs once on submit, plus a manager-only "Check again" button.
- **Releases:** two.
  1. Rota badge, one to-do source, pipeline fixes and inline actions.
  2. AI-to-rules swaps.
- Each release has its own What's new card.

## Order of work
1. Registry and badges, including the Rota badge.
2. Pipeline fixes.
3. Inline actions and dedupe.
4. AI swaps.

These can be split into separate releases if preferred.

## Verification
- **API tests (`npm test` in `functions/api`):**
  - every registry kind's count equals its list length, and the counts match the pages they link to;
  - dedupe rules;
  - `requestState`;
  - accept refuses past dates and notifies officers;
  - parsers for replies, request text, street and RTW PDF;
  - toolbox search;
  - `templateAdvice` coverage;
  - `creditsFor` with cache tokens.
- **Mock (test records only):**
  - a venue sends a request, and the company Rota badge appears on desktop and on the phone tab bar;
  - accept it from Needs you, and an officer sees the open shift and offer;
  - the officer accepts, and the venue sees "Staffed";
  - the badge, bell and Today all clear together.
- **agent-browser at 390 and 1280** for company, security, venue and officer:
  - every Needs you inline action works and shows in the bell and the badges;
  - nothing appears twice.
- **AI:** check the `ai_usage` delta on the mock — no AI call for advice, typed "yes" replies, toolbox search or website blurbs.
- **Release:** `npm run build` with ui-lint ≤70, the API id in the bundle, `openkbs fn deploy api`, then deploy the site.
