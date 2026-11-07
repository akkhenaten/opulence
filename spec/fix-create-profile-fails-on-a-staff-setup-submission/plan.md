# Fix: Create profile fails on a staff setup submission

## Context
The user can't turn a filled-in officer form into a staff profile. The live API log shows `staffSetup.create` failing twice (13:44 today):
`null value in column "goes_by" of relation "officers" violates not-null constraint`.

**Cause:** the officer left "Known as" blank, and `officerFromDetails` (functions/api/lib/staffSetup.mjs:66) sets `goes_by: d.goes_by || null`. `officers.goes_by` is `text NOT NULL DEFAULT ''` (migration 028), so the insert fails. The transaction rolls back, so the submission is still there, untouched.

Every officer who leaves "Known as" blank hits this. Our tests and the mock never caught it, because the test data always filled the field in. No other column in that row has the same problem: every other field is either nullable or always set.

## Change
- `functions/api/lib/staffSetup.mjs:66`: `goes_by: d.goes_by || ''`.
- `functions/api/test/staffSetup.test.mjs`: add a test that a submission with no "known as" gives `goes_by === ''`, never null.
- What's new: per the memory rule, add a short card ("Staff setup: Create profile works when 'Known as' is blank") with a prompt in app/scripts/whatsnew-images.mjs, the generated .webp, and `image` set.

## Release
- Commit, then `openkbs fn deploy api -s 'rate(5 minutes)'`.
- Build the site, commit it as "build: …", then `openkbs site deploy`.
- `git push origin master --tags`.

## Verification
- `cd functions/api && npm test`: all tests pass, including the new one.
- `node app/scripts/ui-lint.mjs` stays at 67 or below.
- After deploy, the user taps **Create profile** again on the same submission. It is still waiting, and should now go through. I won't create it myself on live data.
