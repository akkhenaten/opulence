# Spec: Stronger clock-in proof — registered phone, secure NFC tags, selfie with face match

## Goals
- **Stop buddy clocking.** A colleague must not be able to clock someone in, from another phone or with that person's login.
- **Give officers a dependable second way to prove they are on site.** Today the QR code and GPS sometimes fail. NFC tags and a selfie fix this.
- **Keep shifts moving.** An officer who cannot meet the rule can still clock in. The clock-in is flagged for a manager, exactly as today.
- **Give managers clear evidence at a glance.** This includes which proofs passed, the selfie, the face-match score and the phone used.

## Today (for reference)
- **Clock-in:** the officer scans a static QR poster at the venue and passes a GPS geofence check.
- **Failures:** if either check fails, the officer writes a reason and the clock-in becomes an exception for a manager to approve or reject.
- **Clock-out:** checks location only. A failure is flagged but never blocks.
- **Gaps:** there is no phone binding, no selfie and no NFC. The QR never changes, so a photo of it works.

## Functional requirements

### 1. Registered phone (passkey)
- **First registration.** Each officer registers their phone once. The app asks for the phone's fingerprint, Face ID or screen lock, using a passkey.
- **Every clock-in and clock-out.** The app asks for the same fingerprint, Face ID or screen lock, and verifies it against the registered phone.
  - A different phone fails.
  - Knowing the officer's password is not enough.
- **Number of phones.** An officer has one active registered phone at a time.
  - Registering a new phone (lost, broken or upgraded) needs a manager to approve it.
  - Until it is approved, the officer's clock-ins on the new phone are exceptions.
- **First ever registration.** It is self-service, with no approval. It is recorded and visible to managers.
- **Manager controls.** Managers can see each officer's registered phone (model and browser, date registered, last used). They can revoke it.
- **Unsupported phones.** If the phone or browser cannot do passkeys, the officer is told clearly. Their clock-ins become exceptions with the reason "phone not verified".

### 2. Proof rule
- **Clock-in:** a registered phone is always required, plus at least **2 of 3** of the following:
  1. **Location:** inside the venue geofence, as today.
  2. **Venue code:** either the QR poster or a tap on the venue's NFC tag.
  3. **Selfie:** a live selfie taken in the app.
- **Clock-out:** registered phone plus location. A failure is flagged but never blocks, as today.
- **Breaks:** unchanged, with no checks.
- **Per-venue setting.** Each venue chooses one of these rules:
  - "Phone + 2 of 3" (the default for all venues);
  - "Phone + any 1" (for awkward sites, such as underground venues with no GPS);
  - "Phone + all 3" (high security).
- **Officer guidance.** The officer sees which proofs they have passed. The app tells them what else they need, for example "1 more: tap the tag or take a selfie".
- **If the rule is not met:** the officer can submit an exception with a reason. It is saved, flagged and sent to managers, as today. Nobody is ever stuck at the door.
- **Officers on the Live board.** An officer who is also a manager and approves their own exception keeps today's self-approved handling.

### 3. Secure NFC tags
- **Tag type.** Venues can have one or more secure NFC tags, of a type that produces a new one-time code on every tap.
  - A copied, photographed or replayed tap must be rejected.
- **Tapping.** The officer taps the phone on the tag. The app opens on the clock-in screen with the venue code already proven. This must work on iPhone and Android.
- **Pairing.** Managers pair a tag to a venue in the venue settings, by tapping it during setup, and give it a label such as "Front desk".
  - A tag can be paused or removed.
  - The app shows each tag's last tap.
- **Venue identity.** A tag paired to venue A does not count at venue B.
- **QR poster.** It stays as an alternative venue code. Tags do not replace it.
- **Missing tags.** A venue without tags simply uses the QR poster.

### 4. Selfie with face match
- **Capture.** The selfie is taken live with the front camera inside the app.
  - Gallery uploads are not possible.
  - The officer sees a framing guide.
- **Storage.** The selfie is stored with the clock-in and shown to managers, next to the officer's profile photo, in:
  - the Exceptions review;
  - the timesheet or punch detail;
  - the Live board.
- **Face match.**
  - **Scoring.** For officers who consented, the selfie is compared automatically with their profile photo and given a match result: Match, Unsure or No match.
  - **No match or Unsure:** the selfie still counts toward the rule, but the clock-in is flagged "face check" for a manager to review. It is never blocked automatically.
  - **No usable profile photo:** no score is given. The selfie is still kept for manual review, and the officer is prompted to add a profile photo.
