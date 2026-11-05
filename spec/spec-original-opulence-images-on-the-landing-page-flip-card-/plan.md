# Implementation plan: original Opulence images, flip-card venue tiles, client reviews pipeline

The spec is saved in `spec/spec-original-opulence-images-on-the-landing-page-flip-card-.md`. The work covers the static site (`site/index.html`), one new API module plus a migration, and one new app page with a small venue-form field.

## 1. Images: `scripts/site-images.sh`, run once with output committed
- Unzip `.uploads/e56878735_opulence-security-images_34df3704.zip` into `/tmp/opimg`.
- Use ImageMagick `convert` (AVIF and WebP read/write are available) to write `site/img/opulence/` files:
  - **Clients:** `clients/<slug>-480.webp`, `clients/<slug>-960.webp` and `clients/<slug>-960.jpg`, cropped to 4:3 with `-resize 960x720^ -gravity center -extent 960x720`, quality 78. The 23 slugs are listed in §2.
  - **Services:** `services/{manned-guarding,mobile-response,event-security}-{600,1200}.webp` plus a `.jpg` fallback, cropped to 4:3.
  - **Awards:** `awards/{40-under-40,innovation}-{400,800}.webp` plus `.jpg` (they are AVIF sources).
  - **Hero:** `background.jpg` replaces `hero-800/1600.{webp,jpg}` (same names, so the markup barely changes).
  - **Logo:** `Opulence.png` replaces `logo-192.png` and `logo-512.png`, and is also used for `og.jpg` (1200×630, logo centred on the dark ink colour).
  - **Favicon:** `favicon.ico` is copied to `site/favicon.ico`.
- The script stays in the repo so the images can be regenerated. The raw zip is not committed.
- Expected total: about 2 MB across every size, compared with 9.7 MB of originals.

## 2. One list of website clients: `functions/api/lib/siteClients.mjs`
- `export const SITE_CLIENTS = [{ slug, name, city: 'Edinburgh'|'Glasgow'|'Scotland', blurb, url }]` holds the 23 clients.
  - Names and blurbs are the ones on our page today.
  - Website URLs come from the original site. Carbon Lounge and Days Festival have none.
  - Slugs look like `angels-share`, `bar-50`, …, `shilling-brewing-co`, `yotel-glasgow`, `the-royal-yacht-britannia`.
- `export const isSiteClient = (s) => SITE_CLIENTS.some((c) => c.slug === s)`.
- The landing page tiles carry `data-client="<slug>"`. A unit test reads `site/index.html` and asserts that its `data-client` slugs are exactly `SITE_CLIENTS`, so the two cannot drift apart.

## 3. Migration `035_reviews.sql`
```sql
ALTER TABLE venues ADD COLUMN IF NOT EXISTS site_client text;
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client text NOT NULL,                       -- SITE_CLIENTS slug
  quote text NOT NULL,
  reviewer text NOT NULL DEFAULT '',
  reviewer_role text NOT NULL DEFAULT '',
  rating int CHECK (rating BETWEEN 1 AND 5),
  received_on date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','hidden')),
  sort int NOT NULL DEFAULT 0,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_client_idx ON reviews (client, status, sort);
```

## 4. API module: `functions/api/modules/reviews.mjs`
Registered in `index.mjs`. It follows the `def`/`pub` helpers in `modules/_def.mjs`, `audit()` from `lib/audit.mjs`, `notify`/`companyManagers` from `lib/notify.mjs`, and `venueScope` from `lib/scope.mjs`.

**Pure helpers (exported for tests):**
- `statusOnCreate(role)`: `'published'` for company managers, `'pending'` otherwise.
- `publicShape(r)`: returns `{ quote, reviewer, reviewer_role, rating, received_on }`.
- `groupPublic(rows)`: returns `{ [slug]: [...] }`, ordered by `sort` and then newest first.

**`myClients(user)`:**
- Company: all slugs.
- Venue manager: `SELECT DISTINCT site_client FROM venues WHERE id = ANY(scope) AND site_client IS NOT NULL`.
- Security: read-only, with no clients to add reviews for.

