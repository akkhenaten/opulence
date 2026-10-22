// Helpers shared by the officer screens and the incident screens
import { Link } from 'react-router-dom';
import { CalendarDays, Clock3, MapPin, UserX } from 'lucide-react';
import { cx, dayLabel, Empty, Pill, range, titleCase } from '../../ui/index.jsx';

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
  const cls = cx('block rounded-tile border border-black/[0.04] bg-surface p-4 shadow-tile', to && 'transition active:scale-[0.99]', className);
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
