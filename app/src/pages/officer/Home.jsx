import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, CalendarDays, Check, Clock3, Coffee, FileSignature, GraduationCap, ListChecks, LogIn, LogOut, MapPin, Megaphone, Newspaper, NotebookPen, PencilLine,
  ShieldAlert, ShieldCheck, X,
} from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, cx, date, dayLabel, daysUntil, List, Load, Page, range, relative, Row, Section, Tile, time, useAction, useApi, usePullRefresh,
} from '../../ui/index.jsx';
import { useModules } from '../learn/_parts.jsx';
import { ChaseBanner, OffersList, useOps } from './_ops.jsx';
import { clockOpensAt, DeclineSheet, expiryText, greeting, NotLinked, ShiftCard, until } from './_parts.jsx';
import { InstallCard } from '../../ui/pwa.jsx';
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
      <InstallCard className="mb-4" />
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

  return (
    <div className="space-y-5">
      <div className="space-y-3 empty:hidden">
        <ChaseBanner ops={ops} />
        <OffersList ops={ops} compact />
        {d.issues?.length > 0 && (
          <Tile className="border-red/20 !bg-red-soft">
            <div className="flex gap-3 text-red">
              <ShieldAlert size={24} className="mt-0.5 shrink-0" />
              <div>
                <div className="text-headline font-bold">You can't work shifts right now</div>
                <ul className="mt-1 space-y-0.5 text-subhead font-medium">{d.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                <p className="mt-2 text-footnote text-red/80">Upload the missing documents or contact the office.</p>
                <Button size="sm" variant="secondary" className="mt-3" to="/officer/documents">My documents</Button>
              </div>
            </div>
          </Tile>
        )}
        {!d.issues?.length && siaDays != null && siaDays <= 60 && (
          <Tile className="border-amber/20 !bg-amber-soft" to="/officer/documents">
            <div className="flex items-center gap-3 text-amber">
              <AlertTriangle size={24} className="shrink-0" />
              <div><div className="font-bold">SIA licence: {expiryText(siaDays).toLowerCase()}</div><div className="text-footnote">Renew it and upload the new licence.</div></div>
            </div>
          </Tile>
        )}
      </div>

      {ask.length > 0 && (
        <Section title={`Needs your answer · ${ask.length}`}>
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
      )}

      <Section title="Confirmed">
        {confirmed.length === 0 ? <Nothing /> : (
          <div className="space-y-2.5">
            <Hero s={confirmed[0]} clockable={cur?.assignment_id === confirmed[0].assignment_id} clockedIn={cur?.assignment_id === confirmed[0].assignment_id && (cur.events || []).some((e) => e.status !== 'rejected')} blocked={d.issues?.length > 0} onDecline={() => setDeclining(confirmed[0])} />
            {confirmed.slice(1).map((s) => <ShiftCard key={s.assignment_id} s={s} to={`/officer/shifts/${s.shift_id}`} status="Confirmed" statusTone="green" />)}
          </div>
        )}
      </Section>

      <OpenShifts />
      <ToDo d={d} />
      <Everyday />
      <DeclineSheet s={declining} phone={d.office_phone} onClose={() => setDeclining(null)} onDone={() => { setDeclining(null); reload(); }} />
    </div>
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
function Hero({ s, clockable, clockedIn, blocked, onDecline }) {
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
  const rows = (q.data || []).filter((s) => s.my_status !== 'requested' && s.headcount > Number(s.filled || 0));
  if (!rows.length) return null;
  return (
    <Section title={`Open shifts you can pick up · ${rows.length}`} action={<Button size="sm" variant="ghost" to="/officer/shifts?tab=open">See all</Button>}>
      <div className="space-y-2.5">
        {rows.slice(0, 3).map((s) => {
          const left = s.headcount - Number(s.filled || 0);
          return <ShiftCard key={s.id} s={s} to="/officer/shifts?tab=open" status={`${left} place${left === 1 ? '' : 's'}`} statusTone="blue" />;
        })}
      </div>
    </Section>
  );
}

const TODO_TONE = { red: 'bg-red text-white', amber: 'bg-amber text-white', blue: 'bg-blue text-white', grey: 'bg-faint text-white' };
const Ico = ({ icon: I, tone }) => <span className={cx('grid h-8 w-8 place-items-center rounded-lg', TODO_TONE[tone])}><I size={18} /></span>;

// Everything waiting on the officer in one list; each row opens the place to finish it
function ToDo({ d }) {
  const m = useModules();
  const tasks = useApi('onboarding.tasks', {});
  const contracts = useApi('contracts.list', {});
  const learn = useApi('academy.my', {}, { skip: !m?.academy });
  const rows = [];
  if (d.incidentsToFix > 0) rows.push({ k: 'fix', to: '/officer/incidents?status=changes_requested', icon: PencilLine, tone: 'amber', title: `${d.incidentsToFix} report${d.incidentsToFix === 1 ? '' : 's'} to fix`, sub: 'Your manager asked for more detail' });
  (contracts.data || []).filter((c) => c.status === 'sent').forEach((c) => rows.push({ k: `c${c.id}`, to: `/officer/contracts/${c.id}`, icon: FileSignature, tone: 'blue', title: `Sign: ${c.title}`, sub: 'Waiting for your signature' }));
  const due = m?.academy ? (learn.data?.courses || []).filter((c) => c.assignment_id && c.state !== 'passed') : [];
  due.forEach((c) => {
    const late = c.state === 'overdue' || c.state === 'expired';
    rows.push({ k: `t${c.id}`, to: `/officer/learn/academy/${c.id}`, icon: GraduationCap, tone: late ? 'red' : 'blue', title: c.title, sub: late ? 'Training overdue' : c.due_date ? `Training due ${date(c.due_date)}` : 'Training to do' });
  });
  (d.expiringDocs || []).forEach((x, i) => {
    const n = daysUntil(x.expiry);
    rows.push({ k: `d${i}`, to: '/officer/documents', icon: ShieldCheck, tone: n < 0 ? 'red' : 'amber', title: x.title, sub: n < 0 ? 'Expired: upload a new one' : `Expires ${date(x.expiry)}` });
  });
  const signing = rows.some((r) => r.icon === FileSignature);
  (tasks.data || []).filter((t) => !t.done && !(signing && t.code === 'contract')).forEach((t) => rows.push(t.office
    ? { k: `o${t.code}`, icon: ListChecks, tone: 'grey', title: t.title, sub: 'Waiting on the office' }
    : { k: `o${t.code}`, to: t.to, icon: ListChecks, tone: 'blue', title: t.title, sub: 'Getting set up' }));
  if (!rows.length) return null;
  return (
    <Section title={`To do · ${rows.length}`}>
      <List>
        {rows.map((r) => <Row key={r.k} to={r.to} left={<Ico icon={r.icon} tone={r.tone} />} title={r.title} subtitle={r.sub} className={cx(!r.to && 'opacity-70')} />)}
      </List>
    </Section>
  );
}

function Everyday() {
  const m = useModules();
  const feed = useApi('everyday.latest', {}, { skip: !m?.everyday });
  const posts = feed.data || [];
  if (!m?.everyday || !posts.length) return null;
  return (
    <Tile title="Latest from Everyday" icon={Newspaper} to="/officer/everyday">
      <div className="divide-y divide-line">
        {posts.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={p.author.name} src={[p.author.photo_thumb_url, p.author.photo_url]} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-subhead"><b>{p.author.name.split(' ')[0]}</b> {p.body || 'shared a photo'}</div>
              <div className="text-caption text-faint">{relative(p.created_at)}{p.comment_count ? ` · ${p.comment_count} comment${p.comment_count === 1 ? '' : 's'}` : ''}</div>
            </div>
            {p.photos[0] && <img src={p.photos[0].url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />}
          </div>
        ))}
      </div>
    </Tile>
  );
}
