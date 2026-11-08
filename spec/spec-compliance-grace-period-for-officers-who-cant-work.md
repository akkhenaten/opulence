# Spec: a renewable grace period for officers who can't work (compliance)

## Context
Nine officers currently show as **can't work** in Today › Needs you. Most of them hold their documents; we just don't have the copies yet, or haven't checked them. While an officer is blocked they can't be put on the rota, get cover offers, or clock in. Managers need a controlled, recorded way to let them keep working while they produce their documents, for a set number of days that can be renewed.

### Today: one rule decides "can't work"
The rule is `compliance(o, today)` in `functions/api/modules/officers.mjs:29`. It gives these reasons:

| Key (new) | Issue text today |
|---|---|
| `sia_missing` | No SIA licence on file |
| `sia_expired` | SIA licence expired |
| `sia_register` | SIA register shows the licence as suspended/revoked/… (only when SIA Checker is on) |
| `rtw_unverified` | Right to work not verified |
| `rtw_expired` | Right to work expired |
| *(never graced)* | `Status: <x>` (not active). This is an HR state, not a document. |

There is one more check, `checkOfficerForShift` (`modules/rota.mjs:26`). It blocks a shift when "SIA licence expires before this shift" (`sia_expiry_shift`).

### What being blocked stops
- `shifts.assign`, `shifts.reassign`, `shifts.decideRequest` and `shifts.request`: the call fails with 422.
- The cover shortlist `rankCover` (`ops.mjs:106`) and `offerRespond` (`ops.mjs:1002`).
- `clock.punch` in (`clock.mjs:155`).
- Payroll is never blocked.

### Overrides today
There is no override for these blocks:
- The rota `override` only skips warnings.
- `force` on `onboarding.setStatus` makes someone active, but they stay blocked.
- `compliance_dismissals` only hides Orb's advisory issues.

