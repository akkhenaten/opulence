# Implementation plan: shift changes tidy up everywhere; "Ops AI" becomes "Orb"

The spec is saved at `spec/spec-shift-changes-update-everywhere-and-ops-ai-becomes-orb.md`. This change touches both the API and the app, and adds one migration.

## 1. Migration `034_shift_refs.sql`
- `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ref text;` and `CREATE INDEX IF NOT EXISTS notifications_ref_idx ON notifications (ref) WHERE ref IS NOT NULL;`
  - `ref` tags a notification with what it is about: `asg:<assignmentId>`, `shift:<shiftId>` or `ops:<itemId>`.
- Rename the officers' chat and its sender:
  - `UPDATE conversations SET title = 'Orb' WHERE kind = 'ops' AND title = 'Orb Ops';`
  - `UPDATE users SET name = 'Orb' WHERE system AND name = 'Orb Ops';`
  - These are the only data changes. They run as part of the approved rename.

## 2. `lib/notify.mjs`
- `notify(…, { ref = null })` writes `ref`.
- **New `withdraw({ assignments = [], shifts = [], items = [] })`** deletes the bell notifications for those things:
  - `ref = ANY(asg:/shift:/ops: refs)`.
  - Older notifications have no `ref`, so it also matches their existing keys: `dedupe_key = ANY(late:, esc:, pack-esc:, pack-both:, pack-back:, omw:, remind:, pack-day:, pack-2h:, pack_blocked:, ops:)`.
  - The key list is built by a pure exported helper, `withdrawKeys()`, which is unit-tested.
  - **Older shift notices with no key:** for each removed assignment, also delete that officer's `kind='shift'` notifications titled "New shift assigned", "Shift request approved", "Shift updated" or "New shift published" whose body starts with `<venue> · <fmtDateTime(starts_at)>`. Those notices are already on live, and this is what makes them disappear.

## 3. Tag new notifications with `ref`
- **`rota.mjs`:** `notifyAssigned` gets `ref: asg:<id>`. The publish notice gets the ref of the first assignment it covers. The `shifts.mine` open-shift notice is left alone.
- **`jobs.mjs`:**
  - late alerts get `asg:`
  - reminders get `asg:`
  - **`venuePacks.mjs`:** the day and 2h pack reminders get `asg:`
- **`ops.mjs`:**
  - `createItem` gets `ops:<item.id>`
  - `esc`, `pack-esc`, `pack-both`, `pack-back` and `omw` get `asg:<a.id>`
  - `notifyManagers` passes `ref` through.
- **`clock.mjs`:** `pack_blocked` gets `asg:`.

## 4. New `modules/shiftSync.mjs` (internal, no actions)
`export async function afterShiftChange({ removed = [], shiftIds = [], officerIds = [], gone = false })`. Every step is wrapped in try/catch and logged, so a failed tidy-up never fails the manager's action.
- `removed`: the assignment rows taken off, each `{id, officer_id, shift_id}`.
- `gone`: the shift is cancelled or deleted.

What it does:
1. **Bell:** `withdraw({ assignments: removed, shifts: gone ? shiftIds : [] })`.
2. **Officer chat buttons:** for each removed assignment, run `closeQuick(uid, {ref: 'chase:'+id | 'pack:'+id, used: 'stood_down'})`. If the shift is gone, also withdraw the open `cover_offers` for those shifts (status `expired`), and close their `offer:` buttons.
3. **Shift chat:** `UPDATE conversation_members SET left_at = now()` for the removed officers' users in `conversations(kind='shift', ref_id=shift_id)`.
   - This doesn't apply to a user who is also a manager of the venue, or who is still active on that shift.
   - It adds a `leaveThread(convId, userIds)` helper to `lib/threads.mjs`. `syncMembers` already re-adds people later by clearing `left_at`.
