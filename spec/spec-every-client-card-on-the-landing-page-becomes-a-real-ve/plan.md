# Plan: every client card on the landing page becomes a real venue

Spec: spec/spec-every-client-card-on-the-landing-page-becomes-a-real-ve.md

## Context
- **Live today:** `venues.public` returns 2 automatic tiles, Banshee and "Shanghai Nightclub ". The page also has 23 hand-made `.vt[data-client]` cards, so Shanghai appears twice.
- **After this change:** every tile comes from a venue. The 22 cards other than Shanghai are seeded as venues (with `site_client = slug`, so reviews filed under old slugs still attach), and the hand-made cards are removed from the page.

## 1. Seed: `functions/api/db/migrations/047_site_clients_to_venues.sql` (new)
- **Runs once** via `schema_migrations` (lib/db.mjs:68) and is also idempotent.
- **Rows:** a `VALUES` list of 22 rows `(slug, name, city, blurb, url)` copied from `SITE_CLIENTS`, without `shanghai`.
  - `city` is NULL for carbon-lounge and days-festival.
  - `url` is NULL where it is empty.
- **Step 1 (link existing):**
  - Find unlinked venues whose `lower(btrim(name))` matches a row and where no venue holds that slug yet.
  - Set `site_client = slug`.
  - Fill only the empty fields: `city = COALESCE(city, s.city)`, and likewise `website_blurb`, `website_url`, and `website_photo_url` (the last only when there is no `photo_key`).
  - Matching uses `DISTINCT ON` the slug, so one venue per slug.
- **Step 2 (insert):** add a row for each slug that no venue holds:
  - `INSERT INTO venues (name, site_client, active, on_website, city, website_blurb, website_url, website_photo_url)`
  - with `true, true, s.city, s.blurb, s.url, '/img/opulence/clients/'||slug||'-960.jpg'`.
  - Every other column uses its default: address and postcode `''`, `radius_m` 150, no client.
- No audit rows (a migration has no user). The What's new card records the change.

## 2. API
- **`functions/api/modules/venues.mjs`, `venues.public` (line 171):**
  - `tiles` = every shown venue, linked or not, `ORDER BY name` (already sorted).
  - Each tile's reviews: `[...(pubBy[v.site_client] || []), ...praise.filter(c => c.venue_id === v.id).map(feedbackShape)]`, where `pubBy = groupPublic(published)`.
    - Ticked praise is matched by `venue_id` only, so it isn't counted twice.
  - The photo comes from `websitePhoto(v)` for all shown venues. A seeded venue already has `website_photo_url`, so nothing is uploaded.
  - Return `{ reviews: {}, photos: {}, hide: [], tiles }`. The empty keys keep cached older pages working.
- **`venues.save`:** `b.name = String(b.name).trim()` before `required` (the space is the only issue with "Shanghai Nightclub ").
- **`functions/api/lib/siteClients.mjs`:** the header comment now says this is the list of old card slugs: the seed source and the review keys. The data is unchanged, so `reviews.mjs` `myClients` and `isSiteClient` keep working.

## 3. Landing page: `site/index.html`
- **Markup (around lines 450-740):**
  - Remove all 23 `.vt[data-client]` cards.
  - Keep `.cities` with the three `.city` shells (Edinburgh, Glasgow, Across Scotland). Each gets `.tiles` holding skeleton tiles: `div.vt-sk` with `aria-hidden` (4, 2 and 2).
  - Add CSS for `.vt-sk`: the `.vt` aspect ratio, `var(--ink)` background, a soft shimmer, and no animation under `prefers-reduced-motion`.
  - Add `aria-busy="true"` on `.cities` until loaded.
  - The skeletons are not `.vt`, so `flippers('.vt')` (line 1013) ignores them, and `tiles` starts empty.
- **`loadVenues` (around line 1107):**
  - Drop the hand-made `forEach` branch (`hide` and `photos`).
  - Remove all `.vt-sk`, then add each tile as now (`makeTile` → `cityGrid` → `slide`/`wire`/`reviewed`).
  - Then remove any `.city` whose `.tiles` is empty, and clear `aria-busy`.
- **Failure:** the `reviews.public` fallback is dropped. Instead there is one retry after 2 s, then `#clients` is hidden (`hidden = true`). Any nav link to `#clients` stays harmless.
- **Trigger:** call `loadVenues()` straight away, without the IntersectionObserver. It is one small POST.
- **`makeTile`:** when `v.photo` matches `^/img/opulence/clients/([a-z0-9-]+)-960\.jpg$`, build `<picture>` with a webp `srcset` (480w/960w) and the same `sizes` as the old cards, plus `width="960" height="720"`. Otherwise keep the plain `<img>`.

## 4. App: `app/src/pages/money/VenueDetail.jsx` (line 337)
- Rename the Select label to "Reviews from the old website card".
- Hint: "Links reviews collected under a website card from before this venue existed". Placeholder: "None".
- No logic change.

## 5. Tests
- **`functions/api/test/reviews.test.mjs:34`:** rewrite as "the landing page has no hand-made tiles; every old card slug still has its photos".
  - Assert there is no `data-client=` in index.html.
  - Assert the 480/960 webp and 960 jpg files exist for every `SITE_CLIENTS` slug.
  - Keep the `isSiteClient` asserts.
- **New `functions/api/test/siteClientsSeed.test.mjs`:** text checks on 047.
  - 22 `VALUES` rows matching `SITE_CLIENTS` minus shanghai (by slug, name and blurb).
  - No `'shanghai'`.
  - `NOT EXISTS` on both `site_client` and the name.
  - NULL city for the two Scotland rows.
- **`venues.public` guard:** a text check that the tiles filter no longer excludes `site_client`, and that reviews are joined by `v.site_client`.

## 6. What's new
- Add a card at the top of `UPDATES` in app/src/pages/people/_whatsnew.jsx:
  - Title "Every client is now a venue", dated 2026-11-07, icon `Building2` (or whichever icon the file already imports for venues).
  - It explains: tiles come from Venues; editing the line or photo, or turning off Show on website, updates the site; 22 venues were added for the old cards; and their address, geofence and rates need filling in before booking.
- Add a `website-venues` prompt to `PROMPTS` in app/scripts/whatsnew-images.mjs, run `node app/scripts/whatsnew-images.mjs website-venues`, look at the result, and set `image: 'website-venues'`.

## 7. Verify and ship
- **Tests:** `cd functions/api && npm test`; `node app/scripts/ui-lint.mjs` must stay ≤ 67.
- **Page check:**
  - Serve `site/` locally and point its `API` at a mock on port 8788 that returns 24 tiles (22 seeded, Banshee, Shanghai Nightclub). Check how `API` is defined on the page, and if needed intercept the request with an agent-browser route.
  - Screenshots at 390px and 1280px:
    - skeletons, then tiles, in the order Edinburgh → Glasgow → Across Scotland
    - webp photos
    - flip with the line and Visit link
    - one Shanghai
  - With the mock returning 500, the section is hidden.
  - Then `agent-browser close --all` and kill the servers.
- **Commit:** stage the files explicitly.
- **API deploy:** `openkbs fn deploy api -s 'rate(5 minutes)'`. Migration 047 runs on the first request, and a clean 401 confirms it.
- **Site:** `cd app && npm run build`, commit "build: site with venue-driven client tiles", `openkbs site deploy`, `git push origin master --tags`. Use a clean worktree if there's foreign WIP.
- **Live check:**
  - curl the public `venues.public` and expect 24 tiles, with Shanghai only as "Shanghai Nightclub".
  - The live index has no `data-client`.
  - The page screenshot shows the tiles.
