# Plan: Phone picture on the right of the hero ("Every shift covered.")

## Context
The user wants the supplied marketing picture (`.uploads/image_ffd7deab.png`, 1254×1254) in the hero of `site/index.html`, in the empty space to the right of "Every shift covered. / Every site connected." and below "Sign in". The current hero is text only (max 800 px wide), so the right side of the page is empty on desktop.

## Crop the picture's built-in text (recommended)
The picture carries its own text, which would sit right next to the page's own:
- the Orb Security logo, which repeats the header logo;
- "Your venue. Your team. Connected.", a second headline beside the h1;
- "Request a private demo", which repeats the hero's button.

So crop the top logo and headline and the bottom demo line, roughly y 280–1150. That keeps the hand, the phone and the three floating labels (On-site overview, Upcoming cover, Shared updates). The result is about 1254×870, a landscape-ish shape that suits the right column.

## Layout
- **Desktop (wider than 960 px):** the hero becomes a two-column grid.
  - The text stays on the left, about 1.05fr. The h1 is clamped a little smaller (max about 60 px) so "Every site connected." stays on one line in the narrower column.
  - The picture goes on the right, about 1fr, top-aligned under the Sign in button. It sits in a rounded card (about 28 px radius) with the page's soft shadow. The soft blue background of the picture blends with the page's grey-blue.
  - The hero's max-width of 800 is lifted to the full 1120 container.
- **Tablet and phone (960 px and narrower):** a single column. The text and the "Request a private demo" button come first, so the button stays visible without scrolling. The picture follows underneath at full width.
- The picture is not clickable. The demo button is right beside it, so a second call to action isn't needed.

## Image handling
- Use ImageMagick (already installed) to crop and resize into `site/img/`:
  - `hero-phone-1200.webp` and `hero-phone-700.webp`, both about quality 82;
  - `hero-phone-1200.jpg` as a fallback.
  - That takes about 2 MB down to roughly 100–150 KB.
- Use `<picture>` with `srcset`/`sizes`, an explicit width and height (so the page doesn't jump while loading), and `fetchpriority="high"` because it is above the fold. Don't lazy-load it.
- Alt text: "Orb Security venue Overview on a phone: officers on site, due in, late and no-show counts, timesheets, invoices, cover requests and incidents."
- The original upload is not committed.

## Files
- `site/index.html`:
  - wrap the hero text in a `<div>` and add the `<picture>`;
  - CSS: `.hero` grid, `.hero .shot`, a smaller h1 clamp, and a 960 px media query that stacks the hero.
- `site/img/hero-phone-*` (new).

## Deploy
- Commit as `feat: Landing page hero shows the venue app on a phone`, with the Co-Authored-By line.
- Run `openkbs site deploy`. No function deploy is needed.

## Verification
- Preview at 1440 px, 1280 px, 1024 px, 768 px and 390 px with agent-browser:
  - the picture sits to the right of the headline, below Sign in;
  - the headline lines don't break awkwardly;
  - no horizontal overflow;
  - on a phone the demo button is visible without scrolling, with the picture below it.
- Check the live site after deploy.
- Run `agent-browser close --all`, then stop the preview by its PID.
