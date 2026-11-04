import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { docxToMarkup } from '../lib/docx.mjs';
import { inspectPdf, mergeUpload } from '../lib/uploadSeal.mjs';
import { renderSigned } from '../lib/signdoc.mjs';
import { parse } from '../lib/docmarkup.mjs';

const p = (text, { style, bold, list } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${list ? '<w:numPr><w:ilvl w:val="0"/></w:numPr>' : ''}</w:pPr><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

function docx(inner) {
  const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${inner}<w:sectPr/></w:body></w:document>`;
  return Buffer.from(zipSync({ 'word/document.xml': strToU8(xml), '[Content_Types].xml': strToU8('<Types/>') }));
}

test('Word: headings, bold, lists and tables become markup', () => {
  const md = docxToMarkup(docx([
    p('Contract of Employment', { style: 'Title' }),
    p('Pay', { style: 'Heading1' }),
    p('You are paid &amp; that is ', {}) .replace('</w:r></w:p>', '</w:r><w:r><w:rPr><w:b/></w:rPr><w:t>monthly</w:t></w:r></w:p>'),
    p('First item', { list: true }),
    p('Second item', { list: true }),
    '<w:tbl><w:tr><w:tc>' + p('Rate') + '</w:tc><w:tc>' + p('£15') + '</w:tc></w:tr></w:tbl>',
  ].join('')));
  assert.match(md, /^# Contract of Employment/);
  assert.match(md, /# Pay/);
  assert.match(md, /You are paid & that is \*\*monthly\*\*/);
  assert.match(md, /- First item\n- Second item/);
  assert.match(md, /- Rate · £15/);
  assert.ok(parse(md).length >= 5);
});

test('Word: anything else is refused', () => {
  assert.throws(() => docxToMarkup(Buffer.from('not a zip')), /Word document/);
  assert.throws(() => docxToMarkup(Buffer.from(zipSync({ 'a.txt': strToU8('x') }))), /Word document/);
});

async function samplePdf(n) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < n; i++) pdf.addPage([595.28, 841.89]);
  return Buffer.from(await pdf.save());
}

test('uploaded PDF: original pages kept, stamped, signature page and certificate appended', async () => {
  const original = await samplePdf(3);
  const info = await inspectPdf(original);
  assert.equal(info.pages, 3);
  assert.match(info.sha256, /^[a-f0-9]{64}$/);
  const { bytes: appendix, fingerprint } = await renderSigned({
    company: { company_name: 'Orb Security' },
    doc: { kind: 'contract', typeLabel: 'Contract', title: 'Uploaded', reference: 'C-1', blocks: parse(`#! Signature page\n\nfingerprint ${info.sha256}`), attachment: { pages: 3 } },
    status: 'sent',
  });
  const merged = await mergeUpload(original, appendix, { reference: 'C-1', status: 'sent' });
  const out = await PDFDocument.load(merged);
  const extra = (await PDFDocument.load(appendix)).getPageCount();
  assert.equal(out.getPageCount(), 3 + extra);
  assert.ok(merged.length > original.length);
  // The file hash is part of the fingerprint: a different upload gives a different fingerprint
  const other = await renderSigned({ company: {}, doc: { kind: 'contract', typeLabel: 'Contract', title: 'Uploaded', reference: 'C-1', blocks: parse('#! Signature page\n\nfingerprint other'), attachment: { pages: 3 } }, status: 'sent' });
  assert.notEqual(fingerprint, other.fingerprint);
});

test('uploaded PDF: unreadable files are refused', async () => {
  await assert.rejects(inspectPdf(Buffer.from('%PDF-1.4 nonsense')), /could not be opened|no pages/);
});
