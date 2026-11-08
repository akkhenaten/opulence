import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowLeft, Ban, Check, ClipboardList, History, ListChecks, MapPin, Pencil, Settings, Sparkles, Star, User, X } from 'lucide-react';
import {
  ActionBar, Button, Callout, cx, MoreMenu, dateTime, dayLabel, Empty, hours, Input, Load, Page, Pill, Pressable, range, relative, Segmented, Select, Sheet, Tabs, Textarea, Tile, Toggle, useAction, useApi, useConfirm, useUrlState,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useBase } from './_parts.jsx';
import { GRACE_ISSUE, GraceButton } from '../people/_graceSheet.jsx';

const KIND = {
  cover: { label: 'Cover', tone: 'blue' },
  venue_request: { label: 'Venue request', tone: 'amber' },
  reconcile: { label: 'Hours check', tone: 'red' },
  feedback: { label: 'Feedback', tone: 'grey' },
  compliance: { label: 'Compliance', tone: 'red' },
  venue_setup: { label: 'Venue setup', tone: 'blue' },
  incident: { label: 'Incident', tone: 'amber' },
};
const RADIUS_CHOICES = [50, 75, 100, 150, 200, 300, 500];
const ISSUE_CARDS = ['compliance', 'venue_setup'];
const SEVERITY = { urgent: { label: 'Urgent', tone: 'red' }, soon: { label: 'Soon', tone: 'amber' }, advisory: { label: 'Advisory', tone: 'grey' } };
const ITEM_STATUS = { approved: 'Offers sent', done: 'Done', rejected: 'Rejected', expired: 'Expired', pending: 'Waiting' };

/* ---------- Inbox ---------- */

/**
 * Orb cards to approve. compact = one column, for the queue on Today.
 * slim = one header row with a … menu (Decided, Select several); scroll = the cards scroll on their own (the desktop column).
 * title / pill replace "Orb" and "N to approve"; before / after go above and below the cards (Today's other to-dos), and
 * empty replaces "All clear" when there is nothing at all.
 */
