# Landing page: "Less time chasing last night's shift" with a time-saved picker

## Context
The page at opulence.orbsolutions.co.uk is aimed at venue owners, hotel GMs and duty managers weighing up Opulence for cover. The original brief asked for monthly company totals (sites, officers, hours) worked out from records. A read-only check of the live database found that this can't be shown honestly yet:
- **October 2026 (the latest complete month):** no completed shifts.
- **All time:** 6 shifts, all in November: 4 cancelled, 2 worked by 1 officer at 1 venue (15 signed hours).
- **Venue activity:** none. No timesheets signed by venue users, no incident reports, no cover requests from venues.
- **Missing records:** nothing records a venue's first look at an incident report, and shifts carry no service type.

The user then set the direction: **the landing page is a shop front, so give visitors a picker.** They choose how many sites and staff they have and see how much time Opulence could save them. So the figures are illustrative estimates from the visitor's own numbers:
- No company totals are published.
- No server code or new data is exposed.

## What changes (all in `site/index.html`, which is hand-edited with inline CSS and JS)

**Unchanged:** the hero, the proof strip (20+, Edinburgh & Glasgow, Winner, Live), the black-and-gold styling, the portal example and the Request cover dialog. The user didn't answer the strip question, so the strip stays as it is. Its "20+" figure is a separate, all-time measure and keeps its current count-up.

### 1. New section `#savings`, right after `#platform` (which holds the portal example, ending at about line 401) and before `#how`
- **Eyebrow and heading:** a `.k` eyebrow ("For venue managers"), then the h2 "Less time chasing last night's shift." with the existing `.lead h2::after` gold underline.
- **Story paragraph:** the user's suggested copy, word for word ("A guest asks about something that happened on Saturday night…").
- **Picker card** (`--ink-2` panel, gold accents), with two inputs. Each is a native `<input type="range">` paired with a − / number / + stepper for mobile and keyboard, and has a visible `<label>`:
  - **Sites you run:** 1–30, default 3.
  - **Security staff on a typical week:** 1–200, default 20.
- **Result:** one large figure, "≈ **X** hours a month", labelled **"Estimated hours saved for venue teams"**.
  - Sub-line: "≈ Y hours a year · based on your [sites] sites and [staff] staff".
  - The original "Across our client venues · [month]" line is replaced by the visitor's own scope, because the figure is now theirs, not company-wide.
- **Breakdown** (three small rows that update live, each with a count, the minutes, and an animated number):
  - Weekly timesheets signed off in the portal: `sites × 4` site-weeks × 5 min.
  - Incident reports opened instead of chased: `ceil(staff ÷ 5)` × 5 min.
  - Cover requests answered in the portal: `sites × 4` × 2 min.
  - Total minutes ÷ 60, rounded to one decimal (whole hours from 10 up).
- **Check:** 1 site with 30 staff gives the user's worked example, 4 + 6 + 4 = **58 minutes**. The worked-example sentence is shown in the disclosure as the reference case.
- **"How we estimate this"**, a `<details>`/`<summary>` element (new small style, gold chevron):
  - It uses rough allowances for checking records, retrieving reports and chasing updates. It lists the three allowances above, plus the planning rates: a 4-week month, one incident report per 5 staff a month, and one cover request per site a week.
  - It states that Opulence's own payroll checks, staff chasing and internal admin are excluded, and that the figure is an illustrative estimate, not a guarantee and not a measurement.
- **CTA:** a `.btn` "Request cover for your [n] sites" with `data-cover`, reusing the existing dialog. On open, it:
  - Presets the existing `sites` select (labelled "Officers needed") from the staff picker: 1–2 / 3–5 / 6–10 / 10+.
  - Puts a prefilled line in `details` ("[n] sites, about [m] staff a week") if `details` is empty.
  - Leaves submission unchanged (`demo.request`).

### 2. Behaviour (inline script, reusing the existing helpers)
- **First count-up:** reuse `once()` (the IntersectionObserver helper, lines ~589–593) and the same ease-out-cubic tween as `countUp` (lines ~614–628), split into a small `tween(el, to)` helper so the strip and the new section share it.
  - The result counts up from 0 to the default once, when the section enters view.
  - After that, picker changes run a short (~400 ms) tween from the current value.
- **Reduced motion:** when `html.anim` is absent (which covers reduced motion and missing IntersectionObserver), values are set immediately. The global reduced-motion CSS switch already covers transitions.
- **Screen readers:**
  - Animated numbers are `aria-hidden`.
  - A visually hidden `<p aria-live="polite">` carries the final sentence ("Estimated 1.7 hours a month saved for 3 sites and 20 staff"). It updates only after input settles (debounced ~500 ms), not on every frame.
  - The no-JS fallback is the default values rendered in the HTML.
- **Mobile:**
  - At ≤760px the picker and result stack.
  - Steppers have ≥44px tap targets and the big figure scales with `clamp()`.
  - Check at 375px and 430px.

### 3. What's new card (per memory)
- Add a card at the top of `UPDATES` in `app/src/pages/people/_whatsnew.jsx` with `date: '2026-11-13'`.
- Add a prompt in `app/scripts/whatsnew-images.mjs`, run `node app/scripts/whatsnew-images.mjs <slug>`, check the image and commit the `.webp`.
- Rebuild the app (`site/app/`).

## Not built (for the handover)
Monthly company totals are left out on purpose: the records don't support them yet. If they're wanted later, the work is:
- A public aggregate action next to `venues.public` (`functions/api/modules/venues.mjs:272`) using the London-time month SQL from `modules/analytics.mjs`.
- For "first accessed by the venue": a new `incident_views` record written in `incidents.get` (`modules/incidents.mjs:209`).
- For "resolved cover enquiries": a `decided_at` on `cover_requests`; today the decision time is only in `audit_log`.
- A service type on shifts before using "Manned guarding hours".

## Ship
1. Build the app (`cd app && npm run build`).
2. `openkbs site deploy`.
3. Commit (feature plus What's new card plus build).
4. Redeploy to tag the version.

## Verification (agent-browser, then `agent-browser close --all`)
- **Desktop 1280 and mobile 375:**
  - The section sits directly after the portal example.
  - The hero, strip and portal are unchanged.
  - The section shows no horizontal scroll.
- **Count-up:** runs once on scroll-in and doesn't replay when scrolling back.
- **Reduced motion:** with `--reduced-motion` emulation (or a media override), the final values show at once.
- **Formula:**
  - 1 site / 30 staff shows 58 min (≈1.0 h).
  - Range ends 1/1 and 30/200 behave.
  - Typed out-of-range values are clamped.
- **Screen reader:** the accessibility snapshot shows the live sentence with final values, and the animated digits are hidden.
- **CTA:**
  - It opens the existing dialog with the select and details prefilled.
  - A test submission isn't needed; the submit code is unchanged.
  - The existing header and hero Request cover buttons still work.
- **Regression:**
  - The `#clients` tiles still load.
  - `/app/` still loads.
  - No console errors.
