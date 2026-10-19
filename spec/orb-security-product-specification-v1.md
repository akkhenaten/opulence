# Orb Security — Product Specification (v1)

## Context
Orb Security is an internal operations platform for **one UK manned-guarding company**. It replaces spreadsheets/WhatsApp for rotas, clocking, timesheets, officer pay statements, client invoicing, incident reporting and HR. Clients (venues) get their own portal to request cover, watch who is on site and sign off hours. Officers are **self-employed contractors**.

Design direction: **Bento grid, white / blue / grey, minimalistic, iOS feel** — rounded tiles, soft depth, SF-style typography, generous whitespace, one confident blue accent. Delivered as a **responsive web app / installable PWA** (officer view mobile-first; manager portals desktop + mobile).

## Goals
1. One source of truth for who works where, when, and for how much.
2. Prove attendance (GPS geofence + venue QR) so invoices and pay are trusted.
3. Turn approved hours into officer remittance statements and venue invoices with no re-keying.
4. Keep the company SIA- and right-to-work-compliant with expiry alerts.
5. Professional incident reporting that venues and police can rely on.

## Users & Portals
| Portal | Who | Core purpose |
|---|---|---|
| **Company Manager** | Owner / ops director / admin | Everything: staff, venues, rates, rota, pay, invoices, HR, settings, reports |
| **Security Manager** | Supervisor / area manager | Fill rota, monitor live attendance, review incidents, approve timesheets, manage assigned officers |
| **Venue Manager** | Client contact at a venue | Request cover, live on-site view, read incidents, sign off timesheets, view/download invoices |
| **Officer app** | Security officer (contractor) | Shifts, availability, open-shift requests, clock in/out, incidents, statements, documents, holiday |

Permission rule: venue managers never see officer pay, HR or documents (only name, photo, SIA number/badge, role). Security managers see only officers/venues assigned to them; pay rates hidden unless granted.

## Functional Requirements

### 1. Accounts & access
- Email + password login, password reset, invite-by-email onboarding; role-based access per portal.
- One person can hold one role; Company Manager can invite/deactivate any user.
- Audit log of key actions (rate changes, timesheet edits, approvals, deletions).

### 2. Venue profile
- Name, client company, address, contacts (venue managers), billing details, VAT details, notes/site instructions, photos.
- **Geolocation**: map pin + adjustable geofence radius.
- **QR code**: unique per venue, printable poster (PDF); can be regenerated (old code invalidated).
- Charge rates per role (e.g. Door Supervisor, Security Guard, Steward, CCTV), with uplifts (night, weekend, bank holiday) and minimum shift length.
- Venue documents (assignment instructions, risk assessments).

### 3. Staff profile (full)
- Personal: name, photo, DOB, contact, address, emergency contacts, NI number, UTR (self-employed), bank details.
- Compliance: **SIA licence** (number, type, expiry, front/back image), right-to-work (type, expiry, evidence), ID, proof of address, first-aid & training certificates — all with expiry tracking.
- Work: roles/skills, pay rate(s) per role (overridable per venue), preferred venues, banned venues, availability.
- Status: applicant → onboarding → active → suspended → left.
- Expiry alerts at 60 / 30 / 7 days; officers with expired SIA or right-to-work **cannot be rostered or clock in**.

### 4. Rota & shifts
- **Cover requests**: venue manager requests cover (date, start/end, role, headcount, notes); company/security manager accepts and staffs it. Company can also create shifts directly.
- Staffing: assign officers directly, or publish as **open shifts** that eligible officers request; manager approves.
- Conflict checks: double-booking, availability, expired licence, banned venue, max-hours warning.
- Officers accept/decline assigned shifts; views: day / week / month, by venue or by officer; copy week; recurring shifts.
- Notifications on publish, change, cancellation and reminder before shift.

### 5. Clocking in / out
- Officer clocks in from the app: must be **inside venue geofence AND scan the venue QR**.
- Failed check (out of range / wrong QR / no GPS) → blocked, with option to submit an exception that is **flagged to the supervisor** for approval.
- Records actual times, GPS coordinates, device time; supports breaks.
- Live board: who is on site, late, no-show (configurable grace, e.g. 10 min → alert), clocked out early.
- Supervisor can manually correct times with a mandatory reason (audited).

### 6. Timesheets
- Auto-built from clock records per shift; rounding rules configurable.
- Approval flow: Security Manager approves → Venue Manager signs off (auto-approve after N days if no response, configurable) → locked for pay & invoicing.
- Disputes: venue can query a line with a comment; company resolves.

