# Plan: show whether the invite email was sent

## Context
The user opened Aaron Scott's login in Settings → Users and asked: "How do I know if the email with the link was sent?"

I checked the link in the screenshot on live (read-only), and it's valid. Today the app only reports whether the email went out in a toast, for a few seconds after an invite or **Resend invite**. Nothing records it. When the sheet is opened later, it always says "Email may not be set up yet, so share this link directly". That's a generic line, and it's misleading. Nothing in the app shows when, or whether, the invite was emailed.

Limit to tell the user: the app can only know that the **mail service accepted** the email. It can't know whether the email reached the inbox or went to spam.

## Change
- **Migration 053:** add to `users`:
  - `invite_sent_at timestamptz` (null means never emailed);
  - `invite_emailed boolean` (the result of the last try).
- **functions/api/modules/users.mjs, `sendInviteMail(u)`:** after the send, `UPDATE users SET invite_sent_at = now(), invite_emailed = $2`. Every send path goes through this one function, so all are covered:
  - Settings invite;
  - Resend invite;
  - Invite to app;
  - hiring;
  - Staff setup "Create and send invite".
- **Return the fields:**
  - in the `users.list` row that the Settings sheet uses (users.mjs:61);
  - in `officers.get` through the existing `LEFT JOIN users u` (`u.invite_sent_at`, `u.invite_emailed`), for the staff profile.
- **Settings → Users sheet** (app/src/pages/people/Settings.jsx:558): the invite link hint states the facts instead of "may not be set up":
  - "Emailed to aaron@… on Sat 7 Nov, 14:02. If it isn't in their inbox or spam, copy this link and send it by WhatsApp or text."
  - "The last email didn't go through (Sat 7 Nov, 14:02). Copy this link and send it to them, or tap Resend invite."
  - "Not emailed yet. Tap Resend invite to email it, or copy this link."
  - After a Resend, the hint shows the new time straight away.
- **Staff profile:** next to **Resend invite**, a small line with the same status ("Invite emailed 7 Nov, 14:02" or "Invite not emailed").
- **Audit:** `sendInviteMail` writes `user.invite_sent` with `{ emailed }`, so the Audit log also shows each send.
- **What's new** card plus its picture (memory rule).

## Verification
- API tests:
  - `sendInviteMail` stores the time and result, both when the mail service accepts the email and when it refuses it (mocked);
  - all tests pass.
- ui-lint stays at 67 or below; the vite build passes.
- Browser check against the local mock: the three hint states on the user sheet, and the line on the staff profile.
- Live: no invites sent by me. Invites sent before this release show "Not emailed yet", because no record was kept then. Aaron's will update the next time you tap Resend invite.
