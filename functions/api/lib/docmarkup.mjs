// Template wording for signed documents: placeholders and a small formatting language.
//   # Heading        numbered clause heading (1, 2, …); paragraphs under it become 1.1, 1.2, …
//   #! Heading       unnumbered heading (schedules, appendices); paragraphs under it stay unnumbered
//   3. Text          a paragraph that already carries its own number keeps it
//   - item           bullet
//   **bold**         bold run
//   ---page---       start a new page

export const PLACEHOLDERS = [
  { key: 'company', label: 'Company name', sample: 'Orb Security Ltd' },
  { key: 'company_address', label: 'Company address', sample: '1 King Street, Manchester M2 4LQ' },
  { key: 'officer', label: 'Officer name', sample: 'Marcus Reid' },
  { key: 'officer_address', label: 'Officer address', sample: '14 Mill Lane, Salford M5 3EZ' },
  { key: 'utr', label: 'Officer UTR', sample: '12345 67890' },
  { key: 'start_date', label: 'Start date', sample: '1 Dec 2026' },
  { key: 'role', label: 'Role', sample: 'Door Supervisor' },
  { key: 'venue', label: 'Venue', sample: 'The Lantern' },
  { key: 'rate', label: 'Hourly rate', sample: '£15.50' },
  { key: 'current_rate', label: 'Current rate', sample: '£14.00' },
  { key: 'conditions', label: 'Pay-rise conditions', sample: ', once the goals listed are met' },
  { key: 'today', label: "Today's date", sample: '2 Nov 2026' },
  { key: 'signatory', label: 'Company signatory', sample: 'Jane Doe' },
  { key: 'signatory_title', label: 'Signatory job title', sample: 'Operations Manager' },
];
export const PLACEHOLDER_KEYS = PLACEHOLDERS.map((p) => p.key);
export const SAMPLE_VALUES = Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.sample]));

const TOKEN = /\{\{\s*([a-z_]+)\s*\}\}/g;
export const BLANK = '________';

/** Placeholders in the text that the app does not know. */
export const unknownPlaceholders = (body) => [...new Set([...String(body || '').matchAll(TOKEN)].map((m) => m[1]).filter((k) => !PLACEHOLDER_KEYS.includes(k)))];

/** Placeholders used in the text, in order. */
export const usedPlaceholders = (body) => [...new Set([...String(body || '').matchAll(TOKEN)].map((m) => m[1]).filter((k) => PLACEHOLDER_KEYS.includes(k)))];

/** Replace known placeholders; an empty value prints a blank line to fill in by hand ('conditions' may be empty). */
export const fill = (body, values = {}) => String(body || '').replace(TOKEN, (m, k) => {
  if (!PLACEHOLDER_KEYS.includes(k)) return m;
  const v = values[k];
  if (v == null || v === '') return k === 'conditions' ? '' : BLANK;
  return String(v);
});

/** "**a** b" → [{ text: 'a', bold: true }, { text: ' b' }] */
export function runs(text) {
  const out = [];
  String(text).split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ text: part.slice(2, -2), bold: true });
    else out.push({ text: part });
  });
  return out;
}

const MANUAL = /^(\d{1,2}(?:\.\d{1,2})*)[.)]\s+(?=\S)|^(\d{1,2}\.\d{1,2})\s+(?=\S)/;

/** Wording → blocks: { type: 'heading'|'clause'|'para'|'bullet'|'break', number?, runs } */
export function parse(body) {
  const blocks = [];
  let heading = 0;
  let sub = 0;
  let unnumbered = false;
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    buf = [];
    if (!text) return;
    const m = text.match(MANUAL);
    if (m) blocks.push({ type: 'clause', number: m[1] || m[2], runs: runs(text.slice(m[0].length)) });
    else if (heading && !unnumbered) blocks.push({ type: 'clause', number: `${heading}.${++sub}`, runs: runs(text) });
    else blocks.push({ type: 'para', runs: runs(text) });
  };
  for (const raw of String(body || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^-{3}\s*page\s*-{3}$/i.test(line)) { flush(); blocks.push({ type: 'break' }); continue; }
    if (/^#!\s+/.test(line)) {
      flush();
      unnumbered = true;
      blocks.push({ type: 'heading', number: '', runs: runs(line.replace(/^#!\s+/, '')) });
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      unnumbered = false;
      heading += 1;
      sub = 0;
      blocks.push({ type: 'heading', number: String(heading), runs: runs(line.replace(/^#{1,3}\s+/, '')) });
      continue;
    }
    if (/^[-•*]\s+/.test(line) && !/^\*\*/.test(line)) { flush(); blocks.push({ type: 'bullet', runs: runs(line.replace(/^[-•*]\s+/, '')) }); continue; }
    buf.push(line);
  }
  flush();
  return blocks;
}

/** Plain text of blocks, used for the fingerprint. */
export const plain = (blocks) => blocks.map((b) => (b.type === 'break' ? '\f' : `${b.number ? `${b.number} ` : ''}${b.type === 'bullet' ? '- ' : ''}${b.runs.map((r) => r.text).join('')}`)).join('\n');
