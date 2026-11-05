# Implementation plan: venue feedback, customers per night, venue analytics

## Context
Venues can only rate officers 1–5, either when Orb asks after a shift or through "Rate staff". The office has no venue-wide feedback channel, no customer numbers and no view of patterns across venues.

The approved spec adds three things:
1. A "Give feedback" button for venues. Feedback can be about a staff member, a shift, the service or something else. It is seen by the office only; venues see their own feedback plus the office's replies.
2. A customer total for each night, entered by the lead officer.
3. A switchable **Analytics** module:
   - the office sees every venue they cover, and venues see only their own;
   - it covers lateness and absence, incidents, satisfaction, and customers and staffing.

Further decisions:
- Complaints notify the office in the app only, with no email.
- Officers don't see praise.
- No live data is changed; the new tables arrive by migration.

## 1. Database: `functions/api/db/migrations/036_feedback_analytics.sql`
- **New table `venue_comments`**, holding the new feedback:
  - Columns: `id`, `venue_id`, `about` (staff | shift | service | other), `officer_id` (nullable), `shift_id` (nullable), `rating` (1–5, nullable), `tone` (praise | suggestion | complaint), `comment`.
  - Status columns: `status` (open | resolved), `reply`, `replied_by`, `replied_at`.
  - Audit columns: `created_by`, `created_at`.
  - Indexes on `(venue_id, created_at)` and `(status)`.
- **On `shift_logs`:**
  - `customers int` (nullable, must be 0 or more)
  - `customers_by uuid`
  - `customers_at timestamptz`
- The existing `venue_feedback` table (officer ratings) is left unchanged.

## 2. API

### `modules/feedback.mjs` (new, registered in `index.mjs` imports and in `ACTIONS`)
**`comments.save`**
- Roles: venue, company, security. Body: `{venue_id, about, officer_id?, shift_id?, rating?, tone, comment}`.
- Checks:
  - `assertVenue` on the venue.
  - The officer or shift must belong to that venue. For staff feedback, the officer must have worked there in the last 30 days.
- Inserts the row.
- Staff feedback with a rating also writes a `venue_feedback` row, so it counts towards the officer's venue rating:
  - Use the same upsert as `feedback.submitAdhoc` (`ops.mjs:1309`), against the officer's most recent shift at that venue.
  - Move that query into a shared helper `rateOfficer(...)` exported from `ops.mjs` and reuse it in both places.
- Complaints and ratings of 2 or below call `createItem({kind:'feedback', … dedupe:'cmt:<id>'})` (`ops.mjs:39`). That puts them in the Orb inbox and notifies managers in the app. The payload carries `comment_id` and `about`.
- All other feedback sends `notify` to `companyManagers()` and `securityFor(venue)`: kind `feedback`, link `feedback`, no email.
- Calls `audit`.

**`comments.list`**
- Roles: company, security, venue. Results are scoped with `venueScope`; venues see only their own.
- Filters: venue, about, tone, status, from/to.
- Officer names come from `officerName('o')` for the office. Venues get the "First L." form.

**`comments.reply`** (MGR)
- Body: `{id, reply, resolve}`.
- Saves the reply and status.
- Notifies the person who wrote the feedback. The link is `/venue/feedback`.
- When the feedback was about staff, it offers `hr_note`, in the same way `decideFeedback` does at `ops.mjs:764`.

**`ops.decide` for a feedback item**
- If the payload has `comment_id`, approving it marks that comment resolved.

### Customers: `modules/shiftlog.mjs`
**New action `shiftlog.customers`**
- Roles: officer, company, security, venue. Body: `{shift_id, customers}`.
- Who may set it:
  - The lead officer, from clock-in until 12 hours after the shift ends (reuse `canCurate` / the `is_lead` logic at `:33` and `:43`).
  - A manager.
  - A venue user in scope, until 7 days after the shift.
- Upserts the `shift_logs` row and calls `audit('shift.customers', …, {from, to})`.

**Other changes**
- `shiftlog.sign` also accepts an optional `customers`.
- `shifts.detail` returns `log.customers` and `me.can_count`.

### Analytics: `modules/analytics.mjs` (new; switchable module)
- Add `'analytics'` to `MODULES` in `lib/modules.mjs`. Each action calls `requireModule('analytics')`.
- One action: **`analytics.venue`**, for company, security and venue.
  - Body: `{from, to, venue_id?, officer_id?}`.
  - Results are scoped by `venueScope`. A venue user is forced to their own venues, and `officer_id` is ignored for them.
  - Sections run in parallel. Each section also returns the previous period of the same length, so the screen can show the change.

**`attendance`**
- Counts by kind from `attendance_events` joined to assignments and shifts in range: late, no_show, left_early, cant_make_it.
- Average late minutes.
- Cover needed: `cover_requests` for shifts in range (001_init.sql:300).
- Breakdowns by venue, by officer (top 10), and by weekday (London time).

**`incidents`**
- Count by `type` (labels from `TYPES` in `incidents.mjs:14`), by severity, by hour of `occurred_at` (London), and by month.
- Customer bans created in range, from `customer_bans`.
- Incidents per 1,000 customers, calculated only over shifts that have a customer count.

**`satisfaction`**
- Average rating, combining `venue_feedback` and `venue_comments` ratings.
- Average rating by month.
- Counts of praise, suggestions and complaints.
- Open complaints.
- Officer averages per venue (top and bottom 5).

**`customers`**
- Customers per night, as a series by date.
- Average customers by weekday.
- Customers per officer on duty (count ÷ clocked-in officers).
- Hours worked, from `timesheets`.
- Shifts filled vs headcount.

**Names**
- Office users see names via `officerName`. Venue users see "First L."

