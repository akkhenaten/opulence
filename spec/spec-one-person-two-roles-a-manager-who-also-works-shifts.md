# Spec: One person, two roles (a manager who also works shifts)

## Goals
- Let a company manager or security manager also work shifts **with one login (one email)**. They can be rostered, clock in from the officer app, see their own shifts and pay, and still manage.
- Stop anyone approving their own hours or pay. The only exception is a one-person setup where nobody else can approve, and even then the approval is clearly flagged.
- Remove today's workarounds: a second email for an officer login, or a staff record with no app access.

## Today (for context)
- Each login has exactly one role: company manager, security manager, venue user or officer. One login opens one portal.
- If a staff record uses an email that already signs in as a manager, the system refuses to invite it ("This email already signs in as a manager or venue user").
- Nothing stops a manager from approving their own timesheets, clock exceptions or pay. Today that is only safe because a manager can never be an officer too.

## Who it applies to
- **Company managers** and **security managers** can have a linked staff record.
- **Venue users** can't. A venue login stays venue-only.

## Functional requirements

### 1. Setting it up (linking)
- **From People → Staff:** when adding or editing a staff record with an email that already signs in as a company or security manager, offer **"Link to their manager login"** instead of the error. Once linked, that person's login also gives access to "My shifts". No invite email and no second email are needed.
- **From a manager's user profile** (Settings → Users): add an **"Also works shifts"** option. It either creates a new staff record from the manager's name, email and phone, or links an existing staff record that has no login.
- The staff record keeps everything staff records have today: job roles (door, supervisor and so on), licences, pay rates, availability, training and holiday allowance.
- **Unlinking:**
  - Turning off "Also works shifts" removes officer-app access. The staff record stays, with "No login", together with all its history.
  - Disabling or removing the manager login leaves the staff record in place, also with "No login". A company manager can re-invite it later as a normal officer login.
- **Merge existing two-email setups:** a company manager can merge a separate officer login into a manager login, using one action with a confirmation. Shifts, timesheets, clock history, pay, holiday and training stay on the staff record. The old officer login is disabled and can no longer sign in. The merge is recorded in the audit trail.
- Name, email and phone changes stay in sync between the manager login and the linked staff record, as they already do for officers.

### 2. Switching between "Manager" and "My shifts"
- A person with both roles sees a clear switch between **Manager** and **My shifts**:
  - in the account sheet / profile menu
  - as a compact switch in the sidebar and header on desktop, and at the top of the menu on the phone.
- **"Manager"** is their normal company or security manager portal, with no changes to what they can see or do there.
- **"My shifts"** is the officer app: home, clock in/out, my shifts, open shifts and cover offers, pay, holiday, training, toolbox and messages. It works exactly as it does for any officer.
- Switching keeps them signed in. There is no second password.
- People with only one role see no switch.

### 3. Which side opens first
- After signing in, or when opening the app:
  - **If they are clocked in, or have a shift starting within the next 2 hours, it opens "My shifts".**
  - **Otherwise it opens "Manager".**
- Notification taps and deep links open the side the item belongs to and switch automatically. For example, a shift offer opens "My shifts" and a clock exception opens "Manager".

### 4. No approving your own work
For anyone with both roles, the server must **block** them from these actions on their own staff record:
- approving or editing their own timesheet
- deciding their own clock exception, or setting their own clock times by hand
- signing or disputing their own timesheet as company
- resolving a dispute on, finalising, or approving on their behalf their own pay statement in a pay run.

Who can do these instead:
- any **other** company manager, or
- any **other** security manager who covers that venue.

**Exception: sole manager.** If no other active manager could approve, self-approval is allowed. It is stamped **"Self-approved"** on the timesheet, on the clock decision and on the pay-run line, and it is recorded in the audit trail.

In the manager screens, their own items:
- are marked **"You"**
- show the approve, edit and resolve buttons disabled, with the reason "Another manager needs to approve your own hours".

Approving or querying their **own pay statement** from "My shifts → Pay" stays allowed, the same as for every officer.

### 5. Pay and timesheets
- Their hours and pay go through the normal timesheet and pay-run process, like any officer.
- In manager pay screens their own line is **visible, marked "You" and locked**.
- They always see their own pay statement in "My shifts → Pay". For a security manager this applies even without permission to see pay. That permission still controls whether they see **other people's** pay.

### 6. Rota
- Managers can assign their own staff record to shifts and accept their own cover offers.
- In rota views their record shows a "You" marker.
- Assignments are recorded in the shift log as normal.
- All existing rota rules still apply to them: licences, availability, holiday, bans and double-booking.

### 7. Notifications and messages
- One person gets both officer notifications (shift offers, reminders, pay ready) and manager notifications on the same login.
- Each notification shows which side it belongs to, and opening it switches to that side (see 3).
- Messages: the officer-side and manager-side conversations they already take part in both appear. Nothing is duplicated.

## User stories
- As a supervisor who also does door shifts, I sign in once with my email and land on "My shifts" before my shift so I can clock in straight away.
- As a security manager, I switch to "Manager" during a quiet moment to check exceptions, but I can't approve my own late clock-in. Another manager has to.
- As the company owner, I tick "Also works shifts" on a manager's profile, and they can be rostered and paid without a second email.
- As the company owner of a one-person business who covers shifts myself, I can still approve my own hours. They are clearly marked "Self-approved".
- As a company manager, I merge a supervisor's old officer-only login into their manager login so they have one account.

## Acceptance criteria
1. A company or security manager can be linked to a staff record from People → Staff (email match → "Link") and from their user profile ("Also works shifts"). Venue users can't be linked.
2. A linked person sees the Manager / My shifts switch. Unlinked users don't.
3. On sign-in, someone clocked in or with a shift in the next 2 hours lands on "My shifts". Everyone else lands on "Manager".
4. In "My shifts" the person can clock in and out, and see shifts, pay, holiday and training, exactly like an officer.
5. These actions on their own staff record are rejected by the server, whatever screen or request they come from, when another eligible manager exists: approve timesheet, edit timesheet, clock decide, manual clock, company sign or dispute, pay dispute resolve, finalise-on-behalf.
6. With no other eligible manager, those actions succeed and are visibly marked "Self-approved" in the timesheet, the clock history and the pay run, and in the audit trail.
7. Their own lines show "You", with locked actions and an explanation, in timesheets, clock exceptions and pay runs.
8. A security manager without permission to see pay still sees their own statement in "My shifts → Pay". They still can't see other people's pay.
9. Turning off "Also works shifts" removes officer-app access and keeps the staff record and all its history.
10. Merging a separate officer login moves sign-in to the manager login, keeps all staff history, and disables the old login.
11. Single-role users (manager-only, officer-only, venue) behave exactly as today.

## Constraints
- One email = one login. The manager login stays the main one, and officer access comes from the linked staff record.
- Permission checks happen on the server. Hiding buttons is only a convenience.
- No change to what single-role users see or can do.
- Reuse the existing staff-record, officer-app and pay-run flows. No parallel "manager pay" process.

## Out of scope
- Venue users who also work shifts.
- Officers who become managers through the officer app. Promotion still happens in Settings → Users and links the staff record.
- More than two roles on one login, for example security manager + company manager.
- Changing how normal (non-self) approval works.
- Separate passwords or PINs for each side.
