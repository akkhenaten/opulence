# Commit the remaining spec files and push

## Context
All the code for the five ops fixes is already committed and deployed (v73). `git status` shows only three untracked spec items, all plain markdown with no secrets:
- `spec/five-ops-fixes-goes-by-names-ejection-log-shift-confirmation.md` (the approved spec)
- `spec/five-ops-fixes-goes-by-names-ejection-log-shift-confirmation/plan.md` (the implementation plan)
- `spec/landing-page-recommendations-opulence-security-com-v2/plan.md` (the landing-page plan)

There are no modified or deleted tracked files. `.gitignore` excludes `node_modules/`, dotfiles and `openkbs.local.json`, and none of those show up.

The remote `origin` is `https://github.com/akkhenaten/opulence.git`, the Opulence repo. It is not the disconnected original Orb repo. `master` tracks `origin/master` and is 8 commits ahead:
- `d80ff96`, `df901d5`: the landing page
- `0ddd4ff`, `bfbb956`, `313d74b`, `d75bf9a`, `32d383d`, `aa2c304`: the five fixes and the bundle rebuild

## Steps
1. `git add -A`, which stages the three spec items and anything else not ignored.
2. Commit with this message:
   ```
   docs: specs for the five ops fixes and the landing page

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
3. `git push origin master`. This pushes the new commit plus the 8 earlier unpushed ones.

## Verification
- `git status` is clean.
- `git log --oneline origin/master..master` is empty after the push.
