# Implementation plan: venue managers with several venues (home-page venue tiles, app-wide chosen venue)

## Context
The spec is approved and saved at `spec/spec-venue-managers-with-several-venues-venue-tiles-on-the-h.md`.

Venue managers who run several venues already see all of them, because the server's `venueScope` covers every linked venue. What's missing is a way to go into one venue and stay there across pages. The user asked for **venue tiles on the home page**.

A few server paths also pick the "first" venue at random, and two small notification bugs need fixing.

## Server (functions/api)

**1. `lib/scope.mjs`**
- Add `ORDER BY venue_id` to both scope queries so the order is stable.
- Add `export async function narrowScope(user, venueId)`:
  - returns `venueScope(user)` when `venueId` is empty;
  - otherwise calls `assertVenue`, then returns `[venueId]`.

**2. `modules/dashboard.mjs` `venueDash(ctx)`**
- `const scope = await narrowScope(ctx.user, b.venue_id)`. The action passes `b` through: `dashboard.get` gives `(b, ctx)` to venueDash.
- `liveSummary` passes `{ venue_id }` to `live.board`.
- `venues` stays the full list (from `venueScope`), so the tiles always show every venue. Add `logo_key`, and map it through the existing logo URL helper used by `venues.mjs` (check `photoUrls`/logo).
- **New `tiles`**, only when the full scope has more than one venue: one grouped query per measure, keyed by venue_id, over the full scope.
  - on site now / late or no-show: reuse the `live.board` rows already fetched (call `live.board` once with no venue, count per `venue_id`, and derive the narrowed `live` summary from the same rows);
  - next shift: `SELECT DISTINCT ON (venue_id) venue_id, starts_at … ORDER BY venue_id, starts_at`;
  - timesheets to sign: approved timesheets, grouped;
  - open cover requests: pending, grouped;
  - incidents in the last 7 days: grouped.

**3. `modules/ops.mjs` `venueRequests.create`**
- Replace `b.venue_id || scope[0]` with:
  - `b.venue_id`, if given;
  - else the only venue, when scope has length 1;
  - else `pickVenueFromText(text, venues)`.
- **New pure helper in `lib/venuePick.mjs`:** `pickVenueFromText(text, venues)` squashes names (lowercase, no punctuation) and returns the one venue whose name appears in the text. If none or more than one match, it returns null.
- **When there is still no venue:**
  - `draft` mode: skip the `upcoming` query and venue name in the prompt (use "a client venue"), and return the draft with `venue_id: null`. The RequestForm already asks for a venue when `venues.length !== 1` (`manager/_cover.jsx:78`).
  - non-draft mode: return `{ status: 'question', reply: 'Which venue is this for? ' + names }`.

**4. `ops.mjs` `feedback.submitAdhoc`**
- `const scope = await narrowScope(user, b.venue_id)`, then use it in the shift lookup.

**5. `modules/reviews.mjs` `reviews.save`**
- If `b.venue_id` is set: `assertVenue`, and check that the venue's `site_client = b.client`.
- Otherwise keep the `LIMIT 1` match, adding `ORDER BY name`.

**6. `modules/timesheets.mjs:224`**
- The link is chosen by the querier's role: `(await one('SELECT role FROM users WHERE id=$1',[t.queried_by]))?.role === 'venue'`.

**7. `modules/bans.mjs` (~163 and ~206) "Ban to confirm"**
- Add `...await venueContacts(venue_id)` to the recipients, excluding `user.id`.
- `portalLink` already rewrites `/officer/shifts/` to `/venue/logs/` for venue users.

**8. Staff setup**
- `lib/staffSetup.mjs` `cleanVenueManager`: accept `venue_names[]` (each `str(…,120)`, de-duplicated, max 10).
  - Keep `venue_name` as the first name, so old submissions and views still work.
  - The error stays when there are none.
- `modules/staffSetup.mjs`: `matchVenue` matches any of `d.venue_names || [d.venue_name]`. The error text at :112 lists the names.

**Lists that already accept `venue_id`:** `live.board`, `shiftlog.list`, `invoices.list`, `analytics.venue`, `timesheets.list`, `incidents.list`, `bans.list`, `cover.list`/`venueRequests.list`, `comments.list`. Confirm each while editing pages. Add `if (b.venue_id) await assertVenue(...)` where missing. (Scope is ANDed anyway.)

## App (app/src)

**9. New `app/src/venue.jsx`**
- `VenueProvider`:
  - only active for `user.role === 'venue'`;
  - loads `useApi('venues.list')`;
  - keeps `venueId` in state, initialised from `localStorage['orb.venue']`;
  - drops it if it is not in the list, or if the list has one venue;
  - writes it back on change.
- `useVenue()` returns `{ venues, venueId, setVenueId, many, venue }`. Outside the provider (manager/office pages) it returns `{ venueId: '', many: false }`, so shared pages can call it safely.
- `VenueChip`:
  - a `Pressable` chip showing `venue?.name || 'All venues'` with a ChevronDown;
  - it opens `Sheet size="sm"` with a `List` of rows: All venues, then each venue, with a check on the current one;
  - it renders nothing unless `many`.
- **Wiring:**
  - `main.jsx`: wrap the `/venue` route's `<Shell />` in `<VenueProvider>`;
  - `layouts/Shell.jsx` top bar: render `<VenueChip />` before the NotificationBell when `user.role === 'venue'`, so it shows on every venue page on both phone and desktop.

