// Word (.docx) → document markup (see docmarkup.mjs): headings, numbered and bulleted lists, bold, tables as rows.
// Good enough to carry the wording across; the manager checks the preview before sending.
import { unzipSync, strFromU8 } from 'fflate';

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Text runs of one paragraph, with **bold** where the run is bold */
function runsOf(p) {
  let out = '';
  for (const r of p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []) {
    const bold = /<w:b(?: w:val="(?:1|true|on)")?\s*\/>/.test(r) && !/<w:b w:val="(?:0|false|off)"/.test(r);
    let text = '';
    for (const m of r.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) text += m[1] != null ? decode(m[1]) : ' ';
    if (!text) continue;
    out += bold && text.trim() ? text.replace(/^(\s*)(.*?)(\s*)$/s, '$1**$2**$3') : text;
  }
  return out.replace(/\*\*\*\*/g, '').replace(/\s+/g, ' ').trim();
}

const style = (p) => (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';

/** Markup from the bytes of a .docx file. Throws on anything that is not a Word document. */
export function docxToMarkup(bytes) {
  let files;
  try { files = unzipSync(new Uint8Array(bytes), { filter: (f) => f.name === 'word/document.xml' }); } catch { throw new Error('This file could not be opened as a Word document'); }
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('This file could not be opened as a Word document');
  const body = strFromU8(xml).replace(/^[\s\S]*?<w:body>/, '').replace(/<w:sectPr[\s\S]*$/, '');
  const lines = [];
  // Tables and paragraphs in document order
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl>')) {
      for (const row of chunk.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) {
        const cells = (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map((c) => (c.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map(runsOf).filter(Boolean).join(' ')).filter(Boolean);
        if (cells.length) lines.push(`- ${cells.join(' · ')}`, '');
      }
      continue;
    }
    const text = runsOf(chunk);
    if (!text) continue;
    const st = style(chunk);
    const plain = text.replace(/\*\*/g, '');
    if (/^(Title|Heading ?[1-3])$/i.test(st)) lines.push(`# ${plain}`, '');
    else if (/<w:numPr>/.test(chunk) || /List/i.test(st)) lines.push(`- ${text}`);
    else { if (lines.length && lines[lines.length - 1].startsWith('- ')) lines.push(''); lines.push(text, ''); }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
