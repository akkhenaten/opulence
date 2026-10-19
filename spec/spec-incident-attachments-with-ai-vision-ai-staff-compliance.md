# Spec: Incident attachments with AI vision + AI staff compliance runs

## Context
Two requests:
1. Incident reports should take pictures and other attachments, and the in-app AI should read the images to help write and understand the report.
2. Staff profiles hold SIA licences, right to work and qualifications. The AI should run compliance checks and advise managers.

**What exists today**
- Officers can attach up to 12 photos (images only) when writing a report.
- Managers and venues can view the photos on the report and in the PDF.
- Managers cannot add files.
- There is no AI on incidents.
- The basic compliance rules already block rostering and clock-in: missing or expired SIA licence, right to work not verified or expired, and inactive status.
- Expiry reminders go out at 60, 30, 7 and 0 days.
- Nothing checks:
  - licence type against the role
  - the contents of uploaded documents
  - training certificates
  - shifts already rostered that an upcoming expiry will hit

**Decisions made**
- Photo AI works on both sides: an officer draft and a manager review.
- Attachments are photos plus PDFs and documents.

**Defaults assumed (the user did not answer; change them if needed)**
- The compliance run does all four checks: expiries against rostered shifts, licence type against role, reading document images, and missing training.
- It runs weekly and also on demand. Results go to Ops AI inbox cards, and nothing changes without a manager's approval.

## Goals
- Incident reports carry the evidence: photos, police letters, witness statements and CCTV stills.
- Officers write better, faster reports. The AI drafts from their photos and notes, and the officer stays the author.
- Managers review faster. They get an AI summary of the evidence and flags where the photos and the text don't agree.
- Compliance problems are caught **before** they hit a shift. Each issue arrives with plain-English advice and one-tap fixes.

## Part 1: Incident attachments

### Functional requirements
1. **Accepted types**
   - Photos: JPEG, PNG and HEIC from a phone. Photos are compressed on the device, as today.
   - PDF.
   - Word documents (.docx) and plain text.
   - Up to 20 attachments per report, at most 15 MB each.
   - The server enforces the type, size and count limits as well as the app, with a clear error message.
2. **Who can add**
   - Officers: while writing the report, and afterwards until it is closed. This is unchanged.
   - Company and security managers: at any time from the incident detail screen, including while reviewing.
   - Venue managers: view and download only.
3. **Display**
   - Photos show in a grid with the full-screen viewer, as today.
   - Other files show as a list with name, type, size, who added them and when.
   - Each attachment shows its uploader, so manager-added evidence is clearly marked.
4. **PDF export**
   - Photos are embedded, as today (up to 6).
   - The PDF lists the names of all other attachments.
5. **Removal**
   - The uploader can remove an attachment until the report is closed. Company managers can remove one at any time.
   - Every removal is logged in the report's history.

## Part 2: AI on incident evidence

### A. Officer draft ("Draft with AI")
1. On the officer's report form, after adding photos and typing or dictating rough notes, the officer can tap **Draft with AI**.
2. The AI reads the photos (and any PDFs) together with the notes, shift, venue and time. It suggests:
   - incident type and severity
   - description of what happened
   - location detail
   - people involved, by description and never by identity
   - injuries seen
   - damage
   - actions taken
   - whether police or an ambulance are mentioned
3. Each suggestion appears next to its field. The officer accepts, edits or ignores it, field by field. Nothing is filled in or submitted without the officer's action.
4. **The AI must not invent facts.**
   - Anything taken only from a photo is marked "seen in photo".
   - Where the notes and the photos disagree, the AI asks the officer rather than choosing.
5. The report records that AI drafting was used. Managers see this as an "AI-assisted" tag.

