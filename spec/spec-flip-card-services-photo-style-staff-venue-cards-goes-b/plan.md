# Implementation plan: flip-card services, picture cards for staff and venues, "Goes by" names, silver logo button

The spec is in `spec/spec-flip-card-services-photo-style-staff-venue-cards-goes-b.md`. Approved assumptions: each staff card shows the avatar, the name and a compliance dot. A venue's picture is the uploaded photo, then the website photo, then initials.

## 1. Website: service flip cards (`site/index.html`)
- **Markup:** each `article.service` becomes `div.svc[role=button][tabindex=0][aria-pressed]`, built the same way as the venue tiles: `.inner > .face.front` (picture plus a title caption) `+ .face.back[aria-hidden]` (h3, description, Request-cover button).
  - Use the `svc` class, not `vt`, so the venue-tile code doesn't pick these up.
- **CSS:** reuse the `.vt` flip, hover-tint and reduced-motion rules by extending their selectors to `.vt, .svc`. Services get a 4:5 aspect ratio and 3 columns, falling to 1 column at ≤900px.
- **JS:**
  - Turn the tile setup into a function `flippers(selector)`, applied to `.vt` and to `.svc`. Each group keeps only one card flipped at a time.
  - The existing guard against `a, button` clicks already keeps the "Request cover" button from flipping the card back. The `[data-cover]` handler stays as it is.

## 2. "Goes by" names
**API: new `functions/api/lib/names.mjs`**
- `officerName(a='o')` returns `COALESCE(NULLIF(btrim(a.goes_by),''), a.first_name || ' ' || a.last_name)`.
- `userName(a='u')` returns `COALESCE(NULLIF(btrim(a.goes_by),''), a.name)`.
- `displayName(p)` is the JS version for rows that are already loaded.
- Pure functions with unit tests.

**Display-facing modules:** swap the ad-hoc `first_name || ' ' || last_name` and the `u.name AS …_name` selects for these helpers.
- Modules: rota, ops, dashboard, clock, clockProof, timesheets, shiftlog, incidents, assistant/orbVoice (Orb text), jobs, messages, everyday, notifications text, cover, reviews (created_by_name) and offboarding.
- Officer queries that join to `officers o` select `goes_by`.

**Legal and HR modules keep the full name:** hr, esign, payruns, money/invoices, contractsPack, documents, applicants, sia, email recipients.

**`officers.mjs` `shapeOfficer`:**
- `full_name` = First Last.
- `name` = displayName.
- Search keeps matching both.

**App:**
- `ui/format.js` gains `displayName(p)` (`goes_by || name`). `withGoesBy` is kept only for the profile header.
- Replace the existing `withGoesBy(name, goes_by)` calls in Staff, Rota picker, NewMessage, Thread and everyday `_parts` with the server-provided display `name`.
- `StaffProfile.jsx`: the title shows `full_name`, with a subtitle "Goes by Kris" when set.
- Avatar initials follow `name` automatically.

## 3. Staff cards (`pages/people/Staff.jsx`)
- Replace the two-column `List`/`Row` with a `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3`.
- Each card is a new `PersonCard`, a `Pressable card to=…`:
  - A square photo area (`aspect-square`). It shows `<img object-cover>` when `photo_url` is set; otherwise the initials, large, on the Avatar hue colours.
  - The name at the bottom, truncated to 2 lines.
  - A compliance dot, built from `ComplianceBadge` logic: green if ok, amber if SIA or right to work is due within 60 days, red if there are issues. It has an `aria-label` with the issue text.
- Put it in `ui/index.jsx` as `PhotoCard({ to, src, name, sub, dot, hue })` so venues reuse it.
  - Export `avatarHue(name)` from Avatar's hue logic.

## 4. Venue cards (`pages/money/Venues.jsx`, `VenueDetail.jsx`, `venues.mjs`)
- **The list** uses the same grid of `PhotoCard`, with `sub` = client name and an Inactive pill.
  - Picture order: `photo_url`, then `/img/opulence/clients/<site_client>-480.jpg` when `site_client` is set (`venues.list` already returns `v.*`), then initials.
  - The counts move off the card.
- **New API action** `venues.setPhoto` `{id, photo_key|null}` for company and security, scoped with `venueScope`. It writes `photo_key`, returns `photo_url` and is audited.
- **VenueDetail header:** "Change photo" and "Remove photo" for company and security.
  - Upload with `upload(file, 'venue')`, following the pattern in `StaffProfile.jsx:160`, through `PhotoEditor` for the crop.

## 5. Silver logo button (`layouts/Shell.jsx`, `index.css`)
- **`WebsiteButton`:** a 40px round `IconButton`-style `<a href="/" target="_blank" rel="noopener" aria-label="Open website">`, placed before `EverydayButton` in the top bar for every role.
- **Icon:**
  - A `span.silver-mark` drawn with CSS `mask: url(/app/brand/logo-gold-192.png) center/contain no-repeat`. This is the per-company mark the `Logo` component already uses.
  - Filled with `linear-gradient(135deg, #f4f6f8, #a9b0b8 40%, #e9edf1 55%, #8d949c)`, plus a `::after` light sweep animated every 6s.
  - The sweep is disabled under `prefers-reduced-motion`.
  - The silver hex values are confined to `index.css`, so the UI-lint raw-hex rule (TSX only) is unaffected.
- **Fallback:** a silver-tinted `Globe` icon if the mask image fails to load (`onError` on a hidden probe `img`).

## 6. Verify and ship
1. `cd functions/api && npm test`, with new tests for `officerName`, `userName` and `displayName`. Also `node -e` import of every changed module.
2. Grep for leftover `first_name || ' ' || last_name` and confirm each one is in the legal/HR list.
3. `cd app && npm run build`, with ui-lint at 67 issues or fewer.
4. **Mock UI:** extend `/tmp/mock` with `officers.list`, `venues.list` and `venues.get` responses (with and without photo, `goes_by` and `site_client`).
   - Screenshot Staff, Venues and the top bar, including the silver logo, at 1280 and 390.
5. **Landing:** a local static server. Hover-tint and flip each service card, and check that Request cover opens the form preset to that service.
6. `agent-browser close --all` and stop the servers.
7. **Deploy:** `openkbs fn deploy api -s 'rate(5 minutes)'` and `openkbs site deploy`.
   - Commit "feat: flip-card services, picture staff and venue cards, goes-by names, website button", push to origin with tags, then redeploy fn and site for the version tag.
   - Curl the live page and bundle.
8. No live data is changed.
