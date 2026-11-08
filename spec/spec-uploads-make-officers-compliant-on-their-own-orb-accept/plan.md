# Plan: uploads make officers compliant on their own, Orb accepts initials with proof, British passports verify RTW, everything opens in-app (v158)

Spec: `spec/spec-uploads-make-officers-compliant-on-their-own-orb-accept.md` (approved, "Build now").

## Context
**Uploads don't count.**
- Compliance (`officerIssues`, `functions/api/modules/compliance.mjs:110`) only reads `officers` columns: `sia_number`/`sia_expiry`/`sia_type`, `rtw_verified`.
- Orb reads scans (`readDocuments`, :60), but only every 5 minutes (job `docRead`, `ops.mjs:638`), and it only *suggests*.

**Names are too strict.** `nameMatches` (`lib/names.mjs`) needs the full first name, so "S SCANLON" raises `doc_mismatch:…:name`.

**British passports** need a manual Check right to work.

**Attachments open outside the app.** Files open in a new tab via `openUrl` (`people/_parts.jsx:150`), `downloadAction` (`api.js:97`) and a few `window.open` calls.

**Reuse:**
- `faceMatch` (`lib/face.mjs`, Gemini);
- `lookupLicence` (`lib/siaChecker.mjs`), plus the `sia.record` logic (`modules/sia.mjs:77`);
- `tickOnboarding`, `audit`, `logActivity`;
- `clearedCards`/`runCompliance` (they already auto-close cards whose issues are gone);
- `Lightbox` (`ui/Lightbox.jsx`), `PdfPages` (`ui/PdfPages.jsx`, pdf.js, already works with presigned URLs).

## 1. Names: `functions/api/lib/names.mjs`, mirrored in `app/src/lib/names.js`
- Add `nameFit(printed, first, last)`, which returns `'full' | 'initial' | 'no'`.
  - The surname check is the same as today.
  - `'full'` when the first-name word appears.
  - `'initial'` when the surname matches and the printed words (excluding the surname) include a single letter, or a word starting with, the first-name initial ("S SCANLON", "S. J. SCANLON").
  - Otherwise `'no'`.
- `nameMatches` stays as it is (`=== 'full'`), so the e-sign and other callers don't change.
- Tests in `functions/api/test/names.test.mjs`:
  - "S SCANLON" against Scott Scanlon gives initial;
  - "J SCANLON" gives no;
  - "SCOTT SCANLON" gives full;
  - the existing Sam / SAMUEL test still gives no full match. "SAMUEL OKAFOR" against Sam is initial: S fits and the surname fits.

## 2. Document read + photo (`modules/compliance.mjs`)
- **`READ_TOOL`:** add `nationality` (`'GBR'|'IRL'|other ISO3|''`), `date_of_birth`, `is_passport` (boolean), and `has_photo` (boolean).
- **`lib/face.mjs`:** refactor into an internal `compare(prompt, imgA, imgB, module)`.
  - `faceMatch` keeps its prompt.
  - New `docFaceMatch({ doc, profile })` has a prompt like "Image 1 profile photo, image 2 an ID/licence document; is the photo on the document the same person?", using module key `doc_face`.
- **`readOne(d)`:** pull the per-document body of `readDocuments` out into this function.
  - After the text read, when the read has `has_photo`, the mime is an image, and the officer has a `photo_key`, run `docFaceMatch` and store `read.face = { result, note }`.
  - PDFs, or no profile photo, give `face: { result: 'unscored' }`.
  - Then call `autoApply(d.id)` (§3).
  - `readDocuments(limit)` loops `readOne`. Add `readDocuments({ id })` to read just one document.
- **New `proofOf(r, o)`:**
  - `number`: the digits on the card equal the profile `sia_number`;
  - `photo`: `r.face.result === 'match'`.
  - The name is OK when the fit is `'full'`, or `'initial'` and (number or photo).
