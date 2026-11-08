# Plan: Orb clears the real compliance cards: unreadable names, OCR slips, part numbers, hand-ticked RTW, re-read everyone (v163)

## Context
The user pasted the Compliance cards that existed before v162 went live. They asked for the new rules to be checked against these real cases, then applied to everyone who has uploaded.

Comparing each card with v162's `nameFit` / `decide` / `officerIssues` shows these gaps:

| Card | Why it's still raised | Fix |
|---|---|---|
| Akeem, Augustine: SIA name "<UNKNOWN>" | The placeholder counts as a wrong name. Most likely the **back** of the card was read: it's the latest upload and has no name. | §1 unreadable ≠ mismatch; §2 judge the card's front and back together |
| Aduloju: "A. ADULOJILII" | An OCR slip in the surname gives 'no' | §1 a close surname counts when the number or photo proves it |
| Aaron Scott: SIA name "SCOTT" | A surname-only read gives 'no' | §1 surname only + proof |
| Augustine: 49791453 vs 1019617849791453 | A partial read is flagged as "differs" | §3 a suffix agrees (and counts as number proof) |
| Aaron Scott: 17-digit read | Not a valid SIA number, but it is still offered as an "Update profile" fix | §3 a non-16-digit read is "not read fully", advisory, with no Update button |
| Aduloju SIA 03 vs 07 Feb, Amina RTW 25 Dec vs 18 Jan | A small gap raises an urgent card | §4 the earlier date when within 31 days |
| Onyeka, Matthew, Waqas, CEO, Aaron, Amina: "RTW ticked by hand" | `decide` skips anyone already `rtw_verified` | §5 the user said **yes**: Orb saves the check from a British/Irish passport |
| Hemza, Alexander, Mark, Stephen, Lawal, Akeem, Aduloju, Blade: "RTW not verified" | No profile photo or a PDF → face `unscored` → no auto. Or a non-British passport. Or nothing uploaded. | §6 compare with the SIA card photo and PDFs too. The card says *why* Orb couldn't do it. |
| Everyone above | Migration 055 reset only the latest **unverified** doc per kind | §7 re-read every upload |

**Stay for a human, on purpose:**
- Aaron Scott's passport reads "AARON JAMES BEATTIE": a different surname, so it stays a mismatch.
- Blade's passport is obscured by a finger, so it stays as needs a human look.
- Augustine's share code: the Home Office has no API, so a manager still checks it on GOV.UK.
- The venue cards (W Hotel and Garibaldis logo/address) are out of scope.

The user answered only the first question (hand ticks → yes). For the other three I used the recommended options: the earlier date within 31 days, the SIA card photo and PDFs as photo proof, and re-reading everyone on deploy. They're listed here so approving this plan approves them.

## 1. Names: `functions/api/lib/names.mjs` (mirror in `app/src/lib/names.js`)
**`nameFit` returns `'full' | 'initial' | 'close' | 'surname' | 'unread' | 'no'`.**
- **`'unread'`:**
  - the printed name is empty after folding;
  - or it's a placeholder: `unknown`, `n/a`, `not shown`, `illegible`, `none`, or anything inside `<…>`;
  - or it has no word of 2 or more letters.
- **`'close'`:** the surname matches within an OCR slip, and the first name/initial fits as today.
  - The slip test is Levenshtein ≤ `max(1, ⌊len/4⌋)`, or a shared prefix of ≥ 5 letters covering ≥ 70% of the surname. Examples:
    - ADULOJILII vs ADULOJU: prefix "aduloj" is 6/7, so close;
    - SMITH vs SMYTH: distance 1, so close;
    - JONES vs JAMES: distance 2 > 1, so no.
- **`'surname'`:** the surname matches exactly and no other word contradicts the first name ("SCOTT" for Aaron Scott).
  - If another word is there and doesn't fit the first name ("JOHN SCOTT"), the result is `'no'`.
- **`nameMatches` stays `=== 'full'`.** E-sign is unchanged.

