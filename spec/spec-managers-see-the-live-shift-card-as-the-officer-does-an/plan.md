# Implementation plan: managers see the live shift card and send instructions (v113)

**Spec:** `spec/spec-managers-see-the-live-shift-card-as-the-officer-does-an.md` (approved).

**Context:**
- Managers already have a shift page: the same `Body` in `app/src/pages/shift/ShiftView.jsx`, and `shiftAccess` gives them 'mgr' with write and curate rights.
- But Live doesn't link to it, it hides the officer's sections from them, and nothing they write reaches the officer.
- `live.board` already returns `shift_id`, so the Live link needs no API change.

## 1. Database: `functions/api/db/migrations/043_shift_instructions.sql`
```sql
ALTER TABLE shift_log_entries DROP CONSTRAINT IF EXISTS shift_log_entries_kind_check;
ALTER TABLE shift_log_entries ADD CONSTRAINT shift_log_entries_kind_check
  CHECK (kind IN ('note','handover','incident','ban','ejection','instruction'));
ALTER TABLE shift_log_entries ADD COLUMN IF NOT EXISTS to_user_id uuid REFERENCES users(id) ON DELETE SET NULL; -- null = whole team
CREATE TABLE IF NOT EXISTS shift_instruction_reads (
  entry_id uuid NOT NULL REFERENCES shift_log_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, user_id)
);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS notes_updated_at timestamptz;
```

## 2. API

### New: `functions/api/lib/instructions.mjs`
Pure helpers, so they can be unit-tested:
- `recipients(entry, team)` returns the user ids an instruction is for: `to_user_id`, or every team `user_id`.
- `visibleEntries(entries, access)`:
  - venue: drops `kind='instruction'`;
  - officer or lead: keeps only instructions addressed to them or to the whole team;
  - mgr: keeps everything.
- `canSendInstruction(sh, now)`: the shift is published, `now >= starts_at - 2h`, and `now < ends_at`.

### `functions/api/modules/shiftlog.mjs`
**`shifts.detail`**
- Run entries through `visibleEntries`. This also keeps the existing venue `keptOnly` filter.
- For each instruction, attach `reads: [{user_id, name, read_at}]` (managers only) and `read_by_me` (for the officer).
- Add `instructions_unread` for the officer: the instructions for me with no read row.
- Add `shift.notes_updated_at`.
- `me.can_instruct = ax.access === 'mgr' && canSendInstruction(sh)`.

**`shiftlog.instruct`** — new, `def(MGR, …)`
- Body: `{shift_id, body (≤500), to_user_id?}`.
- Checks: `shiftAccess` is 'mgr', `canSendInstruction`, and `to_user_id` (if given) is a team member's user.
- Inserts an entry with `kind='instruction'`, `to_user_id`.
- `notify(recipients, {kind:'shift', severity:'warning', title:'From your manager', body: body.slice(0,160), link:`/officer/shifts/${id}`, dedupe:`instr:${entry.id}`})`. This is push plus in-app, never email.
- Audits `shiftlog.instruct`.

**`shiftlog.ack`** — new, `def(['officer'], …)`
- Body: `{id}`.
- Uses `loadEntry`; the entry must be an instruction and the caller must be in `recipients`.
- `INSERT … ON CONFLICT DO NOTHING`. Returns `{ok}`.

**`KINDS`**
- Unchanged, so `shiftlog.add` can't create instructions; `instruct` is the only way.
- `shiftlog.update` keeps rejecting other people's entries.
- `shiftlog.curate` may remove an instruction, which hides it from the officer too.

**`shiftlog.list`**
- Entry counts exclude instructions for the venue: add `AND e.kind <> 'instruction'` to the `entries` count when `user.role === 'venue'`.

### `functions/api/modules/rota.mjs`, `shifts.save` update branch
- If `'notes' in f`, `f.notes !== before.notes`, the shift is published, and `now >= starts_at`:
  - set `notes_updated_at = now()`;
  - `notify(team user ids, {kind:'shift', title:'Shift notes updated', body: notes.slice(0,160), link:`/officer/shifts/${id}`, dedupe:`notes:${id}:${Date.now()/60000|0}`})`.
- Reuse `officerUser`/the team query pattern from `shiftlog.sign`.

### Test: `functions/api/test/instructions.test.mjs`
Covers `recipients` (whole team or one officer), `visibleEntries` (venue sees none, an officer only sees theirs, mgr sees all) and `canSendInstruction` (before the window, live, ended).

