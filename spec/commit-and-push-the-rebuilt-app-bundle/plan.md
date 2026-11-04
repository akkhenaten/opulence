# Plan: commit and push the rebuilt app bundle

## Context
The source code is already committed in `ed91b41` and `7a525ec`. The only changes left in the tree are under `site/app`:
- `index.html` is modified.
- The old hashed bundles are deleted.
- The new hashed bundles are untracked.

The approved spec (`spec/commit-and-push-the-rebuilt-app-bundle.md`) is also now in the tree and goes into the same commit.

## Steps
1. Run `git add -A`.
2. Check the staged files with `git diff --cached --stat | tail -5`. Only `site/app/**` and `spec/**` should appear.
3. Commit:
   ```
   build: rebuild app bundle for contract variations and library

   - regenerate site/app hashed bundles after the contracts module changes
   - drop superseded bundle files replaced by the new build
   - add commit spec

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
4. Run `git push origin master`.

## Verification
- `git status` shows a clean tree.
- The push output shows `master -> master`.
