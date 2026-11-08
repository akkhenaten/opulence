import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarOff, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Hand, History, Megaphone, Newspaper, RefreshCw, Settings, ShieldAlert, ShieldCheck,
  TrendingUp, TriangleAlert, UserX,
} from 'lucide-react';
import {
  Button, Chip, IconButton, MoreMenu, Page, Pill, Stat, Tile, confirmState, cx, dayLabel, hours, isoDate, money0, range, time, useAction, useApi, useMedia, useToast,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useBase } from './_parts.jsx';
import { FeedBody } from '../everyday/Feed.jsx';
import { InstallCard } from '../../ui/pwa.jsx';
import { PushCard } from '../officer/_notify.jsx';
import { Floor, StatusChips, useLiveBoard } from '../shared/Live.jsx';
import { Inbox } from './OpsAI.jsx';

// Everyday lives on the Dashboard now; old links (and notification links) land on that tab
export function EverydayRedirect() {
  const { search } = useLocation();
  const { base } = useBase();
  const p = new URLSearchParams(search);
  if (p.get('tab') === 'moderation') p.set('view', 'moderation');
  p.set('tab', 'everyday');
  return <Navigate to={`${base}?${p}`} replace />;
}

const CHIP = { red: 'bg-red-soft text-red', amber: 'bg-amber-soft text-amber', blue: 'bg-blue-soft text-blue' };

// What can be waiting on a manager besides Orb's cards, most urgent first; only the ones above zero are shown.
// The red ones go above Orb's cards in the queue, the rest below.
const NEEDS = [
  { key: 'exceptions', to: '/exceptions', icon: TriangleAlert, tone: 'red', one: 'clock exception to check', many: 'clock exceptions to check' },
  { key: 'unfilled', to: '/rota', icon: CalendarClock, tone: 'red', one: 'unfilled shift in the next 7 days', many: 'unfilled shifts in the next 7 days' },
  { key: 'disputed', to: '/timesheets?status=disputed', icon: AlertTriangle, tone: 'red', one: 'disputed timesheet', many: 'disputed timesheets' },
  { key: 'cantWork', to: '/people/compliance?view=cantwork', icon: UserX, tone: 'red', one: 'officer can’t work (compliance)', many: 'officers can’t work (compliance)', company: true },
  { key: 'openIncidents', to: '/incidents', icon: ShieldAlert, tone: 'amber', one: 'open incident', many: 'open incidents' },
  { key: 'pendingCover', to: '/cover', icon: Megaphone, tone: 'amber', one: 'cover request to answer', many: 'cover requests to answer' },
  { key: 'graceEnding', to: '/people/compliance?view=cantwork', icon: CalendarClock, tone: 'amber', one: 'grace period ends within 3 days', many: 'grace periods end within 3 days', company: true },
  { key: 'expiring', to: '/people/compliance', icon: ShieldCheck, tone: 'amber', one: 'officer with a licence or right to work expiring in 60 days', many: 'officers with a licence or right to work expiring in 60 days', company: true },
  { key: 'toApprove', to: '/timesheets?status=pending', icon: ClipboardCheck, tone: 'blue', one: 'timesheet to approve', many: 'timesheets to approve' },
  { key: 'requests', to: '/rota?tab=requests', icon: Hand, tone: 'blue', one: 'shift request', many: 'shift requests' },
  { key: 'timeOff', to: '/company/hr/time-off', abs: true, icon: CalendarOff, tone: 'amber', one: 'time off request to review', many: 'time off requests to review', company: true },
];
// The counts from dashboard.get, plus the two compliance ones (expiring comes as a list of at most 10)
const countsOf = (d) => ({ ...(d?.counts || {}), cantWork: d?.nonCompliantCount || 0, expiring: (d?.expiring || []).length });
const needsFor = (c, isCompany) => NEEDS.filter((n) => (c[n.key] || 0) > 0 && (!n.company || isCompany));

function summaryLine(d, isCompany, onSite, orb) {
  const parts = [dayLabel(isoDate())];
  if (!d) return parts[0];
  if (onSite) parts.push(`${onSite} on site`);
  const c = countsOf(d);
  const n = needsFor(c, isCompany).reduce((a, x) => a + c[x.key], 0) + (orb || 0);
  parts.push(n ? `${n} ${n === 1 ? 'thing needs' : 'things need'} you` : 'all clear');
  return parts.join(' · ');
}

function TileLink({ to, children }) {
  return (
    <Link to={to} className="relative -my-2.5 inline-block py-2.5 text-footnote font-semibold text-blue before:absolute before:-inset-x-3 before:-inset-y-1">
      {children} ›
    </Link>
  );
}

