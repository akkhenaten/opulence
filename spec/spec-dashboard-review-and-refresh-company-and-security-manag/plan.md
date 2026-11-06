# Implementation plan: Dashboard refresh

Spec: spec/spec-dashboard-review-and-refresh-company-and-security-manag.md

## 1. Number font (app-wide), in `app/src/styles.css:102`
- Change `.num { font-variant-numeric: tabular-nums; }` to `font-variant-numeric: lining-nums tabular-nums;`.
- Also add `.display { font-variant-numeric: lining-nums; }`, so big display numbers without `.num` are fixed too.
- The `[data-style="control"]` mono rule stays as it is.

## 2. Slim photo header, in `app/src/ui/index.jsx` (Page)
- Add a `slim` prop. With a photo, the inner box uses `sm:min-h-[120px]` instead of `sm:min-h-[180px]`. Other pages are unaffected.

## 3. API: `functions/api/modules/dashboard.mjs` (managerDash)
- Add `shiftsWeek` to the `Promise.all`:
  ```sql
  SELECT count(*)::int AS n FROM shifts s WHERE s.status = 'published'
    AND (s.starts_at AT TIME ZONE 'Europe/London')::date BETWEEN $2 AND $2::date + 6 AND <scoped s.venue_id>
  ```
  It takes the params `[scope, weekStart]`, the same as hoursWeek. Add it to `out.counts`.
- Add `counts.shiftsWeek` to the mock's `dashboard.get` in /tmp/mock/server.mjs.

## 4. `app/src/pages/manager/Dashboard.jsx` (rewrite of Body, plus the header)

**Header**
- `<Page … photo="door" slim actions={everydayButton} subtitle={summary}>`.
- The Everyday button (with its unread badge) moves into `actions`, so it no longer takes its own row.
- `summary` is built in a `summaryLine(d)` helper: `dayLabel` · "N on site" (when there is live data) · "N things need you" or "all clear".
  - The data comes from `useApi` q, so `Body` and the header share `q.data`. Use `q.data` when present, otherwise just the date.

**Helpers** (local)
- `TileLink({ to, children, light })`: the "… ›" link markup that is currently copied 4 times. `light` covers the dark Live tile.
- `NEEDS`: an ordered array of `{ key, to, icon, tone, one, many }`. The order:
  1. exceptions (red)
  2. unfilled (red, "in the next 7 days")
  3. disputed (red)
  4. openIncidents (amber)
  5. pendingCover (amber)
  6. toApprove (blue)
  7. requests (blue)
  8. timeOff (amber, company only, at `/company/hr/time-off`)
  
  The links are the same as the current CountTiles. Wording uses `one` / `many`, e.g. "1 timesheet to approve" and "3 timesheets to approve".
- `NeedsYou({ c, base, isCompany })`:
  - A `Tile` titled "Needs you", with rows only where the count is above 0. Each row is a `Link`: a coloured icon chip, the sentence, and ›, styled like the existing incident rows (`divide-y`, `px-5 py-3`).
  - Empty state: a green `CheckCircle2` and "All clear, nothing needs you right now."
- Remove `CountTile`.

**Layout** (Bento rows)

| Row | Contents |
|---|---|
| 1 | `Live now` (ink, `col-span-2`, with no `row-span-2`; the no-alerts state becomes a single line) and `NeedsYou` (`col-span-2`) |
| 2 | `Tonight & tomorrow`, the renamed Upcoming shifts (`col-span-2`), and Recent incidents (`col-span-2`) |
| 3 (company) | Compliance (`col-span-2`) and Staff pipeline (`col-span-2`) |
| 4 | `ThisWeek` strip (`col-span-full`) |

- **Row 2, Tonight & tomorrow:**
  - Shifts are sorted with short ones first, keeping time order within each group.
  - A header line under the title: "8 shifts · 1 short · 2 unconfirmed", built from `confirmState`.
- **Row 3, Compliance:** both columns get the same header pattern, a number and a label:
  - "Can't work", with the number red when above 0 and green at 0.
  - "Expiring in 60 days", with the number in amber when above 0.
- **Row 3, Staff pipeline:** labels use `text-caption2 whitespace-nowrap`, and the grid is `grid-cols-3`. "Onboarding" becomes "Onboard" on phones only if it still breaks; check at 390.
- **Row 4, ThisWeek:**
  - A `Tile tone="soft" title="This week"`, with a grid of `Stat`s: Hours (`hours(d.hoursWeek)`, "Since Monday") and Shifts (`c.shiftsWeek`).
  - When `d.money` exists, add Invoiced this month and Outstanding. Outstanding's hint shows "£X overdue" in red when there is overdue money, otherwise "N invoices".
  - The grid is `grid-cols-2 sm:grid-cols-4`, and it links to invoices for company users.
  - This removes the separate Hours tile (both role branches) and the Money tile.
- **InstallCard:** it stays where it is, below the header.
- Check whether `Bento`'s column count suits `col-span-full`. If not, use `col-span-2 lg:col-span-4`.

## 5. Ship
- Add a What's new card at the top of `UPDATES`:
  - `date: '2026-11-06'`, `icon: LayoutGrid`, title "A Dashboard that tells you what matters"
  - Points:
    - 'A Needs you list with only what's waiting, most urgent first'
    - 'A one-line summary under your greeting'
    - 'Tonight's cover at a glance, short shifts first'
    - 'Hours, shifts and money for the week in one strip'
    - 'Clearer numbers across the app'
- Checks: `cd app && npm run build` (ui-lint 67 or below), then `cd functions/api && npm test`.
- Commit `feat: Dashboard refresh: Needs you, summary line, This week strip, clearer numbers` (with the Co-Authored-By line).
- Deploy and push:
  1. `openkbs fn deploy api -s 'rate(5 minutes)'`
  2. `openkbs site deploy`
  3. `git push origin master --tags`

## Verification
- **Mock** (/tmp/mock with vite on 5174), screenshots at 1440 and 390:
  - **Quiet day:** the current zeros. You see "All clear", the summary says "all clear", and the phone page is much shorter.
  - **Busy day:** temporarily edit the mock's dashboard counts so several are above 0, add 2 alerts, and add shifts that are short or unconfirmed. Check the order of the Needs you list, the wording (one versus many), the shift header line, and that short shifts come first.
  - **ROLE=security:** no Compliance or Staff, no money in This week, and no time-off row.
  - Zeros now look like zeros (also on Live and Invoices). Check the dark theme.
- **Local PGlite:** run `dashboard.get` to check `shiftsWeek` returns a number.
- Then `agent-browser close --all` and stop the servers.
- **Live, after deploy (read-only):** the bundle contains "Needs you", and the API answers.
