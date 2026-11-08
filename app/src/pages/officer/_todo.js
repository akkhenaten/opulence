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

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Wednesday to Friday, with no shift this weekend: the Friday–Sunday to ask about, or null */
export function weekendAsk(shifts, now = new Date()) {
  const dow = now.getDay();
  if (dow < 3 || dow > 5) return null;
  const fri = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (5 - dow));
  const mon = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 3);
  if ((shifts || []).some((s) => { const t = new Date(s.starts_at); return t >= fri && t < mon; })) return null;
  return { from: ymd(fri), to: ymd(new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 2)) };
}

/** The latest pay statement, only for the first 7 days after it's issued */
export function freshStatement(st, now = new Date()) {
  if (!st || st.status === 'draft' || !st.issued_at) return null;
  return now - new Date(st.issued_at) <= 7 * 864e5 ? st : null;
}
