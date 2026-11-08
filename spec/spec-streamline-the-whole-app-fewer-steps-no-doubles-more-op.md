# Spec: Streamline the whole app — fewer steps, no doubles, more options (all portals)

## Context
I reviewed the full app map across all four portals: Officer, Manager (company and security), Venue, and Platform/public.
The app has grown release by release, and the same things now show up in several places:
- the shift card appears 4 times and clock buttons 5 times
- Orb settings are mounted twice
- there are 4 compliance surfaces
- cover is split 5 ways
- venues have 4 different feedback flows

Some everyday jobs take too many taps (a site pack that only blocks the officer at the door, accepting a shift, the pay
chain). There is also a real bug: a manager who also works shifts taps an NFC tag and gets "Tag works" instead of
being clocked in.

The goal is to cut pages, steps and duplicates, and add the missing next-step, bulk and export options.

The work is split into 5 releases, safest first. Each release follows the usual order (commit with explicit paths, fn
deploy, build, site commit, site deploy, live check for 6ij75kpgf7 / not hopedp5) and gets its own What's new card and
picture. Old URLs always redirect; nothing is deleted from the DB.

Rules that stay in force:
- Venue logins never see officer data or pay.
- The grace buttons stay on the SIA and RTW tiles.
- Platform admin = Company manager.

---

## Release A — Fixes and quick wins (bugs, stale text, dead ends)

**Officer / dual role**
1. **NFC tap for dual users.** In `functions/api/modules/clockProof.mjs:214-228` and `app/src/pages/TagTap.jsx`: when
   the person is dual and has a shift whose clock-in window is open, treat the tap as an officer tap. Switch the side
   to officer (`api.js` side setter) and go to `/officer/clock?tap=`. Do this before the counter is used up. Managers
   with no shift due still pair or check the tag.
2. **Re-run landing on reopen.** In `app/src/auth.jsx`, on app resume or start with a saved session, call `auth.landing`.
   If the result is "officer" because a shift is due within 2 hours, switch side. Show `ShiftBar` for dual managers on
   the manager side while they are on shift (`Shell.jsx:435`).
3. **Accept / Decline on the shift page.** In `ShiftView.jsx` Header (around :220), handle unanswered shifts with the
   same calls as the List tab. Point the new-assignment push at `/officer/shifts/:id` (`rota.mjs:117`).
4. Rename the Open tab copy "withdraw it from My shifts" to "List" (`Shifts.jsx:149`). Point "Clock history"
   (`Shifts.jsx:31`) at List → past shifts.

**Manager**
5. Fix the stale "see the Board tab" toast in OpsSettings "Run checks", and the stale `?tab=email` link at `Email.jsx:114`.
6. Compliance "Open in Today" deep-links to the card (`/today?card=<id>`, scroll and open).
7. Venue "Needs you" links go to `?show=review`.

**Dead code**
8. Remove dead code:
   - `venueRequests.create` non-draft path and `venueRequests.list` (`ops.mjs:1333-1405`)
   - `timesheets.venueCheck`
   - the unused "venue request chat" toggle (`OpsAI.jsx:556`)

   Grep the callers first.

## Release B — Remove doubles (one home for each thing)

**Manager**
- **Orb settings live only in Settings → Orb.** `/orb?tab=settings` redirects there. `/orb` keeps Activity.
  "Run checks" lives on Today only; Compliance and OpsSettings link to it.
- **One Learning hub.** Academy, Toolbox, Site packs and Help become tabs of one "Learning" page. Drop the one-item
  "Resources" nav group (`layouts/nav.js`). Redirect `team/academy` → `team/training`.
- **Clients become a segment of Venues.** Redirect the old route.
- **Audit "What's new"** stays as the archive. The splash links to it (no duplicate rendering logic).
- **Messages, Email and Everyday** become one "Messages" page with tabs.
- **Feedback and Reviews** become one page. Ratings are visible on it.
- **Exceptions** become one list. The Phones tab moves to Staff → phones.

**Officer**
- **One emergency entry.** Merge EmergencyEntry (S00) and FlowEntry into one "Emergency" card with both views.
- **One "Help & guides" hub in Learn** (Toolbox and Help folded in). Toolbox categories show once.
- **Profile.** Remove the read-only Licence section (Me and Documents show it). Move pay rates into Pay.
- **Everyday** keeps the header icon only. Drop the Me row and the Home tile.
- **Shared ShiftCard component.** Hero, List and the ShiftView header use one component with one
  "I can't work this" button.

**Venue**
- **One feedback entry.** Merge FeedbackTile, RateStaffSheet, GiveFeedbackSheet and Reviews into one "Feedback" sheet:
  rate the night → optional per-officer stars → comment.
  - It writes through the existing `feedback.submit` / `submitAdhoc` / `comments.save` (no data model change).
  - `/venue/reviews` goes into the Feedback page.
- **Cover requests in one place.** Drop the dashboard duplicate of Live.
- **Legacy routes.** Redirect `/venue/cover` and `/venue/requests`.

**Platform**
- **Platform admin in one place.** Platform, Staff setup and Settings → Demos become one Platform page with tabs
  (still company-gated).

## Release C — Fewer steps on the big flows

- **Site pack before shift day (officer).** Add unsigned packs to Home To do and the hero card, with the status the API
  already has. Clock still blocks as a backstop.
