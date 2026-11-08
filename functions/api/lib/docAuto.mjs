// Orb applies an uploaded document to the profile when everything on it agrees, so the upload alone makes the officer
// compliant: an SIA card fills in the licence, a British or Irish passport verifies right to work. Anything that
// disagrees is left for a manager (the compliance card explains it). Runs once per uploaded file, straight after
// Orb reads it, so a later change made by hand is never overwritten.
import { one, q, tx } from './db.mjs';
import { SIA_TYPES } from './licences.mjs';
import { londonDate } from './time.mjs';
import { nameFit } from './names.mjs';
import { mergedRead, setFor } from './docSets.mjs';
import { audit } from './audit.mjs';
import { notify, officerUser } from './notify.mjs';
import { siaCheckOn } from './sia.mjs';
import { autoCheckEnabled, lookupLicence } from './siaChecker.mjs';

const digits = (s) => String(s || '').replace(/\D/g, '');
const siaFmt = (x) => digits(x).replace(/(\d{4})(?=\d)/g, '$1 ');
const PASSPORT_RTW = { GBR: 'British passport', IRL: 'Irish passport' };

// A partial licence number read off a card (the last 8+ digits) still agrees with the full number on the profile
const suffixOf = (part, whole) => part.length >= 8 && part.length < 16 && whole.length === 16 && whole.endsWith(part);
export const numberAgrees = (read, profile) => {
  const a = digits(read);
  const b = digits(profile);
  return !!a && !!b && (a === b || suffixOf(a, b));
};
// Card and profile expiry this close apart are a typo on one side: Orb takes the earlier (safe) date
export const SMALL_GAP = 31;
const daysFrom = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);

/** The licence number or the photo on the document shows it belongs to this officer */
export const proofOf = (r, o) => ({
  number: numberAgrees(r?.number, o.sia_number),
  photo: r?.face?.result === 'match',
});

/** Name good enough: the full first name, or anything short of a clear mismatch when the number or the photo backs it up */
export function nameOk(fit, r, o) {
  if (fit === 'full') return true;
  if (fit === 'no') return false;
  const p = proofOf(r, o);
  return p.number || p.photo;
}

/** How the printed name fits; nothing printed counts as unreadable */
export const fitOf = (r, o) => (r?.name ? nameFit(r.name, o.first_name, o.last_name) : 'unread');

/**
 * What Orb may do with this read, or null. Pure: o = officer row, d = the document (verified_at only when a manager
 * verified it), r = the read of its set (lib/docSets.mjs mergedRead), today YYYY-MM-DD
 */
export function decide(o, d, r, today) {
  if (!r || r.error || r.skipped || r.readable === false || (r.concerns || []).length) return null;
  if (!['active', 'onboarding', 'applicant'].includes(o.status)) return null;
  const fit = fitOf(r, o);
  if (!nameOk(fit, r, o)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.expiry || '') || r.expiry < today) return null;
  if (r.face?.result === 'no_match') return null;
  const proof = proofOf(r, o);
  if (d.kind === 'sia') {
    if (d.verified_at || !SIA_TYPES.includes(r.licence_type)) return null;
    const have = digits(o.sia_number);
    if (have ? !numberAgrees(r.number, have) : digits(r.number).length !== 16) return null;
    const gap = o.sia_expiry ? daysFrom(r.expiry, o.sia_expiry) : 0;
    if (gap > SMALL_GAP) return null;
    return { kind: 'sia', number: have ? o.sia_number : siaFmt(r.number), expiry: r.expiry, licence_type: r.licence_type, fit, proof, shortened: gap > 0 };
  }
  if (['rtw', 'id'].includes(d.kind) && r.is_passport) {
    // A tick by hand with no check saved gets Orb's check; a saved check is never redone
    if (!PASSPORT_RTW[r.nationality] || !proof.photo || (o.rtw_verified && o.rtw_checked_at)) return null;
    return { kind: 'rtw', rtw_type: PASSPORT_RTW[r.nationality], fit, proof, upgrade: !!o.rtw_verified };
  }
  if (d.kind === 'rtw' && o.rtw_verified && o.rtw_expiry && !['share_code', 'manual'].includes(o.rtw_method)) {
    const gap = daysFrom(r.expiry, o.rtw_expiry);
    if (gap >= 1 && gap <= SMALL_GAP) return { kind: 'rtw_expiry', expiry: r.expiry, fit, proof };
  }
  return null;
}

