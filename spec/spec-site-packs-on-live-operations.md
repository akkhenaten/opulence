# Spec: Site packs on Live operations

## Context
Site packs (the AI-written instructions and procedures for each venue) are built and live in v62. They pass 12 of their 14 acceptance checks, and the other 2 are minor and partial. Officers cannot clock in until they have signed the pack.

Live operations does not show pack status yet. When a missing signature blocks an officer's clock-in, nothing is recorded. The manager just sees "late", then "no-show", with no reason. This spec fixes that.

## Goals
- Managers can see on Live, at a glance, who has signed the pack for the venue they are working at, or are about to work at.
- When a clock-in is blocked because the pack isn't signed, managers can see why.
- The venue client sees a simple signed or not-signed status for the officers at their own site.

## Functional requirements
1. **Pack status on each Live row** (company and security Live). This covers officers on shift now and officers due within the window Live already shows. There are four states:
   - "Pack signed": shown subtly.
   - "Pack not signed": shown as a warning.
   - "Needs re-sign": shown as a warning. This means a real change was published or the 6-month refresher is due.
   - No label: the venue has no published pack.
2. **Blocked clock-in record.** Every clock-in attempt that is refused because the pack isn't signed is recorded with the officer, shift, venue and time.
   - Live shows it on the row: "Pack not signed – tried to clock in at 19:52". This takes priority over a plain "Late" label.
   - The record stays on the shift history and in the audit.
3. **Manager alert.** On the first blocked attempt for a shift, the venue's managers get one in-app alert, with a link to the shift and the officer's pack. Repeat attempts on the same shift send no further alerts.
4. **Clears itself.** Once the officer signs and clocks in, the row shows the normal clocked-in state. The blocked attempt stays in the history.
5. **Summary chip.** Live gets a filter chip "Pack not signed (N)", next to the existing chips such as Exceptions.
6. **Venue client "On site" view.** Each officer listed shows only "Signed" or "Not signed yet". The client sees no attempt times and no manager detail. The client sees only their own venues, as today.

## User stories
- As a duty manager, I open Live at 19:55 and see that Dan is not late. He is stuck on the pack, so I call him to sign it now.
- As a manager, I get one alert when an officer is blocked, so I don't have to watch Live constantly.
- As a venue client, I can check that the officers on my door have signed my site's procedures.

## Acceptance criteria
- An officer booked at a venue with a published pack they haven't signed shows "Pack not signed" on company and security Live.
- An officer who signed a pack that has since had a real change shows "Needs re-sign".
- A blocked clock-in is stored, shown on the Live row with its time, and triggers exactly one manager alert per shift.
- A venue with no published pack shows no pack label, and nothing is blocked.
- The "Pack not signed" chip count matches the rows, and tapping the chip filters to them.
- Venue logins see only "Signed" or "Not signed yet" on their own officers, with no times and no alerts.
- Once the officer signs and clocks in, the row shows them as clocked in, and the earlier blocked attempt is still in the history.

## Constraints
- Reuse the existing pack status rules (current, re-sign, refresher, no pack). Live must never disagree with the clock-in block.
- Live keeps its current refresh speed. Pack status must not make the board noticeably slower.

## Out of scope (possible follow-ups)
- An Ops AI check before each shift that chases officers who haven't signed and suggests cover.
- Cover suggestions that prefer officers who have already signed.
- Repeated clock-in proof failures as Ops AI inbox items.
- The 2 partial pack items: the manager status line, and a shift-tools entry that works offline.
