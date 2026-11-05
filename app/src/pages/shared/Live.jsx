import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSignature, Lock, MapPin, Phone, QrCode, Radio, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import {
  Avatar, Button, Empty, IconButton, Input, KV, List, Load, Page, Pill, Row, Section, Segmented, Sheet, Tabs, Textarea, Tile, cx, range, time, titleCase, useAction, useApi, useForm, useToast,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { Chip, fromLondonInput, toLondonInput, useBase } from '../manager/_parts.jsx';
import { ProofFlags, SelfieCompare } from '../manager/_proof.jsx';
import { Activity, Inbox, OpsSettings } from '../manager/OpsAI.jsx';

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

export default function Live() {
  const { base, isManager, user } = useBase();
  const venue = user.role === 'venue';
  const q = useApi('live.board', {}, { poll: 15000 });
  const count = useApi('ops.count', {}, { poll: 30000, skip: !isManager });
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab = isManager && (raw === 'activity' || (raw === 'settings' && user.role === 'company')) ? raw : 'board';
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [lastChecked, setLastChecked] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();

  // The round arrows: managers run every Ops AI check now (chasing, cover, site packs, hours, compliance), then everything reloads
  const refresh = () => {
    if (!isManager) { q.reload(); toast('Updated'); return; }
    run(() => api('ops.refresh')).then((r) => {
      q.reload(); count.reload(); setReloadKey((k) => k + 1);
      window.dispatchEvent(new Event('orb:ops'));
      if (r.busy) return toast('Checks already running');
      setLastChecked(r.checked_at);
      toast(r.new_items ? `Checked — ${r.new_items} new ${r.new_items === 1 ? 'item' : 'items'} to approve` : r.errors?.length ? `Checked — some checks failed (${r.errors.join(', ')})` : 'Checked — all clear', r.errors?.length ? 'error' : undefined);
    }).catch(() => {});
  };

  const tabs = [{ value: 'board', label: 'Board' }, { value: 'activity', label: 'Activity' }, ...(user.role === 'company' ? [{ value: 'settings', label: 'Settings' }] : [])];
  const board = <Load q={q}>{(rows) => <Board rows={rows} filter={filter} setFilter={setFilter} onOpen={isManager ? setOpen : null} base={base} venue={venue} narrow={isManager} />}</Load>;
  return (
    <Page title={venue ? 'On site' : 'Live operations'} wide photo="control"
      subtitle={isManager ? <>Board updates every 15 seconds · Ops AI checks every 5 minutes{lastChecked && <> · last checked <span className="num">{time(lastChecked)}</span></>}</> : 'Updates every 15 seconds'}
      actions={<>
        {isManager && <Button variant="secondary" icon={Sparkles} onClick={() => window.dispatchEvent(new Event('orb:askorb'))}>Orb</Button>}
        <IconButton icon={RefreshCw} label={isManager ? 'Run Ops AI checks and refresh' : 'Refresh'} onClick={refresh} disabled={busy}
          className={cx('bg-surface shadow-tile', busy && '[&>svg]:animate-spin')} />
      </>}>
      {isManager && <Tabs value={tab} onChange={(v) => setSp(v === 'board' ? {} : { tab: v }, { replace: true })} tabs={tabs} />}
      {tab === 'board' && (isManager ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">{board}</div>
          <OpsPanel n={count.data?.n} reloadKey={reloadKey} onChange={count.reload} />
        </div>
      ) : board)}
      {tab === 'activity' && <Activity />}
      {tab === 'settings' && <OpsSettings />}
      {open && <Detail row={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} base={base} />}
    </Page>
  );
}

