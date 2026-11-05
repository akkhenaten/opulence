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
