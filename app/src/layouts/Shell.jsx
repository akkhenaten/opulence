import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Bell, BellOff, LogOut, MoreHorizontal, Newspaper } from 'lucide-react';
import { api } from '../api.js';
import { portalLink, useAuth } from '../auth.jsx';
import { Avatar, Button, cx, Empty, IconButton, Pressable, relative, Sheet, SkeletonPage, SkeletonRows, useApi, usePageHeader, useScrollMemory } from '../ui/index.jsx';
import { NAV, ROLE_LABEL } from './nav.js';

// faded: the wordmark fades out (header shows the page title instead)
export function Logo({ compact, faded }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 512 512" className="h-8 w-8 shrink-0" aria-hidden><rect width="512" height="512" rx="120" fill="#0A6CFF" /><circle cx="256" cy="256" r="132" fill="none" stroke="#fff" strokeWidth="44" /><circle cx="256" cy="256" r="40" fill="#fff" /></svg>
      {!compact && <span className={cx('display text-title3 font-bold tracking-tight transition-opacity duration-[var(--dur-2)]', faded && 'opacity-0')}>Orb <span className="text-muted font-semibold">Security</span></span>}
    </div>
  );
}

// Polls the unread count; opens the notification sheet
function NotificationBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const count = useApi('notifications.unreadCount', {}, { poll: 30000 });
  const list = useApi('notifications.list', {}, { skip: !open });
  const last = useRef(null);
  const unread = count.data?.unread || 0;

  // Surface brand-new critical alerts in the tab title
  useEffect(() => {
    const latest = count.data?.latest;
    if (latest && last.current && latest !== last.current && count.data.critical) document.title = `(${unread}) Orb Security`;
    if (!unread) document.title = 'Orb Security';
    last.current = latest;
  }, [count.data, unread]);

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
  const { pathname } = useLocation();
  return <IconButton icon={Newspaper} tone="solid" to={to} active={pathname === to} badge={unread} label={`Everyday${unread ? `, ${unread} new posts` : ''}`} />;
}

// Compact page title in the top bar, shown once the large title has scrolled away
function HeaderTitle() {
  const { title, collapsed } = usePageHeader();
  return (
    <div aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-center px-28 transition-[opacity,transform] duration-[var(--dur-2)] ease-ios', collapsed && title ? 'opacity-100' : 'translate-y-1 opacity-0')}>
      <span className="truncate text-headline font-semibold">{title}</span>
    </div>
  );
}

// Count badge for a nav item (Ops AI inbox)
const Badge = ({ n, className }) => (n > 0 ? <span className={cx('rounded-full bg-blue px-1.5 text-caption2 font-bold leading-[18px] text-white', className)}>{n > 99 ? '99+' : n}</span> : null);

