# Plan: Three-portal review, second slice: truthful states and ways back

Spec: the approved "Three-portal review, second slice: truthful states and ways back" (sections 1–11 below follow its numbering).

## Context
The review found screens that state something untrue:
- A failed load looks like "nothing to do" or "All clear".
- Set-up steps read as already done.
- "Past shifts" shows upcoming shifts.
- Billing empty states say "Try another filter".
- Amounts don't say whether VAT is included.

It also found Back links that lead somewhere unexpected. Every fix is front-end wording, layout or navigation, plus one small API change (set-up step wording). There is no database migration and no change to amounts or rules.

## Shared building block (ui/index.jsx)
- **New `LoadFail({ q, what })`**, a small inline row:
  - If `q.error && !q.data`: "Couldn't load {what}" plus a **Try again** link that calls `q.reload`.
  - If `q.error && q.data`: a muted "Couldn't refresh · Try again" line.
  - Otherwise it renders nothing.
  - It reuses the `ErrorBox` styling at a smaller size. `useApi` (`ui/index.jsx:23`) already keeps old data on failure and exposes `reload`.
- **`AttentionDrawer` (`ui/index.jsx:1136`)** gets a `failed` prop. When it is set and there is no count, it shows an amber "Couldn't check everything" panel with Try again (an `onRetry` prop), never the green "All clear".

## 1. Failed loads (R02)
- **`pages/officer/Me.jsx`**:
  - Lines 29–31 cover `contracts.list`, `onboarding.tasks` and `incidents.list`.
  - Each section renders `<LoadFail>` where its content would be: set-up steps, Contracts and Reports to fix.
  - The phone drawer gets `failed` if any of these failed.
- **`pages/officer/Home.jsx`**:
  - `useToDo` (285–318) also returns `failed: [{q, what}]` for onboarding, contracts, academy, drafts and to-sign reports.
  - `ToDo` and the phone drawer show LoadFail rows instead of returning null.
  - `venuePacks.myList` (line 89) is kept as a `q` and gets its own LoadFail.
  - `clock.status` (line 26) shows a LoadFail ("your clock-in") where the clock card sits.
- **`pages/money/VenueDashboard.jsx` `NeedsYou` (172–202)**: when `inc.error && !inc.data`, add the item "Couldn't check reports to sign · Try again" instead of counting 0, and pass `failed` to the drawer.
- **`pages/manager/Dashboard.jsx` (92–186)**:
  - `failed = [q, count, toSign].some(x => x.error && !x.data)`.
  - The subtitle (:56) reads "couldn't check everything" instead of "all clear".
  - The drawer gets `failed` and `onRetry` (reload all three).
  - The desktop `queueOf` empty state becomes a LoadFail row when `failed`.

## 2. Set-up steps as actions (E06)
- Titles are copied into `onboarding_tasks.title` when an officer is seeded, so the stored text is left as it is.
- **`functions/api/modules/hr.mjs`**: add an `ONBOARD_ACTION` map by code next to `ONBOARDING` (16–26):

  | code | action wording |
  |---|---|
  | `profile` | Complete your personal details |
  | `sia` | Upload your SIA licence |
  | `rtw` | Upload right to work evidence |
  | `id` | Upload photo ID |
  | `poa` | Upload proof of address |
  | `bank` | Add your bank details and UTR |
  | `contract` | Sign your contractor agreement |
  | `verified` | Office checks your documents |
  | `induction` | Complete your induction |

  `onboarding.tasks` (178–194) adds an `action` field to each row.
- **UI**: everywhere `t.title` is shown, use `t.done ? t.title : (t.action || t.title)`:
  - Me.jsx (127–130, 157–160)
  - Home.jsx (314)
  - `pages/people/_profileTabs.jsx` OnboardingTab (892)

## 3. Pay row (E11)
In `Me.jsx:193–194`:
- **Pay** subtitle: "Your pay statements".
- **My details** fallback subtitle: "Phone, address, bank and your rates".

## 4. Past shifts (R03/E04): `pages/officer/Shifts.jsx`
- Add the tab value `'past'`. Line 25 accepts it; it is not shown as a tab chip. `MoreMenu` "Past shifts" (line 31) goes to `?tab=past`. `?tab=mine` is unchanged.
- **New `Past` component**:
  - `weeks` state starts at 6. It loads `useApi('shifts.mine', { from: today − 7·weeks days, to: now })`; the server already accepts `from`/`to` (`rota.mjs:380`).
  - It keeps the same "worked/accepted and ended" filter as `Mine`'s `past` (line 65), newest first, and reuses the existing Recent card markup (107–119).
  - Header line: "Last N weeks · Only shifts you were booked on are listed".
  - Empty state: "No past shifts in the last N weeks".
  - **Show older shifts** adds 6 weeks. If a step brings no new shifts, the button is replaced by "No earlier shifts".
  - Back on the page goes to Shifts.
