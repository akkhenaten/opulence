# Plan: doubles go straight to the right record; venue managers get the one-trip form

## Context
The approved spec is saved in `spec/spec-doubles-go-straight-to-the-right-record-and-venue-manag.md`. In short:
- **Doubles.** A double (same email or SIA, or an email that already has a login) is shown clearly. One tap, **Discard and open <Name>**, deletes the form and opens the person it matches.
- **Venue managers** get the officer journey:
  - they set a password on the form;
  - company managers and the platform admin see the form;
  - one Make live tap creates an active Venue manager login;
  - a "You're live" email is sent;
  - the office lands on the person's Access tab.

No migration is needed: `password_hash` already exists (067).

## Server — `functions/api`
### `modules/staffSetup.mjs`
- **`duplicateOf(s)` returns `{ id, name, status, match, tab }`:**
  - **Officer form:**
    - an officer with the same email (`match:'email'`) or SIA (`match:'sia'`), with `tab:'overview'`;
    - otherwise a login with that email (`users`, any role), with `match:'email'` and `tab:'access'`.
  - **Venue form:** a login with that email, with `tab:'access'`.
  - `/staff/:id` already resolves both officer and user ids (`StaffProfile.jsx` → `people.resolve`), so `id` can be either.
- **`ownsKind` goes.** `list` / `get` / `create` / `discard` serve both kinds to `def(CO)`. `link` / `toggle` / `rotate` stay `plat`.
- **`staffSetup.create`:**
  - load the form, then `const dup = await duplicateOf(s)`;
  - if `dup`: `fail(409, \`Already on file: ${dup.name}\`, { duplicate: dup })`. This covers the late double and replaces the separate "someone already signs in" failure;
  - `assertNotDuplicate` stays inside `createFromSubmission` as a backstop. Its 409 already carries `{duplicate}`; add `tab:'overview', match`.
- **`staffSetup.discard`:**
  - before deleting, compute `duplicateOf` and return `{ ok:true, duplicate }`;
  - audit `staff_setup.discard` with `{ duplicate_of: dup?.id }`.
  - The client opens `duplicate` when the tap was "Discard and open".
- **Gone forms (`madeFrom`):**
  - also matches the audit `user.create` entry with `detail.submission`;
  - returns `person_id`, sent as `{ person_id, officer_id }` (officer_id is kept for the current client);
  - `get` gives 404 and `create` gives 409 'Already made live' with that id.
