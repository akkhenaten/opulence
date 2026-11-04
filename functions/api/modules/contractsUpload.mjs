// Ready-made contracts: upload a PDF (kept exactly as it is, with a signature page added) or a Word file (converted to
// wording), optionally have the AI check it, then send it to sign, file a paper-signed copy, or keep it as a template.
import { one, tx, insert } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { getObjectBytes, headObject } from '../lib/storage.mjs';
import { archivePdf } from '../lib/archive.mjs';
import { nextReference, event, companySigner, signerColumns, uaOf, renderDoc } from '../lib/esign.mjs';
import { inspectPdf } from '../lib/uploadSeal.mjs';
import { docxToMarkup } from '../lib/docx.mjs';
import { parse } from '../lib/docmarkup.mjs';
import { extract, fileBlock, SONNET } from '../lib/ai.mjs';
import { contractInput } from './esign.mjs';
import { PACKS } from '../lib/contractContent.mjs';
import { deliver, recordEngagement, checkReachable } from './contractsPack.mjs';
import { tickOnboarding } from './hr.mjs';
import { CO, def } from './_def.mjs';

const MAX = 20 * 1024 * 1024;
const ENGAGEMENTS = ['employee', 'worker', 'self_employed', 'psc', 'agency_worker', 'labour_provider', 'subcontractor'];
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** The uploaded file, read back from storage: { kind: 'pdf', bytes, pages, sha256 } or { kind: 'word', body } */
async function readUpload(key) {
  if (!/^docs\/contracts\//.test(String(key || '')) || /\.\./.test(key)) fail(400, 'Upload the file first');
  const h = need(await headObject(key), 'Upload the file first');
  if (h.size > MAX) fail(400, 'The file must be under 20 MB');
  const bytes = await getObjectBytes(key);
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    try { return { kind: 'pdf', bytes, ...(await inspectPdf(bytes)) }; } catch (e) { fail(400, e.message); }
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let body;
    try { body = docxToMarkup(bytes); } catch (e) { fail(400, e.message); }
    if (!body.trim()) fail(400, 'That Word document has no text');
    return { kind: 'word', body: body.slice(0, 100000) };
  }
  fail(400, 'Upload a PDF or a Word (.docx) file');
}

async function partyFor(b) {
  if (b.officer_id) {
    const o = need(await one('SELECT id, first_name, last_name, email, user_id FROM officers WHERE id = $1', [b.officer_id]), 'Staff member not found');
    return { kind: 'officer', id: o.id, name: `${o.first_name} ${o.last_name}`.trim(), email: o.email, has_login: !!o.user_id };
  }
  if (b.organisation_id) {
    const g = need(await one('SELECT * FROM organisations WHERE id = $1', [b.organisation_id]), 'Business not found');
    return { kind: 'organisation', id: g.id, name: g.name, email: g.signatory_email, signatory: g.signatory_name };
  }
  fail(400, 'Pick who signs this');
}

const titleOf = (b) => {
  const t = String(b.title || '').trim().slice(0, 200);
  if (!t) fail(400, 'Give the document a title');
  return t;
};

/** The columns an uploaded contract row needs (shared by preview, send and template) */
function uploadColumns(up, b) {
  return up.kind === 'pdf'
    ? { body: '', upload_key: b.key, upload_sha256: up.sha256, upload_pages: up.pages }
    : { body: String(b.body ?? up.body).slice(0, 100000) };
}

function engagementOf(b) {
  return {
    engagement_type: ENGAGEMENTS.includes(b.engagement_type) ? b.engagement_type : null,
    start_date: isDate(b.start_date) ? b.start_date : null, end_date: isDate(b.end_date) ? b.end_date : null,
  };
}

// What the AI check returns: what the document seems to say, and what looks missing or risky. Never a legal opinion.
const CHECK_TOOL = {
  name: 'report',
  description: 'Report what this contract contains and what looks missing or needs a closer look',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Two or three plain sentences: what kind of agreement this is and between whom' },
      particulars: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] }, description: 'Key facts as written in the document (parties, start, pay, hours, notice, place). Only values actually written; never guess' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['blocker', 'review', 'note'] },
            section: { type: 'string', description: 'Which part of the document, or the required item that is missing' },
            text: { type: 'string', description: 'One or two plain sentences: what is wrong or missing and why it matters' },
          },
          required: ['severity', 'text'],
        },
      },
    },
    required: ['summary', 'particulars', 'findings'],
  },
};

