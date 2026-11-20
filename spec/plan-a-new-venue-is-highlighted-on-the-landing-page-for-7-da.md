# Plan: a new venue is highlighted on the landing page for 7 days, then goes back to normal

## Context
Fingal was added today (20 Nov) and is already showing in Clients, but nothing marks it as new. Decided:
- **Automatic for every new venue:** no code change is needed next time.
- **A banner and a "New" tile, for 7 days.**

When the 7 days are up, the landing page goes back to normal by itself, with no redeploy. This works because the page reads its venue tiles live from `venues.public` on each visit.

## How it works
**When a venue counts as "new":** it is new from the moment it **first appears on the website** (active and Show on website ticked), not from when it was created. A venue set up hidden and shown later is new from the day it's shown. Hiding and re-showing it doesn't make it new again.

### Server
1. **Migration `functions/api/db/migrations/069_venue_website_since.sql`:**
   - Add `venues.website_since timestamptz`.
   - Backfill `website_since = created_at` for venues that are active and on the website now. Fingal counts from today. The 7 Nov venues are already older than 7 days, so they don't light up.
   - Add a `BEFORE INSERT OR UPDATE` trigger: when `NEW.active AND NEW.on_website AND NEW.website_since IS NULL`, set it to `now()`. This covers every path that creates or edits a venue (`venues.save`, Orb, staff setup) without touching them.
2. **`functions/api/lib/siteVenues.mjs` → `publicTile(v, reviews, now = new Date())`:**
   - Add `isNew: true` when `website_since` is within `NEW_DAYS = 7` days.
   - Export `NEW_DAYS` and a pure `isNewVenue(since, now)`.
3. **`functions/api/modules/venues.mjs`:** add `website_since` to the `venues.public` select (line 283). Nothing else changes in the response.

### Landing page (`site/index.html`)
4. **The "New" tile** (`makeTile`, about line 1098):
   - when `v.isNew`, the tile gets class `vt new`, a gold **"New"** badge in the top corner of the front, and a soft gold ring;
   - its aria-label becomes "Fingal, new venue, tap for more";
   - in `loadVenues`, new tiles are placed **first in their city group**: the list is sorted with `isNew` first, keeping the rest in their current order.
5. **The welcome banner:**
   - **Where:** a slim gold ribbon placed between the hero and `#platform`, added by script only when the feed has new venues. It isn't in the HTML, so no stale banner can flash.
   - **Text:**
     - one venue: "**Welcome to Fingal**: our newest venue";
     - two venues: "Welcome to Fingal and X: our newest venues";
     - three or more: "Welcome to our N newest venues".
   - **Link:** "See it →". Tapping it scrolls to Clients, then focuses the first new tile and gives it a short gold pulse.
   - **Motion and accessibility:** no animation under reduced motion. The ribbon is a real link, so it works with the keyboard and screen readers.
   - **If the feed fails:** the Clients section is already hidden then, and the banner simply never appears.
6. **CSS:** a few rules next to the `.vt` styles (about line 260–320), using `--gold` / `--ink` to match the page.

### What's new card
7. **A card in Audit → What's new** (`app/src/pages/people/_whatsnew.jsx`), with its own AI picture:
   - **Prompt:** add the prompt to `app/scripts/whatsnew-images.mjs` and generate `app/public/whatsnew/new-venue-highlight.webp`.
   - **Text:** "New venues are welcomed on the website for a week."

## Tests
- `functions/api/test/siteVenues.test.mjs`: test `isNewVenue` at 0 days, 6.9 days and 7.1 days, with `null` meaning not new, and check that `publicTile(...).isNew` comes through.
- A source check that `069_venue_website_since.sql` has the trigger and the `created_at` backfill.

## Verification
1. Run `npm test` in `functions/api`; all tests should pass.
2. Release:
   1. commit;
   2. `openkbs fn deploy api` (the migration runs on the first call);
   3. `cd app && npm run build`;
   4. grep `site/app` for the API id;
   5. commit;
   6. `openkbs site deploy`;
   7. push.
