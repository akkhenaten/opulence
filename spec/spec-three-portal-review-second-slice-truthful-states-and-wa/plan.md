# Spec: Three-portal review, second slice: truthful states and ways back

## Why
The first slice fixed the review's hard faults (blank report pages, the contract dead end, false busiest hour, phone overflow). What remains from the review's findings are screens that **tell people something untrue**:
- A section that failed to load looks like "nothing to do" or "All clear".
- Set-up steps read as already done.
- "Past shifts" shows upcoming ones.
- Empty billing tabs say "try another filter".
- Invoice amounts don't say whether VAT is included.

There are also **ways back that lead somewhere unexpected**: Back labels and targets, venue Rota and venue info hidden on phones, and Analytics links that lose the venue and period. This slice makes every screen accurate and every Back predictable. No business rule changes.

Covers review items R02, E06, E11, R03/E04, E18/E22, R19 (drill-through), R15, E16, R23/E19.

## Who it is for
- **Officers:** Me, Home, Shifts, Pay.
- **Venue managers:** Overview, phone navigation, Billing, Analytics.
- **Company managers:** Dashboard, Reports drill-through, invoice labels.

## Requirements

### 1. A failed load never looks like "nothing to do" (R02)
- On officer **Me** and **Home**, each section that loads its own data shows a compact "Couldn't load <section>. Try again" row with a retry button when that load fails. It must never silently disappear or show its empty message. This covers set-up steps, contracts, reports to sign, drafts, learning, venue packs and clock status.
- Venue **Overview** "Needs you" and the company **Dashboard** attention panel: if any count failed to load, show "Couldn't check: Try again". Never show "0" or "All clear".
- A successful load with nothing in it keeps today's empty or "All clear" wording.
- Data that loaded before stays on screen if a later refresh fails. A small "Couldn't refresh" note appears instead of wiping it.

### 2. Set-up steps say what to do (E06)
- Open steps are worded as actions: "Upload your SIA licence", "Sign your contractor agreement", "Add your bank details", and so on, one for every step.
- Completed steps keep the past-tense wording ("SIA licence uploaded").
- Steps owned by the office (verification, induction) keep their "Waiting for the office…" subtitle from slice 1.
- Managers see the same wording on a staff member's onboarding tab.

### 3. Officer Pay row is accurate (E11)
- The Me → Pay row description matches what the Pay page actually shows (statements). Rates stay on My details, and the My details row mentions them.

### 4. A real Past shifts view (R03/E04)
- "Past shifts" opens a **Past** view: the officer's worked shifts, newest first, from the last 6 weeks.
- **Show older shifts** loads earlier ones in 6-week steps until there are none left. (Default chosen; the alternative was a fixed 6-week window that says so on the page.)
- The page states the period shown ("Last 6 weeks").
- Empty state: "No past shifts in the last 6 weeks", with Show older still offered.
- The upcoming view's empty state stays "No upcoming shifts" and offers a link to past shifts.
- Shifts the officer declined or never accepted are not listed as past shifts. That matches today's rule; it is now stated on the page, not hidden.
- Old `?tab=mine` links keep working.

### 5. Back is labelled truthfully and returns to the right place
- Back always names the page it returns to, using that page's real heading.
  - Not "Week" from Rota → "Rota".
  - Not "Reports" for the incidents list when officers call it something else. The label matches what that user saw.
  - Not "Give feedback" → the feedback list title.
- Fallbacks when a page is opened directly from a link:
  - **Pay statement:** back to its own pay run, not all pay runs.
  - **Incident:** to the list as that role names it (officers: "Reports").
  - **Venue rota shift:** back to the venue Rota, not Logs.
  - **Goals agreement:** labelled "Goals and one-to-ones".
- Pages that share a hub's title get a distinct heading. For example, a shift page shows venue and date, not just the venue name.
- Old links keep working. History-based Back still wins over the fallback.

