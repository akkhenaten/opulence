// Same rule as the API (functions/api/lib/names.mjs nameMatches): capitals, accents, punctuation, spacing and
// middle names don't count, so Scott = SCOTT, O'Brien = OBRIEN, Mc Donald = MCDONALD.
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`.]/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
const pieces = (t) => new Set(t.flatMap((_, i) => [1, 2, 3].map((n) => t.slice(i, i + n).join(''))));

/** True unless the printed name clearly isn't this person. */
export function nameMatches(printed, first, last) {
  const p = fold(printed);
  const f = fold(first)[0];
  const l = fold(last);
  if (!p.length || (!f && !l.length)) return true;
  const have = pieces(p);
  return (!f || have.has(f)) && (!l.length || have.has(l.join('')) || have.has(l.at(-1)));
}
