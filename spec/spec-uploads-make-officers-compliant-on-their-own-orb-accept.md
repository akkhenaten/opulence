# Spec: uploads make officers compliant on their own; Orb accepts "S SCANLON"; British passports verify right to work (v158)

## Context
**The problem today.** An officer uploads their SIA card or passport (Documents page, staff set-up link, manager upload). The file lands in Documents, but Compliance still shows them as missing.
- **Why.** The checks only read the officer's profile:
  - SIA licence: `sia_number`, `sia_expiry`, `sia_type`.
  - Right to work: `rtw_verified`, `rtw_expiry`.
- **What Orb does now.** It already reads each scan (`readDocuments`, `functions/api/modules/compliance.mjs:60`). It then only *suggests* changes, which a manager must approve one by one.
- **Orb is too strict on names.** The name rule (`functions/api/lib/names.mjs` `nameMatches`) needs the full first name. So "S SCANLON" on a card for profile "Scott Scanlon" is raised as a discrepancy, even when the licence number and photo clearly belong to him.
- **British passport holders** still need a manager to run "Check right to work" by hand.

**Goal.** Cut out manual steps. When the evidence agrees, the upload alone should turn the officer green. Orb should only raise something when the evidence genuinely disagrees.

## Decisions (made with the user)
1. **SIA card:** apply automatically when everything agrees. No manager step, but every change goes in the audit log.
2. **Name match** is good enough when all of these hold:
   - The surname matches.
   - The first name matches, **or** the first initial matches (S → Scott).
   - There is proof: the licence or document number matches what we hold, **or** the photo on the document matches the profile photo.
   - If only the initial matches and there's no proof, Orb adds a soft note. It is not a discrepancy and doesn't block anything.
3. **British or Irish passport:** right to work is set to verified **automatically** from the upload.
   - The user chose this knowing that the Home Office rules say a copy alone doesn't protect the business (the original must be seen in person, or checked through a certified ID provider).
   - It is labelled clearly so that is visible (see below).
4. **Show the documents:** the SIA licence tile shows the SIA card picture, and the Right to work / ID area shows the passport or ID picture, on the officer's profile.
5. **Extras.** The user didn't pick any explicitly; these defaults follow from "eliminate steps":
   - Re-run the new rules on documents already uploaded (Scott goes green without re-uploading).
   - Close Orb's old name-mismatch cards that now pass.
   - When SIA Checker is switched on, look the licence up on the SIA register automatically after a card is applied. Nothing changes while it's off.

## What happens

### SIA card uploaded (any route: officer Documents, staff set-up link, manager upload)
- Orb reads it as soon as it's uploaded, not on the next background run.
- If **all** of these hold, the profile is updated automatically:
  - The card is readable with no concerns.
  - It isn't expired.
  - The name passes rule 2.
  - The number doesn't conflict with a different number already on the profile.
- **What gets updated:**
  - SIA number, expiry and licence type.
  - The document is marked "Checked by Orb" (verified, by Orb).
  - The compliance issue clears.
- **What gets recorded:**
  - The audit log has "Orb applied the SIA card", with the before and after values.
  - The officer is not notified (nothing for them to do).
