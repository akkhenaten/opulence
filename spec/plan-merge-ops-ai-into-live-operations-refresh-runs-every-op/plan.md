# Implementation plan: merge Ops AI into Live operations

## Context
Spec: `spec/plan-merge-ops-ai-into-live-operations-refresh-runs-every-op.md`.

The goal is one "Live operations" screen with the live board and the Ops AI panel side by side. The round-arrows refresh button runs every Ops AI check and then reports what it found.

The venue "On site" page is unchanged. There are no data model changes.

## Backend (`functions/api`)

### `modules/ops.mjs`
1. **Throttle helper.** Add an exported pure helper:
   ```js
   export const complianceDue = (lastAt, now = Date.now()) => !lastAt || now - new Date(lastAt) > 10 * 60_000;
   ```
2. **New action `ops.refresh`, `def(MGR, async (_b, { user }) => …)`:**
   - Takes a run lock inside `tx(async ({ one: o }) => …)`.
     - It calls `SELECT pg_try_advisory_xact_lock(hashtext('ops.refresh')) AS ok`.
     - If the lock isn't free, it returns `{ busy: true }`.
     - The lock is released when the transaction ends.
     - The checks themselves use the normal `q`/`one`, as the scheduled jobs do.
   - Counts pending items before and after with a `pendingCount(scope)` helper.
     - It uses the same query as `ops.count`; refactor `ops.count` to use the helper too.
   - **Step 1: Ops checks.** `out.ops = await runOpsJobs(await getSettings())`. Errors are already caught per job.
   - **Step 2: Hours check.**
     - `out.reconcile = await runReconcile(addDays(londonDate(new Date()), -14), londonDate(new Date()))`.
     - It's wrapped in try/catch, which records `error: …`.
   - **Step 3: Compliance check.**
     - Find the last run with the same query as `compliance.mjs:552`: `SELECT created_at FROM ops_activity WHERE kind='compliance' ORDER BY created_at DESC LIMIT 1`.
     - If `complianceDue`, run `await runCompliance({ manual: true })`. Otherwise add `'compliance'` to `skipped`.
   - **Step 4: Log it.** `await logActivity('refresh', \`Checks run by ${user.name || 'a manager'}\`)`.
   - **Return value:** `{ new_items: Math.max(0, after - before), pending: after, checked_at: new Date(), skipped, errors }`.
     - `errors` holds the names of any checks whose result starts with `error:`.
3. **Notification links.** Lines 42 and 285 change from `link: 'ops'` to `link: 'live'`.

### `lib/ai.mjs`
Lines 42 and 52 change from `/company/ops?tab=settings` to `/company/live?tab=settings`.

### `test/ops.test.mjs`
- Add a test for `complianceDue`:
  - null → true
  - 5 minutes ago → false
  - 11 minutes ago → true
- Add a test that `actions['ops.refresh'].roles` (check the `def` shape in `_def.mjs`) contains `company` and `security` and not `officer` or `venue`.

## App (`app/src`)

### `pages/manager/OpsAI.jsx` becomes a module of exported components
- Remove the default `OpsAI` page and `AskOrbMoved`.
- Export `Inbox`, `Activity` and `OpsSettings`.
- **`Inbox({ onChange, compact, reloadKey })`:**
  - In compact mode it uses a single-column list (`space-y-3`) instead of the two-column grid.
  - The `Segmented` control is kept.
  - Add `useEffect(() => { if (reloadKey) q.reload(); }, [reloadKey])` so a refresh can trigger a reload.
- **`OpsSettings`:** the "Run checks now" toast now says "see Live operations".

### `pages/shared/Live.jsx` becomes the merged page
- **Data, for managers only:**
  - `const count = useApi('ops.count', {}, { poll: 30000, skip: !isManager })`.
  - `tab` comes from `useSearchParams`:
    - `activity` and `settings` (company only) are kept.
    - Anything else, including the old `inbox`, means `board`.
