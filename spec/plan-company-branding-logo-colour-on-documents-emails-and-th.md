# Plan: Company branding (logo + colour) on documents, emails and the app

## Context
The app has one company per setup (`settings` table, single row `id = 1`). Today "Orb Security" is hard-coded everywhere a client or officer sees it:
- **PDFs:** `functions/api/lib/pdf.mjs` `Doc.header()` draws a blue dot and the text "ORB SECURITY". The company name only appears as small grey text. Every PDF uses this header: incident reports (`incidents.mjs:242`), invoices and remittance statements (`money.mjs:223,426`), agreements (`hr.mjs:208`), and QR posters (`pdf.mjs` `qrPosterPdf`).
- **Emails:** `lib/notify.mjs` `emailHtml()` has the "ORB SECURITY" text, the blue `#0A6CFF` colour and the "Open Orb" button written in. The subjects "Orb Security — …" appear in `notify.mjs:65`, `auth.mjs:95` and `users.mjs:22`.
- **Certificates:** `pages/learn/Certificate.jsx:17` reads "<company> · Orb Academy".
- **App:**
  - `Logo` in `layouts/Shell.jsx:11` is an SVG plus the words "Orb Security", used in the sidebar, the officer header and the sign-in page (`AuthPages.jsx:13`);
  - the sign-in text says "Welcome back to Orb Security";
  - `document.title` in `Shell.jsx:33-34`.

The user wants the company using the app to upload its own logo, so that reports, certificates and messages carry its brand. They chose **documents, emails and the app**. The other questions weren't answered, so these defaults apply:
- a small "Sent via Orb Security" credit line stays;
- a company can set a logo and one brand colour;
- the square icon, the custom PDF footer text, and the phone home-screen icon and splash screen are left for later (the icon is built in at deploy time and can't change live).

## Backend (`functions/api`)
1. **`db/migrations/008_branding.sql`:**
   - `ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_key text, ADD COLUMN IF NOT EXISTS logo_url text, ADD COLUMN IF NOT EXISTS brand_color text;`
2. **`settings.setLogo`** (CO) in `modules/settings.mjs`:
   - takes a `key` from `upload(file, 'company')`;
   - checks it with `headObject` (`lib/storage.mjs`): it must be PNG or JPEG and 2 MB or smaller;
   - copies the bytes with `getObjectBytes` and `putObject` to the public CDN path `media/branding/<uuid>.<ext>`. Storage has `cloudfront: "media"`, so files there are served for good; emails need a link that never expires, unlike `downloadUrl`'s 10 minutes;
   - saves `logo_key` (the private original, used for PDF embedding) and `logo_url` (the public link);
   - `key: ''` removes the logo;
   - writes an audit entry.
3. **`brand_color`** is added to `FIELDS` in `settings.update`, checked against `^#[0-9a-f]{6}$`. Reject colours that are too light to read on white (a simple luminance check). Blank means the default `#0A6CFF`.
4. **New `lib/brand.mjs`:**
   - `getBrand()` returns `{ name, logo_url, logo_key, color }` from settings. Cache it in memory for 60 seconds per Lambda;
   - `logoBytes()` fetches the private logo bytes and caches them by key.
5. **PDFs** (`lib/pdf.mjs`):
   - `Doc.header(company, …)` embeds the logo with `pdf.embedPng`/`embedJpg`, already in `pdf-lib`, so no new dependency. It is scaled to fit 140×36 pt, aligned left;
   - with no logo, it shows the company name in bold text where "ORB SECURITY" was;
   - section titles use the brand colour instead of `BLUE`;
   - footers add "Generated with Orb Security" in small grey text;
   - the callers already pass `s` (settings), so `header()` reads `s.logo_key` and `s.brand_color`; the logo bytes are loaded through `brand.mjs`. The QR poster is changed the same way.
6. **Emails** (`lib/notify.mjs` `emailHtml`):
   - it becomes async or takes a `brand`: an `<img src=logo_url height=32 alt=company>`, or the company name as text;
   - the brand colour on the button, which reads "Open app";
   - a footer "Sent via Orb Security";
   - subjects become `${company} — ${title}`;
   - the invite and reset emails in `users.mjs` and `auth.mjs` change the same way.
7. **App branding endpoint:**
   - a public action `settings.brand` returns `{ name, logo_url, color }` only, for the sign-in page before anyone logs in;
   - `auth.session` / `auth.me` also return `brand`, so there's no extra request after login.

## Frontend (`app/src`)
1. **`auth.jsx`:**
   - keeps `brand` from the session. Before login it loads `settings.brand`;
   - sets `document.title` to the company name.
2. **`Logo` (`Shell.jsx:11`):**
   - if `brand.logo_url` is set, shows `<img>` (height 32, max width 160, `object-contain`);
   - otherwise shows the current Orb mark with the company name as the wordmark;
   - the browser tab title shows the company name (`Shell.jsx:33-34`);
   - the sign-in subtitle becomes "Welcome back to <company>".
3. **Settings → Company details:** a new **Branding** tile above the company fields (`pages/people/Settings.jsx`, `CompanyFields`), with:
   - a logo preview on a white background with **Upload logo** and **Remove**, using `upload(f,'company')` (`api.js:36`) and then `settings.setLogo`;
   - a colour swatch row (a few preset colours plus a hex input), saved with the existing settings form;
   - a live preview strip showing the PDF header and the email header in the chosen logo and colour;
   - a hint: "PNG or JPG, at least 400 px wide, on a transparent or white background".
4. **Certificate** (`Certificate.jsx:17`): the logo at the top; "<company> Academy" replaces "Orb Academy"; accents use the brand colour.
5. The app's own blue UI colour stays as it is: buttons, tabs and so on are not re-coloured.

## Out of scope (later card)
- the square icon and the phone home-screen icon and splash screen;
- a custom PDF footer (for example an SIA ACS approval number);
- full white-label, meaning no Orb credit at all;
- the Ops AI prompt text that names Orb Security (`ops.mjs:685,863`). This is internal and not shown to clients.

## Build, deploy, commit
- `cd app && npm run build`; ui-lint must stay at 0.
- `openkbs fn deploy api`; the migration runs on its own.
- Commit as `feat: Company branding — your logo and colour on reports, emails and the app`, with the Co-Authored-By line.
- `openkbs site deploy` (it tags vN).
- Post a plain-language board comment.

## Verification
1. **API:**
   - `settings.setLogo` with a test PNG returns a public `logo_url` that works with curl without signing;
   - a 3 MB file and a PDF are refused;
   - `settings.brand` works without logging in.
2. **PDFs:** download an incident report, an invoice, a remittance statement, an agreement and a QR poster. Check that the logo and colour are in the header, and that the text fallback works with the logo removed.
3. **Email:**
   - generate `emailHtml` locally and look at it in the browser;
   - send one real alert to the demo manager's address only if email sending is verified (`openkbs email info`).
4. **Browser** (preview, at 390 and 1440 wide):
   - the Branding tile with upload, preview and remove;
   - the sidebar and officer header logo; the sign-in page logo and text; the tab title; a certificate.
5. **Clean-up:** restore the demo (remove the test logo, clear the colour), run `agent-browser close --all` and stop the preview.
