import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Ban, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardCheck, Clock, Download, History, HandCoins, Lock, LogOut, MapPin, ReceiptText, MessageSquareReply, Nfc, PenLine, QrCode, Signature, Undo2,
} from 'lucide-react';
import {
  ActionBar, addDays, Avatar, Button, Callout, cx, dateShort, dayLabel, Empty, hours, IconButton, Input, isoDate, KV, Load, money, mondayOf, MoreMenu, Page, Pill, Pressable, range, relative, Segmented, Select, Sheet, Textarea, time, titleCase, ToolField, ToolMenu, useAction, useApi, useConfirm, useForm, useMedia, useUrlState,
} from '../../ui/index.jsx';
import { api, downloadAction } from '../../api.js';
import { useVenue } from '../../venue.jsx';
import { ClockOutSheet } from './_clockOut.jsx';
import { Check as Tick, fromLondonInput, londonIso, SELF_HINT, SelfPills, toLondonInput, useBase } from '../manager/_parts.jsx';

const FLAG_TONE = { late: 'amber', left_early: 'amber', exception: 'red', no_clock_out: 'red', manual: 'blue', edited: 'blue', cancelled_after_billing: 'red' };
const DECLINE_REASONS = ['No-show', 'Sent home', 'Wrong booking', 'Duplicate', 'Shift cancelled'];

// One look per row state. edge: the coloured left edge; row: the row tint; tone: the state pill
const STATE = {
  confirmed: { label: 'Confirmed', row: 'opacity-50', edge: 'border-l-line', tone: 'grey' },
  live: { label: 'Live', row: 'outline outline-2 -outline-offset-2 outline-blue', edge: 'border-l-blue', tone: 'blue' },
  awaiting: { label: 'Awaiting review', row: 'bg-amber-soft/40', edge: 'border-l-amber', tone: 'amber' },
  queried: { label: 'Queried', row: 'bg-red-soft/40', edge: 'border-l-red', tone: 'red' },
  approved: { label: 'Approved', row: 'bg-green-soft/40', edge: 'border-l-green', tone: 'green' },
  signed: { label: 'Approved', row: 'bg-green-soft/40', edge: 'border-l-green', tone: 'green' },
  locked: { label: 'Paid / invoiced', row: 'bg-green-soft/40', edge: 'border-l-green', tone: 'green' },
  declined: { label: 'Declined', row: 'bg-fill/60 text-muted', edge: 'border-l-faint', tone: 'grey' },
  cancelled: { label: 'Shift cancelled', row: 'bg-fill/60', edge: 'border-l-red', tone: 'red' },
  no_clock_in: { label: 'No clock-in', row: '', edge: 'border-l-red', tone: 'red' },
};
const HOW = { qr: [QrCode, 'Scanned the venue QR'], nfc: [Nfc, 'Tapped the venue NFC tag'], manual: [PenLine, 'Times set by a manager'], gps: [MapPin, 'Clocked in on location'] };
const REVIEW = new Set(['awaiting', 'queried', 'no_clock_in', 'cancelled']);
const noRate = (r) => ['awaiting', 'approved', 'signed'].includes(r.state) && (r.charge_rate === null || r.pay_rate === null);
const FILTERS = {
  all: () => true,
  review: (r, venue) => (venue ? r.state === 'approved' : REVIEW.has(r.state)),
  queried: (r) => r.state === 'queried',
  no_clock_in: (r) => r.state === 'no_clock_in',
  cancelled: (r) => r.state === 'cancelled',
  no_rate: noRate,
  unpaid_late: (r) => r.unpaid_late,
  live: (r) => r.state === 'live',
};
// Old links (dashboard, notifications) still say ?status=
const FROM_STATUS = { pending: 'review', disputed: 'queried', missing: 'no_clock_in', approved: 'review' };
const DAYS = (week) => Array.from({ length: 7 }, (_, i) => addDays(week, i));

