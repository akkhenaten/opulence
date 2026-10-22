# Implementation plan: Recurring cover, venues, Messages, shift page, bans, Training, compliance, one-to-ones, pay review, Ask Orb

Spec (approved): `spec/plan-recurring-cover-venues-messages-shift-page-and-shift-lo.md`.
Delivery: **5 releases**. Each one is built, linted, deployed, committed, site-deployed and verified before the next starts.

## Context
The owner wants every role's daily work joined up in one connected system, and the spec records every decision. The code has partial pieces we will reuse:
- the chase → escalate → cover-offer engine (`ops.mjs:111-340`, `:776-840`);
- the Academy results grid, `renew_months` and mandatory re-assignment (`academy.mjs:590`, `:644`);
- the weekly compliance engine (`compliance.mjs:97-228`, `decideCompliance` :313);
- contract signing and PDFs (`hr.mjs:145-216`);
- pay and invoice generators (`money.mjs:111`, `:261`), `reconcile` (`ops.mjs:199`);
- the `documents` table, upload purposes (`documents.mjs:23`), `notify()`, the `ui/Chat.jsx` Composer and the `claude()` helper (`lib/ai.mjs:61`).

Missing pieces: recurrence, a messages store, shift logs and bans, a lead flag, outside certificates, one-to-ones, pay review, saved PDFs and a server-side assistant.

## Conventions used throughout
- **Backend:**
  - each new module exports `actions` built from `def(roles, fn)` (`modules/_def.mjs`) and is registered in `functions/api/index.mjs` (ACTIONS list);
  - scheduled work is added to `runJobs()` in `modules/jobs.mjs`, which runs every 5 minutes;
  - errors use `fail()`; transactions use `tx()`; every write records `audit()`; recipients come from `lib/notify.mjs` helpers;
  - scope comes from `lib/scope.mjs`.
- **Migrations** are numbered `009`–`013`, one per release, and run automatically through `migrate()`.
- **Frontend:**
  - only the UI kit (`app/src/ui/index.jsx`): Page, Tile, Section, List, Row, Sheet, Button, Input, Toggle, Pill, Avatar, useApi, useAction, useForm;
  - routes go in `app/src/main.jsx`, nav in `app/src/layouts/nav.js`;
  - ui-lint stays at 0;
  - no new dependencies (calendar built by hand).
- **Release routine:**
  - `cd app && npm run build`;
  - `openkbs fn deploy api`;
  - `git add -A && git commit` (`feat: …`, bullets, Co-Authored-By);
  - `openkbs site deploy`;
  - add demo data in `scripts/seed-*.mjs`;
  - API tests with `/tmp/orb/call.mjs`;
  - browser checks at 390 and 1440 wide, then `agent-browser close --all` and stop the preview;
  - restore demo data;
  - post a plain-language board comment on the spec card.

---

## Release 1: Venues, recurring cover, Messages and the late-staff flow

**Migration `009_messages_cover.sql`**
- `cover_series`:
  - id, venue_id → venues, role → roles(code), kind `one_off|recurring`, frequency `weekly|fortnightly`;
  - days jsonb `[{dow,start,end,headcount}]`, start_date, end_date NULL, notes;
  - status `active|cancelled`, requested_by, created_at, updated_at.
- `cover_requests` gains:
  - `series_id` → cover_series, `occurs_on` date;
  - `change_status` `none|pending|approved|declined` (default `none`), `change_scope` `one|future`, `change_payload` jsonb, `change_by`.
- **Backfill:** each existing cover_request gets a one_off series.
- `conversations`:
  - id, kind `direct|group|cover|shift|ops|pay`, ref_id uuid NULL, title, created_by, last_message_at;
  - unique (kind, ref_id) where ref_id is not null.
- `conversation_members`:
  - conversation_id, user_id, last_read_at, muted, left_at;
  - PK (conversation_id, user_id).
- `messages`:
  - id, conversation_id, sender_id → users, body, attachments jsonb `[]`, quick jsonb NULL;
  - edited_at, deleted_at, created_at;
  - index (conversation_id, created_at).
- `message_reports` (message_id, user_id, reason, created_at).
- `users.system` boolean, plus an "Orb Ops" system user with no password, which can never sign in (enforced in `auth.login`).

