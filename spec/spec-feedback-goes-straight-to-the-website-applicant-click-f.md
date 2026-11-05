# Spec: feedback goes straight to the website, applicant click fix, "What's new" in the Audit log

## Context
Three issues raised after the last release (v91):
1. **Feedback → website.** Today, praise in venue feedback only reaches the landing page by a two-step detour: "Use as review" creates a pending review, then someone approves it on the Reviews page. The user says that if we have feedback, we don't need reviews. The office should tick feedback straight onto the venue's website tile. **The user chose "Office ticks 'Show on website'".**
2. **Clicking an applicant does nothing.** On Recruitment, clicking an online applicant crashes the page (blank screen or no reaction). Opening the same applicant from the "New application" notification works.
3. **"What's new" tab in the Audit log.** Cards for every recent upgrade, written in polished copy so the client (Opulence) can see how much value they are getting.

## 1. Feedback on the website (office ticks it)

**Behaviour**
- Each praise feedback card gets a **"Show on website"** switch. It is office (company role) only and replaces the "Use as review" button.
  - The switch is enabled only when the item is praise, has a comment, and the venue is linked to a website tile.
  - Otherwise it explains why, e.g. "Link this venue to a website tile first (venue → Details → Website client)", with a link. This reuses the existing `canPromote` reasons, minus "Already used".
- While it is on, the card shows a green **"On website"** pill. Untick it to take the quote down straight away.
- The landing tile carousel shows the quote, the stars and **"— {Venue name}, venue"**. No personal names go public. This is my default; the name question was not answered.
- Only the newest 10 shown items per tile are used, newest first, each trimmed to 600 characters.
- Complaints and suggestions can never be shown.
- If the feedback is deleted or re-toned away from praise, it drops off the site.
- **Reviews page.** This is my default: the user said reviews aren't needed. The Reviews menu item and the "Use as review" sheet are removed. Existing published reviews keep showing on the site, merged with feedback, so live content doesn't change. The `reviews` table and API stay untouched. No live data is changed.

**Backend**
- `functions/api/db/migrations/038_feedback_public.sql`: on `venue_comments`, add `public boolean NOT NULL DEFAULT false`, `published_by uuid REFERENCES users(id) ON DELETE SET NULL`, `published_at timestamptz`, plus a partial index on `public`.
- `functions/api/modules/comments.mjs`:
  - New `comments.setPublic` (CO), taking `{id, public}`. When turning it on, check with a `canPublish(c, venue)` adapted from `canPromote`, without the review_id rule. Set or clear `published_by`/`published_at`, and audit `comments.publish` / `comments.unpublish`.
  - `LIST_SQL` returns `c.public`.
  - If an edit changes the tone away from praise, set `public=false`.
  - Remove `comments.toReview` from the UI path. Keep the handler so old links don't 500, or drop it; it isn't needed.
- `functions/api/modules/reviews.mjs` `reviews.public`:
  - Also select `venue_comments` joined to `venues`, where `public AND tone='praise' AND v.site_client IS NOT NULL AND v.active`.
  - Map each to `{quote, reviewer: v.name, reviewer_role: 'Venue', rating, received_on: created_at}` and merge into `groupPublic` by `site_client`.
  - The response shape is unchanged, so `site/index.html` needs no change.
- Tests in `functions/api/test/comments.test.mjs`: `canPublish` rules, and the merge or shape of the public feed.

**App**
- `app/src/pages/money/Feedback.jsx`:
  - Replace the "Use as review" button, `ReviewSheet` and `REVIEW_PILL` with a `Toggle` that calls `comments.setPublic`, plus the "On website" pill.
  - Venue users see the pill read-only, so they know their praise is public.
- `app/src/layouts/nav.js`: remove the Reviews entry. Keep the `/company/reviews` route so bookmarks still work.

## 2. Applicant click fix
Root cause, confirmed in code:
- `useApi` (`app/src/ui/index.jsx:21`) starts with `loading: !skip`. `ApplicationSheet` (`app/src/pages/people/_application.jsx:16`) mounts with `skip:true`, because no applicant is selected yet.
- On click, the first render has `loading:false` and `data:null`, so `Load` calls `children(null)`. Then `a.applied_at` throws and the whole app unmounts.

Fix:
- **`useApi`.** Remember which request key has actually finished (`doneKey` in state). Report `loading: true` while `!skip` and the current key hasn't loaded yet. This also fixes the same latent bug in other `skip: !id` sheets, such as SiaVerify and the Feed.
- **`Recruitment.jsx:90`.** Render `<ApplicationSheet key={applicant} …>` so that switching applicants never flashes the previous person's data.
- Defensive: in `_application.jsx`, `!a ? <Spinner/> : …`, and `(a.flags || [])` / `(a.docs || [])`.

## 3. "What's new" tab in the Audit log (office only)
- `app/src/pages/people/Audit.jsx`: add `Tabs` driven by `?tab=` (pattern from `Exceptions.jsx:14-32`). The tabs are **"Activity"**, the existing log and the default, and **"What's new"**.
- New `app/src/pages/people/_whatsnew.js`. This is my default audience: office only, as the Audit page already is. It is a data array of `{date, icon, title, lede, points[]}`, newest first, covering the shipped features:
  - Orb assistant
  - Live operations and pre-shift checks
  - Contracts suite
  - Site packs
  - Clock-in proof
  - Chat, messages and email
  - Everyday feed
  - Academy and training
  - Rota and shifts
  - Incidents and ejections
  - People and HR
  - SIA verification
  - Pay runs and invoicing
  - Clients, venues, feedback and analytics
  - Look and feel
  - Landing page
  - This release (feedback on the website)
- Copy tone: confident and elegant, focused on benefits ("what this means for you"). One headline, a 1–2 sentence lede and 3–4 crisp points per card. British English. No internal jargon or commit hashes.
- Layout: a hero line ("Your platform keeps getting better"), then a card grid `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`, using the `rounded-tile bg-surface p-4 shadow-tile` style from `StaffContracts.jsx:31-48`. Each card has a lucide icon, a date pill and a "New" pill on the latest release.

## Verification
- `cd functions/api && npm test`, and `cd app && npm run build`. ui-lint should not exceed 67.
- Local PGlite:
  - Migration 038 runs.
  - `setPublic` refuses a complaint and a venue with no tile, and accepts praise.
  - `reviews.public` includes the venue-named quote, and drops it after unpublish.
- Mock server plus browser at 1280 and 390 px:
  - The Feedback toggle and pill.
  - The Recruitment click opens the applicant sheet without crashing, including switching between two applicants.
  - The Audit "What's new" tab.
  - Then `agent-browser close --all`.
- Commit, then `openkbs fn deploy api -s 'rate(5 minutes)'`, `openkbs site deploy`, and `git push origin master --tags`.
- Check the live bundle has "Show on website" and "What's new", and that `reviews.public` answers.
- No live data changes. The user ticks Banshee's praise themselves, once Banshee is linked to a website tile.
