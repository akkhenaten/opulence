# Fix: show the invite link for info@orbsolutions.co.uk (the email didn't arrive)

## Context
The owner invited info@orbsolutions.co.uk as a Company manager, but the invite email never arrived. In the last release I hid that account's invite link on screen, so the email was the only way in, and there is now no way to set the password. The owner wants a link they can copy to set the password.

Facts from the code:
- `sendInvite` (functions/api/modules/users.mjs:26) ignores whether `sendRawEmail` succeeded. That function returns `false` on failure and only writes a warning to the log. So a failed email is silent everywhere, not just for this account.
- The invite token is cleared once the password is set (modules/auth.mjs:109). An invite link can only ever be used once, while the account is still "Invited".

## Change
1. **Show the platform admin's invite link while it's pending.**
   - In `sendInvite`, drop `if (isPlatformEmail(u.email)) return null;`.
   - In `users.list`, drop the `.map` that blanks `invite_link` for the platform email. The list already shows links only for `status = 'invited'`.
   - In `users.resetLink`, keep the guard for active accounts but let an *invited* platform account through: it returns the invite link, as it does for any invited user.
   - The protections stay for the live account: nobody else can change its email, disable it, merge it, or get a password reset link once it's active.
2. **Say when the email didn't go** (helps everyone, not just this account).
   - `sendInvite` returns `{ link, emailed }` internally. `users.invite` and `users.resendInvite` add `emailed` to their response, and `invite_link` stays as it is so the other callers (Staff, StaffProfile, _access, _application, Recruitment) don't change.
   - Settings → Users (app/src/pages/people/Settings.jsx, around lines 530 and 548):
     - after Resend invite, if `emailed === false`, the toast reads "Email didn't send — copy the link below and open it" and the link shows;
     - the invite form shows the same message when the invite email didn't send.
3. **Diagnose the email failure (read-only).** Check the API function's logs for the `[email] not sent:` line to see the reason, e.g. a sender domain that isn't set up or a mailbox issue. I'll report what I find and won't change any settings without asking.
4. Update the API tests (test/appFeedback.test.mjs, the guard test) so an invited platform account's link is allowed and an active one is still refused.
5. What's new: no new card. This is a fix to the release that went out today.

## After deploy (the owner does this, no live data change by me)
In Settings → Users, open info@orbsolutions.co.uk and copy the **Invite link**, or press Resend invite to get it. Open it, set the password and sign in; Platform then appears in the menu.

Trade-off: until the password is set, any company manager could also see this link. Once it's used, it's gone.

## Verification
- `npm test` in functions/api, and `npm run build` in app (ui-lint ≤ 67).
- Mock test, with the mock server where email fails:
  - as boss, invite info@orbsolutions.co.uk: the link shows with the "Email didn't send" message;
  - Resend invite shows the link again;
  - after the account is active, the boss still gets 403 on its reset link.
- Deploy the API and site, push, then do a read-only live check of the bundle.
