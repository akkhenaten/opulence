/* Sections: related pages shown as tabs of one nav item (Staff → Officers, Recruitment, Compliance…).
   Each tab is its own page and address, so old links and bookmarks keep working; the page's title becomes the
   section's and a tab row sits under it. `roles`, `perm` and `module` hide a tab; a section with one tab shows none. */
export const HUBS = {
  manager: {
    messages: { title: 'Messages', tabs: [
      { to: 'messages', label: 'Chats' },
      { to: 'email', label: 'Email', roles: ['company'] },
    ] },
    rota: { title: 'Rota', tabs: [
      { to: 'rota', label: 'Week' },
      { to: 'cover', label: 'Cover' },
      { to: 'exceptions', label: 'Exceptions' },
    ] },
    incidents: { title: 'Incidents', tabs: [
      { to: 'incidents', label: 'Reports' },
      { to: 'ejections', label: 'Ejections register' },
    ] },
    staff: { title: 'Staff', tabs: [
      { to: 'staff', label: 'Officers' },
      { to: 'recruitment', label: 'Recruitment', roles: ['company'] },
      { to: 'people/compliance', label: 'Compliance' },
      { to: 'people/contracts', label: 'Contracts', roles: ['company'] },
      { to: 'hr/time-off', label: 'Time off', roles: ['company'] },
      { to: 'staff/phones', label: 'Phones' },
    ] },
    venues: { title: 'Venues', tabs: [
      { to: 'venues', label: 'Venues' },
      { to: 'clients', label: 'Clients', roles: ['company'] },
      { to: 'people/procedures', label: 'Site packs' },
      { to: 'feedback', label: 'Feedback' },
      { to: 'reviews', label: 'Reviews' },
    ] },
    money: { title: 'Money', tabs: [
      { to: 'timesheets', label: 'Timesheets' },
      { to: 'pay', label: 'Pay runs', perm: 'can_see_pay' },
      { to: 'invoices', label: 'Invoices', roles: ['company'] },
    ] },
    reports: { title: 'Reports', tabs: [
      { to: 'reports', label: 'Reports', roles: ['company'] },
      { to: 'analytics', label: 'Analytics', module: 'analytics' },
    ] },
    learning: { title: 'Learning', tabs: [
      { to: 'team/training', label: 'Training' },
      { to: 'team/toolbox', label: 'Toolbox', module: 'toolbox' },
      { to: 'help', label: 'Help' },
    ] },
    settings: { title: 'Settings', tabs: [
      { to: 'settings', label: 'Settings', roles: ['company'] },
      { to: 'audit', label: 'Audit log', roles: ['company'] },
      { to: 'platform', label: 'Platform', perm: 'platform' },
      { to: 'staff-setup', label: 'Staff setup', perm: 'platform' },
    ] },
  },
  officer: {
    messages: { title: 'Messages', tabs: [
      { to: 'messages', label: 'Chats' },
      { to: 'everyday', label: 'Everyday', module: 'everyday' },
    ] },
  },
  venue: {
    logs: { title: 'Logs', tabs: [
      { to: 'logs', label: 'Shift logs' },
      { to: 'incidents', label: 'Incidents' },
      { to: 'bans', label: 'Ejections' },
    ] },
    feedback: { title: 'Feedback', tabs: [
      { to: 'feedback', label: 'Give feedback' },
      { to: 'reviews', label: 'Reviews' },
      { to: 'analytics', label: 'Analytics', module: 'analytics' },
    ] },
    billing: { title: 'Billing', tabs: [
      { to: 'timesheets', label: 'Timesheets' },
      { to: 'invoices', label: 'Invoices' },
    ] },
  },
};

const portal = (role) => (['venue', 'officer'].includes(role) ? role : 'manager');
// Company managers see pay; security managers only with the permission
const allowed = (t, user, on) => (!t.roles || t.roles.includes(user.role)) && (!t.perm || (user.role === 'company' && t.perm === 'can_see_pay') || user[t.perm]) && (!t.module || on(t.module));

/** The tabs of one section this person can open, with full paths */
export function hubTabs(id, user, on = () => true) {
  const hub = HUBS[portal(user.role)]?.[id];
  if (!hub) return [];
  return hub.tabs.filter((t) => allowed(t, user, on)).map((t) => ({ ...t, to: `/${user.role}/${t.to}` }));
}

/** The section a path belongs to (its own page or a page under it), or null */
export function findHub(path, user, on, { exact } = {}) {
  const p = path.replace(/\/$/, '');
  const hubs = HUBS[portal(user.role)] || {};
  for (const id of Object.keys(hubs)) {
    const tabs = hubTabs(id, user, on);
    const current = tabs.find((t) => p === t.to) || (!exact && tabs.find((t) => p.startsWith(`${t.to}/`)));
    if (current) return { id, title: hubs[id].title, tabs, current };
  }
  return null;
}
