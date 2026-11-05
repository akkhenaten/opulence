# Implementation plan: email client (Gmail/Workspace + Outlook/365)

## Context
This plan implements the approved spec `spec/email-client-connect-gmail-google-workspace-and-outlook-micr.md`. Company users will connect their own Google or Microsoft mailboxes, and shared ones, and then read, reply and compose inside the app. Threads are linked to officers, venues and clients, with Orb summaries and drafts.

Three facts from the codebase shape the plan:
- **The API is POST-only** (`index.mjs` dispatches `body.action`). The OAuth redirect therefore lands on an app route, and that route POSTs the code back.
- **All `company` users are equal.** There is no owner/admin flag. In practice the spec's "admin manages shared grants" becomes: the person who connected a shared mailbox, or any company user it is shared with, can manage its grants.
- **`venue_contacts` are users** (venue_id, user_id). Venue contact matching is therefore done on `users.email` joined through `venue_contacts`. Client matching uses `clients.billing_email`. Officer matching uses `officers.email`.

No new npm dependencies. The plan uses plain `fetch` and Node `crypto`.

## Backend (`functions/api`)

### 1. Migration `db/migrations/029_email.sql`
- **`email_accounts`**:
  - `id`, `provider` (`google|microsoft`), `address`, `display_name`
  - `owner_user_id` (null when shared), `shared` bool, `created_by`
  - `token_enc` text (AES-GCM blob of the refresh token), `access_enc`, `access_expires`
  - `status` (`connected|reconnect|error`), `last_error`, `sync_cursor` text, `last_sync`, `signature` text, `created_at`
  - Unique on `(owner_user_id, provider)` when not shared, and unique on `(lower(address))`.
- **`email_account_access`** (`account_id`, `user_id`), with primary key on both.
- **`email_oauth_states`** (`state` primary key, `user_id`, `provider`, `verifier`, `shared`, `expires_at`). These rows are short-lived and deleted on use or by the job.
- **`email_threads`** (the cache):
  - `account_id`, `thread_id`, `subject`, `snippet`
  - `from_name`, `from_addr`, `addrs text[]` (all participants, lower-case)
  - `last_at`, `unread`, `starred`, `folder`, `message_count`
  - Primary key `(account_id, thread_id)`, plus a GIN index on `addrs` and an index on `(account_id, folder, last_at desc)`.
- `ON DELETE CASCADE` runs from the account to all of these.

### 2. `lib/mail/crypto.mjs`
- `seal(text)` / `open(blob)` use AES-256-GCM. The key is `process.env.EMAIL_TOKEN_KEY`, run through sha256 to get 32 bytes. Output is `v1.iv.tag.ct` in base64url.
- A missing key throws `fail(503, 'Email not configured')`.

### 3. Provider adapters `lib/mail/google.mjs`, `lib/mail/microsoft.mjs`
Both expose the same interface:
- `authUrl({state, challenge, redirect})`, `exchange(code, verifier, redirect)` → `{refresh, access, expires, address, name}`, `refresh(refreshToken)`, `revoke(token)`
- `listThreads(tok, {folder, q, pageToken})`, `getThread(tok, id)` → normalised `{id, subject, messages:[{id, from, to, cc, date, html, text, attachments:[{id,name,size,mime}], messageIdHeader}]}`
- `getAttachment(tok, msgId, attId)`, `send(tok, {to, cc, bcc, subject, html, attachments, replyTo:{threadId, messageId, references}})`, `saveDraft(...)`
- `modify(tok, threadId, {read, starred, archive, trash})`, `sync(tok, cursor)` → `{changedThreadIds, cursor}`

Provider details:
- **Google** uses the Gmail REST API. Scopes: `gmail.modify`, `gmail.send`, `openid email profile`.
  - Folders map to labels: INBOX, SENT, DRAFT, TRASH, and archive = `-in:inbox`.
  - Send builds a MIME message (multipart/mixed, base64 parts, `In-Reply-To`/`References`, `threadId`) and posts it to the `upload/.../messages/send?uploadType=media` endpoint (≤35 MB).
  - Sync uses `history.list` from the stored `historyId`. If the history has expired, it falls back to a fresh list.
- **Microsoft** uses Graph `/me`. Authority is `common`. Scopes: `offline_access Mail.ReadWrite Mail.Send User.Read`.
  - Threads = `conversationId` (list messages, group by conversation).
  - Folders: inbox, sentitems, drafts, deleteditems, archive.
  - Reply uses `createReply`/`createReplyAll`, then a body PATCH. Attachments go inline when ≤3 MB and through an upload session otherwise. Then `/send`.
  - Sync uses the inbox `messages/delta` link.