// Published shifts in the next 36 hours: short first, then unconfirmed, each in time order
function upcoming(d) {
  const shifts = (d?.shifts || []).map((s) => ({ ...s, state: confirmState({ filled: s.filled, headcount: s.headcount, statuses: (s.team || []).map((t) => t.status) }) }));
  const rank = { short: 0, unconfirmed: 1 };
  return {
    shifts,
    sorted: shifts.slice().sort((a, b) => (rank[a.state] ?? 2) - (rank[b.state] ?? 2) || new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 8),
    short: shifts.filter((s) => s.state === 'short').length,
    unconfirmed: shifts.filter((s) => s.state === 'unconfirmed').length,
  };
}

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/**
 * Today: the manager's one page. A status strip, the queue of everything that needs them (Orb's cards and the other
 * to-dos), the board of who is on site, the next 36 hours and the week in numbers. Everyday opens in place (?tab=everyday).
 */
export default function Dashboard() {
  const { user, base } = useBase();
  const [sp, setSp] = useSearchParams();
  const settings = useApi('settings.get');
  const feedOn = settings.data && settings.data.modules?.everyday !== false;
  const tab = feedOn && sp.get('tab') === 'everyday' ? 'everyday' : 'overview';
  const q = useApi('dashboard.get', {}, { poll: 30000 });
  const count = useApi('ops.count', {}, { poll: 30000 });
  const unread = useApi('everyday.unread', {}, { poll: 60000, skip: !feedOn });
  const board = useLiveBoard();
  const lg = useMedia('(min-width: 1024px)');
  const [reloadKey, setReloadKey] = useState(0);
  const [lastChecked, setLastChecked] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  const isCompany = user.role === 'company';
  const first = (user?.name || '').split(' ')[0];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const orb = count.data?.n || 0;
  const onSite = board.rows.filter((r) => ['on_shift', 'on_break'].includes(r.state)).length;

  // Any shift change or Orb decision anywhere in the app: the board, the counts and the cards catch up
  useEffect(() => {
    const h = () => { board.q.reload(); count.reload(); q.reload(); setReloadKey((k) => k + 1); };
    window.addEventListener('orb:ops', h);
    return () => window.removeEventListener('orb:ops', h);
  });

  // The round arrows run every Orb check now (chasing, cover, site packs, hours, compliance), then everything reloads
  const refresh = () => run(() => api('ops.refresh')).then((r) => {
    window.dispatchEvent(new Event('orb:ops'));
    if (r.busy) return toast('Checks already running');
    setLastChecked(r.checked_at);
    toast(r.new_items ? `Checked — ${r.new_items} new ${r.new_items === 1 ? 'item' : 'items'} to approve` : r.errors?.length ? `Checked — some checks failed (${r.errors.join(', ')})` : 'Checked — all clear', r.errors?.length ? 'error' : undefined);
  }).catch(() => {});

  const actions = tab !== 'everyday' && (
    <>
      {feedOn && (
        <Button size="sm" variant="secondary" icon={Newspaper} onClick={() => setSp({ tab: 'everyday' }, { replace: true })}>
          Everyday
          {unread.data?.unread > 0 && <span className="num min-w-[18px] rounded-full bg-blue px-1 text-center text-caption2 font-bold leading-[18px] text-white">{unread.data.unread > 99 ? '99+' : unread.data.unread}</span>}
        </Button>
      )}
      <IconButton icon={RefreshCw} tone="solid" label="Run Orb checks and refresh" onClick={refresh} disabled={busy} className={cx(busy && '[&>svg]:animate-spin')} />
      <MoreMenu tone="solid" label="Orb" items={[
        { label: 'Orb activity', hint: lastChecked ? `Last checked ${time(lastChecked)}` : 'Everything Orb has done', icon: History, to: `${base}/orb` },
        isCompany && { label: 'Orb settings', hint: 'What Orb checks, timings and AI limits', icon: Settings, to: `${base}/orb?tab=settings` },
      ]} />
    </>
  );

  return (
    <Page backLabel="Today" title={`${greet}${first ? `, ${first}` : ''}`} subtitle={summaryLine(tab === 'everyday' ? null : q.data, isCompany, onSite, orb)} wide photo="door" slim actions={actions || undefined}>
      {tab !== 'everyday' && <PushCard className="mb-4" later="your account menu" />}
      {tab === 'everyday'
        ? <FeedBody lead={<Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => setSp({}, { replace: true })}>Today</Button>} />
        : <Today d={q.data} board={board} base={base} isCompany={isCompany} lg={lg} orb={orb} reloadKey={reloadKey} onOrbChange={() => { count.reload(); q.reload(); }} />}
      {tab !== 'everyday' && <InstallCard className="mt-4" later={isCompany ? 'Settings' : 'My account'} />}
    </Page>
  );
}

