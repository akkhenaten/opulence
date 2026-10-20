# Implementation plan: reorganise navigation, Settings and People, plus fix the venue cards

The spec is saved in `spec/plan-reorganise-navigation-settings-and-people-plus-fix-the-.md`. No new dependencies.

## Backend (`functions/api`)
1. **`db/migrations/006_notify_defaults.sql`:** `ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_defaults jsonb NOT NULL DEFAULT '{}';`
2. **`modules/settings.mjs` `settings.update`:** accept `notify_defaults`. Only keys from `OPTIONAL_KINDS` (imported from `lib/notify.mjs`) are allowed, and values are cast to booleans and merged, the same way as `modules`.
3. **`modules/notifications.mjs` `prefs.get`:** a person's value is `notify_prefs[k]`, falling back to `settings.notify_defaults[k]`, then to true. The response also returns `defaults` so the UI can show "Company default".
4. **`lib/notify.mjs:47` filter:** becomes `COALESCE(notify_prefs->>$2, (SELECT notify_defaults->>$2 FROM settings WHERE id=1)) IS DISTINCT FROM 'false'`.
5. **`modules/hr.mjs` `contracts.list`:**
   - when the caller is company and no `officer_id` is given, return every contract: `c.id, title, status, signed_at, created_at, c.officer_id, o.first_name || ' ' || o.last_name AS officer_name`, joined to officers. It takes optional `status` and `q` (a name ILIKE search), is ordered by created_at desc, and is limited to 500.
   - the existing per-officer path is unchanged.
6. **`modules/users.mjs` `users.list`:** add `(SELECT o.id FROM officers o WHERE o.user_id = u.id LIMIT 1) AS officer_id`.

## Frontend (`app/src`)
1. **`layouts/nav.js`:**
   - **NAV.company:**
     - Overview (Dashboard, Ops AI);
     - Operations (Live operations, Rota, Cover requests, Timesheets, Incidents);
     - People (Staff, Recruitment, Staff contracts `/company/people/contracts`, Time off, Academy);
     - Resources (Toolbox);
     - Clients & sites (Clients `/company/clients`, Venues `/company/venues`);
     - Finance (Pay runs, Invoices);
     - Reporting (Reports);
     - Administration (Settings, Audit log).
     - Dashboard gets `badge: 'everyday'`. The `tab` flags stay on the same 5 items.
   - **NAV.security:**
     - Overview;
     - Operations (Live operations, Rota, Exceptions, Cover requests, Timesheets, Incidents);
     - People (Officers, Academy);
     - Resources (Toolbox);
     - Finance (Pay runs). It wasn't in the security menu before and its route exists, so it's added.
   - Everyday items are removed. Icons are FileSignature, Briefcase (for Clients) and Building2.
2. **`layouts/Shell.jsx`:**
   - sidebar: groups get `space-y-4`, plain labels and `min-h-9` items, which is tighter;
   - the user block becomes a Pressable that opens AccountSheet. The separate Sign out icon goes, because Sign out moves into the sheet;
   - the More sheet gets an "Account" row at the top for non-officers;
   - the header EverydayButton for managers links to `/${role}?tab=everyday`;
   - the feed-badge reload effect also fires on `?tab=everyday`.
3. **`ui/AccountSheet.jsx`** (new), with three sections:
   - **You:** Avatar, name, email and role, read-only, because there is no self-edit action today;
   - **Security:** a change-password form, moved from Settings AccountTab (`auth.changePassword`);
   - **Notifications:** switches from `notifications.prefs.get` and `notifications.prefs.save`, with "Company default" shown under each;
   - a red Sign out button at the bottom. The AccountTab code is reused.
4. **Dashboard (`pages/manager/Dashboard.jsx`):**
   - when `on('everyday')`, render `Tabs` (Overview | Everyday, with an unread count) under the Page header, using the URL param `tab`;
   - the Everyday tab renders `FeedBody`, which is the inside of Feed with the Feed/Moderation sub-tabs as a Segmented control;
   - `pages/everyday/Feed.jsx` exports `FeedBody` and keeps the default `Feed` for the officer route;
   - Feed's moderation `tab` param becomes `view`, so it doesn't clash with the dashboard tab;
   - the manager `everyday` route in `main.jsx` becomes `<Navigate to="..?tab=everyday">`, which works for both roles through a small `EverydayRedirect` that uses useBase. Notification links that point at `/company/everyday` keep working.
