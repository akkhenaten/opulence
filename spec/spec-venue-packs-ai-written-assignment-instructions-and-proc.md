# Spec: Venue packs — AI-written assignment instructions and procedures, read-and-sign before the first shift, with a signing register per venue

## Context
Today each venue has one free-text "Assignment instructions" box. Officers see it on their shift page and on the clock screen. Managers can also upload files to the venue (assignment instructions, risk assessment, site plan), but officers never see those files.

Nothing records that an officer has read and understood how a site works, or the procedures that apply there. Nothing stops an officer who has never been to a venue from starting a shift there.

Company policies can already be signed in the app (drawn signature and typed name, with versions and re-signing), but they are company-wide and not linked to any venue.

The company wants:
- clear, professional site instructions and procedures for every venue, drafted by AI;
- every officer to read, understand and sign them before working a venue for the first time;
- a register per venue proving it, which they can show the client or an auditor.

## Goals
1. Every venue has a published **venue pack**:
   - its **assignment instructions**;
   - the **general procedures** that apply to all venues (or to chosen venues);
   - its **venue-specific procedures**.
2. AI does the heavy lifting of writing them. A manager stays in control of what gets published.
3. An officer can't clock in at a venue until they have a valid signature for its current pack.
4. Each venue has a **signing register** that managers and the client can view and export as evidence.
5. Officers have the venue's instructions and procedures in their shift tools while they work.

## Functional requirements

### 1. Procedures library (Documents → Procedures)
- **What a procedure is:** a titled, formatted document (for example "Fire evacuation", "Search policy", "Lone working", "Incident reporting", "Refusal of entry").
- **Two scopes:**
  - **General:** applies to **all venues**, or to **chosen venues**.
  - **Venue-specific:** belongs to one venue.
  - A general procedure that applies to all venues can be switched off for an individual venue, for example a lone-working procedure at a venue that is always double-staffed.
- **Ways to create one:**
  - from the library (general);
  - from a venue's page (venue-specific);
  - by having AI draft it (see 3);
  - by writing it by hand;
  - from an uploaded client document, which AI turns into our format.
- **Versions:**
  - Editing a published procedure creates a draft. Publishing it creates a new version.
  - At publish, the manager chooses **"Minor wording fix — no re-sign"** or **"Real change — officers must sign again"**.
  - Every past version is kept, and can be seen exactly as it was signed.
- **Status:** draft, published or archived. Archived procedures leave every pack, but remain in the register history.

### 2. Venue page → new "Instructions & procedures" tab
- **Assignment instructions:** a formatted, sectioned document, versioned and published the same way as a procedure.
  - Typical sections: site overview, duties and patrol routes, access and keys, radio and contacts, emergency arrangements, client rules, handover.
  - The existing free-text instructions become the starting draft. Nothing is lost.
- **The pack, as officers will see it:**
  - assignment instructions first;
  - then the general procedures that apply here;
  - then the venue-specific ones.
  - A manager can drag to reorder, add or remove general procedures for this venue, and add venue-specific ones.
- **Status line:**
  - "Published v3 · 12 officers signed · 2 booked officers not signed yet";
  - or "No pack published yet". In that case nothing is blocked, but managers see a prompt to create one.
- **Client suggestions:** suggestions from the client login (see 7) show here for a manager to accept (edit), reply to or dismiss.

### 3. AI drafting
- **Create with AI:** on a venue (assignment instructions plus a suggested set of procedures) or in the library (a single procedure).
- **What the AI writes from (all four sources):**
  1. **Venue details already held:** venue type and name, address, client, the roles booked there, shift times, existing instructions and notes, site documents, and recent incidents at the venue (summarised, no personal details).
  2. **A short questionnaire the AI asks the manager.** Examples: entrances and exits, key holders and alarm codes procedure (never the codes themselves), radio channels, client contacts, fire assembly point, search and refusal policy, first-aid kit and AED location, welfare facilities, lone working.
     - The manager can skip any question. The AI marks anything it couldn't fill as "**[To confirm]**" rather than guessing.
  3. **Uploaded client documents:** the client's site rules, risk assessment and old assignment instructions (PDF, Word, photos). They are read and turned into our format.
  4. **UK security good practice:** SIA standards of behaviour, fire, first aid, incident reporting, use of force, lone working, data protection, emergency response. Used for the standard sections and general procedures.
- **Output:** editable drafts. Nothing is published without a manager pressing **Publish**.
- **Editing help:** the manager can ask the AI to change a draft, for example "make the fire section shorter" or "add the car park patrol".
- **Usage cap:** AI use counts against a new "Venue packs" AI usage cap in Ops AI settings, like the other AI features.
- **Disclaimer:** shown on drafts. "AI-drafted from the information you gave. Check it matches the site and the client's requirements before publishing."

### 4. When an officer must sign
An officer needs a **valid signature** for a venue's current pack before clocking in there.

A signature stops being valid when any of these happens:
- the officer has **never signed** this venue's pack;
- a document in the pack was republished as a **"real change"**, or a new document was added to the pack, since they signed;
- the officer has **not worked a shift at the venue for 6 months**, which acts as a refresher.

A minor wording fix does not make a signature invalid.

### 5. Booking, reminders and the clock-in block
- **Booking is never blocked.** A manager can assign an officer who hasn't signed, and the rota shows a "Venue pack not signed" badge on that assignment.
- **On booking:**
  - The officer gets a notification ("Before your first shift at {venue}, read and sign the venue pack") with a link to it.
  - Reminders go at **the day before** and **2 hours before** the shift if still unsigned.
- **Ahead of the shift:** the officer's shift page shows the pack and a "Read and sign" button.
- **At clock-in:**
  - If the officer hasn't signed, the clock-in screen opens the pack instead. They read and sign there, then continue straight into clock-in.
  - There is **no manager override.**
