# Implementation plan: Streamline the whole app: fewer pages, a cleaner nav (releases A–D)

## Context
The spec has been approved: fewer steps, no doubles and more options across the officer, manager, venue and platform
portals. This plan turns it into code in four releases, A to D, done safest first. Each release:
- ships on its own;
- gets its own What's new card and picture (`_whatsnew.jsx` + `whatsnew-images.mjs`, month 'November 2026', date
  2026-11-08);
- follows the usual release order: commit with explicit paths → `openkbs fn deploy api` → `cd app && npm run build` →
  `git add site/` + "build: site with …" → `openkbs site deploy` → live check that index-*.js has 6ij75kpgf7 and not
  hopedp5.

Throughout:
- Old URLs redirect; there are no DB deletes.
- One new migration (060), in release D only.
- Venue logins never get officer data or pay.
- The grace buttons stay on the SIA and RTW tiles.
- Never commit `spec/plan-the-compliance-cards-actually-refresh-after-orb-re-read/`.

Two corrections to the spec, based on what the code search found:
- `venueRequests.create` is still used, by its draft path from `messages/Thread.jsx:596`. Only the non-draft branch goes.
- There are no swap actions at all, so "Ask to swap" needs a small new action.

---

## Target layout: less cluttered (this overrides any conflicting detail below)

**Clutter rules for every screen**
1. One job, one place. Everything else links there and doesn't repeat it.
2. Group related pages as tabs of one page instead of separate nav items. Tabs use `useUrlState({tab})`, so deep links
   keep working.
3. Each page has at most one primary button.
   - Extra options go in the page's ⋯ menu (reuse the existing page-menu component, or add a small `Menu` to `app/src/ui/index.jsx` if there isn't one), never as new buttons, and the same goes for
     exports. Bulk actions appear only when rows are selected.
4. Home and Today cards appear only when there's something to do: no empty sections, no "nothing here" tiles.
5. Show no more than 3 actions on a card. The rest go in ⋯.
6. Empty tabs (module off, no permission) are hidden. A page with one tab shows no tab bar.

**Manager nav, company** (today about 22 items in 7 groups → 8 items, no groups):

| Item | What it holds |
|---|---|
| **Today** | Orb cards, Tonight and Week. Everyday becomes a tab here, as today. |
| **Messages** | Tabs: Chats, Email |
| **Rota** | Tabs: Week, Cover (from venues, open, offered), Shift requests, Exceptions |
| **Incidents** | Tabs: Reports, Ejections register |
| **Staff** | Tabs: Officers, Recruitment, Compliance, Contracts, Time off, Phones |
| **Venues** | Tabs: Venues, Clients, Site packs, Feedback (comments, ratings, reviews) |
| **Money** | Tabs: Timesheets, Pay runs, Invoices |
| **Reports** | Tabs: Reports, Analytics |

The footer/account area holds:
- **Learning** (Training, Toolbox, Help)
- **Settings**, with tabs incl. Orb, Audit, and **Platform** (Platform feedback, Staff setup, Demos; platform admins
  only)

**Security managers** get the same list. Tabs are gated per role and permission (no Money if not `can_see_pay`; no
Recruitment, Contracts or Clients).

**Venue nav** (today 13 items → 7):

| Item | What it holds |
|---|---|
| **Overview** | Dashboard |
| **On site** | Live |
| **Rota** | Tabs: Week, Cover requests |
| **Logs** | Tabs: Shift logs, Incidents, Ejections |
| **Feedback** | Tabs: Give feedback, Reviews, Analytics |
| **Billing** | Tabs: Timesheets, Invoices |
| **Messages** | Chats |

My venue (`/venue/site`) and the Emergency guide move to the account menu.

**Officer:**
- Bottom tabs stay Home, Shifts, Learn, Me.
- The header keeps Messages and the Bell. Everyday becomes a tab inside Messages, so its header icon goes.
- **Me** is cut to 4 rows (Documents & licence, Pay, My details, Time off & availability), plus Account. Growth,
  contracts and training sit inside those rows instead of their own sections.

