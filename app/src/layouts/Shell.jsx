import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Bell, BellOff, BookOpen, Briefcase, ChevronRight, LogOut, MessagesSquare, MoreHorizontal, Newspaper } from 'lucide-react';
import { api } from '../api.js';
import { startRealtime, useRealtime, useRealtimeConnected } from '../realtime.js';
import { portalLink, useAuth } from '../auth.jsx';
import { Avatar, Button, cx, Empty, IconButton, Pressable, relative, Sheet, SkeletonPage, SkeletonRows, useApi, usePageHeader, useScrollMemory } from '../ui/index.jsx';
import { NAV, ROLE_LABEL } from './nav.js';
import { SideSwitch } from './SideSwitch.jsx';
import { AccountSheet } from './AccountSheet.jsx';
import AskOrb from '../ui/AskOrb.jsx';
import OrbFab from '../ui/OrbFab.jsx';
import { OfflineBanner, useUpdateToast } from '../ui/pwa.jsx';

// The Opulence horse and the company name in Playfair.
// faded: the wordmark fades out (header shows the page title instead)
// place: sidebar / header / auth sets the size; tone: 'light' (gold on dark chrome or photos) or 'dark' (ink on light)
// The uploaded brand.logo_url is for PDFs and emails.
const LOGO_SIZE = {
  sidebar: { mark: 'h-9', text: 'text-title3' },
  header: { mark: 'h-8', text: 'text-headline' },
  auth: { mark: 'h-14', text: 'text-title2' },
};
export function Logo({ compact, faded, place = 'header', tone = 'dark' }) {
  const { brand } = useAuth();
  const size = LOGO_SIZE[place] || LOGO_SIZE.header;
  const fade = cx('transition-opacity duration-[var(--dur-2)]', faded && 'opacity-0');
  const light = tone === 'light';
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src={`/app/brand/logo-${light ? 'gold' : 'ink'}-192.png`} alt={compact ? brand.name : ''} className={cx('w-auto shrink-0', size.mark)} />
      {!compact && <span className={cx('display max-w-[200px] truncate font-semibold tracking-tight', size.text, light ? 'text-gold' : 'text-ink', fade)}>{brand.name}</span>}
    </div>
  );
}

