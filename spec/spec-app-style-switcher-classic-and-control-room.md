# Spec: App style switcher ("Classic" and "Control Room")

## Context
Every company sees the same look today: light grey background, white rounded cards, soft shadows and blue buttons, in an iOS style. The only branding is a logo and one brand colour (Settings → Branding), and that colour is only used on the logo mark, documents and emails. Security companies differ. Some want the friendly, light look. Others run night operations and want a darker, denser screen that reads like a control room and is easier on the eyes at 3am.

**Goal:** a company manager chooses the company's app style from two complete designs. Everyone in that company (managers, security managers, officers and venue users) then sees the app in that style. The current design stays the default, so nobody notices a change unless they switch.

## The two styles

### 1. Classic (today's design, unchanged, the default)
Light grey background, white cards with large rounded corners (22px) and soft shadows. Inter Tight and Manrope fonts. Blue actions, roomy spacing and an iOS feel.

### 2. Control Room (new)
A dark, focused operations look made for the security industry and night shifts.
- **Colours:** a graphite background (#0E1116) with slightly lighter panels (#161B22) and thin 1px outline lines (#262C36) instead of shadows. Off-white text (#E6EAF0) and muted grey labels (#8B95A5).
- **Accent:** the company's brand colour if one is set, otherwise signal amber (#F5A524). Status colours stay meaning-based (green OK, amber warning, red problem) and are tuned so they stay readable on dark.
- **Shapes:** sharper. Cards have 8px corners and controls 6px. Pills keep fully round ends.
- **Type:** IBM Plex Sans for text. Times, hours, money and references use IBM Plex Mono, so columns line up like a console.
- **Density:** about 15% tighter. Card padding goes from 20px to 16px and list rows are shorter, so more shifts and timesheets fit on screen. Tap targets stay at least 44px on phones.
- **Motion:** the same sheets and transitions, but quicker and with less spring.
- **Accessibility:** every text and background pair meets WCAG AA contrast (4.5:1 for body text, 3:1 for large text and icons).

## Who and where
- **Who chooses:** company managers only, in Settings → Branding, in a new "App style" card. It sits under the brand colour.
  - The card shows two side-by-side preview tiles, each a small sample of a shift card with a button and status pills drawn in that style.
  - Tapping a tile previews the whole app in that style straight away, for the manager only.
  - "Save" applies it for everyone; "Cancel" goes back.
- **Who sees it:** all users of the company, on every app screen (`/app`), on phone and desktop, including the sign-in, invite and reset-password pages, which read it from the public brand info.
- **Saved and logged:** the choice is stored with the company settings. A change is recorded in the audit log ("App style changed to Control Room").
- **Fast start:** the app remembers the last style on the device, so it opens straight in the right style with no white flash, then confirms it with the server.

## Out of scope (non-goals)
- Each user picking their own style, or following the phone's light/dark setting. This could come later; the design is built so it can be added.
- Changing the public landing page, PDFs (statements, certificates), emails or the "Powered by Orb Solutions" footer. These keep their current look.
- More than two styles, or a free-form theme builder with custom fonts, corners and so on.
- Changing layouts, navigation or which features appear. Only the look changes.

## Requirements
1. A new company setting, `ui_style`, is `'classic'` (default) or `'control'`. It is returned by `settings.get` and `settings.brand`, and set through `settings.update` by company managers only. Any other value is rejected (400).
2. Applying a style must not mean editing every page. Pages keep using the shared design tokens (colours, radius, shadow and type scale) and the `ui/` kit. The style swaps the token values.
3. Hard-coded looks that would break on dark must move to tokens:
   - `bg-white`: about 43 uses
   - fixed `rounded-2xl`, `rounded-xl` and `shadow-tile` on cards
   - about 14 raw hex colours in pages
   - `border-black/[0.04]` in the `ui/` kit

   After the change, no page shows a white box, black text on dark, or an invisible border in Control Room.
4. Text on accent buttons stays readable. In Control Room the brand colour is checked for contrast against dark panels. If it is too dark, a lighter shade of it is used for accent text and links, and the button fill keeps the true colour.
5. Maps, photos, the scanner camera, signatures and charts stay legible in both styles. For example, signature pads keep a white writing area in Control Room.
6. The phone status bar and browser chrome colour (`theme-color`) follow the style.
7. Printing from the app always uses Classic colours.
8. Help guide: one short entry under Settings, "Choosing the app style".

## Acceptance checks
- A new company and existing companies open in Classic, pixel-identical to today.
- A company manager switches to Control Room and saves. A security manager, an officer and a venue user from the same company, signing in on other devices, all see Control Room with no flash of the light style after the first load.
- Previewing without saving changes nothing for other users. Cancel restores Classic.
- Key screens are checked in Control Room on phone (390px) and desktop (1280px) with no unreadable text, white panels or lost borders:
  - Dashboard
  - Rota (By day, By venue and By officer)
  - Timesheets
  - Pay runs and statement
  - Clock in
  - Incidents with photos
  - Messages
  - Academy lesson
  - Settings
  - Sign-in
- With brand colour #0A6CFF and with a very dark brand colour, buttons and links stay readable (AA).
- An officer or security manager calling `settings.update` with `ui_style` gets 403. An invalid value gets 400.
- The audit log shows who changed the style and when.
