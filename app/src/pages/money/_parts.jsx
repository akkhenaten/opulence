// Shared helpers for the venues / money pages (charts, checkbox, date presets).
import { Check as CheckIcon } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { useState } from 'react';
import { Avatar, cx, isoDate, money0 } from '../../ui/index.jsx';

export function useBase() {
  const { user } = useAuth();
  return '/' + (user?.role || 'company');
}

// A venue's logo in a small circle on white (logos are often transparent), or its initials when it has none
export function VenueBadge({ name, logo, size = 36, className }) {
  const [broken, setBroken] = useState(false);
  if (!logo || broken) return <Avatar name={name} size={size} className={className} />;
  return <img src={logo} alt={`${name} logo`} loading="lazy" decoding="async" onError={() => setBroken(true)}
    className={cx('shrink-0 rounded-full bg-white object-contain p-1 shadow-tile ring-1 ring-hairline', className)} style={{ width: size, height: size }} />;
}

export const num = (v) => Number(v || 0);
export const pct = (a, b) => (num(b) ? `${Math.round((num(a) / num(b)) * 1000) / 10}%` : '–');

export { Check } from '../../ui/index.jsx';

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

// Analytics starts on the last four weeks rather than the calendar month
export const PRESETS_4W = [{ value: 'four', label: 'Last 4 weeks' }, ...PRESETS.filter((p) => p.value !== 'last')];

export function presetRange(key) {
  if (key === 'four') {
    const to = isoDate();
    const d = new Date(`${to}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 27);
    return { from: d.toISOString().slice(0, 10), to };
  }
  const [y, m] = ym(isoDate());
  if (key === 'last') return { from: firstOf(y, m - 1), to: lastOf(y, m - 1) };
  if (key === 'three') return { from: firstOf(y, m - 2), to: lastOf(y, m) };
  return { from: firstOf(y, m), to: lastOf(y, m) };
}

/* ---------- Charts (plain divs / SVG, blue scale) ---------- */

// Horizontal bars. items: [{ label, value, display?, sub? }]
export function HBars({ items, format = (v) => v, empty = 'No data for this period', tone = 'blue' }) {
  if (!items?.length) return <p className="py-6 text-center text-subhead text-faint">{empty}</p>;
  const max = Math.max(...items.map((i) => Math.abs(num(i.value))), 1);
  return (
    <div className="space-y-2.5">
      {items.map((i, idx) => {
        const w = Math.max(2, (Math.abs(num(i.value)) / max) * 100);
        return (
          <div key={i.key ?? i.label ?? idx}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-footnote">
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
  if (!items?.length) return <p className="py-6 text-center text-subhead text-faint">{empty}</p>;
  const max = Math.max(...items.map((i) => num(i.value)), 1);
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="flex min-w-full items-end gap-1.5" style={{ height: height + 40 }}>
        {items.map((i, idx) => {
          const h = Math.max(3, (num(i.value) / max) * height);
          return (
            <div key={i.key ?? i.label ?? idx} className="flex min-w-[28px] flex-1 flex-col items-center justify-end">
              <span className="num mb-1 text-caption2 font-semibold text-muted">{format(i.value)}</span>
              <div className="w-full max-w-[44px] rounded-t-[6px] bg-blue" style={{ height: h, opacity: 0.45 + 0.55 * (num(i.value) / max) }} title={`${i.label}: ${format(i.value)}`} />
              <span className="mt-1.5 whitespace-nowrap text-caption2 text-faint">{i.label}</span>
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
              <div className="grid h-9 w-full place-items-center rounded-lg text-caption2 font-semibold num"
                style={{ background: n ? `color-mix(in srgb, var(--accent-fill, var(--color-blue)) ${Math.round(12 + 88 * (n / max))}%, transparent)` : 'var(--color-fill)', color: n / max > 0.5 ? 'var(--color-on-accent)' : 'var(--color-ink)' }}
                title={`${String(h).padStart(2, '0')}:00 – ${n}`}>{n || ''}</div>
              <span className="mt-1 text-caption2 text-faint num">{String(h).padStart(2, '0')}</span>
            </div>
          );
        })}
      </div>
      {peak && <p className="mt-3 text-footnote text-muted">Busiest hour: <span className="font-semibold text-ink">{String(peak[0]).padStart(2, '0')}:00</span> ({peak[1]})</p>}
    </div>
  );
}

// Big money figure with small caption
export const MoneyFig = ({ value, className }) => <span className={cx('num', className)}>{money0(value)}</span>;
