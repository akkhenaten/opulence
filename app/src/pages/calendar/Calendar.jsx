// The calendar: meetings, tasks and time blocks next to shifts and time off, as a day, a week, a month or a list. Tap an
// empty slot to book, drag your own to move it or its bottom edge to change its length. Company managers can open
// anyone's. Subscribe puts it all in Outlook, Apple or Google from a private link.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronLeft, ChevronRight, Copy, ExternalLink, Plus, RefreshCw, Rss } from 'lucide-react';
import { api, API_BASE } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  addDays, Button, Callout, cx, dateShort, dateTime, dayLabel, Empty, ErrorBox, IconButton, isoDate, Load, mondayOf, Page, Segmented, Select, Sheet, Spinner, time, useAction, useApi, useConfirm, useMedia, useToast, useUrlState,
} from '../../ui/index.jsx';
import { londonIso, londonParts, useBase } from '../manager/_parts.jsx';
import { EventForm, EventSheet, InboxSheet } from './_event.jsx';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR = 48; // px per hour in Day and Week
const PX = HOUR / 60;
const SNAP = 15;
const VIEWS = [{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'agenda', label: 'List' }];

const monthName = (iso) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const firstOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
const addMonths = (iso, n) => { const d = new Date(`${firstOfMonth(iso)}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const mins = (a, b) => (new Date(b) - new Date(a)) / 60000;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// The days a view shows, and where the arrows go
function span(view, d) {
  if (view === 'day') return { start: d, days: 1, step: (n) => addDays(d, n) };
  if (view === 'week') return { start: mondayOf(d), days: 7, step: (n) => addDays(d, 7 * n) };
  if (view === 'month') return { start: mondayOf(firstOfMonth(d)), days: 42, step: (n) => addMonths(d, n) };
  return { start: d, days: 30, step: (n) => addDays(d, 30 * n) };
}

const MEET = {
  mine: 'bg-indigo text-white',
  accepted: 'bg-indigo text-white',
  maybe: 'border border-dashed border-indigo/60 bg-indigo-soft text-indigo',
  pending: 'border border-dashed border-indigo/60 bg-indigo-soft text-indigo',
  declined: 'bg-fill text-muted line-through',
  cancelled: 'bg-fill text-muted line-through opacity-70',
};
// Tasks in sky; my own time blocks grey, hatched
const TASK = {
  mine: 'bg-sky text-white',
  accepted: 'bg-sky text-white',
  maybe: 'border border-dashed border-sky/60 bg-sky-soft text-sky',
  pending: 'border border-dashed border-sky/60 bg-sky-soft text-sky',
  declined: MEET.declined,
  cancelled: MEET.cancelled,
};
const BLOCK = 'border border-faint/40 bg-fill-strong text-muted bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.04)_6px_12px)]';
const BAR = { meeting: 'bg-indigo', task: 'bg-sky', block: 'bg-faint', shift: 'bg-green', off: 'bg-faint' };
const SHIFT = { accepted: 'bg-green-soft text-green border-l-[3px] border-green', assigned: 'bg-amber-soft text-amber border-l-[3px] border-amber', other: 'bg-blue-soft text-blue border-l-[3px] border-blue' };

/** Meetings, shifts and time off as one list of blocks, each knowing where it opens. */
function toItems(d, base) {
  if (!d) return [];
  const meet = d.events.map((e) => {
    const tone = e.kind === 'task' ? TASK : MEET;
    return {
      key: `e${e.id}`, type: 'meeting', kind: e.kind || 'meeting', id: e.id, starts_at: e.starts_at, ends_at: e.ends_at, all_day: e.all_day, title: e.title,
      sub: e.venue_name || (e.attendee_count > 1 ? `${e.attendee_count} people` : ''), mine: e.organiser, drag: e.organiser && !e.cancelled && !e.all_day, repeats: e.repeats,
      cls: e.kind === 'block' ? BLOCK : e.cancelled ? tone.cancelled : e.organiser ? tone.mine : tone[e.response] || tone.pending,
    };
  });
  const shifts = d.shifts.map((s) => ({
    key: `s${s.id}`, type: 'shift', id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, title: s.venue_name, sub: s.role_name, to: `${base}/shifts/${s.id}`,
    cls: new Date(s.ends_at) < new Date() ? 'bg-fill text-muted' : SHIFT[s.assignment_status] || SHIFT.other,
  }));
  const off = d.time_off.map((t) => ({
    key: `o${t.id}`, type: 'off', id: t.id, starts_at: londonIso(t.start_date.slice(0, 10), '00:00'), ends_at: londonIso(addDays(t.end_date.slice(0, 10), 1), '00:00'), all_day: true,
    title: t.kind === 'holiday' ? 'Holiday' : 'Time off', cls: 'bg-fill text-muted',
  }));
  return [...meet, ...shifts, ...off].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}
const onDay = (it, day) => new Date(it.starts_at) < new Date(londonIso(addDays(day, 1), '00:00')) && new Date(it.ends_at) > new Date(londonIso(day, '00:00'));

// Side by side when they overlap: each block gets a column and the number of columns in its cluster
function layout(blocks) {
  const out = [];
  let cluster = [];
  let cols = [];
  let end = -1;
  const flush = () => { cluster.forEach((b) => { b.n = cols.length; }); out.push(...cluster); cluster = []; cols = []; };
  for (const b of [...blocks].sort((x, y) => x.top - y.top || y.bottom - x.bottom)) {
    if (b.top >= end) { flush(); end = -1; }
    let c = cols.findIndex((last) => last <= b.top);
    if (c < 0) { c = cols.length; cols.push(0); }
    cols[c] = b.bottom;
    b.col = c;
    cluster.push(b);
    end = Math.max(end, b.bottom);
  }
  flush();
  return out;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const wide = useMedia('(min-width: 768px)');
  const [url] = useUrlState({ who: '' });
  const co = user.role === 'company';
  const opts = useApi('calendar.options', {}, { skip: !co });
  const who = co ? url.who : '';
  const person = opts.data?.people.find((p) => p.id === who);
  return (
    <Page title="Calendar" subtitle={person ? `${person.name}'s calendar` : 'Meetings, shifts and time off'} wide>
      <CalendarBoard who={who} people={co ? opts.data?.people : null} defaultView={wide ? 'week' : 'agenda'} />
    </Page>
  );
}

