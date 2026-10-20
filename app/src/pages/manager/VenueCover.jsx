import { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import {
  Button, Empty, Input, KV, List, Load, Page, Pill, Row, Segmented, Select, Sheet, Textarea, addDays, dayLabel, isoDate, range, relative,
  useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { londonParts, shiftTimes } from './_parts.jsx';

const isFilled = (c) => c.status === 'accepted' && Number(c.filled) >= c.headcount;
const statusOf = (c) => (isFilled(c) ? 'filled' : c.status);
const LABEL = { pending: 'Waiting', accepted: 'Accepted', filled: 'Staffed', declined: 'Declined', cancelled: 'Cancelled' };

export default function VenueCover() {
  const q = useApi('cover.list', {});
  const venues = useApi('venues.list', {});
  const roles = useApi('roles.list', {});
  const [tab, setTab] = useState('upcoming');
  const [form, setForm] = useState(false);
  const [open, setOpen] = useState(null);
  const now = Date.now();

  return (
    <Page title="Request cover" subtitle="Ask for extra officers at your venue"
      actions={<Button icon={Plus} onClick={() => setForm(true)}>New request</Button>}>
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /></div>
      <Load q={q}>{(rows) => {
        const list = rows.filter((c) => (tab === 'upcoming' ? new Date(c.ends_at) > now : new Date(c.ends_at) <= now))
          .sort((a, b) => (tab === 'upcoming' ? new Date(a.starts_at) - new Date(b.starts_at) : new Date(b.starts_at) - new Date(a.starts_at)));
        if (!list.length) return <Empty icon={Megaphone} title={tab === 'upcoming' ? 'No upcoming requests' : 'No past requests'} body={tab === 'upcoming' ? 'Need extra officers for an event or a busy night? Send a request and we will confirm.' : undefined}
          action={tab === 'upcoming' && <Button icon={Plus} onClick={() => setForm(true)}>Request cover</Button>} />;
        return (
          <List>
            {list.map((c) => (
              <Row key={c.id} onClick={() => setOpen(c)} chevron
                title={<>{c.headcount} × {c.role_name}</>}
                subtitle={<>{dayLabel(c.starts_at)} <span className="num">{range(c.starts_at, c.ends_at)}</span>{(venues.data?.length || 0) > 1 ? ` · ${c.venue_name}` : ''}</>}
                right={<Pill status={statusOf(c)}>{LABEL[statusOf(c)]}</Pill>} />
            ))}
          </List>
        );
      }}</Load>
      {form && <RequestForm venues={venues.data || []} roles={roles.data || []} onClose={() => setForm(false)} onDone={() => { setForm(false); setTab('upcoming'); q.reload(); }} />}
      {open && <Detail c={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} />}
    </Page>
  );
}

function RequestForm({ venues, roles, onClose, onDone }) {
  const f = useForm({ venue_id: venues.length === 1 ? venues[0].id : '', role: '', date: addDays(isoDate(), 1), start: '19:00', end: '03:00', headcount: 1, notes: '' });
  const [run, busy] = useAction();
  const v = f.v;
  const t = v.date && v.start && v.end ? shiftTimes(v.date, v.start, v.end) : null;
  const overnight = t && londonParts(t.ends_at).date !== v.date;
  const ok = (v.venue_id || venues.length === 1) && v.role && t && Number(v.headcount) >= 1;
  const send = () => run(() => api('cover.create', {
    venue_id: v.venue_id || venues[0]?.id, role: v.role, ...t, headcount: Number(v.headcount), notes: v.notes.trim(),
  }), 'Request sent').then(onDone).catch(() => {});

  return (
    <Sheet open onClose={onClose} title="Request cover"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} busy={busy} disabled={!ok}>Send request</Button></>}>
      <div className="space-y-3">
        {venues.length !== 1 && <Select label="Venue" value={v.venue_id} onChange={(e) => f.set('venue_id', e.target.value)} placeholder="Choose venue" options={venues.map((x) => ({ value: x.id, label: x.name }))} />}
        <Select label="Officer type" value={v.role} onChange={(e) => f.set('role', e.target.value)} placeholder="Choose" options={roles.map((r) => ({ value: r.code, label: r.name }))} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Input label="Date" type="date" min={isoDate()} className="col-span-2 sm:col-span-1" {...f.bind('date')} />
          <Input label="Start" type="time" {...f.bind('start')} />
          <Input label="End" type="time" {...f.bind('end')} hint={overnight ? 'Ends next day' : undefined} />
        </div>
        <Input label="How many officers" type="number" min="1" max="100" inputMode="numeric" {...f.bind('headcount')} />
        <Textarea label="Notes" rows={3} placeholder="Event, dress code, where to report" {...f.bind('notes')} />
      </div>
    </Sheet>
  );
}

function Detail({ c, onClose, onDone }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const cancel = async () => {
    if (!(await confirm({ title: 'Cancel this request?', confirm: 'Cancel request', danger: true }))) return;
    run(() => api('cover.cancel', { id: c.id }), 'Request cancelled').then(onDone).catch(() => {});
  };
  const st = statusOf(c);
  return (
    <Sheet open onClose={onClose} title={`${c.headcount} × ${c.role_name}`}
      footer={c.status === 'pending' ? <Button variant="danger" onClick={cancel} busy={busy}>Cancel request</Button> : null}>
      <div className="space-y-5">
        <Pill status={st}>{LABEL[st]}</Pill>
        <KV items={[
          ['Venue', c.venue_name],
          ['When', <>{dayLabel(c.starts_at)}, <span className="num">{range(c.starts_at, c.ends_at)}</span></>],
          ['Sent', c.requested_by_name ? `${relative(c.created_at)} by ${c.requested_by_name}` : relative(c.created_at)],
          c.status === 'accepted' && ['Officers confirmed', <span className="num">{c.filled} of {c.headcount}</span>],
          ['Notes', c.notes],
          c.status === 'declined' && ['Reason', c.decline_reason || 'Please contact us to discuss.'],
        ]} />
        {c.status === 'accepted' && <p className="text-subhead text-muted">We are staffing this. Confirmed officers show under On site on the day. To change it, contact the office.</p>}
      </div>
    </Sheet>
  );
}
