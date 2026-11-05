# Plan: merge Ops AI into Live operations, refresh runs every Ops AI check

## Context
Today **Live operations** (`app/src/pages/shared/Live.jsx`) and **Ops AI** (`app/src/pages/manager/OpsAI.jsx`) are two menu items.

**What's wrong today:**
- Live's round-arrows button (`RefreshCw`) only re-fetches `live.board`, with no feedback, so it looks like it does nothing.
- The Ops AI checks only run on the 5-minute schedule, or from "Run checks now" in Ops AI → Settings. That button is company-only and runs every scheduled job, including reminders and invoices.

**What the user wants:**
- One screen.
- Pressing the arrows should run **every bit of Ops AI**, then show the result.

**Layout:** board and AI side by side (chosen by the user).

**Defaults I've assumed** (the user didn't answer these):
- The refresh runs every Ops AI check, including compliance.
- Both company and security managers can use the refresh. Security managers still only see items for the venues they cover.
- The venue portal's "On site" page stays exactly as it is, with no AI.

## Backend (`functions/api`)

### 1. New action `ops.refresh` (MGR) in `modules/ops.mjs`
It runs only the Ops AI parts, not reminders or invoices. A Postgres advisory lock (`pg_try_advisory_lock`) stops two presses running at the same time.

**Steps:**
1. Read `before` = the count of pending `ops_items` in the user's scope. Reuse the query behind `ops.count`.
2. Run `runOpsJobs(await getSettings())` (`modules/ops.mjs:583`). This covers pack checks, chasing and escalation, cover suggestions, and everything else in `JOBS`.
3. Run `runReconcile(addDays(today,-14), today)`, the hours check.
4. Run `runCompliance({ manual: true })` (`modules/compliance.mjs:357`).
   - It's throttled to at most once every 10 minutes. The check is the last `ops_activity` row of kind compliance, or a timestamp kept in settings.
   - That's because it reads documents with AI. AI module caps still apply.
5. Run `logActivity('refresh', 'Checks run by <name>')`.
6. Return `{ new_items: after - before, pending: after, checked_at, skipped: [...] }`.
   - `skipped` notes anything that was throttled or busy.
   - If the lock is already held, return `{ busy: true }` and let the client just reload.

**Notes:**
- Errors in one check are caught and reported per check, like `runJobs` does. One failure doesn't stop the rest.
- `ops.runNow` stays as it is (CO, used by Settings).
- `ops.refresh` goes in `lib/orbCatalog.mjs` only if similar run actions are there; otherwise leave the catalogue alone.
- The API is called directly on the Lambda URL with a 180s timeout, so a longer run is fine.

### 2. Links
- `lib/ai.mjs:42,52`: `/company/ops?tab=settings` becomes `/company/live?tab=settings`.
- `modules/ops.mjs:42,285`: `link: 'ops'` becomes `link: 'live'`.

## App (`app/src`)

### 3. `pages/manager/OpsAI.jsx` becomes a component module
- Drop the default `OpsAI` page.
- Export `Inbox`, `Activity` and `OpsSettings` as they are. Everything else (`ItemCard`, the bodies, edit and reject sheets) is unchanged.
- `Inbox` gets an optional `compact` prop. In compact mode it uses one column instead of `lg:grid-cols-2`, so it fits the side panel.
- Remove `AskOrbMoved` (the old `chat` tab).

### 4. `pages/shared/Live.jsx` becomes the merged page
- **Header:**
  - Managers see the title "Live operations" with the subtitle "Live board and Ops AI. Checks run every 5 minutes, or press refresh."
  - Venue users keep "On site" as today.
  - The **Orb** button moves here from Ops AI.
- **Tabs (managers only), using `?tab=`:**
  - `Board` (the default), `Activity`, and `Settings` (company only).
  - Old `?tab=inbox` and `?tab=decided` links map to Board.
- **Board tab, side by side:**
  - Grid `lg:grid-cols-[minmax(0,1fr)_400px]`, with the board on the left.
  - The venue groups inside the board go from `lg:grid-cols-2` to `xl:grid-cols-2`.
  - The right column is a sticky **"Ops AI"** panel:
    - Header showing the pending count.
    - A `Segmented` control: To approve / Decided.
    - `<Inbox compact />`.
  - On phones the AI panel stacks **above** the board, but only when there are pending items. Otherwise it shows a one-line "Ops AI: all clear" there.
- **Refresh (round arrows):**
  - Uses `useAction`.
  - Managers: calls `api('ops.refresh')`, then reloads the board, the inbox and the count, then fires `orb:ops` so the nav badge updates.
  - Toast text:
    - "Checked — 2 new items to approve", or
    - "Checked — all clear", or
    - "Checks already running".
  - While it runs, the icon spins (`animate-spin`) and the button is disabled.
  - A "Last checked HH:MM" line goes under the title.
  - Venue users: the arrows just reload the board, with a "Updated" toast.
- **Sheets:** the existing `Detail` and `ManualForm` sheets are unchanged.

### 5. Navigation and routes
- **`layouts/nav.js`:**
  - Remove the "Ops AI" items (lines 15 and 56).
  - The "Live operations" items get `badge: 'ops'`.
- **`main.jsx`:**
  - The `ops` route becomes `<OpsRedirect>`, which goes to `live` and keeps `?tab=`. Old links and notifications keep working.
  - Drop the lazy import of `OpsAI`.
- **`layouts/Shell.jsx:127`:**
  - The `ops.count` badge stays as it is.
  - Listen for `orb:ops` so the badge reloads after a refresh. Follow the existing `orb:email` pattern.
- **Point existing links at Live:**
  - `pages/people/Compliance.jsx:44`
  - `pages/money/PayRuns.jsx:304`: the button label becomes "Open Live operations".
  - `ui/AskOrb.jsx:249`: "Open in Live operations (n)".

## Tests (`functions/api/test/ops.test.mjs`)
- `ops.refresh` is MGR-only (an officer or venue gets 403). Use the existing role-check test pattern if there is one.
- The compliance throttle helper: run if never run or more than 10 minutes ago, skip otherwise. This is a pure function.

## Deploy & ship
1. Run `npm test` in `functions/api`.
2. Run `cd app && npm run build`, and check ui-lint is still at 67 or lower.
3. Commit with the message `feat: merge Ops AI into Live operations; refresh runs every Ops AI check`.
4. From the project root, run `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`.
5. Push to origin.

## Verification
- Tests and build pass.
- I won't run the new refresh on live data myself without asking. On live it sends real messages: chasing officers, stand-downs and cover offers only go out once a manager approves them, but chasers and escalations go out straight away.
- I'll describe for the user what to check:
  - Live operations shows the board with the Ops AI panel beside it.
  - The arrows spin and then show a summary.
  - Old `/company/ops` links land on Live.
