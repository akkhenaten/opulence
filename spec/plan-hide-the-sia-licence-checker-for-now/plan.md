# Plan: hide the SIA licence checker for now

## Context
The user asked to "disable / hide the licence checker in the app" for now. SIA Checker's API is down (HTTP 522), and the manual register route was unreliable on their phone. The goal is that managers no longer see or get nagged about register checks. Everything stays in the code, the database and the stored key, so we can switch it back on with a one-line change later.

The SIA licence itself is not affected. The number, type and expiry fields, the expiry warnings and the "missing SIA licence" checks stay exactly as they are.

## Approach: one off switch on each side
- **Frontend, `app/src/ui/sia.js`:** add `export const SIA_CHECK_ON = false;`.
- **Backend, `functions/api/lib/sia.mjs`:** add `export const siaCheckOn = () => process.env.SIA_CHECK === 'on';`.
  - It's off unless the environment says so. The tests set `SIA_CHECK=on`, so the existing register tests keep running against the switched-on behaviour.

## What gets hidden or turned off
1. **Profile, `app/src/pages/people/_profileTabs.jsx`:**
   - Hide the register pill (~line 155) and the "Verify SIA licence" button (~161) in the SIA licence tile.
   - Hide the shield "Verify on SIA register" icon on SIA documents (~301) and don't mount `siaSheet`.
2. **Applicants, `app/src/pages/people/_application.jsx:112-113`:** hide `SiaVerifyButton` and `SiaCheckPill`.
3. **Ops AI, `functions/api/modules/compliance.mjs:159-178`:** wrap the `register:sia` and `recheck:sia` cards in `siaCheckOn()`. Existing cards of these kinds then resolve on the next run, the same way any card does when its issue disappears.
4. **Rostering block, `functions/api/modules/officers.mjs:29`:** only block on a recorded not-cleared register status when `siaCheckOn()`. This avoids someone being stuck blocked with no button to clear it. The fresh deployment almost certainly has no recorded checks.
5. **Staff list label, `app/src/pages/people/_parts.jsx:44`:** the "SIA not active" label follows from point 4 automatically, so no change is needed.
6. **API, `functions/api/modules/sia.mjs`:** `sia.details`, `sia.lookup`, `sia.quota` and `sia.record` return `fail(403, 'SIA register checks are switched off')` when off. That way nothing can be recorded or looked up (and no SIA Checker allowance is used) through an old cached app. `sia.history` stays readable.
7. **Help, `functions/api/lib/guide.mjs:195`:** drop the `sia_check` section when off (filter on `siaCheckOn()`).

## Kept as is
- `SiaVerify.jsx`, `siaChecker.mjs`, migration 033 and the `sia_checks` data.
- `SIACHECKER_API_KEY` stays on the server. The .env file is not read or touched.
- To switch the checker back on, set `SIA_CHECK_ON = true` and `SIA_CHECK=on`, then redeploy.

## Verification
- `cd functions/api && npm test`: the 155 tests still pass, plus one new test that `register:sia` and `recheck:sia` don't appear when the switch is off.
- `cd app && npm run build`: ui-lint 67 or below, and vite builds.
- Mock UI (`/tmp/siatest.sh`): the staff profile's Compliance tab and SIA document row show no pill, button or shield. The applicant view has no button.
- Ship:
  1. Commit `chore: hide SIA register checker for now` (ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
  2. `openkbs fn deploy api -s 'rate(5 minutes)'`.
  3. `openkbs site deploy`.
  4. `git push origin master --tags`.
- Check the live site loads. No live data is changed and the ops refresh is not pressed.