4. **Cover cards:** run `tidyCover(shiftIds)` from `ops.mjs` (see section 5).
5. **Compliance cards:** call `runCompliance({ officerIds: [...removed officers, ...officerIds] })`.

## 5. `ops.mjs` and `compliance.mjs`
- **New exported pure function `coverStale(item, { shiftStatus, filled, headcount, replacingActive })`:**
  - Returns the reason the card no longer applies: `'cancelled'`, `'filled'` or `'replaced'`, or `null` if it still applies.
  - `replaced` means `payload.replacing` is set and no longer active, and the shift is full.
  - If the replaced officer was removed but the shift is still short, the card stays, because the cover is still needed.
- **New `tidyCover(shiftIds = null)`:**
  - Goes through pending cover cards (optionally only those for the given shifts) and checks each one with `coverStale`.
  - Stale cards are set to `status='done'` with `result = {auto_closed: reason}`, and their `ops:` notifications are withdrawn.
  - It is called from `afterShiftChange`, from `runOpsJobs` (so the 5-minute run and refresh tidy existing stale cards), and inside `decideCover`.
- **`decideCover`:** if `coverStale` says the card no longer applies, it closes the card and fails with `fail(409, 'Shift already filled — nothing sent')`. No offers go out.
- **Anywhere a card is closed** (`runCompliance` cleared cards, `tidyCover`, the existing `done` updates in `ops.mjs:382/437/913`, and `nextBatch`), also call `withdraw({ items: [id] })`, so the "Orb: …" alert leaves the bell.
- **`runCompliance({ manual, officerIds = null })`:**
  - When `officerIds` is given:
    - skip `readDocuments` and the activity log line
    - call `computeIssues({officerId})` for each officer
    - consider only those officers' open cards when updating or clearing
  - It still calls `advise()` only when the issue set (`sig`) changes.

## 6. Hook it into every change
- **`rota.mjs`:**
  - **`shifts.unassign`:** `removed: [a]`.
  - **`shifts.reassign`:** `removed: [old]`, `officerIds: [new]`.
  - **`shifts.assign`:** `officerIds: [officer]`, plus `shiftIds` for the cover tidy-up.
  - **Re-adding an officer:** the upserts in `shifts.assign`, `shifts.reassign`, `rota.mjs:291` and `ops.mjs:900` also reset `reminded`, `late_alerted`, `chased_at`, `escalated_at`, `reply`, `pack_*_at` (and `reply_at`, if that column exists, checked against the migrations), and delete that assignment's `pack_reminders` rows. This lets the reminders and checks start fresh.
  - **`shifts.cancel`:** `removed: rows`, with `gone: true`.
  - **`shifts.delete`:**
    - Collect the assignments before the delete, then call it with `gone: true`.
    - Cards and offers are already deleted along with the shift. This also withdraws the notifications.
  - **`shifts.save`:**
    - If the status moves to `cancelled`, route it through the same path as cancel: assignments are cancelled, officers told, and `gone`.
    - If it moves to `draft`, withdraw the officers' notifications.
    - If the time or venue changes, withdraw the old `asg:` notices for those officers before "Shift updated" is sent, and re-run compliance for them. (The old notice showed the old time.)
  - **`shifts.respond` (an officer declines):** `removed: [a]`.
  - **`shifts.decideRequest` (rejected):** remove the managers' "Open shift requested" notice by tagging it `ref: asg:<id>` when it's created, then withdraw it.
- **`cover.mjs`:**
  - `cancelOccurrence` calls `afterShiftChange` with `gone: true`, using the assignments it cancelled. It is given the `RETURNING` rows.
  - `retimeOccurrence` does the same as the time change path in `shifts.save`.
- **`hr.mjs` offboarding:** after the transaction, `removed` is the cancelled rows (`RETURNING id, officer_id, shift_id`).
- **`compliance.mjs` decideCompliance unassign:** `removed` is the cancelled rows. Its own card is handled by the compliance re-run.
- **`ops.mjs`:**
  - `decideCover` stand-down: `removed: [r]`
  - escalation "can't make it" (`ops.mjs:280`): `removed: [a]`
  - offer accepted (`ops.mjs:892-914`): `officerIds: [taker]`, plus the cover tidy-up

