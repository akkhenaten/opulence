# Implementation plan: departure-board grid flip for the landing-page tiles

Spec: spec/spec-a-departure-board-grid-flip-for-the-landing-page-tiles-.md. Everything lives in the single static file **site/index.html** (inline CSS + inline ES5-style IIFE), plus the What's new card. No API, data or build changes.

## 1. CSS (site/index.html, tile block ~:150–200)
- **Remove the whole-card rotateY flip**: drop `.inner { transform-style; transition }`, `.flip .inner { rotateY }`, and `.back { transform: rotateY(180deg) }`. Keep `perspective` off the tile (moved to the overlay).
- **Flat two-face state**: `.back { visibility: hidden }`, `.flip .back { visibility: visible }`, `.flip .front { visibility: hidden }`. `backface-visibility` no longer needed on real faces.
- **Overlay grid** (new):
  ```css
  .gf { position: absolute; inset: 0; z-index: 3; perspective: 1100px; display: grid;
        grid-template: repeat(var(--r), 1fr) / repeat(var(--c), 1fr); pointer-events: none; }
  .gf-cell { position: relative; transform-style: preserve-3d;
             transition: transform var(--cd) cubic-bezier(.45,.05,.25,1) var(--dl); }
  .gf.go .gf-cell { transform: rotateX(-180deg); }          /* top edge falls toward viewer */
  .gf-side { position: absolute; inset: 0; overflow: hidden; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
  .gf-side.to { transform: rotateX(180deg); }
  .gf-side > .face { position: absolute; width: var(--w); height: var(--h); left: var(--x); top: var(--y);
                     transform: none; visibility: visible; }   /* full-size copy, offset so the cells line up */
  .gf-side::after { content: ""; position: absolute; inset: 0; background: linear-gradient(#000a, #0003); opacity: 0;
                    transition: opacity calc(var(--cd) / 2) ease-in var(--dl); }  /* shading */
  .gf.go .gf-side.from::after { opacity: 1; }                 /* darkens as it turns away */
  .gf-side.to::after { opacity: .8; } .gf.go .gf-side.to::after { opacity: 0; transition-delay: calc(var(--dl) + var(--cd) / 2); } /* lightens as it lands */
  .gf-cell { box-shadow: inset 0 0 0 .5px rgba(0,0,0,.35); }  /* thin split lines only while the grid exists */
  ```
  Corner rounding comes for free: each copy is the real full-size `.face` (20px radius, border) clipped by its cell.
- While busy: `:is(.vt,.svc)[data-busy] { transform: none }` (suspend hover lift so cells don't drift) and `[data-busy] > .inner > .face { visibility: hidden }` (real faces hidden under the overlay).
- **Reduced motion** block replaced with: `.back { opacity: 0; transition: opacity .25s, visibility .25s }`, `.flip .back { opacity: 1 }`, `.front { transition: opacity .25s, visibility .25s }`, `.flip .front { opacity: 0 }` — no grid is built in JS.

## 2. JS: reusable `gridFlip` (site/index.html, replaces `setFlip` body ~:921)
```js
// Departure-board flip: the tile splits into cells that turn top-over-bottom in a diagonal wave, then joins up again
var still = matchMedia('(prefers-reduced-motion: reduce)');
function gridFlip(t, on, done) {
  if (still.matches) { done(); return; }   // reduced motion: CSS cross-fade only
  var inner = t.querySelector('.inner'), from = t.querySelector(on ? '.front' : '.back'), to = t.querySelector(on ? '.back' : '.front');
  var w = inner.offsetWidth, h = inner.offsetHeight, small = innerWidth <= 760;
  var c = small ? 3 : 4, r = small ? 4 : 5, cd = 500, step = (1000 - cd) / (r + c - 2);
  var gf = el('div', 'gf'); gf.setAttribute('aria-hidden', 'true'); gf.inert = true;
  gf.style.cssText = '--r:' + r + ';--c:' + c + ';--w:' + w + 'px;--h:' + h + 'px;--cd:' + cd + 'ms';
  for (i = 0; i < r; i++) for (j = 0; j < c; j++) { cell with --dl:(i+j)*step ms, two .gf-side (from/to) each holding
      a cloneNode(true) of the face, --x:-(j*w/c)px, --y:-(i*h/r)px }
  copy .track scrollLeft from the real face into its clones (so the reviews slide doesn't jump);
  inner.append(gf); t.setAttribute('data-busy', '');
  gf.offsetWidth; gf.classList.add('go');                       // next frame: start the wave
  var finish = function () { if (!gf.parentNode) return; done(); gf.remove(); t.removeAttribute('data-busy'); };
  last cell ((r-1,c-1)) 'transitionend' on transform → finish; setTimeout(finish, 1000 + cd + 200) as fallback.
}
```
- `done()` applies the real state (`flip` class, aria-pressed, back aria-hidden/inert) — the old `setFlip` body, now `apply(t, on)`. The class is toggled before `gf.remove()` in the same task so there is no flash.
- `setFlip(t, on, then)` = `gridFlip(t, on, function () { apply(t, on); if (then) then(); })`.
- **No-back tiles**: if `.back` missing, `to = from` (both sides same design); apply does nothing extra.
- **Navigating tiles**: in `wire`, if `t.dataset.href` → `setFlip(t, true, function () { location.href = t.dataset.href; })`.

## 3. JS: `wire` changes (~:929)
- `toggle`: `if (t.hasAttribute('data-busy')) return;` (lock); close any other open tile in the group with `setFlip(o, false)` (it plays its own reverse wave, independent lock), then `setFlip(t, on)`.
- Escape: also ignored while busy; focus stays on the tile.
- Click filter (`a, button` pass through) and Enter/Space unchanged. App-made tiles (`makeTile` → `wire(t, tiles)` ~:1071) and `carousel()` (rewrites `.back` before any flip) need no change — clones are taken at click time, so they include the carousel.
- Remove `back.inert = true` init only if `.back` missing (guard `if (back)`).

## 4. What's new card
app/src/pages/people/_whatsnew.jsx — new first entry in `UPDATES`, `date: '2026-11-06'`: "The landing-page tiles flip like a departure board" — services and venue tiles split into cells and turn in a wave; reduced-motion visitors get a fade.

## 5. Verification
- Serve site/ locally (`python3 -m http.server` in site/), agent-browser at 1440 and 390:
  - screenshot ~400 ms after a click (diagonal wave, cells in place, back reading as one picture, 4×5 vs 3×4), and after 1.3 s (seamless, `.gf` gone, `data-busy` gone);
  - click / Enter / Space / Escape; double-click mid-flip ignored; opening a 2nd tile reverses the 1st;
  - "Request cover" opens the form pre-filled; "Visit venue" href intact; carousel arrows work after flip (inject a carousel via `carousel(t,[…])` in the console if the reviews fetch can't run locally);
  - emulate `prefers-reduced-motion: reduce` → no `.gf`, fade only.
- `cd app && npm run build` (ui-lint ≤ 67). `agent-browser close --all`.
- Commit (with What's new card), `openkbs site deploy`, read-only check that the live page contains `gridFlip`, `git push origin master`.
