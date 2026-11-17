# Spec: New staff in one trip — fill in the form, set a password, the office makes them live

## Why
Today a new officer goes through two separate trips, and only one person in the office can move them on:
1. **The form.** They fill in the shared staff form. It has no password, and the finish screen just says "sent to the office".
2. **The review.** Only the **platform admin** sees the submission, on the Staff setup screen. Company managers aren't told about it, and it isn't in Needs you or People.
3. **Two create buttons.** The admin picks between "Create profile" and "Create and send invite". "Create profile" leaves them with no login, so someone later has to send an invite from the Access tab.
4. **A second email.** The officer gets an invite email, opens it and only then sets a password.
5. **Loose ends in SIA and right to work.** The SIA number, expiry and front of the card land in the SIA section, but the back of the card can't be uploaded. Right to work stays "Not verified", and the share code is saved only as a document. Proof of address only shows under Documents.

**Goal:**
- The officer fills in **one form, including their own password**. Each answer lands in its own section.
- The office opens it from People or Needs you and taps **Make live**.
- The officer gets one "You're live" email and signs in with the password they already chose.
- No invite link, and no "Create profile" vs "Create and send invite".

## Decisions taken
- **Sign-in waits for the office.** The password is saved with the form, and the login stays on hold until someone taps Make live.
- **Who reviews:** both the platform admin and company managers can see new forms and make people live. Security managers can't.
- **Make live is one tap.** It isn't blocked by checks. The existing rule stays: until SIA and right to work are verified, they can sign in but can't be rostered or clock in. The review screen says what's still missing. *(Default: you didn't pick an answer here.)*
- **One shared link,** as today (sent by WhatsApp or email). Their email is proven when the "You're live" email reaches them. Turning the link on and off and renewing it stays with the platform admin. *(Default: you didn't pick an answer here.)*
- The venue-manager form isn't part of this change.

## What the officer sees (`/app/staff-form/<link>`)
The same single page, grouped and labelled so each answer clearly belongs to one section:

1. **You:** name, known as, date of birth.
2. **Contact & address:** email (labelled "you sign in with this"), mobile, address, postcode.
3. **SIA licence:** number, expiry, **front and back of the card** (back is new).
4. **Right to work:**
   - share code with the GOV.UK link;
   - **passport or ID photo page** (this upload moves here from Documents).
5. **Pay:** NI number, bank details.
6. **Emergency contact.**
7. **Other documents:** proof of address, a photo of you.
8. **Your password (new):**
   - password and confirm password;
   - the same rules as setting a password today;
   - hint: "You'll sign in to the Officer app with your email and this password once the office has checked your details."
9. Consent, then Send.

**Errors appear next to the field they belong to.** Today one message shows at the top.

**The finish screen says:**
- "Thanks, the office is checking your details."
- "You'll get an email when you're live. Then sign in with **<their email>** and the password you just set."
- A link to the sign-in page.

**If the email already has a login,** sending stops with: "This email already has a login. Sign in, or ask the office to update your details." No duplicate person is created.

The password is stored only as a hash, never shown to anyone, and deleted with the form if the form is discarded or expires (60 days, as today).

## What the office sees

### Where new forms show up
- **Staff → People:** a callout at the top reads "**2 new staff forms** to check" and opens the list. It shows for company managers and the platform admin.
- **Needs you, the to-do list and the bell:** the count "New staff forms". It notifies company managers as well as the platform admin.
- **The Staff setup screen** stays for the platform admin to manage the links. Its list opens the same review sheet.

### The review sheet
It has one section per part of the form, laid out like the officer's profile:
- **You:** name, known as, date of birth.
- **Contact:** email, mobile, address.
- **SIA:** number, expiry, front and back thumbnails.
- **Right to work:** share code with **Check on GOV.UK**, passport thumbnail.
- **Pay:** NI and bank, shown hidden with tap-to-reveal.
- **Emergency contact.**
- **Documents.**

Above the sections, a status line says what is still needed before they can work. For example:
- "Ready to work once live"; or
- "Can sign in once live, can't be rostered until: right to work checked".

It uses the same checks the rota uses today. If the email or SIA number matches someone already on file, the possible-duplicate warning shows with **Open their page**.

**Buttons:**
- **Make live** (main). One tap does all of this:
  - creates the staff record as active, with every answer in its section:
    - SIA number, expiry and both card sides under SIA;
    - share code and passport under Right to work;
    - pay;
    - emergency contact;
    - proof of address and photo;
  - creates their **Officer app login, using the password they set**, already able to sign in. No invite link;
  - runs Orb's card and passport read, as today. That can verify the SIA, and a British or Irish passport whose photo matches can verify right to work;
  - emails them "You're live at <company>: sign in with <email>", with the sign-in link;
  - opens their person page on the tab that needs attention next (Compliance if right to work isn't checked, otherwise Overview), with the message "<Name> is live".
- **Discard:** deletes the form, its files and the saved password, after a confirm.

**Older forms sent before this change** have no password. For those, Make live does what "Create and send invite" did: it emails them an invite link to set a password. The sheet says so beforehand.

## What doesn't change
- Who can work shifts: the SIA and right-to-work rules, the grace period and clock-in checks.
- The rest of the officer statuses and Recruitment / the apply page.
- The Access tab and Add person.
- Pay visibility: date of birth, NI and bank stay out of lists and Orb.
- Old links: the staff-form link and the Staff setup address keep working.
- No new rule for security managers.

## Edge cases
- **Email already used:**
  - when sending the form, the officer is told to sign in instead;
  - at Make live (a login was added meanwhile), the office sees "already uses this email", with Open their page and no new person.
- **Same SIA number as an existing officer:** the duplicate warning shows. Make live is refused, as today.
- **Two managers tap Make live at once:** only one person is created. The second sees "Already made live", with Open their page.
- **The officer signs in before being made live:** "The office hasn't finished checking your details yet."
- **Officer forgets their password:** the normal Forgot password flow works once they're live.

## Acceptance checks (test records only, `@example.test` emails)
1. Open the staff link and fill it in with a password, SIA front and back, a share code and a passport. The finish screen shows their sign-in email.
2. Signing in with that email and password before Make live is refused with the "office hasn't finished" message.
3. As a **company manager** (not the platform admin), People shows "1 new staff form" and Needs you counts it. The review sheet groups everything by section and says right to work still needs checking.
4. Make live. The person page opens on Compliance. SIA shows number, expiry and both card sides. Right to work shows the share code and passport. Emergency contact and pay are filled in. Status is active, and the Access tab shows Officer app, active.
5. The officer signs in with the password from the form. No invite email was needed, and the "You're live" email was sent.
6. Sending the form again with the same email is stopped with "already has a login".
7. Discarding a form removes it and its files.
8. An older form without a password still goes live by sending an invite link.
9. A security manager doesn't see new forms.
10. What's new gets a card with its own picture.
