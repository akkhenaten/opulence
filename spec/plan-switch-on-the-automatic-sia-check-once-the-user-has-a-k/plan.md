# Implementation plan: switch on the automatic SIA check

## Context
The automatic check is live in v82 but needs `SIACHECKER_API_KEY` on the server. The user pasted SIA Checker's documentation rather than a key, so they still need to create one at siachecker.co.uk. I can't sign up or pay for them.

I'll add a small, free key test (the quota endpoint) so we can confirm the key works without using a check from the allowance.

## Changes
1. **`functions/api/lib/siaChecker.mjs`**: add `quotaUsage()`.
   - It calls `GET https://api.siachecker.co.uk/v1/quota/usage` with the same Bearer header and `AbortSignal.timeout(8000)`.
   - It returns `{ ok: true, period, used, quota, remaining }`, or `{ ok: false, outcome }` using the existing `mapResult` outcome rules (401 → bad_key, 5xx → unavailable).
2. **`functions/api/modules/sia.mjs`**: add a `sia.quota` action (MGR).
   - It returns `{ enabled: autoCheckEnabled(), ...(enabled ? await quotaUsage() : {}) }`.
   - It reads data only and saves nothing.
3. **`app/src/pages/people/SiaVerify.jsx`**: when the automatic result card shows, add a footnote such as "123 of 200 automatic checks left this month". It's fetched once with `useApi('sia.quota')` and hidden if the call fails.
4. **`functions/api/test/sia.test.mjs`**: nothing new to test for a plain fetch. `mapResult` is already covered.

## Steps
1. Build (ui-lint 67 or below), run `npm test`, commit (`feat: SIA Checker allowance and key test`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`), run `openkbs fn deploy api -s 'rate(5 minutes)'` and `openkbs site deploy`, then `git push origin master --tags`.
2. Call `request_secrets` (fn `api`, `SIACHECKER_API_KEY`), then redeploy the API.
3. Confirm the key with `sia.quota`: run it in the browser as a manager, or ask the user to open a panel and see the allowance line. A 401 (bad_key) means asking for the key again.
4. With the user's OK, do one real check on a licence they name. Nothing is saved until Confirm.

## Not doing
- No signing up or paying on the user's behalf.
- No background re-checks.
- No change to the live brand colour without a yes.
