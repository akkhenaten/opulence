import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, ClipboardCheck, Clock, Lock, PenLine, Signature } from 'lucide-react';
import {
  ActionBar, addDays, Avatar, Button, cx, dayLabel, Empty, hours, Input, isoDate, KV, List, Load, mondayOf, Page, Pill, range, relative, Sheet, Tabs, Textarea, titleCase, useAction, useApi, useForm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { Check as Tick, fromLondonInput, londonIso, toLondonInput, useBase } from '../manager/_parts.jsx';

const FLAG_TONE = { late: 'amber', left_early: 'amber', exception: 'red', no_clock_out: 'red', manual: 'blue', edited: 'blue' };

export default function Timesheets() {
  const { user, isManager } = useBase();
  const isVenue = user.role === 'venue';
  const canSign = user.role === 'company' || isVenue;
  const canDispute = user.role === 'company' || isVenue;
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') || (isVenue ? 'approved' : 'pending');
  const setStatus = (s) => { const n = new URLSearchParams(sp); n.set('status', s); setSp(n, { replace: true }); setSel(new Set()); };

  const [from, setFrom] = useState(() => addDays(mondayOf(isoDate()), -7));
  const [to, setTo] = useState(() => addDays(mondayOf(isoDate()), 6));
  const [sel, setSel] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const [run, busy] = useAction();

  const missingTab = status === 'missing';
  const body = useMemo(() => ({ ...(status !== 'all' && !missingTab ? { status } : {}), from: londonIso(from), to: londonIso(addDays(to, 1)) }), [status, from, to, missingTab]);
  const q = useApi('timesheets.list', body, { skip: missingTab });
  const missing = useApi('timesheets.missing', {}, { skip: !isManager });

  const tabs = [
    ...(isVenue ? [] : [{ value: 'pending', label: 'To approve' }]),
    { value: 'approved', label: canSign ? 'To sign' : 'Approved' },
    { value: 'signed', label: 'Signed' },
    { value: 'disputed', label: 'Disputed' },
    { value: 'all', label: 'All' },
    ...(isManager ? [{ value: 'missing', label: 'Missing', count: missing.data?.length }] : []),
  ];

  const rows = q.data || [];
  const actionable = (t) => !t.locked && ((isManager && t.status === 'pending') || (canSign && t.status === 'approved'));
  const chosen = rows.filter((t) => sel.has(t.id));
  const toApprove = isManager ? chosen.filter((t) => t.status === 'pending') : [];
  const toSign = canSign ? chosen.filter((t) => t.status === 'approved') : [];
  const toggle = (id, on) => setSel((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const selectable = rows.filter(actionable);
  const allOn = selectable.length > 0 && selectable.every((t) => sel.has(t.id));
  const done = () => { setSel(new Set()); q.reload(); missing.reload(); };

  const approve = (ids) => run(() => api('timesheets.approve', { ids }), (r) => `${r.approved} approved`).then(done).catch(() => {});
  const sign = (ids) => run(() => api('timesheets.sign', { ids }), (r) => `${r.signed} signed`).then(done).catch(() => {});

  const totalH = rows.reduce((n, t) => n + Number(t.hours || 0), 0);

  return (
    <Page title="Timesheets" subtitle={missingTab ? 'Shifts with no clock record' : `${rows.length} shown · ${hours(totalH)}`} wide>
      <Tabs value={status} onChange={setStatus} tabs={tabs} />

      {missingTab ? <Missing q={missing} onDone={done} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <Input label="From" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-[150px]" />
            <Input label="To" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-[150px]" />
            {selectable.length > 0 && (
              <Button variant="ghost" size="sm" className="mb-1.5 sm:ml-auto" onClick={() => setSel(allOn ? new Set() : new Set(selectable.map((t) => t.id)))}>
                {allOn ? 'Clear selection' : `Select all ${selectable.length}`}
              </Button>
            )}
          </div>

          <Load q={q}>{(list) => !list.length ? (
            <Empty icon={ClipboardCheck} title="No timesheets" body={status === 'pending' ? 'Nothing waiting for approval in these dates.' : status === 'approved' && canSign ? 'Nothing waiting for sign-off in these dates.' : 'Try a wider date range.'} />
          ) : (
            <List>
              {list.map((t) => (
                <div key={t.id} role="button" tabIndex={0} onClick={() => setOpen(t)} onKeyDown={(e) => e.key === 'Enter' && setOpen(t)}
                  className={cx('flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-bg', sel.has(t.id) && 'bg-blue-soft/50')}>
                  {actionable(t) ? <Tick checked={sel.has(t.id)} onChange={(on) => toggle(t.id, on)} label={`Select ${t.officer_name}`} /> : <span className="grid h-[22px] w-[22px] shrink-0 place-items-center text-faint">{t.locked && <Lock size={14} />}</span>}
                  <Avatar name={t.officer_name} size={36} className="hidden sm:grid" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-semibold">{t.officer_name}</div>
                    <div className="truncate text-footnote text-muted">{dayLabel(t.starts_at)} · {t.venue_name} · {t.role_name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                      <span>Rota <span className="num">{range(t.starts_at, t.ends_at)}</span></span>
                      {t.actual_start && <span>Actual <span className="num font-semibold text-ink">{range(t.actual_start, t.actual_end)}</span></span>}
                      {(t.flags || []).map((f) => <Pill key={f} tone={FLAG_TONE[f] || 'grey'} className="!py-0 !text-caption2">{titleCase(f)}</Pill>)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-callout font-bold">{hours(t.hours)}</span>
                    <Pill status={t.status} />
                  </div>
                </div>
              ))}
            </List>
          )}</Load>
        </>
      )}

      <ActionBar show={toApprove.length > 0 || toSign.length > 0}>
        <span className="num mr-2 text-subhead font-semibold">{chosen.length} selected</span>
        <Button variant="secondary" size="sm" onClick={() => setSel(new Set())}>Clear</Button>
        {toApprove.length > 0 && <Button size="sm" icon={Check} busy={busy} onClick={() => approve(toApprove.map((t) => t.id))}>Approve {toApprove.length}</Button>}
        {toSign.length > 0 && <Button size="sm" icon={Signature} busy={busy} onClick={() => sign(toSign.map((t) => t.id))}>Sign {toSign.length}</Button>}
      </ActionBar>

      {open && <Detail t={open} isManager={isManager} canSign={canSign} canDispute={canDispute} onClose={() => setOpen(null)}
        onDone={() => { setOpen(null); done(); }} approve={approve} sign={sign} busy={busy} />}
    </Page>
  );
}

function Detail({ t, isManager, canSign, canDispute, onClose, onDone, approve, sign, busy }) {
  const [mode, setMode] = useState(null); // edit | dispute
  if (mode === 'edit') return <EditSheet t={t} onClose={() => setMode(null)} onDone={onDone} />;
  if (mode === 'dispute') return <DisputeSheet t={t} onClose={() => setMode(null)} onDone={onDone} />;
  const footer = !t.locked && (
    <>
      {canDispute && ['approved', 'pending'].includes(t.status) && <Button variant="danger" icon={AlertTriangle} onClick={() => setMode('dispute')}>Query</Button>}
      {isManager && <Button variant="secondary" icon={PenLine} onClick={() => setMode('edit')}>{t.status === 'disputed' ? 'Correct' : 'Edit'}</Button>}
      {isManager && t.status === 'pending' && <Button icon={Check} busy={busy} onClick={() => approve([t.id]).then(onClose)}>Approve</Button>}
      {canSign && t.status === 'approved' && <Button icon={Signature} busy={busy} onClick={() => sign([t.id]).then(onClose)}>Sign off</Button>}
    </>
  );
  return (
    <Sheet open onClose={onClose} title={t.officer_name} footer={footer}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill status={t.status} />{t.locked && <Pill tone="grey"><Lock size={14} />Locked</Pill>}
          {(t.flags || []).map((f) => <Pill key={f} tone={FLAG_TONE[f] || 'grey'}>{titleCase(f)}</Pill>)}
        </div>
        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-bg/70 p-4">
          <div><div className="text-caption font-semibold uppercase text-faint">Rota</div><div className="num mt-0.5 font-semibold">{range(t.starts_at, t.ends_at)}</div></div>
          <div><div className="text-caption font-semibold uppercase text-faint">Actual</div><div className="num mt-0.5 font-semibold">{t.actual_start ? range(t.actual_start, t.actual_end) : '—'}</div></div>
          <div><div className="text-caption font-semibold uppercase text-faint">Hours</div><div className="num mt-0.5 font-bold">{hours(t.hours)}</div></div>
        </div>
        <KV items={[
          ['Date', dayLabel(t.starts_at)], ['Venue', t.venue_name], ['Role', t.role_name],
          ['Break', <span className="num">{t.break_minutes} min</span>],
          t.approved_by_name && ['Approved by', `${t.approved_by_name}${t.approved_at ? `, ${relative(t.approved_at)}` : ''}`],
          (t.signed_by_name || t.auto_signed) && ['Signed', t.auto_signed ? 'Automatically' : `${t.signed_by_name}${t.signed_at ? `, ${relative(t.signed_at)}` : ''}`],
          t.dispute_comment && ['Query', t.dispute_comment],
          t.resolution && ['Resolution', t.resolution],
        ]} />
        {t.locked && <p className="text-footnote text-muted">This timesheet is on a pay statement or invoice and can't be changed.</p>}
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
        {t.dispute_comment && t.status === 'disputed' && <p className="rounded-2xl bg-red-soft px-3.5 py-2.5 text-subhead text-red">Venue query: "{t.dispute_comment}"</p>}
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
      <Textarea label="What's wrong?" rows={4} placeholder="e.g. Officer left at 01:30, not 03:00" value={comment} onChange={(e) => setComment(e.target.value)} />
    </Sheet>
  );
}

function Missing({ q, onDone }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <p className="mb-3 text-subhead text-muted">Officers rostered in the last 30 days with no clock record. Set their times by hand if they worked.</p>
      <Load q={q}>{(rows) => !rows.length ? <Empty icon={Clock} title="Nothing missing" body="Every finished shift has a clock record." /> : (
        <List>
          {rows.map((m) => (
            <div key={m.assignment_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.officer_name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-semibold">{m.officer_name}</div>
                <div className="truncate text-footnote text-muted">{dayLabel(m.starts_at)} <span className="num">{range(m.starts_at, m.ends_at)}</span> · {m.venue_name}</div>
              </div>
              <Button size="sm" variant="soft" onClick={() => setOpen(m)}>Set times</Button>
            </div>
          ))}
        </List>
      )}</Load>
      {open && <ManualSheet m={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onDone(); }} />}
    </>
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
