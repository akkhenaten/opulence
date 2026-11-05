// Builds the landing page images from the original Opulence image set (needs ImageMagick with WebP/AVIF).
// Usage: node scripts/site-images.mjs <unzipped image folder>
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_CLIENTS } from '../functions/api/lib/siteClients.mjs';

const src = process.argv[2];
if (!src) { console.error('Usage: node scripts/site-images.mjs <folder>'); process.exit(1); }
const out = new URL('../site/img/opulence/', import.meta.url).pathname;

// Crop to w×h from the centre, then write each format at each width
function crop(file, dest, w, h, widths, formats = ['webp', 'jpg']) {
  for (const width of widths) {
    const height = Math.round((h / w) * width);
    for (const fmt of formats) {
      execFileSync('convert', [join(src, file) + '[0]', '-auto-orient', '-resize', `${width}x${height}^`, '-gravity', 'center', '-extent', `${width}x${height}`,
        '-strip', '-quality', fmt === 'webp' ? '76' : '80', `${dest}-${width}.${fmt}`]);
    }
  }
}

for (const d of ['clients', 'services', 'awards']) mkdirSync(join(out, d), { recursive: true });

for (const c of SITE_CLIENTS) crop(join('Clients', c.file), join(out, 'clients', c.slug), 4, 3, [480, 960]);
crop('Manned Guarding.png', join(out, 'services', 'manned-guarding'), 4, 3, [600, 1200]);
crop('Mobile Response.png', join(out, 'services', 'mobile-response'), 4, 3, [600, 1200]);
crop('event security.png', join(out, 'services', 'event-security'), 4, 3, [600, 1200]);
crop('40under40.avif', join(out, 'awards', '40-under-40'), 1, 1, [400, 800]);
crop('innovation.avif', join(out, 'awards', 'innovation'), 1, 1, [400, 800]);
crop('background.jpg', join(out, 'hero'), 16, 10, [800, 1600]);

// Logo and icons on transparent; share image is the logo on the page's dark ink
for (const size of [192, 512]) execFileSync('convert', [join(src, 'Opulence.png'), '-resize', `${size}x${size}`, '-strip', join(out, `logo-${size}.png`)]);
execFileSync('convert', ['-size', '1200x630', 'xc:#0B0B0C', '(', join(src, 'Opulence.png'), '-resize', '440x440', ')', '-gravity', 'center', '-composite', '-quality', '82', join(out, 'og.jpg')]);
copyFileSync(join(src, 'favicon.ico'), new URL('../site/favicon.ico', import.meta.url).pathname);
console.log('Images written to', out);
