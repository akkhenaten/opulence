# Implementation plan: bigger logo, journey audit, PWA polish, company user guide

The approved spec is saved in `spec/spec-bigger-company-logo-a-full-journey-audit-with-fixes-and.md`. The work is built in this order. Each step builds and passes ui-lint before the next one starts.

## Step 1: Logo size and trimming on upload
**`app/src/layouts/Shell.jsx`, the `Logo` component:**
- Add a `place` prop, which is `'sidebar' | 'header' | 'auth'`.
- Read the logo's shape with `onLoad`, using `naturalWidth / naturalHeight`. A ratio above 2 counts as wide.
- Classes by place:

  | Place | Wide logo | Square or tall logo |
  |---|---|---|
  | sidebar | `h-11 max-w-[200px]` | `h-14` |
  | header | `h-9 max-w-[160px]` | `h-10` |
  | auth | `h-14 max-w-[240px]` | `h-20` |

- The header keeps its `h-14` bar. A 40 px logo fits with no layout change, as long as the logo can shrink inside the flex row on a 390 px screen. Check it next to the HeaderTitle and the icons.
- Call sites to update: the sidebar (`Shell.jsx:182`, `place="sidebar"`), the header (`:209`, `place="header"`), and `pages/auth/AuthPages.jsx:13` (`place="auth"`).

**`app/src/pages/people/Settings.jsx`, the `BrandingTile`:**
- Add `trimLogo(file)`, a small helper next to the tile that runs in the browser with no new dependency:
  1. draw the image on a canvas;
  2. sample the corner colour, then find the bounding box of pixels that differ by more than 24/255 per channel and are not transparent;
  3. keep a 4% margin;
  4. if the box is under 5% of the image, return the original file unchanged;
  5. otherwise return a PNG `Blob`, which keeps transparency.
- `pick()` runs `upload(await trimLogo(f), 'company')`.
- Add the hint "Re-upload your logo to get the tighter crop", shown when a logo is set. It's a static caption with no data flag.
- Make the preview tile bigger, `h-20`, so the result is visible.
- **Certificate** (`pages/learn/Certificate.jsx`): make the logo box bigger in the same way.

## Step 2: Journey audit (browser), fixing clear breakages
**Setup:**
- Run `npm run build`, then `npx vite preview --port 4173`, using `/tmp/loginl.sh` for each role: company, security, venue, officer_marcus.
- Check both screen sizes, 390 and 1440, using the journeys listed in the spec.
- Also check the public pages: landing, demo form, sign-in, forgot password, invite.

**For each screen:**
- check the console for errors and for failing network requests;
- check for overflow and for anything hidden behind the tab bar;
- check for empty states with no next step;
- check what each role can and can't see.

**Fixes and report:**
- Clear breakages are fixed straight away, in the files they're found in.
- Write `docs/journey-audit-2026-10.md` with a table: Role | Screen | Severity (Broken/Gap/Polish) | Finding | Fix, plus a "Fixed in this release" list.
- Put back any demo data that gets changed.

## Step 3: PWA
**`app/public/manifest.webmanifest`:**
- add `id: "/app/"`, `description`, `lang: "en-GB"` and `orientation: "portrait"`;
- add `shortcuts`:
  - Clock in → `/app/officer/clock`;
  - Rota → `/app/open?to=rota`, or role-neutral `/app/` routes that the existing `Open` route already resolves. Check this, and use plain paths that the `Root` redirect handles;
  - Incidents;
- add `screenshots`: one narrow and one wide PNG, taken during the audit, saved to `app/public/help/`, with `form_factor` set.

**`app/public/sw.js`:**
- set `icon: '/app/icon-192.png'` and `badge: '/app/badge-96.png'`. The badge is a new monochrome white-on-transparent PNG, made with ImageMagick from `icon.svg`;
- bump the cache to `orb-shell-v3`;
- keep `skipWaiting`.

**New `app/src/ui/pwa.jsx`, mounted once in `Shell`:**
- **`usePwa()`:**
  - captures `beforeinstallprompt`;
  - works out `standalone` (the same test `_notify.jsx` uses: `display-mode: standalone` or `navigator.standalone`);
  - detects iOS;
  - tracks `online` / `offline`.
  - Move `isIOS` and `standalone` from `_notify.jsx` into this file and import them back from here.
- **`InstallCard`:**
  - shown on the dashboard or home of each role, but only in a browser and not when installed;
  - dismissing it stores `orb-install-dismissed` (a timestamp) in localStorage for 30 days;
  - Android, Chrome and Edge get an Install button that calls `prompt()`;
  - iOS gets three steps with the Share icon (lucide `Share`).
