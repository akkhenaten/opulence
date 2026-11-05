import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Crown, Hand, NotebookPen, Plus, Repeat, Send, Trash2, UserMinus, UserPlus, X,
} from 'lucide-react';
import {
  addDays, AssignPill, Avatar, Button, confirmState, cx, dateShort, dayLabel, Empty, ErrorBox, IconButton, Input, isoDate, KV, List, Load, mondayOf, Page, Pill, Pressable, range, Row, Segmented, Select, Sheet, Spinner, Tabs, Textarea, time, titleCase, Toggle, useAction, useApi, useConfirm, useForm, useToast, nameMatches, withGoesBy,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { WEEKDAYS, durationH, londonIso, londonParts, shiftTimes, useBase } from './_parts.jsx';
import { PackPill } from '../shared/PackPaper.jsx';

const dayOf = (iso) => londonParts(iso).date;
const ACTIVE = ['assigned', 'accepted'];

export default function Rota() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'requests' ? 'requests' : 'rota';
  const setTab = (t) => { const n = new URLSearchParams(sp); if (t === 'rota') n.delete('tab'); else n.set('tab', t); setSp(n, { replace: true }); };
  const openId = sp.get('shift');
  const setOpenId = (id) => { const n = new URLSearchParams(sp); if (id) n.set('shift', id); else n.delete('shift'); setSp(n, { replace: true }); };

  const [week, setWeek] = useState(() => mondayOf(isoDate()));
  const [venueId, setVenueId] = useState('');
  const [view, setView] = useState('days');
  const [form, setForm] = useState(null); // { shift? , date? }

  const venues = useApi('venues.list', {});
  const roles = useApi('roles.list', {});
  const reqs = useApi('shifts.pendingRequests', {});
  const body = useMemo(() => ({ from: londonIso(week), to: londonIso(addDays(week, 7)), ...(venueId ? { venue_id: venueId } : {}) }), [week, venueId]);
  const shifts = useApi('shifts.list', body);
  const [run, busy] = useAction();
  const confirm = useConfirm();

  const roleName = (code) => roles.data?.find((r) => r.code === code)?.name || titleCase(code);
  const drafts = (shifts.data || []).filter((s) => s.status === 'draft');
  const reload = () => { shifts.reload(); reqs.reload(); };

  const publish = async () => {
    if (!(await confirm({ title: `Publish ${drafts.length} draft shift${drafts.length > 1 ? 's' : ''}?`, body: 'Assigned officers are notified, and open shifts are offered to officers.', confirm: 'Publish' }))) return;
    run(() => api('shifts.publish', { ids: drafts.map((s) => s.id) }), (r) => `${r.published} published`).then(reload).catch(() => {});
  };
  const copyWeek = async () => {
    const from = addDays(week, -7);
    if (!(await confirm({ title: 'Copy last week?', body: `Copies all shifts from the week of ${dateShort(from)} into this week as drafts${venueId ? ' (this venue only)' : ''}. Officers are not copied.`, confirm: 'Copy shifts' }))) return;
    run(() => api('shifts.copyWeek', { from_week: from, to_week: week, ...(venueId ? { venue_id: venueId } : {}) }), (r) => `${r.created} shifts copied`).then(reload).catch(() => {});
  };

  const weekLabel = `${dateShort(week)} – ${dateShort(addDays(week, 6))}`;
  const isThisWeek = week === mondayOf(isoDate());

  return (
    <Page title="Rota" subtitle={tab === 'rota' ? `Week of ${dayLabel(week)}` : 'Officer requests for open shifts'} wide
      actions={tab === 'rota' && <>
        <Button variant="secondary" icon={Copy} onClick={copyWeek} busy={busy}><span className="hidden sm:inline">Copy last week</span></Button>
        {drafts.length > 0 && <Button variant="soft" icon={Send} onClick={publish} busy={busy}>Publish {drafts.length}</Button>}
        <Button icon={Plus} onClick={() => setForm({})}>New shift</Button>
      </>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'rota', label: 'Rota' }, { value: 'requests', label: 'Requests', count: reqs.data?.length }]} />

      {tab === 'requests' ? <Requests q={reqs} roleName={roleName} onChanged={reload} onOpen={setOpenId} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-surface p-1 shadow-tile">
              <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeek(addDays(week, -7))} />
              <span className="num min-w-[132px] text-center text-subhead font-semibold">{weekLabel}</span>
              <IconButton icon={ChevronRight} label="Next week" onClick={() => setWeek(addDays(week, 7))} />
            </div>
            {!isThisWeek && <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf(isoDate()))}>Today</Button>}
            <Select className="w-full md:w-auto md:min-w-[200px] md:max-w-[240px]" value={venueId} onChange={(e) => setVenueId(e.target.value)} placeholder="All venues"
              options={(venues.data || []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.name }))} />
            <Segmented full value={view} onChange={setView} className="w-full md:ml-auto md:w-auto"
              options={[{ value: 'days', label: 'By day' }, { value: 'venues', label: 'By venue' }, { value: 'officers', label: 'By officer' }]} />
          </div>
          <Load q={shifts}>{(rows) => {
            const props = { rows, week, onOpen: (s) => setOpenId(s.id), onAdd: (date, vid) => setForm({ date, venue_id: vid }) };
            if (view === 'venues') {
              const vs = (venues.data || []).filter((v) => v.active && (!venueId || v.id === venueId));
              if (!vs.length) return <Empty icon={CalendarDays} title="No venues" />;
              return <><VenueGrid {...props} venues={vs} /><VenueAgenda {...props} venues={vs} /></>;
            }
            if (view === 'officers') {
              if (!rows.length) return <Empty icon={CalendarDays} title="No shifts this week" />;
              return <><OfficerGrid {...props} /><OfficerAgenda {...props} /></>;
            }
            return <DayList {...props} />;
          }}</Load>
        </>
      )}

      {openId && <ShiftDetail id={openId} roleName={roleName} onClose={() => setOpenId(null)} onChanged={reload}
        onEdit={(s) => { setOpenId(null); setForm({ shift: s }); }} />}
      {form && <ShiftForm init={form} venues={(venues.data || []).filter((v) => v.active)} roles={roles.data || []} onClose={() => setForm(null)}
        onSaved={(d) => { setForm(null); if (d && (d >= addDays(week, 7) || d < week)) setWeek(mondayOf(d)); reload(); }} />}
    </Page>
  );
}

