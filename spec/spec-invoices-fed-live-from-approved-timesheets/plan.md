# Plan: Invoices and pay runs fed live from approved timesheets

Spec: spec/spec-invoices-fed-live-from-approved-timesheets.md

## 1. Database: migration `048_money_feed.sql`
- `timesheet_billed(st, inv)` is the one "billed" rule: an invoice past draft, or a statement that is past draft or whose pay run is past draft.
- `timesheets.feed_dirty` (default true, so the backlog is picked up by the first sweep) and `feed_since`.
  - A BEFORE INSERT/UPDATE trigger marks a timesheet dirty when its status, hours, times or rates change.
- Indexes on the dirty rows and on `invoice_lines` / `statement_lines.timesheet_id`.
- `pay_runs.created_via` now allows `'auto'`.
- `timesheet_follow_assignment` uses `timesheet_billed`, so a cancel also declines timesheets that sit only on drafts.

## 2. Pure rules: `lib/moneyFeedRules.mjs`
- `periodFor` / `nextPeriod`: weekly, fortnightly or monthly.
- `wanted`, `billed`, `pickTarget` (own period → new draft for an unissued period → next open draft, late), `isLate`, `unsignedLines`, `lineChanged`.

## 3. The feed: `modules/moneyFeed.mjs`
- `syncTimesheets(ids)`, inside advisory lock 424243. For each timesheet:
  - Wanted and not billed: upsert its invoice line and statement line at the rates fixed on approval, and link `invoice_id` / `statement_id`.
  - Not wanted: remove the draft lines and unlink. The status is never touched.
  - Then tidy (recalculate totals, drop empty auto drafts) and clear `feed_dirty`.
- `syncRecent()` runs after every API action in index.mjs. `sweep()` runs every 5 minutes from jobs.mjs.
- `holdBackUnsigned(t, { invoiceId | runId })` moves unsigned lines to the next draft. It is called by `invoices.issue`, `payRuns.sendForReview` and `payRuns.finalise`.

## 4. API changes
- **money.mjs:**
  - `invoices.generate` and `pay.generate` just run the feed; the period is optional.
  - Timesheet lines can't be edited by hand: each one "follows its timesheet".
  - Invoices no longer wait for the pay run.
- **payruns.mjs:** returns and audits `held_back`.
- **timesheets.mjs and clock.mjs:** "locked" = `timesheet_billed(...)`.
- **assistant.mjs:** the generate tools describe the feed.

## 5. App
- **New `money/_lines.jsx`:** `DayLines` (phone day cards, desktop day-grouped table), `LineState`, `isLateLine`, `signedSplit`.
- **Updated screens:** InvoiceDetail, StatementDetail, PayRuns, Invoices and Pay (generate sheets removed, "Bring up to date" added), and shared/Timesheets (bill chip).
- **What's new:** the `invoices-live` card and picture.

## 6. Verification
- `test/moneyFeed.test.mjs`: periods, the which-draft cases, late lines, the issue gate, change detection, the migration and the wiring.
- `test/timesheets.test.mjs`: the pipeline test rewritten for the feed.
- Full suite passes.
- Browser check on a local stand-in (PGlite plus the real handler, with seeded data and nothing touching live) at 390px and 1280px: invoice detail, pay run.

## 7. Go-live
- Deploy the API (the migration runs, every timesheet starts dirty), then the site.
- The first sweeps pull the approved backlog onto drafts. Nothing is issued or emailed.
