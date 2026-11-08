# Plan: "Needs you" becomes a glowing drawer on phones, plus icons, motion and a premium polish across every portal

## Context
On phones, the manager's Today page puts the whole "Needs you" queue first:
- red to-do rows (up to 11)
- every Orb card, with no limit
- the amber and blue rows

You have to scroll past all of it to reach On the floor and Tonight. The same thing happens on:
- the officer Home "To do" list (often 10 or more rows) and "Needs your answer"
- the officer Me "Needs your attention" list
- the venue dashboard's "Needs you"

The user wants this to be a drawer you open, which glows when it holds something. They also want:
- icons used to save space
- animated icons
- cards that animate as you scroll
- a premium feel throughout every portal

Today the app has CSS keyframes, the `usePresence` helper (`ui/motion.js`), nav icon motion (`layouts/navMotion.js`) and a stagger on `.bento` only. Reduced-motion handling is in `styles.css:311`. There is no motion library, and we'll keep it that way: CSS and small hooks only.

## 1. The attention drawer (phones and tablets below lg; desktop unchanged)
**New `AttentionDrawer` in `ui/index.jsx`**, built on the existing `Sheet` (`ui/index.jsx:843`), which already handles bottom placement, drag to dismiss and presence.
- **When closed**, it shows as one slim bar (about 56px):
  - a bell or inbox icon with the total count
  - the title ("Needs you" or "To do")
  - up to 4 small tone-coloured icons previewing what's inside (red first)
  - the most urgent item's one-line text
  - a chevron
- **When it holds something**, the bar glows: a soft breathing halo in the most urgent tone (red, amber or blue) and a gentle bell wiggle every few seconds. The wiggle stops after the drawer has been opened in that visit.
- **When it's empty**, the bar shows a calm green "All clear" with a check, and no glow.
- **Tapping the bar** opens a tall Sheet (about 85% of the screen) with the full list. Items keep their links and Accept/Decline buttons. Acting on an item updates the count live.
- Props: `{ title, count, tone, preview: [{icon, tone}], lead, children, empty, id }`.
- The open state is held in the URL (`?drawer=needs`), so Back closes it and the existing `scrollTo('needs')` chips open it instead.

**Used on:**
- **manager/Dashboard.jsx**, below lg: the bar replaces the inline `queue` section. The `Inbox`, `NeedRows` and empty message move inside the drawer. The "To approve" chip opens the drawer. On the floor and Tonight now start right under the status strip.
- **officer/Home.jsx:** "Needs your answer" (shifts to accept) and the `ToDo` list merge into one "To do" drawer. Answer-needed shifts sit first, with their buttons. The status rows that matter right now stay inline, because they're short: can't work, grace period and today's shift.
- **officer/Me.jsx:** "Needs your attention" and "Getting set up" go behind one drawer bar.
- **money/VenueDashboard.jsx:** `NeedsYou` goes behind the bar, and the live late or no-show alerts feed its count.

## 2. Icons that save space
- **`Section`** (`ui/index.jsx:609`) gets an `icon` prop: a small tinted icon before the heading. Main sections on the dashboards get one.
- **`Segmented` and `Tabs`** options accept `icon`. With `iconOnly` on phones they show the icon only, with the label as `aria-label` and a tooltip. Used for:
  - view switches (Grid/List, By venue/day/officer)
  - density
  - status switches where the meaning is clear
- **`Chip`** accepts `icon`. Counter chips get their icon (e.g. AlertTriangle for Short shifts, Clock for Late), and on phones show icon plus number only.
- **`HubTabs`** gets optional per-tab icons from `hubs.js` (`icon` key). On phones it shows the icon plus a short label.
- **Page actions** (`New shift`, `Export`, `Add staff member`) become icon buttons with a tooltip below sm, through `Button iconOnly`.
- **Tool line:** the search field collapses to a search icon on phones and expands on tap.

