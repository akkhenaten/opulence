# Plan: show the invite link for info@orbsolutions.co.uk, and say when an invite email didn't send

Spec: spec/fix-show-the-invite-link-for-info-orbsolutions-co-uk-the-ema.md (approved)

## API — functions/api/modules/users.mjs
- Split the invite email from the link:
  - `export async function sendInviteMail(u)` sends the email as today and returns `{ link: '/app/invite/<token>', emailed }`. `emailed` is what `sendRawEmail` returned; that function (lib/notify.mjs:12) already returns false on failure.
  - `sendInvite(u)` becomes `(await sendInviteMail(u)).link`. officers.mjs:92/186 keeps calling it unchanged.
  - Remove the `isPlatformEmail` early `return null`.
- `users.list`: remove the `.map` that blanks `invite_link` for the platform email. The SQL already returns the link only while `status = 'invited'`.
- `users.invite` returns `{ id, invite_link: link, emailed }`.
- `users.resendInvite` returns `{ invite_link: link, emailed }`.
- `users.resetLink`: read `email, status`. Call `guardPlatformAccount` only when `status !== 'invited'`. An invited account returns its one-time invite link as before.
- Clean up the imports: `isPlatformAdmin`, and `isPlatformEmail` if nothing else uses it.
- Unchanged: the guards on email change, disable, merge, and officer email change.

## App
- `app/src/pages/people/_access.jsx` (`InviteSheet`):
  - keep `r.emailed`;
  - the toast reads 'Invite sent' when emailed, otherwise "Email didn't send — share the link below";
  - pass `CopyLink` a hint to match: "Sent to {email}. You can also share this link." or "The email didn't go through. Copy this link and open it, or send it to them."
- `app/src/pages/people/Settings.jsx` `resend` (around line 530): same toast choice from `emailed`, and the same hint on the `CopyLink` at line 548 when the resend email failed.
- Both use the existing `CopyLink` from `_parts.jsx`; no new components.

## Tests — functions/api/test
- Add a test that `sendInvite`/`sendInviteMail` is exported, and that the `users.resetLink` logic allows an invited platform account. Pull the check into a small pure helper `resetGuardNeeded(status)` in users.mjs (true unless invited), so it can be tested without a DB.
- The existing guard tests stay.

## Logs (read-only)
- `openkbs fn logs api` (or the equivalent): look for `[email] not sent:` to find out why the invite email failed. Report the reason; change no settings.

## Release
- `cd app && npm run build`: ui-lint must stay ≤ 67.
- `cd functions/api && npm test`.
- Commit with `fix: invite link for the platform admin, and say when an invite email didn't send` and the Co-Authored-By line. There's no What's new card, because it's a fix to today's release.
- `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`, then `git push origin master --tags`.

## Verification
- Mock (/tmp/mock/server.mjs + vite on 5174), as boss:
  - invite info@orbsolutions.co.uk: the sheet shows the link and the "didn't go through" hint, because the mock can't send email;
  - Settings → Users → that user shows the Invite link, and Resend invite works;
  - make the account active in the mock, and resetLink then returns 403 for boss.
- Live, read-only: the bundle contains the new hint text. Then tell the owner to open Settings → Users → info@orbsolutions.co.uk, copy the Invite link, set the password and sign in. Also report the email failure reason from the logs.