### B. Manager evidence review
1. When a report is submitted, and again when attachments are added, the AI prepares an **evidence summary**. It is visible to company and security managers only, not venues. It contains:
   - a one-line caption for each photo or document, for example "Broken glass by bar 2, timestamped 23:41 on CCTV still"
   - an overall summary of what the evidence shows
   - **mismatches** between the evidence and the written report, for example "Report says no injuries; photo 3 shows a cut on the left hand"
   - **missing information** a manager should ask for, for example "Police attended per letter, but no police reference number recorded"
2. A manager can turn a mismatch or missing item into "Request changes" with the text pre-filled. This uses the existing request-changes flow.
3. The summary can be refreshed by hand. It is never part of the official report or the PDF; the officer's account stays the record.

### Privacy and safety rules (both A and B)
- The AI never identifies people from faces and never guesses names, ethnicity or age beyond a broad description.
- The AI may read visible text: signs, number plates and documents.
- Images are only sent to the AI for this purpose and are not stored anywhere else.
- AI on incidents can be switched on or off in Ops AI settings.
- All usage counts against the existing monthly Ops AI credit cap. When the cap is reached, the buttons explain that the AI is paused and everything else keeps working.

## Part 3: AI compliance run

### Functional requirements
1. **When it runs**
   - Automatically once a week. The day is set in Ops AI settings; the default is Monday morning.
   - From a **Run compliance check** button in Ops AI.
   - Each run is logged in Ops AI activity, for example "Checked 42 officers, 5 need attention".
   - It can be switched on or off like the other Ops AI jobs.
2. **What it checks** (active officers and officers being onboarded)
   1. **Expiries against rostered shifts.**
      - SIA licence, right to work or a required document expires before or during a shift the officer is already rostered on or has accepted. That shift is flagged as at risk.
      - Expiries within the next 60 days with no renewal uploaded are also flagged.
   2. **Licence type against role.**
      - Each role has a list of accepted SIA licence types, editable in Settings → Roles.
      - Defaults:
        - Door Supervisor role accepts a Door Supervisor licence.
        - Security Officer role accepts a Security Guarding or Door Supervisor licence.
        - CCTV role accepts a CCTV (Public Space Surveillance) licence.
        - Close Protection role accepts a Close Protection licence.
        - Steward role needs no licence.
      - The check flags officers who are rostered on, or have the role on their profile for, a role their licence(s) don't cover.
      - An officer can hold more than one licence, taken from their verified SIA documents.
   3. **Reading document images.**
      - For SIA, right-to-work and ID documents that have a photo or scan, the AI reads the name, licence number, licence type and expiry.
      - It compares them with the officer's profile and with the document's recorded details.
      - It flags mismatches, unreadable scans, and documents that look expired, altered or not genuine.
      - Each document is read once. It is re-read only if it is replaced.
   4. **Missing training and documents.**
      - Each role can list required documents, for example first aid for Door Supervisor. These are editable in Settings → Roles, and the default is none.
      - The check flags officers missing a required document, documents uploaded but never verified, and onboarding steps still outstanding.
3. **Output: one Ops AI inbox card per officer who needs attention.** The card shows:
   - severity:
     - **Urgent** means a rostered shift is at risk within 7 days, or a document looks not genuine.
     - **Soon** means an expiry within 30 days or a missing requirement.
     - **Advisory** covers everything else.
   - the list of issues, each with a short plain-English explanation and advice
   - **suggested actions** the manager ticks and approves:
     - **Remind officer**: an in-app message and email asking them to renew or upload a specific document, with a link to their Documents page.
     - **Take off at-risk shifts**: unassign them from the affected shifts. This automatically starts the existing Ops AI cover-finding flow.
     - **Correct profile detail**: apply the value the AI read from the document, for example fix a mistyped licence number or expiry. This is shown as before and after.
     - **Ask a manager to re-check the document**: marks the document unverified and adds a task note.
   - The manager can also **dismiss** an issue with a reason.
4. **No repeat noise**
   - An issue already on an open card is not raised again.
   - A dismissed issue is not raised again unless the underlying data changes, for example a new expiry, a new shift or a new document.
   - When the issue clears, for example the officer uploads a renewed licence, the card closes itself with a note.
