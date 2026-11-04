// Signed documents, shared parts: a manager's saved signature, the live template preview, reminders and the public check page
import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { getSettings } from './settings.mjs';
import { PLACEHOLDERS, PLACEHOLDER_KEYS, SAMPLE_VALUES, fill, parse, unknownPlaceholders, usedPlaceholders } from '../lib/docmarkup.mjs';
import { renderSigned } from '../lib/signdoc.mjs';
import { remind, companySigner, TABLE } from '../lib/esign.mjs';
import { fmtDate } from '../lib/time.mjs';
import { CO, def, pub } from './_def.mjs';

export const CATEGORIES = ['contract', 'policy', 'pay_rise'];
export const TYPE_LABEL = { contract: 'Contract', policy: 'Policy', pay_rise: 'Pay rise agreement', venue_pack: 'Venue pack' };
const ACK = { policy: 'I have read and understood this policy and agree to follow it.' };
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

const oneLine = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean).join(', ');

/** Placeholder values known for an officer; the rest come from the send sheet. */
export function officerValues(s, o, signer) {
  return {
    company: s.company_name, company_address: oneLine(s.company_address),
    officer: `${o.first_name} ${o.last_name}`.trim(), officer_address: [oneLine(o.address), o.postcode].filter(Boolean).join(', '),
    utr: o.utr || '', start_date: o.start_date ? fmtDate(o.start_date) : '', today: fmtDate(new Date()),
    signatory: signer?.name || '', signatory_title: signer?.title || '',
  };
}

/** Values typed in the send sheet: known keys only, trimmed. */
export const typedValues = (v) => Object.fromEntries(Object.entries(v || {})
  .filter(([k, x]) => PLACEHOLDER_KEYS.includes(k) && x != null && String(x).trim() !== '')
  .map(([k, x]) => [k, String(x).trim().slice(0, 200)]));

export const companyOf = (c) => (c.company_signature
  ? { name: c.company_name_signed, title: c.company_title_signed, png: c.company_signature, at: c.company_signed_at } : null);

/** What renderSigned needs for a contract or policy row. */
/** The page signed under an uploaded PDF: it names the file it belongs to, and its hash goes into the fingerprint */
export const uploadSignaturePage = (c) => [
  '#! Signature page',
  `This signature page forms part of "${c.title}", the ${c.upload_pages}-page document in front of it${c.reference ? ` (reference ${c.reference})` : ''}. Those pages are exactly the file uploaded by the Company; only the reference and page numbers in the margin were added.`,
  `SHA-256 fingerprint of the uploaded file: ${c.upload_sha256}`,
  'By signing below, both parties agree to that document. Nothing on this page changes its terms.',
].join('\n\n');

/** What renderSigned needs for a contract or policy row. */
export async function contractInput(c, s = null) {
  const [settings, o, g, used] = await Promise.all([
    s || getSettings(),
    c.officer_id && one('SELECT first_name, last_name, email FROM officers WHERE id = $1', [c.officer_id]),
    c.organisation_id && one('SELECT name, signatory_name, signatory_email FROM organisations WHERE id = $1', [c.organisation_id]),
    // Signed by link: the address the link went to is the one that signed
    c.signed_at && c.signer_kind === 'outside' && one('SELECT email FROM sign_links WHERE contract_id = $1 AND used_at IS NOT NULL ORDER BY used_at DESC LIMIT 1', [c.id]),
  ]);
  const category = c.category || 'contract';
  const pdf = c.source === 'upload' && c.upload_key;
  return {
    company: settings,
    doc: {
      kind: category, typeLabel: TYPE_LABEL[category], title: c.title, reference: c.reference, issuedAt: c.sent_at || c.created_at,
      version: c.template_version, officerName: o ? `${o.first_name} ${o.last_name}` : g?.signatory_name || g?.name,
      blocks: parse(pdf ? uploadSignaturePage(c) : c.body), ackLine: ACK[category],
      ...(g ? { partyLabel: g.name } : {}),
      ...(pdf ? { attachment: { title: c.title, pages: c.upload_pages } } : {}),
    },
    signers: {
      company: companyOf(c),
      officer: c.signed_at ? { name: c.signed_name, png: c.signature, at: c.signed_at, email: used?.email || o?.email || g?.signatory_email, ip: c.signed_ip, ua: c.signed_ua } : null,
    },
    ...(pdf ? { upload: { key: c.upload_key } } : {}),
  };
}

