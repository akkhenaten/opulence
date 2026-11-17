# Spec: Three-portal review, slice 8: people and access in one place, plus shift page and time-off fixes

## Why
Slices 1–7 covered most of the review. The largest open theme is **R04, people and access** (CM01–CM06, CM14, CM29). A company manager now handles one person in two places: the Staff profile, and Settings → Users & access. The Users list can't be searched, invited logins are mixed in with active ones, and the history doesn't say which venues someone gained or lost, or what a value was before.

This slice also takes the smaller open items that are verified in the code:
- **R16, shift page (O11, O12, O16, O17, E12, E14):** the bottom bar still says "Starts 21:00" after 21:00, and Report incident shows three times while on shift.
- **R07, time off (CM21, O20):** an "unavailable" saved over a booked shift reaches no manager.
- **R21, reviews wording (V15, V16, E20):** the wording on the venue Reviews page is unclear.
- **R14, Pay wording (O10, E11).**
- **R20, learning (CM28, O09):** a course that has gone away fails without a word.

## Who it's for
- **Company managers:** find a person, see their access and change it safely.
- **Officers:** a clearer shift page.
- **Venue managers:** know what a review is and who publishes it.

## Scope

### 1. People and access (R04), company portal
**Users & access** (Settings → Users & access, `/company/settings?tab=users`):
- **Search** by name, email or venue. Next to the existing role selector there is a **status filter**: All / Active / Invited / Disabled. Both are kept in the page address.
- **Desktop (≥1024px):** a table with these columns: Name (with the "You" tag), Access (Company manager / Security manager / Venue manager / Officer, plus Platform admin), Venues ("All" for company managers, otherwise names or "N venues"), Works shifts (linked staff record), Pay (Yes/No), Status (Active / Invited · sent date / Disabled), Last seen.
  - Clicking a row opens the person in the right-hand panel, using the existing side Sheet.
  - The table stays usable behind the panel, and up and down arrows step through people.
- **Phone:** the same list as rows. Tapping one opens the person full screen, and Back returns to the list at the same place and with the same filters (via the existing `?user=`).
- **Person panel:**
  - **Access summary** at the top in plain words, e.g. "Venue manager for Club One and The Vaults · can't see pay · last seen 12 Nov".
  - Fields are saved with an explicit **Save**; ticking a venue changes nothing until Save. This is how it works today and stays so.
  - Before saving, the panel shows **what will change**, e.g. "Will gain: The Vaults · Will lose: Club One".
  - Linked staff record with an **Open staff profile** link.
  - **Access history:** this person's audit entries in plain words, newest first, 10 at a time. Example: "14 Nov, Sam Reed: added The Vaults, removed Club One".
  - The role can't be changed here. One line explains how: "To change the access type, deactivate this login and invite them again with the new type." See Decisions.

**Staff profile** (`/company/staff/:id`):
- The login pill becomes an **App access** tile. It shows the access summary for that person's login(s): officer app (invited / active / not invited), plus manager access if they also work shifts.
- The tile has **Manage access**, which opens Users & access on that person.
- The tile shows no new private fields.

**Server**
- **Last company manager guard:** `users.update` refuses to disable the last active company manager. The message is: "There must be at least one active company manager." The app hides Deactivate in that case and shows the reason. The platform admin doesn't count toward this. See Decisions.
- **Audit:** `user.update` records the previous and new value for every changed field, including `venue_ids` as venue names added and removed.
- Removing someone from a venue on the venue page is recorded the same way.
- `users.resendInvite` and `officers.inviteLogin` record who did it.
- Nothing else changes: no change to who can log in, what each access type sees, or pay visibility.

### 2. Shift page (R16), officer portal
**Bottom bar** (`layouts/ShiftBar.jsx`):
- After the start time, if the officer isn't clocked in, the bar says "Started 21:00 · not clocked in" instead of "Starts 21:00".
- Both the bar and the Home hero re-check every minute, so the wording changes without a reload.
- The bar keeps Clock in, Report and Emergency.

**Order on the shift page**
- The header card becomes compact:
  - venue, time with (overnight) when it applies, role and break as one line under the page title;
  - the address and Directions / Call office / Call venue as one row.
  - The venue name is no longer repeated.
- Personal attendance comes next:
  - Not clocked in / Clock-in opens at HH:MM / On shift since HH:MM / Clocked out X–Y.
  - On now changes to "Shift on now" when the officer isn't clocked in, and to "You're on shift" when they are.
- Report incident and Add note come straight after attendance and stay near the top, before the emergency flowchart.
  - The five report-type tiles become one Report incident button. It opens the existing type picker.
  - Log ejection or ban shows once, in the bans section.
  - The emergency guide stays where it is: in the bottom bar's Emergency icon and in the flowchart card.
- Handover, site pack, team, chat and Toolbox keep their order.
  - Toolbox becomes a single row: "Toolbox: guides for tonight", opening the list.

