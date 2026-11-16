import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock, Copy, Crown, FilePen, Hand, LogOut, NotebookPen, Plus, Printer, Repeat, Rows2, Rows4, Send, Trash2, UserMinus, UserPlus, UserRound, UserX, X,
} from 'lucide-react';
import {
  ActionBar, addDays, AssignPill, Avatar, Button, Chip, confirmState, cx, dateShort, dayLabel, Dot, Empty, ErrorBox, IconButton, Input, isoDate, KV, List, Load, mondayOf, MoreMenu, Page, Pill, Pressable, range, Row, Segmented, Select, Sheet, Spinner, Textarea, ToolField, ToolMenu, time, titleCase, Toggle, useAction, useApi, useConfirm, useForm, useMedia, useToast, useUrlState, nameMatches, displayName,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Check as Tick, WEEKDAYS, durationH, londonIso, londonParts, shiftTimes, useBase } from './_parts.jsx';
import { PackPill } from '../shared/PackPaper.jsx';
import { ClockOutSheet } from '../shared/_clockOut.jsx';
import { useRotaCounts } from './_rotaCounts.js';
import { ChangeRequest, LABEL, RequestForm, statusOf } from './_cover.jsx';
import { CoverList, Detail as RequestDetail } from '../venue/_requests.jsx';
import { ShiftBody } from '../shift/ShiftView.jsx';
import { useVenue } from '../../venue.jsx';

const dayOf = (iso) => londonParts(iso).date;
const ACTIVE = ['assigned', 'accepted'];
const VIEWS = [{ value: 'venues', label: 'By venue', icon: Building2 }, { value: 'days', label: 'By day', icon: CalendarDays }, { value: 'officers', label: 'By officer', icon: UserRound }];

// Quick filters above the grid; more than one shows shifts matching any of them
const FILTERS = [
  { key: 'unfilled', label: 'Unfilled', tone: 'red', icon: UserX, test: (s) => places(s) > 0 },
  { key: 'drafts', label: 'Drafts', tone: 'grey', icon: FilePen, test: (s) => s.status === 'draft' },
  { key: 'unconfirmed', label: 'Unconfirmed', tone: 'amber', icon: CircleHelp, test: (s) => shiftState(s) === 'unconfirmed' },
  { key: 'requests', label: 'Requests', tone: 'amber', icon: Hand, test: (s) => s.assignments.some((a) => a.status === 'requested') },
];

// Comfortable or compact cards, remembered on this device
const DENSITY_KEY = 'rota.density';
function useDensity() {
  const [d, setD] = useState(() => { try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; } });
  const set = (v) => { setD(v); try { localStorage.setItem(DENSITY_KEY, v); } catch { /* private browsing */ } };
  return [d, set];
}

