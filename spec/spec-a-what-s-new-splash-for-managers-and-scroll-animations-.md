# Spec: a What's new splash for managers, and scroll animations on the landing page

## Context
The client wants each upgrade to be noticed, not only kept in Audit → What's new. Right now the cards are only seen by someone who opens that tab. The public landing page already has one soft "rise up" entrance for sections (`site/index.html:257-262`, `:830-839`). The user wants more life on it: cards gliding in from the sides as you scroll, plus a few other recommended effects.

## 1. What's new splash on login

**Who sees it:** company and security managers (the user's answer). Officers and venue users never see it.

**When it shows (assumed default, change if wanted):**
- It shows when the app opens, for **2 days after a release**.
- Once the manager taps **Got it**, it stays away until the next release.
- Each person dismisses it separately, on each device. The "seen" state is kept in the browser's storage under `orb.whatsnew.seen.<userId>`, so no database change is needed.
- After 2 days it stops on its own, even if nobody dismissed it.
- It never shows over the sign-in, apply or public pages, and never over another open sheet. It waits about 1 second after the app loads.

**What it shows:**
- A centred sheet (bottom sheet on phones) with a gold header: "What's new", plus the release month.
- The cards released in the last 2 days, newest first, at most 3. Each card has its icon, title, lede and points, in the same style as the What's new tab.
- Two buttons:
  - **Got it**
  - **See every upgrade** → `/company/audit?tab=new`. Company only, because security managers have no Audit log.
- If there's more than one card, they can be swiped through or scrolled.
- With reduced motion turned on, it appears without the animation.

**Data:**
- Each new `UPDATES` card in `app/src/pages/people/_whatsnew.jsx` gets a `date: 'YYYY-MM-DD'` field. That is its release day.
- Cards without a date never trigger the splash.
- Today's top card(s) get `date: '2026-11-06'`, so the feature is visible straight away.
- The rule in the "What's new card every release" memory gains: "set `date` to the deploy day".

**Where it goes:**
- A new `WhatsNewSplash` export in `_whatsnew.jsx`, reusing the card markup by pulling the existing card JSX into a `UpdateCard` component.
- It is mounted once in `app/src/layouts/Shell.jsx`, next to the other sheets, behind `['company','security'].includes(user.role)`.
- It uses the existing `Sheet` (`app/src/ui/index.jsx:711`).
- Tapping Got it, closing the sheet or following the link all record it as seen.

## 2. Landing page scroll animations (recommended set)

All animations are CSS + one IntersectionObserver, with no library. The rules that apply throughout:
- Content stays visible if JS fails. Hidden states are only applied after the observer is armed (an `.anim` class on `<html>`).
- Each element plays once.
- `prefers-reduced-motion` turns everything off (the existing rule at `:260` already covers this).
- On phones the slide distance is shorter, so nothing pokes past the screen edge, and the page never scrolls sideways (`overflow-x: clip` on sections).

| Effect | Where | Behaviour |
|---|---|---|
| **Slide in from the sides** | Venue tiles, service flip cards, platform pillars, award cards | Cards glide in from left and right in turn (odd from the left, even from the right), staggered about 80ms, with the existing spring easing. Venue tiles are added after the page loads (`loadVenues`, `:963`), so they get the same treatment when they're inserted. |
| **Stats count up** | Hero proof row ("20+") | The number counts from 0 to 20 in about 1.2s when it comes into view, then the "+" appears. Words like "Winner" or "Live" fade in instead. |
| **Hero zoom + soft parallax** | Hero photo; service/award photos | The hero photo settles from a slight zoom (1.08 → 1) on load. Section photos drift a little slower than the page while scrolling (transform only, rAF-throttled). This is turned off on touch screens to keep phones smooth. |
| **Gold line draws in** | Under each section heading (`.lead h2`); "How it works" steps | A thin gold underline draws itself left to right. The 4 steps light up one after another, with their number badge turning gold in sequence. |
| **Existing rise up** | Lead text, careers block, closing CTA | Kept as is. |

Flip-card behaviour and click handling stay unchanged. The slide is applied to the outer tile, and the flip to `.inner`, so the two don't clash.

## Non-goals
- No server-side "seen" tracking, and no email or push about releases.
- No animation changes inside the app, only the public landing page.
- No new images.

## Ship
- Add a What's new card in the same commit, with `date: '2026-11-06'`: "Never miss an upgrade" (the splash) plus "A landing page that moves" (the animations), as one card.
- `cd app && npm run build`: ui-lint must stay at 67 or below.
- `openkbs site deploy`. No API change, so no fn deploy is needed.
- Commit (with the Co-Authored-By line), then `git push origin master`.

## Verification
- **Mock server + vite (ROLE=company, then security, then venue):**
  - The splash appears for company and security, but not for venue.
  - Got it → reload → no splash.
  - Clear the key → splash is back.
  - Fake today's date as more than 2 days after the release → no splash.
  - Screenshots at 1280 and 390.
- **Landing page (local `site/index.html` served statically):**
  - Scroll screenshots part-way through each section, at 1280 and 390.
  - Check there is no sideways scroll on 390.
  - Check that with reduced motion emulated everything shows at once.
  - Check the venue tiles slide in after they load.
  - Then run `agent-browser close --all`.
- **After deploy:** the live landing page and app bundle load, checked read-only with no live data changes.
