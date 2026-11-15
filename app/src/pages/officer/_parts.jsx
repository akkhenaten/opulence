// Helpers shared by the officer screens and the incident screens
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock3, Hourglass, MapPin, Phone, UserX } from 'lucide-react';
import { Button, cx, dayLabel, Empty, List, Pill, range, Row, Section, Sheet, Textarea, time, titleCase, useAction, useNow as useTick } from '../../ui/index.jsx';
import { api, upload } from '../../api.js';

// Clock-in opens this many minutes before a shift (the API enforces the same, clock.mjs EARLY_MIN)
export const CLOCK_EARLY_MIN = 15;
export const clockOpensAt = (startsAt) => new Date(new Date(startsAt).getTime() - CLOCK_EARLY_MIN * 60000);

// The time now, refreshed every ms milliseconds, for countdowns and time on shift
export const useNow = (ms = 15000) => useTick(ms);
// "2h 05m" since a time
export const sinceText = (from, now = Date.now()) => {
  const m = Math.max(0, Math.floor((now - new Date(from)) / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

// Decline an offered shift, or give back a confirmed one, with an optional reason for the office
// Under a day's notice the office also needs a call, not just an alert
export const shortNotice = (startsAt) => new Date(startsAt).getTime() - Date.now() < 24 * 3600000;

export function DeclineSheet({ s, phone, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const close = () => { setReason(''); onClose(); };
  const decline = () => run(() => api('shifts.respond', { assignment_id: s.assignment_id, accept: false, reason }), 'Shift declined')
    .then(() => { setReason(''); onDone(); }).catch(() => {});
  // Keep the shift and let the office swap someone in: nothing changes until a manager moves it
  const swap = () => run(() => api('shifts.swapAsk', { assignment_id: s.assignment_id, note: reason }), 'Asked. You keep the shift until the office swaps it')
    .then(() => { setReason(''); onClose(); }).catch(() => {});
  return (
    <Sheet open={!!s} onClose={close} title={s?.assignment_status === 'accepted' ? "Can't work this shift" : 'Decline shift'} size="sm"
      footer={<><Button variant="secondary" onClick={close}>Keep it</Button><Button variant="danger" busy={busy} onClick={decline}>Decline shift</Button></>}>
      {s && <p className="mb-3 text-body text-muted">{s.venue_name}, {time(s.starts_at)}–{time(s.ends_at)}. The office will be told so they can find cover.</p>}
      {s && shortNotice(s.starts_at) && (
        <div className="mb-3 rounded-2xl bg-amber-soft p-3 text-subhead">
          <p className="font-semibold text-amber">This is short notice. Please call the office as well.</p>
          {phone && <Button className="mt-2" size="sm" variant="secondary" icon={Phone} href={`tel:${phone.replace(/\s+/g, '')}`}>Call {phone}</Button>}
        </div>
      )}
      <Textarea label="Reason (optional)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Unwell, family emergency" />
      {s?.assignment_status === 'accepted' && !shortNotice(s.starts_at) && (
        <button type="button" disabled={busy} onClick={swap} className="pressable mt-3 text-subhead font-semibold text-blue">
          Ask to swap instead: keep it until someone takes it
        </button>
      )}
    </Sheet>
  );
}

// Shrink camera photos before upload (night-time signal at a venue door is often poor).
// Returns a JPEG File (keeps PDFs and non-images untouched). PDFs embed only PNG/JPEG, so JPEG is ideal.
export async function compressImage(file, max = 1600, quality = 0.82) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// A profile or venue photo plus its small (256px) version for lists and avatars. The small one is best-effort:
// if the phone can't make it, lists fall back to the large photo.
export async function uploadPhoto(file, max = 1600) {
  const large = await compressImage(file, max, 0.85);
  const small = await compressImage(file, 256, 0.8);
  const [photo_key, photo_thumb_key] = await Promise.all([
    upload(large, 'photo'),
    small !== file && small.size < 1024 * 1024 ? upload(small, 'photo').catch(() => undefined) : undefined,
  ]);
  return { photo_key, photo_thumb_key, file: large };
}

// Metres between two points
export function distanceM(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null)) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// "in 2h 15m" / "3h 10m ago"
export function until(d) {
  const mins = Math.round((new Date(d) - Date.now()) / 60000);
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const s = h >= 24 ? `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}` : h ? `${h}h ${m}m` : `${m}m`;
  return mins >= 0 ? `in ${s}` : `${s} ago`;
}

export const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export const DOC_KINDS = [
  { value: 'sia', label: 'SIA licence' },
  { value: 'rtw', label: 'Right to work' },
  { value: 'id', label: 'Photo ID' },
  { value: 'poa', label: 'Proof of address' },
  { value: 'first_aid', label: 'First aid certificate' },
  { value: 'cctv', label: 'CCTV certificate' },
  { value: 'training', label: 'Training certificate' },
  { value: 'other', label: 'Other' },
];
// Saved by the system when a statement or invoice is issued; never offered for upload
const SYSTEM_KINDS = { pay_statement: 'Pay statement', invoice: 'Invoice' };
export const docKindLabel = (k) => SYSTEM_KINDS[k] || DOC_KINDS.find((d) => d.value === k)?.label || titleCase(k);

export const TIMEOFF_KINDS = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'sick', label: 'Sick' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'other', label: 'Other' },
];

// Expiry tone for a YYYY-MM-DD date
export function expiryTone(days) {
  if (days == null) return null;
  if (days < 0) return 'red';
  if (days <= 30) return 'amber';
  if (days <= 60) return 'blue';
  return 'green';
}
export function expiryText(days) {
  if (days == null) return '';
  if (days < 0) return `Expired ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

export function NotLinked() {
  return (
    <Empty icon={UserX} title="Your account isn't linked yet"
      body="Your login isn't connected to an officer profile, so shifts, pay and clocking aren't available. Please contact the office to get set up." />
  );
}

// Assignment status label for officers
export const ASSIGN_LABEL = { assigned: 'Please respond', accepted: 'Confirmed', requested: 'Requested', declined: 'Declined', cancelled: 'Withdrawn' };
export const assignTone = { assigned: 'amber', accepted: 'green', requested: 'blue', declined: 'grey', cancelled: 'grey' };

// Shift card used on Home and Shifts
export function ShiftCard({ s, to, status, statusTone, children, className }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-footnote font-semibold text-muted"><CalendarDays size={14} />{dayLabel(s.starts_at)}</div>
          <div className="display mt-1 truncate text-title3 font-bold leading-tight">{s.venue_name}</div>
        </div>
        {status && <Pill tone={statusTone}>{status}</Pill>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-subhead text-muted">
        <span className="num inline-flex items-center gap-1.5 font-semibold text-ink"><Clock3 size={16} />{range(s.starts_at, s.ends_at)}</span>
        {s.role_name && <span>{s.role_name}</span>}
        {s.postcode && <span className="inline-flex items-center gap-1"><MapPin size={14} />{s.postcode}</span>}
      </div>
      {children}
    </>
  );
  const cls = cx('block rounded-tile border border-hairline bg-surface p-4 shadow-tile', to && 'transition active:scale-[0.99]', className);
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export { Progress } from '../../ui/index.jsx';

// Incident vocab (matches backend TYPES / SEVERITIES in incidents.mjs)
export const INCIDENT_TYPES = [
  { value: 'ejection', label: 'Ejection' },
  { value: 'refused_entry', label: 'Refused entry' },
  { value: 'assault', label: 'Assault' },
  { value: 'theft', label: 'Theft' },
  { value: 'drugs', label: 'Drugs' },
  { value: 'weapon', label: 'Weapon' },
  { value: 'medical', label: 'Medical' },
  { value: 'damage', label: 'Damage' },
  { value: 'fire', label: 'Fire' },
  { value: 'disorder', label: 'Disorder' },
  { value: 'lost_child', label: 'Lost child' },
  { value: 'vulnerable_person', label: 'Vulnerable person' },
  { value: 'other', label: 'Other' },
];
export const typeLabel = (t) => INCIDENT_TYPES.find((x) => x.value === t)?.label || titleCase(t);
export const SEVERITIES = [
  { value: 'low', label: 'Low', hint: 'No harm, routine' },
  { value: 'medium', label: 'Medium', hint: 'Minor injury or damage' },
  { value: 'high', label: 'High', hint: 'Injury, police involved' },
  { value: 'critical', label: 'Critical', hint: 'Serious harm or risk to life' },
];
export const INCIDENT_STATUS = { submitted: 'Submitted', changes_requested: 'Changes requested', closed: 'Closed' };

// Whole days between an incident and its report, when it was filed more than a day later (same rule as the API)
export function lateDays(inc) {
  const gap = new Date(inc.created_at || Date.now()) - new Date(inc.occurred_at);
  return gap > 86400000 ? Math.floor(gap / 86400000) : 0;
}
export const LatePill = ({ inc }) => {
  const n = lateDays(inc);
  return n ? <Pill tone="amber">Reported {n} day{n > 1 ? 's' : ''} later</Pill> : null;
};

// Set-up steps only the office can finish: shown apart from the officer's own to-dos and not counted with them
export function OfficeWaiting({ tasks, className }) {
  if (!tasks.length) return null;
  return (
    <Section title="Waiting on the office" icon={Hourglass} className={className}>
      <List>
        {tasks.map((t) => (
          <Row key={t.code} left={<span className="grid h-8 w-8 place-items-center rounded-lg bg-fill text-muted"><Hourglass size={18} /></span>}
            title={t.action || t.title} subtitle={t.waiting || 'Nothing for you to do. The office will finish this.'} />
        ))}
      </List>
    </Section>
  );
}
