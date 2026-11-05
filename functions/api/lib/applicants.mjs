// Online applications ("Join the team"): what a submitted application must contain, the AI read of the CV and SIA
// badge, and the flags a manager sees before inviting or rejecting.
import { one, q } from './db.mjs';
import { getObjectBytes, headObject } from './storage.mjs';
import { extract, fileBlock, canRead, HAIKU } from './ai.mjs';
import { docxToMarkup } from './docx.mjs';
import { SIA_TYPES, APPLY_ROLES } from './licences.mjs';
import { addDays } from './time.mjs';

export const AVAILABILITY = ['weekdays', 'weekends', 'nights', 'events'];
export const MAX_FILE = 10 * 1024 * 1024;
export const FILE_TYPES = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/(jpeg|png|webp|gif|heic|heif))$/;
const READ_LIMIT = 4.5 * 1024 * 1024;

const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
export const digits = (s) => String(s || '').replace(/\D/g, '');
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);

/** The cleaned application, or { error } with the first problem in plain words */
export function cleanApplication(b) {
  const a = {
    first_name: str(b.first_name, 80), last_name: str(b.last_name, 80), email: str(b.email, 200).toLowerCase(),
    phone: str(b.phone, 40), postcode: str(b.postcode, 12).toUpperCase(),
    sia_number: digits(b.sia_number),
    roles: [...new Set((Array.isArray(b.roles) ? b.roles : []).filter((r) => APPLY_ROLES.includes(r)))],
    availability: [...new Set((Array.isArray(b.availability) ? b.availability : []).filter((r) => AVAILABILITY.includes(r)))],
    availability_note: str(b.availability_note, 1000) || null,
    rtw: b.rtw === true, consent: b.consent === true,
    cv_key: str(b.cv_key, 300) || null, sia_front_key: str(b.sia_front_key, 300) || null, sia_back_key: str(b.sia_back_key, 300) || null,
  };
  if (!a.first_name || !a.last_name) return { error: 'Please add your first and last name' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) return { error: 'Please check your email address' };
  if (digits(a.phone).length < 10) return { error: 'Please check your phone number' };
  if (!/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(a.postcode)) return { error: 'Please check your postcode' };
  if (!a.roles.length) return { error: 'Pick at least one role' };
  if (a.sia_number && a.sia_number.length !== 16) return { error: 'An SIA licence number has 16 digits' };
  if (!a.cv_key) return { error: 'Please upload your CV' };
  if (needsBadge(a.roles) && !a.sia_front_key) return { error: 'Please upload a photo of your SIA badge' };
  if (!a.rtw) return { error: 'Please confirm you have the right to work in the UK' };
  if (!a.consent) return { error: 'Please agree to the privacy notice' };
  return a;
}

/** Stewards don't need an SIA licence; every other role does */
export const needsBadge = (roles) => roles.some((r) => r !== 'steward');

/** Same first and last name tokens, ignoring case, accents, punctuation and middle names */
export function sameName(applicant, printed) {
  const p = words(printed);
  if (!p.length) return true;
  const first = words(applicant.first_name)[0];
  const last = words(applicant.last_name).at(-1);
  return p.includes(first) && p.includes(last);
}

/**
 * What a manager should look at before inviting. roles: rows from the roles table ({ code, name, requires_sia,
 * accepted_licences }) for the roles applied for. duplicates: [{ name, status }].
 */
export function applicationFlags({ applicant, application, roles = [], today, duplicates = [] }) {
  const flags = [];
  const add = (key, severity, text) => flags.push({ key, severity, text });
  const ai = application?.ai;
  if (application?.ai_status === 'failed') add('unread', 'warning', `Documents not read yet${application.ai_error ? ` (${application.ai_error})` : ''}`);
  if (ai) {
    if (ai.cv && ai.cv.readable === false) add('cv_unreadable', 'warning', 'The CV could not be read');
    const badge = ai.badge;
    const wanted = roles.filter((r) => r.requires_sia);
    if (wanted.length && (!badge || badge.readable === false)) add('badge_unreadable', 'warning', badge ? 'The SIA badge could not be read' : 'No SIA badge uploaded');
    if (badge?.readable !== false && badge?.expiry && /^\d{4}-\d{2}-\d{2}$/.test(badge.expiry)) {
      if (badge.expiry < today) add('expired', 'critical', `SIA badge expired ${badge.expiry}`);
      else if (badge.expiry <= addDays(today, 60)) add('expiring', 'warning', `SIA badge expires ${badge.expiry}`);
    }
    if (badge?.readable !== false && badge?.name && !sameName(applicant, badge.name)) add('name', 'warning', `Name on the badge is "${badge.name}"`);
    const types = badge?.readable === false ? [] : badge?.licence_types || [];
    if (types.length) {
      const missing = wanted.filter((r) => !(r.accepted_licences || []).some((l) => types.includes(l)));
      if (missing.length) add('cover', 'warning', `Badge doesn't cover ${missing.map((r) => r.name).join(', ')}`);
    }
  }
  if (duplicates.length) add('duplicate', 'warning', `Possible duplicate of ${duplicates.map((d) => `${d.name} (${d.status})`).join(', ')}`);
  return flags;
}

/** Other staff records with the same email, phone or SIA number */
export async function findDuplicates(o) {
  return q(
    `SELECT id, first_name || ' ' || last_name AS name, status FROM officers
      WHERE id <> $1 AND ((email IS NOT NULL AND lower(email) = lower($2))
        OR (length($3) >= 10 AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = right($3, 10))
        OR (length($4) = 16 AND regexp_replace(coalesce(sia_number, ''), '\\D', '', 'g') = $4))
      LIMIT 5`, [o.id, o.email || '', digits(o.phone), digits(o.sia_number)]);
}

