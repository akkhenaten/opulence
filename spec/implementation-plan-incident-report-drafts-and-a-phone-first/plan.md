# Implementation plan: incident report drafts and a phone-first report form

## Context
- Officers lose a half-written incident report if they lose signal or close the tab, because nothing is saved until Submit.
- The form is also cramped on phones, and its controls are mixed: picture tiles, switches, dropdowns and small text boxes.
- The approved spec covers both. Its decisions:
  - **Drafts** live on the server and are private to the writer.
  - **Steps:** the step flow stays, but the step names become tappable.
  - **Reminders:** only the writer is reminded, never a manager.
  - **Out of scope:** reports sent back with "Changes requested" don't get drafts.
- I save the spec text to `spec/spec-incident-report-drafts-and-phone-layout.md` as part of the commit.

## Data: `functions/api/db/migrations/040_incident_drafts.sql`
```sql
CREATE TABLE IF NOT EXISTS incident_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}',          -- form fields, witnesses, rough notes, manager picks
  attachments jsonb NOT NULL DEFAULT '[]',   -- [{key,mime,name}] uploaded but not yet on a report
  step int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reminded_after_shift boolean NOT NULL DEFAULT false,
  reminded_morning boolean NOT NULL DEFAULT false,
  warned_expiry boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS incident_drafts_user ON incident_drafts (user_id, updated_at DESC);
```

## API

### `functions/api/lib/incidentDrafts.mjs` (new, pure and unit-tested)
- `DRAFT_FIELDS`: the form's `BLANK` keys plus `witnesses`, `notes`, `ai_assisted`, `when`, `manager` (`{venue_id, shift_id, officer_id}`).
- `cleanDraft(data)`: keeps only those keys. Strings are capped (description 20k, others 4k), there are at most 20 witnesses, and booleans are coerced. Unknown keys are dropped.
- `draftProgress(d)`: returns `{done, total: 5, missing: [...]}`, using the same rules as the form's `problems` (type and severity, description, time, location; force justification only if force was used).
- `reminderDue(draft, shiftEndsAt, now)`: returns `'after_shift' | 'morning' | 'expiry_warn' | 'expire' | null`.
  - **after_shift:** an hour after the shift ends (for a draft with no shift, an hour after it was created).
  - **morning:** at 10:00 Europe/London on the day after the draft was created.
  - **expiry_warn:** 27 days after the last edit.
  - **expire:** 30 days after the last edit.
  - The `reminded_*` and `warned_expiry` flags are respected, so each reminder is sent only once.

### Draft actions, in `functions/api/modules/incidents.mjs` (roles `['officer','company','security']`; every query is filtered by `user_id = user.id`)
- **`incidents.drafts`:** the writer's drafts, newest first. Each comes with `{id, step, updated_at, type, venue_name, shift_starts_at, progress}`. `progress` comes from `draftProgress`, and the venue and shift come from `shift_id`/`venue_id` or `manager.venue_id`.
- **`incidents.draftGet {id}`:** returns the full draft, with signed preview URLs for its attachments via `downloadUrl`.
- **`incidents.draftSave {id?, data, attachments, step, version?}`:**
  - Every attachment key must pass `ownUpload` (reusing the 20-file limit). I don't run `headObject` here, because a file may still be uploading.
  - It inserts a new draft, or runs `UPDATE … WHERE id AND user_id AND version = $v RETURNING`. If no row matches, it returns 409 "This draft was updated on another device" with the server copy.
  - It bumps `version`, sets `updated_at`, sets `shift_id` and `venue_id` from the data, and resets the reminder and expiry flags when the draft is edited again after a reminder.
  - It returns `{id, version, updated_at}`.
- **`incidents.draftDelete {id}`:** deletes the row, deletes its unsent attachment objects (`deleteObject` from storage.mjs) and withdraws its reminders (`withdraw({refs:['draft:'+id]})` from `lib/notify.mjs`).
- **`incidents.create`** accepts `draft_id`. Inside the existing transaction, the draft row is deleted with `DELETE … WHERE id AND user_id` once the incident exists. After the transaction, its reminders are withdrawn. Validation is unchanged: shift, time window and backdate are all checked at submit.

