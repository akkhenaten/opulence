import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BookOpenCheck, CalendarClock, CalendarDays, Check, Clock3, Coffee, FilePen, FileSignature, GraduationCap, ListChecks, LogIn, LogOut, MapPin, Megaphone, NotebookPen, PencilLine,
  ShieldAlert, ShieldCheck, Wallet, X,
} from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  AttentionDrawer, Avatar, Button, cx, date, dateShort, dayLabel, daysUntil, List, Load, LoadFail, money, Page, range, relative, Row, Section, Tile, time, useAction, useApi, useMedia, usePullRefresh,
} from '../../ui/index.jsx';
import { useModules } from '../learn/_parts.jsx';
import { ChaseBanner, useOps } from './_ops.jsx';
import { clockOpensAt, DeclineSheet, expiryText, greeting, NotLinked, ShiftCard, typeLabel, until } from './_parts.jsx';
import { docKindFor, freshStatement, packTodos, weekendAsk } from './_todo.js';
import { InstallCard } from '../../ui/pwa.jsx';
import { PushCard } from './_notify.jsx';
import { PhoneCard } from './_phone.jsx';
import { ShiftPanel } from '../shift/ShiftView.jsx';

// Not on shift: what to answer, what is confirmed, what is open, what to do.
// Clocked in: the shift card takes over, with everything for that shift in one place.
export default function Home() {
  const { user } = useAuth();
  const dash = useApi('dashboard.get', {}, { poll: 60000 });
  const clock = useApi('clock.status', {}, { poll: 60000, skip: !user.officer_id });
  const ops = useOps(!user.officer_id);
  const first = (user.name || '').split(' ')[0];
  const reloadAll = () => Promise.all([dash.reload(), clock.reload(), ops.reload()]);
  const pull = usePullRefresh(reloadAll);
  const cur = clock.data?.current;
  const onShift = cur && (cur.state === 'on_shift' || cur.state === 'on_break');

  if (onShift) {
    return (
      <Page key="live" backLabel="Home" title={cur.venue_name} subtitle={<>{dayLabel(cur.starts_at)} · <span className="num">{range(cur.starts_at, cur.ends_at)}</span></>}>
        {pull}
        <LiveBar cur={cur} />
        <div className="mt-4"><ShiftPanel id={cur.shift_id} /></div>
      </Page>
    );
  }

  return (
    <Page key="home" backLabel="Home" title={`${greeting()}${first ? `, ${first}` : ''}`} subtitle={dayLabel(new Date())} photo="street">
      {pull}
      <InstallCard className="mb-4" later="Me" />
      <PushCard className="mb-4" later="Me" />
      <Load q={dash} skeleton="tiles">
        {(d) => (d.linked === false ? <NotLinked /> : <Body d={d} clock={clock} ops={ops} reload={reloadAll} />)}
      </Load>
    </Page>
  );
}

// On shift: the state, time on shift and the one button that matters next
function LiveBar({ cur }) {
  const valid = (cur.events || []).filter((e) => e.status !== 'rejected');
  const inAt = valid.find((e) => e.kind === 'in')?.ts;
  const brk = cur.state === 'on_break';
  return (
    <Tile tone="blue" className="!p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide opacity-80">
            <span className="live-dot h-2.5 w-2.5 rounded-full bg-white" />{brk ? 'On break' : 'On shift now'}
          </div>
          <div className="mt-1 truncate text-subhead opacity-85">{cur.role_name}{inAt ? <> · in at <span className="num font-semibold">{time(inAt)}</span></> : null}</div>
        </div>
        <Button className="shrink-0 !bg-on-accent !text-[var(--accent-fill,var(--color-blue))] !shadow-none" icon={brk ? Coffee : LogOut} to="/officer/clock">{brk ? 'End break' : 'Clock out'}</Button>
      </div>
    </Tile>
  );
}

