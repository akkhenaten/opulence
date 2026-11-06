# Spec: the Emergency guide as a ProtectUK flowchart (text cards, no pictures)

## Context
The current Emergency guide (`/guide/emergency`) uses one illustrated screen per step. It holds:
- the handover pack's Knife journey;
- 34 AI-drafted screens.

The owner finds the pictures a nightmare. They're slow to read in a hurry, ten still need clinical sign-off, and where none fits a borrowed one misleads. The owner wants a flowchart instead.

Decisions the owner made (6 Nov 2026):
- **Text-only cards:** a title, a short detail and 2–4 answers. No pictures anywhere.
- **A trail:** each answer you give stays on screen as a step above the current card, so the flowchart builds up as you go, from Choose the situation to the end of the journey.
- **Sources:** every card is sourced from **ProtectUK**, and from **citizenAID** for first aid. ProtectUK wording **replaces the Knife pack wording too**.
- **A map view for reviewers:** the whole flowchart on one page.
- **Persistent controls:** **Call 999** and **I'm in danger** stay.
- **Visibility:** platform admin only.
- **Alongside the current guide:** both are kept so the owner can compare. Nothing in the current guide changes.

## Permissions (read first: this limits who may see it)
I checked the terms on 6 Nov 2026. This is not legal advice.

