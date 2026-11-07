# Plan: Orb can find and fill venue addresses; the platform admin always has full Company manager rights

## Context
- **Orb (`functions/api/modules/assistant.mjs`)** can already save venues: `venues.save` is in `lib/orbCatalog.mjs:101` and goes on a Confirm card. But it has **no way to look anything up outside the app**. There is no web, no geocoder, and its prompt says "never guess". So "find the addresses for these venues" gets "I can't".
- **Lookups tested today** (read-only):
  - OpenStreetMap (Nominatim, already used by `everyday.places`) finds about half by name: Frankenstein EH1 1EN, Vega G2 8QW, Angels Share EH2 4EL. It misses others, such as Bbar and Days Festival.
  - The venues' own websites (20 of the 22 have one) list their postcode: B Bar EH1 1HN, Biblos EH1 1HR, Grand Cru EH2 1EE, Pilgrim EH1 1LY.
  - postcodes.io turns a postcode into a map pin.
- **Platform admin:** the user reports that the venue fields were **read-only or missing**. That is exactly what `user.role !== 'company'` shows in `VenueDetail.jsx` (`isCo`):
  - no client
  - no invoice cycle
  - no website editor
  - no Charge rates tab
- Today, platform admin status is only an email list (`lib/platform.mjs`, env `PLATFORM_ADMINS`, defaulting to info@orbsolutions.co.uk). `ensurePlatformRole` rewrites the stored role to company, but only for an email in that list. **Every** other check, on the server and in the app, reads `user.role` alone. So a platform admin login whose email isn't on the list, or whose role is otherwise not company, falls back to Security manager rights.
- **Fix:** make "platform admin ⇒ full Company manager" a single rule that every check honours.

## 1. RBAC: one rule, everywhere
- **`lib/platform.mjs`:** add `effectiveRole(u)`. It returns `'company'` for a platform admin on the manager side, and `u.role` otherwise.
- **`lib/auth.mjs` `userFromEvent`:** after `resolveActing`, if the user is a platform admin and not on the "My shifts" side, set `role = 'company'` and `can_see_pay = true` for the request. This is on top of the stored-role self-heal, so `def()` checks (`index.mjs:97`), `venueScope` (all venues), `assertVenue`, `canSeePay`, the Orb catalogue (`catalogFor`) and `assistant.confirm` all agree without touching each module.
- **`publicUser`** returns that same effective role, so the app's `isCo`, route guards (`/company/*`) and nav match the server.
- **Platform admin email list:** `PLATFORM_ADMINS` is a function env var. I won't read it. If the admin uses an address other than info@orbsolutions.co.uk, I'll ask for it and set it via `request_secrets`, then redeploy.
- **Tests (`test/dualrole.test.mjs` + new `test/platformRbac.test.mjs`):**
  - The platform admin with stored role `security` acts as company.
  - On the officer side they stay an officer.
  - A disabled admin gets nothing.
  - `catalogFor` gives the admin the company-only venue actions (`clients.*`, `venues.saveRate`, website fields).

## 2. Address lookup action: `venues.findAddress` (new, `modules/venues.mjs`)
- **Roles:** `def(MGR)`, plus `assertVenue`, so a security manager only looks up venues assigned to them. Input is `{ id }` or `{ name, city? }`.
- **Sources, in order (each with a short timeout, failures skipped):**
  1. **The venue's website** (`website_url`, homepage and then `/contact` if no postcode is found):
     - Strip the HTML.
     - Find UK postcodes with a regex.
     - Haiku `extract` (the existing helper, module `website`) picks the street address that belongs with the postcode. It must not invent anything: it returns empty if unsure.
  2. **OpenStreetMap / Nominatim:** `name + city`, `countrycodes=gb`, the same headers and `limitRate` as `everyday.places`. Only named places (pub, bar, hotel, etc.) are kept.
  3. **postcodes.io:** the latitude and longitude for the chosen postcode, and a check that the postcode is real.
- **Returns** up to 3 `candidates: [{ address, postcode, lat, lng, source: 'website'|'map', confidence }]`. Nothing is saved.
- **Bulk:** `venues.findAddresses { ids? }` runs the same lookup for the given venues, or for every venue with no address. Lookups run one a second (the Nominatim rule). It returns the best candidate per venue and lists those it couldn't find.
- **Logic in `lib/addressLookup.mjs`** (new, pure where possible: postcode regex, choosing a candidate, cleaning a Nominatim result), with unit tests on fixed HTML and JSON. Tests make no network calls.

## 3. Orb
- **`lib/orbCatalog.mjs`:** add `venues.findAddress` and `venues.findAddresses` as `read`, area `venues`, with words like "address, postcode, find, lookup, geocode, map pin, location".
- **`venues.save` inputs:** already list `address`, `postcode`, `lat`, `lng`.
- **System prompt (`assistant.mjs:367`):** one line: "To fill in a venue's address, use venues.findAddress / findAddresses (the venue's website and the map). Propose the result with venues.save on the Confirm card and say where each address came from. Never make one up."
- **Large requests:** 22 venues means two Confirm cards (20 lines each), which the existing `MAX_CARD` handling covers. `findAddresses` does the lookups in one call, so the 12 tool rounds are enough.

## 4. App (small)
- **Venue details → Details:** add a "Find address" button next to Address. It calls `venues.findAddress` and fills address, postcode and the map pin into the form, showing the source. The manager presses Save as usual. Use `<Button>` so ui-lint stays at 67.
- **`VenueDetail.jsx` `isCo`:** uses `user.role`, which is now the effective role from §1. No other change.

## 5. What's new
- A card "Orb finds venue addresses", with a picture: an `orb-addresses` prompt added to `app/scripts/whatsnew-images.mjs` and generated.
- The card also mentions that the platform admin always has full Company manager access.

## Verification
- **API tests:** `cd functions/api && npm test`, including the new RBAC and lookup tests.
- **Lookup check:** run the lookup locally against the real websites, OpenStreetMap and postcodes.io (read-only) for the 22 seeded venue names and links, and report how many get an address.
- **Lint and build:** `node app/scripts/ui-lint.mjs` (≤ 67) and `cd app && npm run build`.
- **Stand-in server (as company, platform admin with stored role security, and security):** Find address fills the form; the platform admin sees Client, Invoice cycle, Website and Charge rates. Then `agent-browser close --all`.
- **Ship:**
  - Commit (only these files; another chat just added the money-feed files, so stage paths explicitly).
  - `openkbs fn deploy api -s 'rate(5 minutes)'`, then the site build and deploy, then `git push origin master --tags`.
- **No live data changes from me:** the addresses are saved only when a manager confirms them in Orb or presses Save.
