# Implementation plan: shift cards straight from Live, and open tabs pick up new releases (v114)

**Spec:** `spec/fix-plan-the-shift-card-is-easy-to-find-from-live-and-open-t.md` (approved).

**Scope:** app only. There's no API or database change; `live.board` already returns `shift_id`.

## What exists
- `app/src/main.jsx:320-325` registers the service worker and fires `orb:update` on `controllerchange`.
- `useUpdateToast()` (`app/src/ui/pwa.jsx:121`, called in `Shell.jsx:232`) shows a 60-second toast on that event.
- **Why that misses releases:** a normal release doesn't change `sw.js` (`CACHE = 'orb-shell-v4'`), and an open single-page tab never re-checks it. So the event basically never fires, and the user's tab stayed on the pre-v113 build.
- `OfflineBanner` (`pwa.jsx:110`) is the sticky banner under the header, rendered in `Shell.jsx:325`.

## 1. Detect a new build: `app/src/main.jsx`
Inside the existing `if (import.meta.env.PROD)` area, add a check that doesn't depend on the service worker:
```js
// A release changes the entry script's hashed name: check now and then, and say so once
const entry = () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')?.match(/index-[\w-]+\.js/)?.[0];
const current = entry();
let told = false;
const check = async () => {
  if (told || !current || document.hidden) return;
  try {
    const html = await (await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })).text();
    const latest = html.match(/assets\/(index-[\w-]+\.js)/)?.[1];
    if (latest && latest !== current) { told = true; window.dispatchEvent(new Event('orb:update')); }
  } catch { /* offline: try again later */ }
};
setInterval(check, 5 * 60000);
document.addEventListener('visibilitychange', check);
// A stale tab opening a page whose old file is gone: reload once onto the new build
window.addEventListener('vite:preloadError', (e) => {
  if (sessionStorage.getItem('orb.reloaded')) return;
  sessionStorage.setItem('orb.reloaded', '1'); e.preventDefault(); window.location.reload();
});
```
- Clear `orb.reloaded` after a successful load: `setTimeout(() => sessionStorage.removeItem('orb.reloaded'), 10000)`.
- The `controllerchange` handler stays as it is (same event).

## 2. Banner instead of the short toast: `app/src/ui/pwa.jsx` and `Shell.jsx`
- Replace `useUpdateToast` with `UpdateBanner()`.
  - It listens for `orb:update` and sets `ready`.
  - It renders a sticky bar with the same classes as `OfflineBanner`, but `bg-blue` (the brand tint) and `RefreshCw` (lucide).
  - Text: "A new version of the app is ready." Then a `Button size="sm" variant="secondary"` labelled **Reload**, which calls `location.reload()`.
  - It also has an `IconButton` with `X` to dismiss.
- In `Shell.jsx`, render `<UpdateBanner />` after `<OfflineBanner />`. Remove the `useUpdateToast()` call and its import.
- The officer app uses the same Shell, so it's covered too.

## 3. Shift cards on the Live board: `app/src/pages/shared/Live.jsx`
**`Board`**
- Each section's `action` becomes a flex row:
  - for managers (`base !== '/venue'`), one `Button size="sm" variant="soft" icon={ClipboardList}` per distinct `shift_id` in `g.rows`;
  - the label is "Shift card", or "Shift card " plus `range(starts_at, ends_at)` when the group has more than one shift;
  - each links to `${base}/shifts/${shift_id}` with `state={{ from: 'live' }}`;
  - then the existing "n on site".
- Build the distinct shifts in the `groups` memo: `g.shifts = [...new Map(rows.map(r => [r.shift_id, r])).values()]`.
- On phones, more than two shifts would wrap; the action is `flex flex-wrap justify-end gap-1.5`.

**`Detail` sheet**
- Move `Open shift card` (full width, primary) to right after the pills row at the top.
- Remove it from the lower stack.

## 4. `app/src/pages/people/_whatsnew.jsx`
New top card:
- icon `ClipboardList`, title "Shift cards on the Live board";
- lede: one sentence;
- points:
  - "Shift card on every venue on Live";
  - "Open shift card at the top of an officer's details";
  - "The app tells you when a new version is ready, with Reload".

## Verify
**Checks**
- `cd app && npm run build`: ui-lint ≤ 67.
- `cd functions/api && npm test`: 202 pass.

**Mock and Vite as before, as boss, at 390×844**
- Live shows "Shift card" in the Banshee header, which opens `/company/shifts/s1`, and Back reads "Live operations".
- In the row sheet, Open shift card is the first button.

**The update check only runs in PROD, so test it with `vite build` + `vite preview`** (`VITE_API_BASE` set to the mock):
- Load the app, then rename `site/app/index.html`'s entry reference via a page-side `fetch` stub (`window.fetch` patched to return HTML with `index-NEW.js` for BASE_URL).
- Fire `visibilitychange`: the banner appears, Reload reloads, X hides it.

Then `agent-browser close --all` and stop the processes.

## Release
- Commit `fix: shift cards straight from the Live board, and open tabs offer to reload after a release` with Co-Authored-By. Tag v114.
- `openkbs site deploy`, then `git push origin master --tags`.
- Live check, read-only: `/app/` returns 200 and the new Live chunk contains "Shift card".
- Tell the user to reload their open tab once by hand; after that the banner handles it.
