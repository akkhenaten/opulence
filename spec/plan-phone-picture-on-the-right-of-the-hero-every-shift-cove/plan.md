# Implementation plan: Phone picture on the right of the landing hero

## Context
The approved spec puts the supplied picture (`.uploads/image_ffd7deab.png`, 1254×1254) to the right of "Every shift covered. / Every site connected." in `site/index.html`, lined up under "Sign in". Its built-in logo, headline and demo line are cropped off. On phones it stacks under the call to action. This is a static-site change only: no API, no data, and no app build.

## 1. Image assets (ImageMagick `convert`, already installed)
Crop y 285–1150, which keeps the phone, the hand and the three labels and drops the logo, headline and demo line. The output is 1254×865.
```
convert .uploads/image_ffd7deab.png -crop 1254x865+0+285 +repage /tmp/hero.png
convert /tmp/hero.png -resize 1200x -quality 82 site/img/hero-phone-1200.webp
convert /tmp/hero.png -resize 700x  -quality 80 site/img/hero-phone-700.webp
convert /tmp/hero.png -resize 1200x -quality 82 -strip site/img/hero-phone-1200.jpg
```
- View the cropped result to confirm there are no leftover letters at the top or bottom edge, and adjust the offsets if needed.
- Target: about 150 KB per WebP.
- The upload in `.uploads/` is not committed.

## 2. `site/index.html`
**Markup:** the hero becomes two children.
```html
<section class="hero">
  <div class="hero-copy"> …existing kicker, h1, p, .cta, small… </div>
  <picture class="shot">
    <source type="image/webp" srcset="/img/hero-phone-700.webp 700w, /img/hero-phone-1200.webp 1200w" sizes="(max-width: 960px) 100vw, 520px">
    <img src="/img/hero-phone-1200.jpg" width="1200" height="828" alt="Orb Security venue Overview on a phone: officers on site, due in, late and no-show counts, timesheets, invoices, cover requests and incidents." fetchpriority="high" decoding="async">
  </picture>
</section>
```
The final height is taken from the real resized file.

**CSS:** edit the existing `.hero` rules (lines 28–33) and the media queries (lines 76–77).
- `.hero`: `display:grid; grid-template-columns: 1.05fr 1fr; gap: 48px; align-items: start; padding: 40px 0 56px;`. Drop `max-width: 800px`.
- `.hero h1`: `font-size: clamp(40px, 5.2vw, 60px)`, so "Every site connected." stays on one line in the column.
- `.hero .shot img`: `display:block; width:100%; height:auto; border-radius:28px; box-shadow: 0 1px 2px rgba(11,18,32,.04), 0 24px 48px -24px rgba(11,18,32,.25);`.
- `.hero-copy { padding-top: 24px }`, so the text top roughly lines up with the picture.
- New `@media (max-width: 960px) { .hero { grid-template-columns: 1fr; gap: 32px; } }`. The picture comes after the copy in source order, so it stacks below the CTA.
- Keep `.hero p { max-width: 620px }` as it is.

## 3. Commit and deploy
- `git add site/index.html site/img/hero-phone-*`
- Commit with:
  ```
  feat: Landing page hero shows the venue app on a phone

  - add cropped phone picture to the right of the hero headline
  - stack it under the demo button on tablets and phones
  - serve small WebP copies with a JPEG fallback

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- Run `openkbs site deploy`.

## 4. Verification
- Serve `site/` locally with `npx http-server site -p 4174` or `python3 -m http.server`. Note the PID and stop it afterwards.
- With agent-browser at 1440, 1280, 1024, 960, 768 and 390 px:
  - take a screenshot at each width;
  - check `document.documentElement.scrollWidth <= innerWidth`;
  - on desktop the picture is in the right column under Sign in and the h1 lines don't wrap awkwardly;
  - at 390 px the demo button is above the fold (`getBoundingClientRect().bottom < innerHeight`) and the picture is below it.
- After deploy, load the CloudFront URL once. Confirm `/img/hero-phone-1200.webp` returns 200 and the hero renders.
- Run `agent-browser close --all`.
