import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ClipboardList, Pencil, Sparkles, Star, X } from 'lucide-react';
import {
  Button, cx, dateTime, dayLabel, Empty, hours, Input, Load, Page, Pill, Pressable, range, relative, Segmented, Select, Sheet, Tabs, Textarea, Tile, Toggle, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useBase } from './_parts.jsx';

const KIND = {
  cover: { label: 'Cover', tone: 'blue' },
  venue_request: { label: 'Venue request', tone: 'amber' },
  reconcile: { label: 'Hours check', tone: 'red' },
  feedback: { label: 'Feedback', tone: 'grey' },
  compliance: { label: 'Compliance', tone: 'red' },
};
const SEVERITY = { urgent: { label: 'Urgent', tone: 'red' }, soon: { label: 'Soon', tone: 'amber' }, advisory: { label: 'Advisory', tone: 'grey' } };
const ITEM_STATUS = { approved: 'Offers sent', done: 'Done', rejected: 'Rejected', expired: 'Expired', pending: 'Waiting' };

export default function OpsAI() {
  const { user } = useBase();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'inbox';
  const count = useApi('ops.count', {}, { poll: 30000 });
  const tabs = [
    { value: 'inbox', label: 'Inbox', count: count.data?.n }, { value: 'activity', label: 'Activity' },
    ...(user.role === 'company' ? [{ value: 'settings', label: 'Settings' }] : []),
  ];
  return (
    <Page title="Ops AI" subtitle="Your operations assistant. It prepares the work — you approve it."
      actions={<Button variant="secondary" icon={Sparkles} onClick={() => window.dispatchEvent(new Event('orb:askorb'))}>Orb</Button>}>
      <Tabs value={tab} onChange={(v) => setSp(v === 'inbox' ? {} : { tab: v }, { replace: true })} tabs={tabs} />
      {tab === 'inbox' && <Inbox onChange={count.reload} />}
      {tab === 'activity' && <Activity />}
      {tab === 'chat' && <AskOrbMoved />}
      {tab === 'settings' && user.role === 'company' && <OpsSettings />}
    </Page>
  );
}

/* ---------- Inbox ---------- */

function Inbox({ onChange }) {
  const [view, setView] = useState('pending');
  const q = useApi('ops.inbox', { status: view }, { poll: 30000 });
  const reload = () => { q.reload(); onChange(); };
  return (
    <>
      <div className="mb-4"><Segmented value={view} onChange={setView} options={[{ value: 'pending', label: 'To approve' }, { value: 'decided', label: 'Decided' }]} /></div>
      <Load q={q}>{(items) => (items.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{items.map((it) => <ItemCard key={it.id} it={it} onDone={reload} />)}</div>
      ) : (
        <Empty icon={Sparkles} title={view === 'pending' ? 'All clear' : 'Nothing decided yet'}
          body={view === 'pending' ? 'Ops AI checks every 5 minutes for no-shows, gaps on the rota, venue requests, feedback and hours that don\'t match.' : undefined} />
      ))}</Load>
    </>
  );
}

