# Plan: Recurring cover, venues, Messages, shift page and shift log, bans, head doorman, Training hub, AI compliance, one-to-ones, ratings

## Context
The owner wants Orb Security to work as one connected system for every role (company, security, venue, officer). The aim is that each night's work, from request to shift, log, incident, ban, training, compliance and pay, feeds the right people automatically.

A review of the code found:
- **Partly built but hard to find or incomplete:**
  - per-staff training records;
  - Academy results with scores and certificates;
  - refreshers (courses with `renew_months`, plus mandatory courses re-assigned automatically);
  - the weekly AI compliance run (SIA, RTW and mandatory training only);
  - officers using Everyday and changing their own avatar.
- **Missing:**
  - recurring or editable cover requests;
  - a venue-manager page for their venue;
  - person-to-person messages (venue "Requests" is a stateless AI parser);
  - an officer calendar or shift page;
  - any shift lead, shift log, handover or customer ban list (`venue_bans` bars *officers*, not customers);
  - outside training uploads;
  - a compliance screen;
  - one-to-ones, goals or pay-rise agreements.
- **Ratings** are asked for after every shift.

## Decisions (from the user)
| Topic | Decision |
|---|---|
| Messages | Threads plus an AI helper. One inbox for every role: direct and group chats, an automatic thread for each cover request and each shift, unread badges, photos. The AI "turn this into a cover request" helper sits inside Messages. |
| Who can message whom | **Everyone ↔ everyone**, including venue managers and officers directly. |
| Head doorman | A new staff role with its own pay and charge rates, plus **one lead per shift**. The lead curates the log and bans and signs off the handover. |
| Venues | Company and security managers can create and edit venue details and documents. Charge rates and client billing stay company-only. Venue managers get a read-only venue page with details and documents. |
| Shift log | Everyone on the shift adds entries. The lead keeps, edits or removes them and signs off. The signed log becomes the handover for the next shift at that venue. Managers see everything, drafts included. Venue managers see signed logs only. |
| Bans | One customer ban register per venue: name or description, photo, reason, dates, temporary or permanent. Staff propose a ban from the log; the lead or a manager confirms it. The venue manager can view and add. Temporary bans lapse automatically. Officers see active bans for venues they work at. |
| Recurring cover | One-off or recurring: per-day times, weekly or fortnightly, an end date (or none, rolling 8 weeks ahead). Edit or delete asks "This date only" or "This and future". Pending requests change straight away; accepted ones need office approval, then the shifts update or cancel and staff are told. |
| Ratings | Ask after the officer's first shift at a venue, then at most every 30 days per officer and venue. Ad-hoc ratings are always allowed. Managers can rate during one-to-ones. |
| One-to-ones | Meetings with notes, a rating and goals (each with progress notes). An optional pay-rise agreement can be conditional on goals. The officer signs it in-app, and the new rate applies automatically from its start date. Officers see their own goals and agreements. |
| Training | The sidebar item "Academy" becomes **Training**, with tabs Staff records · Academy results · Courses · Refreshers due. Outside certificates can be uploaded with an expiry, by the manager or the officer. |
| AI compliance | Cover every document and certificate type plus Academy refreshers. Add a Compliance screen (worst first, AI advice, one-tap actions) and a weekly summary email to the company manager. Nothing happens without approval. |
| Officer shift page | Calendar (Month/Week blocks) → shift page with time, venue, map and instructions; the team and lead; last handover; active bans; the shift log; Report incident; First aid, Law at a glance and situations; the shift thread; clock in/out. The list view stays as a tab. |
| Invoice PDFs | When an invoice is issued, its PDF is saved once and stays fixed, named `<Venue> — Invoice <number> — <run date>.pdf`. It is filed in that venue's **Documents** (new kind `invoice`), so the venue manager and company manager both see it there and on the invoice. |
| Pay statement PDFs | When a statement is issued, its PDF is saved and stays fixed, named `<Officer name> — Pay statement — <pay run date>.pdf`. It is filed in the staff member's profile **Documents** (kind `pay_statement`), visible to the company manager and the officer. |
| Pay review by staff | New step: the pay run is sent to staff for review. Each officer approves or disputes **their own statement**, and a dispute opens a thread on that statement. The manager sets the review deadline per run (1–7 days); when it passes, any statement without an answer is marked "No response" and the manager decides. Only a reconciled, fully approved run goes on to invoicing. |
| AI does the money work | The manager can say e.g. "Do last week's pay run". The AI builds the drafts, reconciles them against the rota and clock-ins, sends them for staff review, follows up, drafts resolutions for disputes, then builds and issues the invoices. **Every step that reaches people or money is shown as a summary card with one Confirm.** |
| AI assistant | **"Ask Orb"** is a button on every manager screen (a side panel on desktop, full screen on phone). Conversations are saved with a history list. It knows which page you're on and covers the whole app. It replaces the chat tab inside Ops AI; the Ops inbox stays. Company and security managers get it within their permissions; only the company manager can confirm money steps. |
| Late staff and cover via AI | The existing chase → escalate → cover-proposal → offer engine (`ops.mjs:111-340`, `:776-840`) is kept, but every message now goes through **Messages** from an "Orb Ops" sender, with quick replies plus AI reading of free text (e.g. "stuck on tube 20 min" → on my way, ETA 20). The AI chases on its own. **A cover proposal needs the manager's one-tap approval** (Ops inbox, Ask Orb, push). After approval the AI messages candidates; the first to accept is put on the rota, the shift thread adds them, the venue is told in its thread, and the late officer is told they've been stood down. |
| Delivery | **5 releases**, each tested and live before the next one starts. The money workflow and Ask Orb are Release 5. |

