import { useState } from 'react';
import { Megaphone, MessagesSquare, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  Button, Callout, Empty, KV, List, Load, Pill, Row, Segmented, Sheet, addDays, dayLabel, isoDate, range, relative, time,
} from '../../ui/index.jsx';
import { ChangeSheet, describeChange, LABEL, RepeatTag, statusOf } from '../manager/_cover.jsx';

/** The venue's cover requests (the Requests tab of the venue rota). */
export function CoverList({ q, many, onOpen, onNew }) {
  const [tab, setTab] = useState('upcoming');
  const now = Date.now();
  return (
    <>
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /></div>
      <Load q={q}>{(rows) => {
        const list = rows.filter((c) => (tab === 'upcoming' ? new Date(c.ends_at) > now : new Date(c.ends_at) <= now))
          .sort((a, b) => (tab === 'upcoming' ? new Date(a.starts_at) - new Date(b.starts_at) : new Date(b.starts_at) - new Date(a.starts_at)));
        if (!list.length) return <Empty icon={Megaphone} title={tab === 'upcoming' ? 'No upcoming requests' : 'No past requests'} body={tab === 'upcoming' ? 'Need extra officers for an event, or every Friday and Saturday? Send a request and we will confirm.' : undefined}
          action={tab === 'upcoming' && <Button icon={Plus} onClick={onNew}>Request staff</Button>} />;
        return (
          <List>
            {list.map((c) => (
              <Row key={c.id} onClick={() => onOpen(c)} chevron
                title={<>{c.headcount} × {c.role_name}</>}
                subtitle={<>{dayLabel(c.starts_at)} <span className="num">{range(c.starts_at, c.ends_at)}</span>{many ? ` · ${c.venue_name}` : ''}</>}
                right={(
                  <div className="flex flex-col items-end gap-1">
                    <Pill status={statusOf(c)}>{LABEL[statusOf(c)]}</Pill>
                    {c.change_status === 'pending' ? <span className="text-caption font-semibold text-amber">Change awaiting approval</span> : <RepeatTag c={c} short />}
                  </div>
                )} />
            ))}
          </List>
        );
      }}</Load>
    </>
  );
}

/** The same booking a week on (or the first same weekday from tomorrow), to check and send */
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
    <Sheet open onClose={onClose} title={`${c.headcount} × ${c.role_name}`}
      footer={live && !waiting ? <><Button variant="secondary" icon={Trash2} onClick={() => setChange('delete')}>Cancel</Button><Button icon={Pencil} onClick={() => setChange('edit')}>Change</Button></> : null}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Pill status={st}>{LABEL[st]}</Pill><RepeatTag c={c} /></div>
        {waiting && <Callout tone="warning" title="Waiting for approval">{describeChange(c)}. The booking stays as it is until Orb approves.</Callout>}
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
        {c.status === 'accepted' && <p className="text-subhead text-muted">We are staffing this. Confirmed officers show under On site on the day. Changes to booked cover need Orb's approval.</p>}
        {c.conversation_id && <Button variant="soft" icon={MessagesSquare} to={`/venue/messages/${c.conversation_id}`}>Messages about this request</Button>}
        {onAgain && c.kind !== 'recurring' && <Button variant="soft" icon={Repeat} onClick={() => onAgain(againDraft(c))}>Request again</Button>}
      </div>
    </Sheet>
  );
}