**Actions:**
- **`reviews.clients`** (company, security, venue): returns `SITE_CLIENTS` plus `mine` (the slugs the user may add reviews for) and the counts per client.
- **`reviews.list`** (company, security, venue):
  - Filters: `client`, `status` and `search` (ILIKE across quote and reviewer).
  - A venue manager sees only reviews for their own clients.
- **`reviews.save`** (company, venue):
  - **Create:** checks that the client is a site client and in `mine`.
    - The status comes from `statusOnCreate`.
    - A venue manager's review sets `venue_id` to their venue linked to that client.
    - When the review is pending, company managers get a bell notification: "New review to approve", `link: /company/reviews?status=pending`, `ref: review:<id>`.
  - **Edit:** company managers can edit any review. Venue managers can edit only their own pending reviews.
  - Text limits: quote 600 characters, names 80.
- **`reviews.setStatus`** (company only):
  - Moves a review between `published`, `hidden` and `pending`.
  - Publishing sets `approved_by` and `approved_at`, and withdraws the "to approve" notice (`DELETE FROM notifications WHERE ref = 'review:'||id`).
- **`reviews.delete`:**
  - Company managers can delete any review.
  - Venue managers can delete only their own pending reviews.
- **`reviews.reorder`** (company): `{ client, ids: [] }` writes `sort` in that order.
- **`reviews.public`**: `pub`, with no auth. It returns `groupPublic` of the published rows, run through `publicShape`.
- Every write calls `audit(user, 'review.create|update|publish|hide|delete', 'review', id, …)`.

**`venues.mjs`:**
- Add `site_client` to `VENUE_FIELDS`.
- Non-company users can't change it (`delete f.site_client`, as with `client_id`).
- Check it with `isSiteClient`, allowing null.

## 5. App
**`app/src/pages/money/Reviews.jsx`** (new):
- `Page` titled "Reviews", with the subtitle "Client reviews shown on the website".
- **Filters:** a `Segmented` control for All / Published / Pending / Hidden, read from `?status=`; a client `Select`; and a search input.
- **The list** is grouped by client. Each review row shows:
  - the quote
  - the reviewer and role
  - stars
  - a `Pill` with its status
  - actions for company managers: Publish, Hide, Edit, Delete, and up/down to reorder
- **The "Add review" button** opens a `Sheet` form (`useForm`) with:
  - Client (`Select`, locked when `mine` has one entry)
  - Quote (`Textarea`)
  - Reviewer
  - Role
  - Rating (five star buttons, with tap again to clear)
  - Date received
- **Venue managers:**
  - The notice reads "Reviews you add are checked by the office before they appear on the website."
  - If `mine` is empty, they see the `Empty` message "Ask the office to link your venue to the website".

**Routes and nav:**
- `main.jsx`: add a lazy `Reviews` route at `reviews` under `/company`, `/security` and `/venue`.
- `layouts/nav.js`:
  - Company: Clients & sites → Reviews, with the `Star`/`Quote` icon from lucide.
  - Security: Sites → Reviews.
  - Venue list: Reviews, after "My venue".

**`pages/money/VenueDetail.jsx` DetailsTab:** company managers get a `Select` "Website client" (placeholder "Not on the website"), with options from `reviews.clients`, saved as `site_client`.

**Security managers:** the page is read-only for them, with no add, edit or status buttons. The server enforces this as well.

## 6. Landing page: `site/index.html`
**Hero and logo:** the same markup, now pointing at the new files. Add `<link rel="icon" href="/favicon.ico" sizes="any">`.

**Services:** add a 4:3 `<picture>` at the top of each `.service` card (`loading="lazy"`, set width and height, rounded corners, a subtle gold border).

**Awards:** add a square `<picture>` at the left of each `.award`, in a two-column grid inside the card that stacks on phones.

