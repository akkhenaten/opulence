# Spec: Contracts module — contract knowledge packs, AI drafting workspace, uploaded contracts and outside signers

## Context
Today **Staff contracts** can send in-app templates (contracts, policies, pay rises) for e-signature. The PDF is branded and sealed, with a certificate, a verify page, a company countersignature and reminders. The rest is thin:
- There is one hand-written "Self-Employed Contractor Agreement", and the app assumes every officer is self-employed.
- Nothing helps a manager pick the right kind of agreement, ask the right questions, or avoid wording that contradicts how the person really works.
- A ready-made contract (a solicitor's PDF, an existing Word file) can't be sent for signature. It can only be filed as a plain document.
- Only staff with an account can sign. Labour providers, subcontractors and agencies can't.
- Nothing records whether wording was researched, approved by the company, or checked by a lawyer.

This spec turns Staff contracts into a full contracts module with two routes to a signed contract:
1. **Upload a ready-made contract.** Assign it to a staff member or an outside party, they sign it, and the sealed copy is stored on their profile.
2. **Create with AI.** The manager answers a guided questionnaire for the right contract pack. The draft is built from a controlled clause library, with an AI assistant and a live PDF side by side.

Both routes end in the existing signing flow, sealing, certificate and registers.

**Decisions made with the user**
| Topic | Decision |
|---|---|
| Packs | All 8: permanent, fixed-term, casual/zero-hours, self-employed individual, personal service company, labour provider, security subcontract, agency-worker pack. Plus the shared security clause library. |
| Jurisdictions | England & Wales, Scotland and Northern Ireland, all researched and drafted in this build |
| Wording | Researched and drafted by AI during the build from identified sources, stored as **Research-based draft**, never presented as professionally approved |
| Outside signers | Sign through a secure email link, with no account |
| Uploads | PDF pages stay untouched; a signature page and the certificate are appended. Optional AI check. |
| Legal review | A company manager records it: reviewer, firm, date, scope, jurisdiction and an optional review letter |
| Workspace | Guide + clauses + AI chat on the left, live PDF on the right, review checklist under the PDF |
| Engagement type | Recorded on the profile only; pay and tax handling are unchanged |

## Goals
1. A manager can produce the right type of agreement for any working arrangement the company uses, in any UK jurisdiction, without inventing terms.
2. Every clause has a stable identity, a version, a content state, its sources and applicability rules, so it is always clear what wording went into which signed contract.
3. The AI helps but never decides. It asks, explains, proposes and flags. Values come only from confirmed answers or visible placeholders.
4. Ready-made contracts are sent, signed, sealed and filed just like in-app ones.
5. Business agreements are signed by the other company inside the app.

## Concepts

### Content states (clause versions, and template versions built from them)
| State | Meaning | Who sets it |
|---|---|---|
| **Research-based draft** | Prepared from identified sources. No professional approval recorded. | The seeded library, the AI, and any edited wording |
| **Company-approved** | Accepted by a named company manager for use by this company | A company manager, in the library or at send time |
| **Legally reviewed** | A named reviewer approved this exact version for a recorded scope and jurisdiction | A company manager records the reviewer's name, firm, date, scope (packs/clauses), jurisdiction and an optional letter |

- A state belongs to one clause version. Any wording change makes a new version that starts as a Research-based draft.
- A legal review is never inferred from an upload, a signature, a government source or a company approval.
- The badge shows everywhere the clause appears: library, workspace, clause manifest. Draft and preview PDFs carry "DRAFT – PENDING LEGAL REVIEW" while any clause used is not legally reviewed. The sealed, signed PDF carries no claim about legal review either way.

### Contract packs
There is one pack per family, and each pack has a variant per jurisdiction (E&W, Scotland, NI). Each pack holds:
- **Questionnaire:** ordered questions with answer types (text, date, money, number, choice, yes/no, person, venue). Each answer becomes a named variable.
- **Required sections**, in order. A section can't be left empty.
- **Controlled clauses:** stable IDs such as `EMP.HOURS.GUARANTEED`, with approved alternatives (for example `EMP.NOTICE.STATUTORY` / `EMP.NOTICE.ENHANCED`).
- **Variables:** named, typed and shared, such as `{{pay.rate}}`, `{{hours.guaranteed}}` or `{{term.end_date}}`. Changing a value updates every reference.
- **Conditional clauses:** selection rules on answers, for example "include `VEH.COMPANY_VEHICLE` when `benefits.vehicle = yes`".
- **Validation rules:** contradictions and missing information. They produce review findings with a severity of **Blocker**, **Needs review** or **Note**.
- **Law items:** source URL, title, jurisdiction, effective date and status (**In force** / **Announced** / **Not yet commenced**). Clauses and rules link to them.

The 8 packs and their sections, conditional clauses and drafting rules are the ones in the brief (B–I), which this module ships as content. The shared security clause library (J) is reusable across packs.

**Drafting rules the module enforces:**
| Rule | Enforced as |
|---|---|
| Full-time and part-time are one permanent pack with different particulars; zero-hours is not a status | Questionnaire structure: status, hours and duration are separate questions |
| Employment status and tax status are assessed separately; labels, invoices or a limited company don't settle status | A status assessment step in the D, E and F packs |
| Never invent pay, hours, insurance limits, notice or benefits | Unanswered variables print as visible placeholders and are listed as outstanding; the AI can't fill them |
| Don't add a power to cut guaranteed hours because work is at a client site | Validation rule (Blocker) |
| Fixed term: don't say expiry removes statutory rights; flag repeated renewals and vague end events | Controlled wording plus Needs-review rules (third renewal; end event without a date) |
| Zero-hours: no "unrestricted availability" alongside zero guaranteed hours; check exclusivity | Blocker rules |
| Self-employed / PSC: no invented substitution or independence wording against contrary practice | Assessment answers drive the clause choice; a contradiction is a Blocker |
| Labour supply: charge rate is separate from the operative's wage; contracts don't remove the receiver's own duties | Separate variables; controlled wording |
| Subcontract: check the SIA ACS rules for subcontracting; don't apply them to labour supply | Pack-specific rule linked to the SIA source |
| Agency: work out the company's role first; no direct employment contract just because the person is on the roster; track assignment weeks for the qualifying period | Role question first; assignment history on the profile |
| No blanket security exemption from rest rules; rolled-up holiday pay only where the arrangement allows it; check uniform costs and deductions against minimum wage | Rules in the shared library |
| Announced but not yet commenced law (e.g. guaranteed-hours and shift-notice reforms) | Shown as a Note with its expected date; never written in as current law |

### Status assessment (packs D, E, F)
- The assessment asks about personal service, real substitution, control, financial risk, equipment, other clients and mutual obligations, based on what actually happens in practice.
- It records two separate outcomes:
  - **employment-rights status:** employee, worker, self-employed or unresolved
  - **tax status:** employed, self-employed, off-payroll (PSC) or unresolved.
- The record also holds the reasons and who is responsible for the assessment.
- If an outcome is unresolved, or the answers contradict the chosen pack, the draft gets a Blocker. It can only be sent once a manager records an outcome and a reason.
- Reassessment triggers, such as a role, hours or site change on the profile, raise a Note on the person's current contract.

### Engagement type on the profile
- The staff profile shows the **engagement type** from the latest signed contract: employee, worker, self-employed, PSC, or agency worker (with the agency named). It also shows the contract's start and end dates.
- This is recorded only. Pay statements, tax and NI handling are unchanged.

## Functional requirements

### 1. Contract library (Settings → Contract library, company managers)
- **Browse by pack and jurisdiction.** Each pack shows sections, clauses, alternatives, variables, rules and law items. Each clause shows its wording, content-state badge, version history, sources and the packs that use it.
- **Approve:** a manager marks a clause version, or a whole pack variant, Company-approved. Their name and the date are recorded.
- **Record legal review:** pick a scope (selected clauses or whole pack variants) and a jurisdiction. Enter the reviewer's name, firm, date and notes, and attach a letter if there is one. The exact versions in scope become Legally reviewed.
- **Company wording:**
  - A manager can add a company alternative to a clause, or edit a copy. It is stored as a **bespoke** version (Research-based draft) under the same clause ID.
  - The seeded wording is never overwritten. Seeded content updates from Orb arrive as new versions, and companies choose whether to adopt them.
- **Law items list:** each item shows its source, effective date and status. Items with an effective date in the next 90 days are highlighted.
- **Existing templates:** Settings → Templates keeps working. Existing templates appear as "Company templates (not from a pack)" and can still be sent.

### 2. Create with AI (the split-screen workspace)
**Start sheet:**
- Party: a staff member, an applicant, or an **outside organisation** (business name, company number, address, signatory name, title and email).
- Pack, with a helper: "Not sure? Answer 3 questions" suggests the pack.
- Jurisdiction (defaults from the venue/company address) and effective date.

**Workspace (1024px and wider)**

Left panel, three tabs:
1. **Guide.** The questionnaire, one section at a time, with answered/total for each section. Answers prefill from the profile, venue and settings (name, address, role, rate, start date, licence). Prefilled values are marked as such and must be confirmed.
2. **Clauses.** The clause manifest in document order. For each clause:
   - its ID, version and content-state badge
   - the alternatives to choose from
   - an on/off switch for conditional clauses, with the rule that set it
   - **Edit wording**, which turns the clause into bespoke wording for this document and flags it.
3. **Ask AI.** A chat that knows the pack, the answers and the clause library. It can:
   - explain any clause in plain English
   - suggest which alternative fits
   - propose a change ("make notice 4 weeks", "add a company vehicle clause"), always as a card that shows the diff with **Apply** / **Dismiss**
   - draft a bespoke clause only when no library clause fits. That clause is labelled bespoke, Research-based draft.
   
   The AI never fills an unanswered value. It asks the question instead, or inserts a placeholder. It never states that wording is legally reviewed.

Right panel:
- **Top:** the live PDF in the existing branded layout, refreshed about 600 ms after a change, with the "DRAFT – PENDING LEGAL REVIEW" watermark.
- **Below the PDF: the review checklist.** It is grouped as Blockers, Needs review and Notes, and covers:
  - outstanding information
  - conflicts
  - bespoke wording
  - unresolved assessments
  - clauses that aren't approved
  - announced law changes.
  
  Clicking an item jumps to the question or clause it is about.

**Phones:** tabs for Guide / Clauses / Ask AI / Preview / Review.

**Saving:** drafts are saved automatically and listed in Staff contracts → Drafts. They can be reopened, duplicated or deleted.

**Ready to send** needs:
- no Blockers
- every Needs-review item acknowledged, with an optional note
- every clause used at least Company-approved. The manager can approve the remaining clauses in one step ("I approve this wording for use by {company}"), and their name is recorded.

Sending then uses the existing send steps: signatory → preview the exact PDF → send.

### 3. Outputs of every drafted contract (the "contract file")
Every drafted contract gets a contract file with these tabs, downloadable as one PDF bundle:
1. **Agreement.** The branded PDF. The confirmed particulars print as **Schedule 1 — Key particulars**.
2. **Particulars summary.** Every variable and its value, marked confirmed or placeholder.
3. **Clause manifest.** Each clause's ID, version, content state, and whether it was standard, an alternative or bespoke.
4. **Outstanding information.** Every open placeholder. Nothing is ever invented to fill one.
5. **Review findings.** Conflicts, bespoke wording, unresolved assessments and acknowledged items, with who acknowledged them.
6. **Change comparison.** Only for variations and replacements: a clause-by-clause and value-by-value comparison against the signed original.
7. **Supporting documents.** Two lists:
   - **"Forming part of this agreement"** also prints inside the agreement.
   - **"Non-contractual reference"** covers policies, the handbook and privacy notice. Each item links to the policy template or uploaded file.

The sealed contract stores its manifest and particulars, so the file can always show exactly what was signed.

### 4. Variations and replacements
- A signed contract is never edited. **"Amend"** on a signed contract opens the workspace with the original answers and gives two choices:
  - a **Variation letter**, a short document listing only the changes, signed by both sides
  - a **Replacement contract**, which supersedes the original once it is signed.
- In both cases the change comparison is generated, and the original stays in the profile as Signed. A replacement marks it Superseded once the new one is signed.
- Fixed-term contracts get **"Extend"**, which is a variation with a new end date. The renewal count shows on the profile.

### 5. Upload a ready-made contract
Staff contracts → **Upload contract** works in four steps:
1. **File:**
   - **PDF:** the pages are kept exactly as they are.
   - **Word (.docx):** the text, headings, lists and tables are converted into the branded layout. The manager must check the preview, because layout can differ from the original.
2. **Who and what:**
   - the party (staff member, applicant or outside organisation)
   - the title
   - the contract type, optional, which sets the engagement type and the checklist for the AI check
   - the jurisdiction and start date.
3. **Optional AI check:**
   - pulls out key particulars (parties, pay, hours, notice, term, holiday)
   - lists gaps and conflicts against that pack's required sections and rules, with the same severities
   - never changes the file
   - the result is saved with the document, so the manager can read it.
4. **Signatory → preview → send.** The preview shows the uploaded pages, then an appended **signature page** (the existing two-box section, with the reference and the document title) and the **signing certificate**.
- Every uploaded page gets a small footer stamp with the reference and "Page x of y". The page content itself isn't touched.
- The fingerprint covers the whole sealed file.

**More options**
- **Already signed on paper:** file a signed contract straight onto the profile, with status "Signed outside the app". There is no certificate, but the type, dates and engagement type are recorded.
- **Save as reusable:** keep an uploaded PDF as an "uploaded template" to send to other people (no placeholders). It has the same content states, so a manager can record a legal review of it.

Uploaded contracts have the same register statuses, reminders, void rules and sealing as the existing in-app contracts.

### 6. Outside signers (business agreements, and any contract for a non-account person)
- The recipient gets an email with a single-use link. It is valid for 14 days and can be re-issued with **Resend link**.
- The link opens the existing Read → Sign → Done flow, without logging in. The typed name is checked against the recorded signatory name.
- The certificate records email delivery, the link opening, IP and device. It labels the signer "Outside signatory — {organisation}".
- After signing, they can download the sealed PDF from the same link for 30 days. The company keeps it under **Contracts → Organisations → {organisation}**.
- Applicants without an account use the same link flow. Once they become officers, their contract moves to their profile.
- This depends on the project's outbound email being verified. The send sheet explains this when email isn't available.

### 7. Registers and profile
- **Staff contracts** has tabs: **All**, **Drafts**, **Awaiting signature**, **Signed**, **Organisations**, **Policies**. Filters: pack, jurisdiction, engagement type and content state.
- **Profile → Contracts** shows:
  - the current contract with its engagement type, start and end dates and next action (Extend, Amend)
  - history, including variations
  - for agency workers, assignment weeks and the qualifying-period date.
- Fixed-term contracts ending within 30 days, and law items about to take effect that touch signed contracts, appear on the dashboard and in the weekly compliance email.

### 8. AI usage and cost
- AI calls are charged to a new **"Contracts AI"** module in Ops AI → Credits by feature, with an optional cap. This covers chat, proposals, bespoke drafting and the upload check.
- When the cap is reached, the workspace keeps working without the AI tab. Drafting from the library needs no AI.

## User stories
- As a **company manager**, I hire a part-time officer on 16 guaranteed hours in Glasgow. The Scottish permanent pack asks only what it needs, prefills the officer's details, and I watch the PDF build as I answer.
- As a **company manager**, I ask the AI to "add a company van clause". It shows me the library clause and asks which vehicle and who pays fuel, instead of guessing.
- As a **company manager**, I upload our solicitor's subcontract PDF, run the AI check, and send it to the subcontractor's director by email. They sign on their phone without an account.
- As a **company manager**, I record that Smith & Co reviewed our E&W zero-hours pack on 10 Nov, and every clause in it shows "Legally reviewed".
- As an **officer**, I sign my fixed-term extension on my phone, and my profile shows the new end date.
- As an **auditor**, I open any signed contract's file and see exactly which clause versions were used and whether they were legally reviewed.

## Acceptance criteria
- **Seeded content:** all 8 packs are seeded for E&W, Scotland and NI. Each has its questionnaire, required sections, controlled clauses with alternatives, variables, conditional rules, validation rules, and law items with sources and effective dates. All seeded content is Research-based draft.
- **Unanswered values:** an unanswered variable prints as a visible placeholder and is listed as outstanding. No pay, hours, notice, insurance limit or benefit appears unless a manager entered or confirmed it.
- **Variables:** changing a variable updates every place it appears in the PDF.
- **Blocking rules:** each rule fires on a test case and blocks sending:
  - a zero-hours draft that also requires unrestricted availability
  - a self-employed draft whose assessment shows the person can't send a substitute in practice, while the wording claims a substitution right
  - a power to cut guaranteed hours because work is at a client site.
- **Announced law:** law that is announced but not in force shows as a Note with its expected date, never as current wording.
- **Approval to send:** a contract can't be sent while any clause used is only a Research-based draft, until a manager approves it. Their name and the date are recorded on the clause version.
- **Legal review records:** recording a legal review changes only the exact versions in its scope. Editing the wording afterwards creates a new version that is not reviewed.
- **Draft watermark:** draft and preview PDFs show "DRAFT – PENDING LEGAL REVIEW" while any clause is not legally reviewed. Sealed PDFs carry no legal-review claim.
- **AI chat:** it only changes the draft through Apply cards. It never fills an unanswered value, and never labels anything legally reviewed.
- **Uploaded PDFs:** the original pages are unchanged apart from the footer stamp. The signature page and certificate are appended, the sealed fingerprint verifies on /verify, and the signed copy appears on the person's profile.
- **Outside signers:**
  - a signer can sign through the email link without an account, and the certificate shows the delivery and opening events
  - an expired or already-used link shows a clear message
  - the link never shows any other document.
- **Variations:** amending a signed contract never changes it. A variation or replacement is created with a change comparison. A signed replacement marks the original Superseded.
- **Engagement type:** the profile shows the engagement type from the latest signed contract. Pay statements are unchanged.
- **Contract file:** every drafted contract has all 7 outputs, downloadable as a bundle.
- **Layout:** it works on a 390px phone and on desktop, in both app styles (Classic and Control Room).
- **Audit:** every draft, approve, record-review, send, open, sign, amend, void, link issue and AI-applied change is written to the audit log.

## Constraints
- **Who can do what:**
  - Only company managers manage the library, drafts, approvals, legal-review records, uploads and sending.
  - Officers see only their own contracts.
  - Outside signers see only the one document their link is for.
- **Server-side PDFs:** PDFs are still generated on the server, so the preview, the download and the sealed copy are identical. Uploaded PDFs are only appended to and stamped, never re-rendered.
- **Content updates:** the library content is versioned data, not code. Updating seeded wording later never changes a company's approved versions or a signed contract.
- **Sources:** every seeded clause and rule records its sources (GOV.UK, SIA, ACAS, HMRC, legislation.gov.uk) and the date they were checked.

## Out of scope
- Changing pay, tax or NI handling based on engagement type (record only).
- Drag-and-drop signature fields or initials on uploaded pages.
- Qualified or advanced e-signatures, and identity checks by SMS or OTP.
- Inviting a solicitor into the app to review. Reviews are recorded by a manager.
- Exact page-for-page reproduction of Word files. Users who need that should upload a PDF.
- Orb driving the drafting workspace. Orb can still list contracts and open a draft.
- Claiming any wording is legally approved. The seeded wording is research-based and needs the company's legal review.