**Backend**
- `lib/threads.mjs` (new):
  - `ensureThread(kind, refId, memberUserIds, title)`, `syncMembers`;
  - `post(convId, senderId, {body, attachments, quick})`, which updates `last_message_at`, sends `notify` kind `message` to members other than the sender (push, deduped per conversation) and skips muted members;
  - `opsMessage(userId, body, quick, ref)`, which posts from Orb Ops into the user's `ops` conversation.
- `modules/messages.mjs` (new, roles ALL):
  - `messages.inbox`, `thread` (cursor paging), `send`, `edit` (own, within 15 minutes), `delete` (own: soft delete), `read`, `startDirect`, `createGroup`, `addMembers`, `leave`, `unread`, `report`, `people` (all active users, for everyone ↔ everyone);
  - `messages.reply` (a quick-reply tap, which routes to the ops handlers);
  - the company role can open any conversation, logged to audit as safeguarding access;
  - upload purpose `message` is added in `documents.mjs:23`.
- **Free-text understanding:**
  - when someone sends into an `ops` conversation while a chase or offer is open, `classifyReply(text)` runs (Haiku, a tool schema with intents on_my_way+eta, cant_make_it+reason, accept, decline, unclear);
  - it then calls the existing `ops.reply` / offer-respond logic (refactored from `ops.mjs:776`, `:806` into exported functions);
  - unclear replies get a clarifying Orb Ops answer.
- **`ops.mjs` hooks:**
  - `lateAlerts` (`jobs.mjs:11`) and chase/escalate also call `opsMessage` with quick replies;
  - cover offers sent after approval go through `opsMessage` with Accept/Decline;
  - when an offer is accepted, post to the shift thread (add the member), the venue cover/office thread and the late officer ("You've been stood down").
- **Cover** (`modules/rota.mjs`):
  - `expandSeries(series, from, to)` makes occurrences: rolling series run 8 weeks ahead; overnight shifts where end is before start roll into the next day; the `londonToUtc` helper is used;
  - `cover.create` accepts `{venue_id, role, kind, frequency, days, start_date, end_date, notes}`, inserts the series and occurrences, `ensureThread('cover', series.id, venueContacts + managers)`, and notifies managers;
  - `cover.update {id, scope, ...}` and `cover.delete {id, scope}`: pending occurrences change directly; accepted occurrences get `change_status = pending` and managers are notified;
  - `cover.decideChange {id, approve, reason}` (MGR) applies the change to the linked shifts through the existing shift save/cancel paths, then notifies assigned officers and the venue;
  - `cover.accept {id, scope}` accepts one occurrence or every pending one in the series;
  - a job in `jobs.mjs` extends rolling series.
- **Venues:**
  - `venues.save` becomes MGR, with `billing_*`, `client_id` and `invoice_cycle` stripped unless the role is company; `saveRate`/`deleteRate`/`clients.*` stay CO;
  - `documents.mjs` `assertOwner` lets an in-scope security manager write venue documents.
- `venueRequests.create` (`ops.mjs:849`):
  - `REQUEST_TOOL` gains an optional recurrence (`frequency`, `days`, `end_date`);
  - a new flag `{draft:true}` returns the parsed request without inserting anything, so Messages can pre-fill the form.

**Frontend**
- `pages/messages/Inbox.jsx`, `Thread.jsx`, `NewMessage.jsx`, `_parts.jsx`:
  - polling every 10 s on the open thread and every 30 s for the badge;
  - photo attachments via `upload(f,'message')`;
  - quick-reply buttons; "Turn into cover request" (venue role) opens the cover form pre-filled.
- `nav.js`: Messages for every role, with an unread badge; officer access via a header icon. The venue "Requests" item is removed, and `/venue/requests` redirects to `/venue/messages`.
- `pages/manager/VenueCover.jsx`: RequestForm gets a One-off/Recurring switch, per-day rows, frequency, end date or none; Edit/Delete with a scope sheet; a "Change awaiting approval" pill.
- `pages/manager/Cover.jsx`: grouping by series, an Accept-series option, and a change-approval sheet.
- `pages/venue/Site.jsx` (`/venue/site`, nav "My venue"): uses `venues.get` plus `docs.list` (read-only, downloads).
- `pages/money/Venues.jsx` and `VenueDetail.jsx`: routes added for security; the Rates and Billing tabs are hidden unless the role is company.

