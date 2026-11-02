# Implementation plan: App style switcher (Classic / Control Room)

Spec: `spec/spec-app-style-switcher-classic-and-control-room.md`

## Context
Every app colour, corner and shadow already comes from design tokens in `app/src/styles.css`, held in the Tailwind v4 `@theme` block (`--color-bg`, `--color-surface`, `--radius-tile` and so on). Pages use utilities that read those variables. So we can add a second style by overriding the variables under `html[data-style="control"]`, without editing every page.

Some things bypass the tokens and would break on a dark background:
- `bg-white`: about 43 uses
- `border-black/[0.04]` in the `ui/` kit
- `text-white` on accent buttons, which would fail on the amber accent
- about 8 raw hex colours (Leaflet pins, the heatmap, canvas strokes).

Those move onto tokens. The company setting is stored next to `brand_color` and sent with the existing brand payload, so the sign-in page gets it too.

## Backend (small)
1. **New migration `functions/api/db/migrations/016_ui_style.sql`:**
   `ALTER TABLE settings ADD COLUMN IF NOT EXISTS ui_style text NOT NULL DEFAULT 'classic' CHECK (ui_style IN ('classic','control'));`
2. **`functions/api/lib/brand.mjs`:**
   - `getBrand` also selects `ui_style`.
   - `brandOf` returns `style: s?.ui_style || 'classic'`.
   - This reaches `settings.brand` (public) and `auth.me` (the `brand`) with no other change.
3. **`functions/api/modules/settings.mjs`:**
   - Add `'ui_style'` to `FIELDS`.
   - In `settings.update`, if `'ui_style' in f`, reject anything other than `classic` or `control` with 400 "Unknown app style". The action is already company-only (`CO`), so other roles get 403.
   - When the style changes, add a dedicated audit entry: `audit(user, 'settings.ui_style', 'settings', 1, { from, to })`. This sits alongside the existing `settings.update` audit.
   - Add `ui_style` to the non-company `settings.get` reply.
4. **`functions/api/lib/guide.mjs`:** add the "Choosing the app style" entry to the Settings/Branding section.
5. **Test `functions/api/test/brand.test.mjs`:** `brandOf({})` gives `style: 'classic'`, and `brandOf({ ui_style: 'control' })` gives `'control'`.

## Frontend

