# Spec: Timesheets as a day-by-day table, with rates, Approve / Query / Decline, and a pipeline with no gaps

## 1. Why
- Today Timesheets is a flat list, newest first. It only shows shifts someone clocked in to; upcoming and live shifts are missing.
- Money is invisible. There is no charge or officer rate on a timesheet: both are worked out later, inside the pay run and the invoice. That means no amounts on the page and no way to adjust one shift.
- Managers want it to read like the Rota: per day, one row per officer shift, a colour that tells the state at a glance, and the decision buttons on the row.
- A trace of the pipeline (shift → clock-in → timesheet → pay run → invoice) found places where a shift can slip through, be paid twice-over, or quietly change state. These are fixed as part of this work (§5).

## 2. Who it is for
- **Company managers:** everything — see, change rates, approve, query, decline.
- **Security managers:** approve, query, decline; see the officer rate only.
- **Venue managers:** see their venue's rows with the charge rate only (never the officer rate); they can query and sign off.
- **Officers:** unchanged (their own shifts, in the officer app).

## 3. The page
- **Week view like the Rota.** Week arrows, the venue filter, plus a new officer filter. It defaults to this week.
  - The phone shows a day agenda with sticky day headers and a "Today" highlight.
  - The desktop shows a day-grouped table: a day header row, then that day's rows.
- **Per day, one row per officer on a shift.** Columns:
  - Officer, showing their "Goes by" name and photo. Tapping opens the officer.
  - Venue and role.
  - Scheduled start–finish.
  - Actual start–finish: from the clock-in and clock-out scans. A small scan, NFC or manual marker shows how it was recorded, and flag dots show late, left early or no clock-out.
  - Hours.
  - Charge rate, per hour and as a total.
  - Officer rate, per hour and as a total.
  - Actions: **Approve · Query · Decline**.
- **Row colour by state:**

  | State | Look |
  |---|---|
  | Confirmed, not started | Faded (light opacity) |
  | Live, clocked in now | Blue outline |
  | Completed, awaiting review | Amber edge and amber tint |
  | Queried | Red edge |
  | Approved (reviewed) | Green edge and green tint. The venue sign-off shows as a small tick, not a different colour. |
  | Declined (not worked) | Grey, with the amounts struck through |
  | Paid or invoiced | Green, with a lock icon |
  | No-show (shift ended with no clock-in) | Red "No clock-in" chip, with Set times and Decline actions |

- **Unconfirmed (assigned but not accepted):** these rows don't appear, because they aren't timesheet-relevant yet. The Rota covers them.
- **Totals:**
  - Each day header shows hours, charge and pay for that day.
  - A week strip at the top shows the same three totals, plus counts for awaiting review, queried and no clock-in.
- **Rates are modifiable.** A company manager taps a rate and enters a new one with a required reason. The row shows an "edited" mark, and the venue's rate card stays as it is. Security managers can only see the officer rate.
- **Bulk:** select rows, then Approve or Decline them together, as today's Approve works now.
- **Detail sheet** (tap a row): the clock evidence (selfie and face check, scan type), edit times, rate history, the query thread, and the audit trail.

## 4. The three actions
- **Approve:** the hours and rates are right. The row turns green and waits for the venue sign-off, which is auto-signed after the existing number of days. From here it is ready for pay and invoice.
- **Query:** this needs a look first. A comment is required, and the officer and the other side (venue or manager) are notified. The row stays red until someone corrects it or answers it, and then it returns to awaiting review. Security managers can now query too.
- **Decline:** not worked, so no pay and no charge. A reason is required (no-show, sent home, wrong booking, duplicate, or another reason). It never reaches a pay run or an invoice, and it can be reopened before the period is paid.

## 5. Pipeline: nothing missing, broken or doubled
Each item below is a rule the system enforces, not a reminder:

1. **Every worked or booked shift has exactly one row.** A confirmed assignment always shows on the day, whether or not anyone clocked in, so a no-show can't disappear after 30 days. It stays as "No clock-in" until someone sets times or declines it.
2. **A cancelled shift or assignment can't be paid or charged.** Its timesheet is declined automatically, with the reason "shift cancelled". The pay run and the invoice skip declined rows.
3. **Approval is never silently undone.** If clock evidence changes after approval, for example a late exception decision, the row goes to Queried with an automatic note. The original approval stays in the trail.
4. **Rates are fixed at approval.** The charge and officer rates are copied onto the timesheet when it is approved (from the rate card, or the manual override). The pay run and the invoice use those exact figures, so the page, the payslip and the invoice always match. A missing rate blocks Approve with a clear "set a rate" message, instead of producing £0.
5. **One timesheet, one pay line, one invoice line.** The existing one-per-assignment rule stays. A timesheet already on a pay run or invoice is locked (lock icon). Removing it from a draft run or invoice returns it to Approved, without making it re-sign or leaving it editable in a half state.
6. **Hours only change through Edit, with a reason.** That covers the raw hours override the assistant could use and the Orb reconcile; the change is recorded in the audit trail.
7. **A weekly check** reports anything out of line on the week strip: shifts that ended with no row, approved rows with no rate, and signed rows not yet on a pay run after its period closes.

## 6. Out of scope
- Rate cards themselves (Settings → rates) are unchanged.
- The pay run and invoice screens are unchanged, apart from using the stored rates.
- The officer app is unchanged.

## 7. Done when
- The table shows a whole week, day by day, with the eight state colours at phone and desktop widths.
- Approve, Query and Decline work per row and in bulk, and rate edits keep a reason in the trail.
- Each §5 rule has an API test: no-show visible, cancelled shift skipped, approval not reset, rates frozen, no double line, and the unlock path is clean.
- A What's new card with its own picture.

## Decisions (defaults where no answer was given, easy to change)
- **Decline:** "not worked", so no pay and no charge (your choice).
- **Rate overrides:** company managers only. Security managers see the officer rate, and venues see the charge rate. *(default)*
- **Green means manager-approved.** The venue sign-off is a tick. *(default)*
- **Range:** the whole week, including upcoming confirmed shifts (faded). *(default)*
