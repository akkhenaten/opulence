import { useEffect, useState } from 'react';
import { CalendarOff, Plus, Save } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  addDays, Button, cx, date, dateShort, Empty, Input, isoDate, List, Load, Page, Pill, Row, Section, Segmented, Sheet, Tabs, Textarea, Toggle, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { NotLinked, TIMEOFF_KINDS } from './_parts.jsx';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const KIND_LABEL = Object.fromEntries(TIMEOFF_KINDS.map((k) => [k.value, k.label]));
const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Declined', cancelled: 'Cancelled' };

export default function TimeOff() {
  const { user } = useAuth();
  const [tab, setTab] = useState('timeoff');
  if (!user.officer_id) return <Page title="Time off" back={{ to: '/officer/me', label: 'Me' }}><NotLinked /></Page>;
  return (
    <Page title="Time off" back={{ to: '/officer/me', label: 'Me' }}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'timeoff', label: 'Time off' }, { value: 'availability', label: 'Weekly availability' }]} />
      {tab === 'timeoff' ? <Requests /> : <Availability />}
    </Page>
  );
}

const days = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000) + 1;

function Requests() {
  const q = useApi('timeoff.list');
  const [open, setOpen] = useState(false);
  const [run] = useAction();
  const confirm = useConfirm();
  const cancel = async (t) => {
    if (await confirm({ title: 'Cancel this request?', body: `${KIND_LABEL[t.kind]}, ${dateShort(t.start_date)} – ${date(t.end_date)}.`, confirm: 'Cancel request', danger: true })) {
      run(() => api('timeoff.cancel', { id: t.id }), 'Request cancelled').then(q.reload).catch(() => {});
    }
  };
  return (
    <>
      <Button size="lg" icon={Plus} className="w-full" onClick={() => setOpen(true)}>Request time off</Button>
      <Load q={q}>
        {(rows) => {
          const today = isoDate();
          const upcoming = rows.filter((t) => t.end_date >= today && t.status !== 'cancelled');
          const past = rows.filter((t) => !(t.end_date >= today && t.status !== 'cancelled'));
          const card = (t) => (
            <Row key={t.id}
              title={`${KIND_LABEL[t.kind] || t.kind} · ${t.start_date === t.end_date ? date(t.start_date) : `${dateShort(t.start_date)} – ${date(t.end_date)}`}`}
              subtitle={[`${days(t.start_date, t.end_date)} day${days(t.start_date, t.end_date) === 1 ? '' : 's'}`, t.reason, t.decided_by_name && t.status !== 'pending' && `by ${t.decided_by_name}`].filter(Boolean).join(' · ')}
              right={(
                <div className="flex flex-col items-end gap-1">
                  <Pill status={t.status}>{STATUS_LABEL[t.status]}</Pill>
                  {t.status === 'pending' && <button type="button" onClick={() => cancel(t)} className="text-[13px] font-semibold text-red">Cancel</button>}
                </div>
              )} />
          );
          return (
            <>
              <Section title="Upcoming">
                {upcoming.length ? <List>{upcoming.map(card)}</List> : <Empty icon={CalendarOff} title="No time off booked" body="Request holiday or mark days you can't work. Unavailable days are confirmed straight away." />}
              </Section>
              {past.length > 0 && <Section title="Past and cancelled"><List className="opacity-90">{past.map(card)}</List></Section>}
            </>
          );
        }}
      </Load>
      <RequestSheet open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); q.reload(); }} />
    </>
  );
}

