import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock3, FileSignature, Lock, LogOut, MapPin, Phone, QrCode, Radio, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  Avatar, Button, Callout, Dot, Empty, IconButton, Input, KV, List, Load, MoreMenu, Page, Pill, Row, Sheet, Tabs, Textarea, cx, range, time, titleCase, useAction, useApi, useForm, useMedia, useToast, useUrlState,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useVenue } from '../../venue.jsx';
import { Chip, fromLondonInput, toLondonInput, useBase } from '../manager/_parts.jsx';
import { ProofFlags, SelfieCompare } from '../manager/_proof.jsx';
import { Activity, Inbox, OpsSettings } from '../manager/OpsAI.jsx';
import { ClockOutSheet } from './_clockOut.jsx';

const ISSUE = ['late', 'no_show', 'left_early'];
const ON = ['on_shift', 'on_break'];
const KIND = { in: 'Clocked in', out: 'Clocked out', break_start: 'Break started', break_end: 'Break ended' };
const PACK_OUT = (r) => r.blocked || r.pack === 'unsigned' || r.pack === 'resign';
const PACK_LABEL = { signed: 'Pack signed', unsigned: 'Pack not signed', resign: 'Needs re-sign', none: 'No pack published' };

// "tried to clock in at 19:52" / "3 tries, last 19:58"
function blockedText(b) {
  return b.attempts > 1 ? <>{b.attempts} tries, last <span className="num">{time(b.last_at)}</span></> : <>tried to clock in at <span className="num">{time(b.first_at)}</span></>;
}

function PackPill({ r, venue }) {
  if (r.blocked) return <Pill tone="red"><Lock size={14} />Pack not signed</Pill>;
  if (venue) {
    if (r.pack === 'signed') return <Pill tone="green">Signed</Pill>;
    if (r.pack === 'unsigned') return <Pill tone="amber">Not signed yet</Pill>;
    return null;
  }
  if (r.pack === 'unsigned' || r.pack === 'resign') return <Pill tone="amber">{PACK_LABEL[r.pack]}</Pill>;
  if (r.pack === 'signed') return <span className="text-caption text-muted">Pack signed</span>;
  return null;
}

// One filter for the board, kept in the address (?show=) so Back returns to the same view
const FILTERS = {
  all: () => true,
  on: (r) => ON.includes(r.state),
  late: (r) => r.state === 'late',
  no_show: (r) => r.state === 'no_show',
  issues: (r) => ISSUE.includes(r.state) || r.has_exception,
  upcoming: (r) => r.state === 'upcoming',
  done: (r) => ['finished', 'left_early'].includes(r.state),
  pack: PACK_OUT,
};

