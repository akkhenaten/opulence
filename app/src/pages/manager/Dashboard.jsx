import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarOff, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Hand, Megaphone, Newspaper, Radio, ShieldAlert, ShieldCheck,
  TrendingUp, TriangleAlert, Users,
} from 'lucide-react';
import {
  Bento, Button, confirmState, Dot, Load, Page, Pill, Stat, Tile, cx, dateShort, daysUntil, hours, money0, range, relative, dayLabel, isoDate, titleCase, useApi,
} from '../../ui/index.jsx';
import { useBase } from './_parts.jsx';
import { FeedBody } from '../everyday/Feed.jsx';
import { InstallCard } from '../../ui/pwa.jsx';
import { lateDays } from '../officer/_parts.jsx';

// Everyday lives on the Dashboard now; old links (and notification links) land on that tab
export function EverydayRedirect() {
  const { search } = useLocation();
  const { base } = useBase();
  const p = new URLSearchParams(search);
  if (p.get('tab') === 'moderation') p.set('view', 'moderation');
  p.set('tab', 'everyday');
  return <Navigate to={`${base}?${p}`} replace />;
}

const STATE_TONE = { late: 'amber', no_show: 'red', left_early: 'amber' };
const CHIP = { red: 'bg-red-soft text-red', amber: 'bg-amber-soft text-amber', blue: 'bg-blue-soft text-blue' };

// What can be waiting on a manager, most urgent first; only the ones above zero are shown
const NEEDS = [
  { key: 'exceptions', to: '/exceptions', icon: TriangleAlert, tone: 'red', one: 'clock exception to check', many: 'clock exceptions to check' },
  { key: 'unfilled', to: '/rota', icon: CalendarClock, tone: 'red', one: 'unfilled shift in the next 7 days', many: 'unfilled shifts in the next 7 days' },
  { key: 'disputed', to: '/timesheets?status=disputed', icon: AlertTriangle, tone: 'red', one: 'disputed timesheet', many: 'disputed timesheets' },
  { key: 'openIncidents', to: '/incidents', icon: ShieldAlert, tone: 'amber', one: 'open incident', many: 'open incidents' },
  { key: 'pendingCover', to: '/cover', icon: Megaphone, tone: 'amber', one: 'cover request to answer', many: 'cover requests to answer' },
  { key: 'toApprove', to: '/timesheets?status=pending', icon: ClipboardCheck, tone: 'blue', one: 'timesheet to approve', many: 'timesheets to approve' },
  { key: 'requests', to: '/rota?tab=requests', icon: Hand, tone: 'blue', one: 'shift request', many: 'shift requests' },
  { key: 'timeOff', to: '/company/hr/time-off', abs: true, icon: CalendarOff, tone: 'amber', one: 'time off request to review', many: 'time off requests to review', company: true },
];
const needsFor = (c, isCompany) => NEEDS.filter((n) => (c[n.key] || 0) > 0 && (!n.company || isCompany));

function summaryLine(d, isCompany) {
  const parts = [dayLabel(isoDate())];
  if (!d) return parts[0];
  if (d.live?.on_site) parts.push(`${d.live.on_site} on site`);
  const n = needsFor(d.counts || {}, isCompany).reduce((a, x) => a + d.counts[x.key], 0);
  parts.push(n ? `${n} ${n === 1 ? 'thing needs' : 'things need'} you` : 'all clear');
  return parts.join(' · ');
}

function TileLink({ to, light, children }) {
  return (
    <Link to={to} className={cx('relative -my-2.5 inline-block py-2.5 text-footnote font-semibold before:absolute before:-inset-x-3 before:-inset-y-1', light ? 'text-white/80 hover:text-white' : 'text-blue')}>
      {children} ›
    </Link>
  );
}

