# Spec: Three-portal review, slice 10: compliance as a review queue, and records you can trace

## Why
Slices 1–9 have reached every theme in the review. Four parts are still open, and all are company-manager work:

- **R05, compliance (CM09–CM13, O07, O08, E01–E03, E06):** Compliance is one long card per officer. A manager can't see a single document's full state, which shifts it affects, or who has to act next. The real actions (verify, re-check, correct, remind, remove from shifts) only exist on Today cards. Orb already reads every upload into `documents.ai_read`, but nowhere shows the profile value, the typed value and Orb's reading side by side.
- **R24, audit (CM27):** the audit log reads in plain words, but only on the Audit page and in a user's access history. No staff, venue, shift, invoice or contract page shows its own history.
- **R09, contracts (CM15, CM16):**
  - Signatory set-up, templates, sending, sent contracts and clause review are spread across Staff → Contracts and Settings → Templates & contracts, with nothing showing the order of steps.
  - A sent contract doesn't say which template version it came from, or whether it was replaced.
- **R20, learning (CM28, O09, E07, E08, E17):**
  - An officer with nothing assigned shows "No certificates yet" with a green **Up to date**.
  - "Required" says nothing about who it is assigned to. Ticking Required alone creates no to-do.
  - A course keeps only a version number. There is no copy of what earlier versions said.

## Who it's for
- **Company managers:** work through compliance one document at a time, and see each record's history where they are looking at it.
- **Security managers:** get the compliance queue in their own portal, with the same scope and actions they have today.
- **Officers:** no new screens. Their tasks keep matching the source requirement (already true).
- **Venue managers:** nothing new. No identity evidence or private reasons reach them.

## Scope

### 1. Compliance as a review queue (R05)
**Page:** Compliance (`/company/people/compliance`, and `/security/people/compliance`).

- **The queue** lists one row per **officer + document** (licence, right to work, ID, other documents, a training certificate, a venue pack). Today's "Who", "Area" and severity filters stay and are kept in the page address.
  - Each row reads as one line, e.g. "Sam Reed · SIA licence · expires in 9 days · **Officer to renew**".
  - Rows are sorted can't-work first, then on grace, then urgent, soon and advisory.
- **Who must act** is shown on every row and in the panel. It is worked out from the finding, and no rule changes:

  | Finding | Shown as |
  |---|---|
  | Missing, or expiring and nothing new uploaded | Officer to upload / Officer to renew |
  | Uploaded and waiting to be checked; a reading that doesn't match; a clearer photo needed after a request | Office to check |
  | On grace | Office: grace ends {date} |
  | Office-owned set-up step | Office (as in "Waiting on the office") |

- **A "By person" switch** keeps today's grouping per officer for anyone who prefers it. It is the same data, shown as one row per person with their documents underneath.
- **Desktop (≥1024px):** the queue on the left; the selected document opens in a side panel, using the same pattern as Users & access. Up and down arrows step through rows.
- **Phone:** tapping a row opens the document full screen. Back returns to the queue at the same place and with the same filters (`?doc=`).

**The document panel** shows, top to bottom:
1. **Status line** in plain words, e.g. "Uploaded 12 Nov · not checked yet · in date until 3 Mar 2027". It uses the existing wording ("In date · not checked", "Checked by Orb", grace wording).
2. **What we have vs what Orb read:** a small table with the columns Field, On profile, On the upload, Read by Orb. The rows are number, expiry, name and photo where they exist.
   - A value that differs is marked "Doesn't match".
   - Orb's reading never sets anything by itself on this screen. Today's automatic apply of agreeing readings (`docAuto`) stays exactly as it is.
3. **Why it matters:** the rule in one line, e.g. "Needed to work door shifts. Without it they can't be booked after 3 Mar."
4. **Shifts affected:** the officer's booked shifts in the next 14 days that this finding would stop, each linking to its shift page. If there are none, it says "No booked shifts affected".
5. **Actions:** only the ones the finding already offers today, carried out with the same server rules:
   - Verify, Re-check, Correct (company only), Remind officer, Remove from shifts, and the grace actions.
   - Verify and Re-check/Correct on the same document still can't both be done.
   - If the finding has an Orb card on Today, the action goes through that card so it clears there too.
