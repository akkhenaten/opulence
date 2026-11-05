# Plan: tidy the top of the Dashboard and Everyday

## Context
The manager Dashboard currently stacks three bars: the Overview/Everyday tabs, the Feed/Moderation segmented control, and a full-width search box. The user's screenshot asks for this:
1. Replace the Overview/Everyday tabs with a single **Everyday** button that shows on Overview. Tapping it opens Everyday.
2. Search is just a **magnifying-glass icon**. Tapping it expands it into the search field.
3. Feed and Moderation become **small icons on the right**, in the same row as the Overview/Everyday control.

## Result
- **Overview:** one row with a small "Everyday" button (newspaper icon) that keeps the unread count as a badge. Tapping it opens `?tab=everyday`, the same as today. There are no tabs.
- **Everyday (manager):** one row.
  - On the left, a small "‹ Overview" back button.
  - On the right: the search icon, then two small icon toggles: Feed (newspaper) and Moderation (flag, with the open-reports count as a badge).
  - Tapping search expands it into the field. The field takes the row's free width, focuses, and has the clear (x) button. It collapses again when it loses focus and is empty, and stays open while there is a search.
  - Search only shows on the Feed view, not on Moderation.
- **Officers' Everyday page (`/officer/everyday`):** the same search icon, right-aligned. Officers have no Moderation, so there are no toggles.
- Old links (`?tab=everyday`, `?view=moderation`, `?q=`) keep working.

## Changes
- **`app/src/pages/manager/Dashboard.jsx` (Dashboard):**
  - Remove `<Tabs>`.
  - On Overview, render `<Button size="sm" variant="secondary" icon={Newspaper}>Everyday</Button>` with the unread badge, reusing the badge style from `IconButton`/`Tabs`.
  - On Everyday, pass `lead={<Button size="sm" variant="ghost" icon={ChevronLeft}>Overview</Button>}` into `FeedBody`.
- **`app/src/pages/everyday/Feed.jsx`:**
  - `FeedBody({ lead })` renders one toolbar row: `lead`, a spacer, `ExpandSearch` (feed view only), and the Feed/Moderation `IconButton size="sm"` pair using `active`. These replace `Segmented`.
  - The search text state and the 450 ms debounce move out of `Stream` into `FeedBody`, so `Stream` still reads `q` from the URL.
  - A small local `ExpandSearch` component: an `IconButton icon={Search}` that switches to the existing `SearchInput` (autoFocus, `flex-1`) and collapses on blur when empty.
- No backend changes.

## Verification
- `cd app && npm run build`: ui-lint 67 or below, and vite builds.
- Mock UI (`/tmp/mock`, vite on 5174) at 390 px width, with screenshots of:
  - Overview, showing only the Everyday button.
  - Everyday, showing the back button, the search icon and the two icons on one row.
  - Search expanded with text, which updates `?q=`.
  - Moderation view, with no search.
  - The officer Everyday page.
- Ship:
  1. Commit `feat: compact Everyday toolbar` (ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), including `site/`.
  2. `openkbs site deploy`. The API is unchanged.
  3. `git push origin master --tags`.
