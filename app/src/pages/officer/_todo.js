// Pure helpers for the officer's Home, kept apart so the API tests can check them
const NOT_OK = new Set(['unsigned', 'resign', 'refresher']);

/** Venue site packs to read before a shift there in the next 14 days, soonest first */
export function packTodos(venues, now = new Date()) {
  const until = now.getTime() + 14 * 864e5;
  return (venues || [])
    .filter((v) => NOT_OK.has(v.status) && v.next_shift && new Date(v.next_shift).getTime() <= until)
    .sort((a, b) => new Date(a.next_shift) - new Date(b.next_shift));
}

/** Which document the upload sheet opens on, from a compliance problem's wording */
export function docKindFor(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('sia')) return 'sia';
  if (t.includes('right to work')) return 'rtw';
  return null;
}