## Cross-module wiring (how it all connects)
- **Cover request:**
  - when created, it opens a cover thread (venue contacts and managers) and notifies managers;
  - when accepted, it creates shifts;
  - each shift gets a shift thread (assigned officers, the lead and managers) and a shift log.
- **Shift log:**
  - entries can be marked as an incident (opens the incident form prefilled with the shift), a ban proposal (goes to the venue ban register), or a handover point;
  - sign-off produces the handover, which shows on the next shift page at that venue and in the venue manager's Shift logs.
- **Bans** are shown on:
  - the shift page;
  - venue page → Bans;
  - the manager venue detail;
  - the Ops AI chat tool (read-only).
- **Head doorman:**
  - it is a role, so the existing rates, rota warnings and Academy "assign by role" work for it;
  - the lead flag lives on the shift assignment;
  - only a qualified head doorman can be the lead (with a warning otherwise, as with role mismatches).
- **Training and compliance:**
  - outside certificates are `documents` rows;
  - one compliance engine checks documents, roles' `required_docs`, licences and course certificates;
  - its results feed the Compliance screen, Ops AI cards, the weekly email, the staff profile badge and the assignment block (unchanged rules plus role-required documents).
- **One-to-ones:** a signed pay agreement becomes an `officer_rates` row from its effective date. The pay run already picks the latest effective rate, so no change is needed there.
- **Ratings** feed the profile Attendance tab, one-to-one prep (average since the last meeting) and Ops AI low-rating cards (unchanged).
- **Pay run → invoice:**
  - only hours on approved or resolved statements are invoiced;
  - the saved PDFs are filed in venue Documents and staff Documents;
  - pay disputes are Messages threads;
  - Ask Orb can drive every step through confirm cards.
- **Notifications:** every new event uses `lib/notify.mjs`, with new opt-out kinds `message` and `shift_log`.
- **Audit:** every change to bans, logs, venues, cover series, agreements and lead assignment writes an audit entry.

## Release 1: Venues, recurring cover, Messages

