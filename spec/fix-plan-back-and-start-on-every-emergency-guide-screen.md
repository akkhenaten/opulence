# Fix plan: Back and Start on every Emergency guide screen

## Context
I reviewed all 36 screens of the live guide (v110). Three things are wrong:

1. **Most screens have no Back.** Only X01, X04, X05 and X06 have one, because only those have a Back button in the pack.
2. **There is no way back to the start.** Nothing returns to the opening "Choose the situation" screen (S00). The opening screen itself also has no way out of the guide: the only exit is End on the very last screen (K12).
3. **Back is unreliable.** I saw this while testing.
   - The guide keeps its own list of screens visited, and Back steps back through the browser history. The two can disagree.
   - For example, Escape from K02a goes back to K02, which looks like a "back" step, so it is dropped from the list.
   - After opening a screen from a link or a reload, Back can leave the guide or jump to the wrong screen. In my test, Back from X06 landed on K04.

The pack rule still holds: its buttons and wording are not changed. Back and Start are added by the app around the pack's screens, the same way I'm in danger and Call 999 are.

## Changes

### 1. A navigation row on every screen
Edit `app/src/pages/guide/emergency/Guide.jsx`.
- **Where:** a slim row under the Draft and Scope banners, above the picture, at least 44px tall.
- **On a journey screen:** **‹ Back** on the left, **Start** on the right (house icon). Start goes to the opening screen.
- **On the opening screen (S00):** **‹ Leave guide** on the left. It goes back to where you came from (`?from=`, or your home page) and keeps the counts.
- **Same place on every screen.** The pack's own Back on X01, X04, X05 and X06 stays as written; on those four screens there will be two Backs.
- **Start keeps the session.** The danger-tap count and first call time are kept, because it's still the same incident. Only End clears them, as now.

### 2. Make Back reliable
Edit `Guide.jsx`.
- **Remove** the visited-screens list (`path`) and the effect that guesses push or pop.
- **Every move inside the guide** calls `navigate(url, { state: { eg: true } })`, so each history entry knows it came from inside the guide.
- **Back** (the new row and the pack's `@back`):
  - if the current history entry has `eg` set, it steps back one screen (`navigate(-1)`);
  - otherwise (opened from a link or the first screen) it goes to Start (S00), replacing the current entry.
  - Back therefore never leaves the guide by accident, and the phone's own back gesture agrees with it.
- **Clean-up:** `fresh()` and `load()` drop `path`. sessionStorage `orb.eg` keeps `{interruptions, firstCall, resume, venue, from}`.
- **`from` is saved straight away,** not only on the first save, so Leave guide and End always know where to return.

### 3. Styles
Edit `app/src/styles.css`.
- Add `.eg-nav`: a flex row with space between, using the pack tokens.
- Add `.eg-navbtn`: blue text, 44px, bold, 16px.

### 4. Build check
Edit `app/scripts/emergency-check.mjs`. Add a check that `Guide.jsx` still renders the Back and Start controls, by text match, so the row can't be lost in a later edit.

### 5. What's new
Edit `app/src/pages/people/_whatsnew.jsx`. Per the memory rule, add a new top card: "Emergency guide: Back and Start on every screen".

## Verify
- **Mock, 390×844, admin.**
  - Run the scripted loop over every screen again. All buttons must stay above the bottom bar, with no horizontal scroll. The new row may shrink the picture, and "More steps below" may now show on a few screens. Both are acceptable.
- **Back:**
  - K01 → Escape → Your route isn't safe → Escape → Back → Back: should step K02 → K02a → K01, each one screen back.
  - Opening X06 straight from a link, then Back, should go to Start.
  - After a reload, Back should still step back one screen.
- **Start and leaving:**
  - Start from M02 should go to the opening screen with the danger count kept.
  - Leave guide on the opening screen should go back to the Toolbox.
  - End on K12 should still return to the Toolbox and clear the counts.
- **Then:** `agent-browser close --all`, stop the mock and Vite, run `npm run build` (ui-lint ≤ 67, guide check OK) and `npm test`.
- **Release:** commit "fix: Back and Start on every Emergency guide screen" as v111, deploy the site (no API change), and push.
- **Live:** read-only 200 check. No live data is changed.