export default function Rota() {
  // Venue managers get the same rota, narrowed to their venues: published shifts, their staff requests, and no rota editing
  const { user } = useAuth();
  const isVenue = user?.role === 'venue';
  const vctx = useVenue();
  const filters = isVenue ? FILTERS.filter((f) => !['drafts', 'requests'].includes(f.key)) : FILTERS;
  const views = isVenue ? VIEWS.filter((v) => v.value !== 'officers') : VIEWS;
  // Tab, open shift, week, venue, view and filters live in the address, so Back and shared links land on the same view
  const thisWeek = mondayOf(isoDate());
  const [url, setUrl] = useUrlState({ tab: 'rota', shift: '', assign: '', week: thisWeek, day: '', venue: '', view: 'venues', f: '', empty: '1' });
  const tab = url.tab === 'requests' ? 'requests' : 'rota';
  const openId = url.shift || null;
  const setOpenId = (id) => setUrl({ shift: id || '', assign: '' });
  const week = /^\d{4}-\d{2}-\d{2}$/.test(url.week) ? mondayOf(url.week) : thisWeek;
  const setWeek = (w) => setUrl({ week: w, day: '' });
  // A venue's pick is the same one as the top-bar chip and the home tiles
  const venueId = isVenue ? vctx.venueId : url.venue;
  const setVenue = (id) => (isVenue ? vctx.setVenueId(id) : setUrl({ venue: id }));
  const view = views.some((v) => v.value === url.view) ? url.view : 'venues';
  const on = (url.f || '').split(',').filter((k) => filters.some((f) => f.key === k));
  const toggleFilter = (k) => setUrl({ f: (on.includes(k) ? on.filter((x) => x !== k) : [...on, k]).join(',') });
  const hideEmpty = url.empty !== '0';
  const [density, setDensity] = useDensity();
  const wide = useMedia('(min-width: 640px)');
  const [form, setForm] = useState(null); // { shift? , date? , repeat? }
  const [ask, setAsk] = useState(null); // venue: { draft } for a new staff request
  const [change, setChange] = useState(null); // venue: the request dates being changed
  const [req, setReq] = useState(null); // venue: a request opened from the Requests tab

  const venuesQ = useApi('venues.list', {}, { skip: isVenue });
  const venueList = useMemo(() => (isVenue ? vctx.venues.map((v) => ({ ...v, active: true })) : venuesQ.data || []), [isVenue, vctx.venues, venuesQ.data]);
  const roles = useApi('roles.list', {});
  const reqs = useApi('shifts.pendingRequests', {}, { skip: isVenue });
  const cover = useApi('cover.list', {}, { skip: !isVenue, poll: 60000 });
  const tabCounts = useRotaCounts(isVenue ? { cover, venue: true } : { reqs });
  const body = useMemo(() => ({ from: londonIso(week), to: londonIso(addDays(week, 7)), ...(venueId ? { venue_id: venueId } : {}) }), [week, venueId]);
  const shifts = useApi('shifts.list', body, isVenue ? { poll: 60000 } : undefined);
  const [run, busy] = useAction();
  const confirm = useConfirm();

  const roleName = (code) => roles.data?.find((r) => r.code === code)?.name || titleCase(code);
  // A venue's own requests, narrowed by its venue pick; a shift booked from one says when a change to it is waiting
  const coverQ = useMemo(() => ({ ...cover, data: cover.data && cover.data.filter((c) => !venueId || c.venue_id === venueId) }), [cover, venueId]);
  const coverById = useMemo(() => new Map((cover.data || []).map((c) => [c.id, c])), [cover.data]);
  const rows = useMemo(() => (shifts.data || []).map((s) => (isVenue && s.cover_request_id ? { ...s, change_waiting: coverById.get(s.cover_request_id)?.change_status === 'pending' } : s)), [shifts.data, coverById, isVenue]);
  const shown = useMemo(() => (on.length ? rows.filter((s) => filters.some((f) => on.includes(f.key) && f.test(s))) : rows), [rows, url.f]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = Object.fromEntries(filters.map((f) => [f.key, rows.filter(f.test).length]));
  // Requests not on the rota yet (waiting for a reply, or booked but not published) sit in their day as dashed cards
  const requests = useMemo(() => {
    if (!isVenue) return undefined;
    const onRota = new Set(rows.map((s) => s.cover_request_id).filter(Boolean));
    return (coverQ.data || []).filter((c) => ['pending', 'accepted'].includes(c.status) && !onRota.has(c.id));
  }, [isVenue, rows, coverQ.data]);
  const drafts = rows.filter((s) => s.status === 'draft');
  const hiddenDrafts = drafts.length - shown.filter((s) => s.status === 'draft').length;
  const reload = () => { shifts.reload(); if (isVenue) cover.reload(); else reqs.reload(); };
  const today = isoDate();
  const askFor = (date, vid) => setAsk({ draft: { date: date && date >= today ? date : undefined, venue_id: vid || venueId || undefined, quiet: true } });
  const onAdd = isVenue ? askFor : (date, vid) => setForm({ date, venue_id: vid });

  // A message turned into a request arrives with a draft to check; "Request staff" from the overview opens the form
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    if (!isVenue) return;
    if (loc.state?.draft) { setAsk({ draft: loc.state.draft }); nav(loc.pathname + loc.search, { replace: true, state: null }); }
  }, [loc.state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isVenue || !new URLSearchParams(loc.search).get('new')) return;
    setAsk({ draft: { quiet: true } });
    const n = new URLSearchParams(loc.search); n.delete('new');
    nav({ pathname: loc.pathname, search: n.toString() ? `?${n}` : '' }, { replace: true });
  }, [loc.search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Venues in the grid: with a filter on, or "Hide empty venues", only the ones with shifts showing
  const activeVenues = venueList.filter((v) => v.active && (!venueId || v.id === venueId));
  const gridVenues = hideEmpty || on.length ? activeVenues.filter((v) => shown.some((s) => s.venue_id === v.id)) : orderVenues(shown, activeVenues);
  // The shifts in the order they sit on screen, so ‹ › in the drawer walks the board
  const order = view === 'venues'
    ? gridVenues.flatMap((v) => DAYS(week).flatMap((d) => cellShifts(shown, d, v.id)))
    : DAYS(week).flatMap((d) => cellShifts(shown, d));
  const at = order.findIndex((s) => String(s.id) === String(openId));
  const step = (i) => (at >= 0 && order[i] ? () => setOpenId(order[i].id) : undefined);

  const publish = async () => {
    if (!(await confirm({ title: `Publish ${drafts.length} draft shift${drafts.length > 1 ? 's' : ''}?`, body: `Assigned officers are notified, and open shifts are offered to officers.${hiddenDrafts ? ` This includes ${hiddenDrafts} hidden by your filters.` : ''}`, confirm: 'Publish' }))) return;
    run(() => api('shifts.publish', { ids: drafts.map((s) => s.id) }), (r) => `${r.published} published`).then(reload).catch(() => {});
  };
  const copyWeek = async () => {
    const from = addDays(week, -7);
    if (!(await confirm({ title: 'Copy last week?', body: `Copies all shifts from the week of ${dateShort(from)} into this week as drafts${venueId ? ' (this venue only)' : ''}. Officers are not copied.`, confirm: 'Copy shifts' }))) return;
    run(() => api('shifts.copyWeek', { from_week: from, to_week: week, ...(venueId ? { venue_id: venueId } : {}) }), (r) => `${r.created} shifts copied`).then(reload).catch(() => {});
  };

  const weekLabel = `${dateShort(week)} – ${dateShort(addDays(week, 6))}`;
  const isThisWeek = week === thisWeek;
  const more = [
    { label: 'Repeat shift…', icon: Repeat, hint: 'Same times on several days or weeks', onClick: () => setForm({ repeat: true }) },
    { label: 'Copy last week', icon: Copy, hint: 'All of last week\'s shifts as drafts', onClick: copyWeek, busy },
    { label: 'Print this week', icon: Printer, onClick: () => window.print() },
  ];
  const pubItem = drafts.length > 0 && { label: `Publish ${drafts.length}`, icon: Send, hint: hiddenDrafts ? `${hiddenDrafts} hidden by filters` : 'Send the drafts to officers', onClick: publish, busy };

  // The week sits beside the title; view, venue and the display switches sit on the tab line, so the grid starts high
  const weekPicker = (
    <span className="inline-flex items-center gap-1">
      <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={() => setWeek(addDays(week, -7))} />
      <span className="num min-w-[112px] text-center text-body font-semibold text-ink">{weekLabel}</span>
      <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={() => setWeek(addDays(week, 7))} />
      {!isThisWeek && <Button variant="ghost" size="sm" onClick={() => setWeek(thisWeek)}>Today</Button>}
    </span>
  );
  const venueOptions = [{ value: '', label: isVenue ? 'All my venues' : 'All venues' }, ...venueList.filter((v) => v.active).map((v) => ({ value: v.id, label: v.name }))];
  // One venue: nothing to pick
  const pickVenue = !isVenue || vctx.many;
  const viewSwitch = <Segmented value={view} onChange={(v) => setUrl({ view: v })} options={views} />;
  const venuePick = <Select aria-label="Venue" value={venueId} onChange={(e) => setVenue(e.target.value)} options={venueOptions} />;
  const changed = (density === 'compact') + (view === 'venues' && !hideEmpty) + (!wide && pickVenue && !!venueId) + (!wide && view !== 'venues');
  const tools = tab === 'rota' && <>
    {filters.filter((f) => counts[f.key] || on.includes(f.key)).map((f) => (
      <Chip key={f.key} label={f.label} value={counts[f.key]} tone={f.tone} icon={f.icon} compact="phone" active={on.includes(f.key)} onClick={() => toggleFilter(f.key)} />
    ))}
    <div className="hidden sm:block">{viewSwitch}</div>
    {pickVenue && <div className="hidden w-44 sm:block">{venuePick}</div>}
    <ToolMenu label={wide ? 'Display' : 'Filters'} count={changed} onClear={() => { setDensity('comfortable'); setUrl({ empty: '1', ...(!wide && { view: 'venues' }) }); if (!wide) setVenue(''); }}>
      {!wide && <ToolField label="View">{viewSwitch}</ToolField>}
      {!wide && pickVenue && <ToolField label="Venue">{venuePick}</ToolField>}
      <ToolField label="Card size">
        <Segmented value={density} onChange={setDensity} options={[
          { value: 'comfortable', label: 'Comfortable', icon: Rows2 },
          { value: 'compact', label: 'Compact', icon: Rows4 },
        ]} />
      </ToolField>
      {view === 'venues' && <Toggle checked={hideEmpty} onChange={(v) => setUrl({ empty: v ? '1' : '0' })} label="Hide empty venues" />}
    </ToolMenu>
  </>;

  return (
    <Page title="Rota" subtitle={tab === 'rota' ? weekPicker : isVenue ? 'Your staff requests' : 'Officer requests for open shifts'} wide tools={tools} tabCounts={tabCounts}
      actions={isVenue ? <Button icon={Plus} onClick={() => askFor()}>Request staff</Button> : tab === 'rota' && <>
        <div className="hidden items-center gap-2 sm:flex">
          {pubItem && <Button variant="soft" icon={Send} onClick={publish} busy={busy}>Publish {drafts.length}{hiddenDrafts > 0 && <span className="font-medium opacity-75"> ({hiddenDrafts} hidden by filters)</span>}</Button>}
          <MoreMenu items={more} label="More ways to add shifts" title="Rota" />
        </div>
        <div className="sm:hidden"><MoreMenu items={[pubItem, ...more]} title="Rota" /></div>
        <Button icon={Plus} onClick={() => setForm({})}>New shift</Button>
      </>}>
      {tab === 'requests' ? (isVenue
        ? <CoverList q={coverQ} many={vctx.many && !venueId} onOpen={setReq} onNew={() => askFor()} onDone={() => cover.reload()} />
        : <Requests q={reqs} roleName={roleName} onChanged={reload} onOpen={setOpenId} />) : (
        <>
          <Load q={shifts}>{() => {
            const props = { rows: shown, all: rows, week, density, requests, onOpen: (s) => setOpenId(s.id), onRequest: setReq, onAdd, addWord: isVenue ? 'Request staff' : 'Add shift', onUnfilled: () => setUrl({ f: 'unfilled' }) };
            const none = on.length
              ? <Empty icon={CalendarDays} title="No shifts match these filters" action={<Button variant="secondary" onClick={() => setUrl({ f: '' })}>Clear filters</Button>} />
              : isVenue
                ? <Empty icon={CalendarDays} title="No shifts this week" body="Shifts show here once the security company publishes them. Need officers? Ask from here." action={<Button icon={Plus} onClick={() => askFor()}>Request staff</Button>} />
                : <Empty photo="kit" icon={CalendarDays} title="No shifts this week" action={<Button icon={Plus} onClick={() => setForm({})}>New shift</Button>} />;
            const phone = <PhoneDay {...props} venues={activeVenues} day={url.day} setDay={(d) => setUrl({ day: d })} />;
            if (view === 'officers') {
              if (!shown.length) return none;
              return <><OfficerGrid {...props} /><OfficerAgenda {...props} /></>;
            }
            if (view === 'venues') {
              if (!activeVenues.length) return <Empty icon={CalendarDays} title="No venues" />;
              // A venue's dashed requests count as something to show in its row
              const withReqs = requests ? orderVenues(shown, activeVenues).filter((v) => gridVenues.includes(v) || requests.some((c) => c.venue_id === v.id)) : gridVenues;
              return <>{withReqs.length ? <VenueGrid {...props} venues={withReqs} /> : <div className="hidden md:block">{none}</div>}{phone}</>;
            }
            return <><DayGrid {...props} />{phone}</>;
          }}</Load>
        </>
      )}

      {openId && isVenue && <VenueShiftDetail id={openId} row={rows.find((s) => String(s.id) === String(openId))} coverById={coverById} onClose={() => setOpenId(null)}
        onChange={(c) => setChange([c])} onPrev={step(at - 1)} onNext={step(at + 1)} />}
      {openId && !isVenue && <ShiftDetail id={openId} startAssign={url.assign === '1'} roleName={roleName} onClose={() => setOpenId(null)} onChanged={reload} onPrev={step(at - 1)} onNext={step(at + 1)}
        onEdit={(s) => { setOpenId(null); setForm({ shift: s }); }} />}
      {ask && <RequestForm venues={vctx.venues} roles={roles.data || []} draft={ask.draft} onClose={() => setAsk(null)} onDone={() => { setAsk(null); reload(); }} />}
      {change && <ChangeRequest edit={change} onClose={() => setChange(null)} onDone={() => { setChange(null); setOpenId(null); reload(); }} />}
      {req && <RequestDetail c={req} onClose={() => setReq(null)} onDone={() => { setReq(null); reload(); }} onAgain={(draft) => { setReq(null); setAsk({ draft }); }} />}
      {form && !isVenue && <ShiftForm init={form} venues={venueList.filter((v) => v.active)} roles={roles.data || []} onClose={() => setForm(null)}
        onSaved={(d) => { setForm(null); if (d && (d >= addDays(week, 7) || d < week)) setWeek(mondayOf(d)); reload(); }} />}
    </Page>
  );
}

