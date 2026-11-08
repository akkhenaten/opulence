// Same rules as the API (functions/api/lib/names.mjs nameMatches, nameFit): capitals, accents, punctuation, spacing and
// middle names don't count, so Scott = SCOTT, O'Brien = OBRIEN, Mc Donald = MCDONALD.
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`.]/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
const pieces = (t) => new Set(t.flatMap((_, i) => [1, 2, 3].map((n) => t.slice(i, i + n).join(''))));

/** True unless the printed name clearly isn't this person. */
export const nameMatches = (printed, first, last) => nameFit(printed, first, last) === 'full';

/** 'full', 'initial' (surname + first initial: S SCANLON for Scott) or 'no' — same as the API's nameFit */
export function nameFit(printed, first, last) {
  const p = fold(printed);
  const f = fold(first)[0];
  const l = fold(last);
  if (!p.length || (!f && !l.length)) return 'full';
  const have = pieces(p);
  if (l.length && !have.has(l.join('')) && !have.has(l.at(-1))) return 'no';
  if (!f || have.has(f)) return 'full';
  const surname = new Set([l.join(''), ...l]);
  return p.some((w) => !surname.has(w) && w[0] === f[0] && (w.length === 1 || w.startsWith(f))) ? 'initial' : 'no';
}