## 3. Motion
All motion is CSS in `styles.css`, using the existing tokens `--dur-*`, `--ease-ios` and `--ease-out`. It is all switched off or reduced to a fade under `prefers-reduced-motion`.
- **Icon micro-animations:** a shared `ico` class plus a `data-anim` attribute, with animations for bell wiggle, check pop, refresh spin, arrow nudge, plus rotate, heart beat and send fly.
  - They play on hover and press of `Button`, `IconButton`, `Row` and `Chip`.
  - They play once when a state changes, e.g. a tick when something is approved.
  - This reuses the `navMotion.js` idea (one animation per icon type, chosen by name).
- **Cards animate in as they scroll into view:**
  - A new `useReveal` hook in `ui/motion.js`, built on one shared IntersectionObserver, adds `.reveal-in`: fade plus an 8px rise plus a slight scale from .98, staggered 30ms by order within the parent and capped at 200ms.
  - It is applied to `Tile`, `List` rows, `PhotoCard`, `ShiftCard`, rota cards and Orb cards.
  - Each element animates only once, and only after first paint, so nothing jumps on load.
- **Horizontal card rows:** the Everyday events, officer shift offers and the status chips scroll with scroll-snap. The card in focus is full size and the neighbours are slightly scaled and dimmed, using CSS scroll-driven animation where it's supported, with a plain fallback elsewhere.
- **Sliding indicators:** the underline on `HubTabs` and `Tabs`, and the pill on `Segmented`, glide between options instead of jumping.
- **Numbers:** `Stat`, `Tile` values, `Chip` counts and the drawer count roll up on first show and tick when they change. This uses a small `CountUp`.
- **Pressed feel:** a tuned `.pressable` spring, a soft shadow lift on card hover (desktop), and the drawer sheet opens with a spring ease.
- **Lists:** rows that are added or removed fade and collapse, for example after an Orb approval or an Accept, through `usePresence`.

## 4. Premium polish pass (every portal: managers, officers, venues, platform)
- One shared shadow and highlight scale for cards (`shadow-tile`, plus a hairline inner highlight in the Day, Night and Glass styles). Soft and Flat keep their own look.
- More consistent spacing on cards (padding and gaps), with section headings using the same icon, title and count layout.
- Empty states use an illustrated icon in a soft tinted circle with a gentle float, instead of plain text.
- Skeletons are shaped like the cards they replace, with a smooth shimmer to content fade.
- Toasts carry an icon and a slide-and-settle animation, and success toasts tick.
- Bottom tab bar: the active tab gets a pill behind its icon, its icon animates, and the Messages and To-do badges pop when they change.
- A visible focus ring on everything you can interact with, and tap targets stay at 44px or more.

**How:** mostly through the shared components (`ui/index.jsx`, `ui/hub.jsx`, `layouts/Shell.jsx`, `styles.css`), so every page picks it up. Then a pass over the pages adds icons to sections, chips and segmented options. That pass is split by portal, the same way as the last rollout.

## Out of scope / unchanged
- What each page shows or does, its data and permissions.
- The desktop "Needs you" side panel on Today, which stays as it is.
- Printable documents and certificates.
- No new dependencies.

## Release
A What's new card with its own picture, titled "A smoother, more polished app", covering the drawer, icons and motion.

## Verification
- Run `npm run build`. The ui-lint total must stay at or under 70, and the API address check must pass.
- **On a phone (375px), in all five styles:**
  - Today shows the glowing bar, and On the floor is visible without scrolling.
  - The drawer opens, drags closed, and Back closes it.
  - Approving an Orb card updates the count.
  - "All clear" shows when the list is empty.
- **Officer Home and Me, and the venue dashboard:** the same checks.
- **With reduced motion turned on:** nothing moves except fades, and nothing glows.
- **Desktop:** the layout is unchanged apart from the polish. There is no layout jump from the reveal animation.
- I don't have live sign-in, so the user checks the deployed build.
