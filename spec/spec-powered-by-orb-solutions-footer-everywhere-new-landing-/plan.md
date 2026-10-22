# Implementation plan: "Powered by Orb Solutions" footer and the new landing page

The spec is saved at `spec/spec-powered-by-orb-solutions-footer-everywhere-new-landing-.md`.

**Assumptions:**
- the demo button opens a form on the page;
- the old feature tiles are replaced.

## Assets
- From `.uploads/Orb_Security_orbital_logo_lockup_6ab574dd.png` (2172×724 RGBA), make two resized copies with ImageMagick (`convert -resize 600x`):
  - `app/public/orb-lockup.png`, served at `/app/orb-lockup.png`;
  - `functions/api/assets/orb-lockup.png`, bundled with the function for PDFs and read once with `readFileSync(new URL('../assets/orb-lockup.png', import.meta.url))`.
- Before using them, check that the result is small (under 60 KB) and the transparency survived.

## Backend (`functions/api`)
1. **`lib/pdf.mjs` → `credit()`:**
   - make it `async`, called from `base64()`;
   - embed the bundled PNG once per document (`embedPng`);
   - on every page, draw the logo at about 12 pt high, centred at y≈16, then "Powered by orbsolutions.co.uk" in 6.5 pt MUTED;
   - add a URI link annotation over the logo and text with pdf-lib's low-level API:
     - build `pdf.context.obj({Type:'Annot', Subtype:'Link', Rect:[...], Border:[0,0,0], A:{Type:'Action', S:'URI', URI: PDFString.of('https://orbsolutions.co.uk/')}})`;
     - register it, then append it to `page.node` `Annots` (create the array if it's missing);
   - remove the "Generated with Orb Security" text.
   - Check that the y position doesn't collide with `footer()` at y=30, the hr "electronically signed" line.
2. **`lib/notify.mjs` → `emailHtml`:** replace the "Sent via Orb Security" div with a centred link to `https://orbsolutions.co.uk/`. It holds `<img src="${APP_URL()}/app/orb-lockup.png" alt="Orb Security" height="18">` and "Powered by orbsolutions.co.uk" in 11 px grey. Update the comment.
3. **New migration `db/migrations/014_demo_requests.sql`:**
   `demo_requests (id uuid pk default gen_random_uuid(), name, company, email, phone, sites, message text, ip text, created_at timestamptz default now())`, with an index on `(ip, created_at)`.
4. **New `modules/demo.mjs`**, registered in the `index.mjs` imports and the ACTIONS list:
   - **`demo.request`** (`pub`), receiving `(b, { ip })`:
     - a filled honeypot `b.website` returns `{ok:true}` silently;
     - name, company and email are required (400 "Please add your name, company and work email"); the email must match a simple pattern;
     - each field is trimmed and capped (200 characters; the message 2000);
     - if `count(*)` for this IP in the last hour is 5 or more, return 429 "Too many requests — please try again later". Check that HttpError supports 429.
     - insert the row;
     - `notify(company user ids, { kind:'demo', title:'New demo request from <company>', body:'<name> · <email>', link:'/company/settings?tab=demos', email:true })`. Company ids come from `SELECT id FROM users WHERE role='company' AND status='active' AND NOT system`, matching the existing query style.
   - **`demo.list`** (`def(CO)`) returns the latest 200 rows.

## Frontend (`app/src`)
1. **`ui/index.jsx` → new `PoweredBy({ className })`:**
   - an `<a href="https://orbsolutions.co.uk/" target="_blank" rel="noopener">` containing `<img src="/app/orb-lockup.png" alt="Orb Security" className="h-5 w-auto">` and the `text-caption text-faint` label "Powered by **orbsolutions.co.uk**";
   - centred, with `py-6`;
   - no raw hex and no `text-[px]`, so ui-lint stays at 0.
2. **`layouts/Shell.jsx`:** render `<PoweredBy />` after the `<Outlet/>` wrapper inside `<main>`. Check it sits above the mobile and officer tab bar; the existing bottom padding should already cover this, and I'll add `pb` if needed.
3. **`pages/auth/AuthPages.jsx`:** add `<PoweredBy />` below the card in the shared auth layout.
4. **`pages/learn/Certificate.jsx`:** add `<PoweredBy />` under the certificate.
5. **`pages/people/Settings.jsx`:** a new tab `{ value:'demos', label:'Demo requests' }` in `TABS` and a `DemosTab`:
   - `useApi('demo.list')`, then `Load` and `Table`;
   - columns: date (relative), name, company, email (mailto), phone, sites, message;
   - when there are none: `Empty` "No demo requests yet".
   - Only the company role can see Settings.

## Landing page (`site/index.html`, full rewrite)
- **Kept:** the same `<head>` fonts, CSS variables and `.wrap`/`.btn` styles. New `<title>`: "Orb Security — security workforce management software". The meta description is taken from the hero copy.
- **Header:** `<img src="/app/orb-lockup.png" alt="Orb Security" height="34">` and "Sign in" pointing to `/app/login`.
- **Sections, using the user's copy word for word:**
  1. **Hero:**
     - the eyebrow `.k`;
     - the H1, with "Every site connected." shown in blue;
     - the paragraph;
     - the `.btn` "Request a private demo" (`data-demo`);
     - the small muted line underneath.
  2. **"Stay ahead":** the H2 and paragraph, then a 3-column card grid (one column on phones). Each card has a small inline SVG icon, an H3 and its line.
  3. **"One connected operation":** a blue band with the H2 and paragraph, and an inline SVG showing three labelled nodes (Company · Venue teams · Officers) joined by lines.
  4. **Closing call to action:** the H2, paragraph and a second demo button.
  5. **Footer:** the logo and "Powered by orbsolutions.co.uk" link, © `<span id=y>`.
- **Demo form:**
  - a `<dialog id="demo">` holding the form fields name*, company*, work email*, phone, number of sites (select: 1, 2–5, 6–20, 20+) and message, plus a hidden honeypot `website`;
  - an inline `<script>`:
    - opens it with `showModal()` from any `[data-demo]`;
    - on submit, posts `fetch(API, {method:'POST', body: JSON.stringify({action:'demo.request', ...fields})})`, using the same Lambda URL as `app/src/api.js`;
    - while sending, it disables the button and shows "Sending…";
    - on success it swaps the form for "Thanks, we'll be in touch shortly."; an error shows inline;
    - Esc or ✕ closes it.
- **Responsive:** checked at 390 and 1440 wide.

## Deploy
1. `cd app && npm run build`; ui-lint stays at 0.
2. `openkbs fn deploy api`; migration 014 runs automatically.
3. Commit `feat: Powered by Orb Solutions footer and new landing page with demo requests`, with Co-Authored-By.
4. `openkbs site deploy`, which tags v34.
5. Move the board card to Review with a plain-language comment.

## Verification
1. **API** (`/tmp/orb/call.mjs`):
   - **refused:** a bad email (400), a missing company (400), and a 6th request from the same IP (429);
   - **silently ignored:** a filled honeypot returns ok but saves no row;
   - **accepted:** a valid request appears in `demo.list`, and company users get the notification.
   - Then delete the test rows.
2. **PDFs:** download an incident report, invoice, pay statement, agreement and QR poster, and render them with the pdf.js page. Check the logo and text sit at the bottom of every page with no overlap. Check the annotation exists: pdf.js `page.getAnnotations()` shows the URL.
3. **Email:** render `emailHtml` locally with a stubbed `getBrand` and screenshot it. Run curl on `/app/orb-lockup.png` after deploy and expect 200.
4. **Browser** (preview on 4173, then live):
   - the landing page at 390 and 1440, with both demo buttons, a real submit and the thanks message;
   - the footer on a company, venue and officer screen and the sign-in page, not hidden by the tab bar;
   - the link's target URL;
   - the Settings → Demo requests tab.
5. **Clean-up:** delete the test demo rows, run `agent-browser close --all`, and stop the preview and http servers.
