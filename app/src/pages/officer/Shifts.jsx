import { useEffect, useRef, useState } from 'react';
import { OffersList, useOps } from './_ops.jsx';
import { CalendarDays, CalendarOff, Check, ChevronRight, Hand, History, Info, ListIcon, Megaphone, X } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  addDays, Button, Empty, isoDate, Load, MoreMenu, Page, Section, Spinner, Tabs, time, useAction, useApi, useConfirm, usePullRefresh, useUrlState,
} from '../../ui/index.jsx';
import { ASSIGN_LABEL, assignTone, DeclineSheet, NotLinked, ShiftCard } from './_parts.jsx';
import ShiftCalendar from './ShiftCalendar.jsx';

export default function Shifts() {
  const { user } = useAuth();
  const [url, set] = useUrlState({ tab: '' });
  const open = useApi('shifts.open', {}, { skip: !user.officer_id });
  const ops = useOps(!user.officer_id);
  const offered = (ops.data?.offers || []).filter((o) => o.status === 'offered').length;
  // With no tab asked for, open on Offers once when any are waiting
  const decided = useRef(!!url.tab);
  useEffect(() => {
    if (decided.current || !ops.data) return;
    decided.current = true;
    if (offered) set({ tab: 'offers' });
  }, [ops.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const tab = ['open', 'offers', 'mine', 'past'].includes(url.tab) ? url.tab : 'calendar';
  const setTab = (t) => { decided.current = true; set({ tab: t === 'calendar' ? '' : t }); };
  const waiting = !url.tab && !ops.data && ops.loading;
  const pull = usePullRefresh(() => Promise.all([open.reload(), ops.reload()]), !['mine', 'calendar'].includes(tab) && !!user.officer_id);

  // Past shifts: its own view with its own heading, Back returns to the shifts
  if (tab === 'past') {
    return (
      <Page title="Past shifts" back={{ to: '/officer/shifts', label: 'Shifts' }}>
        {!user.officer_id ? <NotLinked /> : <Past />}
      </Page>
    );
  }

  return (
    <Page title="Shifts" actions={<><Button size="sm" variant="secondary" icon={CalendarOff} iconOnly="phone" to="/officer/time-off?tab=availability">Availability</Button><MoreMenu items={[{ label: 'Past shifts', icon: History, to: '/officer/shifts?tab=past' }]} /></>}>
      {pull}
      {!user.officer_id ? <NotLinked /> : (
        <>
          <Tabs value={tab} onChange={setTab} iconOnly="phone" tabs={[{ value: 'calendar', label: 'Calendar', icon: CalendarDays }, { value: 'mine', label: 'List', icon: ListIcon }, { value: 'offers', label: 'Offers', count: offered }, { value: 'open', label: 'Open shifts', count: open.data?.length }]} />
          {waiting ? <Spinner /> : tab === 'calendar' ? <ShiftCalendar /> : tab === 'mine' ? <Mine /> : tab === 'offers' ? <OffersList ops={ops} /> : <Open q={open} />}
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
              <Empty photo="kit" icon={CalendarDays} title="No upcoming shifts" body="When you're booked on a shift it appears here." action={<div className="flex flex-wrap justify-center gap-2"><Button to="/officer/shifts?tab=open" icon={Megaphone}>Find open shifts</Button><Button variant="secondary" icon={History} to="/officer/shifts?tab=past">See past shifts</Button></div>} />
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
              <Section title="Recent" icon={History} count={past.length}>
                <div className="space-y-2.5 opacity-90">
                  {past.map((s) => <PastCard key={s.assignment_id} s={s} now={now} />)}
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

// A shift that has ended: when the officer clocked in and out, and a way to report on it while that's still allowed
function PastCard({ s, now }) {
  const ins = (s.clock || []).filter((e) => e.kind === 'in' && e.status !== 'rejected');
  const outs = (s.clock || []).filter((e) => e.kind === 'out' && e.status !== 'rejected');
  const worked = ins.length ? `Worked ${time(ins[0].ts)}${outs.length ? `–${time(outs.at(-1).ts)}` : ''}` : 'No clock-in recorded';
  const canReport = now - new Date(s.ends_at).getTime() < 30 * 86400000;
  return <ShiftCard s={s} to={`/officer/shifts/${s.id}`} status={ins.length ? 'Worked' : 'Not clocked'} statusTone={ins.length ? 'grey' : 'amber'}><p className="mt-2 text-footnote text-muted">{worked}{canReport && <span className="font-semibold text-blue"> · Report or log an ejection ›</span>}</p></ShiftCard>;
}

// Past shifts, newest first: the last 6 weeks, and older ones 6 weeks at a time
const STEP_WEEKS = 6;
function Past() {
  const [weeks, setWeeks] = useState(STEP_WEEKS);
  const [to] = useState(() => new Date().toISOString());
  const from = new Date(`${addDays(isoDate(), -7 * weeks)}T00:00:00Z`).toISOString();
  const q = useApi('shifts.mine', { from, to });
  const pull = usePullRefresh(q.reload);
  const now = Date.now();
  const past = (q.data || []).filter((s) => new Date(s.ends_at) <= now && s.assignment_status === 'accepted').sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  // Going further back found nothing more: there is nothing older to show
  const [counts, setCounts] = useState({});
  useEffect(() => { if (q.data && !q.loading) setCounts((c) => ({ ...c, [weeks]: past.length })); }, [q.data, q.loading, weeks, past.length]);
  const noMore = weeks > STEP_WEEKS && counts[weeks] != null && counts[weeks] === counts[weeks - STEP_WEEKS];
  const period = `Last ${weeks} weeks`;
  return (
    <>
      {pull}
      <p className="mb-3 px-1 text-footnote text-muted"><History size={14} className="mr-1 inline" />{period} · Only shifts you were booked on and accepted are listed</p>
      <Load q={q} skeleton="rows">
        {() => (
          <>
            {!past.length ? (
              <Empty icon={History} title={`No past shifts in the last ${weeks} weeks`} body="Shifts you've worked show here once they've ended." />
            ) : (
              <div className="space-y-2.5">{past.map((s) => <PastCard key={s.assignment_id} s={s} now={now} />)}</div>
            )}
            <div className="mt-4 flex justify-center">
              {noMore
                ? <p className="text-footnote text-muted">No earlier shifts</p>
                : <Button variant="secondary" busy={q.loading} onClick={() => setWeeks((w) => w + STEP_WEEKS)}>Show older shifts</Button>}
            </div>
          </>
        )}
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
                  <p className="mt-3 text-footnote font-semibold text-blue">Waiting for the office to approve. You can withdraw it from List.</p>
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