## Decisions
- **Any reason can be put on grace** (user's decision). That includes an expired SIA licence, a bad register status and expired right to work. The `Status:` issue is the exception; it is not a document.
  - Because those three carry legal risk, the manager must tick an acknowledgement (wording below), and the risk is written into the audit record.
- **Length and renewal** (recommended default; the user can change it):
  - 7 or 14 days, or a chosen end date. 14 days is the default.
  - Renewable **2 times**, each with a reason, so a grace lasts at most about 6 weeks.
  - After that it can't be renewed. The officer stays blocked until the documents arrive, or a new grace is started, which needs a fresh reason and is logged as a new grace.
- **Who:** company managers (and the platform admin) grant, renew and end a grace (recommended default). Security managers can see who is on grace but can't change it. Venue logins never see any of this.
- **When a grace runs out** (recommended default):
  - The officer is blocked again.
  - Orb raises a compliance card listing their upcoming shifts, with "Take them off and find cover" ticked, for a manager to approve.
  - Nothing is cancelled automatically.

## How a grace works
A grace covers **the issues the officer had when it was granted**, and only those. Each covered issue is a key from the table above.
- If a **new** issue appears during the grace (for example, a licence that was on file expires), it still blocks until a manager adds it to the grace.
- A grace ends early **by itself** as soon as all the covered issues are fixed, for example when Orb reads and applies the uploaded SIA card or passport. That end is logged and managers are told "<name> is now compliant".
- **Shifts during the grace** can be rostered and worked. A shift dated after the grace end date is blocked with "Grace ends <date>; can't roster after it". This keeps the rota from filling up with shifts that will fail.
- Clock-in is checked against today's date. The grace runs **to the end of** `ends_on`, London time.

## Data
**Migration `functions/api/db/migrations/057_compliance_grace.sql`:**
```sql
CREATE TABLE compliance_grace (
  id serial PRIMARY KEY,
  officer_id int NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  covers text[] NOT NULL,            -- issue keys: sia_missing, sia_expired, sia_register, rtw_unverified, rtw_expired, sia_expiry_shift
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text NOT NULL,
  risk_ack boolean NOT NULL DEFAULT false,   -- ticked when covers include sia_expired / sia_register / rtw_expired
  renewals int NOT NULL DEFAULT 0,
  granted_by int REFERENCES users(id),
  ended_at timestamptz, ended_by int REFERENCES users(id),
  end_reason text,                   -- 'documents' | 'expired' | 'ended' (by a manager) + free text
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX compliance_grace_open ON compliance_grace(officer_id) WHERE ended_at IS NULL;
CREATE TABLE compliance_grace_events (   -- grant / renew / end / cover-added, for the profile history
  id serial PRIMARY KEY, grace_id int REFERENCES compliance_grace(id) ON DELETE CASCADE,
  kind text NOT NULL, ends_on date, reason text, by_user int, created_at timestamptz DEFAULT now()
);
```
- Each officer has at most one open grace.
- `compliance()` stays synchronous. Every place that loads officers for a check also loads the open grace in one query: `LEFT JOIN compliance_grace g ON g.officer_id=o.id AND g.ended_at IS NULL`. A small helper `withGrace(officers)` in `officers.mjs` attaches `o.grace = {id, covers, ends_on, renewals}`.

## Rules (back end)
**`compliance(o, today)`** (`officers.mjs:29`):
- Give each issue its key.
- Any issue whose key is in `o.grace.covers`, while `today <= o.grace.ends_on`, moves from `issues` to `graced`.
- `ok` = `issues.length === 0`. The return value becomes `{ ok, issues, graced, grace: {ends_on, renewals, days_left} | null, sia_days, rtw_days }`.
- Keep the issue text the same, so the officer Home page, the profile chips and the officers list keep working.
- `nonCompliantCount` (`dashboard.mjs:76`) then drops graced officers automatically. Add `onGrace` (a count, plus the next `ends_on`) to `dashboard.get` for company.

**`checkOfficerForShift`** (`rota.mjs:17`):
- `sia_expiry_shift` is graced when it is covered and `shift date <= ends_on`.
- **New blocking issue:** "Grace ends <d MMM>; can't roster after it", when the officer is only ok because of a grace and the shift date is after `ends_on`.
- `shifts.candidates` shows graced candidates with a pill `On grace until <date>`.

**These need the grace loaded:**
- `rankCover` / `offerRespond` (`ops.mjs`)
- `clock.punch` (`clock.mjs:155`)
- every `checkOfficerForShift` caller
- `dashboard.get`
- `officers.list` / `officers.get` (`shapeOfficer`)
- the officer `dashboard` (`dashboard.mjs:155`)

**New actions** (company manager only; in `modules/compliance.mjs`). Each one calls `audit()` and `logActivity()`:
- **`compliance.grace.grant { officer_id, days | ends_on, reason, covers?, risk_ack }`**
  - `covers` defaults to the officer's current blocking keys.
  - Fails with 422 when:
    - there is nothing to cover;
    - `days > 14` / `ends_on` is more than 14 days ahead;
    - the reason is under 5 characters;
    - a risky key is covered without `risk_ack`.
  - Audit `compliance.grace_grant` with `{covers, ends_on, reason, risk_ack, issues_text}`.
  - Notify the officer (tier action, email):
    - title "You can work until <date>";
    - body "Upload <what's missing> by <date> or you won't be able to clock in or take shifts after it.";
    - link `/officer/documents`.
- **`compliance.grace.renew { officer_id, days, reason }`**
  - Fails with 422 when `renewals >= 2` ("This grace has been renewed twice already; start a new grace with a reason if you must").
  - Renewal adds days from the later of today and `ends_on`, so lateness isn't rewarded. Increments `renewals`.
  - Audit `compliance.grace_renew` and notify the officer with the new date.
- **`compliance.grace.cover { officer_id, add: [key], risk_ack }`**: adds an issue that appeared during the grace. It keeps the same end date. Audited.
- **`compliance.grace.end { officer_id, reason }`**: closes the grace early (`end_reason='ended'`). Audited. The officer is told "Your grace period has ended".
- **`compliance.grace.list`**: the open graces, plus those that ended in the last 30 days, with officer name, covers, ends_on, renewals and granted_by name. Security managers get it read-only.
- `officers.get` returns `grace_history` (the events) for the profile.

**Jobs** (`runOpsJobs` → `JOBS.grace`, on every 5-minute tick, guarded once per day per grace):
- **Documents resolved:** if `compliance()` *without* the grace is ok, close it with `end_reason='documents'`.
  - Notify the granting manager plus company managers (tier FYI/bell): "<name> is compliant; grace closed".
  - This also runs straight after `docs.verify`, `autoApply`, `officers.rtwCheck`, `officers.save` and `sia.check`, so it doesn't wait for the tick.
- **3 days and 1 day before `ends_on`:** remind the officer (action, email) and the granting manager (bell, plus a Today row).
- **The day after `ends_on`:**
  - Close the grace with `end_reason='expired'`. Audit `compliance.grace_expired`.
  - Raise an Orb `ops_items` card (kind `compliance`, issue key `grace_expired`): "<name>'s grace period ended. Still missing: …".
  - The card's actions are `unassign` (ticked when there are upcoming shifts), `remind` and **`renew`**. Renew is only offered when `renewals < 2`; it opens the renew sheet.
  - It reuses `decideCompliance`'s existing unassign (cancels the assignments, notifies the officer, `proposeCover`).
- Add a `grace` toggle in `ops_jobs` (Orb settings, under the compliance toggles). It is on by default.

**The weekly digest** (`buildDigest`, `compliance.mjs:748`) gains an **On grace** section: name, what is missing, the end date and the number of renewals.

## Screens
**Grace sheet** (`app/src/pages/people/_graceSheet.jsx`; a `Sheet`, size sm). It is opened from the Compliance page, the staff profile, the Today row and the Orb card.
- Title: "Give <first name> time to send documents".
- **Covers**: one checkbox per blocking reason, all ticked. Each row shows the issue text.
- **Length**: a `Segmented` control with 7 days / 14 days / Pick a date. The date can be no more than 14 days ahead. Under it: "Ends <Sun 22 Nov>".
- **Reason**: required, e.g. "Has the card, uploading this week".
- **Risk acknowledgement**: shown only when an expired SIA licence, a bad register status or expired right to work is ticked. It is a red `Callout` with a checkbox:
  > "Working without a valid SIA licence is a criminal offence for the officer and the company, and employing someone without a valid right to work can lead to a civil penalty of up to £60,000 per worker. I have a good reason to allow this and accept the risk."
- Footer: Cancel, and "Start grace period" (primary).
- **Renew mode**: the same sheet titled "Extend <name>'s grace". It shows "Renewal 1 of 2" and the current end date, and the reason is required.

**Compliance page** (`app/src/pages/people/Compliance.jsx`):
- Add two sections above the existing issue tiles, from a new `compliance.blocked` action: the officers failing `compliance()` plus the open graces.
- **Can't work (N)**: one row per officer showing avatar, name, the reasons as red chips and the next rostered shift. Actions: "Give grace period" (company), and "Profile".
- **On grace (N)**: avatar, name, "until Sun 22 Nov · 3 days left" (amber at 3 days or fewer), "renewed 1×" and the reasons as amber chips. Actions in a `MoreMenu`: Extend, End now, Profile.
- The URL `?view=cantwork` scrolls to these sections. Today's "can't work" row links there, instead of plain `/people/compliance`.

**Today › Needs you** (`Dashboard.jsx` `NEEDS`):
- `cantWork` (red) stays and counts only officers with no grace. It now goes to `/people/compliance?view=cantwork`.
- New row **`graceEnding`** (amber, company): "N grace periods end within 3 days". Same link.
- Graces that have expired come in as Orb cards (above), not as a row.
- The summary line counts them as normal.

**Staff profile** (`StaffProfile.jsx`, `_profileTabs.jsx`, `_parts.jsx`):
- `complianceState` returns amber **"On grace until 22 Nov"** when `ok` is only true because of a grace. The Staff list filter gains **On grace**.
- Header chips: graced issues show amber with a small clock icon, not red.
- ComplianceTab gets a new **Grace period** tile (company: Extend / End now; security: read-only). It shows covers, end date, reason, who granted it and the history list (grant, renewals, cover added, end with its reason).
- When the officer is blocked with no grace, a "Give grace period" button sits by the Issues tile.

**Rota** (`Rota.jsx` candidate list):
- A grey pill reads "On grace until 22 Nov".
- Trying to assign a shift after the end date shows the blocking text from the API.

**Officer** (`pages/officer/Home.jsx:102`): while on grace, the red "You can't work shifts right now" row becomes amber:
- Title: "You can work until Sun 22 Nov".
- The missing items are listed, with an **Upload documents** button (to `/officer/documents`).
- `blocked` is false while graced.
- In the last 3 days the row turns red: "Grace ends in 2 days".

**Venue logins:** nothing changes. They never see grace, compliance or officer documents.

## What's new
The card is titled "Time to send documents: grace periods", with its own AI picture, dated on the deploy day. It goes in `app/src/pages/people/_whatsnew.jsx`, with the prompt in `app/scripts/whatsnew-images.mjs`. The text explains:
- what a grace allows;
- the 14 days and 2 renewals;
- that it ends by itself when the documents arrive;
- the expiry card;
- the risk tick box.

## Files
- **Back end:**
  - `functions/api/db/migrations/057_compliance_grace.sql`
  - `functions/api/modules/officers.mjs` (keys, grace in `compliance`, `withGrace`, `shapeOfficer`)
  - `modules/rota.mjs` (`checkOfficerForShift`, candidates)
  - `modules/clock.mjs`
  - `modules/ops.mjs` (`rankCover`, `offerRespond`, `JOBS.grace`, the `ops_jobs` key, the `grace_expired` card plus the renew action in `decideCompliance`)
  - `modules/compliance.mjs` (the grace actions, `compliance.blocked`, the digest)
  - `modules/dashboard.mjs` (`onGrace`, the officer dashboard)
  - `lib/docAuto.mjs`, `modules/documents.mjs` and `modules/sia.mjs` (call the grace-resolve check after they apply data)
- **Front end:**
  - `pages/people/_graceSheet.jsx` (new)
  - `Compliance.jsx`
  - `manager/Dashboard.jsx`
  - `StaffProfile.jsx`, `_profileTabs.jsx`, `_parts.jsx`, `Staff.jsx`
  - `Rota.jsx`
  - `officer/Home.jsx`
  - `manager/OpsAI.jsx` (the `grace` toggle and the card's renew action)
  - `_whatsnew.jsx` and `whatsnew-images.mjs`
- **Ship:** `openkbs fn deploy api` (it runs the migration), then the site build and deploy, and the 6ij75kpgf7 check.

## Verification
Use the local mock and a scratch database. Don't touch live data without asking.
1. An officer with no SIA on file is blocked. Grant 14 days:
   - Assign works, and so do the cover shortlist and clock-in.
   - Assigning on day 15 fails with "Grace ends…".
   - The officer gets the notification, and Home turns amber.
2. Grant covering an expired SIA licence without `risk_ack` → 422. With it → ok, and the audit record has `risk_ack:true`.
3. Renew twice (the end date moves from the later of today and `ends_on`). A third renew → 422.
4. The licence expires during the grace, so a new issue blocks. `grace.cover` adds it and the officer is unblocked.
5. Upload and verify the SIA card. The grace closes with `documents`, and the manager gets the bell note.
6. Move the clock past `ends_on`:
   - The grace closes with `expired` and the Orb card appears with unassign ticked.
   - Approving it cancels the shifts and proposes cover. Renew from the card works.
7. Security manager: sees the On grace list and the profile tile with no buttons; the API returns 403 on grant.
8. Venue login: no change.
9. Today: `cantWork` drops by the number on grace, and `graceEnding` appears at 3 days or fewer.
10. The weekly digest preview shows the On grace section.
11. `npm run build` passes, and ui-lint is not above the baseline.

## As built (v169)
Defaults shipped: 7 / 14 days or a date (max 14), renewable twice with a reason, company managers (and the platform admin) give, extend and end; security managers read only; a tick to accept the risk for expired SIA, SIA register problems, expired right to work and a licence running out during the grace. Not active staff are never covered.

Changes from the plan above:
- **The officer row carries a copy of the open grace** (`officers.grace_until`, `grace_covers`, `grace_lapsed_on`, kept in step by `grace.mjs`), so every `compliance(o)` call (clock-in, rota checks, cover ranking, offers, dashboards) sees it without a join. No `withGrace` helper.
- **No hooks in document upload / SIA checks.** `compliance()` reflects new documents at once; the 5-minute ops job `grace` (Orb settings → Grace periods) closes the grace record as "documents in", sends the 3-day and 1-day reminders, and closes it as "expired" when it runs out.
- **The ran-out card is an issue on the officer's existing Orb compliance card** (`grace_expired`, urgent): take them off their shifts and find cover (ticked when they have shifts), remind them, or Give them 7 more days (company only, counts as a renewal).
- **History** comes from `compliance.grace.history` (Grace period tile on the profile's Compliance tab), not `officers.get`.
- A licence that expires during a grace covering "runs out during the grace" stays covered until the grace ends.
- Grace notices reach the phone (v161 rule); none are bell only.
