# Implementation plan: live company figures in "Less time chasing last night's shift"

## Context
The visitor picker (v192) was the wrong idea. The user wants `#savings` to show Opulence's own scale in four cards that count up as they come into view:
- Venues (live)
- Staff (live)
- Hours saved for venues a year
- £ saved a year, at £15/h plus 15% employer NI

The spec is saved in `spec/redo-live-company-figures-in-less-time-chasing-last-night-s-.md`.

## Already done (working tree, uncommitted)
- **`functions/api/modules/venues.mjs`:** the `venueStats()` helper and `SAVE` constants, plus a counts query in the `venues.public` `Promise.all`. It returns `stats: { venues, staff, hoursYear, moneyYear, rate, ni }`. Deployed; live returns 24 / 17 / 138 / 2380.
- **`site/index.html` CSS:** the picker CSS is replaced by `.figs` / `.fig` / `.figs-foot`. `.vh` and `.how-est*` are kept.
- **`site/index.html` markup:** the `.calc` block is replaced by `.figs`:
  - Four `<article class="fig" aria-label="…">` cards. Each has an `aria-hidden` `<b data-stat="venues|staff|hoursYear|moneyYear">` holding today's value as the fallback, plus an h3 and a p.
  - The £ footnote has `<span data-stat-rate>`.
  - `.figs-foot` holds a hidden `.live` label with `<span data-stat-at>` and a plain `data-cover` Request cover button.
  - "How we estimate this" is rewritten to cover the live counts, the allowances, the planning rates, £15/h + 15% NI, the verbatim example and the exclusions.

## Remaining changes

### 1. `site/index.html` script
- **Replace the picker block** (from `// Time saved: the visitor's sites…` to the closing `}` of `if (calc) {…}`, around lines 692–744). Reuse the existing `tween()` and `once()`. The new block:
  ```js
  // What we save venues: live counts from the app, counted up once as the cards come into view
  var figs = document.querySelector('.figs'), seen = !motion, stats = null, played = false;
  var money = function (n) { return '£' + Math.round(n).toLocaleString('en-GB'); };
  var fmtStat = function (k, n) { return k === 'moneyYear' ? money(n) : Math.round(n).toLocaleString('en-GB'); };
  ```
  - **`showStats(s)`:**
    - Return if `figs` or `s` is missing.
    - For each `[data-stat]`: skip non-finite values; otherwise set `data-to`, set the parent card's `aria-label` (for example "24 venues we protect", "About 138 hours saved for venue teams a year", "About £2,380 saved for venues a year"), and set the text to 0 when motion is on and the count-up hasn't played yet, or to the final value otherwise.
    - Fill `[data-stat-rate]` with `money(s.rate)`.
    - Set `[data-stat-at]` to today, formatted `en-GB` `{ day:'numeric', month:'long' }`.
    - Unhide `.live`.
    - Call `play()`.
  - **`play()`:**
    - Run only when `seen && stats && !played && motion`.
    - Set `played = true`.
    - Tween each `[data-to]` from 0 over 1400 ms with a staggered delay of `i*120`, using `fmtStat`.
  - **Observer:** `var fo = once(function () { seen = true; play(); }); if (fo && figs) fo.observe(figs);`
  - **Before the data arrives,** the cards keep their fallback numbers (no zeros flash). If the fetch fails they stay as they are and the Live label remains hidden.
- **`loadVenues`:** the first line of `.then(function (d) {` becomes `showStats(d && d.stats);`. It goes before the tiles code so that the `no tiles` throw can't skip it.
- **`[data-cover]` handler:** delete the `data-calc` branch (around lines 984–989).

### 2. What's new: `app/src/pages/people/_whatsnew.jsx`
Rewrite the existing 2026-11-13 card in place rather than adding a second card for today:
- **Icon:** keep `Timer`.
- **Title:** "Your website shows what you save venues".
- **Image:** `landing-figures`.
- **Lede:** the public site now shows how many venues Opulence protects and how many officers are on its books, live from the app, plus the hours and money that saves venue teams each year.
- **Points:**
  - Four gold figure cards after the venue portal example: venues, security staff, hours saved a year, £ saved a year.
  - Venue and staff numbers update by themselves as venues and officers are added in the app.
  - Hours come from the allowances for timesheets, incident reports and cover. Money uses £15 an hour plus employer NI.
  - How we estimate this lists every assumption.
  - The numbers count up once, stay still for visitors who reduce motion, and read out in full to screen readers.

### 3. Picture: `app/scripts/whatsnew-images.mjs`
- Replace the `'landing-time-saved'` prompt with `'landing-figures'`: "A laptop on a dark navy desk showing a calm web page with four slim dark cards in a row, each holding one large glowing gold figure, a small brass desk clock and a short stack of gold coins beside the laptop, a fountain pen, warm lamp light, dark navy and gold."
- Run `node app/scripts/whatsnew-images.mjs landing-figures`.
- View the resulting `.webp`.
- Delete the now-unused `app/public/whatsnew/landing-time-saved.webp` if nothing else references it (check with grep first).

### 4. Build and ship
1. `cd app && npm run build`. Then grep `site/app` to confirm `6ij75kpgf7` is present and `hopedp5` is absent.
2. Commit 1 (feat): `venues.mjs`, `site/index.html`, `_whatsnew.jsx`, `whatsnew-images.mjs` and the image. Commit 2 (build): `site/app`. The spec file goes into the feat commit.
3. `openkbs site deploy`, with a clean tree so it gets the version tag. Then `openkbs fn deploy api` to tag the function at the same commit (the code is unchanged).

## Verification
- **API:** curl the `venues.public` POST. `stats` should be 24 / 17 / 138 / 2380, with no names in `stats`. Compare with read-only psql counts.
- **Local browser** (`python3 -m http.server 8765` in `site/`, agent-browser, 1280 and 375 widths):
  - Scrolling to `#savings` counts the cards up once; scrolling away and back doesn't replay them.
  - The Live label shows today's date.
  - The 2×2 / 1-column layouts work, with no horizontal scroll and no console errors.
- **Reduced motion** (`set media dark reduced-motion`): the final values show immediately.
- **Accessibility snapshot:** the articles read as "24 venues we protect", and so on.
- **Regression checks:**
  - The `#clients` tiles still load.
  - The hero "20+" still counts up.
  - Request cover opens the dialog with no prefilled numbers.
  - `/app/` loads, and What's new shows the new card and picture.
- **Repeat on the live site** after the deploy.
- **Close the browser:** `agent-browser close --all`.

## Handover notes for the user
- **Live vs estimated:** the counts are real records; the hours and £ are estimates.
- **Rate:** ask the user to confirm £15/h.
- **Hero mismatch:** the hero still says "20+ venues" while the live count is 24.
- **Four cards:** there are four cards rather than three because of the money figure.
