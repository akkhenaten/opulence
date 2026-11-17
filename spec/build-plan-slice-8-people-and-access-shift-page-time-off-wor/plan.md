# Build plan: slice 8: people and access, shift page, time off, wording

## Context
The slice 8 spec is approved and saved by the system. It covers:
- **R04:** Users & access with search, a table and a side panel, access history, and a guard for the last company manager.
- **R16:** a shift page that is compact and correct after the start time.
- **R07:** an unavailable day over a booked shift reaches managers.
- **R21, R14 and R20:** wording fixes.

Defaults that apply:
- Changing someone's access type still means deactivating and inviting again.
- The last-company-manager guard is on.

The release covers the app and the API.

## 1. Server (`functions/api`)
**New `lib/access.mjs`** (pure functions, so they can be unit tested):
- `accessChanges(before, fields, venuesBefore, venuesAfter)` returns `{ before: {field: old}, venues_added: [names], venues_removed: [names] }`. It only includes fields whose value really changed.
- `blocksLastCompanyManager({ target, status, otherActive })`: true when `target.role === 'company'`, the target is active, the new status is `disabled`, and `otherActive` (active company managers other than the target, platform admin emails left out) is 0.
- `unavailableClashNotice(name, from, to, booked)` returns the title and body: "{Name} marked unavailable {dates}: booked {Fri 20 Nov} at {venue}" (plus "and N more").

**`modules/users.mjs`**
- `users.update`:
  - Load the user row and its current venue names first. If `status === 'disabled'`, count the other active company managers with `isPlatformEmail` left out. When `blocksLastCompanyManager` is true, return `fail(400, 'There must be at least one active company manager.')`.
  - After `setVenues`, read the venue names again.
  - Audit as `user.update` with `{ ...fields, ...accessChanges(...) }`. The flat fields stay as they are, so the existing audit view keeps working.
  - Removing a manager from a venue on the venue page already goes through `users.update` (`VenueDetail.jsx:918`), so it gets this audit too.
- `sendInviteMail(u, actor = null)`: audit `user.invite_sent` with that actor.
  - `users.resendInvite` passes `user`.
  - `officers.inviteLogin` passes `user` through `inviteOfficerLogin(id, actor)` (`officers.mjs:133,248`). The call in `apply.mjs:193` stays without an actor.

**`modules/hr.mjs`**
- `timeoff.list`: `booked` is filled in for `pending` rows, and also for `approved` rows that haven't ended yet (`t.end_date >= current_date`).
- `timeoff.request`: when an officer saves `unavailable` (approved straight away), run `BOOKED`.
  - If there are clashing shifts, call `notify(await companyManagers(), { kind: 'timeoff', … })` with the clash notice. The link goes to `/company/shifts/<first shift_id>`.
  - Nothing is cancelled.

**Tests:** a new `test/access.test.mjs` for the three helpers:
- the guard with self, another manager, and platform-only managers;
- venues added and removed;
- unchanged fields are left out;
- the clash wording for one shift and for several.

## 2. Users & access (`app/src/pages/people/Settings.jsx`)
**`UsersTab`**
- Role, status (`all|active|invited|disabled`), `q` and `user` move into `useUrlState` (`ui/nav.js:6`).
  - Opening a person pushes `?user=` onto history, so phone Back closes it; closing clears it.
  - This replaces the `openId` ref. Old `?tab=users&user=<id>` links still open the person, and an officer id switches the role to Officers.
- Filters run in the browser: search over name, email and `venues`; status as a `Segmented` next to the role selector. "Invited" rows show "Invited · sent 12 Nov" from `invite_sent_at`.
- **Desktop (`useMedia('(min-width:1024px)')`):** the shared `Table` with columns Name ("You" tag) · Access (role, plus a Platform admin pill) · Venues ("All" for company; one name, or "N venues") · Works shifts · Pay · Status · Last seen.
  - Add an optional `selected` prop to `Table` (`ui/index.jsx:656`). It highlights the open row; other users of Table are unchanged.
