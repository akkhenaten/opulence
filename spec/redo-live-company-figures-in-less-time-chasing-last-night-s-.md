# Redo: live company figures in "Less time chasing last night's shift"

## Context
The user didn't want a visitor picker. They want the page to show Opulence's own scale and what it saves venues:
- **Venues:** live from the database, currently 24 active.
- **Security staff:** live, currently 17 active officers.
- **Hours saved for venues per year:** worked out from those two counts with the agreed allowances, about 138 hours a year.
- **Money saved per year (added by the user):** hours × an average hourly rate plus employer NI.

The numbers animate up when they scroll into view, and they stay live: they change by themselves as venues and staff are added or removed in the app.

## Figures (computed server-side; the page receives only totals)
**Counts**
- `venues` = `count(*) FROM venues WHERE active`, currently 24.
- `staff` = active officers whose login isn't disabled: `officers o JOIN users u ON u.id = o.user_id WHERE o.status = 'active' AND u.status <> 'disabled' AND NOT u.system`, currently 17. Invited officers who haven't signed in yet still count, because they are real staff.

**Allowances (per month, using a 4-week month)**
- Timesheets: venues × 4 × 5 min.
- Incident reports: ceil(staff ÷ 5) × 5 min.
- Cover requests: venues × 4 × 2 min.

**Hours per year**
- `hoursYear` = round(12 × monthly minutes ÷ 60). Today that is 24/17 → 692 min/month → **138 h**.

**Money per year**
- `moneyYear` = hoursYear × £15.00 average manager hourly rate × 1.15 (15% employer NI), rounded to the nearest £10. Today that is 138 × 17.25 = £2,380.5, shown as **£2,380**.
- **Assumption, easy to change:** £15/h. The user gave no figure; it is roughly a UK venue duty manager's wage. It is a constant at the top of the stats code and is shown in the disclosure.

## Changes
### 1. API: `functions/api/modules/venues.mjs`
In the existing public `venues.public` action (line 272), add one `stats` field next to `tiles`, so the page makes no extra request:
- Two `one()` count queries run in the existing `Promise.all`.
- A small `venueStats(venues, staff)` helper holds the named constants (`WEEKS = 4, TS_MIN = 5, INC_MIN = 5, PER_INC = 5, COV_MIN = 2, RATE = 15, NI = 0.15`).
- It returns `{ venues, staff, hoursYear, moneyYear, rate: RATE, ni: NI }`.
- It returns counts only: no names or IDs.
- Deploy with `openkbs fn deploy api`.

### 2. Page: `site/index.html`, section `#savings`
**Removed**
- The picker form, the result block, the per-row breakdown, their CSS (`.pick`, `.stepper`, range styles, `.parts`, `.result`), and the picker JS (`figures/sync/render`, steppers) together with its prefill in the `[data-cover]` handler.
- The header, hero and other Request cover buttons go back to how they were before.

**Kept**
- The `.k`, the heading, the story paragraph, the CTA (a plain "Request cover" `data-cover` button), and `.vh`.

**New: four figure cards** in a `.figs` grid
- The user asked for three cards, plus a money figure. A fourth card keeps each number clean.
- Desktop: 4 columns. ≤920px: 2×2. ≤420px: 1 column.
- Style: the `.pillar` card look, a serif `lining-nums tabular-nums` number in `--gold-2`, a small uppercase label, and a muted footnote line.
  1. **24**, "Venues we protect", footnote "Live from our rota".
  2. **17**, "Security staff", footnote "Active officers on our books".
  3. **138**, "Hours saved for venue teams a year", footnote "Timesheets, reports and cover, without the chasing".
  4. **£2,380**, "Saved for venues a year", footnote "At £15 an hour plus employer NI".
- A `.live` pulsing dot (the existing portal class) with the label "Live figures · updated [day month]". The date comes from the response time.

**No-JS and fetch failure**
- The HTML holds today's values, so the page reads correctly without JS.
- If the fetch fails, the cards keep those numbers and the "Live" label is hidden.

