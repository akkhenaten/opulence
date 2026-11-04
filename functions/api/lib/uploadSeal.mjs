// Uploaded PDF contracts: the original pages stay exactly as uploaded, with a reference and page number stamped in
// the bottom margin (and the status watermark until signed), followed by the signature page and certificate.
import crypto from 'node:crypto';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { STATUS_WORD, WATERMARK } from './signdoc.mjs';

const MUTED = rgb(0.42, 0.45, 0.5);

export const sha256 = (bytes) => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');

/** Page count of an uploaded PDF; refuses encrypted or unreadable files with a plain message. */
export async function inspectPdf(bytes) {
  let pages;
  try { pages = (await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false })).getPageCount(); } catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error('This PDF is password-protected. Remove the password and upload it again.');
    throw new Error('This file could not be opened as a PDF');
  }
  if (!pages) throw new Error('This PDF has no pages');
  if (pages > 200) throw new Error('This PDF has more than 200 pages');
  return { pages, sha256: sha256(bytes) };
}

/** Original pages (stamped) + the appendix pages rendered by renderSigned. */
export async function mergeUpload(originalBytes, appendixBytes, { reference = '', status = 'sent' } = {}) {
  const out = await PDFDocument.load(originalBytes, { updateMetadata: false });
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const appendix = await PDFDocument.load(appendixBytes);
  const own = out.getPages();
  const total = own.length + appendix.getPageCount();
  const mark = WATERMARK[status];
  const word = STATUS_WORD[status] || '';
  own.forEach((p, i) => {
    const { width, height } = p.getSize();
    if (mark) {
      const size = Math.min(width, height) / (mark.length > 16 ? 14 : 9);
      const tw = bold.widthOfTextAtSize(mark, size);
      const a = Math.PI / 4;
      p.drawText(mark, {
        x: width / 2 - (tw / 2) * Math.cos(a) + (size / 3) * Math.sin(a), y: height / 2 - (tw / 2) * Math.sin(a) - (size / 3) * Math.cos(a),
        size, font: bold, color: status === 'void' ? rgb(0.86, 0.15, 0.15) : MUTED, opacity: status === 'void' ? 0.14 : 0.09, rotate: degrees(45),
      });
    }
    // A white strip keeps the stamp readable over whatever the original has in its margin
    const text = `${reference ? `Ref ${reference}  ·  ` : ''}${word ? `${word}  ·  ` : ''}Page ${i + 1} of ${total}`;
    const tw = font.widthOfTextAtSize(text, 7);
    p.drawRectangle({ x: width - 24 - tw - 6, y: 8, width: tw + 12, height: 14, color: rgb(1, 1, 1), opacity: 0.9 });
    p.drawText(text, { x: width - 24 - tw, y: 12, size: 7, font, color: MUTED });
  });
  for (const pg of await out.copyPages(appendix, appendix.getPageIndices())) out.addPage(pg);
  return Buffer.from(await out.save({ useObjectStreams: false }));
}
