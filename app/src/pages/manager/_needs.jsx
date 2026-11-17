import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CalendarClock, CalendarOff, Check, ChevronDown, ChevronRight, ClipboardCheck, FileSignature, Hand, Megaphone, PenLine, ReceiptText, ShieldAlert,
  ShieldCheck, Smartphone, Sparkles, TriangleAlert, UserX, Wallet, X,
} from 'lucide-react';
import { Button, cx, Pressable, dayLabel, isoDate, mondayOf, range, Sheet, Textarea, useApi, useToast } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { AcceptSheet } from './_cover.jsx';

// One row per to-do from todo.summary, used by Needs you (managers and venues) and the bell, so a row reads and acts
// the same wherever it shows. Rows with a list open in place with the buttons for each item; the rest link to the page.

export const TONE_CHIP = { red: 'bg-red-soft text-red', amber: 'bg-amber-soft text-amber', blue: 'bg-blue-soft text-blue' };
export const NEED_ICON = {
  exceptions: TriangleAlert, unfilled: CalendarClock, disputed: AlertTriangle, cantWork: UserX, cover: Megaphone, coverChange: Megaphone,
  incidentsToSign: FileSignature, openIncidents: ShieldAlert, graceEnding: CalendarClock, expiring: ShieldCheck, streams: Wallet, timeOff: CalendarOff,
  toApprove: ClipboardCheck, shiftRequests: Hand, phones: Smartphone, decisions: Sparkles, timesheets: ClipboardCheck, reports: FileSignature,
  invoices: ReceiptText, answer: Hand, resign: PenLine,
};

const when = (r) => `${dayLabel(r.starts_at)}, ${range(r.starts_at, r.ends_at)}`;
const portal = (link) => (link.match(/^\/(company|security)/) || [''])[0];