**ProtectUK** ([terms](https://www.protectuk.police.uk/legal)) is **not** under the Open Government Licence. "All such rights are reserved."
- **Allowed:** downloading extracts for your own use, and using them for purposes "directly associated with the protection of your own business".
- **Credit:** ProtectUK must always be credited as the author.
- **No edits:** "You must not modify the paper or digital copies".
- **Needs a licence first:** "providing consulting services to third parties", and other commercial use.

Orb supplies security to client venues, and the guide is meant to reach officers, managers and venue users. That very likely needs a licence.

**citizenAID** (© citizenAID Ltd, a registered charity) publishes no reuse licence, so assume all rights are reserved and ask for written permission.

What the build does about it:
- **Verbatim and credited:** ProtectUK and citizenAID text is used **word for word, never shortened or reworded**, and every card says where it is from. If an extract is too long for a card, the card uses a shorter verbatim extract or splits it over two cards. The words themselves are never changed.
- **Orb's own lines are kept separate:** for example "Tell your control room", or the venue's lost property procedure. They appear in a visibly different **Orb note** under the extract, so nobody mistakes them for ProtectUK's words.
- **Platform admin only** while the licences are requested. The visibility setting can't be raised above `platform` for the flowchart until the owner confirms both permissions, using a recorded flag `flow_licensed`.
- **Draft permission requests:**
  - I write two short requests (ProtectUK via its contact page, citizenAID via its contact page) for the owner to send from info@orbsolutions.co.uk;
  - I do **not** send them myself.

## What the user sees
**Entry:** a second tile in Team → Toolbox under the current guide, "Emergency flowchart (draft, to compare)". It shows only when the viewer can see the guide (platform admin). The route is `/guide/flow`, full screen with no app frame, like the current guide.

**The screen, top to bottom:**
- The dark **I'm in danger** bar (as now).
- The amber banner "Draft — not approved. Do not use in a real emergency." (as now).
- **The trail.** One slim row per answered step: the question on the left and your answer on the right, e.g. "Is there a safe route out? · No".
  - Tapping a row goes back to that step and drops the steps after it.
  - The trail scrolls; the current card stays in view.
- **The current card:**
  - a large title;
  - the detail: the verbatim extract at 19–22px, lists kept as lists, then any Orb note;
  - the answers as big buttons, at least 54px tall, the first one filled.
- **A source line under the card**, e.g. "ProtectUK · RUN HIDE TELL". It's plain text in the guide (no link out in an emergency); the map view links it.
- **Bottom bar:** **Call 999**, the same overlay as now. There's **no `tel:` link** anywhere, and nothing ever dials by itself.

**I'm in danger:**
- it jumps to the safety card for the situation you're in: RUN/HIDE for an attack, Clear for an item, the Explosion question, and the citizenAID safety step for casualties;
- it adds an "I'm in danger" step to the trail, so the path stays readable;
- it counts the tap, as now.

**End cards** close every journey: aftercare and support, then **Start again** or **Leave**.

**State:** the trail, the danger count and the first call time are kept in sessionStorage, so a reload keeps your place. Nothing is sent to the server.

**Decision I made:** there's **no Police arriving button** in the bottom bar. The owner listed only Call 999 and I'm in danger. Every attack journey instead has "Police have arrived" as an answer on its own cards, leading to ProtectUK's armed police response wording. Say if you want the bottom button back.

## The flowchart (first cut, every card a verbatim extract)
**Situations on the first card:**
- Knife or weapon attack
- Firearms
- Vehicle used as a weapon
- Explosion
- Unattended item
- Suspicious item
- Bomb threat (new: ProtectUK has a bomb threat procedure; drop it if you don't want it)
- Someone injured
- Several people injured

**Knife and Firearms (RUN HIDE TELL):**
1. "Is there a safe route out?" — **Yes:** RUN, then "You're away", then TELL. **No:** HIDE, then TELL.
2. **Firearms** uses ProtectUK's cover-from-gunfire lines ("bullets can go through glass, brick, wood and metal").
3. TELL lists ProtectUK's prompts: location, direction, descriptions, further information. If you can't speak, follow the call taker's instructions.
4. "Police have arrived" leads to the armed police response card: follow instructions, keep your hands in view, they may point guns at you.
5. Then "When it is safe, you can give first aid" leads to the first-aid journey, or to the end card.

**Vehicle:**
- ProtectUK has no public advice of its own, so this journey is RUN HIDE TELL.
- An Orb note may add the VAW page's point that street furniture gives some protection.
- The card is marked "thin source" in the map view.

**Explosion:**
- First question: "Inside or outside this building?"
  - **Inside:** ProtectUK's evacuation extracts.
  - **Outside:** its invacuation extracts ("moving people inside … is often safer").
- Then the secondary-device warning, then TELL, then the end.

**Unattended item (Confirm):**
- The HOT card asks "Any answer worrying?"
  - **No:** an Orb note on the venue's lost property procedure, then the end.
  - **Yes:** the Suspicious item journey.

**Suspicious item (4Cs):** Confirm, Clear (100/200/400 m, out of line of sight, hard cover), Communicate (999, no radio or phone within 15 m), Control (cordon, keep witnesses), then the end.

**Bomb threat:** ProtectUK's phone-threat steps (stay calm, keep them talking, note the exact words, call 999 after), then Orb note: tell your control room, then the end.

**Injured and several injured (citizenAID order):**
1. Safety first.
2. Catastrophic bleeding.
3. Unresponsive or not breathing normally.
4. Other injuries.
5. Handover, then the end.

For several casualties, citizenAID's who-to-help-first order comes first. Anything not covered says "call 999 on speaker and follow the call handler".

The exact extracts are chosen during the build. Each one is stored once with its page, URL and the date it was copied, so the map view can show the reviewer exactly where every line came from.

## Map view (reviewers)
`/guide/flow/map`, platform admin only, is the whole flowchart on one page.
- **Layout:** one band per situation, laid out left to right by step depth. Each card is a box with its title, detail, source and any Orb note, and arrows labelled with the answer text.
- **No new library:** a small in-house layered layout with SVG arrows. If a band gets too tangled, that situation falls back to an indented outline.
- **Clicking a box** opens the guide at that card, with the trail rebuilt along the shortest path.
- **Flags on boxes:** "thin source" (Vehicle), "Orb note" and "needs clinical review" (all first aid).
- **Print** gives a clean A3 or PDF for the reviewer and the licence request.

## Build
- **Content:** `app/src/pages/guide/flow/`
  - `sources.js`: every verbatim extract, as `{ id, org, page, url, copied: '2026-11-..', text }`.
  - `flow.js`: the cards, as `{ id, title, extract: [ids], note?, answers: [{ label, to }], kind: 'question' | 'step' | 'end', danger? }`, plus each situation's safety card.

  Both are hand-written, not generated. The old `screens.js` and `drafts.js` are untouched.
- **Pages:**
  - `Flow.jsx`: shell, trail, card, Call 999 overlay (reusing the current guide's overlay component) and danger handling;
  - `FlowMap.jsx`: the map view.

  The routes are added beside `/guide/emergency` in `main.jsx`, behind the same visibility check.
- **API:** reuse `emergency_visible` (platform). Add `flow_licensed` (boolean, default false, platform admin only to set, audited). While it is false, the server treats the flowchart as platform-only whatever the guide level.
- **Toolbox:** the second tile, platform admin only.
- **Help:** one line in `guide.mjs` saying a text-only flowchart version is in draft beside the guide.
- **What's new card**, per the project rule: "Emergency guide: a text-only flowchart to compare", with its picture.

## Not in scope
- Changing or removing the current guide or its pictures. That's decided after you compare them.
- Showing the flowchart to anyone but the platform admin.
- Sending the licence requests: I draft them, you send them.
- Translations, offline use, venue floor plans (X06).

## Verification
- **A check script, `app/scripts/flow-check.mjs`, run in the build:**
  - every answer resolves, and every card is reachable from the first card;
  - every journey ends on an end card, and every card has 2–4 answers (end cards: Start again / Leave);
  - every card has at least one sourced extract, and every extract has a URL and a copied date;
  - no extract text is edited: it's checked against a hash saved when it was copied;
  - every situation has a safety card;
  - no `tel:` anywhere under `guide/flow`.
- **Browser at 390×844:**
  - walk every situation to its end;
  - tap a trail row to rewind;
  - I'm in danger from each journey lands on that journey's safety card;
  - Call 999 opens the overlay and returns to the same card;
  - a reload keeps the trail;
  - nothing overflows the width;
  - the answers are visible without scrolling on every card;
  - the map view renders every band and opens a card;
  - a non-platform manager gets "Not available yet".
- **Build:** ui-lint ≤ 67, and the emergency check still passes, which shows the old guide is untouched. `npm test` passes, including the `flow_licensed` gate.
- No deploy until the owner approves.

## Questions to settle when you review this
1. No Police arriving button in the bottom bar: is that OK, given it's an answer inside the journeys instead?
2. Keep or drop the Bomb threat situation?
3. Orb notes (control room, lost property) under the extracts: OK, given ProtectUK's words can't be changed?
4. Shall I draft the two permission requests for you to send?
