# Spec: One person, one page: profile, access and app access in one place

## Why
Handling one person today means visiting several places, each with its own rules:
- Settings → Users & access edits the login.
- Staff → a profile edits the staff record.
- Invites start from seven different places.
- "Also works shifts" is set in two places, venue access in three, and app access is switched off in two places that behave differently.

Officers can't be found in Users & access at all. Office staff and venue managers can't be found in Staff.

**Goal:** wherever you click a person's name, you get one page with everything about them (profile, what they can use, their venues, work and history). There is one list of everyone and one way to add someone.

## Who it's for
- **Company managers**, who set up, change and remove people.
- **Security managers** see the same page read-only for officers at their venues, as today.
- Venue managers and officers see no change.

## Scope

### 1. One list: Staff → People
- The first tab of Staff is renamed from **Officers** to **People** (same address, `/company/staff`). It lists everyone: officers (with or without the app), company managers, security managers and venue managers.
- **Chips:** All · Officers · Office · Security managers · Venue managers · Invited · Disabled · No app.
  - The Officers chip is the default, so the page opens exactly as today, with today's officer columns, bulk actions and export.
  - The other chips show Name, Can use, Venues, Status (Active / Invited · sent date / Disabled) and Last seen.
- Search by name, email or venue. Chips and search are kept in the page address.
- **Settings → Users & access** is removed from Settings. Its old addresses (`/company/settings?tab=users` and `&user=<id>`) open People, or that person's page.
- Security managers see only the Officers chip, as today.

### 2. One page per person
- **Address:** `/company/staff/:id`, which works with either the staff-record id or the login id. Every name links here:
  - People
  - the rota
  - the venue page's People tab
  - the client page's contacts
  - timesheets
  - incidents
  - Recruitment once hired
- **Header:**
  - photo and name;
  - one line on what they can use, e.g. "Officer app and Security manager for Club One and The Vaults · can see pay";
  - status: Active / Invited · emailed 14 Nov / Disabled / No app;
  - main actions: Edit, and Send invite or Resend invite when it applies.
- **Tabs:**
  - **Officers, and managers who also work shifts:** Overview · **Access** · Compliance · Work · Pay · HR · **History**. These are today's tabs, plus Access and History.
  - **Office staff and venue managers:** Overview (name, goes-by, email, phone, photo, last seen) · **Access** · **History**. No empty officer tabs.
- **Access tab, the one place for app access:**
  - **Apps they can use (tick boxes):**
    - Officer app
    - Office (company manager)
    - Security manager
    - Venue manager
  - **Rules:**
    - Office, Security manager and Venue manager are different portals, so a person holds **at most one** of them. Ticking one unticks the other with a note.
    - **Officer app** can be added to Office or Security manager. This is today's "also works shifts", where they switch between Manager and My shifts.
    - Venue manager stands alone, as today.
  - **Venues** (Security manager and Venue manager): today's client picker and venue ticks, moved here.
  - **Can see pay** (Security manager): today's toggle, moved here. Office always sees pay, as today.
  - **Before Save**, a "Will gain / Will lose" line covers apps, venues and pay. Nothing changes until Save.
  - **Invite:** Send invite / Resend invite / Copy invite link, with "emailed on … / didn't go through". This is the only invite control, replacing the separate ones on the profile header and in Settings.
  - **Password reset link** stays where it is today.
  - **Switch off app access:** one Deactivate / Reactivate, with the same rules everywhere:
    - it is recorded in History;
    - a shared mailbox is disconnected;
    - the last active company manager can't be switched off;
    - you can't switch yourself off.
  - **Platform admin account:** read-only to others, as today.
- **History tab:** today's access history (who changed what, with the before and after values and the venues added or removed) merged with the staff-record history, newest first.

### 3. Change access in place
- Ticking a different app type changes the same login:
  - the person keeps their email and password;
  - their next page load shows the new menu;
  - they get a notice: "Your access changed: you can now use …".
- The type of venue link follows the new type: security venues become venue-manager venues, and the other way round. Both kept and lost venues are shown before Save.
- **Officer app ticked:**
  - on a manager, this links or creates their staff record (today's "also works shifts");
  - for a new person, it creates a staff record with the details given.
- **Officer app unticked:**
  - for a manager, the shift side is unlinked, as today;
  - for an officer with nothing else ticked, app access is switched off. The staff record stays.
- Each change is recorded in History with who made it.
- The "deactivate and invite again" rule and its note go away.

### 4. One way to add a person
- One **Add person** sheet: name, email, phone, then the Apps tick boxes, venues and pay, then **Create** or **Create and send invite**.
  - If "Officer app" is ticked, it also asks the usual starting details (status: active or applicant).
  - With no app ticked, it creates an officer staff record without the app, as "Add staff member" does today.
- The same sheet, already filled in, replaces:
  - Staff → Add staff member
  - Settings → Invite user
  - the venue page's Invite venue manager (Venue manager ticked, plus this venue)
  - the client page's Invite contact (Venue manager ticked, plus this client's venues)
  - Recruitment Add applicant (as an applicant)
