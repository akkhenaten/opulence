# Plan: stronger clock-in proof (registered phone, secure NFC tags, selfie with face match)

Spec: `spec/spec-stronger-clock-in-proof-registered-phone-secure-nfc-tag.md`

## Context
Clock-in today checks two things: a static, signed QR poster (`lib/qr.mjs`) and a GPS geofence (`lib/geo.mjs`), both in `modules/clock.mjs` `clock.punch`. When a check fails, the officer gives a reason and the clock-in becomes an exception, which managers decide in `manager/Exceptions.jsx`.

Nothing ties a punch to a person or their phone, so buddy clocking is easy. QR or GPS failures push officers into exceptions.

The approved rule is:
- **Clock-in:** the registered phone (passkey) is always needed, plus 2 of 3 of location, venue code (QR or secure NFC tag) and selfie. Each venue can choose a looser or stricter rule.
- **Clock-out:** phone plus location, flagged but never blocked.
- **Face match:** runs only for officers who consent, flags for review and never blocks. Selfies are deleted after 90 days.

The app is a web PWA with no native wrapper, and the API bundle is about 3.96 MB, close to the 4 MB limit. **So: no new npm dependencies.** WebAuthn verification, a small CBOR decoder and AES-CMAC are written by hand on `node:crypto`.

## Data model: `functions/api/db/migrations/022_clock_proof.sql`
- **`officer_devices`**:
  - columns: id, officer_id, credential_id (unique), public_key (SPKI DER), alg, sign_count, label (phone/browser summary), status (`active|pending|rejected|revoked|replaced`), created_at, last_used_at, decided_by, decided_at.
  - **Constraint:** at most one `active` row per officer (partial unique index).
- **`passkey_challenges`**: id, user_id, purpose (`register|clock`), challenge, expires_at (5 min), used_at. Each challenge is single use.
- **`venue_tags`**:
  - columns: id, venue_id, uid (unique), label, status (`active|paused`), last_counter, last_tap_at, created_by, created_at;
  - plus **`tag_pairing`**, recorded on the venue as `pairing_until` and `pairing_by`.
- **`tag_taps`**: id, tag_id, user_id, counter, tapped_at, expires_at (10 min), used_by_event. A single-use proof that a clock-in can spend.
- **`venues.proof_rule`**: `any_one|two_of_three|all_three`, default `two_of_three`.
- **`officers`**: `face_consent` (`given|declined|null`), `face_consent_at`.
- **`settings`**: `face_match_enabled` (default true), `nfc_meta_key` and `nfc_file_key` (hex AES-128, generated in code on first use), and an `ai_module_caps.clock_face` default (100,000 credits, only when none is set, as in `020_orb_voice_cap.sql`).
- **`clock_events`** gains:
  - `device_ok`, `device_id`
  - `venue_code` (`qr|nfc|null`), `tag_id`
  - `selfie_key`, `selfie_deleted_at`
  - `face_result` (`match|unsure|no_match|unscored|null`), `face_note`
  - `proof_rule`
  - `flags text[]` (`phone_not_verified`, `new_phone`, `rule_not_met`, `face_check`)
- **Old rows:** everything stays null, and the UI shows "not recorded".

## API (functions/api)

### `lib/passkey.mjs` (new, no dependencies)
- **Relying party:** the RP id and origin come from `APP_URL`, which `lib/esign.mjs` already uses.
- **Helpers:**
  - `options({ user, purpose, credentialIds })` returns the WebAuthn options and stores the challenge.
  - `verifyRegistration(body)` checks the clientData type, challenge, origin, rpIdHash and the UP and UV flags. It decodes the attestationObject with a minimal CBOR decoder (attestation `none`) and turns the COSE key into JWK and then a KeyObject.
  - `verifyAssertion(body, device)` runs the same checks, then verifies the signature over authData‖sha256(clientData) for ES256 (DER) or RS256. It also checks that the sign count is non-decreasing (0 is allowed, because synced passkeys report 0).
- **Note:** passkeys belong to the RP host. If a custom domain replaces the CloudFront host later, officers will need to re-register. I'll note this in the code comment and the final report.

