# Spec: venue managers with several venues — venue tiles on the home page, every page follows the chosen venue

## Context
Some venue managers run more than one venue. The user wants them to see all their venues, and to move between them using **venue tiles on their home page**. This spec covers the whole venue-manager side, from invite to every page.

**What already works**
- **Server:** a manager's venues live in `venue_contacts`. `venueScope(user)` (`functions/api/lib/scope.mjs:5`) returns all of them, and nearly every action filters with `= ANY(scope)` or `assertVenue`, so data from all their venues is already allowed.
- **Alerts:** these go to every manager of a venue (`venueContacts`, `lib/notify.mjs:125`).
- **Office side:** invite, user edit and Staff setup all let the office tick several venues (`_access.jsx` Chips, `setVenues`).

**What's missing or wrong**
1. **No way to "go into" one venue.** Pages either mix all venues together (Overview, On site, Shift logs, Invoices) or each has its own filter that isn't kept between pages:
   - Rota, Timesheets, Bans and Analytics keep the filter in local state;
   - Incidents and Feedback keep it in `?venue=`;
   - My venue has a Segmented picker that always defaults to the first venue.
2. **"Turn into cover request" files against a random venue.** `venueRequests.create` (`ops.mjs:1227`) uses `scope[0]`, and the scope has no `ORDER BY`.
3. **Reviews and ad-hoc ratings pick an arbitrary venue.** `reviews.save` (`reviews.mjs:130`) and `feedback.submitAdhoc` (`ops.mjs:1360`) use `LIMIT 1` with no way to choose.
4. **Rows lack the venue name.** Shift logs and Invoices don't say which venue a row is for. Incidents shows a venue filter even to one-venue managers, while every other page hides it.
5. **Small bugs:**
   - `timesheets.answer` (`timesheets.mjs:224`) checks the replier's role instead of the querier's, so a venue manager's reply notice has no link.
   - Ban confirmations (`bans.mjs:163,206`) don't tell venue contacts, although they can confirm.
6. **One venue only on the setup form.** The public staff setup form takes a single venue name.

## Behaviour

### Home page: venue tiles (managers with 2+ venues)
- The top of `/venue` becomes a grid of **venue tiles**, one per venue, plus an **"All venues"** tile first.
- **Each tile shows:**
  - the venue logo (`logo_key`) or a building icon, the name and the town/postcode;
  - live counts: **on site now**, **late/no-show** (in red if any), **next shift** time;
  - badges for **timesheets to sign**, **open cover requests** and **incidents in the last 7 days**.
- **Tapping a tile picks that venue.** The tile gets a ring, the rest of the home page (On site, upcoming shifts, cover, incidents, To sign, Invoices, This month) re-loads for that venue only, and the choice is remembered.
- **"All venues"** shows everything together, as today, with the venue name on every row.
- **One-venue managers see no change:** no tiles and no chip, just their venue as today.

### The chosen venue follows them everywhere
- The choice is held app-wide (a small context plus localStorage `orb.venue`), so it persists across pages and reloads on that device.
- **Venue chip:** every venue-side page shows a chip at the top: "Bar Nova ▾" or "All venues ▾".
  - Tapping it opens a short list of their venues plus "All venues", to switch without going home.
  - It is hidden for one-venue managers.
- **Pages that follow the choice:**
  - Overview, On site, Rota and Requests, Shift logs, Ejection log (Bans), Timesheets, Incidents, Invoices, Feedback, Analytics and My venue.
  - Each page's own venue dropdown is removed for venue managers and replaced by the chip.
  - Managers' and office pages keep their dropdowns and are not changed.
- **Under "All venues":**
  - lists show every venue, with the venue name on each row (added to Shift logs and Invoices);
  - actions that need one venue ask which venue (venue dropdown in the sheet) instead of being hidden. This applies to Request staff, Log ejection, Ban someone and Give feedback.
- **One venue chosen:** those actions pre-fill it.
- **My venue** (nav label becomes "My venues" for 2+):
  - with a venue chosen, it shows that venue's site pack and documents;
  - under "All venues", it shows a tile per venue, and tapping one chooses it.
- **Out-of-date choice:** if a remembered venue is no longer theirs (unlinked), it falls back to "All venues" silently.

