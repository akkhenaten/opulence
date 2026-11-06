# Implementation plan: What's new splash + landing page scroll animations

Spec: spec/spec-a-what-s-new-splash-for-managers-and-scroll-animations-.md. This change is front end only: no API work and no migration.

## A. What's new splash (app)

**`app/src/pages/people/_whatsnew.jsx`**
1. Add `date: '2026-11-06'` to the new release card (see Ship), and leave every older card undated.
2. Move the per-card JSX from `WhatsNew()` (lines 133-151) into `export function UpdateCard({ u, isNew })`. `WhatsNew` keeps exactly the same look by calling `<UpdateCard u={u} isNew={i === 0} />`.
3. Add the splash logic:
   ```js
   const SPLASH_DAYS = 2;
   const seenKey = (id) => `orb.whatsnew.seen.${id}`;
   // Dated cards from the last two days, newest first, at most 3
   export const freshUpdates = (now = Date.now()) =>
     UPDATES.filter((u) => u.date && now - Date.parse(u.date) < SPLASH_DAYS * 864e5 && now >= Date.parse(u.date)).slice(0, 3);
   ```
   - "Seen" means the stored value is the `title` of the newest fresh card.
   - The splash shows when `fresh.length > 0` and `localStorage[seenKey] !== fresh[0].title`.
   - Wrap storage access in try/catch, following the `pwa.jsx:41-43` pattern.
4. Add `export function WhatsNewSplash({ user })`:
   - `useState(false)`, then a `useEffect` with a 1200ms timeout that opens it when the rule above passes.
   - `close()` writes the key and sets open to false.
   - Renders `<Sheet open onClose={close} title="What's new" size="md" footer={…}>`. The body has a gold kicker with the Sparkles icon and the fresh card's month, and a short line: "Fresh upgrades to your platform".
   - Then `fresh.map(u => <UpdateCard u={u} isNew />)` in a `space-y-3` stack. The Sheet already scrolls, so nothing extra is needed for several cards.
   - Footer: `Button` "Got it" (primary, calls close). When `user.role === 'company'`, also a ghost `Button` "See every upgrade", which calls close and then `nav('/company/audit?tab=new')` via `useNavigate`.
   - The Sheet already handles reduced motion through the `anim-sheet-in` rules in styles.css.

**`app/src/layouts/Shell.jsx`**
- Import `WhatsNewSplash` and render `{isMgr && <WhatsNewSplash user={user} />}` next to `AccountSheet` / `OrbFab` (around line 370).
- Shell only mounts after sign-in on the portal routes. The public Apply and sign-in pages are outside it, so they are covered.
- Dual users: the key is per `user.id`, so switching sides doesn't show the splash again.

**`app/src/pages/people/Audit.jsx`**: no change. `?tab=new` already works (lines 17-18).

## B. Landing page animations (`site/index.html` only)

**CSS** (add near the `.play` / `rise` rules at around line 257). Every hidden state is scoped under `html.anim`, a class the JS adds only once the observer is ready and reduced motion is off.
- **Side slide:**
  - `html.anim [data-slide]:not(.in) { opacity:0; transform:translateX(var(--from,-48px)); }` and `[data-slide].in { transition: opacity .8s, transform 1s var(--spring); transition-delay: var(--d,0s); }`
  - `[data-slide="r"]` uses `--from:48px`.
  - At 760px and below, use ±24px.
  - Add `overflow-x: clip` on `main > section` so nothing scrolls sideways.
- **Gold heading line:**
  - `.lead h2::after` is a 1px gold bar, 64px wide, with `transform: scaleX(0)` and `transform-origin: left`. It changes to `scaleX(1)` when its parent `.lead` gets `.play`. The transition is 1s with spring easing and a .25s delay.
  - In `.close`, the centred heading draws from the centre.
- **Steps light up:**
  - `html.anim .steps .step::after` (the dot) and `::before` (the number) start dim, at `opacity:.25`, with `scale(.6)` on the dot.
  - When `.steps` gets `.lit`, each step animates in through `--d`, 0.25s apart, finishing with a gold dot glow (`box-shadow 0 0 0 6px rgba(201,164,92,.18)`).
- **Hero zoom:** `html.anim .hero picture img { animation: heroZoom 2.4s var(--spring) both }`, with `@keyframes heroZoom { from { transform: scale(1.08) } }`.
- **Parallax:** `.ph img, .svc .front img { transform: translateY(var(--py,0)) scale(1.06) }`. This applies only when `html.anim.px` is set, and that class is added only when `matchMedia('(hover:hover) and (pointer:fine)')` matches. This avoids clashing with the hover zoom on `.front img`: the `.front img` scale is applied to the picture wrapper instead. Check this during the build, and if they clash, skip parallax on `.svc` and keep it only on the award photos.

