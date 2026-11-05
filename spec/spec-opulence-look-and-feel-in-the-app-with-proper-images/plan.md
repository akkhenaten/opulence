# Implementation plan: Opulence look and feel, with proper images

## Context
This plan implements `spec/spec-opulence-look-and-feel-in-the-app-with-proper-images.md`, which is approved. The app still uses Orb's iOS-blue look; the website is Opulence black and gold. The app gets a light **Day** theme (gold accent, Playfair headings, black sidebar) and a dark **Night** theme (which replaces the amber Control Room). It also gets castle photos on the public and sign-in pages, AI-made brand photos, and an Opulence icon, splash screens and name. Layouts and features don't change.

What exists today:
- Theme tokens live in `app/src/styles.css`: an `@theme` block for light, and a `[data-style="control"]` block at lines 192-270 for dark.
- `app/src/ui/style.js` sets `data-style` on `<html>`. It only applies the brand accent in Control Room (`controlAccent`).
- A pre-paint script in `app/index.html` reads `localStorage['orb.style']`.
- The brand comes from `settings`, through `lib/brand.mjs` `getBrand()` and `useAuth().brand`. Live values: name Opulence, `brand_color #0b1220`, `ui_style classic`, and `logo_url` pointing to the black-box PNG.
- Brand assets are in `site/img/opulence/`: `logo-512.png` (white on transparent), `hero-800/1600.{jpg,webp}` and `og.jpg`.
- Tools available: ImageMagick (`convert`), `openkbs image <prompt>` (supports reference images), and `app/scripts/splash.mjs` (renders the splash screens with agent-browser).

## 1. Brand assets: new `app/public/brand/`
- **Logos**, made with `convert` from `site/img/opulence/logo-512.png`:
  - `logo-white.png` (copy)
  - `logo-ink.png` (recoloured to `#0B0B0C`)
  - `logo-gold.png` (`#C9A45C`)
  - all trimmed, at 512 and 192 sizes
- **Castle photo**: `castle-800.webp`, `castle-1600.webp` and a `.jpg` fallback, copied from the site hero files.
- **AI photos**: made with `openkbs image`, using `--ref site/img/opulence/hero-1600.jpg` for the mood where the CLI supports it. All prompts ask for a night-time, cinematic, muted black-and-gold look in Scotland, with no faces, text or logos. Each is saved as `{name}-800.webp` and `{name}-1600.webp` with `convert -resize -quality 72`, aiming for ≤150 KB at 1600.
  - `door`: a venue entrance at night
  - `crowd`: an event crowd with stewards seen from behind in hi-vis
  - `control`: control room screens glowing in the dark
  - `street`: a wet city street at night (Edinburgh or Glasgow)
  - `kit`: a close-up of a hi-vis jacket and radio
- I'll look at each result. I'll regenerate any image that shows legible text or faces, or that drifts off the brand look.
- **Icons**, rendered with `convert`, the gold horse on `#0B0B0C`:
  - `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (80% safe zone) and `badge-96.png` (white monochrome)
  - `icon.svg`: an `<image>`-free SVG isn't feasible for the horse, so `icon.svg` is replaced with a PNG `link rel=icon` and the svg entry is removed from the manifest
- **Splash screens**: update `app/scripts/splash.mjs` to a black background, the centred gold horse (`/app/brand/logo-gold.png`) and "Opulence" in gold Playfair. Re-run it to make the 6 PNGs.

## 2. Theme tokens: `app/src/styles.css`
- **Day** goes in the base `@theme`:
  - `bg #F6F4EF`, `surface #FFF`, `ink #0B0B0C`, `muted #6B665C`, `faint #A39E93`, `line #E7E2D8`
  - `fill #EFEBE3`, `fill-strong #E8E3D9`, `toggle-off #E3DED4`
  - Accent tokens keep their names (`--color-blue*`), so no page has to change:
    - `--color-blue: #8A6A2B` (deep gold, for text and icons; at least 4.5:1 on white)
    - `--color-blue-ink: #6F5420`
    - `--color-blue-soft: #F6EFE0`
    - `--color-blue-press: #EFE3C8`
    - `--accent-fill: #C9A45C`
    - `--color-on-accent: #0B0B0C`
  - `--font-display: "Playfair Display"` and `--font-sans: "Hanken Grotesk"`
  - Squarer corners: `--radius-tile 16px`, `--radius-control 12px`, `--radius-sheet 22px`
  - Warmer, softer shadows
- **Solid gold fill for Day**: rules matching the Control Room ones, so every `bg-blue` button becomes gold with dark text:
  - `.bg-blue { background: var(--accent-fill) }`
  - `.bg-blue.text-white, .bg-blue .text-white { color: var(--color-on-accent) }`
  - Move the existing Control Room rules up to apply to all styles, keyed on the variables.
  - Check `ring-blue`, `border-blue` and focus rings: they use deep gold, which is fine.
