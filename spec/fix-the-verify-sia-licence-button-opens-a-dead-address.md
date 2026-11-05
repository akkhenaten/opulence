# Fix: the "Verify SIA licence" button opens a dead address

## Context
On their iPhone (Chrome), the user tapped Verify SIA licence and got "This site can't be reached" (ERR_FAILED) at `rolh.services.sia.homeoffice.gov.uk`.

What I checked from here:
- The address in our code, `https://services.sia.homeoffice.gov.uk/rolh`, now returns **HTTP 500**. The SIA moved the register, and the phone was sent on from the old address and failed.
- The current register is `https://rolh.services.sia.homeoffice.gov.uk/`. It returns 200 and renders "Search the Register of Licence Holders – GOV.UK" with two choices: "Search by name" and "Search by licence number".

## Changes
1. **The address in one place.** Set `SIA_REGISTER` in `app/src/ui/sia.js` and `SIA_REGISTER_URL` in `functions/api/lib/sia.mjs` to `https://rolh.services.sia.homeoffice.gov.uk/`. The Help text (`functions/api/lib/guide.mjs`) has no URL, so it needs no change.
2. **Make opening the register more reliable on phones.** In `app/src/pages/people/SiaVerify.jsx`:
   - The "Open register" button in the panel becomes a real link (`<a href target="_blank" rel="noopener">`, styled as the existing ghost button). iOS browsers and installed home-screen apps handle a real link more reliably than `window.open`, and a link works even when a popup is blocked.
   - The main button's copy and `window.open` stay as they are.
3. **Update the panel tip** to match the new site: "Choose **Search by licence number** and paste the number. To search by name, you need the surname, first name and date of birth (DD/MM/YYYY)."
4. Re-read `SiaVerify.jsx` first: it changed on disk since my last edit. Keep any edits found there.

## Verification
- `cd app && npm run build`: ui-lint stays at 67 or below.
- `cd functions/api && npm test`: all 154 tests pass.
- `curl` the new URL and expect 200. Open it in agent-browser at 390×844 and confirm the search page renders. Then `agent-browser close --all`.
- Ship:
  1. Commit with the message `fix: SIA register moved to rolh.services.sia.homeoffice.gov.uk`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  2. `openkbs fn deploy api -s 'rate(5 minutes)'`.
  3. `openkbs site deploy`.
  4. `git push origin master --tags`.
- Ask the user to try again on the phone. If the new address still shows ERR_FAILED there while it loads from here, it's on the SIA's side or their network, not ours. The panel's copy buttons still work, so they can open the register from a bookmark.
