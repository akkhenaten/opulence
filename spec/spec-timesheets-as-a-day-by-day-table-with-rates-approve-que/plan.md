# Plan: Timesheets as a day-by-day table — rates, Approve / Query / Decline, and a pipeline with no gaps

Spec: spec/spec-timesheets-as-a-day-by-day-table-with-rates-approve-que.md

## Context (what the code does today)
- **Page:** app/src/pages/shared/Timesheets.jsx is a flat list. It has tabs for pending, approved, signed, disputed, all and missing, and it serves company, security and venue users.
- **API:** functions/api/modules/timesheets.mjs has list, approve, sign, dispute, edit and missing. There is no decline, and Query can only come from company or venue users.
- **Timesheet creation:** `buildTimesheet()` in modules/clock.mjs:27 creates the timesheet at clock-out, on a manual time entry, or from the `closeOpenShifts` job. It returns early when there's no clock-in, so no-shows never get a row; they only appear in "missing", which looks back 30 days.
- **Rates:** none are stored on the timesheet. `payFor()` and `venueRate()` in modules/money.mjs work them out at pay-run and invoice time, with banded night, weekend and bank-holiday uplifts. A missing rate becomes £0.
- **Gaps confirmed in the code:**
  - **Cancelled shifts:** a cancelled shift or assignment can still be paid. Cancellation happens in rota, cover, compliance, hr and ops.
  - **Approval reset:** `buildTimesheet` quietly resets an approved timesheet to pending (clock.mjs:67).
  - **Hours rewrites:** ops reconcile (ops.mjs:741) and `clock.manual` (clock.mjs:262-265) change hours directly.

## 1. Database: migration `046_timesheet_table.sql`
- **Status:** add `'declined'` to the `timesheets.status` CHECK.
- **New columns on `timesheets`:**
  - `charge_rate numeric(8,2)` and `pay_rate numeric(8,2)`: the hourly base rate, fixed at approval.
  - `charge_rate_set boolean default false` and `pay_rate_set boolean default false`: marks a manual override.
  - `rate_note text default ''`
  - `decline_reason text default ''`, `declined_by uuid`, `declined_at timestamptz`
  - `queried_by uuid`, `queried_at timestamptz`
- **Cancellation trigger** (one place, which covers all five cancel paths): `AFTER UPDATE OF status` on `shift_assignments` (to cancelled, rejected or declined) and on `shifts` (to cancelled).
  - Unlocked timesheets for those assignments become `status='declined'`, `decline_reason='Shift cancelled'`.
  - Locked ones (already on a pay run or invoice) get the flag `cancelled_after_billing`, which shows red for a manual credit.
  - Going back to `assigned`/`accepted` (ops.mjs:462 re-accepts) reverses this: a timesheet that was auto-declined with `decline_reason='Shift cancelled'` and is unlocked returns to `pending`. A no-show isn't lost, and the row isn't counted twice.
  - Rows on the table come from assignments in `assigned`/`accepted` (the same set as `missing`), plus any assignment that has a timesheet.
- **Index:** `timesheets(status)`.

## 2. Pure rules: `functions/api/lib/timesheetState.mjs` (new, unit-tested)
- **`rowState(r, now)`** works out the row state:

  | State | Condition |
  |---|---|
  | `confirmed` | Accepted, the shift hasn't started, no clock-in |
  | `live` | Clocked in, no clock-out, not past the end + 2h |
  | `no_clock_in` | The shift ended, no clock-in, no timesheet |
  | `awaiting` | Pending |
  | `queried` | Disputed |
  | `approved` | Approved |
  | `signed` | Signed |
  | `declined` | Declined |
  | `locked` | `statement_id` or `invoice_id` is set; takes priority for display, alongside the green look |

- **`redactMoney(row, user)`:**
  - Venue: the charge fields only.
  - Security: the pay fields only, and only with `can_see_pay`.
  - Company: both.
  - Officer: neither.
- **`afterRebuild(existing, next)`:** compares the stored hours and times with the new ones.
  - Unchanged: keep the status.
  - Changed while approved: change it to `disputed` with the note "Clock record changed after approval (was X, now Y)".
  - Declined: left alone.
- **`missingRates(row)`:** lists which of charge and pay is null. Approve uses it to block.

## 3. API: `functions/api/modules/timesheets.mjs`
- **`timesheets.week {from, to, venue_id?, officer_id?}`** (all manager roles and venue):
  - It starts from `shift_assignments` (accepted, or anything with a timesheet) on non-draft shifts in the range, with a LEFT JOIN to `timesheets` and the latest clock events.
  - Each row returns `state`, scheduled and actual times, how they were recorded (scan, NFC or manual, taken from `clock_events.venue_code` or `status`), hours, flags, and rates.
  - **Rates:** the fixed `charge_rate`/`pay_rate` when set. Otherwise a live estimate from `venueRate`/`officerRate`, with `rate_estimate: true`.
  - **Amounts:** the same banded maths as pay and invoice, using `payFor` and a new exported `chargeFor` in money.mjs, so the totals match the payslip and the invoice.
  - Each row passes through `redactMoney`.
  - **Health counts for the week strip:** no clock-in, approved with no rate, and signed but not on a pay run after the period has ended.
- **`timesheets.approve`:**
  - Fixes the rates: `charge_rate = COALESCE(override, venue rate)` and the same for pay.
  - Rows with a missing rate are refused, with "Set a rate for X first". Other rows still approve, and the response lists the blocked ones.
- **`timesheets.dispute`** (shown as "Query"):
  - Now open to security managers too (MGR + venue).
  - Sets `queried_by`/`queried_at` and notifies the officer as well.
