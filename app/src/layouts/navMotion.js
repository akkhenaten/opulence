import {
  BarChart3, Banknote, BookOpen, BookOpenCheck, BookText, Building2, CalendarDays, CalendarOff, ClipboardCheck, GraduationCap, LayoutGrid,
  LineChart, Mail, Megaphone, MessagesSquare, Radio, ReceiptText, Settings, ShieldAlert, ShieldCheck, Siren, TriangleAlert, UserPlus, Users,
} from 'lucide-react';

// Each sidebar icon's own little hover motion (keyframes nav-* in styles.css); anything not listed lifts
const MOTION = new Map([
  [LayoutGrid, 'tiles'], [MessagesSquare, 'wiggle'], [Mail, 'lift'], [Radio, 'waves'], [CalendarDays, 'flip'], [CalendarOff, 'flip'],
  [Megaphone, 'shake'], [Siren, 'shake'], [ClipboardCheck, 'tick'], [ShieldAlert, 'pulse'], [ShieldCheck, 'pulse'], [TriangleAlert, 'pulse'],
  [Users, 'bob'], [UserPlus, 'bob'], [GraduationCap, 'tip'], [BookOpenCheck, 'tilt'], [BookText, 'tilt'], [BookOpen, 'tilt'],
  [Banknote, 'slide'], [ReceiptText, 'slide'], [BarChart3, 'bars'], [LineChart, 'line'], [Settings, 'turn'], [Building2, 'rise'],
]);

export const motionFor = (icon) => MOTION.get(icon) || 'lift';