3. **Database check:** `select name, website_since from venues order by website_since desc nulls last limit 3`. Fingal should show today; the others should show 7 Nov.
4. **API check:** `curl` `venues.public`. Only Fingal should have `isNew: true`.
5. **Browser check (agent-browser), desktop and phone:**
   - the banner appears under the hero;
   - "See it" scrolls to Fingal's tile, which is first in its group with the New badge;
   - then run `agent-browser close --all`.
6. **Expiry check:** in a test, `isNewVenue` with `now` set 8 days later returns false. The live page needs no change on 27 Nov.

## Worth doing alongside (no code)
Fingal has no photo, city or welcome line yet, so its tile shows initials under "Across Scotland". Filling those in under the venue's Details → Website will make the highlight look much better.

---

## Parked: Calendar part 3 (tasks, own time blocks, repeating meetings, subscribe link)
I paused planning it for this request. The spec below is unchanged, and the code map is done: `kind` and `private` columns already exist, `buildIcs` needs its VEVENT part split out for a feed, and there's no token table yet.

# Spec: Calendar — meetings, time blocks and invites, alongside the rota

## Why
Today, arranging a chat between the office and an officer, security manager or venue manager happens in messages and phone calls. Nothing shows who is free, the rota doesn't know about it, and paid time such as training never reaches pay. The aim is one calendar in every portal that works like Outlook or Apple Calendar: invite people, they accept or suggest another time, it sits next to their shifts, and paid time flows into pay.

## Who can book whom (decided)
- **Company managers** (and the platform admin) can invite anyone: officers, security managers, venue managers and other company managers, in any mix.
- **Officers, security managers and venue managers** can invite **company managers only**. They can't invite each other or venues directly.
- Anyone can block time on **their own** calendar.
- Venue managers only ever see the meetings they're in.

## What everyone gets
### The calendar
- **Day, Week, Month and Agenda (list) views.** Phones open on Agenda, desktops on Week. There's a Today button and next/previous controls.
- Tap an empty slot (or New) to create. The organiser can drag a meeting to move it and drag its edge to resize it; attendees are then asked again.
- **Colours by kind:** Meeting, Task, Blocked time and **Shifts**. Shifts are read-only and come from the rota, so people see the whole day in one place.
- **Navigation:**
  - company and security managers get a **Calendar** item in the sidebar;
  - venue managers get **Calendar** in their menu;
  - officers see meetings inside **Shifts**, with a List/Calendar switch, and Home shows "Next: meeting with X at 14:00".
- **Seeing other people's calendars:**
  - company managers can see anyone's calendar: shifts, meetings and blocks (the titles of private blocks show only as Busy);
  - everyone else sees only their own calendar.

### Creating a meeting or task
- **Fields:** title, kind (Meeting / Task), date and time (or all day), attendees, where, notes, reminders, repeat.
- **Where (default):**
  - one of your venues or HQ, or a typed address, with a map link;
  - a phone call, showing who calls whom;
  - a video link pasted from Teams, Zoom or Meet.

  The app doesn't host video.
- **Free / busy (scheduling assistant):** while booking, each attendee's row shows their shifts, other meetings, blocks and approved time off for that day. The app suggests the next three times everyone is free.
- **Shift clash:** a warning names the shift ("Sam is on at The Loft 20:00–02:00"). It doesn't block, except that a meeting **at the same venue during their shift** is allowed without a warning (an on-site check-in).
- **Book someone for a task (default):** company managers can book a person's time for a job (e.g. "Training at HQ", "Pick up radios"). It works like a meeting invite: accept, decline or propose a new time.
- **Block my own time (default):** for example "Payroll 2–4pm". Others see Busy. Blocks can be marked private.
- **Repeat:** daily, weekly, fortnightly or monthly, with an end date or a number of times. Edits apply to **this one** or **this and following**.

### Replying (RSVP)
- **Accept, Maybe or Decline** (with an optional note), or **Propose a new time**.
- **A proposed time** goes to the organiser, who can **accept** it (the meeting moves and other attendees are asked again) or **decline** it (the meeting stays as it is).
- The organiser sees each attendee's reply, and any proposed times, on the meeting.
- When the organiser **changes the time**, everyone's reply resets to "awaiting reply" and they are asked again. Changes to the notes or the place don't reset replies.
- **Cancelling** tells everyone. A cancelled meeting stays visible, crossed out, for a day.
- Only the organiser can edit. Company managers can also edit or cancel any meeting on behalf of the organiser, and this is recorded in history.

