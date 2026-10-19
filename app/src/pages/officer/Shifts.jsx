import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OffersList, useOps } from './_ops.jsx';
import { CalendarDays, CalendarOff, Check, Hand, Info, Megaphone, X } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  addDays, Button, Empty, isoDate, Load, Page, Section, Sheet, Tabs, Textarea, time, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { ASSIGN_LABEL, assignTone, NotLinked, ShiftCard } from './_parts.jsx';

export default function Shifts() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = ['open', 'offers'].includes(sp.get('tab')) ? sp.get('tab') : 'mine';
  const setTab = (t) => setSp(t === 'mine' ? {} : { tab: t }, { replace: true });
  const open = useApi('shifts.open', {}, { skip: !user.officer_id });
  const ops = useOps(!user.officer_id);
  const offered = (ops.data?.offers || []).filter((o) => o.status === 'offered').length;

  return (
    <Page title="Shifts" actions={<Button size="sm" variant="secondary" icon={CalendarOff} to="/officer/time-off">Availability</Button>}>
      {!user.officer_id ? <NotLinked /> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'mine', label: 'My shifts' }, { value: 'offers', label: 'Offers', count: offered }, { value: 'open', label: 'Open shifts', count: open.data?.length }]} />
          {tab === 'mine' ? <Mine /> : tab === 'offers' ? <OffersList ops={ops} /> : <Open q={open} />}
        </>
      )}
    </Page>
  );
}

function Mine() {
  const [from] = useState(() => new Date(`${addDays(isoDate(), -42)}T00:00:00Z`).toISOString());
  const q = useApi('shifts.mine', { from });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [declining, setDeclining] = useState(null);
  const [reason, setReason] = useState('');

  const respond = (s, accept, extra = {}) => run(() => api('shifts.respond', { assignment_id: s.assignment_id, accept, ...extra }),
    accept ? 'Shift confirmed' : s.assignment_status === 'requested' ? 'Request withdrawn' : 'Shift declined').then(() => { q.reload(); setDeclining(null); setReason(''); }).catch(() => {});

  const withdraw = async (s) => {
    if (await confirm({ title: 'Withdraw request?', body: `${s.venue_name}, ${time(s.starts_at)}. You can request it again while it is still open.`, confirm: 'Withdraw', danger: true })) respond(s, false);
  };

  return (
    <Load q={q}>
      {(rows) => {
        const now = Date.now();
        const upcoming = rows.filter((s) => new Date(s.ends_at) > now);
        const past = rows.filter((s) => new Date(s.ends_at) <= now && s.assignment_status === 'accepted').reverse();
        const toRespond = upcoming.filter((s) => s.assignment_status === 'assigned');
        return (
          <>
            {toRespond.length > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl bg-amber-soft px-4 py-3 text-[14px] font-semibold text-amber">
                <Info size={17} />{toRespond.length} shift{toRespond.length > 1 ? 's' : ''} waiting for your answer
              </div>
            )}
            {!upcoming.length ? (
              <Empty icon={CalendarDays} title="No upcoming shifts" body="When you're booked on a shift it appears here." action={<Button to="/officer/shifts?tab=open" icon={Megaphone}>Find open shifts</Button>} />
            ) : (
              <div className="space-y-2.5">
                {upcoming.map((s) => {
                  const clocked = (s.clock || []).some((e) => e.status !== 'rejected');
                  return (
                    <ShiftCard key={s.assignment_id} s={s} status={ASSIGN_LABEL[s.assignment_status]} statusTone={assignTone[s.assignment_status]}>
                      {s.notes && <p className="mt-2 text-[13px] text-muted">{s.notes}</p>}
                      {s.assignment_status === 'assigned' && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button variant="secondary" size="lg" icon={X} onClick={() => setDeclining(s)}>Decline</Button>
                          <Button size="lg" icon={Check} busy={busy} onClick={() => respond(s, true)}>Accept</Button>
                        </div>
                      )}
                      {s.assignment_status === 'requested' && (
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-[13px] text-muted">Waiting for the office to approve</span>
                          <Button variant="ghost" size="sm" onClick={() => withdraw(s)}>Withdraw</Button>
                        </div>
                      )}
                      {s.assignment_status === 'accepted' && !clocked && new Date(s.starts_at) > now && (
                        <div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => setDeclining(s)}>I can't work this</Button></div>
                      )}
                    </ShiftCard>
                  );
                })}
              </div>
            )}

            {past.length > 0 && (
              <Section title="Recent">
                <div className="space-y-2.5 opacity-90">
                  {past.map((s) => {
                    const ins = (s.clock || []).filter((e) => e.kind === 'in' && e.status !== 'rejected');
                    const outs = (s.clock || []).filter((e) => e.kind === 'out' && e.status !== 'rejected');
                    const worked = ins.length ? `Worked ${time(ins[0].ts)}${outs.length ? `–${time(outs.at(-1).ts)}` : ''}` : 'No clock-in recorded';
                    return <ShiftCard key={s.assignment_id} s={s} status={ins.length ? 'Worked' : 'Not clocked'} statusTone={ins.length ? 'grey' : 'amber'}><p className="mt-2 text-[13px] text-muted">{worked}</p></ShiftCard>;
                  })}
                </div>
              </Section>
            )}

            <Sheet open={!!declining} onClose={() => setDeclining(null)} title={declining?.assignment_status === 'accepted' ? "Can't work this shift" : 'Decline shift'} size="sm"
              footer={<><Button variant="secondary" onClick={() => setDeclining(null)}>Keep it</Button><Button variant="danger" busy={busy} onClick={() => respond(declining, false, { reason })}>Decline shift</Button></>}>
              {declining && <p className="mb-3 text-[15px] text-muted">{declining.venue_name}, {time(declining.starts_at)}–{time(declining.ends_at)}. The office will be told so they can find cover.</p>}
              <Textarea label="Reason (optional)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unwell, family emergency" />
            </Sheet>
          </>
        );
      }}
    </Load>
  );
}

function Open({ q }) {
  const [run, busy] = useAction();
  const [pending, setPending] = useState(null);
  const request = (s) => {
    setPending(s.id);
    run(() => api('shifts.request', { shift_id: s.id }), 'Requested. The office will confirm.').then(q.reload).catch(() => {}).finally(() => setPending(null));
  };
  return (
    <Load q={q}>
      {(rows) => (!rows.length ? (
        <Empty icon={Megaphone} title="No open shifts right now" body="Open shifts that need cover appear here. You'll get a notification when the office posts one." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((s) => {
            const left = s.headcount - Number(s.filled || 0);
            return (
              <ShiftCard key={s.id} s={s} status={s.my_status === 'requested' ? 'Requested' : `${left} place${left === 1 ? '' : 's'}`} statusTone={s.my_status === 'requested' ? 'blue' : 'grey'}>
                {s.notes && <p className="mt-2 text-[13px] text-muted">{s.notes}</p>}
                {s.my_status === 'requested' ? (
                  <p className="mt-3 text-[13px] font-semibold text-blue">Waiting for the office to approve. You can withdraw it from My shifts.</p>
                ) : (
                  <Button size="lg" icon={Hand} className="mt-3 w-full" busy={busy && pending === s.id} disabled={busy} onClick={() => request(s)}>Request shift</Button>
                )}
              </ShiftCard>
            );
          })}
        </div>
      ))}
    </Load>
  );
}
