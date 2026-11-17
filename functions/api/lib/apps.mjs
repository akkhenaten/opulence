// What a person can use, as ticks: the Officer app (a staff record linked to their login) and at most one manager
// access (Office, Security manager or Venue manager are separate portals). One login carries both; nothing new is stored.

export const MANAGER_ROLES = ['company', 'security', 'venue'];
export const APP_LABEL = { officer: 'Officer app', company: 'Office', security: 'Security manager', venue: 'Venue manager' };
export const LAST_MANAGER = 'There must be at least one active company manager.';

/** The ticks for a login (role + whether a staff record is linked); no login means nothing ticked */
export function appsOf(u, linkedOfficer = false) {
  if (!u) return { officer: false, manager: null };
  return { officer: u.role === 'officer' || !!linkedOfficer, manager: MANAGER_ROLES.includes(u.role) ? u.role : null };
}

const bad = (status, message) => { const e = new Error(message); e.status = status; throw e; };

/**
 * Check a change of ticks and say what it does to the login.
 * before/want: { officer, manager }. hasLogin: the person signs in today. fromStaffRecord: the page is a staff record.
 * isSelf: the manager is changing their own access. lastCompanyManager: they are the only active company manager.
 * Returns { role, link: 'keep'|'link'|'unlink', changed } or throws an Error with .status.
 */
export function planAccess({ before, want, hasLogin = true, fromStaffRecord = false, isSelf = false, lastCompanyManager = false }) {
  const manager = want.manager || null;
  if (manager && !MANAGER_ROLES.includes(manager)) bad(400, 'Pick Office, Security manager or Venue manager');
  const officer = !!want.officer;
  if (manager === 'venue' && officer) bad(400, 'Venue managers use their own portal, so untick Officer app first');
  if (!officer && !manager) bad(400, hasLogin ? 'Tick at least one, or use Deactivate to switch off their app access' : 'Tick what they can use');
  // A staff record's login must stay linked to it, so the record is only given a login with the Officer app
  if (!hasLogin && fromStaffRecord && !officer) bad(400, 'Tick Officer app to give this staff record a login');
  const changed = officer !== !!before.officer || manager !== (before.manager || null);
  if (changed && isSelf) bad(400, 'Another company manager needs to change your own access');
  if (changed && lastCompanyManager && before.manager === 'company' && manager !== 'company') bad(400, LAST_MANAGER);
  const link = officer === !!before.officer ? 'keep' : officer ? 'link' : 'unlink';
  return { role: manager || 'officer', link, changed };
}

const listOf = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "Officer app and Security manager for Club One and The Vaults · can see pay" */
export function appsLine({ officer, manager, venues = [], can_see_pay = false }) {
  const parts = [];
  if (officer) parts.push(APP_LABEL.officer);
  if (manager === 'company') parts.push('Office (all venues)');
  else if (manager) parts.push(`${APP_LABEL[manager]} for ${venues.length ? listOf(venues) : 'no venues yet'}`);
  if (!parts.length) return 'No app';
  const pay = manager === 'company' || (manager === 'security' && can_see_pay) ? ' · can see pay' : '';
  return `${listOf(parts)}${pay}`;
}

/** What a change gives and takes, by name, for the notice to the person and the audit */
export function appsGained(before, after) {
  const has = (x) => [x.officer && 'officer', x.manager].filter(Boolean);
  const b = has(before);
  const a = has(after);
  return { gained: a.filter((k) => !b.includes(k)).map((k) => APP_LABEL[k]), lost: b.filter((k) => !a.includes(k)).map((k) => APP_LABEL[k]) };
}
