# Plan: Orb finds venue addresses and logos (with an Orb button on new venues); the platform admin always has full Company manager rights

## Decisions from the user
- **Orb lookups:** Orb finds both the **address** and the **logo** from the internet and adds them.
- **Orb button:** when a venue is created by hand, a small Orb action button offers that help.
- **Where the logo shows:** **venue lists and details in the app**, as a small logo next to the venue name. It does not go on the landing page or invoices.
- **Defaults (not answered):**
  - One button, "Let Orb fill this in", covering address, postcode, map pin, website and logo.
  - It is shown only while the venue is missing details: right after creating a venue, and on any venue with no address or logo. It is hidden once those are filled.

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

## 2b. Venue logo (new)
- **Migration 049 `venue_logo`:** add `venues.logo_key` (private, in storage) and `logo_url` (public copy, the same pattern as the company logo in `settings.mjs` / migration 008).
- **Upload by hand:** `venues.saveLogo { id, key | '' }` saves an uploaded logo, or removes it with `''`. It uses `files.uploadUrl`, and `checkOwnPhoto`-style checks that the upload belongs to the user. Roles: company and platform admin, and security managers for their own venues.
- **`venues.findLogo { id }`:** finds logo candidates without saving them:
  - from the venue's website (`website_url`): `<link rel="icon"/"apple-touch-icon">`, `og:logo`/`og:image`, `<img>` with "logo" in its class, id, alt or src, and JSON-LD `logo`;
  - when the venue has no website, it first uses the lookup in §2 to find one (the OpenStreetMap `website` tag).
  - It returns up to 3 `{ url, source, width, height }`. Only https images (png, jpg, webp or svg) are kept.
  - Each one is fetched with a size cap (≤ 1 MB) and a content-type check. SVGs are kept as images only, never inlined.
- **`venues.useLogo { id, url }` (confirm tier in Orb):**
  - downloads the chosen image server-side (https only; no private or internal addresses, to guard against server-side request forgery; size cap);
  - stores a 256 px webp copy with `sharp`, as the existing thumbs do;
  - sets `logo_key` and `logo_url`.
- **Shown in the app:** a small round logo next to the venue name:
  - in the venue list (`money/Venues`) and the Venue details header;
  - where the venue name already appears in shift and timesheet rows, it uses the same `VenueBadge` part (new, falling back to initials).
  - It does not go on the landing page or PDFs.

## 3. Orb
- **`lib/orbCatalog.mjs`:**
  - add `venues.findAddress`, `venues.findAddresses` and `venues.findLogo` as `read`, and `venues.useLogo` as `confirm`, all in area `venues`;
  - search words: "address, postcode, find, lookup, geocode, map pin, location, logo, brand, icon".
- **Logos in chat:** the Confirm card shows a small preview of the chosen logo (the image URL in the card line), so the manager sees it before saying yes.
- **`venues.save` inputs:** already list `address`, `postcode`, `lat`, `lng`.
- **System prompt (`assistant.mjs:367`):** one line: "To fill in a venue's address, use venues.findAddress / findAddresses (the venue's website and the map). Propose the result with venues.save on the Confirm card and say where each address came from. Never make one up."
- **Large requests:** 22 venues means two Confirm cards (20 lines each), which the existing `MAX_CARD` handling covers. `findAddresses` does the lookups in one call, so the 12 tool rounds are enough.

## 4. App: the Orb button
- **"Let Orb fill this in":** a small Orb-styled pill button with the Orb icon and a gentle pop-in animation (none when reduced motion is on).
  - **Where:** on Venue details, at the top of the Details tab.
  - **When:** right after a venue is created by hand (the new venue opens with it), and on any venue still missing an address, postcode, map pin or logo. It is hidden once all of these are filled.
- **What it does when tapped:**
  1. It calls `venues.findAddress` and `venues.findLogo` in parallel, with a spinner and the line "Orb is looking this venue up…".
  2. It shows a small review sheet:
     - the address, postcode and map pin, with the source ("from the venue's website" / "from OpenStreetMap");
     - the website, if one was found;
     - up to 3 logos to pick from.
     - Each line has a tick box (on by default) and can be edited.
  3. On "Use these", it fills the form fields and calls `venues.useLogo` for the picked logo. The manager presses Save as usual for the address fields.
  4. If nothing is found, it says so plainly, and the manager can add the details by hand.
- **Also by hand:** "Find address" stays as a small link next to the Address field, and the logo has its own Upload / Remove next to the photo (as the photo has today).
- **Shared parts:** `<Button>`, `IconButton` and `Sheet`, so ui-lint stays at 67.
- **`VenueDetail.jsx` `isCo`:** uses `user.role`, which is now the effective role from §1. No other change.

## 5. What's new
- A card "Orb fills in your venues: address, map pin and logo", with a picture: an `orb-venue-lookup` prompt added to `app/scripts/whatsnew-images.mjs` and generated.
- The card also mentions that the platform admin always has full Company manager access.

## Verification
- **API tests:** `cd functions/api && npm test`, including the new RBAC and lookup tests.
- **Lookup check:** run the lookups locally against the real websites, OpenStreetMap and postcodes.io (read-only) for the 22 seeded venue names and links, and report how many get an address and how many get a logo.
- **Logo safety tests:**
  - http, private or internal addresses, oversize images and non-images are refused;
  - an SVG is converted to webp, never inlined.
- **Stand-in server, Orb button:** create a venue by hand; the button pops in; tap it; the review sheet fills the fields and the logo; the logo shows in the venue list; the button is hidden once the details are complete.
- **Lint and build:** `node app/scripts/ui-lint.mjs` (≤ 67) and `cd app && npm run build`.
- **Stand-in server (as company, platform admin with stored role security, and security):** Find address fills the form; the platform admin sees Client, Invoice cycle, Website and Charge rates. Then `agent-browser close --all`.
- **Ship:**
  - Commit (only these files; another chat just added the money-feed files, so stage paths explicitly).
  - `openkbs fn deploy api -s 'rate(5 minutes)'`, then the site build and deploy, then `git push origin master --tags`.
- **No live data changes from me:** the addresses are saved only when a manager confirms them in Orb or presses Save.
