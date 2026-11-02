# Spec: E-signature documents — final PDF design, templates and signing experience

## Context
Companies already send two kinds of documents to sign: **contracts**, made from templates, and **pay-rise agreements**, made from one-to-ones. Today's PDF is a plain run of text. It has these problems:
- no page numbers and no signature boxes
- nobody signs for the company
- no proof page
- it is rebuilt on every download, so a later logo or name change rewrites old "signed" documents
- it says "electronically signed" even when nothing has been signed.

Managers write templates in a raw text box and can't see a preview. Officers sign on one long page.

This spec defines the finished look and flow for every signed document:
- one branded PDF layout
- company countersignature
- a signing certificate
- templates with formatting and live preview
- a new "policy to acknowledge" type
- a step-by-step signing flow for officers.

## Goals
1. Every signed document looks like a professional, branded, legally sound agreement, the same on screen, in the download and in print.
2. Each signed PDF proves itself. A certificate page shows who signed, when, from where, and a fingerprint that anyone can check online.
3. Managers write good templates without help. They get formatting, a placeholder picker and a live PDF preview.
4. Officers can sign comfortably on a phone, and they read the document before signing.
5. Policies and handbooks can be sent for acknowledgement, with versions and optional re-signing.

## Documents covered
| Type | Source | Who signs |
|---|---|---|
| Contract | Template (category "Contract") | Officer + company (saved manager signature) |
| Pay-rise agreement | One-to-one / goals (standard wording, now editable as a built-in template) | Officer + company |
| Policy / handbook (new) | Template (category "Policy") | Officer acknowledges + company |

## The PDF composition (A4, all types)

### Page 1 and the pages that follow
```
┌──────────────────────────────────────────────┐
│ [LOGO]                     CONTRACT           │  header band: logo left; type label (small caps,
│                            Self-Employed …    │  brand colour) and document title right
│ Company Ltd · address · reg no                │  muted 9pt company line
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│  2pt rule in the brand colour
│ Reference ORB-C-2026-0142   Issued 2 Nov 2026 │  key-facts strip (light tint panel):
│ Between  Company Ltd  and  Marcus Reid        │  reference, dates, parties, version
│ Version  v3                                   │
│                                              │
│ 1. Engagement                                 │  numbered clause headings (bold, brand colour
│    1.1 The Contractor agrees …                │  number); body 10.5pt, line height 1.45,
│    1.2 …                                      │  hanging indent for sub-clauses
│ 2. Fees                                       │  a heading never sits alone at the bottom of a page
│    …                                          │
├──────────────────────────────────────────────┤
│ Ref ORB-C-2026-0142 · Initial: __ / __       │  running footer: reference, status word
│ SIGNED · Page 2 of 4      Powered by Orb ◦    │  ("DRAFT – NOT SIGNED" / "SIGNED" / "VOID"), page x of y
└──────────────────────────────────────────────┘
```
- **Unsigned, sent copies:** a faint diagonal "AWAITING SIGNATURE" watermark on every page.
- **Void copies:** a red "VOID" watermark and the void date.
- **Draft previews:** "PREVIEW – SAMPLE DATA".
- A pay-rise agreement adds a two-column **terms panel** before its wording: role, venue, start date, current rate → new rate, and the conditions as a checklist.
- A policy shows "ACKNOWLEDGEMENT" as the type label and ends with the line "I confirm I have read and understood this policy (version N)".

### Signature page section (after the body, kept together on one page)
```
┌───────────── SIGNED FOR THE COMPANY ─┬──────────── SIGNED BY THE OFFICER ───┐
│  [signature image]                   │  [signature image]                   │
│  ───────────────────────────────     │  ───────────────────────────────     │
│  Jane Doe, Operations Manager        │  Marcus Reid                         │
│  2 Nov 2026 09:14 GMT                │  3 Nov 2026 18:02 GMT                │
└──────────────────────────────────────┴──────────────────────────────────────┘
```
- An empty box with a signature line and the label "Awaiting signature" means not signed yet.
- The company box uses the signature of the manager chosen as the company signatory, applied when the document is sent.

