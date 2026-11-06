# Plan: catch up "What's new" and keep it current with every release

## Context
- You asked that every batch of upgrades gets its own card in **Audit log → What's new**, written as a feature showcase. The list lives in app/src/pages/people/_whatsnew.jsx (`UPDATES`, newest first; the first card gets the green "New" pill).
- **Checked against git:** every release since yesterday afternoon has a card, up to the incident report drafts (v94). **The last two releases are missing:**
  - v95, f7701b1: phone-first building blocks
  - v96, 5c3e7f9: the lighter app frame on phones
- Without a fixed step in the release routine, this will keep slipping, so that step is part of this plan.

## 1. Two new cards at the top of `UPDATES` (newest first)
- **Card 1** (v96). `month: 'November 2026'`, `icon: Smartphone`.
  - **Title:** "A calmer app on your phone"
  - **Lede:** "The frame around every screen has been pared back, so on a phone you see your work first and the buttons second. Nothing has gone; it is simply where you expect it."
  - **Points:**
    - A clean top bar: just your messages and alerts
    - A More menu laid out like the desktop, in clear sections with live counts
    - Orb slips out of the way while you scroll and returns the moment you stop
    - The last row of every list always stays in clear view
- **Card 2** (v95). `month: 'November 2026'`, `icon: LayoutGrid`.
  - **Title:** "Designed for the phone in your pocket"
  - **Lede:** "Every page has been reworked for the phone, so a manager on the door gets the same clarity as one at the desk."
  - **Points:**
    - Page actions tucked into a tidy … menu
    - Lighter, edge-to-edge panels and slimmer photo headers
    - Long tab lists become a simple picker
    - Tables turn into compact, readable rows
    - Photos load in a fraction of the time
- **Side effects:** the "New" pill moves to card 1 automatically, and the intro count ("Since October, N major upgrades…") updates itself.
- **Imports:** add `Smartphone` and `LayoutGrid` to the lucide import.

## 2. Make it a standing release step
- **Memory:** save a feedback memory, "every release adds its own What's new card in the same commit, written as a feature showcase".
- **Release routine:** from now on, each implementation plan's Verification/Ship section includes "add a What's new card".
- **Spec link:** reference the What's new spec in the memory.

## 3. Ship
- **Build:** `cd app && npm run build`, then ui-lint (counts must not go up).
- **Quick look:** at 390px and 1280px, check the What's new tab on the stand-in server, then `agent-browser close --all`.
- **Commit:** stage `app/src` + `site` and commit, with the Co-Authored-By trailer.
- **Deploy:** `openkbs site deploy` (front-end only).
- **Push:** `git push origin master --tags`. This also retries the v96 commit that GitHub rejected yesterday ("fatal error in commit_refs"). If it is still rejected, report it; don't force-push.
- **Live check:** the bundle contains "A calmer app on your phone".