### `lib/sun.mjs` (new): NTAG 424 DNA "SUN" verification
- **Decrypt:** `p` (PICCData) is decrypted with AES-128-CBC and a zero IV using the meta key. The result gives tag byte 0xC7, the 7-byte UID and the 3-byte LE counter.
- **Session key:** SV2 = `3CC300010080‖UID‖ctr`. The session MAC key is CMAC(file key, SV2), and the expected `c` is CMAC(session key, ∅) truncated to its odd bytes.
- **CMAC:** AES-CMAC is built on aes-128-ecb.
- **Tests:** unit tests against the NXP AN12196 test vectors.
- **Keys:** one company key pair. Every tag is programmed with the URL template `${APP_URL}/app/t?p={PICC}&c={CMAC}`.

### `lib/face.mjs` (new)
- **Call:** `faceMatch({ selfieBytes, profileBytes })` calls Gemini (`gemini-flash-latest`) through the proxy (same fetch and auth pattern as `transcribe`/`drawImage` in `lib/ai.mjs`), with low thinking and a JSON schema `{ result: match|unsure|no_match, note }`.
- **Cap and usage:** it uses `checkCap('clock_face')` and `logUsage`, with a 10 s timeout.
- **Failure:** any error, refusal or exhausted cap gives `unscored`, never an error to the officer.
- **Wording:** prompt and UI copy call it a decision aid for a manager, not identification.

### `lib/proof.mjs` (new, pure)
`evaluate({ rule, device_ok, geo_ok, venue_code_ok, selfie_ok })` returns `{ met, count, need, missing[] }` and is unit-tested.

### `modules/clock.mjs` changes
- **`clock.passkeyOptions`** (officer): returns assertion options for the officer's active, or pending, device. If no device is registered it returns `{ register: true }`.
- **`clock.punch`** extends today's logic and keeps the compliance block, the 30-minute early window and breaks unchanged. For `in` and `out`:
  - **Phone check:** `verifyAssertion` against the officer's devices. Active gives `device_ok`. Pending gives the flag `new_phone`. A missing or failed check gives the flag `phone_not_verified`. Every phone-check failure makes the punch an exception, with no 422 (spec: always exception).
  - **Venue code:** the QR is checked as today. Alternatively, `tap_id` is accepted: an unexpired, unused `tag_taps` row for this user whose tag belongs to the shift's venue. The row is marked used.
  - **Selfie (in only):** the key must sit under `docs/selfies/<user8>/`. `headObject` must show an image under 3 MB, uploaded within the last 5 minutes (extend `headObject` to return `LastModified`). The face match then runs if company matching is on, the officer consented and a profile photo exists.
  - **Rule check (in only):** `evaluate` with `venues.proof_rule`. When the rule isn't met and there's no reason, it returns 422 with `problems`, `missing` and `can_request_exception`, as today. With a reason, the punch becomes an exception plus `rule_not_met`.
  - **Face result:** `no_match` or `unsure` makes the punch an exception plus `face_check`. It still counts toward the rule.
  - **Clock-out:** only the phone and location are checked, flagged as today.
  - The notify text lists the flags.
- **`clock.tagTap`** (officer or manager, body `{p, c}`):
  - Verifies the SUN code and finds the tag by UID.
  - **Replay protection:** an atomic `UPDATE venue_tags SET last_counter=$ctr … WHERE last_counter < $ctr AND status='active' RETURNING`; a replayed tap is rejected.
  - **Officer:** creates a `tag_taps` row and returns `{ tap_id, venue_name }`.
  - **Manager in pairing mode with an unknown UID:** binds the tag to that venue instead.
- **`venues.tags` / `venues.tagPair` / `venues.tagUpdate` / `venues.tagRemove`** (MGR, venue scope): list, start a 5-minute pairing window, rename, pause or remove. `venues.update` accepts `proof_rule`.
- **`clock.nfcSetup`** (company only): returns the URL template and the two keys, generated on first call. It is audited.
- **Device actions** (new, in `modules/clock.mjs`):
  - `device.registerOptions` and `device.register` (officer): the first device is `active`; any later one is `pending`, and managers are notified with a link to Exceptions → Phones;
  - `device.list` (MGR, `{officer_id}` or `{pending:true}`);
  - `device.decide` (MGR): approve, which replaces the old device, or reject; guarded by `guardSelf`;
  - `device.revoke` (MGR);
  - `device.mine` (officer).
  - All of these are audited.
