// Helpers shared by the manager operations screens (rota, cover, live, timesheets)
import { useAuth } from '../../auth.jsx';
import { addDays, cx } from '../../ui/index.jsx';

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

// Small round chip with a count, used for summaries
export function Chip({ label, value, tone = 'grey', active, onClick }) {
  const tones = {
    grey: 'bg-surface text-ink', green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red', blue: 'bg-blue-soft text-blue',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cx('inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold shadow-tile transition',
        tones[tone], active ? 'border-blue ring-2 ring-blue/15' : 'border-black/[0.04]', onClick && 'active:scale-[0.97]')}>
      <span className="num text-[15px] font-bold">{value}</span>{label}
    </Tag>
  );
}

export function Check({ checked, onChange, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!checked} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx('grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition', checked ? 'border-blue bg-blue text-white' : 'border-line bg-surface')}>
      {checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M2.5 6.2l2.3 2.3 4.7-4.9" /></svg>}
    </button>
  );
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