**Data** (next migration number after the latest in `functions/api/db/migrations/`)
- `cover_series`:
  - id, venue_id, role, kind (`one_off`/`recurring`), frequency (`weekly`/`fortnightly`);
  - `days` jsonb `[{dow, start, end, headcount}]`, start_date, end_date (null means rolling), notes, status, requested_by, timestamps.
- `cover_requests` gains:
  - `series_id`, `occurs_on`;
  - `changed_from` jsonb for a pending change;
  - `change_status` (`none`/`pending`/`approved`/`declined`), `change_scope`.
  - Existing rows stay as one-off series of one.
- `conversations`:
  - id, kind (`direct`/`group`/`cover`/`shift`), ref_id, title, created_by, last_message_at.
- `conversation_members` (conversation_id, user_id, last_read_at, muted, left_at).
- `messages`:
  - id, conversation_id, sender_id, body, attachments jsonb (storage keys), edited_at, deleted_at, created_at.
- Upload purpose `message` → folder `messages`.

**Backend**
- `modules/rota.mjs` (cover):
  - `cover.create` takes a series and expands it into occurrences: up to the end date, or 8 weeks when rolling. An hourly job extends rolling series.
  - `cover.update` and `cover.delete` take `{id, scope: 'one'|'future'}`. Pending requests change in place. Accepted ones set `change_status = pending`, notify managers and open an approval in the Cover page.
  - `cover.decideChange` (MGR), on approve: update or cancel the linked shifts (reusing `shifts.save` / `shifts.cancel` logic), notify assigned officers and the venue.
  - `cover.accept` accepts one occurrence or a whole series (scope).
- `modules/messages.mjs` (new; roles: all):
  - `messages.inbox` (conversations with last message and unread count), `messages.thread` (paged), `messages.send`, `messages.edit`, `messages.delete`, `messages.read`, `messages.startDirect`, `messages.createGroup`, `messages.unread` (badge).
  - **Everyone ↔ everyone:** the people picker lists all active users. The company manager can view any conversation for safeguarding (logged in the audit), and any member can report a message.
  - Cover and shift threads are created and kept in sync by the cover and rota code through a helper in a new `lib/threads.mjs`.
  - New messages notify members via `notify` (kind `message`, push, deduped per thread).
- AI helper: reuse `venueRequests.create` (`modules/ops.mjs:849`), extended so the AI tool can return a recurring pattern. In Messages it pre-fills the + Request cover form instead of creating an Ops card directly. The existing Ops path stays for the Ops chat.
- **Late-staff and cover messages through Messages:**
  - A system sender "Orb Ops" (`users` row flagged `system`, never able to sign in) is added.
  - `lib/threads.mjs` `opsMessage(officerUserId, {body, quick:[...], ref})` posts into the officer's Orb Ops conversation, sends a push, and stores quick-reply buttons in `messages.attachments` as `{type:'quick'}`.
  - Chase (`ops.mjs` chase/escalate), cover offers (`proposeCover` approval → offers) and "stood down" notices call it.
  - Quick replies call the existing `ops.reply` / offer-respond actions (`ops.mjs:776`, `:806`).
  - Free-text replies in an Orb Ops thread with an open chase or offer are classified by Haiku (`lib/ai.mjs`) into on_my_way + ETA, cant_make_it + reason, accept, decline or unclear. Unclear replies get a short clarifying answer. Every outcome is logged in Ops activity.
  - On fill: post into the shift thread, the venue's cover/office thread and the late officer's thread.
  - Push still goes out as today. The settings `ops_escalate_minutes` and `ops_offer_wait_minutes` are unchanged.
- `modules/venues.mjs`:
  - `venues.save` becomes MGR;
  - billing and client fields are stripped for non-company users;
  - `saveRate` / `deleteRate` stay CO.
- `modules/documents.mjs` `assertOwner`: security managers in scope can create and delete venue documents.

