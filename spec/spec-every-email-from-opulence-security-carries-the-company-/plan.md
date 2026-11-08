# Plan: every email from Opulence Security carries the company footer

## Context
Spec (approved): each email from the app gets a full company footer: name, address, phone, email, company number and VAT number, all taken from Settings → Company. This covers the automatic emails (the `emailHtml()` card) and emails that managers send from the built-in mailbox. The "Powered by orbsolutions.co.uk" line stays as it is. No new settings fields are added.

## Findings that shape the plan
- Every automatic email is built by `emailHtml()` in `functions/api/lib/notify.mjs:55-70`. That includes direct `sendRawEmail` callers and `notify(..., email)`. So changing this one function covers all of them, including the compliance digest, which passes its table in as `body`.
- The company details already exist in `settings`: `company_name`, `company_address`, `company_phone`, `company_email`, `company_number` and `vat_number`. They are saved through `settings.mjs`, which already calls `clearBrand()` at lines 60 and 101.
- The brand cache lives in `functions/api/lib/brand.mjs`. `getBrand()` is public, and `getSender()` is kept separate because it holds the company email. The footer needs private fields too, so it gets its own cached getter next to `getSender()`, not inside `getBrand()`.
- Mailbox sends go through `outgoing()` in `functions/api/modules/email.mjs:163-193`. The browser sends `html` as the body and the quoted original already joined together (`app/src/pages/email/Composer.jsx:96`). The footer has to sit between the new text and the quote, so the quote will be sent as its own field.
- The plain-text part of a mailbox email is made from the HTML by `htmlToText(msg.html)` in `lib/mail/mime.mjs:40`, and Microsoft sends HTML only. So the plain-text footer comes for free, as long as the footer HTML turns into text cleanly (block elements, no tables).
- `cleanHtml` keeps `data-*` attributes, so a `data-co-footer` marker can be used to make sure the footer is only added once.

## Changes

### 1. `functions/api/lib/brand.mjs`: company footer data and HTML
- Add `footerOf(s)`, which is pure and easy to test. It returns `{ name, lines: [...] }`:
  - The address is flattened: line breaks become `, `, and repeated commas and spaces are collapsed.
  - One line is `phone · email` and another is `Company no. X · VAT Y`.
  - Blank parts are left out, along with their `·` separator. A line with nothing in it is left out completely.
  - The email only counts if it passes the existing `EMAIL` regex.
- Add a cached `getFooter()`, the same 60 s cache as `getSender()`. It reads `company_name, company_address, company_phone, company_email, company_number, vat_number, logo_url, brand_color`. `clearBrand()` also resets this cache.
- Add `footerHtml(f, { logo = false } = {})`. It returns an HTML block wrapped in `<div data-co-footer ...>`, with inline styles, a small muted font (12px, `#6B7280`) and simple `<div>` lines:
  - a bold name line
  - the email as a `mailto:` link and the phone as a `tel:` link (spaces stripped from the number)
  - all values escaped with `esc()`
  - with `logo: true` (the mailbox version), a top border in the brand colour and the logo at 28px when `logo_url` is set

### 2. `functions/api/lib/notify.mjs`: `emailHtml()`
- Load `getFooter()` together with `getBrand()`.
- Inside the white card, after the button, add a divider (`border-top:1px solid #E5E7EB; margin-top:20px; padding-top:14px`) and then `footerHtml(f)`, without the logo, because the card already shows it at the top.
- The "Powered by orbsolutions.co.uk" block underneath stays exactly as it is.

### 3. Mailbox sends
- **`app/src/pages/email/Composer.jsx:96`:** send `html: body` and `quote: init.quote` as separate fields, not joined together.
- **`functions/api/modules/email.mjs` `outgoing()`:** build `html` as follows:
  - The base is `b.html`, or `textToHtml(b.text)` when there is no HTML.
  - If this is a real send (`!b.draft`) and the base has no `data-co-footer` in it, add `<br>` + `footerHtml(await getFooter(), { logo: true })`.
  - If `b.quote` is set, add `<br>` + the quote.
  - Run `cleanHtml()` over the whole result, as happens today.
  - Older clients that still send body and quote together keep working: the footer just goes at the end.
- Drafts (`b.draft`) get no footer, as the spec says.

### 4. Tests
Add these to `functions/api/test/brand.test.mjs`, in the existing node:test style:
- `footerOf` with every field filled in gives the name plus three lines, in order.
- Blank phone, email, company number and VAT leave just the name and address, with no stray `·`.
- A multi-line address is flattened to a single line.
- An invalid email is left out.
- `footerHtml` escapes `<` and `&`, and contains `data-co-footer`, a `mailto:` link and a `tel:` link.
- With the logo on, the logo appears only when `logo_url` is set.

### 5. Release (house rule: What's new card plus picture)
- **`app/src/pages/people/_whatsnew.jsx`:** a new first card:
  - `month: 'November 2026'`, `date: '2026-11-08'`, `icon: Mail` (already imported)
  - `title: 'Every email now ends with your company details'`, `image: 'email-footer'`
  - The lede and points cover:
    - automatic emails
    - emails sent from the built-in mailbox
    - the details come from Settings → Company
    - blank details are left out
    - drafts get the footer when they are sent
- **`app/scripts/whatsnew-images.mjs`:** add an `'email-footer'` prompt, for example an envelope and a letter on a dark navy desk with a neat gold-ruled footer block at the bottom of the page, no readable text. Then run `node app/scripts/whatsnew-images.mjs email-footer` to make `app/public/whatsnew/email-footer.webp`.

### 6. Build and deploy
- `cd functions/api && npm test`
- `openkbs fn deploy api`
- Build the app, following the repo's usual `build: site …` commit, then `openkbs site deploy`.
- Commits: one `feat:` commit (code, the What's new card and the picture), then the `build:` commit with the rebuilt site, both ending with the Co-Authored-By line.

## Verification
1. `npm test` in `functions/api` passes, including the new footer tests.
2. Render `emailHtml('Test', 'Body', '/x')` locally using a stub settings row, save it to a temp HTML file and view it in agent-browser at 520px and 375px:
   - the footer sits inside the card under the button
   - the Orb line is underneath
   - long addresses wrap
   - then run `agent-browser close --all`
3. After deploy, trigger a password reset to a test address. The email arrives with the company footer.
4. From the built-in mailbox, check that:
   - a new email ends with the logo and the footer, once
   - a reply has the footer above the quoted original
   - a saved draft has no footer
   - the plain-text part of a Gmail-sent email shows the footer lines
