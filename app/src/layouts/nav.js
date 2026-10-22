import {
  BarChart3, Banknote, Bell, Building2, CalendarDays, CircleUserRound, ClipboardCheck, Home, LayoutGrid, Megaphone,
  Radio, ReceiptText, ScanLine, Settings, ShieldAlert, UserPlus, Users, CalendarOff, TriangleAlert, ScrollText, Sparkles,
  GraduationCap, BookOpenCheck, Briefcase, FileSignature, MessagesSquare, Store,
} from 'lucide-react';

// Sidebar sections per role. `tab` marks the items shown in the mobile tab bar (max 5); `short` is the tab bar label;
// `perm` hides an item unless the user has that permission.
export const NAV = {
  company: [
    { title: 'Overview', items: [
      { to: '/company', label: 'Dashboard', icon: LayoutGrid, end: true, tab: true, badge: 'everyday' },
      { to: '/company/messages', label: 'Messages', icon: MessagesSquare, badge: 'messages' },
      { to: '/company/ops', label: 'Ops AI', icon: Sparkles, badge: 'ops' },
    ] },
    { title: 'Operations', items: [
      { to: '/company/live', label: 'Live operations', short: 'Live', icon: Radio, tab: true },
      { to: '/company/rota', label: 'Rota', icon: CalendarDays, tab: true },
      { to: '/company/cover', label: 'Cover requests', icon: Megaphone },
      { to: '/company/timesheets', label: 'Timesheets', icon: ClipboardCheck },
      { to: '/company/incidents', label: 'Incidents', icon: ShieldAlert, tab: true },
    ] },
    { title: 'People', items: [
      { to: '/company/staff', label: 'Staff', icon: Users },
      { to: '/company/recruitment', label: 'Recruitment', icon: UserPlus },
      { to: '/company/people/contracts', label: 'Staff contracts', icon: FileSignature },
      { to: '/company/hr/time-off', label: 'Time off', icon: CalendarOff },
      { to: '/company/team/academy', label: 'Academy', icon: GraduationCap, module: 'academy' },
    ] },
    { title: 'Resources', items: [
      { to: '/company/team/toolbox', label: 'Toolbox', icon: BookOpenCheck, module: 'toolbox' },
    ] },
    { title: 'Clients & sites', items: [
      { to: '/company/clients', label: 'Clients', icon: Briefcase },
      { to: '/company/venues', label: 'Venues', icon: Building2 },
    ] },
    { title: 'Finance', items: [
      { to: '/company/pay', label: 'Pay runs', icon: Banknote },
      { to: '/company/invoices', label: 'Invoices', icon: ReceiptText },
    ] },
    { title: 'Reporting', items: [
      { to: '/company/reports', label: 'Reports', icon: BarChart3 },
    ] },
    { title: 'Administration', items: [
      { to: '/company/settings', label: 'Settings', icon: Settings },
      { to: '/company/audit', label: 'Audit log', icon: ScrollText },
    ] },
  ],
  security: [
    { title: 'Overview', items: [
      { to: '/security', label: 'Dashboard', icon: LayoutGrid, end: true, tab: true, badge: 'everyday' },
      { to: '/security/messages', label: 'Messages', icon: MessagesSquare, badge: 'messages' },
      { to: '/security/ops', label: 'Ops AI', icon: Sparkles, badge: 'ops' },
    ] },
    { title: 'Operations', items: [
      { to: '/security/live', label: 'Live operations', short: 'Live', icon: Radio, tab: true },
      { to: '/security/rota', label: 'Rota', icon: CalendarDays, tab: true },
      { to: '/security/exceptions', label: 'Exceptions', icon: TriangleAlert },
      { to: '/security/cover', label: 'Cover requests', icon: Megaphone },
      { to: '/security/timesheets', label: 'Timesheets', icon: ClipboardCheck },
      { to: '/security/incidents', label: 'Incidents', icon: ShieldAlert, tab: true },
    ] },
    { title: 'People', items: [
      { to: '/security/staff', label: 'Officers', icon: Users },
      { to: '/security/team/academy', label: 'Academy', icon: GraduationCap, module: 'academy' },
    ] },
    { title: 'Resources', items: [
      { to: '/security/team/toolbox', label: 'Toolbox', icon: BookOpenCheck, module: 'toolbox' },
    ] },
    { title: 'Sites', items: [
      { to: '/security/venues', label: 'Venues', icon: Building2 },
    ] },
    { title: 'Finance', items: [
      { to: '/security/pay', label: 'Pay runs', icon: Banknote, perm: 'can_see_pay' },
    ] },
  ],
  venue: [
    { items: [
      { to: '/venue', label: 'Overview', icon: LayoutGrid, end: true, tab: true },
      { to: '/venue/live', label: 'On site', icon: Radio, tab: true },
      { to: '/venue/messages', label: 'Messages', icon: MessagesSquare, tab: true, badge: 'messages' },
      { to: '/venue/site', label: 'My venue', icon: Store },
      { to: '/venue/cover', label: 'Cover requests', icon: Megaphone },
      { to: '/venue/timesheets', label: 'Timesheets', icon: ClipboardCheck },
      { to: '/venue/incidents', label: 'Incidents', icon: ShieldAlert, tab: true },
      { to: '/venue/invoices', label: 'Invoices', icon: ReceiptText },
    ] },
  ],
  officer: [
    { items: [
      { to: '/officer', label: 'Home', icon: Home, end: true, tab: true },
      { to: '/officer/shifts', label: 'Shifts', icon: CalendarDays, tab: true },
      { to: '/officer/clock', label: 'Clock', icon: ScanLine, tab: true, primary: true },
      { to: '/officer/learn', label: 'Learn', icon: GraduationCap, tab: true, moduleAny: ['academy', 'toolbox'] },
      { to: '/officer/me', label: 'Me', icon: CircleUserRound, tab: true },
    ] },
  ],
};

export const ROLE_LABEL = { company: 'Company manager', security: 'Security manager', venue: 'Venue manager', officer: 'Officer' };
export { Bell };