// What each item says, and its buttons. act(row, [action, body], message) hides the row at once and puts it back on error;
// ask(row, {...}) opens a sheet for a reason or a reply first.
const KIND = {
  cover: {
    line: (r) => [`${r.venue_name} · ${r.headcount} × ${r.role_name}`, when(r)],
    buttons: (r, { ask, accept }) => [
      { label: 'Decline', icon: X, variant: 'secondary', onClick: () => ask(r, { title: 'Decline this date?', label: 'Reason for the venue (optional)', danger: 'Decline', call: (t) => ['cover.decline', { id: r.id, reason: t, scope: 'one' }], done: 'Declined' }) },
      { label: 'Accept', icon: Check, onClick: () => accept(r) },
    ],
  },
  coverChange: {
    line: (r) => [`${r.venue_name} asked for a change`, r.change_reason ? `${when(r)} · “${r.change_reason}”` : when(r)],
    buttons: (r, { act, ask }) => [
      { label: 'Decline', icon: X, variant: 'secondary', onClick: () => ask(r, { title: 'Decline this change?', label: 'Reason for the venue (optional)', danger: 'Decline', call: (t) => ['cover.decideChange', { id: r.id, approve: false, reason: t }], done: 'Change declined' }) },
      { label: 'Approve', icon: Check, onClick: () => act(r, ['cover.decideChange', { id: r.id, approve: true, reason: '' }], 'Change approved') },
    ],
  },
  shiftRequests: {
    line: (r) => [`${r.officer_name} asks to work`, `${r.venue_name} · ${when(r)}`],
    buttons: (r, { act }) => [
      { label: 'Decline', icon: X, variant: 'secondary', onClick: () => act(r, ['shifts.decideRequest', { id: r.id, approve: false }], 'Request declined') },
      { label: 'Approve', icon: Check, onClick: () => act(r, ['shifts.decideRequest', { id: r.id, approve: true }], 'Officer booked') },
    ],
  },
  unfilled: {
    line: (r) => [`${r.venue_name} · ${r.filled}/${r.headcount} staffed`, when(r)],
    buttons: (r, { go, base }) => [{ label: 'Staff it', icon: ChevronRight, variant: 'soft', onClick: () => go(`${base}/rota?shift=${r.id}&assign=1&week=${mondayOf(isoDate(r.starts_at))}`) }],
  },
  exceptions: {
    line: (r) => [`${r.officer_name} · ${r.venue_name}`, r.exception_reason || `Clock ${r.kind === 'out' ? 'out' : 'in'} to check`],
    buttons: (r, { act }) => [
      { label: 'Reject', icon: X, variant: 'secondary', onClick: () => act(r, ['clock.decide', { id: r.id, approve: false }], 'Rejected') },
      { label: 'Approve', icon: Check, onClick: () => act(r, ['clock.decide', { id: r.id, approve: true }], 'Approved') },
    ],
  },
  toApprove: {
    line: (r) => [`${r.officer_name} · ${Number(r.hours).toFixed(2)} h`, `${r.venue_name} · ${when(r)}`],
    buttons: (r, { act }) => [{ label: 'Approve', icon: Check, onClick: () => act(r, ['timesheets.approve', { ids: [r.id] }], 'Timesheet approved') }],
    all: { label: 'Approve all shown', call: (ids) => ['timesheets.approve', { ids }], done: (n) => `${n} approved` },
  },
  disputed: {
    line: (r) => [`${r.officer_name} · ${r.venue_name}`, r.dispute_comment ? `“${r.dispute_comment}”` : when(r)],
    buttons: (r, { ask }) => [{ label: 'Reply', icon: PenLine, variant: 'soft', onClick: () => ask(r, { title: 'Reply to the query', label: 'Your answer (the hours go back for approval)', required: true, ok: 'Send reply', call: (t) => ['timesheets.answer', { id: r.id, reply: t }], done: 'Reply sent' }) }],
  },
  timeOff: {
    line: (r) => [`${r.officer_name} · ${r.kind || 'time off'}`, `${dayLabel(r.start_date)} – ${dayLabel(r.end_date)}${r.reason ? ` · ${r.reason}` : ''}`],
    buttons: (r, { act }) => [
      { label: 'Reject', icon: X, variant: 'secondary', onClick: () => act(r, ['timeoff.decide', { id: r.id, status: 'rejected' }], 'Time off rejected') },
      { label: 'Approve', icon: Check, onClick: () => act(r, ['timeoff.decide', { id: r.id, status: 'approved' }], 'Time off approved') },
    ],
  },
  phones: {
    line: (r) => [`${r.officer_name}`, r.label ? `New phone: ${r.label}` : 'New clock-in phone'],
    buttons: (r, { act }) => [
      { label: 'Reject', icon: X, variant: 'secondary', onClick: () => act(r, ['device.decide', { id: r.id, approve: false }], 'Phone rejected') },
      { label: 'Approve', icon: Check, onClick: () => act(r, ['device.decide', { id: r.id, approve: true }], 'Phone approved') },
    ],
  },
  streams: {
    line: (r) => [`${r.venue_name} · ${r.name}`, r.po_ref ? `PO ${r.po_ref}` : 'No PO yet'],
    buttons: (r, { act, go, base }) => [
      { label: 'Open', variant: 'secondary', onClick: () => go(`${base}/venues/${r.venue_id}?tab=streams`) },
      { label: 'Checked', icon: Check, onClick: () => act(r, ['streams.check', { id: r.id }], 'Marked as checked') },
    ],
  },
  timesheets: {
    line: (r) => [`${r.officer_name} · ${Number(r.hours).toFixed(2)} h`, when(r)],
    buttons: (r, { act }) => [{ label: 'Sign', icon: Check, onClick: () => act(r, ['timesheets.sign', { ids: [r.id] }], 'Signed') }],
    all: { label: 'Sign all shown', call: (ids) => ['timesheets.sign', { ids }], done: (n) => `${n} signed` },
  },
};
export const actionable = (key) => !!KIND[key];

/** item: a todo.summary row. onGo: called after it navigates (the bell closes itself). */
export function NeedRow({ item, venueId, onGo, layer }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const Icon = NEED_ICON[item.key] || ChevronRight;
  const go = (to) => { nav(to); onGo?.(); };
  const kind = KIND[item.key];
  const [, label] = item.title.match(/^\d+\s(.*)$/) || [null, item.title];
  const head = (
    <>
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', TONE_CHIP[item.tone] || TONE_CHIP.blue)}><Icon size={18} /></span>
      <span className="min-w-0 flex-1 text-subhead leading-snug"><span className="num font-bold">{item.count}</span> {label}</span>
      {kind ? <ChevronDown size={18} className={cx('shrink-0 text-faint transition', open && 'rotate-180')} /> : <ChevronRight size={18} className="shrink-0 text-faint" />}
    </>
  );
  if (!kind) return <Pressable onClick={() => go(item.link)} className="flex items-center gap-3 px-4 py-3">{head}</Pressable>;
  return (
    <div>
      <Pressable aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-3 px-4 py-3">{head}</Pressable>
      {open && <NeedItems item={item} kind={kind} venueId={venueId} go={go} layer={layer} />}
    </div>
  );
}