**`nameOk(fit, r, o)` in `lib/docAuto.mjs`:**
- `'full'` → OK;
- `'initial' | 'close' | 'surname' | 'unread'` → OK only with proof (number or photo);
- `'no'` → never.

**Tests** (`test/names.test.mjs`): <UNKNOWN>, ADULOJILII, SCOTT, JOHN SCOTT, SMYTH, JAMES/JONES, and the existing S SCANLON / J SCANLON / Sam cases.

## 2. Judge the SIA card as front + back together (`modules/compliance.mjs` `officerIssues`, `lib/docAuto.mjs`)
- **New helper `cardSet(docs, kind)`:** the latest upload plus any upload of the same kind within 30 days before it (front/back). This is the same window `idDocs` uses in `modules/officers.mjs`, so share it in a small `lib/docSets.mjs`.
- **Merged read:**
  - name, number, expiry and licence_type come from the first doc in the set that has them;
  - concerns/readable come from the doc they belong to;
  - the face result is the best of the set.
- **Cards** are keyed on the doc the value came from, so their ids stay stable.
- **`autoApply(docId)`** builds the same merged read before `decide`. A back read alone can then complete the front read's apply, and the reverse.
- **`unread` without proof:**
  - this replaces the name mismatch with an advisory: `doc_name_unread:<id>` "Couldn't read the name on "{title}"", with the action Mark for re-check;
  - with proof, there's no card.

## 3. SIA numbers (`officerIssues`, `proofOf`)
- `digitsOf(r.number)`:
  - 16 digits → compare as today;
  - 8–15 digits and the profile number **ends with** them → agrees, and counts as number proof;
  - anything else that isn't 16 digits (a 17-digit or a partial non-suffix read) → advisory `doc_number_unread:<id>` "SIA number on "{title}" wasn't read fully (reads X)", with **no** Update-profile action and a Mark for re-check.
- The "differs" card (with Update) is only for a clean 16-digit read that differs.
- `decide` (SIA) treats a suffix read as matching when the profile already has a number. It never writes a partial number.

## 4. Small expiry gaps (`decide`, `officerIssues`)
- **SIA:** when the card's expiry is earlier than the profile by ≤ 31 days, and everything else agrees, Orb applies the **card's (earlier) date**.
  - It's audited (`orb.apply_sia` with from/to). The card closes.
- **Card later than the profile:** applied as today.
- **Earlier by more than 31 days:** for a human, as today.
- **RTW expiry** (Amina): the same rule, only when the profile RTW wasn't set by a GOV.UK check (`rtw_method` is not `gov_check`).
  - A new auto action `rtw_expiry` sets `rtw_expiry` to the earlier date, and audits `orb.apply_rtw_expiry`.
  - It uses the doc's merged read with nameOk and no concerns.
  - A GOV.UK-checked expiry always stands. Its mismatch card is downgraded to advisory when the gap is ≤ 31 days.

## 5. Hand-ticked RTW → Orb's saved check (user said yes)
- **`decide` RTW condition:** `!o.rtw_verified` becomes `(!o.rtw_verified || !o.rtw_checked_at)`. A doc already `verified_at` by a manager is also allowed in this case, because it only adds the missing check record.
- **The update is the same as v162:**
  - `rtw_method='orb_passport'`, `rtw_checked_at=now()`, `rtw_check_doc`, `rtw_type`;
  - `rtw_expiry=NULL` (British/Irish is unlimited).
- **Audit:** `{ upgraded_from_hand_tick: true }`.
- **No officer notification** when they were already ticked. Nothing changes for them.
- The `rtw:no_record` card then closes through `runCompliance`.

## 6. More photo proof, and say why RTW isn't automatic
**`lib/face.mjs`:**
- `sniff` also accepts `%PDF` → `application/pdf`. Gemini takes PDF inline. The DOC_PROMPT wording becomes "image or PDF".
- New `docPairMatch({ a, b })` with the prompt "two identity documents (passport / SIA licence) — same holder?".

