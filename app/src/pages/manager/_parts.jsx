// Helpers shared by the manager operations screens (rota, cover, live, timesheets)
import { useAuth } from '../../auth.jsx';
import { addDays, Check as UiCheck, cx } from '../../ui/index.jsx';

const TZ = 'Europe/London';
const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// London wall-clock parts for an instant: { date: 'YYYY-MM-DD', time: 'HH:MM' }
export function londonParts(d) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

// London wall-clock (YYYY-MM-DD, HH:MM) -> ISO UTC string (handles BST/GMT)
export function londonIso(date, hhmm = '00:00') {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const p = londonParts(guess);
  const [ph, pm] = p.time.split(':').map(Number);
  let off = ph * 60 + pm - (h * 60 + m);
  if (p.date !== date) off += p.date > date ? 1440 : -1440;
  return new Date(guess - off * 60000).toISOString();
}

// Shift start/end from a date and two times; an end at or before the start rolls to the next day
export function shiftTimes(date, start, end) {
  const starts_at = londonIso(date, start);
  let ends_at = londonIso(date, end);
  if (new Date(ends_at) <= new Date(starts_at)) ends_at = londonIso(addDays(date, 1), end);
  return { starts_at, ends_at };
}

// 'YYYY-MM-DDTHH:MM' (London) for <input type="datetime-local">, and back
export const toLondonInput = (iso) => { if (!iso) return ''; const p = londonParts(iso); return `${p.date}T${p.time}`; };
export const fromLondonInput = (s) => (s ? londonIso(s.slice(0, 10), s.slice(11, 16)) : null);

export function useBase() {
  const { user } = useAuth();
  return { user, base: `/${user?.role || 'company'}`, isManager: user?.role === 'company' || user?.role === 'security' };
}

export const durationH = (a, b) => Math.round(((new Date(b) - new Date(a)) / 3600000) * 100) / 100;

export { Chip } from '../../ui/index.jsx';

export const Check = (p) => <UiCheck round {...p} />;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
