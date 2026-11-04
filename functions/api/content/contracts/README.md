# Contract packs and the clause library

Versioned data, not code. `lib/contractContent.mjs` seeds it into the database after migrations. A seeded
version is never overwritten: changed wording arrives as a new version, which each company can choose to adopt.
`lib/compose.mjs` turns a pack, the manager's answers and the clause library into a draft.
`test/contracts.content.test.mjs` validates everything in this folder.

Everything seeded here is a **Research-based draft**. It is never presented as legally approved.

## Files
- `packs/<id>.json`: one pack per contract family. The variants for each jurisdiction live inside the same file.
- `clauses/<subject>.json`: an array of clauses. A clause can be used by any pack.
- `law.json`: an array of law items (source, status, effective date) that clauses and packs link to.

## Pack
```jsonc
{
  "id": "permanent", "version": 1,
  "title": "Permanent employment (full-time or part-time)",
  "summary": "One line for the pack picker",
  "party": "person",                 // person (staff member or applicant) | organisation (outside business)
  "engagement_type": "employee",     // employee | worker | self_employed | psc | agency_worker | labour_provider | subcontractor
  "doc_title": "Contract of Employment",
  "jurisdictions": ["ew", "sc", "ni"],
  "law": ["era2025-unfair-dismissal-6m"],          // law items relevant to the whole pack
  "sections": [{ "id": "pay", "title": "Pay" }],   // Guide sections, in order (questions point to them)
  "questions": [{
    "id": "pay.rate",                // dotted variable name, used as {{pay.rate}} in clause wording
    "label": "Hourly rate",          // printed in Schedule 1 and in "[to be confirmed: …]"
    "help": "Gross rate per hour before deductions.",
    "type": "money",                 // text | textarea | date | money | number | choice | yesno | note
    "options": [{ "value": "weekly", "label": "Weekly", "text": "weekly" }],   // choice only; "text" is the in-contract wording
    "section": "pay",
    "required": true,                // default true
    "prefill": "officer.start_date", // see "Prefill keys"
    "showIf": { "q": "pay.basis", "eq": "hourly" },
    "particular": true,              // listed in the particulars summary (default true)
    "schedule": true,                // printed in Schedule 1 (default true)
    "jurisdictions": ["sc"]          // only in these variants (optional)
  }],
  "assessment": {                    // D, E, F only: the status assessment (see below)
    "title": "Status assessment", "intro": "…",
    "questions": [{ "id": "substitution", "label": "…", "help": "…", "options": [{ "value": "yes", "label": "…" }] }],
    "outcomes": {
      "employment": [{ "result": "self_employed", "when": { "all": [] } }],   // first match wins; no match = unresolved
      "tax": [{ "result": "self_employed", "when": {} }]
    },
    "expects": { "employment": ["self_employed"], "tax": ["self_employed"] },
    "mismatch": "Use the casual worker pack or the permanent pack instead."
  },
  "clauses": [{                      // the document, in order: "# <title>" headings, then the clause wording
    "id": "pay", "title": "Pay", "required": true,   // required (default true): an empty section is a Blocker
    "include": { "q": "…" },         // optional rule for the whole section
    "slots": [{
      "slot": "pay.basis",           // stable slot id; also the "group" of company alternatives
      "clauses": ["EMP.PAY.HOURLY", "EMP.PAY.SALARY"],   // first = standard, others = alternatives
      "default": "EMP.PAY.HOURLY",
      "choose": [{ "when": { "q": "pay.basis", "eq": "salary" }, "clause": "EMP.PAY.SALARY" }],  // auto-pick by answers
      "include": { "q": "benefits.vehicle", "eq": "yes" },   // conditional clause: left out when false
      "optional": true, "on": false, // manager switch (default off unless "on": true)
      "why": "Included because a company vehicle is provided",
      "jurisdictions": ["sc"]        // slot only in these variants
    }]
  }],
  "overrides": { "sc": { "law.governing": { "clauses": ["GEN.LAW.SC"] } } },   // per-jurisdiction slot changes
  "rules": [{
    "id": "zh-unrestricted-availability", "severity": "blocker",   // blocker | review | note
    "when": { "all": [{ "q": "hours.guaranteed", "eq": 0 }, { "q": "availability.required", "eq": "unrestricted" }] },
    "message": "Plain-English explanation and what to do instead.",
    "jump": { "question": "availability.required" },   // or { "slot": "…" } / { "clause": "…" } / { "assessment": true }
    "law": ["…"]
  }],
  "supporting": [{ "title": "Disciplinary and grievance procedure", "contractual": false, "when": {} }],
  "decision": { "hint": "Shown by the 'Not sure? Answer 3 questions' helper" }
}
```
Note: the document structure key is `clauses` (sections with slots). The Guide's question groups are `sections`.

