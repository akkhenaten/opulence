# Spec: Bigger company logo, a full journey audit with fixes, and a company user guide

## Context
After company branding went live (v33), the company's logo shows up very small in the company view, the venue manager view and the staff (officer) view. There are two causes:
- The app draws every logo at a fixed **32 px tall** (`Logo` in `app/src/layouts/Shell.jsx`). That's fine for a wide wordmark, but a square logo becomes a tiny tile.
- Uploaded logos often have a lot of empty space around them. The live "Silsila" logo is 1254×1254 with an off-white background, and the artwork fills only about 60% of each side. At 32 px the mark itself ends up around 19 px.

The owner also wants:
- a **full end-to-end journey** through the app to find breakages and gaps, with recommended fixes;
- a **user guide** companies can use to run the app.

**Decisions:**
- **Findings:** clear breakages get fixed straight away; everything else becomes a prioritised list of recommendations for the owner to choose from. The user chose this.
- **Assumed, not answered:**
  - the guide is an in-app Help page plus a PDF download;
  - it covers all roles, one chapter each;
  - uploaded logos get their empty borders trimmed automatically.

## 1. Logo size
**Bigger display sizes, set by shape:**

| Place | Wide logo (wider than 2:1) | Square or tall logo |
|---|---|---|
| Desktop sidebar (company / security / venue) | up to 44 px tall, 200 px wide | 56 px tile |
| Top bar (mobile, and the officer app) | 36 px tall, up to 160 px wide | 40 px |
| Sign-in, invite and reset pages | 56 px tall, up to 240 px wide | 80 px |
| Certificate | bigger than today, same rule | |

- The logo's shape is read from the image when it loads, so no stored data is needed.
- The top bar's height and the header layout must still fit on a 390 px phone.

**Trim empty borders on upload:**
- In Settings → Branding, the chosen image is trimmed in the browser before uploading. Near-white or transparent edges are removed, with a little tolerance, and a small even margin is kept. Then it's saved as PNG.
- Transparency is kept.
- If trimming would remove almost everything, for example a blank image, the original is uploaded unchanged.
- The preview shows the trimmed result before saving.
- **Existing logos:** the current live logo is only fixed when it's uploaded again. The Branding tile adds a hint: "Re-upload your logo to get the tighter crop".

The PDF and email logos benefit from the same trim. Their sizes are already set by box, at 150×36 and 200×36.

## 2. Full journey audit
I'll walk through every role in the browser at phone (390) and desktop (1440) sizes, using the demo accounts on the live data, and put back anything I change.

**Journeys:**
- **Company (owner/admin):**
  - first sign-in, Settings (all tabs, branding);
  - adding venues and staff, inviting users;
  - rota and shifts, cover requests;
  - timesheets, pay runs and statements, invoices;
  - incidents, HR and documents, Academy and Toolbox;
  - Messages, Everyday feed, Ops AI and Ask Orb;
  - notifications.
- **Security manager:** Live board, rota, exceptions, incidents and staff, plus whatever their permissions allow.
- **Venue manager:** venue dashboard, cover requests, incidents and feedback, invoices.
- **Officer:**
  - home, shifts and picking up shifts, clock-in, incident report;
  - pay, time off, Learn, Me and profile.
- **Public:** the landing page with the demo form, sign-in, forgot password, invite acceptance.

**What I look for:**
- errors and broken buttons or links;
- dead ends, and empty states with no next step;
- layout faults (overflow, overlap, hidden behind the tab bar), and slow or blocking loads;
- things a company would expect but can't do (gaps);
- inconsistent wording;
- for each role: anything they shouldn't see, and anything they should see but can't.

**Output: an audit report** (in chat, and saved as `docs/journey-audit-2026-10.md`). It lists:
- each finding with role, screen, severity (Broken / Gap / Polish) and the fix I recommend;
- the breakages already fixed in this release.

## 3. PWA: install it like an app on phones
**What's there today:**
- a manifest (standalone, `/app/` scope, 192/512 and maskable icons);
- a service worker that caches the app shell and handles push notifications and notification taps;
- iPhone home-screen tags and splash screens.

**Decision:** the installed app stays "Orb Security" with the Orb icon (the user chose this).

