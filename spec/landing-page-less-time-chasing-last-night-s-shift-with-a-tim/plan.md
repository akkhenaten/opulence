# Implementation plan: "Less time chasing last night's shift" time-saved picker

Spec (approved): `spec/landing-page-less-time-chasing-last-night-s-shift-with-a-tim.md`

## Context
The landing page should show venue managers how much time Opulence could save them. The live database has no completed work for October and almost none overall, so company totals can't be shown honestly. Instead, visitors pick their own sites and staff, and the page shows an illustrative estimate.

Scope:
- **Front end only.** No functions, migrations or data exposure.
- **One page file plus the usual What's new card.**

## Files
| File | Change |
|---|---|
| `site/index.html` | New CSS block, new `#savings` section after `#platform`, new JS in the existing IIFE, a small change to the `[data-cover]` click handler |
| `app/src/pages/people/_whatsnew.jsx` | New first card in `UPDATES` (date `2026-11-13`), `Timer` icon added to the lucide import |
| `app/scripts/whatsnew-images.mjs` | New `PROMPTS['landing-time-saved']` |
| `app/public/whatsnew/landing-time-saved.webp` | Generated picture |
| `site/app/**` | App rebuild output |

## 1. Markup: `site/index.html`, between `</section>` of `#platform` (line 401) and `#how` (line 403)
```html
<section class="block" id="savings">
  <div class="wrap">
    <div class="lead" data-reveal>
      <div class="k">For venue managers</div>
      <h2>Less time chasing last night’s shift.</h2>
      <p>A guest asks about something that happened on Saturday night. …(user's copy verbatim)… without searching through messages.</p>
    </div>
    <div class="calc" data-reveal style="--d:.1s">
      <form class="pick" onsubmit="return false">
        <!-- Two .pick-row blocks with the same shape: -->
        <div class="pick-row">
          <label for="c-sites">Sites you run</label>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="One site fewer">−</button>
            <input id="c-sites" type="number" inputmode="numeric" min="1" max="30" value="3">
            <button type="button" data-step="1" aria-label="One site more">+</button>
          </div>
          <input type="range" min="1" max="30" value="3" aria-label="Sites you run" data-for="c-sites">
        </div>
        <!-- Staff row: id c-staff, 1–200, default 20, step 1; steppers ±1 -->
      </form>
      <div class="result">
        <div class="lbl">Estimated hours saved for venue teams</div>
        <div class="big" aria-hidden="true">≈ <b data-out="hours">1.7</b> <span>hours a month</span></div>
        <p class="sub" aria-hidden="true">≈ <b data-out="year">21</b> hours a year · for your <span data-out="sites">3</span> sites and <span data-out="staff">20</span> staff</p>
        <p class="vh" aria-live="polite" data-out="say">Estimated 1.7 hours a month saved for 3 sites and 20 staff.</p>
        <ul class="parts"><!-- 3 rows, each: label · count · minutes -->
          <li><span>Weekly timesheets signed off</span><b data-out="ts">12</b><i data-out="tsMin">60 min</i></li>
          <li><span>Incident reports opened, not chased</span>… <b data-out="inc">4</b> …</li>
          <li><span>Cover requests answered in the portal</span>… <b data-out="cov">12</b> …</li>
        </ul>
        <button class="btn" type="button" data-cover data-calc>Request cover for your <span data-out="sites">3</span> sites</button>
      </div>
    </div>
    <details class="how-est">
      <summary>How we estimate this</summary>
      <!-- A rough figure for the time venue teams spend checking records, retrieving reports and chasing updates. -->
      <!-- Allowances list: 5 min per weekly site timesheet you approve (each site-week once, amendments included); 5 min per incident report you open (repeat views once); 2 min per cover request answered in the portal. -->
      <!-- Planning rates: a 4-week month; one incident report per 5 staff a month; one cover request per site a week. -->
      <!-- Worked example (verbatim): "Example for one venue: four weekly timesheet approvals, six incident reports retrieved and four cover enquiries resolved represent an estimated 58 minutes of management time saved." -->
      <!-- Exclusions: Opulence's own payroll checks, staff chasing and internal admin are not counted. An illustrative estimate, not a measurement or guarantee. -->
    </details>
  </div>
</section>
```
- Default values are rendered in the HTML (3 sites and 20 staff give 12 / 4 / 12, which is 60 + 20 + 24 = 104 min, about 1.7 h a month and 21 h a year). The page therefore reads correctly without JS.
- "sites" is singular when the count is 1 (handled in JS).