6. **View file** (existing signed link) and **Open profile → Documents**.

**Server:**
- The compliance overview adds these fields to each row:
  - `doc_id`, `expiry`, `days_left` and `checked` (none / Orb / person);
  - `owner` (officer / office);
  - `affected` (assignment id, venue, start), using the same assignment query the Remove from shifts action already uses;
  - `actions`, the list the Today card would offer.
- New `compliance.document {officer_id, doc}` returns the panel data:
  - profile values (`officers.sia_*` / `rtw_*`);
  - typed values (`documents.number` / `expiry`);
  - Orb's reading (`documents.ai_read`, only number, expiry, name, has_photo and concerns);
  - the file reference.
- It uses the same roles and the same venue scope as `compliance.overview`.

### 2. History on each record (R24)
A **History** section on these pages, for company managers only. `audit.list` is company-only today, and that stays:

| Page | Records it shows |
|---|---|
| Staff profile | the officer, plus their documents, contracts, rates and HR notes |
| Venue | the venue and its rates |
| Shift page (manager view) | the shift and its assignments |
| Timesheet sheet | the timesheet |
| Invoice and statement detail | the invoice or statement |
| Contract detail | the contract |

- The section starts collapsed with "History · N changes". It shows 10 entries at a time, with **Show more**, in the Audit page's wording ("14 Nov 21:40 · Sam Reed · approved hours 22:00–04:00").
- Technical detail stays one tap away, as on the Audit page.
- Every record link on the Audit page gains the types that now have a page: shift, timesheet, contract and pay run.
- **Server:** `audit.list` accepts `entity` + `entity_id`, as today, plus an optional `related: true`. That adds the child records listed above for that parent (e.g. the documents of an officer). There is no new table and nothing new is recorded.

### 3. Contracts by step (R09)
**Staff → Contracts** (`/company/people/contracts`):
- **A step strip** at the top:
  1. **Signatory:** set / not set, linking to the signatory tile;
  2. **Templates:** N ready, linking to Settings → Templates & contracts;
  3. **Send:** the existing start, upload and send-from-template sheets;
  4. **Track:** N waiting for signature, which filters the list.
- A step that isn't done says so, e.g. "No signatory yet: contracts can't be sent".
- **Each sent contract row** shows where it came from: "From Door supervisor contract v4" or "Uploaded file". It shows "Replaced by v5 on 2 Dec" when it was superseded.
- **Contract detail:** a version line, plus the History section from §2.
- The existing views (Issued, Drafts), filters, Void and the drafting workspace are unchanged.

**Settings → Templates & contracts** keeps the same content in three labelled sections:
- **Who signs for the company** (the signatory tile);
- **Templates** (list and editor, with the existing version history);
- **Clause library and legal review (advanced)**, collapsed by default: Packs, Legal reviews, Clauses and Law watch, unchanged inside.

No contract, version or signature data changes.

### 4. Learning: what is required, for whom, and what changed (R20)
**Staff records** (Learning → Staff records, and the staff profile Training tab):

| State | Pill | Line |
|---|---|---|
| Nothing assigned, no certificates | grey **No training assigned** | today's green "Up to date" goes |
| Certificates and nothing to do | green **Requirements met** | |
| An outside certificate with no file or not checked | blue **Not checked** next to it | it never counts as checked |

- The certificate pills, and the pills for expired, ending soon, overdue and to do, are unchanged.

**Courses tab:**
- **Required** reads "Required · 12 assigned", or "Required · nobody assigned yet", with an **Assign** link.
- The course editor explains, next to the toggle, that Required marks the course and assigning it is what puts it on someone's list. Required does not start creating to-dos.
- Archived courses fold into one line, "N archived · Show", in place of full rows. The "Show archived" checkbox is replaced by this line.

