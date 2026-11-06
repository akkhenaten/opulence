# Implementation plan: the shift page is the officer's whole shift, Back goes where you came from

Spec: spec/spec-the-shift-page-is-the-officer-s-whole-shift-back-goes-w.md

## Context
Officers open a shift and should find everything for it there, then get back to where they started. Today:
- Back targets are fixed:
  - VenuePack goes to Documents (`VenuePack.jsx:17`).
  - Toolbox goes to Learn (`Toolbox.jsx:21`).
  - ShiftView goes to Shifts (`ShiftView.jsx:41`).
- Handover notes are buried in the log.
- Incident types, drafts and "I can't work this" aren't on the shift page.
- The Clock tab duplicates Home.

Much already exists and is reused:
- `BanSheet` logs an ejection plus a ban inline.
- The incident draft auto-saves (`_draft.js`).
- `DeclineSheet` (`officer/_parts.jsx`).
- `shifts.respond` already allows declining an accepted shift before clock-in (`rota.mjs:402`).
- The log composer has Note / For handover with photos.

## 1. Back to where you came from (`app/src/ui/nav.js`, `app/src/ui/index.jsx` Page)
- **nav.js:** keep a small in-memory stack of `{ key, path, search, title }` per history entry.
  - `useScrollMemory` already sees each location. On PUSH it adds an entry, on POP it moves the index, and on REPLACE it updates the current entry.
  - Page publishes its title to `pageHeader` already. Also record that title into the current stack entry, as a short label: a string title, or a `backLabel` prop for pages whose title isn't a string.
  - Export `previousEntry()`.
- **Page `back`:** when `previousEntry()` exists in this tab (`history.state.idx > 0`), the link shows `‹ {prev.title}` and tapping it calls `nav(-1)`.
  - Otherwise it keeps today's `back.to` and `back.label` as the fallback.
  - Every existing `back` prop keeps working as the fallback, so no page needs editing.
- **Titles are shortened for the label:**
  - Home's greeting becomes "Home".
  - A shift page becomes "Shift". ShiftView passes `backLabel="Shift"`, and officer Home passes `backLabel="Home"`.
- Pages that have no `back` today (top-level tabs) are unchanged.

## 2. Shift page (`app/src/pages/shift/ShiftView.jsx`)

### Handover block
A new `HandoverBlock`, placed right after Header and QuickActions, with the `ArrowRightLeft` icon (lucide) in a blue icon tile. Its parts:
- **Left for you:** `d.previous_handover` (text, signed by, date) plus its photos. The previous-handover block (:76-83) moves into it.
- **Your notes for the handover:** this shift's `entries` where `kind === 'handover'`, as compact rows with thumbnails.
- **Add handover note:** a button that scrolls to the log composer and sets its kind to `handover`.
  - To do this, lift the composer's `kind` state into `LogSection` via a ref or callback, and focus the textarea.
- The signed-off banner stays as it is.

### API (`functions/api/modules/shiftlog.mjs:122`)
The previous handover also returns `photos`: the photos of that shift's `handover` entries.
```sql
SELECT COALESCE(jsonb_agg(p), '[]') FROM shift_log_entries e, jsonb_array_elements(e.photos) p
WHERE e.shift_id = prev.shift_id AND e.kind = 'handover'
```
Run it through `signFiles`.

### Incident tiles
A new `ReportTiles`, which replaces the Report incident button in QuickActions.
- A grid of 5 `Pressable` tiles:
  - Ejection / refused entry (`ejection`)
  - Injury / first aid (`medical`)
  - Damage (`damage`)
  - Theft (`theft`)
  - Other (`other`)
- Each goes to `/officer/incidents/new?shift=ID&type=X`.
- Outside the window (from 1 hour before the start until 30 days after the end, the existing `started`/`window` logic in QuickActions), the tiles are disabled with the caption "Opens 1 hour before the shift" or "Reporting closed after 30 days".
- **Draft reminder:** `useApi('incidents.drafts')` filtered by `shift_id === s.id`, shown as an amber row "Draft report: carry on · saved HH:MM" linking to `/officer/incidents/new?draft=ID`.
- **Log ejection:** keep the button next to the tiles (`BanSheet`, as now). Shift chat stays.

