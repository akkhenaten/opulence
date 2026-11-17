// Short replies to Orb's shift questions ("omw 10", "yeah go on", "cant tonight sorry") read by plain rules, so most
// replies cost no AI credits. Anything long, mixed or asking something back is 'unclear' and goes to the AI as before.

const POLITE_YES = /\b(no (?:worries|problem|probs?)|np)\b/g;
// No 'ill' for being unwell: with the apostrophe gone it is also "I'll"
const NO = /\b(no|nope|nah|cant|cannot|can not|wont|unable|sick|not (?:coming|able|going|gonna|today|tonight|now)|not make it|(?:have|got) to cancel)\b/;
const YES = /^(?:yes|yeah|yea|yep|yup|ya|y|ok|okay|k|kk|sure|go on|deal|of course|absolutely|definitely|count me in|ill (?:take|do) it|i can|can do|thumbs up)\b|^👍/;
const OMW = /\b(omw|otw|on my way|on the way|on route|en route|coming|nearly there|almost there|be there|running late|stuck in traffic|traffic|late|(?:\d+|few|couple) ?(?:m|min|mins|minute|minutes)\b)/;
const SIGNING = /\b(on it|doing it|signing|will do|now|reading it|done)\b/;

/** Minutes until they arrive, if they said: "10 mins", "half an hour", "an hour", "1.5 hours" */
export function etaMinutes(t) {
  const s = norm(t);
  let m = s.match(/(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b/);
  if (m) return Number(m[1]);
  if (/\bhalf (?:an )?hour\b/.test(s)) return 30;
  if (/\bquarter of an hour\b/.test(s)) return 15;
  m = s.match(/(\d(?:\.\d)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (m) return Math.round(Number(m[1]) * 60);
  if (/\b(?:an|1|one) hour\b/.test(s)) return 60;
  return undefined;
}

// "omw 10": on the way with a lone number reads as minutes
const bareMinutes = (s) => { const m = s.match(/\b(\d{1,3})\b/); return m && Number(m[1]) <= 120 ? Number(m[1]) : undefined; };
const norm = (t) => String(t || '').toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s.👍]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * kind: 'chase' (are you on your way?), 'pack' (sign the site pack now), anything else = an offered shift.
 * Returns { intent, eta_min?, reason? } with intent 'unclear' when the rules can't tell.
 */
export function replyByRules(text, kind) {
  const raw = String(text || '');
  if (!raw.trim() || raw.length > 80 || raw.includes('?')) return { intent: 'unclear' };
  const s = norm(raw).replace(POLITE_YES, 'ok');
  const no = NO.test(s);
  const yes = YES.test(s);
  if (kind === 'chase') {
    const omw = yes || OMW.test(s);
    if (no === omw) return { intent: 'unclear' };
    return no ? { intent: 'cant_make_it', reason: raw.trim() } : { intent: 'on_my_way', eta_min: etaMinutes(s) ?? bareMinutes(s) };
  }
  if (kind === 'pack') {
    const now = yes || SIGNING.test(s);
    if (no === now) return { intent: 'unclear' };
    return no ? { intent: 'cant_make_it', reason: raw.trim() } : { intent: 'signing_now' };
  }
  if (no === yes) return { intent: 'unclear' };
  return { intent: yes ? 'accept' : 'decline' };
}