- **`officerIssues` name rule** (replaces the `nameMatches` line at :248). Using `nameFit` and `proofOf`:
  - `'no'` → `doc_mismatch:<id>:name` (soon), as today;
  - `'initial'` without proof → `doc_name_initial:<id>` (advisory), with the text "Card shows S SCANLON — initial only; no number or photo to confirm". It has no actions and is dismissable.
  - Otherwise nothing.
  - Plus a new `doc_mismatch:<id>:photo` (soon) when `face.result === 'no_match'`.
- **Unverified-scan advisory** (:265): skip documents with `verified_at` set. Documents that Orb applied get `verified_at`.

## 3. Auto-apply: new `functions/api/lib/docAuto.mjs`, `autoApply(docId)`
Loads the document, the officer (active/onboarding, plus applicants with no application) and the read. Not on a cap error.

**SIA (`kind = 'sia'`) applies when all of these hold:**
- readable, with no concerns;
- `licence_type` is in `SIA_TYPES`;
- `expiry` ≥ today;
- the name is OK (§2);
- the profile `sia_number` is empty or equals the card's digits;
- the profile `sia_expiry` is empty or ≤ the card's expiry (never shortens it);
- `d.verified_at` is null.

**When it applies:**
- In a `tx`:
  - `UPDATE officers SET sia_number = COALESCE(NULLIF(sia_number,''), fmt), sia_expiry = r.expiry, sia_type = r.licence_type`;
  - `UPDATE documents SET verified_at = now(), verified_by = NULL, auto_applied_at = now(), number = COALESCE(NULLIF(number,''), fmt), expiry = COALESCE(expiry, r.expiry)`.
- `audit(null, 'orb.apply_sia', 'officer', id, { doc, from, to, name_fit, proof })`.
- `logActivity('compliance', 'Orb applied <name>'s SIA card')`.
- **Register check:** if `siaCheckOn() && autoCheckEnabled()`, run `lookupLicence`. When the outcome is `found`, call a new shared `recordSiaCheck({ officerId, by: null, status, expiry, sector, source: 'auto' })`.
  - This is pulled out of `sia.record` (`modules/sia.mjs`), which then calls it too.
  - It inserts the `sia_checks` row, updates the officer, and alerts managers when the status is not Active.
- The officer is not notified.

**RTW passport (`kind ∈ rtw, id`) applies when all of these hold:**
- `is_passport`;
- `nationality ∈ GBR, IRL`;
- readable, with no concerns;
- `expiry` ≥ today;
- the name fit is not `'no'`;
- `face.result === 'match'`;
- the officer is not `rtw_verified`.

**When it applies:**
- `UPDATE officers SET rtw_verified = true, rtw_type = 'British passport' | 'Irish passport', rtw_expiry = NULL, rtw_checked_at = now(), rtw_checked_by = NULL, rtw_method = 'orb_passport', rtw_check_doc = d.id`, and mark the document verified / `auto_applied_at`.
- `tickOnboarding(o.id, 'rtw')`, `audit(null, 'orb.apply_rtw', …)`, `logActivity`.

**Afterwards:** `runCompliance({ officerIds: [o.id] })`, so cards update or close straight away.

**Hand change stands:** `autoApply` only runs from `readOne`, which runs once per `s3_key` (`ai_read_key`). A manual edit is never overwritten until a new file arrives.

**Migration `055_doc_auto.sql`:** `ALTER TABLE documents ADD COLUMN IF NOT EXISTS auto_applied_at timestamptz;` (`rtw_method` is free text, so no change is needed there).

## 4. Read straight after upload
- **New action `docs.read`**, `def(ALL)`, `{ id }`:
  - `assertOwner`;
  - only kinds sia/rtw/id with an `s3_key` that hasn't been read;
  - runs `readDocuments({ id })`;
  - returns `{ applied: 'sia' | 'rtw' | null }`. Errors are swallowed and the 5-minute job stays as the backstop.