### Reminders job, in `functions/api/modules/jobs.mjs`
- New `draftReminders()`, added to the core 5-minute jobs.
- It selects drafts that might be due: their user is active, joined to the shift for `ends_at`, limited to 200.
- For each draft, `reminderDue` picks the action, and the matching flag is claimed with `UPDATE … SET flag=true WHERE NOT flag RETURNING` before anything is sent.
- **after_shift / morning:** `notify([user_id], {kind:'incident', title:'Finish your incident report', body:'You have an unfinished report from {venue}. Finish it while it’s fresh.', link:'{base}/incidents/new?draft={id}', dedupe:'draft:{id}:{which}', ref:'draft:'+id})`.
- **expiry_warn:** "This draft will be deleted in 3 days".
- **expire:** delete as `draftDelete` does.
- It also deletes drafts whose user is `disabled`. That avoids touching `users.update` and `offboarding.save`, and their drafts never reach a reminder because the user filter requires active.

### Tests: `functions/api/test/incidentDrafts.test.mjs`
- `cleanDraft` drops unknown keys and caps text.
- `draftProgress` counts and lists what's missing.
- `reminderDue` across the shift-end, 10:00 London (BST and GMT), 27-day and 30-day cases, and flags already set.

## App

### Shared UI (`app/src/ui/index.jsx`)
- `Textarea` gets an `autoGrow` prop. It resizes to its content with a `minRows` floor (a ref, with the height set in an effect), and nothing changes for current callers.
- New `useKeyboardOpen()` hook: returns true when `visualViewport.height < innerHeight * 0.75`. If `visualViewport` isn't available, it returns false.
- New `YesNo({label, icon, value, onChange, hint})`: two equal `Pressable` buttons, 48px tall, using the same selected style as the type tiles (`border-2 border-blue bg-blue-soft`). "Yes" is red-tinted for the force question.

### Autosave hook: `app/src/pages/officer/_draft.js` (new)
- Modelled on the contracts autosave (`pages/people/contracts/Workspace.jsx:126-175`).
- `useIncidentDraft({ draftId, enabled })` returns `{ id, status: 'idle'|'saving'|'saved'|'offline'|'error'|'conflict', savedAt, save(snapshot, {now}), flush(), remove() }`.
- **Saving:**
  - Debounced by 800 ms.
  - A `seq` ref ignores stale responses.
  - The first call creates the draft and puts `?draft=<id>` in the URL with `replace`.
  - `flush()` runs on step change, `pagehide` and `visibilitychange: hidden`, and the last of these uses `fetch` with `keepalive`.
- **Offline:**
  - Every snapshot is also written to `localStorage['orb.incidentDraft.'+(id||'new')]`.
  - When `navigator.onLine` is false, or the request fails with a network error, the status is `offline` and the save is retried on the `online` event.
  - On load, a local copy newer than the server's `updated_at` wins.
- **Conflict:** a 409 sets `conflict` with the server copy. The form then shows "Updated on another device" and a "Reload" button.

### `app/src/pages/officer/IncidentForm.jsx`
**Drafts**
- New reports, for both officers and managers, use `useIncidentDraft`. Edit mode doesn't.
- On load, `?draft=` fetches `incidents.draftGet` and restores `v`, witnesses, notes, aiAssisted, shiftId/when, `m`, the step and the attachments. Restored attachments go into `saved`-style tiles that remove from the draft.
- `useUploads` (`pages/shared/evidence.jsx`) stays as it is. The draft snapshot stores `[...draftFiles, ...uploads.attachments]`.
- A snapshot is saved on every change once anything meaningful has been entered (a type, description, notes or a file). Simply opening the form creates nothing.
- **Same shift:** opening `new?shift=X` when a draft for shift X exists shows a `Sheet` with two choices, "Carry on with your draft" or "Start a new report".
- **Submit:** sends `draft_id`, then clears the local copy.

