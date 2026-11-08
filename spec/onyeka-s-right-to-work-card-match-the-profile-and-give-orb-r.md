# Onyeka's right to work card: match the profile, and give Orb real options

## Context
Onyeka's profile Right to work tile now says **Evidence: Not recorded** (new in v171). Orb's card still says
"Right to work ticked by hand, no check saved" with no buttons. Why they disagree:
- That card was raised 15h ago by the **old** code (before v171), which had no actions and one fixed title.
- The cards only rebuild on the weekly compliance run, or when that officer's documents/shifts change. Nothing has
  touched Onyeka since the deploy, so the card is stale.
- Even the new code only offers "Record their British passport as the evidence", and only when a readable passport is on file.

The user wants Orb's card to offer more, including a grace period. Onyeka can currently work (right to work is
ticked), so the existing Grace period button does nothing for them. Grace only covers people who are blocked.

## Changes

### 1. More actions on the `rtw:no_record` card
In `functions/api/modules/compliance.mjs` around lines 295–306, show these actions, ticked by default where noted:
1. **Record their British/Irish passport as the evidence** (existing, company only, ticked). Shown when a good passport is on file.
2. **Remind {first} to upload their passport or share code**, using `remind(o, 'rtw', 'their passport or right to work share code')`.
   Ticked when there is no passport to record.
3. **Mark "{passport title}" for re-check** (`recheck(d)`). Shown when a passport is on file but Orb couldn't use it
   (unreadable, concerns, or name doesn't fit), so Orb reads it again.
4. **New: "Untick right to work and give them 14 days to send it"** (`rtw_grace`, company only, not ticked by default). It does three things:
   - sets `rtw_verified = false` (keeping `rtw_type`/`rtw_expiry`);
   - opens a 14-day grace period covering `rtw_unverified`, with the reason "From Orb's card: right to work ticked by hand with no evidence";
   - tells the officer to upload their passport or share code.
   The officer keeps working. Orb chases them and the grace closes itself when the documents arrive, using the existing grace job.
   If they're already on a grace period, it extends that one instead (`renewGrace`).

Also in this file:
- Make the card wording match the tile. Title: "Right to work evidence not recorded, no check saved" when `rtw_type` is empty.
  The detail says what each option does.
- `decideCompliance`: handle `rtw_grace`. It is company only, refuses if not active, and runs the untick plus grant in one go,
  so a failed grant doesn't leave them unticked. Add it to `done`.

### 2. Shared grace start
In `functions/api/modules/grace.mjs`, move the body of `'compliance.grace.grant'` into
`export async function grantGrace(officerId, b, user)`, like the existing `renewGrace`. The sheet action and the card action
both call it, so validation, events, audit and telling the officer stay in one place.

### 3. Refresh stale cards after deploy
- In `functions/api/modules/ops.mjs` `docRead` job, change the one-off marker from `'056'` to `'057'`. One full
  `runCompliance()` then runs on the next tick after the deploy, so every open card (Onyeka's included) is rebuilt with
  the new titles and actions. This is the existing pattern; it only updates Orb's own cards.
- Note for the user: **Run check** on Today does the same instantly.

### 4. Card UI
`app/src/pages/manager/OpsAI.jsx` already renders ticked actions and hides `company_only` ones from security managers,
so no change is needed. Add `rtw:no_record` to `GRACE_ISSUE` in `_graceSheet.jsx`? **No**, because that button only works
for blocked officers; the new action covers it.

### 5. Tests, What's new, release
- Tests in `functions/api/test/docAuto.test.mjs` (or the compliance test file that covers `officerIssues`):
  - passport present: record (ticked), remind, untick+grace;
  - no passport: remind (ticked), untick+grace;
  - unusable passport: recheck.
  Run `node --test test/*.test.mjs`.
- `cd app && npm run build`.
- What's new card (date 2026-11-08) "More ways to sort right to work ticked by hand", with picture slug `rtw-hand-ticked`.
- Commit with explicit paths, never the `spec/plan-the-compliance-cards…` folder.
- `openkbs fn deploy api`, then build and `openkbs site deploy`, then commit "build: site with …".
- Check the live index has 6ij75kpgf7 and not hopedp5.

## Verification
- Unit tests above, plus the app build.
- After deploy, Onyeka's card (once the job's full run happens, or Run check) shows the new title and the actions.
  I'll check it with read-only API calls only if allowed; no live data changed by me.
