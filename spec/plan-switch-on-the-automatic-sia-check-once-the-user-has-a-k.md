# Plan: switch on the automatic SIA check once the user has a key

## Context
The automatic SIA register check (SIA Checker) is built and live in v82. It stays off until the server has `SIACHECKER_API_KEY`.

The user pasted SIA Checker's authentication docs instead of a key. They need to sign up at siachecker.co.uk and create an API key; I can't do that for them. An earlier `request_secrets` call was interrupted, so it isn't known whether a key was saved.

No code changes are needed: `functions/api/lib/siaChecker.mjs` already sends `Authorization: Bearer <key>` as the docs describe.

## Steps (once the user says they have the key)
1. Call `request_secrets` with fn `api`, key `SIACHECKER_API_KEY`, label "SIA Checker API key (siachecker.co.uk → your account → API keys)". The key never appears in the chat. If the user pastes it into the chat anyway, tell them to rotate it.
2. `openkbs fn deploy api -s 'rate(5 minutes)'`.
3. Check the key without using a check: call `GET https://api.siachecker.co.uk/v1/quota/usage` from inside the function environment (for example a one-off `sia.quota` MGR action, or the function's logs). Expect 200 with `{ period, used, quota, remaining }`. A 401 means the key is wrong, so ask for it again.
4. With the user's OK, run one real check on a licence they name. Open the officer's Verify SIA licence panel: the result should fill in, and nothing is saved until they tap Confirm.
5. Report the result and the remaining monthly allowance.

## Not doing
- No signing up or paying on the user's behalf.
- No automatic background re-checks; those were agreed as on-demand only.
- No change to the live brand colour until the user says yes.
