import { useState } from 'react';
import { api } from '../../api.js';
import { CalendarClock, History, ListChecks, Megaphone, MessagesSquare, Pencil, Plus, Repeat, Trash2, X } from 'lucide-react';
import {
  Button, Callout, Empty, KV, Load, Pill, Segmented, Sheet, addDays, dayLabel, isoDate, range, relative, time, useAction, useConfirm,
} from '../../ui/index.jsx';
import { bulkToast, canCancel, canChange, cancelSplit, ChangeRequest, describeChange, LABEL, RepeatTag, requestLine, statusOf } from '../manager/_cover.jsx';
import { groupRequests, RequestCards, sortGroups } from '../manager/_requestCards.jsx';

/** The venue's staff requests (the Requests tab of the venue rota): one card per request, its dates inside. */
export function CoverList({ q, many, onOpen, onNew, onDone }) {
  const [tab, setTab] = useState('upcoming');
  const [bulk, setBulk] = useState(null); // { edit, mode }
  const [run] = useAction();
  const confirm = useConfirm();
  const cancelDates = async (dates, stop, title) => {
    const list = dates.filter((c) => canCancel(c)).slice(0, 100);
    if (!list.length) return;
    if (!(await confirm({ title: title || `Cancel ${list.length} date${list.length === 1 ? '' : 's'}?`, body: cancelSplit(list, false), confirm: 'Cancel dates', danger: true }))) return;
    run(() => api('cover.updateMany', { ids: list.map((c) => c.id), delete: true }), bulkToast(true)).then(() => { stop?.(); onDone?.(); }).catch(() => onDone?.());
  };
  // The whole request: its pattern from the next date that can still change, or every changeable date when it was split into several patterns
  const changeWhole = (g) => {
    const open = g.live.filter((c) => canChange(c));
    const series = new Set(open.map((c) => c.series_id));
    if (open.length > 1 && series.size > 1) setBulk({ edit: open });
    else setBulk({ edit: [open[0]], mode: open[0].kind === 'recurring' ? 'future' : 'one' });
  };
  const actions = (g, { select, picking, stop }) => {
    const changeable = g.live.filter((c) => canChange(c));
    const cancellable = g.live.filter((c) => canCancel(c));
    return (
      <>
        <Button size="sm" variant="soft" icon={Pencil} disabled={!changeable.length} onClick={() => changeWhole(g)}>Change whole request</Button>
        <Button size="sm" variant="soft" icon={Trash2} disabled={!cancellable.length} onClick={() => cancelDates(cancellable, null, 'Cancel the whole request?')}>Cancel whole request</Button>
        {g.live.length > 1 && <Button size="sm" variant={picking ? 'secondary' : 'ghost'} icon={picking ? X : ListChecks} onClick={picking ? stop : select}>{picking ? 'Done' : 'Select dates'}</Button>}
        {g.conversation_id && <Button size="sm" variant="ghost" icon={MessagesSquare} to={`/venue/messages/${g.conversation_id}`}>Message the office</Button>}
        {!changeable.length && g.live.length > 0 && (
          <p className="w-full text-caption text-muted">{g.counts.change ? 'A change is waiting for the office.' : 'The next date has started, so it can only be cancelled.'}</p>
        )}
      </>
    );
  };
  return (
    <>
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming', icon: CalendarClock }, { value: 'past', label: 'Past', icon: History }]} /></div>
      <Load q={q}>{(rows) => {
        const groups = sortGroups(groupRequests(rows).filter((g) => (tab === 'upcoming' ? !!g.next : !g.next)));
        if (!groups.length) return <Empty icon={Megaphone} title={tab === 'upcoming' ? 'No upcoming requests' : 'No past requests'} body={tab === 'upcoming' ? 'Need extra officers for an event, or every Friday and Saturday? Send a request and we will confirm.' : undefined}
          action={tab === 'upcoming' && <Button icon={Plus} onClick={onNew}>Request staff</Button>} />;
        return <RequestCards key={tab} groups={groups} many={many} onOpen={(c) => onOpen(c)} actions={tab === 'upcoming' ? actions : undefined}
          onCancelDates={(d, stop) => cancelDates(d, stop)} onChangeDates={(d, stop) => { stop(); setBulk({ edit: d.filter((c) => canChange(c)) }); }} />;
      }}</Load>
      {bulk && <ChangeRequest edit={bulk.edit} initialMode={bulk.mode} onClose={() => setBulk(null)} onDone={() => { setBulk(null); onDone?.(); }} />}
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
  const [change, setChange] = useState(false);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const st = statusOf(c);
  const waiting = c.change_status === 'pending';
  // Any date today can be cancelled; changing stops once it starts
  const cancel = async () => {
    if (!(await confirm({ title: `Cancel ${dayLabel(c.starts_at)}?`, body: cancelSplit([c], false), confirm: 'Cancel date', danger: true }))) return;
    run(() => api('cover.update', { id: c.id, scope: 'one', delete: true }), (r) => (r.status === 'awaiting_approval' ? 'Sent to the office for approval' : 'Cancelled')).then(onDone).catch(() => {});
  };
  if (change) return <ChangeRequest edit={[c]} onClose={() => setChange(false)} onDone={onDone} />;
  const footer = canCancel(c) || canChange(c) ? (
    <>
      {canCancel(c) && <Button variant="secondary" icon={Trash2} busy={busy} onClick={cancel}>Cancel</Button>}
      {canChange(c) && <Button icon={Pencil} onClick={() => setChange(true)}>Change</Button>}
    </>
  ) : null;
  return (
    <Sheet open onClose={onClose} title={c.role_name} footer={footer}>
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