function Today({ d, board, base, isCompany, lg, orb, reloadKey, onOrbChange }) {
  const c = countsOf(d);
  const list = needsFor(c, isCompany);
  const total = list.reduce((a, x) => a + c[x.key], 0) + orb;
  const next = upcoming(d);
  const rows = (tones) => {
    const l = list.filter((n) => tones.includes(n.tone));
    return l.length > 0 && <NeedRows list={l} c={c} base={base} />;
  };
  // On phones a filter jumps to the board, which sits under the queue
  const setFilter = (v) => { board.setFilter(v); if (!lg) setTimeout(() => scrollTo('floor'), 50); };
  const onSite = board.rows.filter((r) => ['on_shift', 'on_break'].includes(r.state)).length;

  const queue = (
    <Inbox slim scroll={lg} compact n={orb} reloadKey={reloadKey} onChange={onOrbChange} title="Needs you"
      pill={total > 0 ? <Pill tone="blue" className="num">{total}</Pill> : null}
      before={rows(['red'])} after={rows(['amber', 'blue'])}
      empty={(
        <div className="ui-panel flex items-center gap-3 rounded-tile border border-hairline bg-surface p-4 shadow-tile">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-green-soft text-green"><CheckCircle2 size={18} /></span>
          <p className="text-subhead font-semibold">All clear, nothing needs you right now.</p>
        </div>
      )} />
  );
  const floor = (
    <section id="floor" aria-label="On the floor" className="scroll-mt-20">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-headline font-bold">On the floor</h2>
        <span className="text-footnote text-muted"><span className="num">{onSite}</span> on site{board.updated && <> · updated <span className="num">{time(board.updated)}</span></>}</span>
      </div>
      <Floor board={{ ...board, setFilter }} base={base} narrow={lg} hideExceptions />
    </section>
  );
  const strip = (
    <StatusChips {...board} setFilter={setFilter}>
      {d && <Chip label="Short shifts" value={next.short} tone={next.short ? 'red' : 'grey'} quiet={!next.short} onClick={() => scrollTo('tonight')} />}
      <Chip label="To approve" value={orb} tone={orb ? 'blue' : 'grey'} quiet={!orb} onClick={() => scrollTo('needs')} />
    </StatusChips>
  );

  return (
    <>
      {strip}
      {lg ? (
        <div className="grid min-h-[calc(100dvh-16rem)] grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="min-w-0 space-y-6">
            {floor}
            <Tonight d={d} next={next} base={base} />
          </div>
          {/* The queue never sets the row's height: it takes the left column's height (up to the window's) and scrolls inside */}
          <div className="[contain:size]">
            <aside id="needs" aria-label="Needs you" className="sticky top-[calc(56px+1rem)] flex h-full max-h-[calc(100dvh-7rem)] flex-col">{queue}</aside>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section id="needs" aria-label="Needs you" className="scroll-mt-20">{queue}</section>
          {floor}
          <Tonight d={d} next={next} base={base} />
        </div>
      )}
      {d && <Week d={d} c={c} />}
    </>
  );
}

// The to-dos that aren't Orb cards: one row each, in the same card style as the queue
function NeedRows({ list, c, base }) {
  return (
    <div className="ui-panel mb-3 overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile">
      <div className="divide-y divide-line">
        {list.map((n) => (
          <Link key={n.key} to={n.abs ? n.to : `${base}${n.to}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-bg">
            <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', CHIP[n.tone])}><n.icon size={18} /></span>
            <div className="min-w-0 flex-1 text-subhead leading-snug">
              <span className="num font-bold">{n.key === 'expiring' && c[n.key] >= 10 ? '10+' : c[n.key]}</span> {c[n.key] === 1 ? n.one : n.many}
            </div>
            <ChevronRight size={18} className="shrink-0 text-faint" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Tonight({ d, next, base }) {
  const { shifts, sorted, short, unconfirmed } = next;
  return (
    <div id="tonight" className="scroll-mt-20">
      <Tile title="Tonight & tomorrow" icon={CalendarDays} pad={false} action={<TileLink to={`${base}/rota`}>Rota</TileLink>}>
        {!d ? <p className="px-5 pb-5 text-subhead text-muted">Loading…</p> : shifts.length === 0 ? <p className="px-5 pb-5 text-subhead text-muted">No published shifts in the next 36 hours.</p> : (
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
    </div>
  );
}

// The week in numbers, one slim strip (money only for those who can see pay)
function Week({ d, c }) {
  return (
    <Tile title="This week" icon={TrendingUp} tone="soft" className="mt-6">
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4">
        <Stat value={hours(d.hoursWeek)} label="Timesheet hours" hint="Since Monday" />
        <Stat value={c.shiftsWeek ?? 0} label="Shifts" hint="Monday to Sunday" />
        {d.money && <Stat value={money0(d.money.revenueMonth)} label="Invoiced" hint="This month, net" />}
        {d.money && <Stat value={money0(d.money.outstanding)} label="Outstanding" tone={d.money.overdue > 0 ? 'red' : undefined}
          hint={d.money.overdue > 0 ? `${money0(d.money.overdue)} overdue` : `${d.money.outstandingCount} ${d.money.outstandingCount === 1 ? 'invoice' : 'invoices'}`} />}
      </div>
    </Tile>
  );
}
