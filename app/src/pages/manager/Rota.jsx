import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Copy, Hand, Plus, Send, Trash2, UserMinus, UserPlus, X,
} from 'lucide-react';
import {
  Avatar, Button, Empty, ErrorBox, IconButton, Input, KV, List, Load, Page, Pill, Row, Section, Segmented, Select, Sheet, Spinner, Textarea, Toggle,
  addDays, cx, dateShort, dayLabel, isoDate, mondayOf, range, time, titleCase, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { WEEKDAYS, durationH, londonIso, londonParts, shiftTimes, useBase } from './_parts.jsx';

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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'rota', label: 'Rota' }, { value: 'requests', label: 'Requests', count: reqs.data?.length }]} />
      </div>

      {tab === 'requests' ? <Requests q={reqs} roleName={roleName} onChanged={reload} onOpen={setOpenId} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-surface p-1 shadow-tile">
              <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeek(addDays(week, -7))} />
              <span className="num min-w-[132px] text-center text-[14px] font-semibold">{weekLabel}</span>
              <IconButton icon={ChevronRight} label="Next week" onClick={() => setWeek(addDays(week, 7))} />
            </div>
            {!isThisWeek && <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf(isoDate()))}>Today</Button>}
            <Select className="min-w-[180px] flex-1 sm:max-w-[240px] sm:flex-none" value={venueId} onChange={(e) => setVenueId(e.target.value)} placeholder="All venues"
              options={(venues.data || []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.name }))} />
            <Segmented value={view} onChange={setView} className="sm:ml-auto"
              options={[{ value: 'days', label: 'By day' }, { value: 'venues', label: 'By venue' }, { value: 'officers', label: 'By officer' }]} />
          </div>
          <Load q={shifts}>{(rows) => {
            const props = { rows, week, onOpen: (s) => setOpenId(s.id), onAdd: (date, vid) => setForm({ date, venue_id: vid }) };
            if (view === 'venues') return <VenueGrid {...props} venues={(venues.data || []).filter((v) => v.active && (!venueId || v.id === venueId))} />;
            if (view === 'officers') return <OfficerGrid {...props} />;
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

/* ---------- Shift card ---------- */

function ShiftCard({ s, onOpen, showVenue = true, compact }) {
  const short = s.filled < s.headcount;
  const requested = s.assignments.filter((a) => a.status === 'requested').length;
  return (
    <button type="button" onClick={() => onOpen(s)}
      className={cx('block w-full rounded-2xl border bg-surface text-left shadow-tile transition hover:-translate-y-0.5 active:scale-[0.99]',
        compact ? 'p-2.5' : 'p-3.5', s.status === 'draft' ? 'border-dashed border-faint/60' : 'border-black/[0.04]',
        short && s.status === 'published' && 'ring-1 ring-red/20')}>
      <div className="flex items-start justify-between gap-2">
        <div className="num text-[14px] font-bold">{range(s.starts_at, s.ends_at)}</div>
        <Pill tone={short ? (s.status === 'draft' ? 'grey' : 'red') : 'green'} className="num">{s.filled}/{s.headcount}</Pill>
      </div>
      {showVenue && <div className="mt-0.5 truncate text-[14px] font-semibold">{s.venue_name}</div>}
      <div className="truncate text-[13px] text-muted">{s.role_name}</div>
      {(s.status === 'draft' || s.open || requested > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {s.status === 'draft' && <Pill status="draft" />}
          {s.open && <Pill tone="blue">Open</Pill>}
          {requested > 0 && <Pill tone="amber">{requested} request{requested > 1 ? 's' : ''}</Pill>}
        </div>
      )}
      {!compact && s.assignments.some((a) => ACTIVE.includes(a.status)) && (
        <div className="mt-2 truncate text-[12px] text-muted">{s.assignments.filter((a) => ACTIVE.includes(a.status)).map((a) => a.name).join(', ')}</div>
      )}
    </button>
  );
}

/* ---------- Views ---------- */

function DayList({ rows, week, onOpen, onAdd }) {
  const today = isoDate();
  return (
    <div className="grid gap-x-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => {
        const list = rows.filter((s) => dayOf(s.starts_at) === d);
        return (
          <Section key={d} className="mt-4"
            title={<span className={cx(d === today && 'text-blue')}>{dayLabel(d)}{d === today ? ' · Today' : ''}</span>}
            action={<button type="button" onClick={() => onAdd(d)} className="text-[13px] font-semibold text-blue" aria-label={`Add shift ${dayLabel(d)}`}>+ Add</button>}>
            {list.length ? <div className="space-y-2">{list.map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} />)}</div>
              : <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-faint">No shifts</div>}
          </Section>
        );
      })}
    </div>
  );
}

function GridFrame({ week, children }) {
  const today = isoDate();
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="min-w-[980px] overflow-hidden rounded-tile border border-black/[0.04] bg-surface shadow-tile">
        <div className="grid grid-cols-[180px_repeat(7,1fr)] border-b border-line text-[12px] font-semibold uppercase tracking-wide text-faint">
          <div className="px-3 py-2.5" />
          {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => (
            <div key={d} className={cx('px-2 py-2.5', d === today && 'text-blue')}>{dayLabel(d)}</div>
          ))}
        </div>
        <div className="divide-y divide-line">{children}</div>
      </div>
    </div>
  );
}