5. **Clients and Venues (`pages/money/Venues.jsx`):**
   - the default export becomes Venues, with only the venue grid and "Add venue";
   - a new export `Clients` holds the ClientList, ClientSheet and "Add client";
   - routes: `clients` goes to Clients, and `venues?tab=clients` redirects to `clients` inside Venues.
   - **Card fix (VenueGrid line ~59):**
     - the grid becomes `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]`;
     - the name gets `line-clamp-2` and the Pill moves to the client line;
     - the chips row gets `flex-wrap` and each chip `whitespace-nowrap`, with labels "N upcoming" and "N open".
   - Grep for other `lg:grid-cols-3` card grids and apply the same pattern where cards hold chips.
6. **Staff contracts (`pages/people/StaffContracts.jsx`, new; route `people/contracts`, company only):**
   - Page "Staff contracts", with a SearchInput and a Segmented control (All, Awaiting signature, Signed, Void);
   - a List of rows showing the title, officer name (linking to `staff/:id?tab=contracts`), date and status Pill, with View and Void actions;
   - a "Send contract" action that first picks an officer, then reuses the profile's send sheet.
   - To share code, extract `ContractRow`, `ContractViewer` and `SendContractSheet` from `_profileTabs.jsx` ContractsTab into `pages/people/_contracts.jsx`. Both ContractsTab and StaffContracts use them.
7. **Settings (`pages/people/Settings.jsx`):**
   - **Tabs:** company ("Company details"), users ("Users & access"), rules ("Workforce rules"), templates ("Templates"), notifications ("Notifications"). The old `calendar` tab maps to `rules`, `contracts` to `templates`, and `account` opens Company details.
   - **`useSettingsForm(keys)`:** extracted from CompanyForm. It handles the dirty diff, NUMERIC casting and save through ActionBar.
     - **Company details:** the Modules Tile plus Company, VAT, Bank and Invoicing Tiles.
     - **Workforce rules:**
       - Roles & requirements (the existing roles list and RoleSheet, from CalendarTab);
       - Pay & timesheets, and Officer pay uplifts Tiles (fields moved out of CompanyForm);
       - Bank holidays (from CalendarTab).
   - **Users & access:**
     - on a row whose user has `officer_id`, a "Staff profile" link;
     - the tab reads `?user=<id>` to open that user's sheet directly.
   - **Templates:** the existing ContractsTab or TemplateSheet, renamed TemplatesTab.
   - **Notifications:** a List of 5 switches for `settings.notify_defaults`. Each toggle saves immediately (`settings.update`) and shows a toast. Labels: Mentions, Comments, Reactions, Announcements, Training reminders.
   - AccountTab is deleted, because it moved to AccountSheet.
8. **Staff profile:** `LoginPill` is wrapped in a Link to `/company/settings?tab=users&user=<o.user_id>` when it exists and the viewer is company.
9. **`main.jsx`:**
   - company: add `clients` and `people/contracts`;
   - managers: `everyday` → EverydayRedirect.
   - Settings stays company-only. Security had no Settings route before, so nothing is lost.

## Board
`openkbs board` gets a new card in Backlog: "Holiday allowances, holiday year and balances". Time off holds balances and the absence calendar, and Workforce rules holds the policies and holiday year. Officers are UTR contractors, so the card asks whether allowances apply at all.

## Build, deploy, commit
- `cd app && npm run build`. ui-lint must stay at 0.
- `openkbs fn deploy api`. The migration runs on the first request; check it with `/tmp/orb/call.mjs company settings.get`, which should show `notify_defaults`.
- `openkbs site deploy`.
- `git add -A && git commit` with `feat: Clearer organisation — sidebar sections, Settings split, staff contracts register, account menu, venue cards fixed` and the Co-Authored-By line.
- Then `openkbs board comment eBor20xg "<plain language summary>"`.

## Verification
1. **API** (`/tmp/orb/call.mjs`):
   - company `contracts.list {}` returns rows from more than one officer, each with officer_name;
   - officer `contracts.list` is unchanged;
   - `users.list` returns officer_id for officer users;
   - set `notify_defaults.comment=false`; a user with no pref gets `comment:false` from `prefs.get`, and after they save true they get true. Then reset the default.
2. **Browser** (vite preview on port 4173; viewports 390, 1024 and 1440):
   - **Company:**
     - the sidebar matches the sections and the user block opens My account;
     - the Dashboard Everyday tab shows the feed, and `/company/everyday` redirects;
     - `/company/clients` and `/company/venues` each load, and the `/tmp/chk.js` rect check shows no chip outside its card;
     - Staff contracts filters and voids, and the change shows on the profile tab;
     - each Settings tab saves and the value persists after a reload: rounding in Workforce rules, a bank holiday add and remove, a template edit, and a notification default;
     - the Users ↔ Staff links work in both directions.
   - **Security:** the sections are right and Pay runs is visible; My account changes the password, which is then changed back by API, and toggles a preference.
   - **Venue:** the account sheet opens and Sign out works.
   - **Officer:** Me and Everyday are unchanged.
   - Run `agent-browser close --all` at the end.
