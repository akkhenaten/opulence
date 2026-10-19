import {
  BarChart3, Banknote, Bell, Building2, CalendarDays, CircleUserRound, ClipboardCheck, FileText, Home, LayoutGrid, Megaphone,
  Radio, ReceiptText, ScanLine, Settings, ShieldAlert, UserPlus, Users, CalendarOff, TriangleAlert, ScrollText,
} from 'lucide-react';

// Sidebar groups per role. `tab` marks the items shown in the mobile tab bar (max 5).
export const NAV = {
  company: [
    { items: [
      { to: '/company', label: 'Dashboard', icon: LayoutGrid, end: true, tab: true },
      { to: '/company/live', label: 'Live', icon: Radio, tab: true },
      { to: '/company/rota', label: 'Rota', icon: CalendarDays, tab: true },
      { to: '/company/cover', label: 'Cover requests', icon: Megaphone },
      { to: '/company/timesheets', label: 'Timesheets', icon: ClipboardCheck },
      { to: '/company/incidents', label: 'Incidents', icon: ShieldAlert, tab: true },
    ] },
    { title: 'People', items: [
      { to: '/company/staff', label: 'Staff', icon: Users },
      { to: '/company/recruitment', label: 'Recruitment', icon: UserPlus },
      { to: '/company/hr/time-off', label: 'Time off', icon: CalendarOff },
    ] },
    { title: 'Clients', items: [
      { to: '/company/venues', label: 'Venues & clients', icon: Building2 },
    ] },
    { title: 'Money', items: [
      { to: '/company/pay', label: 'Pay runs', icon: Banknote },
      { to: '/company/invoices', label: 'Invoices', icon: ReceiptText },
      { to: '/company/reports', label: 'Reports', icon: BarChart3 },
    ] },
    { title: 'Admin', items: [
      { to: '/company/settings', label: 'Settings & users', icon: Settings },
      { to: '/company/audit', label: 'Audit log', icon: ScrollText },
    ] },
  ],
  security: [
    { items: [
      { to: '/security', label: 'Dashboard', icon: LayoutGrid, end: true, tab: true },
      { to: '/security/live', label: 'Live', icon: Radio, tab: true },
      { to: '/security/rota', label: 'Rota', icon: CalendarDays, tab: true },
      { to: '/security/exceptions', label: 'Exceptions', icon: TriangleAlert },
      { to: '/security/cover', label: 'Cover requests', icon: Megaphone },
      { to: '/security/timesheets', label: 'Timesheets', icon: ClipboardCheck },
      { to: '/security/incidents', label: 'Incidents', icon: ShieldAlert, tab: true },
      { to: '/security/staff', label: 'Officers', icon: Users },
    ] },
  ],
  venue: [
    { items: [
      { to: '/venue', label: 'Overview', icon: LayoutGrid, end: true, tab: true },
      { to: '/venue/live', label: 'On site', icon: Radio, tab: true },
      { to: '/venue/cover', label: 'Request cover', icon: Megaphone, tab: true },
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
      { to: '/officer/pay', label: 'Pay', icon: FileText, tab: true },
      { to: '/officer/me', label: 'Me', icon: CircleUserRound, tab: true },
    ] },
  ],
};

export const ROLE_LABEL = { company: 'Company manager', security: 'Security manager', venue: 'Venue manager', officer: 'Officer' };
export { Bell };
