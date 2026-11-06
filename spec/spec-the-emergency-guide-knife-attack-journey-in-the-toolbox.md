# Spec: the Emergency guide (Knife attack journey) in the Toolbox

## Context
The owner sent a handover pack (`emergency-guidance-handover.zip`). It holds a step-by-step guide for the first minutes of a knife attack:
- 32 screens with exact wording and routing (`screens.json`);
- 54 line-art illustrations and 9 SVGs;
- design tokens, a working prototype, and a build brief with acceptance checks.

The wording is **draft clinical copy**. The pack says "build it, do not publish it, do not rewrite the wording", and ten illustrations are flagged for clinical review.

The owner wants it added to the Toolbox. Decisions so far:
- **Audience, once approved:** officers, managers **and venue users**.
- **For now:** visible to the **platform admin only** (info@orbsolutions.co.uk) while it is reviewed.

The existing Toolbox (`toolbox_cards`, text cards, `pages/learn/Toolbox.jsx`) stays as it is. The approved citizenAID-style Toolbox spec (`spec/spec-help-on-every-shift-…/plan.md`) is a separate, still-unbuilt piece of work. This guide doesn't replace it, and it doesn't use the AI card pipeline.

## Decisions I made (no answer given, so tell me if you want them changed)
- **M03 Other injuries:** show all four drafted variants (fracture, burn, head, eye) as their own screens, each with a red "Scope not decided — draft" banner. Since only the platform admin sees it, this lets the reviewer read them in place instead of us picking a scope.
- **The 7 other opening cards:** shown greyed out, labelled "Not written yet". Tapping does nothing. Only Knife leads anywhere.
- **The "I'm in danger" count and the first call time:**
  - kept on the phone only (sessionStorage, so it survives a reload, as the brief requires);
  - shown as a small line on the two handover screens (K11, M05): "Danger taps: 2 · First call 22:14";
  - nothing is sent to the server.

## What the user sees
**Entry points** (only when the viewer is allowed, see Visibility):
- Officers: a tile at the top of Learn → Toolbox, "Emergency guide · Knife attack".
- Managers: the same tile at the top of Team → Toolbox.
- Venue users: a side-menu item "Emergency guide".

**The guide itself** is a full-screen page with no app frame, laid out for phones and centred at max 480px on desktop. Route: `/guide/emergency/:screen` (default `S00`), signed-in only.
- **Top:** the full-width dark **I'm in danger** bar. It opens G-DANGER, with "Get yourself safe" → K01 and "Back to where I was" → the screen it interrupted, and adds one to the count.
- **Amber banner** on every screen: "Draft — not clinically approved. Do not use in a real emergency." The red banner also shows on unwritten or undecided screens.
- **Middle (scrolls):** the illustration (square, `object-fit: cover`, 42/26/19% of the stage by wording length), the small-caps title, then the exact wording, 22/19/17px.
  - A **"More steps below"** hint shows when the content goes past the fold, and hides once the reader reaches the end.
  - Wording that starts with "- " lines is shown as a list (M02, C02). The words aren't changed.
- **Pinned action area (never scrolls):** the screen's buttons. The first is filled blue, the rest are outlined, and each is at least 54px tall.
- **Bottom bar, always:** **Call 999** on the left and **Police arriving** on the right (→ K10).
  - Call 999 opens G-CALL as an overlay: what to say, a "Call 999" button and "Did you get through?" → X05.
  - The dialler opens only from that explicit tap (`location.href = 'tel:999'` in the click handler). There's **no `tel:` link** anywhere, and nothing ever dials by itself. The first tap's time is saved once.
- **Overlays don't break Back.** G-CALL and G-DANGER don't go into the browser history, so closing them returns to the exact screen, including its scroll position.
- **"Back" buttons** use an in-guide path stack, so "Previous screen" works. "End" on K12 goes back to where the guide was opened from.
- **X06** shows one venue floor-plan SVG. It uses the venue type when opened from a shift or venue (nightclub, restaurant, hotel, …), and a small picker otherwise. **M03** shows the variant that was picked.
- The guide uses its own palette from `design-tokens.json` (ink, paper, blue, amber), scoped as CSS variables under `.eg`. The art is never recoloured. Light theme only, as designed.

