// SIA register check assistant. The register has no API: one click copies the licence number and opens the
// register in a new tab, and this panel holds the details to paste and the form to record what it shows.
import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, History, ShieldCheck } from 'lucide-react';
import { api } from '../../api.js';
import { Avatar, Button, cx, date, dateTime, Input, Load, Pill, Pressable, Select, Sheet, Spinner, Textarea, useAction, useApi, useToast } from '../../ui/index.jsx';
import { CHECK_STATUSES, NOT_CLEARED, SIA_REGISTER, STATUS_LABEL, checkState, cleanSia, validSia } from '../../ui/sia.js';
import { SIA_TYPES } from './_parts.jsx';

// Latest register check as a pill, with who checked and when
export function SiaCheckPill({ status, at, by, className }) {
  const s = checkState(status, at);
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-2', className)}>
      <Pill tone={s.tone}><ShieldCheck size={14} />{s.label}</Pill>
      {at && <span className="text-footnote text-muted">Checked {date(at)}{by ? ` by ${by}` : ''}</span>}
    </span>
  );
}

// [start, sheet]: start(officer) must run straight from the click so the browser allows the copy and the new tab
export function useSiaVerify(onSaved) {
  const toast = useToast();
  const [id, setId] = useState(null);
  const start = (o) => {
    const n = cleanSia(o.sia_number);
    if (n) navigator.clipboard?.writeText(n).then(() => toast('Licence number copied — paste it into the register'), () => toast('Couldn\'t copy — use the copy buttons in the panel', 'error'));
    window.open(SIA_REGISTER, '_blank', 'noopener');
    setId(o.id);
  };
  const sheet = <SiaVerifySheet id={id} onClose={() => setId(null)} onSaved={onSaved} />;
  return [start, sheet];
}

export function SiaVerifyButton({ o, onSaved, size = 'sm', variant = 'secondary', label = 'Verify SIA licence' }) {
  const [start, sheet] = useSiaVerify(onSaved);
  return (
    <>
      <Button size={size} variant={variant} icon={ShieldCheck} onClick={() => start(o)}>{label}</Button>
      {sheet}
    </>
  );
}

function CopyChip({ label, value, shown, mono, className }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => toast('Couldn\'t copy', 'error'));
  return (
    <Pressable press onClick={copy} disabled={!value} aria-label={`Copy ${label}`}
      className={cx('flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 disabled:opacity-50', className, done ? 'border-green bg-green-soft' : 'border-line bg-surface hover:bg-bg')}>
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-muted">{label}</span>
        <span className={cx('block truncate text-callout font-semibold', mono && 'num')}>{shown || value || '—'}</span>
      </span>
      {done ? <Check size={16} className="shrink-0 text-green" /> : <Copy size={16} className="shrink-0 text-faint" />}
    </Pressable>
  );
}

function SiaVerifySheet({ id, onClose, onSaved }) {
  const q = useApi('sia.details', { officer_id: id }, { skip: !id });
  return (
    <Sheet open={!!id} onClose={onClose} title="SIA register check" size="md">
      {id && <Load q={q}>{(d) => (d?.id === id ? <Assistant key={d.id} d={d} onClose={onClose} onSaved={onSaved} /> : <Spinner />)}</Load>}
    </Sheet>
  );
}

function Assistant({ d, onClose, onSaved }) {
  const [v, setV] = useState({ status: '', expiry: d.sia_expiry || '', sector: d.sia_type || '', notes: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const [run, busy] = useAction();
  const [showHistory, setShowHistory] = useState(false);
  const needExpiry = v.status && v.status !== 'not_found';
  const save = async () => {
    await run(() => api('sia.record', { officer_id: d.id, ...v, expiry: needExpiry ? v.expiry : v.expiry || null }), 'Check saved');
    onSaved?.();
    onClose();
  };
  const warnings = [
    needExpiry && v.expiry && d.sia_expiry && v.expiry !== d.sia_expiry && `The profile says it expires ${date(d.sia_expiry)}. Saving updates it to ${date(v.expiry)}.`,
    v.sector && d.sia_type && v.sector !== d.sia_type && `The profile says ${d.sia_type}. Saving updates it to ${v.sector}.`,
    NOT_CLEARED.includes(v.status) && d.status !== 'applicant' && 'They will be blocked from licensed shifts and company managers will be alerted.',
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar name={d.name} src={d.photo_url} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline font-semibold">{d.name}</div>
          <SiaCheckPill status={d.sia_status} at={d.sia_last_verified_at} by={d.sia_last_verified_by_name} className="mt-1" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-subhead font-semibold">Search the register</h3>
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => window.open(SIA_REGISTER, '_blank', 'noopener')}>Open register</Button>
        </div>
        {!validSia(d.number) && (
          <p className="mb-2 flex items-start gap-2 rounded-xl bg-amber-soft px-3 py-2 text-footnote text-amber">
            <AlertTriangle size={16} className="mt-px shrink-0" />
            {d.number ? `The number on file has ${d.number.length} digits; SIA licence numbers have 16. Search by name instead.` : 'No licence number on file. Search by name and date of birth instead.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <CopyChip label="Licence number" value={d.number} shown={d.number_groups} mono className="col-span-2" />
          <CopyChip label="Surname" value={d.last_name} />
          <CopyChip label="First name" value={d.first_name} />
          <CopyChip label="Date of birth" value={d.dob} shown={d.dob_masked} mono className="col-span-2" />
        </div>
        <p className="mt-2 text-caption text-faint">Search by licence number first. Name search needs surname, first name and date of birth (DD/MM/YYYY).</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-subhead font-semibold">What the register shows</h3>
        <Select label="Licence status" placeholder="Choose…" options={CHECK_STATUSES} value={v.status} onChange={set('status')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Expiry date" type="date" value={v.expiry} onChange={set('expiry')} disabled={!needExpiry && v.status === 'not_found'} />
          <Select label="Licence type (sector)" placeholder="Not shown" options={SIA_TYPES} value={v.sector} onChange={set('sector')} />
        </div>
        <Textarea label="Notes" rows={2} placeholder="Optional, e.g. conditions shown on the register" value={v.notes} onChange={set('notes')} />
        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-amber-soft px-3 py-2 text-footnote text-amber">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
      </div>

      {d.history.length > 0 && (
        <div>
          <Pressable press onClick={() => setShowHistory((x) => !x)} className="flex items-center gap-2 text-subhead font-semibold text-muted">
            <History size={16} />Previous checks ({d.history.length})<ChevronDown size={16} className={cx('transition-transform', showHistory && 'rotate-180')} />
          </Pressable>
          {showHistory && <CheckHistory checks={d.history} className="mt-2" />}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={ShieldCheck} busy={busy} disabled={!v.status || (needExpiry && !v.expiry)} onClick={save}>Confirm &amp; save check</Button>
      </div>
    </div>
  );
}

export function CheckHistory({ checks, className }) {
  return (
    <ul className={cx('divide-y divide-line rounded-xl border border-line', className)}>
      {checks.map((c) => (
        <li key={c.id} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={c.status === 'active' ? 'green' : 'red'}>{STATUS_LABEL[c.status]}</Pill>
            <span className="text-footnote text-muted">{dateTime(c.created_at)}{c.checked_by_name ? ` · ${c.checked_by_name}` : ''}</span>
          </div>
          <div className="mt-1 text-footnote text-muted">{[c.expiry && `Expires ${date(c.expiry)}`, c.sector].filter(Boolean).join(' · ')}</div>
          {c.notes && <p className="mt-1 text-footnote">{c.notes}</p>}
        </li>
      ))}
    </ul>
  );
}
