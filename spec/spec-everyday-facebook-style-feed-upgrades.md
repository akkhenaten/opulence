# Spec: Everyday — Facebook-style feed upgrades

## Why
Everyday is the company's staff social feed: posts with photos, reactions, comments, @mentions, pinned announcements and moderation. Next to Facebook it looks thin. Staff can't celebrate each other, run a poll, organise a social, show where a photo was taken, post a clip, find an old post, or see a reply thread properly. Managers can't tell who actually read an announcement. A few safety loose ends also let content slip past checks.

The goal is to make Everyday the place staff want to open: recognition, team life and venue pride, while keeping it safe and moderated.

**Who:** officers, security managers and company managers, the people who can see Everyday today. Venue users stay excluded.

## Decisions taken
- **All four areas are in scope:**
  - shout-outs and celebrations
  - polls and events
  - a live feed and richer posts
  - topics, search and filters
- **Plus:**
  - a Facebook-style picture grid
  - photo cropping
  - location tagging
  - inline replies
- **Location:** people tag one of the company's venues (offered first) or any place or address found by search.
- **Defaults used where you didn't answer (change any of these):**
  - **Replies:** Facebook style, two levels.
  - **Announcements:** managers see "Seen by"; "Must acknowledge" is optional.
  - **Safety loose ends:** fixed in this same piece of work.
  - **Who can post what:** everyone can post shout-outs and polls; only managers can create events.
  - **Video:** clips up to 60 seconds, one per post.
  - **"etc" extras included:**
    - tag people
    - photo editing (crop, rotate, blur faces and number plates)
    - a swipe-through photo viewer with a caption on each photo
  - **"etc" extras left out:** feelings and activities.

## Requirements

### 1. Posts that look and feel like Facebook
- **Picture grid:**
  - The layout fits the number and shape of the photos: 1 photo is shown full width at its natural shape; 2 side by side; 3 as one large plus two small; 4 as a 2×2 grid; 5 or more as 2 on top and 3 below, with "+N" on the last tile.
  - Portrait and landscape photos are placed sensibly.
  - Photos don't jump around while loading, because the size is known up front.
- **Photo viewer:**
  - Swipe through the photos full screen, with an optional caption on each.
  - Comments and reactions stay on the post.
  - Pinch to zoom, and managers and the author can download.
- **Before posting, each photo can be:**
  - **Cropped** to free, square, 4:5 or 16:9.
  - **Rotated.**
  - **Blurred** by painting over faces, number plates or ID cards. This is important for photos taken at a venue or after an incident.
  - Edits happen on the phone, and only the edited photo is uploaded.
- **Video:**
  - One clip per post, up to 60 seconds and about 50 MB, recorded or picked from the phone.
  - It shows a still frame first, plays in the feed muted, and taps to unmute.
  - The AI safety check looks at the still frame and the text.
- **Links:**
  - Web addresses in posts and comments become tappable.
  - The first link gets a preview card with title, image and site name, fetched by the server. A preview can be removed before posting.
- **Location tag:**
  - "at Ministry of Sound" or "at Hyde Park, London".
  - The picker shows the company's venues first, then search results for any place or address in the UK.
  - Tapping it opens the map.
  - Venue tags power the "My venues" filter.
  - Exact home addresses are never suggested; place search returns named places and streets only.
- **Tag people:**
  - "with Sam Okafor and Priya Shah".
  - Tagged people are notified (an optional notification type), and the post shows on their profile.
  - A tagged person can remove their own tag.
- **Comments:**
  - Can include one photo or GIF-style image, which gets the same AI check.
  - Links in comments are tappable.

### 2. Inline replies (Facebook style)
- "Reply" under a comment opens a reply box right there, with "@Name" filled in, instead of the bottom box.
- Replies are indented under their comment. More than one shows as "View N replies" and expands in place.
- Replying to a reply stays in the same thread, two levels deep, as today.
- The feed preview shows the latest comment and its first reply, so a conversation is visible without opening the post.
- Comments can be ordered "Most relevant" (by reactions and replies) or "Newest".
- Editing a comment uses the same @mention box, and newly added mentions are notified.

### 3. Shout-outs and celebrations
- **Shout-out post type:**
  - Pick one or more colleagues, a badge, and a message.
  - Badges: Above and beyond, Calm under pressure, Great teamwork, Customer hero, Sharp eyes, Safety first, Welcome aboard.
  - The post is shown as a coloured card.
  - Recipients are notified.
  - Profiles show a count of each badge received.
  - Managers can turn shout-outs off in Settings.
- **Automatic celebration posts, written by "Orb" and posted on the morning of the day:**
  - **Birthdays:** only for people who opt in on their profile. The default is off, because date of birth is personal. No age is shown.
  - **Work anniversaries:** from the start date, "3 years with the team".
  - **New starters:** a welcome post when an officer first becomes active, if they opt in at onboarding.
  - **Qualifications:** an optional "Congratulations on your SIA licence or course" post when a course certificate is issued.
  - Each kind can be switched on or off by the company in Settings.
  - Colleagues react and comment as normal.
  - A person can hide a celebration post about themselves.

