# Spec: Dashboard review and refresh (company and security managers)

## Context
The user asked for a review of the manager Dashboard (`app/src/pages/manager/Dashboard.jsx`, data from `dashboard.get` in `functions/api/modules/dashboard.mjs`), covering visual, content, composition and streamlining. I reviewed the code and screenshots at 1440 and 390 px on a quiet day, when most counts are 0. The user chose a "Needs you" list in place of the 8 count tiles. Scope wasn't answered, so the default is the full refresh below; it is screen-only apart from two small additions to the data.

## Findings from the review

**Visual**
1. **The "0" reads as a letter "o".** Big numbers use the Playfair display font, whose default figures are old-style, so "0h" looks like "oh" and every zero looks like a letter. `.num` sets only `tabular-nums` (`app/src/styles.css:102`). This affects every big number in the app.
2. **Labels break mid-word on phones.** The Staff tile shows "Applica-nts" and "Onboa-rding", and "Hours this week" wraps onto two lines.
3. **The Orb button covers "All ›"** on Recent incidents on desktop, top right of the second row.
4. **Links look different on every tile:** "Open board ›", "Rota ›", "All ›", "Staff ›" and a bare chevron on Staff.
5. **Live now is a 2×2 dark tile, mostly empty** when there are no alerts, and it is taller than its neighbours.
6. **Compliance columns don't line up.** The left column leads with a big number, the right with a small heading.

**Content**
7. **Eight count tiles show even when they're 0.** That is about 600 px of scrolling on a phone just to learn nothing needs you, and nothing says what's most urgent.
8. **No at-a-glance summary.** The greeting's subtitle is just the date.
9. **"Hours this week" is a whole tile for one number.** Hours, money and the staff pipeline are scattered across three tiles.
10. **"Upcoming shifts" doesn't say whether tonight is covered.** A short shift only shows as a small red pill.

**Composition**
11. **The order doesn't follow urgency.** It runs: live, then 8 to-dos, then shifts and incidents, then hours, staff, compliance, money. Money comes last and compliance sits below hours.
12. **The "Everyday" button takes a whole row on its own.**
13. **The photo header is 180 px tall on desktop.** That is a lot for a working screen.

**Streamlining (code)**
14. The tile header link markup is copied 4 times. "Hours this week" is rendered in two role branches. CountTile repeats the tone logic.

## The refresh

**Header**
- The greeting stays. The subtitle becomes a one-line summary built from the data, for example:
  - "Fri 6 Nov · 4 on site · 2 things need you"
  - "Fri 6 Nov · 4 on site · all clear"
- The Everyday button moves into the header row, on the right, keeping its unread badge, so it no longer takes its own row. If `Page` has no actions slot that fits, it stays as a small button but on the same row as the summary.
- The desktop photo header gets slimmer, matching the phone's slim header (`photo` with a compact size, if Page supports it; otherwise use `Page`'s existing slim variant).

**Row 1: Now**
- **Live now** (dark) shrinks to its content: no `row-span-2`, and a single-line "No alerts" state.
- **Needs you** sits next to it on desktop and below it on phone:
  - Rows only for counts above 0, most urgent first: no-shows/exceptions, unfilled shifts (7 days), disputed timesheets, open incidents, cover requests, timesheets to approve, shift requests, time off.
  - Each row has a coloured icon, a sentence ("3 timesheets to approve") and ›, and links where the tile linked before.
  - Empty state: a green tick and "All clear, nothing needs you right now."

**Row 2: Next**
- **Tonight & tomorrow** (the current Upcoming shifts):
  - A header line, "8 shifts · 1 short · 2 unconfirmed", so cover status reads at a glance.
  - The rows stay as they are, and short shifts are listed first.
- **Recent incidents**: unchanged, except its link moves clear of the Orb button.

**Row 3: People** (company only)
- **Compliance**: aligned columns ("Can't work" and "Expiring in 60 days"), each with a number and a list.
- **Staff pipeline**: Applicants, Onboarding and Active, with labels that don't break (smaller text, `whitespace-nowrap`, or stacked on phones).

**Row 4: Business: a "This week" strip** (it replaces the Hours and Money tiles)
- One soft tile, with Stats for:
  - Timesheet hours (since Monday)
  - Shifts this week (new count)
  - Invoiced this month
  - Outstanding, with overdue shown in red
- The money figures show only where `d.money` exists, as today.
- Security managers see hours and shifts only.

**Everywhere**
- Fix the number font: `.num` and `.display` numbers use `lining-nums tabular-nums`. This is app-wide and fixes finding 1.
- One `TileLink` style for every "… ›" link.
- Keep enough space at the bottom on phones so the Orb button never covers the last link.

**Data (small additions to `dashboard.get`)**
- `counts.shiftsWeek`: published shifts, Monday to Sunday of this week, scoped like the other counts.
- `live.noShowToday` is not needed: the no-show and exception counts already exist (`live.no_show`, `counts.exceptions`).

## Non-goals
- No changes to the venue or officer dashboards, the Everyday feed, or the Live board.
- No new charts.

## Ship
- Add a What's new card ("A Dashboard that tells you what matters") with today's `date`.
- Run the build (ui-lint 67 or below) and the API tests.
- Deploy the fn (for the new count) and the site, commit, and push.

## Verification
Check against the mock at 1440 and 390, in three states:
- A quiet day (all 0): you see "All clear", and the page is about half its current height on a phone.
- A busy day: the mock is edited so the counts are above 0, shifts are short, and there are alerts.
- As a security manager: no People row and no money.

Also check:
- Zeros now look like zeros across the app (Dashboard, Live, Money).
- Dark theme.
