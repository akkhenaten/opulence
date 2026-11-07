# UI / UX review — Opulence app (desktop + mobile)

## Context
You asked for a page-by-page review of layout and controls before any changes are made. **Nothing has been changed yet.**

How this was checked:
- **Rendered:** the live build at 1440×900, 1280×720 and iPhone 14, against sample data. Covered sign-in, Company dashboard, Live operations and Orb's To approve.
- **From the code:** every other page, via a code read of its layout. Sizes are taken from the Tailwind classes; file:line references are on request.

The app already has good building blocks: `Page`, `PageActions` (moves extra actions into "…" on phones), `Tabs`, `Segmented`, `Sheet` (bottom sheet on phones), `ActionBar`, `Table` (cards on phones), and `useScrollMemory`. Most fixes are about using them consistently, not new design.

---

## The three highest-impact improvements

### 1. Put the officer's shift-time actions in one fixed place
**Pages:** officer Home, the shift page, Clock.

**Problem:**
- On Home, offer cards, "can't work" and SIA tiles stack above "Next shift". On a phone they push **Clock in** below the fold.
- On the shift page, the **Report an incident** tiles sit below the header card, Emergency card, instructions and quick actions, about 1.5 screens down.
- These are the two actions an officer needs at night, one-handed and in a hurry.

**Recommend:** a **sticky shift bar** above the tab bar whenever a shift is within the clock-in window, or the officer is on shift.
- Left: status ("On shift · since 21:02").
- Primary: **Clock in** / **Clock out** / **End break**.
- Secondary icon buttons: **Report incident** and **Emergency** (red).
- The same bar shows on Home, Shifts and the shift page.
- On Home, "Next shift" becomes the first tile. Banners shrink to one-line rows below it.
- On desktop (rare for officers) it stays a sticky bar at the bottom of the 2xl column.

### 2. Live operations: board first, Orb in its own tab on phones, one filter control
**Problem:**
- On phones the whole Orb queue renders **above** the board. The sample of 5 cards measured about 10 screens before "On site / Late / No-show".
- The board has **two controls for the same filter**: a chip row and a segmented control (All / On site / Issues / Due on / Finished).
- A 180px photo header sits on a working screen.
- The filter is lost when you leave and come back.

**Recommend:**
- **Tabs:** `Board` · `To approve (n)` · `Activity` · `Settings`.
  - On desktop (lg and up), keep Orb as the sticky right-hand panel on the Board, as today. The `To approve` tab only appears below lg.
- **Filter:** one row of chips with counts: `All` `On site` `Late` `No-show` `Issues` `Due on` `Finished`. Single select, kept in `?show=`.
- **Header:** no photo. The title plus a one-line "Updated 21:14 · refresh" in the subtitle.
- **Orb cards:** on venue-setup cards, issues collapse to their titles with a **Show details** inline expand. Select mode stays as built.

### 3. Lists keep their place, show their filters, and edit beside the list
**Problem:**
- Filters live in component state on Staff, Venues, Rota (week, venue, view), Timesheets (week, venue, officer), Cover (tab), Live, Reports and Analytics (range), Compliance, StaffProfile (tab) and TimeOff (tab).
- Open a record and come back, and the filters are gone.
- There is no visible "what's filtered" summary and no **Clear all**. Toolbars take about 4 rows on phones (Timesheets, Rota), around 200px before the first row.
- On desktop, every detail opens as a **centred modal** that hides the list. Timesheets, Rota shift, Live row and Cover are all inspect-then-act tasks done one after another.

**Recommend (one pattern, applied everywhere):**
- **Filters in the URL** with a small shared `useUrlState` hook (in `ui/nav.js`), so Back restores the filter and the scroll position together.
- **Toolbar shape:**
  - Desktop: the primary filter stays visible, usually a segmented status. The secondary filters (venue, officer, role) are inline selects.
  - Phones: the secondary filters go into a **`Filters (n)`** button that opens a bottom sheet with **Apply** / **Clear all**.
  - Under the toolbar, an **active-filter row** of removable chips ("Crown & Anchor ✕", "Officer: J. Smith ✕") plus **Clear all**.
