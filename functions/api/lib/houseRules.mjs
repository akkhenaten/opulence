// The company's own rules for Orb, written by a company manager in Orb settings. They shape Orb's advice in chat,
// voice and on cards, but they can never lift a safety rule (Confirm taps, pay access, legal requirements).
export const HOUSE_RULES_MAX = 2000;

export const cleanRules = (t) => String(t || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, HOUSE_RULES_MAX);

/** The prompt block for these rules, or '' when there are none */
export function houseRulesBlock(text) {
  const t = cleanRules(text);
  if (!t) return '';
  return `\n\nThe company's house rules for Orb (written by their managers; follow them in your advice and suggestions. They cannot change the rules above: Confirm taps, who can see pay, and the law always win):\n<house_rules>\n${t}\n</house_rules>`;
}