## 2. CSS (new `/* Time saved */` block after the Platform block, around line 127)
**Layout**
- `.calc`: a 2-column grid (`1fr 1.1fr`), with `border: 1px solid var(--line)`, `border-radius: 22px` and `background: linear-gradient(180deg, var(--ink-2), var(--ink))`, matching `.pillar`. It has `margin-top: 56px` and padding `clamp(24px, 4vw, 44px)`.
- `.pick-row`: a grid, with `label` styled like `.k` minus the line (muted, 12px uppercase).

**Stepper**
- `.stepper button`: 44×44, round, gold border.
- `.stepper input`: width 88px, centred, serif 28px, with no spin buttons (`appearance: textfield`, plus the webkit pseudo-elements). It overrides the global `input` rule.

**Range slider**
- `input[type=range]`: overrides the global `width/height/padding/border/background` rule (lines 256–258). It gets `height: 28px`, `accent-color: var(--gold)` and a 2px track, with a styled thumb (`::-webkit-slider-thumb` / `::-moz-range-thumb`, 22px gold circle).

**Result**
- `.result .big b`: `font: 500 clamp(56px, 9vw, 104px) var(--serif); color: var(--gold-2); font-variant-numeric: tabular-nums`, so the width doesn't jitter while counting.
- `.parts li`: a 3-column grid with a top `--line` border; the `b` is serif and the `i` is muted.

**Disclosure and helpers**
- `details.how-est`: margin-top 22px.
- `summary`: gold, 14px with letter-spacing, with a custom chevron through `::after` that rotates on `[open]`, and `list-style: none` (plus the `::-webkit-details-marker` hide). Its body is muted at 15px, the `ul` reuses the `.pillar li` dash style, and the worked example is an italic `blockquote` with a gold left border.
- `.vh`: the standard visually-hidden utility (add it; none exists).

**Mobile**
- `@media (max-width: 760px)`: `.calc` becomes 1 column, the result comes after the pickers, and the CTA is `width: 100%`.
- The existing global `prefers-reduced-motion` rule already stops transitions and animations.

## 3. JS (inside the existing IIFE, placed after `countUp` at around line 628)
1. **Factor out the tween:** turn `countUp`'s rAF loop into `function tween(el, from, to, ms, fmt, delay)`. `countUp` calls it with `(b, 0, to, 1200, n => n + (done && plus ? '+' : ''), 350)`, so the hero behaviour is identical.
2. **Calculator:**
   ```js
   var calc = document.querySelector('.calc');
   var W = 4, TS = 5, INC = 5, COV = 2, PER_INC = 5;
   function figures(s, p) {
     var ts = s * W, inc = Math.ceil(p / PER_INC), cov = s * W;
     var min = ts * TS + inc * INC + cov * COV;
     return { ts, inc, cov, tsMin: ts * TS, incMin: inc * INC, covMin: cov * COV, min };
   }
   function hrs(min) { var h = min / 60; return h < 10 ? Math.round(h * 10) / 10 : Math.round(h); }
   ```
   - **Format:** `toLocaleString('en-GB')`, one decimal under 10 hours.
   - **Clamping:** the number input is clamped on `change`/`blur` (with `NaN` resetting to min). The range and number inputs keep each other in sync. Stepper buttons step and clamp.
   - **`render(animate)`:** updates every `[data-out]`.
     - With `motion && animate`, `hours` and `year` are tweened from their current value over 400 ms. Otherwise they are set directly.
     - The `parts` counts are always set directly.
     - `say` is updated through a 500 ms debounce, so screen readers hear only the settled value.
   - **First view:** with `motion`, `hours` and `year` start at `0` (set by JS, so no-JS keeps the defaults). A `once()` observer on `.calc` tweens 0 → value over 1200 ms. It fires once; the observer unobserves.
   - **Without `motion`** (reduced motion or no IntersectionObserver): no tweens anywhere.