- **Side drawer on desktop:** a `side` size for `Sheet` that slides in from the right (480px) from lg up.
  - The list stays in view and scrollable. ↑/↓ keys move to the previous or next record.
  - Phones keep the bottom sheet for quick decisions and use full screen for long forms (shift form, staff edit).
- **Unsaved-changes guard** in Sheet and form pages: "Discard changes?" on close, Escape, backdrop tap, tab switch or route change.

---

## Patterns used across the review
- **Tabs:** for sections of the same record.
  - More than 5 tabs on phones: replace the native "Section" select (it hides what exists) with a **horizontally scrolling tab row** that has an edge fade. Group so most records need 6 or fewer.
- **Segmented control:** for switching views of the same data (By day/venue/officer, Month/Week, Grid/List) and for one primary status filter of 5 or fewer options.
- **Separate page:** for long tasks or anything worth a direct link (shift page, invoice, pay run, incident form, procedure editor). These already are pages.
- **Buttons:** one primary per view.
  - Secondary actions that are used often stay visible. The rest go in **More (…)**. Danger actions go last in More, behind a confirm.
  - Row actions: one labelled action plus a "…" menu. Never icon-only for the primary.
- **Choosing options:**
  - 2–5 visible choices: segmented control or radio.
  - Several choices allowed: checkboxes or a multi-select chip group.
  - 6–15 options: a select.
  - Large sets (officers, venues once past about 15): a **searchable picker** (combobox in a sheet). Today only AssignSheet has search.
  - Switch only when it saves immediately. Inside a form with a Save button, use a checkbox. This affects VenueDetail Details "Active" and "Show on website".
- **Headers:**
  - Photo headers only on landing pages (Dashboard, officer Home, venue Overview), slim (96px phone / 120px desktop).
  - None on working pages: Live, Recruitment, On site.
- **Touch and keyboard:**
  - Targets at least 44px. Everyday filter pills and segmented options at 38px fall short.
  - A visible focus ring on chips and cards.
  - Every long-press action (message actions) also gets a "…" button.

---

## Page-by-page

