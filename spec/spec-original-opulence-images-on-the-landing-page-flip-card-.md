# Spec: Original Opulence images on the landing page, flip-card venue tiles, and a client reviews pipeline

## Context
- The landing page is at `site/index.html` and is served at https://dtsh89leafq7z.cloudfront.net/. Today it uses only our own hero photo and logo:
  - The "Who we protect" clients are a plain text list grouped by city.
  - The services and awards cards have no images.
- The user uploaded a zip of every image from the original site, https://www.opulence-security.com/. I checked it against that page. It contains:
  - the hero `background.jpg`
  - `Opulence.png` logo and `favicon.ico`
  - 23 client photos, one per client in our list (file names differ slightly, e.g. "Shiling", "yotl")
  - 3 service photos
  - 2 award images (`40under40.avif`, `innovation.avif`)
- The original site has **no client reviews**. The app's `venue_feedback` holds private star ratings of officers' shifts and isn't for publishing. Reviews therefore need a new pipeline: managers record reviews that clients gave them, and the landing page shows them.

## What the user gets

### 1. Landing page images
- Every image from the zip goes on the landing page, in the same places as on the original site:
  - **Client photos** on the venue tiles.
  - **Service photos** on the three service cards.
  - **Award images** on the two award cards.
  - **The original hero background** replaces our current hero photo.
  - **The original logo and favicon.** The logo is used in the header, as the favicon and app icons, and in the structured data. The "Powered by orbsolutions.co.uk" footer stays.
- Images are resized and converted to WebP with JPEG fallbacks, with set widths and heights and lazy loading below the fold, so the page stays fast. Originals of up to 1.4 MB are not shipped as they are.
- File names are cleaned up to lowercase slugs, e.g. `img/opulence/clients/shilling-brewing-co.webp`.

### 2. Venue tiles
- The "Who we protect" list becomes a grid of photo tiles. They stay grouped under the Edinburgh, Glasgow and Across Scotland headings. The front shows the photo, name and city.
- **Hover** (on devices with a mouse): the tile is tinted a slight gold over the photo (#C9A45C at low opacity) with a gentle lift. Keyboard focus shows the same tint.
- **Click or tap** (or Enter/Space): the tile flips around in 3D to show its back. Clicking again, or pressing Esc, flips it back. Only one tile is flipped at a time.
- **Back of a tile with reviews:** a horizontal carousel of that client's published reviews. Each slide shows:
  - the quote
  - the person's name and role, e.g. "Sarah M., General Manager"
  - the star rating, if one was given

  It also has arrows and dots, and swipes on phones. It never moves on its own.
- **Back of a tile with no review yet:** the venue's one-line description and a "Visit venue" link to its website, as on the original site. (Assumption: the user didn't answer this question.)
- Accessibility:
  - Tiles are buttons with `aria-pressed`.
  - The back is read out when the tile is flipped.
  - `prefers-reduced-motion` uses a cross-fade instead of the 3D flip.

### 3. Reviews in the app: one "Reviews" page
- **Where:** a new page under CLIENTS & SITES → **Reviews**, for company managers and venue managers. Security managers can view it only.
- **Adding a review.** The form has:
  - Client: one of the 23 website clients. A venue manager's own client is filled in and locked.
  - The quote.
  - The reviewer's name.
  - Their role or position.
  - An optional rating from 1 to 5.
  - The date received.
- **Approval:**
  - A review added by a **venue manager** is saved as **Pending**. Company managers are notified in the bell with "New review to approve" and must **Publish** it before it appears on the site.
  - A review added by a **company manager** is published straight away.
  - Company managers can **Hide**, **Edit**, **Delete** and **reorder** reviews within a client. These are the ones shown first in the carousel.
- **The page lists every review.** You can filter it by client and by status (Published / Pending / Hidden) and search it. Venue managers see only their own client's reviews.
- **Linking app venues to website clients.** On the venue edit form, a company manager picks the "Website client" for that venue. This is how a venue manager's reviews land on the right tile. (Assumption: the recommended option was taken.) Until a venue is linked, its venue managers see "Ask the office to link your venue to the website".
- Every add, publish, hide and delete is written to the Audit log.

### 4. The website loads reviews live
- A public, read-only API action returns only **published** reviews, grouped by website client. Each review returns just the quote, name, role, rating and date: no emails, no IDs, no venue internals.
- The landing page fetches them when the clients section comes into view. Publishing or hiding a review shows on the site within a minute, with no redeploy.
- If the request fails, every tile falls back to its description back.
- The list of 23 website clients lives in one shared place, used by both the API (to check reviews against) and the page. That list holds each client's slug, name, city, description, website and image.

## Out of scope
- Venue clients writing reviews themselves through a public form. The pipeline is staff-entered only.
- Importing Google or Trustpilot reviews.
- Changing the stats strip or any other section's copy.
- The pending live brand colour (#C9A45C) question.

## Data and permissions
- A new `reviews` table: client slug, quote, reviewer name, role, rating, received date, status (pending/published/hidden), sort order, created_by, approved_by and timestamps.
- A new `venues.site_client` column holds the website client slug.
- The only public endpoint is the published-reviews list. Every other action needs a signed-in company or venue manager, and venue managers are restricted to their own linked client.
- **No reviews are added on live by me.** The section shows description backs until the user's team adds reviews.

## Verification
- API unit tests:
  - Pending versus published rules by role.
  - A venue manager can't add a review for another client.
  - The public action returns only published reviews, with only the public fields.
- App build: ui-lint stays at the 67-issue baseline or below.
- Mock UI:
  - Add a review as a venue manager: it's Pending, and a company manager publishes it.
  - The landing page in the browser shows the photos.
  - Hovering tints a tile gold, and a click flips it to the carousel.
  - A tile with no reviews shows its description back.
  - Check the phone width as well, then run `agent-browser close --all`.
- Deploy the API (the migration runs), deploy the site, commit, push to origin, and check that the live bundle and images load.
