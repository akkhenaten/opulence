# Implementation plan: Orb clears the real compliance cards (v163)

Spec: `spec/plan-orb-clears-the-real-compliance-cards-unreadable-names-o.md` (approved). All paths below are under `functions/api/` unless they start with `app/`.

## 1. `lib/names.mjs` (+ mirror `app/src/lib/names.js`)
**`nameFit(printed, first, last)` returns `'full' | 'initial' | 'close' | 'surname' | 'unread' | 'no'`.**
- **`'unread'`** (checked first):
  - the raw text matches `/^\s*<.*>\s*$/`;
  - or the fold is in `{unknown, na, n a, not shown, illegible, none, unreadable}`;
  - or no folded word has 2 or more letters.
- **Surname test:**
  - exact, as today (`have.has(l.join(''))` or `have.has(l.at(-1))`);
  - otherwise **close** when some printed word `w` passes `lev(w, L) ≤ max(1, ⌊L.length/4⌋)` or (`commonPrefix(w, L) ≥ 5` and `≥ 0.7·L.length`), where L is the last surname piece or the joined surname;
  - otherwise `'no'`.
  - A small `lev` helper goes in the same file.
- **First name:** the rest of the words, excluding the surname word.
  - Contains `f` → `'full'` (`'close'` if the surname was close).
  - An initial or a longer name starting with f → `'initial'` (`'close'` if the surname was close).
  - **No other words → `'surname'`.**
  - Other words that don't fit → `'no'`.
- **`nameMatches` stays `=== 'full'`.** Callers that want the empty case behave as today: an empty printed name or empty profile names still return `'full'` (the existing first line). Then `'unread'` is checked after the `!p.length` guard, but only for placeholder text.
- **Tests** (`test/names.test.mjs`): `<UNKNOWN>`→unread, `A. ADULOJILII`/Ayodeji Aduloju→close, `SCOTT`/Aaron Scott→surname, `JOHN SCOTT`→no, `S SMYTH`/Sam Smith→close, `JAMES`/Jones surname→no, plus the existing cases.

## 2. `lib/docSets.mjs` (new, pure)
- **`cardSet(docs, kind)`:** the docs of that kind with an `s3_key`, newest first. Keep the latest plus the others within 30 days of it, at most 3.
- **`mergedRead(set)`:** returns `{ read, from }`.
  - `read.name` is the first non-unread name, otherwise the first name;
  - `number`, `expiry`, `licence_type`, `is_passport`, `nationality`, `has_photo` are each the first non-empty;
  - `face` is the best of match > unsure > no_match > unscored;
  - `concerns` are concatenated, `readable` is all-true.
  - `from[field] = doc` records which doc supplied each value, so card keys and recheck actions point at the right file.
  - Reads with error/skipped are ignored.
- **For `rtw`/`id`:** the set is the latest passport-ish doc (`ai_read.is_passport` or kind `id`), so a GOV.UK check page never merges in. Exclude `o.rtw_check_doc` unless `rtw_method = 'orb_passport'`.
- **`modules/officers.mjs` `idDocs`** reuses `cardSet` for the SIA window.

## 3. `lib/docAuto.mjs`
- **`proofOf(r, o)`:** `number` is true when the card digits === the profile digits, or 8–15 digits that `o.sia_number` digits end with. `photo` is `face.result === 'match'`.
- **`nameOk`:** `'full'` → true. `initial|close|surname|unread` → number or photo proof. `'no'` → false.
- **`decide(o, d, r, today)`**, with r now the merged read:
  - **SIA:**
    - 16-digit number required only when the profile has no number. With a profile number, a 16-digit equal or a suffix read is fine. Keep the profile number, never write a partial.
    - **Expiry:** profile empty or ≤ card → card date. If the profile is later than the card by ≤ 31 days → card date (`shortened: true`). More than 31 days → null.
  - **RTW passport:**
    - condition `(!o.rtw_verified || !o.rtw_checked_at)`;
    - `d.verified_at` is only a blocker when `o.rtw_checked_at` is set (the guard moves out of the top line for this case);
    - returns `{kind:'rtw', upgrade: !!o.rtw_verified}`.
  - **New `rtw_expiry`:**
    - non-passport `rtw` doc with nameOk, no concerns, `o.rtw_verified` and `o.rtw_method` not in (`share_code`, `manual`);
    - `o.rtw_expiry` is later than `r.expiry` by 1–31 days;
    - → `{kind:'rtw_expiry', expiry}`.