/** Apply one read document (with the files that go with it) if it all agrees. Returns 'sia' | 'rtw' | 'rtw_expiry' | null */
export async function autoApply(docId) {
  const d = await one("SELECT * FROM documents WHERE id = $1 AND owner_type = 'officer'", [docId]);
  if (!d?.ai_read) return null;
  const o = await one('SELECT * FROM officers WHERE id = $1', [d.owner_id]);
  if (!o) return null;
  const docs = await q("SELECT * FROM documents WHERE owner_type = 'officer' AND owner_id = $1 AND kind IN ('sia','rtw','id')", [o.id]);
  const set = setFor(d, docs, o);
  if (!set.some((x) => x.id === d.id)) return null; // an older file, replaced by a newer upload
  const { read } = mergedRead(set, o);
  const byHand = set.find((x) => x.verified_at && !x.auto_applied_at);
  const act = decide(o, { ...d, verified_at: byHand?.verified_at || null }, read, londonDate(new Date()));
  if (!act) return null;
  const name = `${o.first_name} ${o.last_name}`;
  const ids = set.map((x) => x.id);
  const { logActivity } = await import('../modules/ops.mjs');
  if (act.kind === 'sia') {
    await tx(async (t) => {
      await t.q(`UPDATE officers SET sia_number = COALESCE(NULLIF(sia_number, ''), $2), sia_expiry = $3, sia_type = $4 WHERE id = $1`,
        [o.id, act.number, act.expiry, act.licence_type]);
      await t.q(`UPDATE documents SET verified_at = now(), verified_by = NULL, auto_applied_at = now(),
                   number = COALESCE(NULLIF(number, ''), $2), expiry = COALESCE(expiry, $3) WHERE id = ANY($1)`, [ids, act.number, act.expiry]);
    });
    await audit(null, 'orb.apply_sia', 'officer', o.id, {
      doc: d.id, docs: ids, from: { number: o.sia_number, expiry: o.sia_expiry, type: o.sia_type },
      to: { number: o.sia_number || act.number, expiry: act.expiry, type: act.licence_type }, name_fit: act.fit, proof: act.proof, shortened: act.shortened,
    });
    await logActivity('compliance', `Orb applied ${name}'s uploaded SIA card to their profile${act.shortened ? ' (the card\'s earlier expiry date)' : ''}`, { ref_type: 'officer', ref_id: o.id });
    await registerCheck(o.id);
  } else if (act.kind === 'rtw') {
    await tx(async (t) => {
      await t.q(`UPDATE officers SET rtw_verified = true, rtw_type = $2, rtw_expiry = NULL, rtw_checked_at = now(), rtw_checked_by = NULL,
                   rtw_method = 'orb_passport', rtw_check_doc = $3 WHERE id = $1`, [o.id, act.rtw_type, d.id]);
      await t.q('UPDATE documents SET verified_at = COALESCE(verified_at, now()), auto_applied_at = now() WHERE id = $1', [d.id]);
    });
    const { tickOnboarding } = await import('../modules/hr.mjs');
    await tickOnboarding(o.id, 'rtw');
    await audit(null, 'orb.apply_rtw', 'officer', o.id, {
      doc: d.id, rtw_type: act.rtw_type, name_fit: act.fit, proof: act.proof, photo_against: read.face?.against || 'profile',
      original_seen: false, upgraded_from_hand_tick: act.upgrade,
    });
    await logActivity('compliance', act.upgrade
      ? `Orb saved a right to work check for ${name} from their uploaded ${act.rtw_type} (it had been ticked by hand)`
      : `Orb verified ${name}'s right to work from their uploaded ${act.rtw_type}`, { ref_type: 'officer', ref_id: o.id });
    // Already shown as verified to them, so nothing new to tell them after an upgrade
    if (!act.upgrade) await notify(await officerUser(o.id), { kind: 'hr', title: 'Right to work checked', body: 'Your passport confirms your right to work.', link: '/officer/documents', dedupe: `rtwok:${d.id}` });
  } else {
    await q('UPDATE officers SET rtw_expiry = $2 WHERE id = $1', [o.id, act.expiry]);
    await q('UPDATE documents SET auto_applied_at = now() WHERE id = $1', [d.id]);
    await audit(null, 'orb.apply_rtw_expiry', 'officer', o.id, { doc: d.id, from: o.rtw_expiry, to: act.expiry, name_fit: act.fit, proof: act.proof });
    await logActivity('compliance', `Orb set ${name}'s right to work expiry to the earlier date on their uploaded document`, { ref_type: 'officer', ref_id: o.id });
  }
  try {
    const { runCompliance } = await import('../modules/compliance.mjs');
    await runCompliance({ officerIds: [o.id] });
  } catch (e) {
    console.error('[docAuto] compliance refresh', e.message);
  }
  return act.kind;
}

// With SIA Checker on, look the licence up on the register straight away and save what it shows
async function registerCheck(officerId) {
  if (!siaCheckOn() || !autoCheckEnabled()) return;
  try {
    const o = await one('SELECT sia_number FROM officers WHERE id = $1', [officerId]);
    if (digits(o?.sia_number).length !== 16) return;
    const r = await lookupLicence(digits(o.sia_number));
    const status = r.outcome === 'not_found' ? 'not_found' : r.outcome === 'found' ? r.status : null;
    if (!status) return;
    const { recordSiaCheck } = await import('../modules/sia.mjs');
    await recordSiaCheck({
      officerId, status, expiry: r.expiry, sector: r.sector,
      notes: 'Checked by Orb after reading the uploaded card', source: 'auto',
    });
  } catch (e) {
    console.error('[docAuto] register check', e.message);
  }
}