### 7. Officer pay (self-employed remittance statements)
- Pay period configurable (weekly / fortnightly / monthly).
- Statement = approved hours × officer rate (role/venue/uplift) + bonuses/expenses − deductions (e.g. uniform, advances).
- No tax/NI deducted (contractors). Statement shows UTR, period, line items, total.
- PDF statement in officer app + emailed; CSV/bank-payment export; mark as paid.
- Officer can view history of statements.

### 8. Invoices (to venues)
- Auto-generated weekly or monthly per venue from locked timesheets: hours × charge rate (+ uplifts) + **VAT**.
- Sequential invoice numbers, company branding, payment terms, bank details.
- Draft → review/edit → issue (PDF + email) → paid / overdue tracking; credit notes.
- Venue manager sees and downloads their invoices. CSV export for accountant.
- Margin report for Company Manager (charge vs pay per venue/period).

### 9. Incident reports
- Created by officers (or supervisors) from app, linked to venue + shift.
- Fields: type (ejection, refusal of entry, assault, medical, theft, drugs, damage, police called, lost child, other), date/time, exact location in venue, people involved (descriptions), injuries, actions taken, force used (and justification), witnesses, police/crime ref, ambulance ref, severity (low/med/high/critical), photos/attachments.
- Workflow: submitted → supervisor reviewed (can request edits) → closed. Officer's original wording preserved; edits versioned.
- Serious/critical incidents → immediate alert to security + company managers and the venue manager.
- Venue manager reads incidents for their venue; PDF export for police/insurers; search & filter; trends report.

### 10. HR (all in v1)
- **Onboarding & recruitment**: applicant invite/application form, document checklist with upload, compliance verification by manager, contractor agreement **e-signing**, convert applicant → active officer.
- **Holiday & absence**: time-off requests & approvals, sickness logging, unavailability calendar (blocks rostering).
- **Performance & discipline**: notes, commendations, warnings, reviews, training records, venue feedback, offboarding (reason, return of kit, rehire eligible).
- Document library per officer with expiry alerts.

### 11. Dashboards (Bento)
- Company: live on-site count, today's shifts / unfilled, alerts (no-shows, exceptions, expiring licences), open incidents, hours & revenue this period, overdue invoices.
- Security manager: today's rota, live attendance, pending approvals, incidents to review.
- Venue: tonight's team on site, pending cover requests, incidents, invoices.
- Officer: next shift (big clock-in tile), this week, latest statement, alerts, documents.

### 12. Notifications
- In-app notification centre for all roles + email (requires company domain to be connected for sending).
- Events: shift published/changed/reminder, open shift, no-show/late, clock exception, incident (critical = instant), timesheet awaiting sign-off, invoice issued/overdue, document expiring, time-off decided.

## User Stories (key)
- As a **venue manager**, I request 4 door supervisors for Saturday 21:00–03:00 and later see each one clock in on a live board.
- As a **security manager**, I fill an open request with available, licensed officers and get warned if one is double-booked.
- As an **officer**, I arrive, scan the QR on the venue poster, and I'm clocked in only if I'm within the geofence.
- As an **officer**, I file an ejection incident with photos during my shift.
- As a **company manager**, at period end I generate all officer statements and venue invoices from signed-off hours in one action.
- As a **company manager**, I get warned 30 days before an officer's SIA licence expires and they're blocked from rota once it does.

## Acceptance Criteria (headline)
- Clock-in succeeds only with GPS inside radius + valid current venue QR; every other attempt becomes a flagged exception.
- Officer with expired SIA/right-to-work cannot be assigned or clock in.
- Venue portal exposes no pay, HR or personal document data.
- Statements and invoices total exactly from locked timesheets and the rates effective on the shift date; editing a locked timesheet requires unlock + audit entry.
- Invoices include VAT and sequential numbers; PDFs match the on-screen figures.
- Critical incident triggers an alert to company, security and venue managers within a minute.
- All screens usable on a phone; officer app installable to the home screen.

## Constraints
- Single company (no multi-tenant). UK only: GBP, VAT, SIA, right-to-work, UK bank holidays.
- Web/PWA on OpenKBS (static site + functions + Postgres + storage; realtime for live board).
- Personal data (UK GDPR): role-restricted access, documents in private storage, data export/delete on request.
- Outbound email requires a connected, verified custom domain.

## Out of Scope (v1)
- Multi-company SaaS, other countries.
- PAYE/NI/pension or HMRC filing (officers are self-employed).
- Online card payment of invoices; accounting-software direct sync (CSV export only).
- Native App Store apps; offline clock-in.
- Patrol tours / checkpoint scanning, guard-tour check calls, lone-worker panic alarm, facial recognition.
- SMS / WhatsApp notifications.