- **`timesheets.answer {id, reply}`** (MGR, new): resolves a query with no change to the times. The reply goes into `resolution` and the timesheet returns to pending. Edit still resolves with a time change.
- **`timesheets.decline {ids? | assignment_ids?, reason}`** (MGR, new):
  - Declines unlocked timesheets.
  - For a no-clock-in assignment it inserts a declined timesheet with hours 0, so the row is closed.
  - Audited. The officer is notified.
- **`timesheets.reopen {id}`** (MGR, new): when unlocked, a declined timesheet goes back to pending if it has clock events (rebuilt with `force`). Otherwise the declined row is deleted and it becomes "No clock-in" again.
- **`timesheets.setRate {id, charge_rate?, pay_rate?, reason}`** (company only, new):
  - Only when unlocked; sets the `*_set` flags and `rate_note`, and is audited with the from and to values.
  - If the charge changes on a signed timesheet, it returns to approved and the venue is asked to re-sign (the same pattern as edit).
- **`timesheets.edit`:** unchanged, apart from also clearing the decline fields when correcting a declined timesheet. The raw `hours` parameter stays, but it now needs a reason (it already does) and it is audited.
- **`timesheets.missing`:** drop the 30-day window. It is still used by Orb and the assistant.

## 4. Pipeline fixes elsewhere
- **clock.mjs `buildTimesheet`:** for an existing approved timesheet, use `afterRebuild` instead of the blanket `'pending'` reset (approved and changed becomes disputed, with the note). Skip declined unless `force` is set.
- **clock.mjs:262-265 (`clock.manual` hours writes):** audit them.
- **ops.mjs:741:** it already writes `resolution` and the `edited` flag; also add an `audit()` call, if one isn't there.
- **money.mjs:**
  - `payFor` uses `t.pay_rate` when set.
  - `invoices.generate` uses `t.charge_rate` as the base (keeping the venue rate card's uplifts and `min_hours`) when set.
  - `periodWhere` already takes only `signed`, so declined rows can never reach pay or an invoice.
  - Unlink paths (removing a line, deleting a draft, deleting a pay run): the timesheet **stays signed**, so it is picked up by the next run with no re-sign and no half state. Existing behaviour, now covered by a test.

## 5. Front end: rewrite `app/src/pages/shared/Timesheets.jsx`
- **Header:**
  - Week arrows, reusing `mondayOf`/`addDays` like Rota.jsx.
  - Venue `Select` and officer `Select`.
  - A status `Segmented`: All · Needs review · Queried · No clock-in.
- **Week strip:** hours, charge and pay (only the fields that role is allowed to see), plus the health counts, which are tappable filters.
- **Desktop (≥ md):** a `<table>` grouped by day, with a day header row showing that day's totals.
  - Columns: Officer (Goes by name + Avatar), Venue · role, Scheduled, Actual (with a scan, NFC or manual icon and flag dots), Hours, Charge £/h · total, Officer £/h · total, Actions.
  - **Phone:** sticky day headers with one compact card per row, using the same fields in two lines. Empty days fold together, as `foldDays` does in Rota.jsx.
- **Row look (one `STATE` map):**
  - confirmed: `opacity-50`
  - live: `ring-2 ring-blue`
  - awaiting: amber left edge + `bg-amber-soft/40`
  - queried: red edge
  - approved/signed: green edge + `bg-green-soft/40`; signed adds a small ✓ "Venue signed"
  - declined: grey, with the amounts struck through
  - locked: green + a Lock icon
  - no_clock_in: a red "No clock-in" chip
- **Row actions:** icon buttons with tooltips and ≥ 44px tap targets, via `<Button>`, to keep ui-lint at 67.
  - Approve, Query and Decline, shown by role and state.
  - No clock-in rows: Set times (the existing `ManualSheet`) and Decline.
  - Venue rows: Query and Sign off.
- **Rates:** an estimate shows in muted text with a "~". Company managers can tap a rate to open `RateSheet` (charge, pay, reason). Overridden rates show an "edited" dot.
- **Bulk:** checkboxes plus `ActionBar` with Approve N, Decline N (reason sheet) and Sign N.
- **Detail sheet:** the existing sheet, plus the decline reason, the rate note, Reopen and Answer query.

## 6. Tests: `functions/api/test/timesheets.test.mjs` (new)
- **`rowState`:** every state, including live → no_clock_in at the boundary.
- **`redactMoney`:** per role.
- **`afterRebuild`:** approved and unchanged keeps its status; approved and changed becomes disputed, with the note; declined is untouched.
- **`missingRates`:** blocks approval.
- **Migration SQL check:** a text check that the trigger covers both tables and `'declined'`.
- **Pipeline guards:** `periodWhere` contains `'signed'` only, and money.mjs prefers the fixed rates (the exported helpers are tested with fake rows).
- **Full suite:** `npm test` (185 + new).

## 7. Ship
- **Checks:** `cd app && npm run build`, then ui-lint (must stay ≤ 67).
- **Stand-in server:** look at the week table at 390px and 1280px as company, security and venue, checking the colours, redaction and actions. Then `agent-browser close --all`.
- **What's new:** a card "Timesheets, day by day" with its own picture. Add a `timesheets-table` prompt to `PROMPTS` in app/scripts/whatsnew-images.mjs, run `node app/scripts/whatsnew-images.mjs timesheets-table`, look at the result, and set `image: 'timesheets-table'` on the card.
- **Commit** only this work's files. Another chat may have uncommitted work, so stage paths explicitly.
- **Deploy:** `openkbs fn deploy api -s 'rate(5 minutes)'`, which runs migration 046. Then the site build and deploy from a clean worktree, as last time. Then `git push origin master --tags`.
- **Live check:** `timesheets.week` returns rows for this week. No live data is changed by hand.
