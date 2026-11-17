# Collapsing tab rows and search boxes across all portals

## Context
Tab rows and search boxes take up a lot of width in every portal. In Settings, for example, "Company · Users & access · Workforce rules · …" pushes the "Invite manager" button off the edge. The user wants:
- **Tab rows:** each tab shows only its icon. Hovering a tab expands it to show its name, and the chosen tab always shows its name. On phones, a long press shows the name.
- **Search:** a magnifying-glass button that opens into a search box.

This applies across the app, in every portal.

**Decided:**
- Only rows that move between pages or filter a list collapse. Choices inside forms keep their words (One date / Every week, 5 / 10 min, Tonight / Earlier, the role picker, and so on).
- Slice 10 is finished and released first as v207. This change ships after it as its own release, v208, with its own What's new card. This is the default; the release question wasn't answered.

## Approach: change the two shared controls once, then add icons where they're missing

### 1. `Segmented` (`app/src/ui/index.jsx:559`)
- Add a `collapse` mode. It is on by default when **every** option has an icon and the row isn't `full`. Form choices have no icons and are often `full`, so they stay as they are without any changes.
- `collapse={false}` turns it off for a row; the existing `iconOnly` keeps working.
- **Tab that isn't chosen:** shows its icon only. The label sits in a span whose width animates from 0 when the tab is hovered or has keyboard focus. Use CSS only (`grid-template-columns 0fr→1fr` or `max-width`), with the existing `--dur-2`/`ease-ios`.
- **Chosen tab:** always shows icon and label.
- **Count badges** (for example Offers 3) stay visible next to the icon.
- **Sliding white highlight:** the existing ResizeObserver re-measures it on hover. Add `transitionend` / re-measure so it follows the width change.
- **Long press on touch:** add a small `useLongPress` helper in the UI kit, at about 450 ms with `pointerdown`/`pointerup`/`pointercancel`.
  - It shows a floating name bubble above the tab, using the existing toast/popover styling.
  - The tab isn't selected when the finger lifts after a long press, and the `contextmenu` event is cancelled.
  - A normal tap still selects the tab.
- **Accessibility:** `aria-label` and `title` always carry the name, so screen readers and desktop tooltips still work.
- `prefers-reduced-motion`: the label appears without the width animation.

### 2. `Tabs` (`ui/index.jsx:1065`)
- `Tabs` wraps `Segmented`, so it inherits the collapse behaviour. Nothing else changes.

### 3. `SearchInput` (`ui/index.jsx:532`)
- Add a `collapse` prop, on by default. `collapse={false}` keeps the full box; use it for search inside sheets and pickers where searching is the main task (NewMessage, PlacePicker, StartSheet, the `_esign` find box, the Thread search, and Feed, which already opens on demand).
- **Collapsed:** a 44px round icon button with the magnifying glass and the same `aria-label`.
- **Opening:** a tap or click opens the box with a width animation, puts the cursor in it, and lets the page's `className` width (for example `sm:w-56`) take over.
- **Closing:** the box shrinks back when it loses focus while empty, or when Escape is pressed while empty.
- **Staying open:** the box stays open while it holds text, for example `?q=` from the address bar. Old links still show their search term.
- `/` keyboard shortcut: leave it out (it isn't used anywhere today).

### 4. Add icons to navigation and filter rows that don't have them
- Using lucide icons, which are already imported throughout the app, give an `icon` to each option of the page, sub-tab, view and filter rows that have none today.
- Representative files:
  - `pages/people/Settings.jsx` (the PARTS sub-tabs: Managers / Company / Security / Venue / Officers, the role filter at :651, and Open/Closed at :1000);
  - `StaffProfile.jsx` (group sub-tabs);
  - `Compliance.jsx` (Queue / By person, Everyone / Can't work…);
  - `StaffContracts.jsx` (FILTERS, KINDS);
  - `Incidents.jsx`, `Timesheets.jsx` (filter segs), `Cover.jsx`, `Exceptions.jsx`, `Rota.jsx` (density), `Email.jsx` (FOLDERS), `Toolbox.jsx` / `Revise.jsx` (categories), `procedures/Library.jsx`, `contracts/Library.jsx`, `Audit.jsx` (Last 200…), `Recruitment.jsx` (stages), `officer/Shifts.jsx` (Offers, Open shifts), `ContractFile.jsx`, `everyday/Profile.jsx`.
- Where a shared constant drives the options (`HR_KINDS`, `TIMEOFF_KINDS` used as a filter, `CATEGORIES`, `FOLDERS`, `STAGES`), add the icon in the constant once.
- **Left as words on purpose:**
  - form answers: `_cover.jsx`, `_clockOut.jsx`, `Props.jsx`, `_ops.jsx`, `_graceSheet.jsx`, `RtwCheckSheet.jsx`, `_access.jsx` role pick, `_feedback.jsx`, `Guide.jsx`, `StartSheet`/`Library` jurisdiction, and the RSVP choice in `Cards.jsx`;
  - and `SideSwitch`.
- Rows where an icon wouldn't say enough, such as a sort order like `Comments.jsx` "Newest/Top", get `collapse={false}`.
- Remove `iconOnly="phone"` on Segmented rows that now collapse. It becomes redundant: the chosen tab now shows its label on phones too, and the others are icons.

### 5. What's new card and release
- Card `compact-tabs-and-search` in `people/_whatsnew.jsx`, plus its prompt in `app/scripts/whatsnew-images.mjs`. Generate its own picture in the same commit, from the repo root: `node app/scripts/whatsnew-images.mjs compact-tabs-and-search`.
- Release steps:
  1. Commit.
  2. `npm run build`; ui-lint must stay ≤70.
  3. Commit `site/app` as "build: site with collapsing tabs and search".
  4. Grep the build for the Opulence API id `6ij75kpgf7kiwtvwo3nke763dm0oejxo`.
  5. `openkbs site deploy` (v208).
  6. `git push --follow-tags`.
- No API or migration changes.

## Verification
- `npm run build`: lint, emergency-check and flow-check pass.
- agent-browser on the dev app (http://127.0.0.1:5184/app/) with the mock:
  - **1280 as boss:** Settings → Users & access shows the Invite button fully visible. Hovering a tab expands its name and the white highlight follows. Keyboard Tab focus also expands. Search opens on click, shrinks when empty and blurred, and stays open with `?q=`.
  - **390 as officer:** Shifts tabs. A long press (simulated through pointer events in `eval`) shows the name bubble and doesn't switch tab; a tap switches.
  - **Venue:** Incidents filters.
  - **Form controls unchanged:** the Cover "One date / Every week" row and the clock-out choices still show words.
- Check the console for no errors, then run `agent-browser close --all`.
