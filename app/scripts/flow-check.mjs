// Build check for the Emergency flowchart: every answer goes somewhere, every card is reachable and can reach an ending,
// every card quotes a source, no quoted text has been edited since it was copied, and nothing under guide/flow is a tel: link.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/pages/guide/flow');
const { FLOW, SITUATIONS, START, BANDS } = await import(join(dir, 'flow.js'));
const { SOURCES } = await import(join(dir, 'sources.js'));
const TOKENS = ['@start', '@leave'];
const bad = [];

if (!FLOW[START]) bad.push('no first card');
for (const [id, c] of Object.entries(FLOW)) {
  if (!c.title) bad.push(`${id} has no title`);
  if (!['question', 'step', 'end'].includes(c.kind)) bad.push(`${id} kind ${c.kind}`);
  if (!BANDS.some((b) => id.startsWith(b.prefix))) bad.push(`${id} belongs to no band on the map`);
  const n = c.answers.length;
  if (id !== START && (n < 2 || n > 4)) bad.push(`${id} has ${n} answers (2 to 4)`);
  for (const a of c.answers) if (!TOKENS.includes(a.to) && !FLOW[a.to]) bad.push(`${id} "${a.label}" -> ${a.to}`);
  if (c.kind === 'end' && !c.answers.every((a) => TOKENS.includes(a.to))) bad.push(`${id} is an ending but leads on`);
  if (c.kind !== 'end' && c.answers.some((a) => TOKENS.includes(a.to))) bad.push(`${id} ends a journey but is not an ending`);
  if (id !== START && !c.extract.length) bad.push(`${id} quotes no source`);
  for (const x of c.extract) if (!SOURCES[x]) bad.push(`${id} quotes unknown extract ${x}`);
}
for (const s of SITUATIONS) for (const t of ['start', 'safety']) if (!FLOW[s[t]]) bad.push(`situation ${s.key} ${t} -> ${s[t]}`);

// Reachable from the first card, and every card can still reach an ending
const seen = new Set([START]);
for (const queue = [START]; queue.length;) for (const a of FLOW[queue.shift()].answers) if (FLOW[a.to] && !seen.has(a.to)) { seen.add(a.to); queue.push(a.to); }
for (const id of Object.keys(FLOW)) if (!seen.has(id)) bad.push(`${id} is unreachable`);
const ends = new Set(Object.keys(FLOW).filter((id) => FLOW[id].kind === 'end'));
for (let grew = true; grew;) {
  grew = false;
  for (const [id, c] of Object.entries(FLOW)) if (!ends.has(id) && c.answers.some((a) => ends.has(a.to))) { ends.add(id); grew = true; }
}
for (const id of Object.keys(FLOW)) if (!ends.has(id)) bad.push(`${id} never reaches an ending`);

// Quoted word for word: each extract has its page, a URL, the copy date, and text matching the hash saved when copied
for (const [id, s] of Object.entries(SOURCES)) {
  if (!s.org || !s.page || !/^https:\/\//.test(s.url || '') || !/^\d{4}-\d{2}-\d{2}$/.test(s.copied || '')) bad.push(`extract ${id} is missing its source details`);
  if (createHash('sha256').update(s.text).digest('hex').slice(0, 16) !== s.hash) bad.push(`extract ${id} text has changed since it was copied`);
}

// Nothing under guide/flow dials or links to a phone number
const tel = ['tel', ':'].join('');
for (const f of readdirSync(dir)) if (readFileSync(join(dir, f), 'utf8').includes(tel)) bad.push(`${f} contains a ${tel} link`);

if (bad.length) { console.error(`Emergency flowchart check failed:\n  ${bad.join('\n  ')}`); process.exit(1); }
console.log(`Emergency flowchart: ${Object.keys(FLOW).length} cards OK, ${Object.keys(SOURCES).length} extracts unchanged`);