// Phones (below lg) get the black top bar
function useNarrow() {
  const [narrow, setNarrow] = useState(() => !window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setNarrow(!mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

// Polls the unread count; opens the notification sheet
function NotificationBell() {
  const { user, brand } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const count = useApi('notifications.unreadCount', {}, { poll: 30000 });
  const list = useApi('notifications.list', {}, { skip: !open });
  const last = useRef(null);
  const unread = count.data?.unread || 0;

  // A shift change takes back alerts that no longer hold
  useEffect(() => {
    const h = () => { count.reload(); if (open) list.reload(); };
    window.addEventListener('orb:notify', h);
    return () => window.removeEventListener('orb:notify', h);
  });

  // Surface brand-new critical alerts in the tab title
  useEffect(() => {
    const latest = count.data?.latest;
    if (latest && last.current && latest !== last.current && count.data.critical) document.title = `(${unread}) ${brand.name}`;
    if (!unread) document.title = brand.name;
    last.current = latest;
  }, [count.data, unread, brand.name]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read_at) await api('notifications.markRead', { ids: [n.id] }).catch(() => {});
    count.reload();
    nav(portalLink(n.link, user.role).replace(/^\/app/, ''));
  };
  return (
    <>
      <IconButton icon={Bell} tone="solid" onClick={() => setOpen(true)} label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        badge={unread} badgeTone={count.data?.critical ? 'red' : 'blue'} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications"
        footer={unread > 0 && <Button variant="ghost" onClick={async () => { await api('notifications.markRead', {}); count.reload(); list.reload(); }}>Mark all as read</Button>}>
        {list.loading && !list.data ? <SkeletonRows n={4} className="-mx-1 border-0 shadow-none" /> : !list.data?.items.length ? <Empty icon={BellOff} title="You are all caught up" /> : (
          <div className="-mx-2 divide-y divide-line">
            {list.data.items.map((n) => (
              <Pressable key={n.id} onClick={() => openItem(n)} className="flex gap-3 rounded-xl px-2 py-3">
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : n.severity === 'critical' ? 'bg-red' : n.severity === 'warning' ? 'bg-amber' : 'bg-blue')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold">{n.title}</span>
                  {n.body && <span className="block text-subhead text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-caption text-faint">{relative(n.created_at)}</span>
                </span>
              </Pressable>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

// Everyday shortcut with a count of posts since the person last looked
function EverydayButton({ to, unread }) {
  const { pathname, search } = useLocation();
  return <IconButton icon={Newspaper} tone="solid" to={to} active={pathname + search === to} badge={unread} label={`Everyday${unread ? `, ${unread} new posts` : ''}`} />;
}

// Compact page title in the top bar, shown once the large title has scrolled away
function HeaderTitle() {
  const { title, collapsed } = usePageHeader();
  return (
    <div aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-start pl-[calc(var(--px)+env(safe-area-inset-left))] pr-[13rem] transition-[opacity,transform] duration-[var(--dur-2)] ease-ios', collapsed && title ? 'opacity-100' : 'translate-y-1 opacity-0')}>
      <span className="truncate text-headline font-semibold">{title}</span>
    </div>
  );
}

// Sidebar links: gold bar and gold text on the active one
const NAV_ITEM = 'pressable relative flex min-h-9 items-center gap-3 rounded-xl px-3 py-1.5 text-subhead font-semibold';
const NAV_ON = 'bg-blue-soft text-blue before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--accent-fill)]';
const NAV_OFF = 'text-ink/70 hover:bg-fill hover:text-ink';

// Count badge for a nav item (Orb inbox)
const Badge = ({ n, className }) => (n > 0 ? <span className={cx('rounded-full bg-blue px-1.5 text-caption2 font-bold leading-[18px] text-white', className)}>{n > 99 ? '99+' : n}</span> : null);

// On "My shifts", a manager who also works shifts gets back to the manager side in one tap
function ManagerButton() {
  const { switchSide } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const u = await switchSide('manager'); nav(`/${u.role}`, { replace: true }); } finally { setBusy(false); }
  };
  return <Button variant="secondary" size="sm" icon={Briefcase} disabled={busy} onClick={go}>Manager</Button>;
}

export default function Shell() {
  const { user, signOut } = useAuth();
  const isMgr = ['company', 'security'].includes(user.role);
  const opsCount = useApi('ops.count', {}, { poll: 30000, skip: !isMgr });
  const settings = useApi('settings.get', {});
  const modules = settings.data?.modules || {};
  const on = (m) => modules[m] !== false;
  const feedOn = user.role !== 'venue' && settings.data && on('everyday');
  const feed = useApi('everyday.unread', {}, { poll: 60000, skip: !feedOn });
  const live = useRealtimeConnected();
  const msgs = useApi('messages.unread', {}, { poll: live ? 120000 : 30000 });
  useEffect(() => startRealtime(user.id), [user.id]);
  const mail = useApi('email.accounts', {}, { poll: 120000, skip: user.role !== 'company' });
  useEffect(() => { const h = () => mail.reload(); window.addEventListener('orb:email', h); return () => window.removeEventListener('orb:email', h); });
  useEffect(() => { const h = () => opsCount.reload(); window.addEventListener('orb:ops', h); return () => window.removeEventListener('orb:ops', h); });
  const badges = { ops: opsCount.data?.n || 0, everyday: feed.data?.unread || 0, messages: msgs.data?.unread || 0, email: (mail.data?.accounts || []).reduce((n, a) => n + (a.unread || 0), 0) };
  const loc = useLocation();
  const [more, setMore] = useState(false);
  const [account, setAccount] = useState(false);
  const [ask, setAsk] = useState(false);
  const [orbDot, setOrbDot] = useState(false);
  // Other pages open Orb with this event (e.g. the Orb page)
  useEffect(() => {
    const o = () => setAsk(true);
    window.addEventListener('orb:askorb', o);
    return () => window.removeEventListener('orb:askorb', o);
  }, []);
  // Settings saves fire this so switched-off modules disappear straight away
  const reloadSettings = useRef(settings.reload);
  reloadSettings.current = settings.reload;
  useEffect(() => {
    const r = () => reloadSettings.current();
    window.addEventListener('orb:settings', r);
    return () => window.removeEventListener('orb:settings', r);
  }, []);
  // Opening a conversation clears its part of the Messages badge
  const reloadMsgs = useRef(msgs.reload);
  reloadMsgs.current = msgs.reload;
  useEffect(() => {
    const r = () => reloadMsgs.current();
    window.addEventListener('orb:messages', r);
    return () => window.removeEventListener('orb:messages', r);
  }, []);
  useRealtime(['msg', 'read'], () => reloadMsgs.current());
  // Opening the feed clears the badge
  const onFeed = /\/everyday$/.test(loc.pathname) || /[?&]tab=everyday/.test(loc.search);
  useEffect(() => { if (feedOn && onFeed) setTimeout(feed.reload, 1500); }, [onFeed, feedOn]);
  // A new post from someone else bumps the badge straight away (unless the feed is open)
  const reloadFeed = useRef(feed.reload);
  reloadFeed.current = feed.reload;
  useRealtime('feed.post', (d) => { if (feedOn && !onFeed && d.author_id !== user.id) reloadFeed.current(); });
  const groups = NAV[user.role]
    .map((g) => ({ ...g, items: g.items.filter((it) => (!it.module || on(it.module)) && (!it.moduleAny || it.moduleAny.some(on)) && (!it.perm || user[it.perm])) }))
    .filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);
  const tabs = all.filter((i) => i.tab);
  const extra = all.filter((i) => !i.tab);
  const isOfficer = user.role === 'officer';
  useEffect(() => { setMore(false); setAccount(false); }, [loc.pathname]);
  useScrollMemory();
  useUpdateToast();
  const header = usePageHeader();
  // Black top bar on phones and for officers; managers on desktop keep the light see-through bar
  const narrow = useNarrow();
  const darkBar = isOfficer || narrow;
  // Desktop header is see-through at the top; it gets its frosted background once the page scrolls under it
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const navType = useNavigationType();
  // Pages slide in going forward, back the other way, and cross-fade when switching sections
  const isSection = all.some((i) => i.to === loc.pathname);
  // Slide in for drill-in, slide back for Back; the first page and tab switches fade
  const firstPath = useRef(loc.pathname);
  useEffect(() => { if (loc.pathname !== firstPath.current) firstPath.current = null; }, [loc.pathname]);
  const pageAnim = loc.pathname === firstPath.current ? 'page-fade' : navType === 'POP' ? 'page-in-left' : navType === 'PUSH' && !isSection ? 'page-in-right' : 'page-fade';
  // Tells docked bars and page padding whether a bottom tab bar is showing
  useLayoutEffect(() => {
    const html = document.documentElement;
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => {
      html.classList.toggle('has-tabbar', isOfficer || !mq.matches);
      html.classList.toggle('has-sidebar', !isOfficer);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); html.classList.remove('has-tabbar', 'has-sidebar'); };
  }, [isOfficer]);
  const isActive = (it) => (it.end ? loc.pathname === it.to : loc.pathname === it.to || loc.pathname.startsWith(`${it.to}/`));
  // Tapping the tab you're already on scrolls back to the top
  const tabTap = (it) => (e) => { if (loc.pathname === it.to) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar (managers) */}
      {!isOfficer && (
        <aside data-style="control" className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
          <div className="px-3 pb-6"><Logo place="sidebar" tone="light" /></div>
          <SideSwitch full className="mb-4" />
          <nav className="flex-1 space-y-4 overflow-y-auto no-scrollbar">
            {groups.map((g, i) => (
              <div key={i}>
                {g.title && <div className="mb-0.5 px-3 text-caption2 font-semibold uppercase tracking-wider text-faint">{g.title}</div>}
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end} onClick={tabTap(it)}
                    className={({ isActive: on }) => cx(NAV_ITEM, on ? NAV_ON : NAV_OFF)}>
                    <it.icon size={18} /><span className="flex-1">{it.label}</span><Badge n={badges[it.badge]} />
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <NavLink to={`/${user.role}/help`}
            className={({ isActive: on }) => cx(NAV_ITEM, 'mt-2', on ? NAV_ON : NAV_OFF)}>
            <BookOpen size={18} /><span className="flex-1">Help & user guide</span>
          </NavLink>
          <Pressable press onClick={() => setAccount(true)} aria-label="My account" className="mt-4 flex items-center gap-3 rounded-2xl bg-fill p-3 hover:bg-fill-strong">
            <Avatar name={user.name} src={user.photo_url} size={36} />
            <div className="min-w-0 flex-1"><div className="truncate text-subhead font-semibold">{user.name}</div><div className="truncate text-caption text-muted">{ROLE_LABEL[user.role]}</div></div>
            <ChevronRight size={18} className="text-faint" />
          </Pressable>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header data-style={darkBar ? 'control' : undefined} className={cx('sticky top-0 z-30 border-b border-line/50 bg-bg/80 backdrop-blur-xl safe-t', !isOfficer && !scrolled && 'lg:border-transparent lg:bg-transparent lg:backdrop-blur-none', 'transition-[background-color,border-color] duration-200')}>
          <div className={cx('relative mx-auto flex h-14 items-center justify-between [--px:1rem] sm:[--px:1.5rem] safe-x', isOfficer ? 'max-w-2xl' : header.wide ? 'max-w-[1400px]' : 'max-w-6xl')}>
            <HeaderTitle />
            <div className={cx('flex min-w-0', !isOfficer && 'lg:invisible')}><Logo tone={darkBar ? 'light' : 'dark'} faded={header.collapsed && !!header.title} /></div>
            <div className="flex items-center gap-2">
              {feedOn && <EverydayButton to={isOfficer ? '/officer/everyday' : `/${user.role}?tab=everyday`} unread={badges.everyday} />}
              {user.role !== 'venue' && (
                <span className={cx(!isOfficer && 'lg:hidden')}>
                  <IconButton icon={MessagesSquare} tone="solid" to={`/${user.role}/messages`} active={loc.pathname.startsWith(`/${user.role}/messages`)} badge={badges.messages} label={`Messages${badges.messages ? `, ${badges.messages} unread` : ''}`} />
                </span>
              )}
              <NotificationBell />
              {isOfficer && user.dual && <ManagerButton />}
              {isOfficer && <span className="hidden sm:block"><Button variant="secondary" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button></span>}
            </div>
          </div>
        </header>
        <OfflineBanner />
        <main className={cx(isOfficer && 'mx-auto max-w-2xl')}>
          <Suspense fallback={<SkeletonPage />}>
            <div key={loc.pathname} className={pageAnim}><Outlet /></div>
          </Suspense>
        </main>
      </div>

      {/* Mobile tab bar (and officer tab bar on all sizes) */}
      <nav aria-label="Main" className={cx('fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/85 backdrop-blur-xl safe-b safe-x', !isOfficer && 'lg:hidden')}>
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2">
          {tabs.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} onClick={tabTap(it)}
              className={({ isActive: on }) => cx('pressable flex min-h-[54px] flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-caption2 font-semibold', on ? 'text-blue' : 'text-faint')}>
              {it.primary
                ? <span className={cx('-mt-5 grid h-14 w-14 place-items-center rounded-full bg-blue text-white shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--accent-fill,var(--color-blue))_80%,transparent)] ring-4 ring-bg', isActive(it) && 'anim-pop')}><it.icon size={24} /></span>
                : <span className={cx(isActive(it) && 'anim-pop')}><it.icon size={24} /></span>}
              <span className={cx(it.primary && 'mt-0.5')}>{it.short || it.label}</span>
            </NavLink>
          ))}
          {extra.length > 0 && (
            <Pressable press onClick={() => setMore(true)} className={cx('pressable flex min-h-[54px] flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-caption2 font-semibold', extra.some(isActive) ? 'text-blue' : 'text-faint')}>
              <span className="relative"><MoreHorizontal size={24} /><Badge n={extra.reduce((a, it) => a + (badges[it.badge] || 0), 0)} className="absolute -right-3 -top-1" /></span>More
            </Pressable>
          )}
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <SideSwitch full className="mb-4" />
        <div className="grid grid-cols-3 gap-2">
          {extra.map((it) => (
            <NavLink key={it.to} to={it.to} className={cx('pressable flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-footnote font-semibold', isActive(it) ? 'bg-blue-soft text-blue' : 'bg-bg')}>
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-surface text-blue shadow-tile"><it.icon size={20} /><Badge n={badges[it.badge]} className="absolute -right-2 -top-1.5" /></span>{it.label}
            </NavLink>
          ))}
        </div>
        <Pressable press onClick={() => { setMore(false); setAccount(true); }} className="mt-4 flex items-center gap-3 rounded-2xl bg-bg p-3">
          <Avatar name={user.name} src={user.photo_url} size={36} />
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{user.name}</div><div className="text-footnote text-muted">My account · {ROLE_LABEL[user.role]}</div></div>
          <ChevronRight size={18} className="text-faint" />
        </Pressable>
      </Sheet>
      {!isOfficer && <AccountSheet open={account} onClose={() => setAccount(false)} />}
      {isMgr && <OrbFab onClick={() => setAsk(true)} hidden={ask} dot={orbDot} />}
      {isMgr && <AskOrb open={ask} onClose={() => setAsk(false)} onDot={setOrbDot} />}
    </div>
  );
}