function Body({ d, clock, ops, reload }) {
  const [run, busy] = useAction();
  const [declining, setDeclining] = useState(null);
  const cur = clock.data?.current;
  const next = d.next || [];
  const ask = next.filter((s) => s.assignment_status === 'assigned');
  const confirmed = next.filter((s) => s.assignment_status === 'accepted');
  const siaDays = daysUntil(d.officer?.sia_expiry);

  const accept = (a) => run(() => api('shifts.respond', { assignment_id: a.assignment_id, accept: true }), 'Shift confirmed').then(reload).catch(() => {});

  const offers = (ops.data?.offers || []).filter((o) => o.status === 'offered');
  // Site packs to read before upcoming shifts: a To do row each, and a line on the next shift's card
  const packsQ = useApi('venuePacks.myList', {});
  const packs = packTodos(packsQ.data?.venues);
  const addFor = (kind) => `/officer/documents${kind ? `?add=${kind}` : ''}`;
  const paid = freshStatement(d.lastStatement);
  const [todo, todoFails] = useToDo(d, packs);
  // A list that couldn't load says so here, so an empty To do doesn't read as "nothing to do"
  const fails = [[clock, 'your clock-in'], [packsQ, 'site packs to read'], ...todoFails];
  // Phones: the shifts to answer and the to-do list fold into one glowing bar, so the page stays short
  const lg = useMedia('(min-width: 1024px)');
  const tone = todo.some((r) => r.tone === 'red') ? 'red' : ask.length ? 'amber' : todo.some((r) => r.tone === 'amber') ? 'amber' : 'blue';

  const answer = ask.length > 0 && (
    <Section title="Needs your answer" icon={CalendarClock} count={ask.length}>
      <div className="space-y-2.5">
        {ask.map((s) => (
          <ShiftCard key={s.assignment_id} s={s} status="Please respond" statusTone="amber" className="border-amber/30">
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" icon={X} onClick={() => setDeclining(s)}>Decline</Button>
              <Button size="lg" icon={Check} busy={busy} onClick={() => accept(s)}>Accept</Button>
            </div>
          </ShiftCard>
        ))}
      </div>
    </Section>
  );

  // The next shift comes first; everything else waiting on the officer sits under it as one line each
  return (
    <div className="space-y-5">
      <Section title="Next shift">
        {confirmed.length === 0 ? <Nothing /> : (
          <Hero s={confirmed[0]} clockable={cur?.assignment_id === confirmed[0].assignment_id} clockedIn={cur?.assignment_id === confirmed[0].assignment_id && (cur.events || []).some((e) => e.status !== 'rejected')} blocked={d.issues?.length > 0} pack={packs.find((v) => v.venue_id === confirmed[0].venue_id)} onDecline={() => setDeclining(confirmed[0])} />
        )}
      </Section>

      {fails.some(([q]) => q.error) && (
        <div className="space-y-2">{fails.map(([q, what]) => <LoadFail key={what} q={q} what={what} />)}</div>
      )}

      <ChaseBanner ops={ops} />
      <PhoneCard soon={next.some((s) => new Date(s.starts_at) - Date.now() < 864e5)} />
      {(offers.length > 0 || paid || d.issues?.length > 0 || d.grace || (siaDays != null && siaDays <= 60)) && (
        <List>
          {d.issues?.length > 0 && (
            <Row to={addFor(docKindFor(d.issues[0]))} left={<Ico icon={ShieldAlert} tone="red" />} title="You can't work shifts right now" subtitle={d.issues.join(' · ')} />
          )}
          {!d.issues?.length && d.grace && (
            <Row to={addFor(docKindFor((d.graced || [])[0]))} left={<Ico icon={CalendarClock} tone={d.grace.days_left <= 3 ? 'red' : 'amber'} />}
              title={`You can work until ${date(d.grace.ends_on)}`} subtitle={`Send by then: ${(d.graced || []).join(' · ')}`} chevron />
          )}
          {offers.length > 0 && (
            <Row to="/officer/shifts?tab=offers" left={<Ico icon={Megaphone} tone="blue" />}
              title={`${offers.length} cover offer${offers.length === 1 ? '' : 's'}`} subtitle="First to accept gets the shift" />
          )}
          {!d.issues?.length && siaDays != null && siaDays <= 60 && (
            <Row to={addFor('sia')} left={<Ico icon={AlertTriangle} tone="amber" />} title={`SIA licence: ${expiryText(siaDays).toLowerCase()}`} subtitle="Renew it and upload the new licence" />
          )}
          {paid && (
            <Row to={`/officer/pay/${paid.id}`} left={<Ico icon={Wallet} tone="green" />} title={`Pay statement · ${money(paid.total)}`}
              subtitle={`${dateShort(paid.period_start)} – ${date(paid.period_end)}`} />
          )}
        </List>
      )}

      {lg ? (
        <>
          {answer}
          <ToDo rows={todo} />
        </>
      ) : (ask.length + todo.length > 0 && (
        <AttentionDrawer id="todo" title="To do" count={ask.length + todo.length} tone={tone}
          preview={[...(ask.length ? [{ icon: CalendarClock, tone: 'amber' }] : []), ...todo]}
          lead={ask.length ? `${ask.length} shift${ask.length === 1 ? '' : 's'} waiting for your answer` : todo[0]?.title}>
          <div className="space-y-5 [&>*]:!mt-0">
            {answer}
            <ToDo rows={todo} />
          </div>
        </AttentionDrawer>
      ))}

      {confirmed.length > 1 && (
        <Section title="Also confirmed">
          <div className="space-y-2.5">
            {confirmed.slice(1).map((s) => <ShiftCard key={s.assignment_id} s={s} to={`/officer/shifts/${s.shift_id}`} status="Confirmed" statusTone="green" />)}
          </div>
        </Section>
      )}

      <OpenShifts />
      <Weekend shifts={next} />
      <DeclineSheet s={declining} phone={d.office_phone} onClose={() => setDeclining(null)} onDone={() => { setDeclining(null); reload(); }} />
    </div>
  );
}