/* ---------- Shared helpers ---------- */

// Venue column then seven day columns. 128 + 7 × 116 fits a 1280 laptop with the sidebar pinned; wider screens share out the rest
const COLS = 'grid-cols-[128px_repeat(7,minmax(116px,1fr))]';
const DAY_COLS = 'grid-cols-[repeat(7,minmax(116px,1fr))]';
const STICKY = 'sticky left-0 z-10 bg-surface shadow-[1px_0_0_var(--color-line)]';
const DAYS = (week) => Array.from({ length: 7 }, (_, i) => addDays(week, i));
const places = (s) => (s.status === 'cancelled' ? 0 : Math.max(0, s.headcount - s.filled));
const byTime = (a, b) => a.starts_at.localeCompare(b.starts_at);
const cellRequests = (list, d, vid) => (list || []).filter((c) => dayOf(c.starts_at) === d && (vid == null || c.venue_id === vid)).sort(byTime);
const cellShifts = (rows, d, vid) => rows.filter((s) => dayOf(s.starts_at) === d && (vid == null || s.venue_id === vid)).sort(byTime);
// Drafts have not been sent to anyone yet, so only published shifts can be waiting on confirmations
const shiftState = (s) => {
  const st = confirmState({ filled: s.filled, headcount: s.headcount, statuses: s.assignments.filter((a) => ACTIVE.includes(a.status)).map((a) => a.status) });
  return st === 'unconfirmed' && s.status !== 'published' ? 'confirmed' : st;
};
const [wdOf, dateOf] = [(d) => dayLabel(d).split(' ')[0], (d) => dayLabel(d).split(' ').slice(1).join(' ')];
// Today's column is tinted, past days step back
const cellTone = (d, today) => (d === today ? 'bg-blue-soft/40' : d < today ? 'bg-fill/30' : '');

function DayTag({ days, today }) {
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <div className={cx('w-[56px] shrink-0 pt-0.5 text-caption font-semibold uppercase leading-tight tracking-wide', days.includes(today) ? 'text-blue' : 'text-muted')}>
      <div>{days.length > 1 ? `${wdOf(first)}–${wdOf(last)}` : wdOf(first)}</div>
      {days.length === 1 && <div className="font-medium normal-case opacity-80">{dateOf(first)}</div>}
    </div>
  );
}

function useOfficerRows(rows) {
  return useMemo(() => {
    const m = new Map();
    for (const s of rows) for (const a of s.assignments) if ([...ACTIVE, 'requested'].includes(a.status)) m.set(a.officer_id, a.is_self ? `${a.name} (You)` : a.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => {
      const mine = rows.filter((s) => s.assignments.some((a) => a.officer_id === id && [...ACTIVE, 'requested'].includes(a.status)));
      const hours = mine.filter((s) => s.assignments.some((a) => a.officer_id === id && ACTIVE.includes(a.status))).reduce((n, s) => n + durationH(s.starts_at, s.ends_at), 0);
      return { id, name, mine, hours: Math.round(hours * 10) / 10 };
    });
  }, [rows]);
}

const orderVenues = (rows, venues) => {
  const ids = new Set(rows.map((s) => s.venue_id));
  return venues.filter((v) => ids.has(v.id)).concat(venues.filter((v) => !ids.has(v.id)));
};

/* ---------- Shift card ---------- */

// Who is on it, for the hover preview
const whoTitle = (s) => {
  const people = s.assignments.filter((a) => [...ACTIVE, 'requested'].includes(a.status));
  const say = (a) => (a.status === 'requested' ? 'requested' : a.status === 'accepted' ? 'confirmed' : s.status === 'published' ? 'unconfirmed' : 'draft');
  return [`${range(s.starts_at, s.ends_at)} · ${s.role_name || ''}`, ...(people.length ? people.map((a) => `${a.name} — ${say(a)}`) : ['Nobody assigned yet']),
    places(s) ? `${places(s)} place${places(s) > 1 ? 's' : ''} open` : ''].filter(Boolean).join('\n');
};

// Up to three faces then +N, and a dashed circle for each open place (then +N)
function Faces({ people, open, size = 20 }) {
  // Four circles at most, so the row fits the narrowest cell
  const gaps = Math.min(open, Math.max(1, 4 - Math.min(people.length, 3)));
  return (
    <span className="flex items-center">
      {people.slice(0, 3).map((a, i) => <Avatar key={a.id || i} name={a.name} size={size} className={cx('ring-2 ring-surface', i > 0 && '-ml-1.5')} />)}
      {people.length > 3 && <span className="num ml-1 text-caption2 font-semibold text-muted">+{people.length - 3}</span>}
      {Array.from({ length: gaps }, (_, i) => <span key={i} aria-hidden className="ml-1 inline-block shrink-0 rounded-full border-[1.5px] border-dashed border-faint" style={{ width: size, height: size }} />)}
      {open > gaps && <span className="num ml-1 text-caption2 text-faint">+{open - gaps}</span>}
    </span>
  );
}

/* Each state has a shape or word as well as a colour: short → red bar and the count, unconfirmed → amber bar and a clock,
   draft → dashed edge and "Draft". Compact is one line (time, role when it fits, count); comfortable adds role, faces and labels. */