**Course versions (E08):**
- Publishing a course saves a copy of what it said: title, cards or lessons, and quiz. This needs migration 065, `course_versions`.
- The editor gets **Versions**: "v3 · published 12 Nov by Sam Reed". Each one opens read-only, with the officers who passed that version (`quiz_attempts.course_version`).
- Earlier versions published before this release show "Published before versions were kept".
- **Similar courses:** when two courses have near-identical titles, the Courses list shows a small "Looks similar to …" link. It opens both side by side (title, length, assigned, passed). Nothing is merged or archived automatically.

**Officer Learn:** a guide or course that is no longer available shows as one short muted line, "No longer available · your certificate stays valid", in place of a full card.

### 5. What's new
A new top card with its own AI picture, in the same commit.

## Cross-portal impact
| Item | Company manager | Security manager | Officer | Venue manager |
|---|---|---|---|---|
| 1 Compliance queue | Queue, panel, actions as today | Same, within their scope; no Correct (as today) | No change; tasks and reminders as today | No change; no evidence or reasons |
| 2 History | History on records | No change (audit stays company-only) | No change | No change |
| 3 Contracts | Step strip, source/version lines | As today | Signing unchanged; signs the exact version sent | No change |
| 4 Learning | Clear states, Required · N assigned, versions | Same where they see Learning today | Removed content is one line | No change |

## Acceptance criteria
- **Compliance at 1280:**
  - The queue shows one row per officer + document, with who must act.
  - Arrows step through rows, and the panel shows status, the three-column comparison with "Doesn't match", affected shifts and only the allowed actions.
  - Verify from the panel clears the matching Today card. Verify and Re-check together are refused.
- **Compliance at 390:** the row opens full screen; Back returns to the same place and filters. "By person" shows today's grouping.
- **Security manager:** sees only their scoped officers and no Correct.
- **Staff profile, venue, shift, timesheet, invoice and contract** (as company manager):
  - History shows plain-language entries, 10 at a time.
  - A security manager or venue user sees no History section and gets no audit data from the server.
- **Contracts:**
  - With no signatory, the strip says contracts can't be sent.
  - A sent row says which template version it came from, and a superseded contract says what replaced it.
  - Settings has the three sections, with Advanced collapsed.
- **Learning:**
  - An officer with nothing assigned shows "No training assigned", not green.
  - A mandatory course with no assignments says "nobody assigned yet".
  - Publishing twice gives v1 and v2 in Versions, each readable.
  - Archived courses are one line.
- **Tests:** API tests cover the compliance row fields (owner, affected), `compliance.document` scope, `audit.list related`, and course version saving.
- **Build:** ui-lint stays ≤70, and the emergency and flow checks pass.
- **What's new:** the card and picture are added in the same commit.

## Constraints
- Test records only. No real documents, contracts, verifications or assignments are submitted on the live app.
- No change to:
  - eligibility, grace, verification, automatic apply, pay, sign-off or approval rules;
  - who can see what;
  - the handover composer.
  The queue only shows and reuses existing decisions.
- Orb's reading is shown as Orb's reading. It never counts as a person's check.
- Old links keep working: `/company/people/compliance` with its current filters, Today card actions, `?tab=documents`, and contract and course links.
- One migration (065, `course_versions`). It only adds data and is safe to run twice.

## Decisions (defaults, change if you disagree)
1. **The queue becomes the default view**, with "By person" one tap away. The alternative is to keep By person as the default.
2. **History stays company-manager only**, as the audit log is today. Opening it to security managers would be a visibility change, so it is left out.
3. **Course versions keep a copy from this release on.** Earlier versions can't be rebuilt, so they say so instead of guessing.
4. **"Looks similar" only suggests and compares.** Archiving stays a manager's choice.

## Out of scope
- R12 demo-request visibility, the unchecked-licence rule, and live spot checks (on hold).
- The navigation study (section 6 of the review) and the cross-role run with test records (sections 8–9). These are next.
- Any change to what officers must upload, or to clause and legal-review content.
