# Fix: sign-in on the live Opulence app (the app is pointing at Orb Security's server)

## Context
Nobody can sign in at https://opulence.orbsolutions.co.uk/app/. The page loads, but every request goes to the wrong server.

**Root cause (confirmed)**
- The live bundle `index-C8ZZde1Z.js`, from build commit 22a86b76, calls `https://hopedp5cvxdkhhpb47hfxszhwq0aqtnw.lambda-url…`. Asked for its brand name (`settings.brand`), that server answers **"Orb Security"**: it is the original Orb project's API.
- Opulence's own API is `https://6ij75kpgf7kiwtvwo3nke763dm0oejxo.lambda-url…`, which answers **"Opulence"**.
- **Why it happens:** `app/src/api.js` takes `import.meta.env.VITE_API_BASE`. When that isn't set, it falls back to the Orb URL, which was copied in with the original code.
  - The right URL lives only in `app/.env.production`, and git ignores that file.
  - The other chat built the site in a clean checkout (`/tmp/uiux`), which doesn't have that file. So its builds 4657bcf6, 2187eecb and 22a86b76 fell back to Orb's server.
  - My build 7774b9a6 was made in the main checkout and was correct; theirs replaced it.
- "Again": any build made outside the main checkout breaks sign-in the same way.
- **Side effect:** sign-in attempts in the last ~40 minutes went to Orb's server and were refused. Orb's server has no Opulence accounts, so no Opulence data was involved.

## Changes
1. **`app/src/api.js`:** change the fallback `API_BASE` to Opulence's own API, `https://6ij75kpgf7kiwtvwo3nke763dm0oejxo.lambda-url.eu-central-1.on.aws/`.
   - This address is public: it sits in every bundle anyway.
   - Every build now works, wherever it is made. `VITE_API_BASE` still overrides it.
2. **`app/vite.config.js`:** a build guard. Using `loadEnv`, the production build fails with a clear message if the API address it would use contains `hopedp5cvxdkhhpb47hfxszhwq0aqtnw`. A wrong build can then never reach the live site again.
3. **Rebuild and deploy:**
   - from `/home/user/project/app`, run `npm run build`;
   - check the new `site/app/assets/index-*.js` contains `6ij75kpgf7` and does not contain `hopedp5`;
   - commit the source (fix: …) and the site (build: …);
   - run `openkbs site deploy` and `git push origin master --tags`.
   - The API itself is fine and is not redeployed.
4. **Memory:** save a project note that site builds must reach Opulence's API, and that clean checkouts don't have the ignored `.env.production`.
5. **No What's new card:** this is a hotfix that restores sign-in, with no new feature to show.

## Verification
- Fetch the live `index.html`, then its main JS: it contains `6ij75kpgf7` and not `hopedp5`.
- Open https://opulence.orbsolutions.co.uk/app/login in agent-browser:
  - the page title and brand show "Opulence";
  - the network/API calls go to the 6ij75 address.
- No test sign-ins with real accounts and no test data. Then run `agent-browser close --all`.
- Ask the user to sign in and confirm. If their browser still has the old page open, a refresh picks up the new build.