## Visibility
- A new setting, `settings.emergency_guide`:
  - `'platform'` (default): only the platform admin;
  - `'managers'`: company and security managers;
  - `'everyone'`: managers, officers and venue users.
- Only the platform admin can change it, from a small card in Team → Toolbox ("Emergency guide: who can see it"). The card sits next to the What's new / feedback settings pattern.
- `toolbox.emergencyStatus` returns `{ visible, level, draft: true }`. The route checks it and shows "Not available yet" to everyone else.
- **Honest limit:**
  - the wording ships in a lazy-loaded JS chunk;
  - the pictures sit in `/app/emergency/`;
  - so someone with the exact URL could fetch the files even while it's platform-only.

  It is public safety guidance, so I think that's fine. If you'd rather it couldn't be reached at all, the pictures and text can be served from private storage instead, which is more work.

## Build
- **Content:** a script, `app/scripts/emergency-import.mjs`, reads the pack's `screens.json` and writes `app/src/pages/guide/emergency/screens.js` (generated, marked "do not edit by hand"):
  - screen id, type, title, exact wording, art file, variants, buttons parsed from `label -> dest | …`, and status flags (`unwritten`, `clinicalStatus`);
  - the M03 variant wording comes from `M03-VARIANTS.md`, as screens `M03a`–`M03d`;
  - the S00 card rows become one grid screen;
  - wording is copied byte for byte.
- **Assets:** copy `assets/*.png|svg` to `app/public/emergency/`, using the pack's file names, lower-cased the same way the sequence refers to them. I'll also make 600px WebP copies for speed; the originals are kept, and the art isn't altered beyond resizing. The 16 assets not used by Knife ship too, unwired, as the brief says.
- **Pages:** `app/src/pages/guide/emergency/Guide.jsx` (shell, the three persistent controls, overlays, state) and `Screen.jsx` (layout and sizing rules). The route is added outside `<Shell>` in `main.jsx`, wrapped in the signed-in guard.
- **API:**
  - `functions/api/modules/toolbox.mjs` gets `emergencyStatus` (any signed-in role, including venue) and `setEmergencyGuide` (platform admin only, audited);
  - a migration adds `settings.emergency_guide text default 'platform'`.
- **Entry points:** the Toolbox tile in `pages/learn/Toolbox.jsx` and `pages/team/ToolboxAdmin.jsx`, and a venue nav item in `layouts/nav.js` gated on the status.
- **What's new card**, per the project rule. It is platform-admin-facing while the guide is in draft: "Emergency guide (draft) — Knife attack journey, ready for clinical review".
- **Help:** one line in the guide.mjs toolbox section saying it's in draft.

## Not in scope
- Rewriting or "fixing" any wording, including the REVIEW.md items (K12 contradiction, K05 list, K07 two questions, X05 four buttons). I'll list these on a "Review notes" screen visible to the platform admin.
- The other 7 scenarios.
- The staff venue-overlay layer (`O-X06-L*`).
- A public no-login link.
- Translations.

## Verification
- **Unit tests** (`functions/api/test`):
  - `emergencyStatus` per role and level;
  - `setEmergencyGuide` refuses anyone but the platform admin.
- **A guide check script** (`app/scripts/emergency-check.mjs`), the brief's acceptance checks run over the generated data:
  - every destination resolves;
  - every screen is reachable from K01, with no dead ends;
  - every art file exists;
  - no wording starts with "STRUCTURE ONLY" or "SCOPE NOT YET DEFINED" without the unwritten flag;
  - no `tel:` in the guide source.
- **Mock browser pass at 390×844:**
  - walk K01→K12 and the M and C branches;
  - check the actions are visible without scrolling on every screen (scripted over all screens);
  - check "More steps below" on M02;
  - tap I'm in danger, then Back to where I was, and confirm the same screen and that the count survives a reload;
  - from G-CALL, return to the same screen;
  - Police arriving from any screen lands on K10;
  - log in as a non-platform manager and get "Not available yet".
  - Then `agent-browser close --all`.
- Build: ui-lint ≤ 67, `npm test`. Then deploy the API and site, push, and run a live read-only check that the guide chunk and `/app/emergency/k01-safety-entry.png` load.
