# Plan: Orb Academy, Officer Toolbox and Everyday v1

## Context
The approved spec is `spec/spec-orb-academy-training-officer-toolbox-and-everyday-feed.md`. It adds three new modules plus a reorganised menu:
- **Academy:** AI-drafted, manager-approved training with quizzes, assignment, certificates and a link to the compliance check.
- **Toolbox:** offline guidance cards.
- **Everyday:** a staff feed with posts, photos, reactions, comments and mentions.

This plan reuses the existing Orb pieces:
- the single `api` Lambda with its action map (`functions/api/index.mjs`, roles in `modules/_def.mjs`)
- `q/one/tx` (`lib/db.mjs`) and migrations run automatically
- `notify()` (`lib/notify.mjs`)
- `claude/extract/checkCap` (`lib/ai.mjs`)
- `upload()` (`app/src/api.js`), with purposes mapped in `modules/documents.mjs:25`
- the UI kit (`app/src/ui/index.jsx`)
- nav data in `app/src/layouts/nav.js`, rendered by `layouts/Shell.jsx`
- `compliance.mjs` issues and remind

Build order follows the spec: (1) menu and Toolbox, (2) Academy, (3) Everyday. Each phase is built, deployed and checked live before the next.

## 1. Database: `functions/api/db/migrations/004_learn_everyday.sql`
- **settings:**
  - `modules jsonb DEFAULT '{"academy":true,"toolbox":true,"everyday":true}'`
  - `ai_module_caps jsonb DEFAULT '{}'`, credits per month per module; empty means only the overall cap applies
- **ai_usage:** `(month text, module text, credits numeric)`, primary key `(month, module)`
- **users:**
  - `notify_prefs jsonb DEFAULT '{}'`, with keys mention, comment, reaction, announcement and training; a missing key counts as on
  - `feed_seen_at timestamptz`
  - `feed_rules_at timestamptz`
- **push_subscriptions:** `(id, user_id, endpoint UNIQUE, keys jsonb, created_at)`
- **app_secrets:** `(name PK, value)` holds the web-push signing keys and is never returned by any action
- **Academy tables:**
  - `courses (id, title, topic, summary, status draft|published|archived, pass_mark int 80, quiz_size int 10, cooldown_hours int 24, mandatory bool, renew_months int NULL, sources jsonb, review_by date, version int, created_by, published_by, published_at, updated_at)`
  - `course_sections (id, course_id, position, title, body text (markdown-lite), check jsonb {prompt, options[], answer, explain})`
  - `course_questions (id, course_id, section_id, kind mcq|scenario, prompt, options jsonb, answer int, explain, active bool)`
  - `course_assignments (id, course_id, officer_id, due_date, assigned_by, assigned_at, UNIQUE(course_id, officer_id))`
  - `course_progress (officer_id, course_id, done_sections uuid[], updated_at, PK)`
  - `quiz_attempts (id, officer_id, course_id, course_version, question_ids uuid[], answers jsonb, score int, passed bool, started_at, submitted_at)`
  - `certificates (id, ref text UNIQUE e.g. ORB-TR-1001, officer_id, course_id, attempt_id, score, issued_at, expires_at)`
- **Toolbox tables:**
  - `toolbox_cards (id, category first_aid|situations|law|venue, title, summary, steps jsonb[], dont jsonb[], law text, report_tips text, escalate text, tags text[], venue_id NULL, course_id NULL, status, sources jsonb, review_by, version, updated_by, updated_at)`
  - `toolbox_favourites (user_id, card_id, PK)`