- **Shared helper** `lib/mail/index.mjs`:
  - `adapter(provider)`
  - `token(account)`: decrypts the cached access token or refreshes it and re-seals it. On `invalid_grant` or a 401 it sets the account to `status='reconnect'`.
  - `call(account, fn)` wraps both, with one retry on a 401.
- Server-side HTML safety (`lib/mail/html.mjs`): strip `<script>`, `<iframe>`, `<object>`, `on*=` attributes and `javascript:` URLs, and rewrite `cid:` images to data URIs when the attachment is small. This is a belt; the braces are the sandboxed iframe in the app.

### 4. `modules/email.mjs`
All actions are `def(CO, …)`. `access(user, accountId)` allows the owner, or `shared` plus a grant (or the creator).

| Action | What it does |
|---|---|
| `email.status` | Which providers are configured (from env vars) and the redirect URI in use |
| `email.connectStart` `{provider, shared?}` | Creates state + PKCE, stores it in `email_oauth_states`, returns `authUrl` |
| `email.connectFinish` `{state, code}` | Checks state/user/expiry, exchanges the code, seals the tokens, upserts the account, kicks off the first sync, audits `email.connect` |
| `email.accounts` | Lists the accounts the user can access, with unread counts, status and grants (grants only for shared accounts) |
| `email.disconnect` `{id}` | Revokes at the provider (best effort), deletes the row (cascades), audits |
| `email.grant` `{id, user_ids}` | Shared accounts only. Replaces the grant set (company users only), audits |
| `email.signature` `{id, signature}` | Saves the signature |
| `email.list` `{account_id, folder, q?, page?}` | With no `q`: the first page comes from the cache, refreshed live if older than 2 minutes. With `q` or a page token: a live provider call |
| `email.thread` `{account_id, id}` | Live fetch, sanitise, mark read, attach `matches` (see below) |
| `email.attachment` `{account_id, message_id, id}` | Fetches the bytes, `putObject('email-tmp/…')`, returns `downloadUrl` (10 min) |
| `email.uploadUrl` | Reuses `uploadUrl('email-out', …)` for outbound attachments |
| `email.send` / `email.draft` | Recipients validated, attachments read via `getObjectBytes` (≤20 MB total), signature appended. Shared-mailbox sends are audited |
| `email.modify` `{account_id, id, read?, starred?, archive?, trash?}` | Applied at the provider and mirrored in the cache |
| `email.contacts` `{q}` | Autocomplete from users, officers and clients.billing_email |
| `email.forRecord` `{type: officer\|venue\|client, id}` | Addresses for that record → cached threads `WHERE addrs && $1`, limited to accessible accounts |
| `email.summary` / `email.draftReply` `{account_id, id, instructions?}` | Thread text, plus a context block from the matched records (venue: next 7 days of shifts; officer: next shifts; client: venues), sent to `claude({model: SONNET, module:'email'})`. Returns text or HTML only and never sends |
| `email.search` `{q, account_id?}` | Live provider search across the accessible accounts |

`matchAddrs(addrs)` returns `[{type, id, label, link}]` from one query each against officers, users + venue_contacts → venues, and clients.

### 5. Jobs, users and Orb wiring
- **`jobs.mjs`** gains `result.email = await emailSync().catch(...)` every run:
  - Accounts with `status='connected'` are processed oldest `last_sync` first, with a 40 s total budget and 20 changed threads per account.
  - Changed threads are upserted into the cache.
  - Expired `email_oauth_states` rows are deleted, along with `email-tmp/` objects older than 1 day, if a storage list helper exists. Otherwise the object key carries a date and cleanup is skipped.
- **`users.mjs`**: when a user is disabled, delete their personal accounts (after revoking at the provider) and their grants.
- **`index.mjs`**: import the module and add it to `ACTIONS`.
- **`orbCatalog.mjs`**: add `'email.search': r('email', 'Search connected mailboxes', 'q, account_id?')` and `'email.summary': r(...)`. Add `email.send` as `c()` with `link` → `/company/email?compose=…` so it opens the composer prefilled and never sends directly. Check against the catalogue's real-action test.

### 6. Secrets and deploy
Call `request_secrets` (fn `api`) once for:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `EMAIL_TOKEN_KEY` (a long random string)

Also set `EMAIL_REDIRECT_URL`, which defaults to `${APP_URL}/company/email/callback`. Until the domain is ready, the current site URL is used.

A provider whose env vars are missing shows "not configured" in the UI instead of failing. The code can ship before the user finishes the Google and Microsoft setup.