export default function Live() {
  const { base, isManager, user } = useBase();
  const venue = user.role === 'venue';
  const { venueId } = useVenue();
  const q = useApi('live.board', { venue_id: venueId || undefined }, { poll: 15000 });
  const count = useApi('ops.count', {}, { poll: 30000, skip: !isManager });
  const lg = useMedia('(min-width: 1024px)');
  const [url, setUrl] = useUrlState({ tab: 'board', show: 'all' });
  const allowed = ['board', ...(lg ? [] : ['approve']), 'activity', ...(user.role === 'company' ? ['settings'] : [])];
  const tab = isManager && allowed.includes(url.tab) ? url.tab : 'board';
  const filter = FILTERS[url.show] && !(venue && url.show === 'pack') ? url.show : 'all';
  const setFilter = (v) => setUrl({ show: v });
  const [openId, setOpenId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [lastChecked, setLastChecked] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  useEffect(() => { if (q.data) setUpdated(new Date()); }, [q.data]);

  // Any shift change or Orb decision anywhere in the app: the board, the count and the cards catch up
  useEffect(() => {
    const h = () => { q.reload(); count.reload(); setReloadKey((k) => k + 1); };
    window.addEventListener('orb:ops', h);
    return () => window.removeEventListener('orb:ops', h);
  });

  // The round arrows: managers run every Orb check now (chasing, cover, site packs, hours, compliance), then everything reloads
  const refresh = () => {
    if (!isManager) { q.reload(); toast('Updated'); return; }
    run(() => api('ops.refresh')).then((r) => {
      window.dispatchEvent(new Event('orb:ops'));
      if (r.busy) return toast('Checks already running');
      setLastChecked(r.checked_at);
      toast(r.new_items ? `Checked — ${r.new_items} new ${r.new_items === 1 ? 'item' : 'items'} to approve` : r.errors?.length ? `Checked — some checks failed (${r.errors.join(', ')})` : 'Checked — all clear', r.errors?.length ? 'error' : undefined);
    }).catch(() => {});
  };

  const rows = q.data || [];
  const shown = rows.filter(FILTERS[filter]);
  // The drawer steps through the rows in the order the board shows them (grouped by venue)
  const order = [...new Map(shown.map((r) => [r.venue_id, null])).keys()].flatMap((v) => shown.filter((r) => r.venue_id === v));
  const at = order.findIndex((r) => r.assignment_id === openId);
  const open = at >= 0 ? order[at] : rows.find((r) => r.assignment_id === openId);
  const n = count.data?.n;

  const tabs = [
    { value: 'board', label: 'Board' },
    !lg && { value: 'approve', label: 'To approve', count: n },
    { value: 'activity', label: 'Activity' },
    user.role === 'company' && { value: 'settings', label: 'Settings' },
  ];
  const refreshBtn = (
    <IconButton icon={RefreshCw} label={isManager ? 'Run Orb checks and refresh' : 'Refresh'} onClick={refresh} disabled={busy}
      className={cx('bg-surface shadow-tile', busy && '[&>svg]:animate-spin')} />
  );
  const updatedAt = updated ? <>Updated <span className="num">{time(updated)}</span></> : 'Updates every 15 seconds';
  const board = <Load q={q}>{() => <Board rows={rows} shown={shown} filter={filter} setFilter={setFilter} onOpen={(r) => setOpenId(r.assignment_id)} base={base} venue={venue} narrow={isManager} />}</Load>;
  return (
    <Page title={venue ? 'On site' : 'Live operations'} wide
      subtitle={isManager ? (lastChecked ? <>Orb checked <span className="num">{time(lastChecked)}</span></> : undefined) : updatedAt}
      actions={isManager ? undefined : refreshBtn}>
      {/* Managers: the tabs, then when the board last updated and the round arrows, on one row */}
      {isManager && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><Tabs value={tab} onChange={(v) => setUrl({ tab: v })} tabs={tabs} /></div>
          <div className="flex shrink-0 items-center gap-2 pt-1.5 text-footnote text-muted max-sm:hidden">{updatedAt}{refreshBtn}</div>
        </div>
      )}
      {isManager && tab === 'board' && <div className="-mt-1 mb-3 flex items-center justify-end gap-2 text-footnote text-muted sm:hidden">{updatedAt}{refreshBtn}</div>}
      {tab === 'board' && (isManager && lg ? (
        <div className="grid min-h-[calc(100dvh-16rem)] grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="min-w-0">{board}</div>
          {/* Orb never sets the row's height: it takes the board's height (up to the window's) and scrolls inside */}
          <div className="[contain:size]"><OpsPanel n={n} reloadKey={reloadKey} onChange={count.reload} /></div>
        </div>
      ) : board)}
      {tab === 'approve' && <Inbox compact reloadKey={reloadKey} onChange={count.reload} />}
      {tab === 'activity' && <Activity />}
      {tab === 'settings' && <OpsSettings />}
      {open && <Detail row={open} venue={venue} base={base} onClose={() => setOpenId(null)} onDone={() => { setOpenId(null); q.reload(); }}
        onPrev={at > 0 ? () => setOpenId(order[at - 1].assignment_id) : undefined}
        onNext={at >= 0 && at < order.length - 1 ? () => setOpenId(order[at + 1].assignment_id) : undefined} />}
    </Page>
  );
}

