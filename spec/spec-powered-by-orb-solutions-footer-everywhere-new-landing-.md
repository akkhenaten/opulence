# Spec: "Powered by Orb Solutions" footer everywhere + new landing page

## Context
Each company now puts its own logo on the app, its PDFs and its emails (v33). The platform owner wants their own mark shown too: the **Orb Security logo** (the attached lockup) and **"Powered by orbsolutions.co.uk"** as a clickable link, at the bottom of every page. They also want the public landing page rewritten with new marketing copy and the new logo.

**Decisions**
- **Footer scope:** web pages, PDFs and emails (the user chose this).
- **Assumed, not answered:**
  - The **"Request a private demo"** buttons open a short form on the landing page. Requests are saved, and company admins get an in-app notification. Email follows automatically once email sending is verified, which it isn't today.
  - The old feature tiles (GPS + QR, rota, pay and so on) are **replaced** by the new copy.

## 1. Platform footer: "Powered by Orb Solutions"
**Look:** the Orb Security logo (about 20–24 px tall on screen), then "Powered by **orbsolutions.co.uk**". It is small, grey and centred, and the link opens https://orbsolutions.co.uk/ in a new tab (`rel="noopener"`).

**Logo file:** the upload goes to `app/public/orb-lockup.png`, resized to 600 px wide so it stays light. Emails use the same file through its public `/app/orb-lockup.png` URL.

**Where it appears:**
- **App** (`app/src/layouts/Shell.jsx`): a `PoweredBy` component sits at the end of `<main>` on every screen, for all four portals. On the officer app it sits above the bottom tab bar, so it never covers content.
- **Sign-in pages and certificate:** sign-in, invite, reset and first-time setup (`AuthPages.jsx`), and the printable Academy certificate.
- **Landing page:** the new footer.
- **PDFs** (`functions/api/lib/pdf.mjs`): `credit()` stops printing "Generated with Orb Security". Instead it draws the small logo plus "Powered by orbsolutions.co.uk" on every page, with a clickable link annotation over the text. The logo PNG is bundled with the function, so there's no fetch at render time.
- **Emails** (`functions/api/lib/notify.mjs`): "Sent via Orb Security" is replaced by the logo `<img>` and a link to orbsolutions.co.uk.

**Shared component:** `PoweredBy` lives in `app/src/ui/index.jsx`, using a plain `<a>` and ui-kit text tokens. ui-lint must stay at 0.

## 2. New landing page (`site/index.html`)
This is a static page with the same fonts and colours as today. The header has the new logo lockup and a "Sign in" button.

**Sections, using the user's copy word for word:**
1. **Hero:**
   - an eyebrow line: "SECURITY WORKFORCE MANAGEMENT SOFTWARE";
   - the H1 "Every shift covered. Every site connected.";
   - the intro paragraph;
   - a primary **Request a private demo** button;
   - the small line "Built for manned guarding, door supervision and multi-site security operations."
2. **"Security operations move quickly. Stay ahead."** with its paragraph, then three cards:
   - Clarity across your sites;
   - Confidence in your coordination;
   - Accountability throughout the operation.
3. **"One connected operation. From management to the frontline."** A blue band with its paragraph and a simple visual of three linked circles: company, venue teams, officers.
4. **"See what a clearer operation could look like."** with its paragraph and a second **Request a private demo** button.
5. **Footer:** the logo, "Powered by orbsolutions.co.uk", and © year.

**Page details:**
- The `<title>` and meta description are updated to match the new positioning.
- The page works on phones (390 px) and desktop (1440 px), with no JavaScript framework.

**Demo request form:**
- Both buttons open the same form, shown as an in-page dialog with a small inline script.
- **Fields:**
  - required: name, company, work email;
  - optional: phone, number of sites, message.
- A hidden "website" honeypot field blocks bots.
- After sending, it shows "Thanks, we'll be in touch shortly."

## 3. Backend for demo requests
- **Migration `014_demo_requests.sql`:** a `demo_requests` table with id, name, company, email, phone, sites, message, created_at and ip.
- **`demo.request`** (public, `pub()`):
  - it validates the fields: email format, lengths capped, honeypot must be empty;
  - it allows at most 5 requests per IP per hour;
  - it inserts the row and calls `notify()` for company-role users ("New demo request from <company>", with `email: true`).
- **`demo.list`** (company role): a simple read-only list under Settings → **Demo requests**, as a Tile with a table. This is the only UI addition.

## Out of scope
- Changing the app's own blue UI.
- Removing the company's own branding.
- Analytics or a CRM integration.
- Extra marketing pages.

## Verification
1. `cd app && npm run build`; ui-lint stays at 0. Then `openkbs fn deploy api` (the migration runs) and `openkbs site deploy` after committing.
2. **Browser at 390 and 1440 wide:**
   - **Landing page:** every section, both demo buttons, the form posted end to end, and the thanks message.
   - **Footer and link:** the footer shows on a company screen, a venue screen, an officer screen and the sign-in page; the link opens orbsolutions.co.uk.
3. **Demo form API:**
   - **Refused:** a bad email, a filled honeypot, and a 6th request from the same IP.
   - **Accepted:** a valid request shows under Settings → Demo requests and sends a notification.
4. **PDFs:** generate an incident report, invoice, pay statement and QR poster. Each should show the logo and the link on every page, and the link should be clickable in the PDF viewer.
5. **Email:** render `emailHtml` locally and screenshot it. Check the logo URL returns 200.
6. **Clean-up:** delete test demo requests, run `agent-browser close --all`, and stop the local servers.
