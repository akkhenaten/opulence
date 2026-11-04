# Plan: Messenger-style chat upgrades

## Context
The approved spec is in spec/spec-messenger-style-chat-upgrades.md. Chat today has three problems:
- It refreshes by polling every 10 to 30 seconds.
- "Seen" data (`conversation_members.last_read_at`) is stored but never shown.
- Reactions, reply-to, typing, voice notes, pins, search, group @mentions and "Must confirm" are all missing.

This plan adds all of them on top of the existing Messages module, plus realtime delivery through the platform's MQTT service.

Scope note: venue users who are already members of chats (cover threads, direct chats) will see the same upgrades, because they share those conversations. Nothing new is opened to them.

## Realtime design (secure by construction)
- **One private channel per user, `user:<uid>`.** Tokens are minted server-side with `subscribe: ['user:<uid>']`, `publish: []` and `userId`. Browsers never publish, so nobody can forge events.
- **Every event comes from the server.**
  - `msg` `{c, id}` is sent on a new message.
  - `upd` `{c, id}` is sent on an edit, delete, reaction, pin, confirm or finished transcript.
  - `read` `{c, u, at}` updates Seen.
  - `typing` `{c, u, name}` is relayed from a throttled HTTP call.
  - Each event goes to the user channel of every current member, including the sender, so their other devices update too.
- **Clients refetch, they don't patch.** On `msg` or `upd` for the open chat, the client reloads `messages.thread`. The inbox and badge reload on `msg` or `read`. Typing stays client-side with a 5 s timeout.
- **Fallback.** Polling is kept: 10 s while disconnected, 60 s while connected. A reconnect triggers a full reload.
- **Safeguarding views.** Oversight viewers aren't members, so they get no events and cannot call `typing` or `read`.

## Data model: `functions/api/db/migrations/026_chat_upgrades.sql`
- **New columns on `messages`:**
  - `reply_to uuid REFERENCES messages(id)`
  - `mentions uuid[] NOT NULL DEFAULT '{}'`
  - `must_confirm boolean NOT NULL DEFAULT false`
  - `pinned_at timestamptz` and `pinned_by uuid`
  - `transcript text`
  - `transcript_status text` (pending, done or failed; NULL means not a voice note)
  - `search tsvector GENERATED ALWAYS AS (to_tsvector('english', body || ' ' || coalesce(transcript,''))) STORED`
- **New indexes:** a GIN index on `search`, and a partial index on `(conversation_id) WHERE pinned_at IS NOT NULL`.
- **New tables:**
  - `message_reactions (message_id, user_id, kind CHECK in the 6 kinds, created_at, PK(message_id,user_id))`
  - `message_confirms (message_id, user_id, confirmed_at, PK)`
- **Voice notes** are a normal attachment with an `audio/*` mime plus a `duration` field (seconds).

## Backend
- **New `functions/api/lib/realtime.mjs`:**
  - `realtimeToken(user)` POSTs to `project.openkbs.com/projects/$OPENKBS_PROJECT_ID/mqtt/token` with the scoped body, the same auth as `lib/notify.mjs`.
  - `publishTo(userIds, event, data)` sends parallel `/mqtt/publish` calls, is fire-and-forget, and swallows errors so a send never fails.
  - `publishConv(convId, event, data)` looks up the active members and calls `publishTo`.
- **New `functions/api/lib/chat.mjs`** holds pure, unit-tested helpers:
  - `REACTION_KINDS`
  - `cleanMentions(body, ids, members)`: keeps only members whose `@Name` appears in the body.
  - `canPin(user, conv)`: true for a manager role member, or the group creator.
  - `PIN_MAX = 3`
  - `confirmSummary(...)`
  - `seenSummary(members, msg, meId)`: excludes the system user.
- **Changes to `functions/api/lib/threads.mjs` `post()`:**
  - Accepts `reply_to`, `mentions`, `must_confirm` and `skipPush` ids. Mentioned people get the mention notice instead of a second push.
  - Writes the new columns.
  - Calls `publishConv(c,'msg')`.
  - `preview()` shows "Voice message".
