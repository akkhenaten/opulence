# Build plan: One person, one page (profile, access and app access together)

## Context
A person's login is in Settings → Users & access, their staff record is in Staff, and the invite, "also works shifts", venue access and switch-off controls are spread across both, plus the venue page, the client page, Recruitment and Offboarding. Each place has its own rules. The approved spec brings this into:
- **Staff → People**, one list of everyone;
- **one person page**, with an **Access** tab where you tick the apps they can use;
- **one Add person sheet**;
- **one switch-off**, with the same rules everywhere.

What each app type can see does not change.

## Data model: no migration
- **Apps** come from data that already exists:
  - **Officer app** = an `officers` row linked by `officers.user_id`. This is either `users.role = 'officer'` or a manager login with a linked staff record (dual).
  - **Manager access** = `users.role` in `company | security | venue`.
  - A login with only the Officer app has `role = 'officer'`.
- **Venues:** `security_venues` (security) / `venue_contacts` (venue), as today.
- **Fresh role on each request:** `userFromEvent` (`lib/auth.mjs:69`) reads the role from the database every time. A role change therefore applies on their next request, and the client's `auth.me` refresh shows the new menu.

## Server (functions/api)

### 1. `lib/apps.mjs` (new, pure, tested)
- `appsOf(u, linkedOfficerId)` returns `{ officer, manager }`. For a staff record without a login it returns `{ officer: false, manager: null }`.
- `planAccess({ before, want, isSelf, lastCompanyManager, fromStaffRecord })` returns `{ role, link: 'keep'|'link'|'unlink', clearClient, clearPay }`, or throws `{ status, message }`. Rules:
  - at most one manager access;
  - Venue manager cannot be combined with the Officer app ("Venue managers use their own portal, so untick Officer app");
  - something must be ticked ("Tick at least one, or use Deactivate");
  - your own access can't be changed;
  - the last active company manager can't be moved off Office. This reuses `blocksLastCompanyManager` from `lib/access.mjs` and its message;
  - a staff record with no login needs the Officer app to get one (so the login stays linked to that record).
- `appsLine({ officer, manager, venues, can_see_pay })` gives the summary used in the header and the audit, e.g. "Officer app and Security manager for Club One and The Vaults · can see pay".

### 2. `modules/users.mjs`
- **Extract `userRows(where, params)`** from the `users.list` SQL, so the list and the new `users.get` share it. Add `users.get` (CO) for one id.
- **Extract `setLoginStatus(t?, actor, userId, status)`** from `users.update`'s status branch. It carries the self guard, the platform guard, the last-company-manager guard, unlinking a disabled manager's staff record, `disconnectUser`, and the audit. `users.update` calls it.
  - Also export `assertCanDisable(actor, userId)`, so callers can check the rules before their own transaction.
- **Extract `linkStaffRecord(t, u, officerId?)`** from `users.setWorksShifts`: link a given or same-email record, or create and seed one. `setWorksShifts` keeps working by calling it.
- **New `users.setAccess` (CO).** Input: `{ id | officer_id, officer, manager, venue_ids, client_id, can_see_pay, invite }`.
  - **With a login:**
    1. Run `guardPlatformAccount`, then `planAccess`.
    2. In one transaction:
       - update `users.role`, `client_id` (cleared for company/officer, checked with `checkClient`) and `can_see_pay` (only kept for security);
       - delete both venue tables for this user, then `setVenues(t, id, role, venue_ids)`;
       - link with `linkStaffRecord`, or unlink with `UPDATE officers SET user_id = NULL`.
    3. Audit `user.access` with the before and after apps plus `accessChanges(...)` for venues and pay.
    4. `notify([id], { kind: 'access', title: 'Your access changed', body: 'You can now use …' })`.
  - **Staff record without a login, Officer app ticked:**
    1. `createInvite` with role = the manager access or `'officer'`.
    2. Link `officers.user_id` and set the venues.
    3. Send `sendInviteMail` only when `invite` is set. Otherwise return `invite_link` for Copy.
  - This replaces the "deactivate and invite again" rule. Old actions stay for old callers: `users.invite`, `users.update`, `setWorksShifts`, `officers.inviteLogin`, `officers.linkLogin`.