- **Playfair for headings only**: the `.display` class and `h1, h2` in base. Section titles and labels stay in Hanken for readability. Add `font-variant-numeric: tabular-nums` to `.num` in Day.
- **Night**: rework the `[data-style="control"]` block:
  - `bg #0B0B0C`, `surface #131315`, `fill #1B1B1E`, `line rgba(255,255,255,.09)`
  - `ink #F4F1EA`, `muted #A9A49A`
  - accent fill gold, with text `#E2C88E`
  - Playfair display font and Hanken sans; keep the mono `.num` and compact radii
  - `.bg-ink` raised tile `#1B1B1E`
- **Paper and preview reset** (lines 257-266): update the light values to the new Day tokens. Paper stays white.
- **Brand logo plate**: drop the `.brand-logo` light plate. The `Logo` component now picks the right variant itself.
- **Fonts**: `app/index.html` loads `Playfair+Display:ital,wght@0,500;0,600;0,700;1,500` and `Hanken+Grotesk:wght@400;500;600;700` in place of Inter Tight and Manrope. `style.js` `loadControlFonts` then only loads IBM Plex Mono.

## 3. Style engine: `app/src/ui/style.js`
- Keep the stored values `classic` and `control` (no migration), but label them Day and Night.
- `styleVars(style, brand)` now derives the accent for **both** styles from the brand colour with a new `dayAccent(brand)`:
  - `fill` is the brand colour, or `#C9A45C` if it's missing or the old default `#0a6cff`.
  - `text` is the fill darkened (mixed with `#000`) until it reaches 4.5:1 on white.
  - `soft` is a 12% mix of the fill with white; `press` is 22%.
  - `on` is dark or white text, whichever contrasts more with the fill.
  - The Night accent (`controlAccent`) keeps its lightening loop, against the new panel colour `#131315`, with gold as the default.
- `ACCENT_VARS` gets the soft and press variables. `CHROME` becomes `{classic:'#0B0B0C' (black status bar under the black header), control:'#0B0B0C'}`.
- The pre-paint script in `app/index.html` applies the stored vars for both styles, not just `control`, so there's no flash of the default gold before the brand loads.

## 4. Logo and chrome: `app/src/layouts/Shell.jsx`
- `Logo({ place, tone })`: `tone` is `'light'` (white horse, for dark backgrounds) or `'dark'` (ink horse).
  - Opulence copy only: render the bundled `/app/brand/logo-{white|ink}.png` with an "Opulence" Playfair wordmark (`brand.name`).
  - `brand.logo_url` stays in use for PDFs and emails only.
  - `OrbMark` is no longer used in this component.
- **Sidebar** (line 221): `bg-[#0B0B0C] text-white` with `data-style="control"` scoped vars, so the nav links, the `SideSwitch` and the account card read on black.
  - Active item: a gold bar on the left (`before:` pseudo-element) and gold text `#E2C88E`.
  - `Logo tone="light"`.
- **Top header** (line 249):
  - Mobile: black (`bg-[#0B0B0C]/95`) with `Logo tone="light"`, and icon buttons on dark.
  - Desktop (with the sidebar): stays transparent or light as now.
  - Officer layout: black header too.
  - Implementation: wrap the header contents in a `data-style="control"` scope with Night vars, so the existing `IconButton` and `Button` pick up dark tokens without per-component changes.
- **Bottom tab bar**: active tab uses `text-blue` (deep gold); no structural change.

## 5. Images in pages
- **New `app/src/ui/Photo.jsx`**:
  - `Photo({ name, alt, className, priority, children })`: a `<picture>` with `srcset` 800w/1600w webp, `loading="lazy"` unless `priority`, `object-cover`, and a dark gradient overlay. `children` sit on top in white.
  - `PHOTOS` maps names to files.