- **Client, after a successful `docs.create`** (officer `Documents.jsx`, manager `DocSheet` in `_profileTabs.jsx`): fire `api('docs.read', { id })` without awaiting it.
  - On the manager side, `.then(reload)`.
  - On the officer side, a toast "Checked — added to your profile" when `applied`.
- **Staff set-up `createFromSubmission`** (`modules/staffSetup.mjs`): after inserting the docs, loop `readDocuments({ id })` for its sia/rtw/id docs, best effort and wrapped in try.

## 5. Existing uploads (backfill, part of the approved spec)
- Migration `055` also clears the stored read for the **latest** sia/rtw/id document per active/onboarding officer that isn't `verified_at`:
  - `UPDATE documents SET ai_read_key = NULL WHERE id IN (SELECT DISTINCT ON (owner_id, kind) id … ORDER BY owner_id, kind, created_at DESC)`.
- The 5-minute job (`docRead`, 4 per run) and the compliance run (8 per run) then re-read them with the new rules, so they auto-apply and old name cards close on their own via `clearedCards`.
- This is a production data change, but it only resets a cache flag. It's covered by the approved spec, and I'll call it out in the report.

## 6. Profile: show the documents (`app/src/pages/people/_profileTabs.jsx` `ComplianceTab`)
- **API, `officers.get`** (manager shape only, never for venue/officer views; check `shapeOfficer`): add `id_docs`.
  - It contains the latest 2 `sia` uploads within 30 days of each other (front/back), and the latest passport/ID (`kind = 'id'`, or `'rtw'` with `ai_read->>'is_passport' = 'true'`), excluding `rtw_check_doc`.
  - Each entry: `{ id, kind, title, mime, url: downloadUrl(...) }`.
- **New `DocThumbs` component** (in `people/_parts.jsx`):
  - 72px rounded thumbnails;
  - images use `<img src=url>`, PDFs show a FileText tile;
  - a tap opens the viewer (§7) with the set.
  - It goes under the KV in the SIA tile (sia) and the Right to work tile (passport/ID).
- **RTW "Checked" line:** `rtw_method === 'orb_passport'` gives "Verified by Orb from an uploaded passport, {date} — original not seen in person", with a muted pill "See original". A Check again records it in person and overwrites the method.
- **Officer `Documents.jsx`:** documents with `auto_applied_at` show "Checked by Orb" in place of "Checked".
- **Docs list API** (if the client needs it): include `auto_applied_at` (verify `docs.list` selects `d.*`).

## 7. In-app viewer for every attachment
**New `app/src/ui/FileViewer.jsx`:**
- A host component mounted once at the app root (where `Toaster`-style hosts live; check `App.jsx` / `Shell.jsx`).
- A module-level `viewFiles(files, index = 0)`, where `files = [{ url?, load?: () => Promise<{url, mime?, name?}>, name, mime }]`.
- Full screen on phone, a large centred panel (`max-w-5xl`) on desktop.
- Top bar: name, "1 of N", Download (`<a href download>` via `saveBlob`/url) and Close. Esc/back closes it (push a history state, as Sheet does).
- **Content by type:**
  - Image: reuse the Lightbox gesture code. Extract its zoom/swipe body into `ImageStage` so both use it.
  - PDF: `PdfPages` (lazy).
  - Other: a card with the name, type and Download.
- The mime comes from the file, or from the extension of the name or URL.

**Wiring:**
- `docs.url` returns `{ url, mime, name }`.
- `openUrl(fn)` in `people/_parts.jsx` becomes `viewFiles([{ load: fn }])` (same signature, so all 6 call sites keep working).
- `downloadAction` in `api.js`:
  - `d.url` → `viewFiles`;
  - `d.pdf` (base64) → a blob URL → `viewFiles` with Download;
  - CSV is unchanged.
