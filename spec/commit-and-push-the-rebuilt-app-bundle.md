# Commit and push the rebuilt app bundle

## Context
The user asked me to commit everything that is not ignored and push it. All the contracts-module source code (step 7, the variation doc-title fix and the specs) is already committed in `ed91b41` and `7a525ec`. The only working-tree changes left are the rebuilt app bundle in `site/app`:
- `site/app/index.html` is modified.
- About 120 old hashed `site/app/assets/*.js` files are deleted.
- About 120 new hashed asset files are untracked.

That comes to 245 entries in total. None of these paths are in `.gitignore`. The repo already tracks `site/app`, so committing the rebuild keeps the committed bundle in step with the source.

## Steps
1. Run `git add -A`. This stages the modified index.html, the deleted old bundles and the new bundles.
2. Run `git diff --cached --stat | tail` to sanity-check that only `site/app/**` is staged.
3. Commit with this message:
   ```
   build: rebuild app bundle for contract variations and library

   - regenerate site/app hashed bundles after the contracts module changes
   - drop superseded bundle files replaced by the new build

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
4. Run `git push origin master` (origin is github.com/akkhenaten/Orb-Security).

## Verification
- `git status` shows a clean tree.
- `git log -1 --stat` shows only `site/app` changes.
- The push output shows `master -> master`.
