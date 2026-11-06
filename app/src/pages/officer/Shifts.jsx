import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OffersList, useOps } from './_ops.jsx';
import { CalendarDays, CalendarOff, Check, ChevronRight, Hand, Info, Megaphone, X } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  addDays, Button, Empty, isoDate, Load, Page, Section, Tabs, time, useAction, useApi, useConfirm, usePullRefresh,
} from '../../ui/index.jsx';
import { ASSIGN_LABEL, assignTone, DeclineSheet, NotLinked, ShiftCard } from './_parts.jsx';
import ShiftCalendar from './ShiftCalendar.jsx';

export default function Shifts() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = ['open', 'offers', 'mine'].includes(sp.get('tab')) ? sp.get('tab') : 'calendar';
  const setTab = (t) => setSp(t === 'calendar' ? {} : { tab: t }, { replace: true });
  const open = useApi('shifts.open', {}, { skip: !user.officer_id });
  const ops = useOps(!user.officer_id);
  const offered = (ops.data?.offers || []).filter((o) => o.status === 'offered').length;
  const pull = usePullRefresh(() => Promise.all([open.reload(), ops.reload()]), !['mine', 'calendar'].includes(tab) && !!user.officer_id);

  return (
    <Page title="Shifts" actions={<Button size="sm" variant="secondary" icon={CalendarOff} to="/officer/time-off">Availability</Button>}>
      {pull}
      {!user.officer_id ? <NotLinked /> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'calendar', label: 'Calendar' }, { value: 'mine', label: 'List' }, { value: 'offers', label: 'Offers', count: offered }, { value: 'open', label: 'Open shifts', count: open.data?.length }]} />
          {tab === 'calendar' ? <ShiftCalendar /> : tab === 'mine' ? <Mine /> : tab === 'offers' ? <OffersList ops={ops} /> : <Open q={open} />}
        </>
      )}
    </Page>
  );
}

function Mine() {
  const [from] = useState(() => new Date(`${addDays(isoDate(), -42)}T00:00:00Z`).toISOString());
  const q = useApi('shifts.mine', { from });
  const pull = usePullRefresh(q.reload);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [declining, setDeclining] = useState(null);

  const respond = (s, accept) => run(() => api('shifts.respond', { assignment_id: s.assignment_id, accept }),
    accept ? 'Shift confirmed' : 'Request withdrawn').then(q.reload).catch(() => {});

  const withdraw = async (s) => {
    if (await confirm({ title: 'Withdraw request?', body: `${s.venue_name}, ${time(s.starts_at)}. You can request it again while it is still open.`, confirm: 'Withdraw', danger: true })) respond(s, false);
  };

  return (
    <>
      {pull}
      <Load q={q} skeleton="rows">
      {(rows) => {
        const now = Date.now();
        const upcoming = rows.filter((s) => new Date(s.ends_at) > now);
        const past = rows.filter((s) => new Date(s.ends_at) <= now && s.assignment_status === 'accepted').reverse();
        const toRespond = upcoming.filter((s) => s.assignment_status === 'assigned');
        return (
          <>
            {toRespond.length > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-2xl bg-amber-soft px-4 py-3 text-subhead font-semibold text-amber">
                <Info size={18} />{toRespond.length} shift{toRespond.length > 1 ? 's' : ''} waiting for your answer
              </div>
            )}
            {!upcoming.length ? (
              <Empty photo="kit" icon={CalendarDays} title="No upcoming shifts" body="When you're booked on a shift it appears here." action={<Button to="/officer/shifts?tab=open" icon={Megaphone}>Find open shifts</Button>} />
            ) : (
              <div className="space-y-2.5">
                {upcoming.map((s) => {
                  const clocked = (s.clock || []).some((e) => e.status !== 'rejected');
                  return (
                    <ShiftCard key={s.assignment_id} s={s} status={ASSIGN_LABEL[s.assignment_status]} statusTone={assignTone[s.assignment_status]}>
                      {s.notes && <p className="mt-2 text-footnote text-muted">{s.notes}</p>}
                      {s.assignment_status === 'assigned' && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button variant="secondary" size="lg" icon={X} onClick={() => setDeclining(s)}>Decline</Button>
                          <Button size="lg" icon={Check} busy={busy} onClick={() => respond(s, true)}>Accept</Button>
                        </div>
                      )}
                      {s.assignment_status === 'requested' && (
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-footnote text-muted">Waiting for the office to approve</span>
                          <Button variant="ghost" size="sm" onClick={() => withdraw(s)}>Withdraw</Button>
                        </div>
                      )}
                      {s.assignment_status === 'accepted' && (
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Button variant="soft" size="sm" iconRight={ChevronRight} to={`/officer/shifts/${s.id}`}>{s.is_lead ? 'Shift page · you lead' : 'Shift page'}</Button>
                          {!clocked && new Date(s.starts_at) > now && <Button variant="ghost" size="sm" onClick={() => setDeclining(s)}>I can't work this</Button>}
                        </div>
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
                    const canReport = now - new Date(s.ends_at).getTime() < 30 * 86400000;
                    return <ShiftCard key={s.assignment_id} s={s} to={`/officer/shifts/${s.id}`} status={ins.length ? 'Worked' : 'Not clocked'} statusTone={ins.length ? 'grey' : 'amber'}><p className="mt-2 text-footnote text-muted">{worked}{canReport && <span className="font-semibold text-blue"> · Report or log an ejection ›</span>}</p></ShiftCard>;
                  })}
                </div>
              </Section>
            )}

            <DeclineSheet s={declining} onClose={() => setDeclining(null)} onDone={() => { setDeclining(null); q.reload(); }} />
          </>
        );
      }}
    </Load>
    </>
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
    <Load q={q} skeleton="rows">
      {(rows) => (!rows.length ? (
        <Empty icon={Megaphone} title="No open shifts right now" body="Open shifts that need cover appear here. You'll get a notification when the office posts one." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((s) => {
            const left = s.headcount - Number(s.filled || 0);
            return (
              <ShiftCard key={s.id} s={s} status={s.my_status === 'requested' ? 'Requested' : `${left} place${left === 1 ? '' : 's'}`} statusTone={s.my_status === 'requested' ? 'blue' : 'grey'}>
                {s.notes && <p className="mt-2 text-footnote text-muted">{s.notes}</p>}
                {s.my_status === 'requested' ? (
                  <p className="mt-3 text-footnote font-semibold text-blue">Waiting for the office to approve. You can withdraw it from My shifts.</p>
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
