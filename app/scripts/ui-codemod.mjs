// One-off: move pages onto the design tokens (type scale, icon sizes, colours, radii).
// usage: node scripts/ui-codemod.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
const ROOT = path.resolve(import.meta.dirname, '../src');
const SKIP = [/learn\/Certificate\.jsx$/];

const TEXT = { 10: 'caption2', 10.5: 'caption2', 11: 'caption2', 12: 'caption', 12.5: 'caption', 13: 'footnote', 14: 'subhead', 15: 'body', 16: 'callout', 17: 'headline', 18: 'headline', 19: 'title3', 20: 'title3', 21: 'title3', 22: 'title2', 24: 'title2', 26: 'title2', 28: 'title1', 30: 'title1', 34: 'large' };
const ICON = (n) => (n >= 26 ? n : n <= 14 ? 14 : n <= 16 ? 16 : n <= 18 ? 18 : n <= 21 ? 20 : 24);
const HEX = {
  'bg-[#EEF0F3]': 'bg-fill', 'bg-[#E8EAEE]': 'bg-fill-strong', 'bg-[#E9ECF1]': 'bg-fill', 'bg-[#E3E5E8]': 'bg-toggle-off',
  'bg-[#dbe7ff]': 'bg-blue-press', 'bg-[#fbdcdc]': 'bg-red-press', 'bg-[#FDF3F3]': 'bg-red-soft/70',
  'text-[#FBBF24]': 'text-amber-bright', 'text-[#F87171]': 'text-red-bright',
  'text-[#4F46E5]': 'text-indigo', 'bg-[#EEF2FF]': 'bg-indigo-soft', 'text-[#2563EB]': 'text-sky', 'bg-[#E6F0FA]': 'bg-sky-soft',
};
const RAD = { 7: 'rounded-md', 8: 'rounded-lg', 9: 'rounded-lg', 10: 'rounded-xl', 20: 'rounded-tile', 28: 'rounded-sheet', 32: 'rounded-sheet' };

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.jsx?$/.test(f.name) && !SKIP.some((r) => r.test(p))) files.push(p); } })(ROOT);

let total = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let n = 0;
  let out = src.replace(/\b((?:[a-z]+:)*)text-\[([0-9.]+)px\]/g, (m, pre, v) => (TEXT[v] ? (n++, `${pre}text-${TEXT[v]}`) : m));
  // Icon sizes on JSX elements (not Avatar, which takes a pixel size)
  out = out.replace(/<([A-Z][\w.]*|it\.icon|[a-z]+\.icon)(\s[^<>]*?)\bsize=\{(\d+)\}/g, (m, tag, mid, v) => {
    if (/Avatar/.test(tag)) return m;
    const s = ICON(Number(v));
    if (s === Number(v)) return m;
    n++; return `<${tag}${mid}size={${s}}`;
  });
  out = out.replace(/\s?strokeWidth=\{2\.2\}/g, () => (n++, ''));
  for (const [a, b] of Object.entries(HEX)) out = out.split(a).join(b).replace(new RegExp(a.replace(/[[\]#]/g, '\\$&') + '(?=/)', 'g'), b);
  out = out.replace(/rounded(-t)?-\[(\d+)px\]/g, (m, t, v) => {
    const r = RAD[v]; if (!r) return m;
    n++; return t ? r.replace('rounded-', 'rounded-t-') : r;
  });
  if (out !== src) {
    total += n;
    console.log(`${String(n).padStart(4)}  ${path.relative(ROOT, f)}`);
    if (!DRY) fs.writeFileSync(f, out);
  }
}
console.log(`${total} changes${DRY ? ' (dry run)' : ''}`);
