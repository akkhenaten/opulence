// The compliance queue: who has to act next on a finding, and one document's profile / upload / Orb values side by side
const OFFICER = /^(missing|expiry_shift|expiry_soon|training|refresher|venue_pack|onboarding):|^(onboarding|rtw:code_old)$/;

/** 'officer' | 'office'. Anything not known to be the officer's step is the office's. */
export function ownerOf(key = '') {
  if (OFFICER.test(key)) return 'officer';
  return 'office';
}

/** The plain words for the owner pill. f: { key } */
export function ownerLabel(f) {
  if (f.key === 'grace' || f.key === 'grace_expired') return 'Office to decide';
  if (ownerOf(f.key) === 'office') return /^(register|recheck):/.test(f.key) ? 'Office to check the register' : 'Office to check';
  if (/^missing:/.test(f.key)) return 'Officer to upload';
  if (/^(expiry_shift|expiry_soon|rtw:code_old)/.test(f.key)) return 'Officer to renew';
  if (/^venue_pack:/.test(f.key)) return 'Officer to sign';
  return 'Officer to complete';
}

/** Who checked a scan: a person, Orb (its reading agreed and was applied), or nobody yet. Orb never counts as a person. */
export function checkedBy(d) {
  if (!d?.verified_at) return 'none';
  return d.verified_by ? 'person' : d.auto_applied_at ? 'orb' : 'person';
}

const norm = {
  number: (v) => String(v || '').replace(/[\s-]/g, '').toUpperCase(),
  expiry: (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : ''),
};

/** Rows for the "What we have vs what Orb read" table. kind: 'sia' | 'rtw' | a document kind; o: officer; d: the scan (or null). */
export function compareRows(kind, o, d) {
  const read = d?.ai_read || {};
  const profile = {
    number: kind === 'sia' ? o.sia_number : null,
    expiry: kind === 'sia' ? o.sia_expiry : kind === 'rtw' ? o.rtw_expiry : null,
  };
  const rows = [];
  for (const field of ['number', 'expiry']) {
    const vals = [profile[field], d?.[field], read[field]].map((v) => norm[field](v));
    if (!vals.some(Boolean)) continue;
    const set = new Set(vals.filter(Boolean));
    rows.push({ field, profile: vals[0] || null, upload: vals[1] || null, orb: vals[2] || null, mismatch: set.size > 1 });
  }
  if (read.name) {
    const words = String(read.name).toLowerCase().split(/[^a-z']+/).filter(Boolean);
    const ok = words.includes(String(o.last_name || '').toLowerCase()) || words.includes(String(o.first_name || '').toLowerCase());
    rows.push({ field: 'name', profile: [o.first_name, o.last_name].filter(Boolean).join(' '), upload: null, orb: read.name, mismatch: !ok });
  }
  if (typeof read.has_photo === 'boolean') rows.push({ field: 'photo', profile: null, upload: null, orb: read.has_photo ? 'Shown' : 'Not shown', mismatch: !read.has_photo });
  return rows;
}

/** One line on why a finding matters, by area. expiry: the date it stops counting, when known. */
export function whyItMatters(area, expiry = null, when = (d) => d) {
  const after = expiry ? ` after ${when(expiry)}` : '';
  if (area === 'licence') return `Needed for licensed (SIA) shifts. Without it they can't be booked for them${after}.`;
  if (area === 'rtw') return `A legal check before anyone works. Without it they can't be rostered${after}.`;
  if (area === 'training') return 'Company rule: training their role needs. It shows on their Learn list until it is done.';
  if (area === 'venue_pack') return "The venue's site pack must be read and signed before they can clock in there.";
  return 'A company requirement for their role, checked against the rota.';
}

/** Booked shifts in the next 14 days a finding would stop: the ones its Remove from shifts action names, else its next shift. */
export function affectedShifts(issue, shifts, now = Date.now()) {
  const ids = (issue.actions || []).find((a) => a.kind === 'unassign')?.params?.assignment_ids || [];
  const list = ids.length ? shifts.filter((s) => ids.includes(s.assignment_id)) : issue.shift ? [issue.shift] : [];
  return list.filter((s) => new Date(s.starts_at).getTime() < now + 14 * 86400000)
    .map((s) => ({ assignment_id: s.assignment_id || null, shift_id: s.shift_id || s.id || null, venue_name: s.venue_name, starts_at: s.starts_at }));
}

/** The handled-mark kept for an issue acted on from the queue: it shows again once its data or urgency changes. */
export const handledSig = (i) => `${i.sig}|${i.severity}`;
