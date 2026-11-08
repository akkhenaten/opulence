import {
  BarChart3, Banknote, ClipboardList, Bell, Building2, CalendarDays, CircleUserRound, ClipboardCheck, Home, LayoutGrid, Megaphone,
  Radio, ReceiptText, Settings, ShieldAlert, UserPlus, Users, CalendarOff, TriangleAlert, ScrollText,
  GraduationCap, BookOpenCheck, Crown, Mail, BookText, Briefcase, FileSignature, MessagesSquare, Store, NotebookPen, Ban, ShieldCheck, MessageSquareHeart, LineChart, Siren, Star,
} from 'lucide-react';

// Sidebar per role. `tab` marks the items shown in the mobile tab bar (max 5); `short` is the tab bar label;
// `perm` hides an item unless the user has that permission. `hub` makes the item a section (ui/hub.jsx): it opens the
// first tab the person can see, is lit on any of them, takes that tab's name when it is the only one, and goes when
// there are none. `foot` items sit at the bottom of the sidebar.
export const NAV = {
  company: [
    { items: [
      { to: '/company', label: 'Today', icon: LayoutGrid, end: true, tab: true, badge: 'ops' },
      { hub: 'messages', label: 'Messages', icon: MessagesSquare, badge: 'inbox' },
      { hub: 'rota', label: 'Rota', icon: CalendarDays, tab: true },
      { hub: 'incidents', label: 'Incidents', icon: ShieldAlert, tab: true },
      { hub: 'staff', label: 'Staff', icon: Users },
      { hub: 'venues', label: 'Venues', icon: Building2 },
      { hub: 'money', label: 'Money', icon: Banknote },
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
      { hub: 'rota', label: 'Rota', icon: CalendarDays, tab: true },
      { hub: 'incidents', label: 'Incidents', icon: ShieldAlert, tab: true },
      { hub: 'staff', label: 'Staff', icon: Users },
      { hub: 'venues', label: 'Venues', icon: Building2 },
      { hub: 'money', label: 'Money', icon: Banknote },
      { hub: 'reports', label: 'Reports', icon: BarChart3 },
    ] },
    { foot: true, items: [
      { hub: 'learning', label: 'Learning', icon: GraduationCap },
    ] },
  ],
  // My venue and the emergency guide are in the account menu
  venue: [
    { items: [
      { to: '/venue', label: 'Overview', icon: LayoutGrid, end: true, tab: true },
      { to: '/venue/live', label: 'On site', icon: Radio, tab: true },
      { to: '/venue/rota', label: 'Rota', icon: CalendarDays },
      { hub: 'logs', label: 'Logs', icon: NotebookPen, tab: true },
      { hub: 'feedback', label: 'Feedback', icon: MessageSquareHeart },
      { hub: 'billing', label: 'Billing', icon: ReceiptText },
      { to: '/venue/messages', label: 'Messages', icon: MessagesSquare, tab: true, badge: 'messages' },
    ] },
  ],
  officer: [
    { items: [
      { to: '/officer', label: 'Home', icon: Home, end: true, tab: true },
      { to: '/officer/shifts', label: 'Shifts', icon: CalendarDays, tab: true },
      { to: '/officer/learn', label: 'Learn', icon: GraduationCap, tab: true, moduleAny: ['academy', 'toolbox'] },
      { to: '/officer/me', label: 'Me', icon: CircleUserRound, tab: true },
    ] },
  ],
};

export const ROLE_LABEL = { company: 'Company manager', security: 'Security manager', venue: 'Venue manager', officer: 'Officer' };
export { Bell };
