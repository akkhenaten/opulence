# Fix: venue "On site" page and the dashboard's "On site now" links show nothing

## Context
Venue users report that the On site menu item and the dashboard's "On site now:" row/tile load nothing. Every one of these links goes to `/venue/live`, which renders `app/src/pages/shared/Live.jsx`.

**Cause.** Commit 957f82a3 (three-portal review, seventh slice) changed `Live.jsx:70` to:

`title={user.role === 'venue' || board.venue ? …}`

`user` is not defined inside `Live()`. The page throws a ReferenceError on its first render, the error boundary catches it, and the venue sees an empty page.

What was ruled out:
- **Server:** `live.board` works; the api logs show no errors.
- **Office side:** office managers are not affected. Their Live/Ops routes redirect to Today, which uses `Floor`/`StatusChips` directly and never renders `Live()`.

## Change
- `app/src/pages/shared/Live.jsx:70` → `title={board.venue ? 'On site' : 'Live'}`.
  - `useLiveBoard()` already sets `venue` from `user.role === 'venue'`, so this gives the same result as the intended line.
- Add a top card to `app/src/pages/people/_whatsnew.jsx`: "On site opens again". Its picture goes in `app/public/whatsnew/onsite-fix.webp`, in the same commit (per the What's new rule).

## Verification
1. `cd app && npm run build` passes (ui-lint, emergency-check, flow-check and vite all clean).
2. `grep -n "user\." app/src/pages/shared/Live.jsx` shows no use of an undefined `user` left.
3. Commits:
   - Commit the source as "fix: venue On site page opens again".
   - Commit the built site as "build: …".
4. Deploy with `openkbs site deploy`. The api is unchanged, so no fn deploy.
5. Ask the user to open On site as a venue, both from the menu and from the dashboard's "On site now" row/tile, and confirm the board shows.
