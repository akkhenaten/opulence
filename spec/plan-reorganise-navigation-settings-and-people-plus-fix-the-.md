# Plan: Reorganise navigation, Settings and People, plus fix the venue cards

## Context
The user reported two problems.

1. **Venue cards overflow.** The "open incidents" chip spills out of the card, and venue names truncate ("Harbou…").
2. **Features sit in the wrong places.**
   - Settings mixes roles with holidays, contract templates with personal accounts.
   - Security and venue managers can't change their password, because Settings is company-only.

The user set out the target structure below. Three decisions:
- **Holiday allowances, the holiday year and balances:** "Not now, add later". This goes on a new board card.
- **Roles (licences and documents per job role):** go to Settings → Workforce rules. This is my default, because the question went unanswered.
- **Settings → Notifications:** company defaults for the optional alerts. Each person can override them in My account. This is also my default.

## Target sidebar (company manager)
These are plain section labels. They don't collapse and use compact spacing. Items are filtered by role and module, and an empty group is hidden.

| Section | Items |
|---|---|
| Overview | Dashboard, Ops AI |
| Operations | Live operations, Rota, Cover requests, Timesheets, Incidents |
| People | Staff, Recruitment, Staff contracts, Time off, Academy |
| Resources | Toolbox |
| Clients & sites | Clients, Venues |
| Finance | Pay runs, Invoices |
| Reporting | Reports |
| Administration | Settings, Audit log |

- **Security manager:** gets the same sections, with only the items it has today. Exceptions and Officers stay under Operations and People. Pay runs is its only Finance item.
- **Venue and officer menus:** unchanged.
- **Everyday:** leaves the sidebar.
- **Mobile tab bar:** stays at 5 items, with the rest in More, as today.

## Implementation
1. **`layouts/nav.js`:** regroup NAV.company and NAV.security as shown above. Remove the Everyday item, and add Staff contracts, Clients and Venues.
   - **`layouts/Shell.jsx`:** render group labels as plain small caps with tighter spacing. There is no collapse logic.
   - **Phone More sheet:** keeps the same grouping.
2. **Dashboard → Everyday tab:**
   - `pages/manager/Dashboard.jsx` gets `Tabs` (Overview | Everyday), shown only when the everyday module is on. The URL param `?tab=everyday` is kept.
   - The Everyday tab renders the existing Everyday feed component, and the unread badge moves to the Dashboard nav item and the tab.
   - The old `/company/everyday` and `/security/everyday` routes redirect to `…?tab=everyday`, so notification links still work.
3. **Clients and Venues as separate pages:**
   - Split `pages/money/Venues.jsx` into VenueList (`/company/venues`) and ClientList (`/company/clients`). Each is its own `<Page>`.
   - Old `?tab=clients` links redirect.
4. **People → Staff contracts** (new `pages/people/StaffContracts.jsx`, route `/company/people/contracts`):
   - a register of every issued contract across the workforce, with search, a status filter (draft, sent, signed, void) and the officer name linking to the profile;
   - a row opens the same actions the profile's Contracts tab has (send, void, view). These are reused from `_profileTabs.jsx` ContractsTab, which is extracted into a shared row and sheet.
   - **Backend (`modules/hr.mjs`):** `contracts.list` with no `officer_id`, for company only, returns all contracts joined with officer names. The officer's own call is unchanged.
5. **Academy** moves to People and **Toolbox** to Resources. Routes are unchanged (`/company/team/*`), so only the nav changes.
6. **Settings** (`pages/people/Settings.jsx`) has tabs Company details, Users & access, Workforce rules, Templates and Notifications:
   - **Company details:** the profile, Modules, and a "Billing & invoicing" section (VAT, bank, prefix, terms, cycle). It keeps the existing ActionBar save.
   - **Users & access:** the current UsersTab (invite, access, permissions).
     - A user with a staff record shows "Staff profile ›", linking to it.
     - On the staff profile, the existing login pill links back to the user in Settings.
     - **Backend (`users.mjs` `users.list`):** add `officer_id` through the officers.user_id join.
   - **Workforce rules:** Roles and requirements (the existing roles list and RoleSheet), Bank holidays, Pay and timesheets (period, rounding, grace, auto sign-off, GPS tolerance) and Officer pay uplifts. It saves with the same ActionBar logic, which is shared between the two forms as a small `useSettingsForm(keys)` hook.
   - **Templates:** the current contract templates list and TemplateSheet.
   - **Notifications:** on/off switches for the optional alerts (mentions, comments, reactions, announcements, training) as company defaults.
     - **Backend:** a new migration, `006_notify_defaults.sql`, adds `settings.notify_defaults jsonb DEFAULT '{}'`, saved through `settings.update`.
     - `notifications.prefs.get` and the notify filter in `lib/notify.mjs` fall back to the company default when a person hasn't chosen.
   - Security still gets a read-only view of the Roles part, which it has today. It is reached from Workforce rules, and the Settings route is opened read-only for security for that tab only.
7. **My account (profile menu):**
   - Tapping the user block at the bottom of the sidebar, or "Account" in the phone More sheet, opens `ui/AccountSheet.jsx`. It holds personal details (name and phone, through the existing self-update action if one exists, otherwise read-only), Change password (`auth.changePassword`), Notification preferences (`notifications.prefs.get` and `notifications.prefs.save`) and Sign out.
   - This applies to company, security and venue managers. The officer app keeps its own Me page.
8. **Venue card fix:**
   - the grid becomes `grid-cols-[repeat(auto-fill,minmax(280px,1fr))]`;
   - the name may wrap to 2 lines (`line-clamp-2`), and the status pill moves to the client line;
   - the chips get `flex-wrap whitespace-nowrap` with shorter labels ("2 upcoming", "4 open");
   - apply the same auto-fill grid to the other `lg:grid-cols-3` card grids where they squeeze.
9. **Board:** a new card, "Holiday allowances, holiday year and balances (Time off + Workforce rules)", noting that officers are UTR contractors.

## Deploy
- `npm run build`
- `openkbs fn deploy api`. This includes the migration, the contracts register, users.officer_id and the notify defaults.
- `openkbs site deploy`
- Commit `feat: Clearer organisation — new sidebar sections, Settings split into company, access, workforce rules, templates and notifications, staff contracts register, account menu`
- A plain-language comment on eBor20xg.

## Verification
1. The build passes and ui-lint stays at 0.
2. As company, at 390, 1024 and 1440:
   - the sidebar sections match the table and nothing collapses;
   - the Dashboard Everyday tab works, and an old Everyday link redirects;
   - Clients and Venues are separate pages, with no chip outside its card (rect check) and names readable;
   - Staff contracts lists contracts from several officers, and a send or void from the register shows on the profile tab;
   - each Settings tab saves and the value is kept after a reload. This covers rounding, a bank holiday add and remove, a template edit, and a notification default;
   - the Users ↔ Staff links work in both directions.
3. As security: the sidebar is mapped correctly, Roles is read-only, and My account changes the password (then change it back) and toggles a notification preference.
4. As venue: My account opens and Sign out works. Check the officer app is unchanged.
5. Notify defaults: with the company default for "comment" off and nothing set by the person, `notifications.prefs.get` returns false. Once the person sets it on, it returns true.
