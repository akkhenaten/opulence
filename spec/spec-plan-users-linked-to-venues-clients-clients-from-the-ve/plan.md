# Implementation plan: client contacts, new client from the venue page, venue Feedback tab, feedback → review

The spec is saved in spec/spec-plan-users-linked-to-venues-clients-clients-from-the-ve.md. This plan covers how it gets built.

## 1. Database: `functions/api/db/migrations/037_client_links.sql`
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_client_idx ON users (client_id);
ALTER TABLE venue_comments ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES reviews(id) ON DELETE SET NULL;
```

## 2. API

### `modules/users.mjs`
- The venue list the app sends stays the source of truth (`setVenues` is unchanged), so the pre-ticking happens in the app (see `AccessFields` below).
- New `checkClient(t, role, client_id)`:
  - Allowed only for the `venue` and `security` roles; otherwise the value is null.
  - The client must exist (400 "Client not found").
- `users.invite` writes `client_id` after `createInvite`, using `UPDATE users SET client_id`.
- `users.update` takes `client_id` when `'client_id' in b`. It's added to `fields` once checked.
- `users.list` gains `u.client_id` and `(SELECT name FROM clients WHERE id = u.client_id) AS client_name`.
- Audits stay as they are; `client_id` will show up in the fields.

### `modules/venues.mjs`
- `clients.list` gains `contact_count`. That's users whose `client_id` is this client, together with venue contacts of its venues, counted DISTINCT.
- New `clients.get` (CO). Returns the client, plus:
  - `venues`: id, name, active, site_client
  - `contacts`: users with `client_id` = this client, or rows in `venue_contacts` for its venues. Each has id, name, email, role, status, an array of venue names, and a `linked` flag that is true when `client_id` matches.
- New `clients.setVenue {venue_id, client_id|null}` (CO). It runs `UPDATE venues SET client_id` and audits `venue.update`.
- `clients.save` already returns the row, so it needs no change.

### `modules/reviews.mjs`
- Pull the insert and the pending notification out of `reviews.save` into an exported `insertReview(user, {client, venue_id, quote, reviewer, reviewer_role, rating, received_on}, status)`.
- `reviews.save` then calls it; its behaviour doesn't change.

### `modules/comments.mjs`
- Exported pure helper `canPromote(c, venue)`. It returns null when the feedback can be promoted, or an error message:
  - "Only praise can become a review"
  - "Already used as a review"
  - "Link this venue to a website tile first (venue → Details → Website client)"
  - "Add a comment first"
- New `comments.toReview {id, quote?, reviewer?, reviewer_role?}` (CO):
  - Loads the comment, the venue's `site_client` and the name of whoever logged it.
  - Calls `canPromote`, then `insertReview(..., 'pending')` with a quote of at most 600 characters, matching the limit in `fields()`. `reviewer` defaults to the created_by name, and `reviewer_role` to "Venue manager".
  - Sets `venue_comments.review_id` and audits `comments.to_review`.
- `LIST_SQL` gains `v.site_client` and `rv.status AS review_status`, via `LEFT JOIN reviews rv ON rv.id = c.review_id`.
- `comments.options`: when `b.venue_id` points to an inactive venue in scope, add it to `venues`. The list query stays active-only.

## 3. App

### New `app/src/pages/money/_client.jsx`
- `ClientSelect({ label, value, onChange, clients, onCreated })`. It wraps `Select` with an extra option `__new` labelled "+ New client…". Picking that option opens `NewClientSheet` instead of setting the value.
- `NewClientSheet`:
  - Fields: name, billing email, address, VAT.
  - Calls `clients.save`, then `onCreated(row)`. The caller reloads `clients.list` and sets the id.
- `ClientForm` from `Venues.jsx` moves here so it can be reused. It gains a Venues section and a Contacts section when `client.id` is set, both using `clients.get`:
  - Venues: Rows that link to `${base}/venues/:id`, with an "Inactive" pill where needed. "Add venue to this client" is a Select of venues that have no client, or another client's (marked), and saves through `clients.setVenue`.
  - Contacts: Rows showing name · role · venues, with "Invite contact" opening `InviteSheet` with `{ role:'venue', client_id }` preset.

### New `app/src/pages/people/_access.jsx`
I'm moving these out of Settings.jsx so VenueDetail and the Clients page don't pull in the whole Settings bundle:
- `InviteSheet`, `ROLE_HINT`, `USER_ROLES` and a new `AccessFields`.
- `AccessFields({ role, v, set, venues, clients, onClientCreated })`:
  - Shows `ClientSelect` for the venue and security roles, with the hint "Ticks all of this client's venues; you can change them below".
  - On change it applies a small local helper, `clientVenueIds(prev, newClientVenues, oldClientVenues)`. It drops the old client's venues, adds the new client's venues, keeps venues ticked by hand, and removes duplicates.
  - Then the venue `Chips`, with the client's venues sorted first.
- `InviteSheet` accepts `preset` (role, client_id, venue_ids). It loads `clients.list` itself and sends `client_id`.
- Settings.jsx imports `InviteSheet`/`AccessFields` from here. `UserSheet` uses `AccessFields` and sends `client_id` with `users.update`.
- In the `UsersTab` row, the subtitle gains `Client: {client_name}`.

### `pages/money/Venues.jsx`
- `AddVenueSheet` uses `ClientSelect`, so "+ New client" works here too.
- `ClientList` shows "N venues · M contacts".
- `ClientForm` and `ClientSheet` are imported from `_client.jsx`.

### `pages/money/VenueDetail.jsx`
- `DetailsTab` uses `ClientSelect`. Its `onCreated` reloads `clients` (pass `clients.reload` down) and sets `client_id`. The change is saved with the existing Save button.
- New `feedback` tab, placed after `people`, labelled `Feedback` with the open count from `v.feedback_open`:
  - `venues.get` gains `feedback_open` (a count of `venue_comments` with status open for that venue).
  - The tab renders `<FeedbackList venueId={v.id} fixedVenue key={fbKey} />`.
- The "Log feedback" sheet gets `onDone={() => { setParams({ tab: 'feedback' }); setFbKey(k => k + 1); q.reload(); }}`.
- `PeopleTab`, for company users:
  - "Invite venue manager" opens `InviteSheet` with preset `{ role:'venue', venue_ids:[v.id], client_id: v.client_id }`.
  - Each contact Row gets a "Remove" button. It confirms, then calls `users.update {id, venue_ids: current minus v.id}`. That needs the user's current venue_ids, so `venues.get` contacts gain `venue_ids`, using `array(SELECT venue_id FROM venue_contacts WHERE user_id = u.id)`.
  - Security managers get the same Remove; their venue_ids come from `security_venues`.
  - The settings link goes to `/company/settings?tab=users`.

### `pages/money/Feedback.jsx`
- Split it into an exported `FeedbackList({ venueId, fixedVenue })`. That holds the filters (no venue Select when fixedVenue), the list, the Give/Reply sheets and the new ReviewSheet. The default `Feedback` page becomes `<Page>…<FeedbackList/></Page>`. The Give feedback button moves into FeedbackList's toolbar for both cases.
- On the Card, for the company role, praise feedback with no `review_id` gets a "Use as review" button:
  - If the venue has no `site_client`, the button is still shown. The sheet then explains the missing website tile and links to `venues/:id?tab=details`.
  - Once promoted, the card shows the Pill "Review pending" or "Review published", linked to `${base}/reviews`.
- `ReviewSheet`:
  - Fields: quote (prefilled with the comment, max 600), reviewer (created_by_name), and reviewer role ("Venue manager").
  - It calls `comments.toReview` with the toast "Review added — approve it in Reviews".

## 4. Tests: `functions/api/test`
- `comments.test.mjs` covers `canPromote` for each of its error cases and the ok case.
- I'll check the client pre-ticking in the mock run (step 5.4): adding a client, switching client, and clearing it.
- The full `npm test` run must still pass (175+).

## 5. Verify
1. `cd functions/api && npm test`.
2. Check on local PGlite (/tmp/pgl): apply migrations through 037, then run a node script for `users.invite` with a client, `clients.get`, `clients.setVenue`, and `comments.toReview` with and without `site_client`. If PGlite can't run the module handlers, I'll run the SQL by hand against it.
3. `cd app && npm run build`; ui-lint must stay at 67 or below.
4. Mock server (/tmp/mock/server.mjs): add stubs for `clients.get`, `clients.setVenue`, `comments.toReview` and `users.list` client fields, and add `feedback_open` to `venues.get`.
   - Take screenshots as company at 1280 and 390 of:
     - the invite sheet with a client chosen (venues pre-ticked)
     - "+ New client" from venue Details
     - the Client sheet with its venues and contacts
     - the venue Feedback tab
     - the Use as review sheet
     - the People tab with Invite and Remove
   - Take a screenshot as venue of the Feedback page to check it isn't broken.
   - Then run `agent-browser close --all`.
5. Commit "feat: client contacts, new client from venue, venue feedback tab, feedback → review".
6. Deploy: `openkbs fn deploy api -s 'rate(5 minutes)'` (migration 037 runs on deploy, like 036), then `openkbs site deploy`, then `git push origin master --tags`.
7. Check the live bundle for "Use as review" and confirm the API answers. No live data is changed or tested. I'll tell you how to link Banshee to a website tile.
