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
