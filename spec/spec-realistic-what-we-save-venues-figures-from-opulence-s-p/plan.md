# Spec: realistic "what we save venues" figures from Opulence's planning numbers

## Context
- **Why the change:** the live "what we save venues" cards (v193) understate the value. Only 17 of about 35 officers are onboarded, and the old allowances counted only timesheets, incident reports and cover requests.
- **The user's planning numbers, to use until all staff are on the system:**
  - About 35 staff.
  - Each venue averages 3 shifts a week, 3 officers a shift and 5 hours an officer.
- **What venue admin really covers:** incidents, timesheet chasing and finding, compliance files and so on. The user suggests about 10 minutes per officer per week, plus the time spent chasing a security company manager who is busy in a meeting or at another site. They asked me to check online guidance.
- **Rate:** value the time at £16 an hour, because it is admin staff at the venue whose time we save, not £15. Don't mention the hourly rate on the page.

## Guidance found (all rough; most from software vendors)
- **Per officer:** Belfry (security guard software) claims about 8 hours a week saved on payroll and scheduling for firms with 10+ officers. Across ~50 officers, that is about 10 minutes per officer per week, which matches the user's figure.
- **Timesheets:** Connecteam (time-tracking) found managers spend 1–2 hours a week verifying and correcting timesheets. 26% of firms had managers chasing staff for their hours, and 32% checked schedules, CCTV or messages to verify them.
- **Chasing for information:** the FMI/PlanGrid survey of ~600 construction leaders (the most independent source) found 5.5 hours a week spent looking for project data. Projul says contractors lose 8–15 hours a week chasing updates and paperwork.
- **Conclusion:** 10 minutes per officer per week plus about 5 minutes of chasing per shift is a cautious figure, well inside these ranges.

## Figures

| Card | Value | How |
|---|---|---|
| Venues we protect | 24 | Live active venues (unchanged) |
| Security staff | **35** | The larger of the live officer count and 35, so it shows 35 now and the real count once more than 35 are onboarded |
| Hours saved for venue teams a year | **615** | See below |
| Saved for venues a year | **£11,320** | 615 h × £16 × 1.15 employer NI, rounded to £10. The rate is not shown |

**Hours saved per week**
- **Officer admin:** 35 officers × 10 min = 350 min. This covers incident reports, timesheets, finding records and compliance files.
- **Chasing the security manager:** 24 venues × 3 shifts × 5 min = 360 min. These are calls and messages that go unanswered while the manager is in a meeting or at another site.
- **Total:** 710 min a week × 52 weeks = 36,920 min, which is 615 hours a year.
- **No double counting:** the old 5 / 5 / 2 minute allowances are replaced by this model.

**Live behaviour**
- **Venues:** stay live, so each new venue adds 15 min a week of chasing.
- **Staff:** use max(live, 35).
- **Shifts and officers per shift:** stay at the planning averages (3 and 3) until the rota has real history. Switching them to real rota data is out of scope.

## Page changes (`#savings`)
**Card footnotes**
- Staff: "Officers on our books".
- Hours: "Admin, reports and chasing, done for them".
- Money: "In venue admin time" (no £15 or £16).

**How we estimate this, rewritten**
- Venue numbers are live, and staff is our current team of about 35.
- A typical venue runs 3 shifts a week with 3 officers each, around 5 hours per officer. Across our venues that is about 216 officer-shifts and 1,080 hours of cover a week.
- Each officer saves the venue about 10 minutes of admin a week: incident reports, timesheets, finding records, compliance files.
- Each shift saves about 5 minutes chasing a security manager who may be in a meeting or at another site.
- Money values that time at a typical venue admin wage plus employer costs.
- These are estimates, not a guarantee, and Opulence's own admin isn't counted.
- The old worked example (58 minutes) is removed, because it used the old allowances.

**Removed from the page**
- `[data-stat-rate]` and every mention of £15.

**Unchanged:** the four-card layout, the count-up and the "Live figures" line.

## Code
- **`functions/api/modules/venues.mjs`:**
  - Replace `SAVE` with `{ STAFF_MIN: 35, SHIFTS: 3, PER_SHIFT: 3, HRS: 5, OFFICER_MIN: 10, CHASE_MIN: 5, WEEKS: 52, RATE: 16, NI: 0.15 }`.
  - `venueStats` returns `staff = max(live, 35)` along with `venues`, `hoursYear` and `moneyYear`. It no longer returns `rate` or `ni`.
  - Deploy `api`.
- **`site/index.html`:**
  - Update the fallback numbers (35 / 615 / £11,320), the footnotes, the aria-labels and the disclosure.
  - In the JS, remove the `[data-stat-rate]` handling.
- **`app/src/pages/people/_whatsnew.jsx` and the image script:** add a What's new card for this release, with its own picture (house rule).

## Verification
- **API:** the API returns `stats` 24 / 35 / 615 / 11320, and no rate.
- **Page:** the page shows those values and counts up.
- **No hourly rate anywhere:** `grep -n "£15\|£16\|15 an hour\|16 an hour" site/index.html` finds nothing.
- **Browser checks:** at 1280 and 375 widths there are no console errors and no horizontal scroll. Reduced motion and the accessibility labels behave as before.
- **Deploy:** run `openkbs fn deploy api` and `openkbs site deploy`, then recheck live.

## Sources
- [Belfry: security guard payroll software](https://www.belfrysoftware.com/lp/security-guard-payroll-software)
- [Connecteam: time tracking statistics](https://connecteam.com/research/e-time-tracking-statistics/)
- [Connecteam: employee time theft statistics](https://connecteam.com/research/e-employee-time-theft-statistics/)
- [Plexa: construction admin time (FMI/PlanGrid)](https://www.plexapro.com/blog/construction-admin-time)
- [Projul: construction time management](https://projul.com/blog/construction-time-management-guide/)
