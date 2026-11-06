# Plan: commit the remaining spec files and push

## Context
The Dashboard refresh code was already committed (67ff487), deployed as v100 and pushed. `git status` now shows only 4 untracked documentation files, and `git diff` is empty because no tracked file has changed. These are the spec and plan docs for the last two releases, saved by the studio. The user wants everything that isn't gitignored committed and pushed.

## Files (all new, none ignored, no secrets found)
- `spec/spec-a-what-s-new-splash-for-managers-and-scroll-animations-.md` (spec, 80 lines)
- `spec/spec-a-what-s-new-splash-for-managers-and-scroll-animations-/plan.md` (implementation plan, 99 lines)
- `spec/spec-dashboard-review-and-refresh-company-and-security-manag.md` (spec, 91 lines)
- `spec/spec-dashboard-review-and-refresh-company-and-security-manag/plan.md` (implementation plan, 96 lines)

## Steps
1. `git add -A`, then `git status --short` to confirm only these 4 files are staged.
2. Commit with this message:
   ```
   docs: specs and plans for the What's new splash and the Dashboard refresh

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
3. Push with `git push origin master`. Origin is https://github.com/akkhenaten/opulence.git, which the standing rules allow.

No deploy is needed, since these are docs only. There's no What's new card either, because this isn't a release.

## Verification
- `git status` is clean.
- `git log origin/master -1` matches the new local commit.
