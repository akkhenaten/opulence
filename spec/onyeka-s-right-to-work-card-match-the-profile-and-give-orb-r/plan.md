# Implementation plan: right to work ticked by hand — matching card and more options

## Context
Onyeka's profile now shows "Evidence: Not recorded". Orb's card still shows the old title and no buttons, because it was raised
by the pre-v171 code and cards only rebuild on the weekly run or when that officer changes. The spec is to give the
`rtw:no_record` card real choices (record the passport, remind, re-check, untick with a 14-day grace period) and to refresh
stale cards after deploy.

## Backend

### `functions/api/modules/grace.mjs`
- Move the body of `'compliance.grace.grant'` into an exported function:
  `export async function grantGrace(officerId, b, user, { prep, officer } = {})`.
  - Same checks as now: active only, no open grace, `reasonOf`, `lengthOf`, `graceable`, `checkRisk`.
  - It works out what the grace covers from `officer` when given. The card passes the officer as they will be after the
    untick (`{ ...o, rtw_verified: false }`), so `rtw_unverified` is graceable.
  - Inside the existing `tx`, it runs `await prep?.(db)` before the INSERT. The untick and the grant then commit together.
  - It keeps the same audit and `tellOfficer` calls.
- The action becomes `def(CO, async (b, { user }) => (required(b,'officer_id'), { ok: true, grace: await grantGrace(b.officer_id, b, user) }))`.

### `functions/api/modules/compliance.mjs`
- Import `grantGrace`. `GRACE_MAX_DAYS` is available from officers.mjs.
- Rewrite the `rtw:no_record` branch (around lines 295–306):
  - Same passport lookup as now: `pass`, `pr`, `type`. Also add `bad = pass[0] && !type` (passport on file that Orb couldn't use).
  - Title: when `rtw_type` is set, keep "Right to work ticked by hand, no check saved". Otherwise use "Right to work evidence not recorded, no check saved".
  - Detail is short: what's missing, plus "Or do the check again with Check right to work on their profile."
  - Actions, in order:
    1. `rtw_type` record action (existing), only when `type`.
    2. `{ ...remind(o, 'rtw', 'their passport or right to work share code'), default: !type }`.
    3. `recheck(pass[0])` when `bad`.
    4. When `!graceOn(o, today)` and `o.status === 'active'`:
       `{ kind: 'rtw_grace', label: \`Untick right to work and give ${o.first_name} ${GRACE_MAX_DAYS} days to send it\`, params: { days: GRACE_MAX_DAYS }, company_only: true, default: false }`.
       Import `graceOn` from officers.mjs if it isn't already imported.
  - The `sig` stays as it is; the action list derives from the same inputs.
- In `decideCompliance`, add a loop for `rtw_grace`:
  - Only company managers can run it (`user.role === 'company'`), and only if `o.rtw_verified` is still true; otherwise `continue`.
  - Call `grantGrace(o.id, { days, reason: \`From Orb's card: ${a.issue.title}\` }, user, { officer: { ...o, rtw_verified: false }, prep: (db) => db.q('UPDATE officers SET rtw_verified = false WHERE id = $1', [o.id]) })`.
  - Write audit `officer.update` with `{ rtw_verified: { from: true, to: false }, via: 'compliance' }`.
  - Add to `done`: `Unticked right to work; ${o.first_name} can work until ${fmtDate(g.ends_on)} while they send it`.
  - Put the reminder loop before this one, so the officer gets the grace message from `tellOfficer` plus the reminder if it was ticked. That's acceptable; there is no dedupe needed.
- Check the order: `rtw_type` and `rtw_grace` together make no sense. If both are picked, skip `rtw_grace` when the `rtw_type` action is also chosen.

### `functions/api/modules/ops.mjs`
- In the `docRead` job, change the marker from `'056'` to `'057'` in both places. One full `runCompliance()` then runs after
  deploy, and every open compliance card is rebuilt with the current text and actions.

## Frontend
- No card UI changes: `OpsAI.jsx` already renders action ticks and filters `company_only`.
- What's new card in `app/src/pages/people/_whatsnew.jsx`, at the top, `date: '2026-11-08'`, `image: 'rtw-hand-ticked'`, icon `BadgeCheck`.
- Picture prompt in `app/scripts/whatsnew-images.mjs`. Generate it with `node app/scripts/whatsnew-images.mjs rtw-hand-ticked` and look at it.

## Tests (`functions/api/test/rtw.test.mjs`)
- Ticked by hand, no docs: remind is ticked, `rtw_grace` is present (company_only, not ticked), and there is no `rtw_type` action.
- Ticked by hand, good British passport: `rtw_type` is ticked, remind is not ticked, `rtw_grace` is present.
- Unreadable passport: a `recheck` action is present.
- On an open grace (`grace_until` in the future): no `rtw_grace`.
- Title says "evidence not recorded" when `rtw_type` is empty.
- Update the existing assertions in docAuto.test.mjs lines 143–146 if they check the title or action count.
- Run `node --test test/*.test.mjs`.

## Release
1. `cd app && npm run build` (output goes to site/app).
2. Commit the feature paths explicitly: the three api modules, the test, _whatsnew.jsx, whatsnew-images.mjs and the webp. Message ends with the Co-Authored-By line. Never commit spec/plan-the-compliance-cards….
3. `openkbs fn deploy api`.
4. `git add site/ && commit "build: site with right to work card options"`, then `openkbs site deploy`.
5. Check that the live `index-*.js` contains 6ij75kpgf7 and not hopedp5.

## Verification
- Unit tests and a clean build.
- The live check above.
- Onyeka's card refreshes on the next docRead tick (a full run). Run check on Today forces it straight away; I won't press it myself.
