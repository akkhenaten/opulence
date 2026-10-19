import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, QrCode, Radio, RefreshCw, TriangleAlert } from 'lucide-react';
import {
  Avatar, Button, Empty, IconButton, Input, KV, List, Load, Page, Pill, Row, Section, Segmented, Sheet, Textarea, cx, range, time, titleCase, useAction, useApi, useForm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { Chip, fromLondonInput, toLondonInput, useBase } from '../manager/_parts.jsx';

const ISSUE = ['late', 'no_show', 'left_early'];
const ON = ['on_shift', 'on_break'];
const KIND = { in: 'Clocked in', out: 'Clocked out', break_start: 'Break started', break_end: 'Break ended' };

export default function Live() {
  const { base, isManager, user } = useBase();
  const q = useApi('live.board', {}, { poll: 15000 });
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);

  return (
    <Page title={user.role === 'venue' ? 'On site' : 'Live'} subtitle="Updates every 15 seconds"
      actions={<IconButton icon={RefreshCw} label="Refresh" onClick={q.reload} className="bg-surface shadow-tile" />} wide>
      <Load q={q}>{(rows) => <Board rows={rows} filter={filter} setFilter={setFilter} onOpen={isManager ? setOpen : null} base={base} />}</Load>
      {open && <Detail row={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} base={base} />}
    </Page>
  );
}

function Board({ rows, filter, setFilter, onOpen, base }) {
  const n = (f) => rows.filter(f).length;
  const counts = {
    on: n((r) => ON.includes(r.state)), late: n((r) => r.state === 'late'), no_show: n((r) => r.state === 'no_show'),
    upcoming: n((r) => r.state === 'upcoming'), exc: n((r) => r.has_exception), done: n((r) => ['finished', 'left_early'].includes(r.state)),
  };
  const shown = rows.filter((r) => ({
    all: true, on: ON.includes(r.state), issues: ISSUE.includes(r.state) || r.has_exception, upcoming: r.state === 'upcoming', done: ['finished', 'left_early'].includes(r.state),
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
        <Chip label="Due on" value={counts.upcoming} tone="blue" active={filter === 'upcoming'} onClick={() => setFilter(filter === 'upcoming' ? 'all' : 'upcoming')} />
        <Chip label="Finished" value={counts.done} active={filter === 'done'} onClick={() => setFilter(filter === 'done' ? 'all' : 'done')} />
      </div>
      <Segmented value={filter} onChange={setFilter} className="mb-2"
        options={[{ value: 'all', label: 'All' }, { value: 'on', label: 'On site' }, { value: 'issues', label: 'Issues' }, { value: 'upcoming', label: 'Due on' }, { value: 'done', label: 'Finished' }]} />

      {!rows.length && <div className="mt-4"><Empty icon={Radio} title="Nobody due on site" body="Officers on published shifts from 2 hours ago to 12 hours ahead show here." /></div>}
      {rows.length > 0 && !shown.length && <div className="mt-4"><Empty title="Nobody in this view" /></div>}

      <div className="grid gap-x-5 lg:grid-cols-2">
        {groups.map(([id, g]) => {
          const on = g.rows.filter((r) => ON.includes(r.state)).length;
          return (
            <Section key={id} title={g.name} action={<span className="num text-[13px] font-semibold text-muted">{on} on site</span>}>
              <List>
                {g.rows.map((r) => (
                  <Row key={r.assignment_id}
                    onClick={onOpen ? () => onOpen(r) : undefined}
                    left={<Avatar name={r.officer_name} size={40} />}
                    title={r.officer_name}
                    subtitle={<><span className="num">{range(r.starts_at, r.ends_at)}</span> · {r.role_name}{r.clocked_in ? <> · in <span className="num">{time(r.clocked_in)}</span></> : ''}</>}
                    right={
                      <div className="flex flex-col items-end gap-1">
                        <Pill status={r.state} />
                        {r.has_exception && <Pill tone="red"><TriangleAlert size={11} />Exception</Pill>}
                      </div>
                    } />
                ))}
              </List>
            </Section>
          );
        })}
      </div>
      {base !== '/venue' && rows.some((r) => r.has_exception) && (
        <p className="mt-4 text-center text-[13px] text-muted">Review flagged clock-ins in <Link to={`${base}/exceptions`} className="font-semibold text-blue">Exceptions</Link>.</p>
      )}
    </>
  );
}

function Detail({ row, onClose, onDone, base }) {
  const [manual, setManual] = useState(false);
  const events = row.events || [];
  return (
    <Sheet open onClose={onClose} title={row.officer_name}
      footer={manual ? null : <>
        {row.phone && <Button variant="secondary" icon={Phone} onClick={() => { window.location.href = `tel:${row.phone}`; }}>Call</Button>}
        <Button variant="soft" onClick={() => setManual(true)}>Set times manually</Button>
      </>}>
      {manual ? <ManualForm row={row} onCancel={() => setManual(false)} onDone={onDone} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><Pill status={row.state} />{row.has_exception && <Pill tone="red">Exception</Pill>}</div>
          <KV items={[
            ['Venue', row.venue_name], ['Shift', <span className="num">{range(row.starts_at, row.ends_at)}</span>], ['Role', row.role_name],
            ['SIA', row.sia_number], ['Phone', row.phone], ['Clocked in', row.clocked_in && <span className="num">{time(row.clocked_in)}</span>],
          ]} />
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">Clock events</div>
            {!events.length ? <p className="text-[14px] text-muted">No clock events yet.</p> : (
              <List inset>
                {events.map((e, i) => (
                  <Row key={i} left={<span className={cx('grid h-8 w-8 place-items-center rounded-full', e.geo_ok ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber')}>{e.kind === 'in' || e.kind === 'out' ? <MapPin size={15} /> : <QrCode size={15} />}</span>}
                    title={KIND[e.kind] || titleCase(e.kind)}
                    subtitle={e.distance_m != null ? `${Math.round(e.distance_m)}m from venue` : (e.kind === 'in' || e.kind === 'out' ? 'No location' : '')}
                    right={<div className="flex flex-col items-end gap-1"><span className="num font-semibold">{time(e.ts)}</span>{e.status !== 'ok' && <Pill status={e.status} />}</div>} />
                ))}
              </List>
            )}
          </div>
          {row.has_exception && <Button variant="secondary" to={`${base}/exceptions`} icon={TriangleAlert}>Review exception</Button>}
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
      <p className="text-[14px] text-muted">Replaces the officer's clock events with these times and rebuilds the timesheet. This is recorded in the audit log.</p>
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
