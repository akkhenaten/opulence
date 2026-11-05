# Plan: SIA register won't open on the phone, even in Safari

## Context
After v80, the user says "Still doesn't work". Typing `rolh.services.sia.homeoffice.gov.uk` straight into Safari fails on the same phone, so this isn't the app's link.

What I found:
- From our server the register loads (200), including when the request looks like iPhone Chrome and comes from our app's address. The SIA site runs behind Azure Front Door.
- GOV.UK's official start page (gov.uk/check-a-private-security-licence) still links to `services.sia.homeoffice.gov.uk/rolh`, which forwards the phone to the same rolh.services site.
- The SIA has posted no outage notice. One public report (30 Sept 2026) mentions "unexpected error" on the SIA site.
- The likely causes are the phone's network (office Wi-Fi filter, VPN, iCloud Private Relay, a content blocker) or an SIA problem that only affects some networks.
- I won't call the SIA's internal data service from our server, which was blocked by the safety check. Opening the official register stays the method.

## Changes (small, in `app/src/pages/people/SiaVerify.jsx` and `app/src/ui/sia.js`)
1. Add `SIA_REGISTER_GOVUK = 'https://www.gov.uk/check-a-private-security-licence'` to `app/src/ui/sia.js`. GOV.UK keeps this page's "Start now" link up to date if the SIA moves the register again.
2. In the panel, under the copy chips, replace the last sentence of the tip with: "Register not loading? It's the SIA's site, not Opulence. Try mobile data instead of Wi-Fi, turn off any VPN or Private Relay, or start from **GOV.UK**." Link the "GOV.UK" text to the GOV.UK start page, using the same `<a target="_blank" rel="noopener">` style as `Button href`.
3. Leave the main button as it is: copy the number, open `SIA_REGISTER` and show the panel. The record form works whether or not the register loaded, so a manager can still log a check made on another device (for example an office PC).
4. Help entry (`functions/api/lib/guide.mjs`, "Checking an SIA licence on the register"): add one line about this, with the same troubleshooting words.

## Verification
- `cd functions/api && npm test`: 154 pass. `cd app && npm run build`: ui-lint stays at 67 or below.
- Local mock at 390×844: open the panel and check the new line and the GOV.UK link (href and target). Run `agent-browser close --all`.
- Ship:
  1. Commit with the message `fix: SIA panel fallback when the register won't load`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  2. `openkbs fn deploy api -s 'rate(5 minutes)'` (for the Help text).
  3. `openkbs site deploy`.
  4. `git push origin master --tags`.

## For the user to try (no code)
- Switch the phone from Wi-Fi to mobile data, or the other way round, and open the address again in Safari.
- Settings → [name] → iCloud → Private Relay: turn it off for a moment. Turn off any VPN or ad blocker.
- Try a laptop or office PC. If it fails everywhere, the SIA's site is down: try later or ring the SIA on 0300 123 9298.