- **`autoApply(docId)`:**
  - loads all of that officer's docs and builds `cardSet` + `mergedRead` for the doc's kind, then calls decide;
  - for SIA, marks every doc in the set verified / `auto_applied_at`;
  - `upgrade` → skips the officer notification; the audit gets `upgraded_from_hand_tick`;
  - `rtw_expiry` → `UPDATE officers SET rtw_expiry`, `audit('orb.apply_rtw_expiry', {from,to,doc})`, `logActivity`;
  - the audit for SIA carries `shortened`.

## 4. `lib/face.mjs`
- `sniff`: `%PDF` → `application/pdf`. DOC_PROMPT says "photo or PDF of an ID document".
- New `docPairMatch({ a, b })`: a `PAIR_PROMPT` asking whether two identity documents (passport / SIA licence) show the same holder, run through `compare`. A PDF goes as inline data too.

## 5. `modules/compliance.mjs`
**`readDocuments`:**
- **Face step:**
  - when `has_photo` (any mime that `sniff` accepts), compare with the profile photo first;
  - if there's no profile photo, or the result is unsure/unscored, use the officer's other photo document: for a passport/id, the latest SIA doc whose `ai_read.has_photo`; for an SIA doc, the latest passport doc;
  - result `{ result, note, against: 'profile'|'sia'|'passport' }`.
  - The query adds `o.id AS officer_id` (already present via owner_id).
- **Ordering and limit:**
  - change the order to `ORDER BY (d.ai_read_key IS NULL AND d.ai_read IS NOT NULL) DESC, d.created_at DESC`, so the backfill doesn't starve new uploads (new uploads are read straight away anyway);
  - `limit` stays as passed.

**`officerIssues` read loop:**
- Replace `latest(kind)` + per-doc read with: for `sia`, the cardSet/mergedRead; for `id`/`rtw`, the passport set (§2).
- `d` for the keys is `from.name` / `from.number` / `from.expiry` (falling back to the latest).
- **Name:**
  - `'no'` → mismatch (as today);
  - `'unread'` without proof → `doc_name_unread:<id>` advisory "Couldn't read the name on "{title}"", with `recheck`;
  - other non-full fits without proof → `doc_name_initial` with the title "shows {name}";
  - with proof, nothing.
- **Number:**
  - 16 digits and different → the existing card;
  - 8–15 digits that are a suffix → nothing;
  - anything else non-16 → `doc_number_unread:<id>` advisory "SIA number on "{title}" wasn't read fully (reads X)", with only `recheck`.
- **Expiry:** card earlier by ≤ 31 days:
  - severity `advisory`;
  - the detail says "Orb uses the earlier date once the card checks out";
  - the Update action is kept.
- **`unverified:rtw` detail:** a new helper `rtwWhy(passportRead)` gives one of:
  - "Passport is {NAT} — needs a share code check on GOV.UK";
  - "Passport uploaded, but Orb couldn't confirm the photo — add a profile photo or check it in person";
  - "{title} needs a human look";
  - the current text.

## 6. Backfill: `db/migrations/056_doc_reread.sql`
```sql
-- Read every licence and ID upload again with the closer rules (unreadable names, OCR slips, part numbers, card photos)
UPDATE documents d SET ai_read_key = NULL
  FROM officers o
 WHERE o.id = d.owner_id AND d.owner_type = 'officer' AND o.status IN ('active','onboarding')
   AND d.kind IN ('sia','rtw','id') AND d.s3_key IS NOT NULL AND d.auto_applied_at IS NULL
   AND d.id IS DISTINCT FROM o.rtw_check_doc
   AND d.title NOT IN ('GOV.UK right to work check', 'Right to work — manual check');
```
(This excludes the saved GOV.UK/manual check pages, whose stored read is the check result.)

