import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Banknote, CalendarClock, CalendarDays, CalendarOff, ClipboardCheck, Clock, Hand, Megaphone, Radio, ShieldAlert, ShieldCheck, TriangleAlert, Users,
} from 'lucide-react';
import {
  Bento, confirmState, Dot, Load, Page, Pill, Stat, Tabs, Tile, cx, dateShort, daysUntil, hours, money0, range, relative, dayLabel, isoDate, titleCase, useApi,
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

function CountTile({ to, icon: Icon, label, value, tone, hint }) {
  const hot = value > 0;
  return (
    <Link to={to} className={cx('group flex min-h-[118px] flex-col justify-between rounded-tile border border-hairline bg-surface p-4 shadow-tile transition hover:-translate-y-0.5 active:scale-[0.99] sm:p-5')}>
      <div className="flex items-center justify-between">
        <span className={cx('grid h-9 w-9 place-items-center rounded-xl', hot ? (tone === 'red' ? 'bg-red-soft text-red' : tone === 'amber' ? 'bg-amber-soft text-amber' : 'bg-blue-soft text-blue') : 'bg-bg text-faint')}>
          <Icon size={18} />
        </span>
        {hot && <Dot tone={tone || 'blue'} />}
      </div>
      <div>
        <div className={cx('display num text-title1 font-bold leading-none', !hot && 'text-faint')}>{value ?? 0}</div>
        <div className="mt-1 text-footnote font-semibold leading-tight">{label}</div>
        {hint && <div className="text-caption text-muted">{hint}</div>}
      </div>
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
  const first = (user?.name || '').split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <Page title={`${greet}${first ? `, ${first}` : ''}`} subtitle={dayLabel(isoDate())} wide>
      {feedOn && (
        <Tabs value={tab} onChange={(t) => setSp(t === 'overview' ? {} : { tab: t }, { replace: true })}
          tabs={[{ value: 'overview', label: 'Overview' }, { value: 'everyday', label: 'Everyday', count: unread.data?.unread || undefined }]} />
      )}
      {tab !== 'everyday' && <InstallCard className="mb-4" />}
      {tab === 'everyday' ? <FeedBody /> : <Load q={q}>{(d) => <Body d={d} base={base} isCompany={user.role === 'company'} />}</Load>}
    </Page>
  );
}

function Body({ d, base, isCompany }) {
  const c = d.counts || {};
  const live = d.live || {};
  const pipe = Object.fromEntries((d.pipeline || []).map((p) => [p.status, p.n]));
  return (
    <div className="space-y-4">
      <Bento>
        {/* Live now */}
        <Tile tone="ink" title="Live now" icon={Radio} className="col-span-2 lg:row-span-2" action={<Link to={`${base}/live`} className="-my-2.5 inline-block py-2.5 text-footnote font-semibold text-white/80 hover:text-white">Open board ›</Link>}>
          <div className="grid grid-cols-3 gap-3">
            <div><div className="flex items-center gap-2"><Dot tone="green" live={live.on_site > 0} /><span className="text-caption font-semibold uppercase tracking-wide opacity-70">On site</span></div><div className="display num mt-1 text-[44px] font-bold leading-none">{live.on_site ?? 0}</div></div>
            <div><div className="text-caption font-semibold uppercase tracking-wide opacity-70">Late</div><div className={cx('display num mt-1 text-[44px] font-bold leading-none', live.late ? 'text-amber-bright' : 'opacity-40')}>{live.late ?? 0}</div></div>
            <div><div className="text-caption font-semibold uppercase tracking-wide opacity-70">No-show</div><div className={cx('display num mt-1 text-[44px] font-bold leading-none', live.no_show ? 'text-red-bright' : 'opacity-40')}>{live.no_show ?? 0}</div></div>
          </div>
          {live.upcoming > 0 && <p className="mt-3 text-footnote opacity-70">{live.upcoming} due on in the next 12 hours</p>}
          <div className="mt-4 space-y-1.5">
            {(live.alerts || []).length === 0 && <p className="rounded-2xl bg-white/[0.06] px-4 py-3 text-subhead opacity-80">No alerts right now.</p>}
            {(live.alerts || []).map((a) => (
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
        </Tile>

        <CountTile to={`${base}/cover`} icon={Megaphone} label="Cover requests" value={c.pendingCover} tone="amber" />
        <CountTile to={`${base}/rota`} icon={CalendarClock} label="Unfilled shifts" hint="Next 7 days" value={c.unfilled} tone="red" />
        <CountTile to={`${base}/exceptions`} icon={TriangleAlert} label="Clock exceptions" value={c.exceptions} tone="red" />
        <CountTile to={`${base}/timesheets?status=pending`} icon={ClipboardCheck} label="Timesheets to approve" value={c.toApprove} tone="blue" />
        <CountTile to={`${base}/timesheets?status=disputed`} icon={AlertTriangle} label="Disputed timesheets" value={c.disputed} tone="red" />
        <CountTile to={`${base}/incidents`} icon={ShieldAlert} label="Open incidents" value={c.openIncidents} tone="amber" />
        <CountTile to={`${base}/rota?tab=requests`} icon={Hand} label="Shift requests" value={c.requests} tone="blue" />
        {isCompany && <CountTile to="/company/hr/time-off" icon={CalendarOff} label="Time off to review" value={c.timeOff} tone="amber" />}
        {!isCompany && (
          <Tile title="Hours this week" icon={Clock}><Stat value={hours(d.hoursWeek)} label="Timesheet hours" /></Tile>
        )}
      </Bento>

      <Bento>
        {/* Upcoming shifts */}
        <Tile title="Upcoming shifts" icon={CalendarDays} pad={false} className="col-span-2" action={<Link to={`${base}/rota`} className="-my-2.5 inline-block py-2.5 text-footnote font-semibold text-blue">Rota ›</Link>}>
          {(d.shifts || []).length === 0 ? <p className="px-5 pb-5 text-subhead text-muted">No published shifts in the next 36 hours.</p> : (
            <div className="divide-y divide-line">
              {d.shifts.slice(0, 8).map((s) => {
                const state = confirmState({ filled: s.filled, headcount: s.headcount, statuses: (s.team || []).map((t) => t.status) });
                return (
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
                    <Pill tone={state === 'short' ? 'red' : state === 'unconfirmed' ? 'amber' : 'green'} className="num">{s.filled}/{s.headcount}{state === 'unconfirmed' && ' · Unconfirmed'}</Pill>
                  </Link>
                );
              })}
            </div>
          )}
        </Tile>

        {/* Recent incidents */}
        <Tile title="Recent incidents" icon={ShieldAlert} pad={false} className="col-span-2" action={<Link to={`${base}/incidents`} className="-my-2.5 inline-block py-2.5 text-footnote font-semibold text-blue">All ›</Link>}>
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

        {isCompany && <Tile title="Hours this week" icon={Clock}><Stat value={hours(d.hoursWeek)} label="Timesheet hours" hint="Since Monday" /></Tile>}

        {isCompany && (
          <Tile title="Staff" icon={Users} to="/company/recruitment">
            <div className="grid grid-cols-3 gap-2">
              {[['applicant', 'Applicants'], ['onboarding', 'Onboarding'], ['active', 'Active']].map(([k, l]) => (
                <div key={k}><div className="display num text-title2 font-bold leading-none">{pipe[k] || 0}</div><div className="mt-1 text-caption font-semibold text-muted">{l}</div></div>
              ))}
            </div>
          </Tile>
        )}

        {isCompany && (
          <Tile title="Compliance" icon={ShieldCheck} className="col-span-2" action={<Link to="/company/staff" className="-my-2.5 inline-block py-2.5 text-footnote font-semibold text-blue">Staff ›</Link>}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-baseline gap-2"><span className={cx('display num text-title2 font-bold', d.nonCompliantCount ? 'text-red' : 'text-green')}>{d.nonCompliantCount || 0}</span><span className="text-footnote font-semibold">can't work</span></div>
                {(d.nonCompliant || []).length === 0 ? <p className="text-footnote text-muted">All active officers are compliant.</p> : (
                  <ul className="space-y-1.5">
                    {d.nonCompliant.map((o) => (
                      <li key={o.id}><Link to={`/company/staff/${o.id}`} className="block rounded-xl px-2 py-1 hover:bg-bg"><div className="text-subhead font-semibold">{o.name}</div><div className="text-caption text-red">{o.issues.join(', ')}</div></Link></li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="mb-2 text-footnote font-semibold">Expiring in 60 days</div>
                {(d.expiring || []).length === 0 ? <p className="text-footnote text-muted">Nothing expiring soon.</p> : (
                  <ul className="space-y-1.5">
                    {d.expiring.map((o) => (
                      <li key={o.id}><Link to={`/company/staff/${o.id}`} className="block rounded-xl px-2 py-1 hover:bg-bg">
                        <div className="text-subhead font-semibold">{o.name}</div>
                        <div className="text-caption text-amber">
                          {[o.sia_expiry && daysUntil(o.sia_expiry) <= 60 && `SIA ${dateShort(o.sia_expiry)}`, o.rtw_expiry && daysUntil(o.rtw_expiry) <= 60 && `RTW ${dateShort(o.rtw_expiry)}`].filter(Boolean).join(' · ')}
                        </div>
                      </Link></li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Tile>
        )}

        {d.money && (
          <Tile title="Money" icon={Banknote} tone="soft" className="col-span-2" to={isCompany ? '/company/invoices' : undefined}>
            <div className="grid grid-cols-3 gap-3">
              <Stat value={money0(d.money.outstanding)} label="Outstanding" hint={`${d.money.outstandingCount} invoices`} />
              <Stat value={money0(d.money.overdue)} label="Overdue" hint={`${d.money.overdueCount} invoices`} tone={d.money.overdue > 0 ? 'red' : undefined} />
              <Stat value={money0(d.money.revenueMonth)} label="This month" hint="Invoiced, net" />
            </div>
          </Tile>
        )}
      </Bento>
    </div>
  );
}
