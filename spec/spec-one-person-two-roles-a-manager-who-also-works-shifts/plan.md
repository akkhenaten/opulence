# Implementation plan: One person, two roles (a manager who also works shifts)

Spec: `spec/spec-one-person-two-roles-a-manager-who-also-works-shifts.md`

## Context
Today each login has one role. `users.role` is `company`, `security`, `venue` or `officer`, and `officers.user_id` links a staff record to a login. `assertNotDuplicate` in `functions/api/modules/officers.mjs:42` refuses to link a staff record to an email that already signs in as a manager. No approval endpoint checks whether the approver is the person whose hours they are approving. We want one manager login that also carries a linked staff record, a Manager / My shifts switch, and a server-side ban on approving your own hours or pay. The only exception is the sole-manager case, which is allowed but flagged.

## Core idea: an "acting side" sent with each request
- The manager login keeps its role (`company` or `security`). The staff record links to it through the existing `officers.user_id`.
- The frontend sends `_as: 'officer'` in the POST body when it is on the "My shifts" side. Using a body field means no CORS or header change.
- `userFromEvent(event, body)` in `functions/api/lib/auth.mjs` resolves the effective user:
  - **Officer side** (only if the login is company or security, has a linked staff record, and sent `_as: 'officer'`): the request gets `role: 'officer'`, `officer_id` = the linked record and `login_role` = the real role. Every existing officer action and "own records" filter then works unchanged: clock, rota, pay, Academy, growth and so on.
  - **Manager side** (the default): `role` = the real role and `officer_id: null`, so manager code behaves exactly as today. Several manager paths read `user.officer_id`, for example `officers.get` at `officers.mjs:84/90` and Academy. The link is exposed as `self_officer_id` instead.
  - Any other login ignores `_as`, so `_as` can never grant extra access.
- `publicUser` adds `login_role`, `self_officer_id` and `dual: true/false`.
- The JWT stays as it is (the role is read from the database each time).

## Data model: new migration `functions/api/db/migrations/015_dual_role.sql`
- `ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false`
- `ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false`
- `ALTER TABLE statements ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false`
- No change to the role constraint. The existing UNIQUE `officers.user_id` already allows one staff record per login.

## Backend

### 1. `functions/api/lib/auth.mjs`
- Change `userFromEvent` to take `body` and apply the acting-side logic above.
- Add helpers:
  - `isDual(u)`
  - `ownOfficer(u) = u.self_officer_id || (u.role === 'officer' ? u.officer_id : null)`
- Call site: `functions/api/index.mjs:64` passes `body`. The "officer login with no staff record" guard stays as it is.

### 2. New `functions/api/lib/selfcheck.mjs`
- `async guardSelf(user, officerId, { venueId, companyOnly })`:
  - If `officerId !== user.self_officer_id`, return `{ self: false }`.
  - Otherwise check whether another approver exists:
    - an active, non-system company user other than me, or
    - (unless `companyOnly`) an active security user other than me who covers `venueId` in `security_venues`.
  - If one exists, `fail(403, 'Another manager needs to approve your own hours', { self: true })`.
  - If none exists, return `{ self: true, selfApproved: true }`.
- The caller then sets `self_approved = true` and adds `self_approved: true` to the audit detail.

### 3. Apply the guard (server-side, every path, including Ops AI calls that go through the same actions)
- `timesheets.mjs`:
  - **`approve`:** split the rows into own and others. If own rows exist and another approver exists, reject them with a clear error. If not, approve them with `self_approved`.
  - **`edit`, `sign` (company) and `dispute` (company):** guard.
- `clock.mjs`: `clock.decide` and `clock.manual` are guarded. The officer id comes from the assignment.
- `payruns.mjs`:
  - `resolveDispute` is guarded with `companyOnly`.
  - **`finalise`:** if the caller's own statement in the run would be approved on their behalf (the `direct` set, or `no_response='approve'`) and another company manager exists, reject with "Your own statement needs another company manager". Otherwise set `statements.self_approved`.
  - `release` is guarded.
