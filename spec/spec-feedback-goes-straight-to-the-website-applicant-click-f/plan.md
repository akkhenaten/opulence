# Implementation plan: feedback goes straight to the website, applicant click fix, "What's new" in the Audit log

The spec is saved at `spec/spec-feedback-goes-straight-to-the-website-applicant-click-f.md`. The office ticks feedback onto the site, the public line shows the venue name only, Reviews leaves the menu, and "What's new" is a tab in the Audit log for the office only.

## Context
- Praise reaches the landing page only through "Use as review", then approval on the Reviews page. We'll replace that with a single "Show on website" switch on the feedback card.
- Clicking an applicant on Recruitment crashes the app. `useApi` reports `loading:false` on the first render after `skip` flips, so `Load` calls `children(null)`.
- The office wants a polished "What's new" showcase of everything shipped.

## 1. Feedback on the website

**Migration** — `functions/api/db/migrations/038_feedback_public.sql` (new)
```sql
ALTER TABLE venue_comments ADD COLUMN IF NOT EXISTS public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE INDEX IF NOT EXISTS venue_comments_public_idx ON venue_comments (venue_id) WHERE public;
```

**`functions/api/modules/comments.mjs`**
- Replace `canPromote` with an exported `canPublish(c, venue)`. It returns these reasons, without the review_id rule:
  - 'Only praise can go on the website'
  - 'Link this venue to a website tile first (venue → Details → Website client)'
  - 'Add a comment first'
- New `'comments.setPublic': def(CO, …)`:
  1. Loads the comment and its venue with `assertVenue`.
  2. When `b.public` is set, runs `canPublish` and fails 400 with the reason.
  3. Runs `UPDATE venue_comments SET public=$2, published_by=CASE WHEN $2 THEN $3 END, published_at=CASE WHEN $2 THEN now() END`.
  4. Audits `comments.publish` or `comments.unpublish`.
  5. Returns `{ok, public}`.
- Remove `comments.toReview` and the `reviews.mjs` imports. Comments are never edited or deleted (there is no handler), so we don't need any re-tone handling.
- `LIST_SQL` already returns `c.*`, which now includes `public`. Keep the `rv` join for `review_status`, because old promoted items still show their pill.

**`functions/api/modules/reviews.mjs`**
- New exported `feedbackShape(c)`, which returns `{quote: comment.slice(0,600), reviewer: venue_name, reviewer_role: 'Venue', rating, received_on: created_at}`.
- `reviews.public` runs:
  - the existing published reviews, through `groupPublic`, plus
  - `SELECT c.comment, c.rating, c.created_at, v.name AS venue_name, v.site_client FROM venue_comments c JOIN venues v … WHERE c.public AND c.tone='praise' AND v.active AND v.site_client IS NOT NULL AND btrim(c.comment) <> ''`, ranked with `ROW_NUMBER() OVER (PARTITION BY v.site_client ORDER BY c.created_at DESC) <= 10`.
- A pure `mergePublic(reviewsBy, feedbackRows)` appends the feedback (newest first) to each slug's list. The response shape is unchanged, so `site/index.html` needs no edit.
- `insertReview` and `fields` stay. They're harmless, and the Reviews page route still works.

**Tests** — `functions/api/test/comments.test.mjs`
- Swap the `canPromote` test for a `canPublish` test.
- Add a `feedbackShape` + `mergePublic` test: the venue-name byline, the 600-character trim, and no ids leaking.

**App** — `app/src/pages/money/Feedback.jsx`
- Remove `ReviewSheet`, the `promote` state and `REVIEW_PILL`'s promote button, plus any imports that become unused (`Input`, maybe `Globe`).
- `Card`:
  - For the office on praise, show `<Toggle checked={c.public} onChange={(on) => run(() => api('comments.setPublic', {id, public:on}), on ? 'Now on the website' : 'Taken off the website').then(onChanged)} label="Show on website" />`.
  - Disabled when there's no `site_client` or no comment. In that case, show a hint plus a `Link` to `${base}/venues/${venue_id}?tab=details`, the same target the old ReviewSheet used.
  - When `c.public`, show `<Pill tone="green" icon=Globe>On website</Pill>` for every role.
  - Keep the old review-status pill only when `c.review_status` exists, and remove its link (Reviews is gone from the menu).

