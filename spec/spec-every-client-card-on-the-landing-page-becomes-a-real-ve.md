# Spec: every client card on the landing page becomes a real venue (venues drive all tiles)

## Context
- **Today:** the "Who we protect" section (`site/index.html` around line 443) has 23 hand-made client cards. They are mirrored in `functions/api/lib/siteClients.mjs` (`SITE_CLIENTS`).
  - On top of these, `venues.public` adds a tile for every active, on-website venue that isn't linked to a card.
- **Live feed today:** it returns 2 venue tiles: **Banshee** and **"Shanghai Nightclub"**. Shanghai therefore appears twice, once as the hand-made card and once as the venue.
- **Goal:** one way of working. A venue makes its card.
  - Remove the hand-made Shanghai card; the real venue stays.
  - Create a real venue for each of the other 22 cards, carrying over the card's name, city, line, link and photo.
  - Remove all hand-made cards from the page, so every tile comes from a venue. Editing, hiding or deactivating a venue in the app then changes its card.

## Decisions
- **Card source:** venues only, as the user chose. No hand-made cards stay in the page.
- **The other choices were not answered**, so the recommended defaults apply:
  - The new venues are **active** and shown on the website. Address, postcode, geofence and rates are filled in later in Venue details, so these venues appear in the rota pickers.
  - **No client (billing) record** is created; clients are attached later in Clients.
  - The venues are created **automatically by a one-time step when the API deploys**. **Approving this spec approves that live-data change**: 22 new venues.
- **Not converted:** Shanghai, because the real venue "Shanghai Nightclub" already exists. Its data is not touched.
- **Banshee:** already a venue; it is not affected.

## What changes

### 1. One-time seed: migration `047_site_clients_to_venues.sql`
- For each of the 22 cards, using the data from `SITE_CLIENTS` exactly:
  - `name`, `site_client = slug`, `active = true`, `on_website = true`
  - `city`: Edinburgh or Glasgow. Left empty for Carbon Lounge and Days Festival, so they go under "Across Scotland" with the "Scotland" caption, as now.
  - `website_blurb`: the card's line, so no AI call is made.
  - `website_url`: the card's link (empty for the two without one).
  - `website_photo_url = '/img/opulence/clients/<slug>-960.jpg'`: the same stock photo, served from the site.
- **Duplicates:** the step is idempotent. A card is skipped if a venue already has that `site_client`, or a venue with the same name exists (case- and space-insensitive).
- **If a venue with the same name exists but isn't linked:** set `site_client` and fill only the website fields that are empty, so it keeps its own photo and text.
- Running it again changes nothing.

### 2. API: `venues.public` (functions/api/modules/venues.mjs:171)
- Every shown venue (`active && on_website`) becomes a tile, whether or not it is linked.
- **Reviews on a tile:** published reviews filed under its `site_client` slug, plus ticked praise for that venue. Reviews collected under the old card slugs keep showing.
- Tiles are sorted by name, and city groups follow from that order.
- `photos` and `hide` are returned empty, for pages still cached in browsers.
- `publicTile` (lib/siteVenues.mjs) is unchanged.
- **Tidy-up:** `venues.save` trims the name. The live "Shanghai Nightclub " has a trailing space and is left as it is.

### 3. Landing page `site/index.html`
- **Remove** all 23 `.vt[data-client]` cards. Keep the section intro.
- **Before loading:** three city shells (Edinburgh, Glasgow, Across Scotland), each with 3–4 skeleton tiles in the same size and shape, so the page doesn't jump.
- **`loadVenues`:**
  - Drop the hand-made card branch.
  - Remove the skeletons, add tiles with `makeTile` → `cityGrid`, then remove any city group left empty.
  - Start loading right away, not only when the section scrolls into view, so a visitor who scrolls down quickly sees the tiles.
- **If the feed fails:** retry once, then hide the "Who we protect" section rather than showing an empty one.
- **Photos:** `makeTile` adds a webp `srcset` (480w/960w) when the photo is a stock `/img/opulence/clients/<slug>-960.jpg`, so the pictures stay as light as today.
- The stock images under `site/img/opulence/clients/` stay. Shanghai's can stay unused.

### 4. App
- **VenueDetail Website section:** rename the "Website client" dropdown to "Reviews from the old website card". Its help text says it links reviews collected before the venue existed.
- **`SITE_CLIENTS`** stays as the seed source and the list of old review keys. Update its header comment.

### 5. What's new
- A card "Every client is now a venue": all landing-page tiles now come from Venues.
  - Edit the line or photo, or switch "Show on website" off, and the website follows.
  - 22 venues were added for the old cards; fill in their address and rates before booking shifts.
- Add a `website-venues` prompt to `PROMPTS` in app/scripts/whatsnew-images.mjs, generate the picture, check it, and set `image: 'website-venues'` on the card.

## Out of scope
- Changing the text or photos of the cards.
- Changing the Shanghai or Banshee venues.
- Billing clients.
- The departure-board flip (a Backlog card). It will now work on venue tiles.

## Verification
- **API tests:** `cd functions/api && npm test` (215 plus new tests).
  - Every shown venue gives a tile.
  - Reviews come through the slug.
  - The seed's text check covers 22 rows with no `shanghai`, the `NOT EXISTS` checks on name and slug, and nulls for the Scotland cities.
- **Site check:** with the mock server (port 8788) returning 24 tiles, view the site at 390px and 1280px.
  - Shown: skeletons → tiles, Edinburgh/Glasgow/Across Scotland order, photos, flip with the line and link, and one Shanghai.
  - With the feed failing, the section is hidden.
  - Then `agent-browser close --all`.
- **Lint:** `node app/scripts/ui-lint.mjs`, which must stay ≤ 67.
- **Ship:**
  - Commit, then `openkbs fn deploy api -s 'rate(5 minutes)'` (runs 047).
  - Build and deploy the site, then `git push origin master --tags`.
- **Live check:** the public `venues.public` feed lists 24 tiles (22 new, plus Banshee and Shanghai Nightclub), and the live page shows Shanghai once.