- **`InstallSheet`:** opened from a new "Install the app" Row in `AccountSheet.jsx`, and from the officer `Me` page. Same content as the card.
- **`OfflineBanner`:** a sticky amber bar under the header while `!navigator.onLine`, reading "You're offline — changes will not be saved until you're back online".
- **Update toast:**
  - in `main.jsx`, after `register()`, listen for `controllerchange`, but only when a controller already existed, so it doesn't fire on the first install;
  - when it fires, dispatch `orb:update`;
  - Shell shows a toast with a "Refresh" action, using the existing toast API in `ui/index.jsx`. If the toast has no action support, add an optional `action` to it.
- All styling uses the existing UI kit: `Tile`, `Button`, `Pill`. No raw buttons, hex colours or pixel text sizes, so ui-lint stays at 0.

## Step 4: User guide (one source, used by the in-app Help page and the PDF)
**`functions/api/lib/guide.mjs`** holds the content as data:
- `CHAPTERS = [{ id, title, roles: [...], sections: [{ id, title, body, image? }] }]`;
- `body` is short plain paragraphs with `- ` bullet lines, which keeps it WinAnsi-safe for pdf-lib;
- `{company}` placeholders are replaced with the company name.
- **Chapters (as in the spec):**
  - 0, Install the app (every role);
  - 1–7, the company chapters;
  - 8, the role chapters (security, venue, officer);
  - 9, FAQ.
- The text is written from what the audit confirmed.

**New `functions/api/modules/help.mjs`, registered in `index.mjs`:**
- `help.guide`, `def(ALL)`: returns the chapters filtered by role (company sees all of them), with the company name filled in.
- `help.pdf`, `def(ALL)`, returning `{ filename, pdf }`:
  - `Doc.create`, then `header(settings, 'User guide', role label)`;
  - a contents list, then `section()` and `text()` for each section;
  - the existing `credit()` puts the "Powered by" footer on every page;
  - the PDF is text only and points to the in-app Help for screenshots, which keeps the function bundle small.

**New `app/src/pages/shared/Help.jsx`:**
- loads with `useApi('help.guide')`;
- has a search `Input` that filters sections by title or body;
- sections fold open and closed (the existing `List` and `Row` pattern, or `<details>` styled through the kit);
- images come from `/app/help/<file>.png`, loaded lazily;
- has a "Download as PDF" `Button` that calls `api('help.pdf')` and then `downloadBase64`;
- the user's own role chapter is shown first.

**Routes and links:**
- add `<Route path="help" element={<Help />} />` under each of the four role shells in `main.jsx`;
- add a "Help & user guide" link to the `AccountSheet` Row and to the sidebar footer in `Shell.jsx`;
- for officers, add the link on the `Me` page.

**Screenshots:**
- take them with agent-browser at 390 on the demo data, cropped as needed;
- hide personal details with an injected CSS blur on names, phone numbers and emails;
- save them to `app/public/help/*.png`, about 15–20 images, compressed with ImageMagick to under 150 KB each.

## Step 5: Deploy
1. Run `cd app && npm run build` and the ui-lint check.
2. Run `openkbs fn deploy api` from the project root.
3. Commit, ending the message with Co-Authored-By: Claude Opus 5.5.
4. Run `openkbs site deploy`, which tags the release.
5. Add a plain-language comment on the board card with the audit summary.

## Verification
- **Logo:**
  - upload a square, padded test PNG and a wide one through Settings;
  - check that the stored file is trimmed and keeps its transparency (`identify`);
  - screenshot the sidebar, header, sign-in and officer header at 390 and 1440;
  - put the original Silsila logo back.
- **PWA:**
  - in the preview, the manifest parses (DevTools app-manifest via agent-browser eval, `fetch('/app/manifest.webmanifest')`);
  - the service worker registers;
  - Chrome reports the app as installable (`beforeinstallprompt` fires);
  - with the iPhone user agent, the iOS steps show;
  - after `set offline` or dispatching `offline`, the banner shows;
  - after redeploying with the bumped cache, the update toast shows.
- **Guide:**
  - `/tmp/orb/call.mjs` runs `help.guide` and `help.pdf` for each role;
  - the PDF opens in the pdf.js viewer with the footer on every page;
  - the Help page search works, and the images load at 390 and 1440.
- **After deploy:** check the fixed audit items again on the live site, then run `agent-browser close --all`.