- **`pages/auth/AuthPages.jsx` `AuthCard`**:
  - At `lg` and up: two columns. Left is `Photo name="castle" priority` with the white logo, "Opulence" and the strapline "Security you can see." in Playfair. Right is the card on Day bg.
  - Below `lg`: a 220px photo band with the logo, then the card overlapping it by 40px.
  - `PoweredBy` stays below the card, unchanged.
  - Covers sign-in, forgot and reset password, and invite acceptance (all use `AuthCard`; I'll check other public auth screens such as `Callback`).
- **`pages/public/Apply.jsx`**:
  - `Frame` gets a photo header (`castle`) with "Careers" and "Join the Opulence team" over it.
  - The `Done` screen shows the `crowd` photo above the thank-you.
- **`pages/auth/PublicSign.jsx`**: a slim 120px castle band behind the logo header.
- **Page headers**: an optional hero band on a few home screens.
  - Manager dashboard (`pages/manager/Dashboard.jsx`): `door`, about 140px, with the greeting on it.
  - Live operations (`Live`): `control`.
  - Officer home (`pages/officer/Home*`): `street`.
  - Recruitment: `crowd`.
  - I'll read each page's top section and add the band above the existing first tile, without moving content.
- **`ui/index.jsx` `Empty`**: add an optional `photo` prop. With it, a 96px rounded `Photo` replaces the icon tile; otherwise the icon tile uses `bg-blue-soft` (now gold-soft). Use `photo="kit"` on the Shifts, Incidents and Applicants empty states.

## 6. Settings: `pages/people/Settings.jsx`
- **App style tile**: rename to Day ("Light, warm and easy to read in daylight") and Night ("Black and gold, compact, numbers in a fixed-width font. Built for night shifts and the ops desk."). `StylePreview` works unchanged through `styleVars`.
- **Brand colour presets**: `#C9A45C` (Opulence gold) first, plus `#0B0B0C`, `#1B5E20`, `#00796B`, `#C62828` and `#6A1B9A`. `DEFAULT_COLOR` becomes `#C9A45C`, and the hint text changes from "Like #0A6CFF".

## 7. Backend: brand colour that works for light accents
- **`lib/brand.mjs`**:
  - `DEFAULT_COLOR = '#C9A45C'`.
  - Replace `readable(hex)` with `usable(hex)`, which is true when **either** white or `#0B0B0C` text reaches 3:1 on it. That rejects only muddy mid-tones.
  - Add `onColor(hex)` (returns `'#fff'` or `'#0B0B0C'`) and `inkColor(hex)` (darkened until 4.5:1 on white, for text and lines on white).
  - The existing `accentInk` in `lib/signdoc.mjs` is the pattern; move it into `brand.mjs` and reuse it.
- **`modules/settings.mjs:67`**: use `usable`. The message becomes "Pick a colour with more contrast".
- **`lib/notify.mjs:43-47`**: email border uses `b.color`. The button uses `background:${b.color};color:${onColor(b.color)}`.
- **`lib/pdf.mjs:81,232`**: wherever white text sits on the accent fill, use `onColor`; where the accent is text on white, use `inkColor`. I'll read both spots first.
- **App fallbacks**: replace hard-coded `#0A6CFF` with gold in `auth.jsx:6`, `DocPaper.jsx:67`, `PackPaper.jsx:16` and `Certificate.jsx:15`. In those paper components, white text on the accent gets the same dark/white choice (a small `onColor` helper exported from `style.js`).
- **Tests**: update or add `functions/api/test/brand.test.mjs`:
  - `usable('#C9A45C')` is true; a mid-grey like `#777777` is false.
  - `onColor(gold)` is dark text.
  - `inkColor(gold)` reaches 4.5:1 on white.

## 8. Names, manifest and meta
- `app/index.html`: `<title>Opulence</title>`, `apple-mobile-web-app-title "Opulence"`, `theme-color #0B0B0C`, `status-bar-style black`, and favicon `/app/brand/icon-192.png`.
- `app/public/manifest.webmanifest`:
  - Name "Opulence Security", short name "Opulence".
  - `background_color` and `theme_color` `#0B0B0C`.
  - The new icons.
  - The description changes to Opulence wording.
  - Remove the Orb `screenshots` entries; they show Orb, and the Help shots are out of scope.
- Unchanged: the `PoweredBy` component and `orb-lockup.png`, and the "Ask Orb" assistant naming. That's the product name, not branding; out of scope.

## 9. Live data (I'll ask first)
Set `settings.brand_color = '#c9a45c'` with one `UPDATE` through psql after the user OKs it, or the user can do it from Settings → Branding. `ui_style` stays `classic` (Day).

## Verification
- `cd functions/api && npm test`: all pass, including the brand tests.
- `cd app && npm run build`: builds, and ui-lint stays at 67 or below.
- Local preview (`npm run dev` or `vite preview`) with agent-browser, at 390×844 and 1280×800:
  - sign-in, Apply and the Done screen, PublicSign
  - in Day and Night, through `previewStyle` and `localStorage`: the manager dashboard, Rota, Live operations, officer home, a sheet, a PDF/DocPaper preview, and an empty state
  - I'll eyeball them for contrast and broken bits, then run `agent-browser close --all`
- Contrast spot-checks with `contrast()` from `style.js`: deep gold on white ≥4.5, dark text on gold ≥4.5, and Night gold text on `#131315` ≥4.5.
- PWA: the manifest loads, the icons render, and the splash PNGs look right.
- Deploy:
  1. Commit with the message `feat: Opulence look — Day/Night themes, brand photos, icons`.
  2. `openkbs fn deploy api -s 'rate(5 minutes)'` (the brand lib changed).
  3. `openkbs site deploy`.
  4. `git push origin master --tags`.
- After deploying, screenshot the live sign-in and Apply pages. Once the user OKs the brand colour update, check the gold accent applies live.