/** Ops AI beside the board (above it on phones, as a single line when there is nothing to approve). */
function OpsPanel({ n, reloadKey, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const quiet = n === 0 && !expanded;
  return (
    <aside className="order-first lg:sticky lg:top-4 lg:order-none lg:self-start">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={18} className="text-blue" />
        <h2 className="text-headline font-bold">Ops AI</h2>
        {n > 0 && <Pill tone="blue">{n} to approve</Pill>}
      </div>
      {quiet ? (
        <Tile className="flex items-center gap-3 lg:hidden">
          <span className="min-w-0 flex-1 text-subhead text-muted">All clear. Nothing to approve.</span>
          <Button size="sm" variant="link" onClick={() => setExpanded(true)}>Open</Button>
        </Tile>
      ) : null}
      <div className={cx(quiet && 'hidden lg:block')}>
        <Inbox compact reloadKey={reloadKey} onChange={onChange} />
      </div>
    </aside>
  );
}

function Board({ rows, filter, setFilter, onOpen, base, venue, narrow }) {
  const n = (f) => rows.filter(f).length;
  const counts = {
    on: n((r) => ON.includes(r.state)), late: n((r) => r.state === 'late'), no_show: n((r) => r.state === 'no_show'),
    upcoming: n((r) => r.state === 'upcoming'), exc: n((r) => r.has_exception), pack: n(PACK_OUT), done: n((r) => ['finished', 'left_early'].includes(r.state)),
  };
  const shown = rows.filter((r) => ({
    all: true, on: ON.includes(r.state), issues: ISSUE.includes(r.state) || r.has_exception, pack: PACK_OUT(r), upcoming: r.state === 'upcoming', done: ['finished', 'left_early'].includes(r.state),
  }[filter]));
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of shown) {
      if (!m.has(r.venue_id)) m.set(r.venue_id, { name: r.venue_name, rows: [] });
      m.get(r.venue_id).rows.push(r);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <>
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip label="On site" value={counts.on} tone="green" active={filter === 'on'} onClick={() => setFilter(filter === 'on' ? 'all' : 'on')} />
        <Chip label="Late" value={counts.late} tone={counts.late ? 'amber' : 'grey'} active={filter === 'issues'} onClick={() => setFilter(filter === 'issues' ? 'all' : 'issues')} />
        <Chip label="No-show" value={counts.no_show} tone={counts.no_show ? 'red' : 'grey'} active={filter === 'issues'} onClick={() => setFilter(filter === 'issues' ? 'all' : 'issues')} />
        {counts.exc > 0 && <Chip label="Exceptions" value={counts.exc} tone="red" active={filter === 'issues'} onClick={() => setFilter('issues')} />}
        {!venue && counts.pack > 0 && <Chip label="Pack not signed" value={counts.pack} tone="amber" active={filter === 'pack'} onClick={() => setFilter(filter === 'pack' ? 'all' : 'pack')} />}
        <Chip label="Due on" value={counts.upcoming} tone="blue" active={filter === 'upcoming'} onClick={() => setFilter(filter === 'upcoming' ? 'all' : 'upcoming')} />
        <Chip label="Finished" value={counts.done} active={filter === 'done'} onClick={() => setFilter(filter === 'done' ? 'all' : 'done')} />
      </div>
      <Segmented value={filter} onChange={setFilter} className="mb-2"
        options={[{ value: 'all', label: 'All' }, { value: 'on', label: 'On site' }, { value: 'issues', label: 'Issues' }, { value: 'upcoming', label: 'Due on' }, { value: 'done', label: 'Finished' }]} />

      {!rows.length && <div className="mt-4"><Empty icon={Radio} title="Nobody due on site" body="Officers on published shifts from 2 hours ago to 12 hours ahead show here." /></div>}
      {rows.length > 0 && !shown.length && <div className="mt-4"><Empty title="Nobody in this view" /></div>}

      <div className={cx('grid grid-cols-1 gap-x-5', narrow ? 'xl:grid-cols-2' : 'lg:grid-cols-2')}>
        {groups.map(([id, g]) => {
          const on = g.rows.filter((r) => ON.includes(r.state)).length;
          return (
            <Section key={id} title={g.name} action={<span className="num text-footnote font-semibold text-muted">{on} on site</span>}>
              <List>
                {g.rows.map((r) => (
                  <Row key={r.assignment_id}
                    onClick={onOpen ? () => onOpen(r) : undefined}
                    left={<Avatar name={r.officer_name} src={r.photo_url} size={40} />}
                    title={r.officer_name}
                    subtitle={<><span className="num">{range(r.starts_at, r.ends_at)}</span> · {r.role_name}{r.clocked_in ? <> · in <span className="num">{time(r.clocked_in)}</span></> : ''}{r.blocked && r.pack_block ? <> · {blockedText(r.pack_block)}</> : ''}</>}
                    right={
                      <div className="flex flex-col items-end gap-1">
                        {!r.blocked && <Pill status={r.state} />}
                        {r.state === 'upcoming' && r.assignment_status === 'assigned' && <Pill tone="amber">Unconfirmed</Pill>}
                        <PackPill r={r} venue={venue} />
                        {r.has_exception && <Pill tone="red"><TriangleAlert size={14} />Exception</Pill>}
                      </div>
                    } />
                ))}
              </List>
            </Section>
          );
        })}
      </div>
      {base !== '/venue' && rows.some((r) => r.has_exception) && (
        <p className="mt-4 text-center text-footnote text-muted">Review flagged clock-ins in <Link to={`${base}/exceptions`} className="font-semibold text-blue">Exceptions</Link>.</p>
      )}
    </>
  );
}

function Detail({ row, onClose, onDone, base }) {
  const [manual, setManual] = useState(false);
  const events = row.events || [];
  const inEv = events.find((e) => e.kind === 'in' && e.status !== 'rejected');
  return (
    <Sheet open onClose={onClose} title={row.officer_name}
      footer={manual ? null : <>
        {row.phone && <Button variant="secondary" icon={Phone} onClick={() => { window.location.href = `tel:${row.phone}`; }}>Call</Button>}
        <Button variant="soft" onClick={() => setManual(true)}>Set times manually</Button>
      </>}>
      {manual ? <ManualForm row={row} onCancel={() => setManual(false)} onDone={onDone} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><Pill status={row.state} /><PackPill r={row} />{row.has_exception && <Pill tone="red">Exception</Pill>}</div>
          <KV items={[
            ['Venue', row.venue_name], ['Shift', <span className="num">{range(row.starts_at, row.ends_at)}</span>], ['Role', row.role_name],
            ['SIA', row.sia_number], ['Phone', row.phone], ['Clocked in', row.clocked_in && <span className="num">{time(row.clocked_in)}</span>],
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
          {inEv && (
            <div>
              <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-faint">Clock-in checks</div>
              <div className="flex flex-wrap gap-1.5"><ProofFlags e={{ ...inEv, selfie_url: row.selfie_url }} /></div>
              {row.selfie_url && <div className="mt-3"><SelfieCompare e={{ ...inEv, selfie_url: row.selfie_url, profile_photo_url: row.photo_url, officer_name: row.officer_name }} /></div>}
            </div>
          )}
          {row.has_exception && <Button variant="secondary" to={`${base}/exceptions`} icon={TriangleAlert}>Review exception</Button>}
          {row.pack !== 'none' && <Button variant="secondary" to={`${base}/venues/${row.venue_id}?tab=pack`} icon={FileSignature}>Open site pack</Button>}
        </div>
      )}
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
