# Implementation plan: company branding (logo and colour) on documents, emails and the app

The spec is saved at `spec/plan-company-branding-logo-colour-on-documents-emails-and-th.md`.

**Defaults** (the user didn't answer these questions):
- the company sets a logo and one brand colour;
- a small "Sent via Orb Security" or "Generated with Orb Security" credit line stays;
- the square icon, the home-screen icon and splash screen, and custom PDF footer text come later.

## Data model
**`functions/api/db/migrations/008_branding.sql`:**
```sql
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_key text,      -- private original (docs/company/...), used for PDFs
                     ADD COLUMN IF NOT EXISTS logo_url text,      -- public CDN copy (media/branding/...), used in emails and the app
                     ADD COLUMN IF NOT EXISTS brand_color text;   -- '#rrggbb' or NULL = default #0A6CFF
```
`getSettings()` already does `SELECT *`, so every PDF caller that passes `s` gets the new columns for free.

## Backend (`functions/api`)
1. **`lib/brand.mjs`** (new):
   - `DEFAULT_COLOR = '#0A6CFF'`;
   - `brandOf(s)` returns `{ name: s.company_name || 'Orb Security', logo_url, color: s.brand_color || DEFAULT_COLOR }`;
   - `getBrand()` reads `getSettings()` and keeps the result in memory for 60 s;
   - `logoBytes(key)` uses `getObjectBytes` (`lib/storage.mjs`) and keeps the bytes in memory by key;
   - `hexToRgb(hex)` gives a `pdf-lib` `rgb()`;
   - `readable(hex)` checks that the colour's luminance is ≤ 0.6, i.e. it reads clearly on white.
2. **`lib/storage.mjs`:** add `publicUrl(key)` = `${APP_URL}/${key}`. The storage CloudFront alias `media` serves `media/*`. Check the exact base by uploading once and running curl. If the site domain doesn't proxy `/media`, use the storage CloudFront domain from env instead (look in `process.env`, without printing any secrets).
3. **`modules/settings.mjs`:**
   - **`settings.setLogo`** (CO), taking `{ key }`:
     - an empty key clears `logo_key` and `logo_url`;
     - otherwise the key must start with `docs/company/${user.id.slice(0,8)}/`, and `headObject` must show `image/png` or `image/jpeg` at 2 MB or less;
     - copy it with `getObjectBytes` → `putObject('media/branding/<uuid>.<png|jpg>', bytes, mime)`;
     - `UPDATE settings SET logo_key, logo_url`, write the audit entry `settings.logo`, and clear the `brand.mjs` cache;
     - return the full settings row.
   - Add `brand_color` to `FIELDS` in `settings.update`: `''` becomes NULL; otherwise it must match `/^#[0-9a-f]{6}$/i` and pass `readable()`, or fail 400 with "Pick a darker colour so text stays readable". Clear the brand cache after any update.
   - Add `logo_url` and `brand_color` to the non-company return of `settings.get`.
   - **`settings.brand`** (`pub`) returns `brandOf(await getBrand())`, for the sign-in page.
4. **`modules/auth.mjs`:**
   - `auth.me` returns `brand: brandOf(...)` next to `company_name`;
   - the reset email subject becomes `Reset your ${brand.name} password`.
5. **`lib/pdf.mjs`:**
   - `Doc.header(company, title, subtitle)`:
     - when `company.logo_key` is set, embed it (`embedPng` or `embedJpg`, chosen by the file's first bytes), scaled to fit 150×36 pt and drawn at the top left;
     - if there's no logo, or embedding fails, draw `company.company_name` in bold 13 pt where "ORB SECURITY" was, with no Orb dot;
     - keep the right-aligned title and subtitle, the address line and the rule.
   - Store `this.accent = hexToRgb(company.brand_color)` and use it instead of `BLUE` in `section()` and the totals highlight.
   - Add a small helper `credit()` that draws "Generated with Orb Security" in 7 pt grey at the bottom of every page when the PDF is saved.
   - `qrPosterPdf(venue, payload, s)`: pass settings in from `venues.mjs:91` and use the same logo or name in place of the Orb mark.
   - Check that the callers pass the full settings row, not a partial one: `incidents.mjs:241`, `money.mjs:222,425`, `hr.mjs:207`.
6. **`lib/notify.mjs`:**
   - `emailHtml(title, body, link, brand)`:
     - the header is `<img src="${logo_url}" alt="${name}" height="32" style="max-width:180px">`, or the name in bold;
     - the button colour is `brand.color` and its label is "Open ${name}" (or "Open app" if the name is long);
     - a footer reads "Sent via Orb Security".
   - `notify()` loads `getBrand()` once per call. The subject is `${brand.name} — ${title}`.
   - `users.mjs:22` (the invite) sends "You're invited to ${brand.name}", with the matching body text.
   - Escape `name` in the HTML.

## Frontend (`app/src`)
1. **`auth.jsx`:**
   - state gains `brand` from `auth.me`. When logged out, `api('settings.brand')` is called once;
   - expose `brand` from `useAuth()` and set `document.title = brand.name`.
2. **`layouts/Shell.jsx`:**
   - `Logo` reads `useAuth().brand`. With a logo, it shows `<img src={logo_url} alt={name} className="h-8 max-w-[160px] object-contain">`. Without one, it shows the existing SVG mark with `brand.name` as the wordmark;
   - the `document.title` lines 33-34 use `brand.name`.
3. **`pages/auth/AuthPages.jsx`:** the subtitle becomes "Welcome back to ${brand.name}". The first-time setup page keeps "Set up Orb Security".
4. **`pages/people/Settings.jsx`:** a new `BrandingTile` above `SettingsForm` in the Company details tab, following the `ModulesTile` pattern. It has:
   - a logo preview (white box, `h-16`), with **Upload logo** and **Remove**. Upload uses `upload(f,'company')` and then `settings.setLogo`; accept `image/png,image/jpeg`; no compression, so transparency is kept; refuse files over 2 MB before uploading;
   - a colour picker: 6 preset swatches plus an `Input` for the hex value, and **Save colour** calling `settings.update({brand_color})`;
   - a preview strip: a mock PDF header (logo or name on the left, "Incident report" on the right, a section title in the brand colour) and a mock email header with its button;
   - after saving, `q.setData(d)` and `refresh()` from `useAuth`, so the sidebar logo updates straight away;
   - the hint "PNG or JPG, at least 400 px wide, transparent or white background".
   - It reuses `Tile`, `Section`, `Button`, `Input`, `useAction` and `Pressable` from `ui/index.jsx`. Raw `<button>` and `<input>` elements aren't allowed except the hidden file input, which follows the existing Profile pattern. No `text-[px]`.
5. **`pages/learn/Certificate.jsx`:**
   - the logo sits above the title, from the certificate data. Add `s.logo_url` and `s.brand_color` to the SELECT in `academy.mjs:394`;
   - "${company} Academy" replaces "Orb Academy";
   - the border and accent colour come from `brand_color` through inline `style` (not a raw hex class).
   - Also fix the existing `text-[12px]` while I'm there, using `text-caption`.

## Deploy
1. `cd app && npm run build`. ui-lint must stay at 0.
2. `openkbs fn deploy api`. The migration 008 runs automatically.
3. Commit as `feat: Company branding — your logo and colour on reports, emails and the app`, with bullets and the Co-Authored-By line.
4. `openkbs site deploy`, which tags v33.
5. Post a plain-language comment on the board spec card.

## Verification
1. **API** (`/tmp/orb/call.mjs`):
   - upload a test PNG with the presigned URL, then `settings.setLogo`. The `logo_url` should load with curl, with no login and no signing;
   - a 3 MB file, a PDF and a key that isn't the user's own upload are each refused;
   - `brand_color: '#ffff00'` is refused and `'#1b5e20'` is accepted;
   - `settings.brand` works without a token.
2. **PDFs:** download an incident report (`incidents.pdf`), an invoice, a remittance statement, an agreement and a QR poster through the API. Open each in the browser to check the logo, the colour and the credit line. Repeat with the logo removed to see the name fallback.
3. **Email:** render `emailHtml` locally to an HTML file and screenshot it. Send a real alert only if `openkbs email info` shows Verified, and only to a demo address.
4. **Browser** (preview at 390 and 1440 wide):
   - the Branding tile: upload, preview, colour, remove;
   - the sidebar, officer header and sign-in page; the tab title; a certificate.
5. **Clean-up:**
   - restore the demo by removing the logo and setting `brand_color` to `''`;
   - delete the test objects with `openkbs storage rm`;
   - `agent-browser close --all`; stop the preview.
