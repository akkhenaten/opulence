import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Bell, BellOff, Briefcase, ChevronRight, ExternalLink, Globe, LogOut, MessagesSquare, MoreHorizontal, Newspaper, Pin } from 'lucide-react';
import { api } from '../api.js';
import { startRealtime, useRealtime, useRealtimeConnected } from '../realtime.js';
import { HOME, portalLink, useAuth } from '../auth.jsx';
import { VenueChip } from '../venue.jsx';
import { Avatar, Button, cx, Empty, IconButton, Pressable, relative, Sheet, SkeletonPage, SkeletonRows, useApi, useBump, usePageHeader, useScrollMemory } from '../ui/index.jsx';
import { NAV, ROLE_LABEL } from './nav.js';
import { HubCtx, hubTabs } from '../ui/hub.jsx';
import { OWN_CHROME, useAppStyle } from '../ui/style.js';
import { motionFor } from './navMotion.js';
import { SideSwitch } from './SideSwitch.jsx';
import { AccountSheet } from './AccountSheet.jsx';
import AskOrb from '../ui/AskOrb.jsx';
import OrbFab from '../ui/OrbFab.jsx';
import ShiftBar from './ShiftBar.jsx';
import { WhatsNewSplash } from '../pages/people/_whatsnew.jsx';
import { OfflineBanner, UpdateBanner } from '../ui/pwa.jsx';
import { syncPush } from '../pages/officer/_notify.jsx';
import { AppFeedbackSheet, FeedbackChip, FeedbackIcon } from '../ui/AppFeedback.jsx';

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
      <img src={`/app/brand/logo-${light ? 'gold' : 'ink'}-192.png`} alt={compact ? brand.name : ''} className={cx('w-auto shrink-0', size.mark, fade)} />
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

  // The red count on the installed app's icon follows the bell
  useEffect(() => {
    if (!count.data) return;
    try { (unread ? navigator.setAppBadge?.(unread) : navigator.clearAppBadge?.())?.catch?.(() => {}); } catch { /* no badge support */ }
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

// The public website, opened in a new tab (top bar on desktop, More menu and account on phones)
export const WEBSITE = { href: '/', target: '_blank', rel: 'noopener' };

// The company's logo in silver: opens the public website in a new tab. A globe stands in if the logo can't load.
function WebsiteButton() {
  const { brand } = useAuth();
  const [ok, setOk] = useState(true);
  return (
    <a {...WEBSITE} aria-label={`Open the ${brand.name} website`} title="Open the website"
      className="pressable silver-btn relative grid h-10 w-10 shrink-0 before:absolute before:-inset-0.5 place-items-center rounded-full shadow-tile ring-1 ring-white/15">
      {ok ? <span className="silver-mark" aria-hidden="true" /> : <Globe size={20} className="text-white/80" aria-hidden="true" />}
      <img src="/app/brand/logo-white-192.png" alt="" hidden onError={() => setOk(false)} />
    </a>
  );
}

// Everyday shortcut with a count of posts since the person last looked
function EverydayButton({ to, unread }) {
  const { pathname, search } = useLocation();
  return <IconButton icon={Newspaper} tone="solid" to={to} active={pathname + search === to} badge={unread} label={`Everyday${unread ? `, ${unread} new posts` : ''}`} />;
}

// Compact page title in the top bar, shown once the large title has scrolled away
function HeaderTitle({ wide }) {
  const { title, collapsed } = usePageHeader();
  return (
    <div aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 top-0 flex h-14 items-center justify-start pl-[calc(var(--px)+env(safe-area-inset-left))] transition-[opacity,transform] duration-[var(--dur-2)] ease-ios', wide ? 'pr-[13rem]' : 'pr-[7rem] lg:pr-[13rem]', collapsed && title ? 'opacity-100' : 'translate-y-1 opacity-0')}>
      <span className="truncate text-headline font-semibold">{title}</span>
    </div>
  );
}

// Sidebar links: gold text on the active one; its pill and gold bar glide between links (nav-pill). Help sits outside the
// list and keeps its own pill.
const NAV_ITEM = 'pressable group relative flex min-h-9 items-center gap-3 rounded-xl px-3 py-1.5 text-subhead font-semibold';
const NAV_PILL = 'bg-blue-soft before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-[var(--accent-fill)]';
const NAV_ON = 'text-blue';
const NAV_ON_STATIC = cx('text-blue', NAV_PILL);
const NAV_OFF = 'text-ink/70 hover:bg-fill hover:text-ink';

// Rows in the phone More menu
const MORE_ROW = 'pressable flex min-h-[52px] items-center gap-3 rounded-xl px-3 text-body font-semibold';
const MORE_ICON = 'ui-raised-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg text-blue';

// Count badge for a nav item (Orb inbox)
// pops when the number changes
function Badge({ n, className }) {
  const bump = useBump(n);
  return n > 0 ? <span className={cx('rounded-full bg-blue px-1.5 text-caption2 font-bold leading-[18px] text-white', bump && 'badge-bump', className)}>{n > 99 ? '99+' : n}</span> : null;
}

// A small label on a nav item (Platform: Admin)
const Tag = ({ t }) => (t ? <span className="rounded-md bg-gold/15 px-1.5 text-caption2 font-bold uppercase leading-[18px] tracking-wide text-gold">{t}</span> : null);

// Desktop sidebar: pinned open (remembered per browser), or a 72px icon strip that peeks open over the page on hover or focus
const PIN_KEY = 'orb.nav.pinned';
function useSidebar() {
  const [pinned, setPinnedState] = useState(() => { try { return localStorage.getItem(PIN_KEY) !== '0'; } catch { return true; } });
  const [peek, setPeek] = useState(false);
  const timer = useRef(null);
  const later = (v, ms) => { clearTimeout(timer.current); timer.current = setTimeout(() => setPeek(v), ms); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const setPinned = (v) => {
    setPinnedState(v);
    if (!v) { clearTimeout(timer.current); setPeek(false); }
    try { localStorage.setItem(PIN_KEY, v ? '1' : '0'); } catch { /* private mode */ }
  };
  return {
    pinned, setPinned, peek, open: pinned || peek,
    enter: () => later(true, 120), leave: () => later(false, 300), shut: () => { clearTimeout(timer.current); setPeek(false); },
  };
}

// A sidebar link: the icon with its own motion (navMotion.js), the label that fades when the strip shrinks, the badge
// as a corner dot on the icon while shrunk
function SideLink({ it, i, open, n, className, on = NAV_ON, onClick, active }) {
  return (
    <Link to={it.to} onClick={onClick} aria-label={it.label} title={open ? undefined : it.label} style={{ '--i': i }} aria-current={active ? 'page' : undefined}
      className={cx(NAV_ITEM, className, active ? on : NAV_OFF)}>
      <span className={cx('nav-ic relative grid shrink-0 place-items-center', `nav-m-${motionFor(it.icon)}`)}>
        <it.icon size={18} />
        {!open && <Badge n={n} className="absolute -right-3 -top-2.5 ring-2 ring-bg" />}
      </span>
      <span className="side-label flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap"><span className="flex-1 truncate">{it.label}</span><Tag t={it.tag} /><Badge n={n} /></span>
    </Link>
  );
}

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

// A manager who also works shifts: opening the app (or coming back to it) on the manager home while due on shift
// lands on "My shifts", the same rule as at sign-in. Checked at most every 10 minutes; never mid-task.
function useLandingCheck(user) {
  const { switchSide } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const atHome = loc.pathname === HOME[user.role] || loc.pathname === `${HOME[user.role]}/`;
  const last = useRef(0);
  useEffect(() => {
    if (!user.dual || user.role === 'officer') return undefined;
    const check = async () => {
      if (!atHome || document.visibilityState !== 'visible' || Date.now() - last.current < 600000) return;
      last.current = Date.now();
      const { side } = await api('auth.landing').catch(() => ({}));
      if (side === 'officer') { await switchSide('officer'); nav('/officer', { replace: true }); }
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [user.dual, user.role, atHome]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function Shell() {
  const { user, signOut } = useAuth();
  useLandingCheck(user);
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
  useEffect(() => { syncPush(); }, [user.id]);
  const mail = useApi('email.accounts', {}, { poll: 120000, skip: user.role !== 'company' });
  useEffect(() => { const h = () => mail.reload(); window.addEventListener('orb:email', h); return () => window.removeEventListener('orb:email', h); });
  useEffect(() => { const h = () => opsCount.reload(); window.addEventListener('orb:ops', h); return () => window.removeEventListener('orb:ops', h); });
  // App feedback: whether the button shows, and the platform admin's count of new items
  const fb = useApi('appFeedback.status', {}, { poll: 120000 });
  useEffect(() => { const h = () => fb.reload(); window.addEventListener('orb:feedback-status', h); return () => window.removeEventListener('orb:feedback-status', h); });
  const fbOn = !!fb.data?.on;
  const badges = { ops: opsCount.data?.n || 0, everyday: feed.data?.unread || 0, messages: msgs.data?.unread || 0, email: (mail.data?.accounts || []).reduce((n, a) => n + (a.unread || 0), 0), platform: fb.data?.new || 0 };
  badges.inbox = badges.messages + badges.email;
  const chatBadge = badges.messages + (user.role === 'officer' && feedOn ? badges.everyday : 0);
  const loc = useLocation();
  const [more, setMore] = useState(false);
  const [account, setAccount] = useState(false);
  const [ask, setAsk] = useState(false);
  const [orbDot, setOrbDot] = useState(false);
  const side = useSidebar();
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
  const hubCtx = useMemo(() => ({ user, on }), [user, settings.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // A section item opens its first tab, and is named after it when it is the only one
  const resolve = (it) => {
    if (!it.hub) return it;
    const tabs = hubTabs(it.hub, user, on);
    return tabs.length ? { ...it, to: tabs[0].to, label: tabs.length > 1 ? it.label : tabs[0].label, tabs } : null;
  };
  const groups = NAV[user.role]
    .map((g) => ({ ...g, items: g.items.map(resolve).filter((it) => it && (!it.module || on(it.module)) && (!it.moduleAny || it.moduleAny.some(on)) && (!it.perm || user[it.perm]) && (!it.gate || settings.data?.[it.gate])) }))
    .filter((g) => g.items.length);
  const all = groups.flatMap((g) => g.items);
  const tabs = all.filter((i) => i.tab);
  const extra = all.filter((i) => !i.tab);
  // More menu on phones: the sidebar sections, without what's already in the tab bar
  const moreGroups = groups.map((g) => ({ ...g, items: g.items.filter((i) => !i.tab) })).filter((g) => g.items.length);
  const isOfficer = user.role === 'officer';
  useEffect(() => { setMore(false); setAccount(false); side.shut(); }, [loc.pathname]);
  useScrollMemory();
  const header = usePageHeader();
  // Black top bar on phones and for officers; managers on desktop keep the light see-through bar
  const narrow = useNarrow();
  // Soft, Glass and Flat draw the top bar and sidebar in their own look; Day and Night keep the black chrome
  const ownChrome = OWN_CHROME.includes(useAppStyle());
  const darkBar = (isOfficer || narrow) && !ownChrome;
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
  const isSection = all.some((i) => i.to === loc.pathname || i.tabs?.some((t) => t.to === loc.pathname));
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
      html.classList.toggle('has-orb', isMgr);
      html.style.setProperty('--sidebar-w', isOfficer ? '0px' : side.pinned ? '260px' : '72px');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => { mq.removeEventListener('change', apply); html.classList.remove('has-tabbar', 'has-sidebar', 'has-orb'); html.style.removeProperty('--sidebar-w'); };
  }, [isOfficer, isMgr, side.pinned]);
  // [ pins or unpins the sidebar (not while typing)
  const pinRef = useRef(side.setPinned);
  pinRef.current = side.setPinned;
  const pinnedNow = useRef(side.pinned);
  pinnedNow.current = side.pinned;
  useEffect(() => {
    if (isOfficer) return undefined;
    const k = (e) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || '')) return;
      pinRef.current(!pinnedNow.current);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [isOfficer]);
  // The active pill glides to the active link; the link that just became active plays its icon motion once
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const lastActive = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return undefined;
    const a = nav.querySelector('a[aria-current="page"]');
    if (!a) { pill.style.opacity = '0'; lastActive.current = null; return undefined; }
    // Measured against the list itself (each section is its own positioned box), so scrolled lists line up too
    const top = a.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    pill.style.transform = `translateY(${top}px)`;
    pill.style.height = `${a.offsetHeight}px`;
    pill.style.opacity = '1';
    let t;
    if (lastActive.current && lastActive.current !== a) {
      a.setAttribute('data-just', '');
      t = setTimeout(() => a.removeAttribute('data-just'), 700);
    }
    lastActive.current = a;
    // First placement jumps; after that it glides
    const f = requestAnimationFrame(() => pill.setAttribute('data-ready', ''));
    return () => { cancelAnimationFrame(f); clearTimeout(t); };
  }, [loc.pathname, groups.length, side.open]);
  const under = (to) => loc.pathname === to || loc.pathname.startsWith(`${to}/`);
  const isActive = (it) => (it.end ? loc.pathname === it.to : it.tabs ? it.tabs.some((t) => under(t.to)) : under(it.to));
  // Tapping the tab you're already on scrolls back to the top
  const tabTap = (it) => (e) => { if (loc.pathname === it.to) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar (managers) */}
      {!isOfficer && (
        <aside className="side-spacer sticky top-0 z-40 hidden h-dvh shrink-0 lg:block" style={{ width: side.pinned ? 260 : 72 }}
          onMouseEnter={side.pinned ? undefined : side.enter} onMouseLeave={side.pinned ? undefined : side.leave}>
          <div data-style={ownChrome ? undefined : 'control'} data-open={side.open || undefined} data-peek={(!side.pinned && side.open) || undefined}
            className="ui-sidebar side-panel absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-line px-3 py-5" style={{ width: side.open ? 260 : 72 }}
            onFocus={side.pinned ? undefined : () => side.enter()}
            onBlur={side.pinned ? undefined : (e) => { if (!e.currentTarget.contains(e.relatedTarget)) side.leave(); }}>
            <div className="pb-6 pl-1.5"><Logo place="sidebar" tone={ownChrome ? 'dark' : 'light'} compact={!side.open} /></div>
            <Pressable press onClick={() => side.setPinned(!side.pinned)} aria-pressed={side.pinned}
              aria-label={side.pinned ? 'Let the menu shrink to icons ([)' : 'Keep the menu open ([)'} title={side.pinned ? 'Let the menu shrink to icons ([)' : 'Keep the menu open ([)'}
              className={cx('side-fade absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full before:absolute before:-inset-2 hover:bg-fill hover:text-gold', side.pinned ? 'text-gold' : 'text-faint')}>
              <Pin size={14} className={cx('transition-transform duration-[var(--dur-2)] ease-ios', !side.pinned && 'rotate-45')} />
            </Pressable>
            {side.open && <div className="side-fade"><SideSwitch full className="mb-4" /></div>}
            <nav ref={navRef} className="relative flex-1 space-y-4 overflow-y-auto overflow-x-hidden no-scrollbar">
              <span ref={pillRef} aria-hidden className={cx('nav-pill pointer-events-none absolute inset-x-0 top-0 rounded-xl opacity-0', NAV_PILL)} />
              {groups.filter((g) => !g.foot).map((g, gi) => (
                <div key={gi} className="relative">
                  {g.title && (
                    <div className="relative mb-0.5 h-4 px-3">
                      <div className="side-fade truncate text-caption2 font-semibold uppercase leading-4 tracking-wider text-faint">{g.title}</div>
                      <div className={cx('absolute left-3 top-2 h-px w-6 bg-line transition-opacity duration-[var(--dur-2)]', side.open ? 'opacity-0' : 'opacity-100')} />
                    </div>
                  )}
                  {g.items.map((it, i) => <SideLink key={it.to} it={it} i={i} open={side.open} n={badges[it.badge]} onClick={tabTap(it)} active={isActive(it)} />)}
                </div>
              ))}
            </nav>
            {groups.filter((g) => g.foot).map((g, gi) => (
              <div key={gi} className="mt-2">{g.items.map((it, i) => <SideLink key={it.to} it={it} i={i} open={side.open} n={badges[it.badge]} onClick={tabTap(it)} active={isActive(it)} on={NAV_ON_STATIC} />)}</div>
            ))}
            <Pressable press onClick={() => setAccount(true)} aria-label="My account" title={side.open ? undefined : `${user.name} · My account`}
              className={cx('mt-4 flex items-center gap-3 rounded-2xl bg-fill hover:bg-fill-strong transition-[padding] duration-[var(--dur-3)] ease-ios', side.open ? 'p-3' : 'p-1.5')}>
              <Avatar name={user.name} src={[user.photo_thumb_url, user.photo_url]} size={side.open ? 36 : 32} />
              <div className="side-label min-w-0 flex-1"><div className="truncate text-subhead font-semibold">{user.name}</div><div className="truncate text-caption text-muted">{ROLE_LABEL[user.role]}</div></div>
              <ChevronRight size={18} className="side-fade shrink-0 text-faint" />
            </Pressable>
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header data-style={darkBar ? 'control' : undefined} className={cx('ui-topbar sticky top-0 z-30 border-b border-line/50 bg-bg/80 backdrop-blur-xl safe-t', !isOfficer && !scrolled && 'lg:border-transparent lg:bg-transparent lg:backdrop-blur-none', 'transition-[background-color,border-color] duration-200')}>
          <div className={cx('relative mx-auto flex h-14 items-center justify-between [--px:1rem] sm:[--px:1.5rem] safe-x', isOfficer ? 'max-w-2xl' : header.wide ? 'max-w-[1400px]' : 'max-w-6xl')}>
            <HeaderTitle wide={isOfficer} />
            <div className={cx('flex min-w-0', !isOfficer && 'lg:invisible')}><Logo tone={darkBar ? 'light' : 'dark'} faded={header.collapsed && !!header.title} /></div>
            <div className="flex items-center gap-2">
              {/* Phones: managers reach the website from More and Everyday from the Dashboard tab */}
              {!isOfficer && <span className="hidden lg:block"><WebsiteButton /></span>}
              {/* Officers find Everyday as a tab of Messages */}
              {feedOn && !isOfficer && <span className="hidden lg:block"><EverydayButton to={`/${user.role}?tab=everyday`} unread={badges.everyday} /></span>}
              {user.role !== 'venue' && (
                <span className={cx(!isOfficer && 'lg:hidden')}>
                  <IconButton icon={MessagesSquare} tone="solid" to={`/${user.role}/messages`} active={loc.pathname.startsWith(`/${user.role}/messages`) || (isOfficer && onFeed)} badge={chatBadge} label={`Messages${chatBadge ? `, ${chatBadge} unread` : ''}`} />
                </span>
              )}
              {user.role === 'venue' && <VenueChip />}
              {fbOn && <><FeedbackChip /><FeedbackIcon /></>}
              <NotificationBell />
              {isOfficer && user.dual && <ManagerButton />}
              {isOfficer && <span className="hidden sm:block"><Button variant="secondary" size="sm" icon={LogOut} onClick={signOut}>Sign out</Button></span>}
            </div>
          </div>
        </header>
        <OfflineBanner />
        <UpdateBanner />
        <main className={cx(isOfficer && 'mx-auto max-w-2xl')}>
          <Suspense fallback={<SkeletonPage />}>
            <HubCtx.Provider value={hubCtx}><div key={loc.pathname} className={pageAnim}><Outlet /></div></HubCtx.Provider>
          </Suspense>
        </main>
      </div>

      {(isOfficer || user.dual) && <ShiftBar />}
      {/* Mobile tab bar (and officer tab bar on all sizes) */}
      <nav aria-label="Main" className={cx('ui-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/85 backdrop-blur-xl safe-b safe-x', !isOfficer && 'lg:hidden')}>
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2">
          {tabs.map((it) => (
            <Link key={it.to} to={it.to} onClick={tabTap(it)} aria-current={isActive(it) ? 'page' : undefined}
              className={cx('pressable flex min-h-[54px] flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-caption2 font-semibold', isActive(it) ? 'text-blue' : 'text-faint')}>
              {it.primary
                ? <span className={cx('ui-tab-primary -mt-5 grid h-14 w-14 place-items-center rounded-full bg-blue text-white shadow-[0_8px_20px_-6px_color-mix(in_srgb,var(--accent-fill,var(--color-blue))_80%,transparent)] ring-4 ring-bg', isActive(it) && 'anim-pop')}><it.icon size={24} /></span>
                : <span className={cx('grid h-7 place-items-center rounded-full px-4 transition-colors duration-[var(--dur-2)]', isActive(it) && 'ui-tab-pill anim-pop bg-blue-soft')}><it.icon size={24} /></span>}
              <span className={cx(it.primary && 'mt-0.5')}>{it.short || it.label}</span>
            </Link>
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
        <div className="-mx-2 space-y-4">
          {moreGroups.map((g, i) => (
            <div key={i}>
              {g.title && <div className="mb-1 px-3 text-caption2 font-semibold uppercase tracking-wider text-faint">{g.title}</div>}
              {g.items.map((it) => (
                <Link key={it.to} to={it.to} className={cx(MORE_ROW, isActive(it) ? 'bg-blue-soft text-blue' : 'text-ink')}>
                  <span className={MORE_ICON}><it.icon size={20} /></span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span><Tag t={it.tag} /><Badge n={badges[it.badge]} /><ChevronRight size={18} className="text-faint" />
                </Link>
              ))}
            </div>
          ))}
          <div className="border-t border-line pt-3">
            <a {...WEBSITE} className={cx(MORE_ROW, 'text-ink')}>
              <span className={MORE_ICON}><Globe size={20} /></span><span className="flex-1">Our website</span><ExternalLink size={16} className="text-faint" />
            </a>
          </div>
        </div>
        <Pressable press onClick={() => { setMore(false); setAccount(true); }} className="mt-4 flex items-center gap-3 rounded-2xl bg-bg p-3">
          <Avatar name={user.name} src={[user.photo_thumb_url, user.photo_url]} size={36} />
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{user.name}</div><div className="text-footnote text-muted">My account · {ROLE_LABEL[user.role]}</div></div>
          <ChevronRight size={18} className="text-faint" />
        </Pressable>
      </Sheet>
      {!isOfficer && <AccountSheet open={account} onClose={() => setAccount(false)} feedback={fbOn} emergency={!!settings.data?.emergency_visible} />}
      <AppFeedbackSheet />
      {isMgr && <WhatsNewSplash user={user} />}
      {isMgr && <OrbFab onClick={() => setAsk(true)} hidden={ask} dot={orbDot} />}
      {isMgr && <AskOrb open={ask} onClose={() => setAsk(false)} onDot={setOrbDot} />}
    </div>
  );
}
