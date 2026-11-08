// Orb applies an uploaded document to the profile when everything on it agrees, so the upload alone makes the officer
// compliant: an SIA card fills in the licence, a British or Irish passport verifies right to work. Anything that
// disagrees is left for a manager (the compliance card explains it). Runs once per uploaded file, straight after
// Orb reads it, so a later change made by hand is never overwritten.
import { one, q, tx } from './db.mjs';
import { SIA_TYPES } from './licences.mjs';
import { londonDate } from './time.mjs';
import { nameFit } from './names.mjs';
import { audit } from './audit.mjs';
import { notify, officerUser } from './notify.mjs';
import { siaCheckOn } from './sia.mjs';
import { autoCheckEnabled, lookupLicence } from './siaChecker.mjs';

const digits = (s) => String(s || '').replace(/\D/g, '');
const siaFmt = (x) => digits(x).replace(/(\d{4})(?=\d)/g, '$1 ');
const PASSPORT_RTW = { GBR: 'British passport', IRL: 'Irish passport' };

/** The licence number or the photo on the document shows it belongs to this officer */
export const proofOf = (r, o) => ({
  number: !!digits(r?.number) && digits(r.number) === digits(o.sia_number),
  photo: r?.face?.result === 'match',
});

/** Name good enough: the full first name, or the initial when the number or the photo backs it up */
export function nameOk(fit, r, o) {
  if (fit === 'full') return true;
  const p = proofOf(r, o);
  return fit === 'initial' && (p.number || p.photo);
}

/** What Orb may do with this read, or null. Pure: o = officer row, d = document row, r = its read, today YYYY-MM-DD */
export function decide(o, d, r, today) {
  if (!r || r.error || r.skipped || r.readable === false || (r.concerns || []).length || d.verified_at) return null;
  if (!['active', 'onboarding', 'applicant'].includes(o.status)) return null;
  const fit = nameFit(r.name, o.first_name, o.last_name);
  if (!r.name || !nameOk(fit, r, o)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.expiry || '') || r.expiry < today) return null;
  if (r.face?.result === 'no_match') return null;
  if (d.kind === 'sia') {
    if (!SIA_TYPES.includes(r.licence_type) || digits(r.number).length !== 16) return null;
    if (digits(o.sia_number) && digits(o.sia_number) !== digits(r.number)) return null;
    if (o.sia_expiry && o.sia_expiry > r.expiry) return null;
    return { kind: 'sia', number: siaFmt(r.number), expiry: r.expiry, licence_type: r.licence_type, fit, proof: proofOf(r, o) };
  }
  if (['rtw', 'id'].includes(d.kind) && r.is_passport && PASSPORT_RTW[r.nationality] && !o.rtw_verified && r.face?.result === 'match') {
    return { kind: 'rtw', rtw_type: PASSPORT_RTW[r.nationality], fit, proof: proofOf(r, o) };
  }
  return null;
}

/** Apply one read document if it all agrees. Returns 'sia' | 'rtw' | null */
export async function autoApply(docId) {
  const d = await one("SELECT * FROM documents WHERE id = $1 AND owner_type = 'officer'", [docId]);
  if (!d?.ai_read) return null;
  const o = await one('SELECT * FROM officers WHERE id = $1', [d.owner_id]);
  if (!o) return null;
  const act = decide(o, d, d.ai_read, londonDate(new Date()));
  if (!act) return null;
  const name = `${o.first_name} ${o.last_name}`;
  const { logActivity } = await import('../modules/ops.mjs');
  if (act.kind === 'sia') {
    await tx(async (t) => {
      await t.q(`UPDATE officers SET sia_number = COALESCE(NULLIF(sia_number, ''), $2), sia_expiry = $3, sia_type = $4 WHERE id = $1`,
        [o.id, act.number, act.expiry, act.licence_type]);
      await t.q(`UPDATE documents SET verified_at = now(), verified_by = NULL, auto_applied_at = now(),
                   number = COALESCE(NULLIF(number, ''), $2), expiry = COALESCE(expiry, $3) WHERE id = $1`, [d.id, act.number, act.expiry]);
    });
    await audit(null, 'orb.apply_sia', 'officer', o.id, {
      doc: d.id, from: { number: o.sia_number, expiry: o.sia_expiry, type: o.sia_type },
      to: { number: o.sia_number || act.number, expiry: act.expiry, type: act.licence_type }, name_fit: act.fit, proof: act.proof,
    });
    await logActivity('compliance', `Orb applied ${name}'s uploaded SIA card to their profile`, { ref_type: 'officer', ref_id: o.id });
    await registerCheck(o.id);
  } else {
    await tx(async (t) => {
      await t.q(`UPDATE officers SET rtw_verified = true, rtw_type = $2, rtw_expiry = NULL, rtw_checked_at = now(), rtw_checked_by = NULL,
                   rtw_method = 'orb_passport', rtw_check_doc = $3 WHERE id = $1`, [o.id, act.rtw_type, d.id]);
      await t.q('UPDATE documents SET verified_at = now(), verified_by = NULL, auto_applied_at = now() WHERE id = $1', [d.id]);
    });
    const { tickOnboarding } = await import('../modules/hr.mjs');
    await tickOnboarding(o.id, 'rtw');
    await audit(null, 'orb.apply_rtw', 'officer', o.id, { doc: d.id, rtw_type: act.rtw_type, name_fit: act.fit, proof: act.proof, original_seen: false });
    await logActivity('compliance', `Orb verified ${name}'s right to work from their uploaded ${act.rtw_type}`, { ref_type: 'officer', ref_id: o.id });
    await notify(await officerUser(o.id), { kind: 'hr', title: 'Right to work checked', body: 'Your passport confirms your right to work.', link: '/officer/documents', dedupe: `rtwok:${d.id}` });
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