**Verify:**
- weekly and fortnightly expansion, including overnight;
- edit one / edit future, both while pending and when accepted (approval, then the shift changes and officers are notified);
- messages between every pair of roles, unread counts, report;
- a security user cannot set rates;
- the late-staff run: stage a shift that started 20 minutes ago with no clock-in, call `runJobs`, then go through the free-text reply "running 15 late", no reply leading to a cover card and **no offers before approval**, approve, an officer accepts, and the rota, shift thread, venue thread and stood-down message all update;
- restore demo data.

---

## Release 2: Shift calendar, shift page, head doorman, shift log, bans

**Migration `010_shift_log_bans.sql`**
- Insert role `head_door` ("Head doorman", `requires_sia` true, `accepted_licences` copied from door).
- `shift_assignments.is_lead` boolean default false, plus a unique partial index on (shift_id) where is_lead.
- `shift_logs`: shift_id PK, status `open|signed`, handover_summary, signed_by, signed_at.
- `shift_log_entries`:
  - id, shift_id, author_user_id, kind `note|handover|incident|ban`, body, photos jsonb;
  - state `kept|removed`, curated_by, curated_at, incident_id, ban_id, created_at, updated_at.
- `customer_bans`:
  - id, venue_id, name, description, photo_key, reason;
  - starts_on, ends_on NULL (permanent), status `proposed|active|lapsed|revoked`;
  - proposed_by, confirmed_by, confirmed_at, revoked_by, revoked_reason, source_entry_id;
  - photo_purge_after, created_at.
- `incidents.log_entry_id` NULL.

**Backend**
- Fix the hard-coded steward checks (`officers.mjs:12`, `rota.mjs:22`) to read `roles.requires_sia`.
- `rota.mjs`:
  - `shifts.setLead {shift_id, officer_id}` (MGR) warns when the person doesn't hold `head_door`, notifies the lead and audits;
  - `shifts.detail {id}`:
    - officer: only shifts with an active own assignment; MGR and venue use scope;
    - returns the shift, venue, team (name, photo, role, lead; venue users get the reduced fields from `rota.mjs:76`), the previous signed handover at the venue, active bans, log entries (venue: signed + kept only; officer: their own shift), the shift thread id (`ensureThread('shift', id, officers + managers)`) and clock status.
- `modules/shiftlog.mjs` (new):
  - `shiftlog.add` (an officer on the shift, from 1 hour before start to 6 hours after end, or MGR), with photos via upload purpose `shiftlog`;
  - `shiftlog.update` (own entry while open), `shiftlog.curate {entry_id, state, body}` (lead or MGR);
  - `shiftlog.sign {shift_id, handover_summary}` (lead or MGR) notifies venue contacts and the next shift's team at the venue;
  - `shiftlog.list {venue_id, from, to}` (MGR and venue).
- `modules/bans.mjs` (new):
  - `bans.list {venue_id, status}`: venue scope; officers only for venues where they have a shift within ±30 days;
  - `bans.propose` (officer on the shift, from a log entry);
  - `bans.confirm` (lead on a shift at that venue, MGR or venue user);
  - `bans.create` (MGR, venue user; created active);
  - `bans.revoke` and `bans.update`;
  - photos are signed through `downloadUrl`.
- `jobs.mjs`: lapse `active` bans when `ends_on < today` (London time), and delete `photo_key` objects once `photo_purge_after` (90 days after lapse or revoke) has passed.
- `incidents.create` accepts `log_entry_id`, takes the shift from the entry and links it back.

**Frontend**
- `pages/officer/ShiftCalendar.jsx` (new): Month grid and Week columns, blocks coloured by assignment status, tap opens the shift page.
- `pages/officer/Shifts.jsx`: tabs Calendar (default) · My shifts · Offers · Open.
- `pages/officer/ShiftPage.jsx` (new, `/officer/shifts/:id`) has these sections:
  - header (time, venue, `VenueStrip` map, instructions);
  - Clock (status plus a link to `/officer/clock`);
  - team with the lead badge;
  - last handover;
  - active bans;
  - shift log (composer with photos, entry kinds; lead controls curate and sign off);
  - Report incident (`/officer/incidents/new?shift=`);
  - Toolbox chips (`/officer/learn/toolbox?cat=first_aid|law|situations`);
  - shift thread link.
