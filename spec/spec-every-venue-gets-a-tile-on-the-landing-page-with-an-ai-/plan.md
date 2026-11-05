# Implementation plan: every venue gets a landing-page tile, with an AI welcome line and its own photo

The spec is saved at `spec/spec-every-venue-gets-a-tile-on-the-landing-page-with-an-ai-.md`.

## Context
- The landing "Clients" section is 23 hand-written tiles, and feedback only reaches venues linked to one of them.
- With this change, every active venue gets a tile by default, with a Show-on-website switch for the office. Until praise is ticked, the tile shows an AI-written welcome line. The Details-tab photo becomes the tile picture.
- No live data changes at deploy time. AI text and cities are only written when the office saves a venue or presses "Write with AI".

## Data — `functions/api/db/migrations/039_venue_website.sql`
```sql
ALTER TABLE venues ADD COLUMN IF NOT EXISTS on_website boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS website_blurb text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS website_photo_url text;
```

## API

**`functions/api/lib/siteVenues.mjs` (new, pure and unit-tested)**
- `DEFAULT_BLURB(name)`: "Opulence is proud to provide door supervision and venue security for {name}."
- `webUrl(s)`: returns the trimmed value, or null. It allows only `http(s)://` URLs of 300 characters or fewer, and adds `https://` when there is no scheme.
- `publicTile(v, reviews)`: returns `{ name, city: v.city || null, blurb: v.website_blurb || DEFAULT_BLURB(v.name), photo: v.website_photo_url || null, url: v.website_url || null, reviews }`. It never includes the id, address or notes.
- `cleanBlurb(s)`: trims the text, removes quotes, and caps it at 220 characters.

**`functions/api/lib/ai.mjs`**
- Add `website: 'Website text'` to `MODULE_NAMES`, so it counts against its own credit cap.

**`functions/api/modules/venues.mjs`**
- `VENUE_FIELDS` gains `on_website`, `city`, `website_blurb` and `website_url`. Non-company users have the website fields stripped, as `site_client` is today.
- `website_url` goes through `webUrl`, and a bad URL fails with 400 "Enter a full website address". `website_blurb` goes through `cleanBlurb`.
- **Photo publishing in `venues.save`:**
  - When `photo_key` changes to a new key and the stored object is a jpeg, png or webp of 5 MB or less, copy it to `media/venues/<uuid>.<ext>` using `putObject` and set `website_photo_url` with the `publicUrl` used in `settings.mjs:21`. Export `publicUrl` from settings, or move it to `lib/storage.mjs` and reuse it.
  - When `photo_key` becomes null, set `website_photo_url` to null.
- **After save:**
  - If the venue is `on_website`, has no `website_blurb`, and AI isn't capped, call `writeWebsite(v)` inside try/catch and store the result. City is only stored when it's empty. A failure never blocks the save.
  - `writeWebsite(v)` uses `extract({ model: HAIKU, module: 'website', tool: { name: 'tile', input_schema: { city, blurb } } })`.
  - Prompt: "Opulence Security & Services: write 1–2 warm, professional British-English sentences (≤220 chars) welcoming {name} as a venue Opulence has begun looking after; only use the name, city and that we provide door supervision/venue security; no invented facts. City = the town/city from this address/postcode."
- **New `'venues.writeWebsite': def(CO, …)`:**
  - Takes `{id}` plus any unsaved `name`, `address` and `postcode`, and returns `{city, blurb}` without saving. This powers the "Write with AI" button.
  - Audited as `venue.ai_text`.
- **New `'venues.public': pub(…)`** (public):
  - `reviews`: the existing `reviews.public` result, for the hand-made tiles.
  - `tiles`: active `on_website` venues with **no** `site_client`, ordered by name, each as `publicTile` with up to 10 ticked praise quotes (built with `feedbackShape`).
  - `photos`: `{ slug: website_photo_url }` for linked venues that have a photo, so it can replace the stock picture.
  - `hide`: the `site_client` slugs of linked venues that are inactive or have `on_website = false`.
- `reviews.public` stays, for any old cached page.

**`functions/api/modules/reviews.mjs` and `comments.mjs`**
- The feedback query in `reviews.public` / `venues.public` adds `AND v.on_website`.
- `canPublish(c)` no longer needs `site_client`: it only requires praise and a comment, so every venue can show praise.
- `LIST_SQL` adds `v.on_website`.

