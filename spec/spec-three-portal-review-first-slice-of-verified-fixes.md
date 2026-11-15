# Spec: Three-portal review — first slice of verified fixes

## Context
The Opulence Reconciled Three Portal Review (v1.1, 15 Nov 2026) groups 69 observations from the venue, company manager and officer portals into 25 themes (R01–R25). It asks for verified faults to be fixed first and for policy questions to be settled before any larger redesign. A check against the current app confirmed four faults that can be fixed safely now. This spec covers only those, plus the P0 reporting item. The remaining themes stay with the review and will be planned separately.

## Goals
- No report page can ever leave an officer on a blank screen (R01, P0).
- An officer's contract task never leads nowhere (R09 / E05).
- Venue analytics never draws a conclusion from no data (R19 / V12 / E09).
- The repeating staffing request form works on a 390px phone (R22 / V01).
- Back from Availability is sensible even when that page is opened directly (R03 / E10).

## Functional requirements

### 1. Incident reporting reliability (R01, O01, O02)
- Before any change, open each report type (including Medical) on the live app with a test account, without submitting anything. If Medical (or any type) still fails, find and fix the actual cause.
- Every report page (new report, draft, view/sign) gets a recovery screen in case anything fails while the page is drawing. The screen says something went wrong, keeps any draft already saved, and offers **Back to your shift** (or the page the person came from) and **Try again**.
- The fault is logged with the page, the report type and the app build, so it can be traced.
- The same recovery applies to officer, manager and venue views of a report.

### 2. Contract task with no contract issued (R09, E05, CM15/16)
- If the officer has no issued contract, their task reads **"Waiting for the office to send your contract"**. It is shown as the office's step, not theirs: no "Sign" wording and no dead-end link.
- Company managers see **Issue contract** for that person wherever onboarding steps are listed, linking to where contracts are issued.
- Once a contract is issued, the officer's task opens **that exact contract** to sign. After signing, the task clears once and doesn't come back.
- Venues see nothing new.

### 3. Busiest hour with no incidents (R19, V12, E09)
- When the selected period has no incidents, there is no "Busiest hour" line. A plain **"No incidents in this period"** shows instead.
- With data, the busiest hour is shown as now. On a tie, the earliest hour is shown.
- The same rule applies wherever this strip appears (venue and company analytics).

### 4. Repeating staffing request on phones (R22, V01, V08)
- At 390px each repeating day (day, start, finish, headcount) fits without sideways scrolling, overlapping or clipped inputs. If needed, a day's row wraps onto two lines.
- Above Submit, a one-line summary in plain words, e.g. "Every Fri and Sat, 22:00–04:00 (overnight), 2 officers, from 21 Nov".
- One-off requests and desktop layout are unchanged.

### 5. Back from Availability opened directly (R03, E10)
- When Time off / Availability is opened without a previous page (from a notification or a reload), Back goes to **Shifts** when the Availability tab is open and to **Me** otherwise, labelled to match.
- Switching tabs inside the page does not create extra Back steps.

## Cross-portal impact (per review section 11)
| Item | Company manager | Officer | Venue manager |
|---|---|---|---|
| 1 | Report review shows the same recovery. No change to review states | Recovery and return to the shift. Drafts kept | Same recovery on permitted report views. No access change |
| 2 | Sees "Issue contract" for people waiting | Waiting state, then opens the exact contract | No direct UI change (staff contracts are private) |
| 3 | Same empty-state rule on company analytics | No direct UI change (no analytics) | Empty period says so plainly |
| 4 | Received requests unchanged | No direct UI change | Form fits on phones and shows a summary |
| 5 | No direct UI change | Back target is correct | No direct UI change |

## Acceptance criteria
- Every report type opens on the live app at phone and desktop width. A forced fault on a report page shows the recovery screen, not a blank page, and Back to your shift works.
- Test officer with no contract sees the waiting wording and no Sign link. The manager sees Issue contract. After issuing, the task opens that contract. After signing, the task is gone and stays gone.
- A venue period with zero incidents shows "No incidents in this period" and no busiest hour. A period with incidents shows the correct hour.
- Repeating request at 390px: no horizontal scroll, all inputs usable, and the summary matches the entered days, times and headcount.
- Availability opened from a notification: Back goes to Shifts.
- Checks are made from each affected account (company, officer, venue), including the "no change" portals.
- A What's new card is added in Audit → What's new, with its own picture.

## Constraints
- Use test records only. No real incidents, contracts or requests are submitted.
- No change to who can see what, to approval or pay rules, or to the handover composer that already works.
- Old links (including `Me#contracts` in older notifications) keep working.

## Out of scope
- Every other theme in the review (R02, R04–R18, R20, R21, R23–R25 and the redesign of R03 and R22 beyond the items above), and its policy questions (grace periods, sign-off, who completes a shift, eligibility). These remain in the review for a later consolidated register.
- Reconciling with the "earlier OpenKBS brief" (E01–E24). That document is not in the project, so the review's own crosswalk is treated as the record.
