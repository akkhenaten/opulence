# Spec: help on every shift — a citizenAID-style Toolbox on the shift card, and courses made from it

## Context
Officers on a door need help fast: someone is bleeding, not breathing, there is an attack or a suspicious bag. The app already has a **Toolbox** of guidance cards (first aid, situations, law, venue) with steps, "don'ts", sources, a review-by date, AI drafting and manager approval, plus offline copies on the phone. But today:
- the shift card shows only three category tiles (First aid / Situations / Law), and only once the shift has started;
- nothing is written yet (no cards are seeded);
- cards have no pictures, nothing marks the "life or death" ones, and venue procedures are not offered from the shift;
- the Academy (courses, quizzes, certificates) and the Toolbox are separate: a card can link to a course, but a course cannot be made from cards.

The user wants the Toolbox on every shift, in the spirit of **citizenAID** (UK charity: simple, step-by-step, "do the right things in the right order", pressure → pack → tourniquet, Run Hide Tell), and the same material to feed training.

## Decisions
- **We write our own content in citizenAID's style. We do not copy citizenAID wording, flowcharts or graphics** (their material is the charity's copyright). Sources are public UK guidance (NHS, Resuscitation Council UK, ProtectUK / NaCTSO "Run Hide Tell", SIA). Each card lists its sources. Cards link to the free citizenAID app as an extra.
- **AI drafts, a manager approves.** Nothing reaches officers until a company manager publishes it. Every first-aid and emergency card carries "Reviewed by {name}, {date}" and a review-by date (existing).
- Defaults taken (questions not answered): emergency tiles + search on the shift card; "Make a course from cards".

## What officers get

### On every shift card (from confirmation, not only after the start)
- **Emergency row** (red, first on the help section): up to 4 big tiles for cards a manager marks **"Emergency"**, e.g. *Bleeding*, *Not breathing*, *Attack — Run Hide Tell*, *Suspicious item*. One tap opens the card. Always shown, even after the shift ends, works offline (from the phone's saved copy).
- **"Get help" bar**: the existing "What should I do?" search (describe the situation, it picks up to 3 approved cards; it never writes advice itself).
- **Categories**: First aid, Situations, Law, and **This venue** (cards for this venue, plus the site pack link).
- Shown only when the Toolbox module is switched on.
- Every emergency card starts with a fixed line: **"Call 999 first if anyone is in danger."**

### The card is visual, like citizenAID (not a wall of text)
- **Colour by urgency**: red header for emergency cards, amber for situations, blue for law and venue, each with a large icon.
- **A picture on every step**: every step has its own simple pictogram (e.g. hands pressing on a wound, packing, a tourniquet above the wound, a phone with 999), with 3–8 words of text under it.
  - The pictures are in **one house style**: flat, two colours, no faces and no blood detail. They are AI-drawn from a fixed style prompt so the whole set matches.
  - A manager approves every picture and can redraw or upload a replacement. No citizenAID graphics are used.
- **Two ways to read a card:**
  - **Step by step** (the default for emergency cards): one big picture and one instruction fill the screen, with large Next and Back buttons, and it works one-handed in the dark (high contrast, big type).
  - **Overview**: all steps on one scrolling page, with small pictures.
- **Simple yes/no branches** on the four emergency cards, the way citizenAID asks questions. For example, Not breathing asks "Are they breathing normally?": Yes goes to the recovery position, No goes to CPR and the defib. Each answer jumps to a step on the same card, and the AI starter pack drafts these questions too.
- **Offline**: pictures for the emergency cards are saved on the phone along with the text, so they still show with no signal.
- The existing "Don't", "When to escalate" and "For your report" fields stay, shown as short icon rows.
- Footer: sources, "Reviewed by … on …", and "Learn more: citizenAID app" link.
- A **"Report this"** button on cards opened from a shift: starts the report for that shift with the matching type (Injury/first aid, Ejection, Damage…).

## What managers get

### Starter pack
- Toolbox admin gets **"Add the starter pack"**: AI drafts ~12 cards as drafts (Catastrophic bleeding: pressure, pack, tourniquet · Not breathing / CPR & defib · Unconscious but breathing (recovery position) · Choking · Seizure · Drunk or drugged and unresponsive · Knife attack · Attack: Run Hide Tell · Suspicious item · Acid / corrosive attack · Crowd crush · Vulnerable person). The four core ones come pre-marked "Emergency".
- Each draft must be read and published by a manager. Uses AI credits (one draft per card, as today).

### Marking emergency cards
- A new **"Emergency — show on every shift"** switch on a card (max 4 shown; order by drag or number).

### Make a course from cards
- In Toolbox admin, pick cards → **"Make a course"**. It creates a draft course:
  - one lesson per card; the card's steps and don'ts copied in as lesson blocks (word for word, no AI rewrite of the steps);
  - AI writes the short lesson text, quick checks and quiz questions (existing Academy drafting);
  - first-aid courses are mandatory with 12-month renewal (existing rule).
- The manager edits and publishes it like any course; the cards then show "Learn this properly → course".
- **If a card is changed after the course is made, the course shows "A Toolbox card changed — check this course"** for managers.

## Non-goals
- No copying of citizenAID text, flowcharts, images or their app. No formal partnership in this release (the user may contact citizenAID separately).
- No live video, no audio guidance, no AI writing first-aid advice on the fly for officers.
- Not a replacement for a certified first-aid course (the course says so).

## Permissions & data
- Company managers write/publish cards and courses (existing). Security managers can view.
- Officers see published general cards + cards for their venues (existing rule).
- **Card storage**: the plain list of steps becomes a list where each step holds its text, a picture, and an optional question with a Yes step and a No step. Cards that already exist still work as text-only steps.
- **New card fields**: the emergency flag and its order.
- **Courses**: each course remembers which cards it was made from. Lessons reuse the step pictures.
- **Cost**: AI pictures use credits, roughly 6–8 per card.

## What's new
New card at the top of Audit → What's new (date = deploy day), e.g. "Help on every shift": emergency tiles on the shift, a starter pack in the citizenAID style, pictures on cards, courses made from cards.

## Verification
- API unit tests: emergency cards ordered and capped at 4; course-from-cards copies steps verbatim and records the cards; changing a card flags the linked course.
- Mock (officer): shift card shows the Emergency row before start, after end and offline; card opens; "Report this" opens the form with the right type. Manager: starter pack creates drafts only; make a course; edit a card → course flagged.
- Build (ui-lint ≤ 67), `npm test`, deploy, read-only live check. No starter pack is run on live data without the user's OK (it creates drafts and spends AI credits).