function VenueGrid({ rows, week, venues, onOpen, onAdd }) {
  const ids = new Set(rows.map((s) => s.venue_id));
  const list = venues.filter((v) => ids.has(v.id)).concat(venues.filter((v) => !ids.has(v.id)));
  if (!list.length) return <Empty icon={CalendarDays} title="No venues" />;
  return (
    <GridFrame week={week}>
      {list.map((v) => (
        <div key={v.id} className="grid grid-cols-[180px_repeat(7,1fr)]">
          <div className="px-3 py-3 text-[14px] font-semibold">{v.name}</div>
          {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => {
            const cell = rows.filter((s) => s.venue_id === v.id && dayOf(s.starts_at) === d);
            return (
              <div key={d} className="group space-y-1.5 border-l border-line p-1.5">
                {cell.map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} showVenue={false} compact />)}
                <button type="button" onClick={() => onAdd(d, v.id)} className="w-full rounded-xl py-1 text-[12px] font-semibold text-faint opacity-0 transition hover:bg-blue-soft hover:text-blue group-hover:opacity-100 focus:opacity-100" aria-label="Add shift">+</button>
              </div>
            );
          })}
        </div>
      ))}
    </GridFrame>
  );
}

function OfficerGrid({ rows, week, onOpen }) {
  const officers = useMemo(() => {
    const m = new Map();
    for (const s of rows) for (const a of s.assignments) if ([...ACTIVE, 'requested'].includes(a.status)) m.set(a.officer_id, a.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const unfilled = rows.filter((s) => s.filled < s.headcount);
  if (!rows.length) return <Empty icon={CalendarDays} title="No shifts this week" />;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  return (
    <GridFrame week={week}>
      <div className="grid grid-cols-[180px_repeat(7,1fr)] bg-red-soft/40">
        <div className="px-3 py-3"><div className="text-[14px] font-semibold text-red">Unfilled</div><div className="num text-[12px] text-muted">{unfilled.reduce((n, s) => n + s.headcount - s.filled, 0)} places</div></div>
        {days.map((d) => (
          <div key={d} className="space-y-1.5 border-l border-line p-1.5">
            {unfilled.filter((s) => dayOf(s.starts_at) === d).map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} compact />)}
          </div>
        ))}
      </div>
      {officers.map(([oid, name]) => {
        const mine = rows.filter((s) => s.assignments.some((a) => a.officer_id === oid && [...ACTIVE, 'requested'].includes(a.status)));
        const h = mine.filter((s) => s.assignments.some((a) => a.officer_id === oid && ACTIVE.includes(a.status))).reduce((n, s) => n + durationH(s.starts_at, s.ends_at), 0);
        return (
          <div key={oid} className="grid grid-cols-[180px_repeat(7,1fr)]">
            <div className="flex items-center gap-2 px-3 py-3"><Avatar name={name} size={30} /><div className="min-w-0"><div className="truncate text-[14px] font-semibold">{name}</div><div className="num text-[12px] text-muted">{Math.round(h * 10) / 10}h</div></div></div>
            {days.map((d) => (
              <div key={d} className="space-y-1.5 border-l border-line p-1.5">
                {mine.filter((s) => dayOf(s.starts_at) === d).map((s) => {
                  const a = s.assignments.find((x) => x.officer_id === oid);
                  return (
                    <button key={s.id} type="button" onClick={() => onOpen(s)} className={cx('block w-full rounded-xl p-2 text-left text-[12px] transition hover:-translate-y-0.5', a.status === 'requested' ? 'bg-amber-soft' : s.status === 'draft' ? 'bg-bg' : 'bg-blue-soft')}>
                      <div className="num font-bold">{range(s.starts_at, s.ends_at)}</div>
                      <div className="truncate text-muted">{s.venue_name}</div>
                      {a.status !== 'accepted' && <div className="font-semibold">{titleCase(a.status)}</div>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </GridFrame>
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
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(r.shift_id)}>
              <div className="truncate text-[15px] font-semibold">{r.officer_name}</div>
              <div className="truncate text-[13px] text-muted">{r.venue_name} · {dayLabel(r.starts_at)} <span className="num">{range(r.starts_at, r.ends_at)}</span> · {roleName(r.role)}</div>
            </button>
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
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const changed = () => { q.reload(); onChanged(); };
  const s = q.data;

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
            <Pill tone={s.filled < s.headcount ? 'red' : 'green'} className="num">{s.filled}/{s.headcount} filled</Pill>
            {s.cover_request_id && <Pill tone="grey">From cover request</Pill>}
          </div>
          <KV items={[
            ['When', <>{dayLabel(s.starts_at)}, <span className="num">{range(s.starts_at, s.ends_at)}</span></>],
            ['Role', s.role_name || roleName(s.role)],
            ['Length', <span className="num">{durationH(s.starts_at, s.ends_at)}h{s.break_minutes ? ` incl. ${s.break_minutes} min break` : ''}</span>],
            ['Notes', s.notes],
          ]} />

          {cancelling && (
            <div className="space-y-3 rounded-2xl bg-red-soft/60 p-4">
              <div className="text-[15px] font-semibold text-red">Cancel this shift?</div>
              <p className="text-[13px] text-muted">Everyone assigned or requesting is told it is cancelled.</p>
              <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCancelling(false)}>Keep shift</Button><Button variant="danger" onClick={cancel} busy={busy}>Cancel shift</Button></div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-faint">Officers</div>
              {s.status !== 'cancelled' && s.filled < s.headcount && <Button size="sm" variant="soft" icon={UserPlus} onClick={() => setAssigning(true)}>Assign</Button>}
            </div>
            {!s.assignments.length ? <p className="text-[14px] text-muted">Nobody assigned yet.</p> : (
              <List inset>
                {s.assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={a.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{a.name}</div>
                      <div className="truncate text-[12px] text-muted">
                        {a.clocked_in ? <>In <span className="num">{time(a.clocked_in)}</span>{a.clocked_out && <> · out <span className="num">{time(a.clocked_out)}</span></>}</> : a.sia_number ? `SIA ${a.sia_number}` : ''}
                      </div>
                    </div>
                    <Pill status={a.status} />
                    {a.status === 'requested' ? (
                      <div className="flex gap-1">
                        <IconButton icon={X} label="Decline request" onClick={() => decide(a, false)} />
                        <IconButton icon={Check} label="Approve request" className="text-green" onClick={() => decide(a, true)} />
                      </div>
                    ) : ACTIVE.includes(a.status) && !a.clocked_in && s.status !== 'cancelled' ? (
                      <IconButton icon={UserMinus} label={`Remove ${a.name}`} onClick={() => unassign(a)} />
                    ) : null}
                  </div>
                ))}
              </List>
            )}
          </div>
        </div>
      )}
      {assigning && s && <AssignSheet shift={s} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); changed(); }} />}
    </Sheet>
  );
}

function AssignSheet({ shift, onClose, onDone }) {
  const q = useApi('shifts.candidates', { shift_id: shift.id });
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const assign = async (c) => {
    let override = false;
    if (c.warnings.length) {
      if (!(await confirm({ title: `Assign ${c.name} anyway?`, body: c.warnings.join(' · '), confirm: 'Assign anyway' }))) return;
      override = true;
    }
    setBusyId(c.id);
    run(() => api('shifts.assign', { shift_id: shift.id, officer_id: c.id, override }), `${c.name} assigned`).then(onDone).catch(() => {}).finally(() => setBusyId(null));
  };
  return (
    <Sheet open onClose={onClose} title="Assign officer" size="md">
      <p className="mb-3 text-[14px] text-muted">{shift.venue_name} · {dayLabel(shift.starts_at)} <span className="num">{range(shift.starts_at, shift.ends_at)}</span></p>
      <Input placeholder="Search officers" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
      <Load q={q}>{(list) => {
        const shown = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
        if (!shown.length) return <Empty title="No officers found" />;
        return (
          <List inset>
            {shown.map((c) => {
              const blocked = c.blocking.length > 0;
              return (
                <button key={c.id} type="button" disabled={blocked || busyId != null} onClick={() => assign(c)}
                  className={cx('flex w-full items-center gap-3 px-4 py-3 text-left transition', blocked ? 'opacity-60' : 'hover:bg-surface active:bg-surface')}>
                  <Avatar name={c.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{c.name}</div>
                    {blocked ? <div className="text-[12px] text-red">{c.blocking.join(' · ')}</div>
                      : c.warnings.length ? <div className="text-[12px] text-amber">{c.warnings.join(' · ')}</div>
                        : <div className="text-[12px] text-green">Available</div>}
                  </div>
                  {busyId === c.id ? <span className="text-[13px] text-muted">Assigning…</span> : !blocked && <Plus size={18} className="text-blue" />}
                </button>
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
                      <button key={w} type="button" onClick={() => setDays((x) => { const n = new Set(x); if (on) n.delete(i); else n.add(i); return n; })}
                        className={cx('h-9 min-w-[46px] rounded-full px-3 text-[13px] font-semibold transition', on ? 'bg-blue text-white' : 'bg-surface text-muted border border-line')}>{w}</button>
                    );
                  })}
                </div>
                <Select label="For" value={String(weeks)} onChange={(e) => setWeeks(Number(e.target.value))}
                  options={[1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: n === 1 ? 'This week only' : `${n} weeks` }))} />
                <p className="text-[13px] text-muted">{dates.length} shift{dates.length > 1 ? 's' : ''}: {dates.slice(0, 6).map(dateShort).join(', ')}{dates.length > 6 ? '…' : ''}</p>
              </div>
            )}
          </div>
        )}
        {s && s.status === 'published' && <p className="text-[13px] text-muted">Assigned officers are told if the time or venue changes.</p>}
      </div>
    </Sheet>
  );
}

