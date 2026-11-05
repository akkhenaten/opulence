# Email client: connect Gmail / Google Workspace and Outlook / Microsoft 365

## Context
Opulence managers handle client, venue and staff email in a separate mail app. That email has no link to the venues, officers, shifts and incidents in the system. The user wants an email client **inside the app** that connects the mailboxes they **already have**. We are not hosting new mailboxes.

Providers in scope:
- **Google**: Gmail and Google Workspace.
- **Microsoft**: Outlook.com and Microsoft 365.

Today the app can only send outbound notifications through the platform (`lib/notify.mjs`). There is no OAuth code and no mail-reading code.

Some decisions were not answered, so these are the defaults (each easy to change):
- **Whose mailbox:** each company user connects their own mailbox. Nobody else can read it. A shared office mailbox (for example office@) can also be connected by an admin and shared with chosen company users.
- **Who gets it:** company users only (owner, admin, managers). Officers and venue/client users get no email feature.
- **Extras in v1:**
  - Senders are matched to known people (venue contacts, client billing emails, officers, users).
  - Orb can summarise a thread and draft a reply.
  - "Turn into" an incident or a cover request is **out of v1**. It is listed as a later phase.

## Requirements

### Connecting a mailbox
- On **Settings → Email**, offer "Connect Google" and "Connect Microsoft".
  - Each button runs the standard OAuth consent screen (authorization code + PKCE, offline access) and returns to the app.
- A user can connect **one personal mailbox per provider**.
- An admin or owner can connect a **shared mailbox**. They then pick which company users can see it. Everyone with access can read and send from it.
- The connection card shows:
  - the address,
  - the provider,
  - the connection status: connected, needs reconnect, or error,
  - the last sync time.
- Actions on the card: **Disconnect** (revokes the token at the provider and deletes the stored tokens and cached mail) and **Reconnect**.
- Refresh tokens are encrypted at rest with **AES-256-GCM** using a new dedicated key, `EMAIL_TOKEN_KEY`. The key is collected through `request_secrets`. It is not the existing APP_SECRET.
- Tokens never reach the browser or the logs.

### Reading
- A new **"Email"** nav item in the company section (`app/src/layouts/nav.js`). It shows an unread badge.
- **Inbox layout:**
  - A mailbox switcher (personal and shared).
  - Folders: Inbox, Sent, Drafts, Archive, Trash.
  - Search, which is passed through to the provider's own search.
  - Pagination.
- **Thread view:**
  - Shows the whole conversation.
  - HTML bodies are rendered **sanitised** in a sandboxed iframe, with remote images blocked until the user clicks "Show images".
  - Attachments can be downloaded, streamed through the API on demand.
- Actions: mark read/unread, archive, delete (to trash), star/flag. These use Gmail labels and Graph categories/flags.
- **Data source:** mail is read **live from the provider** (Gmail API / Microsoft Graph via plain `fetch`, no SDKs).
  - A light metadata cache keeps the inbox list fast. It holds: thread id, subject, from, snippet, date, unread, and matched-person ids.
  - The existing 5-minute scheduled job refreshes the cache and the unread counts. Full bodies are not stored.

### Writing
- Compose, reply, reply-all and forward.
- Rich text is basic: bold, italic, lists, links.
- Attachments up to the provider limit (about 25 MB in practice). Uploads are capped at about 20 MB per message in v1.
- The signature is set per mailbox.
- Mail is sent **through the user's own provider**, so it appears in their normal Sent folder and threads correctly at the recipient.
- Drafts are saved to the provider's Drafts folder.
- An address autocomplete suggests known people: users, officers, venue contacts and client billing emails.

### Links to the system
- Each sender and recipient address is matched against:
  - users,
  - officers,
  - venue contact emails,
  - client `billing_email`.
- The thread shows chips such as "Officer: J. Smith" or "Venue: The Ivy (contact)" that link to the matching record.
- Venue, client and officer pages get a **"Recent email"** panel. It shows threads involving their addresses, limited to mailboxes the viewer can access.