**Header**
- A horizontal row of step chips (scrollable, snap). Each chip is a button with a tick when its step is complete and an amber dot when something is missing, based on the same `problems`/`canNext` logic split per step.
- Below the chips: a `Progress` bar and the save status in `aria-live` ("Saving…", "Draft saved 23:41", "Saved on this phone, will sync").
- From `lg` up, the page is a two-column grid: the steps as a vertical list on the left, the current step on the right.

**Bottom bar**
- The same on every step: a "Save draft and close" link, then **Back** and **Next/Submit**, both `flex-1 size="lg"`.
- It uses `safe-b`, and is hidden while `useKeyboardOpen()` is true.
- The content gets bottom padding equal to the bar's height, so the last field is never covered.

**Steps**
- `Card`: `p-5` with `space-y-5` between cards, the title in `text-title3`, and the hint under it.
- **What:** type tiles at `min-h-[92px]`. Severity tiles share the type tiles' selected style (border, tick). The high/critical warning becomes an amber banner. The description uses `autoGrow minRows={8}`.
- **When & where:** shift choices use the same tile style. "Now" and "Show more shifts" are standard secondary buttons. Manager dropdowns stay.
- **People:** all text boxes use `autoGrow`. Each witness is a sub-card with a labelled "Remove" button (`variant="secondary" size="sm"`) instead of the trash icon.
- **Actions:** the three toggles become `YesNo`, and the follow-up field slides in under "Yes".
- **Evidence:**
  - The thumbnail grid is `grid-cols-3 sm:grid-cols-5`.
  - Tapping an image opens `Lightbox` (`app/src/ui/Lightbox.jsx`) at full resolution.
  - The three add buttons share one style, all `variant="secondary"` with an icon. Camera is primary only when no files have been added yet.
- **Review:** the same `Card`s, each with "Edit" jumping to its step. Missing items are listed as tappable amber rows at the top.

### `app/src/pages/shared/Incidents.jsx`
- For officers and managers, a **"Your drafts"** section sits above the filters, using `useApi('incidents.drafts')`.
- Each draft is a `Row` showing the type label (or "Untitled report"), the venue or shift date, and "Saved 23:41 · 3 of 5 steps". Tapping it opens `incidents/new?draft=id`, and each row has an `IconButton` (Trash2) delete with a confirm.
- The section is hidden when the writer has no drafts. The empty state for submitted reports is unchanged.

### `app/src/pages/people/_whatsnew.jsx`
- A new top card: "Incident reports that wait for you" (drafts, reminders, the roomier phone form).

## Verification
1. **Checks:** run `cd functions/api && npm test`, then `cd app && npm run build` (ui-lint must stay at 67 or below, with icon sizes only 14, 16, 18, 20 and 24).
2. **Local PGlite** (pool max 1):
   - Migrate 040.
   - draftSave, then create, then save with a stale version and expect 409.
   - Draft get and list as the writer, and confirm another user gets nothing.
   - Create with `draft_id` removes the draft.
   - draftDelete.
   - Reminder job with a fake clock: after-shift fires once, morning fires once, a draft idle 30 days is expired, and a disabled user's drafts are removed.
3. **Mock and browser at 390×844 and 1280×900:**
   - Add stubs for `incidents.drafts`, `incidents.draftGet`, `incidents.draftSave` and `shifts.mine` to `/tmp/mock/server.mjs`.
   - Screenshot every step, the step chips with a tick and an amber dot, the Yes/No buttons, the keyboard-hidden bar (simulated by shrinking the viewport height), the "Your drafts" list, the offline status (set offline in the browser) and the same-shift prompt.
   - Then run `agent-browser close --all` and stop the servers.
4. **Release:**
   - Commit "feat: incident report drafts, reminders, phone-first report form" with the Co-Authored-By line.
   - `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`, then `git push origin master --tags`.
   - Read-only live check: an unauthenticated `incidents.drafts` returns 401, and the bundle contains "Your drafts".
   - No live test data is created.
