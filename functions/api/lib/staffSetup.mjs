// Staff setup: a one-off shared link the platform admin sends to a company's officers so each fills in their own
// details. What a submission must contain, and the parts of it that are shown or kept back.
import { validSia } from './sia.mjs';
import { digits } from './applicants.mjs';
import { cleanShareCode } from './rtw.mjs';

export const SETUP_FILES = { sia_front: 'SIA badge (front)', sia_back: 'SIA badge (back)', rtw: 'Passport or ID photo page', poa: 'Proof of address', photo: 'Profile photo' };
// The document kind each upload is filed as on the new staff profile (the photo becomes the profile picture). The
// passport is filed as ID, so Orb's passport read can check right to work; a share code is filed as right to work.
export const DOC_KIND = { sia_front: 'sia', sia_back: 'sia', rtw: 'id', poa: 'poa' };
export const MIN_PASSWORD = 8;
export const SETUP_TYPES = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif))$/;
export const PHOTO_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif)$/;
export const MAX_SETUP_FILE = 10 * 1024 * 1024;
// Kept back from Orb and from the list until the admin opens one and taps Show
export const PRIVATE_FIELDS = ['dob', 'ni_number', 'bank_name', 'bank_sort_code', 'bank_account'];

const str = (v, n = 200) => String(v ?? '').trim().slice(0, n);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/;
const NI = /^[A-Z]{2}\d{6}[A-D]$/;

/** The cleaned details, or { error, field } with the first problem in plain words and the field it belongs to. today: YYYY-MM-DD (London). */
export function cleanStaffDetails(b, today) {
  const s = {
    first_name: str(b.first_name, 80), last_name: str(b.last_name, 80), goes_by: str(b.goes_by, 80) || null,
    email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40), dob: str(b.dob, 10) || null,
    address: str(b.address, 300), postcode: str(b.postcode, 12).toUpperCase(),
    ni_number: str(b.ni_number, 20).toUpperCase().replace(/\s+/g, '') || null,
    sia_number: digits(b.sia_number) || null, sia_expiry: str(b.sia_expiry, 10) || null,
    bank_name: str(b.bank_name, 80) || null, bank_sort_code: digits(b.bank_sort_code) || null, bank_account: digits(b.bank_account) || null,
    rtw_share_code: cleanShareCode(b.rtw_share_code),
    ec_name: str(b.ec_name, 120) || null, ec_relationship: str(b.ec_relationship, 60) || null, ec_phone: str(b.ec_phone, 40) || null,
    consent: b.consent === true,
  };
  const files = {};
  for (const k of Object.keys(SETUP_FILES)) { const v = str(b[`${k}_key`], 300); if (v) files[k] = v; }
  const bad = (field, error) => ({ error, field });
  if (!s.first_name) return bad('first_name', 'Please add your first and last name');
  if (!s.last_name) return bad('last_name', 'Please add your first and last name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) return bad('email', 'Please check your email address');
  if (digits(s.phone).length < 10) return bad('phone', 'Please check your phone number');
  if (!s.address) return bad('address', 'Please add your home address');
  if (!POSTCODE.test(s.postcode)) return bad('postcode', 'Please check your postcode');
  if (s.dob) {
    if (!isDate(s.dob)) return bad('dob', 'Please check your date of birth');
    const age = (new Date(today) - new Date(s.dob)) / (365.25 * 86400000);
    if (age < 16 || age > 100) return bad('dob', 'Please check your date of birth');
  }
  if (s.ni_number && !NI.test(s.ni_number)) return bad('ni_number', 'Please check your National Insurance number (like QQ123456C)');
  if (s.sia_number && !validSia(s.sia_number)) return bad('sia_number', 'An SIA licence number has 16 digits');
  if (s.sia_expiry && !isDate(s.sia_expiry)) return bad('sia_expiry', 'Please check your SIA licence expiry date');
  if (str(b.rtw_share_code) && !s.rtw_share_code) return bad('rtw_share_code', 'Please check your right to work share code (9 letters and numbers, starting with W)');
  if (s.bank_sort_code && s.bank_sort_code.length !== 6) return bad('bank_sort_code', 'A sort code has 6 digits');
  if (s.bank_account && s.bank_account.length !== 8) return bad('bank_account', 'An account number has 8 digits');
  if ((s.bank_sort_code || s.bank_account) && !(s.bank_sort_code && s.bank_account)) return bad(s.bank_sort_code ? 'bank_account' : 'bank_sort_code', 'Please add both the sort code and the account number');
  if (s.ec_name && digits(s.ec_phone).length < 10) return bad('ec_phone', "Please check your emergency contact's phone number");
  if (!s.consent) return bad('consent', 'Please tick the box to agree to us storing your details');
  delete s.consent;
  return { details: s, files };
}

/** The password an officer sets on the form (the same rule as setting one from an invite), or { error, field } */
export function checkSetupPassword(pw, confirm) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return { error: `Your password must be at least ${MIN_PASSWORD} characters`, field: 'password' };
  if (pw !== confirm) return { error: "The two passwords don't match", field: 'password_confirm' };
  return {};
}

/** A submission without the private fields (the list, and everything Orb reads) */
export function withoutPrivate(d) {
  const out = { ...d };
  for (const k of PRIVATE_FIELDS) delete out[k];
  return out;
}

/** The officers row a submission becomes: active, no login, nothing verified */
export function officerFromDetails(d, photoKey = null) {
  return {
    first_name: d.first_name, last_name: d.last_name, goes_by: d.goes_by || '', email: d.email, phone: d.phone,
    dob: d.dob || null, address: d.address, postcode: d.postcode, ni_number: d.ni_number || null,
    sia_number: d.sia_number || null, sia_expiry: d.sia_expiry || null,
    bank_name: d.bank_name || null, bank_sort_code: d.bank_sort_code || null, bank_account: d.bank_account || null,
    photo_key: photoKey, status: 'active',
  };
}

/**
 * A venue manager's details, or { error }. They type their venue's name (they never see the venue list); it is
 * matched to a venue by name, or the admin picks it before the account is made.
 */
export function cleanVenueManager(b) {
  const s = {
    first_name: str(b.first_name, 80), last_name: str(b.last_name, 80), goes_by: str(b.goes_by, 80) || null,
    email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40), job_title: str(b.job_title, 80) || null,
  };
  // A manager may run several venues: venue_names, with venue_name kept as the first for older views
  const names = (Array.isArray(b.venue_names) ? b.venue_names : [b.venue_name]).map((n) => str(n, 120)).filter(Boolean);
  s.venue_names = names.filter((n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i).slice(0, 10);
  s.venue_name = s.venue_names[0] || '';
  const photo = str(b.photo_key, 300);
  const bad = (field, error) => ({ error, field });
  if (!s.first_name) return bad('first_name', 'Please add your first and last name');
  if (!s.last_name) return bad('last_name', 'Please add your first and last name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) return bad('email', 'Please check your email address');
  if (digits(s.phone).length < 10) return bad('phone', 'Please check your phone number');
  if (!s.venue_name) return bad('venue_names', 'Please add the name of the venue you manage');
  if (b.consent !== true) return bad('consent', 'Please tick the box to agree to us storing your details');
  return { details: s, files: photo ? { photo } : {} };
}