- `money.mjs`: `pay.addLine` and `pay.removeLine` on their own statement are guarded with `companyOnly`.
- `officers.mjs`: `saveRate` and `deleteRate` are guarded, because a manager setting their own pay rate is also self-approval.
- `growth.mjs`: `payAgreements.save`, `send` and `void` for their own record are guarded with `companyOnly`.
- List endpoints add `is_self` (`a.officer_id = $self`) and `self_approved` to rows so the UI can mark and lock them:
  - `timesheets.list`
  - `clock.exceptions`
  - pay run statement lists in `payruns.mjs` and `money.mjs`'s `pay.list`
  - rota rows in `rota.mjs` where officer names are listed.

### 4. Linking: `officers.mjs` and `users.mjs`
- **`assertNotDuplicate`:** when the email belongs to an active or invited `company` or `security` user who has no staff record, return `{ linkable: user }` instead of failing. `officers.save` with `link_user: true` then sets `user_id` to that manager instead of creating an invite.
  - Without `link_user`, fail 409 with `{ can_link: true, user_name }` so the UI can offer "Link to their manager login".
  - Venue and officer emails keep today's errors.
- **New `users.setWorksShifts`** (company only), taking `{ id, on, officer_id? }`:
  - **`on`:** link the given staff record if it has no login, or create one. The name is split into first and last name, plus email and phone, and `seedOnboarding` runs. The person's status is `active`.
  - **`off`:** `UPDATE officers SET user_id = NULL`. The staff record and its history stay.
  - Audit it as `user.works_shifts`.
- **`users.update`:**
  - Name and phone sync for a linked manager as well (extend the `row.role === 'officer'` branch to "has a linked staff record").
  - Disabling the user leaves `officers.user_id` in place, but the existing `status !== 'active'` check blocks sign-in. The spec says "No login", so on disable also set `officers.user_id = NULL`.
- **`officers.save` update path:** email and name changes already sync to the linked user. Keep that. The guard on a blank email still applies.
- **New `users.mergeOfficerLogin`** (company only), taking `{ manager_id, officer_user_id }`:
  - Both must be active or invited. The manager must be company or security with no staff record, and the officer login must be `officer` with a staff record.
  - In one transaction: move `officers.user_id` to the manager, and set the old user to `status='disabled'` with its tokens cleared.
  - Move the old login's per-user rows to the manager where it makes sense: notifications, conversation participants (skip duplicates) and push devices. Check which tables reference `users(id)` at build time and list them in the migration notes.
  - Audit it as `user.merge_officer`.
- **`users.list`:** already returns `officer_id`. Also return `officer_name`, and a candidate list for merging (officer logins whose name matches).

### 5. `auth.mjs`
- `auth.me` returns the new `publicUser` fields.
- **New `auth.landing`:** for a dual user, return `{ side: 'officer' | 'manager' }`. It returns `'officer'` when the linked staff record has an open clock-in, or an active assignment with `starts_at` within the next 2 hours. The query mirrors `myAssignments` in `clock.mjs`.

### 6. Notifications
No change to how notifications are sent. Officer-side links start with `/officer/`, and the frontend uses that to work out the side.

## Frontend (`app/`)

### `app/src/api.js`
- Store the mode in a module-level `let mode` with a `setMode()` export, saved to localStorage as `orb.side`.
- `api()` adds `_as: 'officer'` when the mode is officer.

### `app/src/auth.jsx`
- Keep `realUser` from `auth.me`. If `dual`, `side` comes from localStorage, falling back to `auth.landing` on first load after sign-in.
- The exposed `user` is the effective user: `{ ...realUser, role: side === 'officer' ? 'officer' : realUser.login_role }`, plus `officer_id` for the officer side. This way every existing `user.role` check keeps working.
- New `switchSide(side, to?)`:
  - Sets the mode, refreshes `auth.me` (which returns the side-resolved user), then navigates to `to || HOME[...]`.
- `signIn`:
  - For a dual user, call `auth.landing` before choosing where to go.
  - `AuthPages.jsx:52/96/147` already use `HOME[u.role]`. Change them to use `landingFor(u)`.
- `signOut` clears the side.

### `app/src/main.jsx`
- **`Guard`:** if `user.dual` and the route's role is the other side the person has, call `switchSide` instead of redirecting. Deep links and bookmarks then work.
- **`Open`:** a link starting with `/officer/` switches to the officer side. Manager links (`/company/`, `/security/`) switch to the manager side. Shortcuts use the current side.