**Frontend**
- `pages/venue/VenueCover.jsx` RequestForm:
  - One-off/Recurring switch, per-day time rows, frequency, end date or "No end date";
  - Edit and Delete with a scope prompt;
  - "Change waiting for approval" state.
- `pages/manager/Cover.jsx`: series grouping, an approve/decline-change sheet, accept series.
- `pages/messages/Inbox.jsx`, `Thread.jsx` (reusing `ui/Chat.jsx` Composer and bubbles), `NewMessage.jsx`.
  - Nav item "Messages" with an unread badge for every role (officer: in the header or as a tab, replacing nothing core).
  - Venue "Requests" is removed from the nav, and its route redirects to Messages.
  - Polling every 10 s on an open thread and every 30 s for the badge, which is the existing pattern (no MQTT yet).
- `pages/venue/Site.jsx` (new, `/venue/site`): read-only venue details, contacts, security team and documents (download). Nav "My venue".
- `pages/money/Venues.jsx` / `VenueDetail.jsx`: visible to security managers; the rates and billing tabs are hidden for them.
- `layouts/nav.js`, `main.jsx`: routes and nav for all of the above.

## Release 2: Shift calendar, shift page, head doorman, shift log, bans

**Data**
- Insert role `head_door` ("Head doorman", requires SIA, the same accepted licences as door).
- Replace the hard-coded steward checks (`officers.mjs:12`, `rota.mjs:22`) with `roles.requires_sia`.
- `shift_assignments.is_lead` boolean (one per shift, enforced by a partial unique index).
- `shift_logs`:
  - shift_id (unique), status (`open`/`signed`), handover_summary, signed_by, signed_at.
- `shift_log_entries`:
  - id, shift_id, author_officer_id / author_user_id, kind (`note`/`handover`/`incident`/`ban`), body, photos jsonb;
  - state (`kept`/`removed`), curated_by, incident_id, ban_id, created_at.
- `customer_bans`:
  - id, venue_id, name, description, photo_key, reason;
  - starts_on, ends_on (null means permanent), status (`proposed`/`active`/`lapsed`/`revoked`);
  - proposed_by, confirmed_by, source_entry_id, revoked_reason, timestamps.
- **Retention:** ban photos are deleted 90 days after a ban lapses or is revoked (hourly job). This is shown as a note in the UI. Access is limited to the venue scope plus officers rostered there.
- Upload purpose `shiftlog` → folder `shiftlogs`.

**Backend**
- `shifts.detail` (officer: own shifts only; MGR and venue in scope). Returns:
  - the shift, venue (instructions, lat/lng);
  - the team (names, photos, lead; venue users see the existing reduced fields);
  - the previous signed handover at the venue;
  - active bans;
  - log entries (venue: signed and kept only);
  - the thread id.
- `shifts.setLead` (MGR). It warns if the person doesn't hold `head_door`, and notifies the lead.
- `shiftlog.add` (anyone on the shift, between clock-in − 1 h and end + 6 h), `shiftlog.curate` (lead or MGR: keep, remove or edit), `shiftlog.sign` (lead or MGR). Signing notifies the venue contacts and the next shift's team.
- `bans.list` (venue scope; officer: venues rostered within ±30 days), `bans.propose` (on shift), `bans.confirm` / `bans.revoke` (lead on the shift, MGR, venue user), `bans.create` (MGR, venue user).
- An hourly job lapses expired bans and purges photos.
- `incidents.create` accepts `log_entry_id` and links the entry back to the incident.

**Frontend**
- `pages/officer/Shifts.jsx`: new **Calendar** tab (default), with Month/Week views and coloured shift blocks.
  - Built in a new `pages/officer/ShiftCalendar.jsx` with no new dependency, reusing the date helpers that the `manager/Rota.jsx` grids already use.
- `pages/officer/ShiftPage.jsx` (new, `/officer/shifts/:id`): sections in the order decided above.
  - Clock reuses the existing Clock flow (a link or embedded status).
  - Report incident opens `IncidentForm` pre-set to the shift.
  - Toolbox chips for First aid, Law and Situations link to `/officer/learn/toolbox?cat=`.