### IncidentForm `?type=` (`app/src/pages/officer/IncidentForm.jsx`)
For a new report with no draft, `type` starts from `sp.get('type')` if it is a valid `INCIDENT_TYPES` value. This is applied in the Wizard's initial `v`.

### Can't work this
- On the shift page, in Header for an accepted officer who hasn't clocked in and whose shift hasn't started, a ghost button reads "I can't work this" and opens `DeclineSheet`.
- After the decline, navigate to `/officer`.

### Clock in on the shift page
- The Header clock row stays (it is hidden in live mode), but uses `CLOCK_EARLY_MIN` from `officer/_parts.jsx` so it shows "Clock in" only from 15 minutes before.
- Otherwise it reads "Clock-in opens at HH:MM".

## 3. DeclineSheet: under-24h rule (`officer/_parts.jsx`, `rota.mjs`)
- **DeclineSheet:** when the shift starts in under 24 hours, show an amber callout: "This is short notice. Please call the office as well", plus a `tel:` button if `office_phone` is set.
- `office_phone` comes from `shifts.detail` and `dashboard.get` (officer). Add `company_phone` from settings, read with the same settings helper `settings.mjs` uses.
- **`shifts.respond`:**
  - Notify with `severity: 'urgent'` when the shift starts in under 24 hours.
  - Email when under 48 hours (unchanged).
  - Add "(shift lead)" to the body when `a.is_lead`.
- **Home confirmed hero:** add a ghost "I can't work this" link to the DeclineSheet.

## 4. Confirmed shift opens the shift page
- **Home** (`officer/Home.jsx`): the hero tile itself becomes a link to `/officer/shifts/:id`. Use the `Tile` `to` prop, keeping the inner buttons working by stopping propagation; or wrap the header area in a `Link`.
- **Shifts list:** accepted cards already have `to`. Check that they link to the shift page.

## 5. Bottom bar without Clock (`app/src/layouts/nav.js:104`)
- Remove `tab: true` from the Clock entry. The route stays.
- The Shell renders 4 tabs automatically (`Shell.jsx:217`). Check the bar layout with 4 items and no `primary`.
- **Reaching Clock:**
  - the Home hero "Clock in",
  - the LiveBar "Clock out" / "End break",
  - the ShiftView Header,
  - the Shifts page, which gets a "Clock history" link in its header actions to `/officer/clock`.
- Grep for other references to the Clock tab (guide text in `functions/api/lib/guide.mjs`, the help pages) and update the wording to "Clock in from the shift card on Home".

## 6. What's new and memory
- A new card at the top of `UPDATES` in `app/src/pages/people/_whatsnew.jsx`:
  - date '2026-11-06', icon `ArrowRightLeft` (import it), title "Everything for the shift, on the shift".
  - Points:
    - Back takes you to where you came from
    - Handover notes inside the shift
    - One tap to start a report by type, and your draft is waiting
    - Can't make it? Say so from the shift
    - Clock in from Home

## Tests (`functions/api/test/`)
- Pure helper `shortNotice(startsAt, now)` in rota.mjs (under 24h), with unit tests at 23h and 25h.
- Back-stack logic in nav.js is a pure reducer `stepStack(stack, idx, {type, entry})`. It is unit-tested only if app tests exist; otherwise verify it in the mock.

## Checks and ship
- `cd app && npm run build`: ui-lint must stay at 67 or below.
- `cd functions/api && npm test`.
- **Mock** (`/tmp/mock`, ROLE=officer):
  - Add `incidents.drafts` with a draft for s1.
  - Add `previous_handover` with photos and handover entries to `shifts.detail`.
  - Add `company_phone` / `office_phone`.
- **Screenshots at 390 and 1440:**
  - the shift page (Handover block, tiles, draft row, can't-work),
  - the Home → Shift → Site pack → Back path, which must land on the shift page with the label "‹ Shift",
  - the 4-tab bar,
  - the DeclineSheet when under 24h.
- `agent-browser close --all`, then stop the servers.
- Commit "feat: the shift page holds the whole shift, Back goes where you came from" (with the Co-Authored-By line), including the spec.
- Deploy and push:
  1. `openkbs fn deploy api -s 'rate(5 minutes)'`
  2. `openkbs site deploy`
  3. `git push origin master --tags`
- Read-only live check: the bundle contains the new strings, and the API answers 401.
