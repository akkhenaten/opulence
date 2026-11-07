// What to call people on screen: the name they go by when they have one, otherwise their full name.
// Contracts, pay, invoices, SIA and HR records keep the full legal name and don't use these.

/** SQL for an officer's display name; `a` is the officers table alias ('' for none). */
export const officerName = (a = 'o') => {
  const p = a ? `${a}.` : '';
  return `COALESCE(NULLIF(btrim(${p}goes_by), ''), ${p}first_name || ' ' || ${p}last_name)`;
};

/** SQL for a user's display name; `a` is the users table alias. */
export const userName = (a = 'u') => `COALESCE(NULLIF(btrim(${a}.goes_by), ''), ${a}.name)`;

/** The same rule for a row already loaded: { goes_by, name } or { goes_by, first_name, last_name }. */
export const displayName = (p) => (p?.goes_by || '').trim() || p?.name || `${p?.first_name || ''} ${p?.last_name || ''}`.trim();

/** An officer row already loaded: { goes_by, first_name, last_name }. */
export const officerDisplay = (o) => (o?.goes_by || '').trim() || `${o?.first_name || ''} ${o?.last_name || ''}`.trim();

/** SQL for the short name a venue sees: goes_by, otherwise "First L." */
export const officerShort = (a = 'o') => {
  const p = a ? `${a}.` : '';
  return `COALESCE(NULLIF(btrim(${p}goes_by), ''), ${p}first_name || ' ' || left(${p}last_name, 1) || '.')`;
};

// Comparing a name printed on a document or register with the profile: capitals, accents, punctuation, spacing
// and middle names don't count, so Scott = SCOTT, O'Brien = OBRIEN, Mc Donald = MCDONALD, Smith-Jones = SMITH JONES.
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`.]/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
// Every run of 1–3 neighbouring words joined up, so a surname split or joined differently still lines up
const pieces = (t) => new Set(t.flatMap((_, i) => [1, 2, 3].map((n) => t.slice(i, i + n).join(''))));

/** True unless the printed name clearly isn't this person: first name's first word and the surname must both appear. */
export function nameMatches(printed, first, last) {
  const p = fold(printed);
  const f = fold(first)[0];
  const l = fold(last);
  if (!p.length || (!f && !l.length)) return true;
  const have = pieces(p);
  return (!f || have.has(f)) && (!l.length || have.has(l.join('')) || have.has(l.at(-1)));
}