/* ---------- Shared helpers ---------- */

// Same columns in every row (minmax(0,1fr) stops wide cards from stretching one row's columns)
const COLS = 'grid-cols-[150px_repeat(7,minmax(0,1fr))]';
const STICKY = 'sticky left-0 z-10 bg-surface shadow-[1px_0_0_var(--color-line)]';
const DAYS = (week) => Array.from({ length: 7 }, (_, i) => addDays(week, i));
const isShort = (s) => s.filled < s.headcount;
// Drafts have not been sent to anyone yet, so only published shifts can be waiting on confirmations
const shiftState = (s) => {
  const st = confirmState({ filled: s.filled, headcount: s.headcount, statuses: s.assignments.filter((a) => ACTIVE.includes(a.status)).map((a) => a.status) });
  return st === 'unconfirmed' && s.status !== 'published' ? 'confirmed' : st;
};
const [wdOf, dateOf] = [(d) => dayLabel(d).split(' ')[0], (d) => dayLabel(d).split(' ').slice(1).join(' ')];

// Folds runs of empty days into one group so phone lists stay short
function foldDays(days, has) {
  const out = [];
  for (const d of days) {
    const last = out[out.length - 1];
    if (!has(d) && last?.empty) last.days.push(d);
    else out.push({ days: [d], empty: !has(d) });
  }
  return out;
}
const foldLabel = (g) => (g.days.length > 1 ? `${dayLabel(g.days[0])} – ${dayLabel(g.days[g.days.length - 1])}` : dayLabel(g.days[0]));

function DayTag({ days, today }) {
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <div className={cx('w-[56px] shrink-0 pt-0.5 text-caption font-semibold uppercase leading-tight tracking-wide', days.includes(today) ? 'text-blue' : 'text-muted')}>
      <div>{days.length > 1 ? `${wdOf(first)}–${wdOf(last)}` : wdOf(first)}</div>
      {days.length === 1 && <div className="font-medium normal-case opacity-80">{dateOf(first)}</div>}
    </div>
  );
}

function useOfficerRows(rows) {
  return useMemo(() => {
    const m = new Map();
    for (const s of rows) for (const a of s.assignments) if ([...ACTIVE, 'requested'].includes(a.status)) m.set(a.officer_id, a.is_self ? `${a.name} (You)` : a.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => {
      const mine = rows.filter((s) => s.assignments.some((a) => a.officer_id === id && [...ACTIVE, 'requested'].includes(a.status)));
      const hours = mine.filter((s) => s.assignments.some((a) => a.officer_id === id && ACTIVE.includes(a.status))).reduce((n, s) => n + durationH(s.starts_at, s.ends_at), 0);
      return { id, name, mine, hours: Math.round(hours * 10) / 10 };
    });
  }, [rows]);
}

const orderVenues = (rows, venues) => {
  const ids = new Set(rows.map((s) => s.venue_id));
  return venues.filter((v) => ids.has(v.id)).concat(venues.filter((v) => !ids.has(v.id)));
};

/* ---------- Shift card ---------- */

