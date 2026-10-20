# Plan: profiles you can edit yourself, photos for everyone, one clear way to add people

## Context
The review found these problems:
- Only officers can edit anything about themselves, and they can't change their name.
- Managers and venue users can't edit their own profile at all.
- Photos exist only on staff records (`officers.photo_key`).
- "Add officer" on Staff and "Invite user" in Settings already create different things underneath: a staff record, and a manager or venue login. But:
  - nothing stops the same officer being added twice (no email or SIA number check);
  - the login email and name drift away from the staff record;
  - hiring an applicant doesn't give them a login;
  - the button labels don't explain the difference.

**Decisions:**
- Self-edit covers **name, phone and photo**. Email stays with the company manager. (The user chose this.)
- Duplicates are **blocked**, with a link to the existing person.
- One role per login. Being both a manager and an officer is a later card.

The last two are my recommendations; the user answered only the first question, so they still need confirming.

## Backend (`functions/api`)
1. **`db/migrations/007_profile_photos.sql`:**
   - `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_key text;`
   - add an index on `lower(officers.email)` and `officers.sia_number` to make the lookups fast. These are not unique indexes, because existing data might clash.
2. **New action `auth.updateMe`** (`modules/auth.mjs`, all roles):
   - accepts `name` (required, 2–80 characters), `phone` and `photo_key`;
   - checks the photo with `ownUpload`, `allowedMime` and `headObject` (size), copying the pattern from `modules/incidents.mjs:53-58`;
   - writes to `users`. If the person is linked to a staff record, it also writes name, phone and photo to `officers`. The name is split into first and last name at the last space;
   - returns the fresh `publicUser`.
3. **Photo on the user object:** `publicUser` / `auth.me` returns `photo_url` from `COALESCE(o.photo_key, u.photo_key)`, signed with `downloadUrl` (`lib/storage.mjs:17`). The same COALESCE goes into `users.list`, and into the people query in `everyday.mjs:21` so managers get their photo in Everyday too.
4. **Duplicate guard in `officers.save`** (on create, and on update when the email or SIA number changes):
   - if another officer has the same `lower(email)` (when not blank) or the same `sia_number` (when not blank), fail with 409 and `{ duplicate: { id, name, status } }`, worded "Already on your staff: Aisha Rahman";
   - also check `users.email` for a manager or venue login with that email, with the message "This email belongs to a manager or venue login".
   - Save `officers.email` lowercase and trimmed.
5. **Keep the login in step with the staff record:** when a manager edits a linked officer's email or name in `officers.save`, update `users.email` and `users.name` in the same transaction. If the email is already used by another login, return 409.
6. **Hiring gives a login:** `onboarding.setStatus` (`hr.mjs:123`) takes an optional `invite: true`. When the status becomes active, the officer has no `user_id` and has an email, it runs the same logic as `officers.inviteLogin`, pulled out into a shared function in `officers.mjs`.
7. **Fix a gap in officers' own saves:** `officers.save` should check that `photo_key` is the officer's own upload with `ownUpload`, as incidents already do.

## Frontend (`app/src`)
1. **`layouts/AccountSheet.jsx`:**
   - the avatar block gets a photo button that uses `upload(file, 'photo')` (`api.js:36`), then `auth.updateMe`. There's also a Remove photo option;
   - a new **Edit details** row opens a small form (name, phone, plus email shown read-only with "Ask your company manager to change your email");
   - on save it refreshes `useAuth` so the sidebar shows the new name and photo straight away.
2. **Officer app:**
   - `pages/officer/Profile.jsx` lets officers edit their name as well, through `auth.updateMe`. The rest of the fields stay as they are;
   - `Me.jsx` uses `user.photo_url`.
3. **Show the photo where the avatar is already drawn:**
   - Shell sidebar, the More sheet, the Composer and the viewer's own avatar in PostCard, and the Settings user list (`photo_url` from `users.list`);
   - Live board: stop deleting `photo_key` in `clock.mjs:206` and sign it instead;
   - Academy results: sign `photo_key` in `academy.mjs:595`.
4. **Clear wording:**
   - **Staff:** the button reads "Add staff member". The sheet explains: "Someone who works shifts. Turn on App access to email them a login." The toggle is labelled "App access".
   - **Settings → Users & access:**
     - the button reads "Invite manager or venue user", with the explanation "Officers are added from People → Staff";
     - the Officers filter shows a link back to Staff.
   - **Duplicate 409:** the Add sheets show "Already on your staff: Aisha Rahman" with an **Open** button that goes to `/company/staff/:id`. The same applies in Recruitment.
   - **Recruitment hire:** the Hire confirm dialog gets an "Email them an app login" checkbox, ticked by default when there's an email and no login yet.

## Board
New Backlog card: "One person, two roles (supervisor who also works shifts)". It records that a login has a single role today, so a supervisor needs a second email or a staff record without a login.

## Build, deploy, commit
- `cd app && npm run build`; ui-lint must stay at 0.
- `openkbs fn deploy api`.
- Commit as `feat: Edit your own profile and photo; no more duplicate staff`, with the Co-Authored-By line.
- `openkbs site deploy`.
- Post a plain-language comment on the board card eBor20xg.

## Verification
1. **API** (`/tmp/orb/call.mjs`):
   - security `auth.updateMe {name, phone}` shows up in `auth.me` and `users.list`;
   - officer_aisha `auth.updateMe {name}` also updates her staff record;
   - a `photo_key` that isn't the person's own upload gets a 400;
   - `officers.save` with Aisha's email in different capitals, or with her SIA number, gets a 409 that includes the duplicate id. Using a manager's email also gets a 409;
   - editing Aisha's email as a manager changes the email she signs in with. Afterwards, restore the demo values (name, phone and email) for every account touched.
2. **Browser** (vite preview, at 390 and 1440 wide):
   - upload a photo in My account as company and security; it shows in the sidebar, Everyday and Settings users;
   - the officer edits their name and photo in Profile;
   - adding a duplicate on Staff and Recruitment shows the Open link;
   - hiring with the login box ticked sends the invite;
   - the new wording appears in both Add sheets.
   - Remove the test photos afterwards. Run `agent-browser close --all`, then stop the preview.