export function Inbox({ onChange, compact, slim, scroll, n, reloadKey, title = 'Orb', pill, before, after, empty, focus }) {
  const [view, setView] = useState('pending');
  const q = useApi('ops.inbox', { status: view }, { poll: 30000 });
  const reload = () => { q.reload(); onChange?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (reloadKey) q.reload(); }, [reloadKey]);
  // Bulk: cards of one kind at a time, each decided with Orb's default choices
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState([]);
  const [declining, setDeclining] = useState(false);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const items = view === 'pending' ? q.data || [] : [];
  const chosen = items.filter((it) => sel.includes(it.id));
  const kind = chosen[0]?.kind;
  const kinds = Object.entries(items.reduce((m, it) => ({ ...m, [it.kind]: (m[it.kind] || 0) + 1 }), {})).filter(([, n]) => n > 1);
  const stop = () => { setSelecting(false); setSel([]); setDeclining(false); };
  const toggle = (it) => setSel((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : kind && kind !== it.kind ? s : [...s, it.id]));
  const many = (decision, reason) => run(async () => {
    const r = await api('ops.decideMany', { ids: sel, decision, reason });
    stop(); reload();
    if (r.failed.length) window.dispatchEvent(new Event('orb:ops'));
    return r;
  }, (r) => `${decision === 'approve' ? 'Approved' : 'Declined'} ${r.done}${r.failed.length ? ` · ${r.failed.length} couldn't be done: ${r.failed[0].error}` : ''}`).catch(() => {});
  const approveMany = async () => {
    const ok = await confirm({
      title: `Approve ${chosen.length} ${KIND[kind].label.toLowerCase()} cards?`,
      body: ISSUE_CARDS.includes(kind) ? 'Each card applies what Orb ticked by default. Open a card on its own to change the choices first.' : 'Each card is approved as Orb proposed it.',
      confirm: `Approve ${chosen.length}`,
    });
    if (ok) many('approve');
  };
  const switchView = (v) => { setView(v); stop(); };
  const header = slim ? (
    <div className="mb-3 flex shrink-0 items-center gap-2">
      <Sparkles size={18} className="text-blue" />
      <h2 className="text-headline font-bold">{title}</h2>
      {view === 'pending' && (pill ?? (n > 0 && <Pill tone="blue">{n} to approve</Pill>))}
      {view === 'decided' && <span className="text-footnote font-semibold text-muted">Decided</span>}
      <div className="ml-auto flex items-center gap-1">
        {view === 'decided' && <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => switchView('pending')}>To approve</Button>}
        {selecting && <Button size="sm" variant="secondary" icon={X} onClick={stop}>Done</Button>}
        <MoreMenu label="Orb options" items={[
          view === 'pending' ? { label: 'Decided cards', icon: History, onClick: () => switchView('decided') } : { label: 'To approve', icon: Sparkles, onClick: () => switchView('pending') },
          view === 'pending' && kinds.length > 0 && (selecting ? { label: 'Stop selecting', icon: X, onClick: stop } : { label: 'Select several', icon: ListChecks, onClick: () => setSelecting(true) }),
        ]} />
      </div>
    </div>
  ) : (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={(v) => { setView(v); stop(); }} options={[{ value: 'pending', label: 'To approve' }, { value: 'decided', label: 'Decided' }]} />
        {view === 'pending' && kinds.length > 0 && (
          <Button size="sm" variant={selecting ? 'secondary' : 'ghost'} icon={selecting ? X : ListChecks} onClick={() => (selecting ? stop() : setSelecting(true))}>{selecting ? 'Done' : 'Select'}</Button>
        )}
      </div>
  );
  const body = (
    <>
      {selecting && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-footnote text-muted">{kind ? `${KIND[kind].label} cards only` : 'Pick cards of one kind, or all of:'}</span>
          {kinds.filter(([k]) => !kind || k === kind).map(([k, n]) => (
            <Button key={k} size="sm" variant="soft" onClick={() => setSel(items.filter((it) => it.kind === k).map((it) => it.id))}>All {KIND[k]?.label.toLowerCase()} ({n})</Button>
          ))}
        </div>
      )}
      {view === 'pending' && before}
      <Load q={q}>{(rows) => (rows.length ? (
        <div className={compact ? 'space-y-3' : 'grid grid-cols-1 gap-3 lg:grid-cols-2'}>
          {rows.map((it) => <ItemCard key={it.id} it={it} onDone={reload} compact={compact} focus={focus === it.id}
            select={selecting ? { on: sel.includes(it.id), can: !kind || kind === it.kind, toggle: () => toggle(it) } : null} />)}
        </div>
      ) : view === 'pending' && (before || after) ? null : view === 'pending' && empty ? empty : (
        <Empty icon={Sparkles} title={view === 'pending' ? 'All clear' : 'Nothing decided yet'}
          body={view === 'pending' ? 'Orb checks every 5 minutes for no-shows, gaps on the rota, venue requests, feedback, hours that don\'t match and venues missing an address, map pin, logo or clock-in radius.' : undefined} />
      ))}</Load>
      {view === 'pending' && after}
    </>
  );
  return (
    <>
      {header}
      {scroll ? (
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4 [mask-image:linear-gradient(to_bottom,#000_calc(100%-24px),transparent)]">{body}</div>
      ) : body}
      <ActionBar show={selecting && chosen.length > 0}>
        <span className="num mr-2 text-subhead font-semibold">{chosen.length} selected</span>
        <Button variant="secondary" size="sm" className="max-sm:hidden" onClick={() => setSel([])}>Clear</Button>
        <Button size="sm" icon={Check} busy={busy} onClick={approveMany}>Approve {chosen.length}</Button>
        <Button size="sm" variant="danger" icon={Ban} onClick={() => setDeclining(true)}>Decline {chosen.length}</Button>
      </ActionBar>
      <RejectSheet open={declining} busy={busy} many={chosen.length} venue={kind === 'venue_request'} setup={kind === 'venue_setup'} onClose={() => setDeclining(false)} onReject={(reason) => many('reject', reason)} />
    </>
  );
}

function ItemCard({ it, onDone, select, compact, focus }) {
  const { base, user } = useBase();
  const [more, setMore] = useState(!!focus);
  // Opened from a link to this card (say, Compliance → Open in Today): scroll to it and show it in full
  const el = useRef(null);
  useEffect(() => { if (focus) setTimeout(() => el.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }, [focus]);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const k = KIND[it.kind];
  const pending = it.status === 'pending';
  const p = it.payload || {};
  const [use, setUse] = useState('');
  const [ask, setAsk] = useState(p.ask || '');
  const [feedback, setFeedback] = useState(false);
  const approveLabel = { cover: 'Send offers', venue_request: 'Approve & publish', reconcile: p.info_only ? 'Mark reviewed' : 'Approve fix', feedback: 'Decide…', compliance: 'Apply selected', venue_setup: 'Apply selected', incident: it.officer_id ? 'Send back to the officer' : 'Mark reviewed' }[it.kind];
  const allowed = (a) => !a.company_only || user.role === 'company';
  const [picked, setPicked] = useState(() => new Set((p.issues || []).flatMap((i) => i.actions.filter((a) => a.default && allowed(a)).map((a) => a.id))));
  const [radius, setRadius] = useState(() => (p.issues || []).find((i) => i.key === 'radius')?.actions[0]?.params.radius_m || 150);
  // Nothing Orb can apply (say, no logo it could find): the card points to where to fix it by hand, and clears by itself once done
  const manual = ISSUE_CARDS.includes(it.kind) && !(p.issues || []).some((i) => i.actions.some(allowed));
  const reason = pending && manual
    ? (it.kind === 'venue_setup' ? 'Add it by hand in Site setup, then this card clears by itself.' : 'Fix it on their profile, then this card clears by itself.')
    : it.reason;
  const fixAt = it.kind === 'venue_setup' ? it.venue_id && { to: `${base}/venues/${it.venue_id}?tab=setup`, icon: MapPin, label: 'Open Setup' }
    : p.officer_id && { to: `${base}/staff/${p.officer_id}`, icon: User, label: `Open ${p.officer_name || 'profile'}` };
  const size = compact ? 'sm' : undefined;

  const decide = (decision, extra = {}) => run(async () => {
    await api('ops.decide', { id: it.id, decision, ...extra });
    setEdit(false); setRejecting(false);
    onDone();
  }, decision === 'approve' ? 'Approved' : 'Rejected').catch((e) => {
    // 409: the card no longer applies (the shift was filled or cancelled) and Orb has closed it
    if (e.status === 409) { window.dispatchEvent(new Event('orb:ops')); onDone(); }
  });

  const approve = async () => {
    if (it.kind === 'feedback') return setFeedback(true);
    if (it.kind === 'reconcile' && use) return decide('approve', { edits: { use } });
    if (it.kind === 'incident') return decide('approve', { edits: { ask, send: !!it.officer_id } });
    if (it.kind === 'compliance') return decide('approve', { edits: { actions: [...picked] } });
    if (it.kind === 'venue_setup') return decide('approve', { edits: { actions: [...picked], radius_m: Number(radius) } });
    return decide('approve');
  };

  return (
    <div ref={el} className="scroll-mt-24">
    <Tile className={cx('flex flex-col transition', select && !select.can && 'opacity-50', (select?.on || focus) && 'ring-2 ring-blue')}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {select && (
          <input type="checkbox" aria-label={`Select ${it.title}`} className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-blue)] disabled:cursor-not-allowed"
            checked={select.on} disabled={!select.can} onChange={select.toggle} />
        )}
        <Pill tone={k.tone}>{k.label}</Pill>
        {ISSUE_CARDS.includes(it.kind) && SEVERITY[p.severity] && <Pill tone={SEVERITY[p.severity].tone}>{SEVERITY[p.severity].label}</Pill>}
        {it.venue_name && !it.title?.startsWith(it.venue_name) && <span className="truncate text-footnote font-semibold text-muted">{it.venue_name}</span>}
        <span className="ml-auto text-caption text-faint">{relative(it.created_at)}</span>
      </div>
      <div className="text-headline font-bold leading-snug">{it.title}</div>
      {reason && <p className={cx('mt-1 text-subhead leading-relaxed text-muted', compact && !more && 'line-clamp-2')}>{reason}</p>}
      {compact && !more && reason?.length > 110 && <Pressable press onClick={() => setMore(true)} className="inline-block self-start text-footnote font-semibold text-blue hover:underline">More</Pressable>}

      <div className="mt-3 flex-1">
        {it.kind === 'cover' && <CoverBody it={it} />}
        {it.kind === 'venue_request' && <RequestBody it={it} />}
        {it.kind === 'reconcile' && <ReconcileBody p={p} use={pending ? use : ''} setUse={pending && setUse} />}
        {it.kind === 'incident' && <IncidentBody it={it} pending={pending} ask={ask} setAsk={setAsk} />}
        {ISSUE_CARDS.includes(it.kind) && <ComplianceBody it={it} pending={pending} manual={manual} picked={picked} setPicked={setPicked} allowed={allowed} onChanged={onDone} radius={radius} setRadius={setRadius} />}
        {it.kind === 'feedback' && p.rating && <div className="flex items-center gap-1 text-amber">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={18} fill={n <= p.rating ? 'currentColor' : 'none'} />)}<span className="ml-2 text-footnote text-muted">{p.shift}</span></div>}
        {it.kind === 'feedback' && p.comment_id && (
          <div className="mt-2 space-y-1">
            <div className="text-footnote font-semibold text-muted">{{ staff: 'About a member of staff', shift: 'About a shift', service: 'About the service', other: 'Other feedback' }[p.about] || 'Feedback'}{p.tone ? ` · ${p.tone[0].toUpperCase()}${p.tone.slice(1)}` : ''}{!p.rating && p.shift ? ` · ${p.shift}` : ''}</div>
            {p.note && <p className="whitespace-pre-line text-subhead">{p.note}</p>}
          </div>
        )}
      </div>

      {pending && select ? null : pending && manual ? (
        <div className={cx('flex flex-wrap gap-2', compact ? 'mt-3' : 'mt-4')}>
          {fixAt && <Button size={size} icon={fixAt.icon} to={fixAt.to}>{fixAt.label}</Button>}
          <Button size={size} variant="ghost" icon={X} onClick={() => setRejecting(true)}>Dismiss</Button>
        </div>
      ) : pending ? (
        <div className={cx('flex flex-wrap gap-2', compact ? 'mt-3' : 'mt-4')}>
          <Button size={size} icon={Check} busy={busy} onClick={approve} disabled={(it.kind === 'cover' && !(p.officer_ids || []).length) || (ISSUE_CARDS.includes(it.kind) && !picked.size)}>{approveLabel}</Button>
          {['cover', 'venue_request'].includes(it.kind) && <Button size={size} variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>}
          {it.kind === 'incident' && it.officer_id && <Button size={size} variant="secondary" busy={busy} onClick={() => decide('approve', { edits: { send: false } })}>Mark reviewed</Button>}
          <Button size={size} variant="ghost" icon={X} onClick={() => setRejecting(true)}>Reject</Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-footnote text-muted">
          <Pill status={it.status === 'approved' ? 'published' : it.status === 'done' ? 'ok' : it.status}>{ITEM_STATUS[it.status]}</Pill>
          {it.decided_by_name && <span>by {it.decided_by_name}, {relative(it.decided_at)}</span>}
        </div>
      )}

      {edit && it.kind === 'cover' && <CoverEdit it={it} busy={busy} onClose={() => setEdit(false)} onSave={(ids) => decide('approve', { edits: { officer_ids: ids } })} />}
      {edit && it.kind === 'venue_request' && <RequestEdit it={it} busy={busy} onClose={() => setEdit(false)} onSave={(shifts) => decide('approve', { edits: { shifts } })} />}
      {feedback && <FeedbackDecide it={it} busy={busy} onClose={() => setFeedback(false)} onSave={(edits) => decide('approve', { edits }).then(() => setFeedback(false))} />}
      <RejectSheet open={rejecting} busy={busy} dismiss={manual || it.kind === 'incident'} cover={it.kind === 'cover'} venue={it.kind === 'venue_request' && p.request_id} setup={it.kind === 'venue_setup'} onClose={() => setRejecting(false)} onReject={(reason, then) => decide('reject', { reason, then })} />
    </Tile>
    </div>
  );
}