/** Orb beside the board on wide screens; on phones and tablets it has its own To approve tab. */
function OpsPanel({ n, reloadKey, onChange }) {
  return (
    <aside className="sticky top-[calc(56px+1rem)] flex h-full max-h-[calc(100dvh-7rem)] flex-col">
      <Inbox slim compact n={n} reloadKey={reloadKey} onChange={onChange} />
    </aside>
  );
}

function Board({ rows, shown, filter, setFilter, onOpen, base, venue, narrow }) {
  const n = (k) => rows.filter(FILTERS[k]).length;
  const exc = rows.filter((r) => r.has_exception).length;
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of shown) {
      if (!m.has(r.venue_id)) m.set(r.venue_id, { name: r.venue_name, rows: [] });
      m.get(r.venue_id).rows.push(r);
    }
    for (const g of m.values()) g.shifts = [...new Map(g.rows.filter((r) => r.shift_id).map((r) => [r.shift_id, r])).values()];
    return [...m.entries()];
  }, [shown]);
  const chip = (k, label, tone) => {
    const c = n(k);
    return <Chip key={k} label={label} value={c} tone={c ? tone : 'grey'} quiet={c === 0} active={filter === k} onClick={() => setFilter(filter === k ? 'all' : k)} />;
  };

  return (
    <>
      <div role="group" aria-label="Show" className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip label="All" value={rows.length} active={filter === 'all'} onClick={() => setFilter('all')} />
        {chip('on', 'On site', 'green')}
        {chip('late', 'Late', 'amber')}
        {chip('no_show', 'No-show', 'red')}
        {chip('issues', 'Issues', 'red')}
        {chip('upcoming', 'Due on', 'blue')}
        {chip('done', 'Finished', 'grey')}
        {!venue && n('pack') > 0 && chip('pack', 'Pack not signed', 'amber')}
      </div>

      {!rows.length && <div className="mt-4"><Empty icon={Radio} title="Nobody due on site" body="Officers on published shifts from 2 hours ago to 12 hours ahead show here." /></div>}
      {rows.length > 0 && !shown.length && <div className="mt-4"><Empty title="Nobody in this view" action={<Button variant="secondary" onClick={() => setFilter('all')}>Show everyone</Button>} /></div>}

      {exc > 0 && base !== '/venue' && (
        <Callout tone="warning" className="mb-4" title={`${exc} flagged clock-in${exc === 1 ? '' : 's'}`}
          action={<Link to={`${base}/exceptions`} className="font-semibold text-blue">Review in Exceptions →</Link>}>
          A location, venue code or selfie check didn't pass. Approve or reject each one there.
        </Callout>
      )}

      {/* One card per venue: its name, who's on site and the shift card on top, then the officers */}
      <div className={cx('grid grid-cols-1 items-start gap-x-5 gap-y-4', narrow ? '2xl:grid-cols-2' : 'lg:grid-cols-2')}>
        {groups.map(([id, g]) => {
          const on = g.rows.filter((r) => ON.includes(r.state)).length;
          return (
            <section key={id} aria-label={g.name}>
              <List>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-auto sm:flex sm:items-center sm:gap-3">
                    <h2 className="truncate text-headline font-bold">{g.name}</h2>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-footnote font-semibold text-muted"><Dot tone={on ? 'green' : 'grey'} live={on > 0} /><span className="num">{on}</span> on site</span>
                  </div>
                  <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:flex-wrap sm:justify-end">
                    {g.shifts.map((r) => (
                      <Button key={r.shift_id} size="sm" variant="soft" icon={ClipboardList} to={shiftCard(base, r.shift_id)} state={{ from: 'live' }}>
                        Shift card{g.shifts.length > 1 && <span className="num">&nbsp;{range(r.starts_at, r.ends_at)}</span>}
                      </Button>
                    ))}
                  </div>
                </div>
                {g.rows.map((r) => (
                  <Row key={r.assignment_id}
                    onClick={onOpen ? () => onOpen(r) : undefined}
                    left={<Avatar name={r.officer_name} src={[r.photo_thumb_url, r.photo_url]} size={40} />}
                    title={r.officer_name}
                    subtitle={<><span className="num">{range(r.starts_at, r.ends_at)}</span> · {r.role_name}{r.clocked_in ? <> · in <span className="num">{time(r.clocked_in)}</span></> : ''}{r.blocked && r.pack_block ? <> · {blockedText(r.pack_block)}</> : ''}</>}
                    right={
                      <div className="flex flex-col items-end gap-1">
                        {!r.blocked && <Pill status={r.state} />}
                        {!venue && pastEnd(r) && <Pill tone="amber">Past shift end</Pill>}
                        {r.state === 'upcoming' && r.assignment_status === 'assigned' && <Pill tone="amber">Unconfirmed</Pill>}
                        <PackPill r={r} venue={venue} />
                        {r.has_exception && <Pill tone="red"><TriangleAlert size={14} />Exception</Pill>}
                      </div>
                    } />
                ))}
              </List>
            </section>
          );
        })}
      </div>
    </>
  );
}

