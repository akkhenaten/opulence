// One-off: draws the iPhone launch screens into public/, using agent-browser. The icons are made from the
// Opulence logo with ImageMagick (gold horse on black).
// usage: node scripts/splash.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PUB = path.resolve(import.meta.dirname, '../public');
const ab = (...a) => execFileSync('agent-browser', a, { stdio: 'pipe' });
const LOGO = `data:image/png;base64,${fs.readFileSync(path.join(PUB, 'brand/logo-gold.png')).toString('base64')}`;
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500&display=swap">';

// Portrait CSS size and pixel ratio of common iPhones
export const SPLASH = [[430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 2]];

const shot = (name, html, w, h, dpr) => {
  // data: URL, since file:// pages load blank in agent-browser
  ab('open', 'data:text/html,' + encodeURIComponent(`<!doctype html><html><head>${FONT}</head><body style="margin:0;overflow:hidden">${html}</body></html>`));
  ab('set', 'viewport', String(w), String(h), String(dpr));
  ab('wait', '1200'); // let the font load and the resized page repaint before the capture
  ab('screenshot', path.join(PUB, `${name}.png`));
};

try {
  for (const [w, h, d] of SPLASH) {
    shot(`splash-${w * d}x${h * d}`, `<div style="width:100vw;height:100vh;background:#0B0B0C;display:grid;place-content:center;justify-items:center;gap:18px">
      <img src="${LOGO}" width="120" alt=""><div style="font:500 30px 'Playfair Display',Georgia,serif;color:#C9A45C;letter-spacing:.02em">Opulence</div></div>`, w, h, d);
  }
} finally {
  ab('close', '--all');
}
console.log(SPLASH.map(([w, h, d]) => `<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" href="/app/splash-${w * d}x${h * d}.png" />`).join('\n'));
