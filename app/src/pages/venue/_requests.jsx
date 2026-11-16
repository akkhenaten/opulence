import { useState } from 'react';
import { api } from '../../api.js';
import { CalendarClock, History, Megaphone, MessagesSquare, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  ActionBar, Button, Callout, cx, Empty, KV, List, Load, Pill, Pressable, Row, Segmented, Sheet, addDays, dayLabel, isoDate, range, relative, time, useAction, useConfirm,
} from '../../ui/index.jsx';
import { BulkChangeSheet, bulkToast, ChangeSheet, describeChange, LABEL, RepeatTag, requestLine, statusOf } from '../manager/_cover.jsx';
import { Check as Tick } from '../manager/_parts.jsx';

// A date the venue can still cancel or change: not started, waiting or booked, no change already waiting
const changeable = (c, now = Date.now()) => ['pending', 'accepted'].includes(c.status) && new Date(c.starts_at) > now && c.change_status !== 'pending';

/** The venue's staff requests (the Requests tab of the venue rota). Select ticks several dates to cancel or change together. */
export function CoverList({ q, many, onOpen, onNew, onDone }) {
  const [tab, setTab] = useState('upcoming');
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [bulk, setBulk] = useState(null);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const now = Date.now();
  const stop = () => { setPicking(false); setSel(new Set()); };
  const toggle = (id) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = () => { stop(); setBulk(null); onDone?.(); };
  const cancelAll = async (chosen) => {
    const booked = chosen.filter((c) => c.status === 'accepted').length;
    if (!(await confirm({
      title: `Cancel ${chosen.length} date${chosen.length === 1 ? '' : 's'}?`, confirm: 'Cancel dates', danger: true,
      body: booked ? `${booked === chosen.length ? 'They are' : `${booked} of them are`} already booked, so the office approves ${booked === 1 ? 'that one' : 'those'} first.` : 'The office is told straight away.',
    }))) return;
    run(() => api('cover.updateMany', { ids: chosen.map((c) => c.id), delete: true }), bulkToast(true)).then(done).catch(() => onDone?.());
  };
  return (
    <>
      <div className="mb-4"><Segmented value={tab} onChange={(t) => { setTab(t); stop(); }} options={[{ value: 'upcoming', label: 'Upcoming', icon: CalendarClock }, { value: 'past', label: 'Past', icon: History }]} /></div>
      <Load q={q}>{(rows) => {
        const list = rows.filter((c) => (tab === 'upcoming' ? new Date(c.ends_at) > now : new Date(c.ends_at) <= now))
          .sort((a, b) => (tab === 'upcoming' ? new Date(a.starts_at) - new Date(b.starts_at) : new Date(b.starts_at) - new Date(a.starts_at)));
        if (!list.length) return <Empty icon={Megaphone} title={tab === 'upcoming' ? 'No upcoming requests' : 'No past requests'} body={tab === 'upcoming' ? 'Need extra officers for an event, or every Friday and Saturday? Send a request and we will confirm.' : undefined}
          action={tab === 'upcoming' && <Button icon={Plus} onClick={onNew}>Request staff</Button>} />;
        const open = tab === 'upcoming' ? list.filter((c) => changeable(c, now)) : [];
        const chosen = open.filter((c) => sel.has(c.id));
        const allOn = open.length > 0 && chosen.length === open.length;
        // Every changeable date of the same repeating request
        const seriesOf = (c) => open.filter((x) => x.series_id && x.series_id === c.series_id && x.kind === 'recurring');
        const pickSeries = (c) => setSel((x) => { const n = new Set(x); seriesOf(c).forEach((d) => n.add(d.id)); return n; });
        return (
          <>
            {open.length > 1 && (
              <div className="mb-2 flex justify-end gap-2">
                {picking && <Button variant="ghost" size="sm" onClick={() => setSel(allOn ? new Set() : new Set(open.map((c) => c.id)))}>{allOn ? 'Clear selection' : `Select all ${open.length}`}</Button>}
                <Button variant={picking ? 'secondary' : 'ghost'} size="sm" onClick={() => (picking ? stop() : setPicking(true))}>{picking ? 'Done' : 'Select'}</Button>
              </div>
            )}
            <List>
              {list.map((c) => {
                const can = picking && open.includes(c);
                const right = (
                  <div className="flex flex-col items-end gap-1">
                    <Pill status={statusOf(c)}>{LABEL[statusOf(c)]}</Pill>
                    {c.change_status === 'pending' ? <span className="text-caption font-semibold text-amber">Change awaiting approval</span> : <RepeatTag c={c} short />}
                  </div>
                );
                const subtitle = <span className="num">{requestLine(c)}{many ? ` · ${c.venue_name}` : ''}{c.stream_name ? ` · ${c.stream_name}` : ''}</span>;
                if (!picking) return <Row key={c.id} onClick={() => onOpen(c)} chevron title={c.role_name} subtitle={subtitle} right={right} />;
                const series = can ? seriesOf(c) : [];
                return (
                  <div key={c.id} className={cx('flex items-center gap-3 px-4 py-3', !can && 'opacity-50')}>
                    {can ? <Tick checked={sel.has(c.id)} onChange={() => toggle(c.id)} label={`Select ${dayLabel(c.starts_at)}`} /> : <span className="w-6 shrink-0" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <Pressable press={can} disabled={!can} className="min-w-0 text-left" onClick={() => can && toggle(c.id)}>
                        <div className="truncate text-body font-semibold">{c.role_name}</div>
                        <div className="truncate text-footnote text-muted">{subtitle}</div>
                      </Pressable>
                      {series.length > 1 && series.some((d) => !sel.has(d.id)) && (
                        <Button variant="link" size="sm" onClick={() => pickSeries(c)}>All {series.length} dates of this request</Button>
                      )}
                    </div>
                    {right}
                  </div>
                );
              })}
            </List>
            <ActionBar show={picking && chosen.length > 0}>
              <span className="num mr-2 text-subhead font-semibold">{chosen.length} selected</span>
              <Button variant="secondary" size="sm" icon={Trash2} disabled={busy} onClick={() => cancelAll(chosen)}>Cancel {chosen.length}</Button>
              <Button size="sm" icon={Pencil} disabled={busy} onClick={() => setBulk(chosen)}>Change {chosen.length}</Button>
            </ActionBar>
          </>
        );
      }}</Load>
      {bulk && <BulkChangeSheet dates={bulk} onClose={() => setBulk(null)} onDone={done} />}
    </>
  );
}

/** The same request a week on (or the first same weekday from tomorrow), to check and send */
export function againDraft(c, today = isoDate()) {
  let date = isoDate(c.starts_at);
  while (date <= today) date = addDays(date, 7);
  return { venue_id: c.venue_id, role: c.role, kind: 'one_off', date, start: time(c.starts_at), end: time(c.ends_at), headcount: c.headcount, notes: c.notes || '', quiet: true };
}

export function Detail({ c, onClose, onDone, onAgain }) {
  const [change, setChange] = useState(null);
  const st = statusOf(c);
  const live = ['pending', 'accepted'].includes(c.status) && new Date(c.starts_at) > new Date();
  const waiting = c.change_status === 'pending';
  if (change) return <ChangeSheet c={c} mode={change} isMgr={false} onClose={() => setChange(null)} onDone={onDone} />;
  return (
    <Sheet open onClose={onClose} title={c.role_name}
      footer={live && !waiting ? <><Button variant="secondary" icon={Trash2} onClick={() => setChange('delete')}>Cancel</Button><Button icon={Pencil} onClick={() => setChange('edit')}>Change</Button></> : null}>
      <div className="space-y-5">
        <p className="num text-body font-semibold">{requestLine(c)}</p>
        <div className="flex flex-wrap items-center gap-2"><Pill status={st}>{LABEL[st]}</Pill><RepeatTag c={c} /></div>
        {waiting && <Callout tone="warning" title="Waiting for approval">{describeChange(c)}. The request stays as it is until Orb approves.</Callout>}
        {c.change_status === 'declined' && c.change_reason && <p className="rounded-2xl bg-red-soft px-3 py-2 text-footnote text-red">Your last change wasn't approved: {c.change_reason}</p>}
        <KV items={[
          ['Venue', c.venue_name],
          ['When', <>{dayLabel(c.starts_at)}, <span className="num">{range(c.starts_at, c.ends_at)}</span></>],
          c.kind === 'recurring' && ['Pattern', c.pattern],
          ['Sent', c.requested_by_name ? `${relative(c.created_at)} by ${c.requested_by_name}` : relative(c.created_at)],
          c.status === 'accepted' && ['Officers', <span className="num">Booked {c.filled} of {c.headcount} · {c.confirmed ?? 0} confirmed</span>],
          ['Notes', c.notes],
          c.status === 'declined' && ['Reason', c.decline_reason || 'Please contact us to discuss.'],
        ]} />
        {c.status === 'accepted' && <p className="text-subhead text-muted">We are staffing this. Confirmed officers show under On site on the day. Changes to a confirmed request need Orb's approval.</p>}
        {c.conversation_id && <Button variant="soft" icon={MessagesSquare} to={`/venue/messages/${c.conversation_id}`}>Messages about this request</Button>}
        {onAgain && c.kind !== 'recurring' && <Button variant="soft" icon={Repeat} onClick={() => onAgain(againDraft(c))}>Request again</Button>}
      </div>
    </Sheet>
  );
}