function ShiftCard({ s, onOpen, showVenue = true, density = 'comfortable', flat }) {
  const state = shiftState(s);
  const compact = density === 'compact';
  const draft = s.status === 'draft';
  const requested = s.assignments.filter((a) => a.status === 'requested').length;
  const people = s.assignments.filter((a) => ACTIVE.includes(a.status));
  const tone = draft ? 'text-muted' : state === 'short' ? 'text-red' : state === 'unconfirmed' ? 'text-amber' : 'text-green';
  // Narrow cells drop the :00s so time and count both fit
  const short = range(s.starts_at, s.ends_at).replace(/:00/g, '');
  const clock = <Clock size={14} className="shrink-0 text-amber" aria-label="Unconfirmed" />;
  const count = (
    <span className="flex shrink-0 items-center gap-1">
      {requested > 0 && compact && <Hand size={14} className="text-amber" aria-label={`${requested} requested`} />}
      {state === 'unconfirmed' && compact && clock}
      <span className={cx('num text-caption font-bold', tone)}>{s.filled}/{s.headcount}</span>
    </span>
  );
  const { base } = useBase();
  // Desktop: a published shift's page is one click away from the card (the preview stays the default tap)
  const direct = !compact && !draft && (
    <Link to={`${base}/shifts/${s.id}`} aria-label={`Open shift page: ${s.venue_name}, ${range(s.starts_at, s.ends_at)}`} title="Open shift page"
      className="absolute bottom-1.5 right-1.5 hidden h-7 w-7 items-center justify-center rounded-lg bg-fill text-muted opacity-0 transition hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 md:flex">
      <ArrowUpRight size={16} aria-hidden />
    </Link>
  );
  return (
    <div className="group relative">
    <Pressable press onClick={() => onOpen(s)} title={whoTitle(s)}
      className={cx('@container relative block w-full overflow-hidden rounded-xl border bg-surface text-left transition hover:border-faint active:scale-[0.99]',
        compact ? 'min-h-8 py-1.5 pl-2.5 pr-2' : 'min-h-14 py-2 pl-2.5 pr-2', draft ? 'border-dashed border-faint/70' : 'border-hairline', !flat && 'shadow-tile')}>
      {s.status === 'published' && state !== 'confirmed' && <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[3px]', state === 'short' ? 'bg-red' : 'bg-amber')} />}
      {compact ? (
        <div className="flex items-center gap-1.5">
          <span className="num whitespace-nowrap text-footnote font-bold">{short}</span>
          <span className="hidden min-w-0 flex-1 truncate text-caption text-muted @[200px]:block">{s.role_name}</span>
          {draft && <span className="sr-only">Draft</span>}
          <span className="ml-auto">{count}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            <span className="num whitespace-nowrap text-footnote font-bold"><span className="@[100px]:hidden">{short}</span><span className="hidden @[100px]:inline">{range(s.starts_at, s.ends_at)}</span></span>
            <span className="ml-auto">{count}</span>
          </div>
          <div className="mt-0.5 truncate text-caption text-muted">{showVenue && <span className="font-semibold text-ink">{s.venue_name} · </span>}{s.role_name}{s.stream_name && <> · {s.stream_name}</>}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {state === 'unconfirmed' && clock}
            <Faces people={people} open={places(s)} />
            {draft && <Pill status="draft" />}
            {s.open && <Pill tone="blue">Open</Pill>}
            {requested > 0 && <Pill tone="amber">{requested} req</Pill>}
            {s.change_waiting && <Pill tone="amber">Change waiting</Pill>}
          </div>
        </>
      )}
    </Pressable>
    {direct}
    </div>
  );
}

// A venue's staff request that is not on the rota yet: dashed, with where it stands
function RequestCard({ c, onOpen, showVenue = true, density = 'comfortable' }) {
  const st = statusOf(c);
  return (
    <Pressable press onClick={() => onOpen(c)} title={`Your request · ${c.headcount} × ${c.role_name} · ${LABEL[st]}`}
      className={cx('@container block w-full rounded-xl border border-dashed border-faint/70 bg-surface/60 text-left transition hover:border-faint', density === 'compact' ? 'min-h-8 py-1.5 pl-2.5 pr-2' : 'min-h-14 py-2 pl-2.5 pr-2')}>
      <div className="flex items-center gap-1.5">
        <span className="num whitespace-nowrap text-footnote font-bold">{range(c.starts_at, c.ends_at).replace(/:00/g, '')}</span>
        <span className="num ml-auto shrink-0 text-caption font-bold text-muted">{c.headcount}×</span>
      </div>
      {density !== 'compact' && <>
        <div className="mt-0.5 truncate text-caption text-muted">{showVenue && <span className="font-semibold text-ink">{c.venue_name} · </span>}Request · {c.role_name}</div>
        <div className="mt-1.5 flex flex-wrap gap-1"><Pill status={st}>{LABEL[st]}</Pill>{c.change_status === 'pending' && <Pill tone="amber">Change waiting</Pill>}</div>
      </>}
    </Pressable>
  );
}

function OfficerChip({ s, oid, onOpen }) {
  const a = s.assignments.find((x) => x.officer_id === oid);
  return (
    <Pressable press onClick={() => onOpen(s)} title={whoTitle(s)} className={cx('block w-full rounded-xl p-2 text-left text-caption transition hover:-translate-y-0.5', a.status === 'requested' || (a.status === 'assigned' && s.status === 'published') ? 'bg-amber-soft' : s.status === 'draft' ? 'bg-bg' : 'bg-green-soft')}>
      <div className="num whitespace-nowrap font-bold">{range(s.starts_at, s.ends_at)}</div>
      <div className="truncate text-muted">{s.venue_name}</div>
      {a.status !== 'accepted' && <div className="font-semibold">{a.status === 'assigned' ? (s.status === 'published' ? 'Unconfirmed' : 'Draft') : titleCase(a.status)}</div>}
    </Pressable>
  );
}

function AddCell({ label, onClick }) {
  return (
    <Pressable press onClick={onClick} aria-label={label}
      className="w-full rounded-lg py-0.5 text-footnote font-semibold text-faint opacity-40 transition hover:bg-blue-soft hover:text-blue hover:opacity-100 group-hover:opacity-100 focus:opacity-100 print:hidden">+</Pressable>
  );
}

/* ---------- Week grids (tablet/desktop) ---------- */

/* One frame for every week grid. From 1280 the grid fits the page, so the day names stick under the top bar and the totals
   to the bottom of the window; narrower, it scrolls inside its own box with the first column kept in view. */
function GridFrame({ week, children, totals, lead = true }) {
  const today = isoDate();
  return (
    <div className="hidden max-h-[calc(100dvh-var(--header-h)-5rem)] overflow-auto rounded-tile border border-hairline bg-surface md:block xl:max-h-none xl:overflow-visible print:max-h-none print:overflow-visible">
      <div className={lead ? 'min-w-[940px]' : 'min-w-[812px]'}>
        <div className={cx('sticky top-0 z-20 grid rounded-t-tile border-b border-line bg-surface text-caption font-semibold uppercase tracking-wide xl:top-[calc(var(--header-h)+env(safe-area-inset-top))]', lead ? COLS : DAY_COLS)}>
          {lead && <div className={cx(STICKY, 'z-30 rounded-tl-tile px-3 py-2.5')} />}
          {DAYS(week).map((d) => (
            <div key={d} className={cx('whitespace-nowrap px-2 py-2.5', (lead || d !== week) && 'border-l border-line', d === today ? 'bg-blue-soft/40 text-blue' : d < today ? 'text-faint' : 'text-muted')}>
              {dayLabel(d)}{d === today && <span className="sr-only"> (today)</span>}
            </div>
          ))}
        </div>
        <div className="divide-y divide-line">{children}</div>
        {totals}
      </div>
    </div>
  );
}

// Per day: open places (tap to show only unfilled), drafts and hours booked. The whole week, whatever the filters
function TotalsRow({ rows, week, onUnfilled, lead = true }) {
  const today = isoDate();
  const sum = (list) => ({
    n: list.length,
    open: list.reduce((n, s) => n + places(s), 0),
    drafts: list.filter((s) => s.status === 'draft').length,
    hours: Math.round(list.reduce((n, s) => n + durationH(s.starts_at, s.ends_at) * Math.min(s.filled, s.headcount), 0) * 10) / 10,
  });
  const live = rows.filter((s) => s.status !== 'cancelled');
  const cell = (t) => (!t.n ? <div className="text-caption text-faint">No shifts</div> : (
    <div className="space-y-0.5 text-caption">
      {t.open > 0
        ? <Pressable press onClick={onUnfilled} className="flex items-center gap-1.5 font-semibold text-red hover:underline"><Dot tone="red" /><span><span className="num">{t.open}</span> unfilled</span></Pressable>
        : <div className="flex items-center gap-1.5 text-green"><Check size={14} aria-hidden />All filled</div>}
      {t.drafts > 0 && <div className="flex items-center gap-1.5 text-muted"><span aria-hidden className="h-2.5 w-2.5 rounded-full border border-dashed border-faint" /><span><span className="num">{t.drafts}</span> draft{t.drafts > 1 ? 's' : ''}</span></div>}
      <div className="num text-muted">{t.hours}h booked</div>
    </div>
  ));
  return (
    <div className={cx('sticky bottom-0 z-20 grid rounded-b-tile border-t border-line bg-surface', lead ? COLS : DAY_COLS)} aria-label="Totals">
      {lead && <div className={cx(STICKY, 'rounded-bl-tile px-3 py-2.5')}><div className="mb-0.5 text-caption font-semibold uppercase tracking-wide text-faint">Week</div>{cell(sum(live))}</div>}
      {DAYS(week).map((d) => (
        <div key={d} className={cx('px-2 py-2.5', (lead || d !== week) && 'border-l border-line', cellTone(d, today))}>{cell(sum(live.filter((s) => dayOf(s.starts_at) === d)))}</div>
      ))}
    </div>
  );
}

function VenueGrid({ rows, all, week, venues, density, requests, onOpen, onRequest, onAdd, addWord, onUnfilled }) {
  const today = isoDate();
  return (
    <GridFrame week={week} totals={<TotalsRow rows={all} week={week} onUnfilled={onUnfilled} />}>
      {venues.map((v) => {
        const mine = rows.filter((s) => s.venue_id === v.id);
        const open = mine.reduce((n, s) => n + places(s), 0);
        return (
          <div key={v.id} className={cx('grid', COLS)}>
            <div className={cx(STICKY, 'px-3 py-2.5')}>
              <div className="line-clamp-2 text-subhead font-semibold leading-snug">{v.name}</div>
              <div className="num mt-0.5 text-caption text-muted">{mine.length} shift{mine.length === 1 ? '' : 's'}{open > 0 && <span className="font-semibold text-red"> · {open} open</span>}</div>
            </div>
            {DAYS(week).map((d) => (
              <div key={d} className={cx('group min-w-0 space-y-1.5 border-l border-line p-1.5', cellTone(d, today))}>
                {cellShifts(mine, d).map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} showVenue={false} density={density} flat />)}
                {cellRequests(requests, d, v.id).map((c) => <RequestCard key={c.id} c={c} onOpen={onRequest} showVenue={false} density={density} />)}
                <AddCell label={`${addWord} at ${v.name}, ${dayLabel(d)}`} onClick={() => onAdd(d, v.id)} />
              </div>
            ))}
          </div>
        );
      })}
    </GridFrame>
  );
}