- **Consent.**
  - Officers are asked once to consent to face matching, with a plain explanation of what is compared, why, and how long it is kept.
  - Consent is recorded with a date and can be withdrawn at any time from their profile.
- **Declining.** An officer who declines still has selfies taken and reviewed by eye. They are not scored, and the selfie still counts toward the rule.
- **Retention.**
  - Selfies are deleted automatically after **90 days**.
  - Selfies attached to an exception or a disputed timesheet are kept until the dispute or exception is closed, plus 90 days.
- **Company switch.** Face matching can be switched off for the whole company in settings. When it is off, selfies are for review only.

### 5. Manager visibility
- **Proof summary.** Every punch shows: phone ✓/✗, location ✓/✗ (distance), venue code (QR / NFC / none), selfie (thumbnail + match result).
- **Exceptions list.** It shows why a clock-in is flagged (rule not met, phone not verified, face check, new phone) and lets managers approve or reject, as today.
- **Phone approvals.** New-phone approval requests appear alongside exceptions.
- **Reports.** A compliance or report view shows, per officer and per venue over a period:
  - how often each proof failed;
  - the exception rate;
  - face-check flags.

### 6. Orb assistant
Orb can answer questions about clock-in proofs and pending phone approvals, for example "who clocked in without a selfie today" or "any new phones waiting?". It can approve or reject phone changes with a confirmation, in the same way as other manager actions.

## User stories
- **Officer, normal clock-in:** I arrive, tap the tag at the front desk, confirm with my fingerprint and I'm clocked in. GPS wasn't needed because the tag and my selfie made two proofs.
- **Officer, GPS failure:** GPS fails underground. I scan the QR code and take a selfie, and I'm clocked in.
- **Manager, buddy clock-in attempt:** a colleague tries to clock me in from their own phone. It fails the phone check, I see it flagged with their selfie, and I reject it.
- **Officer, new phone:** I get a new phone. I register it, my manager approves it, and my clock-ins go back to normal.
- **Officer, declined face matching:** I declined face matching. My selfies are still taken, but no score is calculated.

## Acceptance criteria
- **Phone check.**
  - A clock-in from a phone that is not the officer's registered phone never counts as an OK clock-in. It becomes an exception marked "phone not verified".
  - The same applies when the passkey check is cancelled or fails.
- **Rule outcomes at the default rule.**
  - Phone + location + QR → OK.
  - Phone + NFC + selfie (GPS failed) → OK.
  - Phone + location only → exception.
- **NFC.**
  - A replayed or copied NFC tap is rejected.
  - A tag from another venue is rejected.
  - Both work on a current iPhone and a current Android.
- **Selfie and face match.**
  - The selfie cannot come from the gallery.
  - A selfie of a different person from a consenting officer is flagged "face check".
  - Non-consenting officers never get a score.
- **Retention.** Selfies older than 90 days with no open exception or dispute are deleted automatically.
- **Rule change.** Changing a venue's rule takes effect on the next clock-in.
- **Existing data.** Existing timesheets, exceptions and the Live board keep working, and old punches show "not recorded" for the new proofs.

## Constraints
- **App type.** The app stays a web app (PWA); there is no native app store build. Everything must work in the current app on iPhone (Safari) and Android (Chrome).
- **Data protection.**
  - Face matching is biometric data under UK GDPR. It requires explicit consent, a way to withdraw it, a non-biometric alternative, limited retention and a data protection impact assessment by the company.
  - The app provides the consent records and settings. The assessment itself is the company's responsibility.
- **Costs.**
  - The company buys the secure NFC tags, about £3–£8 each.
  - Face matching uses AI credits per clock-in. A monthly cap should be shown, like the other AI caps.

## Out of scope
- **Hardware:** RFID card readers or fixed hardware terminals at venues.
- **Fixed-hardware biometrics:** fingerprint scanners or face terminals on site.
- **Rotating QR codes on a screen at the venue.**
- **Blocking without a fallback:** automatic blocking of clock-ins with no way to submit an exception.
- **Extra breaks checks:** proof checks on breaks.
- **Multiple phones:** more than one registered phone per officer at once.

## Assumptions (change if wrong)
- **New phone:** registering a new phone needs manager approval; the first registration does not.
- **Selfie retention:** 90 days, longer while an exception or dispute is open.
- **Face match outcome:** it flags for review and never blocks.
- **Default rule:** "Phone + 2 of 3" for every venue; venues can be set looser or stricter.
