# Plan: fresh Orb Security deployment (project 67a9f72d7f55)

## Context
Spec: `spec/fresh-orb-security-deployment-for-a-new-company.md`. This project needs its own empty copy of Orb Security. Note: when I checked just now, the repo still needed a GitHub login. Step 0 stops if it is still private.

## Steps
0. **Repo access (resolved)**: the user connected the repo as this project's `origin` remote. `git ls-remote origin` works with the stored credentials, and master is at `02e3eae`. Decision: pull once, never push, then disconnect.
1. **Import code**
   - `cd /tmp && git clone --branch master --depth 1 https://github.com/akkhenaten/Orb-Security.git orb`. This uses the same stored credential. If that fails, run `git fetch origin master` in the project and then `git worktree`/`git archive origin/master | tar -x -C /tmp/orb`.
   - Right after the import: `git remote remove origin` in this project, so nothing can be pushed to the original repo. Do not touch `~/.git-credentials`.
   - Check it for secrets/data: `find /tmp/orb -name '.env*' -o -name '*.dump' -o -name '*.sql.gz'`. Do not copy any of these. Keep normal migration `.sql` files.
   - Copy into this project with `rsync -a --exclude .git --exclude 'node_modules' --exclude '.env*' --exclude '.openkbs*' /tmp/orb/ ./`. The repo's `functions/api`, `site/`, `app/` and `openkbs.json` overwrite the starter files. Keep `.claude/` from this project.
   - Look for the original projectId or URLs hard-coded anywhere: `grep -rn '<orig projectId>\|lambda-url\|cloudfront.net' --exclude-dir=node_modules`. List any hits other than `app/src/api.js`'s env fallback.
2. **openkbs.json**: change only `projectId` → `67a9f72d7f55`. Check that it still has postgres, storage `{cloudfront:"media"}`, mqtt, api 1024/180/`rate(5 minutes)`, `site: ./site` and `spa: /app/index.html`. If its `region` is not eu-central-1, stop and ask the user.
3. **Function deps**: `cd functions/api && npm ci` (or `npm install` if there is no lockfile). Keep `@aws-sdk/*` out of `dependencies`.
4. **Commit**: `feat: import Orb Security app for new company deployment`. The `.gitignore` must exclude `.env*` and `node_modules`.
5. **Infrastructure**: `openkbs deploy` creates Postgres, storage + CDN and MQTT. Note the site URL it prints, or get it from `openkbs site deploy`/project info.
6. **Secrets**: `request_secrets` fn=`api` with `APP_SECRET` (label: paste a new random value, e.g. from `openssl rand -hex 48`) and `APP_URL` (`<site URL>/app`). Then `openkbs fn deploy api -s 'rate(5 minutes)'` and check that both keys appear among the loaded env keys. Record the function URL.
7. **Frontend**: write `app/.env.production` containing `VITE_API_BASE=<function URL>`. It holds no secret, but `.gitignore` excludes it anyway. Run `cd app && npm ci && npx vite build`. Check that the build output goes to `site/app/`. `grep` the built JS for the new URL and for no old URL. Then `openkbs site deploy`. Commit any remaining tracked changes.

## Verification
- `curl` the function URL. The first request runs the migrations. Then check the auth/bootstrap endpoint from `app/src/api.js` and confirm `needsBootstrap: true`.
- Load `<site>/app/` with agent-browser, screenshot the set-up screen and confirm the footer is unchanged. Run `agent-browser close --all`.
- Run `openkbs fn logs api` after ≥5 min and confirm the scheduled invocations appear.
- Give the user the `<site>/app/` link.