- Lead-only controls: curate entries, confirm bans, Sign off handover.
- Manager: `manager/Rota.jsx` ShiftDetail gets a "Lead" picker plus Log and Bans tabs. `VenueDetail.jsx` gets a Bans tab.
- Venue: new `pages/venue/ShiftLogs.jsx` (signed logs) and `pages/venue/Bans.jsx` (view and add).
- `people/Settings.jsx` roles list shows Head doorman. Rates are set as for any role.

## Release 3: Training hub, outside certificates, AI compliance
- **Nav:** "Academy" becomes **Training** (`/company/team/training`, with the old route redirected). The tabs reuse the existing pieces:
  - **Staff records:** new; one row per person with courses, scores, certificates and outside training (`academy.officer` plus documents).
  - **Academy results:** existing.
  - **Courses:** existing.
  - **Refreshers due:** new; Academy certificates and outside certificates expiring within 60 days or expired, with Assign refresher or Remind.
- **Outside training:**
  - `documents` gains `title`, `provider`, `issued_on`;
  - kinds `training`, `first_aid` and a new `cctv` are already partly there;
  - the upload sheet is used from Staff records, the staff profile Training tab and the officer's own Documents / Me → Training;
  - managers verify uploads (existing `docs.verify`).
- **Compliance engine** (`modules/compliance.mjs` `officerIssues`):
  - add expiry, missing and unverified checks for every document kind with an expiry;
  - add roles' `required_docs` for the roles the officer holds;
  - add Academy refreshers;
  - severity order: expired > expiring before a rostered shift > expiring within 30 days > within 60 days > missing.
- `compliance.overview` (MGR): one row per issue for the screen.
- **Compliance screen:** `pages/people/Compliance.jsx` under People. Filters: All, Expired, Expiring, Missing. It shows the AI advice and reuses the existing `decideCompliance` actions.
- **Weekly email:** after the weekly run, the company manager gets a branded email (`emailHtml`) with counts and the 10 worst items. It can be switched off in Settings (`ops_jobs.compliance_digest`).
- **Staff profile:** a compliance badge in the header.

## Release 4: One-to-ones, pay-rise agreements, rating schedule

**Data**
- `one_to_ones`: id, officer_id, manager_id, held_on, notes, rating 1–5, shared_with_officer, timestamps.
- `goals`: id, officer_id, one_to_one_id, title, target, due_on, status (`open`/`met`/`missed`/`dropped`).
- `goal_notes` (goal_id, author, body, created_at).
- `pay_agreements`:
  - id, officer_id, one_to_one_id, role, venue_id (null means all), current_rate, new_rate, effective_from;
  - condition_goal_ids[];
  - status (`draft`/`sent`/`signed`/`applied`/`void`), signature fields matching `contracts`, pdf.

**Backend** (`modules/hr.mjs`)
- CRUD for one-to-ones and goals: company plus security within scope.
- `pay.send`, `pay.sign` (officer; reuses the contracts signing and PDF code in `hr.mjs:145-216` and `lib/pdf.mjs`), `pay.void`.
- **Hourly job:** for signed agreements whose `effective_from` has arrived and whose conditional goals are all `met`, insert an `officer_rates` row, set the status to `applied` and notify the officer and managers. If goals are still open, the agreement waits and managers are told.
- **Rating schedule** (`ops.mjs` feedback job): ask only when this is the officer's first clocked shift at the venue, or when there has been no rating for this officer at this venue in the last 30 days.
- `feedback.submitAdhoc`: the venue can rate any officer from the last 7 days at any time.

**Frontend**
- Staff profile, new **One-to-ones** tab: meeting list, a meeting sheet (notes, rating, goals, "Add pay rise"), goal progress notes, agreement status.
  - It shows an "average venue rating since last meeting" hint.
