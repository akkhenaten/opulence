import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Megaphone, MessagesSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Button, Empty, KV, List, Load, Page, Pill, Row, Segmented, Sheet, dayLabel, range, relative, useApi,
} from '../../ui/index.jsx';
import { ChangeSheet, describeChange, LABEL, RepeatTag, RequestForm, statusOf } from './_cover.jsx';

export default function VenueCover() {
  const q = useApi('cover.list', {});
  const venues = useApi('venues.list', {});
  const roles = useApi('roles.list', {});
  const loc = useLocation();
  const nav = useNavigate();
  const [tab, setTab] = useState('upcoming');
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const now = Date.now();

  // A message turned into a request arrives with a draft to check
  useEffect(() => {
    if (loc.state?.draft) { setForm({ draft: loc.state.draft }); nav(loc.pathname, { replace: true, state: null }); }
  }, [loc.state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page title="Request cover" subtitle="Ask for extra officers, once or every week"
      actions={<Button icon={Plus} onClick={() => setForm({})}>New request</Button>}>
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /></div>
      <Load q={q}>{(rows) => {
        const list = rows.filter((c) => (tab === 'upcoming' ? new Date(c.ends_at) > now : new Date(c.ends_at) <= now))
          .sort((a, b) => (tab === 'upcoming' ? new Date(a.starts_at) - new Date(b.starts_at) : new Date(b.starts_at) - new Date(a.starts_at)));
        if (!list.length) return <Empty icon={Megaphone} title={tab === 'upcoming' ? 'No upcoming requests' : 'No past requests'} body={tab === 'upcoming' ? 'Need extra officers for an event, or every Friday and Saturday? Send a request and we will confirm.' : undefined}
          action={tab === 'upcoming' && <Button icon={Plus} onClick={() => setForm({})}>Request cover</Button>} />;
        return (
          <List>
            {list.map((c) => (
              <Row key={c.id} onClick={() => setOpen(c)} chevron
                title={<>{c.headcount} × {c.role_name}</>}
                subtitle={<>{dayLabel(c.starts_at)} <span className="num">{range(c.starts_at, c.ends_at)}</span>{(venues.data?.length || 0) > 1 ? ` · ${c.venue_name}` : ''}</>}
                right={(
                  <div className="flex flex-col items-end gap-1">
                    <Pill status={statusOf(c)}>{LABEL[statusOf(c)]}</Pill>
                    {c.change_status === 'pending' ? <span className="text-caption font-semibold text-amber">Change awaiting approval</span> : <RepeatTag c={c} />}
                  </div>
                )} />
            ))}
          </List>
        );
      }}</Load>
      {form && <RequestForm venues={venues.data || []} roles={roles.data || []} draft={form.draft} onClose={() => setForm(null)} onDone={() => { setForm(null); setTab('upcoming'); q.reload(); }} />}
      {open && <Detail c={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} />}
    </Page>
  );
}

function Detail({ c, onClose, onDone }) {
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
        {waiting && <p className="rounded-2xl bg-amber-soft px-3 py-2 text-footnote text-amber"><b>Waiting for approval:</b> {describeChange(c)}. The booking stays as it is until Orb approves.</p>}
        {c.change_status === 'declined' && c.change_reason && <p className="rounded-2xl bg-red-soft px-3 py-2 text-footnote text-red">Your last change wasn't approved: {c.change_reason}</p>}
        <KV items={[
          ['Venue', c.venue_name],
          ['When', <>{dayLabel(c.starts_at)}, <span className="num">{range(c.starts_at, c.ends_at)}</span></>],
          c.kind === 'recurring' && ['Pattern', c.pattern],
          ['Sent', c.requested_by_name ? `${relative(c.created_at)} by ${c.requested_by_name}` : relative(c.created_at)],
          c.status === 'accepted' && ['Officers confirmed', <span className="num">{c.filled} of {c.headcount}</span>],
          ['Notes', c.notes],
          c.status === 'declined' && ['Reason', c.decline_reason || 'Please contact us to discuss.'],
        ]} />
        {c.status === 'accepted' && <p className="text-subhead text-muted">We are staffing this. Confirmed officers show under On site on the day. Changes to booked cover need Orb's approval.</p>}
        {c.conversation_id && <Button variant="soft" icon={MessagesSquare} to={`/venue/messages/${c.conversation_id}`}>Messages about this request</Button>}
      </div>
    </Sheet>
  );
}
