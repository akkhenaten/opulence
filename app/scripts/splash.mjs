// One-off: draws the iPhone launch screens and the maskable icon into public/, using agent-browser.
// usage: node scripts/splash.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const PUB = path.resolve(import.meta.dirname, '../public');
const ab = (...a) => execFileSync('agent-browser', a, { stdio: 'pipe' });
const LOGO = '<circle cx="256" cy="256" r="132" fill="none" stroke="#fff" stroke-width="44"/><circle cx="256" cy="256" r="40" fill="#fff"/>';

// Portrait CSS size and pixel ratio of common iPhones
export const SPLASH = [[430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 2]];

const shot = (name, html, w, h, dpr) => {
  // data: URL, since file:// pages load blank in agent-browser
  ab('open', 'data:text/html,' + encodeURIComponent(`<!doctype html><html><body style="margin:0;overflow:hidden">${html}</body></html>`));
  ab('set', 'viewport', String(w), String(h), String(dpr));
  ab('wait', '500'); // let the resized page repaint before the capture
  ab('screenshot', path.join(PUB, `${name}.png`));
};

try {
  for (const [w, h, d] of SPLASH) {
    shot(`splash-${w * d}x${h * d}`, `<div style="width:100vw;height:100vh;background:#F2F4F7;display:grid;place-items:center">
      <svg viewBox="0 0 512 512" width="96" height="96"><rect width="512" height="512" rx="120" fill="#0A6CFF"/>${LOGO}</svg></div>`, w, h, d);
  }
  // Full-bleed for Android's masks; the mark already sits inside the 80% safe circle
  shot('icon-maskable-512', `<svg viewBox="0 0 512 512" width="512" height="512" style="display:block"><rect width="512" height="512" fill="#0A6CFF"/>${LOGO}</svg>`, 512, 512, 1);
} finally {
  ab('close', '--all');
}
console.log(SPLASH.map(([w, h, d]) => `<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)" href="/app/splash-${w * d}x${h * d}.png" />`).join('\n'));
