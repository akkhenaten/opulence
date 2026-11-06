// Build check for the Emergency guide: every button goes somewhere, every screen is reachable from K01,
// every picture exists, no reviewer's structure note shows as copy, and nothing in the guide is a tel: link.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/pages/guide/emergency');
const { CARDS, SCREENS } = await import(join(dir, 'screens.js'));
const TOKENS = ['@dial', '@back', '@resume', '@end', '@unwritten'];
const bad = [];
const art = (f) => f && !existsSync(join(root, 'public/emergency', f)) && bad.push(`missing art ${f}`);

for (const c of CARDS) { art(c.art); if (c.to && !SCREENS[c.to]) bad.push(`card ${c.key} -> ${c.to}`); }
for (const s of Object.values(SCREENS)) {
  if (!s.buttons.length) bad.push(`${s.id} has no buttons`);
  for (const b of s.buttons) if (!TOKENS.includes(b.to) && !SCREENS[b.to]) bad.push(`${s.id} "${b.label}" -> ${b.to}`);
  art(s.art); s.variants.forEach(art);
  if (/^(STRUCTURE ONLY|SCOPE NOT YET DEFINED)/i.test(s.text)) bad.push(`${s.id} shows a structure note`);
}
// The persistent controls are reachable from every screen, so they seed the walk too
const seen = new Set();
const walk = ['K01', 'G-CALL', 'G-DANGER', 'G-POLICE'];
while (walk.length) {
  const id = walk.pop();
  if (seen.has(id) || !SCREENS[id]) continue;
  seen.add(id);
  for (const b of SCREENS[id].buttons) if (SCREENS[b.to]) walk.push(b.to);
}
for (const id of Object.keys(SCREENS)) if (!seen.has(id)) bad.push(`${id} is not reachable from K01`);
for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsx'))) if (/\btel:/i.test(readFileSync(join(dir, f), 'utf8'))) bad.push(`${f} contains tel:`);
// Back and Start sit on every screen (the pack only has Back on four), so they must not get lost in an edit
const guide = readFileSync(join(dir, 'Guide.jsx'), 'utf8');
for (const [what, re] of [['the navigation row', /eg-nav"/], ['Back', /> Back</], ['Start', /> Start</], ['Leave guide', /> Leave guide</]]) if (!re.test(guide)) bad.push(`Guide.jsx lost ${what}`);

if (bad.length) { console.error(`Emergency guide check failed:\n  ${bad.join('\n  ')}`); process.exit(1); }
console.log(`emergency guide: ${Object.keys(SCREENS).length} screens OK`);
