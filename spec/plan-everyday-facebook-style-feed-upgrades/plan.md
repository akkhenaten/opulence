# Plan: Everyday — Facebook-style feed upgrades

## Progress (implementation paused because plan mode was turned back on)
**Done, not yet committed:**
- migration `027_everyday_upgrades.sql`
- `lib/feed.mjs` helpers
- Everyday settings in `modules/settings.mjs`
- a full rewrite of `modules/everyday.mjs` with all the stage A/B/C server actions

**Remaining:**
- `modules/everydayJobs.mjs` and wiring it into `runJobs`
- the academy qualification hook
- `publishFeed` and the feed channel in `lib/realtime.mjs`
- the new kinds in `OPTIONAL_KINDS`
- share-to-chat in `messages.send` and `threads.mjs`
- `guide.mjs` and `orbCatalog.mjs`
- tests
- all the client work
- build, commit, deploy and browser checks

Deviations from this plan:
- Personal birthday and welcome choices live in `users.feed_prefs` (through `everyday.prefs`), not in officers columns. Managers can opt in too.
- Because the server is already written as one piece, the remaining work ships as a single deploy once the client is done, not as three separate A/B/C releases.

## Context
The spec is approved and saved at `spec/spec-everyday-facebook-style-feed-upgrades.md`. Everyday is currently basic:
- posts with up to 10 photos in a simple grid
- six reactions
- comments, where replies are flattened and missing from the preview
- @mentions
- pin/announce
- moderation

We turn it into a full staff social feed. We build it in **three stages, each committed and deployed on its own**, so every stage ships working:
1. **A:** richer posts, inline replies, safety fixes
2. **B:** shout-outs, celebrations, polls, events, acknowledgement
3. **C:** live feed, topics, search, filters, saved, share to chat, profile page

Existing pieces we reuse:
- **Server, `functions/api/modules/everyday.mjs`:** `loadPosts`, `loadComments`, `precheck` (cached AI check), `cleanMentions`, `assertCanPost`, `targetOf`, `postLink`, `signPerson`.
- **Server libraries:** `notify` and `companyManagers` (`lib/notify.mjs`); `publishTo` and `realtimeToken` (`lib/realtime.mjs`); `downloadUrl`, `getObjectBytes`, `headObject` and `putObject` (`lib/storage.mjs`); `extract` and `fileBlock` (`lib/ai.mjs`); `audit`; `requireModule`; `runJobs` (`modules/jobs.mjs`).
- **The Orb system user,** found with `SELECT id FROM users WHERE system`, as in `lib/threads.mjs:9`.
- **Client:**
  - `upload(file,'feed')`
  - `compressImage` (`pages/officer/_parts.jsx`)
  - `MentionBox`, `Body`, `PhotoGrid`, `PersonSheet` and `MuteSheet` (`pages/everyday/_parts.jsx`)
  - `Lightbox` (`ui/index.jsx`)
  - `useRealtime` and `useRealtimeConnected` (`app/src/realtime.js`)

## Data model — `functions/api/db/migrations/027_everyday_upgrades.sql`
**posts gets new columns:**
- `kind` text, default `'post'`, check: `post | shoutout | poll | event | celebration`
- `photos` keeps its shape and gains `w`, `h` and `caption` per item (old rows still work)
- `video` jsonb: `{key, poster_key, duration, w, h}`
- `link` jsonb: `{url, title, description, site, image_key}`
- `place` jsonb: `{name, address, lat, lng, venue_id}`
- `venue_id` uuid, referencing venues
- `tags` uuid[], default `'{}'`: the "with" people
- `topics` text[], default `'{}'`
- `shoutout` jsonb: `{badge, to: uuid[]}`
- `celebration` jsonb: `{type, user_id, key}`
- `must_ack` bool, default false
- `ack_reminded_at` timestamptz
- `deleted_by` uuid
- `removed_reason` text
- `search` tsvector, generated from `body` + `topics` + `place->>name` (English), with a GIN index
- **Indexes:**
  - a unique index on `(celebration->>'key')` where `kind='celebration'`, so the same celebration can't be posted twice
  - an index on `(venue_id)`
  - a GIN index on `topics`
  - a GIN index on `tags`