### Notices and reminders
- **Invites, changes, replies, proposals and cancellations** go to the bell and phone notifications, and by **email with an Add to calendar file** (.ics), which works in Outlook, Apple and Google (default).
- **Reminders** go out 1 day and 30 minutes before (default). Each person can change or turn off reminders on their own copy.
- Invites waiting for a reply show in **Needs you** / the to-do list as "Reply to N invites".

### Your own Outlook / Apple / Google calendar (default)
- Each person can copy a **private subscribe link** in their calendar settings. It keeps Outlook, Apple or Google showing their app calendar: meetings, blocks and their shifts.
- The link is **read-only**: replies are made in the app or from the invite email.
- The link can be **reset**, which turns the old one off.

## The rota
- Meetings show on the rota's **By officer** view and in the officer's Shifts, as a thin "Meeting" bar that can't be dragged on the rota.
- When a manager **assigns a shift** that overlaps an accepted meeting, the rota shows the same clash warning, the other way round.
- Rota rules, coverage, approval and publishing don't change.

## Paid meetings (decided: the manager chooses)
- When a company manager creates or edits a meeting or task with officers in it, they can tick **Paid**.
- **Rate (default):** each officer's usual hourly pay rate, which the manager can override for this meeting. It is an **office cost** and is **never billed to a venue**.
- **Proof (default):** after the end time, the organiser gets "Was this held?" in Needs you, with these choices:
  - **Held as booked**;
  - **Held — edit times** (per attendee);
  - **Didn't attend** (per attendee).

  Only confirmed attendance reaches pay.
- **In pay:** confirmed paid time becomes an approved line in that officer's next **pay run**, e.g. "Meeting: Toolbox talk — 1.5 h × £12.50". It appears on their payslip and on the officer's own pay view.
- **Locked once paid:** a confirmed paid meeting can't be deleted, only corrected before its pay run is finalised, as with timesheets today.
- Only company managers see rates and can tick Paid.
- Security managers' and venue managers' meetings are never paid.

## History and privacy
- Every create, change, reply, cancellation and pay confirmation is recorded in the audit log.
- Notes are visible only to the attendees and company managers.
- A meeting with someone who later leaves the company stays in history. Their future invites are removed.

## Orb (later slice)
- Orb can book meetings from a request such as "Book Sam and Priya for a toolbox talk next Tuesday at 2", using the same rules and showing the meeting before sending it.
- Orb can answer "What's on my calendar tomorrow?"

## Out of scope (now)
- Full two-way sync with Microsoft or Google accounts. The subscribe link and .ics invites cover viewing and adding.
- Built-in video calls.
- Booking meeting rooms or resources.
- Officers or venue managers inviting each other.
- Linking Needs you items to calendar blocks.
- Billing a venue for a meeting.

## Build in slices
1. **Calendar and meetings:**
   - the views, create and edit, attendees, where, free/busy with shifts and time off, clash warnings;
   - RSVP with Propose new time, cancel;
   - bell, push and email with .ics, reminders, Needs you "Reply to invites";
   - meetings on the rota and in the officer's Shifts.
2. **Paid meetings:** the Paid tick, rate, "Was this held?", pay run lines, payslip.
3. **Tasks, blocks, repeat and subscribe:** Task kind and booking someone for a task, own blocks (private), repeating meetings, the subscribe link.
4. **Orb booking** and the "What's on" answer.

Each slice gets its own What's new card with its own picture.

## Done when
- A company manager books Sam and a venue manager for Thursday 14:00 at The Loft. Both get a bell notice, a push and an email they can add to Outlook.
- Sam proposes 15:00, the manager accepts, and it moves for everyone.
- The meeting shows on Sam's Shifts and on the rota's By officer view.
- A shift assigned over the meeting warns.
- A paid toolbox talk marked "Held as booked" appears in Sam's next pay run at Sam's usual rate. No venue invoice changes.
- An officer can invite only company managers; trying anyone else isn't offered and is refused by the server.
- A venue manager sees only their own meetings.
- The private subscribe link shows the meetings and shifts in Apple Calendar, and resetting it stops the old one.