**Nav** — `app/src/layouts/nav.js`, lines 38, 78 and 92
- Remove the three Reviews entries, and the `Quote` import if it becomes unused. The routes in `main.jsx` stay.

## 2. Applicant click fix
- **`app/src/ui/index.jsx` `useApi`**
  - State becomes `{data, error, loading, done: null}`. The `done` field records the key once a request settles (success or error), set in both `setState` calls.
  - Return `loading: state.loading || (!skip && state.done !== key)`.
  - This keeps the old data on screen during filter changes, since `Load` only spins when there is no data, and fixes every `skip: !id` sheet.
- **`app/src/pages/people/Recruitment.jsx:90`**: `<ApplicationSheet key={applicant || 'none'} …>`, so the sheet remounts and the previous person never flashes.
- **`app/src/pages/people/_application.jsx`**: in the `Load` child, return `<Spinner />` when `!a`, and guard `a.flags || []` and `a.docs || []`.

## 3. "What's new" tab in the Audit log
- **`app/src/pages/people/Audit.jsx`**
  - Add `useSearchParams` and `Tabs` (the `Exceptions.jsx:14-32` pattern) with `activity` (the default, the existing body unchanged) and `new` ("What's new").
  - Show the filter bar on Activity only.
- **`app/src/pages/people/_whatsnew.jsx` (new)**
  - Exports `UPDATES`, newest first, as `[{date:'2026-11-05', icon, title, lede, points:[…]}]`. That's 17 cards, from the spec list, with icons from lucide-react.
  - Exports `WhatsNew()`:
    - A hero card ("Your platform keeps getting better" plus a short paragraph and the count of upgrades since October).
    - Then a `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` of cards in the `rounded-tile bg-surface p-4 shadow-tile` style (`StaffContracts.jsx:31-48`).
    - Each card has the icon in a `text-blue` badge, a `text-subhead font-semibold` title, a `Pill` with the month, a `New` pill on the latest release, the lede in `text-body`, and the points as a checked list in `text-footnote text-muted`.
- Copy: eloquent, benefit-led British English, with no jargon or commit refs.

## Verification
1. `cd functions/api && npm test` should pass, with the new tests included. `cd app && npm run build` should keep ui-lint at 67 or lower.
2. Local PGlite (`/tmp/pgl`, pool max 1):
   - Migrate 038.
   - `setPublic` should refuse a complaint, refuse a venue with no tile, and accept praise.
   - `reviews.public` should include `{reviewer: venue name, reviewer_role:'Venue'}` for that slug, and drop it after unpublish.
3. Mock server (`/tmp/mock/server.mjs`):
   - Add a `comments.setPublic` stub, `public` on c1, and `apply.get` / `hr` pipeline stubs if they're missing.
   - Use Vite at 1280 and 390 px, and screenshot the feedback toggle and pill, the Recruitment click opening the sheet and switching between two applicants, and the Audit "What's new" tab.
   - Run `agent-browser close --all`, and stop vite and the mock.
4. Commit "feat: feedback straight to the website, applicant sheet fix, What's new" with the Co-Authored-By line. Then run `openkbs fn deploy api -s 'rate(5 minutes)'`, `openkbs site deploy`, and `git push origin master --tags`.
5. Live check (read-only):
   - The bundle contains "Show on website" and "What's new".
   - `POST /api {action:'reviews.public'}` answers 200 with the same shape.
   - No live data changes. The user ticks Banshee's praise themselves after linking Banshee to a tile.