function checklist(packId) {
  const p = PACKS[packId];
  if (!p) return 'No contract type chosen: check against what a UK written statement of particulars must contain for this kind of agreement.';
  const sections = (p.sections || []).map((s) => s.title).join('; ');
  const rules = (p.rules || []).map((r) => `- ${r.message}`).join('\n');
  return `Contract type: ${p.title}. Expected sections: ${sections}.\nKnown problems to look for:\n${rules}`;
}

const clean = (s, n) => String(s || '').trim().slice(0, n);
const cleanCheck = (x, packId) => (x ? {
  pack_id: PACKS[packId] ? packId : null, at: new Date().toISOString(),
  summary: clean(x.summary, 1000),
  particulars: (x.particulars || []).slice(0, 40).map((p) => ({ label: clean(p.label, 120), value: clean(p.value, 400) })).filter((p) => p.label && p.value),
  findings: (x.findings || []).slice(0, 40).map((f) => ({ severity: ['blocker', 'review', 'note'].includes(f.severity) ? f.severity : 'review', section: clean(f.section, 160), text: clean(f.text, 800) })).filter((f) => f.text),
} : null);

export const actions = {
  // After the browser uploads the file (files.uploadUrl purpose "contract"): what it is and how many pages
  'contracts.upload.prepare': def(CO, async (b) => {
    required(b, 'key');
    const up = await readUpload(b.key);
    return up.kind === 'pdf' ? { kind: 'pdf', key: b.key, pages: up.pages, sha256: up.sha256 } : { kind: 'word', key: b.key, body: up.body };
  }),

  // Optional: read the document against the chosen contract type and list what looks missing. Uses the Contracts AI cap.
  'contracts.upload.check': def(CO, async (b, { user }) => {
    required(b, 'key');
    const up = await readUpload(b.key);
    const content = up.kind === 'pdf' ? [fileBlock(up.bytes, 'application/pdf')] : [{ type: 'text', text: String(b.body ?? up.body).slice(0, 100000) }];
    const system = [
      'You check a ready-made UK contract for a UK security company before it is sent to sign. You are not a lawyer and this is not legal advice.',
      'Report what the document actually says. Never invent values: list a particular only when it is written in the document.',
      'Findings: blocker = something that would make the document wrong or unlawful to issue as it is; review = a missing item or a risky clause a manager should look at; note = for information.',
      'Use the jurisdiction the document names (England and Wales, Scotland or Northern Ireland). Plain English, short sentences.',
      checklist(b.pack_id),
    ].join('\n\n');
    const { input } = await extract({ model: SONNET, module: 'contracts', system, tool: CHECK_TOOL, max_tokens: 4096, messages: [{ role: 'user', content: [...content, { type: 'text', text: 'Check this contract and report.' }] }] });
    const out = cleanCheck(input, b.pack_id);
    if (!out) fail(502, 'The check did not finish. Try again.');
    await audit(user, 'contract.upload_check', 'contract', null, { pack: out.pack_id, findings: out.findings.length });
    return out;
  }),

  // Exactly what will be sent: the original pages stamped, then the signature page
  'contracts.upload.preview': def(CO, async (b) => {
    required(b, 'key');
    const up = await readUpload(b.key);
    const party = await partyFor(b);
    const row = { title: titleOf(b), source: 'upload', category: 'contract', reference: 'C-PREVIEW', officer_id: party.kind === 'officer' ? party.id : null, organisation_id: party.kind === 'organisation' ? party.id : null, sent_at: new Date(), ...uploadColumns(up, b) };
    const { bytes } = await renderDoc(await contractInput(row), 'sent', row.reference);
    return { pdf: Buffer.from(bytes).toString('base64') };
  }),

  'contracts.upload.send': def(CO, async (b, { user, ip, event: ev }) => {
    required(b, 'key');
    const up = await readUpload(b.key);
    const title = titleOf(b);
    const party = await partyFor(b);
    if (up.kind === 'word' && !parse(b.body ?? up.body).length) fail(400, 'The document has no wording');
    const signer = await companySigner(b.signatory_id || null, user.id);
    checkReachable(party, b);
    const c = await tx(async (t) => {
      const row = await insert('contracts', {
        officer_id: party.kind === 'officer' ? party.id : null, organisation_id: party.kind === 'organisation' ? party.id : null,
        category: 'contract', title, reference: await nextReference('contract', t), sent_at: new Date(), ...signerColumns(signer),
        source: 'upload', ...uploadColumns(up, b), ...engagementOf(b), ai_check: b.ai_check ? JSON.stringify(cleanCheck(b.ai_check, b.ai_check.pack_id)) : null,
        signer_kind: party.kind === 'officer' && party.has_login ? 'officer' : 'outside',
      }, t);
      if (b.save_template) {
        await insert('contract_templates', { title, category: 'contract', updated_by: user.id, ...uploadColumns(up, b) }, t);
      }
      return row;
    });
    await event('contract', c.id, 'sent', { user, ip, ua: uaOf(ev) });
    const delivered = await deliver(c, party, user, b);
    await audit(user, 'contract.send', 'contract', c.id, { source: 'upload', kind: up.kind, reference: c.reference, party: party.name, via: delivered.via, template: !!b.save_template });
    return { id: c.id, reference: c.reference, ...delivered };
  }),

  // Signed on paper: store the scan on the profile as the signed contract; nothing to sign in the app
  'contracts.upload.fileSigned': def(CO, async (b, { user }) => {
    required(b, 'key', 'signed_on');
    const up = await readUpload(b.key);
    if (up.kind !== 'pdf') fail(400, 'Upload the signed copy as a PDF scan');
    if (!isDate(b.signed_on) || b.signed_on > new Date().toISOString().slice(0, 10)) fail(400, 'Enter the date it was signed');
    const title = titleOf(b);
    const party = await partyFor(b);
    const signedName = clean(b.signed_name, 120) || party.signatory || party.name;
    const c = await tx(async (t) => insert('contracts', {
      officer_id: party.kind === 'officer' ? party.id : null, organisation_id: party.kind === 'organisation' ? party.id : null,
      category: 'contract', title, reference: await nextReference('contract', t), status: 'signed_paper', sent_at: new Date(`${b.signed_on}T12:00:00Z`),
      signed_at: new Date(`${b.signed_on}T12:00:00Z`), signed_name: signedName, source: 'paper', signer_kind: party.kind === 'officer' ? 'officer' : 'outside',
      ...uploadColumns(up, b), ...engagementOf(b), ai_check: b.ai_check ? JSON.stringify(cleanCheck(b.ai_check, b.ai_check.pack_id)) : null,
    }, t));
    const d = await archivePdf({
      ownerType: party.kind === 'officer' ? 'officer' : 'company', ownerId: party.kind === 'officer' ? party.id : null, kind: 'contract',
      filename: `${title} - ${party.name} - signed on paper.pdf`, bytes: up.bytes, number: c.reference, userId: user.id,
    });
    await one('UPDATE contracts SET pdf_document_id = $2, pdf_sha256 = $3 WHERE id = $1 RETURNING id', [c.id, d.id, up.sha256]);
    await event('contract', c.id, 'filed', { user });
    if (party.kind === 'officer') await tickOnboarding(party.id, 'contract');
    await recordEngagement(c);
    await audit(user, 'upload.file_signed', 'contract', c.id, { reference: c.reference, party: party.name, signed_on: b.signed_on });
    return { id: c.id, reference: c.reference };
  }),

  // Keep the upload as a template to send again later (Send a template)
  'contracts.upload.saveTemplate': def(CO, async (b, { user }) => {
    required(b, 'key');
    const up = await readUpload(b.key);
    const t = await insert('contract_templates', { title: titleOf(b), category: 'contract', updated_by: user.id, ...uploadColumns(up, b) });
    await audit(user, 'template.create', 'contract_template', t.id, { title: t.title, upload: up.kind });
    return t;
  }),
};