const APPLY_TOOL = {
  name: 'read_application',
  description: 'What the applicant\'s CV and SIA badge show',
  input_schema: {
    type: 'object',
    properties: {
      cv: {
        type: 'object',
        properties: {
          readable: { type: 'boolean', description: 'False if there is no CV or it cannot be read' },
          summary: { type: 'string', description: '2-3 plain sentences on their security experience, for a hiring manager' },
          years_experience: { type: 'number', description: 'Years working in security, 0 if none; best estimate from dates' },
          employers: { type: 'array', items: { type: 'string' }, description: 'Recent employers or venues, most recent first, at most 6' },
          qualifications: { type: 'array', items: { type: 'string' }, description: 'Relevant qualifications: first aid, CCTV, conflict management, close protection, licences' },
        },
        required: ['readable'],
      },
      badge: {
        type: 'object',
        properties: {
          readable: { type: 'boolean', description: 'False if there is no badge, or it is blurred, cropped or not an SIA licence' },
          name: { type: 'string', description: 'Full name as printed' },
          number: { type: 'string', description: 'Licence number as printed (16 digits)' },
          licence_types: { type: 'array', items: { type: 'string', enum: SIA_TYPES }, description: 'Licence sector(s) shown' },
          expiry: { type: 'string', description: 'Expiry date as YYYY-MM-DD, empty if not shown' },
        },
        required: ['readable'],
      },
    },
    required: ['cv', 'badge'],
  },
};

/** One file as content for the AI, or a note saying why it was left out */
async function fileContent(d) {
  const head = await headObject(d.s3_key);
  if (!head) return { type: 'text', text: `${d.title}: file missing` };
  const mime = d.mime || head.mime;
  if (/wordprocessingml/.test(mime) || /\.docx$/i.test(d.s3_key)) {
    try {
      return { type: 'text', text: `${d.title} (Word document):\n${docxToMarkup(await getObjectBytes(d.s3_key)).slice(0, 30000)}` };
    } catch {
      return { type: 'text', text: `${d.title}: could not be opened` };
    }
  }
  if (!canRead(mime) || head.size > READ_LIMIT) return { type: 'text', text: `${d.title}: in a format the reader can't open` };
  return [{ type: 'text', text: `${d.title}:` }, fileBlock(await getObjectBytes(d.s3_key), mime)];
}

/** Read the CV and badge with AI and store the result on the application; never throws */
export async function readApplication(officerId) {
  const docs = await q("SELECT * FROM documents WHERE owner_type = 'officer' AND owner_id = $1 AND kind IN ('cv','sia') AND s3_key IS NOT NULL ORDER BY kind, title", [officerId]);
  try {
    const content = [{ type: 'text', text: 'Job application to a UK security company. Read the CV and the SIA licence badge below.' }];
    for (const d of docs) content.push(...[await fileContent(d)].flat());
    if (!docs.some((d) => d.kind === 'sia')) content.push({ type: 'text', text: 'No SIA badge was uploaded.' });
    const r = await extract({
      model: HAIKU, max_tokens: 1200, module: 'recruitment',
      system: 'You help a UK security company review job applications. Report only what the documents show; never guess missing details. Keep the summary factual and neutral.',
      messages: [{ role: 'user', content }],
      tool: APPLY_TOOL,
    });
    const ai = r.input;
    if (!ai) throw new Error('No answer');
    if (ai.badge?.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(ai.badge.expiry)) ai.badge.expiry = '';
    if (ai.badge?.number) ai.badge.number = digits(ai.badge.number);
    await q("UPDATE applications SET ai = $2, ai_status = 'done', ai_error = NULL, ai_at = now(), updated_at = now() WHERE officer_id = $1", [officerId, ai]);
    // The badge read also counts as the compliance read of that document, so it isn't read twice
    const sia = docs.find((d) => d.kind === 'sia');
    if (sia && ai.badge) {
      await q(
        `UPDATE documents SET number = coalesce(number, nullif($2, '')), expiry = coalesce(expiry, nullif($3, '')::date),
           ai_read = $4, ai_read_key = s3_key, ai_read_at = now() WHERE id = $1`,
        [sia.id, ai.badge.number || '', ai.badge.expiry || '', { readable: ai.badge.readable, doc_type: 'SIA licence card', name: ai.badge.name, number: ai.badge.number, licence_type: ai.badge.licence_types?.[0] || 'none', expiry: ai.badge.expiry || '', concerns: [] }]);
    }
    return 'done';
  } catch (e) {
    console.error('[apply] read failed', officerId, e.message);
    const msg = e.status === 429 ? 'AI paused — credit cap reached' : 'the reader had a problem';
    await q("UPDATE applications SET ai_status = 'failed', ai_error = $2, updated_at = now() WHERE officer_id = $1", [officerId, msg]);
    return 'failed';
  }
}

/** The roles table rows for these role codes */
export const rolesFor = (codes) => q('SELECT code, name, requires_sia, accepted_licences FROM roles WHERE code = ANY($1)', [codes || []]);

/** An application with its officer, or null */
export const getApplication = (officerId) => one(
  `SELECT o.*, a.roles AS applied_roles, a.availability, a.availability_note, a.rtw_confirmed, a.consent_at, a.ai, a.ai_status, a.ai_error, a.ai_at,
          a.sia_checked_at, a.rejected_at, a.seen_at, a.created_at AS applied_at, a.updated_at AS application_updated, u.name AS sia_checked_by_name, vu.name AS sia_last_verified_by_name
     FROM applications a JOIN officers o ON o.id = a.officer_id LEFT JOIN users u ON u.id = a.sia_checked_by
     LEFT JOIN users vu ON vu.id = o.sia_last_verified_by
    WHERE a.officer_id = $1`, [officerId]);