- `Mine`'s empty state (line 75) gains a second action, "See past shifts" → `?tab=past`.

## 5. Back labels and fallbacks
- **Trail labels for hub tabs**: add an optional `trail` to the tab defs in `ui/hubs.js`. `Page` (`ui/index.jsx:120`) publishes `hub.current.trail || hub.current.label`.
  - Manager rota "Week" → trail "Rota".
  - Venue feedback "Give feedback" → trail "Feedback".
  - Other tab labels stay as they are, since they already match their headings.
- **`pages/shift/ShiftView.jsx` (56–61)**:
  - Remove the dead branch.
  - Venue fallback: `loc.state?.from === 'live'` → On site; `from === 'logs'` → Shift logs; otherwise → `/venue/rota` "Rota".
  - `ShiftLogs` navigates with `state: { from: 'logs' }`.
  - Title becomes `${venue_name} · ${weekday date}`.
- **`pages/shared/IncidentDetail.jsx:37`**: fallback label by role: officer "Reports", venue "Incidents", managers "Reports" (their hub tab).
- **`pages/money/StatementDetail.jsx:66`**: when `st.run` exists, fall back to `${base}/pay/runs/${st.run.id}` labelled "Pay run". Otherwise keep the current fallback.
- **`pages/officer/Agreement.jsx:25`**: label "Goals and one-to-ones".
- History-based Back (`previousEntry`) still wins everywhere.

## 6. Venue phone navigation (E18/E22): `layouts/nav.js:44–55`, `layouts/Shell.jsx`
- Rota gets `tab: true`, and Messages loses `tab`. The bar becomes Overview, On site, Rota, Logs, More.
- Messages, with `badge: 'messages'`, moves into `extra`. The existing More badge sum (`Shell.jsx:490–494`) then shows unread messages, and the More-sheet row shows its own Badge.
- Add `{ to: '/venue/site', label: 'Venue info', icon: Building2, phoneOnly: true }`. The desktop sidebar (`Shell.jsx:427`) skips `phoneOnly` items, so desktop is unchanged.
- **`pages/venue/Site.jsx`**: add `back={{ to: '/venue', label: 'Overview' }}` on all three Page usages.
- The account sheet "My venue" row stays.

## 7. Analytics drill-through (R19)
- **`pages/money/Analytics.jsx`**:
  - The office venue filter moves from local state into the URL (`useUrlState` key `venue`). Back then restores both the period and the venue. Venue users already use the shared chip.
  - The incidents tile (:161) links to `${base}/incidents?from=…&to=…&venue=…`.
  - The feedback links (:142) add `from` and `to`.
- **`pages/money/Reports.jsx`**: the `IncidentsSection` total links to `/company/incidents?from&to`.
- **`pages/shared/Incidents.jsx`**:
  - Reads `from` and `to` from the URL into the filter (:26).
  - Sends `from` as is and `to` as the next day, because the server treats `to` as exclusive (`incidents.mjs:193`).
- **`pages/money/Feedback.jsx`**: add `from` and `to` to `useUrlState` (:52) and pass them to `comments.list`, where the end date is inclusive.
- **Both lists** show a removable chip "{venue name} · 1–30 Nov ×". Clearing it clears from/to (and the office venue).

## 8. Billing empty states (R15)
- **`pages/shared/Timesheets.jsx:195`**: a per-segment empty map:
  - All: "No timesheets for this week"
  - On site: "No one on site right now"
  - To sign: "Nothing to sign this week"
  - Queried: "No queried timesheets"
  - Company segments get the same treatment ("Nothing needs review", "No missing clock-ins").
  - "Nothing matches / Try another filter" appears only when the venue or officer select is set.
- **WeekStrip (226–265)**: when `wk.hours === 0` and there are no chips, render "No hours this week" with no charge and no breakdown toggle.
- **`pages/money/Invoices.jsx:98`**: per-tab empties:
  - "No draft invoices", "No unpaid invoices", "No overdue invoices", "No paid invoices", "No credit notes", "No void invoices"
  - "No invoices match" plus "Try another search" only when the search box has text.

