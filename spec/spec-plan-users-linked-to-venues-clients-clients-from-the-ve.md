# Spec & plan: users linked to venues/clients, clients from the venue page, feedback on the venue

## Context
Three gaps found while using the app tonight:

1. **Users & access.** A venue manager can only be ticked onto venues one by one. There is no way to say "this person is the client contact for X", and the Client record knows nothing about its people.
2. **Venue → client.** On a venue you can only pick an existing client. To create a new one you have to leave for the Clients page, which shows a venue count but not the venues.
3. **Feedback logged for Banshee "disappeared".** It was saved, but it only shows on the new **Feedback** page:
   - The venue page has no Feedback tab.
   - "Log feedback" on the venue page doesn't refresh anything after saving.
   - **Reviews** is a separate system (the website testimonials). It never reads feedback, and Banshee isn't linked to a website tile (`venues.site_client` is empty), so it couldn't show there anyway.
   - If Banshee is marked inactive, it is also missing from the Feedback page's venue picker. `comments.options` lists active venues only.

Answers and defaults:
- Linking a user to a client **pre-ticks that client's venues**; access stays per venue. This was your answer.
- I assumed the following, since those two questions were left open:
  - Praise feedback can be **promoted to a review** by the office.
  - The venue's **People tab can invite and remove** venue managers.

## 1. Users & access: role → client → venues
**Database: migration `037_user_client.sql`**
- `users.client_id uuid REFERENCES clients(id) ON DELETE SET NULL`.
- Index on `users.client_id`.

**API: `functions/api/modules/users.mjs`**
- `users.invite` and `users.update` accept `client_id`, for the venue and security roles. The client must exist.
- `users.list` returns `client_id` and `client_name`.
- `setVenues` (`users.mjs:32`) is unchanged; the venues sent are still the source of truth.

**App: `pages/people/Settings.jsx`, `InviteSheet` (:512) and `UserSheet` (:548)**
- Order of the fields: **Role** → **Client** (optional) → **Venues**.
- The Client field is a Select with a "+ New client" option, which opens a small new-client sheet.
- Choosing a client ticks all of that client's venues and lists them first. You can still untick some or add others.
- The row in the user list shows "Client: X · 3 venues".

## 2. Venue ↔ client
**API: `functions/api/modules/venues.mjs`**
- `clients.save` returns the new row, so the venue page can select it straight away.
- New `clients.get {id}` (CO). It returns the client plus:
  - its `venues` (id, name, active)
  - its `contacts`: users with `client_id` set to it, or linked through `venue_contacts` to its venues
- New `clients.setVenue {client_id, venue_id}` (CO), which attaches an existing venue to the client.

**App: venue page, `pages/money/VenueDetail.jsx` `DetailsTab` (:247)**
- The Client select gains "+ New client…". It opens the shared `ClientSheet` (moved out of `Venues.jsx` `ClientForm`). The new client is selected on save.
- `AddVenueSheet` (`Venues.jsx:98`) gets the same option.

**App: Clients page, `pages/money/Venues.jsx` `ClientForm` (:127)**
- Adds a **Venues** list, which links to each venue, plus "Add venue to this client".
- Adds a **Contacts** list (users), plus "Invite contact". This opens the invite sheet with the role set to venue and the client and its venues pre-filled.

**App: venue People tab, `PeopleTab` (:513)**
- "Invite venue manager" opens the invite sheet pre-linked to this venue and its client.
- Each contact gets a "Remove access" button, which calls `users.update` with that venue taken out of their `venue_ids`.
- The settings link opens `?tab=users` directly.

## 3. Feedback on the venue, and into Reviews
**Venue page: new Feedback tab in `VenueDetail.jsx`**
- Move the list and card from `pages/money/Feedback.jsx` into an exported `FeedbackList({ venueId, fixedVenue })`. The page and the tab both use it.
- The tab label shows the open count.
- "Log feedback" passes `onDone`. After saving it switches to the Feedback tab and reloads.

**`comments.options` (`comments.mjs:76`)**
- Include the requested `venue_id` even when that venue is inactive.
- The venue list itself stays active-only.

**Promote praise to a review**
- New action `comments.toReview {id, quote?, reviewer?, reviewer_role?}` (CO).
  - Allowed only for `tone='praise'`. The venue must have a `site_client`; otherwise it fails with "Link this venue to a website tile first (Details → Website client)".
  - It inserts a `reviews` row, using the same insert as `reviews.save`:
    - `client = venues.site_client`, `venue_id`
    - `quote` = the comment
    - `reviewer` = the venue user's name; `reviewer_role` = "Venue manager"
    - `rating`
    - status `pending`, so it still goes through the normal approve-and-publish step
  - Stores the new review's id on `venue_comments` (new column `review_id`, in migration 037) and audits the action.
- The card in the Feedback list gets a "Use as review" button: office only, praise only, and only when no review has been made from it yet. It opens a short sheet to edit the quote and the reviewer name.
- Once used, the card shows a "Review: pending/published" pill linking to Reviews.
- Complaints and suggestions never go to Reviews.

## Files
- `functions/api/db/migrations/037_user_client.sql` (new)
- `functions/api/modules/users.mjs`, `venues.mjs`, `comments.mjs`, `reviews.mjs` (share its insert as `insertReview`)
- `app/src/pages/people/Settings.jsx`, `pages/money/Venues.jsx`, `pages/money/VenueDetail.jsx`, `pages/money/Feedback.jsx`
- New `app/src/pages/money/_client.jsx` (`ClientSheet` and `ClientSelect` with "+ New client")
- Tests:
  - `test/comments.test.mjs`: `canPromote({tone, site_client, review_id})`
  - `test/users.test.mjs`: client venue pre-tick helper

## Not in scope
- No new "Client" login role.
- No automatic access to a client's future venues.
- No change to who can see feedback: office plus that venue only.

## Verify
1. `cd functions/api && npm test`. Run migration 037 locally on PGlite (/tmp/pgl), then run a script that checks:
   - invite with a client
   - `clients.get` returns its venues and contacts
   - `clients.setVenue`
   - `comments.toReview` errors without `site_client` and creates a pending review with it
2. `cd app && npm run build`; the UI-lint count must stay at 67 or below.
3. Mock-server screenshots at 1280 and 390:
   - invite sheet with a client
   - venue Details with "+ New client"
   - Client page with its venues and contacts
   - venue Feedback tab and the "Use as review" sheet
   
   Then `agent-browser close --all`.
4. Commit "feat: client contacts, new client from venue, venue feedback tab, feedback → review", deploy the fn and the site, and push with tags.
5. No live data changes. Banshee's website-tile link is for you to set: I will tell you where. I will not set it.