- **Mid-shift changes:** a pack republished during a shift doesn't interrupt that shift. The new version is required from the officer's next clock-in.
- **Compliance:** "Venue pack not signed" for upcoming booked shifts appears on the Compliance page and in the weekly digest, with **Remind** and **Find cover** actions, like the other compliance items.

### 6. Reading and signing (officer, phone-first)
- **Reading:**
  - The officer opens each document in turn. Each one has to be scrolled to the end, then ticked: **"I have read and understood this"**.
  - Progress is shown, for example "3 of 6 read". The officer can stop and carry on later.
- **Signing:** after the last document, the officer types their full name and **draws their signature**. The signature declaration reads:
  "I have read and understood the assignment instructions and procedures for {venue} and agree to follow them."
- **What each signing records:**
  - the officer;
  - the venue;
  - every document and version in the pack;
  - the time each document was ticked;
  - the signature, the typed name, and the signing date and time;
  - device and network details, as with contracts today.
- **Evidence:** a sealed PDF is created for each signing. It contains the pack exactly as signed, plus a signing certificate. It is filed on the officer's documents and linked from the venue register.
- **Partial re-signing:** after a re-sign change, the officer only needs to re-read the changed or new documents. The others are listed as "already read", and they then sign again.

### 7. Venue register and client access
- **The register,** on the venue's tab with search and filters (current, needs re-sign, expired, never signed but booked). Each row shows:
  - the officer;
  - the pack version signed;
  - the signed date and time;
  - the documents and versions;
  - the status: **Current**, **Needs re-sign** (pack changed), **Refresher due** (6-month gap) or **Not signed (booked)**;
  - a link to the signed PDF.
  - Past signings stay listed under each officer.
- **Export:** the register as a PDF (and CSV) for the client or an auditor.
- **On the officer's profile** (manager view): a "Venue packs" list showing each venue they're booked at or have signed, with status.
- **Client / venue login:**
  - can view the published pack, the register and the signed PDFs for **their venues only**;
  - can **suggest changes** on any document. A suggestion is a comment tied to a document or section, and managers are notified;
  - can't edit or publish.

### 8. Shift tools
While on shift (and before it), the officer's shift tools have a **"Site instructions & procedures"** entry. It shows the current published pack for that venue, readable and searchable, and works on a weak signal once opened. This is in addition to the short instructions already shown on the shift page.

### 9. Orb assistant
Orb can answer questions such as:
- "who hasn't signed the Canary Wharf pack?";
- "which venues have no pack?";
- "what does the fire procedure at X say?".

It can also start an AI draft for a manager to review. Orb can't publish, sign or mark anything as read.

## User stories
- As a **manager**, I create a venue pack in minutes. I answer a few AI questions and upload the client's old instructions, then review and publish.
- As a **manager**, I write a fire procedure once and apply it to all venues, except where I switch it off.
- As a **manager**, when a client changes their search policy, I republish the procedure as a real change. Everyone booked there signs it again before their next shift.
- As an **officer**, when I'm booked somewhere new, I get the pack on my phone straight away. I read it at home and sign it with my finger.
- As an **officer** on shift, I can open the site procedures from my shift tools at any time.
- As a **client**, I can see who has signed our site instructions, download the register for our audit, and suggest a correction.
- As an **auditor**, I can see exactly which version of which document an officer signed, and when.

## Acceptance criteria
1. A manager can draft a venue's assignment instructions with AI from venue details, questionnaire answers, an uploaded PDF and good practice. Gaps appear as "[To confirm]". Nothing reaches officers until it's published.
2. A general procedure applied to all venues appears in every venue's pack, except venues where it's switched off. A venue-specific procedure appears only in its venue's pack.
3. An officer booked at a venue with a published pack who has never signed it:
   - is notified at booking, the day before and 2 hours before;
   - sees the "not signed" badge on the rota.
4. That officer can't complete clock-in until they sign. The clock-in screen leads them through the pack and then continues to clock-in.
5. Signing requires every document to be opened to the end and ticked, plus a typed name and a drawn signature. The register then shows them as Current, with a sealed PDF.
6. **Minor wording fix:** existing signatures stay Current.
7. **Real change:** officers show Needs re-sign. Only the changed documents need reading again before the next clock-in. A shift already in progress isn't affected.
8. An officer whose last shift at the venue was more than 6 months ago shows Refresher due and must sign again before clocking in.
9. A venue with no published pack never blocks clock-in, and shows "No pack published yet" to managers.
10. The client login sees only its own venues' packs, register and PDFs, can add suggestions, and can't edit.
11. The register exports to PDF and CSV.
12. Shift tools show the current pack for the shift's venue.
13. Compliance lists unsigned packs for upcoming shifts, with Remind and Find cover.
14. Existing free-text instructions appear as the starting draft for every venue.

## Constraints
- Phone-first, in both the Classic and Control Room styles. It must work for officers on poor signal.
- The drawn signature, sealed PDF and versioning work like existing contract and policy signing, so evidence is consistent across the app.
- AI is only a drafting aid. A manager must publish. The AI never invents access codes, alarm codes or contact numbers.
- AI usage is capped and logged like the other AI features.
- Signed records and old versions are never deleted when a document changes or is archived.

## Out of scope (this version)
- Quizzes or tests on the pack, and confirming signatures on the registered phone.
- Different packs per role at the same venue: everyone booked at the venue gets the whole pack.
- The client formally approving a pack before it goes live (clients suggest changes only).
- Translating packs into other languages.
- Blocking the booking itself, or a manager "briefed in person" override.
- Changes to company-wide policy signing, which stays as it is today.