### 4. Polls
- Anyone can ask a question with 2–6 options. They can choose:
  - one answer or several
  - whether results are anonymous or named
  - a closing time (optional)
- People can change their vote until the poll closes.
- Results show as bars with percentages after voting, or always if the author chose that.
- The author and managers can close a poll early.
- Named results show who voted for what. Anonymous results never reveal who voted, even to managers.

### 5. Events
- Managers create an event with:
  - title
  - date and time
  - location (venue or place)
  - cover photo
  - details
  - an optional maximum number of places
- Staff answer Going, Maybe or Can't go. A full event shows "Full — join the waiting list".
- Attendee lists and counts are shown.
- Going and Maybe get a reminder the day before and an hour before.
- Changes and cancellations notify everyone who answered.
- An "Upcoming events" strip sits at the top of the feed, and an event can be added to the phone calendar.

### 6. Announcements: seen and acknowledge
- On pinned announcements, managers see "Seen by 42 of 60" and the lists of who has and hasn't seen it.
- A post counts as seen when it is on screen for about a second.
- **Optional "Must acknowledge":**
  - Staff get an "I've read this" button, and the announcement stays at the top for them until they tap it.
  - Managers see who has acknowledged and can send one reminder per hour to the rest.
  - Acknowledgements are recorded in the audit log, which is useful as evidence that a policy was read.

### 7. Live feed
Using the live connection added for chat:
- A "New posts" button appears at the top when someone posts. It doesn't jump the feed.
- Reactions, comments, replies, poll results and event counts update live on posts on screen.
- The Everyday badge updates live.
- If the live connection drops, the feed falls back to refreshing as today.

### 8. Find things: topics, search, filters, saved, sharing
- **#topics:** in posts become tappable and open a feed of that topic. Managers can feature a few topics as chips, such as #Wins, #Training or #VenueNews.
- **Search:** finds posts and comments by words, topic, person or place.
- **Feed filters:**
  - All
  - Announcements
  - Shout-outs
  - Events
  - Polls
  - My venues (venues they've worked in the last 90 days)
  - Saved
- **Saved:** save a post to come back to later, shown in the Saved filter. It's private to the person.
- **Share to chat:** send a post into a Messages chat as a link card that opens it. People who can't see Everyday (venue users) can't share to it or open it.
- **Profile page:** a full page per person with:
  - photo and role
  - "with the team since …"
  - badges received
  - all their posts and posts they're tagged in, paged
  - upcoming events they're going to
  - Managers also see posting status, as today.

### 9. Safety and fixes to what exists
- Editing a post re-runs the AI check, and a serious result alerts managers like a new post does.
- Comments, including comment photos, get the AI check. A serious comment is held and flagged to managers.
- People who are paused from posting also can't comment, react, vote or answer events while paused.
- The notices "a manager hid your post" and "you can't post for N days" open the right screen.
- Managers can permanently remove content, as well as hide it. This is audited and keeps the original for the audit record.
- Unhiding clears the hide reason.
- Mentions and tags only offer people who are actually working for the company.
- The in-app guide text is corrected to match how posting really works.
- The pause lengths offered match what the system accepts.
- Every new content type (poll, event, shout-out, video, comment photo, location, link preview) can be reported, hidden and moderated like posts are today.

### 10. Notifications
- **New optional notification types,** which each person can turn off and the company can set defaults for:
  - shout-out received
  - tagged in a post
  - event reminders
  - celebrations about me
- **Always sent:**
  - must-acknowledge announcements
  - event changes and cancellations for people who answered

## Permissions summary
| | Officer | Security manager | Company manager |
|---|---|---|---|
| Post, photo/video, location, tags, shout-out, poll | ✓ | ✓ | ✓ |
| Create events | — | ✓ | ✓ |
| Must-acknowledge announcements, see "Seen by" | — | ✓ | ✓ |
| Close any poll, edit or cancel any event | — | ✓ | ✓ |
| Remove content permanently, hide, pause posting | — | ✓ | ✓ |
| Celebration and shout-out settings | — | — | ✓ |

Venue users still have no access to Everyday.

## Out of scope
- Stories
- Groups and spaces
- Feelings and activities
- Livestreams
- Reposting inside the feed
- Direct sharing outside the company
- Unlimited-depth comment threads
- Videos longer than 60 seconds
- Officer-created events

## Suggested delivery order (one spec, three releases)
1. **Richer posts:**
   - picture grid and viewer
   - crop, rotate and blur
   - video
   - links
   - location
   - tag people
   - inline replies
   - comment photos
   - safety fixes
2. **Team life:**
   - shout-outs
   - celebrations
   - polls
   - events
   - announcements seen and acknowledge
3. **Live and findable:**
   - live feed
   - #topics
   - search
   - filters
   - saved
   - share to chat
   - profile page

## Success looks like
- Staff open Everyday more often, measured by unread badges being cleared.
- Most managers' policy announcements reach 90% acknowledged within 48 hours.
- No unchecked content reaches the feed through edits or comments.
