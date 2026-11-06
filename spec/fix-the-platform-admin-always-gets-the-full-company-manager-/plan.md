# Implementation: the platform admin always gets the full Company manager side

Spec: spec/fix-the-platform-admin-always-gets-the-full-company-manager-.md (approved)

## API
**functions/api/lib/platform.mjs**
- `export const needsPlatformRole = (row) => !!row && isPlatformAdmin(row) && row.role !== 'company';` (pure)
- `export const inviteRole = (email, role) => (isPlatformEmail(email) ? 'company' : role);` (pure)

**functions/api/lib/auth.mjs**
- `export async function ensurePlatformRole(row)`: if `!needsPlatformRole(row)`, return the row unchanged. Otherwise, in one `tx`:
  - `UPDATE users SET role='company', client_id=NULL, can_see_pay=true WHERE id=$1`
  - `DELETE FROM security_venues WHERE user_id=$1`
  - `DELETE FROM venue_contacts WHERE user_id=$1`
  - then `audit(row, 'user.platform_role', 'user', row.id, { from: row.role })`, and return `{ ...row, role: 'company', can_see_pay: true }`.
- Import `tx` from ./db.mjs and `audit` from ./audit.mjs. Check first that audit.mjs doesn't import auth.mjs, to avoid a cycle; if it does, put the helper in platform.mjs instead.
- `userFromEvent`: `return resolveActing(await ensurePlatformRole(user), body._as);`

**functions/api/modules/auth.mjs**
- `loadUser`: wrap the loaded row with `ensurePlatformRole` before `resolveActing`. That covers login and `auth.me`, so the token's `role` is company too.

**functions/api/modules/users.mjs**
- `users.invite`: `b.role = inviteRole(b.email, b.role)` after `required(...)`, before the officer check.

## App
**app/src/pages/people/_access.jsx** `InviteSheet`
- An effect: when `v.email` is a platform email, set role to `company`. Use a small `PLATFORM_EMAILS = ['info@orbsolutions.co.uk']` hint list; it's cosmetic, since the server enforces it.
- Show a muted line: "This is the platform admin — always a Company manager."
- Nothing else is needed. `Guard` (app/src/main.jsx:89) already redirects /security paths to `HOME.company` once `auth.me` returns company.

## Tests (functions/api/test/appFeedback.test.mjs)
- `needsPlatformRole`: true for a security-role or venue-role info@ row; false for a company-role info@ row, a disabled info@ row, and a security row with another email.
- `inviteRole('INFO@orbsolutions.co.uk', 'security') === 'company'`, and `inviteRole('a@x.com', 'venue') === 'venue'`.

## Release
- `cd functions/api && npm test`.
- `cd app && npm run build`: ui-lint ≤ 67.
- Commit with `fix: the platform admin always gets the full Company manager side` and the Co-Authored-By line.
- `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`, then `git push origin master --tags`.

## Verification
- Mock: the mock doesn't run the real API, so the server logic is covered by the unit tests. In the mock, check the InviteSheet: typing info@orbsolutions.co.uk flips the role to Company manager and shows the hint.
- Live, read-only: the bundle contains the hint string. The owner reloads the app, or signs out and in, and should see Company manager, Settings → Users & access, and Platform with the Admin tag. I don't read the production DB.
