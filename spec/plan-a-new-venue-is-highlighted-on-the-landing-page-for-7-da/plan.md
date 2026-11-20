# Implementation plan: new venues highlighted on the landing page for 7 days

## Context
The approved spec is in `spec/plan-a-new-venue-is-highlighted-on-the-landing-page-for-7-da.md`. Fingal (added 20 Nov) is on the site, but nothing marks it as new. Every venue that newly appears on the website gets two things for 7 days:
- a gold banner under the hero;
- a "New" tile, placed first in its group.

After that it goes back to normal by itself. The page reads `venues.public` live, so expiry needs no redeploy.

## Data model
**New `functions/api/db/migrations/069_venue_website_since.sql`:**
```sql
ALTER TABLE venues ADD COLUMN IF NOT EXISTS website_since timestamptz;
UPDATE venues SET website_since = created_at WHERE website_since IS NULL AND active AND on_website;
CREATE OR REPLACE FUNCTION venues_website_since() RETURNS trigger AS $$
BEGIN
  IF NEW.active AND NEW.on_website AND NEW.website_since IS NULL THEN NEW.website_since := now(); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS venues_website_since ON venues;
CREATE TRIGGER venues_website_since BEFORE INSERT OR UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION venues_website_since();
```
- The trigger covers every way a venue is created or edited (`venues.save`, Orb, staff setup), so none of them change.
- Hiding a venue and showing it again doesn't reset the date, because the column is only set while it is NULL.

## Server
- **`functions/api/lib/siteVenues.mjs`:**
  - Add `export const NEW_DAYS = 7` and `export const isNewVenue = (since, now = new Date()) => !!since && now - new Date(since) < NEW_DAYS * 864e5`.
  - `publicTile(v, reviews = [], now)` spreads `...(isNewVenue(v.website_since, now) ? { isNew: true } : {})`. The key is only there when the venue is new, so the existing public-shape test still holds and no date leaks.
- **`functions/api/modules/venues.mjs:283`:** add `website_since` to the `venues.public` SELECT. `publicTile` already gets the row.

## Landing page (`site/index.html`)
- **CSS,** next to the `.vt` rules (about 260–320):
  - `.vt.new`: a gold ring.
  - `.vt .new-badge`: a small gold uppercase "New" pill, top-left on the front face.
  - `.new-ribbon`: a slim band in `--ink-2` / `--gold`, holding a link styled like the page's small caps.
  - `.vt.pulse`: a short gold glow animation.
  - Under `prefers-reduced-motion` there is no pulse animation; this is added to the block at line 318.
- **`makeTile(v)`** (about 1098):
  - when `v.isNew`, add class `new` and append `el('span','new-badge','New')` (aria-hidden) to `front`;
  - the aria-label becomes `v.name + ', new venue, tap for more'`.
- **`loadVenues`** (about 1145):
  - Before `list.forEach`, sort stably: `list = list.filter(isNew).concat(list.filter(not isNew))`. New tiles land first in their city grid; the rest keep the server's name order.
  - After the tiles are placed, call `welcome(list.filter(v => v.isNew), firstNewTileEl)`.
- **`welcome(news, tile)`:** this is new.
  - **When it shows:** only when `news.length` is not 0. It isn't in the static HTML, so it never shows stale.
  - **Building it:** a `<div class="new-ribbon">` inserted after `section.hero`, holding an `<a href="#clients">`. The text:
    - one venue: "Welcome to **Fingal**: our newest venue · See it →";
    - two venues: "Welcome to A and B: our newest venues";
    - three or more: "Welcome to our N newest venues".
  - **Click:** `preventDefault`, then `tile.scrollIntoView({block:'center', behavior: still ? 'auto' : 'smooth'})`, reusing `still` (line 972) if it's in scope, otherwise checking `matchMedia` locally. Then `tile.focus({preventScroll:true})` and add `pulse` for 1.6s.
  - **Text building:** uses the existing `el()` helper (1043); no innerHTML with venue names.

## What's new card (as with every release)
- `app/scripts/whatsnew-images.mjs`: add the prompt `'new-venue-highlight'`, an evening Scottish venue entrance with a small gold "New" ribbon in the same style as the others. Then generate `app/public/whatsnew/new-venue-highlight.webp`.
- `app/src/pages/people/_whatsnew.jsx`: a new top card dated `2026-11-20`, with icon `Sparkles` (or similar from lucide). The title is "New venues are welcomed on the website for a week", with 3–4 points:
  - automatic;
  - the banner and the New tile;
  - goes back to normal after 7 days;
  - fill in the photo, city and welcome line to make it shine.

## Tests (`functions/api/test/siteVenues.test.mjs`)
- `isNewVenue`: `null` returns false; 0 days returns true; 6.9 days returns true; 7.1 days returns false (with a pinned `now`).
- `publicTile({...v, website_since: recent}, [], now).isNew === true`; an old date has no `isNew` key.
- A source check: migration 069 has the backfill from `created_at` and the `BEFORE INSERT OR UPDATE` trigger. `venues.mjs` selects `website_since`.

## Release
1. Run `npm test` in `functions/api`.
2. Commit.
3. `openkbs fn deploy api`. The migration runs on the first call; to make it run, call `venues.public` once with curl.
4. `cd app && npm run build`.
5. Grep `site/app` for `6ij75kpgf7kiwtvwo3nke763dm0oejxo`.
6. Commit.
7. `openkbs site deploy`.
8. `git push`.

## Verification
- **Database:** `select name, website_since from venues order by website_since desc nulls last limit 4`. Fingal should be today and the others 7 Nov.
- **API:** `curl -X POST <api> -d '{"action":"venues.public"}' | jq '.tiles[]|select(.isNew)|.name'` should return only "Fingal".
- **Browser:** agent-browser on the live landing page, at desktop 1280 and phone 390. Check:
  - the ribbon is under the hero;
  - "See it" scrolls to Fingal's tile, which has the badge and is first in "Across Scotland";
  - the console has no errors.

  Then run `agent-browser close --all`.
- **Expiry:** covered by the 7.1-day unit test. Nothing needs doing on 27 Nov.

## Worth doing alongside (no code)
Fingal has no photo, city or welcome line yet, so its tile shows initials under "Across Scotland". Filling these in under the venue's Details → Website makes the highlight look better. I'll mention this to the user at the end.

## Parked
Calendar part 3 (tasks, own time blocks, repeating meetings, subscribe link) is paused for this request. Its spec is unchanged, and the code map is done.
