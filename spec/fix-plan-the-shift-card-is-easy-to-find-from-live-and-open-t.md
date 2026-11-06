# Fix plan: the shift card is easy to find from Live, and open tabs pick up new releases (v114)

## Context
In the user's screenshot of the Live detail sheet (Onyeka Goddey, Banshee) there's no **Open shift card**, so they think managers still can't see shift cards. What I found:
- **The API is fine.** `live.board` (functions/api/modules/clock.mjs:273) returns `shift_id` on every row.
- **The live site has the button.** The deployed `Live-CIZ6gsQv.js` contains "Open shift card". It would sit just above "Open site pack".
- **So the tab is stale.** The screen matches the pre-v113 sheet exactly. The tab was open before the deploy, and the app never reloads its code on its own. There's no version check (sw.js only caches the shell), so a long-open manager tab keeps running the old build until someone reloads it by hand.
- **The card is buried even when up to date.** It's a button inside a sheet, behind a row tap. The user expects to see shift cards from Live straight away.

## Changes

### 1. Shift cards straight from the Live board: `app/src/pages/shared/Live.jsx`
- **Each venue section** on the board (managers only, not `/venue`) gets a header action for every distinct shift in that group: a small soft Button with the ClipboardList icon, labelled "Shift card" plus the time when there's more than one shift (e.g. "Shift card 20:00–03:30"). It links to `${base}/shifts/${shift_id}` with `state={{ from: 'live' }}`. It sits next to "n on site".
- **The Detail sheet**: move **Open shift card** to the top, right under the status pills, as a full-width primary button, so it's the first thing you see. Remove it from the lower button stack.

### 2. Open tabs notice a new release: `app/src/layouts/UpdateBanner.jsx` (new), used in `Shell.jsx`
- **Detect a new build.** On load, read the current entry script name from `document.querySelector('script[type="module"][src*="/assets/index-"]')`. Every 5 minutes, and whenever the tab becomes visible again, `fetch(import.meta.env.BASE_URL, { cache: 'no-store' })` and regex out `index-[\w-]+\.js`. If it differs, show a slim banner at the top of the Shell: "A new version of the app is ready." with a **Reload** button (`location.reload()`).
- **Chunk-load failures** (a stale tab opening a page whose old chunk was pruned): listen for `vite:preloadError` and reload once, guarded by a sessionStorage flag so it can't loop.
- **Officer app.** It uses the same Shell, so officers get it too.

### 3. What's new card: `app/src/pages/people/_whatsnew.jsx`
- November 2026, 2026-11-06, icon `ClipboardList`.
- Title: "Shift cards on the Live board".
- Points:
  - "Shift card" on every venue on Live;
  - Open shift card at the top of an officer's details;
  - the app tells you when a new version is ready, with Reload.

## Verify
**Checks**
- `cd app && npm run build`: ui-lint stays ≤ 67.
- `cd functions/api && npm test`: 202 pass. There's no API change.

**Mock (as before), as boss**
- At 390×844: the Live → Banshee section shows "Shift card" and opens `/company/shifts/s1`, and Back reads Live.
- The row sheet shows Open shift card at the top.

**Update banner**
- Load the app, then change the served index (point the mock or Vite at a different entry name; simplest is to stub `fetch` in the page to return HTML with `index-NEW.js`). Trigger `visibilitychange`: the banner shows, and Reload reloads.

Then `agent-browser close --all` and stop the mock and Vite.

## Release
- Commit `fix: shift cards straight from the Live board, and open tabs offer to reload after a release` with Co-Authored-By. Tag v114.
- `openkbs site deploy` only, since there's no API change. Then `git push origin master --tags`.
- Live check, read-only: `/app/` returns 200 and the new Live chunk contains "Shift card".
- Tell the user to reload their open tab once (this is the last time they'll need to by hand).