### Final page: the signing certificate
```
SIGNING CERTIFICATE                                      [QR]
Reference ORB-C-2026-0142 · Status: Completed           Scan or visit
Document fingerprint  9F2A…C41E (SHA-256)               orb…/verify/ORB-C-2026-0142
Pages 4 · Template "Self-Employed Contractor" v3

SIGNERS
 Jane Doe   Company signatory   jane@…   applied at send
 Marcus Reid Officer             marcus@… signed 3 Nov 18:02 · IP 81.2.x.x · iPhone Safari

TIMELINE
 2 Nov 09:14  Sent by Jane Doe
 2 Nov 09:15  Email delivered to Marcus Reid
 3 Nov 17:55  Opened by Marcus Reid (iPhone Safari, IP 81.2.x.x)
 3 Nov 18:02  Signed by Marcus Reid
 3 Nov 18:02  Document completed and sealed
```
- The certificate is always the last page. It shares the header and footer of the other pages.
- The **verify link / QR** opens a public page. That page shows the reference, status, signer names, completion date and fingerprint. Anyone can upload a PDF there and the page says whether it matches the sealed copy. It never shows the document text.

### Type, colour and language
- Clean sans type for headings and body, with numbers in tabular style. The font must handle accented and non-Latin names; today those characters are dropped.
- The brand colour appears in four places only: the rule, clause numbers, the type label and the certificate headings. Everything else is ink or grey, so documents print well in black and white.
- The "Powered by Orb" credit stays in the footer, unchanged.

## Functional requirements

### Sealing and storage
- At the moment the last signature is made, the PDF is built once and **sealed**: frozen, given a fingerprint and stored.
- Downloads after that always return the sealed copy. Later changes to the logo, colour, name or template never alter it.
- The sealed copy appears in the officer's Documents and in the profile Documents tab on the manager side.
- Unsigned documents are always shown with the "Awaiting signature" watermark. They are never labelled "electronically signed".

### Company signatory
- In Settings, a company manager can **save their own signature**: drawn once, with their name and job title. They can redraw it or remove it.
- Settings has a "Default company signatory" choice. When sending, the manager can pick a different signatory who has a saved signature.
- A document can't be sent until some signatory with a saved signature is chosen. The send sheet explains this and links to set one up.

### Templates (Settings → Templates)
- Templates are grouped by category: **Contracts** and **Policies**, plus the built-in **Pay-rise agreement** wording, which can be edited but not deleted.
- Formatting:
  - `#` for a heading
  - automatic clause numbering (1, 1.1)
  - `**bold**` and bullet lists
  - a page-break marker.
- **Placeholder picker:**
  - officer name, address, UTR, start date, role, venue, rate, company name, company address, today's date, signatory name and signatory title
  - placeholders are inserted at the cursor and shown as chips
  - unknown placeholders are flagged before saving.
- **Live preview:** on wide screens the actual PDF sits beside the editor, using sample data. On phones it is a "Preview" tab. The preview refreshes shortly after typing stops.
- **Versions:**
  - every save that changes the wording makes a new version, and a short version history is listed
  - sent documents keep the version they were sent with.
- **Policies only:** when a new version is saved and people have signed an older one, the manager chooses **"Ask everyone to sign the new version"** or **"Keep existing signatures"**.
  - Re-sign sends the policy to everyone who signed the old version.
  - The old signed copies stay as they were, marked as superseded.

### Sending (manager)
- The send sheet has these steps:
  1. Choose officers. Several can be chosen at once for a policy, or all active officers.
  2. Choose a template.
  3. Fill or confirm placeholder values.
  4. Choose a signatory.
  5. Preview the exact PDF.
  6. Send.
- If a placeholder has no value, the send sheet warns. The document can still be sent, with a blank line in place of the value.
- Registers (Staff contracts, profile tabs) show:
  - status: Awaiting signature, Opened, Signed, Void or Superseded
  - the reference and date sent
  - actions: View, PDF and Void.
