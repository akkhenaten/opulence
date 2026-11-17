# Spec: doubles go straight to the right record, and venue managers get the same one-trip form

## Context
New officers now come in through one trip: they fill in the staff form and set a password, and the office taps **Make live**. Two gaps are left:

1. **Doubles.** A form from someone already on file shows a "Possible duplicate" note, but the office then has to Discard it, find the person and open them by hand. The user wants every double spotted, and one tap that deletes the form and opens the person it matches.
2. **Venue managers** still go the old way:
   - no password on the form;
   - only the platform admin sees their forms;
   - two buttons (Create login / Create and send invite);
   - a second email with an invite link.

   They should get the same journey as officers.

**Decisions:** a double means the same **email or SIA number**, as today; no new matching rules. The user skipped the other questions, so this spec uses the recommended answers, and they can be changed when approving:
- the double tap discards the form and opens their record, changing nothing on it;
- company managers and the platform admin can make venue managers live;
- a venue form whose email already has a login counts as a double.

## Who it's for
- **Company managers and the platform admin**, who check new forms.
- **New officers and venue managers**, who fill in the form.

## Doubles: spotted everywhere, one tap to the right record
**What counts as a double:**
- **Officer form:** an existing staff record with the same email or SIA number (spaces ignored), or a login with that email.
- **Venue manager form:** an existing login with the same email (any role).

**Where it is spotted:**
- **In the forms list** (People and Staff setup), a double has the amber pill "Already on file: <Name>".
- **In the form sheet:**
  - a warning at the top: "This looks like <Name>, already on file (<status>). Same email / Same SIA number". It says which one matched.
  - **Make live is replaced** by the main button **Discard and open <Name>**. It deletes the form, its files and the stored password, shows the toast "Form discarded — this is <Name>", and opens:
    - an officer double: their person page, Overview tab;
    - a venue manager double: their person page, **Access** tab, so the office can tick Venue manager there.
  - The plain **Discard** button stays as well.
- **On a late double:** if Make live hits a double that appeared after the sheet opened (another manager added the person meanwhile), the sheet swaps to the same warning and the **Discard and open** button. There is no dead end.
- **On a gone form:** if the form was already made live or discarded by someone else, the sheet says so. If it can, it offers **Open their page** for the person it became.

**When the person sends the form:**
- An email that already has a login is blocked, as today, with "This email already has a login. Sign in, or ask the office to update your details." This now applies to the venue form too.
- An SIA match is **not** blocked at sending, so we never tell a stranger who holds an SIA number. The office sees it as a double.

**Not in scope:**
- Copying details or documents from the double onto the existing record.
- New matching rules (phone, NI, name + date of birth).
- Spotting two waiting forms from the same person.

## Venue managers: the same one-trip journey
**The venue manager form** (`/app/staff-form/<venue link>`):
- **Sections:**
  - **You:** name, known as, job title.
  - **Contact:** email ("you sign in with this"), mobile.
  - **Your venues:** the venue names they type, as today.
  - **Photo** (optional).
  - **Your password:** at least 8 characters, typed twice.
  - **Consent.**
- **Errors** show under the field they belong to, the same as on the officer form.
- **The done screen** says the office is checking, gives the email they will sign in with, and has a "Go to sign in" link.
- **Signing in before they are live** gives "The office hasn't finished checking your details yet. You'll get an email when you're live."

**Who checks:** company managers and the platform admin, the same as for officers.
- Venue manager forms join the People callout, which becomes "N new staff forms to check", plus Needs you and the bell.
- Rows in the list are labelled **Officer** or **Venue manager**.
- Security managers don't see them.
- Staff setup (platform admin) keeps its two lists.

**The sheet for a venue manager form:**
- **Content:** name, contact, job title, the venues they typed, and the photo.
- **Venue picker:** pre-ticked with the active venues their typed names match. If none match, it says "Pick their venues", and Make live stays off until at least one is ticked.
- **Buttons:** one **Make live** button, plus Discard. Create login / Create and send invite go away.

**What Make live does for a venue manager, in one step:**
- **Creates** an active Venue manager login with the password they chose, their photo, and the ticked venues (and those venues' clients, as today).
- **Emails** "You're live at <company>", with their sign-in email and a Sign in button.
- **Deletes** the form and its stored password.
- **Lands** on their person page, **Access** tab, with the toast "<Name> is live".
- **Welcome:** they get the welcome post on Everyday if the usual rules allow it.

**Older venue forms sent without a password:** Make live creates the login and emails them an invite link, as before. The sheet notes this before the tap.

**Orb:**
- "Set up the staff setup submissions" keeps working.
- For company managers, Orb can make officers and venue managers live; it no longer offers "send invite" as a choice.
- The venue link itself (on/off, Replace link) stays with the platform admin only.

## Edge cases
- **Two managers tap Make live at once:** the second gets "Already made live", with **Open their page**.
- **A venue name was typed that no longer matches an active venue:** "Pick their venues" shows, and Make live is held until a venue is ticked.
- **The email is used by a login created after the form was sent:** this is a double, and the sheet offers Discard and open.
- **Forms are still deleted automatically after 60 days.**

## What does not change
- No change to visibility, approval, pay or eligibility rules.
- Venue manager access rules from the person page stay the same: one manager access at a time, and no Officer app for venue managers.
- Old links (`?form=`, `?forms=1`, Staff setup) keep working.

## Acceptance checks (live, test records only, `*@example.test`)
1. **Officer double by SIA.** Send an officer form with an existing test officer's SIA number and a new email.
   - People shows "Already on file: <Name>".
   - **Discard and open** removes the form and opens that officer.
2. **Officer double by email.** Send an officer form with an existing test officer's email.
   - It is blocked at sending if they have a login.
   - If they have no login, it shows as a double.
3. **Late double.** A manager adds the person by hand while the sheet is open; Make live then shows the double warning and Discard and open.
4. **Venue happy path.** Send a venue form with a password and a matching test venue name.
   - Signing in before live gets the "office hasn't finished" message.
   - A company manager sees it in People, Needs you and the bell, and taps Make live.
   - They land on the Access tab with the venue ticked.
   - The test manager signs in with the form's password and sees the venue portal for that venue only.
5. **Venue name with no match.** Make live is held until a venue is picked.
6. **Venue double.** Send a venue form with an email that already has a login.
   - It is blocked at sending.
   - If the login is created after sending, the sheet shows the double and Discard and open goes to their Access tab.
7. **Old venue form without a password.** Make live sends an invite.
8. **Clean up** all test forms, logins and staff records afterwards.

## Release
- A What's new card with its own AI picture, in the same commit.
- Tests updated (`staffSetup.test.mjs`); all pass. ui-lint stays at or below 73.
- Order: deploy the API (no new migration; `password_hash` already exists), then build, check the API id, deploy the site, push.
