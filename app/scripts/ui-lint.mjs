// Reports drift from the design system. Never fails the build.
// A line ending in `// ui-ok` (or containing `ui-ok`) is an allowed exception.
// usage: node scripts/ui-lint.mjs [--report] [--files] [dir]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../src');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SHOW_FILES = process.argv.includes('--files');
const ICON_OK = new Set([14, 16, 18, 20, 24]);
// The printable certificate keeps its own fixed print sizes
const SKIP = [/learn[\\/]Certificate\.jsx$/];

const RULES = [
  ['text-[px]', /\btext-\[(\d+(?:\.\d+)?)px\]/g, (m) => Number(m[1]) < 36],
  ['raw hex', /-\[#[0-9a-fA-F]{3,8}\]/g],
  ['icon size', /<(?!Avatar)[A-Za-z][\w.]*\s[^<>]*?\bsize=\{(\d+)\}/g, (m) => Number(m[1]) < 26 && !ICON_OK.has(Number(m[1]))],
  ['raw <button', /<button\b/g, (_, f) => !f.includes(`${path.sep}ui${path.sep}`)],
  ['raw <input', /<input\b(?![^>]*type="(?:file|checkbox|radio|range|hidden)")/g, (_, f) => !f.includes(`${path.sep}ui${path.sep}`)],
  ['vh unit', /\b\d+vh\b|h-screen/g],
];

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.jsx?$/.test(f.name) && !SKIP.some((r) => r.test(p))) files.push(p); } })(only ? path.resolve(ROOT, only) : ROOT);

const totals = Object.fromEntries(RULES.map(([k]) => [k, 0]));
const perFile = {};
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (const line of lines) {
    if (line.includes('ui-ok')) continue;
    for (const [k, re, ok] of RULES) {
      for (const m of line.matchAll(re)) {
        if (ok && !ok(m, f)) continue;
        totals[k]++;
        const r = path.relative(ROOT, f);
        perFile[r] = (perFile[r] || 0) + 1;
      }
    }
  }
}
const sum = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`ui-lint: ${sum} issue${sum === 1 ? '' : 's'} — ` + Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(', '));
if (SHOW_FILES) for (const [f, n] of Object.entries(perFile).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${f}`);