### Switch UI
- **New `app/src/layouts/SideSwitch.jsx`:** a two-segment control, "Manager | My shifts", in the iOS segmented style from the existing `ui/` kit.
- It is shown:
  - in `Shell.jsx`, at the top of the desktop sidebar and in the mobile "More" sheet header
  - in `AccountSheet.jsx`, under the name, next to the role pill.
- It is hidden unless `user.dual`.

### Settings → Users (company)
- Manager row: an "Also works shifts" toggle, with a picker for "create new / link existing staff record without a login" → `users.setWorksShifts`.
- On an officer login that looks like a duplicate of a manager: a "Merge into manager login" action with a confirm sheet → `users.mergeOfficerLogin`.

### People → Staff (`app/src/pages/people/_parts.jsx`, `Staff.jsx`)
- When saving returns `can_link`, show an inline banner: "{name} already signs in as a manager. Link this staff record to their login?". It re-submits with `link_user: true`.
- The status pill shows "Manager login" for linked managers.

### "You" marker and locks
- Add a shared `isSelf(row)` helper (`row.is_self`).
- `pages/manager/Timesheets.jsx`, `Exceptions.jsx`, `money/PayRun.jsx` / `StatementDetail.jsx` and rota rows:
  - Show a "You" pill.
  - Disable the select checkbox and the approve, edit, resolve and add-line buttons, with the hint "Another manager needs to approve your own hours".
  - Show a "Self-approved" pill where `self_approved`.
- The server stays the authority. The UI just mirrors it.
- **Officer side (`/officer/pay`):** this already works through the effective role. A security manager without permission to see pay still sees only their own pay, because the officer path filters by `officer_id`.

### Help and API docs
- Add a short "Working shifts as a manager" section to the help guide (`pages/shared/Help.jsx` content).
- Document the new actions and `_as` in `app/API.md`.

## Tests (`functions/api/test/*.test.mjs`, `node --test`)
- Unit tests for the effective-user resolution, using a pure function `resolveActing(row, as)` that is exported from `lib/auth.mjs`:
  - a manager with a link and `_as: 'officer'` becomes `officer` with an `officer_id`
  - a manager without a link ignores `_as`
  - a venue login ignores it
  - the manager side has `officer_id` null and `self_officer_id` set.
- A unit test for the `guardSelf` decision logic, factored as a pure `decideSelf({ isOwn, otherApprovers })`.

## Rollout
1. Commit (`feat: one login for managers who also work shifts`) and push.
2. `openkbs fn deploy api`. The migration runs on the first request.
3. Build the app (`npm run build` in `app/`), then `openkbs site deploy`.
4. Update the board card `McZdiRu2` with a business-language comment and move it to Review.

## Verification
1. Run `node --test` in `functions/api`. All tests pass.
2. Use `scripts/seed*.mjs` data on the deployed project, with a test company manager A, security manager B covering venue V, and company manager C:
   - From Settings → Users, turn on "Also works shifts" for B. B signs in once and sees the switch.
   - Roster B on a shift at V starting in 1 hour. B's sign-in lands on "My shifts", and B clocks in there.
   - B switches to Manager → Exceptions/Timesheets. B's own row shows "You" and is locked. Calling `timesheets.approve` directly with B's own id returns 403.
   - C approves B's timesheet, which succeeds.
   - Disable C and A (a sole-manager scenario using a fresh company with one company manager who works shifts). Self-approve succeeds, and "Self-approved" shows on the timesheet, clock history, pay run and audit log.
   - In People → Staff, add a staff record using A's email. The "Link to their manager login" banner appears and linking works with no invite email sent.
   - Merge an existing second-email officer login into a manager. The old login can't sign in, and the shifts, pay and Academy history appear under My shifts.
   - Turn off "Also works shifts". The switch disappears, the staff record shows "No login", and its history is kept.
   - Officer-only, venue and manager-only users show no switch, and their pages are unchanged.
3. Use `agent-browser` to screenshot the switch on desktop and phone sizes, then `agent-browser close --all`.