- Officer Me: **My goals** and **Agreements** (read and sign). Reuse `officer/Contract.jsx` patterns.
- Venue: a "Rate staff" button on the venue dashboard and the venue shift log, alongside the existing FeedbackTile.

## Release 5: Saved invoice and pay PDFs, staff pay review, AI-run money workflow, "Ask Orb" assistant
Today, both PDFs are rebuilt every time they're downloaded and saved nowhere (`money.mjs:218`, `:421`). Officers cannot approve or dispute pay. Invoices are built from venue-signed timesheets independently of pay. The Ops chat (`ops.mjs:680`) is read-only, has no money tools, and keeps its history only in the browser.

**Data**
- `pay_runs`:
  - id, period_start, period_end, run_date;
  - status (`draft`/`in_review`/`reconciled`/`approved`/`issued`/`paid`);
  - review_deadline, created_by, created_via (`user`/`ai`), timestamps.
- `statements` gains `pay_run_id` and `review_status` (`pending`/`approved`/`disputed`/`no_response`/`resolved`), plus reviewed_at and `pdf_document_id`.
- `statement_disputes`: id, statement_id, line_id (optional), officer comment, status (`open`/`resolved`), resolution, resolved_by, conversation_id (a Messages thread of kind `pay`).
- `invoices` gains `pay_run_id` (optional) and `pdf_document_id`.
- `documents`: new kinds `invoice` (owner venue) and `pay_statement` (owner officer). These are system-written, cannot be deleted, and are visible to the venue/officer they belong to.
- `assistant_conversations` (user_id, title, page_context, timestamps) and `assistant_messages` (role, content, tool_calls jsonb, pending_action jsonb).

**Backend**
- `lib/pdf.mjs` stays as it is. A new `lib/archive.mjs` `archivePdf({ownerType, ownerId, kind, filename, bytes})` puts the file under `docs/archive/...`, inserts the `documents` row and returns its id.
  - `invoices.issue` and the credit note action call it. `invoices.pdf` serves the saved copy once issued.
  - Statement issue calls it, using the officer name and run date.
- **Pay runs** (`money.mjs`):
  - `pay.generate` now creates a `pay_run` row with its statements.
  - `payRuns.sendForReview` (CO, sets the deadline; notifies officers by push and email).
  - `pay.review` (officer, own statement only): approve, or dispute with a comment and line.
  - `payRuns.resolveDispute` (CO): adjust lines, timesheet or both via existing `timesheets.edit` and line actions, then reply in the thread.
  - `payRuns.finalise` (CO): runs reconcile; blocked while disputes are open; the manager chooses what to do with no-response statements.
  - `payRuns.issue`: saves the PDFs and notifies.
  - **Invoice gate:** `invoices.generate` uses only timesheets that are venue-signed **and** whose statement is approved or resolved in an approved run, and records `pay_run_id`.
  - Job: at 48 h before the deadline, send reminders. At the deadline, mark unanswered statements `no_response` and tell the manager.
- **"Ask Orb"** (a new `modules/assistant.mjs`, replacing `ops.chat`; roles MGR):
  - Uses Sonnet, as now. Each request receives the current page context, e.g. `{page:'invoice', id}`.
  - Conversations are saved on the server and returned by `assistant.list` / `assistant.get`.
  - **Tools:**
    - read-only: shifts, cover candidates, attendance, hours, officers, venues, compliance, pay preview, pay run status, disputes, invoices, messages search;
    - action tools: create pay run, send for review, resolve dispute, finalise, generate invoices, issue invoices, mark paid, rota and cover changes, draft a message.
  - **Confirm model:** action tools never run straight away. They return a `pending_action` card, and the user taps Confirm, which calls `assistant.confirm`. That runs the same backend action under the user's own permissions and logs it in the audit as "via Ask Orb". Money actions need the company role.
  - The old rota and cover proposals keep going to the Ops inbox.
  - Costs are shown in credits only.

