# Implementation plan: Orb stops re-raising what's decided; names match regardless of case
Spec: `spec/spec-orb-stops-re-raising-what-s-already-flagged-or-decided-.md`.
- API changes plus small front-end changes. No migration, and no data is changed by hand.
- Work, build and ship in `/home/user/project`. Stage paths explicitly.

## 1. One shared name matcher: `functions/api/lib/names.mjs`
Add `nameMatches(printed, first, last)`:
- `fold(s)`:
  - NFKD, then strip accents and lowercase;
  - drop `' ’ \` .`;
  - every other non-letter becomes a space;
  - split into tokens.
- `pieces(tokens)`: every run of 1–3 adjacent tokens joined with no space. So "mc donald" gives `mcdonald`, and "smith jones" gives `smithjones`.
- It's a match when:
  - the folded first name's first token is in the pieces, **and**
  - the last name, folded and joined (or just its last token), is in the pieces.
- Empty printed name, or empty first and last → `true`. Empty first → only the last is checked.
- A copy goes in `app/src/lib/names.js` (same code, front end).

Use it in:
- `modules/compliance.mjs:249-250`: the `doc_mismatch:…:name` check becomes `!nameMatches(r.name, o.first_name, o.last_name)`. Existing false flags then drop off on the next run: the card updates or closes by itself.
- `modules/sia.mjs:64-65`: `name_matches = nameMatches(`${r.first_name} ${r.surname}`, o.first_name, o.last_name)`. This allows a middle name on the register.
- `lib/applicants.mjs`: `sameName(applicant, printed)` becomes `nameMatches(printed, applicant.first_name, applicant.last_name)`. Drop the local `words` if it's unused.
- `app/src/pages/people/RtwCheckSheet.jsx:49`: `nameOff = read?.name && !nameMatches(read.name, o.first_name, o.last_name)`.

Tests go in `test/names.test.mjs`:
- These match:
  - Scott / SCOTT;
  - José García / JOSE GARCIA;
  - O'Brien / OBRIEN;
  - Mc Donald / MCDONALD, and McDonald / MC DONALD;
  - Smith-Jones / SMITH JONES;
  - "ONYEKA CHIDI GODDEY" / Onyeka Goddey;
  - "GODDEY ONYEKA" (reversed);
  - blank first name.
- Still a mismatch: Sam / SAMUEL, and a different surname.
- The existing `apply.test.mjs` sameName cases still pass.

## 2. Venue logo cards: `modules/venueSetup.mjs`
- **The unticked part of an approved card counts as dismissed.** In `decideVenueSetup`:
  - Track which issue each completed action belongs to. Map `action.id → issue.key` from `issues`.
  - After the `done.length` check, call `dismissVenueIssues(it, issuesWithNothingDone, user, 'Not applied when the card was approved')`. This covers the no-action "No logo" issue, unticked issues, and a logo that couldn't be copied.
  - So approving the radius alone no longer brings "No logo" back.
- **Closed cards free their dedupe**, so a closed card never silently blocks a new one and the lookup doesn't loop:
  - the auto-close in `runVenueSetup` sets `dedupe = NULL`;
  - the last-issue reject in `ops.dismissVenueIssue` sets `dedupe = NULL`;
  - `decideItem` already does this for approve and reject.
- **No lookup wasted:**
  - In `runVenueSetup`, only count a run against `LOOKUPS_PER_RUN` when the keys need the web (`address`, `pin` or `logo`).
  - A radius-only refresh always updates. A `lookups: 0` call can then still rewrite a card that has lost its logo issue.
- **Uploading or removing a logo re-checks straight away:** in `modules/venues.mjs` `setLogo`, after the update, call the same dynamic `import('./venueSetup.mjs').then(m => m.runVenueSetup({ venueIds: [id], lookups: 0 }))` as at line 176.
  - This also covers the Orb approve path. That's fine: the card is decided right after anyway, and the run skips non-pending cards.
- "Lookup found nothing" is already quiet while the card stays open: `keys_sig` is unchanged, so there's no lookup. Once dismissed, it holds until the website changes (sig = website_url).

