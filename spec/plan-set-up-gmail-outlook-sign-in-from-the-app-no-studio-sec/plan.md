# Implementation plan: email sign-in setup from Settings → Email

## Context
Spec: `spec/plan-set-up-gmail-outlook-sign-in-from-the-app-no-studio-sec.md`.

Company users will paste the Google and Microsoft OAuth app keys into Settings → Email. The Connect buttons then switch on, with no studio secrets form and no redeploy. Any env vars that are already set still take priority.

## Backend (`functions/api`)

### 1. `db/migrations/030_email_providers.sql` (new)
```sql
CREATE TABLE IF NOT EXISTS email_providers (
  provider text PRIMARY KEY CHECK (provider IN ('google','microsoft')),
  client_id text NOT NULL,
  secret_enc text NOT NULL,
  tenant text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,   -- match users.id type in 029
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 2. `lib/mail/crypto.mjs`
- `key()`:
  - Uses `EMAIL_TOKEN_KEY` when set.
  - Otherwise uses `crypto.hkdfSync('sha256', APP_SECRET, '', 'orb-email-v1', 32)`.
  - Otherwise fails with 503.
- New export `hasKey()`, so callers no longer need to check `process.env.EMAIL_TOKEN_KEY` themselves.

### 3. `lib/mail/config.mjs` (new)
- `loadConfig()`:
  - Caches for 60s.
  - Runs `q('SELECT * FROM email_providers')`.
  - Opens `secret_enc` inside a try. If a row cannot be opened, it is treated as not configured.
- `cfg(provider)` resolves the values in this order:
  - When the env pair is set (`GOOGLE_CLIENT_ID`+`GOOGLE_CLIENT_SECRET`, or `MS_CLIENT_ID`+`MS_CLIENT_SECRET`), it returns `{client_id, client_secret, tenant: MS_TENANT||null, from_env: true}`.
  - Otherwise it returns the cached DB row.
- `invalidate()` resets the cache.
- `setCacheForTest(rows)` is a test hook.

### 4. Adapters
- **`google.mjs`:**
  - `configured = () => !!(cfg('google').client_id && cfg('google').client_secret)`.
  - `client()` and the `client_id` in `authUrl` both read from `cfg('google')`.
- **`microsoft.mjs`:**
  - Same changes as Google.
  - `AUTH` becomes the function `auth = () => \`https://login.microsoftonline.com/${cfg('microsoft').tenant || 'common'}/oauth2/v2.0\``.
  - Used in `authUrl`, `exchange` and `refresh`.

### 5. `lib/mail/index.mjs`
`accessToken()` runs `await loadConfig()` first. This covers `withMail` and the sync token refresh.

### 6. `modules/email.mjs`
- **Readiness:**
  - Add a `providersState()` helper.
  - Replace the three `!!process.env.EMAIL_TOKEN_KEY` checks with `hasKey()`.
  - Call `await loadConfig()` in `email.status`, `email.accounts`, `connectStart`, `connectFinish` and `emailSync`.
- **New actions (CO):**
  - `email.setup.get {origin}` returns:
    - `redirect: redirectFor(b)`. On failure it returns null instead of throwing.
    - `ready: hasKey()`.
    - `providers: { google, microsoft }`, each with `{configured, from_env, client_id, secret_hint ('••••'+last4), tenant, updated_at}`.
    - The secret is never returned.
  - `email.setup.save {provider, client_id, client_secret?, tenant?}`:
    - Validation:
      - Google `client_id` must match `/\.apps\.googleusercontent\.com$/`.
      - Microsoft `client_id` must be a GUID.
      - Tenant is optional: a GUID, `common`, `organizations`, `consumers`, or a domain.
    - Rejects with 409 "Set on the server" when `from_env` is true.
    - A new row requires a secret. A blank secret keeps the existing `secret_enc`.
    - Upserts, calls `invalidate()`, then `audit(user,'email.setup','email_provider',null,{provider, client_id, tenant, secret: client_secret ? 'replaced' : 'kept'})`.
  - `email.setup.clear {provider}`: deletes the row, calls `invalidate()`, then audits with `{provider, removed: true}`.
- These actions are **not** added to `lib/orbCatalog.mjs`.

### 7. Tests (`test/email.test.mjs`)
- Update the existing crypto test:
  - With both `EMAIL_TOKEN_KEY` and `APP_SECRET` deleted, `seal` still throws 503.
  - With only `APP_SECRET` set, `seal`/`open` round-trip.
- Config precedence with `setCacheForTest`:
  - DB row only → configured.
  - Env set → env wins and `from_env` is true.
- The Microsoft `authUrl` contains `/contoso.onmicrosoft.com/` when the tenant is set, and `/common/` otherwise.
- A test confirms the CATALOG does not contain `email.setup.*`.

## App (`app/src/pages/email/_settings.jsx`)
- **`SetupSection`, rendered at the top of `EmailTab`:**
  - Loads `useApi('email.setup.get', { origin: location.origin })`.
  - Shows the redirect URI using `CopyLink` from `pages/people/_parts.jsx`.
  - Shows two `ProviderSetup` cards.
- **`ProviderSetup` card** (a `Tile`):
  - Header: icon, name, and a Pill showing "Ready" (green), "Not set up" or "Set on the server".
  - Fields use the `Input` from the UI kit:
    - Client ID.
    - Client secret, as a password field. When one is saved, the hint reads "Saved ••••1234, leave blank to keep".
    - Microsoft only: Directory (tenant) ID, with the hint "Only for single-organisation apps".
  - Buttons:
    - Save (`useAction`, then `email.setup.save`, then reload both setup and accounts, then `emailChanged()`).
    - Remove (`useConfirm`, then `email.setup.clear`).
  - The fields are read-only when `from_env` is true.
  - The `<details>` "How to get these" guide holds the numbered steps from the spec, with links to console.cloud.google.com and entra.microsoft.com. Add `{/* ui-ok */}` only if lint flags it.
- **`ConnectButtons`:** the off note changes to "Add the Google or Microsoft keys under Email sign-in setup in Settings → Email." and links to `/company/settings?tab=email`.
- **`EmailTab`:** passes `q.reload` down so a save refreshes the accounts and the providers.

## Deploy & ship
1. Run `cd functions/api && npm test`.
2. Run `cd app && npm run build`, and check that `npm run lint:ui` (or the existing ui-lint script) is still at the 67 baseline.
3. From the project root, run `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`.
4. Run `psql "$(openkbs postgres connection --libpq | tail -1)" -Atc "select 1 from email_providers limit 0"` and check that 030 is in `schema_migrations`.
5. Commit with the message `feat: set up email sign-in from Settings` plus the Co-Authored-By line, then push to origin (akkhenaten/opulence).

## Verification
- `npm test` passes and the build passes.
- Live API check using the deployed Lambda, with no real sign-in:
  - Checks are only possible if a company session can be obtained. Otherwise rely on the tests plus a psql check of the table.
  - Do not save dummy keys on the live system without asking the user.
- Report back:
  - Where to find the new screen.
  - That the redirect URI to register is shown there.
  - That the short `EMAIL_TOKEN_KEY` still takes precedence. No mailboxes exist yet, so it is safe to replace or remove it.
