# Plan: the Compliance cards actually refresh after Orb re-reads (v164)

## Context
After v163 the user still sees the same 17 Compliance cards to approve. The cards don't change on their own, for these reasons:

1. **Cards only refresh in a full check.** A full `runCompliance()` (`functions/api/modules/compliance.mjs`) updates or closes cards. It runs **once a week** (`compliance` job, `ops_compliance_dow`, `modules/ops.mjs`), or when a manager presses Refresh in Live operations.
   - The v163 re-read (job `docRead`) saves the new reads. It only refreshes a card when Orb *applies* something (`autoApply` → `runCompliance({ officerIds })`).
   - Every other improvement waits for next week's check and never shows up: a removed "<UNKNOWN>" name card, a partial number, a softer expiry, the "needs a share code" reason.
2. **The read job can run out of time.** The function has a 180 s timeout and the jobs run one after another (`runOpsJobs`). A batch of 12 re-reads, each with up to 2 photo comparisons (12 s timeout each), can take longer than that. When it does, it gets cut off and so do the jobs after it, and the backlog stalls.
3. **17 is the number of people, not issues.** There's one card per officer, and it closes only when *all* their issues are gone. Many of the 17 still have "Right to work not verified" or a share code to check. Those are real gaps Orb can't close (no British/Irish passport, or no photo to confirm), so those cards will shrink but stay.

## Changes
**1. `modules/ops.mjs` `docRead` job:** after reading, refresh the cards of the officers whose files were read.
- `readDocuments` returns the officer ids it read as well (keep the count for the existing callers).
- The return becomes `{ n, officerIds }`. Update the callers: `runCompliance` uses `.n`, and the `docs.read` action in `modules/documents.mjs` ignores the return.
- Then `runCompliance({ officerIds })`. That step already updates or closes cards and frees dedupe keys.
- `autoApply` already refreshes cards for files it applies. Repeating the refresh is harmless: when the sig is unchanged, it's skipped.

**2. A time budget in `readDocuments`** (`modules/compliance.mjs`):
- don't start another file after 75 s;
- the backlog batch drops back to 6, so the read job finishes well inside the 180 s.

**3. A one-off full check when the backlog is done:**
- When `unreadDocCount()` reaches 0 and no full check has run since the re-read started, `docRead` runs a full `runCompliance({ manual: true })` once and logs it (`ops_activity` kind `compliance_reread_done`, so it happens only once).
- This catches anyone whose card depends on more than their own files.

**4. Card text:** none. The card already lists the issues left.

## Verification
- `node --test test/*.test.mjs`. Add an ops test that `docRead` calls `runCompliance` with the ids read, with stubs if `test/ops.test.mjs` has a pattern for that. Otherwise check it by import.
- Import checks: compliance, ops, documents.
- Commit (explicit paths), then `openkbs fn deploy api` from the project root.
- The app is unchanged, so no site deploy is needed and there's no What's new card. **But** the memory rule says every release adds a What's new card. This is a fix to v163, so I'll fold one line into v163's card ("Cards update within minutes as files are re-read") and redeploy the site with it, so the rule holds without a new picture.
- After deploy I can't read live data. I'll tell the user:
  - press **Refresh** in Live operations to run a full check now;
  - from then on, cards update within about 5 minutes of each re-read;
  - which of the 17 should shrink and which will stay, and why.