- **Phone:** the existing `List`/`Row` rows.
- **"Last company manager":** `all.filter(active company, not platform).length === 1`. This is passed to the sheet.

**`UserSheet`**
- Opens as `side` (a drawer on desktop) and `full` (full screen on phones). `onPrev`/`onNext` step through the filtered rows.
- New pieces, all in the same file:
  - **Access summary line** from `accessSummary(u)`, e.g. "Venue manager for Club One and The Vaults · can't see pay · last seen 12 Nov". Company managers read "Company manager · all venues · sees pay".
  - **Will change line** under AccessFields: "Will gain: … · Will lose: …", from `v.venue_ids` compared with `u.venue_ids` and the venue names. It only shows when something differs.
  - **Role note:** "To change the access type, deactivate this login and invite them again with the new type."
  - **"Open staff profile":** the existing link, renamed.
  - **Deactivate:** hidden when this is the last company manager. In its place: "There must be at least one active company manager."
  - **Access history:** `useApi('audit.list', { entity: 'user', entity_id: u.id, limit: 50 })`. It shows 10, with "Show more" for the rest, and uses `LoadFail` when it fails.
- **Shared audit wording:** move `ACTION_TEXT`/`actionLabel` out of `Audit.jsx` into `pages/people/_auditText.js`. Add `changeLine(r)`, which turns `venues_added`/`venues_removed`/`before` into words: "added The Vaults, removed Club One · phone 07… → 07…". `Audit.jsx` imports from there.

**Staff profile (`StaffProfile.jsx:110`)**
- The login pill link becomes a small **App access** tile in the header area:
  - Officer app: Active · seen {relative} / Invited / Not invited (from the existing `LoginPill` fields).
  - "Also a {Company/Security} manager" when the login is a manager.
  - For company users, **Manage access** goes to `/company/settings?tab=users&user=<user_id>`.
- No pay detail is shown.

## 3. Shift page (officer)
**Ticking clock:** add `useNow(ms = 60000)` to `ui/motion.js`. It re-renders every minute and stops on unmount.

**`layouts/ShiftBar.jsx`**
- Uses `useNow()`.
- When not on shift and `now >= starts_at`, the label is "Started {time} · not clocked in". Otherwise it stays "Starts {time}".

**`officer/Home.jsx:253`**
- `started` is worked out from `useNow()`, so "Starts in …" becomes "Started" without a reload.

**`pages/shift/ShiftView.jsx`**

`Header`:
- Drop the MapPin and the venue headline; the page title is already the venue.
- First line: time range with "(overnight)" when it crosses midnight (reuse `overnight` from `manager/_cover.jsx` or the existing `range` helper) · role · break. The address goes underneath.
- Then the attendance row: Not clocked in / Clock-in opens at / On shift since HH:MM / Clocked out X–Y.
  - It now also shows while clocked in, with "On shift since", and has no button there because the bar has Clock out.
- Then `GetThere`, then instructions, then Accept/Decline and "I can't work this".
- The pill reads "You're on shift" for an officer who is clocked in and not out, "Shift on now" for an officer who isn't, and "On now" for managers and venues.

`Body` order for officers: Header → actions → `FlowEntry` → pinned instructions → the rest, unchanged.
- **`LiveActions`:** Report incident, Add log entry, Handover, Shift chat. Log ejection or ban is removed here.
- **`QuickActions`** (not live): Report incident (disabled with the window hint), Add note, Shift chat. Log ejection or ban is removed here too.
- **`ReportTiles` → `ReportDrafts`:** only the "Draft report: carry on" rows, with no type tiles. The single Report incident button goes to `/officer/incidents/new?shift=<id>`, where the type is picked in the form (`Composer.jsx:64` starts with no type). Links that include `&type=` keep working.
- **Toolbox:** a single `Row`, "Toolbox" with "Guides for tonight", going to `/officer/learn/toolbox`. This replaces the three tiles.
- **Log ejection or ban:** stays only in the Ejections & bans section.