**`modules/ops.mjs` `docRead`:** `readDocuments(12)` while more than 12 docs are unread (a cheap `count(*)` with the same WHERE as readDocuments, exported as `unreadDocCount()`), otherwise 4.

## 7. App
- **`app/src/pages/people/_profileTabs.jsx`:**
  - the Checked line for `orbRtw` appends " — photo matched their SIA card" when `o.id_docs?.find(d => d.kind === 'id')?.face_against === 'sia'`;
  - `idDocs` returns `face_against: ai_read->'face'->>'against'` (add `ai_read` to its SELECT).
- **Compliance UI:** a grep showed no key switch in `app/src` for `doc_*`, so the new keys render as generic cards.
- **What's new:**
  - a top card in `app/src/pages/people/_whatsnew.jsx`, 2026-11-08, icon `ScanSearch` (check the lucide export), title "Orb clears more cards on its own", image `orb-reads-closer`;
  - a prompt in `app/scripts/whatsnew-images.mjs`;
  - generate it from the repo root (`node app/scripts/whatsnew-images.mjs orb-reads-closer` or as before), then look at the webp.
- **Orb catalog:** no new actions.

## 8. Tests: new `test/docAuto.test.mjs` (pure decide + mergedRead + officerIssues)
Fixtures from the pasted cards, with today = 2026-11-08:
- **Augustine:** back `{name:'<UNKNOWN>', number:'49791453'}` + front with no number, face match, profile number 1019617849791453 → sia applies, with no name/number cards.
- **Aduloju:** `A. ADULOJILII`, face match, expiry 2029-02-03 vs profile 2029-02-07 → sia with `shortened`.
- **Aaron Scott:**
  - SIA `SCOTT`, number 17 digits, profile number set → decide null;
  - issues: only `doc_number_unread` for the number;
  - passport `AARON JAMES BEATTIE` → `doc_mismatch:…:name`.
- **Hand-ticked** (`rtw_verified`, no `rtw_checked_at`) + GBR passport with face match against sia → `{kind:'rtw', upgrade:true}`.
- **Blade:** concerns → null, `doc_suspect` stays.
- **Amina:** non-passport rtw doc expiry 2026-12-25 vs profile 2027-01-18, rtw_method '' → `rtw_expiry`. With rtw_method `share_code` → null.
- **NGA passport** → null, and the `unverified:rtw` detail mentions the share code.

Run `node --test test/` in full, plus import checks for the modules: compliance, docAuto, face, ops, officers.

## 9. Verify, ship
1. In `app`, run `npm run build` (ui-lint ≤69).
2. Quick mock check of the profile RTW tile at 1280/390. Then `agent-browser close --all` and kill the mock by PID.
3. **Commit with explicit paths:**
   - `functions/api/{lib/names.mjs,lib/docSets.mjs,lib/docAuto.mjs,lib/face.mjs,modules/compliance.mjs,modules/officers.mjs,modules/ops.mjs,db/migrations/056_doc_reread.sql,test/names.test.mjs,test/docAuto.test.mjs}`;
   - `app/src/lib/names.js`, `_profileTabs.jsx`, `_whatsnew.jsx`, `whatsnew-images.mjs`, the webp;
   - the spec md.
4. **Deploy:** `openkbs fn deploy api` (migration 056 runs on startup), then build and commit `site/`, then `openkbs site deploy` (v163), then `git push origin master --tags`.
5. **Live check:** the index contains `6ij75kpgf7` and not `hopedp5`, and the webp returns 200. I won't read the production DB.
6. **Report:** what clears on its own over the next hour, and what stays for a human (Aaron Scott's passport surname, Blade's obscured passport, Augustine's share code, non-British passports, the venue cards).