- Hiring in Recruitment and the online application keep their steps. Their "email them an app login" uses the same invite action.
- **Staff setup forms** (platform admin) keep their review screen. Create profile / Create login runs the same create action, and Create and send invite the same invite.
- If the email already belongs to someone, the sheet says who and offers **Open their page** or **Add Officer app to them**, instead of making a second login.

### 5. Offboarding and rehire
- Offboarding's "Disable app login" and Rehire's reactivation use the same switch as the Access tab, so the same rules and History apply.
- For someone who is both an officer and a manager, offboarding asks: "Remove the Officer app only" or "Switch off all app access".

### 6. Clean-up
- The "Manage users and venue access" button on the venue page goes. Each row on that page opens the person, and Remove from this venue stays and is recorded.
- Wording: "Settings → Users" and "Users & access" in Staff setup, Help and empty states becomes "Staff → People".

### 7. What's new card
- A new card, "One page for every person, and what they can use", with its own AI picture.

## Decisions (defaults used, say if you want otherwise)
1. **Change access in place: yes,** with Will gain / Will lose and History. (You didn't answer; recommended.)
2. **One Add person sheet: yes.** (You didn't answer; recommended.)
3. **One switch-off with the same rules: yes.** (You didn't answer; recommended.)
4. **Tick boxes are the apps only**, as you chose. There are no per-area or per-action ticks: what each app type can open stays as today, plus Venues and Can see pay.
5. **No venue manager plus officer combination.** It can be added later if needed.

## Out of scope
- Per-area or per-action permissions (Decision 4).
- Any change to what each app type can see or do, pay visibility, approvals, sign-off or eligibility.
- Officer and venue manager portals.
- Shared mailbox access, which stays in Settings → Email.
- Platform admin rules.
- Staff setup's review screen layout.

## Constraints
- **Old links keep working:** `/company/staff/:id` (staff id), `/company/settings?tab=users`, `&user=<id>`, and the `tab`/`sub` addresses on the profile.
- **Test records only:** no real invites. Use test emails and Copy invite link, never a real person's address.
- **Server:**
  - Access changes go through one action that checks the rules above.
  - Existing actions stay working for old callers.
  - A login's type can now change. Every check that reads the type keeps working because it reads it on each request.
- **Build:** ui-lint stays at the baseline. Kit components only. Icon sizes as the kit allows.
- **Release:** commit, `npm test`, build, `openkbs fn deploy api`, commit the build, grep the build for the Opulence API id, `openkbs site deploy`, push. One What's new card with its picture in the same commit.

## Acceptance checks
1. Staff → People opens on Officers as before. The Office and Venue managers chips list the managers, and search "vault" finds The Vaults' venue managers.
2. Clicking any person's name (rota, venue page, client contacts, People) opens their one page.
   - An office manager's page shows Overview, Access and History only.
   - `/company/settings?tab=users&user=<id>` lands on the same page.
3. Access tab, test person, Officer app only. Ticking Security manager plus two venues shows "Will gain: Security manager, Club One, The Vaults". After Save the same login signs in to the Manager side with My shifts, and History shows the change and who made it.
4. Ticking Venue manager on a Security manager unticks it, moves the venues and shows the kept and lost venues before Save.
5. The only active company manager can't be switched off from Access or from Offboarding, and both give the same reason.
6. Add person from the venue page opens with Venue manager and the venue ticked. Create and send invite shows the invite status, and the person appears in People under Invited.
7. Adding an email that already exists offers Open their page / Add Officer app instead of a second login.
8. Offboarding a dual person asks which access to remove, and History records it.
9. No invite or resend button remains outside the Access tab, apart from the Recruitment hire, application and Staff setup steps, which use the same action.
10. A security manager opens an officer's page and sees no Access editing and no pay detail without Can see pay.
11. The What's new card shows with its picture.

## Verification
- **API tests:**
  - the access-change rules (one portal at most, Officer app pairing, venue link moves, last manager, self);
  - audit before and after;
  - duplicate email on add;
  - offboarding through the same switch.
- **Mock data:** office, security, venue, dual and invited people.
- **agent-browser at 1280 and 390:** checks 1–10 as a company manager and as a security manager. Then `agent-browser close --all`.
