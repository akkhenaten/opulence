# Plan: Site packs on Live operations

## Context
Spec: `spec/spec-site-packs-on-live-operations.md`. Live (`live.board` in `functions/api/modules/clock.mjs`, UI in `app/src/pages/shared/Live.jsx`) has no pack status. A clock-in blocked by an unsigned pack fails with a 423 at `clock.mjs:107-112` before anything is written. Managers then see "late" or "no-show" with no reason. This plan does four things:
- records blocked attempts
- shows pack status on Live
- sends one manager alert per shift
- gives venue logins a simple signed or not-signed status

## Data: `functions/api/db/migrations/024_pack_blocks.sql`
```sql
CREATE TABLE IF NOT EXISTS pack_blocks (
  assignment_id uuid PRIMARY KEY REFERENCES shift_assignments(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  pack_status text NOT NULL,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
```
There is one row per shift assignment. Repeat attempts bump `last_at` and `attempts`. The row is never deleted, so the history survives a later successful clock-in. `migrate()` already runs when `index.mjs` handles a request, so no manual step is needed.

## Backend: `functions/api/modules/clock.mjs`
1. **`clock.punch` block (lines 107-112).** Before `fail(423, ...)`:
   - Upsert into `pack_blocks`: `ON CONFLICT (assignment_id) DO UPDATE SET last_at = now(), attempts = pack_blocks.attempts + 1, pack_status = EXCLUDED.pack_status`, using `RETURNING (xmax = 0) AS first`.
   - On the first attempt, write an audit entry with `audit(user, 'clock.pack_blocked', 'assignment', a.id, { venue_id, pack_status })`. Then send a manager alert with `notify(await managersFor(a.venue_id), {...})`:
     - kind `pack_blocked`, severity `warning`
     - title "{officer} can't clock in – site pack not signed"
     - body "{venue}, shift {time}. They tried at {fmtTime}."
     - link `/company/venues/{venue_id}?tab=pack`
     - `dedupe: 'pack_blocked:' + a.id`, so the database also prevents duplicate alerts.
   - Wrap all of this in `try/catch` so a logging failure never changes the 423 the officer gets.
   - The officer name comes from `a`, or from one lookup if `myAssignments` doesn't return it. Check while implementing.
2. **`live.board`.**
   - Add a column to the SELECT: `(SELECT json_build_object('first_at', first_at, 'last_at', last_at, 'attempts', attempts) FROM pack_blocks pb WHERE pb.assignment_id = a.id) AS pack_block`.
   - After the query, make one batched call `statusesFor(rows.map(r => ({ officer_id: r.officer_id, venue_id: r.venue_id })))` from `lib/venuePack.mjs`. That is 3 queries for the whole board, so polling stays cheap.
   - Add `pack: 'none' | 'signed' | 'unsigned' | 'resign'` to each row:
     - `current` → `signed`
     - `resign` and `refresher` → `resign` ("Needs re-sign")
     - `unsigned` → `unsigned`
     - `none` → `none`
   - **State.** When `state` is `late`, `no_show` or `upcoming`, `pack_block` is set, and there is no `in` event, add `blocked: true`. The `state` value itself stays the same, so the existing counts, Ops AI jobs and tests are unaffected.
   - **Venue role.** Venue logins get `pack` collapsed to `signed`, `unsigned` or `none`, with `resign` shown as `unsigned`, i.e. "Not signed yet". `pack_block` and `blocked` are deleted for them, next to the existing `delete rest.phone`.
3. `lib/venuePack.mjs`: add a small exported `livePack(status)` mapper so the mapping can be tested.

## Frontend: `app/src/pages/shared/Live.jsx`
- **Row right column.** If `r.blocked`, show `<Pill tone="red"><Lock/>Pack not signed</Pill>` in place of the Late or No-show pill. Otherwise show the existing state pill, plus:
  - a small amber pill "Pack not signed" or "Needs re-sign" when `r.pack` is `unsigned` or `resign`
  - a muted "Pack signed" caption when `signed`
  - nothing when `none`
- **Row subtitle when blocked.** Append "· tried to clock in at {time(pack_block.last_at)}". Use `first_at` if it is the only attempt, otherwise show "{n} tries, last {time}".
- **Venue base (`base === '/venue'`).** The pill reads "Signed" or "Not signed yet" and there is no attempt time.
- **`Board` counts.** Add `pack: n(r => r.pack === 'unsigned' || r.pack === 'resign' || r.blocked)`. When the count is above 0, show `<Chip label="Pack not signed" tone="amber">` (managers only), and add a `pack` filter option: `filter === 'pack'`.
- **`Detail` sheet.**
  - A "Site pack" KV line shows the status label, plus "Blocked clock-in: first {time}, last {time}, {n} attempts" when present.
  - A secondary button "Open site pack" links to `${base}/venues/${row.venue_id}?tab=pack`. Check that this route exists for both the company and security bases (it does at `main.jsx:186` and `main.jsx:203`).
- Run `npm run build` in `app/`. The ui-lint step must pass.

## Tests: `functions/api/test/venuePack.test.mjs`
- `livePack` maps all five statuses correctly, including `refresher` → `resign`.
- Add a venue-view mapping test (`resign` → `unsigned`). Put it in a pure helper, e.g. `forVenue(pack)`, next to `livePack`.

## Deploy
1. Run `cd functions/api && npm test`, then `cd app && npm run build`. The build output goes to `site/app`.
2. Commit the feature: `feat: site packs on Live — signed status per officer, blocked clock-ins recorded with one manager alert, venue sees signed or not`. Then commit the bundle separately, as the repo already does: `build: rebuild app bundle for packs on Live`.
3. Run `openkbs fn deploy api`, then `openkbs site deploy`. Push to origin.

## Verification
- Run `openkbs fn invoke api` with a manager token, or use the browser, to call `live.board`. Check that rows have `pack`, and that `pack_block` is present after an attempt.
- In the browser with the demo data (`agent-browser`):
  1. Log in as an officer booked at a venue with a published, unsigned pack. Try to clock in and confirm the 423 screen still leads to the pack.
  2. As a manager, open `/company/live`. Check the row shows "Pack not signed – tried to clock in at HH:MM" and the chip count matches.
  3. Check that exactly one notification arrives after two attempts.
  4. Sign the pack as the officer, clock in, and check that Live shows "On shift" while the detail sheet still lists the blocked attempt.
  5. As the venue login, open `/venue/live` and check it shows only "Signed" or "Not signed yet".
- Run `agent-browser close --all` afterwards.
- Move the spec card to Review with a business-language comment.
