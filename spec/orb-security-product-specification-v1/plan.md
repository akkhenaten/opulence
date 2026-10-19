# Orb Security — Implementation Plan

## Context
The spec (`spec/orb-security-product-specification-v1.md`) is approved: a single-company UK manned-guarding platform with four role views (Company Manager, Security Manager, Venue Manager, Officer), covering rota/cover requests, GPS+QR clock-in, timesheets, self-employed remittance statements, VAT invoices, structured incidents and full HR, in a Bento white/blue/grey iOS-style PWA. The repo is the blank OpenKBS template (`functions/api/index.mjs` hello-world, `site/index.html` placeholder, Postgres disabled), so everything is new.

## Architecture
- **Frontend**: React + Vite + Tailwind + React Router (`BrowserRouter basename="/app"`), source in `app/`, built to `site/app/`. `openkbs.json` → `"spa": "/app/index.html"`. PWA manifest + service worker (app-shell cache only). `site/index.html` becomes a small Orb Security landing/login redirect page.
- **Backend**: one `api` Lambda (action dispatch, JSON POST) split into domain modules; one scheduled `jobs` Lambda (`rate(10 minutes)`).
- **Data**: Postgres (`"postgres": true`, Neon). Storage: public `media/` only for the logo; **all personal/compliance docs and incident photos under private `docs/` keys**, served via short-lived presigned GET URLs after a permission check.
- **Live updates**: polling (live board 15 s, notifications 30 s) — meets the "<1 min" critical-incident criterion with no MQTT token-scoping surface. MQTT can be added later.
- **Email**: project email API; wrapped in `notify.mjs` that no-ops (in-app only) until a domain is verified.

## Design system (Bento / iOS)
- Tokens in `app/src/styles/tokens.css`: `--bg #F2F4F7`, `--surface #FFFFFF`, `--ink #0B1220`, `--muted #6B7280`, `--line #E5E7EB`, `--blue #0A6CFF` (accent), `--blue-soft #E8F0FF`, status green/amber/red used sparingly.
- Type: "SF Pro"-like via **Inter Tight** display + **Manrope** body (self-hosted), tabular numerals for money/times.
- Components: `BentoGrid`/`Tile` (radius 22px, hairline border, soft shadow), iOS segmented control, grouped list rows, bottom tab bar (officer, mobile), sidebar (managers, desktop), sheet/modal sliding up, large title headers, lucide icons. One staggered tile-reveal on dashboard load.

## Data model (Postgres, `functions/api/db/migrations/*.sql`)
Core: `users` (email, password_hash scrypt, role: company|security|venue|officer, status), `sessions`/refresh, `audit_log`, `settings` (company name, VAT no, bank, pay period, invoice cycle, grace minutes, auto-approve days, rounding), `notifications`.
People: `officers` (profile, NI, UTR, bank, status applicant→left, user_id), `officer_roles`, `officer_rates` (role, optional venue, effective_from), `documents` (owner type/id, kind: sia|rtw|id|poa|training|contract|other, number, expiry, s3_key, verified_by), `emergency_contacts`, `availability`, `time_off` (holiday/sick/unavailable, status), `hr_notes` (note|commendation|warning|review|training|venue_feedback), `onboarding_tasks`, `contracts` (template, signature image key, signed_at, ip), `offboarding`, `venue_bans`, `supervisor_assignments` (security manager ↔ officers/venues).
Venues: `clients`, `venues` (address, lat, lng, radius_m, qr_secret, qr_version, instructions), `venue_contacts` (user_id), `venue_rates` (role, base, night/weekend/bh uplift %, min hours, effective_from), `venue_documents`.
Rota: `cover_requests` (venue, role, start, end, headcount, status), `shifts` (venue, role, start, end, status draft|published|open|filled|cancelled, cover_request_id), `shift_assignments` (officer, status assigned|accepted|declined|requested|approved), `bank_holidays`.
Time: `clock_events` (assignment, type in|out|break_start|break_end, ts, lat, lng, accuracy, qr_ok, geo_ok, exception, approved_by), `timesheets` (assignment, actual times, rounded hours, status pending|sm_approved|venue_signed|disputed|locked, dispute comment).
Money: `pay_periods`, `statements` + `statement_lines` (hours, rate, uplift, bonus/expense/deduction), `invoices` (number sequence, venue, period, net, vat, gross, status draft|issued|paid|overdue|credited, due_date) + `invoice_lines`, `credit_notes`.
Incidents: `incidents` (venue, shift, officer, type, severity, occurred_at, location, people, injuries, actions, force_used, justification, police_ref, ambulance_ref, status submitted|changes_requested|closed), `incident_versions` (original preserved), `incident_witnesses`, `incident_attachments`.

