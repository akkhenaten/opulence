// An officer's licence or passport is often uploaded as more than one file (the front and the back of an SIA card,
// a retake). These pick the files that belong together and put what Orb read off them into one read, so the back of a
// card (no name printed) doesn't count against the front.
import { nameFit } from './names.mjs';

const WINDOW = 30 * 864e5;
const newest = (a, b) => new Date(b.created_at) - new Date(a.created_at);
// A photo that looks like someone else on any of the files wins, so a person always looks at it
const FACE_RANK = { no_match: 5, match: 4, unsure: 3, unscored: 1 };
const usable = (r) => r && !r.error && !r.skipped;

/** The latest SIA uploads that belong together: the newest and any others within 30 days before it (at most 3) */
export function cardSet(docs, kind = 'sia') {
  const list = docs.filter((d) => d.kind === kind && d.s3_key).sort(newest);
  return list.filter((d) => new Date(list[0].created_at) - new Date(d.created_at) < WINDOW).slice(0, 3);
}

/** The latest passport or ID upload, never a saved GOV.UK / manual check page */
export function passportSet(docs, o = {}) {
  const skip = o.rtw_method === 'orb_passport' ? null : o.rtw_check_doc;
  const d = docs.filter((x) => x.s3_key && x.id !== skip && (x.kind === 'id' || (x.kind === 'rtw' && x.ai_read?.is_passport))).sort(newest)[0];
  return d ? [d] : [];
}

const CHECK_TITLES = ['GOV.UK right to work check', 'Right to work — manual check'];

/** What the Right to work section shows: the passport, else the officer's latest Right to work upload (not yet read,
 *  or not recognised as a passport), never a saved check page */
export function rtwShown(docs, o = {}) {
  const pass = passportSet(docs, o);
  if (pass.length) return pass;
  const d = docs.filter((x) => x.kind === 'rtw' && x.s3_key && x.id !== o.rtw_check_doc && !CHECK_TITLES.includes(x.title)).sort(newest)[0];
  return d ? [d] : [];
}

/** The set a document belongs to (for auto-apply) */
export const setFor = (d, docs, o) => (d.kind === 'sia' ? cardSet(docs) : passportSet(docs, o).some((x) => x.id === d.id) ? passportSet(docs, o) : [d]);

/**
 * One read from a set: each detail from the newest file that shows it; the name from a file where it could be read;
 * the best photo result (a mismatch on any file wins); every concern. from[field] is the file the value came from.
 */
export function mergedRead(set, o = {}) {
  const read = { readable: true, concerns: [] };
  const from = { doc: set[0] || null };
  const all = set.filter((d) => usable(d.ai_read));
  if (!all.length) return { read: null, from };
  // A blurred retake doesn't spoil a clear file next to it (it still gets its own card)
  const reads = all.filter((d) => d.ai_read.readable !== false);
  if (!reads.length) return { read: { ...all[0].ai_read, readable: false }, from: { ...from, readable: all[0] } };
  for (const d of reads) {
    if ((d.ai_read.concerns || []).length) { read.concerns.push(...d.ai_read.concerns); from.concerns = from.concerns || d; }
  }
  const named = reads.find((d) => d.ai_read.name && nameFit(d.ai_read.name, o.first_name, o.last_name) !== 'unread') || reads.find((d) => d.ai_read.name);
  if (named) { read.name = named.ai_read.name; from.name = named; }
  for (const k of ['number', 'expiry', 'licence_type', 'nationality', 'date_of_birth', 'doc_type']) {
    const d = reads.find((x) => x.ai_read[k] && !(k === 'licence_type' && ['other', 'none'].includes(x.ai_read[k])));
    if (d) { read[k] = d.ai_read[k]; from[k] = d; }
  }
  if (!read.licence_type) read.licence_type = reads.find((x) => x.ai_read.licence_type)?.ai_read.licence_type;
  read.is_passport = reads.some((d) => d.ai_read.is_passport);
  read.has_photo = reads.some((d) => d.ai_read.has_photo);
  const faced = reads.filter((d) => d.ai_read.face).sort((a, b) => (FACE_RANK[b.ai_read.face.result] || 0) - (FACE_RANK[a.ai_read.face.result] || 0))[0];
  if (faced) { read.face = faced.ai_read.face; from.face = faced; }
  return { read, from };
}
