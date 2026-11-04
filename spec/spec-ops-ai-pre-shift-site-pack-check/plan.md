# Spec: Ops AI pre-shift site pack check

## Context
Officers cannot clock in until they have signed the venue's site pack. Today they get automatic reminders when they are booked, the day before, and 2 hours before the shift. After that, no one owns the problem. An officer who turns up unsigned is stuck at the door. Ops AI then treats them like any late officer and sends a generic "where are you?" chase, with no mention of the pack. Live now shows "Pack not signed", but nothing acts on it.

This feature gives Ops AI ownership of the final stretch. It chases the officer about the pack specifically, tells managers, and prepares cover if the pack is still unsigned once the shift is under way.

## Goals
- Officers booked on a shift with an unsigned (or needs re-sign) pack are pushed to sign before and at the start time.
- Managers hear about it at a predictable moment, with the reason spelled out.
- Cover is ready if it is still not signed half an hour into the shift. A manager stays in control.
- No double-chasing. A pack-blocked officer gets pack messages, not the generic late chase as well.

## Timeline (relative to shift start, for an officer whose pack is unsigned or needs re-sign)
| When | What Ops AI does |
|---|---|
| 15 min before | **Chase 1** to the officer, as an Ops AI message and a push: "Your shift at {venue} starts at {time}. Sign the site pack now or you won't be able to clock in." Includes a direct link to the pack. Replies: *Signing now* / *Can't make it*. |
| Start time | **Chase 2** to the officer: "Your shift has started and you still can't clock in. Sign the site pack now." |
| 15 min after | **Escalate.** Managers for the venue get a warning alert: "{Officer} hasn't signed the {venue} site pack and can't clock in – shift started {time}." It appears in the Ops AI inbox and activity log. |
| 30 min after | **Prepare cover.** Ops AI ranks replacements and puts a cover card in the inbox with the reason "site pack not signed". Nothing goes to replacement officers until a manager approves. |

- The four times are defaults. A manager can change them in the Ops AI settings, next to the existing chase settings.
- The check can be switched off on its own, without turning off the rest of Ops AI chasing.

## Functional requirements
1. **Who is checked.** Officers on published, accepted or assigned shifts whose venue pack status is *not signed*, *needs re-sign* or *refresher due*. An officer at a venue with no published pack is never checked.
2. **Stop as soon as they sign.** Once the pack status is current, no further steps run. If they sign before the escalate step, nothing reaches managers.
3. **No double chase.** While an officer is in this flow, the generic Ops AI late chase and escalation skip them. If they sign but still haven't clocked in, the normal late flow takes over from that point.
4. **"Can't make it" reply.** This goes straight to the existing can't-make-it path: managers are told and cover is prepared immediately.
5. **"Signing now" reply.** This is logged and shown to managers on the item. It does not pause the timeline.
6. **Late sign (default).** Suppose the officer signs after cover was prepared:
   - If a manager has not yet approved the cover card, the card closes automatically: "{Officer} has now signed."
   - If offers are out but nobody has accepted, the offers are withdrawn and the original officer keeps the shift.
   - If a replacement has already accepted, nothing changes automatically. Managers get an alert saying both officers are now able to work, and they decide.
7. **Cover ranking (default).** For these cover cards, replacements who have already signed this venue's pack rank above those who haven't. The others are labelled "will need to sign first" and stay selectable.
8. **Each step happens once per shift.** Retries and repeated job runs never send a second message for the same step.
9. **Record.** Every step is written to the Ops AI activity log against the shift, so managers can see who was chased and when.

## User stories
- As an officer, 15 minutes before my shift I get a clear message telling me I can't clock in until I sign, with one tap to the pack.
- As a duty manager, I'm told at quarter past if someone still can't clock in because of the pack, and I'm not spammed before then.
- As a duty manager, by half past I have a cover card ready to approve, ranked by officers who already know the site.
- As an officer who signs at the last minute, I keep my shift if no one has been confirmed in my place.

## Acceptance criteria
- An unsigned officer on a 20:00 shift gets chase 1 at 19:45 and chase 2 at 20:00. Managers are alerted at 20:15, and a cover card exists at 20:30. Each happens exactly once.
- An officer who signs at 19:50 gets no chase 2, and managers hear nothing.
- An officer who signs at 20:20 and clocks in has their unapproved cover card closed automatically, with a note.
- A pack-blocked officer does not also receive the generic late chase.
- Replying "Can't make it" alerts managers and prepares cover straight away.
- Officers at venues with no published pack are never included.
- Changing the times in settings changes when the steps fire, and turning the check off stops them.

## Constraints
- It follows the existing Ops AI rule: messages to officers go out automatically, but anything affecting the rota needs a manager's approval.
- It runs on the existing Ops AI schedule. A step can be up to one job run late, roughly 10 minutes, and that is acceptable.
- Pack status must use the same rules as the clock-in block.

## Assumptions (defaults chosen; you only answered the timing question)
- Cover is prepared for a manager to approve; it is never offered automatically.
- A late signature lets the original officer keep the shift if no replacement has accepted yet.
- Officers who have already signed rank first in cover suggestions.

## Out of scope
- Phone calls or SMS. Chases use in-app messages, push and email.
- Changing the existing reminders at booking, the day before and 2 hours before.
- Clock-in proof failures as Ops AI items.