| Page or task | Current friction | Recommended component and placement | Desktop behaviour | Mobile behaviour | Reason and priority |
|---|---|---|---|---|---|
| **App nav (managers)** | 27 Company items in 8 groups. Exceptions is missing for Company. Reviews is in no menu. | Add **Exceptions** under Operations with a count badge. Put **Reviews** under Clients & sites. Keep tab bar: Dashboard · Live · Rota · Incidents · More. | Collapsible sidebar as built; badges visible in the icon strip. | More sheet groups unchanged; badge totals on More. | Pages that can't be found can't be used. **High, small.** |
| **Dashboard** (managers): what needs me now | Header, install card and the 300px "Live now" tile push **Needs you** below the fold on phones. | Order on phones: **Needs you** (when not empty) → Live now → Tonight & tomorrow → the rest. Install card moves to the bottom and can be dismissed. Header action "Everyday" stays. | 2-column bento as now; Needs you top right. | Needs you first; Live now as a compact 3-number row. | First screen answers "what do I do next". **Medium.** |
| **Live operations** (managers) | See **Top 3 #2**. | Tabs `Board` · `To approve (n)` · `Activity` · `Settings`; one chip filter in the URL; no photo. Row → **side drawer** with primary **Open shift card**, secondary **Call**, More: **Set times manually**, **Review exception**. | Board plus sticky Orb panel; row details in a right drawer so the board stays visible. | Board first. Orb is its own tab with its count. Row detail is a bottom sheet. | Board is the main live task. **High.** |
| **Orb To approve** | Long venue-setup cards; approve label varies per card (good); Edit/Reject per card. | Keep **To approve / Decided** segmented and **Select**. Issues collapse with **Show details**. Card footer: primary (e.g. **Apply selected**), secondary **Edit**, ghost **Reject**. | Right panel at 400px; select-mode ActionBar as built. | Own tab; cards collapsed to about 1/3 of their height. | Fewer screens per decision. **High** (part of #2). |
| **Rota**: plan and fill shifts | Week, venue and view are local and lost on return. About 200px of toolbar on phones. Shift detail is a centred modal. "Copy last week" is a peer of "New shift". | Header: **New shift** as a split button ▾ (**New shift**, **Repeat shift…**, **Copy last week**). **Publish N** stays a visible soft button when drafts exist. Toolbar: week stepper + **Today**, segmented **Day · Venue · Officer**, and venue as a filter chip. All in the URL. | Shift detail in a side drawer (rota stays visible to compare cover). Shift form as a drawer too (lg size). | Week stepper on one line; view + **Filters (n)** on the second. Shift detail as a bottom sheet; shift form full screen with sticky **Save draft / Publish**. | Most-used manager screen; keeping the week and view matters. **High.** |
| **Rota → Requests** | Fine: Approve / Decline per row. | Add select mode + ActionBar (**Approve N** / **Decline N**) like Timesheets. | Same. | Same; ActionBar above tab bar. | Busy nights mean many requests. **Low.** |
| **Cover requests** | Tab is lost on return. "Staff it in the rota" opens the rota with no shift. Five tabs. | Segmented `To decide (n)` · `Staffing` · `Filled` · `Declined` · `All` in `?tab=`. Detail in a side drawer. **Staff it in the rota** opens `/rota?shift=id`. | Drawer keeps the list in view. | Bottom sheet; the accept options (All dates / First date, Offer as open) stay in it. | Removes a dead end. **Medium.** |
| **Exceptions**: approve flagged clock-ins | No Company nav entry. One-by-one approve only. | Nav entry + count badge. Cards get a checkbox; ActionBar **Approve N** / **Reject N** (reason sheet). Tabs `To review (n)` · `History` · `Phones (n)`, as now. | 2-column cards; selfie comparison side by side. | 1 column; checkboxes in select mode only (like Orb). | Bulk review after a busy night. **Medium.** |
| **Timesheets**: review and approve the week | About 4 toolbar rows, then a callout and week strip, before the first row on phones. Week, venue and officer are local. Desktop row actions are **icon-only**. Detail footer can hold **8 buttons**. Detail modal hides the table. | Toolbar: week stepper; segmented `All` · `Needs review (n)` · `Queried` · `No clock-in` (in URL); venue/officer selects on desktop, **Filters (n)** on phones; active-filter chips. Week strip collapses to one summary line (Hours · Charge · Pay) with **Show breakdown**. Row: labelled **Approve** (or **Sign off**) + "…" (Query, Decline, Set times, Edit times). Detail footer: primary by state (**Approve** / **Sign off**), secondary **Query**, More: Decline, Set times, Edit times, Reopen. | Table stays; detail in a side drawer with ↑/↓ to the next timesheet. Select + ActionBar as built. | Day cards as now; first card visible on screen 1; sheet with at most 3 visible buttons. | Weekly high-volume task; current layout costs taps and orientation. **High** (part of #3). |
| **Shift page** (manager view) | The log composer sits below 4–6 cards. Emergency card is full size for managers. 2 columns only at a large container width. | Order: header card (Emergency as a small red button in it) → **Instructions** (composer + Send) → **Log**. Team / Ejections in the side column from lg. Header More: **Shift chat**, **Site pack**. Keep **Manager view / Officer's view** segmented in the header. | 2 columns from lg (not @4xl). | Single column; instructions and log within the first two screens. | Managers come here to instruct and log. **Medium.** |
| **Shift page** (officer view) | Incident tiles about 1.5 screens down; tiles look disabled (grey) until 1h before the shift with no reason shown. | Sticky shift bar (#1) carries **Report incident** and **Emergency**. Incident tiles directly under the header card. Disabled tiles show "Opens 1 hour before your shift". | n/a (officer is phone-first). | Sticky bar above the tab bar; content order as above. | Safety-critical speed. **High** (Top 3 #1). |
| **Officer Home** | Banners push Next shift / Clock in down. Nothing sticky. | Next shift first; sticky shift bar during the window. Banners as compact one-line rows ("2 offers waiting ›") that open Shifts → Offers. | Same, 2xl column. | Clock in visible without scrolling. | **High** (Top 3 #1). |
| **Officer Shifts** | Calendar is the default even when offers are waiting. Month/Week is local. | Tabs `Calendar` · `My shifts` · `Offers (n)` · `Open shifts (n)`. Opens on **Offers** when any are pending, else Calendar. Month/Week segmented in `?view=`. Header: **Availability** (secondary), More: **Clock history**. | Same. | Same; offers keep large **Decline / Accept**. | Answering offers is time-bound. **Medium.** |
| **Clock** | Steps support "n of N" but don't show it. | Pass step numbers ("Step 2 of 4: Scan the venue code"). Everything else stays: big full-width buttons, inline flow, fallbacks. | n/a | As now. | Reassurance mid-flow. **Low.** |
| **Incident report** | Good: steps, autosave, sticky footer, step chips. | Keep. Add a guard if the officer leaves while a save is pending. | Sticky left step menu. | Step chips + sticky Back / Next. | Already strong. **Low.** |
| **Officer Profile** (personal & bank) | Long form; **Save details** is in the flow halfway down; no guard. | Floating **Unsaved changes · Save details** bar (the Settings pattern) + leave guard. Licence and rates move into a separate read-only section above the form. | Same. | Bar above the tab bar. | Prevents lost bank details. **Medium.** |
| **Officer TimeOff / Documents / Pay / Me** | TimeOff tab is local; otherwise fine. | TimeOff tabs `Time off` · `Weekly availability` in `?tab=`; Availability gets the save bar. Documents: **Add** primary kept; per-card **Open** + "…" (Delete). | Same. | Same. | **Low.** |
| **Learn / Toolbox / Emergency guide** | Emergency guide can't be reached from Learn. | Red **Emergency guide** card at the top of Learn (as on Toolbox). Guide frame unchanged. | Same. | Same. | One more route to it in a crisis. **Medium, tiny.** |
| **Everyday feed** | Filter and topic pills are about 30px tall; composer icons lose their labels on phones. | Pills at least 40px; horizontal chip row with an edge fade; composer icons get aria-labels and tooltips. | Same. | Same. | Touch targets. **Low.** |
| **Venues list** | Filters local; cards show no setup status. | Search + `Active` · `Inactive` · `All` in the URL. Card badge "Setup incomplete" (links to Site setup). Header **Add venue** primary. | Card grid; optional **Grid · List** segmented, with List as a table (name, client, address, officers this week, setup). | Grid of 2; badges visible. | Find gaps at a glance. **Medium.** |
| **Venue record** | A bento of about 400px sits above the tabs on phones. **9 tabs** become a native select. Details form: switches inside a Save form, no sticky save, no guard. | Compact header row (48px logo, name, address, Active pill; More: **Log feedback**, **Deactivate**). 6 tabs: `Setup` (location, codes, charge rates, then details) · `People` · `Instructions` · `Feedback (n)` · `Records` (Documents, Shift logs, Ejections & bans as a segmented inside) · `Analytics`. Geofence/Access tiles move into Setup. Details: checkboxes not switches; floating **Save changes** bar + guard. | Tabs as a row; Setup has a sticky in-page jump list on the left. | Scrolling tab row (no select); tabs visible within the first screen. | Most edited record after staff. **High.** |
| **Instructions & procedures** (venue tab) | Ticking a procedure off saves immediately but looks like a form checkbox. | Use a switch for on/off (it saves straight away). Per-row ↑/↓ + "…" (Open, Remove). Header split button **Create with AI** ▾ (**Write by hand**). | Same. | Same. | Correct control meaning. **Low.** |
| **Staff list** | Filters local. Photo cards show no role, SIA expiry or status, so staff can't be compared. Three filter rows on phones. | **Grid · List** segmented (List = table: name, role, SIA expiry, status, compliance). Status segmented visible; role and compliance into **Filters (n)** on phones; active chips + Clear all; all in the URL. | List view by default for comparing; grid optional. | Grid or list rows; a single filter row. | Daily lookup and comparing. **High** (part of #3). |
| **Staff profile** | **Up to 14 tabs**; tab not written to the URL; edit sheet is a long form with no guard. | 5 tabs, each with a segmented sub-view: `Overview` · `Compliance` (Compliance · Documents · Training) · `Work` (Shifts · Attendance · Availability · Time off) · `Pay` (Rates, statements) · `HR` (One-to-ones · HR notes · Contracts · Onboarding · Offboarding). `?tab=&sub=` synced. Header: **Edit** primary; More: Invite / Resend invite, Change status, **Suspend** (danger). | Tabs row; Edit in a side drawer. | Scrolling tab row; Edit full screen with sticky **Save** + guard. | Dense record people navigate often. **High.** |
| **Compliance** | Severity and area filters local; area segmented of 6 scrolls sideways. | Severity segmented (3) + area as a select. URL state; active chips. Per card: primary **Check right to work** / **Open profile**, More: Dismiss, Open in Live. Header: **Run check now** primary, More: **Weekly email**. | 2-column cards. | 1 column; filters in one row. | **Medium.** |
| **Recruitment** | Photo header on a working page. Kanban columns swipe sideways, so the position is easy to lose. | No photo. Phones: segmented `Applicants (n)` · `Onboarding (n)` · `Started (n)` instead of the swipe. Desktop keeps the 3-column kanban. Applicant sheet as a side drawer (`?applicant=` already). | Kanban + drawer. | One stage at a time; sheet full screen. | **Medium.** |
| **Invoices** | No primary action; 7-option segmented. | Header: **Bring up to date** primary, More: **Export**. Segmented `Draft (n)` · `Issued` · `Overdue (n)` · `Paid` · `All` + a select for Void / Credit notes. Search in the URL. | List as a table (number, venue, period, amount, due, status). | Rows as now. | **Medium.** |
| **Invoice detail** | Two primaries side by side (Issue + Mark paid); Delete and Credit note float at the bottom. | One primary by status (Draft → **Issue**; Issued → **Mark paid**). **PDF** secondary. More: Raise credit note, Delete draft (danger). Notes auto-save or join the save bar. | As now. | Primary visible, rest in "…". | Clear next step. **Medium.** |
| **Pay runs** | Statements sit below 4 tiles, an explainer and the runs list. | Tabs `Pay runs` · `Statements (n to issue)`. Tiles collapse into one summary line. Statements keep the checkbox + ActionBar (**Issue N**, **Mark N paid**). | Statements as a table with select. | Rows; status pill always shown. | Main pay task above the fold. **Medium.** |
| **Pay run detail** | "Invoices" link passes dates the Invoices page ignores. | Fix the link (or have Invoices read `start`/`end`). Header: primary by step (**Finalise** / **Issue N** / **Mark paid**); More: **Send for review**, **Delete pay run**. | As now. | Step labels: show the current step and "n of 4". | **Low.** |
| **Reports / Analytics** | Range is local; long pages. | Range segmented in the URL and **sticky** under the top bar; section jump chips (Money · Hours · Incidents · Clock-in proof · Overdue). | Sticky range row. | Range as a select; jump chips scroll sideways. | **Low.** |
| **Reviews** | Not in the nav; up to 4 inline buttons per row. | Nav entry. Row: **Publish / Hide** as a switch (saves straight away) + "…" (Edit, Move up, Move down, Delete). | Same. | Same. | **Low.** |
| **Feedback** | "+ Give feedback" sits in the toolbar. | Move it to the header primary. Filters already in the URL; add active chips + Clear all. | Same. | Same. | **Low.** |
| **Settings** | 8 tabs; switching tabs drops edits silently; immediate toggles and Save-form fields mixed on one tab. | 6 tabs: `Company` · `Users & access` · `Workforce rules` · `Templates & contracts` · `Notifications & email` · `Demo requests`. Guard on tab switch. Immediate settings grouped under a "Saves as you switch" caption; form fields keep the save bar. | Tabs row. | Scrolling tab row. | **Medium.** |
| **Audit log** | Search has no clear button. | Use `SearchInput`; search, record type and range in the URL. | Same. | Same. | **Low.** |
| **Messages / Email** | Message actions on long-press only (no keyboard or obvious route). | A "…" button on hover/focus of each message (desktop) and in the bubble (phone). Rest as now: two panes on desktop, list ↔ thread on phone. | Same. | Same. | Keyboard access. **Low.** |
| **Venue Overview** | Good: **Request staff** primary; secondary actions in "…". | Keep. Show **Needs you** (timesheets to sign, cover changes) above the tiles when not empty. | Bento. | On site tile + needs-you first. | **Low.** |
| **Venue Rota / Requests** | Good; form opens with sensible times. | Keep; requests list gets venue/status chips in the URL when there are several venues. | Same. | Same. | **Low.** |
| **Venue On site** | Photo header; no link through to the shift card. | No photo; rows open a sheet with **Open shift card** (read-only for venues), as managers have. | Same. | Same. | **Medium.** |
| **Sign-in and auth** | Works and reads well. | Keep. Add show/hide on the password field. | 2-column photo layout. | Photo band + card. | **Low.** |

---

## If approved: build order
Ship each phase as its own release (commit, deploy the api if touched, build, commit site/, deploy the site, push tags; stage paths explicitly). Each release adds its own What's new card with an AI picture.

1. **Shared pieces** in `app/src/ui/`:
   - `Sheet` `size="side"` drawer from lg, and a full-screen phone mode for forms, in `ui/index.jsx`.
   - A `useUrlState` hook next to `useScrollMemory` in `ui/nav.js`.
   - `FilterBar` (Filters (n) sheet + active chips + Clear all).
   - `SplitButton`.
   - `useDirtyGuard`, generalised from `pages/people/procedures/Editor.jsx`.
   - A scrolling `Tabs` row instead of the Section select.
2. **Officer shift bar:** `layouts/Shell.jsx` and the officer Home / Shifts / shift pages (`pages/officer/Home.jsx`, `pages/shift/ShiftView.jsx`, `pages/officer/Clock.jsx`).
3. **Live operations:** `pages/shared/Live.jsx` and `pages/manager/OpsAI.jsx`.
4. **Lists and drawers:** Timesheets, Rota, Cover, Staff, Venues, Compliance, Exceptions (`pages/shared/Timesheets.jsx`, `pages/manager/Rota.jsx`, `pages/manager/Cover.jsx`, `pages/people/Staff.jsx`, `pages/money/Venues.jsx`).
5. **Records:** Staff profile and Venue record tab grouping (`pages/people/StaffProfile.jsx`, `pages/people/_profileTabs.jsx`, `pages/money/VenueDetail.jsx`); Settings tabs.
6. **The rest:** finance pages, nav entries (`layouts/nav.js`), Dashboard order, and the low-priority rows.

Role checks are unchanged: venue logins never see staff pay, and the Pay tab stays behind `canSeePay`.

## Verification
- `npm run build` in `app/` (ui-lint, emergency and flow checks, vite).
- Local mock of the API, with list actions returning `[]`, to render each changed page at 1440×900, 1280×720 and iPhone 14 (390×844). Screenshots before and after.
- Keyboard pass on each page: tab order, focus ring, Escape closes the drawer, and ↑/↓ moves between records in the drawer.
- Filters survive opening a record and pressing Back.
- The dirty guard fires on close, tab switch and route change.
- `agent-browser close --all` after each session.
