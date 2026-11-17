// Everything waiting on someone, in one list. The bell, the menu badges, Needs you and the dashboards all read it, so a
// count is the same wherever it shows and clears everywhere once the work is done (counted from the work itself).
const s = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MGR = ['company', 'security'];

/**
 * key: what is waiting · nav: the menu item whose badge it adds to (null = shown, not badged) · tone: red first, then
 * amber, then blue · link: relative to the portal (managers) or absolute · needs: false = not a Needs you row (Orb's own
 * cards are listed by the inbox itself).
 */
export const KINDS = [
  // Company and security managers
  { key: 'exceptions', roles: MGR, nav: 'ops', tone: 'red', one: 'clock exception to check', many: 'clock exceptions to check', link: '/exceptions' },
  { key: 'unfilled', roles: MGR, nav: 'rota', tone: 'red', one: 'unfilled shift in the next 7 days', many: 'unfilled shifts in the next 7 days', link: '/rota' },
  { key: 'disputed', roles: MGR, nav: 'money', tone: 'red', one: 'queried timesheet', many: 'queried timesheets', link: (x) => `/timesheets?status=disputed${x?.week ? `&week=${x.week}` : ''}` },
  { key: 'cantWork', roles: ['company'], nav: 'ops', tone: 'red', one: 'officer can’t work (compliance)', many: 'officers can’t work (compliance)', link: '/people/compliance?view=cantwork' },
  { key: 'cover', roles: MGR, nav: 'rota', tone: 'amber', one: 'venue request to answer', many: 'venue requests to answer', link: '/cover' },
  { key: 'coverChange', roles: MGR, nav: 'rota', tone: 'amber', one: 'change to a booked request to approve', many: 'changes to booked requests to approve', link: '/cover' },
  { key: 'incidentsToSign', roles: MGR, nav: 'incidents', tone: 'amber', one: 'incident report to sign', many: 'incident reports to sign', link: '/incidents?to_sign=1' },
  // Open but not waiting on your signature: shown in Needs you, never badged twice
  { key: 'openIncidents', roles: MGR, nav: null, tone: 'amber', one: 'open incident', many: 'open incidents', link: '/incidents?status=open', bell: false },
  { key: 'graceEnding', roles: ['company'], nav: 'staff', tone: 'amber', one: 'grace period ends within 3 days', many: 'grace periods end within 3 days', link: '/people/compliance?view=cantwork' },
  { key: 'expiring', roles: ['company'], nav: 'staff', tone: 'amber', one: 'officer with a licence or right to work expiring in 60 days', many: 'officers with a licence or right to work expiring in 60 days', link: '/people/compliance' },
  { key: 'streams', roles: ['company'], nav: 'money', tone: 'amber', one: 'new billing stream to check', many: 'new billing streams to check', link: (x) => (x?.venue ? `/venues/${x.venue}?tab=streams` : '/venues') },
  { key: 'timeOff', roles: ['company'], nav: 'staff', tone: 'amber', one: 'time off request to review', many: 'time off requests to review', link: '/hr/time-off' },
  { key: 'toApprove', roles: MGR, nav: 'money', tone: 'blue', one: 'timesheet to approve', many: 'timesheets to approve', link: (x) => `/timesheets?status=pending${x?.week ? `&week=${x.week}` : ''}` },
  { key: 'shiftRequests', roles: MGR, nav: 'rota', tone: 'blue', one: 'shift request from an officer', many: 'shift requests from officers', link: '/rota?tab=requests' },
  { key: 'phones', roles: MGR, nav: 'staff', tone: 'blue', one: 'new clock-in phone to approve', many: 'new clock-in phones to approve', link: '/staff/phones' },
  { key: 'decisions', roles: MGR, nav: 'ops', tone: 'blue', one: 'card from Orb to approve', many: 'cards from Orb to approve', link: '#needs', needs: false },
  // Venue managers
  { key: 'timesheets', roles: ['venue'], nav: 'billing', tone: 'amber', one: 'timesheet to sign', many: 'timesheets to sign', link: '/venue/timesheets?show=review' },
  { key: 'reports', roles: ['venue'], nav: 'logs', tone: 'amber', one: 'incident report to sign', many: 'incident reports to sign', link: '/venue/incidents?to_sign=1' },
  { key: 'invoices', roles: ['venue'], nav: 'billing', tone: 'blue', one: 'invoice to pay', many: 'invoices to pay', link: '/venue/invoices' },
  // Officers
  { key: 'answer', roles: ['officer'], nav: null, tone: 'blue', one: 'shift waiting for your answer', many: 'shifts waiting for your answer', link: '/officer#todo' },
  { key: 'resign', roles: ['officer'], nav: null, tone: 'amber', one: 'incident report to sign', many: 'incident reports to sign', link: '/officer/incidents?to_sign=1' },
];

export const kindsFor = (role) => KINDS.filter((k) => k.roles.includes(role));
export const portalBase = (role) => (role === 'security' ? '/security' : role === 'company' ? '/company' : '');

/**
 * counts: key → number (null = couldn't be read: left out and flagged, never shown as nothing).
 * extra: key → link details (the week of the oldest timesheet, the venue of the first stream).
 */
export function summarise(role, counts = {}, extra = {}) {
  const base = portalBase(role);
  const kinds = kindsFor(role);
  const items = kinds.filter((k) => counts[k.key] > 0).map((k) => {
    const n = counts[k.key];
    const rel = typeof k.link === 'function' ? k.link(extra[k.key]) : k.link;
    return {
      key: k.key, count: n, title: s(n, k.one, k.many), tone: k.tone, nav: k.nav,
      link: rel.startsWith('/officer') || rel.startsWith('/venue') ? rel : `${base}${rel}`,
      needs: k.needs !== false, bell: k.bell !== false,
    };
  });
  const byNav = {};
  for (const i of items) if (i.nav) byNav[i.nav] = (byNav[i.nav] || 0) + i.count;
  return { items, byNav, failed: kinds.some((k) => counts[k.key] == null) };
}

/** The bell's "Waiting for you" rows (kept for the older callers and tests). */
export function waitingItems(role, c = {}) {
  const r = summarise(role, c);
  return { items: r.items.filter((i) => i.bell).map(({ key, count, title, link }) => ({ key, count, title, link })), failed: r.failed };
}
