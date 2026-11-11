# Plan: email when a signed incident report is complete, and a manager can edit while it waits for the officer to sign again

## Context
These are two follow-ups to the new incident reports (v188/v189):
1. **Email the signed report.** Once the venue signs, the people involved should get an email.
   - The app's email service sends only the message body (`lib/notify.mjs` `sendEmail` posts `{to, subject, html}` with no files). So the PDF can't be attached.
   - The user chose an email with an **Open report** button. People sign in and tap PDF. Nothing sensitive leaves the app.
   - Recipients default to the user's wording, "venue contact and manager": the **venue's contacts** and the **manager who signed**. The recipient question went unanswered.
2. **Manager edits while it's back with the officer.**
   - Today a manager is blocked at stage `officer`, in three places:
     - `lib/incidentSign.mjs` `nextStage` allows `edit` only at stage `manager`;
     - `IncidentForm.jsx` `EditLoader` shows "You can edit it again once they have";
     - `IncidentDetail.jsx` shows no Edit button at that stage.
   - Allow it. Add a version check so an officer and a manager editing at the same moment can't overwrite each other.

## 1. Completion email (`functions/api/modules/incidents.mjs`, `incidents.sign`, venue branch ~line 469)
After `sealIncident`:
- **Venue contacts** (`venueContacts(inc.venue_id)`, including the venue user who just signed, as a receipt):
  - `notify` with `email: true`;
  - title: `Incident report ${ref} is complete`;
  - body: "Signed by the officer, the manager and the venue. The sealed PDF with its signing certificate is filed under your incidents. Open the report and tap PDF to download it.";
  - link: `/venue/incidents/:id`.
- **The manager who signed**: the `user_id` of the live `manager` signature, from `incident_signatures` where `void_at` is null.
  - Same notification with `email: true`, linking to `/company/incidents/:id`. For a security manager, use the link prefix for their role.
- **Everyone else from today's list** (`managersFor` plus the officer) still gets the in-app or push "is complete" message without email. The signing manager is left out of that call, so they aren't notified twice.
- The company footer is added automatically by `emailHtml`. Each `notify` call stays wrapped so a failure doesn't fail signing.

## 2. Manager edits at stage `officer`
- **`lib/incidentSign.mjs` `nextStage`:**
  - A manager's `edit` is allowed at stage `manager` (as now) **and** at stage `officer`.
  - At `officer` it returns `{sign_stage:'officer', status: inc.status, resign_reason:'edited'}`. A sent-back report stays `changes_requested`.
  - `send_back` and `sign` are unchanged.
- **`modules/incidents.mjs` `incidents.update`:**
  - **Version check:** accept an optional `version`. If it is given and differs from `cur.version`, `fail(409, 'This report was changed by someone else while you were editing. Reload to see the latest version.')`.
  - The existing manager path (void signatures, stage `officer`, notify the officer "Your manager edited … check and sign again" with email) is reused as it is.
- **Frontend:**
  - `pages/officer/IncidentForm.jsx` `EditLoader`: remove the `manager && s === 'officer'` block.
  - `pages/shared/IncidentDetail.jsx` action bar: a new branch for a manager at stage `officer`:
    - label: "With the officer to sign" (or "Sent back to the officer");
    - actions: **Edit**, plus PDF as now.
  - `pages/shared/incident/Composer.jsx`:
    - `saveEdit` sends `version: existing.version`.
    - The manager-edit confirmation text says the officer is asked to check the changes and sign. It now also shows at stage `officer`.
    - A 409 shows its message as a toast with a **Reload** action, or the plain toast if the toast can't hold actions.

## 3. Tests (`functions/api/test/incidentSign.test.mjs`)
- A manager's edit at stage `officer` keeps the stage at `officer`, sets `resign_reason` to `edited`, and keeps status `changes_requested` when the report was sent back.
- An officer still can't `edit` through `nextStage`, and a venue user can't edit at any stage.

## 4. Release
- What's new card (2026-11-11, icon `Mail`, image `incident-complete-email`): "Signed incident reports land in your inbox".
  - Points:
    - venue contacts and the signing manager get an email with Open report;
    - managers can edit while the report waits for the officer;
    - two people editing at once are warned instead of overwriting.
- Add the image prompt to `app/scripts/whatsnew-images.mjs` and run `node app/scripts/whatsnew-images.mjs incident-complete-email`.

## Verification
1. `cd functions/api && npm test`: all tests pass, including the new ones.
2. `node -e "import('./index.mjs')"` loads.
3. `openkbs fn deploy api`, then curl `esign.verify` (expecting `{"found":false}`).
4. `cd app && npm run build`: ui-lint ≤70, and the build contains the Opulence API id.
5. Load the sign-in page at 375×812 with agent-browser, then `agent-browser close --all`. Pages behind sign-in can't be checked without a login, so tell the user.
6. Commit `feat:` then `build: site with …`, run `openkbs site deploy`, then `git push origin master`.
