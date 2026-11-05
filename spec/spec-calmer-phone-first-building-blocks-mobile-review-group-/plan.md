# Spec: calmer, phone-first building blocks (mobile review, group 1)

## Context
- The mobile review found that most clutter on phones comes from a few shared building blocks, not from individual pages:
  - actions at the top of a page wrap onto two or three lines
  - every panel has a border, a shadow and 20px padding, and panels sit inside panels
  - header photos take a big slice of the screen
  - some taps are too small
  - pages with 7–14 tabs scroll sideways
  - tables turn into long label/value stacks
  - staff and venue photos load at full size
- Fixing these blocks once tidies most of the app.
- **Goal:** the same app on a phone shows fewer boxes, fewer wrapped buttons and less scrolling, with sharp images that load fast. Tablet and desktop stay as they are unless noted.
- **Who it's for:** everyone using the app on a phone, meaning office staff, officers and venue managers.

## Decisions
- **Page actions:** on phones, keep the main action as a button and put the rest in a "…" menu. *(User choice.)*
- **Flat panels:** flat on phones only; desktop keeps today's cards. *(User choice.)*
- **Not confirmed — please check:** the next three were asked, but the user's answers didn't come through. They're filled in with my recommended options; say if you want any of them changed.
  - **Header photos:** a slim strip on phones.
  - **Tabs:** pages with more than 5 tabs get a dropdown on phones.
  - **Images:** the phone makes a small version at upload.

## Requirements

### 1. Page actions: main action plus a "…" menu
- On phones (below `sm`), a page header shows at most **one** text button: the main action, such as Report, Add shift or Publish.
- Every other action moves into a **"…" button**, a 44px round icon button.
  - Tapping it opens a bottom sheet with one labelled row per action: icon, label, and an optional one-line hint.
  - Destructive actions are red and sit last.
- Pages say which action is the main one. If none is marked, the last one is treated as main.
- On tablet and desktop, the header looks as it does today, with all actions shown as buttons.
- The menu is a **reusable component**. The local "more" menus in Messages (`Thread.jsx` ActionSheet) and Everyday posts move onto it, so all "…" menus look and behave the same.
- The header never wraps onto a second line of buttons on a 360px-wide phone.
- **Pages covered first:** the eight with more than two actions.
  - Course editor, Staff profile, Pay runs, Staff contracts
  - Venue dashboard, Statement, Invoice, Rota
- Pages with two actions also adopt it when the two don't fit on one line.

### 2. Flat panels on phones
- Below `sm`, panels (`Tile`, `List`, `PhotoCard` frames) drop the border and the shadow:
  - They sit on the page background as grouped sections with a soft surface.
  - Padding is 16px instead of 20px.
  - The gap between sections is a little larger, so they stay distinct.
- **No box in a box:** a panel inside another panel (a "nested" tile) loses its own surface and becomes a plain group with a hairline divider. This applies on all screen sizes, because nested cards are never needed.
- A panel that is a link keeps its chevron and the press highlight.
- Desktop and tablet are unchanged.
- **Themes:** the alternate theme already has no shadow, so only the border and padding change there. Both Day and Night themes must look right.
- **New block for notes inside panels:** today these are hand-made boxes.
  - Tones: info, warning, success, danger.
  - Each has an icon, text and an optional action link.
  - Existing hand-made note boxes are swapped where they sit inside panels.

### 3. Shorter header photos
- Pages with a header photo:
  - Dashboard, Rota, Live, Incidents, Recruitment
  - officer Home and Shifts
- On phones, the header photo becomes a **slim strip of about 96px** behind the title, keeping the dark overlay so the title stays readable.
  - The subtitle stays readable, cut to one line if needed.
  - Header buttons stay inside the strip.
- From `sm` up, today's height (180px) is unchanged.
- **Sign-in pages:** the photo goes from 240px to about 140px on phones, and the form padding is tightened, so the sign-in button shows without scrolling on a 390×844 phone.
- **Join the team (Apply) page:** its photo header gets the same slim-strip rule.

### 4. 44px tap targets everywhere
- Every tappable control has at least a 44×44px tap area on phones. The visible shape may stay smaller if an invisible tap area makes up the difference, as Button and IconButton already do.
- **Controls raised to 44px:**
  - segmented controls
  - filter chips (single and multi)
  - the "link" button style
- **Hand-made small buttons** found by the review are fixed:
  - the remove/close crosses (20–28px) in Audit, AskOrb, Shift page and Thread
  - Thread's "…" trigger
  - Calendar's 16px chips