export default function Dashboard() {
  const { user, base } = useBase();
  const [sp, setSp] = useSearchParams();
  const settings = useApi('settings.get');
  const feedOn = settings.data && settings.data.modules?.everyday !== false;
  const tab = feedOn && sp.get('tab') === 'everyday' ? 'everyday' : 'overview';
  const q = useApi('dashboard.get', {}, { poll: 30000 });
  const unread = useApi('everyday.unread', {}, { poll: 60000, skip: !feedOn });
  const isCompany = user.role === 'company';
  const first = (user?.name || '').split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const everyday = feedOn && tab !== 'everyday' && (
    <Button size="sm" variant="secondary" icon={Newspaper} onClick={() => setSp({ tab: 'everyday' }, { replace: true })}>
      Everyday
      {unread.data?.unread > 0 && <span className="num min-w-[18px] rounded-full bg-blue px-1 text-center text-caption2 font-bold leading-[18px] text-white">{unread.data.unread > 99 ? '99+' : unread.data.unread}</span>}
    </Button>
  );

  return (
    <Page backLabel="Dashboard" title={`${greet}${first ? `, ${first}` : ''}`} subtitle={summaryLine(tab === 'everyday' ? null : q.data, isCompany)} wide photo="door" slim actions={everyday || undefined}>
      {tab === 'everyday' ? <FeedBody lead={<Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setSp({}, { replace: true })}>Overview</Button>} /> : <Load q={q}>{(d) => <Body d={d} base={base} isCompany={isCompany} />}</Load>}
      {tab !== 'everyday' && <InstallCard className="mt-4" later={isCompany ? "Settings" : "My account"} />}
    </Page>
  );
}

