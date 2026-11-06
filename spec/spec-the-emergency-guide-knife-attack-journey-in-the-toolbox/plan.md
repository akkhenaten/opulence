# Implementation plan: the Emergency guide (Knife attack journey)

The spec is approved and saved at `spec/spec-the-emergency-guide-knife-attack-journey-in-the-toolbox.md`. Source pack: `.uploads/c367e8155_emergency-guidance-handover_c41d7645.zip`, unzipped to `/tmp/eg` while building.

## 1. Content import (one-off script, output committed)
**`app/scripts/emergency-import.mjs <pack dir>`**
- **Inputs:** `screens.json` and `M03-VARIANTS.md`.
- **Writes `app/src/pages/guide/emergency/screens.js`**, with a "generated — do not edit by hand" header. It exports:
  - `CARDS`: the 8 S00 cards `{ key, title, art, to }`. Only knife has `to: 'K01'`.
  - `SCREENS`: `{ [id]: { id, type, title, text, art, buttons:[{label,to}], clinical, unwritten, variants } }`.
- **Parsing rules:**
  - `buttons` is `label -> dest`, split on ` | `.
  - Declared actions map to tokens: `Dialler`→`@dial`, `Previous screen`→`@back`, `retain last screen`→`@resume`, `End`→`@end`, `out-of-scope signposting`→`@m03pick`.
  - The wording is copied byte for byte.
