# Plan: set up Gmail / Outlook sign-in from the app (no studio secrets)

## Context
The email client has shipped (commit 54d0efc). Mailbox sign-in only works once the Google and Microsoft OAuth app keys are added, and right now they can only be added through the studio's secrets form (`functions/api/.env`).

The user wants this done **from the front end**: a company user pastes the keys into **Settings → Email**, and the Connect buttons switch on straight away. No studio form and no redeploy.

Today the adapters read `process.env.GOOGLE_*` / `MS_*` synchronously (`lib/mail/google.mjs:12-13`, `lib/mail/microsoft.mjs:8-9`). The token encryption key comes from env `EMAIL_TOKEN_KEY` (`lib/mail/crypto.mjs`). That key is already set: 13 characters, deployed in v74.

## Backend (`functions/api`)

### 1. Migration `db/migrations/030_email_providers.sql`
Table `email_providers`:
- `provider` (text, primary key, `google` or `microsoft`)
- `client_id`
- `secret_enc` (sealed with `seal()` from `lib/mail/crypto.mjs`)
- `tenant` (Microsoft only: optional directory ID, default `common`)
- `updated_by`
- `updated_at`

### 2. `lib/mail/config.mjs` (new)
- `loadConfig()`:
  - Reads `email_providers` with `q` from `lib/db.mjs`, and opens the secrets.
  - Caches the result in the module for 60 seconds.
  - **The env vars still win when they are set**, so a studio-set key keeps working.
- `cfg(provider)`: a synchronous getter returning `{client_id, client_secret, tenant}` from the cache.
- `invalidate()`: called after a save.

### 3. Adapters
In `google.mjs` and `microsoft.mjs`:
- `configured()`, `client()` and `authUrl` read from `cfg(...)` instead of `process.env`.
- Microsoft builds `AUTH` from `cfg('microsoft').tenant || 'common'`. This is needed because single-tenant Entra apps reject `common`.

### 4. Encryption key fallback
`lib/mail/crypto.mjs` key order:
1. `EMAIL_TOKEN_KEY`, if set.
2. Otherwise a key derived from `APP_SECRET` with HKDF (info `orb-email-v1`).

This means a fresh install never needs a studio secret just for email.

`ready` in `email.status` and `email.accounts` becomes true whenever either key exists.

### 5. `modules/email.mjs`
- Call `await loadConfig()` before work starts in:
  - `email.status`, `email.accounts`, `connectStart`, `connectFinish`
  - `withMail` users and `emailSync`
  - The simplest way is to call it inside `withMail`/`accessToken` in `lib/mail/index.mjs`, plus the four actions above.
- New action `email.setup.get` (CO). Per provider it returns:
  - `client_id`
  - `secret_hint` (last 4 characters only; the secret is never returned)
  - `tenant`
  - `from_env` (bool)
  - `updated_at`
  - It also returns the `redirect` URI (`redirectFor({origin})`, with `origin` passed by the app).
- New action `email.setup.save` (CO) `{provider, client_id, client_secret?, tenant?}`:
  - Validates the formats:
    - Google client ID ends `.apps.googleusercontent.com`.
    - Microsoft client ID and tenant are GUIDs, or the tenant is `common`/`organizations`/a domain.
  - Upserts the row. A blank secret keeps the old one.
  - Calls `invalidate()` and writes an audit entry `email.setup` (provider, without the secret).
- New action `email.setup.clear` (CO) `{provider}`:
  - Deletes the row and audits it.
  - Existing mailboxes for that provider then show "needs reconnecting" on their next token refresh.
- Orb catalogue: these actions are **not** added. Keys are never handled through chat.

### 6. Tests (`test/email.test.mjs`)
- Config precedence (env wins over DB values) and the fallback (no env → DB).
- The HKDF fallback key works when `EMAIL_TOKEN_KEY` is unset.
- The Microsoft auth URL uses the tenant.
- `email.setup.get` never includes the secret.

## App (`app/src/pages/email/_settings.jsx`)
New **"Email sign-in setup"** section at the top of `EmailTab`, with one card each for Google and Microsoft:
- Status pill: "Ready" or "Not set up".
- **Redirect URI** with a copy button. Reuse `CopyLink` from `pages/people/_parts.jsx`.
- Fields:
  - Client ID.
  - Client secret, as a password input. Once saved it shows as `••••1234`, with a "Replace" option.
  - Microsoft only: optional Directory (tenant) ID.
- Save and Remove buttons. Remove uses `useConfirm`.
- A collapsible **"How to get these"** guide with short numbered steps and direct links:
  - **Google:** Cloud console → enable Gmail API → consent screen (Internal, or Testing plus test users) → OAuth client of type Web, paste the redirect URI → copy the ID and secret.
  - **Microsoft:** Entra → App registrations → New (account types: any org + personal, or single tenant plus the tenant ID) → Web redirect URI → API permissions `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `User.Read` → Certificates & secrets → copy the **Value**.
- When `from_env` is true, the card shows "Set on the server" and the fields are read-only.
- After saving, reload `email.accounts` so the Connect buttons below enable straight away.
- `ConnectButtons`' disabled hint text changes to: "Add the Google or Microsoft keys in Email sign-in setup above". On the Email page empty state, this becomes a link to `/company/settings?tab=email`.

## Deploy
1. `npm test` in `functions/api`.
2. `cd app && npm run build`.
3. `openkbs fn deploy api -s 'rate(5 minutes)'` from the project root, then `openkbs site deploy`.
4. Check that migration 030 is applied with psql (as before).
5. Commit `feat: set up email sign-in from Settings` with the Co-Authored-By line, and push to origin.

Note: the 13-character `EMAIL_TOKEN_KEY` stays in env and keeps priority. No mailbox has been connected yet, so it can still be replaced or removed with no impact. I'll flag this to the user but won't change it on my own.

## Verification
- Unit tests pass; the build passes and ui-lint stays at 67.
- With dummy values, in a browser as a company user:
  - Save a Google client ID and secret. The card shows "Ready", the secret shows only `••••` plus the last 4 characters, and the Connect Google button enables.
  - `connectStart` returns an accounts.google.com URL containing that client_id. **Do not complete a sign-in.**
  - Remove the keys. The button disables again.
- Check the audit log has the `email.setup` entries and that no secret is stored in them.
- Remove the dummy values afterwards, then run `agent-browser close --all`.
