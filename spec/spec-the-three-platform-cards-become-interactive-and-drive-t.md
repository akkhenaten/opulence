# Spec: the three platform cards become interactive and drive the venue-portal example

## Context
On the landing page (`#platform`, "Your venue, always in the loop."), the three pillars are plain stacked text boxes:
- i. Up to date, you and us
- ii. More efficient
- iii. Compliant & secure

They sit beside one static venue-portal mock. The user says this "looks poor" and wants interactive, eye-catching cards. They chose this approach: **choosing a card lights it up and switches the portal example to the matching screen**, so each promise is shown, not just told.

## Who it is for
Venue owners, hotel GMs and duty managers browsing the public site (the shop front). It must stay fast, accessible and on brand (black and gold, serif headings).

## What the visitor sees
**The three cards (left column, desktop)**
- Each card has an animated gold line icon:
  - i. a live pulse/eye
  - ii. a clock turning into a tick
  - iii. a shield closing
- It also has the numeral, the title and the subtitle.
- **Active card:**
  - A gold border glow and a soft gold gradient.
  - It lifts slightly.
  - Its three points open with a staggered slide-in.
  - A thin gold progress bar runs along its bottom edge.
- **Inactive cards:** collapse to icon, title and subtitle, dimmed. On hover they brighten, and the gold glow follows the cursor.
- **Wording:** stays word for word as it is now: the titles, subtitles and three points per card.

**The portal example (right column)** cross-fades to a screen matching the active card:
1. **Up to date:**
   - "On your door now", with the three officers and SIA chips. One of them clocks in live while the visitor watches.
   - The "Incident report · 23:41" tile arrives with a small "New" pop.
   - A "Cover request · Sat 22:00 · 2 officers booked" tile.
2. **More efficient:**
   - "Last night · Timesheet · 3 officers · 21 hrs", with the Sign off button pressing itself and turning into "Signed ✓".
   - "Clock-in verified on site".
   - "Invoice matches: 21 hrs".
   - A small rota strip with a gap that gets filled.
3. **Compliant & secure:**
   - Officer rows with "SIA licence ✓ · Right to work ✓".
   - An amber "Licence renews in 28 days, alert sent" chip.
   - "Shift log · 3 refusals recorded".
   - "Venue procedures · acknowledged by 3/3 officers".

The bar ("Your venue · Tonight · Live") stays the same across all three screens, and the caption stays as it is.

## Behaviour
- **Autoplay:** the cards cycle by themselves every ~7 s while the section is on screen. They pause on hover or focus, and stop for good once the visitor clicks or taps a card.
- **Keyboard:** the cards are real buttons, so Tab, Enter and Space work. The arrow keys move between cards. The portal is announced politely ("Showing: More efficient").
- **Reduced motion:** no autoplay and no cross-fades or icon animation. Clicking still switches the screen instantly.
- **No JS:** all three cards are shown open (as today), with the current portal screen.
- **Phones (≤920 px):**
  - The cards become a horizontal swipe carousel (scroll snap) with three gold dots.
  - The portal mock sits directly under them and follows the card in view.
  - Autoplay is off on phones.
- **Placement:** stays where it is. The portal stays sticky on desktop as now.

## Scope
- **In:** `site/index.html` (markup, CSS and JS for `#platform` only), plus a What's new card with its own AI picture (per house rule).
- **Out:**
  - No API or data changes; the portal screens are illustrative examples, as today.
  - No changes to other sections.

## Assumptions (unanswered in the grilling, so the recommended options were taken)
- **Visual:** animated gold line icons, not photos.
- **Mobile:** a swipe carousel.
- **Copy:** kept word for word, with no added stats.

## Verification
- **Desktop 1280:**
  - Autoplay cycles and pauses on hover.
  - A click switches both the card and the portal, and stops autoplay.
  - No layout jump: the portal height is fixed at the tallest screen.
- **Mobile 375:**
  - Swiping changes the active card and the portal.
  - The dots work.
  - No horizontal page scroll.
- **Reduced motion and no JS:** they behave as described.
- **Keyboard and screen reader:** they work. The accessibility snapshot lists the three cards as buttons with their pressed state.
- **Clean run:** no console errors, and the other sections (figures, clients, services, Request cover) are unaffected.
- **Deploy and recheck:** `openkbs site deploy`, then check on the live site.
