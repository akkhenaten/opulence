# Spec: Billing streams — one venue, separate invoices per budget

## 1. Why
- Some venues pay for security from more than one budget. Example: **New Eidyn** pays for a **Concierge desk** from one pot and for **Site management for contractors** from another. Each pot needs its own invoice.
- Today a venue gets exactly one invoice per billing period, holding every approved shift. The venue then has to split the invoice by hand, or ask Opulence to reissue it. Payment is slower and errors creep in.
- Nothing in the platform today records which budget a shift belongs to. There are no PO numbers or cost codes, and no separate recipient for invoices.

## 2. Decisions (agreed with the user)
| Question | Answer |
|---|---|
| Who is it for? | Any venue, not only New Eidyn. |
| How does work split? | Per shift. Each shift belongs to one stream ("bucket"). Shifts are never split between streams. |
| Where do streams live? | On the venue. Each one is set up once and reused. |
| How is a stream picked? | When a venue manager requests staff, they choose the stream, or add a new one in the same form. |
| What differs per stream? | Its own lines, its own PO / cost code, its own invoice recipient(s), its own bill-to name and address, and optionally its own charge rates. |

**Assumed defaults (not answered yet; easy to change on review):**
- A stream a venue manager adds while requesting staff can be used straight away, on the venue's normal rates. Opulence gets a "Needs you" card to check its PO, recipient and rates before its first invoice is issued.
- For shifts Opulence adds directly in the rota, a stream can claim roles (e.g. Concierge → Concierge desk). Any other role goes to the venue's **default stream**. A company manager can change the stream on any shift.
- A shift's stream can change until its invoice is issued. The change moves the line to the other stream's draft. Issued invoices stay locked, and corrections use a credit note as they do today.
- Opulence company managers can create, edit and archive streams on any venue. Venue managers can create streams and pick them on requests, and can see their streams' details, but cannot change rates.

## 3. Who it is for
- **Company managers (Opulence):** set up streams, check new ones, see drafts per stream, and issue each stream's invoice separately.
- **Venue managers / budget holders:** request staff against the right budget, and receive one invoice per budget with the PO already on it.
- **Officers:** no change. Pay is the same whatever the stream.

## 4. Functional requirements

### 4.1 Streams on a venue
- Every venue has at least one stream: the **default stream**, named after the venue. Existing venues get it automatically, so nothing changes for venues that never add another.
- A stream has:
  - **Name** (required, unique within the venue), e.g. "Concierge desk" or "Site management – contractors".
  - **PO / cost code** (optional, free text).
  - **Invoice recipients:** one or more email addresses. These are added to the venue managers who receive invoices today.
  - **Bill-to name and address** (optional). If empty, the invoice falls back to today's bill-to (the client, otherwise the venue).
  - **Roles it claims** (optional). These set the default stream for rota shifts.
  - **Own charge rates** (optional, per role). These take priority over the venue's rates. Night, weekend and bank-holiday uplifts and minimum hours work the same way as venue rates.
  - **Status:** active or archived. An archived stream can't be picked for new shifts. Its existing shifts and invoices are untouched.
- The default stream can't be archived. A different stream can be made the default.
- Streams are managed on the venue's page, in a new "Billing streams" section. The company portal shows it on every venue. The venue portal shows it for the manager's own venue.

### 4.2 Choosing the stream
- **Staff request (venue portal):** at venues with two or more streams, the request form has a required "Bill to stream" picker. "+ New stream" opens a small form (name, PO, recipient email) without leaving the request. At venues with a single stream the picker is hidden.
- **Accepting a request:** the shifts it creates carry the request's stream.
- **Rota (company portal):** new shifts take the stream that claims their role, otherwise the venue default. The shift editor shows the stream and lets you change it. Repeated or copied shifts keep their stream.
- The stream is shown as a small chip on the shift in the rota, the shift card, the timesheets table and the venue's requests list. Officers never see it.

### 4.3 Invoices
- The draft-invoice feed works per **venue + stream + period**. The period rules (invoice cycle, late lines, holding back unsigned lines) are unchanged and apply within each stream.
- Each stream's invoice shows:
  - its bill-to name and address,
  - "PO / Ref: …" when one is set,
  - the venue and the stream name in the header.
- Line charge rates come from the stream's own rate if one is set. Otherwise the venue rate applies, as today.
- Invoice numbers keep the one company-wide sequence. The stream is not part of the number.
- Issuing an invoice emails the stream's recipients as well as the venue managers. Issue many issues each stream's draft separately.
- Credit notes inherit the stream of the invoice they credit.
- **Invoices list:** a Stream column and a stream filter, which appear only when at least one venue has more than one stream. A draft row reads e.g. "New Eidyn · Concierge desk".
- **CSV export:** adds Stream and PO columns.
- **Venue portal:** the venue manager sees each stream's issued invoices, labelled with the stream.

### 4.4 Moving a shift between streams
- Changing a shift's stream before its invoice is issued moves its line to the matching draft for the new stream, and re-prices it at that stream's rate. The change is recorded in the audit log.
- Once the line is on an issued invoice, the stream can't be changed. The editor says "Invoiced on INV-… — raise a credit note to move it".

### 4.5 New-stream check
- When a venue manager creates a stream, a "Needs you" card goes to company managers: "New Eidyn added a billing stream 'X' — check PO, recipient and rates".
- Until a company manager confirms the stream, its drafts show "Stream not yet checked" and its invoice can't be issued. Lines still collect on the draft as normal.

### 4.6 What's new
- A showcase card in Audit → What's new: "One venue, separate invoices per budget", with its own AI picture.

## 5. User stories
- As New Eidyn's manager, I request two concierge officers against "Concierge desk" and one supervisor against "Site management – contractors". At the end of the week I receive two invoices, each with its own PO.
- As an Opulence manager, I add a concierge shift at New Eidyn in the rota. It lands on the Concierge desk stream without my choosing it.
- As an Opulence manager, I notice a shift was booked to the wrong budget. I change its stream, and the line moves to the other draft at the right rate.
- As the accounts contact for contractor management, I receive only my stream's invoices by email.
- As a venue with one budget, I notice no change at all.

## 6. Acceptance criteria
- Every existing venue has one default stream after go-live. Every existing draft, issued invoice and shift belongs to it. Totals and numbers are unchanged.
- A venue with two streams and approved shifts in both, within one period, has two separate draft invoices. Issuing one leaves the other a draft.
- The PDF of each stream's invoice shows its own bill-to, PO and stream name. The CSV export includes Stream and PO.
- Issuing emails the stream recipients plus the venue managers, with no duplicate sends.
- A stream rate overrides the venue rate for that stream's shifts only.
- Changing the stream on an approved but uninvoiced shift moves its line between drafts on the next feed sync. On an invoiced shift the change is refused.
- A stream created by a venue manager blocks issuing until a company manager confirms it, and raises one "Needs you" card.
- The stream picker is hidden at venues with only one stream. Officers never see streams.
- Archived streams can't be picked, but their history stays visible.

## 7. Constraints
- Builds on the existing live invoice feed (approved timesheets fill drafts). The rules for signed versus awaiting lines, late lines, holding back and locking stay as they are.
- One invoice number sequence. VAT and payment terms are per company, as today.
- Pay runs and officer statements are not split by stream.

## 8. Out of scope
- Splitting a single shift's cost across streams by percentage.
- A different VAT rate or payment terms per stream.
- Separate client companies or legal entities per stream, beyond a bill-to name and address.
- Accounting integrations (Xero, Sage etc.) and attaching the invoice PDF to the email.
- Budget caps or spend alerts per stream (possible follow-up).