### 6. Venue navigation on phones (E18/E22)
- The venue phone bottom bar becomes **Overview, On site, Rota, Logs, More**. (Default chosen; the alternative was replacing On site or only adding an Overview tile.)
- Messages moves into More, and its unread count shows on the More button and on the Messages row inside More.
- **Venue info** gets its own row in More (as well as the account sheet), and has a Back.
- Desktop navigation is unchanged.

### 7. Analytics links keep their context (R19 drill-through)
- From venue Analytics and company Reports, opening incidents or feedback carries over the **venue and period** being looked at.
- The destination list shows that filter as a removable chip: "Riverside · 1–30 Nov ×".
- Back returns to Analytics or Reports with the same venue and period still selected.
- Opening the lists normally (no filter) behaves as today.

### 8. Billing says what each tab means (R15)
- Each Timesheets tab has its own empty message, for example:
  - "Nothing to sign this week."
  - "No one on site right now."
  - "No queried timesheets."
  - "No timesheets for this week."
  - "Try another filter" appears only when a search or filter the user typed is active.
- An empty week shows "No hours this week", not "0h · Charge £0.00" with a breakdown.
- Invoices tabs: "No unpaid invoices", "No credit notes", and so on, per tab.

### 9. Money amounts say net or gross (E16)
- Invoice lists, invoice detail, venue Overview "Outstanding" and the company draft hint label every amount:
  - Totals that include VAT read "£1,234.00 incl. VAT".
  - Pre-VAT amounts read "net".
  - On invoice detail, line amounts are headed "Net", and the totals block shows Net, VAT and "Total incl. VAT".
- Figures stay exactly as they are. Only the labels change.

### 10. Venue Overview puts what's next first (R23/E19)
- Order: **Needs you** (decisions) → **Next 48 hours** → everything else ("This month" and so on).
- The always-on tiles collapse: tiles with a value of 0 merge into one quiet line ("Nothing open: incidents, queries, …"). Non-zero tiles stay as tiles.
- Counters never animate up from 0 while still loading. They show a placeholder until the number is known.

### 11. What's new card
- A new top card dated with the release day, with its own AI picture. It is written for the business and covers: honest "couldn't load" messages, clearer set-up steps, Past shifts, Rota in the venue phone bar, Analytics links that keep the venue and period, clearer billing pages and VAT labels, and the reordered venue Overview.

## Out of scope
- Visibility, approval and pay rules; the handover composer.
- Deeper lifecycle and policy themes in the review: R04, R05, R09 lifecycle, R13 and similar. These come in a later slice.
- New filters on incidents or feedback beyond carrying over venue and period.
- Changes to amounts, VAT calculation or invoice numbering.
- Desktop navigation layout.

## Constraints
- Old links keep working, including `?tab=mine`, `/venue/site` and existing incident/feedback URLs.
- Testing uses test records only. Nothing real is submitted.
- Live builds call Opulence's API.

## Acceptance checks
- With a section's call forced to fail (locally), Me, Home, venue Overview and company Dashboard show "Couldn't load / Couldn't check" with a working Try again. They never show an empty message, "0" or "All clear".
- A new test officer sees action-worded set-up steps. Once each step is done, it shows the completed wording.
- Past shifts lists only past shifts, states the period, and Show older extends it. The empty state is right. `?tab=mine` still opens.
- From Rota, a shift's Back reads "Rota". A statement opened directly goes back to its pay run. An incident opened directly by an officer reads "Reports".
- Venue phone at 390px: the bar shows Overview, On site, Rota, Logs, More. More shows the Messages badge and Venue info. Venue info has Back.
- Analytics → incidents keeps the venue and period chip. Back restores Analytics with the same selection.
- Each empty Billing tab shows its own message. An empty week shows "No hours this week".
- Every invoice and outstanding amount is labelled net or incl. VAT, and the numbers are unchanged.
- Venue Overview order is Needs you → Next 48 hours → rest. Zero tiles are merged. There is no counting up from 0 during loading.