### 3. Time off over a booked shift (R07)
- When an officer saves Unavailable over shifts they have already accepted, managers get the same alert as for a pending request: "{Name} marked unavailable on {day}, booked at {venue}". It links to the shift.
- The officer's warning before saving doesn't change.
- On the manager Time off page, Upcoming shows the clash pill ("Booked on Fri at Club One") for confirmed rows too, not only pending ones.
- **Nothing is cancelled automatically.** The officer stays on the shift until a manager acts.

### 4. Reviews and feedback wording (R21), venue portal
**Reviews page, venue view**
- The subtitle reads: "Add a review someone gave your venue about {co}'s service, such as a guest or your own team. The office checks it before it shows on {co}'s website."
- The fields are "Who said it" (name as it should appear, e.g. "Sarah M.") and "Their role", with the hint "Only add a name if that person is happy for it to be shown."
- The company view doesn't change.

**Give feedback footer**
- This stays as it is, but a sentence is added for praise: "Your name is never shown, only your venue's."

**App problems**
- The account sheet item "Send feedback" becomes **"Report an app problem or idea"**, so it can't be confused with Give feedback about the service.

### 5. Pay and learning wording (R14, R20)
**Pay (officer)**
- The Me row subtitle becomes "Your pay statements and year to date". The Pay page header uses the same words.
- The Pay page gets one muted line: "Your rates are in Profile and bank", which links there.

**Learning (officer)**
- A course that has been archived or unpublished shows "This course is no longer available. Your certificate stays valid." where it now shows "Course not found". The officer can go Back to Learn.
- A guide whose linked course was archived shows "Course no longer available" instead of losing the button without a word.

### 6. What's new card
- A new top card, `people-and-access`, with its own AI picture. It is written in business wording and covers points 1–5.

## Decisions for you
These are the defaults I'll use unless you say otherwise:
1. **Changing an access type stays deactivate-and-reinvite.** There is no new role-change power in this slice.
2. **Last company manager guard: on.**

## Out of scope
- Changing someone's access type in place (Decision 1).
- Merging the Staff profile and Users & access into one page.
- Course version history and duplicate detection (R20 E08).
- Contract clause review (R09 advanced).
- Demo request visibility (R12, still held).
- The unchecked-licence rule (still held).
- Cancelling or reassigning shifts from time off.
- Any change to visibility, approval, pay, sign-off or eligibility rules, or to the handover composer.

## Constraints
- **Old links keep working:** `/company/settings?tab=users&user=<id>`, `/company/staff/:id`, the shift routes, and `incidents/new` with a type.
- **Test records only.** No real invites, incidents, reviews or time off.
- **Shared components:** only the people pages get the table and panel. The Sheet and Table behaviour elsewhere doesn't change.
- **Build:** ui-lint stays ≤70. Icon sizes are 14, 16, 18, 20 or 24. No raw `<button>` in pages.
- **Release steps:** commit, then build, then grep for the Opulence API id, then site deploy (v205), then `openkbs fn deploy api` because the audit and guard change the server, then push.

## Acceptance checks
**Users & access**
1. Searching "vault" finds the venue managers of The Vaults. The Invited filter shows only invited logins with their sent date.
2. On desktop, a row click opens the panel and the arrow keys move between people. On a phone, the person opens full screen and Back returns to the same filtered list.
3. Ticking a venue shows "Will gain …" and saves nothing until Save. After Save, the person's history shows the venues added and removed with the actor's name.
4. With one active company manager, Deactivate is hidden with the reason. Calling `users.update` with status disabled directly returns the error. Disabling yourself is still refused.
5. Resending an invite records who did it.

**Staff profile**
6. The App access tile shows the right summary and opens Users & access on that person. A security manager without pay permission sees no pay detail.

**Shift page**
7. At 21:05, not clocked in, the bar reads "Started 21:00 · not clocked in" with no reload.
8. The shift page shows the venue once in the card. Report incident shows once on the page, plus the bar icon. Log ejection or ban shows once. The emergency guide is reachable in one tap.

**Time off**
9. Unavailable saved over an accepted shift: the manager gets the alert, Time off Upcoming shows the clash pill, and the shift still lists the officer.

**Wording**
10. The venue Reviews page and the Give feedback footer read as written above. The account sheet says "Report an app problem or idea".
11. The officer Pay row and header match and link to rates. An archived course shows the "no longer available" message.

**What's new**
12. The What's new card shows with its picture.

## Verification
- **API:** `npm test` in `functions/api`, with new tests for the last-manager guard, audit before/after including venues, invite actor, and the unavailable-clash alert and `booked` on confirmed rows.
- **Mock:** the mock server gets matching data, including a second company manager toggle.
- **Browser (agent-browser at 390 and 1280):**
  - as boss: Users & access, staff profile, Time off;
  - as officer: shift page before and after start, Pay, archived course;
  - as venue: Reviews, Give feedback, account sheet.
  - Check for no console errors, then run `agent-browser close --all`.
- **Build:** `npm run build` (ui-lint, emergency-check, flow-check), then release as in Constraints.
