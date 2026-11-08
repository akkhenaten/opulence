# Implementation plan: notification tiers, platform admin and venue live alerts (v159)

## Context
The spec was approved and is saved at `spec/plan-who-gets-which-notification-and-which-ones-reach-the-ph.md`. It has three parts:
- Every notice gets a tier (Urgent / Action / FYI). Only Urgent and Action reach the phone, and Urgent is also emailed.
- The platform admin stops getting Opulence's operational broadcasts.
- Venue managers hear about no-shows at their venue and confirmed replacements.

No database migration is needed.

## 1. Tier engine: `functions/api/lib/notify.mjs`
- Add `export const TIER` (kind → `'action' | 'fyi'`):
  - **action:** `shift, open_shift, cover, late, clock_out, clock_exception, pack_blocked, venue_pack, contract, pay, timeoff, timesheet, incident, message, mention, reminder, expiry, compliance, demo, staff_setup`
  - **fyi:** `hr, feed, announcement, reaction, comment, tag, shoutout, event, celebration, training, review, invoice, feedback, ops, applicant, app_feedback`
  - Unknown kinds default to fyi.
- Add `export function tierOf(kind, severity, tier)`:
  - an explicit `tier` wins;
  - otherwise `critical` → urgent;
  - otherwise `warning` → at least action;
  - otherwise `TIER[kind] || 'fyi'`.
- `notify(...)` gets a new `tier` option, and `email` defaults to `undefined`:
  - push only if the tier is urgent or action;
  - send the email when `email === true`, or when the tier is urgent and `email !== false`;
  - the push payload becomes `{ title, body, link, tier }`.
- `companyManagers()` adds `AND NOT system AND lower(email) <> ALL($1::text[])` with `platformEmails()` from `lib/platform.mjs`.
- Add `platformAdmins()`: active users whose `lower(email) = ANY(platformEmails())`.

## 2. Push delivery
- `lib/webpush.mjs` `sendPush(sub, data)`: set the `Urgency` header to `high` for urgent and `normal` for action.
- `app/public/sw.js` push handler: add `requireInteraction: d.tier === 'urgent'`. Bump `CACHE` to `orb-shell-v5`.

## 3. Per-call overrides (only where kind + severity gives the wrong tier)
**Urgent (officer):**
- `rota.mjs` `cancelShift` (:104) and "Removed from shift" (:299, :329) → `tier: 'urgent'`.
- `rota.mjs` `notifyAssigned`: `tier: 'urgent'` when the kind is `'updated'` and the shift starts within 48h.
- `cover.mjs:143` (shift cancelled / retimed) → urgent.
- `compliance.mjs:478` ("Taken off a shift") → urgent.
- `shiftlog.mjs:228` (instruction from manager) → `tier: 'urgent', email: false`, because it's mid-shift and the phone is enough.

**FYI for managers:**
- `hr.mjs:324` and `signLinks.mjs:91` (contract signed) → fyi.
- `hr.mjs:120` (time off requested) → fyi.
- `venuePacks.mjs:701, :797, :822` (pack signed, suggestion made / resolved) → fyi.
- `ops.mjs:1023` ("took the cover shift") is already fyi by kind `ops`.

**FYI for officers:** `money.mjs:330` (payment sent) → fyi.

**Action:** `everyday.mjs` must-ack announcement (`kind: 'feed'`, ~:898) → `tier: 'action'` when `ack`.

## 4. Platform admin
- `demo.mjs:22`: send to `platformAdmins()` instead of the inline company query. Keep `email: true`.
- `lib/ai.mjs:40, :50` (AI cap): notify `[...companyManagers(), ...platformAdmins()]`, with ids made unique.
- `staffSetup.mjs:172` already targets the platform emails; leave it.
- No change to access. The admin keeps the full Company side (`lib/auth.mjs:61`).

## 5. Venue live alerts: `functions/api/modules/ops.mjs`
- **Escalation (~:336):** after `notifyManagers`, notify `venueContacts(sh.venue_id)`:
  - `kind: 'late'`, `severity: 'critical'`
  - title "An officer can't make it to {venue}"
  - body "{when}. We're arranging cover and will tell you when a replacement is confirmed."
  - `link: '/venue/rota'`, `dedupe: \`vesc:${a.id}\``, `ref: \`asg:${a.id}\``
  - The officer is not named.
- **Offer accepted (~:1023):** notify `venueContacts(sh.venue_id)`:
  - `kind: 'cover'` (action)
  - title "Replacement confirmed · {venue}", body "{name} is covering {when}"
  - `link: '/venue/rota'`, `dedupe: \`vtook:${offer.id}\``
- Import `venueContacts` from `lib/notify.mjs`.

## 6. App text
- **`app/src/pages/people/Settings.jsx` `NotificationsTab`** (~:756): add a small read-only "What reaches the phone" tile under the company defaults: three lines for Urgent, Action and FYI with examples.
- **`app/src/pages/officer/_notify.jsx` `NotificationsSheet`:** add the footnote "Urgent and action alerts come to your phone; FYI ones wait under the bell."
- **What's new:** add a card in `app/src/pages/people/_whatsnew.jsx` (date 2026-11-08, `image: 'notify-tiers'`). Add the prompt to `app/scripts/whatsnew-images.mjs` and generate the `.webp`.

## 7. Tests: `functions/api/test/notifyTiers.test.mjs`
- `tierOf`:
  - critical → urgent;
  - warning on an fyi kind → action;
  - an explicit tier wins;
  - an unknown kind → fyi;
  - `reaction` → fyi; `shift` → action.
- **Coverage:** scan `modules/*.mjs` and `lib/*.mjs` for `notify(`/`notifyManagers(`/`tellOfficer(` statements, using a dotall regex up to the closing `});`. Collect each `kind: '...'` and assert every one is a key of `TIER`. This stops new kinds silently becoming FYI.
- The existing `webpush.test.mjs` still passes.

## Ship
1. `npm test` in `functions/api`, then `npm run build` in `app`.
2. Check that `site/app/assets/index-*.js` contains `6ij75kpgf7` and not `hopedp5`.
3. Commit with explicit paths: a feat commit (code, tests, What's new + webp), then `build:` with `site/`.
4. `openkbs fn deploy api` and `openkbs site deploy`.
5. Re-check the live index bundle.
6. Don't send any live notification; you can check with Notifications → Send a test (Action tier).
