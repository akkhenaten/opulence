# Spec: every email from Opulence Security carries the company footer

## Context
Opulence Security sends a lot of email: invites, password resets, shift offers and reminders, contracts, payslips, invoices, credit notes, cover requests, compliance digests, and messages that managers write themselves from the built-in mailbox. The automatic emails already use one small branded card: logo, title, paragraph, button and "Powered by orbsolutions.co.uk". That card says nothing about who the company actually is. Manager-written mailbox emails go out with no branding at all.

**Goal:** every email anyone receives from Opulence Security looks like it comes from the same company. Each one ends with a full company footer, so recipients can see the company's name, address, phone, email and registration details.

## Decisions made
- **Scope:** all emails. This means the automatic emails, plus emails managers write and send from the built-in mailbox (Gmail or Microsoft).
- **Content:** add a full company footer, built from details the company already keeps in **Settings → Company**:
  - company name and address
  - phone and email
  - company number and VAT number
- **No new fields to fill in.** Any blank detail is left out, and so is its separator.
- **"Powered by orbsolutions.co.uk"** stays as it is, below the new footer.
- Colours, layout and button stay the same, and the logo and brand colour still come from Settings. This change is only the footer, plus making the mailbox emails consistent.

## What changes

### 1. Automatic emails
These cover every email sent through the app's own mail service. Directly sent ones (invite, password reset, application received or rejected, documents to sign, app feedback, the weekly compliance digest) and everything sent through notifications are all included.
- Below the card's content and button, add a thin divider and then the company footer in small muted text:
  - **{Company name}**
  - {Address, on one line}
  - {Phone} · {Email}, with the email as a `mailto:` link and the phone as a `tel:` link
  - Company no. {number} · VAT {number}
- After that comes the existing "Powered by orbsolutions.co.uk" line, unchanged.
- All of this happens in one place, the shared `emailHtml()` template in `functions/api/lib/notify.mjs`. That way every caller picks it up and no email type is missed. All values are HTML-escaped.
- The company details are read along with the brand and cached for 60 s, like `getBrand()`/`getSender()` in `functions/api/lib/brand.mjs`. Saving Settings clears the cache (`clearBrand()`), so a change shows in the very next email.

### 2. Manager-written mailbox emails (`email.send` in `functions/api/modules/email.mjs`)
- When a manager **sends** an email or reply from a connected mailbox, the same company footer is added below their message. The footer has the company logo (if one is set), the brand-colour divider and the company details.
  - The message is not wrapped in the full card. Card styling would look wrong around a normal conversation or reply thread.
- It is added once per outgoing message, at the bottom of the new text. If the manager's message already contains the footer (for example a resent draft), it is not added a second time.
- Saved drafts don't get the footer. It is added only when the email is actually sent, so a draft that is reopened and edited doesn't pile up footers.
- Plain-text emails get a plain-text version of the same footer.

### 3. Things that stay the same
- Subjects, sender name and reply-to address.
- Which people receive which emails, and when.
- The existing logo and brand colour, the button, and the Orb credit.
- In-app notifications and phone push messages. They get no footer, because the footer is for email only.

## Edge cases
- **No company details filled in:** the footer shows just the company name. The email still works, and no empty lines or stray "·" appear.
- **The address has line breaks:** it is flattened to a single line with commas.
- **The weekly compliance digest's custom table:** it still sits inside the card, with the footer underneath.
- **Long addresses or emails on a phone:** the footer wraps. Its width matches the 520px card.

## Release
Following the house rule, this release adds its own showcase card in **Audit → What's new**, in the same commit, with its own AI picture. The card text: "Every email from us now ends with our company details."

## Verification
1. Fill in Settings → Company (address, phone, email, company number, VAT number). Then trigger an invite and a password reset. Both arrive with the footer, and the Orb line is still underneath.
2. Clear the phone and VAT number. The next email leaves those out with no stray separators.
3. Send a shift offer from the rota, which goes out through `notify` with `email: true`. It has the same footer.
4. From the built-in mailbox, send a new email and then a reply:
   - Both end with the logo and the company footer, each exactly once.
   - Save a draft, reopen it and send it. The footer is still there exactly once.
5. Run the existing function tests, if there are any for notify and email. Then render `emailHtml()` locally and view the HTML in agent-browser, at desktop and phone widths.