function RequestSheet({ open, onClose, onDone }) {
  const blank = () => ({ kind: 'holiday', start_date: addDays(isoDate(), 1), end_date: addDays(isoDate(), 1), reason: '' });
  const [v, setV] = useState(blank);
  const [run, busy] = useAction();
  useEffect(() => { if (open) setV(blank()); }, [open]);
  const set = (k) => (e) => setV((s) => {
    const n = { ...s, [k]: e.target.value };
    if (k === 'start_date' && n.end_date < n.start_date) n.end_date = n.start_date;
    return n;
  });
  const bad = !v.start_date || !v.end_date || v.end_date < v.start_date;
  const save = () => run(() => api('timeoff.request', v), v.kind === 'unavailable' ? 'Marked as unavailable' : 'Request sent to the office').then(onDone).catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title="Request time off" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={bad} onClick={save}>{v.kind === 'unavailable' ? 'Save' : 'Send request'}</Button></>}>
      <div className="space-y-4">
        <Segmented className="w-full [&>button]:flex-1" value={v.kind} onChange={(kind) => setV((s) => ({ ...s, kind }))} options={TIMEOFF_KINDS} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" value={v.start_date} onChange={set('start_date')} />
          <Input label="To" type="date" min={v.start_date} value={v.end_date} onChange={set('end_date')} />
        </div>
        {!bad && <div className="text-[13px] font-semibold text-muted">{days(v.start_date, v.end_date)} day{days(v.start_date, v.end_date) === 1 ? '' : 's'}</div>}
        <Textarea label="Note (optional)" rows={2} value={v.reason} onChange={set('reason')} placeholder={v.kind === 'holiday' ? 'e.g. Family holiday' : ''} />
        <p className="text-[13px] text-muted">
          {v.kind === 'unavailable' ? 'Unavailable days are confirmed straight away. The office will not book you on these dates.' : 'The office will approve or decline your request. You will get a notification.'}
        </p>
      </div>
    </Sheet>
  );
}

const hm = (t) => (t ? String(t).slice(0, 5) : '');

function Availability() {
  const q = useApi('officers.get');
  return <Load q={q}>{(o) => <AvailabilityEditor initial={o.availability || []} reload={q.reload} />}</Load>;
}

function AvailabilityEditor({ initial, reload }) {
  const build = () => DAYS.map((_, i) => {
    const a = initial.find((x) => x.weekday === i);
    return { weekday: i, available: a ? a.available : true, anyTime: !a || (!a.from_time && !a.to_time), from_time: hm(a?.from_time) || '18:00', to_time: hm(a?.to_time) || '04:00' };
  });
  const [rows, setRows] = useState(build);
  const [dirty, setDirty] = useState(false);
  const [run, busy] = useAction();
  const upd = (i, patch) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const save = () => run(() => api('officers.saveAvailability', {
    days: rows.map((r) => ({ weekday: r.weekday, available: r.available, from_time: r.available && !r.anyTime ? r.from_time : null, to_time: r.available && !r.anyTime ? r.to_time : null })),
  }), 'Availability saved').then(() => { setDirty(false); reload(); }).catch(() => {});

  return (
    <>
      <p className="mb-3 px-1 text-[14px] text-muted">Tell the office which days you can usually work. For one-off dates, use Time off.</p>
      <List>
        {rows.map((r, i) => (
          <div key={r.weekday} className="px-4 py-3">
            <Toggle label={DAYS[r.weekday]} hint={!r.available ? 'Not available' : r.anyTime ? 'Any time' : `${r.from_time}–${r.to_time}`} checked={r.available} onChange={(available) => upd(i, { available })} />
            {r.available && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl bg-bg p-[3px] text-[13px] font-semibold">
                  {[[true, 'Any time'], [false, 'Set hours']].map(([val, l]) => (
                    <button key={l} type="button" onClick={() => upd(i, { anyTime: val })} className={cx('rounded-[9px] px-3 py-1.5', r.anyTime === val ? 'bg-white text-ink shadow-sm' : 'text-muted')}>{l}</button>
                  ))}
                </div>
                {!r.anyTime && (
                  <div className="flex items-center gap-2">
                    <input type="time" value={r.from_time} onChange={(e) => upd(i, { from_time: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-2 text-[15px]" aria-label={`${DAYS[r.weekday]} from`} />
                    <span className="text-muted">to</span>
                    <input type="time" value={r.to_time} onChange={(e) => upd(i, { to_time: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-2 text-[15px]" aria-label={`${DAYS[r.weekday]} to`} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </List>
      <Button size="lg" icon={Save} className="mt-4 w-full" busy={busy} disabled={!dirty} onClick={save}>Save availability</Button>
    </>
  );
}