- **Changes to `functions/api/modules/messages.mjs`:**
  - **`MSG_COLS` and `shapeMessages`:**
    - Add a `reply` preview: sender name, a 100-character snippet or "Message deleted", and photo/voice flags.
    - Add `reactions` as `[{kind,count,mine}]`, a `pinned` flag, `transcript`, and `duration` on audio attachments.
    - Add a `confirm` object: `{required, mine, done, total, outstanding[]}`. `outstanding` is filled only for the sender or a manager.
    - Do this with batched queries per page, not per row.
  - **`messages.thread`:**
    - Adds an `around` message id, which loads 20 messages before and 20 after for jump-to.
    - Returns `pinned` (up to 3) and `can_pin`.
    - Returns `last_read_at` per member, which already exists.
  - **`messages.send`:**
    - Accepts `reply_to` (must be in the same conversation), `mentions` (cleaned) and `must_confirm` (manager roles only; otherwise 403).
    - For audio attachments, sets `transcript_status='pending'`.
    - Sends a mention notify with kind `'mention'` (optional in prefs, ignores mute) and `dedupe: mmention:<msgId>`.
  - **`messages.read`:** adds `publishConv(c,'read',…)`.
  - **New actions:**

    | Action | What it does |
    |---|---|
    | `messages.react` `{id, kind\|null}` | Upsert or delete a reaction. Notify kind `'reaction'` to the author, with `dedupe mreact:<id>:<londonDate>`, skipped if the author muted the chat. Publishes `upd`. |
    | `messages.reactions` `{id}` | Who reacted. |
    | `messages.typing` `{id}` | `canWrite`, then publish `typing` to the other members. The client throttles it to 1 call per 3 s. |
    | `messages.pin` `{id, pinned}` | `canPin` check, max 3, then `upd`. |
    | `messages.confirm` `{id}` | Recipient taps "Got it": insert the confirmation, `audit`, `upd`. |
    | `messages.confirmChase` `{id}` | Sender or manager. Notify the outstanding people only, with kind `'message'`, severity warning and `dedupe chase:<id>:<hour>`. |
    | `messages.transcribe` `{id}` | Sender only, idempotent while pending. Calls `transcribe({url: downloadUrl(key), vocabulary, module:'messages'})` from `lib/ai.mjs`, stores done or failed, then `upd`. |
    | `messages.search` `{q, conversation_id?}` | `websearch_to_tsquery`, plus an `ILIKE` fallback for 1–2 words. Limited to the user's active memberships with `created_at >= joined_at`, and excludes deleted messages. Returns up to 50 hits grouped by conversation, with snippets. |
    | `realtime.token` | `ALL` roles. Returns the minted token. Can go in `messages.mjs` or a small `modules/realtime.mjs` registered where the other modules are registered (`index.mjs`). |

  - **`messages.edit` and `messages.delete`:** publish `upd`.
- **`functions/api/modules/jobs.mjs`:** retries up to 5 voice notes per run where `transcript_status='pending'`, `created_at` is more than 2 minutes ago and less than 1 day ago. Each is marked failed after one retry.
- **`functions/api/lib/ai.mjs`:** add `MODULE_NAMES.messages = 'Messages voice notes'` so the existing AI cap UI covers it.
- **`functions/api/lib/files.mjs` `cleanFiles`:** keeps `duration` (a number from 1 to 120) for `audio/*` files.

## Frontend
- **New `app/src/realtime.js`:**
  - Lazy-loads `https://unpkg.com/mqtt/dist/mqtt.min.js` and `https://openkbs.com/sdk/mqtt.js` once, then calls `api('realtime.token')`.
  - Connects with `presence: data.presence`, `clientIdPrefix` verbatim and `clientId: u-<uid8>-<ts>`, and subscribes to `user:<uid>` only.
  - Re-mints and reconnects every 13 minutes.
  - Exposes `onRealtime(event, fn)`, `useRealtimeConnected()`, and a `orb:realtime-reconnected` window event.
  - Started from `Shell.jsx` after login and stopped on sign-out.