**post_comments gets new columns:**
- `photo` jsonb `{key, w, h}`
- `ai_check` jsonb
- `hidden_reason` text
- `deleted_by` uuid
- `search` tsvector, generated from `body`, with a GIN index

**New tables:**
- `post_polls`: `post_id` pk, `options` jsonb `[{id, text}]`, `multi` bool, `anonymous` bool, `show_results` (`'after_vote'|'always'`), `closes_at`, `closed_at`.
- `poll_votes`: `post_id`, `option_id`, `user_id`, `created_at`; primary key on `(post_id, user_id, option_id)`.
- `feed_events`: `post_id` pk, `title`, `starts_at`, `ends_at`, `capacity` int null, `cancelled_at`, `reminded_day_at`, `reminded_hour_at`.
- `event_rsvps`: `post_id`, `user_id`, `answer` (`going | maybe | no | waitlist`), `updated_at`; primary key on `(post_id, user_id)`.
- `post_audience`: `post_id`, `user_id`, `seen_at`, `acked_at`; primary key on `(post_id, user_id)`. Used only for pinned posts.
- `saved_posts`: `user_id`, `post_id`, `created_at`; primary key on `(user_id, post_id)`.
- `link_previews`: `url` pk, `data` jsonb, `fetched_at`. A cache.

**Other changes:**
- `feed_checks.created_at`: add it if missing, so old checks can be pruned.
- `officers` gets `feed_birthday` bool (default false) and `feed_welcome` bool (default true).
- `settings` gets `everyday` jsonb, default:
  ```
  {"shoutouts":true,"celebrations":{"birthday":true,"anniversary":true,"welcome":true,"qualification":true},"featured_topics":[]}
  ```
- `messages` gets `share` jsonb `{type:'post', id}`.

## Server

### New `functions/api/lib/feed.mjs`
Pure, testable helpers:
- `parseTopics(text)`: #words become lowercase, deduped, at most 10.
- `photoLayout(n)`: mirrors the client grid rule, used by tests only.
- `sniffMime(bytes)`: recognises jpeg/png/webp/gif from the first bytes. This fixes the "every image is image/jpeg" bug.
- `celebrationsDue(rows, londonToday)`:
  - birthdays: Feb 29 is celebrated on Feb 28 in non-leap years
  - anniversaries: from 1 year
- `pollTally(options, votes, {anonymous, viewerId})`: anonymous tallies never include voter ids.
- `promoteWaitlist(rsvps, capacity)`
- `isPrivateHost(ip)`: protects link previews from being pointed at internal addresses.
- `cleanPlace(result)`: drops house-number and building-address search results.
- `MUTE_DAYS = [1, 7, 30, 90]`

