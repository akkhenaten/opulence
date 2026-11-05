# Spec: Opulence look and feel in the app, with proper images

## Context
The website (`site/index.html`) already looks like Opulence: black and gold, Playfair Display headings, the white horse logo and an Edinburgh Castle photo. The app at `/app/` still looks like Orb:
- iOS blue (`#0A6CFF`) buttons on a grey background.
- The Inter Tight and Manrope fonts.
- The logo as a boxed black square.
- No images anywhere.
- An Orb home-screen icon, splash screens and "Orb Security" tab title.

When a client or officer moves from the website into the app, it feels like a different company. **Goal:** the app should clearly belong to Opulence, while staying easy to read on a shift.

**Decision (user):** light by default, with dark as an option. Everyone gets a light Opulence theme, and managers can switch the whole company to a dark black-and-gold theme in Settings. The dark theme replaces today's amber Control Room.

**Assumptions** (the user answered only the look question):
- **Assets:** we work from the website's assets: `site/img/opulence/logo-512.png` (white horse on transparent), the castle photos `hero-800/1600`, gold `#C9A45C` / `#E2C88E`, ink `#0B0B0C`, Playfair Display and Hanken Grotesk. Dark and gold versions of the logo are made from the white one.
- **Images:**
  - The castle photo goes on the sign-in, Apply and public pages.
  - A new Opulence app icon and splash screens.
  - A small set of AI-made, on-brand photos for page headers and the dashboard.
- **Help screenshots:** not retaken in this change. They would show real live staff and venue data. They can follow later, from a demo dataset.

## The look

### Light theme ("Day"), the default
**Colours**
- Page background: a warm off-white (`#F6F4EF`).
- Cards: white.
- Text: ink (`#0B0B0C`).
- Muted text and lines: warm greys to match.

**Gold accent**
- Main buttons and active tabs are filled gold (`#C9A45C`) with **dark** text, as on the website. White on gold is too faint to read.
- Gold text and links use a deeper gold (`#8A6A2B`), so they are readable on white (at least 4.5:1).
- There are soft gold tints for selected rows and chips.
- Status colours (green, amber, red) stay as they are, so warnings still stand out.

**Type**
- Page and section titles use Playfair Display.
- Body text and controls use Hanken Grotesk.
- Numbers (times, hours, money) use tabular digits so columns line up.

**Navigation and logo**
- Desktop: the sidebar is solid black, with the white horse logo, an "Opulence" serif wordmark and a gold bar on the active item.
- Mobile: the top bar is black with the white logo. The bottom tab bar stays light, with gold for the active tab.
- The logo is never shown as a black box again. On dark backgrounds it's the white horse; on light backgrounds it's the dark version.

**Shape:** a little squarer and more tailored than the iOS-round Orb look, with smaller corner radii and softer shadows.

### Dark theme ("Night"), optional
Settings → App style offers **Day** and **Night**. Night replaces the old "Classic" and "Control Room" choices; a saved `control` value maps to Night.
- Black (`#0B0B0C`), with near-black panels (`#131315`, `#1B1B1E`), warm white text (`#F4F1EA`) and gold accents.
- Playfair headings.
- Keeps the Control Room's compact spacing and fixed-width numbers, for the ops desk and night shifts.
- Documents, PDFs previews, QR codes and signatures stay on white "paper", as they do today.

### Brand colour
- The theme takes its accent from the company brand colour in both Day and Night. Today Classic ignores it.
- Opulence's brand colour is set to gold `#C9A45C`, so emails and PDFs pick up gold too.
- The brand-colour check is changed to accept light accents like gold. It now checks for dark text on light colours instead of rejecting colours that are too light for white text.

## Images
1. **Castle photo**, reusing the website's Edinburgh Castle hero:
   - **Sign-in, forgot and reset password, invite acceptance:**
     - Desktop is split: the photo on the left with a dark wash, the "Opulence" wordmark and a one-line strapline, and the sign-in card on the right.
     - Mobile: a photo band at the top with the logo, and the card below.
   - **Apply ("Join the Opulence team"):** a photo header with the title over the castle, then the form as now.
   - **Public signing pages:** a slim photo band behind the logo header.
2. **App icon and splash:**
   - Home-screen icons (192, 512, maskable), the badge icon and the favicon: the gold horse on black.
   - The six iOS splash screens: black, with the centred horse and "Opulence" in gold serif.
   - The tab title, install name and manifest name and short name all become Opulence.
   - Theme colours follow Day and Night.
3. **AI-made brand photos**, generated once with `openkbs image` (using the castle photo as a style reference) and shipped as optimised WebP files. No faces, no text, no logos. All shot moody, at night, in Scotland:
   - Venue door at night (sign-in alternative and manager dashboard header).
   - Event crowd with stewards, shown from behind (Recruitment and Apply "Done" screen).
   - Control room screens glowing in the dark (Live operations header).
   - Edinburgh and Glasgow street at night (officer home header).
   - Hi-vis jacket and radio close-up (empty states on key pages: Shifts, Incidents, Applicants).

   These are about 5 or 6 images. Each comes in a small and a large size, both under about 150 KB. Each is used with a dark gradient so the text on top stays readable.
4. **Empty states:** keep the icon, but the icon tile becomes gold-tinted. On the key pages listed above it becomes a small photo card.

## Must stay as is
- The "Powered by orbsolutions.co.uk" footer and the Orb lockup, unchanged everywhere.
- Every screen's layout and behaviour. This change is visual only, with no feature changes.
- Readability: body text at least 4.5:1 contrast in both themes, and status colours unchanged in meaning.
- Speed: fonts load once, photos are lazy-loaded and responsive (`srcset`), and the first paint uses the saved theme, with no flash of blue.
- Emails and PDFs keep working. They get the gold brand colour and the existing uploaded logo.

## Out of scope
- New screens or features.
- Retaking the Help screenshots (a later change, from demo data).
- Changes to the marketing website.
- Real photos of Opulence staff or venues (they can replace the AI photos later; same file names).
- Per-company theming beyond the brand colour. This copy is Opulence-only, so fonts and photos are built in.

## Data changes on live (will ask before doing)
- Set `settings.brand_color` to `#C9A45C`, and `ui_style` to `classic` (Day), which it already is. This is done from Settings, or with a single update after the user OKs it.

## Verification
- The app builds, the ui-lint baseline does not go up (67), and the backend tests pass, including an updated test for the brand-colour check.
- agent-browser screenshots at phone (390×844) and desktop (1280×800), in Day and Night:
  - sign-in
  - Apply
  - the manager dashboard
  - Rota
  - Live operations
  - officer home
  - a sheet
  - a PDF preview
- Check the contrast of gold on white, deep gold text, and text on the gold button.
- The home-screen icon and splash look right, and the installed app name is "Opulence".
- The Powered-by footer is unchanged.
- Deploy: commit, `openkbs fn deploy api -s 'rate(5 minutes)'` (only if the brand-colour check changes), `openkbs site deploy`, `git push origin master --tags`.
