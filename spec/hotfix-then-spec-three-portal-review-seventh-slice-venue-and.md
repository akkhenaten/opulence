# Hotfix, then Spec: Three-portal review, seventh slice: venue and officer screens that say where you are and what's next

## 0. Hotfix first (ships on its own, before slice 7)
- **Fault:** the company Timesheets page crashes on the live site (v202) for company and security managers.
- **Cause:** my slice 6 edit made the week summary (`WeekStrip`, `app/src/pages/shared/Timesheets.jsx:256`) read `toReview`. That value only exists inside `Timesheets()` at line 92. My browser check ran before that edit, so it missed this. Venue managers are not affected.
- **Fix:** pass `toReview` into `WeekStrip` as a prop (lines 211 and 254). No rule changes.
- **Release:**
  1. Build, then check company Timesheets at 390 and 1280: the page loads, the "N to review" chip and the Needs review tab agree.
  2. Commit "fix: …", then commit the build.
  3. Check the Opulence API id is in the bundle.
  4. Deploy the site (v203) and push.
- No API deploy and no What's new card: this fixes slice 6, it doesn't release anything new.

## Why slice 7
Slices 4–6 were mostly for company managers. The checks for this slice found that venue managers and officers still meet four problems:
- **Mixed request wording (venue):** the same staffing request is called "request staff", "request cover", "booking", "booked cover" and "cover". One-off requests show no summary before they are sent, and request cards only show the first date.
- **Dead ends (venue):** Billing tabs show filter bars with nothing behind them. Analytics opens Incidents or Feedback for the period but gives no way back, and clearing a filter in Feedback drops the venue.
- **Wrong titles and Back links:** about ten screens have a title that doesn't match the menu item that opens them, or a Back link that goes to a fixed place.
- **Officer screens:**
  - If the profile fails to load, Me loses its Account section, including sign-out.
  - Home puts the big "Nothing booked" tile above "You can't work shifts right now".
  - Lists still loading look the same as "nothing to do".
  - Counts roll up from 0 every time they refresh.

Review themes: R22 (V08, V09), R15 (V04–V07), R19 (V13), R03 (CM26, V03, V11, V17, O05, O06, E18, E22), R02 (O03, O04), R23 (E19 officer Home, E24).

## Who it's for
- **Venue managers:** one name for asking for staff, a summary before sending, billing tabs that only show what applies, and a way back from analytics.
- **Officers:** Me that can always sign out, a Home that leads with what stops them working, and screens titled as they were tapped.
- **Company managers:** the same request wording on Cover, and correct titles on Incidents.

## Scope

### 1. Staffing requests: one name, one summary (R22)
- **One name everywhere:** "Staff request".
  - Buttons say "Request staff". The form title is "Request staff", and the submit button is "Send request".
  - The company page and tab stay "Cover requests", because company managers fill them as cover.
  - "Booking" and "booked cover" become "request" in venue wording.
  - The status labels become one set: Waiting for reply / Being staffed / Staffed / Cancelled.
  - "Shift requests" (officers asking for shifts) is a different feature and keeps its name.
- **Summary before sending, one-off and repeating:**
  - One-off: "Fri 21 Nov, 22:00–04:00 (overnight), 2 door staff".
  - Repeating: today's summary, with the chosen role instead of "officers".
  - This reuses `patternSummary` in `app/src/pages/manager/_cover.jsx:23`.
- **Each request card**, on the venue list, the venue detail and the company Cover list, shows the same one-line summary under the title.
- **Unchanged:** the request form fields, how requests are filled, and who can send or change them.

### 2. Venue billing that only shows what applies (R15)
- **Timesheets (venue):**
  - The All / On site / To sign / Queried bar shows only when the week has at least one timesheet.
  - With none, the page shows one line: "No timesheets this week. Confirmed shifts show here once officers accept them."
  - Venues no longer see the "without a rate" and "signed, not paid yet" chips, which are office work.
- **Invoices (venue):**
  - The filter bar shows only once there is an invoice or credit note.
  - The Credit notes chip shows only when the venue has one.
  - Each empty filter adds a body line. For example, To pay: "Nothing to pay. New invoices show here when the office issues them."
- **Unchanged:** what is counted, totals, and failed-load messages (they still show).

