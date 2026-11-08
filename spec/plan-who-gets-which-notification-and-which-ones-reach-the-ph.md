# Plan: who gets which notification, and which ones reach the phone (v159)

## Context
Today every one of the ~130 notices in the API makes the phone buzz, whether it's a no-show or "X reacted to your post". Company managers get everything for every venue. The platform admin (info@orbsolutions.co.uk) counts as a Company manager, so it is pinged for all of Opulence's daily operations. Clients (venue managers) get the paperwork but none of the live moments at their venue.

You picked **three tiers** for the phone. The other two questions weren't answered, so I've used my recommendation for both (marked *assumed*). Say if you'd rather have it the other way.

## The three tiers
- **Urgent:** phone + email + bell. Safety, people not turning up, changes at short notice.
- **Action:** phone + bell. Something the person needs to do or know today.
- **FYI:** bell only, no phone buzz. Can be read whenever.

Any notice raised as `critical` is Urgent, and any `warning` gets at least Action, whatever its kind.

## Recommended matrix

### Officers
| Tier | Notices |
|---|---|
| Urgent | Shift cancelled; removed from a shift; shift times changed at short notice; document or SIA expiring in 7 days or less; instruction from manager during shift |
| Action | New shift assigned / published / request approved; 2-hour shift reminder; open shifts available; site pack to sign; clocked out by a manager; contract / policy / pay rise to sign; pay statement to check; time off decided; incident needs more detail; timesheet queried; new phone approved or not; you're leading this shift; handover from venue; chat messages and @mentions; announcements that must be read |
| FYI | Payment sent; goal and 1:1 notes; training passed / new training; Everyday reactions, comments, shout-outs, tags, celebrations, events; post hidden or removed |

### Company managers (Opulence)
| Tier | Notices |
|---|---|
| Urgent | High/critical incident; officer can't make it / no-show; shift declined under 48h; SIA register not cleared; staff documents expiring in 7 days or less |
| Action | Officer not clocked in; clock-in exception; site pack blocking a clock-in; new cover request / change to booked cover; timesheet queried; pay query; officer wants a new phone; Orb inbox cards marked warning |
| FYI | Orb inbox cards marked info; contract / policy / pay rise signed; time off requested; goal updates; new applications; reviews to approve; training due for review; invoices overdue; Everyday moderation; venue feedback; site pack signed; AI cap reached |

### Security managers
They get the same as Company managers, but only for their own venues (this already works through `securityFor`). They don't get company-wide items: applications, pay, contracts, SIA register.

### Venue managers (clients)
| Tier | Notices |
|---|---|
| Urgent | Urgent incident at their venue; **new:** an officer can't make it / no-show at their venue (*assumed yes*) |
| Action | Cover request accepted / declined / change decided; ban to confirm; timesheets ready to sign / re-check; **new:** replacement officer confirmed (*assumed yes*) |
| FYI | Invoices and credit notes (these are already emailed too); rate your officers; shift log ready; replies to their feedback |

### Platform admin (*assumed: platform items only*)
- **Gets:** app feedback, staff set-up forms, demo requests, AI cap reached.
- **No longer gets:** Opulence's operational broadcasts sent through `companyManagers()`.
- Everything stays in the app to open; the admin just isn't pinged for it.

## Implementation
1. **`functions/api/lib/notify.mjs`**
   - Add `TIER` by kind and `tierOf(kind, severity)`: critical → urgent, warning → at least action, otherwise from the kind map. Kinds not in the map default to FYI.
   - Only push for urgent and action.
   - Email when the call already sets `email: true`, or when the tier is urgent and the recipient is a manager or venue user. Existing per-call `email` flags stay as they are.
   - Add `tier` into the push payload (for later use; the service worker ignores it for now).
2. **Kinds that need splitting.** Some kinds mix weights, so a few calls get a more specific kind or a severity:
   - `shift`: cancelled / removed → `warning` (already are); "shift notes updated" and "leading this shift" stay `shift` and are Action.
   - `hr`: goal and 1:1 notes → FYI kind `hr_note`.
   - `contract` signed (manager side, `hr.mjs:324`, `signLinks.mjs:91`) → `contract_signed`, FYI.
   - `feed` moderation → FYI.
   - `ops` info cards → FYI; warning ones are Action through their severity.
   - Grep each `notify(` call to check against the matrix.
3. **Platform admin.** In `companyManagers()` (`lib/notify.mjs:123`), exclude `platformEmails()` from `lib/platform.mjs`. Platform-only notices already target the admin directly (`staffSetup.mjs:172`, `appFeedback`). Also make the demo request (`demo.mjs:22`) and the AI cap (`lib/ai.mjs`) go to the platform admin's user ids.
4. **Venue live alerts.**
   - In `ops.mjs:336` (no-show / can't make it escalation), also notify `venueContacts(venue)` with client wording: "An officer for tonight can't make it — we're finding cover", urgent.
   - In `ops.mjs:1023` (cover taken), notify them that a replacement is confirmed, Action.
   - Venue users only get links to venue pages: `/venue/...`, following the existing link helpers in cover.mjs.
5. **Settings → Notifications & email.**
   - Under the company defaults, add a short read-only "What reaches the phone" explainer listing the three tiers. No new settings: the tiers are fixed in code.
   - In the personal Notifications sheet, add the note "Urgent and action alerts come to your phone; FYI ones wait under the bell."
6. **What's new card + AI picture** (memory rule), date `2026-11-08`.

## Verification
- **Unit test** `test/notifyTiers.test.mjs`: `tierOf` for each kind and severity, plus a table check that every `kind:` literal used in `modules/` and `lib/` is in `TIER`. The check greps the source so new kinds can't slip through.
- **Unit test:** `companyManagers` SQL excludes platform emails. Use a stubbed `q` if the suite allows; otherwise check the query text.
- Run `npm test` in `functions/api` and `npm run build` in `app`. Check `index-*.js` contains `6ij75kpgf7` and not `hopedp5`.
- Deploy the function and site. On your phone: Send a test (Action) still arrives. No live notifications will be sent by me.
- Commit with explicitly staged paths: feature commit, then build commit.