- **Upload from the warning.** Home warnings open the Documents AddSheet straight away for that document (`?add=sia|rtw`).
- **Open shifts on Home** get a Request button inline.
- **Quick incident.** From the ShiftBar: pick a type and write one line. It is saved as a draft and the 6-step form is
  finished later. Drafts show in Home To do.
- **Cover in one place (manager).** One Cover page with tabs Open / Offered / Requests from venues. Rename the Rota →
  Requests tab to "Time off & swaps" to end the name clash. Accepting cover assigns inline, reusing the Rota Assign
  sheet (`Rota.jsx:717`).
- **Pay chain.**
  - "Bring up to date" is on Pay only.
  - One confirm instead of 3.
  - "Send to pay run" from Timesheets.
  - "Issue all drafts" on Invoices.
- **Contracts in one place.** Staff → Contracts. The other two surfaces link to it.
- **Venue week sign-off.** One tap "Sign off this week" on the timesheet review.
- **Onboard stepper.** One guided stepper for a new officer (details → documents → RTW/SIA → contract → site packs),
  reusing the existing sheets. The apply onboarding and StaffForm share the same fields.

## Release D — New options

**Officer**
- **Push action buttons** (`app/public/sw.js`). Accept / Decline a cover offer, "On my way" for the late chase, and
  "Open pack" for a pack chase. The buttons use the existing API calls.
- **Directions and Call office** in the ShiftView header and Home hero: a maps link from the venue address and
  `tel:` to the office phone.
- **Quick availability.** A "Free this weekend?" toggle on Home or Shifts, writing to the existing availability.
- **Latest payslip row on Home.** On shift, a small "Next shift" line stays visible under the ShiftPanel.
- **"Ask to swap"** in "I can't work this": the officer picks a teammate, the swap request goes to the manager's
  existing swap flow.

**Manager**
- **Next-step buttons:**
  - Tonight → "Find cover"
  - Week tile → Rota
  - Invoices drafts → Issue
  - Recruitment → "Roster them"
- **Bulk actions:**
  - Staff (message, export)
  - Invoices (issue, send)
  - Cover (offer to many)
  - Compliance "Chase all"
  - Time off "Approve all"
  - Incidents (mark reviewed)
- **CSV exports** for Staff, Timesheets, Incidents, Compliance, Time off, Audit and Reports, via one shared
  `toCsv` helper. These are role-checked: security managers get no pay columns where company-only.
- **Cross-venue ejections register** (read-only list from existing incident ejections).
- **Security managers** can see Orb settings read-only, and see compliance rows marked company (without the
  company-only buttons).

**Venue (no officer data or pay exposed)**
- **"Don't send again"** on an officer, from Feedback or Live. It becomes a request to the company (reusing the venue
  ban card in Orb); it is not a direct ban.
- **"Request again"** on past cover requests (prefilled draft).
- Venue actions in the Live drawer (`Live.jsx:202`): message the office, report a problem.
- **"Message the office"** button on the venue dashboard.
- **Incident follow-up** ("Add a note" on venue-visible incidents).
- **Invoices:** payment details shown, "Download all" PDFs (zip), and a venue CSV (their own lines only).

**Public**
- Landing "Request cover" gets a status (new / contacted / won / lost) in the Demo requests table.

## Release E — Later / needs a call
- Reports and Analytics merged into one page with exports. This is held back because it is a bigger layout change.

---

## Critical files
- **Routes and nav:**
  - `app/src/main.jsx` (152-325)
  - `app/src/layouts/nav.js`
  - `app/src/layouts/Shell.jsx`
  - `app/src/layouts/ShiftBar.jsx`
- **Officer:**
  - `app/src/pages/officer/Home.jsx`, `Shifts.jsx`, `Me.jsx`, `Profile.jsx`, `Documents.jsx`, `Clock.jsx`, `Pay.jsx`
  - `app/src/pages/shift/ShiftView.jsx`
  - `app/src/pages/TagTap.jsx`
  - `app/src/pages/learn/*`
  - `app/public/sw.js`
- **Manager:**
  - `app/src/pages/manager/OpsAI.jsx`, `Dashboard.jsx`, `Rota.jsx`, `Email.jsx`
  - `app/src/pages/people/Settings.jsx`
  - the Compliance, Pay, Invoices and Timesheets pages
- **Venue:**
  - `app/src/pages/venue/*` (Live.jsx, the feedback sheets)
- **API:**
  - `functions/api/modules/clockProof.mjs`, `auth.mjs`, `rota.mjs`, `ops.mjs`, `feedback`/`comments` modules
  - a new `functions/api/lib/csv.mjs`

## Reuse
- Rota Assign sheet (`Rota.jsx:717`) for inline cover accept.
- Documents AddSheet for upload-from-warning.
- The existing swap flow and the venue-ban Orb card.
- `LiveRedirect` / `OldVenueCover` patterns for redirects.
- UI kit Tabs / Segmented / Sheet.

## Verification
- `node --test test/*.test.mjs` (315 now). Add tests for:
  - the dual NFC tap decision
  - the landing re-check
  - CSV role filtering (no pay columns for security, no officer data for venues)
  - the bulk actions
  - redirects resolving
- `npm run build` clean after each release.
- Click through each portal in agent-browser with a test login: old URLs redirect, and each moved item is reachable in
  ≤ the old number of taps. Close the browser afterwards.
- Live check after every deploy (index-*.js has 6ij75kpgf7, not hopedp5).
- Nothing is sent to real people and no live data is changed during testing.
