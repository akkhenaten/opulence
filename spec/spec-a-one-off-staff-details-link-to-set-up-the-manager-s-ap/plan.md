# Spec: a one-off "Staff details" link to set up the manager's app, and Orb creates the profiles

## Context
- **The problem:** when a company first starts on the app, the manager has to type in every officer by hand.
- **The idea:** send one shared link to all the officers. Each officer fills in their own details on a form, which needs no login.
- **Where submissions go:** a separate page that only the platform admin (info@orbsolutions.co.uk) can see.
- **What Orb does:** the platform admin asks Orb to turn the submissions into staff profiles.
- **Scope:** this is a one-off setup aid, not recruitment. The existing public "Join the team" form (/app/apply → Recruitment) stays unchanged.

**Already in place, to reuse:**
- Public (no-login) API actions: `pub()` in `functions/api/modules/_def.mjs`.
- The public upload pattern in `apply.uploadUrl`: rate limits by IP, and unused uploads are cleaned up after a day.
- Staff profile creation (`officers.save`), emergency contacts (`officers.saveContacts`) and documents (`docs.create`).
- Orb's catalogue, where the user must tap Confirm before any write (`functions/api/lib/orbCatalog.mjs`).
- The platform-admin check: `isPlatformAdmin` (lib/platform.mjs), plus `publicUser.platform` on the client.

## Decisions
- **One shared link,** e.g. `/app/staff-form/<token>`. The platform admin can turn it on, copy it, switch it off, or replace it with a new one (which stops the old link working).
- **Only the platform admin sees it.** The page, the link controls and the submissions are hidden from every other role, including Company managers. All the API actions check `isPlatformAdmin` on the server.
- **Orb creates profile only.** No login invite is sent. The new staff member's status is **Active**. Managers send logins later from the profile, as they do today.
- **Form fields** (an assumption, since this wasn't answered; can be trimmed):
  - Name, email, phone, SIA number and expiry
  - Address and postcode, date of birth, NI number
  - Bank name, sort code and account number
  - One emergency contact: name, relationship and phone
  - Uploads: SIA badge (front), right to work / passport, proof of address, profile photo
- **When setup is done** (an assumption):
  - The platform admin switches the link off by hand.
  - When a profile is created from a submission, the submission is deleted, so bank details and NI aren't stored twice.
  - Submissions nobody has used are deleted automatically after 60 days.

## What the officer sees (public form)
- A branded page with one scrolling form in plain sections: You, Contact & address, SIA, Pay details, Emergency contact, Documents.
- A **consent tick:** "I agree to Opulence storing these details to set up my staff profile."
- **Checks in the browser and on the server:**
  - SIA number has 16 digits (`validSia`);
  - UK postcode;
  - NI number format;
  - sort code has 6 digits and account number has 8.
- After sending: "Thanks, your details have been sent to the office."
- If the link is off or replaced: "This form is closed. Please contact the office."
- **Protections:** the same as the Apply form.
  - A hidden honeypot field catches bots.
  - Limits per IP: 5 submissions and 15 uploads per hour.
  - Files: PDF or images up to 10 MB each, and they must have been uploaded from the same IP.

## What the platform admin sees ("Staff setup" page, under Company → People)
- **Link card:**
  - On / Off switch, Copy link and Replace link;
  - the number of submissions waiting.
- **Submissions list:**
  - shows name, SIA number, the date sent, and a "Possible duplicate" chip if the email or SIA number matches an existing officer;
  - opening one shows every detail, with bank and NI masked until "Show" is tapped, and links to the documents.
- **Actions per submission:** "Create profile" (by hand) and "Discard".
- **Hint:** "Ask Orb: 'Create profiles for the staff setup submissions'".

## Orb
- **New read action** `staffSetup.list`: lists the waiting submissions. Bank and NI are left out of what Orb reads.
- **New write action** `staffSetup.create {id}`, on the Confirm tier.
  - It creates the officer with status Active, through the same path as `officers.save`, including the duplicate check.
  - It adds the emergency contact and files the uploads as documents. They are unverified, so the existing verification step still applies.
  - It then deletes the submission.
  - Orb can work through several submissions; each one shows a Confirm card.
- **Only the platform admin gets these actions;** for anyone else they are hidden from Orb.

## Data and API (outline)
- **Migration `051_staff_setup.sql`:**
  - `staff_setup_link`: token, enabled, created_at, created_by.
  - `staff_setup_submissions`: id, data jsonb, file keys, ip, created_at.
- **New module `functions/api/modules/staffSetup.mjs`:**
  - public actions: `info`, `uploadUrl`, `submit`;
  - platform-admin actions: `link`, `toggle`, `rotate`, `list`, `get`, `create`, `discard`.
- **Cron purge:** add the 60-day clean-up to the existing 5-minute schedule.

## Non-goals
- No change to Apply or Recruitment.
- No login invites sent.
- No automatic SIA register check (SIA_CHECK stays as it is).
- No access for Company or security managers.

## Release
- Add a What's new card with its own picture, following the memory rule. The card is platform-admin-facing, so keep the wording general: "Set up staff faster with a shared details form".

## Verification
- **API tests** (`cd functions/api && npm test`):
  - the public submit is rejected when the link is off or the token is wrong;
  - the honeypot and rate limits work;
  - non-platform-admin users get 403 on every admin action;
  - `create` makes an Active officer, contacts and documents, then deletes the submission.
- **ui-lint** stays at 67 or below.
- **Browser check** against the local mock server:
  - fill in the public form;
  - log in as plat (info@) and see the submission, then create the profile;
  - log in as boss (Company manager) and confirm the page is not visible.
- **On live:** no test submissions on live without your OK.