function CoverBody({ it }) {
  const p = it.payload;
  const picks = (p.officer_ids || []).map((id) => p.candidates.find((c) => c.officer_id === id)).filter(Boolean);
  return (
    <div className="space-y-2">
      {it.shift && <div className="text-footnote font-semibold">{dayLabel(it.shift.starts_at)} · {range(it.shift.starts_at, it.shift.ends_at)} · {it.shift.filled}/{it.shift.headcount} filled</div>}
      {it.offers.length > 0 && it.status !== 'pending' ? (
        <div className="flex flex-wrap gap-1.5">{it.offers.map((o) => <Pill key={o.name} status={o.status === 'offered' ? 'pending' : o.status === 'filled_by_other' ? 'closed' : o.status}>{o.name} · {o.status === 'filled_by_other' ? 'filled' : o.status}</Pill>)}</div>
      ) : picks.length ? (
        <ul className="space-y-1.5">
          {picks.map((c) => (
            <li key={c.officer_id} className="rounded-xl bg-bg px-3 py-2">
              <div className="text-subhead font-semibold">{c.name}</div>
              <div className="text-caption text-muted">{c.reason}</div>
            </li>
          ))}
        </ul>
      ) : <Callout tone="warning">No one eligible is free.</Callout>}
    </div>
  );
}

