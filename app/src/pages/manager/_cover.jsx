import { useState } from 'react';
import { CalendarDays, Repeat } from 'lucide-react';
import { Button, Callout, Chip, cx, dateShort, Input, isoDate, addDays, Segmented, Select, Sheet, Textarea, Toggle, useAction, useApi, useConfirm, useForm } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { londonParts, WEEKDAYS } from './_parts.jsx';
import { useVenue } from '../../venue.jsx';
import { useAuth } from '../../auth.jsx';

// Shared by the venue's staff requests (Request staff) and the managers' "Venue requests" page

export const isFilled = (c) => c.status === 'accepted' && Number(c.filled) >= c.headcount;
export const statusOf = (c) => (isFilled(c) ? 'filled' : c.status);
export const LABEL = { pending: 'Waiting for reply', accepted: 'Being staffed', filled: 'Staffed', declined: 'Declined', cancelled: 'Cancelled' };
// The same rules as the server (cover.mjs cancelWhy / bulkWhy): any date today can be cancelled, started or not;
// changing stops once a date starts. A cancel waits for the office only when officers are booked.
const dayOf = (c) => (c.occurs_on ? String(c.occurs_on).slice(0, 10) : isoDate(c.starts_at));
export const canCancel = (c, today = isoDate()) => ['pending', 'accepted'].includes(c.status) && c.change_status !== 'pending' && dayOf(c) >= today;
export const canChange = (c, now = Date.now()) => ['pending', 'accepted'].includes(c.status) && c.change_status !== 'pending' && new Date(c.starts_at) > now;
export const isStaffed = (c) => c.status === 'accepted' && Number(c.filled) > 0;
/** "2 cancel now, 3 need the office's approval" for a venue cancelling these dates. */
export function cancelSplit(dates, mgr) {
  const wait = mgr ? 0 : dates.filter(isStaffed).length;
  const now = dates.length - wait;
  if (!wait) return `${now === 1 ? 'It is' : `All ${now} are`} cancelled straight away and the office is told.`;
  if (!now) return `${wait === 1 ? 'It is' : 'They are'} booked, so the office approves the cancellation first.`;
  return `${now} cancel now, ${wait} need${wait === 1 ? 's' : ''} the office's approval because officers are booked.`;
}
export const isoDow = (d) =>((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday … 7 = Sunday
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

// What a change starts from: one date's own values, or for several dates the value they share ('' where they differ)
function editStart(edit) {
  const same = (fn) => { const vals = [...new Set(edit.map(fn))]; return vals.length === 1 ? vals[0] : ''; };
  const c = edit[0];
  const date = c.occurs_on ? String(c.occurs_on).slice(0, 10) : londonParts(c.starts_at).date;
  const slot = slotOf(c);
  // A one-off made repeating starts as "this weekday, these times"
  const days = c.kind === 'recurring' && c.days?.length ? c.days.map((d) => ({ ...d })) : [{ dow: isoDow(date), start: slot.start, end: slot.end, headcount: slot.headcount }];
  return {
    venue_id: c.venue_id, role: same((x) => x.role), kind: c.kind === 'recurring' ? 'recurring' : 'one_off', date,
    start: same((x) => slotOf(x).start), end: same((x) => slotOf(x).end), headcount: same((x) => String(x.headcount)),
    frequency: c.frequency || 'weekly', days, start_date: date, has_end: c.kind === 'recurring' && !!c.end_date,
    end_date: c.kind === 'recurring' && c.end_date ? String(c.end_date).slice(0, 10) : addDays(date, 56),
    notes: same((x) => x.notes || ''), stream_id: same((x) => x.stream_id || ''),
  };
}

// The fields of a one-date change that differ from where they started; for several dates a blank field keeps each date's own
const ONE_KEYS = ['date', 'start', 'end', 'headcount', 'role', 'notes'];
function changedFields(start, v, many) {
  return Object.fromEntries(ONE_KEYS.filter((k) => !(many && k === 'date'))
    .filter((k) => String(v[k] ?? '') !== String(start[k] ?? '') && (k === 'notes' || v[k] !== ''))
    .map((k) => [k, k === 'headcount' ? Number(v[k]) : v[k]]));
}

/**
 * Staff request: one date, or a repeating pattern. `draft` pre-fills a new one (e.g. read from a message).
 * `edit` (rows from cover.list) opens the same form on what was asked: one date (only it, or it and every later date),
 * or several chosen dates together.
 */
export function RequestForm({ venues, roles, draft, edit, initialMode = 'one', onClose, onDone }) {
  const tomorrow = addDays(isoDate(), 1);
  const chosen = useVenue()?.venueId;
  const { user } = useAuth();
  const mgr = user?.role !== 'venue';
  const many = edit?.length > 1;
  const one = edit?.length === 1 ? edit[0] : null;
  const [start0] = useState(() => (edit?.length ? editStart(edit) : null));
  const f = useForm(start0 || {
    venue_id: draft?.venue_id || chosen || (venues.length === 1 ? venues[0].id : ''), role: draft?.role || '', kind: draft?.kind || 'one_off',
    date: draft?.date || tomorrow, start: draft?.start || '21:00', end: draft?.end || '03:00', headcount: draft?.headcount || 1,
    frequency: draft?.frequency || 'weekly', days: draft?.days || [], start_date: draft?.start_date || tomorrow,
    has_end: !!draft?.end_date, end_date: draft?.end_date || addDays(tomorrow, 56), notes: draft?.notes || '',
  });
  // Changing one date: just it ('one'), or it and every later date ('future'; on a one-off that makes it repeating)
  const [mode, setMode] = useState(initialMode);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const v = f.v;
  const rec = edit ? mode === 'future' : v.kind === 'recurring';
  const roleName = roles.find((r) => r.code === v.role)?.name;
  // Billing stream: which budget pays. Only asked when the venue bills more than one, or a new one is being added here.
  const venueId = v.venue_id || venues[0]?.id;
  const streams = useApi('streams.list', { venue_id: venueId }, { skip: !venueId || (many && new Set(edit.map((c) => c.venue_id)).size > 1) });
  const active = (streams.data || []).filter((x) => x.status === 'active');
  const [picked, setPicked] = useState(start0?.stream_id || ''); // '' = follow the role (new) or keep each date's own (change); '__new' = add one
  const [ns, setNs] = useState({ name: '', po_ref: '', recipient: '' });
  const byRole = active.find((x) => x.roles.includes(v.role)) || active.find((x) => x.is_default);
  const valid = picked && picked !== '__new' && active.some((x) => x.id === picked);
  const streamId = valid ? picked : edit ? '' : byRole?.id || '';
  const adding = picked === '__new';
  const keepStream = edit && !active.some((x) => x.id === start0.stream_id);
  const streamPart = adding ? { new_stream: { name: ns.name.trim(), po_ref: ns.po_ref.trim(), recipient: ns.recipient.trim() } }
    : streamId && streamId !== start0?.stream_id ? { stream_id: streamId } : edit ? {} : streamId ? { stream_id: streamId } : {};

  const oneOk = (many || v.date) && v.start && v.end && v.start !== v.end && Number(v.headcount) >= 1;
  const recOk = daysOk(v.days) && (edit || v.start_date) && (!v.has_end || v.end_date >= (edit ? start0.start_date : v.start_date));
  let ok; let dirty = true; let changed = {};
  if (!edit) ok = (v.venue_id || venues.length === 1) && v.role && (!adding || ns.name.trim()) && (rec ? recOk : oneOk);
  else if (many) {
    changed = changedFields(start0, v, true);
    const s = v.start || start0.start; const e = v.end || start0.end;
    dirty = Object.keys(changed).length > 0 || Object.keys(streamPart).length > 0;
    ok = (!adding || ns.name.trim()) && !(changed.headcount !== undefined && !(changed.headcount >= 1 && changed.headcount <= 50)) && !(s && s === e);
  } else {
    changed = changedFields(start0, v, false);
    dirty = mode === 'future' || Object.keys(changed).length > 0 || Object.keys(streamPart).length > 0;
    ok = v.role && (!adding || ns.name.trim()) && (rec ? recOk : oneOk);
  }
  // A venue's change to booked cover waits for the office
  const booked = edit ? edit.filter((c) => c.status === 'accepted').length : 0;
  const needsOk = !mgr && edit && (booked > 0 || (mode === 'future' && one?.accepted_all));
  // A date that has started can only be cancelled
  const started = edit ? edit.filter((c) => !canChange(c)).length : 0;
  const frozen = edit && started === edit.length;
  const cancellable = edit ? edit.filter((c) => canCancel(c)) : [];
  const mixed = (k) => (many && start0[k] === '' && v[k] === '' ? 'Mixed — leave blank to keep each date\'s own' : undefined);

  const send = () => run(() => api('cover.create', {
    venue_id: venueId, role: v.role, kind: v.kind, notes: v.notes.trim(), ...streamPart,
    ...(rec
      ? { frequency: v.frequency, days: cleanDays(v.days), start_date: v.start_date, end_date: v.has_end ? v.end_date : null }
      : { date: v.date, start: v.start, end: v.end, headcount: Number(v.headcount) }),
  }), 'Request sent').then(onDone).catch(() => {});
  const approvalToast = (r) => (r.status === 'awaiting_approval' ? 'Sent to the office for approval' : 'Updated');
  const save = () => {
    if (many) return run(() => api('cover.updateMany', { ids: edit.map((c) => c.id), ...changed, ...streamPart }), bulkToast(false)).then(onDone).catch(() => {});
    const body = mode === 'future'
      ? { id: one.id, scope: 'future', kind: 'recurring', role: v.role, notes: v.notes, frequency: v.frequency, days: cleanDays(v.days), end_date: v.has_end ? v.end_date : null, ...streamPart }
      : { id: one.id, scope: 'one', date: v.date, start: v.start, end: v.end, headcount: Number(v.headcount), role: v.role, notes: v.notes, ...streamPart };
    return run(() => api('cover.update', body), approvalToast).then(onDone).catch(() => {});
  };
  const cancelDates = async () => {
    const future = mode === 'future' && one?.kind === 'recurring';
    const title = many ? `Cancel ${edit.length} dates?` : future ? 'Cancel this and later dates?' : 'Cancel this date?';
    const body = future ? (needsOk ? 'Booked dates wait for the office to approve.' : undefined) : cancelSplit(cancellable, mgr);
    if (!(await confirm({ title, body, confirm: 'Cancel request', danger: true }))) return;
    if (many) run(() => api('cover.updateMany', { ids: edit.map((c) => c.id), delete: true }), bulkToast(true)).then(onDone).catch(() => {});
    else run(() => api('cover.update', { id: one.id, scope: future ? 'future' : 'one', delete: true }), approvalToast).then(onDone).catch(() => {});
  };

  const title = !edit ? 'Request staff' : many ? `Change ${edit.length} dates` : 'Change request';
  const venueName = edit ? edit[0].venue_name : null;
  const footer = edit ? (
    <>
      <Button variant="link-red" className="mr-auto" onClick={cancelDates} disabled={busy || !cancellable.length}>{many ? `Cancel ${edit.length} dates` : mode === 'future' && one?.kind === 'recurring' ? 'Cancel these dates' : 'Cancel date'}</Button>
      <Button variant="secondary" onClick={onClose}>Back</Button>
      <Button onClick={save} busy={busy} disabled={!ok || !dirty || frozen}>{needsOk ? 'Ask for approval' : 'Save'}</Button>
    </>
  ) : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} busy={busy} disabled={!ok}>Send request</Button></>;

  return (
    <Sheet open onClose={onClose} title={title} footer={footer}>
      <div className="space-y-4">
        {draft && !draft.quiet && !edit && <Callout>Filled in from your message. Check the details before sending.</Callout>}
        {started > 0 && <Callout tone="warning">{frozen ? `${many ? 'These dates have' : 'This date has'} already started, so ${many ? 'they' : 'it'} can only be cancelled.` : `${started} of these ${started === 1 ? 'has' : 'have'} started, so ${started === 1 ? 'it' : 'they'} can only be cancelled — a change skips ${started === 1 ? 'it' : 'them'}.`}</Callout>}
        {needsOk && !frozen && <Callout tone="warning">{many && booked < edit.length ? `${booked} of these are already booked, so the office approves those changes. The rest change now.` : 'This is already booked, so the office approves the change. Until then it stays as it is.'}</Callout>}
        {!edit && <Segmented full value={v.kind} onChange={(k) => f.set('kind', k)} options={[{ value: 'one_off', label: 'One date' }, { value: 'recurring', label: 'Repeating' }]} />}
        {one && <Segmented full value={mode} onChange={setMode} options={one.kind === 'recurring'
          ? [{ value: 'one', label: 'Only this date' }, { value: 'future', label: 'This and later dates' }]
          : [{ value: 'one', label: 'One date' }, { value: 'future', label: 'Repeating' }]} />}
        {edit ? (venueName && <p className="text-footnote text-muted">{venueName}{many ? ` · ${edit.length} dates` : ''}</p>)
          : venues.length !== 1 && <Select label="Venue" value={v.venue_id} onChange={(e) => f.set('venue_id', e.target.value)} placeholder="Choose venue" options={venues.map((x) => ({ value: x.id, label: x.name }))} />}
        <Select label="Officer type" value={v.role} onChange={(e) => f.set('role', e.target.value)} placeholder={many && start0.role === '' ? undefined : 'Choose'}
          options={[...(many && start0.role === '' ? [{ value: '', label: 'Keep each date\'s own' }] : []), ...roles.map((r) => ({ value: r.code, label: r.name }))]} />
        {active.length > 1 || adding ? (
          <Select label="Bill to" hint="Each budget gets its own invoice" value={adding ? '__new' : streamId} onChange={(e) => setPicked(e.target.value)}
            options={[...(keepStream ? [{ value: '', label: many ? 'Keep each date\'s own' : 'Keep as it is' }] : []),
              ...active.map((x) => ({ value: x.id, label: x.po_ref ? `${x.name} · PO ${x.po_ref}` : x.name })), { value: '__new', label: '+ New stream' }]} />
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
              {edit ? <div className="text-body"><div className="text-footnote font-semibold text-muted">Starting</div><div className="mt-2">From {dateShort(start0.start_date)}</div></div>
                : <Input label="Starting" type="date" min={isoDate()} {...f.bind('start_date')} />}
              {v.has_end && <Input label="Last date" type="date" min={edit ? start0.start_date : v.start_date} {...f.bind('end_date')} />}
            </div>
            <div className="rounded-xl bg-bg px-4 py-1">
              <Toggle checked={v.has_end} onChange={(x) => f.set('has_end', x)} label="Ends on a date" hint={v.has_end ? undefined : 'Keeps going until you stop it. We book 8 weeks ahead.'} />
            </div>
            {daysOk(v.days) && <Callout icon={Repeat}>{patternSummary(edit ? { ...v, start_date: start0.start_date } : v, roleName)}</Callout>}
          </>
        ) : (
          <>
            <div className={cx('grid grid-cols-2 gap-3', !many && 'sm:grid-cols-3')}>
              {!many && <Input label="Date" type="date" min={isoDate()} className="col-span-2 sm:col-span-1" {...f.bind('date')} />}
              <Input label="Start" type="time" {...f.bind('start')} hint={mixed('start')} />
              <Input label="Finish" type="time" {...f.bind('end')} hint={mixed('end') || (overnight(v.start, v.end) ? 'Ends next day' : undefined)} />
            </div>
            <Input label="How many officers" type="number" min="1" max="50" inputMode="numeric" placeholder={many && start0.headcount === '' ? 'Mixed' : undefined} {...f.bind('headcount')} />
            {many && (start0.start === '' || start0.end === '' || start0.headcount === '' || start0.role === '') && <p className="text-footnote text-muted">Blank fields keep each date's own.</p>}
            {oneOk && !many && <Callout icon={CalendarDays}>{oneOffSummary(v, roleName)}</Callout>}
          </>
        )}
        <Textarea label="Notes" rows={3} placeholder={many && start0.notes === '' && edit.some((c) => c.notes) ? 'Mixed — leave blank to keep each date\'s own' : 'Event, dress code, where to report'} {...f.bind('notes')} />
      </div>
    </Sheet>
  );
}

/** The request form opened on dates already asked for; it loads the officer types itself. */
export function ChangeRequest({ edit, initialMode, onClose, onDone }) {
  const roles = useApi('roles.list', {});
  if (!roles.data) return null;
  return <RequestForm venues={[]} roles={roles.data} edit={edit} initialMode={initialMode} onClose={onClose} onDone={onDone} />;
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
  if (p.slot) {
    const day = p.slot.date && p.slot.date !== String(c.occurs_on || '').slice(0, 10) ? `move this date to ${WEEKDAYS[isoDow(p.slot.date) - 1]} ${dateShort(p.slot.date)}, ` : 'change this date to ';
    const type = p.role && p.role !== c.role ? ', another officer type' : '';
    return `${day[0].toUpperCase()}${day.slice(1)}${p.slot.start}–${p.slot.end}, ${p.slot.headcount} staff${type}`;
  }
  if (p.series) {
    const days = (p.series.days || []).map((d) => `${WEEKDAYS[d.dow - 1]} ${d.start}–${d.end} ×${d.headcount}`).join(', ');
    return `From this date: ${p.series.frequency === 'fortnightly' ? 'every 2 weeks' : 'every week'} — ${days}${p.series.end_date ? `, until ${p.series.end_date}` : ''}`;
  }
  return 'Change';
}