function NeedsYou({ c, base, isCompany }) {
  const list = needsFor(c, isCompany);
  return (
    // On phones a non-empty list jumps to the top of the page
    <Tile title="Needs you" icon={CheckCircle2} pad={false} className={cx('col-span-2', list.length > 0 && 'max-lg:order-first')}>
      {list.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pb-5 pt-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-green-soft text-green"><CheckCircle2 size={18} /></span>
          <p className="text-subhead font-semibold">All clear, nothing needs you right now.</p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {list.map((n) => (
            <Link key={n.key} to={n.abs ? n.to : `${base}${n.to}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-bg">
              <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', CHIP[n.tone])}><n.icon size={18} /></span>
              <div className="min-w-0 flex-1 truncate text-body"><span className="num font-bold">{c[n.key]}</span> {c[n.key] === 1 ? n.one : n.many}</div>
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </Link>
          ))}
        </div>
      )}
    </Tile>
  );
}

function Body({ d, base, isCompany }) {
  const c = d.counts || {};
  const live = d.live || {};
  const pipe = Object.fromEntries((d.pipeline || []).map((p) => [p.status, p.n]));
  // Short shifts first, then unconfirmed, each in time order
  const shifts = (d.shifts || []).map((s) => ({ ...s, state: confirmState({ filled: s.filled, headcount: s.headcount, statuses: (s.team || []).map((t) => t.status) }) }));
  const rank = { short: 0, unconfirmed: 1 };
  const sorted = shifts.slice().sort((a, b) => (rank[a.state] ?? 2) - (rank[b.state] ?? 2) || new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 8);
  const short = shifts.filter((s) => s.state === 'short').length;
  const unconfirmed = shifts.filter((s) => s.state === 'unconfirmed').length;
  return (
    <Bento>
      {/* Now: what is happening and what is waiting */}
      <Tile tone="ink" title="Live now" icon={Radio} className="col-span-2" action={<TileLink to={`${base}/live`} light>Open board</TileLink>}>
        <div className="grid grid-cols-3 gap-3">
          <div><div className="flex items-center gap-2"><Dot tone="green" live={live.on_site > 0} /><span className="text-caption font-semibold uppercase tracking-wide opacity-70">On site</span></div><div className="display num mt-1 text-[44px] font-bold leading-none">{live.on_site ?? 0}</div></div>
          <div><div className="text-caption font-semibold uppercase tracking-wide opacity-70">Late</div><div className={cx('display num mt-1 text-[44px] font-bold leading-none', live.late ? 'text-amber-bright' : 'opacity-40')}>{live.late ?? 0}</div></div>
          <div><div className="text-caption font-semibold uppercase tracking-wide opacity-70">No-show</div><div className={cx('display num mt-1 text-[44px] font-bold leading-none', live.no_show ? 'text-red-bright' : 'opacity-40')}>{live.no_show ?? 0}</div></div>
        </div>
        <p className="mt-3 text-footnote opacity-70">{live.upcoming > 0 ? `${live.upcoming} due on in the next 12 hours` : 'Nobody else due on in the next 12 hours'}{(live.alerts || []).length === 0 && ' · no alerts'}</p>
        {(live.alerts || []).length > 0 && (
          <div className="mt-3 space-y-1.5">
            {live.alerts.map((a) => (
              <Link key={a.assignment_id} to={`${base}/live`} className="flex items-center gap-3 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 transition hover:bg-white/[0.12]">
                <AlertTriangle size={16} className={a.state === 'no_show' ? 'text-red-bright' : 'text-amber-bright'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-subhead font-semibold">{a.officer_name}</div>
                  <div className="truncate text-caption opacity-70">{a.venue_name} · <span className="num">{range(a.starts_at, a.ends_at)}</span></div>
                </div>
                <span className="flex shrink-0 gap-1">
                  {STATE_TONE[a.state] && <Pill status={a.state} />}
                  {a.has_exception && <Pill tone="red">Exception</Pill>}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Tile>
      <NeedsYou c={c} base={base} isCompany={isCompany} />

      {/* Next: the coming shifts and what has happened */}
      <Tile title="Tonight & tomorrow" icon={CalendarDays} pad={false} className="col-span-2" action={<TileLink to={`${base}/rota`}>Rota</TileLink>}>
        {shifts.length === 0 ? <p className="px-5 pb-5 text-subhead text-muted">No published shifts in the next 36 hours.</p> : (
          <>
            <p className="px-5 pb-2 text-footnote text-muted">
              <span className="num">{shifts.length}</span> {shifts.length === 1 ? 'shift' : 'shifts'}
              {short > 0 && <> · <span className="font-semibold text-red">{short} short</span></>}
              {unconfirmed > 0 && <> · <span className="font-semibold text-amber">{unconfirmed} unconfirmed</span></>}
              {!short && !unconfirmed && ' · all covered'}
            </p>
            <div className="divide-y divide-line">
              {sorted.map((s) => (
                <Link key={s.id} to={`${base}/rota?shift=${s.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-bg">
                  <div className="w-[64px] shrink-0">
                    <div className="text-caption font-semibold uppercase text-muted">{dayLabel(s.starts_at).split(' ')[0]}</div>
                    <div className="num text-subhead font-bold">{range(s.starts_at, s.ends_at).split('–')[0]}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-semibold">{s.venue_name}</div>
                    <div className="truncate text-footnote text-muted"><span className="num">{range(s.starts_at, s.ends_at)}</span> · {s.role_name}{(s.team || []).map((t, i) => (
                      <span key={i}>{i ? ', ' : ' · '}<span aria-hidden className={cx('mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle', t.status === 'accepted' ? 'bg-green' : 'bg-amber')} />{t.name}</span>
                    ))}</div>
                  </div>
                  <Pill tone={s.state === 'short' ? 'red' : s.state === 'unconfirmed' ? 'amber' : 'green'} className="num">{s.filled}/{s.headcount}{s.state === 'unconfirmed' && ' · Unconfirmed'}</Pill>
                </Link>
              ))}
            </div>
          </>
        )}
      </Tile>

      <Tile title="Recent incidents" icon={ShieldAlert} pad={false} className="col-span-2" action={<TileLink to={`${base}/incidents`}>All</TileLink>}>
        {(d.incidents || []).length === 0 ? <p className="px-5 pb-5 text-subhead text-muted">No incidents reported.</p> : (
          <div className="divide-y divide-line">
            {d.incidents.map((i) => (
              <Link key={i.id} to={`${base}/incidents/${i.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-bg">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold">{titleCase(i.type)} <span className="font-normal text-muted">· {i.ref}</span></div>
                  <div className="truncate text-footnote text-muted">{i.venue_name} · {relative(i.occurred_at)}{lateDays(i) ? ` · reported ${relative(i.created_at)}` : ''}</div>
                </div>
                <div className="flex shrink-0 gap-1"><Pill status={i.severity} /><Pill status={i.status} /></div>
              </Link>
            ))}
          </div>
        )}
      </Tile>

      {/* People: who can work and who is coming through */}
      {isCompany && (
        <Tile title="Compliance" icon={ShieldCheck} className="col-span-2" action={<TileLink to="/company/staff">Staff</TileLink>}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PeopleList n={d.nonCompliantCount || 0} label="Can’t work" tone={d.nonCompliantCount ? 'text-red' : 'text-green'} empty="All active officers are compliant."
              rows={(d.nonCompliant || []).map((o) => ({ id: o.id, name: o.name, note: o.issues.join(', '), cls: 'text-red' }))} />
            <PeopleList n={(d.expiring || []).length} label="Expiring in 60 days" tone={(d.expiring || []).length ? 'text-amber' : 'text-green'} empty="Nothing expiring soon."
              rows={(d.expiring || []).map((o) => ({
                id: o.id, name: o.name, cls: 'text-amber',
                note: [o.sia_expiry && daysUntil(o.sia_expiry) <= 60 && `SIA ${dateShort(o.sia_expiry)}`, o.rtw_expiry && daysUntil(o.rtw_expiry) <= 60 && `RTW ${dateShort(o.rtw_expiry)}`].filter(Boolean).join(' · '),
              }))} />
          </div>
        </Tile>
      )}
      {isCompany && (
        <Tile title="Staff pipeline" icon={Users} to="/company/recruitment" className="col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {[['applicant', 'Applicants'], ['onboarding', 'Onboarding'], ['active', 'Active']].map(([k, l]) => (
              <div key={k} className="min-w-0"><div className="display num text-title2 font-bold leading-none">{pipe[k] || 0}</div><div className="mt-1 truncate text-caption font-semibold text-muted">{l}</div></div>
            ))}
          </div>
        </Tile>
      )}

      {/* The week in numbers */}
      <Tile title="This week" icon={TrendingUp} tone="soft" className="col-span-2 lg:col-span-4" to={isCompany && d.money ? '/company/invoices' : undefined}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
          <Stat value={hours(d.hoursWeek)} label="Timesheet hours" hint="Since Monday" />
          <Stat value={c.shiftsWeek ?? 0} label="Shifts" hint="Monday to Sunday" />
          {d.money && <Stat value={money0(d.money.revenueMonth)} label="Invoiced" hint="This month, net" />}
          {d.money && <Stat value={money0(d.money.outstanding)} label="Outstanding" tone={d.money.overdue > 0 ? 'red' : undefined}
            hint={d.money.overdue > 0 ? `${money0(d.money.overdue)} overdue` : `${d.money.outstandingCount} ${d.money.outstandingCount === 1 ? 'invoice' : 'invoices'}`} />}
        </div>
      </Tile>
    </Bento>
  );
}

function PeopleList({ n, label, tone, empty, rows }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2"><span className={cx('display num text-title2 font-bold', tone)}>{n}</span><span className="text-footnote font-semibold">{label}</span></div>
      {rows.length === 0 ? <p className="text-footnote text-muted">{empty}</p> : (
        <ul className="space-y-1.5">
          {rows.map((o) => (
            <li key={o.id}><Link to={`/company/staff/${o.id}`} className="-mx-2 block rounded-xl px-2 py-1 hover:bg-bg"><div className="text-subhead font-semibold">{o.name}</div><div className={cx('text-caption', o.cls)}>{o.note}</div></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}