function CoverEdit({ it, busy, onClose, onSave }) {
  const [ids, setIds] = useState(it.payload.officer_ids || []);
  const toggle = (id) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Sheet open onClose={onClose} title="Who gets the offer?" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ids.length} onClick={() => onSave(ids)}>Send to {ids.length}</Button></>}>
      <p className="mb-3 text-subhead text-muted">Everyone ticked gets the offer at once. The first to accept gets the shift.</p>
      <div className="space-y-2">
        {it.payload.candidates.map((c) => (
          <Pressable press key={c.officer_id} onClick={() => toggle(c.officer_id)}
            className={cx('flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition', ids.includes(c.officer_id) ? 'border-blue bg-blue-soft' : 'border-line bg-surface')}>
            <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border', ids.includes(c.officer_id) ? 'border-blue bg-blue text-white' : 'border-line')}>{ids.includes(c.officer_id) && <Check size={14} />}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-semibold">{c.name}</span>
              <span className="block text-footnote text-muted">{c.reason}</span>
            </span>
            {c.reliability != null && <span className="num shrink-0 text-footnote font-bold">{Math.round(c.reliability * 100)}%</span>}
          </Pressable>
        ))}
        {!it.payload.candidates.length && <Empty title="No eligible officers" body="Everyone is booked, on leave or not compliant for this shift." />}
      </div>
    </Sheet>
  );
}

const shiftLine = (s) => `${s.headcount || 1} × ${s.role_name || s.role} · ${dayLabel(s.date)} ${s.start}–${s.end}`;
function RequestBody({ it }) {
  const p = it.payload;
  return (
    <div className="space-y-2">
      {(it.request?.text || p.text) && <blockquote className="rounded-xl bg-bg px-3 py-2 text-subhead italic">“{it.request?.text || p.text}”</blockquote>}
      <div className="text-footnote font-semibold uppercase tracking-wide text-muted">{p.intent === 'new' ? 'New shifts' : p.intent === 'change' ? 'Change' : 'Cancel'}</div>
      <ul className="space-y-1">{(p.shifts || []).map((s, i) => <li key={i} className="text-subhead font-semibold">{p.intent === 'cancel' ? s.label || 'Cancel shift' : shiftLine(s)}</li>)}</ul>
    </div>
  );
}