- **Everyday tables:**
  - `posts (id, author_id, body, photos jsonb [{key}], mentions uuid[], pinned_at, edited_at, hidden_at, hidden_by, hidden_reason, deleted_at, ai_check jsonb, created_at)`
  - `post_comments (id, post_id, parent_id NULL, author_id, body, mentions uuid[], edited_at, hidden_at, deleted_at, created_at)`
  - `reactions (target_type post|comment, target_id, user_id, kind like|love|laugh|wow|sad|clap, created_at, PK(target_type, target_id, user_id))`
  - `feed_reports (id, target_type, target_id, reporter_id NULL (NULL means Orb AI), reason, status open|actioned|dismissed, resolved_by, resolved_at, created_at)`
  - `feed_mutes (user_id PK, until, reason, by)`
  - `feed_checks (hash PK, result jsonb, created_at)`, which caches the AI pre-check so posting doesn't pay for it twice
- **Indexes:** `posts(created_at DESC)`, `post_comments(post_id)`, `course_assignments(officer_id)`.

## 2. Backend (`functions/api`)
**`lib/modules.mjs` (new)**
- `moduleOn(name)` reads `settings.modules`.
- `requireModule(name)` throws a 403: "This module is switched off".

**`lib/ai.mjs`**
- `claude()` and `extract()` take `module = 'ops'`.
- After each call, upsert `ai_usage` for that month and module.
- `checkCap(module)` also enforces `ai_module_caps[module]`, notifying managers once a month per module.
- Existing callers are unchanged; they default to ops.

**`lib/notify.mjs`**
- Skip a recipient whose `notify_prefs[kind] === false` (for feed and training kinds only; operational alerts always go).
- After inserting, send web push to that user's subscriptions in parallel, with a 3 s timeout, never throwing. A 404 or 410 deletes the subscription.

**`lib/webpush.mjs` (new, Node crypto only, no dependencies)**
- VAPID ES256 JWT plus aes128gcm payload encryption (RFC 8291/8188).
- Keys are generated on first use and stored in `app_secrets`.

**`modules/notifications.mjs`**
- `notifications.prefs.get/save`
- `push.publicKey`
- `push.subscribe {subscription}`
- `push.unsubscribe`

**`modules/documents.mjs`**
- Add the upload purpose `feed` (folder `feed`).

**`modules/settings.mjs`**
- `settings.get` also returns `modules` to every role.
- `settings.update` (company only) accepts `modules` (validated keys) and `ai_module_caps`.
- Usage for the current month by module comes from `ai.usage`.

**`modules/toolbox.mjs` (new)**
- Officers and managers:
  - `toolbox.list` returns published cards, plus venue cards only for that venue's team. A venue's team is officers with a shift there in the last 90 days or the next 30.
  - `toolbox.get` and `toolbox.favourite {id, on}`.
  - Managers also see drafts.
- Company only:
  - `toolbox.save` (edits to a published card bump the version) and `toolbox.publish` / `unpublish` / `archive`.
  - `toolbox.draft {title or topic, category}`: SONNET `extract` returns a card in the structure above, with sources named (for example "Resuscitation Council UK Guidelines 2021", "PACE 1984 s24A"). It's saved as a draft with `module = 'toolbox'`.
- `toolbox.suggest {text}` (officer): HAIKU gets the situation plus the titles and summaries of published cards visible to the officer, and returns up to 3 `{card_id, why}`.
  - The prompt forbids giving steps that aren't on a card.
  - If nothing fits, it says "Call your supervisor, or 999 in an emergency".

**`modules/academy.mjs` (new)**
- **Officer**
  - `academy.my` returns assigned, in-progress and completed courses plus certificates.
  - `academy.catalog`
  - `academy.course {id}` returns the sections and the quick checks; answers are hidden until the check is answered.
  - `academy.sectionDone`
- **Quiz**
  - `academy.quizStart {course_id}` enforces the cool-down after a failed attempt. It picks `quiz_size` random active questions and returns them without answers.
  - `academy.quizAnswer {attempt_id, question_id, choice}` answers once. It returns correct, explain and section_id.
  - `academy.quizSubmit` scores the attempt. A pass issues a certificate, with `expires_at` from `renew_months`, and notifies the officer.
- **Tutor**
  - `academy.tutor {course_id, messages}` uses SONNET with `module = 'academy'`.
  - The system prompt holds only the published course text. The tutor answers from it, says when a question is outside the course, and points to the toolbox and a manager for anything else.
