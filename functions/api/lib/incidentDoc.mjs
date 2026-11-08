// The incident report PDF: the report with its photos placed under their sections, the three signature boxes
// (officer, manager, venue), a signing certificate as the last page and a watermark until everyone has signed.
import { degrees, rgb } from 'pdf-lib';
import { Doc, INK, MUTED, LINE, SOFT, qrPng } from './pdf.mjs';
import { device } from './signdoc.mjs';
import { fmtDateTime } from './time.mjs';
import { getObjectBytes } from './storage.mjs';
import { fingerprintOf } from './incidentSign.mjs';

const ROLES = [['officer', 'Officer', 'Reported and signed by'], ['manager', 'Manager', 'Reviewed and approved by'], ['venue', 'Venue', 'Received and read by']];
const WATERMARK = { manager: 'AWAITING MANAGER SIGNATURE', officer: 'AWAITING OFFICER SIGNATURE', venue: 'AWAITING VENUE SIGNATURE' };
const SECTIONS = [['what', 'What happened', 'description'], ['people', 'People involved', 'people_involved'], ['injuries', 'Injuries', 'injuries'], ['actions', 'Actions taken', 'actions_taken']];
const yn = (v, ref) => (v ? `Yes${ref ? ` (ref ${ref})` : ''}` : 'No');

async function photo(d, a, loadBytes) {
  try {
    const bytes = await loadBytes(a.s3_key);
    const img = a.mime === 'image/png' ? await d.pdf.embedPng(bytes) : await d.pdf.embedJpg(bytes);
    const { width, height } = img.scaleToFit(250, 220);
    d.ensure(height + 22);
    d.page.drawImage(img, { x: d.x, y: d.y - height, width, height });
    d.y -= height + 4;
    if (a.caption) d.text(a.caption, { size: 8.5, color: MUTED, maxWidth: 250 });
    d.space(6);
  } catch { /* unreadable image: listed with the other files instead */ }
}

/**
 * inc: the loaded report (loadFull) with signatures; role: who is reading (venue users never see witness contacts).
 * status: 'live' (watermarked by stage) or 'signed'. Returns { bytes, fingerprint }.
 */