**10. `pages/money/VenueDashboard.jsx`**
- `useApi('dashboard.get', { venue_id: venueId || undefined }, { poll: 30000 })`. Check that `useApi` refetches when the body changes; if it doesn't, key the component on `venueId`.
- When `d.tiles`, add a **Venue tiles** grid at the top:
  - "All venues" first, then one `Tile` per venue with the logo or Building2 icon, name and postcode;
  - stats rows: on site, late/no-show in red, next shift time;
  - small `Pill`s for to sign, cover and incidents (7 days);
  - the selected tile gets a `ring-2 ring-accent`, and `onClick` calls `setVenueId`.
- Subtitle: `venue?.name || (multi ? 'All N venues' : d.venues[0].name)`.
- The existing "Your venues" section is removed when the tiles show, and stays for one venue.
- MonthTile passes `venue_id`.
- The 'multi' venue-name suffix on rows only applies when no venue is chosen.

**11. Venue-side pages**
- **Pattern:** `const { venueId, many } = useVenue()`; `const isVenue = user.role === 'venue'`. Pass `venue_id: venueId || undefined` to the list call. For venue users, hide the page's own venue Select and use `venueId` instead of the local or URL state. Manager behaviour is unchanged.
  - `venue/Rota.jsx`: replace local `venueId`.
  - `shared/Live.jsx`: pass `venue_id` to `live.board` (venue role only).
  - `shift/ShiftLogs.jsx`: pass `venue_id`; add `venue_name` to the row subtitle when `many && !venueId`.
  - `shift/Bans.jsx`:
    - `target = venueId || picked || (single venue)`;
    - under All, the Log ejection and Ban someone buttons stay visible, and their sheets get a venue `Select` (required) when there is no target.
  - `shared/Timesheets.jsx`, `shared/Incidents.jsx`, `money/Feedback.jsx`, `money/Analytics.jsx`: use `venueId` for venue users. The Incidents dropdown is also hidden for one-venue users, which fixes the inverse behaviour.
  - `money/Invoices.jsx` `VenueInvoices`: pass `venue_id`, and show `venue_name` on rows when `many && !venueId`.
  - `venue/Site.jsx`:
    - with a venue chosen, or only one venue, show that venue's pack and documents (remove the Segmented control);
    - under All, show a tile grid of venues, and tapping one calls `setVenueId`.
  - `venue/_feedback.jsx`:
    - GiveFeedbackSheet pre-selects `venueId`;
    - RateStaffSheet passes `venue_id: venueId || undefined` to `feedback.submitAdhoc` (or the venue of the officer row, if the row carries it).
  - `manager/_cover.jsx` RequestForm: the `venue_id` default becomes `draft?.venue_id || venueId || (single)`.
  - `messages/Thread.jsx` `toCover`: send `venue_id: venueId || undefined`.
  - `money/Reviews.jsx`: send `venue_id: venueId` when set.
- **`layouts/nav.js`:** the "My venue" label stays; Site.jsx's title becomes "My venues" when `many && !venueId`.

**12. Staff setup UI**
- `public/StaffForm.jsx`:
  - the `venue_names` array in form state, starting as `['']`;
  - an Input per name, with an "Add another venue" link button (max 10) and remove buttons;
  - submit sends `venue_names` and `venue_name: venue_names[0]`.
- `people/StaffSetup.jsx`: "Venues they wrote" shows `(d.venue_names || [d.venue_name]).join(', ')`.
- `/tmp/ssmock` uses `cleanVenueManager`, so it follows automatically.

**13. What's new**
- Card `'venue-tiles'` (icon Building2) at the top of `_whatsnew.jsx` (November 2026, 2026-11-07).
- Its prompt goes in `scripts/whatsnew-images.mjs`. Run `node app/scripts/whatsnew-images.mjs venue-tiles` and commit the .webp.

## Tests: `functions/api/test/venues-multi.test.mjs`
- `pickVenueFromText`: one name matches; none; two match gives null; case and punctuation are ignored.
- `cleanVenueManager`:
  - `venue_names` are cleaned and de-duplicated, with `venue_name` equal to the first;
  - a lone `venue_name` still works;
  - empty gives the error.
- Roles: `feedback.submitAdhoc` is `['venue']`. `dashboard.get` is unchanged.
- `npm test` passes, and ui-lint stays at 67 or below.

## Verification
- **Local:** extend /tmp/ssmock.mjs:
  - add a `ven` token (role venue) with `venues.list` returning The Loft and Bar Nova;
  - `dashboard.get` returns `venues`, `tiles` and data that varies with `venue_id`, and is logged;
  - add `live.board`, `shiftlog.list`, `invoices.list`, `venueRequests.create` and `bans.list` stubs that log `venue_id`.
- **Browser on vite :5177:**
  - tiles show, and tapping Bar Nova narrows the home page;
  - the chip shows "Bar Nova", and Rota, On site, Shift logs and Invoices send that `venue_id` (check `/log`);
  - the choice survives a reload;
  - All venues shows venue names on rows;
  - Bans under All asks for a venue;
  - a one-venue token shows no tiles and no chip.
- Run `agent-browser close --all` when done.

## Release
1. Commit the source (feat: …).
2. `openkbs fn deploy api -s 'rate(5 minutes)'`. No migration is needed.
3. `cd app && npm run build`, then commit `site` (build: …).
4. `openkbs site deploy`, then `git push origin master --tags`.
5. No test data on live. Ask the user to check with a real manager who has several venues.