- **Managers (company and security)**
  - `academy.results` returns the officer × course matrix plus the most-missed questions.
  - `academy.assign {course_id, target: all|role|venue|officers, ids, due_date}` resolves the target to active officers, upserts the assignments and notifies each officer (kind training).
  - `academy.unassign`
- **Company only**
  - `academy.save` (course meta, sections, questions)
  - `academy.publish` sets the version and review_by to 12 months; `academy.unpublish` / `archive`
  - `academy.draftOutline {topic, notes}` (SONNET) returns the title, summary, 4–8 section titles and sources, and creates a draft course.
  - `academy.draftSection {course_id, section_id}` (SONNET, about 2.5k tokens out) writes that section's body, its quick check and 3–4 quiz questions.
  - The client calls one action per section, so every request stays well under the 60 s Lambda limit.
  - `academy.starterTopics` returns the spec's topic list, so the manager can tick topics and draft a whole starter library from the UI with a progress bar.

**`modules/everyday.mjs` (new; all four staff roles except venue, gated by `requireModule('everyday')`)**
- **Feed**
  - `everyday.feed {before}` returns pinned posts first, then a cursor page of 20. Each post has its author, signed photo URLs, reaction counts and my reaction, the comment count and the first 2 comments.
  - `everyday.post {id}` returns one post with all its comments.
  - `everyday.people` returns active staff for @mentions.
  - `everyday.profile {user_id}` returns the person card (photo, role, start year) and their posts.
- **AI pre-check**
  - `everyday.precheck {body, photo_keys}` (HAIKU vision, `module = 'everyday'`) returns `{warnings[], serious bool}`.
  - It checks for abuse or threats, incident or customer details, customers' faces, and personal data such as plates, names or phone numbers.
  - Results are cached in `feed_checks` by a hash of the body and the keys.
- **Posting**
  - `everyday.create {body, photo_keys ≤10}` refuses if the poster is muted.
  - It reuses or runs the pre-check and stores it in `ai_check`.
  - If the check is serious, it auto-files a `feed_reports` row (reporter Orb AI) and notifies the managers.
  - Mentioned users are notified (kind mention).
  - `everyday.edit` and `everyday.delete` (soft) are for the post's own author.
- **Comments, reactions and reports**
  - `everyday.comment {post_id, parent_id, body}` keeps threads one level deep. It notifies the post author (kind comment) and anyone mentioned.
  - `everyday.react {target_type, target_id, kind|null}` notifies the author (kind reaction). The dedupe key is `react:<target>:<London date>`, so reactions arrive as one grouped notice per day.
  - `everyday.report {target_type, target_id, reason}`
  - `everyday.seen` sets `feed_seen_at`; `everyday.unread` returns the count of newer posts for the header badge.
  - `everyday.acceptRules`
- **Managers**
  - `everyday.pin {id, on}`; pinning with "announce" also notifies all staff (kind announcement).
  - `everyday.hide {target, reason}` / `unhide`
  - `everyday.reports` and `everyday.resolve`
  - `everyday.mute {user_id, days, reason}` / `unmute`
  - Every manager action is audited.

**`modules/compliance.mjs`**
- `computeIssues` also loads the officers' mandatory assignments and certificates.
- `officerIssues` adds:
  - `training:<course_id>`, severity soon, when a mandatory assignment is overdue with no valid certificate;
  - urgent when it is more than 14 days overdue;
  - advisory when a mandatory certificate has expired. The issue's sig is built from the due date and the certificate id.
- The action is `remind` with `params: {course_id, what}`.
- `decideCompliance` remind: when `params.course_id` is set, send the training text and link to `/officer/learn/academy/:id`.

**`modules/jobs.mjs`, new `learnJobs()` (runs when the academy module is on)**
- Notify officers 3 days before a due date and on the day it becomes overdue (dedupe keys).
- When a mandatory certificate expires within 30 days, create a renewal assignment due on the expiry date.
- Remind company managers once when a course or card is past `review_by`.