**Clients:** the city text lists become `.tiles` grids, three columns on desktop, two on tablet and one on phones, under the same city `h3` headings. Each tile looks like this:
```html
<button class="tile" type="button" data-client="angels-share" aria-pressed="false">
  <span class="face front"><picture>…</picture><span class="cap"><b>Angels Share</b><small>Edinburgh</small></span></span>
  <span class="face back" aria-live="polite"><!-- filled by script: carousel or blurb + link --></span>
</button>
```

**CSS:**
- `.tile` uses `perspective: 1200px` and `.flip` applies `transform: rotateY(180deg)` to the inner faces (`backface-visibility: hidden`).
- Hover and focus-visible use a `::after` overlay `rgba(201,164,92,.18)` plus `mix-blend-mode: soft-light` and a gold border, with `translateY(-3px)`. Hover is applied only under `@media (hover:hover)`.
- `prefers-reduced-motion` switches to an opacity cross-fade.
- The back is the dark ink colour with a gold radial glow (the same look as `.award`).

**Script (vanilla, in the existing IIFE):**
- Each tile's back starts with its blurb and a "Visit venue" link, pre-rendered in the HTML, so the page works without JS or the API.
- When `#clients` comes into view (IntersectionObserver, or immediately as a fallback), fetch `API` with `{action:'reviews.public'}`. For each slug that has reviews, swap the back for a carousel:
  - `.track` uses `scroll-snap-type: x mandatory` with one slide per review, so swiping works natively on phones.
  - Prev/next arrow buttons and dots are kept in sync through the `scroll` event.
  - Stars render as ★ characters with an aria-label like "5 out of 5".
  - Text is inserted with `textContent` only, never `innerHTML`.
- **Click and keys:**
  - A click toggles `.flip` and `aria-pressed`, and unflips any other tile.
  - Clicks on the carousel arrows, dots or the venue link use `stopPropagation`, so they don't flip the tile.
  - Esc unflips.
  - The tile is a `<button>`, so Enter and Space work natively. Because the back holds interactive controls, the tile is a `div role="button" tabindex="0"` in practice. The arrows and links inside it are real buttons and links, with a key handler on the tile for Enter and Space.
- **Failure:** if the fetch fails, nothing changes, and the tiles keep their blurb backs.
- **CORS:** `reviews.public` goes through the same Lambda URL as `demo.request`, so CORS is already handled by `CORS` in `index.mjs`.

## 7. Tests: `functions/api/test/reviews.test.mjs`
- `statusOnCreate`: company → published; venue → pending.
- `publicShape` drops `id`, `created_by`, `venue_id` and `status`.
- `groupPublic` groups and orders by `sort`, then newest first.
- The landing page's `data-client` slugs equal `SITE_CLIENTS` slugs, each tile has a matching image file, and no slug appears twice.

## 8. Verify and ship
1. `cd functions/api && npm test`, with all 159 tests plus the new ones passing.
2. `cd app && npm run build`, with ui-lint at 67 issues or fewer.
3. **Mock UI** (the `/tmp/mock` server, extended with `reviews.*` responses):
   - The Reviews page: add a review as a venue manager and it shows Pending; Publish it as a company manager; the "Website client" select on the venue form.
4. **Landing page:** run `site/index.html` through a local static server, with the `reviews.public` mock pointed at by a temporary `API` override in the console.
   - Hovering tints a tile gold, and a click flips it to the carousel. The arrows, swipe and Esc all work.
   - A tile with no reviews shows its blurb back.
   - The service and award images show.
   - Check 1280 and 390 widths, then run `agent-browser close --all`.
5. **Ship:**
   - Run `openkbs fn deploy api -s 'rate(5 minutes)'`. Migration 035 runs.
   - `openkbs site deploy`.
   - Commit `feat: original Opulence images, flip-card venue tiles, client reviews` with `site/`, `spec/` and `scripts/`.
   - Push to origin with `--tags`, then re-run the fn deploy so it gets a version tag.
   - Curl the live `/`, check that the image URLs return 200, and call `reviews.public`, which should return `{}` on live.
6. **No live data is created.** Company managers link venues to website clients and add reviews themselves.