export async function renderIncident(inc, { company, signatures = [], status = 'live', verifyUrl = '', role = 'company', loadBytes = getObjectBytes } = {}) {
  const live = signatures.filter((s) => !s.void_at);
  const fingerprint = fingerprintOf(inc, live);
  const d = await Doc.create(`Incident ${inc.ref}`, { unicode: true });
  await d.header(company, 'Incident report', `${inc.reference || inc.ref} · v${inc.version}`);
  if (inc.title) d.text(inc.title, { size: 14, font: d.bold, gap: 8 });
  d.meta(
    [['Venue', inc.venue_name], ['Type', String(inc.type || '').replace(/_/g, ' ')], ['Severity', String(inc.severity || '').toUpperCase()], ['Location', inc.location || '-']],
    [['Occurred', fmtDateTime(inc.occurred_at)], ['Reported', fmtDateTime(inc.created_at || new Date())], ['Officer', inc.officer_name || '-'], ['Reference', inc.ref]],
  );

  const images = (inc.attachments || []).filter((a) => a.mime === 'image/png' || a.mime === 'image/jpeg');
  const placed = new Set();
  for (const [key, title, field] of SECTIONS) {
    const pics = images.filter((a) => a.section === key);
    if (!inc[field] && !pics.length) continue;
    d.section(title);
    if (inc[field]) { d.text(inc[field], { size: 10 }); d.space(4); }
    for (const a of pics) { await photo(d, a, loadBytes); placed.add(a.id); }
  }
  d.section('Emergency services & force');
  d.table([{ label: 'Item', width: 0.4 }, { label: 'Detail', width: 0.6 }], [
    ['Police called', yn(inc.police_called, inc.police_ref)],
    ['Ambulance called', yn(inc.ambulance_called, inc.ambulance_ref)],
    ['Force used', inc.force_used ? 'Yes' : 'No'],
  ]);
  if (inc.force_used && inc.force_justification) { d.section('Why force was necessary'); d.text(inc.force_justification, { size: 10 }); }
  if (inc.witnesses?.length) {
    d.section('Witnesses');
    d.table([{ label: 'Name', width: 0.25 }, { label: 'Contact', width: 0.25 }, { label: 'Statement', width: 0.5 }],
      inc.witnesses.map((w) => [w.name, role === 'venue' ? '-' : w.contact, w.statement]));
  }
  const rest = images.filter((a) => !placed.has(a.id)).slice(0, 8);
  if (rest.length) {
    d.section('Photos');
    for (const a of rest) await photo(d, a, loadBytes);
  }
  const others = (inc.attachments || []).filter((a) => !images.includes(a));
  if (others.length) {
    d.section('Other attachments');
    d.text(others.map((a) => `• ${a.name || 'file'}`).join('\n'), { size: 10 });
  }
  if (inc.manager_statement) { d.section("Manager's statement"); d.text(inc.manager_statement, { size: 10 }); }
  if (inc.venue_comment) { d.section("Venue's comment"); d.text(inc.venue_comment, { size: 10 }); }

  // ---- Signature boxes
  d.section('Signatures');
  const boxH = 108;
  d.ensure(boxH + 10);
  const gap = 10;
  const bw = (d.w - gap * 2) / 3;
  const top = d.y;
  for (const [i, [r, label, line]] of ROLES.entries()) {
    const s = live.find((x) => x.role === r);
    const x = d.x + i * (bw + gap);
    d.page.drawRectangle({ x, y: top - boxH, width: bw, height: boxH, color: s ? rgb(1, 1, 1) : SOFT, borderColor: LINE, borderWidth: 1 });
    d.page.drawText(label.toUpperCase(), { x: x + 8, y: top - 14, size: 7, font: d.bold, color: MUTED });
    if (s) {
      try {
        const img = await d.pdf.embedPng(Buffer.from(String(s.png).split(',').pop(), 'base64'));
        const { width, height } = img.scaleToFit(bw - 16, 44);
        d.page.drawImage(img, { x: x + 8, y: top - 22 - height, width, height });
      } catch { /* a broken image still leaves the name and time */ }
      d.page.drawLine({ start: { x: x + 8, y: top - 70 }, end: { x: x + bw - 8, y: top - 70 }, thickness: 0.6, color: LINE });
      d.page.drawText(d.clean(s.name).slice(0, 40), { x: x + 8, y: top - 82, size: 9, font: d.bold, color: INK });
      d.page.drawText(d.clean(`${line} · ${fmtDateTime(s.at)}`).slice(0, 60), { x: x + 8, y: top - 94, size: 6.5, font: d.font, color: MUTED });
    } else {
      d.page.drawText('Not signed yet', { x: x + 8, y: top - 56, size: 9, font: d.italic, color: MUTED });
    }
  }
  d.y = top - boxH - 10;

  // ---- Certificate
  if (live.length) {
    d.addPage();
    d.text('Signing certificate', { size: 16, font: d.bold, gap: 10 });
    d.meta(
      [['Reference', inc.reference || inc.ref], ['Report', `${inc.ref} · version ${inc.version}`]],
      [['Status', status === 'signed' ? 'Signed by everyone' : 'In progress'], ['Fingerprint (SHA-256)', `${fingerprint.slice(0, 32)}\n${fingerprint.slice(32)}`]],
    );
    d.section('Signers');
    d.table([{ label: 'Role', width: 0.14 }, { label: 'Name', width: 0.26 }, { label: 'Signed', width: 0.24 }, { label: 'Device', width: 0.2 }, { label: 'IP', width: 0.16 }],
      live.map((s) => [ROLES.find((r) => r[0] === s.role)?.[1] || s.role, s.name, fmtDateTime(s.at), device(s.ua), s.ip || '-']));
    const voided = signatures.filter((s) => s.void_at);
    if (voided.length) {
      d.section('Earlier signatures (the report changed after these)');
      d.table([{ label: 'Role', width: 0.2 }, { label: 'Name', width: 0.3 }, { label: 'Signed', width: 0.25 }, { label: 'Replaced', width: 0.25 }],
        voided.map((s) => [s.role, s.name, fmtDateTime(s.at), fmtDateTime(s.void_at)]));
    }
    if (verifyUrl) {
      d.section('Check this document');
      d.text(`Scan the code or open ${verifyUrl} to confirm this report is genuine and unchanged.`, { size: 9, color: MUTED });
      await d.image(await qrPng(verifyUrl, 300), { width: 90 });
    }
  }

  if (status !== 'signed' && WATERMARK[inc.sign_stage]) {
    for (const p of d.pdf.getPages()) {
      p.drawText(WATERMARK[inc.sign_stage], { x: 110, y: 260, size: 30, font: d.bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.12, rotate: degrees(40) });
    }
  }
  d.footer(`${company?.company_name || ''} · ${inc.ref} · version ${inc.version} · ${status === 'signed' ? 'signed' : `generated ${fmtDateTime(new Date())}`}`);
  await d.credit();
  return { bytes: await d.pdf.save(), fingerprint };
}
