// Clock-in proof rule: the registered phone is checked separately; this counts the on-site proofs
export const RULES = { any_one: 1, two_of_three: 2, all_three: 3 };
export const RULE_LABEL = { any_one: 'Phone + any 1', two_of_three: 'Phone + 2 of 3', all_three: 'Phone + all 3' };
const PROOFS = [['location', 'geo_ok'], ['venue_code', 'venue_code_ok'], ['selfie', 'selfie_ok']];

/** { met, count, need, missing[] } for a venue rule and the proofs that passed */
export function evaluate({ rule = 'two_of_three', ...p }) {
  const need = RULES[rule] || RULES.two_of_three;
  const passed = PROOFS.filter(([, k]) => !!p[k]).map(([name]) => name);
  const missing = PROOFS.map(([name]) => name).filter((n) => !passed.includes(n));
  return { met: passed.length >= need, count: passed.length, need, passed, missing };
}

/**
 * Which recorded clock checks failed, as the red flags on Live and Exceptions.
 * Only an explicit false counts: old events from before a check existed carry null and say nothing.
 */
export function failedChecks(e) {
  if (!e?.kind) return [];
  const fl = e.flags || [];
  const out = [];
  if (e.device_ok === false) out.push('phone');
  if (e.geo_ok === false) out.push('distance');
  if (e.kind === 'in' && e.venue_code !== 'nfc' && e.qr_ok === false && !e.proof_rule) out.push('qr');
  if (e.kind === 'in' && e.face_result === 'no_match') out.push('face');
  if (fl.includes('rule_not_met')) out.push('rule');
  return out;
}
