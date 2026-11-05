# Implementation plan: compact Everyday toolbar

The spec is saved at `spec/plan-tidy-the-top-of-the-dashboard-and-everyday.md`. This change is frontend only: no API, no database and no function deploy.

## 1. `app/src/pages/everyday/Feed.jsx`
- **Imports:** add `Flag` and `Search` (lucide) and `IconButton` (ui). Drop `Segmented`.
- **New local `ExpandSearch({ value, onChange })`:**
  - It keeps an `open` state, which starts as `!!value`.
  - Collapsed, it shows `<IconButton icon={Search} label="Search" size="sm" onClick={() => setOpen(true)} />`.
  - Open, it shows `<SearchInput autoFocus className="min-w-0 flex-1 anim-pop" value onChange onBlur={() => !value && setOpen(false)} placeholder="Search posts, comments and people" />`.
  - An effect opens it when `value` becomes non-empty, so a `?q=` link opens it already expanded.
- **`FeedBody({ lead })`:**
  - Move `text` / `setText`, the `useEffect(() => setText(search), [search])` sync and the 450 ms debounce effect here from `Stream`. `search = sp.get('q') || ''`.
  - The toolbar row is `<div className="mb-4 flex min-h-9 items-center gap-2">`. It holds, in order:
    1. `{!searching && lead}`. Hiding the lead while the search is open gives the field the row's width on phones.
    2. A `flex-1` spacer, shown when the search is closed.
    3. `{view === 'feed' && !sp.get('person') && <ExpandSearch …/>}`.
    4. For managers, the icon pair: `IconButton size="sm" icon={Newspaper} label="Feed" active={view==='feed'}` and `IconButton size="sm" icon={Flag} label="Moderation" active={view==='moderation'} badge={open} badgeTone="red"`.
  - `ExpandSearch` tells `FeedBody` when it opens through an `onOpenChange` prop, so `FeedBody` knows whether to hide the lead.
  - Don't render the row when it would be empty. That can't happen in practice, because the feed view always has the search icon.
- **`Stream`:** remove the `SearchInput` line and the text state. It keeps reading `q` from `sp`.

## 2. `app/src/pages/manager/Dashboard.jsx`
- **Imports:** remove `Tabs`. Add `Button` (ui) and `ChevronLeft` and `Newspaper` (lucide).
- **Overview, when `feedOn`:** `<div className="mb-4"><Button size="sm" variant="secondary" icon={Newspaper} onClick={() => setSp({ tab: 'everyday' }, { replace: true })}>Everyday{unread>0 && <span className="… rounded-full bg-blue px-1.5 text-caption2 font-bold text-white num">{unread}</span>}</Button></div>`.
  - Check that the `secondary` variant exists in `BTN_V` before using it, and otherwise pick the nearest one.
- **Everyday:** `<FeedBody lead={<Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setSp({}, { replace: true })}>Overview</Button>} />`.
- `EverydayRedirect` and the URL params stay unchanged.

## 3. Officer page
`Feed` (the default export) calls `<FeedBody />` with no lead. The row then shows the spacer and the search icon on the right. No other change.

## Verification
- `cd app && npm run build`: ui-lint 67 or below, and vite builds.
- Mock UI (start `/tmp/mock/server.mjs` with ROLE=company and vite on 5174, viewport 390×844) with screenshots of:
  1. Overview, showing just the Everyday button.
  2. Tapping it shows the Overview back button, the search icon and the Feed/Moderation icons on one row.
  3. Tap the search icon, type, and check that the URL gets `?q=` and the field stays open.
  4. Clear the text and blur, and check that the field collapses.
  5. The Moderation icon shows no search.
  6. Back to Overview.
  - Also check ROLE=officer at `/app/officer/everyday`.
  - Kill the servers by exact PID, then run `agent-browser close --all`.
- Ship:
  1. Commit `feat: compact Everyday toolbar` (including `site/` and `spec/`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  2. `openkbs site deploy`.
  3. `git push origin master --tags`.
  4. Check that the live `/app/` serves the new index bundle.