- A signed document can no longer be voided. It can only be superseded by a new one.
- A policy register shows how many have signed out of how many were asked (for example, "12 / 15 signed") and lists who hasn't signed yet.

### Signing (officer, phone-first)
1. **Read:** the document is shown as it will print, page by page.
   - A progress bar shows how far they've read.
   - "Continue to sign" unlocks when they reach the end.
   - The company's signature is already visible in its box.
2. **Sign:**
   - full name, typed, and checked loosely against their profile name
   - a large drawing pad with "Clear", where landscape is suggested on small phones
   - the consent toggle: "I agree to sign electronically. My signature, name, time, IP address and device will be recorded."
3. **Done:**
   - a confirmation with the reference
   - "Download signed PDF", which is the sealed copy
   - the document now appears in My documents.
- Opening a document for the first time is recorded as an "Opened" event on the timeline.
- Pay-rise agreements and policies use this same flow. Their signed screens also show the signature, which pay-rise agreements don't show today.

### Reminders
- Unsigned documents get an automatic reminder after 3 days and again after 7 days.
- Managers can also press "Remind" on any unsigned row.

## User stories
- As a **company manager**, I write a contract template with numbered clauses and placeholders and see the real PDF while typing, so what I send is correct first time.
- As a **company manager**, I save my signature once so every contract goes out already signed for the company.
- As a **company manager**, I publish a new version of the uniform policy and ask everyone to sign again, then watch "9 / 15 signed" go up.
- As an **officer**, I read and sign a contract on my phone in under two minutes and immediately download a copy that matches what I read.
- As an **auditor or client**, I scan the QR code on a signed contract and confirm it is genuine and hasn't been changed.

## Acceptance criteria
- Every signed document type has the same PDF structure:
  - a header band
  - a key-facts strip
  - numbered clauses
  - the two-box signature section
  - the certificate page
  - a running footer with the reference and "Page x of y".
- An unsigned PDF shows the "Awaiting signature" watermark and never says "signed". A void PDF shows "VOID".
- After signing, changing the company logo, colour or template does not change the downloaded signed PDF. Its fingerprint stays the same.
- The verify page reports a match for the sealed PDF and a mismatch for an edited copy. It never shows the document text.
- Names with accents and non-Latin letters print correctly.
- A document can't be sent without a company signatory who has a saved signature.
- The template preview matches the PDF that is sent, apart from the sample-data banner.
- Saving a policy with re-sign chosen creates a new document for every earlier signer, and the old copies show as superseded.
- An officer can't press "Continue to sign" before reaching the end of the document.
- The certificate timeline shows Sent, Opened and Signed events with time, IP and device.
- A signed contract can't be voided.
- Existing contracts and pay-rise agreements still open:
  - Ones signed in the past get the new layout and a certificate built from the data that was recorded then. The "Opened" event and the company signature are omitted, and the certificate says the document was "signed before certificates were introduced".
  - Each is sealed the first time it is downloaded.
- Layout works on a 390px phone and on desktop, in both app styles (Classic and Control Room). The PDF itself stays light and printable.

## Constraints
- PDFs are generated on the server so that preview, download and sealed copy are identical.
- Signer data recorded: typed name, signature image, time, IP and device. Records follow existing retention rules.
- Every send, open, sign, remind, void, supersede and signatory change is written to the audit log.
- Only company managers manage templates, signatories and sending. Officers see only their own documents.
- The landing page, emails (apart from the reminder emails) and other PDFs (invoices, pay statements) are unchanged.

## Out of scope
- Signing by people outside the company (clients, third parties) and signing orders with more than two parties.
- Identity checks by email or SMS code, and qualified or advanced e-signatures under eIDAS.
- Uploading an existing Word or PDF file to be signed. Templates are written in the app.
- Initials on every page, and signature fields placed by drag-and-drop.
- Multiple languages within one template.