/** The calendar itself, for the Calendar page and the officer's Shifts. people: a person picker (company managers). */
export function CalendarBoard({ who = '', people, defaultView = 'week' }) {
  const { user } = useAuth();
  const { base } = useBase();
  const [url, setUrl] = useUrlState({ view: defaultView, d: isoDate(), event: '', show: '', who: '' });
  const view = VIEWS.some((v) => v.value === url.view) ? url.view : defaultView;
  const today = isoDate();
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(url.d) ? url.d : today;
  const { start, days, step } = span(view, anchor);
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days]);
  const q = useApi('calendar.range', { from: londonIso(start, '00:00'), to: londonIso(addDays(start, days), '00:00'), ...(who ? { user_id: who } : {}) }, { poll: 60000 });
  const items = useMemo(() => toItems(q.data, base), [q.data, base]);
  const [form, setForm] = useState(null);
  const [subscribe, setSubscribe] = useState(false);
  const [run] = useAction();

  const open = (it) => (it.type === 'meeting' ? setUrl({ event: it.id }) : null);
  const create = (startsAt, minutes = 60) => setForm({
    starts_at: startsAt, ends_at: new Date(new Date(startsAt).getTime() + minutes * 60000).toISOString(), all_day: false, attendee_ids: who && who !== user.id ? [who] : [],
  });
  const createNext = () => {
    const now = londonParts(new Date());
    const day = view === 'day' || anchor > today ? anchor : today;
    const h = day === today ? Math.min(Number(now.time.slice(0, 2)) + 1, 22) : 10;
    create(londonIso(day, hhmm(h * 60)));
  };
  const move = (it, startsAt, endsAt) => run(() => api('calendar.move', { id: it.id, starts_at: startsAt, ends_at: endsAt }), it.kind === 'block' ? 'Moved' : 'Moved. Everyone on it is asked again.')
    .then(() => q.reload()).catch(() => q.reload());

  const label = view === 'day' ? dayLabel(anchor) : view === 'week' ? `${dateShort(start)} – ${dateShort(addDays(start, 6))}` : view === 'month' ? monthName(anchor) : `${dateShort(start)} – ${dateShort(addDays(start, 29))}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={(v) => setUrl({ view: v })} options={VIEWS} />
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Previous" onClick={() => setUrl({ d: step(-1) })} />
          <Button variant="secondary" size="sm" onClick={() => setUrl({ d: today })}>Today</Button>
          <IconButton icon={ChevronRight} label="Next" onClick={() => setUrl({ d: step(1) })} />
        </div>
        <div className="num min-w-0 flex-1 truncate text-callout font-semibold">{label}</div>
        {people && (
          <Select aria-label="Whose calendar" className="w-full sm:w-56" value={who} onChange={(e) => setUrl({ who: e.target.value })}
            options={[{ value: '', label: 'My calendar' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
        )}
        {!who && <IconButton icon={Rss} label="Subscribe in Outlook, Apple or Google" onClick={() => setSubscribe(true)} />}
        <Button icon={Plus} iconOnly="phone" onClick={createNext}>New</Button>
      </div>

      {q.error && !q.data ? <ErrorBox error={q.error} retry={q.reload} /> : !q.data ? <Spinner /> : (
        view === 'month' ? <MonthGrid dates={dates} anchor={anchor} today={today} items={items} open={open} pickDay={(d) => setUrl({ view: 'day', d })} />
          : view === 'agenda' ? <Agenda dates={dates} today={today} items={items} open={open} create={createNext} />
            : <TimeGrid dates={dates} today={today} items={items} open={open} create={create} move={move} />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo" />Meeting</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky" />Task</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-faint/40 bg-fill-strong" />Time block</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-indigo bg-indigo-soft" />Awaiting reply</span>
        {user.role !== 'venue' && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green" />Shift</span>}
        {user.role !== 'venue' && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-faint" />Time off</span>}
      </div>

      {url.event && <EventSheet id={url.event} onClose={() => setUrl({ event: '' })} onChanged={q.reload} onEdit={(e) => { setUrl({ event: '' }); setForm({ event: e }); }} />}
      {url.show && !url.event && <InboxSheet show={url.show} onClose={() => setUrl({ show: '' })} onOpen={(id) => setUrl({ event: id })} />}
      {subscribe && <SubscribeSheet onClose={() => setSubscribe(false)} />}
      {form && <EventForm init={form} onClose={() => setForm(null)} onSaved={(e) => { setForm(null); q.reload(); if (e?.id) setUrl({ event: e.id, d: londonParts(e.starts_at).date }); }} />}
    </div>
  );
}

/* ---------- Day and Week: hours down the side, drag to move ---------- */

function TimeGrid({ dates, today, items, open, create, move }) {
  const scroller = useRef(null);
  const [drag, setDrag] = useState(null);
  const [colW, setColW] = useState(0);
  const cols = useRef(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * HOUR - 8; }, [dates.length]);
  useEffect(() => {
    const el = cols.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setColW(el.getBoundingClientRect().width / dates.length));
    ro.observe(el);
    return () => ro.disconnect();
  }, [dates.length]);

  const allDay = (d) => items.filter((it) => (it.all_day || mins(it.starts_at, it.ends_at) >= 1440) && onDay(it, d));
  const timed = (d) => layout(items.filter((it) => !it.all_day && mins(it.starts_at, it.ends_at) < 1440 && onDay(it, d)).map((it) => {
    const dayStart = londonIso(d, '00:00');
    return { it, top: Math.max(0, mins(dayStart, it.starts_at)), bottom: Math.min(1440, mins(dayStart, it.ends_at)) };
  }));
  const hasAllDay = dates.some((d) => allDay(d).length);
  const now = londonParts(new Date());
  const nowMin = Number(now.time.slice(0, 2)) * 60 + Number(now.time.slice(3, 5));

  // Snapped change from a drag: minutes down, days across (Week only)
  const delta = (g) => ({ dm: Math.round(g.dy / PX / SNAP) * SNAP, dd: g.mode === 'move' && colW ? Math.round(g.dx / colW) : 0 });
  const startDrag = (e, it, mode) => {
    if (!it.drag || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ key: it.key, it, mode, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 });
  };
  const moveDrag = (e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
  const endDrag = () => {
    if (!drag) return;
    const { it, mode } = drag;
    const { dm, dd } = delta(drag);
    setDrag(null);
    if (Math.abs(drag.dx) < 4 && Math.abs(drag.dy) < 4) return open(it);
    if (!dm && !dd) return null;
    const shift = (iso, m) => new Date(new Date(iso).getTime() + m * 60000).toISOString();
    if (mode === 'resize') {
      const end = shift(it.ends_at, dm);
      return mins(it.starts_at, end) >= SNAP ? move(it, it.starts_at, end) : null;
    }
    const m = dm + dd * 1440;
    return move(it, shift(it.starts_at, m), shift(it.ends_at, m));
  };

  return (
    <div className="overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile">
      {/* Day heads and the all-day row */}
      <div className="flex border-b border-hairline">
        <div className="w-12 shrink-0" />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}>
          {dates.map((d) => {
            const n = new Date(`${d}T12:00:00Z`).getUTCDay();
            return (
              <div key={d} className="min-w-0 border-l border-hairline px-1 py-1.5 text-center">
                <div className="text-caption2 font-semibold uppercase text-muted">{DOW[(n + 6) % 7]}</div>
                <div className={cx('num mx-auto grid h-7 w-7 place-items-center rounded-full text-subhead font-semibold', d === today && 'bg-red text-white')}>{Number(d.slice(8, 10))}</div>
                {hasAllDay && (
                  <div className="mt-1 space-y-0.5">
                    {allDay(d).map((it) => <Chip key={it.key} it={it} onClick={() => open(it)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div ref={scroller} className="h-[560px] overflow-y-auto overscroll-contain">
        <div className="relative flex" style={{ height: 24 * HOUR }}>
          <div className="w-12 shrink-0">
            {Array.from({ length: 23 }, (_, h) => (
              <div key={h} className="num absolute right-auto w-11 pr-1 text-right text-caption2 text-faint" style={{ top: (h + 1) * HOUR - 7 }}>{hhmm((h + 1) * 60)}</div>
            ))}
          </div>
          <div ref={cols} className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}
            onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
            {dates.map((d, di) => (
              // Tap an empty half hour to book it
              <div key={d} className="relative border-l border-hairline" role="presentation"
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const m = Math.floor((e.clientY - e.currentTarget.getBoundingClientRect().top) / PX / 30) * 30;
                  create(londonIso(d, hhmm(Math.min(m, 1410))));
                }}>
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-hairline/70" style={{ top: h * HOUR }} />)}
                {d === today && <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red" style={{ top: nowMin * PX }}><span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red" /></div>}
                {timed(d).map(({ it, top, bottom, col, n }) => {
                  const g = drag?.key === it.key ? drag : null;
                  const { dm, dd } = g ? delta(g) : { dm: 0, dd: 0 };
                  const moving = g && g.mode === 'move';
                  const t = top + (moving ? dm : 0);
                  const h = Math.max(SNAP, bottom - top + (g && g.mode === 'resize' ? dm : 0));
                  const short = h < 45;
                  return (
                    <div key={`${it.key}${di}`} role="button" tabIndex={0} aria-label={`${it.title}, ${time(it.starts_at)} to ${time(it.ends_at)}`}
                      title={`${it.title} · ${time(it.starts_at)}–${time(it.ends_at)}`}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(it); } }}
                      onPointerDown={(e) => startDrag(e, it, 'move')}
                      onClick={(e) => { e.stopPropagation(); if (!it.drag) open(it); }}
                      className={cx('absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-caption2 leading-tight shadow-sm', it.cls,
                        it.drag ? 'cursor-grab touch-none select-none' : it.type === 'meeting' && 'cursor-pointer', g && 'z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-blue')}
                      style={{ top: t * PX, height: h * PX - 1, left: `calc(${(col / n) * 100}% + 1px)`, width: `calc(${100 / n}% - 3px)`, transform: dd ? `translateX(${dd * colW}px)` : undefined }}>
                      {it.to
                        ? <Link to={it.to} className="block truncate font-semibold" onClick={(e) => e.stopPropagation()}>{it.title}</Link>
                        : <div className={cx('font-semibold', short ? 'truncate' : 'line-clamp-2')}>{it.title}</div>}
                      {!short && <div className="num truncate opacity-80">{g ? `${hhmm(((t % 1440) + 1440) % 1440)}–${hhmm((((t + h) % 1440) + 1440) % 1440)}` : `${time(it.starts_at)}–${time(it.ends_at)}`}</div>}
                      {!short && it.sub && h >= 70 && <div className="truncate opacity-80">{it.sub}</div>}
                      {it.drag && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" onPointerDown={(e) => startDrag(e, it, 'resize')} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ it, onClick }) {
  const body = <><span className="truncate">{it.all_day || mins(it.starts_at, it.ends_at) >= 1440 ? '' : <span className="num mr-1 opacity-80">{time(it.starts_at)}</span>}{it.title}</span></>;
  const cls = cx('block w-full truncate rounded px-1 py-px text-left text-caption2 font-semibold', it.cls);
  if (it.to) return <Link to={it.to} className={cls} onClick={(e) => e.stopPropagation()}>{body}</Link>;
  return (
    <div role="button" tabIndex={0} className={cx(cls, it.type === 'meeting' && 'cursor-pointer')}
      onClick={(e) => { e.stopPropagation(); onClick(); }} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}>{body}</div>
  );
}

/* ---------- Month ---------- */

function MonthGrid({ dates, anchor, today, items, open, pickDay }) {
  const month = anchor.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile">
      <div className="grid grid-cols-7 border-b border-hairline">
        {DOW.map((d) => <div key={d} className="py-1.5 text-center text-caption2 font-semibold uppercase text-muted">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dates.map((d) => {
          const list = items.filter((it) => onDay(it, d));
          return (
            <div key={d} role="button" tabIndex={0} onClick={() => pickDay(d)} onKeyDown={(e) => { if (e.key === 'Enter') pickDay(d); }}
              className={cx('min-h-[92px] cursor-pointer border-b border-l border-hairline p-1 hover:bg-fill/50', d.slice(0, 7) !== month && 'bg-fill/40')}>
              <div className={cx('num mb-0.5 grid h-6 w-6 place-items-center rounded-full text-caption font-semibold', d === today ? 'bg-red text-white' : d.slice(0, 7) !== month && 'text-faint')}>{Number(d.slice(8, 10))}</div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((it) => <Chip key={it.key} it={it} onClick={() => open(it)} />)}
                {list.length > 3 && <div className="px-1 text-caption2 font-semibold text-muted">+{list.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- List ---------- */

function Agenda({ dates, today, items, open, create }) {
  const groups = dates.map((d) => ({ d, list: items.filter((it) => onDay(it, d)) })).filter((g) => g.list.length);
  if (!groups.length) return <Empty icon={CalendarClock} title="Nothing booked" body="Meetings, tasks, shifts and time off in the next 30 days show here." action={<Button icon={Plus} onClick={create}>New</Button>} />;
  return (
    <div className="space-y-4">
      {groups.map(({ d, list }) => (
        <section key={d}>
          <h3 className={cx('mb-1.5 px-1 text-footnote font-semibold uppercase', d === today ? 'text-red' : 'text-muted')}>{d === today ? `Today · ${dayLabel(d)}` : dayLabel(d)}</h3>
          <div className="overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile">
            {list.map((it) => {
              const allDay = it.all_day || mins(it.starts_at, it.ends_at) >= 1440;
              const inner = (
                <>
                  <div className="num w-14 shrink-0 text-footnote">
                    {allDay ? <span className="text-muted">All day</span> : <><div className="font-semibold">{time(it.starts_at)}</div><div className="text-muted">{time(it.ends_at)}</div></>}
                  </div>
                  <span className={cx('w-1 self-stretch rounded-full', BAR[it.type === 'meeting' ? it.kind : it.type])} />
                  <div className="min-w-0 flex-1">
                    <div className={cx('truncate text-body font-semibold', /line-through/.test(it.cls) && 'line-through text-muted')}>{it.title}</div>
                    <div className="truncate text-footnote text-muted">{[
                      it.type === 'shift' ? 'Shift' : it.type === 'off' ? '' : it.kind === 'block' ? 'Time block' : it.mine ? (it.kind === 'task' ? 'Task you booked' : 'You organise') : /dashed/.test(it.cls) ? 'Awaiting your reply' : it.kind === 'task' ? 'Task' : '',
                      it.repeats && 'Repeats', it.sub,
                    ].filter(Boolean).join(' · ')}</div>
                  </div>
                </>
              );
              const cls = 'flex w-full items-center gap-3 border-b border-hairline px-3 py-2.5 text-left last:border-0 hover:bg-fill/50';
              return it.to ? <Link key={it.key} to={it.to} className={cls}>{inner}</Link>
                : <div key={it.key} role="button" tabIndex={0} className={cx(cls, it.type === 'meeting' && 'cursor-pointer')} onClick={() => open(it)} onKeyDown={(e) => { if (e.key === 'Enter') open(it); }}>{inner}</div>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- Subscribe: my calendar in Outlook, Apple or Google ---------- */

function SubscribeSheet({ onClose }) {
  const q = useApi('calendar.feed', {});
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const reset = async () => {
    if (!(await confirm({ title: 'Reset the link?', body: 'The old link stops working. Calendars subscribed with it stop updating until you add the new one.', confirm: 'Reset link', danger: true }))) return;
    run(() => api('calendar.feedReset', {}), 'New link made. The old one is off.').then(q.setData).catch(() => {});
  };
  return (
    <Sheet open onClose={onClose} title="Subscribe to my calendar">
      <Load q={q} skeleton="rows">
        {(d) => {
          const url = `${API_BASE}${API_BASE.includes('?') ? '&' : '?'}feed=${d.token}`;
          const copy = () => navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast('Could not copy. Select it and copy it by hand.', 'error'));
          return (
            <div className="space-y-4">
              <p className="text-body">Your meetings, tasks, time blocks and shifts, in the calendar on your phone or computer. It updates by itself, about every hour. It only shows; reply and change things here.</p>
              <div className="space-y-2">
                <code className="block break-all rounded-xl bg-bg px-3 py-2 font-mono text-caption">{url}</code>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={Copy} onClick={copy}>Copy link</Button>
                  <Button variant="secondary" icon={ExternalLink} href={url.replace(/^https?:/, 'webcal:')}>Open in my calendar</Button>
                </div>
              </div>
              <ul className="space-y-1.5 text-footnote text-muted">
                <li><span className="font-semibold text-ink">Outlook:</span> Add calendar → Subscribe from web → paste the link.</li>
                <li><span className="font-semibold text-ink">iPhone or Mac:</span> tap Open in my calendar, or File → New Calendar Subscription.</li>
                <li><span className="font-semibold text-ink">Google:</span> Other calendars → + → From URL → paste the link. Google checks it every few hours.</li>
              </ul>
              <Callout tone="warning" title="Keep it private">Anyone with the link can see your calendar. If it gets out, reset it: the old link stops working.</Callout>
              <div className="flex items-center justify-between gap-3">
                <span className="text-footnote text-muted">{d.last_used_at ? `Last read by a calendar ${dateTime(d.last_used_at)}` : 'Not added to a calendar yet'}</span>
                <Button variant="danger" size="sm" icon={RefreshCw} busy={busy} onClick={reset}>Reset link</Button>
              </div>
            </div>
          );
        }}
      </Load>
    </Sheet>
  );
}