**How this changes the releases below**
- **Release B** becomes "the new nav":
  - Build `app/src/ui/TabPage.jsx`, a page shell with a title, Tabs from a config, a ⋯ menu slot and one primary
    action.
  - Put each grouped page on it: `manager/RotaHub.jsx`, `people/StaffHub.jsx`, `money/VenuesHub.jsx`,
    `money/MoneyHub.jsx`, `shared/IncidentsHub.jsx`, `reports/ReportsHub.jsx`, `venue/LogsHub.jsx`,
    `venue/BillingHub.jsx`, `venue/FeedbackHub.jsx`.
  - Each hub mounts the existing page components unchanged, with their own headers hidden through a `bare` prop that
    each page gets.
  - Rewrite `nav.js` to the lists above.
  - All old paths go into `app/src/redirects.js` and map to the hub plus a tab.
  - Compliance, Exceptions, Cover, Timesheets, Pay, Invoices, Feedback and Reviews stop being nav items.
- **Release D options are trimmed so they add no clutter:**
  - Exports live only in ⋯ menus.
  - Bulk actions only show on selection.
  - Directions, Call office and Call venue become one "Get there" row on the shift page (no extra buttons on Home).
  - "Free this weekend?" only shows Wed to Fri when the officer has no weekend shift and hasn't answered.
  - The latest payslip shows only for 7 days after a statement is issued.
  - The next-step buttons replace existing links; they don't sit beside them.
  - Venue "Message the office", "Report a problem" and "Don't send again" sit in the ⋯ of the Live drawer and the
    Feedback sheet.
- **Release E (Reports + Analytics merge)** is now part of Release B, as the Reports hub.

---

## Release A: fixes and quick wins (`whatsnew` slug `streamline-fixes`)

**A1. Dual-role NFC tap clocks in**
- In `functions/api/modules/clockProof.mjs` `clock.tagTap` (208-238):
  - Before the manager branch, if `user.dual && user.self_officer_id`, look up that officer's assignment at this
    tag's venue that is open for clock-in. Use the same window as `auth.landing` (`auth.mjs:56-68`): -30 min to +2 h,
    or already clocked in.
  - If one is found, insert `tag_taps` for `self_officer_id` exactly as the officer path does, and return
    `{ tap_id, side: 'officer', ... }`.
  - The counter is still consumed once, so there is no reuse.
