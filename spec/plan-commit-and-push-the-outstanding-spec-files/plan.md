# Plan: commit and push the outstanding spec files

## Context
The email-footer work is already committed and deployed:
- `948a72cf feat` (API v182)
- `build` commit (site v183)

The only things left in the working tree are untracked spec and plan documents written by the board's spec/plan flow. There are no modified tracked files, and `git diff` is empty.

## Files to commit (all untracked, none ignored)
- `spec/onyeka-s-right-to-work-card-match-the-profile-and-give-orb-r.md` and `…/plan.md`
- `spec/plan-ejections-register-tab-on-incidents-managers-only/plan.md`
- `spec/plan-the-compliance-cards-actually-refresh-after-orb-re-read/plan.md`
- `spec/spec-every-email-from-opulence-security-carries-the-company-.md` and `…/plan.md`
- `spec/spec-streamline-the-whole-app-fewer-steps-no-doubles-more-op.md` and `…/plan.md`

## Steps
1. `git add -A`, which stages everything not covered by .gitignore.
2. Commit on `master` with this message:
   ```
   docs: specs and plans for the email footer, ejections register, compliance card refresh, Onyeka's right to work card and the app streamline

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
3. `origin` is set (`github.com/akkhenaten/opulence`), so run `git push origin master`.

## Verification
- `git status` shows a clean tree.
- `git log origin/master -1` matches the new commit.