- **When something disagrees** (a different number on file, an earlier expiry, a name that fails, a photo that doesn't match, concerns), nothing is applied. Orb raises the card as today, with "Apply" available to the manager.
- **SIA Checker switched on:** after applying, Orb looks the licence up on the SIA register, records the result and alerts managers if it isn't Active (the same result as the manual "Verify SIA licence").

### Passport or ID uploaded
- Orb reads it as soon as it's uploaded and adds these fields to what it reads: nationality, date of birth, and the photo.
- **British or Irish passport, not expired, name passes rule 2, photo matches the profile photo:**
  - Right to work is set to **verified** automatically.
  - Evidence: "British passport" (or "Irish passport").
  - Method: "Orb, from uploaded passport".
  - No follow-up date is needed (no time limit).
  - The onboarding right-to-work task is ticked.
  - The audit log has an entry.
- **The profile labels it**, in the right-to-work "Checked" line: *"Verified by Orb from an uploaded passport, 8 Nov 2026 — original not seen in person"*.
  - It shows a small muted "See original" hint.
  - A manager can still use "Check again" to record an in-person check, which then replaces the label.
- **Any other nationality**, or a passport that fails a check: no automatic change. The existing share-code / GOV.UK flow applies, and Orb says what's needed.
- **Expiry:** an expired British passport is still valid proof of right to work under the rules, but Orb won't auto-verify from one. It raises a card instead.

### Orb's name and photo checks (all document checks)
- Names follow rule 2 everywhere Orb compares a document with the profile:
  - document reads;
  - SIA register check;
  - applicant badge;
  - right-to-work check sheet.
- Capitals, punctuation and middle names are still ignored, as today.
- **New:** Orb compares the photo on an SIA card or passport with the officer's profile photo, using the existing face check (`functions/api/lib/face.mjs`, Gemini).
  - Result is match, unsure, no match or unscored.
  - Unsure or unscored is not proof, but it's not a discrepancy either.
  - No match is a discrepancy.
  - If there's no profile photo, Orb skips the photo comparison, and the number alone is proof.
- Decisions already dismissed stay dismissed (the existing no-repeat rule).

### Existing uploads and cards
- On release, Orb re-runs the new rules on officers' existing SIA, passport and ID uploads. Anything that now passes is applied as above.
- Orb cards whose only issues now pass are closed, with the note "Resolved — passed the new checks".

### Seeing the documents on the profile (managers only)
- **SIA licence tile:** a thumbnail of the latest SIA card upload (front, and back if there is one). Tap it to open full size.
- **Right to work tile:** a thumbnail of the latest passport or ID upload, opening the same way.
- If nothing is uploaded, the thumbnail area doesn't show.
- **Who can see them:**
  - Company managers and the platform admin, as now with documents.
  - Venue logins never see officer documents.
  - The officer sees their own on their Documents page, as today.

### Every attachment and picture opens inside the app (whole app, not just compliance)
**Today.** Photos mostly open in the in-app photo viewer (`app/src/ui/Lightbox.jsx`). Documents and PDFs open in a new browser tab or download:
- `openUrl` in `people/_parts.jsx`;
- `downloadAction` in `api.js`;
- officer Documents;
- email and message attachments;
- the right-to-work "View check";
- contracts;
- invoices and statements.

**After.** One in-app viewer opens everything in place, full screen on phone and as a large panel on desktop, with:
- **Pictures:** swipe between them, pinch or double-tap to zoom (as the Lightbox does now).
- **PDFs:** shown inside the app, scrollable pages, zoom. This works on iPhone and Android too, including the installed app.
- **Several files** (e.g. SIA front and back, a message with 3 attachments): swipe or arrow between them, with "1 of 3" shown.
- **Top bar:** file name, a **Download** button (still available but optional) and Close. Back on a phone and Esc on desktop close it.
- **Other file types** (Word, Excel, etc.): an in-app card with the name, size and Download. They are never opened in a blank tab.

**Applies to:**
- uploaded documents (officer and manager);
- the SIA card and passport thumbnails above;
- the right-to-work check PDF;
- incident photos and attachments;
- message, email and post attachments;
- contracts and signed copies;
- invoices, statements and payslips;
- venue pack files.

**Stays the same:**
- CSV and spreadsheet exports still download, because they're for opening in Excel.
- External sites (GOV.UK check, "Our website") still open a new tab.

**Who can see what is unchanged.** The viewer only shows files the person can already open.

## Out of scope
- Certified digital ID checks (IDSP) and share-code automation for non-British nationals: the existing flow stays.
- Driving licences as right-to-work evidence (they aren't valid evidence).
- Changing the selfie face check at clock-in.

## Edge cases
- **Two uploads of the same kind:** the newest one wins and gets displayed.
- **Orb's monthly AI cap reached:** nothing is auto-applied, and the document stays waiting for the next run.
- **Profile changed by hand after Orb applied it:** the hand change stands. Orb only re-applies when a new file is uploaded.
- **Applicants** (not yet invited): unchanged. Their badge is read by the applicant flow and copied in on invite, now using the new name rule.

## Release
- What's new card, with its own AI picture, in the same commit: "Uploads now make officers compliant on their own".
- Done when Scott Scanlon's existing SIA card and passport turn him green on Compliance without anyone tapping anything.