### 3. `modules/people.mjs` (new, registered next to the users module)
- **`people.resolve` (MGR):** `{ id }` returns `{ officer_id, user_id }`. The id may be a staff record or a login.
  - A login with a linked record returns that `officer_id`, so the page uses one address per person.
  - A login without a record returns 403 for anyone but company managers.
  - For security managers, the officer is checked with `assertOfficerAccess`.
- **`people.add` (CO):** `{ first_name, last_name, email, phone, goes_by, officer, manager, venue_ids, client_id, can_see_pay, status: 'active'|'applicant', invite }`.
  - **Duplicate email first.** A login with that email fails with 409 `{ existing: { user_id, officer_id, name, can_add_officer } }`. A staff record with that email fails with 409 `{ existing: { officer_id, name } }`. This uses `assertNotDuplicate` / `linkableManager` from `officers.mjs`.
  - **In one transaction:**
    - a manager access gives a `createInvite` with that role, plus client and venues;
    - the Officer app, or no app at all, gives `insert('officers')` plus `seedOnboarding`, linked to the login when there is one;
    - Officer app alone gives an officer login.
  - The audit matches `officer.create` / `user.invite`. With `invite` set it sends `sendInviteMail`, and the result returns `invite_link`, `emailed` and the ids.
- **Exported `createPerson(t, input)`** is used by `people.add`, by `staffSetup.mjs` Create profile / Create login (which replaces its own copies), and by `users.invite` as a thin wrapper.

### 4. `modules/hr.mjs` (offboarding)
- **`offboarding.save`:** replace the raw `UPDATE users SET status` with `login: 'keep' | 'officer_only' | 'all'`. The old `disable_login` boolean maps to `all` / `keep`.
  - `assertCanDisable` runs before the transaction, so the last-manager rule fails with the same message as the Access tab.
  - After the transaction:
    - `officer_only` unlinks the staff record (audit `user.works_shifts` off, reason `offboarded`);
    - `all` calls `setLoginStatus(disabled)`.
- **`offboarding.rehire`:** reactivates through `setLoginStatus(active)`, but only an officer login with a password. The rule is unchanged; it now has an audit and History.

### 5. Tests: `test/people.test.mjs`
- `planAccess`:
  - only one portal at a time;
  - Officer app pairs with Office or Security, not Venue manager;
  - nothing ticked;
  - your own access;
  - the last company manager;
  - a staff record without a login.
- `appsLine` wording.
- Source checks:
  - `hr.mjs` has no `UPDATE users SET status`;
  - offboarding uses `setLoginStatus` / `assertCanDisable`;
  - `users.setAccess` deletes both venue tables before `setVenues`;
  - `people.add` checks for a duplicate before inserting.
- `dualrole.test.mjs`, `access.test.mjs` and `staffSetup.test.mjs` keep passing. Update their source regexes only where a body moved into a helper.

## Client (app/src)

### 6. `pages/people/_person.jsx` (new): the shared parts
- **`AccessTab({ person, reload })`, for company managers only:**
  - Four **Toggle** rows (the kit has no checkbox): Officer app · Office (company manager) · Security manager · Venue manager.
    - Turning a manager access on turns the others off, with a one-line note.
    - Venue manager turns the Officer app off, and the reverse.
  - Then `AccessFields` (client and venues, from `_access.jsx`) and Can see pay for security.
  - **Preview:** a new pure `accessPreview(start, v, venues)` in `_access.jsx`, lifted from `UserSheet`'s gain/lose code. It also lists apps gained and lost, and venues kept and lost when the type moves. It shows "Will gain … · Will lose …" above Save.
  - **Save** calls `users.setAccess`, then `refresh()` from `useAuth` if the person is me.
  - **Invite block:**
    - `inviteStatus` line;
    - Send / Resend invite (`users.resendInvite`, or `users.setAccess` with `invite` when there is no login yet);
    - `CopyLink`.
  - Password reset link (`users.resetLink`).
  - **Deactivate / Reactivate** (`users.update` with status), with the last-manager note and the self rule as in today's `UserSheet`.
  - The **merge-officer-login** offer, moved from `WorksShifts`, appears when Officer app is ticked on a manager who has a twin officer login.
  - Platform admin: read-only, with the Callout.