export default function Timesheets() {
  const { user, isManager, base } = useBase();
  const wide = useMedia('(min-width: 640px)');
  const nav = useNavigate();
  const confirm = useConfirm();
  const isVenue = user.role === 'venue';
  const isCo = user.role === 'company';
  const canSign = isCo || isVenue;
  // Week, venue, officer and view live in the address, so Back and shared links land on the same view
  const thisWeek = mondayOf(isoDate());
  const [url, setUrl] = useUrlState({ week: thisWeek, venue: '', officer: '', show: 'all', status: '' });
  // Venues open on the whole week: who worked, who is on site now, and what is waiting for their signature
  const filter = FROM_STATUS[url.status] || url.show || 'all';
  const setFilter = (f) => { setUrl({ show: f, status: '' }); setSel(new Set()); };
  const week = /^\d{4}-\d{2}-\d{2}$/.test(url.week) ? mondayOf(url.week) : thisWeek;
  const setWeek = (w) => { setUrl({ week: w }); setSel(new Set()); };

  // A venue manager's chosen venue is shared across their pages; managers filter here only
  const shared = useVenue();
  const venueId = isVenue ? shared.venueId : url.venue;
  const setVenueId = isVenue ? shared.setVenueId : (v) => setUrl({ venue: v });
  const officerId = url.officer;
  const setOfficerId = (v) => setUrl({ officer: v });
  const [sel, setSel] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [sheet, setSheet] = useState(null); // { kind: decline | rate | manual, rows }
  const [run, busy] = useAction();

  const venues = useApi('venues.list', {}, { skip: isVenue });
  const venueList = isVenue ? shared.venues : (venues.data || []).filter((v) => v.active);
  const body = useMemo(() => ({ from: londonIso(week), to: londonIso(addDays(week, 7)), ...(venueId ? { venue_id: venueId } : {}) }), [week, venueId]);
  const q = useApi('timesheets.week', body);
  const missing = useApi('timesheets.missing', {}, { skip: !isManager });
  const earlier = (missing.data || []).filter((m) => new Date(m.starts_at) < new Date(londonIso(week)));

  const all = q.data?.rows || [];
  const officers = useMemo(() => [...new Map(all.map((r) => [r.officer_id, r.officer_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const rows = all.filter((r) => (!officerId || r.officer_id === officerId) && (FILTERS[filter] || FILTERS.all)(r, isVenue));
  const see = q.data?.see || {};

  const health = q.data?.health || {};
  const can = (r) => {
    if (r.self_locked || r.locked) return {};
    const s = r.state;
    return {
      approve: isManager && s === 'awaiting',
      query: (isManager && ['awaiting', 'approved'].includes(s)) || (isVenue && s === 'approved'),
      decline: isManager && ['awaiting', 'queried', 'no_clock_in', 'cancelled'].includes(s),
      sign: canSign && s === 'approved',
      times: isManager && s === 'no_clock_in',
      // Clocked in, never out (still on, or closed at the shift end by the overnight check): a manager sets the real clock-out
      clockout: isManager && !!r.clock_in && !r.clock_out && !['cancelled', 'declined'].includes(s),
      answer: isManager && s === 'queried',
      rate: isCo && !!r.id && !['declined', 'cancelled'].includes(s),
      edit: isManager && !!r.id && !['cancelled', 'declined'].includes(s),
    };
  };
  const selectable = rows.filter((r) => { const c = can(r); return c.approve || c.sign || c.decline; });
  const chosen = rows.filter((r) => sel.has(r.assignment_id));
  const toApprove = chosen.filter((r) => can(r).approve);
  const toSign = chosen.filter((r) => can(r).sign);
  const toDecline = chosen.filter((r) => can(r).decline);
  const allOn = selectable.length > 0 && selectable.every((r) => sel.has(r.assignment_id));
  const toggle = (id, on) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const done = () => { setSel(new Set()); setSheet(null); setOpenId(null); q.reload(); missing.reload(); };
  // The detail drawer steps through the rows in the order the table shows them (by day)
  const order = DAYS(week).flatMap((d) => rows.filter((r) => r.date === d));
  const at = order.findIndex((r) => r.assignment_id === openId);
  const open = at >= 0 ? order[at] : all.find((r) => r.assignment_id === openId);
  const onOpen = (r) => setOpenId(r.assignment_id);

  const approve = (list) => run(() => api('timesheets.approve', { ids: list.map((r) => r.id) }),
    (r) => `${r.approved} approved${r.message ? ` · ${r.message}` : ''}`).then(done).catch(() => {});
  const sign = (list) => run(() => api('timesheets.sign', { ids: list.map((r) => r.id) }), (r) => `${r.signed} signed`).then(done).catch(() => {});
  // The next step for the whole week in one tap: venues sign off everything approved; the company sends approved hours to pay
  const toSignWeek = all.filter((r) => can(r).sign);
  const signWeek = async () => {
    if (!(await confirm({ title: `Sign off ${toSignWeek.length} shift${toSignWeek.length === 1 ? '' : 's'}?`, body: `Every approved shift in the week of ${dayLabel(week)}. Query any you don't agree with first.`, confirm: 'Sign off' }))) return;
    sign(toSignWeek);
  };
  const readyToPay = isCo && !health.to_review && all.some((r) => ['approved', 'signed'].includes(r.state));
  const sendToPay = () => run(() => api('pay.generate', {}), (x) => `Pay run up to date · ${x.created} draft statement${x.created === 1 ? '' : 's'}`)
    .then((x) => { if (x?.pay_run_id) nav(`${base}/pay/runs/${x.pay_run_id}`); }).catch(() => {});
  const act = {
    approve: (r) => approve([r]), sign: (r) => sign([r]),
    query: (r) => setSheet({ kind: 'query', rows: [r] }), decline: (r) => setSheet({ kind: 'decline', rows: [r] }),
    times: (r) => setSheet({ kind: 'manual', rows: [r] }), answer: (r) => setSheet({ kind: 'answer', rows: [r] }), rate: (r) => setSheet({ kind: 'rate', rows: [r] }),
    edit: (r) => setSheet({ kind: 'edit', rows: [r] }),
    clockout: (r) => setSheet({ kind: 'clockout', rows: [r] }),
  };

  const weekLabel = `${dateShort(week)} – ${dateShort(addDays(week, 6))}`;
  const isThisWeek = week === thisWeek;
  const wk = q.data?.week;
  const segs = isVenue
    ? [{ value: 'all', label: 'All' }, { value: 'live', label: 'On site', count: all.filter((r) => r.state === 'live').length || undefined },
      { value: 'review', label: 'To sign', count: all.filter((r) => r.state === 'approved').length }, { value: 'queried', label: 'Queried' }]
    : [{ value: 'all', label: 'All' }, { value: 'review', label: 'Needs review', count: health.to_review }, { value: 'queried', label: 'Queried' }, { value: 'no_clock_in', label: 'No clock-in' }];

  // The week sits beside the title; the view, venue and officer sit on the tab line, so the table starts high
  const weekPicker = (
    <span className="inline-flex items-center gap-1">
      <IconButton icon={ChevronLeft} label="Previous week" size="sm" onClick={() => setWeek(addDays(week, -7))} />
      <span className="num min-w-[112px] text-center text-body font-semibold text-ink">{weekLabel}</span>
      <IconButton icon={ChevronRight} label="Next week" size="sm" onClick={() => setWeek(addDays(week, 7))} />
      {!isThisWeek && <Button variant="ghost" size="sm" onClick={() => setWeek(thisWeek)}>This week</Button>}
    </span>
  );
  const venuePick = (venueList.length > 1 || !isVenue) && (
    <Select aria-label="Venue" value={venueId} onChange={(e) => setVenueId(e.target.value)} placeholder="All venues"
      options={venueList.map((v) => ({ value: v.id, label: v.name }))} />
  );
  const officerPick = (
    <Select aria-label="Officer" value={officerId} onChange={(e) => setOfficerId(e.target.value)} placeholder="All officers"
      options={officers.map(([id, name]) => ({ value: id, label: name }))} />
  );
  const changed = !!officerId + (!wide && !isVenue && !!venueId);
  const tools = <>
    <Segmented value={filter} onChange={setFilter} options={segs} />
    {venuePick && <div className="hidden w-48 sm:block">{venuePick}</div>}
    <ToolMenu count={changed} onClear={() => setUrl({ officer: '', ...(!wide && !isVenue && { venue: '' }) })}>
      {!wide && venuePick && <ToolField label="Venue">{venuePick}</ToolField>}
      <ToolField label="Officer">{officerPick}</ToolField>
    </ToolMenu>
  </>;

  return (
    <Page title="Timesheets" subtitle={weekPicker} wide tools={tools}
      actions={<>{isVenue ? (toSignWeek.length > 0 && <Button icon={Signature} busy={busy} onClick={signWeek}>Sign off week · {toSignWeek.length}</Button>)
        : readyToPay && <Button variant="secondary" icon={HandCoins} busy={busy} onClick={sendToPay}>Send to pay run</Button>}
        <MoreMenu items={[{ icon: Download, label: 'Export this week', hint: 'Every row shown, as CSV', onClick: () => downloadAction('timesheets.exportCsv', body).catch(() => {}) }]} /></>}>
      {earlier.length > 0 && (
        <Callout tone="warning" icon={Clock} className="mb-3" title={`${earlier.length} earlier shift${earlier.length > 1 ? 's' : ''} with no clock-in`}
          action={<Button size="sm" variant="secondary" onClick={() => { setUrl({ week: mondayOf(isoDate(earlier[earlier.length - 1].starts_at)), show: 'no_clock_in', status: '' }); setSel(new Set()); }}>Show oldest</Button>}>
          Set the times if they worked, or decline them, so nothing is paid twice or missed.
        </Callout>
      )}

      {wk && <WeekStrip wk={wk} health={health} see={see} filter={filter} setFilter={setFilter} isVenue={isVenue} />}

      {selectable.length > 0 && (
        <div className="mb-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setSel(allOn ? new Set() : new Set(selectable.map((r) => r.assignment_id)))}>
            {allOn ? 'Clear selection' : `Select all ${selectable.length}`}
          </Button>
        </div>
      )}

      <Load q={q}>{() => !rows.length ? (
        <Empty icon={ClipboardCheck} title={all.length ? 'Nothing matches' : 'No shifts this week'} body={all.length ? 'Try another filter.' : 'Confirmed shifts show here as soon as officers accept them.'} />
      ) : (
        <WeekTable rows={rows} week={week} days={q.data.days} see={see} sel={sel} toggle={toggle} can={can} act={act} onOpen={onOpen} busy={busy} />
      )}</Load>

      <ActionBar show={chosen.length > 0}>
        <span className="num mr-2 text-subhead font-semibold">{chosen.length} selected</span>
        <Button variant="secondary" size="sm" onClick={() => setSel(new Set())}>Clear</Button>
        {toApprove.length > 0 && <Button size="sm" icon={Check} busy={busy} onClick={() => approve(toApprove)}>Approve {toApprove.length}</Button>}
        {toSign.length > 0 && <Button size="sm" icon={Signature} busy={busy} onClick={() => sign(toSign)}>Sign {toSign.length}</Button>}
        {toDecline.length > 0 && <Button size="sm" variant="danger" icon={Ban} onClick={() => setSheet({ kind: 'decline', rows: toDecline })}>Decline {toDecline.length}</Button>}
      </ActionBar>

      {open && !sheet && <Detail t={open} can={can(open)} isManager={isManager} see={see} act={act} busy={busy} onClose={() => setOpenId(null)} onDone={done}
        onPrev={at > 0 ? () => setOpenId(order[at - 1].assignment_id) : undefined}
        onNext={at >= 0 && at < order.length - 1 ? () => setOpenId(order[at + 1].assignment_id) : undefined} />}
      {sheet?.kind === 'decline' && <DeclineSheet rows={sheet.rows} onClose={() => setSheet(null)} onDone={done} />}
      {sheet?.kind === 'query' && <DisputeSheet t={sheet.rows[0]} onClose={() => setSheet(null)} onDone={done} />}
      {sheet?.kind === 'rate' && <RateSheet t={sheet.rows[0]} onClose={() => setSheet(null)} onDone={done} />}
      {sheet?.kind === 'manual' && <ManualSheet m={sheet.rows[0]} onClose={() => setSheet(null)} onDone={done} />}
      {sheet?.kind === 'edit' && <EditSheet t={sheet.rows[0]} onClose={() => setSheet(null)} onDone={done} />}
      <ClockOutSheet open={sheet?.kind === 'clockout'} later onClose={() => setSheet(null)} onDone={done}
        row={sheet?.kind === 'clockout' && { ...sheet.rows[0], clocked_in: sheet.rows[0].clock_in }} />
      {sheet?.kind === 'answer' && <AnswerSheet t={sheet.rows[0]} onClose={() => setSheet(null)} onDone={done} />}
    </Page>
  );
}

/* ---------- Week strip: totals and what still needs doing ---------- */

function WeekStrip({ wk, health, see, filter, setFilter, isVenue }) {
  const chips = [
    !isVenue && ['review', health.to_review, 'to review', 'amber', ClipboardCheck],
    ['queried', health.queried, 'queried', 'red', MessageSquareReply],
    !isVenue && ['no_clock_in', health.no_clock_in, 'no clock-in', 'red', Clock],
    !isVenue && ['cancelled', health.cancelled, 'cancelled with hours', 'red', Ban],
    ['no_rate', health.no_rate, 'without a rate', 'red', AlertTriangle],
    ['unpaid_late', health.unpaid_late, 'signed, not paid yet', 'amber', HandCoins],
  ].filter((c) => c && c[1] > 0);
  // One line by default (the totals); Show breakdown opens the full strip with what still needs doing
  const [full, setFull] = useState(false);
  const toggle = (
    <Button variant="ghost" size="sm" iconRight={full ? ChevronUp : ChevronDown} aria-expanded={full} onClick={() => setFull(!full)} className="ml-auto">
      {full ? 'Hide breakdown' : 'Show breakdown'}
    </Button>
  );
  if (!full) return (
    <div className="mb-4 flex items-center gap-3 rounded-tile border border-hairline bg-surface py-1.5 pl-4 pr-1.5 shadow-tile">
      <span className="num min-w-0 truncate text-subhead">
        <span className="font-bold">{hours(wk.hours)}</span>
        {see.charge && <> · Charge <span className="font-bold">{money(wk.charge)}</span></>}
        {see.pay && <> · Pay <span className="font-bold">{money(wk.pay)}</span></>}
      </span>
      {chips.length > 0 && <Pill tone={chips.some((c) => c[3] === 'red') ? 'red' : 'amber'} className="hidden shrink-0 sm:inline-flex">{chips.length} to check</Pill>}
      {toggle}
    </div>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-tile border border-hairline bg-surface px-4 py-3 shadow-tile">
      <Total label="Hours" value={hours(wk.hours)} />
      {see.charge && <Total label="Charge" value={money(wk.charge)} />}
      {see.pay && <Total label="Officer pay" value={money(wk.pay)} />}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {chips.map(([f, n, label, tone, Icon]) => (
            <Pressable key={f} press onClick={() => setFilter(filter === f ? 'all' : f)}
              className={cx('inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote font-semibold', tone === 'red' ? 'bg-red-soft text-red' : 'bg-amber-soft text-amber', filter === f && 'ring-2 ring-current')}>
              <Icon size={14} className="shrink-0" /><span className="num">{n}</span> {label}
            </Pressable>
          ))}
        </div>
      ) : <span className="text-footnote text-green sm:ml-auto">Nothing waiting</span>}
      {toggle}
    </div>
  );
}
const Total = ({ label, value }) => (
  <div><div className="text-caption font-semibold uppercase tracking-wide text-faint">{label}</div><div className="num text-callout font-bold">{value}</div></div>
);

/* ---------- The table (desktop) and day cards (phone) ---------- */

function WeekTable({ rows, week, days, see, sel, toggle, can, act, onOpen, busy }) {
  const today = isoDate();
  const byDay = useMemo(() => { const m = {}; for (const r of rows) (m[r.date] ||= []).push(r); return m; }, [rows]);
  const shown = DAYS(week).filter((d) => byDay[d]?.length);
  const todayRef = useRef(null);
  useEffect(() => {
    if (todayRef.current && window.matchMedia('(max-width: 767px)').matches) todayRef.current.scrollIntoView({ block: 'start' });
  }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayTotal = (d) => {
    const t = days?.[d];
    if (!t) return null;
    return [hours(t.hours), see.charge && `charge ${money(t.charge)}`, see.pay && `pay ${money(t.pay)}`].filter(Boolean).join(' · ');
  };
  const cols = 6 + (see.charge ? 1 : 0) + (see.pay ? 1 : 0);
  const props = { see, sel, toggle, can, act, onOpen, busy };

  return (
    <>
      {/* Phone: day cards with sticky day headers */}
      <div className="md:hidden">
        {shown.map((d) => (
          <section key={d} className="mb-1">
            <div ref={d === today ? todayRef : undefined}
              className="sticky-below-header sticky z-10 -mx-4 flex scroll-mt-14 items-center justify-between gap-2 bg-bg/90 px-4 py-2 backdrop-blur">
              <span className={cx('text-footnote font-semibold uppercase tracking-wide', d === today ? 'text-blue' : 'text-muted')}>{dayLabel(d)}{d === today ? ' · Today' : ''}</span>
              <span className="num truncate text-caption text-muted">{dayTotal(d)}</span>
            </div>
            <div className="mb-2 space-y-2">{byDay[d].map((r) => <RowCard key={r.assignment_id} r={r} {...props} />)}</div>
          </section>
        ))}
      </div>

      {/* Tablet/desktop: one table, a header row per day */}
      <div className="ui-panel hidden overflow-x-auto rounded-tile border border-hairline bg-surface shadow-tile md:block">
        <table className="w-full text-subhead">
          <thead>
            <tr className="border-b border-line text-left text-caption font-semibold uppercase tracking-wide text-faint">
              <th className="w-10 py-3 pl-4" aria-label="Select" />
              <th className="px-3 py-3 font-semibold">Officer</th>
              <th className="px-3 py-3 font-semibold">Venue · role</th>
              <th className="px-3 py-3 font-semibold">Scheduled</th>
              <th className="px-3 py-3 font-semibold">Actual</th>
              <th className="px-3 py-3 text-right font-semibold">Hours</th>
              {see.charge && <th className="px-3 py-3 text-right font-semibold">Charge</th>}
              {see.pay && <th className="px-3 py-3 text-right font-semibold">Officer rate</th>}
              <th className="px-3 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <Fragment key={d}>
                <tr className="border-b border-line bg-bg/70">
                  <td colSpan={cols + 1} className="px-4 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className={cx('text-footnote font-semibold uppercase tracking-wide', d === today ? 'text-blue' : 'text-muted')}>{dayLabel(d)}{d === today ? ' · Today' : ''}</span>
                      <span className="num text-footnote text-muted">{dayTotal(d)}</span>
                    </div>
                  </td>
                </tr>
                {byDay[d].map((r) => <TableRow key={r.assignment_id} r={r} {...props} />)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TableRow({ r, see, sel, toggle, can, act, onOpen, busy }) {
  const st = STATE[r.state] || STATE.awaiting;
  const c = can(r);
  const pick = c.approve || c.sign || c.decline;
  const struck = r.state === 'declined';
  return (
    <tr onClick={() => onOpen(r)} className={cx('cursor-pointer border-b border-line transition-colors last:border-0 hover:brightness-[0.98]', st.row)}>
      <td className={cx('border-l-4 py-2.5 pl-3', st.edge)} onClick={(e) => e.stopPropagation()}>
        {pick ? <Tick checked={sel.has(r.assignment_id)} onChange={(on) => toggle(r.assignment_id, on)} label={`Select ${r.officer_name}`} /> : r.locked && <Lock size={14} className="text-faint" />}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={r.officer_name} src={r.photo_url} size={32} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{r.officer_name}</div>
            <StateLine r={r} />
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5"><div className="truncate">{r.venue_name}</div><div className="truncate text-caption text-muted">{r.role_name}</div></td>
      <td className="num whitespace-nowrap px-3 py-2.5 text-muted">{range(r.starts_at, r.ends_at)}</td>
      <td className="px-3 py-2.5"><Actual r={r} /></td>
      <td className={cx('num px-3 py-2.5 text-right font-bold', struck && 'line-through')}>{r.id || r.state === 'live' ? hours(r.hours) : '—'}</td>
      {see.charge && <td className="px-3 py-2.5 text-right"><Rate r={r} k="charge" onEdit={c.rate && (() => act.rate(r))} /></td>}
      {see.pay && <td className="px-3 py-2.5 text-right"><Rate r={r} k="pay" onEdit={c.rate && (() => act.rate(r))} /></td>}
      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}><RowActions r={r} c={c} act={act} busy={busy} /></td>
    </tr>
  );
}

function RowCard({ r, see, sel, toggle, can, act, onOpen, busy }) {
  const st = STATE[r.state] || STATE.awaiting;
  const c = can(r);
  const pick = c.approve || c.sign || c.decline;
  const struck = r.state === 'declined';
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => e.key === 'Enter' && onOpen(r)}
      className={cx('cursor-pointer rounded-2xl border border-l-4 border-hairline bg-surface p-3 shadow-tile', st.edge, st.row)}>
      <div className="flex items-start gap-2.5">
        {pick && <span className="pt-2"><Tick checked={sel.has(r.assignment_id)} onChange={(on) => toggle(r.assignment_id, on)} label={`Select ${r.officer_name}`} /></span>}
        <Avatar name={r.officer_name} src={r.photo_url} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-body font-semibold">{r.officer_name}</span>
            <span className={cx('num shrink-0 text-callout font-bold', struck && 'line-through')}>{r.id || r.state === 'live' ? hours(r.hours) : ''}</span>
          </div>
          <div className="truncate text-footnote text-muted">{r.venue_name} · {r.role_name} · <span className="num">{range(r.starts_at, r.ends_at)}</span></div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><StateLine r={r} /><Actual r={r} compact /></div>
          {(see.charge || see.pay) && r.id && (
            <div className="mt-1 flex flex-wrap gap-x-4 text-footnote">
              {see.charge && <span className="text-muted">Charge <Rate r={r} k="charge" inline onEdit={c.rate && (() => act.rate(r))} /></span>}
              {see.pay && <span className="text-muted">Officer <Rate r={r} k="pay" inline onEdit={c.rate && (() => act.rate(r))} /></span>}
            </div>
          )}
        </div>
      </div>
      {Object.entries(c).some(([k, on]) => on && k !== 'edit') && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5" onClick={(e) => e.stopPropagation()}><Actions r={r} c={c} act={act} busy={busy} /></div>
      )}
    </div>
  );
}

function StateLine({ r }) {
  const st = STATE[r.state] || STATE.awaiting;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-caption">
      <Pill tone={st.tone} className="!py-0 !text-caption2">{r.state === 'locked' && <Lock size={14} />}{st.label}</Pill>
      {r.state === 'signed' && <span className="inline-flex items-center gap-0.5 font-semibold text-green"><Check size={14} />Venue signed</span>}
      {r.state === 'declined' && r.decline_reason && <span className="text-muted">{r.decline_reason}</span>}
      {r.unpaid_late && <Pill tone="amber" className="!py-0 !text-caption2">Not paid yet</Pill>}
      <BillChip r={r} />
      <SelfPills row={r} small />
    </div>
  );
}

// Where the shift's money stands: on the venue's open draft (moves with every change) or on an issued invoice
function BillChip({ r }) {
  if (!r.invoice_status || ['declined', 'cancelled'].includes(r.state)) return null;
  if (r.invoice_status === 'draft') return <Pill tone="grey" className="!py-0 !text-caption2"><ReceiptText size={14} />On draft invoice</Pill>;
  return <Pill tone="blue" className="!py-0 !text-caption2"><ReceiptText size={14} />Invoiced{r.invoice_number ? ` ${r.invoice_number}` : ''}</Pill>;
}

function Actual({ r, compact }) {
  if (!r.clock_in && !r.actual_start) return compact ? null : <span className="text-faint">—</span>;
  const how = HOW[r.how];
  const Icon = how?.[0];
  const start = r.actual_start || r.clock_in;
  const end = r.actual_end || r.clock_out;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-caption">
      {Icon && <span title={how[1]} aria-label={how[1]} className="text-muted"><Icon size={14} /></span>}
      <span className="num whitespace-nowrap text-footnote font-semibold text-ink">{end ? range(start, end) : `${time(start)}–now`}</span>
      {(r.flags || []).map((f) => <Pill key={f} tone={FLAG_TONE[f] || 'grey'} className="!py-0 !text-caption2">{titleCase(f)}</Pill>)}
    </span>
  );
}

// £/h and the total. "~" marks a live estimate from the rate card (fixed on approval); a dot marks a manual override
function Rate({ r, k, onEdit, inline }) {
  const rate = r[`${k}_rate`];
  const total = r[`${k}_total`];
  const est = r[`${k}_estimate`];
  const set = r[`${k}_rate_set`];
  if (!r.id) return inline ? null : <span className="num text-caption text-faint">{rate != null ? `~${money(rate)}/h` : '—'}</span>;
  const struck = r.state === 'declined';
  const inner = rate == null ? <span className="font-semibold text-red">No rate</span> : (
    <span className={cx('inline-flex flex-col', inline ? 'inline' : 'items-end', struck && 'line-through')}>
      {!inline && <span className="num font-semibold text-ink">{total != null ? money(total) : '—'}</span>}
      <span className={cx('num text-caption', est ? 'text-faint' : 'text-muted')}>
        {inline && total != null && <span className="font-semibold text-ink">{money(total)} </span>}
        {est ? '~' : ''}{money(rate)}/h{set && <span title="Rate changed for this shift" className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle" />}
      </span>
    </span>
  );
  if (!onEdit) return inner;
  return <Pressable press onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={`Change the ${k === 'pay' ? 'officer' : 'charge'} rate`} className={cx('-mx-1.5 inline-flex rounded-lg px-1.5 py-1 hover:bg-fill', inline ? 'inline' : 'justify-end')}>{inner}</Pressable>;
}

// Phone cards: every action that applies, labelled
function Actions({ r, c, act, busy }) {
  const b = (key, Icon, label, variant = 'secondary') => c[key] && (
    <Button key={key} size="sm" variant={variant} icon={Icon} busy={busy && key === 'approve'} onClick={() => act[key](r)}>{label}</Button>
  );
  return (
    <div className="inline-flex flex-wrap justify-end gap-1.5">
      {b('times', Clock, 'Set times', 'soft')}
      {b('clockout', LogOut, 'Set clock-out', 'soft')}
      {b('answer', MessageSquareReply, 'Answer', 'soft')}
      {b('query', AlertTriangle, 'Query', 'danger')}
      {b('decline', Ban, 'Decline')}
      {b('approve', Check, 'Approve', 'primary')}
      {b('sign', Signature, 'Sign off', 'primary')}
    </div>
  );
}

// Desktop rows: one labelled main action (Approve or Sign off; Set times or Answer when that is all there is) and the rest under …
function RowActions({ r, c, act, busy }) {
  const main = c.approve ? ['approve', Check, 'Approve', 'primary'] : c.sign ? ['sign', Signature, 'Sign off', 'primary']
    : c.times ? ['times', Clock, 'Set times', 'soft'] : c.clockout ? ['clockout', LogOut, 'Set clock-out', 'soft'] : c.answer ? ['answer', MessageSquareReply, 'Answer', 'soft'] : null;
  const item = (key, icon, label, danger) => c[key] && key !== main?.[0] && { label, icon, danger, onClick: () => act[key](r) };
  const more = [
    item('answer', MessageSquareReply, 'Answer query'),
    item('times', Clock, 'Set times'),
    item('clockout', LogOut, 'Set clock-out time'),
    item('edit', PenLine, r.state === 'queried' ? 'Correct times' : 'Edit times'),
    item('query', AlertTriangle, 'Query'),
    item('decline', Ban, 'Decline', true),
  ];
  return (
    <div className="inline-flex items-center justify-end gap-1.5">
      <MoreMenu items={more} title={r.officer_name} label={`More actions for ${r.officer_name}`} size="sm" />
      {main && <Button size="sm" variant={main[3]} icon={main[1]} busy={busy && main[0] === 'approve'} onClick={() => act[main[0]](r)}>{main[2]}</Button>}
    </div>
  );
}

/* ---------- Detail ---------- */

const TRAIL = {
  'timesheet.approve': 'Approved', 'timesheet.sign': 'Venue signed', 'timesheet.dispute': 'Queried', 'timesheet.answer': 'Query answered',
  'timesheet.decline': 'Declined', 'timesheet.reopen': 'Reopened', 'timesheet.rate': 'Rate changed', 'timesheet.edit': 'Times corrected', 'clock.manual': 'Times set by hand', 'clock.managerOut': 'Clocked out by a manager',
};
const trailNote = (a) => a.detail?.reason || a.detail?.comment || a.detail?.reply || '';

function Detail({ t, can, isManager, see, act, busy, onClose, onDone, onPrev, onNext }) {
  const [mode, setMode] = useState(null);
  useEffect(() => setMode(null), [t.assignment_id]);
  const trail = useApi('timesheets.trail', { id: t.id }, { skip: !t.id });
  const confirm = useConfirm();
  const [run, rbusy] = useAction();
  if (mode === 'edit') return <EditSheet t={t} onClose={() => setMode(null)} onDone={onDone} />;
  if (mode === 'answer') return <AnswerSheet t={t} onClose={() => setMode(null)} onDone={onDone} />;
  const st = STATE[t.state] || STATE.awaiting;
  const reopen = async () => {
    if (!(await confirm({ title: 'Reopen this shift?', body: 'It goes back to awaiting review if there is a clock record, or to No clock-in if there is not.', confirm: 'Reopen' }))) return;
    run(() => api('timesheets.reopen', { id: t.id }), 'Reopened').then(onDone).catch(() => {});
  };
  const editable = isManager && t.id && !t.locked && !t.self_locked && !['cancelled', 'declined'].includes(t.state);
  const canReopen = isManager && t.state === 'declined' && !t.locked;
  // One main action for the state, Query beside it, everything else under …
  const actions = [
    can.approve && { key: 'approve', label: 'Approve', icon: Check, onClick: () => act.approve(t), busy },
    can.sign && { key: 'sign', label: 'Sign off', icon: Signature, onClick: () => act.sign(t), busy },
    can.answer && { key: 'answer', label: 'Answer', icon: MessageSquareReply, onClick: () => setMode('answer') },
    can.times && { key: 'times', label: 'Set times', icon: Clock, onClick: () => act.times(t) },
    can.clockout && { key: 'clockout', label: 'Set clock-out time', icon: LogOut, onClick: () => act.clockout(t) },
    canReopen && { key: 'reopen', label: 'Reopen', icon: Undo2, onClick: reopen, busy: rbusy },
    editable && { key: 'edit', label: t.state === 'queried' ? 'Correct' : 'Edit times', icon: PenLine, onClick: () => setMode('edit') },
    can.decline && { key: 'decline', label: 'Decline', icon: Ban, onClick: () => act.decline(t), danger: true },
  ].filter(Boolean);
  const main = actions.find((a) => ['approve', 'sign', 'answer', 'times', 'clockout', 'reopen'].includes(a.key));
  const more = actions.filter((a) => a !== main);
  const footer = (main || can.query || more.length > 0) && (
    <>
      <MoreMenu items={more} title={t.officer_name} />
      {can.query && <Button variant="secondary" icon={AlertTriangle} onClick={() => act.query(t)}>Query</Button>}
      {main && <Button icon={main.icon} busy={main.busy} onClick={main.onClick}>{main.label}</Button>}
    </>
  );
  return (
    <Sheet open side onClose={onClose} title={t.officer_name} footer={footer} onPrev={onPrev} onNext={onNext}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={st.tone}>{t.state === 'locked' && <Lock size={14} />}{st.label}</Pill>
          {t.state === 'signed' && <Pill tone="green"><Check size={14} />Venue signed</Pill>}
          <SelfPills row={t} />
          {(t.flags || []).map((f) => <Pill key={f} tone={FLAG_TONE[f] || 'grey'}>{titleCase(f)}</Pill>)}
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-bg/70 p-4">
          <div><div className="text-caption font-semibold uppercase text-faint">Scheduled</div><div className="num mt-0.5 font-semibold">{range(t.starts_at, t.ends_at)}</div></div>
          <div><div className="text-caption font-semibold uppercase text-faint">Actual</div><div className="mt-0.5 font-semibold"><Actual r={t} /></div></div>
          <div><div className="text-caption font-semibold uppercase text-faint">Hours</div><div className={cx('num mt-0.5 font-bold', t.state === 'declined' && 'line-through')}>{t.id ? hours(t.hours) : '—'}</div></div>
        </div>
        <KV items={[
          ['Date', dayLabel(t.starts_at)], ['Venue', t.venue_name], ['Role', t.role_name],
          t.id && ['Break', <span className="num">{t.break_minutes} min</span>],
          see.charge && t.id && ['Charge', <Rate r={t} k="charge" inline />],
          see.pay && t.id && ['Officer rate', <Rate r={t} k="pay" inline />],
          t.rate_note && ['Rate note', t.rate_note],
          t.approved_by_name && ['Approved by', `${t.approved_by_name}${t.approved_at ? `, ${relative(t.approved_at)}` : ''}`],
          (t.signed_by_name || t.auto_signed) && ['Signed', t.auto_signed ? 'Automatically' : `${t.signed_by_name}${t.signed_at ? `, ${relative(t.signed_at)}` : ''}`],
          t.dispute_comment && ['Query', `${t.dispute_comment}${t.queried_by_name ? ` — ${t.queried_by_name}` : ''}`],
          t.resolution && ['Resolution', t.resolution],
          t.state === 'declined' && ['Declined', `${t.decline_reason || 'Not worked'}${t.declined_by_name ? ` — ${t.declined_by_name}` : ''}`],
        ]} />
        {t.state === 'declined' && <p className="text-footnote text-muted">Not worked: no pay and no charge.</p>}
        {t.state === 'cancelled' && <p className="text-footnote text-red">The shift was cancelled after these hours were recorded. Decline them, or put the officer back on the Rota.</p>}
        {(t.flags || []).includes('cancelled_after_billing') && <p className="text-footnote text-red">Cancelled after it was paid or invoiced — issue a credit by hand.</p>}
        {t.locked && <p className="text-footnote text-muted">This timesheet is on an issued invoice or a pay run already with staff, so it can't be changed. Corrections now need a credit note.</p>}
        {!t.locked && t.invoice_status === 'draft' && <p className="text-footnote text-muted">On the venue's draft invoice. Changes here update the draft straight away; only venue-signed shifts are invoiced.</p>}
        {!t.locked && t.self_locked && <p className="text-footnote text-muted">{SELF_HINT}.</p>}
        {t.id && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-faint"><History size={14} />History</div>
            <Load q={trail} n={2}>{(list) => !list.length ? <p className="text-footnote text-faint">Nothing changed by hand yet.</p> : (
              <ol className="space-y-2">
                {list.map((a, i) => (
                  <li key={i} className="text-footnote">
                    <span className="font-semibold">{TRAIL[a.action] || titleCase(a.action.split('.').pop())}</span>
                    <span className="text-muted"> · {a.user_name || 'System'} · {relative(a.created_at)}</span>
                    {trailNote(a) && <div className="text-muted">{trailNote(a)}</div>}
                  </li>
                ))}
              </ol>
            )}</Load>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Sheets ---------- */

function DeclineSheet({ rows, onClose, onDone }) {
  const [reason, setReason] = useState(rows.every((r) => r.state === 'no_clock_in') ? 'No-show' : '');
  const [other, setOther] = useState('');
  const [run, busy] = useAction();
  const text = reason === 'Other' ? other.trim() : reason;
  const send = () => run(() => api('timesheets.decline', {
    ids: rows.filter((r) => r.id).map((r) => r.id), assignment_ids: rows.filter((r) => !r.id).map((r) => r.assignment_id), reason: text,
  }), (r) => `${r.declined} declined`).then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={rows.length > 1 ? `Decline ${rows.length} shifts` : 'Decline shift'} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" icon={Ban} onClick={send} busy={busy} disabled={!text}>Decline</Button></>}>
      <div className="space-y-3">
        <p className="text-subhead text-muted">{rows.length === 1 ? `${rows[0].officer_name} · ${rows[0].venue_name} · ${dayLabel(rows[0].starts_at)}. ` : ''}Not worked: no pay and no charge. The officer is told why.</p>
        <Segmented full value={reason} onChange={setReason} options={[...DECLINE_REASONS.filter((r) => r !== 'Shift cancelled'), 'Other'].map((r) => ({ value: r, label: r }))} />
        {reason === 'Other' && <Textarea label="Reason" rows={2} value={other} onChange={(e) => setOther(e.target.value)} />}
      </div>
    </Sheet>
  );
}

function RateSheet({ t, onClose, onDone }) {
  const f = useForm({ charge_rate: t.charge_rate ?? '', pay_rate: t.pay_rate ?? '', reason: '' });
  const [run, busy] = useAction();
  const ok = f.v.reason.trim() && (f.v.charge_rate !== '' || f.v.pay_rate !== '');
  const save = () => run(() => api('timesheets.setRate', {
    id: t.id, reason: f.v.reason.trim(),
    ...(f.v.charge_rate !== '' && Number(f.v.charge_rate) !== t.charge_rate ? { charge_rate: Number(f.v.charge_rate) } : {}),
    ...(f.v.pay_rate !== '' && Number(f.v.pay_rate) !== t.pay_rate ? { pay_rate: Number(f.v.pay_rate) } : {}),
  }), 'Rate changed').then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Rates for this shift" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} busy={busy} disabled={!ok}>Save</Button></>}>
      <div className="space-y-3">
        <p className="text-subhead text-muted">{t.officer_name} · {t.venue_name} · {dayLabel(t.starts_at)}. Only this shift changes; the rate cards stay as they are.</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Charge £/h" type="number" min="0" step="0.01" inputMode="decimal" {...f.bind('charge_rate')} />
          <Input label="Officer £/h" type="number" min="0" step="0.01" inputMode="decimal" {...f.bind('pay_rate')} />
        </div>
        <Textarea label="Reason" rows={2} placeholder="e.g. Agreed with the venue for the late finish" {...f.bind('reason')} />
        {t.state === 'signed' && <p className="text-caption text-faint">A new charge rate goes back to the venue to sign again.</p>}
      </div>
    </Sheet>
  );
}

function AnswerSheet({ t, onClose, onDone }) {
  const [reply, setReply] = useState('');
  const [run, busy] = useAction();
  const send = () => run(() => api('timesheets.answer', { id: t.id, reply: reply.trim() }), 'Answered').then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Answer query" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} busy={busy} disabled={!reply.trim()}>Send answer</Button></>}>
      <div className="space-y-3">
        {t.dispute_comment && <p className="rounded-2xl bg-red-soft px-3.5 py-2.5 text-subhead text-red">"{t.dispute_comment}"</p>}
        <Textarea label="Answer" rows={3} placeholder="e.g. Checked the door log: 03:00 is right" value={reply} onChange={(e) => setReply(e.target.value)} />
        <p className="text-caption text-faint">The times stay as they are and the shift goes back to awaiting review. To change the times, use Correct instead.</p>
      </div>
    </Sheet>
  );
}

function EditSheet({ t, onClose, onDone }) {
  const f = useForm({ start: toLondonInput(t.actual_start || t.starts_at), end: toLondonInput(t.actual_end || t.ends_at), break_minutes: t.break_minutes ?? 0, reason: '' });
  const [run, busy] = useAction();
  const ok = f.v.start && f.v.end && f.v.reason.trim();
  const save = () => run(() => api('timesheets.edit', {
    id: t.id, actual_start: fromLondonInput(f.v.start), actual_end: fromLondonInput(f.v.end), break_minutes: Number(f.v.break_minutes) || 0, reason: f.v.reason.trim(),
  }), 'Timesheet updated').then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Edit times"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} busy={busy} disabled={!ok}>Save</Button></>}>
      <div className="space-y-3">
        <p className="text-subhead text-muted">{t.officer_name} · {dayLabel(t.starts_at)} · rota <span className="num">{range(t.starts_at, t.ends_at)}</span></p>
        {t.dispute_comment && t.status === 'disputed' && <p className="rounded-2xl bg-red-soft px-3.5 py-2.5 text-subhead text-red">Query: "{t.dispute_comment}"</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Start" type="datetime-local" {...f.bind('start')} />
          <Input label="End" type="datetime-local" {...f.bind('end')} />
        </div>
        <Input label="Break (minutes)" type="number" min="0" inputMode="numeric" {...f.bind('break_minutes')} />
        <Textarea label="Reason" rows={3} placeholder="Shown to the venue and kept in the audit log" {...f.bind('reason')} />
        <p className="text-caption text-faint">Hours are recalculated using the company rounding rules.{t.status === 'disputed' || t.status === 'signed' ? ' The venue is asked to check it again.' : ''}</p>
      </div>
    </Sheet>
  );
}

function DisputeSheet({ t, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [run, busy] = useAction();
  const send = () => run(() => api('timesheets.dispute', { id: t.id, comment: comment.trim() }), 'Query sent').then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Query timesheet" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={send} busy={busy} disabled={!comment.trim()}>Send query</Button></>}>
      <p className="mb-3 text-subhead text-muted">{t.officer_name} · {dayLabel(t.starts_at)} · <span className="num">{t.actual_start ? range(t.actual_start, t.actual_end) : range(t.starts_at, t.ends_at)}</span> · <span className="num">{hours(t.hours)}</span></p>
      <Textarea label="What needs checking?" rows={4} placeholder="e.g. Officer left at 01:30, not 03:00" value={comment} onChange={(e) => setComment(e.target.value)} />
      <p className="mt-2 text-caption text-faint">The officer is told, and the row stays red until someone corrects or answers it.</p>
    </Sheet>
  );
}

function ManualSheet({ m, onClose, onDone }) {
  const f = useForm({ start: toLondonInput(m.starts_at), end: toLondonInput(m.ends_at), break_minutes: '', reason: '' });
  const [run, busy] = useAction();
  const ok = f.v.start && f.v.end && f.v.reason.trim();
  const save = () => run(() => api('clock.manual', {
    assignment_id: m.assignment_id, start: fromLondonInput(f.v.start), end: fromLondonInput(f.v.end), reason: f.v.reason.trim(),
    ...(f.v.break_minutes !== '' ? { break_minutes: Number(f.v.break_minutes) } : {}),
  }), 'Timesheet created').then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Set times"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} busy={busy} disabled={!ok}>Save</Button></>}>
      <div className="space-y-3">
        <p className="text-subhead text-muted">{m.officer_name} · {m.venue_name} · {dayLabel(m.starts_at)}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Start" type="datetime-local" {...f.bind('start')} />
          <Input label="End" type="datetime-local" {...f.bind('end')} />
        </div>
        <Input label="Break (minutes)" type="number" min="0" inputMode="numeric" placeholder="Planned break" {...f.bind('break_minutes')} />
        <Textarea label="Reason" rows={3} placeholder="e.g. Signed in on paper, confirmed by venue" {...f.bind('reason')} />
      </div>
    </Sheet>
  );
}
