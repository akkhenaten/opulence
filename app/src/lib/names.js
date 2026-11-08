// Same rules as the API (functions/api/lib/names.mjs nameMatches, nameFit): capitals, accents, punctuation, spacing and
// middle names don't count, so Scott = SCOTT, O'Brien = OBRIEN, Mc Donald = MCDONALD.
const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`.]/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ').filter(Boolean);
const pieces = (t) => new Set(t.flatMap((_, i) => [1, 2, 3].map((n) => t.slice(i, i + n).join(''))));

/** True unless the printed name clearly isn't this person. */
export const nameMatches = (printed, first, last) => nameFit(printed, first, last) === 'full';

/**
 * How well a printed name fits the profile:
 * 'full'    first name and surname;
 * 'initial' surname, and the first name only as its initial or a longer name starting with it (S SCANLON, SAMUEL for Sam);
 * 'close'   as full or initial but the surname has a reading slip (A ADULOJILII for Aduloju);
 * 'surname' the surname alone (SCOTT for Aaron Scott);
 * 'unread'  nothing readable printed (<UNKNOWN>, N/A, the back of a card);
 * 'no'      clearly someone else.
 * Everything but 'full' needs other proof (the licence number or the photo) before it counts.
 */
export function nameFit(printed, first, last) {
  const p = fold(printed);
  const f = fold(first)[0];
  const l = fold(last);
  if (/^\s*<.*>\s*$/.test(String(printed || '')) || (p.length && (UNREAD.has(p.join(' ')) || !p.some((w) => w.length > 1)))) return 'unread';
  if (!p.length || (!f && !l.length)) return 'full';
  // Where the surname sits among the printed words: exactly, or else within a reading slip
  const spans = p.flatMap((_, i) => [1, 2, 3].filter((n) => i + n <= p.length).map((n) => [i, n, p.slice(i, i + n).join('')]));
  const sur = l.length ? [l.join(''), l.at(-1)] : [];
  let hit = sur.length ? spans.find(([, , s]) => sur.includes(s)) : null;
  const close = !!sur.length && !hit;
  if (close) hit = spans.find(([, , s]) => sur.some((t) => near(s, t)));
  if (sur.length && !hit) return 'no';
  const rest = hit ? p.filter((_, i) => i < hit[0] || i >= hit[0] + hit[1]) : p;
  if (!f || pieces(rest).has(f)) return close ? 'close' : 'full';
  if (!rest.length) return close ? 'close' : 'surname';
  return rest.some((w) => w[0] === f[0] && (w.length === 1 || w.startsWith(f))) ? (close ? 'close' : 'initial') : 'no';
}

// What a reader writes when it can't make the name out
const UNREAD = new Set(['unknown', 'na', 'n a', 'not shown', 'illegible', 'none', 'unreadable', 'not visible', 'not readable', 'not legible']);
const prefix = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i; };
function lev(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
// A surname misread by a letter or two (SMYTH for SMITH), or a run of junk after a long right start (ADULOJILII for ADULOJU)
const near = (w, s) => s.length >= 4 && (lev(w, s) <= Math.max(1, Math.floor(s.length / 4)) || (prefix(w, s) >= 5 && prefix(w, s) >= 0.7 * s.length));