- **`useInvite(person)`:** one hook for Send, Resend and Copy, used by the Access tab and the header button.
- **`PersonHistory({ officerId, userId })`:** `audit.list` for the officer (related) and for the user, merged newest first. It reuses `actionLabel` / `changeLine` (moved out of `Settings.jsx` into `_history.jsx`) and adds labels for `user.access`.
- **`AddPersonSheet({ preset, onClose, onDone })`:**
  - Fields: name (first/last), goes by, email, phone, the same app toggles, venues and pay; for Officer app or no app, also the starting status (active/applicant) and roles.
  - Buttons: **Create** / **Create and send invite**.
  - On a 409 `existing`, it shows who has the email, with **Open their page** and, when `can_add_officer`, **Add Officer app to them** (calls `users.setAccess` with `officer: true`).
  - `InviteSheet` stays exported as `(p) => <AddPersonSheet preset={{ manager: p.preset?.role, ...}} />`, so any caller left over still works.
- **`UserProfile({ userId })`**, for people with no staff record:
  - a `Page` with the same header (Avatar, name, `appsLine`, status pill);
  - Tabs **Overview** (name, goes by, email, phone, last seen; Edit sheet calls `users.update`; `RecentEmail`) · **Access** · **History**.

### 7. `StaffProfile.jsx`
- **Resolving the id:** `StaffProfile` first calls `people.resolve`.
  - If an officer is found under another id, it does `<Navigate replace>` to `/staff/<officer_id>` (tab and sub kept).
  - If there is only a login, it renders `UserProfile`.
- **`GROUPS`:**
  - add `['access','Access',[['access','Access']]]` after Overview (company only, added to the CO filter);
  - add `['history','History',[['history','History']]]` at the end.
  - `RecordHistory` moves from Overview to History as `PersonHistory`.
  - Old `tab` / `sub` links are unchanged.
- **Header:**
  - the `AppAccess` row shows `appsLine` plus status, and links to `?tab=access` instead of Settings;
  - "Invite to app" and "Resend invite" become one **Send invite** / **Resend invite** action using `useInvite`;
  - the `officers.inviteLogin` / `linkLogin` confirm path goes into `useInvite` (the `can_link` case).

### 8. `Staff.jsx`: People list
- **`who` in the address**, default `officers`, shown as a Segmented control: Officers · Office · Security managers · Venue managers · All.
  - **Officers:** exactly today's list (grid/list, filters, bulk, export).
  - The App set-up filter gains **No app** (`!o.user_id`).
  - **Other chips** (company only):
    - `users.list` rows in a `Table` on wide screens and `List`/`Row` on narrow ones, with columns Name, Can use (`appsLine`), Venues, Status, Last seen;
    - a status Select (All / Active / Invited / Disabled);
    - search over name, email, client and venues (the code from `UsersTab`).
  - **All** merges `users.list` with officers that have no login.
  - Clicking a row opens `/staff/<officer_id || user id>`.
  - Security managers don't see the Segmented control.
- The **Add** button opens `AddPersonSheet`, preset from the chip (Office, Security or Venue sets the manager access; Officers sets the Officer app).
- `ui/hubs.js`: the Staff tab label changes from `'Officers'` to `'People'` (same `to: 'staff'`).

### 9. Settings and the other callers
- **`Settings.jsx`:**
  - drop `users` from `TABS`;
  - `?tab=users` becomes `<Navigate replace to="/company/staff?who=all">`, and `&user=<id>` goes to `/company/staff/<id>`;
  - delete `UsersTab`, `UserSheet`, `WorksShifts` and `AccessHistory` (the needed parts are now in `_person.jsx` / `_history.jsx`).