## 3. App

### `app/src/pages/shared/Live.jsx`, `Detail` sheet
- Add `<Button variant="primary" icon={ClipboardList} to={`${base}/shifts/${row.shift_id}`} state={{ from: 'live' }}>Open shift card</Button>` above "Review exception".
- Check that `Button` forwards `state`; if it doesn't, use `useNavigate` with an onClick.

### `app/src/pages/shift/ShiftView.jsx`
**`ShiftView`**
- `back` for managers: when `location.state?.from === 'live'`, it's `{to: `/${role}/live`, label:'Live'}`; otherwise Rota as today.
- For managers, render a `Segmented` above the Load with **Manager view | Officer's view**. In Officer's view, add an officer picker (Segmented or a select, from `d.team` entries with a `user_id`) when there's more than one officer.

**`Body`**
- Add a `preview` prop (`{name, user_id}`). When it's set, render as `officer` (`officer = role === 'officer' || !!preview`), with:
  - the banner "This is what <name> sees" (blue soft card), plus "Not started yet" when nobody has clocked in;
  - the content wrapped in `<div inert className="pointer-events-none">`, so every officer button shows but does nothing;
  - instructions filtered client-side as the officer would see them (to that user or to the whole team, not removed).
- Manager view (`me.access === 'mgr'` and no preview):
  - a **Shift chat** button → `/${role}/messages/${d.thread_id}`, plus **Site pack** → `/${role}/venues/${s.venue_id}?tab=pack`;
  - the new `InstructionsCard`.
- Officer (real): the `PinnedInstructions` card goes right after Header, showing unread instructions newest first, each with **Got it** → `shiftlog.ack` then `reload`.
- ReportTiles and SitePackCard fetch officer-only data (`incidents.drafts`, the pack). In preview, render static versions: pass a `preview` flag that skips the fetch, or check that these endpoints return safely for managers. Fall back to a skip flag.

**New components**
- `InstructionsCard` (managers):
  - a Textarea (max 500, with a counter), and recipient select: Whole team (default) or each officer;
  - a **Send instruction** button calling `api('shiftlog.instruct', …)`, toast "Sent to n officers";
  - below it, the instructions sent, each with "Read by n of m" and a tap to expand names and times; unread ones stay highlighted amber.
  - When `!me.can_instruct`, the section shows only the list, with a note on why.
- `PinnedInstructions` (officer): an amber-soft card with the label "From your manager", the text, sender and time, and a Got it button.

**Other changes**
- `KIND`: add `instruction: { label: 'Instruction', tone: 'amber' }`, so instructions show in the log for everyone except the venue.
- `Header`: under `s.notes`, show "Updated hh:mm" when `s.notes_updated_at` is set.

### `app/src/pages/people/_whatsnew.jsx`
New top card:
- November 2026, date '2026-11-06', icon `Megaphone`;
- title "See the live shift card and send instructions";
- points:
  - Open shift card from Live;
  - Officer's view;
  - Send to the team or one officer, with a push;
  - Read by n of m.

## 4. Verify
**Checks**
- `cd functions/api && npm test`: 199 plus the new tests pass.
- `cd app && npm run build`: ui-lint ≤ 67, emergency check OK.

**Mock (`/tmp/mock/server.mjs`)**
- Add `live.board` rows with a `shift_id`, and `shifts.detail` (team of 2, one instruction to the team, one unread).
- Add `shiftlog.instruct` and `shiftlog.ack` (in-memory).

**Browser at 390×844 and 1280**
1. As boss: Live → row → Open shift card → shift page. Back says Live.
2. Toggle to Officer's view: the banner shows, the officer's report tiles and toolbox show, and taps do nothing.
3. Send an instruction to one officer; the list shows Read by 0 of 1.
4. As officer: Home shows the pinned "From your manager" card; Got it removes it; the log shows it as Instruction.
5. As venue: the shift log shows no instruction.

Then `agent-browser close --all`, and stop the mock and Vite.

## 5. Release
- Commit `feat: managers open the live shift card, see the officer's view and send instructions`, with Co-Authored-By. Tag v113.
- Run `openkbs fn deploy api -s 'rate(5 minutes)'` (runs migration 043), then `openkbs site deploy`, then `git push origin master --tags`.
- Live check, read-only: `/app/` returns 200 and the new chunk is referenced. Send no instructions and change no data on live.
