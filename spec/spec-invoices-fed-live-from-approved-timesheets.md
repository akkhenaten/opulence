# Spec: Invoices and pay runs fed live from approved timesheets

## 1. Why
- Today an approved timesheet only reaches money when someone presses Generate for a period. Until then it shows up on no invoice and no pay run. Managers can't see what a venue will be billed or what an officer will be paid.
- Generate needs dates, and it waits for the pay run. Shifts that turn up after a week is issued are easy to miss.
- Invoices and pay runs are flat lists. They don't read like the Rota and Timesheets screens they come from.

## 2. Decisions (agreed with the user)
| Question | Answer |
|---|---|
| When does a timesheet reach an invoice? | On approval: it goes straight onto the venue's open draft invoice, which is not issued yet. |
| What happens when the timesheet changes? | Draft lines follow it: queries, declines, rate changes, new times and reopens. Issued invoices stay locked; a change after issue needs a credit note. |
| What can be issued? | Only lines the venue has signed. Unsigned lines move to the next draft when the invoice is issued. |
| Shifts approved after their week was issued | They go on the next open draft, marked "Late · worked <day>" with their real date. |
| Pay runs | They use the same live feed, and only signed lines are paid. A draft pay run opens by itself, marked "kept up to date from timesheets". |
| Look | Invoices, statements and pay runs use the Timesheets week-table look: a header per day with totals, a green tint for venue signed, amber for awaiting sign-off, and lines added by hand at the end. |
| Go-live | The existing approved backlog is pulled onto drafts only. Nothing is issued or emailed. |

## 3. Who it is for
- **Company managers:** see every draft fill up live, issue the signed part, and add or edit lines by hand.
- **Officers and venues:** nothing changes until something is issued. Drafts stay internal.

## 4. Rules
- **Wanted:** an approved or signed timesheet whose shift is not cancelled has exactly one line on a draft invoice (its venue) and one on a draft statement (its officer, inside the draft pay run).
- **Billed (locked):** the line is on an invoice past draft, or on a statement that is past draft or whose pay run has left draft. `timesheet_billed()` in SQL is the single rule shared by the table, clock rebuilds and the cancel trigger.
- **Which draft:**
  1. The draft for the line's own period.
  2. If there is none and that period hasn't been issued, a new draft for it.
  3. Otherwise, the latest open draft, or a new one for the current (or next) period. Such a line is marked late.
- **Issue gate:** issuing an invoice, sending a pay run for review, or finalising a run from draft moves the unsigned lines off first. They land on the next draft, and the toast says how many were held back. Lines added by hand stay put.
- **Timing:** every API action syncs the timesheets it touched straight away. A sweep every 5 minutes catches the rest, including the go-live backlog. A cancel or decline drops the line from its draft.

## 5. Screens
- **Invoices:** the subtitle reads "Approved shifts go straight onto each venue's draft". Draft rows show "N signed · £X ready", "N awaiting venue" and "N late". "Bring up to date" runs the feed (no date picker).
- **Invoice detail:** the day-by-day lines have margin and pay-cost columns, plus a callout with the signed/awaiting split. The button reads "Issue N signed". Only lines added by hand can be edited or removed. Delete draft is hidden while timesheet lines are on it.
- **Pay:** a "Live pay run" tile with "Bring up to date", which opens the current draft run.
- **Pay run:** a split callout, a "Shifts by day" table (officer column, rows open the statement) and the invoices section in every status. Send for review is disabled until something is signed.
- **Statement:** "Shifts worked" by day. Shift lines can't be removed by hand.
- **Timesheets:** a chip shows "On draft invoice" or "Invoiced INV-…". Locked now means billed.
- **What's new:** the "Invoices and pay runs fill themselves" card, with its own picture.