- `IncidentForm.jsx` reads `?shift=` and `?entry=`.
- Manager:
  - `Rota.jsx` ShiftDetail gets a Lead picker plus Log and Bans tabs;
  - `VenueDetail.jsx` gets a Bans tab and a Shift logs tab.
- Venue: `pages/venue/ShiftLogs.jsx` and `pages/venue/Bans.jsx` (list, add, revoke); nav items "Shift logs" and "Bans".

**Verify:**
- only one lead per shift is allowed;
- an officer cannot read another shift's log (403);
- the venue sees only signed + kept entries;
- propose → confirm → visible on the next shift page;
- a temporary ban lapses through the job;
- the photo purge is simulated by back-dating;
- a non-lead cannot curate;
- an incident created from an entry links both ways;
- calendar and shift page at 390 and 1440 wide.

---

## Release 3: Training hub, outside certificates, AI compliance
**Migration `011_training_compliance.sql`**
- `documents` gains `title`, `provider`, `issued_on`.
- Add kind `cctv` to the allowed kinds (`lib/licences.mjs:4`, `officer/_parts.jsx:50`).
- `ops_jobs.compliance_digest` default true.

**Backend**
- `academy.staffRecords` (MGR): every officer with course states (the `academy.results` logic) plus outside training documents.
- `academy.refreshersDue` (MGR): expiring and expired certificates from both sources within 60 days.
- `docs.create` accepts title, provider and issued_on for the `training`/`first_aid`/`cctv` kinds.
- `compliance.mjs` `officerIssues` is extended:
  - expired, expiring and unverified checks for every document kind that has an expiry;
  - missing `roles.required_docs` for each role the officer holds;
  - Academy refreshers;
  - severity ranking: expired > expiring before a rostered shift > within 30 days > within 60 days > missing.
- `compliance.overview` (MGR) returns flat issue rows.
- Weekly digest: after the weekly run in `ops.mjs:371`, if `jobOn('compliance_digest')`, send `emailHtml` to `companyManagers()` with counts and the 10 worst issues, using the existing branding.

**Frontend**
- `nav.js`: "Academy" becomes **Training** (`/company/team/training`, with `/company/team/academy` redirecting); same for security.
- `pages/team/Training.jsx` (new) has tabs:
  - Staff records (new);
  - Academy results (the existing `Academy.jsx` Results part, extracted);
  - Courses (existing);
  - Refreshers due (new, with Assign refresher via `academy.assign` and Remind via `notify`).
- `pages/people/Compliance.jsx` (new, People → Compliance): filters, AI advice, and the existing `decideCompliance` actions.
- An outside-training upload sheet is shared by Staff records, the profile Training tab (`_profileTabs.jsx:919`) and the officer's `Documents.jsx`.
- A compliance badge in the `StaffProfile.jsx` header.
- Ops settings get a digest toggle (`OpsAI.jsx:341`).

**Verify:**
- a first-aid certificate expiring in 20 days appears in Refreshers due, on the Compliance screen and in an Ops card;
- a required document missing for a role is flagged;
- the digest HTML can be previewed (a real send only if `openkbs email info` reports Verified);
- the old Academy route redirects.

---

## Release 4: One-to-ones, pay-rise agreements, rating schedule
**Migration `012_one_to_ones.sql`**
- `one_to_ones`: id, officer_id, manager_id, held_on, notes, rating, shared_with_officer, timestamps.
- `goals`: id, officer_id, one_to_one_id, title, target, due_on, status `open|met|missed|dropped`, timestamps.
- `goal_notes`: id, goal_id, author_user_id, body, created_at.
- `pay_agreements`:
  - id, officer_id, one_to_one_id, role, venue_id NULL, current_rate, new_rate, effective_from;
  - condition_goal_ids uuid[];
  - status `draft|sent|signed|applied|void`, signed_name, signature_png, signed_ip, signed_at, applied_rate_id, timestamps.