### Orb
- **"Summarise"** on a thread produces a short summary of the thread.
- **"Draft reply"** produces a reply in the composer, using the thread plus the matched records (for example the venue's upcoming shifts). The user edits it and sends it. Orb never sends on its own.
- The Orb catalogue gains read actions only:
  - `email.search`, for example "find emails from The Ivy this week".
  - `email.summary`.
- A send action goes in the catalogue only as a confirm (`c()`) action that opens the composer prefilled.

### Permissions and privacy
- A personal mailbox is visible **only to its owner**. This includes the owner/admin: they cannot read other users' personal mail.
- A shared mailbox is visible to the users it is granted to. Grants are managed by the owner or an admin.
- Disabling a user disconnects their personal mailboxes and removes their shared grants.
- An audit trail records connect, disconnect, grant changes and sends from shared mailboxes. It does not record message contents.

## Setup the user must do (blocking items)
1. **Domain / APP_URL.** The OAuth redirect URI must be a fixed HTTPS address on the final domain, for example `https://<domain>/app/email/callback`. That domain is still pending. Development can use the current CloudFront URL, but both providers must have the final URI registered before go-live.
2. **Google.**
   - Create a Google Cloud project with the Gmail API enabled and an OAuth client (Web).
   - The Gmail read/modify scopes are **restricted**. For accounts outside your own Workspace, Google requires app verification and a **CASA security assessment**. This takes weeks and may cost a fee.
   - Until then: use "Internal" mode, which works for Opulence's own Workspace only, or "Testing" mode, which allows up to 100 named test users, with tokens that expire every 7 days.
3. **Microsoft.**
   - Create an Entra ID app registration with "Accounts in any organizational directory and personal Microsoft accounts".
   - Delegated permissions: `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `User.Read`.
   - Some 365 tenants require their admin to approve the app. Publisher verification is recommended.
4. **Secrets** go through `request_secrets` (fn `api`). They are never pasted in chat:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `MS_CLIENT_ID`
   - `MS_CLIENT_SECRET`
   - `EMAIL_TOKEN_KEY`

## Technical outline
- **Migration `029_email.sql`** adds these tables:
  - `email_accounts`: provider, address, owner user or shared, encrypted refresh token, status, sync cursor (Gmail historyId / Graph deltaLink), signature.
  - `email_account_access`: shared grants.
  - `email_threads_cache`: the metadata cache described above.
  - `email_audit`.
- **Module `modules/email.mjs`** uses `def(CO, …)` actions:
  - `email.connectStart`
  - `email.connectFinish`
  - `email.accounts`
  - `email.disconnect`
  - `email.grant`
  - `email.list`
  - `email.thread`
  - `email.attachment`
  - `email.send`
  - `email.draft`
  - `email.modify`
  - `email.search`
  - `email.summary`
  - `email.draftReply`
  - `email.forRecord`
- **Provider code:**
  - `lib/mail/google.mjs` and `lib/mail/microsoft.mjs` sit behind one common interface.
  - `lib/mail/crypto.mjs` handles AES-GCM.
- **OAuth flow:** the API is POST-only, so the callback goes to the app route. That route POSTs `email.connectFinish` with the code and state. State is signed and checked against the user, and the PKCE verifier is checked.
- **Sync:** `runJobs()` gains an incremental email sync per account with a time budget. Accounts with a revoked or failing token are marked "needs reconnect".
- **App:**
  - `app/src/pages/email/` holds Inbox, Thread and Composer.
  - A Settings → Email section.
  - "Recent email" panels on the venue, client and officer pages.
  - HTML is sanitised server-side, plus a sandboxed iframe.

## Non-goals (v1)
- Hosting mailboxes, and the platform `openkbs mail`.
- IMAP/SMTP for other providers (Yahoo, iCloud, custom hosts). This could be phase 2.
- Calendar or contacts sync.
- Turning an email into an incident, cover request or task (phase 2).
- Officers or venue users having email.
- Bulk or marketing email.
- Rules and filters.
- Offline mail.

## Acceptance
- A manager connects a Gmail account and a Microsoft 365 account. Both show "connected". The inbox loads in under 2 seconds from the cache.
- Replying from the app threads correctly in the recipient's client and appears in the provider's Sent folder.
- A second manager cannot see the first manager's personal mailbox. Shared mailbox access follows the grants.
- Revoking access at Google or Microsoft shows "needs reconnect" within one sync cycle, with no crash.
- Email from a venue contact shows the venue chip, and the thread appears on that venue's page.
- Orb drafts a reply that the user can edit. Nothing is sent without the user clicking Send.
- The database holds no plaintext tokens. Disconnect removes the tokens and the cached rows.
- Testing with the live Opulence data uses only a mailbox the user chooses. No mail is sent during testing without the user's say-so.