// Wednesday to Friday with nothing booked for the weekend: one tap tells the office whether to count on them
function Weekend({ shifts }) {
  const ask = weekendAsk(shifts);
  const key = ask && `weekend-asked:${ask.from}`;
  const [done, setDone] = useState(() => !!key && !!localStorage.getItem(key));
  const [run, busy] = useAction();
  if (!ask || done) return null;
  const answer = (free) => {
    const finish = () => { localStorage.setItem(key, free ? 'free' : 'busy'); setDone(true); };
    if (free) { finish(); return; }
    run(() => api('timeoff.request', { kind: 'unavailable', start_date: ask.from, end_date: ask.to, reason: 'Not free this weekend' }).then(finish), 'Thanks, the office knows').catch(() => {});
  };
  return (
    <Tile>
      <div className="text-callout font-semibold">Free this weekend?</div>
      <p className="mt-0.5 text-subhead text-muted">Friday to Sunday. It helps the office plan cover.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" busy={busy} onClick={() => answer(false)}>Not this time</Button>
        <Button icon={Check} onClick={() => answer(true)}>Yes, I'm free</Button>
      </div>
    </Tile>
  );
}

function Nothing() {
  return (
    <Tile tone="ink" className="!p-6">
      <div className="flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide opacity-70"><CalendarDays size={16} />Next shift</div>
      <div className="display mt-3 text-title2 font-bold">Nothing booked</div>
      <p className="mt-1 text-subhead opacity-70">Pick up an open shift or check back later.</p>
      <Button size="lg" className="mt-5 w-full" to="/officer/shifts?tab=open" icon={Megaphone}>See open shifts</Button>
    </Tile>
  );
}