- **`officers.faceConsent`** (officer, own record): `{ consent: true|false }`, recorded with a timestamp and withdrawable.
- **`clock.exceptions` and `live.board`:** also return `flags`, `venue_code`, `face_result`, `selfie_url` and `profile_photo_url`, all through `downloadUrl`. They are hidden from the `venue` role, like events today.
- **`buildTimesheet`:** carries the `face_check` and `phone_not_verified` flags onto timesheets.
- **`clock.proofReport`** (MGR, `{from, to, venue_id?}`): per officer and per venue, it returns punches, failures per proof, exception rate and face-check flags.

### Other API pieces
- **`modules/documents.mjs`:** the upload purpose `selfie` maps to the `selfies` folder.
- **`modules/jobs.mjs` `runJobs`:** an hourly `selfieJobs`:
  - **Deletes:** selfies more than 90 days old (`deleteObject`, then `selfie_key=null`, `selfie_deleted_at=now()`), unless the event is still `exception` or its timesheet is `disputed`.
  - **Expires:** stale `tag_taps` and `passkey_challenges`.
- **`lib/orbCatalog.mjs`:**
  - **Reads:** `device.list`, `clock.proofReport`, `clock.exceptions`, already present if so.
  - **Confirm entries:** `device.decide`, `device.revoke`.
  - **Banned:** `clock.tagTap`, `clock.nfcSetup`, `device.register*` and `clock.passkeyOptions`. Orb must not use these.

## App (app/src)
- **`lib/passkey.js`** (new): base64url helpers plus `createPasskey(options)` and `getPasskey(options)` around `navigator.credentials`, with friendly errors for unsupported phones and cancellations.
- **`pages/officer/Clock.jsx`**, in-flow:
  1. **Phone step:** `clock.passkeyOptions`. If registration is needed, a "Register this phone" step (`device.register`); if the result is pending, a note that a manager must approve it. Then the fingerprint or Face ID prompt.
  2. **Location:** as today.
  3. **Venue code:** skipped when the flow already holds a `tap_id`. Otherwise the QR scan, with "Tap the NFC tag instead" guidance and "I can't scan".
  4. **Selfie step**, shown when the rule still needs it or the venue rule is `all_three`:
     - a new `SelfieCamera` uses `getUserMedia({ facingMode: 'user' })`, an oval guide and a canvas JPEG at about 720 px, uploaded with `files.uploadUrl` purpose `selfie`;
     - there is no file input;
     - the first time, a consent sheet appears (Allow face check / No thanks) calling `officers.faceConsent`.
  5. **Punch:** a 422 shows the missing proofs with buttons for each remaining option, plus today's exception form.
  - **Proof checklist:** a small header lists the proofs, e.g. "Phone ✓ · Location ✓ · Venue code — · Selfie —", with the "1 more needed" copy.
  - **Clock-out:** phone, then location.
- **`pages/officer/TagTap.jsx`** (new route `/t`, outside the role shells, login required, returns here after login): calls `clock.tagTap`.
  - **Officer:** goes to `/officer/clock?tap=<id>`.
  - **Manager pairing:** shows "Tag paired to {venue}".
  - **Errors:** clear messages for replayed, unknown or paused tags.
  - **iPhone:** tag taps open Safari, so the officer may need to sign in there once. Passkeys work in both Safari and the home-screen app.
- **`pages/manager/Exceptions.jsx`:**
  - **New flags:** Phone, Venue code (QR/NFC), and Selfie (thumbnail next to the profile photo, with a face-result pill and a Lightbox on tap).
  - **Flag reasons:** shown as pills.
  - **New tab "Phones":** pending new-phone requests with Approve and Reject.
  - **Subtitle:** updated to cover all clock-in checks.
- **Venue page `pages/money/VenueDetail.jsx`:**
  - the QR tab becomes **"Venue codes"**, with the QR (unchanged) plus an **NFC tags** section: list, "Pair a tag" (starts pairing; tells the manager to tap the tag now), label, pause and remove, last tap;
  - **"Clock-in rule"** select in Details.
