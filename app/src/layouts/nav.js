import {
  BarChart3, Banknote, ClipboardList, Bell, Building2, CalendarClock, CalendarDays, CircleUserRound, ClipboardCheck, Home, LayoutGrid, Megaphone,
  Radio, ReceiptText, Settings, ShieldAlert, UserPlus, Users, CalendarOff, TriangleAlert, ScrollText,
  GraduationCap, BookOpenCheck, Crown, Mail, BookText, Briefcase, FileSignature, MessagesSquare, Store, NotebookPen, Ban, ShieldCheck, MessageSquareHeart, LineChart, Siren, Star,
} from 'lucide-react';

// Sidebar per role. `tab` marks the items shown in the mobile tab bar (max 5); `short` is the tab bar label;
// `perm` hides an item unless the user has that permission. `hub` makes the item a section (ui/hub.jsx): it opens the
// first tab the person can see, is lit on any of them, takes that tab's name when it is the only one, and goes when
// there are none. `badge` names the count shown on it (the to-do list's byNav, or messages and the like). `foot` items sit at the bottom of the sidebar; `phoneOnly` items are only in the phone More menu.
export const NAV = {
  company: [
    { items: [
      { to: '/company', label: 'Today', icon: LayoutGrid, end: true, tab: true, badge: 'ops' },
      { hub: 'messages', label: 'Messages', icon: MessagesSquare, badge: 'inbox' },
      { hub: 'rota', label: 'Rota', icon: CalendarDays, tab: true, badge: 'rota' },
      { to: '/company/calendar', label: 'Calendar', icon: CalendarClock, badge: 'calendar' },
      { hub: 'incidents', label: 'Incidents', icon: ShieldAlert, tab: true, badge: 'incidents' },
      { hub: 'staff', label: 'Staff', icon: Users, badge: 'staff' },
      { hub: 'venues', label: 'Venues', icon: Building2 },
      { hub: 'money', label: 'Money', icon: Banknote, badge: 'money' },
      { hub: 'reports', label: 'Reports', icon: BarChart3 },
    ] },
    { foot: true, items: [
      { hub: 'learning', label: 'Learning', icon: GraduationCap },
      // Platform tabs (feedback, staff setup) are the platform admin's; shows the count of new app feedback
      { hub: 'settings', label: 'Settings', icon: Settings, badge: 'platform' },
    ] },
  ],
  security: [
    { items: [
      { to: '/security', label: 'Today', icon: LayoutGrid, end: true, tab: true, badge: 'ops' },
      { hub: 'messages', label: 'Messages', icon: MessagesSquare, badge: 'messages' },
      { hub: 'rota', label: 'Rota', icon: CalendarDays, tab: true, badge: 'rota' },
      { to: '/security/calendar', label: 'Calendar', icon: CalendarClock, badge: 'calendar' },
      { hub: 'incidents', label: 'Incidents', icon: ShieldAlert, tab: true, badge: 'incidents' },
      { hub: 'staff', label: 'Staff', icon: Users, badge: 'staff' },
      { hub: 'venues', label: 'Venues', icon: Building2 },
      { hub: 'money', label: 'Money', icon: Banknote, badge: 'money' },
      { hub: 'reports', label: 'Reports', icon: BarChart3 },
    ] },
    { foot: true, items: [
      { hub: 'learning', label: 'Learning', icon: GraduationCap },
    ] },
  ],
  // My venue and the emergency guide are in the account menu; on phones Venue info is in More as well
  venue: [
    { items: [
      { to: '/venue', label: 'Overview', icon: LayoutGrid, end: true, tab: true },
      { to: '/venue/live', label: 'On site', icon: Radio, tab: true },
      { to: '/venue/rota', label: 'Rota', icon: CalendarDays, tab: true },
      { to: '/venue/calendar', label: 'Calendar', icon: CalendarClock, badge: 'calendar' },
      { hub: 'logs', label: 'Logs', icon: NotebookPen, tab: true, badge: 'logs' },
      { hub: 'feedback', label: 'Feedback', icon: MessageSquareHeart },
      { hub: 'billing', label: 'Billing', icon: ReceiptText, badge: 'billing' },
      { to: '/venue/messages', label: 'Messages', icon: MessagesSquare, badge: 'messages' },
      { to: '/venue/site', label: 'Venue info', icon: Building2 },
    ] },
  ],
  officer: [
    { items: [
      { to: '/officer', label: 'Home', icon: Home, end: true, tab: true },
      { to: '/officer/shifts', label: 'Shifts', icon: CalendarDays, tab: true, badge: 'calendar' },
      { to: '/officer/learn', label: 'Learn', icon: GraduationCap, tab: true, moduleAny: ['academy', 'toolbox'] },
      { to: '/officer/me', label: 'Me', icon: CircleUserRound, tab: true },
    ] },
  ],
};

export const ROLE_LABEL = { company: 'Company manager', security: 'Security manager', venue: 'Venue manager', officer: 'Officer' };
export { Bell };