### 3. Analytics links come back (R19)
- **Incidents and Feedback opened from venue or company Analytics** show "Back to Analytics" with the same period and venue. This uses the existing `from` / `from_label` Back pattern from Timesheets.
- **Clearing filters in Feedback** keeps the venue that was picked and clears only the period and tone.
- **"Late" and "Absent" on the venue Analytics page** link to Timesheets for that period, at the same venue.
- **The dashboard "This month" tile** opens Analytics already set to This month.
- **Unchanged:** the figures and how they are calculated.

### 4. Titles and Back links that match (R03)
- **Each page's title matches the menu or row that opens it:**

  | Page | Title or Back label |
  |---|---|
  | Venue Overview | Back label "Overview" |
  | Live | "On site" for venues while it loads |
  | Incident detail | Back label "Incidents" for company and security |
  | Officer Profile | "Profile and bank" |
  | Officer Documents | "Documents and licence" |
  | Officer Time off | "Time off and availability" |

- **Back goes where you came from**, falling back sensibly when a page is opened directly:
  - Officer Pay, Clock, Incidents and Help get a Back to Me.
  - Venue pack and Contract return to Home when opened from Home.
  - Time off keeps the same Back when you switch tabs.
  - Message thread, Quiz and the emergency guide's "Back to the app" return to the page you came from.
- **Venue info for venue managers:**
  - Overview gets a "Venue info" link (address, instructions, contacts, site pack).
  - On desktop it also appears in the sidebar, as it already does on phones.
- **Unchanged:** routes; every old link still opens.

### 5. Officer Me and Home (R02, R23, E24)
- **Me:** if the profile fails to load, the Account section stays (sign out, notifications, help, password) under the retry box.
- **Me and Home while lists load:** a short "Checking your to-dos…" line shows instead of nothing, so loading never reads as nothing to do.
- **Home order when not on a shift:**
  1. "You can't work shifts right now" and grace warnings
  2. Shifts to answer
  3. Next shift
  4. To do
  5. Install and notification cards, last

  "Nothing booked" becomes one line with "See open shifts", not a full tile.
- **Numbers:** counts show their value straight away. They no longer roll up from 0 on refresh, though the first appearance can still animate.
- **Unchanged:** what is shown, readiness rules, and when someone can work.

### 6. What's new card
A new top card with its own picture, covering sections 1–5 in business wording. It says the request wording changed, so venue staff recognise it.

## Decisions for you (not built in this slice)
- **Who should see Demo requests** (R12, from slice 5).
- **The unchecked-licence rule** (from slice 4).

## Out of scope
- The people and access workspace (R04), course versions (R20 E08) and contract clause review (R09 advanced).
- Venue phone tabs: Rota is already a tab, so this slice adds no change to which tabs show.
- Any change to pay, sign-off, approval, eligibility, visibility, request-filling or Orb budget rules.

## Constraints
- Test records only. No real request is sent, changed or cancelled.
- Old links keep working. Live builds call Opulence's API (6ij75…). Commit before deploying.
- The API change is limited to the summary and status labels the request lists already return. If the summary can be built in the app, there is no API change.

## Acceptance checks
- **Requests:**
  - One-off and repeating test requests show the summary before sending and on every card.
  - No venue screen says "booking" or "cover" for a request.
- **Billing:** a test venue with no timesheets or invoices sees one line each and no empty filter bars. With data, the filters return.
- **Analytics:** Incidents and Feedback opened from Analytics show Back to Analytics with the same period and venue, and Back restores them.
- **Titles and Back:** each listed page shows the matching title, and Back returns to its origin, including when the page is opened directly.
- **Officer:**
  - With the profile load forced to fail on the mock, Me still offers sign out.
  - Home shows "You can't work shifts right now" above Next shift, and "Nothing booked" is one line.
- **Layout:** phone (390) and desktop (1280) layouts hold, and loading and failed states stay truthful.

## Verification (how I'll check)
- Mock server: add request records (one-off and repeating), an empty and a populated venue week, a failing `officers.get`, and analytics links.
- agent-browser at 390 and 1280 for venue, officer and company.
- Run `npm test` in `functions/api` and `npm run build` (ui-lint must stay ≤70).
- Release:
  1. Commit, then deploy the function if it changed.
  2. Commit the build and check the API id.
  3. Deploy the site and push.