5. **Ops AI chat** can answer compliance questions from the latest run, for example "who can't work Saturday?" or "which door staff need first aid?". Any change it proposes still goes through a card.
6. **Scope:** security managers see compliance cards only for the officers they manage. Company managers see everything. Venues never see compliance cards.

## User stories
- As an officer, I photograph the scene, type three lines, tap Draft with AI, and get a full report draft that I check and submit in two minutes.
- As a manager reviewing an incident, I see at a glance that the photos show an injury the officer didn't record, and I send the report back with one tap.
- As a manager, I attach the police letter to an incident after the event.
- As a company manager, on Monday I see that Jordan's SIA licence expires on Friday and he is rostered on Saturday. I approve "Remind officer" and "Take off Saturday", and cover finding starts.
- As a company manager, I learn that an officer rostered as a Door Supervisor only holds a CCTV licence, before they turn up.
- As a company manager, I'm told the licence number typed on a profile doesn't match the uploaded licence photo, and I fix it with one tap.

## Acceptance criteria
1. **Attachments**
   - An officer can attach photos and a PDF to a new report.
   - A manager can add a PDF to a submitted report.
   - A venue manager can view the attachments but has no add button.
   - A 16 MB file, an unsupported type or a 21st attachment is refused with a clear message.
2. **Officer draft**
   - Draft with AI on a report with photos and notes returns field-by-field suggestions.
   - Nothing is applied until the officer accepts it.
   - Photo-only facts are marked "seen in photo".
   - The submitted report shows the "AI-assisted" tag to managers.
3. **Evidence summary**
   - A submitted report with photos shows the summary, with captions, mismatches and missing information, to company and security managers only.
   - A mismatch can pre-fill a change request.
   - Adding an attachment refreshes the summary.
4. **Privacy**
   - The AI never names a person from a photo.
   - With incident AI switched off, or the cap reached, the AI buttons explain why and every non-AI function still works.
5. **Compliance run**
   - Run now produces cards that cover:
     - a seeded officer whose licence expires before a rostered shift (Urgent, shift at risk)
     - an officer with a CCTV-only licence rostered as a Door Supervisor
     - an officer whose licence photo shows a different number from their profile
     - a Door Supervisor without a first-aid document when the role requires it
6. **Card actions**
   - Approving "Take off at-risk shifts" unassigns the officer and a cover card follows.
   - "Remind officer" sends the message.
   - "Correct profile detail" updates the profile and records it in the audit log.
7. **Dedupe and scheduling**
   - Re-running without data changes creates no duplicate cards.
   - Uploading a renewed licence closes the card on the next run.
   - The weekly run fires once on the configured day.
8. **Role settings:** accepted licence types and required documents per role are editable in Settings → Roles. The defaults are as listed above.
9. **Layout and limits**
   - Everything works on a phone (390 px) and on desktop with no overflow.
   - AI usage is shown in credits and respects the monthly cap.

## Constraints
- Reuse the existing pieces:
  - incident attachment storage, the viewer and the PDF
  - the Ops AI inbox, cards, approvals, activity log, settings, schedule and credit cap
  - the existing compliance rules and expiry reminders, which stay unchanged
- Ops AI never changes data on its own. Every compliance action needs a manager's approval. Officer drafts need the officer's acceptance.
- Costs are quoted in credits only. AI usage counts against the Ops AI monthly cap.
- UK SIA licence types and terminology.

## Out of scope
- Live checks against the official SIA public register online, and right-to-work share-code checks with the Home Office.
- AI analysis of video. Video attachments are not supported in this version.
- Face blurring or redaction of photos.
- AI-generated text inside the official report record or the PDF.
- Venue access to AI summaries or compliance information.
- Automatically suspending officers. The app's existing hard blocks on expired licences remain the only automatic enforcement.