function ItemCard({ it, onDone }) {
  const { user } = useBase();
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const k = KIND[it.kind];
  const pending = it.status === 'pending';
  const p = it.payload || {};
  const approveLabel = { cover: 'Send offers', venue_request: 'Approve & publish', reconcile: p.info_only ? 'Mark reviewed' : 'Approve fix', feedback: 'Mark reviewed', compliance: 'Apply selected' }[it.kind];
  const allowed = (a) => !a.company_only || user.role === 'company';
  const [picked, setPicked] = useState(() => new Set((p.issues || []).flatMap((i) => i.actions.filter((a) => a.default && allowed(a)).map((a) => a.id))));

  const decide = (decision, extra = {}) => run(async () => {
    await api('ops.decide', { id: it.id, decision, ...extra });
    setEdit(false); setRejecting(false);
    onDone();
  }, decision === 'approve' ? 'Approved' : 'Rejected');

  const approve = async () => {
    if (it.kind === 'feedback') {
      const add = await confirm({ title: 'Add to HR notes?', body: 'Keep a record of this feedback on the officer\'s HR notes.', confirm: 'Add to HR notes' });
      return decide('approve', { edits: { hr_note: add } });
    }
    if (it.kind === 'compliance') return decide('approve', { edits: { actions: [...picked] } });
    return decide('approve');
  };

  return (
    <Tile className="flex flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Pill tone={k.tone}>{k.label}</Pill>
        {it.kind === 'compliance' && SEVERITY[p.severity] && <Pill tone={SEVERITY[p.severity].tone}>{SEVERITY[p.severity].label}</Pill>}
        {it.venue_name && <span className="truncate text-footnote font-semibold text-muted">{it.venue_name}</span>}
        <span className="ml-auto text-caption text-faint">{relative(it.created_at)}</span>
      </div>
      <div className="text-headline font-bold leading-snug">{it.title}</div>
      <p className="mt-1 text-subhead leading-relaxed text-muted">{it.reason}</p>

      <div className="mt-3 flex-1">
        {it.kind === 'cover' && <CoverBody it={it} />}
        {it.kind === 'venue_request' && <RequestBody it={it} />}
        {it.kind === 'reconcile' && <ReconcileBody p={p} />}
        {it.kind === 'compliance' && <ComplianceBody it={it} pending={pending} picked={picked} setPicked={setPicked} allowed={allowed} onChanged={onDone} />}
        {it.kind === 'feedback' && <div className="flex items-center gap-1 text-amber">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={18} fill={n <= p.rating ? 'currentColor' : 'none'} />)}<span className="ml-2 text-footnote text-muted">{p.shift}</span></div>}
      </div>

      {pending ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={Check} busy={busy} onClick={approve} disabled={(it.kind === 'cover' && !(p.officer_ids || []).length) || (it.kind === 'compliance' && !picked.size)}>{approveLabel}</Button>
          {['cover', 'venue_request'].includes(it.kind) && <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>}
          <Button variant="ghost" icon={X} onClick={() => setRejecting(true)}>Reject</Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-footnote text-muted">
          <Pill status={it.status === 'approved' ? 'published' : it.status === 'done' ? 'ok' : it.status}>{ITEM_STATUS[it.status]}</Pill>
          {it.decided_by_name && <span>by {it.decided_by_name}, {relative(it.decided_at)}</span>}
        </div>
      )}

      {edit && it.kind === 'cover' && <CoverEdit it={it} busy={busy} onClose={() => setEdit(false)} onSave={(ids) => decide('approve', { edits: { officer_ids: ids } })} />}
      {edit && it.kind === 'venue_request' && <RequestEdit it={it} busy={busy} onClose={() => setEdit(false)} onSave={(shifts) => decide('approve', { edits: { shifts } })} />}
      <RejectSheet open={rejecting} busy={busy} venue={it.kind === 'venue_request' && p.request_id} onClose={() => setRejecting(false)} onReject={(reason) => decide('reject', { reason })} />
    </Tile>
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
      ) : <div className="rounded-xl bg-amber-soft px-3 py-2 text-footnote text-amber">No one eligible is free.</div>}
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