## Backend files (`functions/api/`)
- `index.mjs` — CORS, parse, auth middleware, `action` → module router, error → json.
- `lib/db.mjs` (pool per skill pattern + `migrate()` runs pending SQL files on cold start, tracked in `schema_migrations`), `lib/auth.mjs` (scrypt hash via `node:crypto`, HMAC-SHA256 JWT, `requireRole`, scoping helpers: venue users → own venues; security managers → assigned officers/venues), `lib/storage.mjs` (presigned PUT/GET, `@aws-sdk` from runtime), `lib/pdf.mjs` (`pdf-lib`: statement, invoice, incident, QR poster, signed contract), `lib/geo.mjs` (haversine), `lib/rates.mjs` (resolve officer/venue rate + uplift for a shift segment incl. night split, weekend, bank holiday), `lib/notify.mjs`, `lib/audit.mjs`.
- Modules (`modules/*.mjs`): `auth` (login, refresh, reset, invite, accept-invite, bootstrap-first-admin), `users`, `settings`, `venues` (CRUD, rates, QR regenerate/poster), `officers` (profile, docs, compliance status), `hr` (time off, notes, onboarding, contracts/e-sign, offboarding), `rota` (cover requests, shifts, assign, open-shift request/approve, conflict check, copy week, recurring), `clock` (clock in/out/break, exception submit/approve, manual correction), `live` (on-site board), `timesheets` (build, approve, sign-off, dispute, lock/unlock), `pay` (generate statements, PDF, CSV/bank export, mark paid), `invoices` (generate, edit draft, issue, email, paid, credit note, CSV, margin report), `incidents` (create, update/version, review, attachments, PDF, search, trends), `dashboard` (per-role tile data), `notifications`, `files` (upload/download URLs with permission check).
- Clock-in rule: QR payload = `venueId.qrVersion.HMAC`; server verifies HMAC + current version, distance ≤ radius (+ GPS accuracy tolerance capped), assignment window (−30 min … end), officer compliant. Fail → stored as exception, supervisor notified.
- `package.json` deps: `pg`, `pdf-lib`, `qrcode` (server-side poster). Keep bundle < 4 MB.

## Scheduled `jobs` function (`functions/jobs/index.mjs`, `rate(10 minutes)`)
No-show/late detection after grace; build timesheets on clock-out-less shifts past end (flag); auto venue sign-off after N days; document expiry alerts at 60/30/7/0 days and set officer non-compliant; mark invoices overdue; shift reminders 2 h before. Shares `lib/` via a copy step in a small `scripts/sync-lib.mjs` (run before deploy) since each function is zipped separately.

## Frontend structure (`app/src/`)
- `api.js` (fetch wrapper, token refresh, `API_BASE` → direct Lambda URL after first deploy), `auth/` (login, reset, accept-invite), `ui/` (design-system components), `layouts/` (ManagerLayout sidebar, OfficerLayout tab bar), role-guarded route trees:
  - `/company/*`: Dashboard, Rota (calendar week/day/month, by venue/officer), Cover requests, Live board, Staff (list, profile tabs: Overview/Compliance/Docs/Rates/Availability/Time off/HR notes/Contracts), Recruitment & onboarding, Venues (profile, map + radius picker with Leaflet/OSM, rates, QR poster), Timesheets, Pay runs & statements, Invoices, Incidents, Reports (hours, margin, incident trends), Users & Settings, Audit log.
  - `/security/*`: Dashboard, Rota, Live board, Exceptions, Timesheet approvals, Incidents review, My officers.
  - `/venue/*`: Dashboard (tonight's team), Request cover, Live on-site, Incidents, Timesheet sign-off/dispute, Invoices.
  - `/officer/*`: Home (big clock-in tile), Shifts (mine + open), Clock (camera QR scanner via `html5-qrcode` + geolocation), Report incident (photo capture), Statements, Documents, Time off & availability, Profile, Notifications.
- Charts (reports) via a light library following the dataviz skill.

## Implementation order
1. Config + scaffolding: `openkbs.json` (postgres true, spa, jobs fn w/ schedule), Vite app, design tokens/components, landing page.
2. DB migrations + auth/users/settings + bootstrap admin.
3. Venues (geo, QR) + Officers/compliance/documents.
4. Rota + cover requests + conflicts.
5. Clocking + live board + exceptions.
6. Timesheets → statements → invoices (+ PDFs, exports, margin).
7. Incidents.
8. HR: time off, notes, onboarding/recruitment, e-sign contracts, offboarding.
9. Dashboards, notifications, jobs function, reports.
10. Seed demo data script (`scripts/seed.mjs`: 2 venues, 8 officers, a week of shifts) for testing.
11. Deploy: commit → `openkbs deploy` (Postgres) → `openkbs fn deploy api` / `jobs` → set `API_BASE` to Lambda URL → `npm run build` → commit → `openkbs site deploy`.

## Verification
- `openkbs fn invoke api` smoke tests per action (login, create venue, assign shift, clock-in success/fail cases, generate statement/invoice and check totals against hand-calculated values incl. night uplift + VAT).
- Unit tests (`node --test`) for `rates.mjs`, `geo.mjs`, QR HMAC, rounding and permission scoping (venue user cannot read pay/HR).
- agent-browser E2E on the deployed site with seeded users: each role logs in, venue requests cover → company fills → officer clocks in (mocked geolocation + QR payload) → clock out → approvals → statement + invoice PDFs → critical incident appears on venue dashboard within one poll. Screenshots at mobile (390px) and desktop widths to check the Bento/iOS look. Close browser after.
- Note to user: email notifications start working once a custom domain is connected and verified.
