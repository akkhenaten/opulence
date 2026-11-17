# Service agreements with venues: optional, granular, tiered by SLA

## Context
The user wants a service agreement between a venue and the company that can be enforced. Their direction so far:
- **Optional:** a venue can have one or not. Every term in it is a separate option that is switched on and set on its own, not one fixed contract.
- **One agreement per venue.**
- **Tiers** built around a service level (SLA) for:
  - covering requests (how fast and how fully);
  - consequences for the **company** when it fails to provide cover, staff arrive late or don't turn up;
  - the venue's own obligations (notice, cancellations, sign-off, payment).
- **Tools:** propose the ones that exist and the new ones needed, not limited to the points above.

**What exists today:**
- There is no agreement with a venue. The only per-venue term is minimum hours on rates.
- Payment days and automatic timesheet sign-off are company-wide settings.
- Cancellations have no notice period and no fee.
- **The data an SLA needs is mostly recorded already:**
  - `attendance_events` records late (with `late_minutes`), no_show, cant_make_it and left_early, each with an `excused` flag (`modules/ops.mjs:540`, `clock.mjs:343`).
  - Analytics computes on_time_pct, cover and late/absent per venue and per officer (`modules/analytics.mjs:39-51,144`).
  - Ops records unfilled shifts and cover proposals (`ops.mjs:565,801`).
  - Requests store when they were created and accepted (`cover.mjs`).
- The e-sign engine handles a signer outside the company with a sealed PDF, verify page and amendments (`lib/esign.mjs`, `lib/signLinks.mjs`, `content/contracts/packs`).

## 1. How it works for the people using it
1. **Company:**
   - On a venue's new **Agreement** tab, the manager picks a tier (Standard / Priority / Premium) or "No agreement".
   - The tier pre-fills a list of switches and numbers, and each can be changed. A live preview shows the clauses that will be in the document.
   - Then they send it.
2. **Venue signatory:** reads it, confirms "I'm authorised to sign for <business>", and signs in the app or from an email link. The company countersigns.
   - From then on, the venue's More → **Agreement** shows the tier, a monthly **SLA scorecard**, and any credits or charges.
3. **Every booking:**
   - The request summary says "Under Priority agreement ORB-S-2026-0004", plus the notice and cancellation terms.
   - Cancelling inside the notice period shows the charge before confirming.
4. **Monthly:**
   - The SLA is measured against the targets. Misses produce **service credits** on the next invoice. Venue-side breaches produce **charges**.
   - The company manager reviews both before they post, and can waive either with a reason.
   - The venue sees the statement and can query it.
5. **No agreement** (the default for existing venues): today's behaviour and company-wide settings stay. A small note says "No service agreement"; nothing is blocked.

## 2. Tiers (pre-sets; every number can be edited per venue)
| | Standard | Priority | Premium |
|---|---|---|---|
| **Cover SLA** | | | |
| Reply to a request | 24 h | 4 h | 1 h |
| Fill rate target (planned requests, ≥72 h notice) | 90% | 95% | 98% |
| Short-notice (<24 h) best effort, or target | best effort | 80% | 90% |
| Officer arrives on time (within grace) | 90% | 95% | 98% |
| Replacement for a no-show on site within | — | 90 min | 45 min |
| Named regular team / continuity | — | preferred | guaranteed core team |
| Incident report sent to venue within | 48 h | 24 h | 12 h |
| Account review | — | quarterly | monthly, with report |
| **Company consequences (service credits)** | | | |
| Unfilled planned position | credit 0 | 50% of that shift's charge | 100% |
| Late arrival beyond grace | not billed for late minutes | + 10% shift credit | + 25% |
| No-show not replaced | not billed | not billed + 25% | not billed + 50% |
| Monthly cap on credits | — | 10% of the month's invoice | 15% |
| Persistent miss (3 months below target) | — | right to terminate early | same + exit without fee |
| **Venue obligations** | | | |
| Cancellation notice | 24 h | 48 h | 72 h |
| Late-cancel charge | min hours | 50% of booked hours | 100% |
| Short-notice uplift (<24 h) | 25% | 15% | 0% (included) |
| Timesheet sign-off / query window | 3 d / 7 d | 3 d / 7 d | 5 d / 14 d |
| Payment terms | 14 d | 30 d | 30 d |
| Late payment | statutory interest | statutory interest | statutory interest |
| Rate premium | base | + x% | + y% |

**Fair measurement (switches):**
- **Excused events don't count:** sickness reported in good time, venue-caused delays, and events a manager marks excused, using the existing `excused` flag.
- **Planned and short-notice requests are measured separately.**
- **Cover the venue cancelled or changed late doesn't count.**