**`readDocuments` face step:**
- Compare with the profile photo first.
- If there's no profile photo, or the result is unsure/unscored, and the officer has an SIA upload with a photo (or a passport, when reading the SIA), compare the two documents.
- Store `read.face = { result, note, against: 'profile' | 'sia' | 'passport' }`.
- PDFs are no longer skipped.

**`unverified:rtw` card detail** gets the reason from the latest passport/id read:
- "Passport is {nationality} — needs a share code check on GOV.UK";
- "Passport uploaded but Orb couldn't confirm the photo — add a profile photo or check it";
- "No passport or share code uploaded" (shown with the existing Remind action).

**Profile RTW tile:** when `against` isn't profile, it shows "photo matched their SIA card".

## 7. Re-read everyone: migration `056_doc_reread.sql` (live data change, approved with this plan)
- `UPDATE documents SET ai_read_key = NULL WHERE owner_type='officer' AND kind IN ('sia','rtw','id') AND s3_key IS NOT NULL AND auto_applied_at IS NULL AND owner_id IN (SELECT id FROM officers WHERE status IN ('active','onboarding'))`.
  - This resets the read cache only. No profile field changes unless a new read agrees.
- **The `docRead` job** (`modules/ops.mjs`) takes 12 per run while there's a backlog (`limit` 12 when > 12 are waiting, otherwise 4). Everyone is re-read within about an hour.
- **Hand changes still stand:** auto-apply never overwrites values that disagree. It only fills, confirms, or takes the earlier date within 31 days, as above.

## 8. App
- **`app/src/pages/people/_profileTabs.jsx` RTW tile:**
  - "By Orb from the uploaded passport" (+ "photo matched their SIA card" when it applies);
  - the "Copy only" pill is unchanged.
- **Compliance card labels:** the new keys `doc_name_unread` and `doc_number_unread` use the default card UI, with no special handling needed. Check `app/src/pages/compliance*` for any key switch.
- **What's new:** a top card in `_whatsnew.jsx` dated 2026-11-08, "Orb clears more cards on its own", with its own AI picture `orb-reads-closer` via `app/scripts/whatsnew-images.mjs`. I'll generate it and look at it.

## Verification
1. `cd functions/api && node --test` (all of them): the new names tests, plus a `docAuto` decide test file covering every pasted case as fixtures:
   - Augustine: back with <UNKNOWN> + front with a suffix number → applies;
   - Aduloju: ADULOJILII + photo → applies, expiry 03 Feb taken;
   - Aaron Scott: SIA "SCOTT" with a 17-digit read → null, with the advisory number card only; passport BEATTIE → name mismatch stays;
   - hand-ticked + GBR passport + SIA-photo match → rtw;
   - Blade: concern → null;
   - Amina: RTW expiry 24 days earlier → rtw_expiry.
2. **`officerIssues` fixtures** for the same cases: the expected keys present or absent.
3. **Imports:** `node -e "import('./modules/compliance.mjs')"`, plus docAuto and face.
4. **App:** `npm run build` (ui-lint ≤69). Mock screenshots of the RTW tile at 1280 and 390, then `agent-browser close --all` and kill the mock by PID.
5. I won't touch the production DB by hand. After deploy, the live check: the index contains 6ij75kpgf7 and not hopedp5, and the webp returns 200.

## Ship
- **Commit with explicit paths:**
  - functions: `lib/names.mjs`, `lib/docAuto.mjs`, `lib/docSets.mjs`, `lib/face.mjs`, `modules/compliance.mjs`, `modules/officers.mjs`, `modules/ops.mjs`, `db/migrations/056_doc_reread.sql`, the tests;
  - app: `lib/names.js`, `_profileTabs.jsx`, `_whatsnew.jsx`, `whatsnew-images.mjs`, the webp;
  - the spec md.
- **Deploy:** `openkbs fn deploy api`, then commit `site/` and `openkbs site deploy` (v163), then push with tags.
- **Report:** what will clear on its own, and what stays for a human (Aaron Scott's passport name, Blade's obscured passport, Augustine's share code, non-British passports, the venue cards).