- **Refresh:**
  - Uses `const [run, busy] = useAction()`.
  - Venue users: `q.reload()`, then the toast "Updated".
  - Managers: `run(() => api('ops.refresh'))`. Then:
    - Reload the board and the count.
    - Bump `reloadKey` so the inbox reloads.
    - Dispatch `window.dispatchEvent(new Event('orb:ops'))` so the nav badge updates.
    - Set `lastChecked`.
    - Toast:
      - `busy`: "Checks already running".
      - `new_items` greater than 0: "Checked — N new item(s) to approve".
      - Otherwise: "Checked — all clear".
  - The `IconButton` gets `disabled={busy}` and `className={cx('bg-surface shadow-tile', busy && '[&>svg]:animate-spin')}`.
- **Header:**
  - Managers: the title is "Live operations".
  - The subtitle is "Board updates every 15 seconds · Ops AI checks every 5 minutes", followed by "· last checked HH:MM" once someone has pressed refresh.
  - The actions are the refresh button plus the Orb button (`orb:askorb`), moved over from Ops AI.
- **Tabs (managers only):**
  - Board · Activity · Settings (Settings for company only).
  - They use the `Tabs` component already used in OpsAI.
- **Board tab:**
  - Managers get the layout `<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">`, with `<Board>` on the left and `<OpsPanel>` on the right.
  - `OpsPanel` is sticky on large screens (`lg:sticky lg:top-4 lg:self-start`).
  - It's titled "Ops AI" with a pending-count `Pill` and contains `<Inbox compact …/>`.
  - On phones `OpsPanel` comes first with `order-first lg:order-none`.
    - When nothing is pending it collapses to a one-line "Ops AI · all clear" row.
    - Use `count.data?.n === 0` to decide.
  - The venue grid in `Board` changes from `lg:grid-cols-2` to `xl:grid-cols-2`, but only when the panel is shown. Pass a `narrow` prop.
  - Venue users get `<Board>` alone, as today.
- `Detail` and `ManualForm` are unchanged.

### Routing and nav
- **`main.jsx`:**
  - Remove the `OpsAI` lazy import.
  - Replace the `ops` route with `function OpsRedirect()`. It does `<Navigate to={\`../live${location.search}\`} replace />`, using `useLocation`, so that `?tab=settings` is kept.
- **`layouts/nav.js`:**
  - Delete the two Ops AI items (lines 15 and 56).
  - Add `badge: 'ops'` to both "Live operations" items.
  - Remove `Sparkles` from the imports if it's no longer used.
- **`layouts/Shell.jsx`:** add an `orb:ops` listener that calls `opsCount.reload()`, using the same pattern as line 137.
- **Point existing links at Live:**
  - `pages/people/Compliance.jsx:44` goes to `/${user.role}/live`.
  - `pages/money/PayRuns.jsx:304` goes to `/company/live`, with the label "Open Live operations".
  - `ui/AskOrb.jsx:249` goes to `/${role}/live`, with the label "Open in Live operations ({n})".
- **Check for leftovers:** `grep -rn "Ops AI" app/src` for any remaining text that should now say Live operations. Keep wording like "Ops AI suggests…", since the feature name stays.

## Deploy & ship
1. Run `cd functions/api && npm test`.
2. Run `cd app && npm run build`, and check that ui-lint is still at 67 or lower.
3. `git add -A && git commit` with the message `feat: merge Ops AI into Live operations; refresh runs every Ops AI check` and the Co-Authored-By line.
4. From the project root, run `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`.
5. Run `git push origin master --tags`.

## Verification
- Tests and build pass.
- Confirm the deployed function answers `ops.refresh` with "Please sign in again" when not signed in. That shows the action exists without running it.
- I won't press the refresh on live data myself: it can send chase messages to officers straight away.
- I'll tell the user what to check:
  - The board and the Ops AI panel are side by side.
  - The arrows spin and then show a summary toast.
  - The nav badge sits on Live operations.
  - Old Ops AI links land on Live.