Tests, `test/venueSetup.test.mjs`: unit-test the pure part.
- Extract `notApplied(issues, doneActionIds)` into `lib/venueSetup.mjs`.
- Assert that a radius-only approve returns `['logo']`.

## 3. Officer photo / document cards: `modules/compliance.mjs` + `modules/ops.mjs`
- **Export `dismissComplianceIssues(it, keys, user, reason)`.** Move the upsert out of `ops.dismissIssue`, which then calls it.
- **Rejecting a whole card:** in `decideItem` (ops.mjs:680), `if (it.kind === 'compliance') await dismissComplianceIssues(it, all issue keys, user, b.reason)`. Import it from compliance.mjs.
- **No AI call for a card already raised:** in `runCompliance`, before `advise()`, when there's no open card:
  - if `SELECT 1 FROM ops_items WHERE dedupe = $1` finds a row, `continue`;
  - this means no credits and no false `created++`.
- **Auto-closed compliance cards free their dedupe** (`dedupe = NULL`), so a problem that genuinely comes back is raised again.
- **Re-check reads the document fresh:**
  - In `decideCompliance`'s recheck action, also set `ai_read = NULL, ai_read_key = NULL, ai_read_at = NULL`.
  - Then `doc_suspect` / `doc_mismatch` drop off, and `readDocuments` reads the scan again on the next run (`ai_read_key IS DISTINCT FROM s3_key`).
  - Clear that document's dismissals (`DELETE FROM compliance_dismissals WHERE officer_id=$1 AND issue_key LIKE 'doc\_%:' || $2 || '%'`) so the fresh read decides.

Tests: add a pure helper test where it fits. `ops.test.mjs` has `clearedCards`/`complianceDue`-style tests. Most of this is SQL glue, so it's checked through `npm test` plus the code review.

## 4. Phone chip wording
- In `modules/clockProof.mjs` `checkPhone`, add a second flag:
  - no passkey → also `extra: 'phone_skipped'`;
  - credential not registered, or signature failed → `extra: 'phone_unrecognised'`.
- In `clock.mjs:151`, push `ph.extra` into `flags` too. `phone_not_verified` stays, so the existing counts and filters are unchanged.
- `app/src/pages/manager/_proof.jsx` `ProofFlags` label order:
  1. `Phone ok`;
  2. `New phone, not approved`;
  3. `Phone skipped` (flag `phone_skipped`);
  4. `Phone not recognised` (flag `phone_unrecognised`);
  5. otherwise `Phone not verified`, for older events.
- Check other places that show `phone_not_verified` text (Exceptions filters, Reports). Labels only.

## 5. What's new card
- At the top of `UPDATES` in `app/src/pages/people/_whatsnew.jsx`:
  - icon `BellOff`; title "Orb stops repeating itself"; image `orb-no-repeats`; date `2026-11-07`.
  - Points:
    - dismissed logo cards stay dismissed;
    - approving part of a card dismisses the rest;
    - rejected document cards stay quiet until the document changes;
    - names match whatever the capitals or punctuation;
    - the phone chip says why.
- Add the prompt to `app/scripts/whatsnew-images.mjs`, run `node app/scripts/whatsnew-images.mjs orb-no-repeats`, then view the webp.

## 6. Verify
1. `npm test` in `functions/api`: all pass, including the new name and venue setup cases.
2. `npm run build` in `app/`: ui-lint ≤ 69, the checks pass.
3. Local mock (`/tmp/mock/server.mjs`, `site` copy pointed at localhost): the Live drawer shows "Phone skipped". Run `agent-browser close --all` after.

## 7. Ship
1. Commit with explicit paths:
   - API: names, compliance, ops, venueSetup (module + lib), venues, sia, applicants, clockProof, clock, tests;
   - app: lib/names.js, RtwCheckSheet, _proof, _whatsnew, the script, the webp.
2. `openkbs fn deploy api` (tag v154).
3. `npm run build`, then commit `site/`.
4. `openkbs site deploy`, then `git push origin master --tags`.
5. Check the live `index-*.js` contains `6ij75kpgf7` and not `hopedp5`.