function ShiftCard({ s, onOpen, showVenue = true, compact }) {
  const state = shiftState(s);
  const requested = s.assignments.filter((a) => a.status === 'requested').length;
  const people = s.assignments.filter((a) => ACTIVE.includes(a.status));
  return (
    <Pressable press onClick={() => onOpen(s)}
      className={cx('relative block w-full overflow-hidden rounded-2xl border bg-surface text-left shadow-tile transition hover:-translate-y-0.5 active:scale-[0.99]',
        compact ? 'py-2 pl-2.5 pr-2' : 'p-3 pl-3.5', s.status === 'draft' ? 'border-dashed border-faint/60' : 'border-hairline')}>
      {s.status === 'published' && state !== 'confirmed' && <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[3px]', state === 'short' ? 'bg-red' : 'bg-amber')} />}
      <div className={cx('num whitespace-nowrap font-bold', compact ? 'text-footnote' : 'text-body')}>{range(s.starts_at, s.ends_at)}</div>
      {showVenue && <div className="mt-0.5 truncate text-subhead font-semibold">{s.venue_name}</div>}
      <div className="mt-1 flex items-center justify-between gap-1.5">
        <span className={cx('min-w-0 truncate text-muted', compact ? 'text-caption' : 'text-footnote')}>{s.role_name}</span>
        <Pill tone={state === 'short' ? (s.status === 'draft' ? 'grey' : 'red') : state === 'unconfirmed' ? 'amber' : 'green'} className="num shrink-0">
          {s.filled}/{s.headcount}{state === 'unconfirmed' && !compact && ' · Unconfirmed'}
        </Pill>
      </div>
      {(s.status === 'draft' || s.open || requested > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {s.status === 'draft' && <Pill status="draft" />}
          {s.open && <Pill tone="blue">Open</Pill>}
          {requested > 0 && <Pill tone="amber">{requested} request{requested > 1 ? 's' : ''}</Pill>}
        </div>
      )}
      {!compact && people.length > 0 && (
        <div className="mt-2 truncate text-caption text-muted">
          {people.map((a, i) => (
            <span key={a.id}>{i > 0 && ', '}
              {s.status === 'published' && <span aria-hidden className={cx('mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle', a.status === 'accepted' ? 'bg-green' : 'bg-amber')} />}
              {a.is_self ? `${a.name} (You)` : a.name}
            </span>
          ))}
        </div>
      )}
    </Pressable>
  );
}

function OfficerChip({ s, oid, onOpen }) {
  const a = s.assignments.find((x) => x.officer_id === oid);
  return (
    <Pressable press onClick={() => onOpen(s)} className={cx('block w-full rounded-xl p-2 text-left text-caption transition hover:-translate-y-0.5', a.status === 'requested' || (a.status === 'assigned' && s.status === 'published') ? 'bg-amber-soft' : s.status === 'draft' ? 'bg-bg' : 'bg-green-soft')}>
      <div className="num whitespace-nowrap font-bold">{range(s.starts_at, s.ends_at)}</div>
      <div className="truncate text-muted">{s.venue_name}</div>
      {a.status !== 'accepted' && <div className="font-semibold">{a.status === 'assigned' ? (s.status === 'published' ? 'Unconfirmed' : 'Draft') : titleCase(a.status)}</div>}
    </Pressable>
  );
}

/* ---------- By day ---------- */

function DayList({ rows, week, onOpen, onAdd }) {
  const today = isoDate();
  const days = DAYS(week);
  const byDay = useMemo(() => {
    const m = {};
    for (const s of rows) (m[dayOf(s.starts_at)] ||= []).push(s);
    return m;
  }, [rows]);
  const todayRef = useRef(null);
  useEffect(() => {
    // On phones, jump to today when it isn't the first day shown
    if (todayRef.current && today !== week && window.matchMedia('(max-width: 767px)').matches) todayRef.current.scrollIntoView({ block: 'start' });
  }, [week]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Phone: agenda with sticky day headers */}
      <div className="md:hidden">
        {foldDays(days, (d) => byDay[d]?.length).map((g) => {
          const d = g.days[0];
          return (
            <section key={d} className="mb-1">
              <div ref={d === today ? todayRef : undefined}
                className="sticky-below-header sticky z-10 -mx-4 flex scroll-mt-14 items-center justify-between bg-bg/90 px-4 py-2 backdrop-blur">
                <span className={cx('text-footnote font-semibold uppercase tracking-wide', g.days.includes(today) ? 'text-blue' : 'text-muted')}>
                  {foldLabel(g)}{d === today ? ' · Today' : ''}
                </span>
                <Pressable press onClick={() => onAdd(d)} className="-my-2 px-1 py-2 text-footnote font-semibold text-blue" aria-label={`Add shift ${dayLabel(d)}`}>+ Add</Pressable>
              </div>
              {g.empty
                ? <div className="mb-2 rounded-2xl border border-dashed border-line px-4 py-3 text-footnote text-faint">No shifts</div>
                : <div className="mb-2 space-y-2">{byDay[d].map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} />)}</div>}
            </section>
          );
        })}
      </div>

      {/* Tablet/desktop: week board, one column per day */}
      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => (
          <div key={d} className={cx('min-w-0 rounded-tile p-2', d === today ? 'bg-blue-soft/60' : 'bg-fill/60')}>
            <div className="mb-2 flex items-center justify-between pl-1.5">
              <span className={cx('whitespace-nowrap text-caption font-semibold uppercase tracking-wide', d === today ? 'text-blue' : 'text-muted')}>{dayLabel(d)}</span>
              <Pressable press onClick={() => onAdd(d)} aria-label={`Add shift ${dayLabel(d)}`} className="-m-1.5 grid h-10 w-10 place-items-center rounded-full text-blue transition hover:bg-surface"><Plus size={16} /></Pressable>
            </div>
            {byDay[d]?.length
              ? <div className="space-y-2">{byDay[d].map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} />)}</div>
              : <div className="rounded-2xl border border-dashed border-line px-3 py-3 text-footnote text-faint">No shifts</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- Week grids (tablet/desktop) ---------- */

