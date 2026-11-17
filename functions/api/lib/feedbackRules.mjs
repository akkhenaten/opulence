// Is a venue's rating of an officer a problem the office should look at? Low stars or a plain complaint word say yes,
// a short note without one says no; only a long note with neither (null) is worth reading with the AI.

const COMPLAINT = /\b(late|lateness|no[- ]?show|didn'?t (?:turn up|show)|left early|rude|aggressive|unprofessional|attitude|drunk|smelt|smelled|on (?:his|her|their|the) phone|asleep|sleeping|scruffy|untidy|no uniform|unsafe|assault\w*|fight\w*|push\w*|grabb?\w*|threat\w*|abus\w*|racis\w*|sexis\w*|harass\w*|complain\w*|complaint|issue|problem|concern\w*|poor|bad|terrible|awful|useless|ignored|refused|inappropriate|disappointed|never again|don'?t send|do not send|not happy|unhappy)\b/i;

/** true = a problem, false = fine, null = a long note the rules can't judge */
export function feedbackProblem(rating, note) {
  if (Number(rating) <= 2) return true;
  const t = String(note || '').trim();
  // "no issues at all", "not bad", "never late" are praise
  const plain = t.replace(/\b(?:no|zero|without|never|not)\s+(?:any\s+)?(?:\w+\s+)?(?:issues?|problems?|concerns?|complaints?|bad|late|rude|trouble)\b/gi, ' ');
  if (COMPLAINT.test(plain)) return true;
  return t.length > 200 ? null : false;
}
