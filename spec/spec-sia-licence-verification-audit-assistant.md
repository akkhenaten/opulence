# Spec: SIA licence verification & audit assistant

## Context
Managers have to confirm that every officer's SIA licence is valid on the official **SIA Register of Licence Holders**. The SIA has no public API. An automated scrape would break whenever the site changes and is not sanctioned, so the app makes the manual check fast and records it properly instead:
- one click copies the details and opens the register;
- a side panel holds copy buttons and a short result form;
- every check is saved in an audit trail.

What exists today (no new data needs collecting):
- Officer records already hold `first_name`, `last_name` (the surname), `dob`, `sia_number`, `sia_type` and `sia_expiry`.
- Staff have no register check. Applicants have a basic "Check SIA register" link and a "Mark SIA checked" button.
- Expiry reminders, AI reading of badge photos, compliance checks and rota blocking on expiry already exist and stay as they are.
- DOB is already hidden from everyone except Company managers and the officers themselves.

## Who can use it
- **Company managers** and **Security managers** can run a check and save the result.
- **Full DOB on screen:** Company managers and the officer only (unchanged). Security managers see the DOB masked as `••/••/1990`. The DOB copy button still works for them, because the register's name search needs it, and each copy is logged.
- Officers and venue managers never see the button, the check history or anyone else's DOB.

## Where it appears
- A **"Verify SIA licence"** button:
  - on the **SIA licence tile** in the staff profile's Compliance tab;
  - on any **SIA document row** in the Documents tab, next to Open and Verify (the "attachment" view), so a manager can look at the badge photo and the register together;
  - in the **applicant review** in Recruitment, replacing the "Check SIA register" and "Mark SIA checked" buttons.
- **Last checked** line on the SIA tile: "Checked on the register 3 Nov 2026 by Sam K. · Active". It turns amber when a re-check is due.

## The flow
1. The manager presses **Verify SIA licence**.
2. The app strips spaces and dashes from the stored licence number and checks it is exactly 16 digits.
   - If it isn't, the panel opens with a warning ("Licence number on file isn't 16 digits — fix it in Compliance → Edit"). The register still opens, so the manager can search by name.
3. The 16-digit number goes to the clipboard, and a toast says "Licence number copied — paste it into the register".
   - If the browser blocks clipboard access, nothing breaks; the copy buttons are still there.
4. The SIA register opens in a new tab at `https://services.sia.homeoffice.gov.uk/rolh`, the address GOV.UK links to. It is kept in one constant so it's easy to change.
5. At the same time, the **Verification assistant** opens: a side panel on desktop, a bottom sheet on phones.

## Verification assistant
- **Header:** the officer's photo or avatar, full name, and the role and licence type on file.
- **Quick-copy buttons**, each showing a ✓ "Copied" tick for about 1.5 s:
  - `Licence 1234-5678-9012-3456`: copies the 16 digits without dashes.
  - `Surname Smith`
  - `First name John`: the register's name search uses it.
  - `DOB 01/02/1990`: copies DD/MM/YYYY. It is masked on screen for Security managers, as described above.
  - A tip under the buttons: "Search by licence number first. Use surname + first name + DOB if the number isn't found."
- **Result form:**
  - **Status on the register**, required: Active, Expired, Suspended, Revoked, Under investigation, or Not found on register.
  - **Expiry date**, required unless the status is Not found. It is pre-filled with the expiry on file.
  - **Licence sector**: Door Supervision, Security Guarding, CCTV (Public Space Surveillance), Close Protection, Key Holding, or Cash & Valuables in Transit. It is pre-filled from the type on file.
  - **Notes / reference**, optional.
  - Inline warnings while filling in, which don't block saving:
    - "Expiry differs from the profile (12 Mar 2027) — the profile will be updated."
    - "Sector doesn't cover their usual role (Door supervisor)."
- **Actions:**
  - **Confirm & save check** saves the audit entry, updates the officer's licence fields and closes the panel.
  - **Cancel** closes the panel and changes nothing.

## What saving does
- **Adds a row to the check history** (a new table, one row per check): officer (or applicant), who checked, status, expiry, sector, the licence number checked, notes, and the time.
- **Updates the officer record:**
  - `sia_status`: Active, Expired, Suspended, Revoked, Under investigation, Not found, or Pending check.
  - `sia_expiry` and `sia_type` take the register's values, because the register is the source of truth.
  - `sia_last_verified_at` and `sia_last_verified_by`.
  - These changes are also written to the existing audit log, so they show in People → Audit.
- **If the status is not Active**:
  - The officer **can't be put on new shifts**. The rota shows "SIA licence suspended on the register".
  - Their **existing future shifts are flagged** for cover in Ops AI.
  - Ops AI raises an **urgent card**, and Company managers get a notification.
  - A later Active check clears the block automatically.
- **Pending check:** new officers start as Pending check until their first check.
- **Re-check reminders:** a "Register check due" item appears in Compliance and Ops AI when:
  - the officer has never been checked and has a shift coming up;
  - the last check is **more than 90 days old**.
  - It goes away when the check is saved.
- **Check history** is shown on the SIA tile (expand "History"): date, manager, status, expiry, notes. It is newest first and read-only. Rows are never edited or deleted.
- **Applicants:** a check saved during review carries over to the staff profile when the applicant is hired. The officer's `sia_status` and last-checked fields are filled in, and the history row is linked to the new officer.

## Privacy (UK GDPR)
- DOB rules as in "Who can use it". The server also enforces them: Security managers never receive the raw DOB in normal profile data. The copy button gets it from a separate, logged request that only works for a manager running a check.
- History rows don't store the DOB or a screenshot of the register, only what the manager recorded.

## Not included
- Automated lookups or scraping of the SIA site.
- SIA business-account **Watchlists**. The SIA can email you about status changes if you set up a watchlist in your SIA business account. That's worth doing alongside this feature, but it isn't connected to the app.
- Retaking or updating the Help screenshots. A short Help entry will be added.

## Assumptions (questions you didn't answer; easy to change)
- Not-active results block new shifts, flag existing ones and alert managers.
- A re-check is due every 90 days and before a new starter's first shift.
- Applicants use the same assistant.
- "Under investigation" and "Not found on register" are added to the status list, and both count as not cleared to work.

## Acceptance checks
- A Security manager presses Verify, the number is on the clipboard, the register opens, and the panel shows a masked DOB that still copies.
- Saving Suspended blocks a test officer from being rostered, raises an Ops AI card and shows on the SIA tile and in Audit. Saving Active afterwards clears the block.
- A licence number of 15 digits shows the warning, and the panel still works.
- Officers and venue managers can't see the button, the history, or other people's DOB, including through the API.
- After 90 days, or for a new starter with an upcoming shift, a "Register check due" item appears.