### `modules/everyday.mjs`: extended
**Stage A**
- `create` and `edit` accept:
  - `photos: [{key, w, h, caption}]`; the old `photo_keys` is still accepted.
  - `video {key, poster_key, duration, w, h}`, checked as follows:
    - It must be under the user's feed folder.
    - `headObject` must show 50 MB or less and a video/* type.
    - Duration must be 61 seconds or less.
  - `place`
  - `tags`, filtered by an updated `cleanPeople` (the old `cleanMentions` plus the officer active/onboarding filter)
  - `link_url`, which runs the preview and stores the result
  - `remove_link`
  - Topics are parsed from the text, and `venue_id` comes from `place.venue_id`.
- `precheck` adds the video poster frame to the AI's images, uses `sniffMime`, and adds photo captions to the text it checks.
- `edit` with a serious check result flags and notifies managers, exactly as `create` does. **Fix 1.**
- Tags notify the tagged people with kind `'tag'`.
- `everyday.untag`: a tagged person removes their own tag.
- `everyday.linkPreview {url}`:
  - Fetches the page with a 4-second timeout and a 512 KB cap, http(s) only, after a DNS check that rejects private addresses.
  - Reads og/twitter/title tags.
  - Copies the og image into storage at `docs/feed/links/<sha1>.jpg` (2 MB or less), so readers don't load images from other sites.
  - Results are cached in `link_previews` for 7 days.
- `everyday.places {q}`:
  - Venues: company venues matching the search by name or postcode, listed first. They come with lat/lng from the `venues` table.
  - Other places: Nominatim search (`countrycodes=gb`, `limit=8`, a proper User-Agent), passed through `cleanPlace`.
  - A per-user rate limit of 1 request per second, held in memory.
- `comment` and `editComment`:
  - accept `photo {key, w, h}` and mentions (editComment now notifies newly added mentions; **fix 2**)
  - run the AI check (**fix 3**); a serious result means the comment is inserted with `hidden_at` set and a hide reason of "Held for review", a report row is added and managers are notified
  - rate limit of 8 comments per minute per user
  - a reply to a reply keeps the current re-parenting and fills in "@Name"
- `assertNotMuted(user)` is split out of `assertCanPost` and used by `react`, `report`, `vote` and `rsvp`. **Fix 4.**
- `requireModule('everyday')` is added to every action that lacks it. **Fix 5.**
- `unhide` clears `hidden_reason` and `hidden_by`. **Fix 6.**
- The hide notification links to the post; the mute notification links to `/everyday`. **Fix 7.**
- `loadComments` with a preview returns the latest 2 top-level comments, each with its first reply and a `reply_count`. **Fix 8.**
- `everyday.post` accepts `comment_order: 'relevant' | 'newest'`. "Relevant" is ordered by reactions plus replies, then time.
- `everyday.remove` (managers only, posts and comments):
  - sets `deleted_at`, `deleted_by` and `removed_reason`
  - writes an audit entry holding a snapshot of the body, photos and author
  - closes open reports
  - notifies the author
  - **Fix 12.**
- `mute` only accepts `MUTE_DAYS`, matching the UI. **Fix 13.**
- `loadPosts` returns all the new fields with signed URLs (photos with w/h/caption, the video and its poster, the link image), plus `place`, `tags` (names) and `topics`.

**Stage B**
- **Shout-outs:** `create` with `kind:'shoutout'` and `shoutout {badge, to[]}`. The badge must be one of `BADGES`, and `settings.everyday.shoutouts` must be on. Recipients get a notification of kind `'shoutout'`.
- **Polls:**
  - `create` with `kind:'poll'` and `poll {question (= body), options[2..6], multi, anonymous, show_results, closes_at}`.
  - `everyday.vote {post_id, option_ids}`: replaces the person's previous votes; refused once the poll is closed.
  - `everyday.closePoll`: the author or a manager.
  - `everyday.voters {post_id, option_id}`: named polls only.
  - Results are attached in `loadPosts` through `pollTally`: hidden until the viewer has voted, unless the poll is set to always show results or is closed.
- **Events (managers only):**
  - `create` with `kind:'event'` and `event {title, starts_at, ends_at, capacity}`, plus place and a cover photo.
  - `everyday.rsvp {post_id, answer}`: when the event is full, "going" becomes "waitlist". When someone leaves "going", `promoteWaitlist` moves the next person up and notifies them.
  - `everyday.eventEdit` and `everyday.eventCancel` notify everyone who answered. These notifications always send.
  - `everyday.attendees`
  - `everyday.events`: upcoming events, used for the strip at the top of the feed.
- **Announcements:**
  - `pin` accepts `must_ack`.
  - `everyday.seenPosts {ids}`: batch upsert of `seen_at` for pinned posts.
  - `everyday.ack {id}`: sets `acked_at` and writes an audit entry.
  - `everyday.audience {id}` (managers): who has seen it, who hasn't, who has acknowledged, and the counts. Measured against active staff.
  - `everyday.ackRemind {id}` (managers): at most once an hour, using `ack_reminded_at`; notifies people who haven't acknowledged. Always sends.
  - In the pinned list, posts the viewer must acknowledge and hasn't yet come first.
- **Celebrations:**
  - New `modules/everydayJobs.mjs` with `feedJobs(s)`, run hourly from `runJobs`.
  - Between 07:00 and 09:00 London time it posts, as the Orb system user:
    - birthdays (only where `feed_birthday`)
    - anniversaries
    - welcomes (officers with `feed_welcome`, status `active`, created in the last 14 days, no welcome post yet)
  - Each kind respects `settings.everyday.celebrations`, and the `celebration.key` unique index keeps it idempotent.
  - **Qualifications:** in `academy.mjs`, right after the certificate insert (`:286`), call `celebrate('qualification', …)`. It's best effort and never fails the certificate.
  - The person celebrated gets a notification of kind `'celebration'`.
  - `everyday.hideCelebration`: the person celebrated can remove a post about themselves.
- **Event reminders:** also in `feedJobs`, run on every 5-minute tick. Events within 24 hours with no `reminded_day_at`, and within 1 hour with no `reminded_hour_at`, notify Going and Maybe with kind `'event'`.
- **Housekeeping:** `feed_checks` older than 30 days are pruned hourly. **Fix 11.**

**Stage C**
- **Live feed:**
  - `lib/realtime.mjs`: `realtimeToken` adds a shared `feed` channel to `subscribe` for staff when Everyday is on, and returns `channels`.
  - `publishFeed(event, data)` publishes once to `feed`. Events are hints only, with no content: `feed.post {id, author_id}` and `feed.update {post_id}`. They fire on react, comment, vote, rsvp, edit, hide and remove.
  - **Fallback if the platform refuses a second channel:** publish `feed.post` to everyone's personal channel. The token code tries both channels and drops back to one if refused.
- **Filters:** `everyday.feed` accepts `filter`:
  - `all`
  - `announcements` (pinned posts plus posts that were ever announced)
  - `shoutouts`
  - `events`
  - `polls`
  - `venues`: venue_id is a venue the person has worked in the last 90 days, from `shift_assignments`/`shifts`; for managers, their venue scope
  - `saved`
  - `topic`
  - `q` (search: `websearch_to_tsquery` over posts, plus the posts that own matching comments, plus author name ILIKE)
- **Saved:** `everyday.save {id, on}`.
- **Topics:** `everyday.topics` returns the featured topics plus the top topics of the last 30 days. Company managers set featured topics in settings.
- **Profile:** `everyday.profile` is extended with:
  - badge counts
  - tagged posts
  - paging (`before`)
  - upcoming events going to
  - the posting-status for managers stays as today
- **`everyday.posts {ids}`:** returns preview shapes, so live updates can refresh only the cards on screen.

### Other server files
- `modules/messages.mjs` `messages.send` accepts `share {type:'post', id}`:
  - The sender must be staff and able to see the post.
  - It is stored in `messages.share`.
  - `shapeMessages` (`lib/threads.mjs`) adds a share card of `{post_id, author, snippet, thumb}`. Readers who aren't staff get `{restricted:true}`.
- `lib/notify.mjs`: `OPTIONAL_KINDS` adds `shoutout`, `tag`, `event` and `celebration`.
- `modules/settings.mjs`: reads and writes `everyday` settings (company only).
- `modules/officers.mjs` (officer's own profile update): allows `feed_birthday` and `feed_welcome`.
- `lib/guide.mjs:245`: corrected text, plus new lines about shout-outs, polls, events and acknowledging. **Fix 9.**
- `lib/orbCatalog.mjs`: add read actions (`everyday.events`, feed search) and, as confirm-first actions, `vote`, `rsvp` and shout-out create.

## Client — `app/src/pages/everyday/` and shared UI

**Stage A**
- `_parts.jsx`:
  - New `PhotoGrid` with Facebook layouts:
    - 1 photo: natural aspect, clamped to between 4:5 and 16:9, using w/h so nothing jumps while loading
    - 2: side by side; portraits stack the other way
    - 3: one large and two small
    - 4: 2×2
    - 5 or more: 2 on top, 3 below, "+N" on the last tile
  - `Body` linkifies URLs and turns #topics into buttons.
  - `PlaceLine` shows "at X" and opens the map (`https://maps.google.com/?q=lat,lng`).
  - `WithLine` shows "with A and B".
  - `LinkCard`, `VideoPlayer` (shows the poster frame, autoplays muted when on screen using an IntersectionObserver, tap to unmute).
- New `app/src/ui/PhotoEditor.jsx` (no new dependencies):
  - canvas crop with aspect presets (free, 1:1, 4:5, 16:9) and drag handles
  - rotate 90°
  - a blur brush that pixelates painted areas, with undo
  - a caption field
  - outputs a Blob, which goes through `compressImage`
- `ui/index.jsx` `Lightbox` gets:
  - swipe left/right
  - a caption overlay
  - pinch and double-tap zoom
  - a download button for managers and the author
  - backwards compatible with its current callers
- `Composer.jsx`:
  - photo tiles open `PhotoEditor` before upload
  - records w/h
  - a "Video" button: `<input accept="video/*" capture>`; it reads duration and size, refuses anything over 60 seconds or 50 MB, captures the poster frame at 0.5 s with a canvas, and uploads the video and the poster
  - "Location" opens the new `PlacePicker.jsx`: a search box with venues first, then places, debounced
  - "Tag people" reuses the people list from `everyday.people`
  - the first URL in the text fetches a preview, which can be removed with ×
- New `Comments.jsx`, extracted from `PostCard.jsx`:
  - threaded list with "View N replies"
  - an inline reply box under the comment, using `MentionBox` with "@Name" filled in
  - the "Most relevant / Newest" toggle
  - a comment photo button
  - edit uses `MentionBox`
  - held comments show "Held for review" to the author
- `PostCard.jsx`:
  - renders the new parts
  - managers get "Remove permanently" (`ReasonSheet`)
  - a tagged person sees "Remove my tag"
- `MuteSheet` uses `MUTE_DAYS`.

**Stage B**
- Composer type tabs: **Post · Shout-out · Poll · Event** (Event for managers only).
- New `ShoutoutCard`/`ShoutoutEditor` (badge picker, colleagues, coloured card), `PollCard`/`PollEditor`, `EventCard`/`EventEditor`:
  - Event cards have RSVP buttons, an attendees sheet, and "Add to calendar", which generates an `.ics` on the device.
  - The upcoming-events strip sits at the top of the feed.
- `CelebrationCard`: an Orb-authored banner style. The person celebrated gets a "Remove" option.
- `PinSheet` gets a "Must acknowledge" switch.
- Pinned cards get:
  - an "I've read this" button for people who need to acknowledge
  - for managers, "Seen by 42 of 60", which opens the new `AudienceSheet.jsx` with Seen / Not seen / Acknowledged tabs and a "Remind the rest" button
  - an IntersectionObserver that counts a post as seen after about 1 second on screen, sent to `seenPosts` in batches
- `pages/people/Settings.jsx`: a new Everyday section with shout-outs on/off, the four celebration switches and featured topics.
- `officer/_notify.jsx` and `Settings.jsx` notification labels: the four new kinds.
- `officer/Me.jsx`: "Celebrate my birthday on Everyday" and "Welcome post when I start" toggles.

**Stage C**
- `Feed.jsx`:
  - a filter chip row: All / Announcements / Shout-outs / Events / Polls / My venues / Saved
  - a search box
  - URL params `?filter=&topic=&q=&person=`; topic and person views replace the stream in place, so this works inside the manager Dashboard tab
  - `useRealtime(['feed.post','feed.update'])`: `feed.post` from someone else shows a "↑ N new posts" pill, and tapping it reloads and scrolls to the top
  - `feed.update` refreshes the visible cards through `everyday.posts`, throttled to once every 2 seconds
- New `Profile.jsx`: a full page with header, since, badges, Posts / Tagged tabs, upcoming events, and load more. `PersonSheet` gets a "See full profile" link.
- Save/Unsaved in the post menu.
- "Share to chat" opens the new `ShareSheet.jsx`, which picks a conversation from `messages.list` and sends `messages.send {conversation_id, share}`.
- `pages/messages/Thread.jsx`: renders the share card (opens `/everyday?post=`), or "Shared from Everyday — staff only" when restricted.
- `layouts/Shell.jsx`: the unread badge also goes up on `feed.post` from others, without waiting for the 60-second poll.
- `app/src/realtime.js`: subscribes to every channel in `token.channels`, falling back to `token.channel`.

## Tests — `functions/api/test/everyday.test.mjs` (node:test, like `chat.test.mjs`)
Cover the `lib/feed.mjs` helpers:
- parseTopics
- sniffMime
- celebrationsDue: Feb 29, an anniversary on the start day, no birthday without opt-in
- pollTally: anonymous results have no ids; results hidden before voting
- promoteWaitlist
- isPrivateHost: 10.x, 127.x, 169.254.x, ::1
- cleanPlace: drops house-number results
- the MUTE_DAYS check

This also closes **fix 15** (there were no feed tests).

## Stage delivery
For each of stages A, B and C:
1. `cd app && npm run build`. The Vite build is the lint check.
2. `cd functions/api && node --test test/`
3. Commit `feat: Everyday — …`, then `build: rebuild app bundle for Everyday …`, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
4. From `/home/user/project`: `openkbs fn deploy api` (on a clean tree, so it tags), then `openkbs site deploy`, then `git push`.
5. Warm the API with `curl -X POST https://d1frgg0li4mxhp.cloudfront.net/api`. This applies migration 027 at stage A; later stages add 028 and 029 only if needed.
6. Update the board card with a short business-language summary.

## Verification (each stage, on the deployed site, with agent-browser, then `agent-browser close --all`)
- **Stage A:**
  - Post 1, 2, 3, 4 and 6 photos and check each layout. Open the viewer, swipe, and read the captions.
  - Crop, rotate and blur a photo, and confirm the uploaded image is the edited one.
  - Post a short video and check the poster frame and muted autoplay.
  - Post a link and check the preview card. Point a preview at `http://169.254.169.254` and confirm it is refused.
  - Location: search "Ministry" (venue) and "Hyde Park" (place), and confirm a house address is not offered.
  - Tag someone, check they get a notification, and remove the tag as them.
  - Reply inline, check "View 2 replies", and check the reply appears in the feed preview.
  - Comment with a photo.
  - A muted person trying to react gets 403.
  - Remove a post as a manager and check the audit entry.
- **Stage B:**
  - Shout-out with a badge, then check the profile badge count.
  - Poll: vote, change the vote, check anonymous results never list names, close the poll.
  - Event with capacity 1: a second "Going" lands on the waitlist and is promoted when the first person leaves.
  - Run `runJobs` by hand (`openkbs fn invoke api -d '{"action":"jobs.run"}'` or the existing trigger) and check the reminders and a celebration for a test officer with today's start date. Run it a second time and check no duplicate appears.
  - Must-acknowledge: check the "Seen by" counts, "I've read this", and that Remind is blocked within the hour.
- **Stage C:**
  - With two browsers, check that a post in one shows the "New posts" pill in the other, and that a reaction updates live.
  - Check each filter, a #topic page, a search that finds a comment, and Saved.
  - Share to a chat and open the card.
  - Open a full profile.
