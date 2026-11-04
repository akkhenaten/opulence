// The one layout every signed document uses: header band, key facts, numbered clauses, the two signature
// boxes, a signing certificate as the last page, a status watermark and a running footer.
import crypto from 'node:crypto';
import { degrees, rgb } from 'pdf-lib';
import { Doc, INK, MUTED, LINE, SOFT, qrPng } from './pdf.mjs';
import { hexToRgb, DEFAULT_COLOR } from './brand.mjs';
import { plain } from './docmarkup.mjs';
import { fmtDate, fmtDateTime } from './time.mjs';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 56;
const BOTTOM = 64;

export const STATUS_WORD = { preview: 'PREVIEW - SAMPLE DATA', proof: 'PREVIEW', draft: 'DRAFT - PENDING LEGAL REVIEW', sent: 'NOT YET SIGNED', signed: 'SIGNED', void: 'VOID', superseded: 'SUPERSEDED' };
export const WATERMARK = { preview: 'PREVIEW - SAMPLE DATA', draft: 'DRAFT - PENDING LEGAL REVIEW', sent: 'AWAITING SIGNATURE', void: 'VOID', superseded: 'SUPERSEDED' };

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

// A brand colour light enough to vanish on paper is darkened towards ink for text
function accentInk(hex) {
  const h = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : DEFAULT_COLOR;
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  if (1.05 / (L + 0.05) >= 3.5) return hexToRgb(h);
  return rgb(...c.map((v, i) => v * 0.45 + [0.04, 0.07, 0.13][i] * 0.55));
}

/** "Mozilla/5.0 (iPhone; …) … Safari" → "iPhone · Safari" */
export function device(ua) {
  if (!ua) return '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || 'Unknown device';
}

/** The content fingerprint printed on the certificate: wording, terms and both signatures. */
export function fingerprintOf({ reference, title, blocks, terms, signers }) {
  const sig = (s) => (s ? { name: s.name, title: s.title || '', at: s.at ? new Date(s.at).toISOString() : null, png: s.png ? sha(s.png) : null } : null);
  return sha(JSON.stringify({ reference, title, text: plain(blocks), terms: terms || null, company: sig(signers?.company), officer: sig(signers?.officer) }));
}

class SignDoc extends Doc {
  async prepare() {
    this.logoImg = this.company ? await this.logo(this.company) : null;
  }

  addPage() {
    super.addPage();
    this.x = M;
    this.w = PAGE_W - M * 2;
    this.y = PAGE_H - 48;
    if (this.pdf.getPageCount() > 1 && !this.certificate) this.slimHeader();
  }

  ensure(h) { if (this.y - h < BOTTOM) this.addPage(); }

  // Continuation pages: small logo or name, the title, a hairline
  slimHeader() {
    const p = this.page;
    if (this.logoImg) {
      const { width, height } = this.logoImg.scaleToFit(90, 18);
      p.drawImage(this.logoImg, { x: this.x, y: this.y - height + 2, width, height });
    } else {
      p.drawText(this.clean(this.company?.company_name || ''), { x: this.x, y: this.y - 10, size: 9, font: this.bold, color: INK });
    }
    const t = this.fit(this.title, this.font, 8.5, this.w * 0.55);
    p.drawText(t, { x: this.x + this.w - this.font.widthOfTextAtSize(t, 8.5), y: this.y - 10, size: 8.5, font: this.font, color: MUTED });
    this.y -= 24;
    p.drawLine({ start: { x: this.x, y: this.y }, end: { x: this.x + this.w, y: this.y }, thickness: 0.5, color: LINE });
    this.y -= 22;
  }