// The next confirmed shift; it turns into Clock in 15 minutes before the start
function Hero({ s, clockable, clockedIn, blocked, pack, onDecline }) {
  const opens = clockOpensAt(s.starts_at);
  const open = Date.now() >= opens.getTime() && (clockable || new Date(s.ends_at) > new Date());
  const started = new Date(s.starts_at) <= new Date();
  return (
    <Tile tone="blue" className="!p-6">
      {/* The top of the card opens the shift page, the buttons below do their own thing */}
      <Link to={`/officer/shifts/${s.shift_id}`} className="pressable block">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide opacity-80"><Clock3 size={16} />Next shift</div>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-caption font-semibold">{started ? 'Started' : `Starts ${until(s.starts_at)}`}</span>
      </div>
      <div className="display mt-3 text-title2 font-bold leading-tight">{s.venue_name}</div>
      {(s.address || s.postcode) && (
        <div className="mt-1 flex items-start gap-1.5 text-subhead opacity-85"><MapPin size={16} className="mt-0.5 shrink-0" /><span className="min-w-0">{[s.address, s.postcode].filter(Boolean).join(', ')}</span></div>
      )}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-footnote opacity-75">{dayLabel(s.starts_at)}</div>
          <div className="display num whitespace-nowrap text-title1 font-bold leading-none">{range(s.starts_at, s.ends_at)}</div>
        </div>
        {s.role_name && <span className="min-w-0 truncate rounded-full bg-white/15 px-3 py-1 text-footnote font-semibold">{s.role_name}</span>}
      </div>
      </Link>
      {pack && (
        <Link to={`/officer/venue-pack/${pack.venue_id}`} className="pressable mt-4 flex items-center gap-2 rounded-2xl bg-amber/90 px-3 py-2 text-subhead font-semibold text-white">
          <BookOpenCheck size={18} className="shrink-0" />Read the site pack before this shift
        </Link>
      )}
      {blocked ? (
        <p className="mt-5 rounded-2xl bg-white/12 p-3 text-subhead font-semibold">You can't clock in until the items above are sorted.</p>
      ) : open ? (
        <Button size="lg" className="mt-5 w-full !bg-on-accent !text-[var(--accent-fill,var(--color-blue))] !shadow-none" icon={LogIn} to="/officer/clock">Clock in</Button>
      ) : (
        <div className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/12 text-subhead font-semibold"><LogIn size={18} />Clock-in opens at <span className="num">{time(opens)}</span>{dayLabel(opens) !== dayLabel(new Date()) && ` ${dayLabel(opens)}`}</div>
      )}
      <Button className="mt-2 w-full !bg-white/15 !text-white !shadow-none" icon={NotebookPen} to={`/officer/shifts/${s.shift_id}`}>{s.is_lead ? 'Shift page · you lead' : 'Shift page'}</Button>
      {!started && !clockedIn && <Button variant="plain" className="mt-1 w-full !text-white/80 !shadow-none" onClick={onDecline}>I can't work this</Button>}
    </Tile>
  );
}

function OpenShifts() {
  const q = useApi('shifts.open', {});
  const [run] = useAction();
  const [pending, setPending] = useState(null);
  const request = (s) => {
    setPending(s.id);
    run(() => api('shifts.request', { shift_id: s.id }), 'Requested. The office will confirm.').then(q.reload).catch(() => {}).finally(() => setPending(null));
  };
  const rows = (q.data || []).filter((s) => s.my_status !== 'requested' && s.headcount > Number(s.filled || 0));
  if (!rows.length) return null;
  return (
    <Section title={`Open shifts you can pick up · ${rows.length}`} action={<Button size="sm" variant="ghost" to="/officer/shifts?tab=open">See all</Button>}>
      <div className="space-y-2.5">
        {rows.slice(0, 3).map((s) => {
          const left = s.headcount - Number(s.filled || 0);
          return (
            <ShiftCard key={s.id} s={s} status={`${left} place${left === 1 ? '' : 's'}`} statusTone="blue">
              <Button className="mt-3 w-full" variant="secondary" icon={Megaphone} busy={pending === s.id} onClick={() => request(s)}>Request this shift</Button>
            </ShiftCard>
          );
        })}
      </div>
    </Section>
  );
}

const TODO_TONE = { red: 'bg-red text-white', amber: 'bg-amber text-white', blue: 'bg-blue text-white', grey: 'bg-faint text-white' };
const Ico = ({ icon: I, tone }) => <span className={cx('grid h-8 w-8 place-items-center rounded-lg', TODO_TONE[tone])}><I size={18} /></span>;

// Everything waiting on the officer, one row each; each row opens the place to finish it
function useToDo(d, packs) {
  const m = useModules();
  const tasks = useApi('onboarding.tasks', {});
  const contracts = useApi('contracts.list', {});
  const learn = useApi('academy.my', {}, { skip: !m?.academy });
  const drafts = useApi('incidents.drafts', {});
  const resign = useApi('incidents.list', { to_sign: true }, { poll: 60000 });
  const rows = [];
  (drafts.data || []).forEach((x) => rows.push({ k: `r${x.id}`, to: `/officer/incidents/new?draft=${x.id}`, icon: FilePen, tone: 'amber', title: 'Finish your report', sub: x.title || (x.type ? typeLabel(x.type) : 'Incident report') }));
  // Signed reports back with the officer (sent back, or edited by the manager) get their own row; the rest of "to fix" are older reports
  const again = resign.data || [];
  again.forEach((x) => rows.push({ k: `s${x.id}`, to: `/officer/incidents/${x.id}/edit`, icon: FileSignature, tone: 'amber', title: 'Sign your report again',
    sub: `${x.title || typeLabel(x.type)} · ${x.resign_reason === 'edited' ? 'Your manager edited it' : 'Your manager asked for more detail'}` }));
  const fix = Math.max(0, (d.incidentsToFix || 0) - again.filter((x) => x.status === 'changes_requested').length);
  if (fix > 0) rows.push({ k: 'fix', to: '/officer/incidents?status=changes_requested', icon: PencilLine, tone: 'amber', title: `${fix} report${fix === 1 ? '' : 's'} to fix`, sub: 'Your manager asked for more detail' });
  (contracts.data || []).filter((c) => c.status === 'sent').forEach((c) => rows.push({ k: `c${c.id}`, to: `/officer/contracts/${c.id}`, icon: FileSignature, tone: 'blue', title: `Sign: ${c.title}`, sub: 'Waiting for your signature' }));
  const due = m?.academy ? (learn.data?.courses || []).filter((c) => c.assignment_id && c.state !== 'passed') : [];
  due.forEach((c) => {
    const late = c.state === 'overdue' || c.state === 'expired';
    rows.push({ k: `t${c.id}`, to: `/officer/learn/academy/${c.id}`, icon: GraduationCap, tone: late ? 'red' : 'blue', title: c.title, sub: late ? 'Training overdue' : c.due_date ? `Training due ${date(c.due_date)}` : 'Training to do' });
  });
  packs.forEach((v) => rows.push({ k: `p${v.venue_id}`, to: `/officer/venue-pack/${v.venue_id}`, icon: BookOpenCheck, tone: 'amber', title: `Read the site pack for ${v.name}`, sub: `Before your shift on ${dayLabel(v.next_shift)}` }));
  (d.expiringDocs || []).forEach((x, i) => {
    const n = daysUntil(x.expiry);
    rows.push({ k: `d${i}`, to: `/officer/documents?add=${x.kind}`, icon: ShieldCheck, tone: n < 0 ? 'red' : 'amber', title: x.title, sub: n < 0 ? 'Expired: upload a new one' : `Expires ${date(x.expiry)}` });
  });
  const signing = rows.some((r) => r.icon === FileSignature);
  (tasks.data || []).filter((t) => !t.done && !(signing && t.code === 'contract')).forEach((t) => rows.push(t.office
    ? { k: `o${t.code}`, icon: ListChecks, tone: 'grey', title: t.action || t.title, sub: t.waiting || 'Waiting on the office' }
    : { k: `o${t.code}`, to: t.to, icon: ListChecks, tone: 'blue', title: t.action || t.title, sub: 'Getting set up' }));
  const fails = [[tasks, 'your set-up steps'], [contracts, 'your contracts'], [drafts, 'your draft reports'], [resign, 'reports to sign']];
  if (m?.academy) fails.push([learn, 'your training']);
  return [rows, fails];
}

function ToDo({ rows }) {
  if (!rows.length) return null;
  return (
    <Section title="To do" icon={ListChecks} count={rows.length}>
      <List>
        {rows.map((r) => <Row key={r.k} to={r.to} left={<Ico icon={r.icon} tone={r.tone} />} title={r.title} subtitle={r.sub} className={cx(!r.to && 'opacity-70')} />)}
      </List>
    </Section>
  );
}