## 3. Tools: what exists and what's new
**Reused, already there:**
- **Attendance events and grace minutes:** lateness and no-shows, with an excused flag.
- **Analytics:** on-time %, cover %, by venue, period presets.
- **Live / On site and Exceptions:** real-time late and no-show, plus the escalation timer (`ops_escalate_minutes`).
- **Ops AI cover proposals:** next officers / agency / unfilled.
- **The e-sign engine:** sending, links, countersignature, sealed PDF, verify page, reminders and amendments.
- **Clause library with legal review states:** draft / company / legal.
- **Orb's check of uploaded contracts:** used when a venue sends its own paper.
- **Invoice lines and credit notes:** `moneyFeed`, `invoices.credit`.
- **Timesheet queries:** the pattern for invoice and SLA queries.

**New:**
- **Agreement builder:** tier picker, granular switches, preview, send. This is a new `venue_services` pack whose clauses are switched on and off by those options (`lib/compose.mjs` already does rule-based slots).
- **Terms record:** `venue_terms` (versioned, `effective_from`, linked to the contract) plus `sla_targets` per venue.
- **SLA engine:** a monthly job measuring each target from existing data:
  - fill rate from requests and assignments;
  - reply time from the request's created and accepted times;
  - punctuality and no-shows from attendance events;
  - replacement time from the no-show time to the replacement clock-in (new: record `replaced_at`);
  - incident turnaround from the time the incident was sent to the venue.
  
  It writes `sla_periods` (one per venue per month) with each result, its evidence (shift ids) and any breach.
- **Credits and charges ledger:** each breach becomes a proposed credit or charge (draft invoice line or credit note) linked to the clause and its evidence. A manager approves or waives it with a reason, and the monthly cap is applied automatically.
- **Live SLA alerts:**
  - "Priority venue: position unfilled 48 h before start"
  - "No-show at a Premium venue, replace within 45 min"
  
  These feed the existing Live / Exceptions and notifications at a higher priority by tier, and Ops AI ranks tier venues first when proposing cover.
- **SLA scorecard:**
  - Venue: monthly traffic lights, trend, credits earned, downloadable report.
  - Company: all venues side by side, at-risk venues this month.
- **Notice and cancellation at booking:** the charge and uplift are shown before sending or cancelling, and added as draft lines.
- **Queries and disputes:** a venue can query an SLA result, credit or charge, and any invoice line. A manager answers; each step has its own clock.
- **Renewals:** end date, notice to renew or exit, and a renewal reminder. Persistent-miss rights are flagged on the scorecard.
- **Account review pack:** a quarterly or monthly PDF with SLA results, incidents and feedback, using existing analytics.

**Unchanged:** how officers work, pay and eligibility rules, bans and incidents. Officers see nothing new beyond a "priority venue" tag on offers (optional).

## 4. Legal footing
- UK e-signatures are valid (Electronic Communications Act 2000 / UK eIDAS).
- The existing evidence trail is kept: timeline, fingerprint, sealed PDF, verify page, authority statement and job title.
- Each booking is made under the agreement through the "Under agreement …" line.
- Service credits are framed as **price adjustments with a cap**, not penalties, so they are more likely to hold up under the UK penalty rule.
- Late payment follows the Late Payment of Commercial Debts Act.
- The clause wording stays at "draft" until the company's solicitor approves it. The library tracks this; the app gives no legal advice.

## 5. Phasing (each phase is a release with its own What's new card)
1. **Agreement and tiers:** builder, terms record, signing, venue Agreement screen, "Under agreement" on requests. No money effects yet.
2. **Venue obligations:** per-venue payment days, sign-off and query windows, notice and cancellation charges, short-notice uplift.
3. **SLA engine and scorecard:** monthly measurement, live SLA alerts, Ops AI priority by tier.
4. **Credits and charges ledger:** review, waive, monthly cap, on invoices; queries and disputes; renewals; account review pack.

## Verification
- **Mock:** three test venues (one per tier) and one with no agreement, with seeded attendance events: late, excused late, no-show replaced in 30 and 120 minutes, unfilled planned and short-notice requests, a late cancel.
- **API tests:**
  - tier pre-sets;
  - measuring each SLA target, including the excusal rules;
  - credit maths and the cap;
  - late-cancel charge;
  - per-venue due date and sign-off days;
  - the widened party constraint;
  - signing through a link and through a venue login.
- **agent-browser at 390 and 1280** as company, venue and officer: build, send, sign, countersign, verify; cancel inside the notice period; scorecard; approve and waive a credit; query.
- **Records:** test records only; no real agreement or charge is sent.