**Tests**
- New `functions/api/test/siteVenues.test.mjs`: `webUrl` cases (rejects `javascript:` and `ftp:`, adds https), `publicTile` keys and the default blurb, and `cleanBlurb` at 220 characters.
- Update the `canPublish` test.

## App

**`app/src/pages/money/VenueDetail.jsx`**
- `VenuePhoto`: before uploading, reduce the picture to a JPEG of at most 1600 px on a canvas with a `toJpeg(file)` helper, falling back to the original file. This makes HEIC from iPhone Safari usable on the website.
- `DetailsTab`: new **"Website"** `Tile` (icon `Globe`) in the grid.
  - **Office:**
    - `Toggle` "Show on website", with the hint "Hidden from the landing page" when it's off.
    - `Input` City.
    - `Textarea` Welcome line (maxLength 220), with a "Write with AI" `Button` (`Sparkles`) that calls `venues.writeWebsite` and fills the city (if empty) and the line.
    - `Input` Website link.
    - The **Website client** select, moved here from the Venue tile, with the hint "Use a hand-made tile instead of an automatic one".
  - A small **tile preview** (4:3 photo or gold-on-black initials, then the name, city and line), shown to every role. Non-office users see only the preview.
  - Save sends the new fields with the existing save, which already strips company-only fields for non-company users.

**`app/src/pages/money/Feedback.jsx`**
- `WebsiteSwitch`: drop the "link a tile first" branch. When `!c.on_website`, show the hint "{venue} is hidden from the website", with a link to Details.

**`app/src/pages/people/_whatsnew.jsx`**
- Add a top "New" card: "Every venue, on your website".

## Landing — `site/index.html`
- **CSS:** `.vt .ph`, a gold-on-black initials placeholder matching the tile's 4:3 front, and `.vt .soon`, a subtle "Reviews coming soon" line.
- **JS:**
  - Refactor `flippers(sel)` so the card group is shared, and add `wire(t)` so generated tiles flip like the others (one open at a time).
  - Replace `loadReviews` with `loadVenues`. It POSTs `{action:'venues.public'}` and falls back to `reviews.public` if that fails.
  - **Hand-made tiles:**
    1. Apply the reviews carousel as today.
    2. Swap the `<picture>` for `<img src=photos[slug]>` when a photo exists.
    3. Remove tiles whose slug is in `hide`.
  - **Generated tiles:**
    1. Build one tile per entry with `el()` and `textContent` (no innerHTML): front is the photo or initials placeholder plus `.cap` (name, city); back is `.about` (name, line, "Reviews coming soon", "Visit venue ↗" when there's a url).
    2. Find the `.city` whose `h3` matches the tile's city (case-insensitive), otherwise create a new `.city` before "Across Scotland". Tiles with no city go under "More venues".
    3. Run `carousel()` when there are reviews.
  - If anything fails, the page stays as it is today.

## Verification
1. Run `cd functions/api && npm test`, and `cd app && npm run build` (ui-lint must stay at 67 or below).
2. **Local PGlite** (pool max 1):
   - migrate 039
   - save a venue: the AI call is stubbed with no key, so it fails and the save still succeeds with the default blurb in the public data
   - `venues.public`: the tile shape has no id or address; the switch off removes it
   - a linked venue switched off appears in `hide`
   - ticked praise appears in `tiles[].reviews`
   - `webUrl` rejects `javascript:`
3. **Mock and browser:**
   - Add `venues.public` and `venues.writeWebsite` stubs plus the website fields on `venues.get`.
   - Take screenshots at 1280 and 390 of: the Details → Website tile (switch, Write with AI, preview), and the landing page (`site/index.html` served locally with the API pointed at the mock) showing a generated tile with the placeholder, one with a photo, and a hand-made tile with its photo swapped.
   - Run `agent-browser close --all` and stop the servers.
4. **Commit and deploy:**
   - Commit "feat: every venue on the website, AI welcome line, venue photo on its tile" with the Co-Authored-By line.
   - Run `openkbs fn deploy api -s 'rate(5 minutes)'`, `openkbs site deploy`, `git push origin master --tags`.
5. **Live check (read-only):**
   - `POST {action:'venues.public'}` returns 200, and the tiles show default lines for existing venues.
   - The landing page contains `venues.public`.
   - No live venue data is changed by me. The office adds photos and lines, or presses Write with AI.