// Initial of the surname only: the public check page confirms a document without naming people in full
const shortName = (n) => {
  const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || '';
};

export const actions = {
  'esign.mySignature.get': def(CO, async (_b, { user }) => ({
    signature: await one('SELECT name, title, png, updated_at FROM user_signatures WHERE user_id = $1', [user.id]),
  })),

  'esign.mySignature.save': def(CO, async (b, { user }) => {
    required(b, 'name', 'png');
    if (!PNG.test(b.png) || b.png.length > 300000) fail(400, 'Draw your signature again');
    const name = String(b.name).trim().slice(0, 120);
    const title = String(b.title || '').trim().slice(0, 120);
    if (!name) fail(400, 'Enter your name');
    const sig = await one(
      `INSERT INTO user_signatures (user_id, name, title, png) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET name = $2, title = $3, png = $4, updated_at = now() RETURNING name, title, png, updated_at`,
      [user.id, name, title, b.png]);
    await audit(user, 'esign.signature.save', 'user', user.id, { name, title, summary: 'Saved company signature updated' });
    return { signature: sig };
  }),

  'esign.mySignature.remove': def(CO, async (_b, { user }) => {
    await q('DELETE FROM user_signatures WHERE user_id = $1', [user.id]);
    await q('UPDATE settings SET default_signatory_id = NULL WHERE default_signatory_id = $1', [user.id]);
    await audit(user, 'esign.signature.remove', 'user', user.id, { summary: 'Saved company signature removed' });
    return { ok: true };
  }),

  // Managers who can countersign, and who signs when nobody is picked
  'esign.signatories': def(CO, async () => {
    const [rows, s] = await Promise.all([
      q(`SELECT u.id, u.name AS user_name, s.name, s.title, s.png, s.updated_at FROM users u JOIN user_signatures s ON s.user_id = u.id
          WHERE u.role = 'company' AND u.status = 'active' ORDER BY s.name`),
      one('SELECT default_signatory_id FROM settings WHERE id = 1'),
    ]);
    const def0 = rows.some((r) => r.id === s.default_signatory_id) ? s.default_signatory_id : null;
    return { signatories: rows, default_signatory_id: def0 };
  }),

  'esign.placeholders': def(CO, async () => PLACEHOLDERS),

  // Live preview while editing a template or sending: sample data unless an officer is chosen
  'esign.preview': def(CO, async (b, { user }) => {
    const category = CATEGORIES.includes(b.category) ? b.category : 'contract';
    const body = String(b.body || '').slice(0, 100000);
    const s = await getSettings();
    const signer = await companySigner(b.signatory_id || null, user.id).catch(() => null);
    let values;
    if (b.officer_id) {
      const o = need(await one('SELECT * FROM officers WHERE id = $1', [b.officer_id]), 'Officer not found');
      values = { ...officerValues(s, o, signer), ...typedValues(b.values) };
    } else {
      values = {
        ...SAMPLE_VALUES, company: s.company_name, company_address: oneLine(s.company_address) || SAMPLE_VALUES.company_address,
        today: fmtDate(new Date()), ...(signer ? { signatory: signer.name, signatory_title: signer.title } : {}), ...typedValues(b.values),
      };
    }
    const unknown = unknownPlaceholders(body);
    const missing = usedPlaceholders(body).filter((k) => k !== 'conditions' && !values[k]);
    const blocks = parse(fill(body, values));
    if (b.blocks_only) return { blocks, unknown, missing, values };
    const terms = category === 'pay_rise' ? {
      left: [['Role', values.role], ['Venue', values.venue], ['Starts', values.start_date]],
      right: [['Current rate', values.current_rate ? `${values.current_rate}/h` : '-'], ['New rate', values.rate ? `${values.rate}/h` : '-', true]],
      conditions: [],
    } : null;
    const { bytes } = await renderSigned({
      company: s,
      doc: {
        kind: category, typeLabel: TYPE_LABEL[category], title: String(b.title || 'Untitled document').slice(0, 200), reference: 'PREVIEW',
        issuedAt: new Date(), version: b.version || null, officerName: values.officer || 'Officer', blocks, terms, ackLine: ACK[category],
      },
      signers: { company: signer ? { name: signer.name, title: signer.title, png: signer.png, at: new Date() } : null, officer: null },
      events: [], status: 'preview', verifyUrl: '',
    });
    return { pdf: Buffer.from(bytes).toString('base64'), blocks, unknown, missing, values };
  }),

  'esign.remind': def(CO, async (b, { user }) => {
    required(b, 'type', 'id');
    const table = TABLE[b.type] || fail(400, 'Unknown document type');
    const r = need(await one(`SELECT * FROM ${table} WHERE id = $1 AND status = 'sent'`, [b.id]), 'Only documents waiting for a signature can be chased');
    if (r.last_reminded_at && Date.now() - new Date(r.last_reminded_at) < 3600e3) fail(400, 'A reminder went out less than an hour ago');
    if (!(await remind(b.type, r, { user }))) fail(400, 'This officer has no login yet, so they cannot sign. Invite them first.');
    await audit(user, 'esign.remind', b.type, r.id, { reference: r.reference });
    return { ok: true };
  }),

  // Public: confirm a document is genuine. The PDF is hashed in the browser; no file and no wording leave the server.
  'esign.verify': pub(async (b) => {
    const ref = String(b.reference || '').trim().toUpperCase().slice(0, 40);
    if (!/^ORB-[CPRV]-\d{4}-\d{4,}$/.test(ref)) return { found: false };
    const [s, c, a, p] = await Promise.all([
      one('SELECT company_name FROM settings WHERE id = 1'),
      one(`SELECT c.reference, c.category, c.title, c.status, c.signed_name, c.signed_at, c.company_name_signed, c.fingerprint, c.pdf_sha256, c.sealed_at,
                  COALESCE(o.first_name || ' ' || o.last_name, g.signatory_name, g.name) AS officer_name, g.name AS party
             FROM contracts c LEFT JOIN officers o ON o.id = c.officer_id LEFT JOIN organisations g ON g.id = c.organisation_id WHERE c.reference = $1`, [ref]),
      one(`SELECT a.reference, 'pay_rise' AS category, 'Pay rise agreement' AS title, a.status, a.signed_name, a.signed_at, a.company_name_signed,
                  a.fingerprint, a.pdf_sha256, a.sealed_at, o.first_name || ' ' || o.last_name AS officer_name
             FROM pay_agreements a JOIN officers o ON o.id = a.officer_id WHERE a.reference = $1`, [ref]),
      one(`SELECT p.reference, 'venue_pack' AS category, 'Venue pack: ' || v.name AS title, p.status, p.signed_name, p.signed_at, NULL AS company_name_signed,
                  p.fingerprint, p.pdf_sha256, p.sealed_at, o.first_name || ' ' || o.last_name AS officer_name
             FROM pack_signings p JOIN officers o ON o.id = p.officer_id JOIN venues v ON v.id = p.venue_id WHERE p.reference = $1`, [ref]),
    ]);
    const d = c || a || p;
    if (!d) return { found: false };
    const status = d.status === 'applied' ? 'signed' : d.status;
    const sha = String(b.sha256 || '').toLowerCase();
    return {
      found: true, reference: d.reference, type: TYPE_LABEL[d.category] || 'Contract', title: d.title, status, company: s.company_name,
      officer: shortName(d.signed_name || d.officer_name), party: d.party || null, signatory: d.company_name_signed ? shortName(d.company_name_signed) : null,
      signed_at: d.signed_at, sealed: !!d.sealed_at, fingerprint: d.fingerprint,
      match: sha && d.pdf_sha256 ? sha === d.pdf_sha256 : null,
    };
  }),
};