**Backend** (`modules/hr.mjs`)
- `oneToOnes.list/save/delete`, `goals.save/setStatus`, `goals.addNote` (MGR within officer scope; the officer reads shared items and can add a note to their own goals).
- `payAgreements.save/send/void` (CO), `payAgreements.sign` (officer; reuses the signature validation from `contracts.sign`), `payAgreements.pdf` (the `Doc` class).
- Job: apply signed agreements whose `effective_from` has arrived and whose conditional goals are all `met`:
  - insert `officer_rates` via the existing insert path, set `applied_rate_id` and notify;
  - if goals are not yet met, notify managers once.
- Ratings: the ops feedback job (`ops.mjs:332-355`) only creates the `venue_feedback` prompt when it is the officer's first clocked shift at the venue, or when the last rating for that venue and officer is more than 30 days old.
- `feedback.submitAdhoc` (venue): any officer at their venue in the last 7 days.

**Frontend**
- `StaffProfile.jsx`: new **One-to-ones** tab (`_profileTabs.jsx`):
  - meeting list and meeting sheet (notes, rating, goals);
  - an "Add pay rise" sheet (role, venue, new rate, start date, conditional goals);
  - agreement status pills;
  - an "Average venue rating since last meeting" hint, from `attendance.list`.
- Officer `Me.jsx`: My goals and Agreements; `pages/officer/Agreement.jsx` (read and sign, modelled on `Contract.jsx`).
- Venue: "Rate staff" sheet on `VenueDashboard.jsx` next to `FeedbackTile`.

**Verify:**
- a conditional agreement waits until its goals are `met`, then applies, and `pay.generate` uses the new rate;
- an unconditional agreement applies on its date;
- the rating prompt shows after the first shift and not again within 30 days;
- an ad-hoc rating works.

---

## Release 5: Saved PDFs, staff pay review, AI money workflow, Ask Orb
**Migration `013_pay_review_assistant.sql`**
- `pay_runs`:
  - id, period_start, period_end, run_date;
  - status `draft|in_review|reconciled|issued|paid`;
  - review_deadline, created_by, created_via `user|ai`, timestamps.
- `statements` gains `pay_run_id`, `review_status` `pending|approved|disputed|no_response|resolved`, `reviewed_at`, `pdf_document_id`.
- `statement_disputes`: id, statement_id, line_id NULL, comment, status `open|resolved`, resolution, resolved_by, conversation_id, timestamps.
- `invoices` gains `pay_run_id`, `pdf_document_id`.
- `documents.system` boolean (cannot be deleted), plus kinds `invoice` and `pay_statement`.
- `assistant_conversations` (id, user_id, title, created_at, updated_at) and `assistant_messages` (id, conversation_id, role, content jsonb, pending_action jsonb, action_status, created_at).
- Backfill: group existing statements by period into `pay_runs`, with existing issued statements set to `review_status = approved`.

**Backend**
- `lib/archive.mjs`: `archivePdf({ownerType, ownerId, kind, filename, bytes, title})` calls `putObject` under `docs/archive/<kind>/…` and inserts a `documents` row with `system = true`.
  - Filenames: `<Venue> — Invoice <number> — <d MMM yyyy>.pdf` and `<First Last> — Pay statement — <run date>.pdf`.
- `money.mjs`:
  - refactor the PDF builders into `buildInvoicePdf(id)` and `buildStatementPdf(id)`;
  - `invoices.issue` and the credit note call `archivePdf` inside the flow;
  - `invoices.pdf` and `pay.pdf` return the saved file when `pdf_document_id` is set.
- `pay.generate` creates a `pay_runs` row.
- `payRuns.list/get`, `payRuns.sendForReview {id, deadline_days 1-7}` (CO): sets statements to pending and notifies officers by push and email.
- `pay.review {statement_id, approve | dispute:{line_id, comment}}` (officer, own statement only): a dispute creates a `statement_disputes` row plus an `ensureThread('pay', dispute.id, officer + company managers)`.
- `payRuns.resolveDispute {dispute_id, resolution, line edits}` (CO): reuses the line actions and `timesheets.edit`, posts in the thread and sets `resolved`.
- `payRuns.finalise` (CO):
  - blocks while disputes are open;
  - takes a choice for `no_response` statements (approve on their behalf or hold them back);
  - runs `runReconcile`; the status becomes `reconciled`.