function NeedItems({ item, kind, venueId, go, layer }) {
  const q = useApi('todo.list', { key: item.key, venue_id: venueId, limit: 5 });
  const toast = useToast();
  const [gone, setGone] = useState(() => new Set());
  const [asking, setAsking] = useState(null); // { row, title, label, call, done, ... }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const base = portal(item.link);
  const hide = (ids, on) => setGone((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  // Optimistic: the row goes at once; the count, badge and bell catch up from the event the call fires
  const act = async (r, call, msg) => {
    hide([r.id], true);
    try { await api(...call); toast(msg); } catch (e) { hide([r.id], false); toast(e.message, 'error'); }
  };
  const ask = (r, a) => { setText(''); setAsking({ row: r, ...a }); };
  const accept = (r) => setAccepting(r);
  const rows = (q.data || []).filter((r) => !gone.has(r.id));
  const sendAsk = async () => {
    const a = asking;
    if (a.required && !text.trim()) return;
    setBusy(true);
    try { await act(a.row, a.call(text.trim()), a.done); setAsking(null); } finally { setBusy(false); }
  };
  const all = async () => {
    const ids = rows.map((r) => r.id);
    hide(ids, true);
    try { await api(...kind.all.call(ids)); toast(kind.all.done(ids.length)); } catch (e) { hide(ids, false); toast(e.message, 'error'); }
  };

  return (
    <div className="space-y-2 bg-bg/60 px-4 pb-3 pt-1">
      {q.error && !q.data && <p className="text-footnote text-muted">Couldn't load these. <Button variant="link" size="sm" onClick={q.reload}>Try again</Button></p>}
      {!q.data && !q.error && <p className="text-footnote text-muted">Loading…</p>}
      {q.data && !rows.length && <p className="text-footnote text-muted">All done here.</p>}
      {rows.map((r) => {
        const [title, sub] = kind.line(r);
        return (
          <div key={r.id} className="rounded-2xl border border-line bg-surface p-3">
            <div className="text-subhead font-semibold leading-snug">{title}</div>
            {sub && <div className="mt-0.5 text-footnote text-muted">{sub}</div>}
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              {kind.buttons(r, { act, ask, accept, go, base }).map((b) => (
                <Button key={b.label} size="sm" variant={b.variant} icon={b.icon} onClick={b.onClick}>{b.label}</Button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" onClick={() => go(item.link)}>See all{item.count > 5 ? ` ${item.count}` : ''}</Button>
        {kind.all && rows.length > 1 && <Button size="sm" variant="soft" icon={Check} onClick={all}>{kind.all.label}</Button>}
      </div>
      {asking && (
        <Sheet open size="sm" layer={layer} onClose={() => !busy && setAsking(null)} title={asking.title}
          footer={<><Button variant="secondary" disabled={busy} onClick={() => setAsking(null)}>Back</Button>
            <Button variant={asking.danger ? 'danger' : undefined} busy={busy} disabled={asking.required && !text.trim()} onClick={sendAsk}>{asking.danger || asking.ok}</Button></>}>
          <Textarea label={asking.label} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Sheet>
      )}
      {accepting && (
        <AcceptSheet id={accepting.id} layer={layer} label={`${accepting.venue_name} · ${when(accepting)}`} onClose={() => setAccepting(null)}
          onDone={(r, how) => {
            hide([accepting.id], true);
            setAccepting(null);
            const id = r?.id || r?.shift_ids?.[0];
            if (how === 'none' && id) go(`${base}/rota?shift=${id}&assign=1&week=${mondayOf(isoDate(accepting.starts_at))}`);
          }} />
      )}
    </div>
  );
}
