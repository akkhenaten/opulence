# Spec: the shift page is the officer's whole shift, Back goes where you came from

## Why
The officer app now centres on the shift card, but the journey still breaks.
- Back buttons go to fixed pages. Site pack → Documents, toolbox → Learn, shift page → Shifts, even when you came from the shift card on Home.
- Things officers need during a shift are hidden or scattered:
  - incident types,
  - an unfinished draft,
  - the handover notes,
  - saying "I can't work this" after confirming (today only on the Shifts list).
- The Clock tab duplicates what the Home shift card now does.

Officers should open the shift once and find everything for it there, and always get back to where they started.

## Who
Officers (staff). Managers' screens keep working as today. Only the shared Back behaviour changes for them too, for the better.

## What changes

### 1. Back goes back to where you came from (whole app)
- Every page's Back returns to the page you actually came from and is labelled with it, for example "‹ Shift", "‹ Home", "‹ Reports".
- If there is no previous page (opened from a link or notification), it falls back to today's fixed target.
- Examples:
  - Home shift card → Shift page → Site pack → Back goes to the Shift page.
  - Shift page → toolbox → Back goes to the Shift page.
  - Home → Shift page → Back goes to Home.

### 2. Confirmed shift = the shift page
- Tapping a confirmed shift anywhere (Home, Shifts) opens its shift page.
- The shift page holds everything for that shift (sections 3 to 6).

### 3. Handover notes inside the shift card
- A **Handover** block near the top of the shift page, with a clear handover icon:
  - **Left for you:** the last signed handover at this venue (text, who signed it and when, and the photos from its handover notes).
  - **Your handover notes so far:** this shift's "For handover" entries.
  - An **Add handover note** button. It opens the log composer already set to "For handover" (text and photos), and saves without leaving the page.
- The lead's **Sign off and hand over** stays as it is today.
- Normal notes stay in the Shift log as today, so anyone on shift can add a note and save it.

### 4. Reports from the shift page
- **Incident tiles:** Ejection / refused entry, Injury / first aid, Damage, Theft, Other.
  - Each one opens the incident report for this shift with the type already chosen.
  - The tiles are always visible. Before the reporting window (1 hour before the start until 30 days after) they are greyed out with "Opens 1 hour before the shift" (default).
- **Draft reminder:** if the officer has an unsent draft for this shift, a tile reads "Draft report: carry on" and opens it.
  - Reports keep saving themselves as you type, with Save and close. Officers can leave and come back with the evidence.
- **Log ejection / ban** stays as a pop-up on the shift page, exactly as now. Officers never leave the page for it.
- The shift log entries' "Make incident" stays.

### 5. "I can't work this" after confirming
- On the shift page and on the Home confirmed card, until the officer clocks in.
- The rule (default, change if you prefer):
  - **24 hours or more before the start:** the officer gives a reason. The shift is released and managers are alerted, as today.
  - **Under 24 hours:** still allowed, but the sheet shows the office phone number and asks them to call as well. Managers get an urgent alert plus an email.

### 6. Clock moves to Home
- The bottom bar becomes **Home, Shifts, Learn, Me** (default).
- Clock in sits on the Home shift card and on the shift page, from 15 minutes before the start.
- When on shift, Clock out and Start/End break are on the on-shift bar at the top of Home.
- The clock page itself stays as it is. It is reached from those buttons and from Shifts (clock history), just not from the tab bar.

## Not changing
- The clock-in rules (15 minutes, site-pack signing, location checks).
- Who can ban directly. Leads ban directly; others propose and the lead confirms.
- Managers' rota and their incident screens.

## Edge cases
- **Back after a page refresh** or opening from a notification: the fixed fallback.
- **An officer who can't work a shift they lead:** managers are told it's the lead.
- **Under 24 hours with no office phone number set:** the sheet just says "Call the office".
- **Draft without a shift (old drafts):** still listed under Me → Reports.

## Defaults to confirm
These are the recommended options; your answers to these questions didn't come through.
- Cancel rule: 24 hours.
- Bottom bar: Home, Shifts, Learn, Me.
- Incident tiles greyed out before the window.

## Done when
1. Every Back on the officer journey returns to the page you came from.
2. The shift page shows the Handover block, the incident tiles, the draft reminder, Log ejection and "I can't work this".
3. The Clock tab is gone and clocking works from Home.
4. A What's new card ships with it.