// Still clocked in after the shift ended: most likely forgot to clock out
const pastEnd = (r) => ON.includes(r.state) && new Date(r.ends_at) < new Date();

// Venues open the shift log (read only); the office opens the full shift card
const shiftCard = (base, id) => (base === '/venue' ? `/venue/logs/${id}` : `${base}/shifts/${id}`);

// One officer on the board, in a drawer beside it on wide screens: ↑ ↓ step through the rows
function Detail({ row, venue, onClose, onDone, base, onPrev, onNext }) {
  const [manual, setManual] = useState(false);
  const [clockOut, setClockOut] = useState(false);
  useEffect(() => { setManual(false); setClockOut(false); }, [row.assignment_id]);
  const events = row.events || [];
  const inEv = events.find((e) => e.kind === 'in' && e.status !== 'rejected');
  // Managers: while the officer is clocked in, Clock out is the main button and the shift card moves under …
  const canOut = !venue && ON.includes(row.state);
  const more = venue ? [] : [
    canOut && row.shift_id && { label: 'Open shift card', icon: ClipboardList, to: shiftCard(base, row.shift_id), state: { from: 'live' } },
    { label: 'Set times manually', icon: Clock3, onClick: () => setManual(true) },
    row.has_exception && { label: 'Review exception', icon: TriangleAlert, to: `${base}/exceptions` },
    row.pack !== 'none' && { label: 'Open site pack', icon: FileSignature, to: `${base}/venues/${row.venue_id}?tab=pack` },
  ];
  return (
    <Sheet open side onClose={onClose} title={row.officer_name} onPrev={manual ? undefined : onPrev} onNext={manual ? undefined : onNext}
      footer={manual ? null : <>
        <MoreMenu items={more} title={row.officer_name} />
        {!venue && row.phone && <Button variant="secondary" icon={Phone} onClick={() => { window.location.href = `tel:${row.phone}`; }}>Call</Button>}
        {canOut ? <Button icon={LogOut} onClick={() => setClockOut(true)}>Clock out</Button>
          : row.shift_id && <Button to={shiftCard(base, row.shift_id)} state={{ from: 'live' }} icon={ClipboardList}>Open shift card</Button>}
      </>}>
      {manual ? <ManualForm row={row} onCancel={() => setManual(false)} onDone={onDone} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><Pill status={row.state} />{!venue && pastEnd(row) && <Pill tone="amber">Past shift end</Pill>}<PackPill r={row} venue={venue} />{row.has_exception && <Pill tone="red">Exception</Pill>}</div>
          <KV items={[
            ['Venue', row.venue_name], ['Shift', <span className="num">{range(row.starts_at, row.ends_at)}</span>], ['Role', row.role_name],
            !venue && ['SIA', row.sia_number], !venue && ['Phone', row.phone], ['Clocked in', row.clocked_in && <span className="num">{time(row.clocked_in)}</span>],
            ['Site pack', PACK_LABEL[row.pack]],
            row.pack_block && ['Blocked clock-in', <>first <span className="num">{time(row.pack_block.first_at)}</span>{row.pack_block.attempts > 1 ? <>, last <span className="num">{time(row.pack_block.last_at)}</span> · {row.pack_block.attempts} attempts</> : ''}</>],
          ]} />
          <div>
            <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-faint">Clock events</div>
            {!events.length ? <p className="text-subhead text-muted">No clock events yet.</p> : (
              <List inset>
                {events.map((e, i) => (
                  <Row key={i} left={<span className={cx('grid h-8 w-8 place-items-center rounded-full', e.geo_ok ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber')}>{e.kind === 'in' || e.kind === 'out' ? <MapPin size={16} /> : <QrCode size={16} />}</span>}
                    title={KIND[e.kind] || titleCase(e.kind)}
                    subtitle={e.distance_m != null ? `${Math.round(e.distance_m)}m from venue` : (e.kind === 'in' || e.kind === 'out' ? 'No location' : '')}
                    right={<div className="flex flex-col items-end gap-1"><span className="num font-semibold">{time(e.ts)}</span>{e.status !== 'ok' && <Pill status={e.status} />}</div>} />
                ))}
              </List>
            )}
          </div>
          {inEv && !venue && (
            <div>
              <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-faint">Clock-in checks</div>
              <div className="flex flex-wrap gap-1.5"><ProofFlags e={{ ...inEv, selfie_url: row.selfie_url }} /></div>
              {row.selfie_url && <div className="mt-3"><SelfieCompare e={{ ...inEv, selfie_url: row.selfie_url, profile_photo_url: row.photo_url, officer_name: row.officer_name }} /></div>}
            </div>
          )}
        </div>
      )}
      {canOut && <ClockOutSheet open={clockOut} row={{ ...row, on_break: row.state === 'on_break' }} onClose={() => setClockOut(false)} onDone={() => { setClockOut(false); onDone(); }} />}
    </Sheet>
  );
}

function ManualForm({ row, onCancel, onDone }) {
  const f = useForm({ start: toLondonInput(row.clocked_in || row.starts_at), end: toLondonInput(row.ends_at), break_minutes: '', reason: '' });
  const [run, busy] = useAction();
  const save = () => run(() => api('clock.manual', {
    assignment_id: row.assignment_id, start: fromLondonInput(f.v.start), end: fromLondonInput(f.v.end), reason: f.v.reason.trim(),
    ...(f.v.break_minutes !== '' ? { break_minutes: Number(f.v.break_minutes) } : {}),
  }), 'Times saved').then(onDone).catch(() => {});
  return (
    <div className="space-y-3">
      <p className="text-subhead text-muted">Replaces the officer's clock events with these times and rebuilds the timesheet. This is recorded in the audit log.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Start" type="datetime-local" {...f.bind('start')} />
        <Input label="End" type="datetime-local" {...f.bind('end')} />
      </div>
      <Input label="Break (minutes)" type="number" min="0" inputMode="numeric" placeholder="Use recorded or planned break" {...f.bind('break_minutes')} />
      <Textarea label="Reason" rows={3} placeholder="e.g. Phone died, supervisor confirmed arrival at 19:00" {...f.bind('reason')} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>Back</Button>
        <Button onClick={save} busy={busy} disabled={!f.v.reason.trim() || !f.v.start || !f.v.end}>Save times</Button>
      </div>
    </div>
  );
}