- **`app/src/ui/index.jsx` `useApi`:** the poll can be a function of connected state, or Thread can pass `poll: connected ? 60000 : 10000`.
- **`app/src/pages/messages/Thread.jsx`:**
  - Subscribes to `msg`/`upd`/`read` for this conversation and calls `latest.reload()`. A `typing` map drives a "Sam is typing…" row above the composer.
  - **Seen line** under my last message:
    - 1:1: "Sent", then "Seen 21:04".
    - Group: "Seen by N", which opens a sheet listing names and times.
  - **Reactions:** chips under the bubble; tapping them opens a who-reacted sheet.
  - **ActionSheet:** gets a 6-emoji row from `REACTIONS` in `everyday/_parts.jsx`, plus Reply, Pin/Unpin and "See who confirmed".
  - **Reply:**
    - Swipe right on touch (pointer events, 60 px) or tap Reply. A quote bar appears in SendBox.
    - Reply previews render above the bubble. Tapping one jumps to the original.
  - **Jump-to:** if the message is loaded, scroll and flash it. Otherwise load `around` and replace the list. The `?m=<id>` query param is also supported.
  - **Pinned bar:** at the top of the chat, up to 3 pins, cycling on tap. "Must confirm" messages I haven't confirmed also show here, highlighted.
  - **Must confirm:**
    - Recipients see a "Got it" button.
    - The sender or managers see "Confirmed 6/9" and a sheet with the outstanding list and a Chase button.
    - SendBox has a "Must confirm" toggle for manager roles.
  - **Voice:**
    - The mic button sits in SendBox when there is no text. Hold to record with `MediaRecorder`, using the same mime choice as `ui/OrbVoice.jsx`. Slide away to cancel, and recording stops at 120 s.
    - Upload with `upload(file,'message')`, send, then fire `messages.transcribe`.
    - New `VoiceNote` player with play/pause, a progress bar, the duration, and a collapsed "Show transcript".
  - **@mentions:** an inline picker of conversation members appears when the caret follows `@word`. It inserts `@Full Name ` and tracks ids, sent as `mentions`. It isn't offered in direct or ops chats.
  - **In-chat search:** a header search icon opens a search field with a results list; tapping a result jumps to it.
- **`app/src/pages/messages/Messages.jsx`:**
  - A search box over the conversation list calls `messages.search` and shows results grouped by chat. Tapping one goes to `/messages/:id?m=<msgId>`.
  - Subscribes to `msg`/`read` to reload the inbox. The inbox preview handles "Voice message".
- **`app/src/layouts/Shell.jsx`:** the messages badge also reloads on realtime `msg`/`read`.
- **New `app/src/ui/VoiceRecorder.jsx`:** a small `useRecorder` hook plus a `HoldToRecord` button. The record logic is extracted from the `MicButton` pattern in `OrbVoice.jsx`; OrbVoice itself stays untouched.

## Config and deploy
- Set `openkbs.json` to `"mqtt": true`, then run `openkbs deploy` (or `openkbs mqtt enable`) and check `openkbs mqtt info`.
- Run `openkbs fn deploy api`; migration 026 auto-applies on the first request. Then warm the function and confirm the columns exist.
- Build `app/` (`npm run build` writes to `site/app`), then run `openkbs site deploy`.
- Commits:
  - `feat: chat upgrades …` (code, migration, tests, spec)
  - `build: rebuild app bundle for chat upgrades`
  - Both end with the Co-Authored-By line. Then `git push`.
- Board: a business-language comment on the spec card, then move it.

## Verification
- **Unit tests:** new `functions/api/test/chat.test.mjs` for `cleanMentions`, `canPin`, `seenSummary` and `confirmSummary`, run with `npm test` in functions/api alongside the existing 95 tests.
- **SQL:** run the migration and every new query with `PREPARE` inside a rolled-back transaction against the live DB, using the same script approach as the pack check.
- **Token:** `openkbs fn invoke api -d '{"action":"realtime.token"}'` with a test user token returns a scoped token (`scope.subscribe = ['user:<uid>']`).
- **Browser (agent-browser)**, logged in as two test users in two sessions:
  - Send, react, reply, pin, mention, must-confirm with Got it, Chase, and search, each seen live within about 2 s.
  - Typing shows, and Seen updates.
  - Kill the socket (offline toggle), and the messages still arrive by polling.
  - Run `agent-browser close --all` afterwards.
- **Voice:** upload a short audio file through the send path; the transcript appears and can be searched.
- **Logs:** check `openkbs fn logs api` for errors.
