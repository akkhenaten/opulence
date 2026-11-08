import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  addDays, Button, cx, dateShort, dayLabel, Empty, IconButton, isoDate, Load, mondayOf, Page, Pill, Pressable, range, Select, Tabs, time, useApi,
} from '../../ui/index.jsx';
import { londonIso, londonParts } from '../manager/_parts.jsx';
import { LABEL, RequestForm, statusOf } from '../manager/_cover.jsx';
import { CoverList, Detail } from './_requests.jsx';
import { useVenue } from '../../venue.jsx';

/** The venue manager's rota: published shifts at their own venue(s), who is on and who is on site, and staff requests made from the day. */
export default function VenueRota() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'requests' ? 'requests' : 'rota';
  const setTab = (t) => { const n = new URLSearchParams(sp); if (t === 'rota') n.delete('tab'); else n.set('tab', t); setSp(n, { replace: true }); };
  const loc = useLocation();
  const nav = useNavigate();

  const [week, setWeek] = useState(() => mondayOf(isoDate()));
  const { venueId, venues: list, many, setVenueId } = useVenue();
  const [form, setForm] = useState(null); // { draft? }
  const [open, setOpen] = useState(null);

  const roles = useApi('roles.list', {});
  const cover = useApi('cover.list', {});
  const body = useMemo(() => ({ from: londonIso(week), to: londonIso(addDays(week, 7)), ...(venueId ? { venue_id: venueId } : {}) }), [week, venueId]);
  const shifts = useApi('shifts.list', body, { poll: 60000 });

  // A message turned into a request arrives with a draft to check
  useEffect(() => {
    if (loc.state?.draft) { setForm({ draft: loc.state.draft }); nav(loc.pathname + loc.search, { replace: true, state: null }); }
  }, [loc.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Request staff" from the overview opens the form straight away
  useEffect(() => {
    if (sp.get('new')) { setForm({ draft: { quiet: true } }); const n = new URLSearchParams(sp); n.delete('new'); setSp(n, { replace: true }); }
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = isoDate();
  const isThisWeek = week === mondayOf(today);
  // The chosen venue (home tiles or the top-bar chip) narrows the requests too
  const coverQ = useMemo(() => ({ ...cover, data: cover.data && cover.data.filter((c) => !venueId || c.venue_id === venueId) }), [cover, venueId]);
  const upcoming = (coverQ.data || []).filter((c) => new Date(c.ends_at) > Date.now() && ['pending', 'accepted'].includes(c.status)).length;
  const ask = (date) => setForm({ draft: { date: date && date >= today ? date : undefined, venue_id: venueId || undefined, quiet: true } });

  return (
    <Page title="Rota" subtitle={tab === 'rota' ? `Week of ${dayLabel(week)}` : 'Extra officers you have asked for'} wide
      actions={<Button icon={Plus} onClick={() => ask()}>Request staff</Button>}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'rota', label: 'Rota' }, { value: 'requests', label: 'Requests', count: upcoming || undefined }]} />

      {tab === 'requests' ? <CoverList q={coverQ} many={many && !venueId}onOpen={setOpen} onNew={() => ask()} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-surface p-1 shadow-tile">
              <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeek(addDays(week, -7))} />
              <span className="num min-w-[132px] text-center text-subhead font-semibold">{dateShort(week)} – {dateShort(addDays(week, 6))}</span>
              <IconButton icon={ChevronRight} label="Next week" onClick={() => setWeek(addDays(week, 7))} />
            </div>
            {!isThisWeek && <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf(today))}>Today</Button>}
            {many && <Select className="w-full md:w-auto md:min-w-[200px] md:max-w-[240px]" value={venueId} onChange={(e) => setVenueId(e.target.value)} placeholder="All my venues"
              options={list.map((v) => ({ value: v.id, label: v.name }))} />}
          </div>
          <Load q={shifts}>{(rows) => (
            <Week week={week} today={today} rows={rows} many={many && !venueId}
              requests={(coverQ.data || []).filter((c) => c.kind !== 'recurring' && c.status !== 'cancelled')}
              onShift={(s) => nav(`/venue/logs/${s.id}`)} onRequest={setOpen} onAsk={ask} />
          )}</Load>
        </>
      )}

      {form && <RequestForm venues={list} roles={roles.data || []} draft={form.draft} onClose={() => setForm(null)}
        onDone={() => { setForm(null); cover.reload(); setTab('requests'); }} />}
      {open && <Detail c={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); cover.reload(); }} onAgain={(draft) => { setOpen(null); setForm({ draft }); }} />}
    </Page>
  );
}

