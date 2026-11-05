# Spec: a lighter app frame on phones (mobile review, group 2)

## Context
- The frame around every screen (the top bar, the bottom tabs, the More menu and the Orb button) is seen on every page. The mobile review found it heavy on phones:
  - **Top bar:** managers get four round buttons: website, Everyday, Messages and alerts. Everyday shows twice, because its count is also on the Dashboard tab and both lead to the same feed.
  - **More menu:** a flat grid of 21 tiles with no headings, while the desktop sidebar groups the same pages.
  - **Orb button:** it can cover the last row of long lists, such as the Messages inbox. (It is already hidden inside a message thread.)
  - **Live page:** managers see Orb three times: an "Orb" header button, the Orb panel beside the board, and the floating button.
- **Goal:** a calmer frame on phones, with fewer buttons on top, a More menu you can scan, and Orb never in the way. Nothing is lost, only moved.
- **Who it's for:**
  - company and security managers on phones (most of the changes)
  - officers (top bar only)
  - venue users (More menu only)
- **Desktop:** unchanged unless noted.

## Decisions (all user choices)
- **Top bar:** keep Messages and alerts. Everyday is reached from the Dashboard. The website link moves into More and the account sheet.
- **More menu:** a grouped list, using the sidebar headings.
- **Orb button:** hides while scrolling down and comes back when you scroll up or stop. Pages get room at the bottom.
- **Orb on Live:** keep the panel and the floating button, and remove the "Orb" header button.

## Requirements

### 1. Top bar on phones
- **Managers (company, security):** the right side shows only **Messages** (with its unread count) and the **alerts bell** (unchanged behaviour).
  - **Everyday leaves the top bar.**
    - The Dashboard tab keeps showing the Everyday count, as today.
    - The Dashboard's own "Everyday" button and `?tab=everyday` view stay the way into the feed.
    - Old links to the feed keep working.
  - **The website link leaves the top bar.** It becomes:
    - a row in the More menu ("Our website", opening in a new tab)
    - a row in the account sheet
- **Officers:** they have no More menu, so their bar keeps **Everyday, Messages and alerts**.
  - The website link moves to their **Me** page, as a row.
  - The "Manager" switch and Sign out buttons stay where they are.
- **Venue users:** they already have no Everyday button, so only their website link changes. It moves into More like everyone else's, for consistency, and their bar keeps the alerts bell.
- **Desktop managers:** the top bar keeps its current buttons. The website link stays there, because the bar has room.
- **Visible change:** the bar loses one or two 40px buttons, so the page title has more room.

### 2. More menu as a grouped list
- **Layout:** the More sheet shows a **list of rows**, each with an icon, the page name, its count (if any) and a chevron. Rows are at least 52px tall.
- **Grouping:** rows are grouped under the **same headings and order as the desktop sidebar**, for example Operations, People, Resources, Clients & sites, Money and Admin. Only the items that aren't already bottom tabs are shown.
  - If a role's sidebar has no headings, as for venue users, its rows show as one group.
- **What stays at the top:** the "switch side" control (for people with more than one role) stays at the top, as today.
- **Extra rows at the bottom**, in their own group:
  - "Help & user guide"
  - "Our website" (new tab)
  - the account row
- **Counts and filters:** the counts are the same numbers as on the sidebar badges, and the More tab badge still adds them up. Items hidden by modules or permissions stay hidden.
- **Opening a row:** tapping one closes the sheet and opens the page. The current page's row is highlighted.
- **Long lists:** the sheet scrolls inside itself when the list is long (company has about 21 rows), and the headings stay readable while scrolling.

### 3. Orb button stays out of the way
- **Scrolling down:** while the page is scrolled **down**, the floating Orb button slides off to its nearest side edge, or fades and shrinks if it sits mid-screen.
  - It comes back when the person scrolls **up**, stops scrolling for about a second, or reaches the bottom of the page.
- **Bottom room:** every manager page gets extra space at the bottom, the button's height plus a margin, so the last row can always scroll clear of the button.
- **Existing behaviour stays:**
  - dragging, and the saved position per device
  - the red "something new" dot
  - hiding in message threads and while the Orb panel is open
  - lifting above a page's bottom action bar
- **Reduced motion:** people with "reduce motion" switched on get a simple fade instead of a slide.
- **Desktop:** unchanged. It hides only on phones and tablets, below `lg`.

### 4. Orb once on the Live page
- The "Orb" header button on Live is removed.
- The Orb panel beside the board (Orb's suggestions to approve) and the floating button (the chat) stay, as on every other page.
- The Live header keeps its other actions (refresh).

## Out of scope
- **The "Powered by orbsolutions.co.uk" footer:** left exactly as is (standing rule).
- **Page-by-page decluttering:** that's group 3 (office screens) and group 4 (officer screens) of the review.
- **Tag/chip overuse:** a separate spec.
- Changing what Orb does, its panel, or its notifications.
- Adding new pages or renaming existing ones.

## Edge cases
- **A dual-role person (officer + manager):** each side keeps its own top bar rules, and the switch control stays reachable.
- **Everyday switched off (module off):** nothing about Everyday shows anywhere, as today.
- **A role with nothing beyond its tabs:** the More menu then shows only the help, website and account group.
- **A long page that never scrolls up** (someone reading to the end): reaching the bottom brings the Orb button back.
- **Orb dragged to the middle of the screen:** while scrolling it fades rather than sliding, and returns to the same spot.
- **The website logo can't load:** the More row uses the globe icon, as the button does today.

## Acceptance checks
- **Top bar**, at 390×844 with a stand-in server:
  - Managers' bar shows Messages and alerts only.
  - Officers' bar shows Everyday, Messages and alerts.
  - At 1280px managers' desktop bar is unchanged.
- **More menu:** it shows grouped rows under the sidebar headings for company, security and venue. Counts match the sidebar. Help, website and account sit at the bottom, and tapping a row navigates and closes the sheet.
- **Orb button:**
  - On the Messages inbox, staff list and incidents, scrolling down hides the Orb button and scrolling up brings it back.
  - The last list row can be scrolled fully clear of the button.
  - Dragging and the saved spot still work.
- **Live:** no "Orb" header button. The panel and the floating button are present.
- **Feed links:** the Everyday feed is still reachable from the Dashboard, and old `/company/everyday` links still land there.
- **Checks:** the app builds, the API tests pass, and no ui-lint rule count goes up.
