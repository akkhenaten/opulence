# Remaining work: app-wide UI/UX polish (phases 2–4)

## Context
The approved plan (`define-requirements-generic-candy.md`) covers the whole app's UI polish in 4 phases.
- Phase 1 is committed (5ad0b73) and deployed as v27. The board card eBor20xg has its comment.
- Phase 2 code (officer, learn, everyday) is written but uncommitted. It touches 24 files, and those folders have 0 lint issues.
- 48 lint issues remain across the app, all in phase 3 and 4 areas.

## Step 1: finish phase 2
1. Check `app/src/pages/officer/Chat.jsx` is covered too; it isn't in the diff, so lint it or check by hand.
2. Run `npm run build` from `app/` and keep the bundle within +5% of 1,432,215 bytes.
3. Browser check at 390 and 1440 px as officer_marcus:
   - Home, Shifts, Time off (Segmented), the IncidentForm action bar, Learn, Course and Everyday;
   - pull-to-refresh on Home, Shifts, Everyday and Learn;
   - skeletons while loading.
   Then run `agent-browser close --all`.
4. Commit `feat: Officer app, Academy and Everyday get the new iOS feel`, then run `openkbs site deploy` and post a plain-language comment on eBor20xg.

## Step 2: phase 3 (manager, people, money, team, shared)
- Work the hot spots first: Rota (9), IncidentDetail (5), _profileTabs (4), OpsAI (3) and Academy admin (3).
- Then the 1–2 issue files in money, people, team and shared.
- Pattern:
  - raw `<button>` → `Button`, `IconButton` or `Pressable`;
  - raw `<input>` → `Input` or `SearchInput`;
  - filter tabs → `Segmented`;
  - sticky save bars → `ActionBar` (Timesheets, money/Pay, people/Settings);
  - loading → `Load` with a skeleton.
- Build, verify as the company and security roles, commit, deploy and comment.

## Step 3: phase 4 (venue, auth, Shell), then lint at 0
- Fix venue/Requests, venue/_feedback, Shell (1) and the last raw hex.
- Lint must report 0 issues. Build, verify as the venue role and on the login screens, commit, deploy, and post the final comment. Move the card to Review.

## Verification (each phase)
- `npm run build` passes and the lint count goes down.
- agent-browser at phone, tablet and desktop widths for the affected roles:
  - sheets animate closed;
  - inputs are 16px;
  - Back restores the scroll position;
  - no layout breaks.
- Close the browser afterwards.

## Notes for the user
- In the photo viewer, opening a photo zooms it in from the centre of the screen rather than growing out of its thumbnail.
- The iPhone status bar stays on the "default" style so its text is readable over the light header.
