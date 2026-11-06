# Implementation plan: the officer portal is built around the shift card

Spec: spec/spec-the-officer-portal-is-built-around-the-shift-card.md

## Context
Officers get one clear path:
1. Home shows the shifts they need to answer, their confirmed shifts, and open shifts.
2. Clock-in opens 15 minutes before the start.
3. While they're clocked in, Home becomes the live shift card. Incidents and ejections are logged there.
4. The "Getting set up" checklist ticks itself and links to the fix.
5. Reports (incidents and ejections) sit on one look-back page.

Most of the pieces already exist:
- `ShiftView` is already the full shift card (log, ejections, team, site pack, Report incident).
- Documents and contracts already tick onboarding through `tickOnboarding` (`functions/api/modules/hr.mjs:34`).

## 1. Clock-in window: 15 minutes
- `functions/api/modules/clock.mjs:22`: set `EARLY_MIN = 15`. The message already interpolates the constant.
- `app/src/pages/officer/_parts.jsx`: add `export const CLOCK_EARLY_MIN = 15`.
- Use the constant in `Clock.jsx:85-86` and in `Home.jsx`, which hardcodes `30 * 60000`.
- The disabled button reads "Clock-in opens at HH:MM", using `time(starts - 15 min)`.
- Grep the help guide and other copy for "30 min" or "30 minutes" next to clock-in and update them.

## 2. Shift card as a reusable panel (`app/src/pages/shift/ShiftView.jsx`)
- Export `ShiftPanel({ id, live })`. It runs `useApi('shifts.detail', { id }, { poll: 30000 })` and renders `<Load>` → `<Body d reload role live />`. `ShiftView` uses it inside its `Page`.
- **QuickActions** (officer): add **Log ejection** next to Report incident, for anyone who can write to an unsigned log (`me.can_write && !signed`).
  - To do this, move the `banning` state into Body and pass `onBan` down.
  - Report incident keeps its 30-day window. Shift chat stays.
- When `live` is set: hide the Header's clock row. Home's live header handles clock-out and breaks instead.

## 3. Officer Home (`app/src/pages/officer/Home.jsx`), rewritten

### On shift
`clock.data.current` has `state` `on_shift` or `on_break`. Home renders:
- **LiveBar:** a blue tile with "On shift now / On break", the venue, the time range, time since clock-in, and buttons for **Clock out** or **End break** (both go to `/officer/clock`, as today).
- `<ShiftPanel id={cur.shift_id} live />` below it.
- Nothing else. The tabs still reach the rest of the app.

### Not on shift (in order)
1. `ChaseBanner`, `OffersList compact`, the can't-work tile (kept), and the SIA-expiry tile (kept).
2. **Needs your answer:** `next` filtered to `assignment_status === 'assigned'`. Each card has Confirm (calls `shifts.respond`) and Decline. Decline opens the existing decline sheet; to reuse it, lift `DeclineSheet` out of `Shifts.jsx` into `_parts.jsx`. Hidden when empty.
3. **Confirmed:** `accepted` shifts. The first one is the hero card, with "Clock in" once inside 15 minutes, otherwise "Clock-in opens at HH:MM", plus a "Shift page" link. The rest use `ShiftCard`.
   - Empty state: "Nothing booked" with a link to open shifts.
4. **Open shifts you can pick up:** up to 3 from `shifts.open` (same data as Shifts → Open), each with a request link, plus "See all". Hidden when there are none.
5. **To do** (`ToDo` component), a single list of rows that each link somewhere:
   - setup items not done (from `onboarding.tasks`, section 4),
   - contracts with status `sent` (`contracts.list`),
   - training due or overdue (`academy.my`, the logic now in `Extras`),
   - documents expiring (`d.expiringDocs`),
   - reports to fix (`d.incidentsToFix`, linking to `/officer/incidents`).

   Hidden when empty.
6. Latest Everyday posts stay at the bottom.

Removed: the Hours, Open shifts and Last pay tiles, the Documents tile and the loose **Report incident** button.

API: `officerDash` (`functions/api/modules/dashboard.mjs:105`) already returns `next` with both statuses. Only `next` grows to 8 so there's room for both groups.

## 4. Onboarding auto-ticks (`functions/api/modules/hr.mjs`, `officers.mjs`)
- New `syncOnboarding(officerId)` in hr.mjs, which reads the officer row and calls `tickOnboarding` for:
  - **profile:** first and last name, phone, address, postcode, dob and ni_number are all set.
  - **bank:** bank_sort_code, bank_account and utr are set.
  - **sia:** sia_number and sia_expiry are set.