**JS** (extend the block at lines 830-839, written in the same ES5 style):
1. Guard: `var motion = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches;`. If true, add `document.documentElement.classList.add('anim')`.
2. A `slide(el, i)` helper sets `data-slide` to `i % 2 ? 'r' : 'l'` and `--d` to `(i % 4) * .08s`, then observes the element with a shared `so` observer. That observer adds `.in` and unobserves.
3. Apply it on load to `.pillars .pillar`, `.services .svc`, `.awards .award`, and to the existing `.vt` in each `.city .tiles`, with the index counted per grid.
4. In `loadVenues` (around line 989), after `cityGrid(v.city).append(t)`, call `slide(t, grid.children.length - 1)` so tiles that load later also glide in.
5. Remove `data-reveal` from the elements that now slide (pillars, awards, and `.services` itself, so its children carry the effect). That way the two effects don't stack. Lead text, careers and close keep `rise`.
6. **Count up:**
   - Find `.proof b` elements whose text matches `/^(\d+)(\+?)$/`. Store the target, set the text to `0`, and when `.proof` plays, animate with rAF over 1.2s using ease-out to `n` plus the suffix.
   - Elements with words ("Winner", "Live", "Edinburgh") just use the existing rise.
   - If there's no motion, leave the text untouched.
7. **Steps:** observe `.steps` and add `.lit` once it is 30% visible (threshold .3). Set `--d` per step to `i * .25s`.
8. **Parallax:**
   - Only when the `px` class is set. A single passive scroll listener runs a rAF-throttled update.
   - For each visible `.ph img` (tracked through an IntersectionObserver set), set `--py` to `((rect.top + rect.height/2 - innerHeight/2) * -0.06)px`.
9. Flip cards are unaffected: the slide transforms the outer `.vt` / `.svc`, and the flip uses `.inner`. The current hover rule `:is(.vt,.svc) { transition: transform .45s }` would override the slide transition, so the `[data-slide].in` transition rule must list `transform` with higher specificity, and fall back to the hover timing once the slide finishes. To do that, remove the `data-slide` attribute on `transitionend`.

## Ship
- **New What's new card**, at the top of `UPDATES`, in the same commit:
  - `month: 'November 2026'`, `date: '2026-11-06'`, `icon: Sparkles` (already imported)
  - title: "Never miss an upgrade"
  - lede: "New features now greet you when you open the app, and your website comes alive as visitors scroll."
  - points:
    - 'A What's new welcome for managers for two days after each release'
    - 'One tap to see every upgrade'
    - 'Venue and service cards glide in from the sides'
    - 'Numbers that count up and headings underlined in gold'
- **Memory:** update `whats-new-card-every-release.md` with "set `date: 'YYYY-MM-DD'` on the new card; it drives the login splash".
- `cd app && npm run build` (ui-lint must stay at 67 or below), then `cd functions/api && npm test` as a sanity check (176).
- `git add app/src site` and commit "feat: What's new splash for managers, landing page scroll animations", with the Co-Authored-By line.
- `openkbs site deploy`, then `git push origin master`. No fn deploy is needed.

## Verification
- **App** (mock server /tmp/mock + vite on 5174, as in earlier sessions):
  - With ROLE=company: the splash appears about 1s after load, showing the "Never miss an upgrade" card and both buttons. Got it, then reload: no splash. Clear `orb.whatsnew.seen.*`: it's back. "See every upgrade" lands on Audit → What's new.
  - With ROLE=security: the splash shows without the "See every upgrade" button.
  - With ROLE=venue: no splash.
  - Expiry: in the console, check that `Date.now` moved more than 2 days ahead means no splash.
  - Screenshots at 1280 and 390.
- **Landing:** serve `site/` statically (`npx serve site` or python http.server).
  - With agent-browser at 1280 and 390, scroll to each section and screenshot mid-animation and after it settles.
  - Check that `document.documentElement.scrollWidth <= innerWidth` on 390.
  - Emulate reduced motion and check that everything is visible immediately with no `anim` class.
  - Venue tiles come from `venues.public`, which won't load locally, so check the dynamic slide by calling `slide()` on an appended dummy tile, or after deploy on the live page, read-only.
  - Then run `agent-browser close --all` and stop vite and the mock server.
- **Live, after deploy (read-only):**
  - The landing page loads and the venue tiles glide in.
  - The app bundle contains "Never miss an upgrade".