  fit(str, font, size, max) {
    let s = this.clean(str);
    if (font.widthOfTextAtSize(s, size) <= max) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}…`, size) > max) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  }

  // Word-wrap mixed regular/bold runs into lines of { text, font, width } pieces
  wrap(runs, size, maxWidth, baseFont = this.font) {
    const words = [];
    for (const r of runs) {
      const font = r.bold ? this.bold : baseFont;
      this.clean(r.text).split(/(\s+)/).forEach((t) => { if (t) words.push({ text: t, font, space: /^\s+$/.test(t) }); });
    }
    const lines = [];
    let line = [];
    let w = 0;
    for (const word of words) {
      if (word.space) { if (line.length) { line.push({ ...word, text: ' ', width: baseFont.widthOfTextAtSize(' ', size) }); w += line.at(-1).width; } continue; }
      const ww = word.font.widthOfTextAtSize(word.text, size);
      if (w + ww > maxWidth && line.length) {
        while (line.at(-1)?.space) line.pop();
        lines.push(line);
        line = [];
        w = 0;
      }
      line.push({ ...word, width: ww });
      w += ww;
    }
    while (line.at(-1)?.space) line.pop();
    if (line.length) lines.push(line);
    return lines;
  }

  drawLines(lines, { x, size, color = INK, lead }) {
    for (const l of lines) {
      this.ensure(lead);
      let cx = x;
      for (const piece of l) {
        if (!piece.space) this.page.drawText(piece.text, { x: cx, y: this.y - size, size, font: piece.font, color });
        cx += piece.width;
      }
      this.y -= lead;
    }
  }

  label(str, x, y, color = MUTED, size = 7) {
    this.page.drawText(this.clean(str).toUpperCase(), { x, y, size, font: this.bold, color });
  }
}

/**
 * Build a signed document.
 * doc: { kind: 'contract'|'policy'|'pay_rise', typeLabel, title, reference, issuedAt, version, officerName, blocks,
 *        partyLabel? (a business signing: its name), partyRole? (certificate role), attachment? { title, pages },
 *        terms?: { left: [[k,v]], right: [[k,v]], conditions: [{ title, status }] }, ackLine?, legacy? }
 * signers: { company: { name, title, png, at } | null, officer: { name, png, at, email, ip, ua } | null }
 * events: [{ kind, at, actor_name, ip, ua }]
 * status: preview | proof (real values, every clause legally reviewed) | draft | sent | signed | void | superseded
 * Returns { bytes, fingerprint }.
 */
export async function renderSigned({ company, doc, signers = {}, events = [], status = 'sent', verifyUrl = '' }) {
  const s = await SignDoc.create(doc.title, { unicode: true, company, title: doc.title });

  const accent = hexToRgb(company?.brand_color);
  const accentText = accentInk(company?.brand_color);
  const tint = rgb(...[accent.red, accent.green, accent.blue].map((c) => 1 - (1 - c) * 0.07));
  const fingerprint = fingerprintOf({ reference: doc.reference, title: doc.title, blocks: doc.blocks, terms: doc.terms, signers });

  // ---- Header band (page 1)
  const top = s.y;
  let leftBottom;
  if (s.logoImg) {
    const { width, height } = s.logoImg.scaleToFit(160, 40);
    s.page.drawImage(s.logoImg, { x: s.x, y: top - height, width, height });
    leftBottom = top - height - 10;
  } else {
    s.page.drawText(s.fit(company?.company_name || 'Orb Security', s.bold, 14, s.w * 0.45), { x: s.x, y: top - 14, size: 14, font: s.bold, color: INK });
    leftBottom = top - 24;
  }
  const typeLabel = s.clean(doc.typeLabel).toUpperCase();
  s.page.drawText(typeLabel, { x: s.x + s.w - s.bold.widthOfTextAtSize(typeLabel, 8), y: top - 8, size: 8, font: s.bold, color: accentText });
  let tSize = 17;
  while (tSize > 12 && s.bold.widthOfTextAtSize(s.clean(doc.title), tSize) > s.w * 0.52) tSize -= 1;
  const titleLines = s.wrap([{ text: doc.title, bold: true }], tSize, s.w * 0.52, s.bold).slice(0, 2);
  let ty = top - 14;
  for (const l of titleLines) {
    const lw = l.reduce((a, p) => a + p.width, 0);
    let cx = s.x + s.w - lw;
    for (const p of l) { if (!p.space) s.page.drawText(p.text, { x: cx, y: ty - tSize, size: tSize, font: s.bold, color: INK }); cx += p.width; }
    ty -= tSize + 4;
  }
  const coLine = [company?.company_name, company?.company_address?.replace(/\s*\n\s*/g, ', '), company?.company_number && `Company no. ${company.company_number}`].filter(Boolean).join('  ·  ');
  s.y = Math.min(leftBottom, ty - 4);
  if (coLine) s.drawLines(s.wrap([{ text: coLine }], 8.5, s.w * 0.62), { x: s.x, size: 8.5, color: MUTED, lead: 12 });
  s.y -= 8;
  s.page.drawRectangle({ x: s.x, y: s.y - 2, width: s.w, height: 2, color: accent });
  s.y -= 18;

  // ---- Key facts strip
  const factsH = 66;
  s.page.drawRectangle({ x: s.x, y: s.y - factsH, width: s.w, height: factsH, color: SOFT });
  s.page.drawRectangle({ x: s.x, y: s.y - factsH, width: 3, height: factsH, color: accent });
  const facts = [['Reference', doc.reference || 'Assigned when sent'], ['Issued', doc.issuedAt ? fmtDate(doc.issuedAt) : fmtDate(new Date())], ['Version', doc.version ? `v${doc.version}` : '-']];
  const colW = (s.w - 16) / 3;
  facts.forEach(([k, v], i) => {
    const fx = s.x + 16 + i * colW;
    s.label(k, fx, s.y - 16);
    s.page.drawText(s.fit(v, s.bold, 10, colW - 10), { x: fx, y: s.y - 30, size: 10, font: s.bold, color: INK });
  });
  s.label('Between', s.x + 16, s.y - 46);
  const between = `${company?.company_name || 'The company'}  and  ${doc.partyLabel || doc.officerName || '-'}`;
  s.page.drawText(s.fit(between, s.font, 10, s.w - 80), { x: s.x + 70, y: s.y - 47, size: 10, font: s.font, color: INK });
  s.y -= factsH + 22;

  // ---- Pay-rise terms panel
  if (doc.terms) {
    const t = doc.terms;
    const rows = Math.max(t.left.length, t.right.length);
    const h = 18 + rows * 28;
    s.ensure(h + 10);
    s.page.drawRectangle({ x: s.x, y: s.y - h, width: s.w, height: h, borderColor: LINE, borderWidth: 1, color: rgb(1, 1, 1) });
    const col = (pairs, x) => pairs.forEach(([k, v, strong], i) => {
      const yy = s.y - 18 - i * 28;
      s.label(k, x, yy);
      s.page.drawText(s.fit(v || '-', strong ? s.bold : s.font, strong ? 12 : 10, s.w / 2 - 30), { x, y: yy - 14, size: strong ? 12 : 10, font: strong ? s.bold : s.font, color: strong ? accentText : INK });
    });
    col(t.left, s.x + 14);
    col(t.right, s.x + s.w / 2 + 6);
    s.y -= h + 16;
    if (t.conditions?.length) {
      s.ensure(40);
      s.label('Conditions', s.x, s.y - 7);
      s.y -= 18;
      for (const g of t.conditions) {
        s.ensure(18);
        const met = g.status === 'met';
        s.page.drawRectangle({ x: s.x, y: s.y - 9, width: 8, height: 8, borderColor: met ? accent : MUTED, borderWidth: 0.8, color: met ? accent : undefined });
        if (met) {
          s.page.drawLine({ start: { x: s.x + 1.6, y: s.y - 5 }, end: { x: s.x + 3.4, y: s.y - 7.2 }, thickness: 1.1, color: rgb(1, 1, 1) });
          s.page.drawLine({ start: { x: s.x + 3.4, y: s.y - 7.2 }, end: { x: s.x + 6.6, y: s.y - 2.6 }, thickness: 1.1, color: rgb(1, 1, 1) });
        }
        s.page.drawText(s.fit(`${g.title}  (${g.status})`, s.font, 10, s.w - 20), { x: s.x + 16, y: s.y - 9, size: 10, font: s.font, color: INK });
        s.y -= 17;
      }
      s.y -= 8;
    }
  }

  // ---- Body
  const SIZE = 10.5;
  const LEAD = SIZE * 1.45;
  const blocks = doc.blocks || [];
  blocks.forEach((b, i) => {
    if (b.type === 'break') { s.addPage(); return; }
    if (b.type === 'heading') {
      s.y -= 6;
      // Keep the heading with at least two lines of what follows
      s.ensure(16 + LEAD * 2);
      // Schedules and appendices are unnumbered
      const ind = b.number ? 28 : 0;
      if (b.number) s.page.drawText(`${b.number}.`, { x: s.x, y: s.y - 11.5, size: 11.5, font: s.bold, color: accentText });
      const lines = s.wrap(b.runs.map((r) => ({ ...r, bold: true })), 11.5, s.w - ind, s.bold);
      s.drawLines(lines, { x: s.x + ind, size: 11.5, lead: 16 });
      s.y -= 4;
      return;
    }
    if (b.type === 'clause') {
      const indent = b.number.includes('.') ? 28 : 22;
      const lines = s.wrap(b.runs, SIZE, s.w - indent);
      s.ensure(LEAD * Math.min(2, lines.length));
      s.page.drawText(s.clean(b.number.includes('.') ? b.number : `${b.number}.`), { x: s.x, y: s.y - SIZE, size: SIZE, font: s.bold, color: b.number.includes('.') ? MUTED : accentText });
      s.drawLines(lines, { x: s.x + indent, size: SIZE, lead: LEAD });
      s.y -= 6;
      return;
    }
    if (b.type === 'bullet') {
      const lines = s.wrap(b.runs, SIZE, s.w - 46);
      s.ensure(LEAD);
      s.page.drawCircle({ x: s.x + 34, y: s.y - SIZE * 0.62, size: 1.6, color: INK });
      s.drawLines(lines, { x: s.x + 46, size: SIZE, lead: LEAD });
      if (blocks[i + 1]?.type !== 'bullet') s.y -= 6;
      return;
    }
    s.drawLines(s.wrap(b.runs, SIZE, s.w), { x: s.x, size: SIZE, lead: LEAD });
    s.y -= 7;
  });

  // ---- Signatures (kept together on one page)
  const ackH = doc.ackLine ? 34 : 0;
  s.y -= 10;
  s.ensure(ackH + 170);
  if (doc.ackLine) {
    s.page.drawRectangle({ x: s.x, y: s.y - 24, width: s.w, height: 24, color: tint });
    s.page.drawText(s.fit(doc.ackLine, s.bold, 10, s.w - 24), { x: s.x + 12, y: s.y - 15.5, size: 10, font: s.bold, color: INK });
    s.y -= ackH;
  }
  const boxW = (s.w - 16) / 2;
  const boxH = 150;
  const box = async (x, heading, signer, fallbackName) => {
    const y0 = s.y;
    s.page.drawRectangle({ x, y: y0 - boxH, width: boxW, height: boxH, borderColor: LINE, borderWidth: 1 });
    s.page.drawRectangle({ x, y: y0 - 22, width: boxW, height: 22, color: SOFT });
    s.label(s.fit(heading.toUpperCase(), s.bold, 7, boxW - 24), x + 12, y0 - 14.5, INK);
    const lineY = y0 - 100;
    if (signer?.png) {
      try {
        const img = await s.pdf.embedPng(Buffer.from(String(signer.png).split(',')[1], 'base64'));
        const { width, height } = img.scaleToFit(boxW - 40, 62);
        s.page.drawImage(img, { x: x + 14, y: lineY + 4, width, height });
      } catch (e) { console.warn('[signdoc] signature not embedded:', e.message); }
    } else {
      s.page.drawText('Awaiting signature', { x: x + 14, y: lineY + 22, size: 10, font: s.italic, color: MUTED });
    }
    s.page.drawLine({ start: { x: x + 12, y: lineY }, end: { x: x + boxW - 12, y: lineY }, thickness: 0.8, color: INK });
    const name = signer?.name || fallbackName || '';
    s.page.drawText(s.fit(signer?.title ? `${name}, ${signer.title}` : name, s.bold, 10, boxW - 24), { x: x + 12, y: lineY - 16, size: 10, font: s.bold, color: INK });
    s.page.drawText(signer?.at ? `${fmtDateTime(signer.at)} UK time` : 'Date: ____________', { x: x + 12, y: lineY - 31, size: 8.5, font: s.font, color: MUTED });
  };
  await box(s.x, 'Signed for the company', signers.company, company?.company_name);
  await box(s.x + boxW + 16, doc.partyLabel ? `Signed for ${doc.partyLabel}` : doc.kind === 'policy' ? 'Acknowledged by the officer' : 'Signed by the officer', signers.officer, doc.officerName);
  s.y -= boxH + 10;

  // ---- Signing certificate (always the last page)
  s.certificate = true;
  s.addPage();
  const cp = s.page;
  cp.drawText('Signing certificate', { x: s.x, y: s.y - 20, size: 20, font: s.bold, color: INK });
  const stateWord = { preview: 'Preview', proof: 'Preview', draft: 'Draft', sent: 'Awaiting signature', signed: 'Completed', void: 'Void', superseded: 'Superseded' }[status];
  cp.drawText(s.clean(`${doc.reference || 'No reference yet'}  ·  Status: ${stateWord}`), { x: s.x, y: s.y - 38, size: 10, font: s.font, color: MUTED });
  if (verifyUrl) {
    const qr = await s.pdf.embedPng(await qrPng(verifyUrl, 300));
    cp.drawImage(qr, { x: s.x + s.w - 84, y: s.y - 84, width: 84, height: 84 });
    const cap = 'Scan or visit to check this document';
    cp.drawText(cap, { x: s.x + s.w - 84 - 12 - s.font.widthOfTextAtSize(cap, 7.5), y: s.y - 60, size: 7.5, font: s.font, color: MUTED });
    const u = s.fit(verifyUrl.replace(/^https?:\/\//, ''), s.font, 7.5, 260);
    cp.drawText(u, { x: s.x + s.w - 84 - 12 - s.font.widthOfTextAtSize(u, 7.5), y: s.y - 71, size: 7.5, font: s.font, color: accentText });
  }
  s.y -= 104;
  cp.drawRectangle({ x: s.x, y: s.y, width: s.w, height: 2, color: accent });
  s.y -= 22;

  const fact = (k, v, x, w) => {
    s.label(k, x, s.y);
    const lines = s.wrap([{ text: v }], 9.5, w);
    const y0 = s.y;
    s.y -= 13;
    s.drawLines(lines, { x, size: 9.5, lead: 13 });
    const used = y0 - s.y;
    s.y = y0;
    return used;
  };
  const fp = fingerprint.toUpperCase().match(/.{4}/g).join(' ');
  const pages = s.pdf.getPageCount();
  const used = Math.max(
    fact('Document fingerprint (SHA-256)', fp, s.x, s.w * 0.58),
    fact('Document', `${doc.title}${doc.version ? ` · version ${doc.version}` : ''} · ${pages + (doc.attachment?.pages || 0)} pages`, s.x + s.w * 0.64, s.w * 0.36),
  );
  s.y -= used + 30;

  const heading = (t) => { s.ensure(40); s.label(t, s.x, s.y, accentText, 8.5); s.y -= 8; s.page.drawLine({ start: { x: s.x, y: s.y }, end: { x: s.x + s.w, y: s.y }, thickness: 0.5, color: LINE }); s.y -= 16; };

  heading('Signers');
  const signerRow = (name, role, contact, when, detail) => {
    s.ensure(34);
    s.page.drawText(s.fit(name || '-', s.bold, 10, 150), { x: s.x, y: s.y - 10, size: 10, font: s.bold, color: INK });
    s.page.drawText(s.fit(role, s.font, 8.5, 150), { x: s.x, y: s.y - 23, size: 8.5, font: s.font, color: MUTED });
    s.page.drawText(s.fit(contact || '', s.font, 9, 140), { x: s.x + 165, y: s.y - 10, size: 9, font: s.font, color: INK });
    s.page.drawText(s.fit(when, s.font, 9, 175), { x: s.x + s.w - 175, y: s.y - 10, size: 9, font: s.font, color: INK });
    if (detail) s.page.drawText(s.fit(detail, s.font, 8.5, 175), { x: s.x + s.w - 175, y: s.y - 23, size: 8.5, font: s.font, color: MUTED });
    s.y -= 36;
  };
  const co = signers.company;
  signerRow(co?.name || 'Not set', co?.title || 'Company signatory', `For ${company?.company_name || 'the company'}`, co?.at ? `Applied ${fmtDateTime(co.at)}` : doc.legacy ? 'Signed before company signatures' : 'Applied when sent', 'Saved signature');
  const of = signers.officer;
  signerRow(of?.name || doc.officerName, doc.partyRole || (doc.partyLabel ? `For ${doc.partyLabel}` : doc.kind === 'policy' ? 'Officer · acknowledges' : 'Officer'), of?.email || '', of?.at ? `Signed ${fmtDateTime(of.at)}` : 'Not signed yet', of?.at ? [of.ip && `IP ${of.ip}`, device(of.ua)].filter(Boolean).join(' · ') : '');

  s.y -= 18;
  heading('Timeline (UK time)');
  const officerName = doc.officerName || 'the officer';
  const say = (e) => {
    const who = e.actor_name || '';
    return {
      sent: `Sent${who ? ` by ${who}` : ''}`,
      emailed: `Email sent to ${officerName}`,
      opened: `Opened by ${who || officerName}`,
      signed: `Signed by ${who || officerName}`,
      sealed: 'Document completed and sealed',
      reminded: `Reminder sent to ${officerName}`,
      voided: `Voided${who ? ` by ${who}` : ''}`,
      superseded: 'Replaced by a newer version',
      link: `Signing link emailed${who ? ` to ${who}` : ''}`,
      filed: 'Filed as signed on paper',
    }[e.kind] || e.kind;
  };
  const timeline = [...events];
  if (status === 'signed' && !timeline.some((e) => e.kind === 'sealed')) timeline.push({ kind: 'sealed', at: of?.at || new Date() });
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));
  for (const e of timeline) {
    s.ensure(20);
    s.page.drawText(fmtDateTime(e.at), { x: s.x, y: s.y - 9.5, size: 9, font: s.font, color: MUTED });
    s.page.drawCircle({ x: s.x + 118, y: s.y - 6.5, size: 2.4, color: e.kind === 'signed' || e.kind === 'sealed' ? accent : MUTED });
    const detail = [e.ip && `IP ${e.ip}`, e.ua && device(e.ua)].filter(Boolean).join(' · ');
    s.page.drawText(s.fit(say(e), s.font, 9.5, detail ? 200 : s.w - 130), { x: s.x + 130, y: s.y - 9.5, size: 9.5, font: s.font, color: INK });
    if (detail) s.page.drawText(s.fit(detail, s.font, 8.5, 150), { x: s.x + s.w - s.font.widthOfTextAtSize(s.fit(detail, s.font, 8.5, 150), 8.5), y: s.y - 9.5, size: 8.5, font: s.font, color: MUTED });
    s.y -= 19;
  }
  if (!timeline.length) { s.page.drawText('Nothing recorded yet.', { x: s.x, y: s.y - 9.5, size: 9.5, font: s.italic, color: MUTED }); s.y -= 19; }

  s.y -= 14;
  const notes = [
    doc.legacy && 'This document was signed before signing certificates were introduced, so earlier views and a company signature were not recorded.',
    'Each signer agreed to sign electronically. Their typed name, drawn signature, time, IP address and device were recorded at signing.',
    verifyUrl && 'The fingerprint above identifies the signed content. Anyone can check this copy is genuine at the address next to the QR code.',
  ].filter(Boolean);
  for (const n of notes) s.drawLines(s.wrap([{ text: n }], 8.5, s.w), { x: s.x, size: 8.5, color: MUTED, lead: 12 });

  // ---- Every page: watermark and running footer
  const all = s.pdf.getPages();
  const mark = WATERMARK[status];
  const word = STATUS_WORD[status] || '';
  all.forEach((p, i) => {
    if (mark) {
      const size = mark.length > 24 ? 40 : mark.length > 16 ? 50 : 72;
      const tw = s.bold.widthOfTextAtSize(mark, size);
      const a = Math.PI / 4;
      const cx = PAGE_W / 2;
      const cy = PAGE_H / 2;
      p.drawText(mark, {
        x: cx - (tw / 2) * Math.cos(a) + (size / 3) * Math.sin(a), y: cy - (tw / 2) * Math.sin(a) - (size / 3) * Math.cos(a),
        size, font: s.bold, color: status === 'void' ? rgb(0.86, 0.15, 0.15) : MUTED, opacity: status === 'void' ? 0.14 : 0.09, rotate: degrees(45),
      });
    }
    p.drawLine({ start: { x: M, y: 44 }, end: { x: PAGE_W - M, y: 44 }, thickness: 0.5, color: LINE });
    const left = `${doc.reference ? `Ref ${doc.reference}  ·  ` : ''}`;
    p.drawText(s.clean(left), { x: M, y: 31, size: 7.5, font: s.font, color: MUTED });
    p.drawText(word, { x: M + s.font.widthOfTextAtSize(s.clean(left), 7.5), y: 31, size: 7.5, font: s.bold, color: status === 'signed' ? accentText : status === 'void' ? rgb(0.75, 0.1, 0.1) : MUTED });
    // An uploaded document's own pages come first, so these pages continue its numbering
    const off = doc.attachment?.pages || 0;
    const pg = `Page ${off + i + 1} of ${off + all.length}`;
    p.drawText(pg, { x: PAGE_W - M - s.font.widthOfTextAtSize(pg, 7.5), y: 31, size: 7.5, font: s.font, color: MUTED });
  });

  s.pdf.setSubject(`${doc.typeLabel} ${doc.reference || ''}`.trim());
  s.pdf.setKeywords([doc.reference || '', `fingerprint:${fingerprint}`]);
  await s.credit();
  const bytes = await s.pdf.save({ useObjectStreams: false });
  return { bytes: Buffer.from(bytes), fingerprint };
}