- Call it at the start of `onboarding.tasks`, so existing officers catch up, and after the officer saves their own details in `officers.mjs:126`.
- rtw, id, poa and contract already tick on upload or sign. verified and induction stay office-only.
- `onboarding.tasks` adds `to` (the link) and `office: true` for verified and induction, based on a code map:
  - profile, bank → `/officer/profile`
  - sia, rtw, id, poa → `/officer/documents`
  - contract → `/officer/me#contracts`
- **Me.jsx "Getting set up":**
  - Rows link via `to`.
  - Office items show "Waiting on the office" in grey with no chevron.
  - The footnote becomes "Tap an item to finish it. Ticks appear as soon as it's done."

## 5. Incidents only from a shift card
- **Server (`incidents.mjs` `incidents.create`):** for officers, `if (!b.shift_id) fail(400, 'Open the shift and report from there')`. The rest is unchanged, since `officerShift` already checks the assignment and time.
- **IncidentForm.jsx**, for officer, non-edit, no `?shift` and no `?draft`:
  - Render an `Empty` reading "Reports start from the shift", with a button to Shifts → List.
  - Drafts with a `shift_id` open as today.
  - Old drafts without one keep the picker (the edge case in the spec).
  - When `?shift` is given, hide the shift picker and show the chosen shift as a fixed line.
- **Removed entry points:**
  - Home's button.
  - Me's "Report incident" row, if there is one; check `Me.jsx` around lines 60-140.
- **Shifts → List, past shifts:** the cards already link to the shift page, which carries Report incident and Log ejection. Add the subtitle "Report or log an ejection" on past shifts less than 30 days old.

## 6. Reports page (`/officer/incidents`)
- Title "Reports", with `Tabs`: **Incident reports** (the current list) and **Ejections**.
- **New API `bans.mine`** (officer role) in `bans.mjs`: `SELECT ${COLS} FROM ${FROM} WHERE b.proposed_by = $1 ORDER BY COALESCE(b.occurred_at, b.created_at) DESC LIMIT 200`, shaped with `shape`. The Ejections tab renders it with `BanList` (`pages/shift/_bans.jsx`), read-only.
- **Me.jsx:** add a "Reports" row (icon ShieldAlert), which shows a count when there are reports to fix.
- **Me order:**
  1. profile card
  2. Needs your attention
  3. Getting set up
  4. Training
  5. Contracts (`id="contracts"`)
  6. Documents, Profile and bank, Pay, Reports, Time off
  7. Account

  This is a reorder of the existing Sections; no new screens.

## 7. Ship
- What's new card at the top of `UPDATES` in `app/src/pages/people/_whatsnew.jsx`:
  - date '2026-11-06', title "Your shift, all in one place", icon Smartphone.
  - Points:
    - 'Home shows what to answer, what's confirmed and what's open'
    - 'Clock in from 15 minutes before'
    - 'Once you're on, the shift card is your Home: log, incidents, ejections'
    - 'Set-up items tick themselves and link to the fix'
    - 'Every report and ejection in one Reports page'
- **Tests** (`functions/api/test/`):
  - **clock:** refused 16 minutes before, allowed 14 minutes before. Add to the existing clock test, or create one using the PGlite harness the other tests use.
  - **incidents:** an officer create without `shift_id` gives 400.
  - **hr:** `onboarding.tasks` auto-ticks profile and bank once the fields are set.
  - **bans:** `bans.mine` returns only the caller's own ejections.
- Checks: `cd app && npm run build` (ui-lint 67 or below), then `cd functions/api && npm test`.
- Commit "feat: officer portal built around the shift card" (with the Co-Authored-By line). Include the spec file.
- Deploy and push:
  1. `openkbs fn deploy api -s 'rate(5 minutes)'`
  2. `openkbs site deploy`
  3. `git push origin master --tags`

## Verification
- **Mock** (`/tmp/mock`, `ROLE=officer`): add `clock.status` and `dashboard.get` officer data, with variants for these states:
  - not on shift, with 1 assigned, 2 accepted (one starting in 10 minutes) and 2 open,
  - on shift (`current.state = 'on_shift'`),
  - `onboarding.tasks` with some items not done,
  - `bans.mine`.
- **Screenshots at 390 and 1440:**
  - the three Home blocks and To do,
  - the "Clock in" vs "Clock-in opens at …" button,
  - the on-shift Home showing the shift card with Report incident and Log ejection,
  - `/officer/incidents/new` without a shift showing the "start from the shift" screen,
  - Reports tabs,
  - Me setup rows that link.
- Then `agent-browser close --all` and stop the servers.
- **Live, after deploy (read-only):** the bundle contains "Your shift, all in one place", and the API answers.