## App (`app/src`)
- **`layouts/nav.js`**: add `{ to: '/company/email', label: 'Email', icon: Mail, badge: 'email' }` to Overview, after Messages.
- **`layouts/Shell.jsx`**: add a badge `email` from `email.accounts`, summing the unread counts. It polls like the messages badge.
- **`main.jsx`**: add company routes `email`, `email/:account/:thread` and `email/callback`.
- **`pages/email/Email.jsx`**:
  - Account switcher (Select) and folder Tabs.
  - Search Input, plus a thread list (Row: sender, subject, snippet, relative time, unread dot, match chips) using `Load` and `useApi`.
  - On wide screens the thread opens in the right pane. On mobile it opens a full page.
  - When there are no accounts, it shows an Empty state with the Connect buttons.
- **`pages/email/Thread.jsx`**:
  - Messages, each rendered in `<iframe sandbox="" srcdoc>`. The srcdoc carries a CSP meta: `default-src 'none'; style-src 'unsafe-inline'; img-src data:`, plus `https:` once the user clicks "Show images".
  - The iframe auto-resizes from a height that the server computes roughly, and has a "expand" link.
  - Shown above the messages:
    - attachment chips,
    - match chips linking to staff, venue and client pages,
    - actions: Reply / Reply all / Forward / Archive / Delete / Star / Mark unread,
    - an Orb "Summarise" button that shows the summary in a Section, and an Orb "Draft reply" button that fills the composer.
- **`pages/email/Composer.jsx`**:
  - A Sheet with To/Cc/Bcc chip inputs (with `email.contacts` autocomplete) and Subject.
  - A small contentEditable editor with bold, italic, lists and links. The HTML output is sanitised before sending.
  - Attachments use the upload URL, with a size check. Send and Save draft buttons.
- **`pages/email/Callback.jsx`**: reads `code` and `state`, POSTs `email.connectFinish`, then navigates to Settings → Email with a toast. An error state is shown on failure.
- **`pages/people/Settings.jsx`**: add `{ value: 'email', label: 'Email' }` → `EmailTab` (in `pages/email/_settings.jsx`):
  - Connect Google / Connect Microsoft (personal) and "Connect shared mailbox".
  - Account cards showing status, last sync, Reconnect, Disconnect (useConfirm) and the signature Textarea.
  - For shared accounts, a "Who can use it" multi-select of company users.
- **Record pages**: a `RecentEmail` panel (`pages/email/_recent.jsx`) using `email.forRecord`, added to `VenueDetail.jsx`, `StaffProfile.jsx` and the client sheet in `Clients.jsx`. It is hidden when the viewer has no accounts.
- Build with `cd app && npm run build`. This must pass ui-lint.

## Tests (`functions/api/test/email.test.mjs`)
- seal/open round-trip; tampering throws; a missing key gives a 503.
- MIME builder: headers, threading (`In-Reply-To`/`References`), base64 attachments, UTF-8 subject encoding.
- Gmail and Graph response normalisers, run on fixture JSON.
- The HTML sanitiser strips script, `on*` and `javascript:`.
- `access()` rules: owner, shared + grant, and a stranger is denied.
- The Orb catalogue test still passes (all entries are real actions).

## Deployment
1. `cd functions/api && npm test`.
2. `openkbs fn deploy api -s 'rate(5 minutes)'`. Migration 029 runs on the next action or job, which is checked by calling the lambda URL with `health`/`email.status`.
3. `cd app && npm run build`, then `openkbs site deploy`.
4. `request_secrets` for the five keys, then redeploy `api`.
5. Give the user step-by-step setup notes for the Google Cloud OAuth client (Internal/Testing mode first) and the Entra app registration, including the exact redirect URI to register.
6. Commit as `feat: email client (Gmail + Outlook)` with the Co-Authored-By line, then push to origin (Opulence repo).

## Verification
- Unit tests pass, and the build passes.
- `email.status` lists the providers as configured once the secrets are set.
- **Real E2E, only with the user's mailbox and their go-ahead:**
  1. Connect it.
  2. Check that the inbox lists and a thread renders with no scripts or remote images.
  3. Reply to a test thread the user picks, and check it appears in the provider's Sent folder, threaded.
  4. Archive and star, and check the change shows at the provider.
  5. Disconnect, and check that the DB rows are gone.
- Inspect the DB: `token_enc` is not plaintext and no bodies are stored.
- Browser check of the Email page and Settings → Email, then `agent-browser close --all`.
- Nothing is sent and no test data is created on the live system without asking.
