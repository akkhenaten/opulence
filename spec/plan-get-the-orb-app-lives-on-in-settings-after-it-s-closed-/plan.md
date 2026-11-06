# Plan: "Get the Orb app" lives on in Settings after it's closed on the Dashboard

## Context
The Dashboard shows a "Get the Orb app" card (`InstallCard`, app/src/ui/pwa.jsx) until someone taps ✕; it then hides for 30 days and nothing says where to find it again. It is still reachable from the account menu (My account → Install the app) and the officer's Me page, but managers look for it in **Settings**. The user wants: once closed on the Dashboard, install is in Settings.

## Changes
1. **app/src/ui/pwa.jsx**
   - New `InstallTile({ className })`: the same tile and `InstallBody` as the Dashboard card, with no ✕, shown whenever the app isn't installed on this device (also on browsers without one-tap install: it shows the browser-menu instructions, so it's never empty). When installed it says "The app is installed on this device."
   - `InstallCard` gets a `later` prop (where to find it again). On ✕ it hides as today and shows a toast: "Hidden. You can install the app any time from {later}."
2. **app/src/pages/people/Settings.jsx** — Company details tab: `<InstallTile className="mb-4" />` at the top of `CompanyTab` (before Branding). Company managers are the only role with Settings.
3. **Where the toast points**:
   - manager Dashboard (app/src/pages/manager/Dashboard.jsx:78): company → "Settings", security → "My account (your name, top right)";
   - officer Home (pages/officer/Home.jsx:44): "Me";
   - venue Dashboard (pages/money/VenueDashboard.jsx:54): "My account".
   (Those places already have Install the app: AccountSheet.jsx:60, officer Me.jsx:49.)
4. **Guide** (functions/api/lib/guide.mjs, install chapter): one line — "Closed the install card? Company managers find it in Settings, Company details; everyone else under My account (officers: Me)."
5. **What's new** card at the top of `UPDATES` (date 2026-11-06): "Install the app from Settings".

## Verification
- Mock as company manager (Chromium, browser tab): Dashboard card → ✕ → toast mentions Settings; Settings → Company details shows "Get the Orb app" with instructions/Install button. Security and officer: toast text correct.
- `cd app && npm run build` (ui-lint ≤ 67), `cd functions/api && npm test`.
- Commit, `openkbs fn deploy api -s 'rate(5 minutes)'`, `openkbs site deploy`, read-only live check, push.
