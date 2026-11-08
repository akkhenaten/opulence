# Plan: Ejections register tab on Incidents (managers only)

## Context
This item was deferred from Release D. Managers (company and security) have no single place that lists every ejection and refusal across venues. Today they only see them one venue at a time, under Venue → Records → "Ejections & bans". The venue portal already has its own Ejections page at `/venue/bans`.

**What the code already has:**
- Ejections are rows in `customer_bans` with `kind='ejection'`.
- `bans.list` (`functions/api/modules/bans.mjs:114`) already supports `kind:'ejection'` with no `venue_id`.
  - It is scoped by `venueScope(user)`: company sees every venue, security sees only its own venues.
  - It returns rows newest first, up to 300.
- **Decision: don't add `incidents.ejections`.** It would duplicate `bans.list`, against the "one job, one place" rule. The new tab reuses `bans.list` and the existing `BanRegister` UI.

## Changes

**1. Sections** (`app/src/ui/hubs.js`)
- Add a manager section: `incidents: { title: 'Incidents', tabs: [{ to: 'incidents', label: 'Reports' }, { to: 'ejections', label: 'Ejections register' }] }`.
- Company and security both get it. Venue and officer portals are untouched.

**2. Route** (`app/src/main.jsx`, `managerRoutes`)
- Add `<Route path="ejections" element={<Ejections />} />`, lazy-loaded through `P(() => import('./pages/shift/Bans.jsx').then(...))`, or as a named default export `Ejections` from a small new file `pages/shift/Ejections.jsx`.
- The Incidents nav item stays as it is. The hub's tab row shows Reports / Ejections register.

**3. Page** (new `app/src/pages/shift/Ejections.jsx`)
- `<Page title="Incidents">` (the hub title, as other tabs do) wraps `<BanRegister all />`.
- It has a ⋯ `MoreMenu` with "Export to spreadsheet", using `downloadAction('bans.exportCsv', { venue_id, kind })`.

**4. `BanRegister` manager mode** (`app/src/pages/shift/Bans.jsx`)
- This mode is used when the role is company or security and no `venueId` prop is passed.
- A venue filter Select ("All venues" plus `venues.list`) is held in local state. `bans.list` gets `venue_id` only when one is picked.
- The "Log ejection" and "Ban someone" buttons show with "All venues" too. `BanSheet` gets `venues={list}`, so its existing `askVenue` picker (`_bans.jsx:108`) asks which venue.
- Each card already shows `venue_name` (from `COLS`), so the register reads across venues.
- Nothing changes for the venue portal or the VenueDetail tab, which pass `venueId` or use `useVenue`.

**5. CSV export** (`functions/api/modules/exports.mjs`)
- New action `bans.exportCsv`, MGR only. It reuses `actions['bans.list'].fn(b, ctx)`.
- Columns: occurred, venue, outcome (Ejected / Refused entry), name, description, category, reason, banned (kind/status/ends_on), logged by.
- There is no officer pay or contact data, and no photo.
- Register it in `orbCatalog.mjs` only if exports are catalogued there; otherwise leave it out.

**6. What's new**
- Add a card `ejections-register` at the top of UPDATES in `people/_whatsnew.jsx`: icon Ban, "Every ejection in one register".
- Add its prompt in `app/scripts/whatsnew-images.mjs` (dark navy and gold), generate the webp and view it.

## Tests (`functions/api/test/streamline.test.mjs`)
- `hubTabs('incidents', {role:'security'})` and `{role:'company'}` both include `/…/ejections`. `hubTabs('incidents', {role:'venue'})` is empty. This imports `app/src/ui/hubs.js`, which is pure.
- `bans.exportCsv` roles are exactly company and security, so venue and officer are rejected.
- The CSV columns for ejections hold no `pay`- or `officer`-flagged fields.

## Verification
- `cd functions/api && node --test test/*.test.mjs`: all pass (330 plus the new tests).
- `cd app && npm run build` builds cleanly.
- Release order:
  1. Commit with explicit paths (no `spec/`).
  2. `openkbs fn deploy api`.
  3. Build.
  4. `git add site/` and commit "build: site with the ejections register".
  5. `openkbs site deploy`.
  6. Live check: the bundle has 6ij75kpgf7 and not hopedp5.
- No live data is changed and nothing is sent. Logging an ejection is not exercised against prod.
