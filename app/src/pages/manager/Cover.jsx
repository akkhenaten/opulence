import { useState } from 'react';
import { Check, Megaphone, X } from 'lucide-react';
import {
  Button, Empty, KV, List, Load, Page, Pill, Row, Segmented, Sheet, Textarea, Toggle, dateTime, dayLabel, range, relative, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useBase } from './_parts.jsx';

const isFilled = (c) => c.status === 'accepted' && Number(c.filled) >= c.headcount;
const FILTERS = {
  pending: (c) => c.status === 'pending',
  accepted: (c) => c.status === 'accepted' && !isFilled(c),
  filled: isFilled,
  declined: (c) => c.status === 'declined' || c.status === 'cancelled',
  all: () => true,
};
const statusOf = (c) => (isFilled(c) ? 'filled' : c.status);

export default function Cover() {
  const { base, user } = useBase();
  const q = useApi('cover.list', {});
  const [tab, setTab] = useState('pending');
  const [open, setOpen] = useState(null);
  const rows = q.data || [];
  const n = (k) => rows.filter(FILTERS[k]).length;

  return (
    <Page title="Cover requests" subtitle="Venues asking for extra officers">
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'pending', label: 'Pending', count: n('pending') }, { value: 'accepted', label: 'Staffing' }, { value: 'filled', label: 'Filled' },
          { value: 'declined', label: 'Declined' }, { value: 'all', label: 'All' },
        ]} />
      </div>
      <Load q={q}>{(all) => {
        const list = all.filter(FILTERS[tab]);
        if (!list.length) return <Empty icon={Megaphone} title={tab === 'pending' ? 'No requests waiting' : 'Nothing here'} body={tab === 'pending' ? 'New requests from venues appear here.' : undefined} />;
        return (
          <List>
            {list.map((c) => (
              <Row key={c.id} onClick={() => setOpen(c)} chevron
                title={<>{c.venue_name} <span className="font-normal text-muted">· {c.headcount} × {c.role_name}</span></>}
                subtitle={<>{dayLabel(c.starts_at)} <span className="num">{range(c.starts_at, c.ends_at)}</span>{c.requested_by_name ? ` · ${c.requested_by_name}` : ''}</>}
                right={<div className="flex flex-col items-end gap-1"><Pill status={statusOf(c)} />{c.status === 'accepted' && <span className="num text-caption text-muted">{c.filled}/{c.headcount} staffed</span>}</div>} />
            ))}
          </List>
        );
      }}</Load>
      {open && <Detail c={open} base={base} canCancel={user.role === 'company'} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} />}
    </Page>
  );
}

function Detail({ c, base, canCancel, onClose, onDone }) {
  const [mode, setMode] = useState(null); // 'accept' | 'decline'
  const [asOpen, setAsOpen] = useState(true);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const accept = () => run(() => api('cover.accept', { id: c.id, open: asOpen }), 'Accepted, shift created').then(onDone).catch(() => {});
  const decline = () => run(() => api('cover.decline', { id: c.id, reason: reason.trim() }), 'Request declined').then(onDone).catch(() => {});
  const cancel = async () => {
    if (!(await confirm({ title: 'Cancel this request?', body: 'Use this if the venue no longer needs the cover. Shifts already created are not changed.', confirm: 'Cancel request', danger: true }))) return;
    run(() => api('cover.cancel', { id: c.id }), 'Request cancelled').then(onDone).catch(() => {});
  };

  let footer = null;
  if (c.status === 'pending' && !mode) footer = <><Button variant="secondary" icon={X} onClick={() => setMode('decline')}>Decline</Button><Button icon={Check} onClick={() => setMode('accept')}>Accept</Button></>;
  if (mode === 'accept') footer = <><Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button onClick={accept} busy={busy}>Accept and create shift</Button></>;
  if (mode === 'decline') footer = <><Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button variant="danger" onClick={decline} busy={busy}>Decline request</Button></>;
  if (c.status === 'accepted') footer = <>{canCancel && <Button variant="danger" onClick={cancel} disabled={busy}>Cancel request</Button>}<Button to={`${base}/rota`} variant="primary">Staff it in the rota</Button></>;

  return (
    <Sheet open onClose={onClose} title={c.venue_name} footer={footer}>
      <div className="space-y-5">
        <div className="flex items-center gap-2"><Pill status={statusOf(c)} />{c.status === 'accepted' && <span className="num text-footnote text-muted">{c.filled}/{c.headcount} staffed</span>}</div>
        <KV items={[
          ['Needed', `${c.headcount} × ${c.role_name}`],
          ['When', <>{dayLabel(c.starts_at)}, <span className="num">{range(c.starts_at, c.ends_at)}</span></>],
          ['Requested by', c.requested_by_name ? `${c.requested_by_name}, ${relative(c.created_at)}` : relative(c.created_at)],
          ['Shifts created', c.status === 'accepted' ? String(c.shift_count) : null],
          ['Notes', c.notes],
          c.status === 'declined' && ['Decline reason', c.decline_reason],
        ]} />
        {mode === 'accept' && (
          <div className="rounded-2xl bg-bg/70 p-4">
            <p className="mb-2 text-subhead text-muted">Creates a published shift for {dateTime(c.starts_at)} with {c.headcount} place{c.headcount > 1 ? 's' : ''}. The venue is told it is accepted.</p>
            <Toggle label="Offer as open shift" hint="Officers can ask to work it from the app" checked={asOpen} onChange={setAsOpen} />
          </div>
        )}
        {mode === 'decline' && <Textarea label="Reason for the venue" rows={3} placeholder="e.g. No licensed officers free at that time" value={reason} onChange={(e) => setReason(e.target.value)} />}
      </div>
    </Sheet>
  );
}