### Rules
```
{ "all": [r…] } | { "any": [r…] } | { "not": r }
{ "q": "id", "eq"|"ne"|"in"|"nin"|"gt"|"gte"|"lt"|"lte": v } | { "q": "id", "empty": true } | { "q": "id" } (answered and not "no")
{ "clause": "ID", "on": true }      clause chosen in the document so far
{ "bespoke": "ID" | "*" }           wording edited for this document
{ "jurisdiction": "sc" | ["sc","ni"] }
{ "assessment": "qid", "eq": v }    status-assessment answer
{ "outcome": "employment"|"tax", "eq": v }   recorded assessment outcome
{ "wording": "regex" }              case-insensitive match on the wording chosen so far, bespoke text included
```
Clause slots are evaluated in document order, so a `clause` rule only sees clauses earlier in the document.
Pack `rules` run after the whole document is built.

### Prefill keys
`company.name`, `company.address`, `company.number`, `today`, `effective_date`,
`officer.name`, `officer.address`, `officer.email`, `officer.start_date`, `officer.role`, `officer.sia_type`, `officer.sia_number`,
`org.name`, `org.number`, `org.address`, `org.signatory_name`, `org.signatory_title`, `org.email`.
A prefilled value is shown to the manager as "prefilled" and only prints once confirmed.

## Clause
```jsonc
{
  "id": "EMP.NOTICE.STATUTORY",      // SUBJECT.TOPIC[.VARIANT], upper case, stable forever
  "title": "Notice: statutory minimum",
  "subject": "employment",
  "versions": {
    "all": {                          // shared wording; "ew" / "sc" / "ni" override it for one jurisdiction
      "body": "Markup with {{dotted.vars}}",
      "sources": [{ "title": "Employment Rights Act 1996, s.86", "url": "https://www.legislation.gov.uk/ukpga/1996/18/section/86" }],
      "checked_on": "2026-11-04",
      "law": ["…"]                    // optional law item ids
    }
  }
}
```

### Wording markup
- Paragraphs are separated by a blank line, and each paragraph becomes a numbered sub-clause (3.1, 3.2 …) under its section heading.
- `- item` makes a bullet and `**bold**` makes bold text. Don't put `#` headings inside clause wording, because the section supplies them.
- Write in plain English, in the second person for the individual ("you", "the Company") or with defined terms for business-to-business packs.

### Drafting rules (enforced by the validator where possible)
- Never hard-code pay, hours, notice periods, insurance limits, fees, benefits or dates. Use a variable.
  - The only exception is a statutory figure quoted as the law, for example "the statutory minimum notice in section 86". Mark it in the text as statutory.
- Never describe announced or not-yet-commenced law as current. Link a law item instead, and the draft shows it as a Note.
- Every version has at least one source (GOV.UK, ACAS, LRA/nidirect, SIA, HMRC, legislation.gov.uk) and a `checked_on` date.
- Scotland and NI need their own version wherever the statute, the institution or the courts differ. For example:
  - NI uses the Employment Rights (Northern Ireland) Order 1996, the Working Time Regulations (Northern Ireland) 2016, the Labour Relations Agency instead of ACAS, and industrial tribunals.
  - The Employment Rights Act 2025 changes apply in Great Britain only.
