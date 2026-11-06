# Spec: the officer portal is built around the shift card

## Context
The owner finds the staff and security officer side "a bit all over the place":
- Incident reports can be started from several places.
- Ejections are only on the shift page, but that isn't obvious.
- A "Getting set up" checklist shows items officers can't action.
- Home mixes lots of tiles, so it's not clear what to do next.

The goal is one clear path:
1. **Home** shows the officer's shifts.
2. They confirm a shift.
3. It goes live 15 minutes before the start, and they clock in.
4. The **shift card takes over** as Home, with everything for that shift in one place.
5. Afterwards they can look back at their reports.

Training, contract and profile are always easy to find.

Who it's for: officers (role `officer`). The manager and venue sides don't change, except that they see reports that are now always linked to a shift.

## Decisions (from the user)
- While clocked in, **Home becomes the live shift card**. Other tabs keep working.
- Home when not on shift has **three clear blocks**:
  1. Needs your answer
  2. Confirmed
  3. Open shifts you can pick up
- **Clock-in opens 15 minutes before** the start. Today it's 30. The user said 15, so it's fixed at 15 and not a company setting.
- I used the recommended answer for the questions the user left open:
  - **Incidents:** only filed from a shift card. A past shift can be reported on within the existing backdate window. The loose "Report incident" buttons go.
  - **Ejections:** logged only from the shift card (already the case).
  - **Look back:** a "Reports" page with two lists, Incident reports and Ejections. It's read-only, apart from fixing reports the office sent back.
  - **Onboarding checklist:** becomes actionable. Items tick themselves from the officer's data, each missing item links to where it's fixed, and items only the office can do show "Waiting on the office".

## Requirements

### 1. Home, not on shift (`app/src/pages/officer/Home.jsx`)
Shown from top to bottom:
1. **Can't work** banner, kept when the officer isn't compliant. It links straight to what to fix.
2. **Needs your answer:** shifts in `assigned` status, plus offers, with Accept and Decline (decline asks for a reason, as today). The section is hidden when empty.
3. **Confirmed:** `accepted` shifts, soonest first. The next one shows a countdown, and from 15 minutes before the start it turns into **"Clock in"**. Before that it says "Clock-in opens at 21:45".
4. **Open shifts you can pick up:** up to 3, plus "See all", which goes to Shifts → Open.
5. **To do:** one compact list mixing:
   - setup items still missing (section 4),
   - a contract or agreement to sign,
   - training due or overdue,
   - documents expiring,
   - reports sent back to fix.

   Each row opens the place to fix it.
6. Remove the stat tiles (Hours, Open count, Last pay) and the loose "Report incident" button. Pay stays on Me.

### 2. Home, on shift: the shift card takes over
While `clock.status` is `on_shift` or `on_break`, Home shows the **live shift card** for that shift:
- **Header:** venue, role, times, time on shift, break state. Clock out and Start/End break buttons stay here.
- **Actions:** **Report incident**, **Log ejection**, **Add log entry**, **Handover**.
- **Contents:**
  - the shift log, ejections and bans tonight, and the team on shift,
  - the venue pack (the site pack for the venue: entry rules, contacts and the like),
  - the last handover.
- It reuses the ShiftView parts (`app/src/pages/shift/ShiftView.jsx`, `_bans.jsx` BanSheet). There's no new logic for logging.
- After clock-out, Home goes back to normal. The finished shift can still be opened from Shifts to file a late report.
- The Clock tab after clock-in says "You're on shift" and links back to Home.

### 3. Incidents and ejections go through the shift card
- New incident reports always carry a `shift_id`. The form opens from a shift card (live or past) with the shift already chosen. The free shift picker is removed when the shift is given.
- Remove the "Report incident" entry points from Home and Me.
  - `/officer/incidents/new` without `?shift` sends the officer to Shifts with a note: "Open the shift to report".
  - The server rejects officer reports with no shift. It already checks the officer is assigned to the shift.
- Past shifts (List tab) inside the existing `BACKDATE_DAYS` window show **Report incident** and **Log ejection** on their card.
- **Reports page** (`/officer/incidents`, titled "Reports"), linked from Me and the To do list:
  - **Incident reports** tab: their reports with status. Reports sent back can be edited, as today.
  - **Ejections** tab: ejections and bans they logged, read-only. This needs an officer-scoped list in `bans` (their own `proposed_by` or shift entries).

### 4. Onboarding checklist becomes actionable
- **Auto-ticks** come from the officer's data. The `onboarding.tasks` result gets a computed `done`, OR'd with the stored tick, so the office can still tick by hand:

  | Item | Ticked when |
  |---|---|
  | profile | name, phone, address, postcode, DOB and NI are filled |
  | sia | SIA number and expiry are set |
  | rtw, id, poa | a document of that type is uploaded |
  | bank | sort code, account number and UTR are set |
  | contract | a contractor agreement is signed |

- **Links:**
  - profile and bank go to `/officer/profile`
  - sia, rtw, id and poa go to `/officer/documents`
  - contract goes to the contract to sign
- **verified** and **induction** show as "Waiting on the office", greyed and with no link.
- The checklist shows on Home's To do list and on Me. It's hidden when everything is done.

### 5. Clock-in window: 15 minutes
- Set `EARLY_MIN = 15` in `functions/api/modules/clock.mjs`.
- Update the matching UI in `Clock.jsx` and `Home.jsx`, which today hardcode 30 minutes. Use one shared constant.
- The error text reads "Clock-in opens 15 minutes before…".

### 6. Me page: one tidy hub
Sections in this order:
1. Profile card
2. **My shifts** (link to Shifts)
3. **Training** (courses and certificates)
4. **Contract and agreements** (view, sign, PDF)
5. **Documents**
6. **Profile and bank**
7. **Pay**
8. **Reports**
9. **Time off**
10. Settings and sign out

The officer only sees what is theirs, with the same visibility as today.

### 7. Ship
- Add a What's new card at the top of `UPDATES`, dated on the deploy day, e.g. "Your shift, all in one place".
- Update the officer help guide where it mentions the 30-minute window or the Home "Report incident" button.

## Non-goals
- No change to manager or venue screens, pay, or contract content.
- No new shift statuses. "Confirmed" means `accepted`.
- Shift and site rules aren't changed, beyond the 15-minute window.

## Edge cases
- Two back-to-back shifts: the takeover follows the shift they're clocked into.
- Clocked in but the shift was cancelled: show the card with a notice, and Clock out still works.
- Not compliant: Confirmed shifts show "You can't clock in until…" with a link to fix it.
- Officers with an old draft report with no shift: the draft opens, and they're asked to pick a shift.

## Verification
- **Mock officer role** (/tmp/mock with vite), at 390 and 1440:
  - the three Home blocks with assigned, accepted and open data,
  - "Clock-in opens at …" before the 15-minute window, and "Clock in" inside it,
  - the clocked-in mock shows the shift card as Home, with Report incident and Log ejection,
  - the Reports page tabs,
  - checklist items tick and link.
- **API tests:**
  - clock-in is refused 16 minutes before and allowed 14 minutes before,
  - an officer incident without a shift is rejected,
  - `onboarding.tasks` auto-ticks,
  - the officer ejections list only shows their own.
- `npm test` passes, and the build passes with ui-lint at 67 or below.
