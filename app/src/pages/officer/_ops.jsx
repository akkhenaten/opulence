// Ops AI on the officer app: the "you haven't clocked in" reply banner and cover offers
import { useState } from 'react';
import { AlarmClock, Check, Megaphone, X } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Empty, Pill, Segmented, Sheet, Textarea, Tile, dayLabel, range, time, useAction, useApi } from '../../ui/index.jsx';

export const useOps = (skip) => useApi('ops.myOffers', {}, { poll: 30000, skip });

export function ChaseBanner({ ops }) {
  const [run, busy] = useAction();
  const [sheet, setSheet] = useState(null);
  const [eta, setEta] = useState('15');
  const [reason, setReason] = useState('');
  const list = ops.data?.chase || [];
  if (!list.length) return null;
  const a = list[0];
  const reply = (body, msg) => run(() => api('ops.reply', { assignment_id: a.assignment_id, ...body }), msg).then(() => { setSheet(null); ops.reload(); }).catch(() => {});

  if (a.reply === 'on_my_way') {
    return (
      <Tile className="border-amber/20 !bg-amber-soft">
        <div className="flex items-center gap-3 text-amber"><AlarmClock size={22} className="shrink-0" /><div><div className="font-bold">Thanks — we know you're on your way</div><div className="text-[13px]">{a.venue_name} · started {time(a.starts_at)}. Clock in as soon as you arrive.</div></div></div>
        <Button size="sm" className="mt-3" to="/officer/clock">Clock in</Button>
      </Tile>
    );
  }
  if (a.reply === 'cant_make_it') return null;
  return (
    <Tile className="border-red/20 !bg-red-soft">
      <div className="flex gap-3 text-red">
        <AlarmClock size={24} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[17px] font-bold">You haven't clocked in</div>
          <div className="text-[14px] font-medium">{a.venue_name} started at {time(a.starts_at)}. Let us know what's happening.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" to="/officer/clock">Clock in</Button>
            <Button size="sm" variant="secondary" onClick={() => setSheet('omw')}>On my way</Button>
            <Button size="sm" variant="danger" onClick={() => setSheet('cant')}>Can't make it</Button>
          </div>
        </div>
      </div>
      <Sheet open={sheet === 'omw'} onClose={() => setSheet(null)} title="How long until you arrive?" size="sm"
        footer={<Button busy={busy} onClick={() => reply({ reply: 'on_my_way', eta_min: Number(eta) }, 'Thanks — your manager knows')}>Send</Button>}>
        <Segmented full value={eta} onChange={setEta} options={[{ value: '5', label: '5 min' }, { value: '10', label: '10 min' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }]} />
      </Sheet>
      <Sheet open={sheet === 'cant'} onClose={() => setSheet(null)} title="Can't make it" size="sm"
        footer={<Button variant="danger" busy={busy} disabled={!reason.trim()} onClick={() => reply({ reply: 'cant_make_it', reason }, 'Thanks — we\'ll find cover')}>Send</Button>}>
        <Textarea label="What's happened?" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <p className="mt-2 text-[13px] text-muted">Your manager is told straight away so they can find cover.</p>
      </Sheet>
    </Tile>
  );
}

function OfferCard({ o, onDone }) {
  const [run, busy] = useAction();
  const respond = (accept) => run(() => api('ops.offerRespond', { offer_id: o.id, accept }), accept ? 'Shift is yours' : 'Declined').then(onDone).catch(onDone);
  const open = o.status === 'offered';
  return (
    <Tile className="!p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-blue">Cover offer</div>
          <div className="text-[17px] font-bold">{o.venue_name}</div>
          <div className="text-[14px] text-muted">{dayLabel(o.starts_at)} · {range(o.starts_at, o.ends_at)} · {o.role_name}</div>
        </div>
        {!open && <Pill status={o.status === 'filled_by_other' ? 'closed' : o.status}>{o.status === 'filled_by_other' ? 'Filled' : o.status === 'accepted' ? 'Yours' : o.status === 'declined' ? 'Declined' : 'Expired'}</Pill>}
      </div>
      {open && (
        <div className="mt-3 flex gap-2">
          <Button icon={Check} busy={busy} onClick={() => respond(true)} className="flex-1">Accept</Button>
          <Button variant="secondary" icon={X} disabled={busy} onClick={() => respond(false)}>Decline</Button>
        </div>
      )}
    </Tile>
  );
}

export function OffersList({ ops, compact }) {
  const offers = (ops.data?.offers || []).filter((o) => !compact || o.status === 'offered');
  if (!offers.length) return compact ? null : <Empty icon={Megaphone} title="No cover offers" body="When we need someone to cover a shift, offers appear here. First to accept gets it." />;
  return <div className="space-y-3">{offers.map((o) => <OfferCard key={o.id} o={o} onDone={ops.reload} />)}</div>;
}
