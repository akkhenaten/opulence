# Fix: the platform admin always gets the full Company manager side

## Context
The owner signed in as info@orbsolutions.co.uk and the app shows **Security manager**. The invite form's role defaults to Security manager (app/src/pages/people/_access.jsx, `role: 'security'`), so the account was created with that role. The security side has no Settings, no Users & access and no Platform menu, which only exists in the company menu. The owner expects the platform admin to see and access everything.

The role is read from the database on every request (`userFromEvent` in functions/api/lib/auth.mjs:66, and `loadUser` in modules/auth.mjs:11). Fixing the stored role therefore fixes every screen, every permission check and the manager notifications, which query `role = 'company'`.

## Change
1. **The platform admin is always a Company manager (self-healing).** New `ensurePlatformRole(row)` in functions/api/lib/auth.mjs, called on the loaded row in `userFromEvent` and in `loadUser`. When `isPlatformAdmin(row)` and `row.role !== 'company'`, it:
   - sets `role = 'company'`, `client_id = NULL` and `can_see_pay = true` on the user;
   - deletes the user's `security_venues` and `venue_contacts` rows, because a company manager covers every venue;
   - writes an audit line `user.platform_role` with `{ from: <old role> }`;
   - returns the row with `role: 'company'`, so the same request already works.

   This runs once for the existing live info@ account on its next request. A linked officer record, if any, is kept, and they'd get the normal "also works shifts" switch.
2. **Invites can't get it wrong again.**
   - In `users.invite` (modules/users.mjs), the role is forced to `company` when `isPlatformEmail(b.email)`.
   - In `InviteSheet` (_access.jsx), typing a platform email switches the role to Company manager and shows "This is the platform admin — always a Company manager".
3. **App picks up the new role without a sign-out.** `auth.me` returns the corrected role, so the next load lands on /company. If the app is open on /security when the role changes, `Guard` (app/src/main.jsx) already redirects a wrong-role path to the user's home, and I'll confirm that in the mock. Then they see the full company menu: Settings → Users & access, Audit log, and Platform with the Admin tag.

No What's new card: it's a fix to today's release.

## Live data
This changes one live account: info@orbsolutions.co.uk goes from Security manager to Company manager, automatically on its next request, with an audit line. Approving this plan is the OK for that change. Nothing else changes.

## Tests (functions/api/test/appFeedback.test.mjs)
- Factor the decision into a pure `needsPlatformRole(row)`: true for the platform email with a non-company role, false for others and for disabled accounts. Test it.
- Test that `users.invite` turns a platform email into the company role, through a small pure helper `inviteRole(email, role)`.

## Release
- `cd app && npm run build`: ui-lint ≤ 67.
- `cd functions/api && npm test`.
- Commit with `fix: the platform admin always gets the full Company manager side` and the Co-Authored-By line.
- `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`, then `git push origin master --tags`.

## Verification
- Mock: add a security-role token with the platform email. After sign-in it lands on /company with Settings, Users & access and Platform in the menu, and an open /security page redirects.
- Live, read-only: the bundle has the invite hint. Then the owner reloads the app (or signs out and in) and should see Company manager and the Platform menu. I don't read the production DB; the owner confirms on screen.