- In `app/src/pages/officer/TagTap.jsx`: when `r.side === 'officer'` and the current side isn't officer, `await
  switchSide('officer')` (`auth.jsx:60`) before `nav('/officer/clock?tap=…')`.
- Extract the window check into `officerShiftWindow(officerId, { venueId })` in `auth.mjs` and reuse it in both places.

**A2. Landing re-check on reopen**
- In `app/src/auth.jsx` `refresh()`: after `auth.me`, if `user.dual`, call `auth.landing`.
  - If it says officer and the side isn't officer, `setSide('officer')` and re-fetch `auth.me`.
  - Only switch towards officer. Never kick an officer back to the manager side.
- Do the same on `visibilitychange` → visible, throttled to once every 10 min.
- In `Shell.jsx:435`, render `<ShiftBar/>` when `isOfficer || user.dual`.
  - On the manager side, ShiftBar uses `clock.status` with `_as:'officer'`. Add an `as` option to `useApi`, or pass the
    body `_as`. ShiftBar already skips when there's no `officer_id`, so make it use `user.self_officer_id`.
  - Its links should point to `/officer/...` and switch side on tap.

**A3. Accept / Decline on the shift page**
- In the `ShiftView.jsx` Header, when `me.assignment_status === 'assigned'`, show Accept and Decline:
  - Accept is `api('shifts.respond', {assignment_id, accept:true})`.
  - Decline uses the existing `DeclineSheet` from `officer/_parts.jsx`.
- In `rota.mjs:117` `notifyAssigned`, set `link: '/officer/shifts/' + shift.id`.

**A4. Copy and link fixes**
- `Shifts.jsx:149`: change "My shifts" to "List".
- `Shifts.jsx:31`: "Clock history" becomes "Past shifts" and goes to `?tab=list&past=1`. Check that List supports
  past; if not, drop the menu item.
- `OpsAI.jsx:640`: change the toast to "Checks run — new cards are on Today".
- `Compliance.jsx:216`: update the copy to "Settings → Orb".
- `Email.jsx:114`: change the link to `?tab=notifications&part=email`.

**A5. Open a specific card from Compliance**
- `Dashboard.jsx` reads `?card=` and passes it through `Today` to `<Inbox focus={id}>`.
- In `OpsAI.jsx`, `Inbox` gives each card an id and passes `focus`. When the row with the focus id is there,
  `ItemCard` auto-expands and runs `scrollIntoView`.
- `Compliance.jsx:50` `openCard` becomes `nav(\`/${user.role}?card=${g.card_id}\`)`.

**A6. Venue "Needs you" → review**
- `VenueDashboard.jsx` timesheet tile/need links go to `/venue/timesheets?show=review`. Check that `Timesheets.jsx`
  honours `show`; add it to `useUrlState` if it doesn't.

**A7. Dead code**
- Remove the non-draft branch of `venueRequests.create` (`ops.mjs:1333+`). It now always returns the draft. Leave the
  `venue_requests` table and the card handling alone.
- Remove `venueRequests.list` (1399) and `timesheets.venueCheck` (`timesheets.mjs:382`).
- Remove the `venue_requests` toggle at `OpsAI.jsx:556`.
- Grep the tests and `orbCatalog.mjs` for these names first.

**Tests** (new file `functions/api/test/streamline.test.mjs`)
- The pure function `pickTapSide({dual, shiftOpen})`.
- That `notifyAssigned` builds a link to the shift. Export a tiny `assignedLink(shift)`.
- That the removed actions are absent from `ACTIONS`.

---

## Release B: one home for each thing (`streamline-one-place`)

**Manager**
- **Orb page**
  - `OrbPage` drops the Settings tab.
  - `/orb?tab=settings` gets a redirect to `settings?tab=orb`. Add this to `LiveRedirect` and make OrbPage redirect
    when `tab=settings`.
  - `OpsSettings` "Run checks" buttons are replaced by a link "Run checks on Today".
  - Compliance keeps its own "Check everyone" button, since `ops.complianceRun` is a different action.
- **Learning**
  - New `app/src/pages/team/Learning.jsx` with tabs Training (`Academy`), Toolbox (`ToolboxAdmin`) and Help (`Help`).
    Each is mounted as-is, and module gates hide tabs.
  - Routes `team/training` → Learning (`?tab=training`). Redirect `team/academy` → `team/training`.
    `team/toolbox` and `help` redirect to the matching Learning tab. The detail routes (`team/academy/:id`,
    `team/toolbox/:id`) stay.
  - Fix the in-page `team/academy` links in `Academy.jsx:49,67,70`.
  - `nav.js`: remove the Resources group. Training becomes "Learning".
- **Staff is one page with tabs** (`people/Staff.jsx`, `useUrlState({tab})`):
  - **Officers** (today's list).
  - **Recruitment**: mounts `Recruitment` as-is. The `recruitment` route redirects to `staff?tab=recruitment`. A
    hired applicant row gets "Open profile" and "Roster them".
  - **Contracts**: the cross-staff list of issued and drafts from `StaffContracts.jsx`, for chasing unsigned ones.
    `people/contracts` redirects here.
  - **Phones**: moved from Exceptions (see below).
  - **Time off**: mounts `TimeOff`. `hr/time-off` redirects here.
  - Company-only tabs are hidden for security, as today.
  - Nav People group becomes: Staff, Staff setup (platform), Learning, Compliance.
- **Contracts are drafted inside the staff profile; templates stay reusable**
  - Settings → "Templates & contracts" stays the home of the reusable templates and library (`esign`, `library`
    parts), unchanged.
  - Staff profile Contracts section (`_profileTabs.jsx` ~898) gets a "Draft a contract" button:
    1. Pick a template.
    2. Create the AI draft through the existing draft action the Workspace uses (`contracts.draft.*`), with
       `officer_id` prefilled.
    3. Open the workspace at a new nested route `staff/:id/contracts/draft/:draftId`, which renders the same
       `ContractWorkspace` component.
    4. Back returns to the profile.
  - The old `people/contracts/draft/:id` route stays as a redirect: load the draft, then go to its officer's nested
    route, or render as-is if the draft has no officer.
  - The drafts list in the Staff → Contracts tab links to the nested route.
  - Check: confirm `contracts.draft.create` accepts `officer_id`/`template_id`. If it doesn't, add those params (the
    server only, with no schema change, if the draft row already has `officer_id`; otherwise migration 060 adds it and
    Demos becomes 061).
- **Venues and Clients: one page with tabs**
  - `money/Venues.jsx` default export renders Tabs **Venues / Clients / Site packs** (`?tab=`).
  - Venues and Clients are the existing two components.
  - `clients` redirects to `venues?tab=clients`.
  - Drop Clients and Site packs from the nav. The group "Clients & sites" becomes Venues, Feedback.
- **Site packs live inside Venues only**
  - Venues → Site packs tab mounts `procedures/Library.jsx`: the overview of who has signed what, plus the shared
    procedure library, since procedures are reused across venues.
  - Each venue's own pack stays in VenueDetail → Pack (`VenuePackTab.jsx`), with a link "Edit shared procedures" to
    the tab.
  - `people/procedures` redirects to `venues?tab=packs`. Move `people/procedures/:id` (editor) to
    `venues/procedures/:id`, and redirect the old path.
  - Security managers keep their access through the same Venues page.
- **Messages**
  - `Messages.jsx` gets top tabs Chats / Email (company with email on) / Everyday, rendering `Email` and `FeedBody`.
    Use the same pattern as `Settings.jsx` TABS.
  - `email` → `messages?tab=email`, and `everyday` → `messages?tab=everyday`. Update `EverydayRedirect`.
  - The `email/:account/:thread` and `email/callback` routes stay.
  - Remove Email from the nav.
- **Feedback**
  - `money/Feedback.jsx` gets tabs Comments / Ratings / Reviews.
    - Ratings is a new list over `venue_feedback`. New action `feedback.list` (MGR), ratings by venue and officer;
      company sees everything, security sees its own venues.
    - Reviews renders `Reviews`.
  - `reviews` → `feedback?tab=reviews`. Drop Reviews from the nav.
- **Exceptions**
  - The Phones tab moves out of `Exceptions.jsx` into Staff → Phones (`staff?tab=phones`).
  - Redirect `exceptions?tab=phones` there.
- **Audit**
  - The "What's new" tab stays.
  - The splash's "See all" links to it, with no duplicate list logic.

**Officer**
- **Emergency**
  - New `app/src/pages/guide/EmergencyCard.jsx` with one card, "Emergency": the main button opens the S00 guide, and
    a secondary link "Flowchart" appears when `flow_visible`.
  - Replace the pair on `Learn.jsx:20-21`, `Toolbox.jsx:25-26` and `ShiftView.jsx:138`.
- **Learn**
  - Learn gets a "Help" row linking to `/officer/help`.
  - The Toolbox category grid on Learn is kept, and the Toolbox page header grid is removed. The page shows only the
    selected category's cards.
  - Remove the Help row from Me.
- **Profile and Pay**
  - Remove the Licence section from `Profile.jsx:146-158`.
  - Move "My pay rates" (162-167) into `Pay.jsx` `Statements` as a "My rates" card. It reads `officers.get` rates, the
    same source Profile uses.
- **Everyday**
  - Remove the Home tile (`Home.jsx:249`) and the Me row (`Me.jsx:169`). The header icon stays.
- **Shift card**
  - Make one shared `ShiftSummary({ s, me, actions })` in `officer/_parts.jsx`, used by Home Hero, the Shifts List card
    and the ShiftView Header.
  - "I can't work this" lives only in ShiftView and List. Home Hero links to the shift page once (remove the duplicate
    link at `Home.jsx:168/192`).

**Venue**
- **Feedback**
  - Merge everything into one `FeedbackSheet` in `venue/_feedback.jsx`:
    - Step 1: "How was the night?" for a pending shift, using `feedback.submit`. With no pending shift it skips to
      per-officer ratings, using `feedback.submitAdhoc`.
    - Step 2: optional comment, using `comments.save`.
  - `FeedbackTile`, `RateStaffSheet` and `GiveFeedbackSheet` become thin wrappers that open it at the right step, so
    `ShiftView`, `Feedback`, `VenueDetail` and `VenueDashboard` keep working.
  - The venue Feedback page gets a Reviews tab. The `reviews` route redirects there.
- **Dashboard**
  - Remove the "Cover requests" section from `VenueDashboard.jsx:136-140`. The Cover tile stays and links to Rota →
    Requests.
- **Old URLs**
  - `/venue/cover` and `/venue/requests` redirects are already in place; keep them.

**Platform**
- `Platform.jsx` gets tabs Feedback / Settings / Staff setup / Demos, mounting `StaffSetup` and `DemosTab`. Export
  `DemosTab` from `Settings.jsx` or move it into `platform/Demos.jsx`.
- `staff-setup` → `platform?tab=setup`, and `settings?tab=demos` → `platform?tab=demos`.
- Gate the tab with `perm:'platform'`, like nav.
- Update the `demo.mjs` notify link.

**Tests**
- A route table test: import a small `REDIRECTS` map exported from a new `app/src/redirects.js` and check that each
  old path maps to a live path. Run it with `node --test` from `functions/api`, or as a tiny app test using a plain
  import.
- A `feedback.list` role test, using the pure scope helper.

---

## Release C: fewer steps (`streamline-fewer-steps`)

**Officer**
- **Site packs on Home**
  - `Home.jsx` To do loads `venuePacks.myList`, and lists every venue whose `status ∉ {none,current}` and has a
    `next_shift` within 14 days: "Read the site pack for {venue} before {day}", linking to
    `/officer/venue-pack/:id`.
  - The Hero shows a small amber line when the next shift's venue pack isn't OK.
- **Upload from a warning**
  - `Documents.jsx` reads `?add=` (`useSearchParams`) and uses it as the initial `adding`.
  - Home rows (`:113`, `:233`) link to `/officer/documents?add=sia|rtw|<kind>`.
- **Open shifts**
  - Home OpenShifts cards get a "Request" button: `shifts.request {shift_id}`, then a toast and refetch.
- **Quick incident**
  - The ShiftBar "Report" button opens a `QuickIncidentSheet` (new, `shared/QuickIncident.jsx`) with a type Segmented
    and a single line of text.
  - It calls `incidents.draftSave {data:{shift_id, type, summary}}` with toast "Saved — finish it later".
  - "Write it now" opens `incidents/new?draft=id`.
  - Check that `cleanDraft` keeps `type` and `summary`, and match `IncidentForm`'s field names.
  - Home To do lists `incidents.drafts` as "Finish your report".

**Manager**
- **Cover**
  - `Cover.jsx` gets tabs From venues (current list) / Open shifts / Offered. Open shifts uses a `shifts.open`
    manager view, or the Rota open filter if that exists; otherwise reuse the Rota list with `?open=1`. Offered uses
    `ops.inbox` cover cards.
  - Rename the Rota tab label 'Requests' to 'Shift requests' (`Rota.jsx:108`).
  - After `cover.accept` (`Cover.jsx:86`) returns the created shift ids, open `AssignSheet` for the first one. Export
    `AssignSheet` from `Rota.jsx`, and make `cover.accept` return `shift_ids`.
- **Pay chain**
  - Remove "Bring up to date" from `Invoices.jsx:35`, since `pay.generate` already…
    - Check whether `pay.generate` also generates invoices. If not, make the Pay "Bring up to date" call both
      `pay.generate` and `invoices.generate`, then remove the Invoices button.
  - `PayRuns.jsx`: replace the separate confirms for finalise and issue with one combined "Finalise and issue"
    (`payRuns.finalise` then `payRuns.issue`), behind one confirm.
  - `Timesheets.jsx`: after approving a week, show "Send to pay run", which calls `pay.generate` and navigates to the
    run.
  - New bulk `invoices.issueMany {ids}` (CO) in `money.mjs`, looping the `invoices.issue` body that we extract into
    `issueInvoice(id, user)`. `Invoices.jsx` gets "Issue all drafts" behind a confirm.
- **Onboard stepper**
  - New `app/src/pages/people/Onboard.jsx` at route `staff/:id/onboard`, opened from StaffProfile when there are
    onboarding gaps.
  - The steps reuse the existing profile tab sections (details form, documents AddSheet, RTW/SIA check,
    contract issue, site packs), and use `onboarding.tasks` for done or not.
  - "Next" moves on; each step is skippable.
  - Field sharing between `apply` and `StaffForm` is noted as out of scope for this release.

**Venue**
- `Timesheets.jsx` venue view: add a "Sign off this week" button that calls `timesheets.sign {ids}` with all
  unsigned rows of the week.

**Tests**
- `invoices.issueMany` skips non-drafts.
- `cover.accept` returns `shift_ids`.
- Pack To do filtering: export the pure function `packTodos(list, today)`.

---

## Release D: new options (`streamline-options`, migration 060)

**Officer**
- **Push action buttons**
  - `notify.mjs` passes a new optional `actions` field into the push payload (through `pushToUsers` in `webpush.mjs`).
  - `sw.js` shows `actions` and, on `notificationclick` with an `event.action`, POSTs to
    `/app/open?to=<link>&act=<action>&ref=<ref>`.
  - A small `/app/open` handler page runs the API call with the stored token, then opens the link:
    - `ops.offerRespond`
    - `ops.reply on_my_way`
  - The callers are the cover offer (`ops.mjs:768`, Accept/Decline), the late chase (`ops.mjs:350`, "On my way") and
    the pack chase (`ops.mjs:399`, "Open pack": link only).
  - If the token is missing, just open the link.
- **Directions and call**
  - The ShiftView Header gets buttons:
    - Directions: `https://www.google.com/maps/dir/?api=1&destination=lat,lng`, or the address plus postcode.
    - Call office: `tel:office_phone`.
    - Call venue: `venue_phone`, officer only.
  - The Home Hero gets Directions. Add `venue_phone` to `shifts.mine` only if it's needed.
- **Quick availability**
  - A Home card "Free this weekend?" with Yes or No.
  - No → `timeoff.request {kind:'unavailable', from: Fri, to: Sun}`.
  - Yes → dismiss for this week (localStorage).
- **On shift**
  - `Home.jsx:33-40` gets a small "Next shift" line and the offers count under the ShiftPanel.
- **Latest payslip**
  - A Home row from `pay.list` (first item): "Pay statement {date} — £x".
- **Ask to swap**
  - New action `shifts.swapAsk {assignment_id, with_officer_id?, note}` (officer) in `rota.mjs`. It notifies the
    shift's managers ("{name} asks to swap {shift}") with a link to `rota?shift=id&replace=1`, which opens `AssignSheet`
    with `replace`. It is audited.
  - `DeclineSheet` gets a "Ask to swap instead" option with an optional teammate picker from `shifts.detail` team.

**Manager**
- **Shared CSV**
  - New `functions/api/lib/csv.mjs` with `toCsv(rows, columns)` and proper quoting; reuse `appFeedback.mjs`'s
    `csvCell` logic.
  - Exports: `staff.exportCsv`, `timesheets.exportCsv`, `incidents.exportCsv`, `compliance.exportCsv`,
    `timeoff.exportCsv`, `audit.exportCsv` and `reports.exportCsv`. Each returns `{filename, csv}` for the client's
    existing `downloadAction` (`api.js:~100`).
  - Columns come from a per-role function. Pay and rate columns only appear when `role==='company'` or
    `can_see_pay`. Security scope uses their venues.
- **Bulk actions**
  - Staff: multi-select → Message (`messages.startDirect` + `messages.send` loop, via a new `messages.sendMany
    {user_ids, body}`) and Export.
  - Compliance: "Chase all" calls `ops.decideMany` with each card's default `remind` actions.
  - Time off: "Approve all" uses a new `timeoff.decideMany {ids, status}`.
  - Incidents: "Mark reviewed" uses a new `incidents.reviewMany {ids}` (decision close).
  - Cover: "Offer to many" already exists as `ops.offerCover` with `officer_ids`. Surface it in Cover → Open shifts.
- **Next-step buttons**
  - Today Tonight tile → "Find cover" (`cover`).
  - Week tile → Rota.
  - Invoices drafts → Issue all.
  - Recruitment hired row → "Roster them" (`rota?officer=id`).
- **Ejections register**
  - New `incidents.ejections` (MGR), listing ejections across venues from the existing incidents and ejection tables.
  - Shown as a tab on Incidents.
- **Security managers**
  - `Settings.jsx` shows the Orb tab to security managers read-only, with `OpsSettings readOnly` and disabled inputs.
    The `ops.settings` read already allows MGR; check this.
  - `Compliance.jsx`/`compliance.mjs`: stop hiding `company_only` rows for security. Show them with the buttons
    hidden; the actions are already filtered.

**Venue (no officer data or pay)**
- **Don't send again**
  - New `feedback.dontSend {officer_id, reason}` (venue).
  - It creates a `feedback`-kind Orb card with `edits.ban` suggested, so the company decides through the existing
    `decideFeedback`.
  - Only officers who worked at this venue are allowed.
  - Shown in FeedbackSheet per officer and in the Live drawer.
- **Request again**
  - `venue/_requests.jsx` Detail gets a "Request again" button that opens `RequestForm` prefilled (same venue, roles,
    times, next date).
- **Live drawer**
  - With `venue` (`Live.jsx:194`), add "Message the office" (`messages.startDirect` to the company office thread, or
    the existing venue thread) and "Report a problem" (`comments.save` with the shift id).
- **Dashboard**
  - A "Message the office" button using the same helper.
- **Incident follow-up**
  - `IncidentDetail` for venue gets "Add a note". Use `incidents.comment` if it exists; otherwise add
    `incidents.venueNote {id, text}`, which is venue-scoped, audited and notifies managers.
- **Invoices**
  - `VenueInvoices` shows payment details from `settings` (bank name, sort code, account, reference). Add those fields
    to Settings → Billing if missing.
  - "Download all PDFs" downloads each in sequence, so no zip dependency is needed.
  - `invoices.exportCsv` allows venue, scoped to their own invoices with no officer pay columns.

**Public / platform**
- Migration `060_demo_status.sql`:
  `ALTER TABLE demo_requests ADD COLUMN status text NOT NULL DEFAULT 'new', ADD COLUMN status_note text`.
- New action `demo.setStatus {id, status ∈ new|contacted|won|lost}` (platform).
- The Demos tab gets a status Segmented per row and a filter.

**Tests**
- `toCsv` quoting.
- The CSV column role filter: security sees no pay, venue sees no officer data.
- `feedback.dontSend` scope.
- `timeoff.decideMany`.
- `incidents.reviewMany`.
- `shifts.swapAsk` notification link.
- `demo.setStatus` enum.
- The push payload carries `actions`.

---

## Critical files
- **Routes and layout:** `app/src/main.jsx`, `app/src/layouts/{nav.js,Shell.jsx,ShiftBar.jsx}`, `app/src/auth.jsx`,
  new `app/src/redirects.js`
- **Officer:** `app/src/pages/officer/{Home,Shifts,Me,Profile,Documents,Pay,TagTap,_parts,_ops}.jsx`,
  `pages/shift/ShiftView.jsx`, `pages/learn/{Learn,Toolbox}.jsx`, `app/public/sw.js`
- **Manager:** `pages/manager/{OpsAI,Dashboard,Rota,Cover,Exceptions}.jsx`,
  `pages/people/{Settings,Compliance,Staff,TimeOff}.jsx`, `pages/money/{Venues,Feedback,Invoices,PayRuns,Pay}.jsx`,
  `pages/shared/{Timesheets,Live,IncidentDetail}.jsx`, `pages/platform/Platform.jsx`, new `team/Learning.jsx`,
  `people/Onboard.jsx`, `guide/EmergencyCard.jsx`, `shared/QuickIncident.jsx`
- **Venue:** `pages/venue/{_feedback,_requests}.jsx`, `pages/money/VenueDashboard.jsx`
- **API:** `functions/api/modules/{clockProof,auth,rota,ops,money,cover,hr,incidents,messages,demo,compliance,timesheets}.mjs`,
  `lib/{notify,webpush,csv}.mjs`, `db/migrations/060_demo_status.sql`
- **Tests:** `functions/api/test/streamline.test.mjs`

## Reuse
- `switchSide` (`auth.jsx:60`)
- `DeclineSheet` / `ShiftCard` (`officer/_parts.jsx`)
- `AssignSheet` (`Rota.jsx:697`)
- `RequestForm` (`manager/_cover.jsx`)
- `GiveFeedbackSheet` flows
- `decideFeedback` ban path (`ops.mjs:861`)
- `ops.decideMany`
- `ops.offerCover`
- `downloadAction` / `downloadText` (`api.js`)
- `csvCell` (`appFeedback.mjs`)
- `useUrlState`
- UI kit Tabs / Segmented / Sheet
- the `LiveRedirect` pattern

## Verification (each release)
- `cd functions/api && node --test test/*.test.mjs`: all pass (315 today, plus the new tests).
- `cd app && npm run build` is clean.
- Click through in agent-browser on the local preview with test logins for each portal:
  - old URLs redirect;
  - moved items are reachable;
  - venue screens show no pay or officer personal data.
- Run `agent-browser close --all` afterwards.
- After deploy, run the live check (6ij75kpgf7 present, hopedp5 absent).
- Nothing is sent to real people and no live data is changed while testing.