// By day: the whole week in one row of seven columns
function DayGrid({ rows, all, week, density, requests, onOpen, onRequest, onAdd, addWord, onUnfilled }) {
  const today = isoDate();
  return (
    <GridFrame week={week} lead={false} totals={<TotalsRow rows={all} week={week} lead={false} onUnfilled={onUnfilled} />}>
      <div className={cx('grid min-h-[240px]', DAY_COLS)}>
        {DAYS(week).map((d) => (
          <div key={d} className={cx('group min-w-0 space-y-1.5 p-1.5', d !== week && 'border-l border-line', cellTone(d, today))}>
            {cellShifts(rows, d).map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} density={density} flat />)}
            {cellRequests(requests, d).map((c) => <RequestCard key={c.id} c={c} onOpen={onRequest} density={density} />)}
            <AddCell label={`${addWord} ${dayLabel(d)}`} onClick={() => onAdd(d)} />
          </div>
        ))}
      </div>
    </GridFrame>
  );
}

function OfficerGrid({ rows, all, week, density, onOpen, onUnfilled }) {
  const today = isoDate();
  const officers = useOfficerRows(rows);
  const unfilled = rows.filter((s) => places(s) > 0);
  const days = DAYS(week);
  return (
    <GridFrame week={week} totals={<TotalsRow rows={all} week={week} onUnfilled={onUnfilled} />}>
      {unfilled.length > 0 && (
        <div className={cx('grid bg-red-soft/40', COLS)}>
          <div className={cx(STICKY, 'bg-red-soft px-3 py-3')}><div className="text-subhead font-semibold text-red">Unfilled</div><div className="num text-caption text-muted">{((n) => `${n} place${n === 1 ? '' : 's'}`)(unfilled.reduce((n, s) => n + places(s), 0))}</div></div>
          {days.map((d) => (
            <div key={d} className="min-w-0 space-y-1.5 border-l border-line p-1.5">
              {cellShifts(unfilled, d).map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} density={density} flat />)}
            </div>
          ))}
        </div>
      )}
      {officers.map((o) => (
        <div key={o.id} className={cx('grid', COLS)}>
          <div className={cx(STICKY, 'flex items-center gap-2 px-3 py-3')}><Avatar name={o.name} size={28} /><div className="min-w-0"><div className="truncate text-subhead font-semibold">{o.name}</div><div className="num text-caption text-muted">{o.hours}h</div></div></div>
          {days.map((d) => (
            <div key={d} className={cx('min-w-0 space-y-1.5 border-l border-line p-1.5', cellTone(d, today))}>
              {cellShifts(o.mine, d).map((s) => <OfficerChip key={s.id} s={s} oid={o.id} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      ))}
    </GridFrame>
  );
}

/* ---------- Phone ---------- */

/* A day at a time: a strip of the week's days (a red dot where places are open), then that day's shifts by venue,
   venues with open places first and short shifts at the top of each. */
function PhoneDay({ rows, week, venues, requests, onOpen, onRequest, onAdd, addWord, day: picked, setDay }) {
  const today = isoDate();
  const days = DAYS(week);
  // The chosen day lives in the address, so Back from a shift returns to it; a new week starts on today or its Monday
  const day = days.includes(picked) ? picked : days.includes(today) ? today : week;
  const list = cellShifts(rows, day);
  const asked = cellRequests(requests, day);
  const groups = [...new Set([...list, ...asked].map((s) => s.venue_id))].map((id) => {
    const mine = list.filter((s) => s.venue_id === id).sort((a, b) => (places(b) > 0) - (places(a) > 0) || byTime(a, b));
    const reqs = asked.filter((c) => c.venue_id === id);
    return { id, name: venues.find((v) => v.id === id)?.name || (mine[0] || reqs[0]).venue_name, list: mine, reqs, open: mine.reduce((n, s) => n + places(s), 0) };
  }).sort((a, b) => (b.open > 0) - (a.open > 0) || a.name.localeCompare(b.name));
  return (
    <div className="md:hidden">
      <div className="sticky-below-header sticky z-10 -mx-4 mb-2 grid grid-cols-7 gap-1 bg-bg/90 px-4 py-2 backdrop-blur" role="tablist" aria-label="Day of the week">
        {days.map((d) => {
          const ds = cellShifts(rows, d);
          const open = ds.reduce((n, s) => n + places(s), 0);
          return (
            <Pressable key={d} press role="tab" aria-selected={d === day} onClick={() => setDay(d)}
              aria-label={`${dayLabel(d)}: ${ds.length} shift${ds.length === 1 ? '' : 's'}${open ? `, ${open} unfilled` : ''}`}
              className={cx('flex min-h-[54px] flex-col items-center justify-center rounded-xl', d === day ? 'bg-blue text-white' : d === today ? 'bg-blue-soft text-blue' : 'bg-surface text-ink shadow-tile')}>
              <span className="text-caption2 font-semibold uppercase opacity-80">{wdOf(d).slice(0, 3)}</span>
              <span className="num text-callout font-bold leading-tight">{Number(d.slice(8))}</span>
              <span aria-hidden className={cx('mt-0.5 h-1.5 w-1.5 rounded-full', open ? 'bg-red' : 'bg-transparent', open && d === day && 'ring-2 ring-white')} />
            </Pressable>
          );
        })}
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className={cx('text-footnote font-semibold uppercase tracking-wide', day === today ? 'text-blue' : 'text-muted')}>{dayLabel(day)}{day === today ? ' · Today' : ''}</span>
        <Pressable press onClick={() => onAdd(day)} className="-my-2 px-1 py-2 text-footnote font-semibold text-blue" aria-label={`${addWord} ${dayLabel(day)}`}>+ {addWord === 'Add shift' ? 'Add' : 'Request'}</Pressable>
      </div>
      {!groups.length
        ? <Pressable press onClick={() => onAdd(day)} className="block w-full rounded-2xl border border-dashed border-line px-4 py-6 text-center text-footnote text-faint">No shifts · <span className="font-semibold text-blue">{addWord === 'Add shift' ? 'Add one' : 'Request staff'}</span></Pressable>
        : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
                  <span className="truncate text-subhead font-semibold">{g.name}</span>
                  {g.open > 0 && <span className="num shrink-0 text-caption font-semibold text-red">{g.open} unfilled</span>}
                </div>
                <div className="space-y-2">
                  {g.list.map((s) => <ShiftCard key={s.id} s={s} onOpen={onOpen} showVenue={false} />)}
                  {g.reqs.map((c) => <RequestCard key={c.id} c={c} onOpen={onRequest} showVenue={false} />)}
                </div>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}

function OfficerAgenda({ rows, onOpen }) {
  const today = isoDate();
  const officers = useOfficerRows(rows);
  const unfilled = rows.filter((s) => places(s) > 0);
  const open = unfilled.reduce((n, s) => n + places(s), 0);
  return (
    <div className="space-y-3 md:hidden">
      {unfilled.length > 0 && (
        <section className="rounded-tile bg-red-soft/70 p-4">
          <div className="mb-3 flex items-baseline justify-between"><span className="text-headline font-semibold text-red">Unfilled</span><span className="num text-footnote text-muted">{open} place{open === 1 ? '' : 's'}</span></div>
          <div className="space-y-2">
            {unfilled.map((s) => (
              <div key={s.id} className="flex gap-3"><DayTag days={[dayOf(s.starts_at)]} today={today} /><div className="min-w-0 flex-1"><ShiftCard s={s} onOpen={onOpen} /></div></div>
            ))}
          </div>
        </section>
      )}
      {officers.map((o) => (
        <section key={o.id} className="rounded-tile border border-hairline bg-surface p-4 shadow-tile">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={o.name} size={36} />
            <div className="min-w-0"><div className="truncate text-callout font-semibold">{o.name}</div><div className="num text-footnote text-muted">{o.hours}h this week · {o.mine.length} shift{o.mine.length === 1 ? '' : 's'}</div></div>
          </div>
          <div className="space-y-2">
            {o.mine.map((s) => (
              <div key={s.id} className="flex items-start gap-3"><DayTag days={[dayOf(s.starts_at)]} today={today} /><div className="min-w-0 flex-1"><OfficerChip s={s} oid={o.id} onOpen={onOpen} /></div></div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- Officer requests ---------- */

function Requests({ q, roleName, onChanged, onOpen }) {
  const { base } = useBase();
  const [run, busy] = useAction();
  const [busyId, setBusyId] = useState(null);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const decide = (r, approve) => {
    setBusyId(r.id);
    run(() => api('shifts.decideRequest', { id: r.id, approve }), approve ? 'Request approved' : 'Request declined').then(onChanged).catch(() => {}).finally(() => setBusyId(null));
  };
  const stop = () => { setPicking(false); setSel(new Set()); };
  // Several at once: the same call per request, one after another; whatever went through is kept if one fails
  const decideAll = (list, approve) => run(async () => {
    let n = 0;
    let err = null;
    for (const r of list) {
      try { await api('shifts.decideRequest', { id: r.id, approve }); n++; } catch (e) { err = e; }
    }
    if (err && !n) throw err;
    return { n, failed: list.length - n };
  }, ({ n, failed }) => `${n} request${n === 1 ? '' : 's'} ${approve ? 'approved' : 'declined'}${failed ? ` · ${failed} failed` : ''}`)
    .then(() => { stop(); onChanged(); }).catch(() => onChanged());
  return (
    <Load q={q}>{(rows) => {
      if (!rows.length) return <Empty icon={Hand} title="No requests" body="When officers ask to work an open shift, it shows here."
        action={<Button variant="link" to={`${base}/cover`}>Looking for a venue's request? See Venue requests</Button>} />;
      const chosen = rows.filter((r) => sel.has(r.id));
      const toggle = (id) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
      const allOn = chosen.length === rows.length;
      return (
        <>
          <div className="mb-2 flex justify-end gap-2">
            {picking && <Button variant="ghost" size="sm" onClick={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))}>{allOn ? 'Clear selection' : `Select all ${rows.length}`}</Button>}
            {rows.length > 1 && <Button variant={picking ? 'secondary' : 'ghost'} size="sm" onClick={() => (picking ? stop() : setPicking(true))}>{picking ? 'Done' : 'Select'}</Button>}
          </div>
          <List>
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {picking && <Tick checked={sel.has(r.id)} onChange={() => toggle(r.id)} label={`Select ${r.officer_name}`} />}
                <Avatar name={r.officer_name} size={40} />
                <Pressable press className="min-w-0 flex-1 text-left" onClick={() => (picking ? toggle(r.id) : onOpen(r.shift_id))}>
                  <div className="truncate text-body font-semibold">{r.officer_name}</div>
                  <div className="truncate text-footnote text-muted">{r.venue_name} · {dayLabel(r.starts_at)} <span className="num">{range(r.starts_at, r.ends_at)}</span> · {roleName(r.role)}</div>
                </Pressable>
                {!picking && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon={X} disabled={busyId === r.id} onClick={() => decide(r, false)}>Decline</Button>
                    <Button size="sm" icon={Check} busy={busyId === r.id} onClick={() => decide(r, true)}>Approve</Button>
                  </div>
                )}
              </div>
            ))}
          </List>
          <ActionBar show={picking && chosen.length > 0}>
            <span className="num mr-2 text-subhead font-semibold">{chosen.length} selected</span>
            <Button variant="secondary" size="sm" icon={X} disabled={busy} onClick={() => decideAll(chosen, false)}>Decline {chosen.length}</Button>
            <Button size="sm" icon={Check} busy={busy} onClick={() => decideAll(chosen, true)}>Approve {chosen.length}</Button>
          </ActionBar>
        </>
      );
    }}</Load>
  );
}

/* ---------- Shift detail ---------- */

/* The venue's drawer: the same shift page the team works from (who is on and clocked in, the handover, the shift's
   ejections, bans and incidents, the signed log), plus Change and Cancel when the shift came from the venue's own request. */
function VenueShiftDetail({ id, row, coverById, onClose, onChange, onPrev, onNext }) {
  const q = useApi('shifts.detail', { id });
  const d = q.data && String(q.data.shift?.id) === String(id) ? q.data : null;
  const req = row?.cover_request_id ? coverById.get(row.cover_request_id) : null;
  const ahead = row && new Date(row.starts_at) > new Date();
  // One change at a time: while the office looks at one, the shift stays as it is
  const open = req && ahead && req.change_status !== 'pending';
  const footer = (
    <>
      {open && <Button variant="link-red" onClick={() => onChange(req)}>Cancel</Button>}
      <Button variant="secondary" icon={NotebookPen} to={`/venue/logs/${id}`}>Open shift page</Button>
      {open && <Button onClick={() => onChange(req)}>Change</Button>}
    </>
  );
  return (
    <Sheet open side onClose={onClose} title={row?.venue_name || 'Shift'} footer={footer} size="md" onPrev={onPrev} onNext={onNext}>
      {q.loading && !d ? <Spinner /> : q.error && !d ? <ErrorBox error={q.error} retry={q.reload} /> : !d ? null : (
        <div className="space-y-5">
          {row && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={shiftState(row) === 'short' ? 'red' : shiftState(row) === 'unconfirmed' ? 'amber' : 'green'} className="num">{row.filled}/{row.headcount} booked</Pill>
                {row.change_waiting && <Pill tone="amber">Change waiting for the office</Pill>}
              </div>
              {(row.stream_name || row.notes) && <KV items={[row.stream_name && ['Bill to', row.stream_name], ['Notes', row.notes]]} />}
              {ahead && !req && <p className="text-footnote text-muted">Set up by the office — message them to change it.</p>}
            </>
          )}
          <ShiftBody d={d} reload={q.reload} role="venue" />
        </div>
      )}
    </Sheet>
  );
}

function ShiftDetail({ id, startAssign, roleName, onClose, onChanged, onEdit, onPrev, onNext }) {
  const q = useApi('shifts.get', { id });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [assigning, setAssigning] = useState(false);
  const [replacing, setReplacing] = useState(null);
  const [clockingOut, setClockingOut] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const changed = () => { q.reload(); onChanged(); };
  // The drawer stays open beside the board; picking another shift starts it afresh
  // ?assign=1 (just accepted from Cover) opens Assign straight away
  useEffect(() => { setAssigning(!!startAssign); setReplacing(null); setCancelling(false); setReason(''); }, [id]);
  const s = q.data && String(q.data.id) === String(id) ? q.data : null;
  const { base } = useBase();
  const toast = useToast();

  const unassign = async (a) => {
    if (!(await confirm({ title: `Remove ${a.name}?`, body: s.status === 'published' ? 'They will be told they are no longer on this shift.' : undefined, confirm: 'Remove', danger: true }))) return;
    run(() => api('shifts.unassign', { id: a.id }), 'Removed').then(changed).catch(() => {});
  };
  const decide = (a, approve) => run(() => api('shifts.decideRequest', { id: a.id, approve }), approve ? 'Approved' : 'Declined').then(changed).catch(() => {});
  const publishOne = () => run(() => api('shifts.publish', { ids: [s.id] }), 'Published').then(changed).catch(() => {});
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this draft shift?', confirm: 'Delete', danger: true }))) return;
    run(() => api('shifts.delete', { id: s.id }), 'Shift deleted').then(() => { onChanged(); onClose(); }).catch(() => {});
  };
  const cancel = () => run(() => api('shifts.cancel', { id: s.id, reason: reason.trim() }), 'Shift cancelled').then(() => { onChanged(); onClose(); }).catch(() => {});
  const setLead = (a) => run(() => api('shifts.setLead', { shift_id: s.id, assignment_id: a.is_lead ? null : a.id }), a.is_lead ? 'Lead removed' : `${a.name} leads this shift`)
    .then((r) => { if (r?.warning) toast(r.warning); changed(); }).catch(() => {});

  const footer = s && s.status !== 'cancelled' && !cancelling && (
    <>
      {s.status === 'draft'
        ? <Button variant="danger" icon={Trash2} onClick={remove} disabled={busy}>Delete</Button>
        : <Button variant="danger" onClick={() => setCancelling(true)} disabled={busy}>Cancel shift</Button>}
      <Button variant="secondary" onClick={() => onEdit(s)}>Edit</Button>
      {s.status === 'draft' && <Button icon={Send} onClick={publishOne} busy={busy}>Publish</Button>}
    </>
  );

  return (
    <Sheet open side onClose={onClose} title={s ? s.venue_name : 'Shift'} footer={footer} size="md" onPrev={onPrev} onNext={onNext}>
      {q.loading && !s ? <Spinner /> : q.error && !s ? <ErrorBox error={q.error} retry={q.reload} /> : !s ? null : (
        <div className="space-y-5">
          {s.status === 'draft'
            ? <p className="text-footnote text-muted">The shift page opens once it's published.</p>
            : <Button variant="soft" icon={NotebookPen} to={`${base}/shifts/${s.id}`}>Open shift page</Button>}
          <div className="flex flex-wrap items-center gap-2">
            <Pill status={s.status} />{s.open && <Pill tone="blue">Open shift</Pill>}
            <Pill tone={shiftState(s) === 'short' ? 'red' : shiftState(s) === 'unconfirmed' ? 'amber' : 'green'} className="num">{s.filled}/{s.headcount} filled</Pill>
            {shiftState(s) === 'unconfirmed' && <Pill tone="amber">{s.assignments.filter((a) => a.status === 'assigned').length} unconfirmed</Pill>}
            {s.cover_request_id && <Pill tone="grey">From cover request</Pill>}
          </div>
          <KV items={[
            ['When', <>{dayLabel(s.starts_at)}, <span className="num">{range(s.starts_at, s.ends_at)}</span></>],
            ['Role', s.role_name || roleName(s.role)],
            s.stream_name && ['Bill to', s.stream_name],
            ['Length', <span className="num">{durationH(s.starts_at, s.ends_at)}h{s.break_minutes ? ` incl. ${s.break_minutes} min break` : ''}</span>],
            ['Notes', s.notes],
          ]} />

          {cancelling && (
            <div className="space-y-3 rounded-2xl bg-red-soft/60 p-4">
              <div className="text-body font-semibold text-red">Cancel this shift?</div>
              <p className="text-footnote text-muted">Everyone assigned or requesting is told it is cancelled.</p>
              <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCancelling(false)}>Keep shift</Button><Button variant="danger" onClick={cancel} busy={busy}>Cancel shift</Button></div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-caption font-semibold uppercase tracking-wide text-faint">Officers</div>
              {s.status !== 'cancelled' && s.filled < s.headcount && <Button size="sm" variant="soft" icon={UserPlus} onClick={() => setAssigning(true)}>Assign</Button>}
            </div>
            {!s.assignments.length ? <p className="text-subhead text-muted">Nobody assigned yet.</p> : (
              <List inset>
                {s.assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={a.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-body font-semibold">{a.name}{a.is_self && <Pill tone="blue">You</Pill>}{a.is_lead && <Pill tone="ink">Lead</Pill>}{a.pack && <PackPill status={a.pack} />}</div>
                      <div className="truncate text-caption text-muted">
                        {a.clocked_in ? <>In <span className="num">{time(a.clocked_in)}</span>{a.clocked_out && <> · out <span className="num">{time(a.clocked_out)}</span></>}</> : a.sia_number ? `SIA ${a.sia_number}` : ''}
                      </div>
                    </div>
                    {s.status === 'draft' && a.status === 'assigned' ? <Pill status="draft" /> : <AssignPill status={a.status} />}
                    {a.status === 'requested' ? (
                      <div className="flex gap-1">
                        <IconButton icon={X} label="Decline request" onClick={() => decide(a, false)} />
                        <IconButton icon={Check} label="Approve request" className="text-green" onClick={() => decide(a, true)} />
                      </div>
                    ) : null}
                    {ACTIVE.includes(a.status) && s.status !== 'cancelled' && (
                      <MoreMenu label={`Actions for ${a.name}`} title={a.name} items={[
                        { label: a.is_lead ? 'Remove as shift lead' : 'Make shift lead', icon: Crown, onClick: () => setLead(a), disabled: busy },
                        a.clocked_in && !a.clocked_out && { label: 'Clock out', icon: LogOut, onClick: () => setClockingOut(a) },
                        !a.clocked_in && { label: 'Replace with someone else', icon: Repeat, onClick: () => setReplacing(a) },
                        !a.clocked_in && { label: 'Remove from shift', icon: UserMinus, danger: true, onClick: () => unassign(a) },
                      ]} />
                    )}
                  </div>
                ))}
              </List>
            )}
          </div>
        </div>
      )}
      {assigning && s && <AssignSheet shift={s} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); changed(); }} />}
      {s && <ClockOutSheet open={!!clockingOut} onClose={() => setClockingOut(null)} onDone={() => { setClockingOut(null); changed(); }}
        row={clockingOut && { assignment_id: clockingOut.id, officer_name: clockingOut.name, venue_name: s.venue_name, clocked_in: clockingOut.clocked_in, ends_at: s.ends_at }} />}
      {replacing && s && <AssignSheet shift={s} replace={replacing} onClose={() => setReplacing(null)} onDone={() => { setReplacing(null); changed(); }} />}
    </Sheet>
  );
}

// Assign fills an empty place; with `replace` it swaps that assignment for the picked officer in one step
function AssignSheet({ shift, replace, onClose, onDone }) {
  const { user } = useAuth();
  const q = useApi('shifts.candidates', { shift_id: shift.id });
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const assign = async (c) => {
    let override = false;
    if (c.warnings.length) {
      if (!(await confirm({ title: `${replace ? 'Put' : 'Assign'} ${c.name} on anyway?`, body: c.warnings.join(' · '), confirm: `${replace ? 'Replace' : 'Assign'} anyway` }))) return;
      override = true;
    } else if (replace && !(await confirm({ title: `Replace ${replace.name} with ${c.name}?`, body: shift.status === 'published' ? `${replace.name} is told they are off this shift and ${c.name} is asked to confirm.` : undefined, confirm: 'Replace' }))) return;
    setBusyId(c.id);
    const call = () => (replace
      ? api('shifts.reassign', { shift_id: shift.id, assignment_id: replace.id, officer_id: c.id, override })
      : api('shifts.assign', { shift_id: shift.id, officer_id: c.id, override }));
    run(call, replace ? `${c.name} replaces ${replace.name}` : `${c.name} assigned`).then(onDone).catch(() => {}).finally(() => setBusyId(null));
  };
  return (
    <Sheet open onClose={onClose} title={replace ? `Replace ${replace.name}` : 'Assign officer'} size="md">
      <p className="mb-3 text-subhead text-muted">{shift.venue_name} · {dayLabel(shift.starts_at)} <span className="num">{range(shift.starts_at, shift.ends_at)}</span></p>
      <Input placeholder="Search officers" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
      <Load q={q}>{(list) => {
        const shown = list.filter((c) => nameMatches(c, search));
        if (!shown.length) return <Empty title="No officers found" />;
        return (
          <List inset>
            {shown.map((c) => {
              const blocked = c.blocking.length > 0;
              return (
                <Pressable press key={c.id} disabled={blocked || busyId != null} onClick={() => assign(c)}
                  className={cx('flex w-full items-center gap-3 px-4 py-3 text-left transition', blocked ? 'opacity-60' : 'hover:bg-surface active:bg-surface')}>
                  <Avatar name={c.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-body font-semibold">{displayName(c)}{c.id === user.self_officer_id && <Pill tone="blue">You</Pill>}{c.grace_until && !blocked && <Pill tone="amber">On grace until {dateShort(c.grace_until)}</Pill>}</div>
                    {blocked ? <div className="text-caption text-red">{c.blocking.join(' · ')}</div>
                      : c.warnings.length ? <div className="text-caption text-amber">{c.warnings.join(' · ')}</div>
                        : <div className="text-caption text-green">Available</div>}
                    {!blocked && c.grace_until && c.graced?.length > 0 && <div className="text-caption text-amber">Can work while they send {c.graced.join(', ')}</div>}
                    {!blocked && c.notes?.length > 0 && <div className="text-caption text-muted">{c.notes.join(' · ')}</div>}
                  </div>
                  {busyId === c.id ? <span className="text-footnote text-muted">{replace ? 'Replacing…' : 'Assigning…'}</span> : !blocked && <Plus size={18} className="text-blue" />}
                </Pressable>
              );
            })}
          </List>
        );
      }}</Load>
    </Sheet>
  );
}

/* ---------- Create / edit shift ---------- */

function ShiftForm({ init, venues, roles, onClose, onSaved }) {
  const s = init.shift;
  const start = s ? londonParts(s.starts_at) : null;
  const [first] = useState(() => ({
    venue_id: s?.venue_id || init.venue_id || (venues.length === 1 ? venues[0].id : ''),
    role: s?.role || '', date: start?.date || init.date || isoDate(), start: start?.time || '19:00', end: s ? londonParts(s.ends_at).time : '03:00',
    break_minutes: s?.break_minutes ?? 0, headcount: s?.headcount ?? 1, open: s?.open ?? false, notes: s?.notes || '',
  }));
  const f = useForm(first);
  const [repeat, setRepeat] = useState(!s && !!init.repeat);
  const [days, setDays] = useState(() => new Set());
  const [weeks, setWeeks] = useState(1);
  const [run, busy] = useAction();
  const v = f.v;
  const t = v.date && v.start && v.end ? shiftTimes(v.date, v.start, v.end) : null;
  const overnight = t && dayOf(t.ends_at) !== v.date;
  // Billing stream: asked only at venues that bill more than one; a new shift follows the stream that claims its role
  const streams = useApi('streams.list', { venue_id: v.venue_id }, { skip: !v.venue_id });
  const active = (streams.data || []).filter((x) => x.status === 'active');
  const [picked, setPicked] = useState(s?.stream_id || '');
  const byRole = active.find((x) => x.roles.includes(v.role)) || active.find((x) => x.is_default);
  const streamId = active.some((x) => x.id === picked) ? picked : byRole?.id || '';

  const dates = useMemo(() => {
    if (!repeat || !v.date) return [v.date];
    const mon = mondayOf(v.date);
    const out = new Set([v.date]);
    for (let w = 0; w < weeks; w++) for (const d of days) { const x = addDays(mon, w * 7 + d); if (x >= v.date) out.add(x); }
    return [...out].sort();
  }, [repeat, v.date, days, weeks]);

  const ok = v.venue_id && v.role && v.date && v.start && v.end && Number(v.headcount) >= 1;
  // Changed from how it opened: closing asks before throwing it away
  const dirty = Object.keys(first).some((k) => String(v[k]) !== String(first[k])) || repeat !== (!s && !!init.repeat) || days.size > 0 || weeks !== 1;
  const confirm = useConfirm();
  const cancel = async () => {
    if (!dirty || await confirm({ title: 'Discard changes?', body: "What you've changed here won't be saved.", confirm: 'Discard', cancel: 'Keep editing', danger: true })) onClose();
  };
  const save = (status) => {
    const common = { venue_id: v.venue_id, role: v.role, break_minutes: Number(v.break_minutes) || 0, headcount: Number(v.headcount) || 1, open: !!v.open, notes: v.notes,
      ...(active.length > 1 && streamId ? { stream_id: streamId } : {}) };
    let p;
    if (s) p = api('shifts.save', { id: s.id, ...common, ...t });
    else if (dates.length > 1) p = api('shifts.bulkCreate', { ...common, dates, start_time: v.start, end_time: v.end, status });
    else p = api('shifts.save', { ...common, ...t, status });
    run(() => p, s ? 'Shift updated' : dates.length > 1 ? (r) => `${r.created} shifts created` : status === 'published' ? 'Shift published' : 'Draft saved')
      .then(() => onSaved(v.date)).catch(() => {});
  };

  return (
    <Sheet open full dirty={dirty && !busy} onClose={onClose} title={s ? 'Edit shift' : 'New shift'}
      footer={s ? <><Button variant="secondary" onClick={cancel}>Cancel</Button><Button onClick={() => save()} busy={busy} disabled={!ok}>Save</Button></>
        : <><Button variant="secondary" onClick={() => save('draft')} busy={busy} disabled={!ok}>Save draft</Button><Button icon={Send} onClick={() => save('published')} busy={busy} disabled={!ok}>Publish{dates.length > 1 ? ` ${dates.length}` : ''}</Button></>}>
      <div className="space-y-3">
        <Select label="Venue" value={v.venue_id} onChange={(e) => f.set('venue_id', e.target.value)} placeholder="Choose venue" options={venues.map((x) => ({ value: x.id, label: x.name }))} />
        <Select label="Role" value={v.role} onChange={(e) => f.set('role', e.target.value)} placeholder="Choose role" options={roles.map((r) => ({ value: r.code, label: r.name }))} />
        {active.length > 1 && (
          <Select label="Bill to" hint={s ? 'Moving it changes which invoice it goes on, until that invoice is issued' : 'Each budget gets its own invoice'} value={streamId} onChange={(e) => setPicked(e.target.value)}
            options={active.map((x) => ({ value: x.id, label: x.name }))} />
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Input label="Date" type="date" className="col-span-2 sm:col-span-1" {...f.bind('date')} />
          <Input label="Start" type="time" {...f.bind('start')} />
          <Input label="End" type="time" {...f.bind('end')} hint={overnight ? 'Ends next day' : undefined} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Officers needed" type="number" min="1" max="100" inputMode="numeric" {...f.bind('headcount')} />
          <Input label="Break (minutes)" type="number" min="0" inputMode="numeric" {...f.bind('break_minutes')} />
        </div>
        <Toggle label="Open shift" hint="Officers can ask to work it" checked={v.open} onChange={(x) => f.set('open', x)} />
        <Textarea label="Notes" rows={2} placeholder="Dress code, entrance, anything officers need to know" {...f.bind('notes')} />
        {!s && (
          <div className="rounded-2xl bg-bg/70 p-4">
            <Toggle label="Repeat" hint="Same times on other days" checked={repeat} onChange={setRepeat} />
            {repeat && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((w, i) => {
                    const on = days.has(i);
                    return (
                      <Pressable press key={w} onClick={() => setDays((x) => { const n = new Set(x); if (on) n.delete(i); else n.add(i); return n; })}
                        className={cx('h-9 min-w-[46px] rounded-full px-3 text-footnote font-semibold transition', on ? 'bg-blue text-white' : 'bg-surface text-muted border border-line')}>{w}</Pressable>
                    );
                  })}
                </div>
                <Select label="For" value={String(weeks)} onChange={(e) => setWeeks(Number(e.target.value))}
                  options={[1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: n === 1 ? 'This week only' : `${n} weeks` }))} />
                <p className="text-footnote text-muted">{dates.length} shift{dates.length > 1 ? 's' : ''}: {dates.slice(0, 6).map(dateShort).join(', ')}{dates.length > 6 ? '…' : ''}</p>
              </div>
            )}
          </div>
        )}
        {s && s.status === 'published' && <p className="text-footnote text-muted">Assigned officers are told if the time or venue changes.</p>}
      </div>
    </Sheet>
  );
}