**`index.mjs`**
- Register `toolbox`, `academy` and `everyday`.

## 3. Frontend (`app/src`)
**Shared chat: `ui/Chat.jsx`**
- Extract the `Chat` component from `pages/manager/OpsAI.jsx:325-396` with props `{action, extra, storageKey, prompts, empty}`.
- OpsAI keeps its "Open in Inbox" link through a `renderReply` prop.
- Used by OpsAI and by the tutor.

**Menu: `layouts/nav.js`, `layouts/Shell.jsx`**
- **Officer tabs:** Home · Shifts · Clock (primary) · Learn · Me. Pay moves to a row on `officer/Me.jsx`; the route stays.
- **Company:** a new "Team" group with Academy, Toolbox and Everyday.
- **Security:** the same three items are appended.
- **Module switch:** items carry `module`, and Shell hides them when `settings.modules[module] === false`.
- **Header:** an Everyday icon next to the bell for every role except venue, with an unread badge (polls `everyday.unread`, 60 s).

**Officer pages: `pages/learn/`**
- `Learn.jsx`, the hub:
  - assigned courses with due chips and a "Continue" option;
  - Toolbox search box, favourites and categories;
  - "What should I do?" and "Revise" entries;
  - my certificates.
- `Course.jsx` shows sections with the quick checks and a progress bar, then "Take the quiz". It has a tutor button that opens `Chat` in a Sheet.
- `Quiz.jsx` goes one question at a time, with instant right or wrong plus the explanation and a "Read this section" link. The result screen shows pass or fail, the score and the retake time.
- `Certificate.jsx` is a printable certificate page (print CSS) showing "In-house training record — not an SIA qualification".
- **Toolbox views:**
  - `Toolbox.jsx` is the list and search.
  - `Card.jsx` shows the summary, numbered steps, don'ts, the law, what to write in the report and when to call 999 or a manager.
  - Each card has a favourite button, the linked course, a "Report an incident" shortcut and its sources plus last-reviewed date.
- `Revise.jsx` is the flashcard flip with "Got it" / "Again" tracking (local only).
- **Offline:** the published card list is stored in `localStorage['orb.toolbox']` with its version. When the request fails offline, the cached cards are shown with an "Offline — saved copy" pill. Cards are text-only, so nothing else needs caching.

**Manager pages: `pages/team/`, routes in `managerRoutes`**
- `Academy.jsx` has three tabs:
  - **Courses:** status, review date and a "Draft with AI" option.
  - **Results:** the matrix (`Table`), most-missed questions, CSV via `downloadText`, and an Assign sheet with target chips and a due date.
  - **Starter library:** tick topics, then each is drafted section by section with progress.
- `CourseEditor.jsx`:
  - edit the meta (pass mark, mandatory, renew months, quiz size), sections and questions;
  - "Draft section with AI" per section;
  - sources;
  - Publish. Only company managers can edit or publish; security managers get read-only results and Assign.
- `ToolboxAdmin.jsx` and `CardEditor.jsx`: the list by category with draft, published and review-due states; the editor with "Draft with AI", venue scope and course link.
- `Moderation` is a tab inside the Everyday page for managers: open reports, hidden items and muted members.

**Everyday: `pages/everyday/`, routes `/officer/everyday` and `${base}/everyday`**
- `Feed.jsx` shows the composer at the top, pinned announcements, then infinite scroll (load more).
- `Composer.jsx`:
  - text with @mention autocomplete from `everyday.people`;
  - up to 10 photos via `upload(file, 'feed')` and `compressImage`;
  - on Post it runs `everyday.precheck` and shows the warnings with "Edit" or "Post anyway";
  - the first time someone posts, the community rules sheet appears.