function RequestEdit({ it, busy, onClose, onSave }) {
  const roles = useApi('roles.list', {});
  const [rows, setRows] = useState(it.payload.shifts || []);
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const cancel = it.payload.intent === 'cancel';
  return (
    <Sheet open onClose={onClose} title="Check the shifts" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => onSave(rows)}>Approve & publish</Button></>}>
      {cancel ? <p className="text-subhead text-muted">These shifts will be cancelled and the officers told.</p> : (
        <div className="space-y-3">
          {rows.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl bg-bg p-3 sm:grid-cols-5">
              <Input label="Date" type="date" value={s.date || ''} onChange={(e) => set(i, 'date', e.target.value)} className="col-span-2 sm:col-span-1" />
              <Input label="Start" type="time" value={s.start || ''} onChange={(e) => set(i, 'start', e.target.value)} />
              <Input label="Finish" type="time" value={s.end || ''} onChange={(e) => set(i, 'end', e.target.value)} />
              <Select label="Role" value={s.role || ''} onChange={(e) => set(i, 'role', e.target.value)} options={(roles.data || []).map((r) => ({ value: r.code, label: r.name }))} />
              <Input label="Officers" type="number" min="1" max="20" value={s.headcount || 1} onChange={(e) => set(i, 'headcount', Number(e.target.value))} />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// The same sums as the server (ops.mjs reconcileFix) when the manager picks which hours are right
function fixFor(f, use) {
  const truth = use === 'rota' ? f.rota_h : f.clock_h;
  const fix = {};
  if (truth == null) return fix;
  if (Math.abs(f.ts_h - truth) > 0.25) fix.timesheet_hours = truth;
  if (f.stmt_h != null && Math.abs(f.stmt_h - truth) > 0.25) fix.statement_hours = truth;
  const billable = Math.max(truth, Number(f.min_hours) || 0);
  if (f.inv_h != null && Math.abs(f.inv_h - billable) > 0.25) fix.invoice_hours = billable;
  return fix;
}

function ReconcileBody({ p, use, setUse }) {
  const { base } = useBase();
  const f = p.figures || {};
  const bad = new Set((p.issues || []).map((i) => i.field));
  const cells = [
    { k: 'rota', label: 'Rota', v: f.rota_h }, { k: 'clock', label: 'Clocked', v: f.clock_h }, { k: 'ts', label: 'Timesheet', v: f.ts_h },
    { k: 'stmt', label: 'Pay', v: f.stmt_h }, { k: 'inv', label: 'Invoice', v: f.inv_h },
  ];
  const fix = use ? fixFor(f, use) : p.fix || {};
  const choose = setUse && !p.info_only && f.rota_h != null;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1 text-center">
        {cells.map((c) => (
          <div key={c.k} className={cx('rounded-xl px-1 py-2', bad.has(c.k) ? 'bg-red-soft text-red' : 'bg-bg')}>
            <div className="text-caption2 font-semibold uppercase tracking-wide opacity-70">{c.label}</div>
            <div className="num text-body font-bold">{c.v == null ? '—' : hours(c.v)}</div>
          </div>
        ))}
      </div>
      {choose && (
        <div>
          <div className="mb-1 text-footnote font-semibold text-muted">Which hours are right?</div>
          <Segmented full value={use} onChange={setUse} options={[{ value: '', label: "Orb's pick" }, ...(f.clock_h != null ? [{ value: 'clock', label: 'Clocked' }] : []), { value: 'rota', label: 'Rota' }]} />
        </div>
      )}
      {!p.info_only && use && !Object.keys(fix).length && <div className="text-footnote text-muted">Nothing to change with these hours: approving marks it reviewed.</div>}
      {!p.info_only && Object.keys(fix).length > 0 && (
        <div className="text-footnote text-muted">Fix: {[fix.timesheet_hours != null && `timesheet → ${hours(fix.timesheet_hours)}`, fix.statement_hours != null && `pay → ${hours(fix.statement_hours)}`, fix.invoice_hours != null && `invoice → ${hours(fix.invoice_hours)}`].filter(Boolean).join(' · ')}</div>
      )}
      {p.info_only && (
        <div className="flex flex-wrap gap-2 text-footnote">
          {p.inv_id && base === '/company' && <Button size="sm" variant="soft" to={`/company/invoices/${p.inv_id}`}>Open invoice</Button>}
          {p.stmt_id && <Button size="sm" variant="soft" to={`${base}/pay/${p.stmt_id}`}>Open statement</Button>}
        </div>
      )}
    </div>
  );
}

function ComplianceBody({ it, pending, manual, picked, setPicked, allowed, onChanged, radius, setRadius }) {
  const { base, user } = useBase();
  const p = it.payload || {};
  // Licence or right to work stops them working: a company manager can let them work while they send it
  const grace = pending && it.kind === 'compliance' && user.role === 'company' && p.officer_id && (p.issues || []).some((i) => GRACE_ISSUE.test(i.key));
  const [dismiss, setDismiss] = useState(null);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const toggle = (id, on) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const venue = it.kind === 'venue_setup';
  // Venue setup cards list several issues: each shows its title, the detail and choices open on Show details
  const [shown, setShown] = useState(() => new Set());
  const expand = (k) => setShown((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const doDismiss = () => run(() => api(venue ? 'ops.dismissVenueIssue' : 'ops.dismissIssue', { id: it.id, key: dismiss.key, reason: reason.trim() }), 'Dismissed')
    .then(() => { setDismiss(null); setReason(''); onChanged(); }).catch(() => {});
  return (
    <div className="space-y-2">
      {((!(pending && manual) && p.officer_id) || grace) && (
        <div className="flex flex-wrap gap-2">
          {!(pending && manual) && p.officer_id && <Button size="sm" variant="soft" to={`${base}/staff/${p.officer_id}`}>Open {p.officer_name}</Button>}
          {grace && <GraceButton officer={{ id: p.officer_id, name: p.officer_name }} variant="secondary" onDone={onChanged} />}
        </div>
      )}
      {!(pending && manual) && venue && it.venue_id && <Button size="sm" variant="soft" icon={MapPin} to={`${base}/venues/${it.venue_id}?tab=setup`}>Open Setup</Button>}
      {(p.issues || []).map((i) => {
        const folded = venue && !shown.has(i.key);
        const acts = i.actions.filter(allowed);
        const on = acts.filter((a) => picked.has(a.id)).length;
        return (
        <div key={i.key} className="rounded-2xl border border-line p-3">
          <div className="flex items-start gap-2">
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.severity === 'urgent' ? 'bg-red' : i.severity === 'soon' ? 'bg-amber' : 'bg-faint')} />
            <div className="min-w-0 flex-1">
              <div className="text-subhead font-semibold">{i.title}</div>
              {i.detail && !folded && <p className="text-footnote text-muted">{i.detail}</p>}
              {venue && (i.detail || (pending && acts.length > 0)) && (
                <button type="button" onClick={() => expand(i.key)} aria-expanded={!folded} className="mt-0.5 text-footnote font-semibold text-blue hover:underline">
                  {folded ? `Show details${pending && acts.length ? ` · ${on} of ${acts.length} selected` : ''}` : 'Hide details'}
                </button>
              )}
            </div>
            {pending && !(manual && p.issues.length === 1) && <Pressable press onClick={() => setDismiss(i)} className="shrink-0 -my-2 rounded-lg px-2 py-2.5 text-caption font-semibold text-muted hover:bg-bg">Dismiss</Pressable>}
          </div>
          {pending && !folded && acts.length > 0 && (
            <div className="mt-2 space-y-1 pl-4">
              {i.actions.filter(allowed).map((a) => (
                <div key={a.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-footnote">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-blue)]" checked={picked.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />
                    <span>{a.kind === 'radius' && Number(radius) !== a.params.radius_m ? `Set the clock-in radius to ${radius} m` : a.label}</span>
                  </label>
                  {a.kind === 'logo' && (
                    <img src={a.params.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="ml-6 mt-1.5 h-12 max-w-[160px] rounded-lg border border-line bg-white object-contain p-1"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                  {a.kind === 'radius' && (
                    <Select aria-label="Clock-in radius" className="ml-6 mt-1.5 w-40" value={radius} onChange={(e) => { setRadius(Number(e.target.value)); toggle(a.id, true); }}
                      options={[...new Set([...RADIUS_CHOICES, a.params.radius_m])].sort((x, y) => x - y).map((r) => ({ value: r, label: `${r} m` }))} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        );
      })}
      {!pending && it.result?.done?.length > 0 && (
        <ul className="space-y-0.5 text-footnote text-green">{it.result.done.map((d) => <li key={d} className="flex gap-1.5"><Check size={14} className="mt-0.5 shrink-0" />{d}</li>)}</ul>
      )}
      {!pending && it.result?.skipped?.length > 0 && <ul className="space-y-0.5 text-footnote text-muted">{it.result.skipped.map((d) => <li key={d}>{d}</li>)}</ul>}
      {!pending && it.result?.auto_closed && <p className="text-footnote text-green">Cleared by itself: the details were updated.</p>}
      <Sheet open={!!dismiss} onClose={() => setDismiss(null)} title="Dismiss this issue?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDismiss(null)}>Cancel</Button><Button busy={busy} onClick={doDismiss}>Dismiss</Button></>}>
        <p className="mb-3 text-subhead text-muted">{dismiss?.title}. It won't be raised again unless the details behind it change.</p>
        <Textarea label="Reason (kept on record)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Renewal confirmed by phone, card in the post." />
      </Sheet>
    </div>
  );
}

function IncidentBody({ it, pending, ask, setAsk }) {
  const { base } = useBase();
  const p = it.payload;
  return (
    <div className="space-y-2">
      {p.mismatches?.length > 0 && (
        <div><div className="text-footnote font-semibold text-red">Doesn't match the report</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-subhead">{p.mismatches.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
      )}
      {p.missing?.length > 0 && (
        <div><div className="text-footnote font-semibold text-muted">Missing</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-subhead">{p.missing.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
      )}
      {pending && it.officer_id && <Textarea label={`Message to ${p.officer_name || 'the officer'} (the report goes back to them)`} rows={4} value={ask} onChange={(e) => setAsk(e.target.value)} />}
      <Button size="sm" variant="soft" to={`${base}/incidents/${p.incident_id}`}>Open {p.ref || 'the report'}</Button>
    </div>
  );
}

// What to do about a venue's feedback: any of an HR note, a reply to the venue and keeping the officer away from that venue
function FeedbackDecide({ it, busy, onClose, onSave }) {
  const { user } = useBase();
  const [hrNote, setHrNote] = useState(true);
  // The venue asked not to have them back: the bar comes pre-ticked, the company still decides
  const [ban, setBan] = useState(!!it.payload?.ban_asked);
  const [reply, setReply] = useState('');
  const officer = !!it.officer_id;
  return (
    <Sheet open onClose={onClose} title="What should happen?" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => onSave({ hr_note: officer && hrNote, ban: officer && ban, reply })}>Done</Button></>}>
      <div className="space-y-3">
        {officer && <Toggle label="Add to their HR notes" hint="Keeps a record of this feedback on the officer's profile" checked={hrNote} onChange={setHrNote} />}
        {officer && user.role === 'company' && it.venue_id && <Toggle label={`Don't send them to ${it.venue_name || 'this venue'} again`} hint="Bars them from this venue on the rota and in cover offers" checked={ban} onChange={setBan} />}
        {it.venue_id && <Textarea label="Reply to the venue (optional)" hint="Sent to the venue's managers in the app and by email" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />}
      </div>
    </Sheet>
  );
}

const COVER_THEN = [
  { value: 'next', label: 'Offer the next officers', hint: 'Orb picks the next best free officers and makes a new card' },
  { value: 'agency', label: "We'll use agency staff", hint: 'Noted in Orb activity; Orb stops looking for this shift' },
  { value: 'unfilled', label: 'Leave it unfilled', hint: 'Orb stops looking for this shift' },
];

function RejectSheet({ open, busy, venue, setup, many, dismiss, cover, onClose, onReject }) {
  const [reason, setReason] = useState('');
  const [then, setThen] = useState('next');
  const label = many ? `Decline ${many}` : dismiss ? 'Dismiss' : 'Reject';
  return (
    <Sheet open={open} onClose={onClose} title={label} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} onClick={() => onReject(reason, cover ? then : undefined)}>{label}</Button></>}>
      {(many > 0 || setup) && <p className="mb-3 text-subhead text-muted">{[many > 0 && 'The same reason is kept on each card.', setup && "Orb won't ask about these details again unless they change."].filter(Boolean).join(' ')}</p>}
      {cover && (
        <div className="mb-3 space-y-2" role="radiogroup" aria-label="Then">
          <div className="text-footnote font-semibold text-muted">Not these officers. Then:</div>
          {COVER_THEN.map((o) => (
            <Pressable press key={o.value} role="radio" aria-checked={then === o.value} onClick={() => setThen(o.value)}
              className={cx('flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition', then === o.value ? 'border-blue bg-blue-soft' : 'border-line bg-surface')}>
              <span className={cx('mt-1 h-4 w-4 shrink-0 rounded-full border-2', then === o.value ? 'border-blue bg-blue' : 'border-line')} />
              <span className="min-w-0 flex-1"><span className="block text-body font-semibold">{o.label}</span><span className="block text-footnote text-muted">{o.hint}</span></span>
            </Pressable>
          ))}
        </div>
      )}
      <Textarea label={venue ? 'Reason (sent to the venue)' : 'Reason (optional)'} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Sheet>
  );
}

/* ---------- Orb page: the log (reached from … on Today); settings are in Settings → Orb ---------- */

export default function OrbPage() {
  const { user, base } = useBase();
  const company = user.role === 'company';
  const [url] = useUrlState({ tab: 'activity' });
  // Orb's settings live in Settings → Orb; old links land there
  if (company && url.tab === 'settings') return <Navigate to={`${base}/settings?tab=orb`} replace />;
  return (
    <Page title="Orb" back={{ to: base, label: 'Today' }} subtitle="What Orb has done"
      actions={company && <Button variant="secondary" icon={Settings} to={`${base}/settings?tab=orb`}>Orb settings</Button>}>
      <Activity />
    </Page>
  );
}

/* ---------- Activity ---------- */

export function Activity() {
  const q = useApi('ops.activity', {}, { poll: 60000 });
  return (
    <Load q={q}>{(rows) => (rows.length ? (
      <Tile pad={false} className="overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 px-4 py-3">
              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-soft text-blue"><ClipboardList size={14} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-subhead leading-snug">{r.text}</div>
                <div className="mt-0.5 text-caption text-faint">{dateTime(r.created_at)}{Number(r.credits) > 0 && ` · ${Math.round(Number(r.credits)).toLocaleString('en-GB')} credits`}</div>
              </div>
            </li>
          ))}
        </ul>
      </Tile>
    ) : <Empty icon={ClipboardList} title="No activity yet" body="Everything Orb does is logged here." />)}</Load>
  );
}

/* ---------- Settings ---------- */

const JOBS = [
  { k: 'chase', label: 'Chase officers who haven\'t clocked in', hint: 'Asks them to reply, then escalates to you' },
  { k: 'pack', label: 'Chase unsigned site packs before shifts', hint: 'Officers who can\'t clock in until they sign: chased, then you are told, then cover is prepared' },
  { k: 'cover', label: 'Find cover', hint: 'Shortlists free officers for gaps and no-shows' },
  { k: 'feedback', label: 'Ask venues for feedback', hint: 'After each shift, with one reminder' },
  { k: 'reconcile', label: 'Check hours against pay and invoices', hint: 'Weekly, and after each pay run or invoice run' },
  { k: 'chat', label: 'Orb chat for managers', hint: 'For managers' },
  { k: 'orb_voice', label: 'Talk to Orb', hint: 'Managers can dictate or talk to Orb by voice' },
  { k: 'compliance', label: 'Compliance checks', hint: 'Licences, right to work and documents against the rota. Weekly' },
  { k: 'venue_setup', label: 'Check venue details', hint: 'Address, map pin, logo and clock-in radius: Orb finds what is missing and proposes it for you to approve' },
  { k: 'grace', label: 'Grace periods', hint: 'Reminds officers on a grace period 3 days and 1 day before it ends, closes it once their documents are in, and raises a card when it runs out' },
  { k: 'compliance_digest', label: 'Weekly compliance email', hint: 'After the weekly check, the worst issues by email to company managers' },
  { k: 'incident_ai', label: 'AI on incident reports', hint: 'Drafts from officers\' notes and photos; evidence review for managers' },
];
const PACK_TIMES = [
  { k: 'ops_pack_chase1', label: 'First chase to the officer' },
  { k: 'ops_pack_chase2', label: 'Second chase' },
  { k: 'ops_pack_escalate', label: 'Tell managers' },
  { k: 'ops_pack_cover', label: 'Prepare cover' },
];
const packHint = (m) => { const n = Number(m); return !Number.isFinite(n) || m === '' ? '' : n === 0 ? 'At the start time' : `${Math.abs(n)} min ${n < 0 ? 'before' : 'after'} the start`; };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function OpsSettings() {
  const q = useApi('ops.settings.get', {});
  const [run, busy] = useAction();
  const [runNow, running] = useAction();
  const [runCheck, checking] = useAction();
  const [v, setV] = useState(null);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  if (!v) return <Load q={q}>{() => null}</Load>;
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const used = Number(v.ops_ai_used || 0);
  const cap = Number(v.ops_ai_cap_credits || 0);
  const pct = cap ? Math.min(100, (used / cap) * 100) : 100;
  const save = () => run(async () => {
    const r = await api('ops.settings.save', {
      ops_jobs: v.ops_jobs, ops_escalate_minutes: Number(v.ops_escalate_minutes), ops_offer_wait_minutes: Number(v.ops_offer_wait_minutes),
      ops_reconcile_dow: Number(v.ops_reconcile_dow), ops_compliance_dow: Number(v.ops_compliance_dow), ops_ai_cap_credits: Number(v.ops_ai_cap_credits),
      ...Object.fromEntries(PACK_TIMES.map((t) => [t.k, Number(v[t.k])])),
      ops_house_rules: v.ops_house_rules || '',
    });
    q.setData(r);
  }, 'Saved');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tile title="What Orb does">
        <div className="divide-y divide-line">
          {JOBS.map((j) => <div key={j.k} className="py-2"><Toggle label={j.label} hint={j.hint} checked={v.ops_jobs?.[j.k] !== false} onChange={(c) => set('ops_jobs', { ...v.ops_jobs, [j.k]: c })} /></div>)}
        </div>
      </Tile>
      <div className="space-y-4">
        <Tile title="Timings">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Escalate after no reply (min)" type="number" min="1" max="240" value={v.ops_escalate_minutes} onChange={(e) => set('ops_escalate_minutes', e.target.value)} hint="After the grace period" />
            <Input label="Wait for cover replies (min)" type="number" min="1" max="240" value={v.ops_offer_wait_minutes} onChange={(e) => set('ops_offer_wait_minutes', e.target.value)} hint="Then offers the next officers" />
            <Select label="Weekly hours check" value={v.ops_reconcile_dow} onChange={(e) => set('ops_reconcile_dow', e.target.value)} options={DAYS.map((d, i) => ({ value: i + 1, label: d }))} />
            <Select label="Weekly compliance check" value={v.ops_compliance_dow} onChange={(e) => set('ops_compliance_dow', e.target.value)} options={DAYS.map((d, i) => ({ value: i + 1, label: d }))} />
          </div>
        </Tile>
        {v.ops_jobs?.pack !== false && (
          <Tile title="Unsigned site pack">
            <p className="mb-3 text-footnote text-muted">Minutes from the shift start. Use a minus for before the start. Stops as soon as the officer signs.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PACK_TIMES.map((t) => (
                <Input key={t.k} label={t.label} type="number" min="-240" max="240" step="1" value={v[t.k]} onChange={(e) => set(t.k, e.target.value)} hint={packHint(v[t.k])} />
              ))}
            </div>
          </Tile>
        )}
        <Tile title="House rules for Orb">
          <Textarea rows={6} maxLength={2000} autoGrow minRows={6} value={v.ops_house_rules || ''} onChange={(e) => set('ops_house_rules', e.target.value)}
            placeholder={'e.g. Prefer officers who have worked the venue before.\nNever offer cover to officers under 21 at nightclubs.\nAlways remind before giving a grace period.'}
            hint={`How your company likes things done. Orb follows these in chat, voice and its card advice, but they can't skip a Confirm tap, show pay to someone who can't see it, or bend the law. ${(v.ops_house_rules || '').length}/2000`} />
        </Tile>
        <Tile title="AI usage this month">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="num text-title2 font-bold">{Math.round(used).toLocaleString('en-GB')}</span>
            <span className="text-footnote text-muted">of {cap.toLocaleString('en-GB')} credits</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg"><div className={cx('h-full rounded-full', pct >= 90 ? 'bg-red' : 'bg-blue')} style={{ width: `${pct}%` }} /></div>
          <Input className="mt-3" label="Monthly cap (credits)" type="number" min="0" step="10000" value={v.ops_ai_cap_credits} onChange={(e) => set('ops_ai_cap_credits', e.target.value)}
            hint="AI features pause at the cap. Reminders, records and escalations keep running." />
        </Tile>
        <ModuleUsage />
        <div className="flex flex-wrap gap-2">
          <Button busy={busy} onClick={save}>Save settings</Button>
          <Button variant="secondary" busy={running} onClick={() => runNow(() => api('ops.runNow', { reconcile: true }), 'Checks run — new cards are on Today')}>Run checks now</Button>
          <Button variant="secondary" busy={checking} onClick={() => runCheck(() => api('ops.complianceRun', {}), (r) => `Checked ${r.checked} officers · ${r.attention} need attention`).catch(() => {})}>Run compliance check</Button>
        </div>
      </div>
    </div>
  );
}

const AI_MODULES = [
  { k: 'ops', label: 'Orb operations and incidents' }, { k: 'academy', label: 'Academy' }, { k: 'toolbox', label: 'Toolbox' }, { k: 'everyday', label: 'Everyday post checks' }, { k: 'orb', label: 'Orb assistant' }, { k: 'orb_voice', label: 'Orb voice' }, { k: 'contracts', label: 'Contracts AI' }, { k: 'venue_packs', label: 'Site packs AI' }, { k: 'clock_face', label: 'Clock-in face check' },
];

// Credits used this month by each AI feature, with an optional cap per feature inside the overall cap
function ModuleUsage() {
  const { user } = useBase();
  const q = useApi('ai.usage', {}, { skip: user.role !== 'company' });
  const [caps, setCaps] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => { if (q.data) setCaps(Object.fromEntries(AI_MODULES.map((m) => [m.k, q.data.caps?.[m.k] ?? '']))); }, [q.data]);
  if (user.role !== 'company' || !q.data || !caps) return null;
  const dirty = AI_MODULES.some((m) => String(q.data.caps?.[m.k] ?? '') !== String(caps[m.k]));
  const save = () => run(() => api('settings.update', { ai_module_caps: caps }), 'Caps saved').then(q.reload).catch(() => {});
  return (
    <Tile title="Credits by feature">
      <div className="divide-y divide-line">
        {AI_MODULES.map((m) => {
          const used = Math.round(q.data.used?.[m.k] || 0);
          return (
            <div key={m.k} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-body font-medium">{m.label}</div>
                <div className="num text-footnote text-muted">{used.toLocaleString('en-GB')} credits this month</div>
              </div>
              <Input type="number" min="0" step="1000" inputMode="numeric" placeholder="No cap" aria-label={`${m.label} cap`} value={caps[m.k]} onChange={(e) => setCaps((c) => ({ ...c, [m.k]: e.target.value }))}
                className="w-28 shrink-0" inputClassName="num text-right" />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-caption text-faint">Leave blank for no extra cap. A feature pauses when it reaches its cap.</p>
        <Button size="sm" variant="secondary" busy={busy} disabled={!dirty} onClick={save}>Save caps</Button>
      </div>
    </Tile>
  );
}