function ReconcileBody({ p }) {
  const { base } = useBase();
  const f = p.figures || {};
  const bad = new Set((p.issues || []).map((i) => i.field));
  const cells = [
    { k: 'rota', label: 'Rota', v: f.rota_h }, { k: 'clock', label: 'Clocked', v: f.clock_h }, { k: 'ts', label: 'Timesheet', v: f.ts_h },
    { k: 'stmt', label: 'Pay', v: f.stmt_h }, { k: 'inv', label: 'Invoice', v: f.inv_h },
  ];
  const fix = p.fix || {};
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

function ComplianceBody({ it, pending, picked, setPicked, allowed, onChanged }) {
  const { base } = useBase();
  const p = it.payload || {};
  const [dismiss, setDismiss] = useState(null);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const toggle = (id, on) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const doDismiss = () => run(() => api('ops.dismissIssue', { id: it.id, key: dismiss.key, reason: reason.trim() }), 'Dismissed')
    .then(() => { setDismiss(null); setReason(''); onChanged(); }).catch(() => {});
  return (
    <div className="space-y-2">
      {p.officer_id && <Button size="sm" variant="soft" to={`${base}/staff/${p.officer_id}`}>Open {p.officer_name}</Button>}
      {(p.issues || []).map((i) => (
        <div key={i.key} className="rounded-2xl border border-line p-3">
          <div className="flex items-start gap-2">
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.severity === 'urgent' ? 'bg-red' : i.severity === 'soon' ? 'bg-amber' : 'bg-faint')} />
            <div className="min-w-0 flex-1">
              <div className="text-subhead font-semibold">{i.title}</div>
              {i.detail && <p className="text-footnote text-muted">{i.detail}</p>}
            </div>
            {pending && <Pressable press onClick={() => setDismiss(i)} className="shrink-0 -my-2 rounded-lg px-2 py-2.5 text-caption font-semibold text-muted hover:bg-bg">Dismiss</Pressable>}
          </div>
          {pending && i.actions.filter(allowed).length > 0 && (
            <div className="mt-2 space-y-1 pl-4">
              {i.actions.filter(allowed).map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-2 text-footnote">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-blue)]" checked={picked.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      {!pending && it.result?.done?.length > 0 && (
        <ul className="space-y-0.5 text-footnote text-green">{it.result.done.map((d) => <li key={d} className="flex gap-1.5"><Check size={14} className="mt-0.5 shrink-0" />{d}</li>)}</ul>
      )}
      {!pending && it.result?.auto_closed && <p className="text-footnote text-green">Cleared by itself: the details were updated.</p>}
      <Sheet open={!!dismiss} onClose={() => setDismiss(null)} title="Dismiss this issue?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDismiss(null)}>Cancel</Button><Button busy={busy} onClick={doDismiss}>Dismiss</Button></>}>
        <p className="mb-3 text-subhead text-muted">{dismiss?.title}. It won't be raised again unless the details behind it change.</p>
        <Textarea label="Reason (kept on record)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Renewal confirmed by phone, card in the post." />
      </Sheet>
    </div>
  );
}

function RejectSheet({ open, busy, venue, onClose, onReject }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Reject" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} onClick={() => onReject(reason)}>Reject</Button></>}>
      <Textarea label={venue ? 'Reason (sent to the venue)' : 'Reason (optional)'} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Sheet>
  );
}

/* ---------- Activity ---------- */

function Activity() {
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
    ) : <Empty icon={ClipboardList} title="No activity yet" body="Everything Ops AI does is logged here." />)}</Load>
  );
}

/* ---------- Chat (moved to Orb) ---------- */

function AskOrbMoved() {
  return (
    <Empty icon={Sparkles} title="Chat has moved to Orb" body="Orb is the round button at the bottom right of every page. It knows how the app works, looks things up, does small things straight away and asks you to confirm anything bigger."
      action={<Button icon={Sparkles} onClick={() => window.dispatchEvent(new Event('orb:askorb'))}>Open Orb</Button>} />
  );
}

/* ---------- Settings ---------- */

const JOBS = [
  { k: 'chase', label: 'Chase officers who haven\'t clocked in', hint: 'Asks them to reply, then escalates to you' },
  { k: 'cover', label: 'Find cover', hint: 'Shortlists free officers for gaps and no-shows' },
  { k: 'feedback', label: 'Ask venues for feedback', hint: 'After each shift, with one reminder' },
  { k: 'venue_requests', label: 'Venue request chat', hint: 'Venues ask for staff in plain words' },
  { k: 'reconcile', label: 'Check hours against pay and invoices', hint: 'Weekly, and after each pay run or invoice run' },
  { k: 'chat', label: 'Ask Ops AI chat', hint: 'For managers' },
  { k: 'orb_voice', label: 'Talk to Orb', hint: 'Managers can dictate or talk to Orb by voice' },
  { k: 'compliance', label: 'Compliance checks', hint: 'Licences, right to work and documents against the rota. Weekly' },
  { k: 'compliance_digest', label: 'Weekly compliance email', hint: 'After the weekly check, the worst issues by email to company managers' },
  { k: 'incident_ai', label: 'AI on incident reports', hint: 'Drafts from officers\' notes and photos; evidence review for managers' },
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function OpsSettings() {
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
    });
    q.setData(r);
  }, 'Saved');

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tile title="What Ops AI does">
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
          <Button variant="secondary" busy={running} onClick={() => runNow(() => api('ops.runNow', { reconcile: true }), 'Checks run — see the Inbox')}>Run checks now</Button>
          <Button variant="secondary" busy={checking} onClick={() => runCheck(() => api('ops.complianceRun', {}), (r) => `Checked ${r.checked} officers · ${r.attention} need attention`).catch(() => {})}>Run compliance check</Button>
        </div>
      </div>
    </div>
  );
}

const AI_MODULES = [
  { k: 'ops', label: 'Ops AI and incidents' }, { k: 'academy', label: 'Academy' }, { k: 'toolbox', label: 'Toolbox' }, { k: 'everyday', label: 'Everyday post checks' }, { k: 'orb', label: 'Orb assistant' }, { k: 'orb_voice', label: 'Orb voice' }, { k: 'contracts', label: 'Contracts AI' }, { k: 'venue_packs', label: 'Site packs AI' }, { k: 'clock_face', label: 'Clock-in face check' },
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
