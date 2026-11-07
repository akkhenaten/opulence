# Plan: a second Staff setup link, for venue managers

## Context
The officer link is live: Company → People → Staff setup, platform admin only. The user wants a **separate** shared link that **venue managers** use to send their details, so their accounts can be set up the same way.

A venue manager is not a staff profile. It is a **login** (`users` row, role `venue`) linked to the venues it manages (`venue_contacts`). Today these accounts are made by hand in Settings → Users (`users.invite`, functions/api/modules/users.mjs).

## Decisions (following the officer link)
- **Separate link, same page.** Staff setup gets a second card, "Venue managers link", with its own On/Off switch, Copy link and Replace link. Its submissions are listed under their own heading.
  - The officer link and its submissions are unchanged.
  - Still platform admin only, checked on the server.
- **The form asks for:**
  - first name, last name, known as (optional);
  - email and mobile;
  - job title (optional, e.g. General Manager);
  - **which venue(s)**, ticked from the company's active venues, plus "My venue isn't listed" with a free-text name;
  - a consent tick.
  - No NI, bank, SIA, address or file uploads: none of these are needed for a venue manager.
- **Create account (by hand or through Orb, on the Confirm tier):**
  - creates a Venue Manager login linked to the ticked venues;
  - **no email is sent**, matching "profile only" for officers. The account sits as *Invited*, and the admin sends the invite later from Settings → Users with the existing **Resend invite**;
  - if they wrote a venue that isn't listed, the admin picks the venue on the sheet before creating. The account can't be created with no venue.
- **Duplicate check:** if a user with that email already exists, the submission shows "Already has a login", and Create stops (as `createInvite` already does).
- Submission deleted once the account is made; same 60-day purge.

## How
- **Migration 052:**
  - `staff_setup_link`: change the `id = 1` check to `id IN (1, 2)` (1 = officers, 2 = venue managers);
  - `staff_setup_submissions`: add `kind text NOT NULL DEFAULT 'officer'`.
- **lib/staffSetup.mjs:** add `cleanVenueManager(b, venueIds)` (name, email, phone, venue ids that exist, or free text for an unlisted venue, consent) with tests.
- **modules/staffSetup.mjs:**
  - every link action takes `kind` ('officer' default | 'venue'), mapped to row id 1 or 2;
  - `info` returns `{open, kind}` and, for the venue link, the active venue names and ids;
  - `submit` picks the cleaner by the link's kind and stores `kind`;
  - `list` / `get` return `kind`;
  - new `createVenueManager(id, venueIds, user)`: reuses `createInvite` and `setVenues` (exported from users.mjs) in one transaction, then deletes the submission and writes the audit entry. It does **not** call `sendInviteMail`;
  - `staffSetup.create` sends each submission to the right path; for venue managers it also takes `venue_ids`.
- **Orb catalogue:** the same two actions; the words mention venue managers. Orb won't create a venue manager whose venue isn't listed, and asks the admin to pick it on the page.
- **App:**
  - `StaffForm.jsx`: renders the officer form or the venue manager form by `kind`;
  - `StaffSetup.jsx`: two link cards; the list is split into "Officers" and "Venue managers"; the venue manager sheet shows venue chips and, if needed, a venue picker.
- **What's new card** plus its picture (memory rule).

## Verification
- API tests:
  - the venue manager cleaner;
  - the two links are independent (switching one off leaves the other open);
  - creating a venue manager makes an invited `venue` user with `venue_contacts` and sends no email;
  - an existing email is refused;
  - non-admins get 403.
- ui-lint stays at 67 or below; vite build passes.
- Browser check against the local mock:
  - both cards;
  - the venue manager form with the venue ticks;
  - Create account;
  - boss can't see the page.
- No test submissions on live without your OK.