- `payRuns.issue` (CO): reuses `pay.issue`, archives every statement PDF, and sets `issued`.
- `invoices.generate`: adds the filter that the timesheet's statement must be in a pay run with status ≥ `reconciled` and `review_status` in (approved, resolved); sets `pay_run_id`.
- Job: a reminder at deadline − 48 h; at the deadline, pending statements become `no_response` and managers are notified.
- **`modules/assistant.mjs`** (new, MGR; replaces `ops.chat`, which stays as a thin alias that calls it):
  - `assistant.list`, `get`, `send {conversation_id?, text, page:{name,id}}`, `confirm {message_id}`, `cancel {message_id}`, `rename`, `delete`.
  - The system prompt includes role, permissions and page context.
  - Tools:
    - the existing `ops.mjs:507` read tools;
    - new read tools: `pay_preview`, `pay_run_status`, `list_disputes`, `list_invoices`, `search_messages`;
    - action tools: `create_pay_run`, `send_for_review`, `resolve_dispute`, `finalise_pay_run`, `issue_pay_run`, `generate_invoices`, `issue_invoices`, `mark_paid`, `propose_change` (existing), `draft_message`.
  - Action tools only record `pending_action {action, body, summary}`.
  - `assistant.confirm` re-checks permissions (money actions need company), calls the real action function from the ACTIONS map with the user's ctx, writes audit `via: 'ask_orb'` and appends the result.
  - The `claude()` helper with SONNET, a 7-round cap and the existing `checkCap` credit cap are reused.

**Frontend**
- `pages/money/PayRuns.jsx`, replacing the period list in `Pay.jsx`:
  - a list of runs plus a run detail with a status timeline, review counts, a send-for-review sheet (deadline 1–7 days), a disputes panel, Finalise (with the no-response choice), Issue and Mark paid.
- `StatementDetail.jsx`: review status, dispute thread, Resolve.
- Officer `Pay.jsx`: a "Please review" banner, Approve / Dispute (choose a line and add a comment).
- Saved PDFs appear in:
  - `VenueDetail.jsx` Documents, venue `Site.jsx` Documents and `InvoiceDetail.jsx` ("Saved copy");
  - staff profile Documents and officer `Documents.jsx`.
- `ui/AskOrb.jsx` plus `layouts/Shell.jsx`:
  - a floating button for company and security, giving a side panel at ≥1024 px or a full-screen Sheet on phones;
  - history list, chat (reusing the Chat.jsx Composer and bubbles), and confirm cards with Confirm / Cancel;
  - page context comes from the current route (useLocation plus route params).
- `OpsAI.jsx`: the Chat tab is removed and replaced by an "Open Ask Orb" link.

**Verify:**
- Issuing an invoice saves the named PDF in venue Documents for both company and venue, and downloading again returns the identical bytes.
- Run a pay run with three officers (approve / dispute a line / no response):
  - the deadline sets no_response;
  - finalise is blocked while the dispute is open;
  - resolving then finalising and issuing puts the PDFs in profile Documents.
- `invoices.generate` skips unapproved hours.
- Ask Orb: "do last week's pay run" produces a pending card and **no change until Confirm**. A security manager without `can_see_pay` is refused, and a security manager cannot confirm money actions.
- Afterwards remove the test runs and invoices and restore the demo data.

---

## Already done (verify only)
- Officers can open Everyday (`/officer/everyday`) and change their own avatar (`officer/Profile.jsx`).
- If missing, add a "Everyday" link on officer Me.

## Risks and mitigations
- **Lambda bundle size and timeouts:** no new dependencies. AI calls stay at the existing caps. Series expansion is capped at 8 weeks or 62 occurrences per call.
- **Polling load:** the badge polls every 30 s through one indexed `messages.unread` query. Moving to MQTT is a later option.
- **Data protection:** ban photos are only visible within the venue scope plus rostered officers, purged 90 days after a ban ends, and every action is audited. Company access to message threads is logged.
- **Backwards compatibility:**
  - existing cover requests and statements are backfilled;
  - `ops.chat` remains as an alias;
  - old routes redirect.