### Style engine: new `app/src/ui/style.js`
- **`applyStyle(style, brandColor)`:**
  - Sets `document.documentElement.dataset.style`.
  - Updates `<meta name="theme-color">` (#F2F4F7 or #0E1116) and `apple-mobile-web-app-status-bar-style`.
  - For Control Room, sets the accent variables on `<html>`: `--color-blue`, `--color-blue-ink` (text and link shade), `--color-blue-soft`, `--color-blue-press` and `--color-on-accent`. They come from the brand colour, or amber #F5A524 when no brand colour is set.
  - Classic removes those inline variables, so it stays exactly as today.
- **Loads Plex fonts once**, by adding the Google Fonts `<link>` for IBM Plex Sans and Plex Mono the first time Control Room is used.
- **Saves the style** in localStorage `orb.style` (`{style, color}`).
- **Small colour helpers:**
  - `luminance` and `contrast`
  - `mix(hex, target, t)`, which lightens the accent until its text shade reaches 4.5:1 on #161B22
  - `onAccent`: #0E1116 when the accent is light, white otherwise.
- **`previewStyle(style)` and `restoreStyle()`**, used by the Settings preview.

### No flash: `app/index.html`
Add a tiny inline script in `<head>` that reads `orb.style` from localStorage, sets `data-style` and theme-color, and applies the cached accent variables before React mounts.

### Tokens: `app/src/styles.css`
- **Add neutral tokens to `@theme`** (Classic values equal today's look, so nothing changes):
  - `--color-on-accent: #fff`
  - `--color-hairline: rgb(0 0 0 / .04)`
  - `--color-paper: #fff` (signature pads, QR codes, document previews always stay white)
  - `--font-mono` (Plex Mono, with ui-monospace as fallback)
  - `--pad-tile: 20px`.
- **Add `@media screen { html[data-style="control"] { … } }`**. Being screen-only means printing always uses Classic. It overrides:
  - `bg #0E1116`, `surface #161B22`, `ink #E6EAF0`, `muted #8B95A5`, `faint #5E6878`, `line #262C36`, `fill` and `fill-strong`, `toggle-off`
  - the green, amber and red, plus their `-soft` versions as about 16% tints, all tuned to pass AA on dark
  - `--color-hairline: #262C36`
  - `--radius-tile: 8px`, `--radius-control: 6px`, `--radius-sheet: 12px`
  - Tailwind's own `--radius-xl` and `--radius-2xl` set to 8px, so the hard-coded `rounded-xl` and `rounded-2xl` sharpen too
  - `--shadow-tile: none`, `--pad-tile: 16px`
  - `--font-sans` and `--font-display` set to IBM Plex Sans
  - shorter `--dur-*`
  - `body { color-scheme: dark }` and `.num { font-family: var(--font-mono) }`.
- **Classic `.num`:** `font-variant-numeric: tabular-nums`.

### Remove what bypasses the tokens (pattern, applied everywhere)
- **`bg-white`:** becomes `bg-surface` in pages, layouts and the `ui/` kit. It becomes `bg-paper` where it's a paper or camera surface: signature pads in `officer/Contract.jsx` and `officer/Agreement.jsx`, the QR in `venue/Site.jsx`, the certificate preview and the Lightbox frame. Each of the about 19 files gets one pass.
- **`border-black/[0.04]`:** becomes `border-hairline` in `ui/index.jsx` (Card, List, `solid` variant).
- **`text-white` paired with `bg-blue`:** becomes `text-on-accent`. This covers the `ui/index.jsx` Button `primary`, the active IconButton and the segmented control, plus a grep of `bg-blue[^-/].*text-white` across pages. White text on red and green stays as it is.
- **The Button `primary` shadow `rgba(10,108,255,.7)`:** becomes `color-mix(in srgb, var(--color-blue) 70%, transparent)`.
- **Raw hex colours:**
  - The heatmap fill `#F2F4F7` (`money/_parts.jsx:97`) becomes `var(--color-fill)`, and its rgba scale becomes `color-mix(... var(--color-blue) …)`.
  - The Leaflet pin, circle and other map colours (`money/VenueDetail.jsx`, `shared/Live.jsx`, `venue/Site.jsx`) read `getComputedStyle` `--color-blue`.
  - The canvas `#0B1220` strokes in `Contract.jsx` stay, because they draw on the white paper surface.
- **Card padding:** `p-5` on Card and List rows in `ui/index.jsx` becomes `p-[var(--pad-tile)]`.
- **Numbers in monospace:** add `num` to the `ui/` kit stat and value components and the shift time range. Then grep the few places that show money, hours or references (Pay, Timesheets, PayRuns, StatementDetail, Rota time chips) and add `num` there.

### Wiring
- **`app/src/auth.jsx`:** `DEFAULT_BRAND` gets `style: 'classic'`. Whenever `brand` changes, call `applyStyle(brand.style, brand.color)` in an effect. This runs after `settings.brand` (signed out) and after `auth.me` (signed in). Expose `setBrand` so Settings can update it straight after saving.
- **`app/src/pages/people/Settings.jsx`:** add an `AppStyle` card under the brand colour card in Branding (company only).
  - Two preview tiles, each a mini shift card with a button and pills. Each tile is rendered inside a wrapper carrying `data-style` and the matching accent, so it always shows its own style.
  - Selecting a tile calls `previewStyle()` for the whole app.
  - **Save** calls `api('settings.update', {ui_style})`, then `setBrand`, and shows a toast.
  - **Cancel**, and leaving the page (unmount), call `restoreStyle()`.
  - To support the tile wrappers, the token overrides selector also matches `[data-style="control"]` on any element, not only `html`.

## Deploy
1. Run `npm test` in `functions/api`, then `npm run build` in `app/`.
2. Commit `feat: App style switcher — Classic and Control Room` and push.
3. Run `openkbs fn deploy api` (the migration runs on first request), then `openkbs site deploy`.
4. Comment on the board card in business language and move it to Review.

## Verification
- **API, using a temporary company manager and an officer token, cleaned up afterwards:**
  - `settings.update {ui_style:'control'}` returns 200, and the audit log has a `settings.ui_style` row.
  - `{ui_style:'neon'}` returns 400.
  - An officer calling `settings.update` gets 403.
  - `settings.brand` returns `style`.
  - Afterwards the style is put back to `classic`.
- **Classic is unchanged:** take agent-browser screenshots of the Dashboard, Rota and Timesheets at 390px and 1280px before and after the change, and compare them.
- **Control Room, with the style set on live and the demo accounts:** screenshot at 390px and 1280px:
  - Dashboard
  - Rota (all 3 views)
  - Timesheets
  - Pay runs and statement
  - Clock
  - Incidents
  - Messages
  - an Academy lesson
  - Settings
  - Sign-in (signed out)

  Check there are no white panels, no unreadable text and no lost borders. Also check that reloading shows no light flash.
- **Contrast:** in the browser, script a check of `contrast()` for ink, muted, accent text and on-accent pairs with brand colour #0A6CFF and with #0B1220. All must be at least 4.5 (or at least 3 for large text and icons).
- **Print preview of a statement** is in Classic colours.
- Run `agent-browser close --all` when finished, and set the live company back to Classic unless asked otherwise.
