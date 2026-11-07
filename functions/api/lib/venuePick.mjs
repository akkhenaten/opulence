// Which of a manager's venues a message is about: the one venue whose name appears in it, else null (then we ask)
const squash = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

export function pickVenueFromText(text, venues) {
  const t = squash(text);
  const hits = venues.filter((v) => squash(v.name).trim() && t.includes(squash(v.name)));
  return hits.length === 1 ? hits[0] : null;
}