- **`createVenueManager(id, venueIds, user)`:**
  - the `invite` parameter is removed;
  - **Venues:** `venue_ids` are chosen as today (pre-matched default, 400 "Pick their venues" with `field:'venues'` when there are none);
  - **Claim:** inside the tx, claim the form with `DELETE … RETURNING *` (409 'Already made live' when it's already gone);
  - **With `password_hash`:** insert `users` with role `venue`, `status 'active'`, the hash, `goes_by`, `phone`, `client_id` (when there is one client), and `photo_key`; then `setVenues`;
  - **Without `password_hash`:** today's `createInvite`, then always `inviteOf` after commit, returning `invited:true`;
  - **After commit:**
    - audit `user.create` with `{ role:'venue', from:'staff_setup', submission, login }`;
    - welcome post via `welcomeDue` / `celebrate`, as for officers;
    - `sendLiveMail(d, 'venue')`.
  - **Return value:** `{ id: userId, name, kind:'venue', live:true, emailed }`.
- **`sendLiveMail(d, kind)`:** the body says "Sign in to the Venue portal…" for a venue manager and "Officer app" for an officer.
- **`staffSetup.submit`, venue kind, same as officers:**
  - `checkSetupPassword`, with field errors;
  - the email-already-has-a-login 409 with `field:'email'`;
  - store `password_hash`;
  - notify company managers and platform admins: title "New venue manager form from X", link `/company/staff?form=${id}`.
- **`createFromSubmission`:** drop the inline "Someone already signs in" check (create now catches it first). The rest is unchanged.

### `lib/staffSetup.mjs`
- **`cleanVenueManager`** returns `{error, field}` through the existing `bad` helper. Fields: first_name, last_name, email, phone, `venue_names`, consent.

### Other server files
- **`modules/auth.mjs:47`:** drop `kind = 'officer'` from the "office hasn't finished" check, so it covers venue forms too.
- **`modules/todo.mjs`:** `SQL.staffForms` counts all kinds.
- **`lib/todo.mjs`:** item text stays "new staff form(s) to check".
- **`lib/orbCatalog.mjs`:** the `staffSetup.create` description becomes "Make live (officer or venue manager); venue_ids for a venue manager"; drop `invite`.

## Client — `app/src`
- **`pages/public/StaffForm.jsx`, `VenueForm`:**
  - Cards: **You** (name, known as, job title), **Contact** (email "You sign in with this", mobile), **Your venues**, **Profile photo**, **Your password** (password + "Type it again"), **Consent**.
  - It uses the same `bind` (with `name` / `error`), `fail(msg, field)` scroll and client-side password check as `Form`. Pull these into a small shared hook in the file (`useFieldErrors`) so both forms use one copy.
  - The venue-name error anchors to the first venue input (`name="venue_names"`).
  - The done screen uses the same `Done` as officers, with "Venue portal" wording. The intro text is updated.
- **`pages/people/_staffForm.jsx`:**
  - **Duplicate callout**, for both kinds: title "This looks like <Name>, already on file (<status>)", body "Same email" / "Same SIA number".
    - When `s.duplicate` is set, the footer's primary button becomes **Discard and open <Name>**. It calls `staffSetup.discard`, toasts "Form discarded — this is <Name>", then `nav(\`${base}/staff/${dup.id}?tab=${dup.tab}\`)`, using the duplicate returned by discard (or else the one shown).
    - Plain Discard stays.
  - **Make live 409 with `e.data.duplicate`:** set the local duplicate state, so the same callout and button appear (the late double).
  - **409 "Already made live" / 404:** the gone callout's Open their page uses `person_id || officer_id`.
  - **Venue branch:**
    - the details, typed venues, photo and venue picker stay (pre-ticked with `matched`);
    - "Pick their venues" shows when nothing is ticked;
    - a single **Make live** button, disabled until a venue is ticked, calls `staffSetup.create {id, venue_ids}`, toasts "<Name> is live" and navigates to `${base}/staff/${r.id}?tab=access`;
    - forms without a password show the note "No password on this form — we'll email them an invite link";
    - remove Create login / Create and send invite and the `Sent` view. An invite result toasts "Invite sent" and navigates the same way.
  - **`StaffForms` list:**
    - shows both kinds, each row with a **Venue manager** or **Officer** pill;
    - a double has the amber pill "Already on file: <Name>";
    - the venue row subtitle shows its typed venues.
- **`pages/people/StaffSetup.jsx`:** the pills use the same "Already on file" wording; the callout text mentions venue managers in People too.
- **What's new:** a card in `pages/people/_whatsnew.jsx`, plus a prompt `doubles-venue-live` in `app/scripts/whatsnew-images.mjs`; then generate the image.

## Tests — `functions/api/test/staffSetup.test.mjs`
- **Gates:** list/get/create/discard are `CO` for both kinds (replace the venue-is-platform-only test); link/toggle/rotate stay plat.
- **`cleanVenueManager`** returns `field` (email, venue_names, consent).
- **Source checks**, in the same style as the existing tests:
  - submit runs `checkSetupPassword` for both kinds;
  - `create` fails with `duplicate`;
  - `discard` returns `duplicate`.
- **Run `npm test`:** all pass.

## Local preview (mock `/tmp/mock/server.mjs`)
- `staffSetup.info` gets a `?venue` token variant (`kind:'venue'`).
- `list` adds a venue form and an officer double (`duplicate:{id:'o1', name:'Test Officer', match:'sia', tab:'overview'}`).
- `get` handles the venue (`venues`, `matched`) and the double.
- `discard` returns the duplicate.
- `create` for the venue returns `{id:'u-v', live:true}`.
- Screenshots:
  - the venue form (password and field error, done screen);
  - the People list with pills;
  - the double sheet, where Discard and open lands on `/company/staff/o1`;
  - venue Make live, which lands on the Access tab.

## Release
1. `npm test`, eslint on the changed jsx, ui-lint ≤ 73.
2. Commit, then `openkbs fn deploy api`.
3. `npm run build`, then grep `site/app` for `6ij75…`.
4. Commit `site/app`, `openkbs site deploy`, `git push`.

## Live verification (test records only, `*@example.test`, cleaned up afterwards)
- **Officer double by SIA.** Send an officer form with a test officer's SIA number and a new email.
  - `list` shows `duplicate.match:'sia'`.
  - Discard returns the duplicate.
  - The form is gone.
- **Venue form:**
  - a short password gives a field error;
  - a good one sends;
  - signing in before live gives "office hasn't finished".
  - Confirm the stored row has a hash and no password in its details.
- **Venue double.** A venue form with an existing login's email is blocked with `field:'email'`.
- **Not run by me:** Make live for a venue manager needs a manager sign-in. The user or platform admin can run it from People. Then I check that sign-in with the form's password works, and clean up the login, its venue link and notices by SQL, as last time.
- Run `agent-browser close --all` at the end.