- **Sweep the remaining file `window.open` / `target="_blank"` links to app-served files** (grep `window.open(` and `target="_blank"` in `app/src`): `officer/Documents.jsx:92`, `money/VenueDetail.jsx:968`, `email/Thread.jsx:200`, plus message/post/incident/contract/invoice/payslip/venue-pack attachment links.
  - Each becomes `viewFiles`.
  - Photo galleries that already use `Lightbox` stay.
  - External sites (GOV.UK, "Our website") stay as new tabs.

**ui-lint:** no raw `<button>` (use Pressable/Button), icon sizes 16/18/20/24, and the count stays ≤69.

## 8. What's new
- Top card in `app/src/pages/people/_whatsnew.jsx`, dated 2026-11-08, icon `ScanLine`: title "Uploads make officers compliant on their own". It covers:
  - SIA auto-apply;
  - initials accepted with proof;
  - British/Irish passport auto RTW (labelled);
  - document pictures on the profile;
  - files open in the app.
- Prompt `orb-auto-compliance` in `app/scripts/whatsnew-images.mjs`. Generate it from the repo root, then look at it.
- Add Orb catalog entries in `lib/orbCatalog.mjs`: `docs.read`.
- Add audit labels for `orb.apply_sia` / `orb.apply_rtw` wherever audit labels live (grep `'officer.rtw_check'`).

## Verification
1. `cd functions/api && node --test test/names.test.mjs` (plus the existing compliance tests, if any: `ls test | grep compl`). Check the modules import: `node -e "import('./modules/compliance.mjs')"`, plus `lib/docAuto.mjs`, `modules/sia.mjs` and `modules/documents.mjs`.
2. **Unit check of `officerIssues`** with a hand-built officer (Scott Scanlon) and a read `{name:'S SCANLON', number matching, face match}`: no name issue. With no proof: only the advisory. `{name:'J SCANLON'}` gives a mismatch.
3. **`autoApply` decision function:** make it pure (`decide(o, d, r, today)` returns the action), test it with node, and cover each condition.
4. **Build:** `npm run build` in app/. ui-lint ≤69, and the emergency/flow checks are OK.
5. **Mock** (`/tmp/mock/server.mjs`):
   - `officers.get` with `id_docs` (an image and a PDF) and `rtw_method: 'orb_passport'`;
   - `docs.url` returns `{url, mime}` for a sample image and PDF served by static;
   - `docs.read` returns `{applied:'sia'}`.
   - Screenshots at 1280 and 390:
     - the Compliance tab thumbnails and the RTW label;
     - the viewer on an image (zoom), a PDF, and N-of-M swiping;
     - officer Documents "Checked by Orb";
     - a Documents-tab file opening in the viewer, not a tab.
   - Then `agent-browser close --all` and stop the mock by PID.
6. I won't run any production writes by hand. The deploy applies migration 055 (check how migrations run on `openkbs fn deploy`, and confirm with the user first if they're manual).

## Ship
- **Commit (explicit paths):**
  - functions: `lib/names.mjs`, `lib/face.mjs`, `lib/docAuto.mjs`, `modules/compliance.mjs`, `modules/documents.mjs`, `modules/sia.mjs`, `modules/staffSetup.mjs`, `modules/officers.mjs`, `lib/orbCatalog.mjs`, `db/migrations/055_doc_auto.sql`, `test/names.test.mjs`;
  - app: `lib/names.js`, `ui/FileViewer.jsx`, `ui/Lightbox.jsx`, the root host file, `api.js`, `people/_parts.jsx`, `people/_profileTabs.jsx`, `officer/Documents.jsx`, plus the swept files;
  - What's new: `_whatsnew.jsx`, `whatsnew-images.mjs`, the webp;
  - the spec md.
  - Then commit `site/`.
- **Deploy:** `openkbs fn deploy api`, then `openkbs site deploy` (v158), then `git push origin master --tags`.
- **Live check:** `index-*.js` contains `6ij75kpgf7` and not `hopedp5`, and the webp returns 200.