- **Settings → Workforce rules:** a "Clock-in proof" block:
  - face matching on/off;
  - the selfie retention note (90 days);
  - "NFC tag setup" (company role): reveal the URL template and keys behind a confirm, with programming instructions (NXP TagXplorer/TagWriter, or send to a tag supplier).
  - The clock_face cap appears automatically in the existing AI caps list in `OpsAI.jsx`; add its label.
- **Officer profile (`Me`/`Profile`):** "My phone" card (registered phone, date, last used) and a face-check consent toggle.
- **Manager officer profile (`_profileTabs.jsx`):** "Registered phone" card with Revoke.
- **Live board (`shared/Live.jsx`):** selfie thumbnail and face pill on the clock-in event, for manager roles only.
- **Reports:** a "Clock-in proof" report using `clock.proofReport`, with a table per officer and per venue, following the existing Reports layout.

## Tests (`functions/api/test`)
- `passkey.test.mjs`: generate EC P-256 and RSA keys with `node:crypto`, build synthetic authData, clientData and attestation (`none`) to cover:
  - the happy path;
  - wrong origin, wrong challenge, reused challenge, missing UV, a falling sign count and a bad signature.
- `sun.test.mjs`: AN12196 vectors, plus a tampered CMAC and the wrong key.
- `proof.test.mjs`: every rule against the proof combinations from the spec's acceptance criteria.
- Keep `npm test` green.

## Build order
1. Migration, `proof.mjs`, `passkey.mjs`, `sun.mjs` and unit tests.
2. Device actions and passkey in `clock.punch`; Clock.jsx phone step.
3. NFC: tag actions, `/t` page, venue Venue codes tab, NFC setup in settings.
4. Selfie: upload purpose, SelfieCamera, consent, `face.mjs`, punch integration, retention job.
5. Manager views: Exceptions (flags, selfies, Phones tab), Live, officer profiles, rule select, proof report, Orb catalog.
6. Verify, commit, deploy the API and site, clean up test data, update the board card.

## Verification
- **Automated:** `cd functions/api && npm test` and `cd app && npx vite build`.
- **Live API, via node scripts using `/tmp/lt.sh` tokens:**
  - **Software authenticator:** register a phone (it becomes active).
  - **Second phone:** registering it gives pending, then the manager approves it.
  - **Punches:**
    - with a valid assertion: device_ok;
    - with no assertion or the wrong key: an exception with `phone_not_verified`.
  - **Rule matrix:**
    - phone + location + QR → ok;
    - phone + NFC + selfie with no GPS → ok;
    - phone + location only → 422, then an exception when a reason is given.
  - **NFC:**
    - generate SUN URLs with the company keys (simulated tag);
    - pair the tag;
    - tap → tap_id → punch;
    - a replayed URL is rejected;
    - another venue's tag is rejected.
  - **Selfie:**
    - upload a generated face photo plus a matching profile photo → `match`;
    - a different face → `no_match` and `face_check`;
    - an officer without consent → no score.
  - **Retention:** backdate one test event and run the jobs → the selfie is deleted.
- **Browser** (agent-browser, Classic and Control Room, 390 and 1280):
  - the clock flow screens (phone step, proof checklist, selfie camera using Chromium's fake camera);
  - Exceptions with the Phones tab;
  - the venue Venue codes tab;
  - Settings → clock-in proof;
  - officer profile.
  - Run `agent-browser close --all` afterwards.
- **Not testable here:** real NFC hardware and real phone biometrics. These are covered by the vector tests and simulated authenticator/tag scripts. The final report tells the user to do a real tap and Face ID test on one iPhone and one Android.
- **Cleanup:** remove test devices, tags, taps, selfies (S3 and rows), events and consent changes from the demo DB.
- **Ship:**
  - Commit (code and spec; exclude the site bundle, as before), then run `openkbs fn deploy api`, `npx vite build` and `openkbs site deploy`.
  - Push to origin, then move the board card to Review with a plain-language comment.
- **Final report:**
  - NFC tags need programming (keys and URL), either by the company or by a supplier.
  - Passkeys are tied to the current app address.
  - Face matching needs the company's data protection impact assessment.