function Week({ week, today, rows, requests, many, onShift, onRequest, onAsk }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const dayOf = (iso) => londonParts(iso).date;
  if (!rows.length && !requests.some((c) => days.includes(dayOf(c.starts_at)))) {
    return <Empty icon={CalendarDays} title="No shifts this week" body="Shifts show here once the security company publishes them. Need officers? Ask from here."
      action={<Button icon={Plus} onClick={() => onAsk(days.find((d) => d >= today))}>Request staff</Button>} />;
  }
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const ss = rows.filter((s) => dayOf(s.starts_at) === d);
        const cs = requests.filter((c) => dayOf(c.starts_at) === d);
        const past = d < today;
        return (
          <div key={d} className={cx('rounded-2xl bg-surface p-3 shadow-tile', d === today && 'ring-2 ring-blue/40')}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className={cx('text-subhead font-semibold', d === today ? 'text-blue' : past ? 'text-muted' : '')}>{dayLabel(d)}{d === today && ' · Today'}</div>
              {!past && <Button variant="ghost" size="sm" icon={Plus} onClick={() => onAsk(d)}>Request staff</Button>}
            </div>
            {!ss.length && !cs.length ? <p className="text-footnote text-muted">No officers booked.</p> : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ss.map((s) => <ShiftCard key={s.id} s={s} many={many} onOpen={onShift} />)}
                {cs.map((c) => (
                  <Pressable key={c.id} press onClick={() => onRequest(c)} className="block w-full rounded-2xl border border-dashed border-faint/60 p-3 text-left">
                    <div className="num font-bold">{range(c.starts_at, c.ends_at)}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-footnote text-muted">Request · {c.headcount} × {c.role_name}{many ? ` · ${c.venue_name}` : ''}</span>
                      <Pill status={statusOf(c)} className="shrink-0">{LABEL[statusOf(c)]}</Pill>
                    </div>
                  </Pressable>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// On site = clocked in and not yet out
const where = (a) => (a.clocked_in && !a.clocked_out ? 'on' : a.clocked_out ? 'done' : 'due');

function ShiftCard({ s, many, onOpen }) {
  const short = s.filled < s.headcount;
  const on = s.assignments.filter((a) => where(a) === 'on').length;
  return (
    <Pressable press onClick={() => onOpen(s)} className="relative block w-full overflow-hidden rounded-2xl border border-hairline bg-surface p-3 pl-3.5 text-left transition hover:-translate-y-0.5">
      {short && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-amber" />}
      <div className="num font-bold">{range(s.starts_at, s.ends_at)}</div>
      {many && <div className="mt-0.5 truncate text-subhead font-semibold">{s.venue_name}</div>}
      <div className="mt-1 flex items-center justify-between gap-1.5">
        <span className="min-w-0 truncate text-footnote text-muted">{s.role_name}</span>
        <div className="flex shrink-0 gap-1">
          {on > 0 && <Pill tone="green" className="num">{on} on site</Pill>}
          <Pill tone={short ? 'amber' : 'green'} className="num">{s.filled}/{s.headcount}</Pill>
        </div>
      </div>
      {s.assignments.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-caption">
          {s.assignments.map((a, i) => {
            const w = where(a);
            return (
              <li key={i} className="flex items-center gap-1.5">
                <span aria-hidden className={cx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', w === 'on' ? 'live-dot bg-green' : w === 'done' ? 'bg-faint' : 'bg-amber')} />
                <span className="min-w-0 truncate">{a.name}{a.is_lead ? ' (lead)' : ''}</span>
                <span className="num ml-auto shrink-0 text-muted">{w === 'on' ? `In ${time(a.clocked_in)}` : w === 'done' ? `${time(a.clocked_in)}–${time(a.clocked_out)}` : new Date(s.ends_at) < Date.now() ? 'No clock-in' : 'Due'}</span>
              </li>
            );
          })}
        </ul>
      )}
      {short && <p className="mt-1.5 text-caption font-semibold text-amber">{s.headcount - s.filled} still to fill</p>}
    </Pressable>
  );
}