**`analytics.options`**
- Returns the venues and officers in scope, for the filters.

## 3. App (`app/src`)

### Feedback
**`pages/venue/_feedback.jsx`: new `GiveFeedbackSheet({ venueId?, shift? })`**
- Step 1: choose what it's about (Staff, Shift, Service, Other), shown as Segmented-style big buttons.
- Step 2:
  - Officer picker (from `feedback.recentOfficers`) or shift picker.
  - Optional star rating, reusing the `Stars` pattern from Reviews.
  - Tone segmented: Praise, Suggestion, Complaint.
  - Comment Textarea.
- Opened from a shift, the shift and officer are pre-filled.

**Where the sheet is opened**
- **VenueDashboard** (`pages/money/VenueDashboard.jsx:42`): a "Give feedback" action next to "Rate staff".
- **Shift rows on the dashboard:** a small IconButton on each row.
- **ShiftView `QuickActions`** (`pages/shift/ShiftView.jsx:151`): for venue users.

**New page `pages/money/Feedback.jsx`** (routes `feedback` for company, security and venue in `main.jsx`)
- Filters with Segmented and Select controls, and a list of feedback cards.
- Each card shows the tone pill, the stars, what it's about and the comment.
- Managers get a Reply/Resolve sheet.
- Venues see their own feedback and the replies.

**Nav (`layouts/nav.js`)**
- "Feedback" with a `MessageSquareHeart` icon:
  - company under Clients & sites
  - security under Sites
  - the venue list

**Orb inbox (`pages/manager/OpsAI.jsx:88`)**
- For items with `payload.comment_id`, show the about/tone line and the comment.

### Customers
**ShiftView `LogSection`**
- A "Customers tonight" card, shown when `me.can_count` is true:
  - A number Input and a Save button, which call `shiftlog.customers`.
  - It shows the saved value and who entered it.
- Venue users see the value and can correct it within 7 days.

**`SignSheet`** (`ShiftView.jsx:349`)
- Adds a "Customers tonight" Input, pre-filled from the saved value.
- A gentle hint appears when it is empty; it doesn't block signing.

### Analytics
**New `pages/money/Analytics.jsx`, exporting `AnalyticsView({ venueId?, fixedVenue })`**
- Filters:
  - Date presets: add "Last 4 weeks" to `PRESETS` and `presetRange` in `pages/money/_parts.jsx`. Analytics uses it as the default; Reports keeps its own default.
  - Venue and officer Selects from `analytics.options`. These are hidden when the venue is fixed.
- **Four sections**, each a `Bento` of `Stat` tiles (with the change vs the previous period as the hint) plus charts:
  - **Attendance:** `HBars` by venue and officer, `Columns` by weekday.
  - **Incidents:** `HBars` by type and severity, `HourStrip` by hour, `Columns` by month.
  - **Satisfaction:** a monthly `Columns` of average rating, tone counts, and an officers list.
  - **Customers:** `Columns` per night and by weekday.
- Charts reuse `HBars`, `Columns` and `HourStrip` from `pages/money/_parts.jsx:36-110`. No new chart library.
- Each tile links to the list behind it: incidents, the feedback page with a filter, or the rota.

**Where Analytics appears**
- Routes:
  - `analytics` for company and security (full view).
  - Venue: `analytics`, showing their own venue only.
- Nav: an "Analytics" entry with a `LineChart` icon and `module: 'analytics'`:
  - company under Reporting
  - security under Sites
  - the venue list
- **VenueDetail** (`pages/money/VenueDetail.jsx:56-71`): an "Analytics" tab, shown when the module is on, rendering `<AnalyticsView venueId={v.id} fixedVenue />`.
- **Venue home:** a compact "This month" tile on VenueDashboard with rating, incidents, lates and average customers, linking to `/venue/analytics`.
- **Settings** (`pages/people/Settings.jsx:247`): add `{ key:'analytics', label:'Analytics', hint:'Lateness, incidents, satisfaction and customer numbers by venue' }`.

## 4. Tests (`functions/api/test/`)
- **`analytics.test.mjs`:** pure helpers moved into `lib/analytics.mjs`:
  - `pctChange`
  - `per1000(incidents, customers)`, which returns null when there are no customers
  - `weekdayBuckets`
  - `prevRange(from, to)`, giving the same length immediately before
- **`feedback.test.mjs`:** validation helper `checkComment(body)` covering:
  - the allowed about and tone values
  - rating from 1 to 5 or null
  - a comment is required unless a rating is given
  - the length limit

## 5. Verify and ship
1. Run `cd functions/api && npm test`, and run `node --check` on the new modules, plus an import check of `index.mjs`.
2. Run `cd app && npm run build`; the UI-lint count must stay at 67 or below.
3. **Mock check:**
   - Extend `/tmp/mock/server.mjs` with:
     - `analytics.venue` and `analytics.options`, using realistic sample numbers
     - `comments.list`, `comments.save` and `comments.reply`
     - `feedback.recentOfficers`
     - `shifts.detail` with `can_count`
   - Screenshot at 1280 and 390:
     - venue role: dashboard with Give feedback, the feedback sheet, Feedback and Analytics
     - company role: Analytics with filters, the VenueDetail Analytics tab, Feedback reply
     - officer role: ShiftView with the customers card and the sign sheet
   - Then run `agent-browser close --all` and stop the servers.
4. **Deploy:**
   - Commit "feat: venue feedback, customers per night, analytics module", ending with the Co-Authored-By line.
   - `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`, then `git push origin master --tags`.
   - The migration runs on the first request.
   - Curl the live bundle for the "Analytics" and "Give feedback" strings.
5. Make no live data changes and send no test feedback on live. The Analytics module is on by default (a module is on unless switched off).