- `PostCard.jsx`:
  - the author shows an avatar and opens a `PersonCard` sheet;
  - the photo grid opens a lightbox;
  - reactions use a tap for like and a long-press or hover picker for the six kinds, with a "who reacted" sheet;
  - the comment preview expands into a thread with replies;
  - a menu offers edit, delete, report and, for managers, pin, hide and mute.

**Officer and staff profile**
- `officer/Me.jsx` adds Pay, Training and certificates, and a Notifications sheet. The sheet has preference toggles and "Turn on phone notifications", which registers the push subscription and explains that on iPhone it only works after adding Orb to the home screen.
- `officer/Home.jsx` adds a "Training due" tile and a "Latest from Everyday" strip.
- `people/_profileTabs.jsx` adds a Training tab (assignments, scores, certificates).

**Settings**
- `people/Settings.jsx` (company): a "Modules" section with Academy, Toolbox and Everyday toggles.
- The OpsAI Settings tab shows AI credits used this month by module and an optional cap for each module.

**`public/sw.js`**
- Add `push` (showNotification with title, body and link) and `notificationclick` (focus or open the link).
- Bump the cache to `orb-shell-v2`.

## 4. Starter content and test data
- **Starter content:** after phase 1 and 2 deploys, as the company test user in the browser, draft the starter library with AI:
  - about 12 Toolbox cards across first aid, situations and law;
  - about 6 courses: law and powers, use of force, conflict management, first aid awareness, vulnerable people and spiking, and counter-terrorism awareness.
  - Publish them after a read-through for obvious errors. Wording stays awareness-level, and first aid points to certified training.
- **Report** the credits used.
- **Assignments:** assign one mandatory course to everyone, with one officer's due date in the past to test the compliance link.
- **Everyday:** a few test posts are created through the UI only.

## 5. Deploy, per phase
1. `cd app && npm run build`.
2. Commit everything as `feat: …` with Co-Authored-By.
3. `openkbs fn deploy api --schedule "rate(5 minutes)" -t 60`.
4. `openkbs site deploy`.
5. The migration runs on the first invocation.
6. Comment on the board card in plain business language when each phase is done.

## 6. Verification (live, `/tmp/login.sh`, officer at 390 px, manager at 1440 px, read-only DB checks)
1. **Menu**
   - The officer bar has Learn, and Pay is reachable from Me.
   - The Team group appears for company and security managers.
   - Switching a module off hides it and its actions return 403.
   - Venue users don't see Everyday and get a 403 from its actions.
2. **Toolbox**
   - A drafted card is invisible to officers until it's published.
   - Search finds it.
   - With the network blocked (agent-browser `network route --abort`), Learn shows the saved copy.
   - "What should I do?" for "customer collapsed, not breathing" returns the CPR card and the 999 line.
   - Venue-only cards are hidden from officers outside that venue.
3. **Academy**
   - Draft a course with AI, edit it and publish.
   - The officer completes the sections and takes the quiz, getting per-answer feedback.
   - A fail shows the retake time and the cool-down is enforced by the API.
   - A pass shows a certificate on Me and on the staff profile, and the certificate prints.
   - The tutor declines an off-course question.
   - The results matrix and CSV are correct.
   - An overdue mandatory course appears on the compliance card after "Run compliance check", and its remind sends the training notice.
4. **Everyday**
   - Post with 2 photos and an @mention; the mentioned user gets a notice in the bell (and a push if subscribed).
   - React and comment, including a reply.
   - Posting a photo of the incident evidence triggers a pre-check warning.
   - Report a post, then hide it as a manager; it disappears for officers.
   - A muted member can't post.
   - Pinned announcements stay at the top.
   - Notification preferences turn reaction notices off.
5. **AI caps:** with an Everyday cap of 0, the pre-check is skipped and the post still works; AI drafting shows a friendly message. Credits by module show in settings.
6. **Layout:** no horizontal overflow at 390 px or 1440 px on the new pages.
7. **Wrap-up:** report the credits used, comment on the board card and move it to Review, and run `agent-browser close --all`.