- **M03:** becomes a picker screen (its title stays as the pack's, and its structure-note text is **not** shown; `unwritten:true`), plus four generated screens `M03a`–`M03d`:
  - the title is the variant heading ("Burn (forearm)" etc.);
  - the text is the fenced block from M03-VARIANTS.md;
  - the art is the variant file;
  - buttons are M03's own, Monitor → M04 and Medical handover → M05;
  - each carries `scopeUndecided:true`.
- **X06:** `variants` lists the 7 venue SVGs. The screen shows a small venue-type chip picker (Home, Office, Nightclub, Hotel, Restaurant, Station, Shopping centre) above the plan. No venue-type field exists in the DB, so it's always picked.
- **G-CALL, G-DANGER and G-POLICE** go into `SCREENS` as overlay components (`type: 'persistent component'`), not routes.

**Assets:** `app/public/emergency/`
- Copy every PNG and SVG with its file name lower-cased; the pack mixes `K01-…` and `k01-…`, and the import lower-cases the references to match.
- Add `*.webp` at 720px (`sharp` if it's in node_modules, otherwise `cwebp`; I'll check at build). The `<img>` uses a `<picture>` with a WebP source and a PNG fallback, and SVGs as they are. The art is not recoloured.
- The unused assets ship too, unwired.

## 2. API
- **Migration `functions/api/db/migrations/042_emergency_guide.sql`:** `ALTER TABLE settings ADD COLUMN IF NOT EXISTS emergency_guide text NOT NULL DEFAULT 'platform' CHECK (emergency_guide IN ('platform','managers','everyone'));`
- **New `functions/api/lib/emergency.mjs`** (pure):
  - `GUIDE_LEVELS`;
  - `canSeeGuide(user, level)`: platform admin always; `'managers'` adds company and security; `'everyone'` adds officer and venue.
- **`modules/settings.mjs` `settings.get`:** add `emergency_visible: canSeeGuide(user, s.emergency_guide)` to both the company and the non-company responses. The company payload also carries the raw `emergency_guide`.
  - The Shell already loads `settings.get` for every role, so the venue nav and the Toolbox tiles read it with no new request.
- **`modules/toolbox.mjs`:** `'toolbox.setEmergencyGuide'`, platform only, using the `plat` helper from lib/platform.mjs, the same as appFeedback.
  - It checks the level is in `GUIDE_LEVELS`, runs `UPDATE settings SET emergency_guide=$1 WHERE id=1`, then `audit(user,'emergency_guide.level','settings',1,{level})`.
  - It doesn't depend on the toolbox module switch, so venue users aren't tied to it.
- **Help, `lib/guide.mjs` `training` section:** one sentence saying the Emergency guide (Knife attack) is a draft under clinical review and shows only for whoever the platform admin allows.

## 3. App
- **Route** in `app/src/main.jsx`: a lazy-loaded `/guide/emergency/:screen?` → `pages/guide/emergency/Guide.jsx`, next to the other routes outside `<Shell>`, wrapped in a small `SignedIn` check (Spinner, then `/login` if there's no user).
- **`Guide.jsx`** (page, state, persistent controls):
  - Visibility comes from `useApi('settings.get')`. If `emergency_visible` is false, it shows "Not available yet" and a Back link.
  - State lives in sessionStorage `orb.eg`: `{ path:[], interruptions:0, firstCall:null, resume:null, venue:null, scroll:{} }`.
  - `go(id)` pushes the current id onto `path` and calls `navigate('/guide/emergency/'+id)`. `@back` pops the path, falling back to `S00`. `@end` runs `navigate(state.from || HOME[role])`; `from` comes from `?from=`, set by the entry tiles.
  - **I'm in danger:** a full-width dark bar at the top. It saves `resume=id` and counts the interruption, then opens the G-DANGER overlay: "Get yourself safe" → K01, "Back to where I was" → resume.
  - **Call 999:** opens the G-CALL overlay.
    - The "Call 999" button's onClick sets `firstCall ??= now`, then `window.location.href = 'tel:' + '999'`. It's built as a string so there's no literal `tel:` link and no `<a href="tel:…">`.
    - "Did you get through?" → X05. Closing the overlay keeps the screen.
  - **Police arriving** → `go('K10')`.
  - The overlays are local React state (a `Sheet`-like fixed panel), so they're not in the history.
  - Amber banner on every screen: "Draft — not clinically approved. Do not use in a real emergency."
- **`Screen.jsx`** (layout):
  - A flex column at `100dvh`: danger bar / banner(s) / scroll region (`flex-1 overflow-y-auto`) / pinned actions / bottom bar.
  - The hero is square with `object-fit: cover`. Its height follows the wording length: 42%, 26% or 19% of the stage by character thresholds (≤160, ≤260, over that), with type at 22, 19 or 17px. Title in small caps.
  - Lines starting with "- " render as a `<ul>`. Other newlines become paragraphs. The text itself is untouched.
  - **"More steps below":** an IntersectionObserver on a sentinel at the end of the scroll region. The hint shows while the sentinel is hidden and the region overflows by more than 24px.
  - A red banner shows for `unwritten` or `scopeUndecided` screens.
  - K11 and M05 show "Danger taps: n · First call hh:mm" when either is set.
  - Buttons: the first is filled blue (`.eg-primary`), the rest outlined, each at least 54px.
  - S00 is a 2×4 card grid. Knife is active; the others are greyed with "Not written yet" and disabled.
  - A "Review notes" link, platform admin only, sits on S00. It opens a sheet listing the open items from REVIEW.md, as plain bullet points I'll write as a short summary of the pack's notes; this isn't guide wording.
- **CSS** in `app/src/styles.css`: an `.eg` block with the pack tokens as variables (`--eg-ink:#15181D`, `--eg-blue:#1B5FD1`, …) and the `.eg-*` classes. Raw hex is only in CSS, so ui-lint stays ≤ 67.
- **Entry points** (each shows only when `settings.data.emergency_visible`):
  - `pages/learn/Toolbox.jsx` (officers): a dark tile above the search, "Emergency guide · Knife attack · Draft", linking to `/guide/emergency/S00?from=/officer/learn/toolbox`.
  - `pages/team/ToolboxAdmin.jsx` (managers): the same tile. For the platform admin it adds a card "Emergency guide — who can see it" with a `Segmented` control (Only me / Managers / Everyone) that calls `toolbox.setEmergencyGuide`.
  - `layouts/nav.js` venue group: `{ to: '/guide/emergency/S00?from=/venue', label: 'Emergency guide', icon: Siren, gate: 'emergency_visible' }`.
  - `layouts/Shell.jsx` filter: add `&& (!it.gate || settings.data?.[it.gate])`.
- **What's new** (`pages/people/_whatsnew.jsx`): a new top card, "Emergency guide (draft)". It names the Knife attack journey, the three always-on controls, and that it shows only for the platform admin until the wording is clinically approved.

## 4. Checks and tests
- **`functions/api/test/emergency.test.mjs`:**
  - `canSeeGuide` across roles and levels: the platform admin always passes; a venue user only on `everyone`; a security manager on `managers`.
  - `toolbox.setEmergencyGuide` is refused for a company manager. The guard is called directly, the same way appFeedback tests do it.
- **`app/scripts/emergency-check.mjs`**, run inside `npm run build` before vite. It checks that:
  - every button `to` is a screen id or an `@token`;
  - BFS from K01 reaches every non-S00, non-component screen;
  - every screen has at least one button;
  - every art file exists in `public/emergency`;
  - no screen text starts with "STRUCTURE ONLY" or "SCOPE NOT YET DEFINED";
  - no `tel:` literal appears in `src/pages/guide/emergency/*.jsx`.

## 5. Verify, then release
- **Mock** (`/tmp/mock/server.mjs`): `settings.get` returns `emergency_visible` for admin true, and for boss/officer/venue false.
  - Vite on 5174, agent-browser at 390×844, logged in as admin.
  - A scripted loop over every screen id asserts the last action button's `getBoundingClientRect().bottom ≤ innerHeight − bottom bar` and that there's no horizontal scroll.
  - Walk K01→K02→K04→K05; check "More steps below" on M02, and that it goes after scrolling.
  - I'm in danger → Back to where I was keeps the same id. Reload, and the count is kept.
  - Call 999 → close lands on the same screen. Police arriving lands on K10. X06 picker swaps the SVG.
  - Screenshots of S00, K03, M02 and G-DANGER.
  - Log in as boss and get "Not available yet", with no venue nav item.
  - Then `agent-browser close --all` and stop the mock and vite.
- `cd app && npm run build` (ui-lint ≤ 67 and the emergency check), `cd functions/api && npm test`.
- Commit `feat: Emergency guide (draft) — Knife attack journey, platform admin only` with the Co-Authored-By line. Then `openkbs fn deploy api -s 'rate(5 minutes)'` (the migration runs on deploy, as before), `openkbs site deploy`, `git push origin master --tags`.
- **Live, read-only:** `/app/emergency/k01-safety-entry.png` returns 200, and the index bundle references the guide chunk. No live data is changed, and the level stays at `platform`.