## 9. Net / gross labels (E16)
| Place | Change |
|---|---|
| `Invoices.jsx:129` row amount | small "incl. VAT" under the amount |
| `Invoices.jsx:120–125` draft hint | `{money(signed_net)} net ready` |
| `InvoiceDetail.jsx:146–149` totals | "Net", "VAT at x%", "Total incl. VAT" |
| `_lines.jsx:84–88` line column | header "Amount" → "Net" |
| `VenueDashboard.jsx:94` Outstanding tile | hint "{count} · incl. VAT" |

Figures are untouched.

## 10. Venue Overview order (R23/E19): `VenueDashboard.jsx:60–151`
- **New order**: Install/Push cards → NeedsYou → **Next 48 hours** (moved up from 107–135) → VenueTiles → Bento → Feedback → This month → recent incidents.
- **Bento**:
  - On site stays as the large tile.
  - Timesheets, Invoices, Cover and Incidents tiles with a value of 0 are left out and listed in one muted line: "Nothing open: timesheets, invoices, cover, incidents".
  - Non-zero tiles render as today.
- **Counters**: the page only renders inside `Load`, so numbers appear once known. Check during verification that there is no count-up from 0 mid-load. If it does happen there, `Stat` gets `animate={false}` on this page only.

## 11. What's new card
- Add a top `UPDATES` entry to `pages/people/_whatsnew.jsx`: slug `clear-screens`, dated release day, icon `Compass`. It is written for the business and covers sections 1–10.
- Add a `'clear-screens'` prompt to `app/scripts/whatsnew-images.mjs` and run `node app/scripts/whatsnew-images.mjs clear-screens`.

## Files
- **Edit**:
  - `app/src/ui/index.jsx`, `ui/hubs.js`
  - `layouts/nav.js`, `layouts/Shell.jsx`
  - `pages/officer/{Me,Home,Shifts,Agreement}.jsx`
  - `pages/manager/Dashboard.jsx`
  - `pages/money/{VenueDashboard,Analytics,Reports,Feedback,Invoices,InvoiceDetail,StatementDetail,_lines}.jsx`
  - `pages/shared/{Incidents,IncidentDetail,Timesheets}.jsx`
  - `pages/shift/ShiftView.jsx`, the ShiftLogs page, `pages/venue/Site.jsx`
  - `pages/people/{_profileTabs,_whatsnew}.jsx`, `app/scripts/whatsnew-images.mjs`
  - `functions/api/modules/hr.mjs`
- **New**: none apart from the What's new image.

## Deploy
1. Run `cd app && npm run build`. The ui-lint, emergency and flow checks must pass.
2. Commit `feat: …` with Co-Authored-By, then run `openkbs fn deploy api`.
3. Commit `build: site with …`, then run `openkbs site deploy`. Before testing sign-in, check that the live bundle calls Opulence's API (6ij75…).

## Verification
**Local mock** (`/tmp/mock/server.mjs`, vite on port 5174, 390px and desktop):
- Make the mock return an error for `onboarding.tasks`, `contracts.list`, `incidents.list`, `clock.status`, `venuePacks.myList`, `dashboard.get` and `ops.count`, one at a time.
  - Me, Home, venue Overview and company Dashboard show "Couldn't load / Couldn't check", and Try again recovers.
  - They never show an empty message, "0" or "All clear". An empty-but-OK load still shows "All clear".
- Past shifts: `?tab=past` shows the period line. Show older widens the `from` in the request. The empty state and "No earlier shifts" appear. `?tab=mine` still opens List.
- Back labels:
  - Rota → shift shows "Rota". Venue feedback → item shows "Feedback".
  - Opened fresh: a venue shift shows "Rota"; a statement with a run shows "Pay run"; an officer incident shows "Reports"; Agreement shows "Goals and one-to-ones".
- Venue phone bar: Overview, On site, Rota, Logs, More. The More badge shows the mock unread count. More lists Messages and Venue info. Venue info has Back. The desktop sidebar is unchanged.
- Analytics → incidents/feedback: the request carries venue, from and to; the chip shows and clears; Back restores the period and venue.
- Billing: each segment and tab shows its own empty text. An empty week shows "No hours this week".
- VAT labels: present in all five places, with amounts unchanged.
- Venue Overview order and the merged zero line are correct.

**Live** (test accounts only, nothing submitted):
- `openkbs fn invoke api` `onboarding.tasks` returns `action`.
- A test officer sees the action wording, and a done step shows the past tense.
- Spot-check the venue phone bar and Past shifts.
- Run `agent-browser close --all` when done.

## Noted, not changed
The venue "Outstanding" sum (`functions/api/modules/dashboard.mjs:122`) has no `kind = 'invoice'` filter, so issued credit notes may be counted. That would change a figure, which is outside this slice; it is flagged for the next slice.
