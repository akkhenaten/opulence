# Plan: bring Help, the user guide and Orb's knowledge up to date

## Context
The last few releases changed the officer app (built around the shift, 4 tabs, Clock tab gone), the shift page (handover, report tiles, drafts, "I can't work this"), the manager Dashboard (Needs you, Tonight & tomorrow, This week), added the What's new splash, made the Orb button movable, and gave every venue a tile on the public website (welcome line, Show on website, client reviews, now the departure-board flip). The What's new cards cover all of this, but the **user guide** — one source, `functions/api/lib/guide.mjs`, which feeds the in-app **Help** page, the **Help PDF** and **Orb's "how do I…" answers** — is partly stale or silent. Two officer empty-state hints also point at a "Report incident" button that no longer exists.

## Changes

### 1. functions/api/lib/guide.mjs (same CHAPTERS/sections format; plain text, `- ` bullets, `1. ` steps)
- **start → first (line ~56)**: replace the Dashboard sentence: "Your Dashboard leads with **Needs you** (only what's waiting, most urgent first), a one-line summary under your greeting, **Tonight & tomorrow** (cover at a glance, short shifts first) and **This week** (hours, shifts and money). On a quiet night it says all clear."
- **security → day (line ~295)**: same new Dashboard wording, without money.
- **install → updates (line ~45)**: add a paragraph: "After a release, managers see a short **What's new** card when they sign in (for two days). Every release is listed under Audit log → What's new."
- **AI → ask (line ~275)**: "Tap the round Orb button (the Opulence mark)… Drag it anywhere on the screen if it's in the way; it stays where you leave it."
- **day → log (line ~151)**: add "On the shift page, tap Add handover note to write one straight into the log; the next team sees the last team's handover notes and photos at the top of their shift."
- **officer → home (line ~326)**: rewrite: the 4 tabs (Home, Shifts, Learn, Me); Home shows what you need to answer (offers, shifts to confirm, To do), what's booked and open shifts you can pick up, plus warnings; from 15 minutes before your shift Home becomes the shift card (clock in, log, report tiles, ejections); Back always takes you back to where you came from.
- **officer → shifts (line ~330)**: "Clock history" → "Tap **Clock history** at the top of Shifts to see your past clock-ins."
- **officer → report (line ~342)**: use the real tile names: "Ejection / refused entry, Injury / first aid, Damage, Theft or Other".
- **New section start → website ("Your website: venue tiles and reviews")**, company role, after `venues`:
  - each active venue has a tile in Clients on the website, grouped by city; on the venue page use **Show on website** to hide or show it, set City, Website link (shown as Visit venue) and the **Welcome line** (Write with AI or your own words), and the venue photo becomes the tile picture;
  - praise from a venue: on its Feedback card switch **Show on website**; it appears on the tile under the venue's name, never a person's; take it down any time; Reviews lists what's On the website / Waiting for approval / Hidden;
  - visitors tap a tile (or an Our services tile) and it turns over like a departure board to show the details and reviews.
  (Wording checked against VenueDetail.jsx :301–340, Feedback.jsx :139, Reviews.jsx.)

### 2. Stale empty-state hints
- app/src/pages/officer/IncidentForm.jsx:81 and app/src/pages/shared/Incidents.jsx:74: "tap Report incident" → "tap a report tile (Ejection, Injury, Damage, Theft or Other)".

### 3. Test
- functions/api/test/orb.test.mjs (next to "the guide search finds how to send a policy"): add guide-search checks that "what is needs you on the dashboard", "how do I move the Orb button", "how do I show a venue on the website" and "where is my clock history" find the new sections (uses the same guide search helper as the existing test).

### 4. What's new
Guide-only update: per the release rule, add a small card at the top of `UPDATES` (date 2026-11-06, icon BookOpen or existing `Newspaper`): "Help is up to date" — Help, the PDF and Orb now explain the new Dashboard, the shift page, the movable Orb button and your website tiles.

## Not changed
- Help.jsx (renders the guide as is); screenshots in /app/help/ stay (no new screenshots).
- site/index.html has no help text; nothing to change.

## Verification
- `cd functions/api && npm test` (188 + new tests pass).
- `cd app && npm run build` (ui-lint ≤ 67).
- Mock (company and officer): open Help, search "Needs you", "handover", "website", "Clock history" — sections show with the new text; Orb guide search via the test.
- Commit, `openkbs fn deploy api -s 'rate(5 minutes)'`, `openkbs site deploy`, read-only live check (API 401, bundle has the new hint text), `git push origin master --tags`.
