# Implementation plan: point Verify SIA licence at the live register

## Context
The app opens `https://services.sia.homeoffice.gov.uk/rolh`, which now returns HTTP 500. When the user's iPhone followed it, Chrome ended on `rolh.services.sia.homeoffice.gov.uk` with ERR_FAILED. The live register is `https://rolh.services.sia.homeoffice.gov.uk/` (200, with "Search by name" / "Search by licence number"). The old address appears only in two constants, so the fix is small. I'll also make the panel's "Open register" a real link, which iOS handles more reliably.

## Changes
1. **`app/src/ui/sia.js:2`**: change `SIA_REGISTER` to `'https://rolh.services.sia.homeoffice.gov.uk/'`.
2. **`functions/api/lib/sia.mjs:2`**: change `SIA_REGISTER_URL` to the same value, so the two copies agree. No backend code reads it today, but redeploying keeps the deployed copy in step.
3. **`app/src/ui/index.jsx` `Button` (line 221)**: add an `href` prop next to the existing `to` prop.
   - With `href`, it renders `<a href={href} target="_blank" rel="noopener" className={cls} {...p}>{inner}</a>`.
   - This mirrors how `Pressable` already handles `href` (line 268), and it gives a styled external link without new components.
4. **`app/src/pages/people/SiaVerify.jsx`**:
   - Line 100: the "Open register" button changes to `<Button size="sm" variant="ghost" icon={ExternalLink} href={SIA_REGISTER}>Open register</Button>`. The `window.open` onClick goes.
   - Line 114: the tip becomes "On the register choose **Search by licence number** and paste the number. Name search needs surname, first name and date of birth (DD/MM/YYYY). If the register doesn't load, it may be down; try *Open register* again in a minute."
   - `start()` (line 28) keeps `window.open(SIA_REGISTER, '_blank', 'noopener')`, because it must run in the same click as the copy. The panel link is the fallback when a popup is blocked.

No data model, migration or API changes.

## Verification
1. Run `curl -sI https://rolh.services.sia.homeoffice.gov.uk/` and expect 200.
2. Run `cd functions/api && npm test`: all 154 should pass.
3. Run `cd app && npm run build`: it should build cleanly, with ui-lint at 67 or below.
4. Test locally with the mock (`/tmp/mock/server.mjs` with `VITE_API_BASE`) at 390×844:
   - Open a staff profile, tap Verify SIA licence, and check that the panel opens.
   - Check that "Open register" is an `<a>` with the new href and `target=_blank`, and that the tip text shows.
   - Run `agent-browser close --all`.
5. Ship:
   1. Commit with the message `fix: SIA register moved to rolh.services.sia.homeoffice.gov.uk`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   2. `openkbs fn deploy api -s 'rate(5 minutes)'`.
   3. `openkbs site deploy`.
   4. `git push origin master --tags`.
6. Ask the user to retry on the phone. If ERR_FAILED persists on the new address while it loads from here, the problem is on the SIA's side or the phone's network.
