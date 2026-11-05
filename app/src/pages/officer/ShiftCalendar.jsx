// My shifts as a calendar: a month grid or a week of columns, each shift a block that opens the shift page
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import { addDays, cx, IconButton, isoDate, mondayOf, Segmented, Spinner, ErrorBox, time, useApi, Pressable } from '../../ui/index.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TONE = {
  accepted: 'bg-green text-white',
  assigned: 'bg-amber-soft text-amber ring-1 ring-amber/40',
  requested: 'bg-blue-soft text-blue',
  past: 'bg-fill text-muted',
};
const monthName = (iso) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const dayNum = (iso) => Number(iso.slice(8, 10));
const firstOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso, n) => { const d = new Date(`${firstOfMonth(iso)}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const tone = (s) => (new Date(s.ends_at) < new Date() ? TONE.past : TONE[s.assignment_status] || TONE.past);

export default function ShiftCalendar() {
  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(isoDate());
  const today = isoDate();
  const start = view === 'month' ? mondayOf(firstOfMonth(anchor)) : mondayOf(anchor);
  const days = view === 'month' ? 42 : 7;
  const end = addDays(start, days);
  const q = useApi('shifts.mine', { from: new Date(`${start}T00:00:00Z`).toISOString(), to: new Date(`${end}T00:00:00Z`).toISOString() });

  const byDay = useMemo(() => {
    const m = {};
    for (const s of q.data || []) (m[isoDate(s.starts_at)] ||= []).push(s);
    return m;
  }, [q.data]);
  const grid = Array.from({ length: days }, (_, i) => addDays(start, i));
  const step = (n) => setAnchor(view === 'month' ? addMonths(anchor, n) : addDays(anchor, 7 * n));
  const mon = (iso) => monthName(iso).split(' ')[0].slice(0, 3);
  const last = addDays(start, 6);
  const title = view === 'month' ? monthName(anchor)
    : mon(start) === mon(last) ? `${dayNum(start)}–${dayNum(last)} ${mon(last)}` : `${dayNum(start)} ${mon(start)} – ${dayNum(last)} ${mon(last)}`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Previous" onClick={() => step(-1)} />
          <Pressable press onClick={() => setAnchor(today)} className="pressable min-w-0 px-1 text-headline font-bold">{title}</Pressable>
          <IconButton icon={ChevronRight} label="Next" onClick={() => step(1)} />
        </div>
        <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
      </div>
      {q.error && !q.data ? <ErrorBox error={q.error} retry={q.reload} /> : !q.data ? <Spinner /> : view === 'month' ? (
        <div className="overflow-hidden rounded-tile bg-surface shadow-tile">
          <div className="grid grid-cols-7 border-b border-sep">
            {DOW.map((d) => <div key={d} className="py-2 text-center text-caption font-semibold text-muted">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((d) => {
              const list = byDay[d] || [];
              const other = d.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div key={d} className={cx('relative min-h-[72px] border-b border-r border-sep p-1 sm:min-h-[96px]', other && 'bg-bg/50')}>
                  {/* On phones the whole day is the tap target: one shift opens it, more open that week. */}
                  {list.length > 0 && (list.length === 1
                    ? <Pressable press to={`/officer/shifts/${list[0].id}`} aria-label={`Shift on ${d}`} className="absolute inset-0 z-10 sm:hidden" />
                    : <Pressable press onClick={() => { setAnchor(d); setView('week'); }} aria-label={`${list.length} shifts on ${d}`} className="absolute inset-0 z-10 sm:hidden" />)}
                  <div className={cx('num mb-0.5 grid h-6 w-6 place-items-center rounded-full text-caption font-semibold', d === today ? 'bg-blue text-white' : other ? 'text-faint' : 'text-ink')}>{dayNum(d)}</div>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((s) => (
                      <Pressable press key={s.assignment_id} to={`/officer/shifts/${s.id}`} className={cx('block w-full truncate rounded-md px-1 py-0.5 text-left text-caption2 font-semibold leading-tight', tone(s))}>
                        <span className="num">{time(s.starts_at)}</span><span className="hidden sm:inline"> {s.venue_name}</span>
                      </Pressable>
                    ))}
                    {list.length > 3 && <div className="px-1 text-caption2 text-muted">+{list.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {grid.map((d) => {
            const list = byDay[d] || [];
            return (
              <div key={d} className={cx('rounded-tile bg-surface p-2 shadow-tile sm:min-h-[220px]', d === today && 'ring-2 ring-blue')}>
                <div className="mb-1.5 flex items-baseline gap-1.5 px-1 sm:flex-col sm:gap-0">
                  <span className="text-caption font-semibold uppercase text-muted">{DOW[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]}</span>
                  <span className="num text-headline font-bold">{dayNum(d)}</span>
                </div>
                {!list.length ? <div className="px-1 text-caption text-faint sm:hidden">Nothing booked</div> : (
                  <div className="space-y-1.5">
                    {list.map((s) => (
                      <Pressable press key={s.assignment_id} to={`/officer/shifts/${s.id}`} className={cx('block w-full rounded-xl p-2 text-left', tone(s))}>
                        <div className="num text-footnote font-bold">{time(s.starts_at)}–{time(s.ends_at)}</div>
                        <div className="flex items-center gap-1 truncate text-caption font-semibold">{s.is_lead && <Crown size={14} className="shrink-0" />}{s.venue_name}</div>
                        <div className="truncate text-caption opacity-80">{s.role_name}</div>
                      </Pressable>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green" />Confirmed</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-soft ring-1 ring-amber/40" />Please respond</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-soft" />Requested</span>
        <span className="inline-flex items-center gap-1.5"><Crown size={14} />You lead</span>
      </div>
    </div>
  );
}
