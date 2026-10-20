import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, MoreHorizontal, Newspaper } from 'lucide-react';
import { api } from '../api.js';
import { portalLink, useAuth } from '../auth.jsx';
import { Avatar, Button, cx, relative, Sheet, useApi } from '../ui/index.jsx';
import { NAV, ROLE_LABEL } from './nav.js';

export function Logo({ compact }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 512 512" className="h-8 w-8 shrink-0" aria-hidden><rect width="512" height="512" rx="120" fill="#0A6CFF" /><circle cx="256" cy="256" r="132" fill="none" stroke="#fff" strokeWidth="44" /><circle cx="256" cy="256" r="40" fill="#fff" /></svg>
      {!compact && <span className="display text-[19px] font-bold tracking-tight">Orb <span className="text-muted font-semibold">Security</span></span>}
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
      <button type="button" onClick={() => setOpen(true)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative grid h-10 w-10 place-items-center rounded-full bg-surface text-ink shadow-tile transition active:scale-95">
        <Bell size={19} />
        {unread > 0 && <span className={cx('absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[11px] font-bold leading-[18px] text-white', count.data?.critical ? 'bg-red' : 'bg-blue')}>{unread > 99 ? '99+' : unread}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Notifications"
        footer={unread > 0 && <Button variant="ghost" onClick={async () => { await api('notifications.markRead', {}); count.reload(); list.reload(); }}>Mark all as read</Button>}>
        {list.loading && !list.data ? <div className="py-10 text-center text-muted">Loading…</div> : !list.data?.items.length ? <div className="py-10 text-center text-muted">You are all caught up.</div> : (
          <div className="-mx-2 divide-y divide-line">
            {list.data.items.map((n) => (
              <button key={n.id} type="button" onClick={() => openItem(n)} className="flex w-full gap-3 rounded-xl px-2 py-3 text-left hover:bg-bg">
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : n.severity === 'critical' ? 'bg-red' : n.severity === 'warning' ? 'bg-amber' : 'bg-blue')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{n.title}</span>
                  {n.body && <span className="block text-[14px] text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-[12px] text-faint">{relative(n.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}

// Everyday shortcut with a count of posts since the person last looked
function EverydayButton({ to, unread }) {
  return (
    <NavLink to={to} aria-label={`Everyday${unread ? `, ${unread} new posts` : ''}`}
      className={({ isActive }) => cx('relative grid h-10 w-10 place-items-center rounded-full shadow-tile transition active:scale-95', isActive ? 'bg-blue text-white' : 'bg-surface text-ink')}>
      <Newspaper size={19} />
      {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-blue px-1 text-center text-[11px] font-bold leading-[18px] text-white ring-2 ring-bg">{unread > 99 ? '99+' : unread}</span>}
    </NavLink>
  );
}

// Count badge for a nav item (Ops AI inbox)
const Badge = ({ n, className }) => (n > 0 ? <span className={cx('rounded-full bg-blue px-1.5 text-[11px] font-bold leading-[18px] text-white', className)}>{n > 99 ? '99+' : n}</span> : null);

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
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar (managers) */}
      {!isOfficer && (
        <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-line/70 bg-surface/70 px-3 py-5 backdrop-blur-xl lg:flex">
          <div className="px-3 pb-6"><Logo /></div>
          <nav className="flex-1 space-y-5 overflow-y-auto no-scrollbar">
            {groups.map((g, i) => (
              <div key={i}>
                {g.title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.title}</div>}
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end}
                    className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-semibold transition', isActive ? 'bg-blue-soft text-blue' : 'text-ink/75 hover:bg-bg hover:text-ink')}>
                    <it.icon size={18} strokeWidth={2} /><span className="flex-1">{it.label}</span><Badge n={badges[it.badge]} />
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-bg p-3">
            <Avatar name={user.name} size={36} />
            <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold">{user.name}</div><div className="truncate text-[12px] text-muted">{ROLE_LABEL[user.role]}</div></div>
            <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-black/5"><LogOut size={16} /></button>
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header className={cx('sticky top-0 z-30 border-b border-line/50 bg-bg/80 backdrop-blur-xl safe-t', !isOfficer && 'lg:border-0 lg:bg-transparent lg:backdrop-blur-none')}>
          <div className={cx('mx-auto flex h-14 items-center justify-between px-4 sm:px-6', isOfficer ? 'max-w-2xl' : 'max-w-[1400px]')}>
            <div className={cx(!isOfficer && 'lg:invisible')}><Logo compact={false} /></div>
            <div className="flex items-center gap-2">
              {company && !isOfficer && <span className="hidden text-[13px] font-semibold text-muted sm:block lg:hidden">{company}</span>}
              {feedOn && <EverydayButton to={`${user.role === 'officer' ? '/officer' : `/${user.role}`}/everyday`} unread={badges.everyday} />}
              <NotificationBell />
              {isOfficer && <span className="hidden sm:block"><Button variant="secondary" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button></span>}
            </div>
          </div>
        </header>
        <main className={cx(isOfficer && 'mx-auto max-w-2xl')}><Outlet /></main>
      </div>

      {/* Mobile tab bar (and officer tab bar on all sizes) */}
      <nav className={cx('fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/85 backdrop-blur-xl safe-b', !isOfficer && 'lg:hidden')}>
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2">
          {tabs.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx('flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-semibold transition', isActive ? 'text-blue' : 'text-faint')}>
              {it.primary
                ? <span className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-blue text-white shadow-[0_8px_20px_-6px_rgba(10,108,255,.8)] ring-4 ring-bg"><it.icon size={24} /></span>
                : <it.icon size={23} strokeWidth={2} />}
              <span className={cx(it.primary && 'mt-0.5')}>{it.label}</span>
            </NavLink>
          ))}
          {extra.length > 0 && (
            <button type="button" onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-semibold text-faint">
              <span className="relative"><MoreHorizontal size={23} /><Badge n={extra.reduce((a, it) => a + (badges[it.badge] || 0), 0)} className="absolute -right-3 -top-1" /></span>More
            </button>
          )}
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="More">
        <div className="grid grid-cols-3 gap-2">
          {extra.map((it) => (
            <NavLink key={it.to} to={it.to} className="flex flex-col items-center gap-2 rounded-2xl bg-bg px-2 py-4 text-center text-[13px] font-semibold">
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-surface text-blue shadow-tile"><it.icon size={21} /><Badge n={badges[it.badge]} className="absolute -right-2 -top-1.5" /></span>{it.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-bg p-3">
          <Avatar name={user.name} size={36} />
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{user.name}</div><div className="text-[13px] text-muted">{ROLE_LABEL[user.role]}</div></div>
          <Button variant="secondary" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button>
        </div>
      </Sheet>
    </div>
  );
}