function GridFrame({ week, children }) {
  const today = isoDate();
  return (
    <div className="hidden overflow-x-auto rounded-tile border border-hairline bg-surface shadow-tile md:block">
      <div className="min-w-[860px]">
        <div className={cx('grid border-b border-line text-caption font-semibold uppercase tracking-wide text-faint', COLS)}>
          <div className={cx(STICKY, 'px-3 py-2.5')} />
          {DAYS(week).map((d) => (
            <div key={d} className={cx('whitespace-nowrap border-l border-line px-2 py-2.5', d === today && 'text-blue')}>{dayLabel(d)}</div>
          ))}
        </div>
        <div className="divide-y divide-line">{children}</div>
      </div>
    </div>
  );
}

function VenueGrid({ rows, week, venues, onOpen, onAdd }) {
  return (
    <GridFrame week={week}>
      {orderVenues(rows, venues).map((v) => (
        <div key={v.id} className={cx('grid', COLS)}>
          <div className={cx(STICKY, 'px-3 py-3 text-subhead font-semibold')}>{v.name}</div>
          {DAYS(week).map((d) => (
            <div key={d} className="group min-w-0 space-y-1.5 border-l border-line p-1.5">
              {rows.filter((s) => s.venue_id === v.id && dayOf(s.starts_at) === d).map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} showVenue={false} compact />)}
              <Pressable press onClick={() => onAdd(d, v.id)} className="w-full rounded-xl py-1 text-footnote font-semibold text-faint opacity-40 transition hover:bg-blue-soft hover:text-blue hover:opacity-100 group-hover:opacity-100 focus:opacity-100" aria-label="Add shift">+</Pressable>
            </div>
          ))}
        </div>
      ))}
    </GridFrame>
  );
}