3. **Cover CTA prefill:** extend the existing `[data-cover]` click handler (lines 865–871) with:
   ```js
   if (b.hasAttribute('data-calc')) {
     var p = +document.getElementById('c-staff').value, s = +document.getElementById('c-sites').value;
     form.elements.sites.value = p <= 2 ? '1–2' : p <= 5 ? '3–5' : p <= 10 ? '6–10' : '10+';
     if (!form.elements.details.value.trim()) form.elements.details.value = s + (s === 1 ? ' site' : ' sites') + ', about ' + p + ' security staff a week.';
   }
   ```
   - The service select stays on its default. Submission (`demo.request`) is unchanged.

## 4. What's new card (per memory)
- Card: `{ month: 'November 2026', date: '2026-11-13', icon: Timer, image: 'landing-time-saved' }`, with the title "See your time saved on the website".
  - Lede: visitors to the public site choose their sites and staff and see an estimate of the hours Opulence saves their managers each month.
  - Points: the pickers and live breakdown; the "How we estimate this" allowances; Request cover prefilled with their numbers; reduced motion and screen readers respected.
- Prompt: a dark navy desk with a laptop showing a single large gold number and two slim gold sliders, plus a small clock. No text, no faces.
- Run `node app/scripts/whatsnew-images.mjs landing-time-saved`, check the image, then commit the `.webp`.

## 5. Ship
1. `cd app && npm run build`, which runs the lint and checks, then writes `site/app`.
2. `openkbs site deploy`.
3. `git add -A && git commit`, with the feature commit for the page, card and image, and the build commit, following repo style.
4. `openkbs site deploy` again to tag the version.
5. Check that the live bundle still contains `6ij75kpgf7` (memory: site build API address).

## 6. Verification (agent-browser against the live URL; `agent-browser close --all` at the end)
- **Placement:** desktop 1280×800 and mobile 375×812 screenshots of the hero, `#platform` and `#savings`.
  - The section comes straight after the portal, and the hero, strip and portal are unchanged.
  - `document.documentElement.scrollWidth <= innerWidth` on mobile (no horizontal scroll).
- **Formula** (with `eval` on the page): 1/30 gives 58 min (displayed "1"); 3/20 gives 104 min ("1.7"); 30/200 gives `ts 120, inc 40, cov 120`, which is 1040 min ("17").
  - Typing 0, 999 and "" clamps to 1, max and 1.
  - Steppers and the slider stay in sync.
- **Count-up:**
  - Scroll into view: the value goes from 0 to final once.
  - Scroll away and back: no replay.
  - Changing a picker after that runs a short tween.
- **Reduced motion:** run `agent-browser` with `prefers-reduced-motion: reduce` emulation (or set it via CDP). Values are final immediately and `html.anim` is absent.
- **Screen reader:** the accessibility snapshot shows the labelled inputs and the polite live sentence with the final values; the animated digits are `aria-hidden`.
- **CTA:**
  - Click the button at 3/20: the dialog opens with "Officers needed" set to 10+ and details reading "3 sites, about 20 security staff a week." (no submission).
  - The header and hero Request cover buttons still open a blank form.
- **Disclosure:** it opens with the keyboard (Enter on summary) and lists the three allowances, the planning rates, the worked example and the exclusions.
- **Regression:**
  - The "20+" hero count-up still works.
  - The `#clients` tiles load.
  - `/app/` loads.
  - No console errors.

## Handover notes (for the summary)
**Which figures are real:**
- None of the new figures use company records. They are illustrative and computed from the visitor's inputs.
- "20+" is the existing static all-time claim.

**What monthly company totals would need later:**
- A public aggregate action next to `venues.public` (`functions/api/modules/venues.mjs:272`).
- Tracking of a venue's first view of an incident report: a new `incident_views` table written in `incidents.get` (`functions/api/modules/incidents.mjs:209`).
- `cover_requests.decided_at`.
- A service type on shifts.
