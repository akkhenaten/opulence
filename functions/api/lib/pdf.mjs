import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

const BLUE = rgb(0.04, 0.42, 1);
const INK = rgb(0.04, 0.07, 0.13);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.9, 0.91, 0.92);
const SOFT = rgb(0.95, 0.96, 0.97);

// WinAnsi can't encode some characters; keep PDFs robust
const clean = (s) => String(s ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x0A\x20-\x7E\xA3\xA0-\xFF]/g, '');

class Doc {
  static async create(title) {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.pdf.setTitle(title);
    d.font = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.addPage();
    return d;
  }

  addPage() {
    this.page = this.pdf.addPage([595.28, 841.89]);
    this.y = 800;
    this.x = 48;
    this.w = 595.28 - 96;
  }

  ensure(h) { if (this.y - h < 56) this.addPage(); }

  text(str, { size = 10, font = this.font, color = INK, x = this.x, maxWidth = this.w, gap = 4 } = {}) {
    for (const para of clean(str).split('\n')) {
      const words = para.split(' ');
      let line = '';
      const lines = [];
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = w; } else line = test;
      }
      lines.push(line);
      for (const l of lines) {
        this.ensure(size + gap);
        this.page.drawText(l, { x, y: this.y - size, size, font, color });
        this.y -= size + gap;
      }
    }
  }

  space(n = 10) { this.y -= n; }

  header(company, docTitle, subtitle) {
    this.page.drawCircle({ x: this.x + 9, y: this.y - 9, size: 9, color: BLUE });
    this.page.drawCircle({ x: this.x + 9, y: this.y - 9, size: 4, color: rgb(1, 1, 1) });
    this.page.drawText('ORB SECURITY', { x: this.x + 26, y: this.y - 13, size: 11, font: this.bold, color: INK });
    const t = clean(docTitle);
    this.page.drawText(t, { x: this.x + this.w - this.bold.widthOfTextAtSize(t, 18), y: this.y - 16, size: 18, font: this.bold, color: INK });
    this.y -= 26;
    if (subtitle) {
      const s = clean(subtitle);
      this.page.drawText(s, { x: this.x + this.w - this.font.widthOfTextAtSize(s, 10), y: this.y - 8, size: 10, font: this.font, color: MUTED });
    }
    this.text(company?.company_name || '', { size: 9, color: MUTED });
    if (company?.company_address) this.text(company.company_address, { size: 9, color: MUTED });
    this.space(14);
    this.page.drawLine({ start: { x: this.x, y: this.y }, end: { x: this.x + this.w, y: this.y }, thickness: 1, color: LINE });
    this.space(16);
  }

  // Two columns of label/value pairs
  meta(left = [], right = []) {
    const startY = this.y;
    const col = (pairs, x) => {
      this.y = startY;
      for (const [k, v] of pairs) {
        this.text(k.toUpperCase(), { size: 7, color: MUTED, x, maxWidth: this.w / 2 - 10, gap: 2 });
        this.text(v || '-', { size: 10, x, maxWidth: this.w / 2 - 10, gap: 6 });
      }
      return this.y;
    };
    const a = col(left, this.x);
    const b = col(right, this.x + this.w / 2);
    this.y = Math.min(a, b) - 6;
  }

  section(title) {
    this.space(6);
    this.ensure(30);
    this.text(title, { size: 11, font: this.bold, color: BLUE, gap: 8 });
  }

  // cols: [{ label, width (fraction), align }]
  table(cols, rows) {
    const draw = (cells, { font = this.font, color = INK, bg } = {}) => {
      const h = 18;
      this.ensure(h + 2);
      if (bg) this.page.drawRectangle({ x: this.x, y: this.y - h + 4, width: this.w, height: h, color: bg });
      let cx = this.x + 6;
      cols.forEach((c, i) => {
        const cw = c.width * this.w - 12;
        let s = clean(cells[i]);
        while (s && font.widthOfTextAtSize(s, 9) > cw) s = s.slice(0, -2);
        const tx = c.align === 'right' ? cx + cw - font.widthOfTextAtSize(s, 9) : cx;
        this.page.drawText(s, { x: tx, y: this.y - 9, size: 9, font, color });
        cx += c.width * this.w;
      });
      this.y -= h;
    };
    draw(cols.map((c) => c.label.toUpperCase()), { font: this.bold, color: MUTED, bg: SOFT });
    for (const r of rows) {
      draw(r);
      this.page.drawLine({ start: { x: this.x, y: this.y + 4 }, end: { x: this.x + this.w, y: this.y + 4 }, thickness: 0.5, color: LINE });
    }
  }

  totals(pairs) {
    this.space(8);
    for (const [k, v, strong] of pairs) {
      this.ensure(18);
      const font = strong ? this.bold : this.font;
      const size = strong ? 12 : 10;
      const vx = this.x + this.w - font.widthOfTextAtSize(clean(v), size);
      this.page.drawText(clean(k), { x: this.x + this.w - 220, y: this.y - size, size, font, color: strong ? INK : MUTED });
      this.page.drawText(clean(v), { x: vx, y: this.y - size, size, font, color: INK });
      this.y -= size + 8;
    }
  }

  async image(pngBytesOrDataUrl, { width = 160, x = this.x } = {}) {
    const bytes = typeof pngBytesOrDataUrl === 'string' ? Buffer.from(pngBytesOrDataUrl.split(',')[1], 'base64') : pngBytesOrDataUrl;
    const img = await this.pdf.embedPng(bytes);
    const h = (img.height / img.width) * width;
    this.ensure(h + 6);
    this.page.drawImage(img, { x, y: this.y - h, width, height: h });
    this.y -= h + 6;
  }

  footer(text) {
    for (const p of this.pdf.getPages()) {
      p.drawText(clean(text), { x: 48, y: 30, size: 7.5, font: this.font, color: MUTED });
    }
  }

  async base64() { return Buffer.from(await this.pdf.save()).toString('base64'); }
}

export { Doc };

export async function qrPng(text, width = 600) {
  return QRCode.toBuffer(text, { type: 'png', width, margin: 1, color: { dark: '#0B1220', light: '#FFFFFF' } });
}

export async function qrPosterPdf(venue, payload) {
  const d = await Doc.create(`QR poster - ${venue.name}`);
  const p = d.page;
  p.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: rgb(0.95, 0.96, 0.97) });
  p.drawRectangle({ x: 60, y: 120, width: 475, height: 640, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 1 });
  p.drawCircle({ x: 297.6, y: 715, size: 16, color: BLUE });
  p.drawCircle({ x: 297.6, y: 715, size: 7, color: rgb(1, 1, 1) });
  const center = (s, y, size, font = d.bold, color = INK) => {
    const t = clean(s);
    p.drawText(t, { x: 297.6 - font.widthOfTextAtSize(t, size) / 2, y, size, font, color });
  };
  center('Officer clock-in', 665, 26);
  center(venue.name, 638, 14, d.font, MUTED);
  const img = await d.pdf.embedPng(await qrPng(payload, 800));
  p.drawImage(img, { x: 297.6 - 160, y: 290, width: 320, height: 320 });
  center('Open the Orb app  >  Clock in  >  Scan this code', 250, 12, d.font);
  center('You must be on site. Location is checked.', 230, 10, d.font, MUTED);
  center(`Code v${venue.qr_version}  -  do not copy or photograph for use elsewhere`, 150, 8, d.font, MUTED);
  return d.base64();
}