- **`VenueDetail.jsx` People tab:**
  - each row links to `/company/staff/<user id>`;
  - remove the "Manage users and venue access" button;
  - Invite opens `AddPersonSheet` preset `{ manager: 'venue', venue_ids: [v.id], client_id }`;
  - Remove from this venue stays on `users.update`, which is audited.
- **`money/_client.jsx`:** Invite contact opens `AddPersonSheet` preset with the client's venues. Contact names link to the person.
- **`Recruitment.jsx`:**
  - Add applicant opens `AddPersonSheet` preset `{ status: 'applicant', officer: false }`. Applicant-only fields such as source are kept by passing `extra` fields when the current form has them; check during the build.
  - `HireSheet` keeps its steps, and its invite goes through the same `createOfficerLogin` + `sendInviteMail`.
- **Offboarding (`_profileTabs.jsx`):**
  - For a dual person, a Select: Keep app access / Remove Officer app only / Switch off all app access.
  - Otherwise, the Toggle maps to `all` / `keep`.
  - The request sends `login`.
- **Wording:**
  - `StaffSetup.jsx:139,182` and the `_access.jsx:97` hint now say "Staff → People".
  - The `Staff.jsx:163` text points to "the Access tab".
  - Leave the old What's new cards as written, since they are history.

### 10. What's new card
- Add an entry at the top of `_whatsnew.jsx`: "One page for every person, and what they can use".
- Picture: `app/public/whatsnew/person-page.webp`, made with the same AI image steps as the last cards, in the same commit.

## Files
- **New:**
  - `functions/api/lib/apps.mjs`
  - `functions/api/modules/people.mjs`
  - `functions/api/test/people.test.mjs`
  - `app/src/pages/people/_person.jsx`
  - `app/public/whatsnew/person-page.webp`
- **Changed:**
  - `functions/api/modules/users.mjs`, `hr.mjs`, `staffSetup.mjs`, the module registry
  - `app/src/pages/people/StaffProfile.jsx`, `Staff.jsx`, `Settings.jsx`, `_access.jsx`, `_history.jsx`, `_profileTabs.jsx`, `Recruitment.jsx`, `StaffSetup.jsx`, `_whatsnew.jsx`
  - `app/src/pages/money/VenueDetail.jsx`, `money/_client.jsx`
  - `app/src/ui/hubs.js`

## Release
1. `cd functions/api && npm test` (all green, plus the new tests).
2. ui-lint at or below 73.
3. Commit the code and the What's new card with its picture.
4. `openkbs fn deploy api`.
5. Build the site, then grep `site/app` for the Opulence API id `6ij75kpgf7kiwtvwo3nke763dm0oejxo`.
6. Commit `site/app`.
7. `openkbs site deploy`.
8. `git push`.

Commits stage only my files. They end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Verification
- **API tests** as in step 5.
- **On the live site with test records only.** Test emails (`*@example.test`), use **Create** (not send) and Copy invite link, never a real address.
- **agent-browser at 1280 and 390, as a company manager**, acceptance checks 1–9:
  - People chips and the "vault" search;
  - names opening the page from the rota, venue page, client contacts and People;
  - an office manager's page has three tabs;
  - the old Settings link redirects;
  - Officer app plus Security with two venues shows Will gain, and History records it;
  - Security to Venue shows the venue move;
  - the last manager is blocked in Access and in Offboarding with the same message;
  - Add person from the venue page comes preset;
  - a duplicate email offers Open / Add Officer app;
  - offboarding a dual person asks which access to remove;
  - no stray invite buttons remain.
- **Check 10 as a security manager:** no Access tab and no pay without Can see pay.
- **Check 11:** the What's new card shows its picture.
- Clean up the test people afterwards: deactivate them, and set their staff records to Left.
- `agent-browser close --all`.
