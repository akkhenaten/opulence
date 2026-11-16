import { useState } from 'react';
import { CalendarDays, CalendarRange, Repeat } from 'lucide-react';
import { Button, Callout, Chip, cx, dateShort, Input, isoDate, addDays, Pressable, Segmented, Select, Sheet, Textarea, Toggle, useAction, useApi, useConfirm, useForm } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { londonParts, WEEKDAYS } from './_parts.jsx';
import { useVenue } from '../../venue.jsx';

// Shared by the venue's staff requests (Request staff) and the managers' "Venue requests" page

export const isFilled = (c) => c.status === 'accepted' && Number(c.filled) >= c.headcount;
export const statusOf = (c) => (isFilled(c) ? 'filled' : c.status);
export const LABEL = { pending: 'Waiting for reply', accepted: 'Being staffed', filled: 'Staffed', declined: 'Declined', cancelled: 'Cancelled' };
export const isoDow = (d) => ((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday … 7 = Sunday
const overnight = (s, e) => s && e && e <= s;

// The times of one date as London wall-clock values
export const slotOf = (c) => ({ start: londonParts(c.starts_at).time, end: londonParts(c.ends_at).time, headcount: c.headcount });

// Narrow inputs so a day's row fits a phone
const FIT = 'min-w-0 px-2 sm:px-3.5';

const listJoin = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// "2 door staff" / "1 door staff"; without a role, "2 staff"
// "2 door supervisors", "1 steward"; without a role, "2 staff"
const staffOf = (n, role) => {
  if (!role) return `${n} staff`;
  const r = role.toLowerCase();
  return `${n} ${n === 1 || /(s|staff)$/.test(r) ? r : `${r}s`}`;
};

/** One date in plain words, e.g. "Fri 21 Nov, 22:00–04:00 (overnight), 2 door supervisors". */
export function oneOffSummary({ date, start, end, headcount }, role) {
  return `${WEEKDAYS[isoDow(date) - 1]} ${dateShort(date)}, ${start}–${end}${overnight(start, end) ? ' (overnight)' : ''}, ${staffOf(Number(headcount), role)}`;
}

/** A request row's line: its date, times and staff, plus how many dates when rows are grouped. */
export function requestLine(c, dates = 1) {
  const { date, time: start } = londonParts(c.starts_at);
  return `${oneOffSummary({ date, start, end: londonParts(c.ends_at).time, headcount: c.headcount }, c.role_name)}${dates > 1 ? ` · ${dates} dates` : ''}`;
}

/** The repeating pattern in plain words, e.g. "Every Fri and Sat, 22:00–04:00 (overnight), 2 door staff, from 21 Nov". */
export function patternSummary({ frequency, days, start_date, has_end, end_date }, role) {
  const groups = [];
  days.forEach((d) => {
    const g = groups.find((x) => x.start === d.start && x.end === d.end && Number(x.headcount) === Number(d.headcount));
    if (g) g.dows.push(d.dow); else groups.push({ ...d, dows: [d.dow] });
  });
  const parts = groups.map((g) => {
    const n = Number(g.headcount);
    return `${listJoin(g.dows.map((x) => WEEKDAYS[x - 1]))}, ${g.start}–${g.end}${overnight(g.start, g.end) ? ' (overnight)' : ''}, ${staffOf(n, role)}`;
  });
  return `${frequency === 'fortnightly' ? 'Every 2 weeks on' : 'Every'} ${parts.join('; ')}${start_date ? `, from ${dateShort(start_date)}` : ''}${has_end && end_date ? ` until ${dateShort(end_date)}` : ''}`;
}

/** Days of the week with their own start, finish and number of staff. */
export function DaysEditor({ days, onChange }) {
  const byDow = Object.fromEntries(days.map((d) => [d.dow, d]));
  const last = days[days.length - 1] || { start: '21:00', end: '03:00', headcount: 1 };
  const toggle = (dow) => onChange(byDow[dow]
    ? days.filter((d) => d.dow !== dow)
    : [...days, { dow, start: last.start, end: last.end, headcount: last.headcount }].sort((a, b) => a.dow - b.dow));
  const set = (dow, k, v) => onChange(days.map((d) => (d.dow === dow ? { ...d, [k]: v } : d)));
  return (
    <div>
      <div className="mb-1.5 text-footnote font-semibold text-muted">Days</div>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((w, i) => <Chip key={w} value={w} active={!!byDow[i + 1]} tone={byDow[i + 1] ? 'blue' : 'grey'} onClick={() => toggle(i + 1)} />)}
      </div>
      {days.length > 0 && (
        <div className="mt-3 space-y-2">
          {days.map((d) => (
            <div key={d.dow} className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-1.5 rounded-2xl bg-bg p-2 min-[380px]:grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_minmax(52px,64px)] sm:grid-cols-[44px_1fr_1fr_72px] sm:gap-2">
              <div className="pt-9 text-center text-subhead font-bold">{WEEKDAYS[d.dow - 1]}</div>
              <Input label="Start" type="time" className="min-w-0" inputClassName={FIT} value={d.start} onChange={(e) => set(d.dow, 'start', e.target.value)} />
              <Input label="Finish" type="time" className="min-w-0" inputClassName={FIT} value={d.end} onChange={(e) => set(d.dow, 'end', e.target.value)} hint={overnight(d.start, d.end) ? 'Next day' : undefined} />
              <Input label="Staff" type="number" min="1" max="50" inputMode="numeric" className="col-start-2 min-w-0 min-[380px]:col-start-auto" inputClassName={FIT} value={d.headcount} onChange={(e) => set(d.dow, 'headcount', e.target.value)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const cleanDays = (days) => days.map((d) => ({ ...d, headcount: Number(d.headcount) }));
const daysOk = (days) => days.length > 0 && days.every((d) => d.start && d.end && d.start !== d.end && Number(d.headcount) >= 1);

/** New staff request: one date, or a repeating pattern. `draft` pre-fills it (e.g. read from a message). */
export function RequestForm({ venues, roles, draft, onClose, onDone }) {
  const tomorrow = addDays(isoDate(), 1);
  const chosen = useVenue().venueId;
  const f = useForm({
    venue_id: draft?.venue_id || chosen || (venues.length === 1 ? venues[0].id : ''), role: draft?.role || '', kind: draft?.kind || 'one_off',
    date: draft?.date || tomorrow, start: draft?.start || '21:00', end: draft?.end || '03:00', headcount: draft?.headcount || 1,
    frequency: draft?.frequency || 'weekly', days: draft?.days || [], start_date: draft?.start_date || tomorrow,
    has_end: !!draft?.end_date, end_date: draft?.end_date || addDays(tomorrow, 56), notes: draft?.notes || '',
  });
  const [run, busy] = useAction();
  const v = f.v;
  const rec = v.kind === 'recurring';
  const roleName = roles.find((r) => r.code === v.role)?.name;
  // Billing stream: which budget pays. Only asked when the venue bills more than one, or a new one is being added here.
  const venueId = v.venue_id || venues[0]?.id;
  const streams = useApi('streams.list', { venue_id: venueId }, { skip: !venueId });
  const active = (streams.data || []).filter((x) => x.status === 'active');
  const [picked, setPicked] = useState(''); // '' = follow the role; '__new' = add one
  const [ns, setNs] = useState({ name: '', po_ref: '', recipient: '' });
  const byRole = active.find((x) => x.roles.includes(v.role)) || active.find((x) => x.is_default);
  const streamId = picked && picked !== '__new' && active.some((x) => x.id === picked) ? picked : byRole?.id || '';
  const adding = picked === '__new';
  const oneOk = v.date && v.start && v.end && v.start !== v.end && Number(v.headcount) >= 1;
  const ok = (v.venue_id || venues.length === 1) && v.role && (!adding || ns.name.trim())
    && (rec ? daysOk(v.days) && v.start_date && (!v.has_end || v.end_date >= v.start_date) : oneOk);
  const send = () => run(() => api('cover.create', {
    venue_id: venueId, role: v.role, kind: v.kind, notes: v.notes.trim(),
    ...(adding ? { new_stream: { name: ns.name.trim(), po_ref: ns.po_ref.trim(), recipient: ns.recipient.trim() } } : streamId ? { stream_id: streamId } : {}),
    ...(rec
      ? { frequency: v.frequency, days: cleanDays(v.days), start_date: v.start_date, end_date: v.has_end ? v.end_date : null }
      : { date: v.date, start: v.start, end: v.end, headcount: Number(v.headcount) }),
  }), 'Request sent').then(onDone).catch(() => {});

  return (
    <Sheet open onClose={onClose} title="Request staff"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} busy={busy} disabled={!ok}>Send request</Button></>}>
      <div className="space-y-4">
        {draft && !draft.quiet && <Callout>Filled in from your message. Check the details before sending.</Callout>}
        <Segmented full value={v.kind} onChange={(k) => f.set('kind', k)} options={[{ value: 'one_off', label: 'One date' }, { value: 'recurring', label: 'Repeating' }]} />
        {venues.length !== 1 && <Select label="Venue" value={v.venue_id} onChange={(e) => f.set('venue_id', e.target.value)} placeholder="Choose venue" options={venues.map((x) => ({ value: x.id, label: x.name }))} />}
        <Select label="Officer type" value={v.role} onChange={(e) => f.set('role', e.target.value)} placeholder="Choose" options={roles.map((r) => ({ value: r.code, label: r.name }))} />
        {active.length > 1 || adding ? (
          <Select label="Bill to" hint="Each budget gets its own invoice" value={adding ? '__new' : streamId} onChange={(e) => setPicked(e.target.value)}
            options={[...active.map((x) => ({ value: x.id, label: x.po_ref ? `${x.name} · PO ${x.po_ref}` : x.name })), { value: '__new', label: '+ New stream' }]} />
        ) : active.length === 1 && (
          <button type="button" className="text-footnote font-semibold text-blue" onClick={() => setPicked('__new')}>Paid from a separate budget? Add a billing stream</button>
        )}
        {adding && (
          <div className="space-y-3 rounded-xl bg-bg p-3">
            <Input label="Stream name" placeholder="e.g. Site management – contractors" autoFocus value={ns.name} onChange={(e) => setNs((x) => ({ ...x, name: e.target.value }))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="PO / reference" placeholder="Optional" value={ns.po_ref} onChange={(e) => setNs((x) => ({ ...x, po_ref: e.target.value }))} />
              <Input label="Send its invoices to" inputMode="email" autoComplete="off" placeholder="Optional email" value={ns.recipient} onChange={(e) => setNs((x) => ({ ...x, recipient: e.target.value }))} />
            </div>
            <p className="text-footnote text-muted">It gets its own invoice. The security company checks its details before the first one goes out.</p>
          </div>
        )}
        {rec ? (
          <>
            <Segmented value={v.frequency} onChange={(x) => f.set('frequency', x)} options={[{ value: 'weekly', label: 'Every week' }, { value: 'fortnightly', label: 'Every 2 weeks' }]} />
            <DaysEditor days={v.days} onChange={(d) => f.set('days', d)} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Starting" type="date" min={isoDate()} {...f.bind('start_date')} />
              {v.has_end && <Input label="Last date" type="date" min={v.start_date} {...f.bind('end_date')} />}
            </div>
            <div className="rounded-xl bg-bg px-4 py-1">
              <Toggle checked={v.has_end} onChange={(x) => f.set('has_end', x)} label="Ends on a date" hint={v.has_end ? undefined : 'Keeps going until you stop it. We book 8 weeks ahead.'} />
            </div>
            {daysOk(v.days) && <Callout icon={Repeat}>{patternSummary(v, roleName)}</Callout>}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input label="Date" type="date" min={isoDate()} className="col-span-2 sm:col-span-1" {...f.bind('date')} />
              <Input label="Start" type="time" {...f.bind('start')} />
              <Input label="Finish" type="time" {...f.bind('end')} hint={overnight(v.start, v.end) ? 'Ends next day' : undefined} />
            </div>
            <Input label="How many officers" type="number" min="1" max="50" inputMode="numeric" {...f.bind('headcount')} />
            {oneOk && <Callout icon={CalendarDays}>{oneOffSummary(v, roleName)}</Callout>}
          </>
        )}
        <Textarea label="Notes" rows={3} placeholder="Event, dress code, where to report" {...f.bind('notes')} />
      </div>
    </Sheet>
  );
}

/** Edit or delete a date: just this one, or this and every later date in the pattern. */
export function ChangeSheet({ c, mode, isMgr, onClose, onDone }) {
  const recurring = c.kind === 'recurring';
  const [scope, setScope] = useState(recurring ? null : 'one');
  const slot = slotOf(c);
  const f = useForm({ ...slot, notes: c.notes || '', frequency: c.frequency || 'weekly', days: (c.days || []).map((d) => ({ ...d })), has_end: !!c.end_date, end_date: c.end_date ? String(c.end_date).slice(0, 10) : addDays(isoDate(), 56) });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const v = f.v;
  const needsOk = !isMgr && (c.status === 'accepted' || (scope === 'future' && c.accepted_all));

  const go = async () => {
    if (mode === 'delete' && !(await confirm({ title: scope === 'future' ? 'Cancel this and later dates?' : 'Cancel this date?', confirm: 'Cancel request', danger: true }))) return;
    const body = mode === 'delete' ? { id: c.id, scope, delete: true }
      : scope === 'one' ? { id: c.id, scope, start: v.start, end: v.end, headcount: Number(v.headcount), notes: v.notes }
        : { id: c.id, scope, frequency: v.frequency, days: cleanDays(v.days), end_date: v.has_end ? v.end_date : null, notes: v.notes };
    run(() => api('cover.update', body), (r) => (r.status === 'awaiting_approval' ? 'Sent to Orb for approval' : 'Updated')).then(onDone).catch(() => {});
  };

  if (!scope) {
    const opt = (s, Icon, title, sub) => (
      <Pressable onClick={() => setScope(s)} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3">
        <Icon size={20} className="shrink-0 text-blue" />
        <div className="min-w-0"><div className="text-body font-semibold">{title}</div><div className="text-footnote text-muted">{sub}</div></div>
      </Pressable>
    );
    return (
      <Sheet open onClose={onClose} title={mode === 'delete' ? 'Cancel request' : 'Change request'} size="sm">
        <div className="space-y-2">
          {opt('one', CalendarDays, 'Only this date', londonParts(c.starts_at).date)}
          {opt('future', CalendarRange, 'This and later dates', c.pattern || 'The rest of the pattern')}
        </div>
      </Sheet>
    );
  }

  const ok = mode === 'delete' || (scope === 'one' ? v.start && v.end && v.start !== v.end && Number(v.headcount) >= 1 : daysOk(v.days));
  return (
    <Sheet open onClose={onClose} title={mode === 'delete' ? 'Cancel request' : scope === 'future' ? 'Change this and later dates' : 'Change this date'}
      footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button variant={mode === 'delete' ? 'danger' : 'primary'} busy={busy} disabled={!ok} onClick={go}>{needsOk ? 'Ask for approval' : mode === 'delete' ? 'Cancel request' : 'Save'}</Button></>}>
      <div className="space-y-4">
        {needsOk && <Callout tone="warning">This request is already confirmed, so Orb will approve the change. Until then the request stays as it is.</Callout>}
        {mode === 'delete' ? (
          <p className="text-body text-muted">{scope === 'future' ? 'This date and every later date in the pattern will be cancelled.' : 'Only this date will be cancelled.'}</p>
        ) : scope === 'one' ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Start" type="time" {...f.bind('start')} />
              <Input label="Finish" type="time" {...f.bind('end')} hint={overnight(v.start, v.end) ? 'Next day' : undefined} />
              <Input label="Staff" type="number" min="1" max="50" inputMode="numeric" {...f.bind('headcount')} />
            </div>
            <Textarea label="Notes" rows={3} {...f.bind('notes')} />
          </>
        ) : (
          <>
            <Segmented value={v.frequency} onChange={(x) => f.set('frequency', x)} options={[{ value: 'weekly', label: 'Every week' }, { value: 'fortnightly', label: 'Every 2 weeks' }]} />
            <DaysEditor days={v.days} onChange={(d) => f.set('days', d)} />
            <div className="rounded-xl bg-bg px-4 py-1"><Toggle checked={v.has_end} onChange={(x) => f.set('has_end', x)} label="Ends on a date" /></div>
            {v.has_end && <Input label="Last date" type="date" min={isoDate()} {...f.bind('end_date')} />}
            {daysOk(v.days) && <Callout icon={Repeat}>{patternSummary({ ...v, start_date: null }, c.role_name)}</Callout>}
            <Textarea label="Notes" rows={2} {...f.bind('notes')} />
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Change several chosen dates at once. A field left blank keeps each date's own value; only what was changed is sent. */
export function BulkChangeSheet({ dates, onClose, onDone }) {
  const same = (fn) => { const vals = [...new Set(dates.map(fn))]; return vals.length === 1 ? vals[0] : ''; };
  const start0 = { start: same((c) => slotOf(c).start), end: same((c) => slotOf(c).end), headcount: same((c) => String(c.headcount)), notes: same((c) => c.notes || ''), stream_id: same((c) => c.stream_id || '') };
  const f = useForm(start0);
  const v = f.v;
  const [run, busy] = useAction();
  const venueIds = new Set(dates.map((c) => c.venue_id));
  const venueId = venueIds.size === 1 ? dates[0].venue_id : null;
  const streams = useApi('streams.list', { venue_id: venueId }, { skip: !venueId });
  const active = (streams.data || []).filter((x) => x.status === 'active');
  const booked = dates.filter((c) => c.status === 'accepted').length;
  const changed = Object.fromEntries(Object.keys(start0).filter((k) => String(v[k] ?? '') !== String(start0[k] ?? '') && (k === 'notes' || v[k] !== '')).map((k) => [k, v[k]]));
  const any = Object.keys(changed).length > 0;
  const bad = (changed.headcount && !(Number(changed.headcount) >= 1)) || ((v.start || start0.start) && (v.start || start0.start) === (v.end || start0.end));
  const mixed = (k) => (start0[k] === '' && v[k] === '' ? 'Mixed — leave blank to keep each date\'s own' : undefined);
  const save = () => run(() => api('cover.updateMany', { ids: dates.map((c) => c.id), ...changed, ...(changed.headcount && { headcount: Number(changed.headcount) }) }), bulkToast(false)).then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`Change ${dates.length} date${dates.length === 1 ? '' : 's'}`}
      footer={<><Button variant="secondary" onClick={onClose}>Back</Button><Button busy={busy} disabled={!any || bad} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {booked > 0 && <Callout tone="warning">{booked === dates.length ? 'These dates are' : `${booked} of these are`} already booked, so the office approves those changes. {booked < dates.length ? 'The rest change now.' : 'Until then they stay as they are.'}</Callout>}
        <div className="grid grid-cols-3 gap-3">
          <Input label="Start" type="time" {...f.bind('start')} hint={mixed('start')} />
          <Input label="Finish" type="time" {...f.bind('end')} hint={mixed('end') || (overnight(v.start, v.end) ? 'Next day' : undefined)} />
          <Input label="Staff" type="number" min="1" max="50" inputMode="numeric" placeholder={start0.headcount === '' ? 'Mixed' : undefined} {...f.bind('headcount')} />
        </div>
        {(start0.start === '' || start0.end === '' || start0.headcount === '') && <p className="text-footnote text-muted">Blank fields keep each date's own times and staff.</p>}
        {active.length > 1 && (
          <Select label="Bill to" value={v.stream_id} onChange={(e) => f.set('stream_id', e.target.value)}
            options={[...(start0.stream_id === '' ? [{ value: '', label: 'Keep each date\'s own' }] : []), ...active.map((x) => ({ value: x.id, label: x.name }))]} />
        )}
        <Textarea label="Notes" rows={3} placeholder={start0.notes === '' && dates.some((c) => c.notes) ? 'Mixed — leave blank to keep each date\'s own' : 'Event, dress code, where to report'} {...f.bind('notes')} />
      </div>
    </Sheet>
  );
}

/** Toast text for a bulk result: "3 cancelled · 2 sent for approval · 1 skipped (already started)". */
export const bulkToast = (del) => (r) => [
  r.done && `${r.done} ${del ? 'cancelled' : 'changed'}`,
  r.waiting && `${r.waiting} sent for approval`,
  r.skipped?.length && `${r.skipped.length} skipped (${[...new Set(r.skipped.map((x) => x.reason))].join(', ')})`,
].filter(Boolean).join(' · ') || 'Nothing changed';

// "Repeats every Fri & Sat" label for list rows
// `short` keeps list rows narrow: just "Every week" without the times
export const RepeatTag = ({ c, short, className }) => (c.kind === 'recurring'
  ? <span className={cx('inline-flex items-center gap-1 text-caption font-semibold text-blue', className)}><Repeat size={14} className="shrink-0" />{(short ? c.pattern?.split(':')[0] : c.pattern) || 'Repeats'}</span>
  : null);

/** What a pending change asks for, in words. */
export function describeChange(c) {
  const p = c.change_payload || {};
  if (p.type === 'delete') return c.change_scope === 'future' ? 'Cancel this and all later dates' : 'Cancel this date';
  if (p.slot) return `Change this date to ${p.slot.start}–${p.slot.end}, ${p.slot.headcount} staff`;
  if (p.series) {
    const days = (p.series.days || []).map((d) => `${WEEKDAYS[d.dow - 1]} ${d.start}–${d.end} ×${d.headcount}`).join(', ');
    return `From this date: ${p.series.frequency === 'fortnightly' ? 'every 2 weeks' : 'every week'} — ${days}${p.series.end_date ? `, until ${p.series.end_date}` : ''}`;
  }
  return 'Change';
}