### Server fixes
- **`venueRequests.create`:**
  - with several venues and no `venue_id`, the AI is given all their venue names and asked which one the message means;
  - if it can't tell, the draft comes back with no venue and the cover form asks them to pick one;
  - it never guesses `scope[0]`;
  - "Turn into cover request" passes the chosen venue when one is chosen.
- **`reviews.save`** accepts `venue_id`, checked with `assertVenue`. It only falls back to the single match.
- **`feedback.submitAdhoc`** accepts `venue_id` and uses it to pick the shift.
- **`venueScope`** gets `ORDER BY` so the order is stable everywhere.
- **`timesheets.answer`** links to `/venue/timesheets` when the person who raised the query is a venue user.
- **Ban confirmation notices** also go to that venue's contacts.
- **`dashboard.get`** accepts an optional `venue_id` (checked with `assertVenue`) and returns `tiles`: per-venue counts in one grouped query each, not one query per venue.

### Staff setup form
- The venue manager's form keeps "The venue you manage", plus **"Add another venue"** for extra names.
- Staff setup on the office side matches all the typed names and pre-ticks them. The office still confirms them in the "Link them to" chips, as today.

## Files
- **Server:**
  - `functions/api/lib/scope.mjs` (ORDER BY);
  - `modules/dashboard.mjs` (`venueDash` venue_id plus tiles);
  - `modules/ops.mjs` (venueRequests.create, feedback.submitAdhoc);
  - `modules/reviews.mjs`, `modules/timesheets.mjs:224`, `modules/bans.mjs`;
  - `lib/staffSetup.mjs` plus `modules/staffSetup.mjs` (`venue_names[]`, keeping `venue_name` for old submissions).
- **App:**
  - new `app/src/venue.jsx` (`VenueProvider`, `useVenue()` → `{ venues, venueId, setVenueId, many }`, built from `venues.list`, and a `<VenueChip/>`), mounted in the venue route group in `main.jsx`;
  - `pages/money/VenueDashboard.jsx` (tiles);
  - venue-side pages: `venue/Rota.jsx`, `venue/Site.jsx`, `shared/Live.jsx`, `shift/ShiftLogs.jsx`, `shift/Bans.jsx`, `shared/Timesheets.jsx`, `shared/Incidents.jsx`, `money/Invoices.jsx` (VenueInvoices), `money/Feedback.jsx`, `money/Analytics.jsx`, `venue/_feedback.jsx`, `manager/_cover.jsx` RequestForm, `messages/Thread.jsx`, `money/Reviews.jsx`;
  - `layouts/nav.js` label;
  - `public/StaffForm.jsx`, `people/StaffSetup.jsx`.
- **Pattern for pages:** `const { venueId } = useVenue()` is used only when `user.role === 'venue'`. It is passed as `venue_id` to the page's existing API call (which already accepts it). The page's local dropdown is hidden for venue users.
- **List actions without `venue_id` today:** `live.board`, `shiftlog.list`, `invoices.list`. Add an optional `venue_id` filter, checked with `assertVenue`.
- **What's new:** a card 'venue-tiles', with its own AI picture (prompt in `app/scripts/whatsnew-images.mjs`, newest first in `_whatsnew.jsx`).

## Tests
- `functions/api/test/venues-multi.test.mjs`:
  - `venueRequests.create` never falls back to `scope[0]` when there are 2+ venues and no id;
  - `reviews.save` and `feedback.submitAdhoc` honour `venue_id` and refuse a venue outside scope;
  - `cleanVenueManager` takes `venue_names[]`.
  - Pure parts are tested directly; roles are tested via `actions[k].roles`.
- `npm test` passes and ui-lint stays at 67 or below.

## Verification
- **Local mock** (/tmp/ssmock.mjs, vite :5177): a 'venue' token linked to The Loft and Bar Nova, then check:
  - home tiles show the counts, and tapping one narrows the home page;
  - the chip appears on Rota, On site, Shift logs and Invoices, and follows the choice;
  - the choice survives a reload;
  - "All venues" shows venue names on rows;
  - Request staff and Log ejection ask for a venue under All;
  - a one-venue token shows no tiles and no chip.
- Run `agent-browser close --all` afterwards.
- **Live:** deploy API → site → push. No test data on live; the user checks with a real multi-venue manager.