- **Spacing:** neighbouring tap areas don't overlap; there's at least 8px between them.
- **Lint:** ui-lint gets a new rule that reports shrunk tap targets, such as `h-6`/`h-7`/`h-8`/`p-1` on a button or Pressable with no added tap area. Like the other rules it reports and never blocks the build. The total may go up at first because of the new rule, but no existing rule's count may rise.

### 5. A dropdown instead of many tabs
- On phones, a page with **more than 5 tabs** shows one full-width picker instead of the sliding tab row:
  - It shows the current tab's name and count.
  - Tapping it lists every tab as a row, using the platform's native picker.
- **Affected pages:** Staff profile (about 14 tabs), Venue (11), Settings (8) and Contract file (7).
- Pages with 5 tabs or fewer keep the sliding tabs, now 44px tall.
- From `sm` up, nothing changes.
- The selected tab still lives in the address (`?tab=`), so back, refresh and shared links work the same.

### 6. Phone-friendly table rows
- Below `md`, a table row becomes a **compact list row** instead of a label/value stack:
  - **Title:** the first column, bold.
  - **Subtitle:** one muted line joining two or three secondary columns with "·".
  - **Value:** one value on the right, such as an amount, status or date.
  - A chevron appears when the row opens something.
- Each table can say which columns go where. Without that, the defaults are the first column as the title, the next two as the subtitle, and the last as the value.
- Columns marked as desktop-only are hidden on phones.
- **Tables updated:**
  - Settings
  - the staff profile tabs
  - Academy and Toolbox admin
  - Invoice detail, Reports and Venue detail
- Each is checked for which columns matter on a phone.
- Desktop tables are unchanged.

### 7. Smaller image versions
- **Scope:** staff profile photos, venue photos and ban photos. **Not** incident evidence, selfies at clock-in or Everyday posts. Evidence keeps its originals.
- **At upload,** the phone makes a **small version** (256px, for avatars and list rows) next to the existing resized photo (1600px).
  - Both are uploaded.
  - The record keeps both keys.
- **Lists and avatars** use the small version. Profile pages, venue pages and the full-size viewer use the large one.
- When there's no small version, the app falls back to the large one, so nothing breaks.
- **Existing photos:** a one-off backfill makes small versions for photos already stored. It runs from this workspace with ImageMagick, **only after the user OKs touching live storage**, and it only adds files; it never changes or removes originals.
- **Loading:**
  - All avatars and photo cards load lazily (only when on screen).
  - They are drawn at their real display size with sharp 2× sources, so images look crisp on high-resolution phones.

## Out of scope
- Page-by-page decluttering: dashboards' number tiles, repeated tags, duplicated buttons and hints. That's groups 2–5 of the review, as separate specs. This spec only changes the shared blocks and the pages named above.
- Moving or changing the "Powered by orbsolutions.co.uk" footer. It is left as is.
- Making photo links cacheable across visits. They are signed links that expire after 10 minutes; that's a separate change.
- Desktop redesign.

## Edge cases
- A page with only destructive extra actions (for example Delete): the "…" menu still holds them, red and last.
- A "…" menu on a page that is itself inside a sheet: the menu sheet stacks above it, and closing the menu returns to the sheet.
- The tab dropdown when a tab has a count badge: the count shows in the picker label and in each row.
- Table rows with no clear title column: the default rule applies, and the table owner can override it.
- An old app version still uploading a single photo: the server accepts a photo with no small version, and the app falls back to the large one.
- Night theme and alternate theme: flat panels and notes need enough contrast against the page background in both.

## Acceptance checks
- At 360×740 and 390×844 (both themes), checked in a browser with a stand-in server:
  - Staff profile, Venue, Rota, Pay runs, Invoice and Course editor show one header button plus "…", with no wrapping.
  - Panels have no border or shadow on phones.
  - There are no boxes inside boxes on Dashboard, Profile or Clock.
  - Header photos are 96px or less.
  - The sign-in button is visible without scrolling.
- Every tappable control measures at least 44×44 including its tap area: an automated check in the browser lists any smaller ones.
- Staff profile, Venue, Settings and Contract file show a picker on phones and the tab row on desktop. `?tab=` still works.
- The listed tables show compact rows on phones and are unchanged at 1280px.
- A new profile or venue photo uploads both versions, lists load the small one, and old photos without one still show.
- The 1280×900 desktop screenshots of the touched pages match today's, apart from no nested boxes.
- The API tests pass, the app builds, and no ui-lint rule count goes up apart from the new tap-target rule.
- The backfill is listed as a separate step that needs the user's OK. No live data is changed without it.