**Disclosure**
- "How we estimate this" is kept and updated:
  - The three allowances.
  - The planning rates (4-week month, one incident report per 5 staff a month, one cover request per venue a week).
  - "£15 an hour average manager rate plus 15% employer National Insurance".
  - The worked example, verbatim.
  - The exclusions (Opulence's own payroll and admin).
  - "Venue and staff numbers are live from our system; hours and savings are estimates."

### 3. JS
- **Data:** in `loadVenues()`'s `.then`, pass `d.stats` to `showStats(stats)`. It stores the targets in `data-to` on each number and fills the footnotes and date.
- **Count-up:**
  - Reuse `tween()` and `once()`. The cards count up from 0 over 1400 ms, staggered by 120 ms, when the section enters view, and only once.
  - If the data arrives after the section is already in view, the count-up starts on arrival.
  - Money is formatted `'£' + n.toLocaleString('en-GB')`.
- **Reduced motion or no IntersectionObserver:** values are set directly.
- **Screen readers:** each card is `<article aria-label="24 venues we protect">`, updated with the final value, and the animated digits are `aria-hidden`.

### 4. What's new
- Rewrite the 2026-11-13 card that hasn't been seen yet, rather than adding another card for the same day.
  - Title: "Your website shows what you save venues".
  - Points: live venue and staff counts, hours and money saved a year, How we estimate this.
- Regenerate its picture with a new prompt (four gold figure cards on a laptop, a brass clock and coins; no text).

## Progress so far (paused when plan mode re-opened)
- Done: API `stats` in `venues.public`. It is deployed and live returns 24 / 17 / 138 / £2,380. Not committed yet.
- Done: the `#savings` CSS swapped to `.figs` / `.fig`.
- Done: the `#savings` markup swapped to the four cards, the live line, the Request cover button and the rewritten "How we estimate this". The numbers are in `data-stat` spans, with today's values as the fallback.
- Remaining:
  - Replace the picker JS (`site/index.html` ~692–744) with `showStats` / `play`.
  - Call `showStats` from `loadVenues`.
  - Drop the `data-calc` branch.
  - Rewrite the What's new card and its picture.
  - Build, commit, deploy and verify.

## Technical notes (exact anchors)
**API: `functions/api/modules/venues.mjs:272`**
- Add `one()` to the existing `Promise.all`:
  ```js
  one("SELECT (SELECT count(*) FROM venues WHERE active)::int AS venues, (SELECT count(*) FROM officers o JOIN users u ON u.id = o.user_id WHERE o.status = 'active' AND u.status <> 'disabled' AND NOT u.system)::int AS staff")
  ```
- Return `stats: venueStats(counts)`. `venueStats` sits as a module-level helper above `actions`.
- `one` is already importable from `../lib/db.mjs`; add it to the import if it's missing.

**Page: `site/index.html`**
- Replace the CSS block from the "Time saved" comment (line 129) up to the line before `/* Steps */`. Keep `.vh` and `.how-est*`; add `.figs`/`.fig`.
- Replace the `.calc` markup (around lines 451–484) with `.figs` plus the live line plus the CTA. Rewrite the `.how-est` body.
- Replace the picker IIFE block (from line 734 to the end of `if (calc) {…}`) with:
  - `var figs = document.querySelector('.figs'), seen = !motion, stats = null;`
  - `function play()`, which tweens each `[data-to]` once, when `seen && stats` are both true.
  - The `once()` observer sets `seen = true` and then calls `play()`.
  - `window.showStats = …` is not needed: `showStats` is a local function called from `loadVenues`.
- `loadVenues` (line ~1000): call `showStats(d.stats)` first thing in `.then`, before the tile code, so it still runs if the tiles throw `'no tiles'`.
- Remove the `data-calc` branch in the `[data-cover]` handler (line ~1027).

## Ship
1. `openkbs fn deploy api`.
2. `cd app && npm run build`.
3. Commit the feature, then the build.
4. `openkbs site deploy` (version tag).
5. Check that the live bundle still contains `6ij75kpgf7`.

## Verification
- **API:** a `curl` POST of `{action:'venues.public'}` returns `stats` = `{venues:24, staff:17, hoursYear:138, moneyYear:2380, …}` and contains no names.
- **Live updating:** read-only SQL counts match the API.
- **Browser** (local, then live; agent-browser):
  - Desktop 1280 and mobile 375 screenshots.
  - The cards count up once on scroll, with no replay.
  - Reduced-motion emulation shows the final values at once.
  - The accessibility snapshot shows the card labels with the final values.
  - No horizontal scroll and no console errors.
  - The `#clients` tiles and the hero "20+" still work, the Request cover button opens the form, and `/app/` loads.
- **Close the browser:** run `agent-browser close --all` at the end.

## Handover
**What the figures are based on**
- Real records: the venue and staff counts.
- Estimates: hours and £, from your allowances, the planning rates and £15/h + 15% NI.

**Before going further**
- Ask the user to confirm the £15/h rate.
- Note the hero "20+ venues" against the live 24, which the user may want to align.
