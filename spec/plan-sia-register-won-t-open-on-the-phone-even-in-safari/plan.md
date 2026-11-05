# Implementation plan: fallback when the SIA register won't load

## Context
The SIA register fails on the user's phone even when the address is typed into Safari directly, so the app's link isn't the cause. From our server it loads fine. The most likely causes are the phone's network or VPN / Private Relay, or SIA-side trouble. We can't fix that from the app. Instead, the panel will say plainly what to try and offer the GOV.UK start page as a second way in. No API or data changes beyond the Help text.

## Changes
1. **`app/src/ui/sia.js`**: under `SIA_REGISTER`, add
   `export const SIA_REGISTER_GOVUK = 'https://www.gov.uk/check-a-private-security-licence';`
2. **`app/src/pages/people/SiaVerify.jsx`**:
   - Import `SIA_REGISTER_GOVUK`.
   - Replace the tip paragraph (currently ending "…try Open register again in a minute.") with two short lines:
     - `On the register choose <b>Search by licence number</b> and paste the number. Name search needs surname, first name and date of birth (DD/MM/YYYY).`
     - `Register not loading? That's the SIA's site, not Opulence. Try mobile data instead of Wi-Fi, turn off any VPN or iCloud Private Relay, or start from <a href={SIA_REGISTER_GOVUK} target="_blank" rel="noopener" className="font-semibold underline">GOV.UK</a>. You can still record a check made on another device.`
   - Use the same `text-caption text-faint` style. The link is a plain `<a>`, the same pattern as the footer link in `ui/index.jsx`.
3. **`functions/api/lib/guide.mjs`** (the `sia_check` entry, line 196): add to the end of the body:
   "If the register won't load, the problem is with the SIA's site or your connection: try mobile data instead of Wi-Fi, turn off any VPN or iCloud Private Relay, or start from gov.uk/check-a-private-security-licence. You can check on another device and still record the result here."

## Verification
1. `cd functions/api && npm test`: all 154 pass.
2. `cd app && npm run build`: it builds, and ui-lint stays at 67 or below.
3. Local mock check:
   1. Start the mock (`ROLE=company node server.mjs` in /tmp/mock) and Vite on 5174.
   2. At 390×844, set `orb.token`, open /app/company/staff/o1, then the Compliance tab, stub `window.open`, and click Verify SIA licence.
   3. Check that the new text shows and that the GOV.UK link has the right href and `_blank`. Take a screenshot.
   4. Run `agent-browser close --all`, then stop the servers by PID. Don't use `pgrep -f` with a pattern that matches its own shell.
4. Ship:
   1. Commit with the message `fix: SIA panel fallback when the register won't load`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   2. `openkbs fn deploy api -s 'rate(5 minutes)'`.
   3. `openkbs site deploy`.
   4. `git push origin master --tags`.
   5. curl the live SiaVerify asset and check that it contains `check-a-private-security-licence`.