export default function Shell() {
  const { user, company, signOut } = useAuth();
  const isMgr = ['company', 'security'].includes(user.role);
  const opsCount = useApi('ops.count', {}, { poll: 30000, skip: !isMgr });
  const settings = useApi('settings.get', {});
  const modules = settings.data?.modules || {};
  const on = (m) => modules[m] !== false;
  const feedOn = user.role !== 'venue' && settings.data && on('everyday');
  const feed = useApi('everyday.unread', {}, { poll: 60000, skip: !feedOn });
  const badges = { ops: opsCount.data?.n || 0, everyday: feed.data?.unread || 0 };
  const loc = useLocation();
  const [more, setMore] = useState(false);
  // Settings saves fire this so switched-off modules disappear straight away
  const reloadSettings = useRef(settings.reload);
  reloadSettings.current = settings.reload;
  useEffect(() => {
    const r = () => reloadSettings.current();
    window.addEventListener('orb:settings', r);
    return () => window.removeEventListener('orb:settings', r);
  }, []);
  // Opening the feed clears the badge
  useEffect(() => { if (feedOn && /\/everyday$/.test(loc.pathname)) setTimeout(feed.reload, 1500); }, [loc.pathname, feedOn]);
  const groups = NAV[user.role]
    .map((g) => ({ ...g, items: g.items.filter((it) => (!it.module || on(it.module)) && (!it.moduleAny || it.moduleAny.some(on))) }))
    .filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);
  const tabs = all.filter((i) => i.tab);
  const extra = all.filter((i) => !i.tab);
  const isOfficer = user.role === 'officer';
  useEffect(() => { setMore(false); }, [loc.pathname]);
  useScrollMemory();
  const header = usePageHeader();
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
        <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-line/70 bg-surface/70 px-3 py-5 backdrop-blur-xl lg:flex">
          <div className="px-3 pb-6"><Logo /></div>
          <nav className="flex-1 space-y-5 overflow-y-auto no-scrollbar">
            {groups.map((g, i) => (
              <div key={i}>
                {g.title && <div className="mb-1 px-3 text-caption2 font-semibold uppercase tracking-wider text-faint">{g.title}</div>}
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end} onClick={tabTap(it)}
                    className={({ isActive: on }) => cx('pressable flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-subhead font-semibold', on ? 'bg-blue-soft text-blue' : 'text-ink/75 hover:bg-bg hover:text-ink')}>
                    <it.icon size={18} /><span className="flex-1">{it.label}</span><Badge n={badges[it.badge]} />
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-bg p-3">
            <Avatar name={user.name} size={36} />
            <div className="min-w-0 flex-1"><div className="truncate text-subhead font-semibold">{user.name}</div><div className="truncate text-caption text-muted">{ROLE_LABEL[user.role]}</div></div>
            <IconButton icon={LogOut} label="Sign out" size="sm" onClick={signOut} />
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header className={cx('sticky top-0 z-30 border-b border-line/50 bg-bg/80 backdrop-blur-xl safe-t', !isOfficer && !scrolled && 'lg:border-transparent lg:bg-transparent lg:backdrop-blur-none', 'transition-[background-color,border-color] duration-200')}>
          <div className={cx('relative mx-auto flex h-14 items-center justify-between [--px:1rem] sm:[--px:1.5rem] safe-x', isOfficer ? 'max-w-2xl' : header.wide ? 'max-w-[1400px]' : 'max-w-6xl')}>
            <HeaderTitle />
            <div className={cx(!isOfficer && 'lg:invisible')}><Logo faded={header.collapsed && !!header.title} /></div>
            <div className="flex items-center gap-2">
              {company && !isOfficer && <span className="hidden text-footnote font-semibold text-muted sm:block lg:hidden">{company}</span>}
              {feedOn && <EverydayButton to={`${user.role === 'officer' ? '/officer' : `/${user.role}`}/everyday`} unread={badges.everyday} />}
              <NotificationBell />
              {isOfficer && <span className="hidden sm:block"><Button variant="secondary" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button></span>}
            </div>
          </div>
        </header>
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
                ? <span className={cx('-mt-5 grid h-14 w-14 place-items-center rounded-full bg-blue text-white shadow-[0_8px_20px_-6px_rgba(10,108,255,.8)] ring-4 ring-bg', isActive(it) && 'anim-pop')}><it.icon size={24} /></span>
                : <span className={cx(isActive(it) && 'anim-pop')}><it.icon size={24} /></span>}
              <span className={cx(it.primary && 'mt-0.5')}>{it.label}</span>
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
        <div className="grid grid-cols-3 gap-2">
          {extra.map((it) => (
            <NavLink key={it.to} to={it.to} className={cx('pressable flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-footnote font-semibold', isActive(it) ? 'bg-blue-soft text-blue' : 'bg-bg')}>
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-surface text-blue shadow-tile"><it.icon size={20} /><Badge n={badges[it.badge]} className="absolute -right-2 -top-1.5" /></span>{it.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-bg p-3">
          <Avatar name={user.name} size={36} />
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{user.name}</div><div className="text-footnote text-muted">{ROLE_LABEL[user.role]}</div></div>
          <Button variant="secondary" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button>
        </div>
      </Sheet>
    </div>
  );
}
