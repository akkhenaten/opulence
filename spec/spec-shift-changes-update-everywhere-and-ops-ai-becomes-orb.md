# Spec: Shift changes update everywhere, and "Ops AI" becomes "Orb"

## Context
A manager put an officer on a shift and then changed it. The old officer had been replaced, but the app was still showing the old assignment in three places:
- the bell notifications,
- Live operations,
- the Ops AI cards.

Investigation shows that taking someone off a shift only updates the assignment record (it is marked cancelled). Nothing tidies up what was created from it:
- **Bell notifications** about a shift have no link to that shift or assignment, so they can't be found and removed.
- **Ops AI cards** are not re-checked after a rota change:
  - A compliance card is re-checked weekly or when someone presses refresh.
  - Cover cards are never re-checked. For example, "cover needed for X" stays open after the manager has already filled the shift.
- **Officer chat buttons** ("On my way", site pack) for the old shift stay in Orb Ops.
- **Re-adding someone** to a shift they were on before brings back their old record, with its old "already chased / reminded / alerted" flags. Because of those flags, they aren't chased or reminded again.

The Live board list itself is already correct and updates within 15 seconds.

The user also wants the name "Ops AI" replaced by "Orb" throughout the app.

## Requirements

### 1. Changes to a shift tidy up everywhere, straight away
This applies to every way someone stops being on a shift, or a shift changes:
- unassign, reassign, cancel shift
- an officer declining
- an edit that changes the time, the venue or the status
- a cover occurrence cancelled or re-timed
- offboarding
- compliance "take off"
- deleting a draft shift

When any of these happens:
- **Bell notifications are removed** for that assignment, or for the whole shift if it was cancelled or deleted. This applies to everyone:
  - the officer: "New shift assigned", reminders, site pack reminders, cover offers
  - managers: late, no-show / escalation, "on my way", site pack alerts, and the Ops AI alert for any card that closes
  - The new "Removed from shift", "Shift cancelled" and "Shift updated" notices are still sent.
  - Push messages and emails that were already delivered can't be recalled. They are left as they are.
- **Ops AI cards update immediately**, without waiting for the 5-minute run or refresh:
  - A pending cover card closes if the shift is now full, cancelled or deleted, or if the officer it was replacing is no longer on it.
  - The compliance card for each affected officer (old and new) is re-checked at once. It closes if nothing is left, or updates its text and shift list if issues remain.
  - Approving a cover card re-checks that the shift is still short. If it isn't, the card closes ("Shift already filled") and no offers are sent.
  - The refresh button and the 5-minute run apply the same tidy-up, so any stale cards already on live close the next time it runs.
- **The officer's chat buttons** for that shift (On my way / can't make it, site pack, cover offer) close.
- **Shift chat:** the person taken off leaves that shift's group chat. *(Assumed default: the question wasn't answered.)*
- **Re-adding someone** to a shift they were on before starts fresh. Their old chased, reminded, alerted and site pack flags are cleared, so the normal reminders and checks run again.
- **Screens refresh:** Live operations, the Orb card panel, the bell count and the rota refresh right after the change on the manager's own screen. Other open screens pick it up on their usual polling.

### 2. Rename "Ops AI" to "Orb"
*(Assumed default: everywhere, because the question wasn't answered.)*
- **Every visible "Ops AI" becomes "Orb":**
  - the Live operations panel heading, the subtitle "Orb checks every 5 minutes" and the refresh tooltip "Run Orb checks and refresh"
  - Settings ("What Orb does", "Orb and incidents")
  - empty states, attendance, pay runs and compliance texts
  - manager alerts ("Orb: Cover needed…")
  - credit-cap and error messages
  - the AI usage breakdown name
  - the Help guide section
  - the AI's own name in its instructions
- **The officers' "Orb Ops" chat thread becomes "Orb"**, so the app uses one name.
- **Not renamed:** internal names (action ids, settings keys, files). Old notifications already in the bell keep their old text.
- **"Ask Ops AI chat"** in settings becomes "Orb chat for managers".

### 3. Not in scope
- Recalling push messages or emails that were already delivered.
- Changing data on the live system by hand. Existing stale cards and notifications clear through the new tidy-up the next time a check runs or the shift is touched. Nothing is run against live data without asking first.

## Acceptance
1. Assign A to a published shift, then reassign it to B:
   - A's "New shift assigned" disappears from A's bell, and A gets "Removed from shift".
   - Any late or no-show alert for A disappears from the managers' bell.
   - A cover card for A closes.
   - A's compliance card no longer lists that shift.
   - A's chat buttons for it close, and A leaves the shift chat.
   - Live shows B.
2. Unassigning from or cancelling a shift has the same effect for everyone on it.
3. Taking A off and putting A back on means A is reminded and chased again as normal.
4. Approving a cover card for a shift that is already full sends nothing and closes the card.
5. No "Ops AI" text is left anywhere a user can see it.
6. API tests cover reassign, unassign, cancel and re-add tidy-up, and all existing tests still pass.
