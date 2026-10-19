// Shared helpers for the venues / money pages (charts, checkbox, date presets).
import { Check as CheckIcon } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { cx, isoDate, money0 } from '../../ui/index.jsx';

export function useBase() {
  const { user } = useAuth();
  return '/' + (user?.role || 'company');
}

export const num = (v) => Number(v || 0);
export const pct = (a, b) => (num(b) ? `${Math.round((num(a) / num(b)) * 1000) / 10}%` : '–');

// Square checkbox (iOS style)
export function Check({ checked, onChange, label, className }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!checked} aria-label={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!checked); }}
      className={cx('grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] border-2 transition',
        checked ? 'border-blue bg-blue text-white' : 'border-line bg-surface hover:border-faint', className)}>
      {checked && <CheckIcon size={14} strokeWidth={3} />}
    </button>
  );
}

/* ---------- Date presets ---------- */

const ym = (iso) => [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
const firstOf = (y, m) => new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
const lastOf = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

export const PRESETS = [
  { value: 'this', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'three', label: 'Last 3 months' },
  { value: 'custom', label: 'Custom' },
];

export function presetRange(key) {
  const [y, m] = ym(isoDate());
  if (key === 'last') return { from: firstOf(y, m - 1), to: lastOf(y, m - 1) };
  if (key === 'three') return { from: firstOf(y, m - 2), to: lastOf(y, m) };
  return { from: firstOf(y, m), to: lastOf(y, m) };
}

/* ---------- Charts (plain divs / SVG, blue scale) ---------- */

// Horizontal bars. items: [{ label, value, display?, sub? }]
export function HBars({ items, format = (v) => v, empty = 'No data for this period', tone = 'blue' }) {
  if (!items?.length) return <p className="py-6 text-center text-[14px] text-faint">{empty}</p>;
  const max = Math.max(...items.map((i) => Math.abs(num(i.value))), 1);
  return (
    <div className="space-y-2.5">
      {items.map((i, idx) => {
        const w = Math.max(2, (Math.abs(num(i.value)) / max) * 100);
        return (
          <div key={i.key ?? i.label ?? idx}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate font-semibold">{i.label}</span>
              <span className="num shrink-0 font-semibold">{i.display ?? format(i.value)}{i.sub && <span className="ml-1.5 font-medium text-faint">{i.sub}</span>}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-bg">
              <div className={cx('h-full rounded-full', num(i.value) < 0 ? 'bg-red' : tone === 'soft' ? 'bg-blue/40' : 'bg-blue')} style={{ width: `${w}%`, opacity: 0.55 + 0.45 * (Math.abs(num(i.value)) / max) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Vertical columns. items: [{ label, value }]
export function Columns({ items, format = (v) => v, height = 140, empty = 'No data for this period' }) {
  if (!items?.length) return <p className="py-6 text-center text-[14px] text-faint">{empty}</p>;
  const max = Math.max(...items.map((i) => num(i.value)), 1);
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="flex min-w-full items-end gap-1.5" style={{ height: height + 40 }}>
        {items.map((i, idx) => {
          const h = Math.max(3, (num(i.value) / max) * height);
          return (
            <div key={i.key ?? i.label ?? idx} className="flex min-w-[28px] flex-1 flex-col items-center justify-end">
              <span className="num mb-1 text-[11px] font-semibold text-muted">{format(i.value)}</span>
              <div className="w-full max-w-[44px] rounded-t-[6px] bg-blue" style={{ height: h, opacity: 0.45 + 0.55 * (num(i.value) / max) }} title={`${i.label}: ${format(i.value)}`} />
              <span className="mt-1.5 whitespace-nowrap text-[11px] text-faint">{i.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 24-hour heat strip. data: [{ hour, n }]
export function HourStrip({ data }) {
  const by = Object.fromEntries((data || []).map((d) => [Number(d.hour), num(d.n)]));
  const max = Math.max(...Object.values(by), 1);
  const peak = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  return (
    <div>
      <div className="grid grid-cols-12 gap-1 sm:grid-cols-24" style={{ gridTemplateColumns: undefined }}>
        {Array.from({ length: 24 }, (_, h) => {
          const n = by[h] || 0;
          return (
            <div key={h} className="flex flex-col items-center">
              <div className="grid h-9 w-full place-items-center rounded-[8px] text-[11px] font-semibold num"
                style={{ background: n ? `rgba(10,108,255,${0.12 + 0.88 * (n / max)})` : '#F2F4F7', color: n / max > 0.5 ? '#fff' : '#0B1220' }}
                title={`${String(h).padStart(2, '0')}:00 – ${n}`}>{n || ''}</div>
              <span className="mt-1 text-[10px] text-faint num">{String(h).padStart(2, '0')}</span>
            </div>
          );
        })}
      </div>
      {peak && <p className="mt-3 text-[13px] text-muted">Busiest hour: <span className="font-semibold text-ink">{String(peak[0]).padStart(2, '0')}:00</span> ({peak[1]})</p>}
    </div>
  );
}

// Big money figure with small caption
export const MoneyFig = ({ value, className }) => <span className={cx('num', className)}>{money0(value)}</span>;