function OfficerGrid({ rows, week, onOpen }) {
  const officers = useOfficerRows(rows);
  const unfilled = rows.filter(isShort);
  const days = DAYS(week);
  return (
    <GridFrame week={week}>
      <div className={cx('grid bg-red-soft/40', COLS)}>
        <div className={cx(STICKY, 'bg-red-soft/70 px-3 py-3')}><div className="text-subhead font-semibold text-red">Unfilled</div><div className="num text-caption text-muted">{((n) => `${n} place${n === 1 ? '' : 's'}`)(unfilled.reduce((n, s) => n + s.headcount - s.filled, 0))}</div></div>
        {days.map((d) => (
          <div key={d} className="min-w-0 space-y-1.5 border-l border-line p-1.5">
            {unfilled.filter((s) => dayOf(s.starts_at) === d).map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} compact />)}
          </div>
        ))}
      </div>
      {officers.map((o) => (
        <div key={o.id} className={cx('grid', COLS)}>
          <div className={cx(STICKY, 'flex items-center gap-2 px-3 py-3')}><Avatar name={o.name} size={30} /><div className="min-w-0"><div className="truncate text-subhead font-semibold">{o.name}</div><div className="num text-caption text-muted">{o.hours}h</div></div></div>
          {days.map((d) => (
            <div key={d} className="min-w-0 space-y-1.5 border-l border-line p-1.5">
              {o.mine.filter((s) => dayOf(s.starts_at) === d).map((s) => <OfficerChip key={s.id} s={s} oid={o.id} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      ))}
    </GridFrame>
  );
}

/* ---------- Phone agendas ---------- */

function VenueAgenda({ rows, week, venues, onOpen, onAdd }) {
  const today = isoDate();
  const days = DAYS(week);
  const addDay = days.includes(today) ? today : week;
  return (
    <div className="space-y-3 md:hidden">
      {orderVenues(rows, venues).map((v) => {
        const at = (d) => rows.filter((s) => s.venue_id === v.id && dayOf(s.starts_at) === d);
        const count = rows.filter((s) => s.venue_id === v.id).length;
        return (
          <section key={v.id} className="overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile">
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
              <div className="min-w-0"><div className="truncate text-headline font-semibold">{v.name}</div><div className="text-footnote text-muted">{count ? `${count} shift${count > 1 ? 's' : ''} this week` : 'No shifts this week'}</div></div>
              <IconButton icon={Plus} label={`Add shift at ${v.name}`} onClick={() => onAdd(addDay, v.id)} />
            </div>
            <div className="divide-y divide-line">
              {foldDays(days, (d) => at(d).length).map((g) => (
                <div key={g.days[0]} className="flex gap-3 px-4 py-2.5">
                  <DayTag days={g.days} today={today} />
                  <div className="min-w-0 flex-1">
                    {g.empty
                      ? <Pressable press onClick={() => onAdd(g.days[0], v.id)} className="py-2 text-footnote text-faint">No shifts · <span className="font-semibold text-blue">Add</span></Pressable>
                      : <div className="space-y-2">{at(g.days[0]).map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} showVenue={false} />)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function OfficerAgenda({ rows, onOpen }) {
  const today = isoDate();
  const officers = useOfficerRows(rows);
  const unfilled = rows.filter(isShort);
  const places = unfilled.reduce((n, s) => n + s.headcount - s.filled, 0);
  return (
    <div className="space-y-3 md:hidden">
      {unfilled.length > 0 && (
        <section className="rounded-tile bg-red-soft/70 p-4">
          <div className="mb-3 flex items-baseline justify-between"><span className="text-headline font-semibold text-red">Unfilled</span><span className="num text-footnote text-muted">{places} place{places === 1 ? '' : 's'}</span></div>
          <div className="space-y-2">
            {unfilled.map((s) => (
              <div key={s.id} className="flex gap-3"><DayTag days={[dayOf(s.starts_at)]} today={today} /><div className="min-w-0 flex-1"><ShiftCard s={s} onOpen={onOpen} /></div></div>
            ))}
          </div>
        </section>
      )}
      {officers.map((o) => (
        <section key={o.id} className="rounded-tile border border-hairline bg-surface p-4 shadow-tile">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={o.name} size={36} />
            <div className="min-w-0"><div className="truncate text-callout font-semibold">{o.name}</div><div className="num text-footnote text-muted">{o.hours}h this week · {o.mine.length} shift{o.mine.length === 1 ? '' : 's'}</div></div>
          </div>
          <div className="space-y-2">
            {o.mine.map((s) => (
              <div key={s.id} className="flex items-start gap-3"><DayTag days={[dayOf(s.starts_at)]} today={today} /><div className="min-w-0 flex-1"><OfficerChip s={s} oid={o.id} onOpen={onOpen} /></div></div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- Officer requests ---------- */

function Requests({ q, roleName, onChanged, onOpen }) {
  const [run] = useAction();
  const [busyId, setBusyId] = useState(null);
  const decide = (r, approve) => {
    setBusyId(r.id);
    run(() => api('shifts.decideRequest', { id: r.id, approve }), approve ? 'Request approved' : 'Request declined').then(onChanged).catch(() => {}).finally(() => setBusyId(null));
  };
  return (
    <Load q={q}>{(rows) => !rows.length ? <Empty icon={Hand} title="No requests" body="When officers ask to work an open shift, it shows here." /> : (
      <List>
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Avatar name={r.officer_name} size={40} />
            <Pressable press className="min-w-0 flex-1 text-left" onClick={() => onOpen(r.shift_id)}>
              <div className="truncate text-body font-semibold">{r.officer_name}</div>
              <div className="truncate text-footnote text-muted">{r.venue_name} · {dayLabel(r.starts_at)} <span className="num">{range(r.starts_at, r.ends_at)}</span> · {roleName(r.role)}</div>
            </Pressable>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" icon={X} disabled={busyId === r.id} onClick={() => decide(r, false)}>Decline</Button>
              <Button size="sm" icon={Check} busy={busyId === r.id} onClick={() => decide(r, true)}>Approve</Button>
            </div>
          </div>
        ))}
      </List>
    )}</Load>
  );
}

/* ---------- Shift detail ---------- */

function ShiftDetail({ id, roleName, onClose, onChanged, onEdit }) {
  const q = useApi('shifts.get', { id });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [assigning, setAssigning] = useState(false);
  const [replacing, setReplacing] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const changed = () => { q.reload(); onChanged(); };
  const s = q.data;
  const { base } = useBase();
  const toast = useToast();

  const unassign = async (a) => {
    if (!(await confirm({ title: `Remove ${a.name}?`, body: s.status === 'published' ? 'They will be told they are no longer on this shift.' : undefined, confirm: 'Remove', danger: true }))) return;
    run(() => api('shifts.unassign', { id: a.id }), 'Removed').then(changed).catch(() => {});
  };
  const decide = (a, approve) => run(() => api('shifts.decideRequest', { id: a.id, approve }), approve ? 'Approved' : 'Declined').then(changed).catch(() => {});
  const publishOne = () => run(() => api('shifts.publish', { ids: [s.id] }), 'Published').then(changed).catch(() => {});
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this draft shift?', confirm: 'Delete', danger: true }))) return;
    run(() => api('shifts.delete', { id: s.id }), 'Shift deleted').then(() => { onChanged(); onClose(); }).catch(() => {});
  };
  const cancel = () => run(() => api('shifts.cancel', { id: s.id, reason: reason.trim() }), 'Shift cancelled').then(() => { onChanged(); onClose(); }).catch(() => {});
  const setLead = (a) => run(() => api('shifts.setLead', { shift_id: s.id, assignment_id: a.is_lead ? null : a.id }), a.is_lead ? 'Lead removed' : `${a.name} leads this shift`)
    .then((r) => { if (r?.warning) toast(r.warning); changed(); }).catch(() => {});

  const footer = s && s.status !== 'cancelled' && !cancelling && (
    <>
      {s.status === 'draft'
        ? <Button variant="danger" icon={Trash2} onClick={remove} disabled={busy}>Delete</Button>
        : <Button variant="danger" onClick={() => setCancelling(true)} disabled={busy}>Cancel shift</Button>}
      <Button variant="secondary" onClick={() => onEdit(s)}>Edit</Button>
      {s.status === 'draft' && <Button icon={Send} onClick={publishOne} busy={busy}>Publish</Button>}
    </>
  );

  return (
    <Sheet open onClose={onClose} title={s ? s.venue_name : 'Shift'} footer={footer} size="md">
      {q.loading && !s ? <Spinner /> : q.error && !s ? <ErrorBox error={q.error} retry={q.reload} /> : !s ? null : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill status={s.status} />{s.open && <Pill tone="blue">Open shift</Pill>}
            <Pill tone={shiftState(s) === 'short' ? 'red' : shiftState(s) === 'unconfirmed' ? 'amber' : 'green'} className="num">{s.filled}/{s.headcount} filled</Pill>
            {shiftState(s) === 'unconfirmed' && <Pill tone="amber">{s.assignments.filter((a) => a.status === 'assigned').length} unconfirmed</Pill>}
            {s.cover_request_id && <Pill tone="grey">From cover request</Pill>}
          </div>
          {s.status === 'published' && <Button variant="soft" icon={NotebookPen} to={`${base}/shifts/${s.id}`}>Shift page, log and ejections</Button>}
          <KV items={[
            ['When', <>{dayLabel(s.starts_at)}, <span className="num">{range(s.starts_at, s.ends_at)}</span></>],
            ['Role', s.role_name || roleName(s.role)],
            ['Length', <span className="num">{durationH(s.starts_at, s.ends_at)}h{s.break_minutes ? ` incl. ${s.break_minutes} min break` : ''}</span>],
            ['Notes', s.notes],
          ]} />

          {cancelling && (
            <div className="space-y-3 rounded-2xl bg-red-soft/60 p-4">
              <div className="text-body font-semibold text-red">Cancel this shift?</div>
              <p className="text-footnote text-muted">Everyone assigned or requesting is told it is cancelled.</p>
              <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCancelling(false)}>Keep shift</Button><Button variant="danger" onClick={cancel} busy={busy}>Cancel shift</Button></div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-caption font-semibold uppercase tracking-wide text-faint">Officers</div>
              {s.status !== 'cancelled' && s.filled < s.headcount && <Button size="sm" variant="soft" icon={UserPlus} onClick={() => setAssigning(true)}>Assign</Button>}
            </div>
            {!s.assignments.length ? <p className="text-subhead text-muted">Nobody assigned yet.</p> : (
              <List inset>
                {s.assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={a.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-body font-semibold">{a.name}{a.is_self && <Pill tone="blue">You</Pill>}{a.is_lead && <Pill tone="ink">Lead</Pill>}{a.pack && <PackPill status={a.pack} />}</div>
                      <div className="truncate text-caption text-muted">
                        {a.clocked_in ? <>In <span className="num">{time(a.clocked_in)}</span>{a.clocked_out && <> · out <span className="num">{time(a.clocked_out)}</span></>}</> : a.sia_number ? `SIA ${a.sia_number}` : ''}
                      </div>
                    </div>
                    {s.status === 'draft' && a.status === 'assigned' ? <Pill status="draft" /> : <AssignPill status={a.status} />}
                    {a.status === 'requested' ? (
                      <div className="flex gap-1">
                        <IconButton icon={X} label="Decline request" onClick={() => decide(a, false)} />
                        <IconButton icon={Check} label="Approve request" className="text-green" onClick={() => decide(a, true)} />
                      </div>
                    ) : null}
                    {ACTIVE.includes(a.status) && s.status !== 'cancelled' && (
                      <IconButton icon={Crown} label={a.is_lead ? `Remove ${a.name} as lead` : `Make ${a.name} the shift lead`} className={a.is_lead ? 'text-amber' : ''} disabled={busy} onClick={() => setLead(a)} />
                    )}
                    {ACTIVE.includes(a.status) && !a.clocked_in && s.status !== 'cancelled' && a.status !== 'requested' && (
                      <>
                        <IconButton icon={Repeat} label={`Replace ${a.name}`} onClick={() => setReplacing(a)} />
                        <IconButton icon={UserMinus} label={`Remove ${a.name}`} onClick={() => unassign(a)} />
                      </>
                    )}
                  </div>
                ))}
              </List>
            )}
          </div>
        </div>
      )}
      {assigning && s && <AssignSheet shift={s} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); changed(); }} />}
      {replacing && s && <AssignSheet shift={s} replace={replacing} onClose={() => setReplacing(null)} onDone={() => { setReplacing(null); changed(); }} />}
    </Sheet>
  );
}

// Assign fills an empty place; with `replace` it swaps that assignment for the picked officer in one step
function AssignSheet({ shift, replace, onClose, onDone }) {
  const { user } = useAuth();
  const q = useApi('shifts.candidates', { shift_id: shift.id });
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const assign = async (c) => {
    let override = false;
    if (c.warnings.length) {
      if (!(await confirm({ title: `${replace ? 'Put' : 'Assign'} ${c.name} on anyway?`, body: c.warnings.join(' · '), confirm: `${replace ? 'Replace' : 'Assign'} anyway` }))) return;
      override = true;
    } else if (replace && !(await confirm({ title: `Replace ${replace.name} with ${c.name}?`, body: shift.status === 'published' ? `${replace.name} is told they are off this shift and ${c.name} is asked to confirm.` : undefined, confirm: 'Replace' }))) return;
    setBusyId(c.id);
    const call = () => (replace
      ? api('shifts.reassign', { shift_id: shift.id, assignment_id: replace.id, officer_id: c.id, override })
      : api('shifts.assign', { shift_id: shift.id, officer_id: c.id, override }));
    run(call, replace ? `${c.name} replaces ${replace.name}` : `${c.name} assigned`).then(onDone).catch(() => {}).finally(() => setBusyId(null));
  };
  return (
    <Sheet open onClose={onClose} title={replace ? `Replace ${replace.name}` : 'Assign officer'} size="md">
      <p className="mb-3 text-subhead text-muted">{shift.venue_name} · {dayLabel(shift.starts_at)} <span className="num">{range(shift.starts_at, shift.ends_at)}</span></p>
      <Input placeholder="Search officers" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
      <Load q={q}>{(list) => {
        const shown = list.filter((c) => nameMatches(c, search));
        if (!shown.length) return <Empty title="No officers found" />;
        return (
          <List inset>
            {shown.map((c) => {
              const blocked = c.blocking.length > 0;
              return (
                <Pressable press key={c.id} disabled={blocked || busyId != null} onClick={() => assign(c)}
                  className={cx('flex w-full items-center gap-3 px-4 py-3 text-left transition', blocked ? 'opacity-60' : 'hover:bg-surface active:bg-surface')}>
                  <Avatar name={c.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-body font-semibold">{withGoesBy(c.name, c.goes_by)}{c.id === user.self_officer_id && <Pill tone="blue">You</Pill>}</div>
                    {blocked ? <div className="text-caption text-red">{c.blocking.join(' · ')}</div>
                      : c.warnings.length ? <div className="text-caption text-amber">{c.warnings.join(' · ')}</div>
                        : <div className="text-caption text-green">Available</div>}
                    {!blocked && c.notes?.length > 0 && <div className="text-caption text-muted">{c.notes.join(' · ')}</div>}
                  </div>
                  {busyId === c.id ? <span className="text-footnote text-muted">{replace ? 'Replacing…' : 'Assigning…'}</span> : !blocked && <Plus size={18} className="text-blue" />}
                </Pressable>
              );
            })}
          </List>
        );
      }}</Load>
    </Sheet>
  );
}

/* ---------- Create / edit shift ---------- */

function ShiftForm({ init, venues, roles, onClose, onSaved }) {
  const s = init.shift;
  const start = s ? londonParts(s.starts_at) : null;
  const f = useForm({
    venue_id: s?.venue_id || init.venue_id || (venues.length === 1 ? venues[0].id : ''),
    role: s?.role || '', date: start?.date || init.date || isoDate(), start: start?.time || '19:00', end: s ? londonParts(s.ends_at).time : '03:00',
    break_minutes: s?.break_minutes ?? 0, headcount: s?.headcount ?? 1, open: s?.open ?? false, notes: s?.notes || '',
  });
  const [repeat, setRepeat] = useState(false);
  const [days, setDays] = useState(() => new Set());
  const [weeks, setWeeks] = useState(1);
  const [run, busy] = useAction();
  const v = f.v;
  const t = v.date && v.start && v.end ? shiftTimes(v.date, v.start, v.end) : null;
  const overnight = t && dayOf(t.ends_at) !== v.date;

  const dates = useMemo(() => {
    if (!repeat || !v.date) return [v.date];
    const mon = mondayOf(v.date);
    const out = new Set([v.date]);
    for (let w = 0; w < weeks; w++) for (const d of days) { const x = addDays(mon, w * 7 + d); if (x >= v.date) out.add(x); }
    return [...out].sort();
  }, [repeat, v.date, days, weeks]);

  const ok = v.venue_id && v.role && v.date && v.start && v.end && Number(v.headcount) >= 1;
  const save = (status) => {
    const common = { venue_id: v.venue_id, role: v.role, break_minutes: Number(v.break_minutes) || 0, headcount: Number(v.headcount) || 1, open: !!v.open, notes: v.notes };
    let p;
    if (s) p = api('shifts.save', { id: s.id, ...common, ...t });
    else if (dates.length > 1) p = api('shifts.bulkCreate', { ...common, dates, start_time: v.start, end_time: v.end, status });
    else p = api('shifts.save', { ...common, ...t, status });
    run(() => p, s ? 'Shift updated' : dates.length > 1 ? (r) => `${r.created} shifts created` : status === 'published' ? 'Shift published' : 'Draft saved')
      .then(() => onSaved(v.date)).catch(() => {});
  };

  return (
    <Sheet open onClose={onClose} title={s ? 'Edit shift' : 'New shift'}
      footer={s ? <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => save()} busy={busy} disabled={!ok}>Save</Button></>
        : <><Button variant="secondary" onClick={() => save('draft')} busy={busy} disabled={!ok}>Save draft</Button><Button icon={Send} onClick={() => save('published')} busy={busy} disabled={!ok}>Publish{dates.length > 1 ? ` ${dates.length}` : ''}</Button></>}>
      <div className="space-y-3">
        <Select label="Venue" value={v.venue_id} onChange={(e) => f.set('venue_id', e.target.value)} placeholder="Choose venue" options={venues.map((x) => ({ value: x.id, label: x.name }))} />
        <Select label="Role" value={v.role} onChange={(e) => f.set('role', e.target.value)} placeholder="Choose role" options={roles.map((r) => ({ value: r.code, label: r.name }))} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Input label="Date" type="date" className="col-span-2 sm:col-span-1" {...f.bind('date')} />
          <Input label="Start" type="time" {...f.bind('start')} />
          <Input label="End" type="time" {...f.bind('end')} hint={overnight ? 'Ends next day' : undefined} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Officers needed" type="number" min="1" max="100" inputMode="numeric" {...f.bind('headcount')} />
          <Input label="Break (minutes)" type="number" min="0" inputMode="numeric" {...f.bind('break_minutes')} />
        </div>
        <Toggle label="Open shift" hint="Officers can ask to work it" checked={v.open} onChange={(x) => f.set('open', x)} />
        <Textarea label="Notes" rows={2} placeholder="Dress code, entrance, anything officers need to know" {...f.bind('notes')} />
        {!s && (
          <div className="rounded-2xl bg-bg/70 p-4">
            <Toggle label="Repeat" hint="Same times on other days" checked={repeat} onChange={setRepeat} />
            {repeat && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((w, i) => {
                    const on = days.has(i);
                    return (
                      <Pressable press key={w} onClick={() => setDays((x) => { const n = new Set(x); if (on) n.delete(i); else n.add(i); return n; })}
                        className={cx('h-9 min-w-[46px] rounded-full px-3 text-footnote font-semibold transition', on ? 'bg-blue text-white' : 'bg-surface text-muted border border-line')}>{w}</Pressable>
                    );
                  })}
                </div>
                <Select label="For" value={String(weeks)} onChange={(e) => setWeeks(Number(e.target.value))}
                  options={[1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: n === 1 ? 'This week only' : `${n} weeks` }))} />
                <p className="text-footnote text-muted">{dates.length} shift{dates.length > 1 ? 's' : ''}: {dates.slice(0, 6).map(dateShort).join(', ')}{dates.length > 6 ? '…' : ''}</p>
              </div>
            )}
          </div>
        )}
        {s && s.status === 'published' && <p className="text-footnote text-muted">Assigned officers are told if the time or venue changes.</p>}
      </div>
    </Sheet>
  );
}