Before relying on this, check that `scripts/emergency-check.mjs` and `scripts/flow-check.mjs` don't look for the removed tiles.

## 4. Time off (manager)
- `people/TimeOff.jsx` `Block`: the clash pill and text show whenever `t.booked?.length`, not only for pending rows.

## 5. Wording
- **`money/Reviews.jsx` (venue only):**
  - Subtitle: "Add a review someone gave your venue about {co}'s service, such as a guest or your own team. The office checks it before it shows on {co}'s website."
  - Fields: "Who said it" and "Their role".
  - Hint under the name: "Only add a name if that person is happy for it to be shown."
  - Change "add the reviews you receive" and "a review a client gave you" to the same wording.
  - The company wording stays.
- **`venue/_feedback.jsx:169`:** for praise and suggestions, append "Your name is never shown, only your venue's."
- **`layouts/AccountSheet.jsx:67`:** the item becomes "Report an app problem or idea". Check that Help text and `AppFeedback.jsx` don't still quote "Send feedback".
- **`officer/Me.jsx:218` and `officer/Pay.jsx:39`:** "Your pay statements and year to date". Pay also gets a muted line, "Your rates are in Profile and bank", linking to `/officer/profile`.
- **Courses:**
  - `academy.mjs:185`: a course that isn't published gives a 404 "This course is no longer available".
  - `learn/Course.jsx`: when `q.error?.status === 404`, show `Empty` with "This course is no longer available", the body "Certificates you earned stay valid." and a Back to Learn button.
  - `learn/Card.jsx:68`: when `officer && c.course_id && !c.course_title`, show the muted line "Course no longer available".

## 6. What's new card
- A new top card `'people-and-access'` (icon `UsersRound`) in `people/_whatsnew.jsx`, written in business wording.
- Add a prompt to `app/scripts/whatsnew-images.mjs` and run `node app/scripts/whatsnew-images.mjs people-and-access`. This creates `app/public/whatsnew/people-and-access.webp`.

## Mock (`/tmp/mock/server.mjs`)
- **`users.list`:** two active company managers, one security manager with venues and pay, one invited venue manager with `invite_sent_at`, one disabled user, and one officer.
- **`/tmp/mock/onecm.txt`:** when present, only one company manager is listed.
- **Actions:** `audit.list` for users (with `venues_added`/`removed`), plus `users.update` and `users.resendInvite` returning ok.
- **`timeoff.list`:** an approved unavailable row with `booked`.
- **`academy.course`:** 404 for the id `gone`.
- **Toolbox:** one card with `course_id` and no `course_title`.
- **`clock.status`:** `not_started` with `starts_at` 10 minutes ago.

## Verification
- `cd functions/api && npm test`: 359 existing tests plus the new access tests.
- `cd app && npm run build`: ui-lint ≤70, emergency-check, flow-check.
- **agent-browser at 390 and 1280:**
  - **Boss:**
    - Users & access: search "vault", the Invited filter, row → panel, arrow keys, phone full screen and Back.
    - Ticking a venue shows Will gain/lose.
    - History lines.
    - Single company manager (`onecm`): Deactivate hidden with the reason.
    - Staff profile App access tile → Manage access.
    - Time off clash pill on Upcoming.
    - The Audit page still reads well.
  - **Officer:**
    - Bar shows "Started … · not clocked in".
    - Shift page: venue once, one Report incident, ejection only in bans, Toolbox row, emergency in one tap.
    - Pay line, gone course, guide without its course.
  - **Venue:** Reviews and Give feedback wording, account sheet item.
- Check for no console errors, then run `agent-browser close --all`.

**Release:**
1. Commit the slice 8 files only (never `spec/live-spot-check-current-task/` or the `spec/hotfix-…` files).
2. `openkbs fn deploy api`.
3. `npm run build`, then commit `site/app`.
4. Grep for `6ij75kpgf7kiwtvwo3nke763dm0oejxo`.
5. `openkbs site deploy` (v205), then `git push --follow-tags`.