**Gaps to fix:**
1. **No install prompt.** Today only the officer notification setup mentions adding to the home screen on iPhone. Add an **"Install the app"** card for every role, shown only in a browser tab (not once installed), which can be dismissed for 30 days:
   - **Android, Chrome and Edge:** a real "Install" button using `beforeinstallprompt`;
   - **iPhone and iPad (Safari):** short steps (Share → Add to Home Screen) with a small picture.
   - It's also in the account menu as "Install the app".
2. **Offline.** When the phone loses signal, actions fail with a generic error. Add an "You're offline — changes will not be saved until you're back online" banner, using the `online`/`offline` events. The cached app shell keeps opening.
   - Clock-in, incident reports and so on still need a connection; queueing them offline is not in scope.
3. **Updates.** A new release only applies after the app is fully closed. Add a "New version available — Refresh" toast when a new service worker takes over.
4. **Manifest polish:**
   - add `id`, `description`, `lang: en-GB` and `orientation`;
   - add `shortcuts` (Clock in, Rota, Incidents) and `screenshots`, for the richer Android install sheet.
5. **Notification icons.** They currently use an SVG, which Android ignores. Use the 192 px PNG for the icon, and a monochrome PNG badge for the status bar.
6. **Check:** the Chrome installability check passes (manifest, service worker and icons with no warnings), and the PWA checks are part of the journey audit on a phone-sized screen.

The user guide gets an **"Install the app on your phone"** section, for Android and iPhone, at the start of every role chapter.

## 4. Company user guide
**In-app Help page** (`/<role>/help`, linked from the account menu and the sidebar footer, for every role):
- each role sees its own chapter first, and the company role sees all chapters;
- sections fold open and closed, with a search box;
- it includes screenshots of the real screens, saved as static images under `/app/help/` and taken from the demo data with personal details hidden;
- it uses the company's own name and branding.

**PDF version:**
- a "Download as PDF" button gives a branded manual (company logo, the "Powered by" footer and contents) made from the same content;
- one guide feeds both, so they can't drift apart.

**Chapters:**
1. **Getting started (company):**
   - first sign-in and company details, branding and modules;
   - adding venues (geofence and QR poster) and staff (SIA, right to work);
   - inviting managers and venue users; workforce rules.
2. **Running the rota:** shifts, open shifts, cover requests, clash and licence checks.
3. **On the day:** Live board, clocking and exceptions, shift log, incidents.
4. **Money:** timesheets, pay runs and statements, invoices and credit notes.
5. **People:**
   - HR file, documents and expiry, time off, holiday allowances;
   - one-to-ones, bans;
   - Academy and compliance.
6. **Communication:** Messages, Everyday feed, notifications.
7. **AI helpers:** Ops AI, Ask Orb, incident photo checks. Costs are shown in credits.
8. **Role chapters:** short ones for security managers, venue managers and officers, which companies can hand out.
9. **FAQ and troubleshooting:**
   - clock-in refused, a password reset;
   - email not arriving (email sending isn't verified yet);
   - a logo that looks small.

The guide only describes what the app actually does, checked during the journey audit.

## Out of scope
- Bigger gaps from the audit are reported only, not built.
- A video tutorial, or translations of the guide.
- Changing the Orb Security footer.

## Verification
- **Logo:**
  - upload the Silsila-style square logo and a wide logo;
  - screenshot the sidebar, top bar, sign-in and officer header at 390 and 1440;
  - check the trimmed file is tighter and has kept its transparency;
  - put the demo branding back as it was.
- **Audit:** every role journey has been run, and every fixed breakage is checked again after deploy.
- **PWA:**
  - the manifest and service worker are valid and Chrome reports the app as installable;
  - the install card shows in a browser and is hidden when running as an installed app;
  - the iPhone steps show on Safari;
  - an offline simulation shows the offline banner;
  - after a fresh deploy the update toast shows;
  - a test push uses the PNG icon.
- **Guide:**
  - the Help page opens for each role and search finds sections;
  - the screenshots load;
  - the PDF downloads with the branding and footer on every page.
- ui-lint stays at 0, the build passes, and the change is deployed and tagged. The board card gets a plain-language comment.