**Frontend**
- `pages/money/PayRuns.jsx`, replacing the period list in `Pay.jsx`:
  - a run list with a status timeline: Draft → In review (X approved, Y disputed, Z waiting) → Reconciled → Issued → Paid;
  - a "Send for review" sheet with a deadline picker;
  - a disputes panel that links to each thread.
- `StatementDetail.jsx`: review status, the dispute thread, Resolve.
- Officer `Pay.jsx`: a "Please review" banner and the statement opened with **Approve** / **Dispute** (pick a line and add a comment); saved PDFs are under Documents.
- `InvoiceDetail.jsx` / `VenueDetail.jsx` Documents and venue `Site.jsx` Documents: saved invoice PDFs. Staff profile Documents and officer Documents: saved pay statements.
- `ui/AskOrb.jsx`: a floating button in `layouts/Shell.jsx` for company and security, opening a panel or full screen with history, chat and confirm cards. The chat tab is removed from `OpsAI.jsx`.

**Verify (Release 5)**
- Issue an invoice: the saved file is named `<Venue> — Invoice <no> — <date>.pdf` and appears under venue Documents for both company and venue manager. Reprinting returns the identical saved file.
- Pay run: send for review; one officer approves, one disputes a line, one doesn't answer. Check that the deadline marks "No response", the run cannot be finalised with an open dispute, and resolving and then finalising saves statements to the profile Documents.
- `invoices.generate` skips hours from unapproved runs.
- Ask Orb: "do last week's pay run" leads to drafts, then a confirm card; nothing changes until Confirm is tapped. A security manager without pay permission is refused, and a security manager cannot confirm money steps.

## Already done (verify only)
- Officers can use Everyday (`/officer/everyday`).
- Officers can change their own avatar (officer Profile).
- Check that both are easy to find from the officer Home and Me screens, and add a Me → Everyday link if missing.

## Every release: build, ship, verify
- `cd app && npm run build`; ui-lint must stay at 0. Migrations run automatically on deploy.
- `openkbs fn deploy api`.
- Commit (`feat: …` with bullets and Co-Authored-By), then `openkbs site deploy` (creates the version tag).
- Add demo data for the new features to `scripts/seed-*.mjs`. Restore any demo data changed by tests.
- **API checks** with `/tmp/orb/call.mjs` per role:
  - Release 1: recurring expansion, scope edits (pending vs accepted → approval → shifts change), messages between all role pairs, a venue user blocked from rates.
  - Release 1, late-staff flow: simulate a late officer (shift started, no clock-in), run the chase job and check:
    - an Orb Ops message with quick replies arrives;
    - the free-text reply "running 15 late" records on my way with ETA 15;
    - no reply → escalate → a cover card with nothing sent until approval;
    - approve → candidates are messaged → one accepts → the rota shows them, and the shift thread, venue thread and late officer are all told.
    - Restore demo data afterwards.
  - Release 2: one lead per shift; officers can't read other shifts' logs; venue sees signed logs only; a temporary ban lapses; a non-lead can't curate.
  - Release 3: an outside certificate with a near expiry shows on the Compliance screen and in Refreshers due; digest HTML preview.
  - Release 4: a conditional agreement applies only once goals are met; the rate shows in the pay calculation; the rating prompt appears for the first shift and not again within 30 days.
- **Browser checks** with agent-browser at 390 and 1440 wide, as each affected role: the calendar, shift page, lead sign-off, venue Bans and Shift logs, Messages unread badges, the Training hub and the Compliance screen. Then run `agent-browser close --all` and stop the preview.
- After each release, post a plain-language board comment and keep one board card per release.

## Out of scope (for now)
- Real-time push for messages (polling is used; MQTT can come later).
- Sharing bans across all venues.
- Face matching on ban photos.
- The 11 other Academy courses' full visuals (deferred to Nov 2026).
- Ops AI prompt rebranding.