## 7. App
- **`app/src/api.js` (or wherever `api()` lives):** after a successful call whose action matches `/^(shifts\.|cover\.|offboarding\.|ops\.decide)/`, dispatch `orb:ops` and `orb:notify`.
- **`Shell.jsx`:** `NotificationBell` reloads its count, and its list if it's open, on `orb:notify`. The ops count already listens for `orb:ops`.
- **`Live.jsx`:** the board, count and inbox reload on `orb:ops`, the same as after refresh (`reloadKey`).
- **`Rota.jsx`:** no change. It already reloads itself.
- **Cover card approval:** a 409 now shows its message ("Shift already filled — nothing sent") and the inbox reloads.

## 8. Rename "Ops AI" to "Orb"
Replace each visible string. Internal ids stay as they are (`ops.*` actions, the `OpsAI.jsx` file name, settings keys).
- **App:**
  - `pages/manager/OpsAI.jsx`: the empty state, activity, "Orb chat for managers", "What Orb does", "Orb and incidents"
  - `pages/shared/Live.jsx`: the heading, subtitle and refresh tooltip
  - `people/_profileTabs.jsx` attendance text
  - `money/PayRuns.jsx`
  - the other files from the grep: `Compliance.jsx`, `venue/_feedback.jsx`, `officer/_ops.jsx`, `main.jsx`, and Shell labels
  - `messages/Thread.jsx` placeholder: "Reply to Orb…"
- **API:**
  - `ops.mjs`: the `Orb: ${title}` alert, the `propose_change` and `created` texts, the switched-off message and the system prompt "You are Orb, …"
  - `lib/ai.mjs`: the credit-cap and unavailable messages, and `MODULE_NAMES.ops = 'Orb operations'`, so it isn't confused with the assistant's own `orb` line in usage
  - `lib/orbCatalog.mjs`
  - `lib/guide.mjs`: the Help section is titled "Orb (operations)", and its text uses Orb
  - `assistant.mjs`: "switched off in Orb settings" and the map text
  - `money.mjs`, `payruns.mjs`, `jobs.mjs` and `compliance.mjs` strings
  - `messages.mjs` `KIND_LABEL.ops = 'Orb'`
  - `threads.mjs` new-thread title `'Orb'`
- **Check:** `grep -rn "Ops AI\|Orb Ops"` must leave only code comments. Tests that assert on the old text are updated.

## Verification
1. **API tests:** `cd functions/api && npm test`. New pure tests:
   - `coverStale` cases: cancelled, filled, replaced and full, replaced but still short → null.
   - `withdrawKeys` builds the right `ref` and older dedupe keys.
   - `runCompliance` officer filtering, through a small pure helper that picks which open cards to clear for the given officers.
   - All 156+ existing tests still pass.
2. **App build:** `cd app && npm run build` (ui-lint 67 or below, and vite builds).
3. **Mock UI:**
   - Live shows "Orb" in the heading and subtitle.
   - The Settings tile reads "What Orb does".
   - Firing `orb:notify` reloads the bell. Check with a network log in agent-browser.
   - Then `agent-browser close --all`.
4. **Ship:**
   - `openkbs fn deploy api -s 'rate(5 minutes)'`. Migration 034 runs automatically.
   - `openkbs site deploy`.
   - Commit `fix: shift changes tidy up everywhere; Ops AI is now Orb`, including `site/` and `spec/`.
   - `git push origin master --tags`.
   - Check the live bundle.
5. **Live data:** I don't run anything by hand on live. The existing stale cards close on the next 5-minute run (`tidyCover` inside `runOpsJobs`). The user's stale officer notifications clear when that shift is next changed, or I can ask before clearing them.
