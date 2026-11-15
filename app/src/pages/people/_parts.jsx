import { useState } from 'react';
import { Check, Copy, FileText, Link2 } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { viewFiles } from '../../ui/FileViewer.jsx';
import { Button, Chips, Input, Pill, Pressable, Select, Toggle, cx, date, daysUntil, useApi, useToast } from '../../ui/index.jsx';

export const OFFICER_STATUSES = ['active', 'onboarding', 'applicant', 'suspended', 'left'];

export const SIA_TYPES = [
  'Door Supervisor', 'Security Guarding', 'CCTV (Public Space Surveillance)', 'Close Protection',
  'Cash and Valuables in Transit', 'Key Holding', 'Vehicle Immobilising',
].map((s) => ({ value: s, label: s }));

export const RTW_TYPES = [
  'British or Irish passport', 'British passport', 'Irish passport', 'Birth certificate and NI', 'Share code', 'EU Settled Status', 'Biometric residence permit', 'Visa', 'Other',
].map((s) => ({ value: s, label: s }));

export const DOC_KINDS = [
  { value: 'sia', label: 'SIA licence' }, { value: 'rtw', label: 'Right to work' }, { value: 'id', label: 'Photo ID' },
  { value: 'poa', label: 'Proof of address' }, { value: 'training', label: 'Training certificate' }, { value: 'first_aid', label: 'First aid' }, { value: 'cctv', label: 'CCTV certificate' },
  { value: 'contract', label: 'Contract' }, { value: 'other', label: 'Other' },
];
export const docKindLabel = (k) => DOC_KINDS.find((d) => d.value === k)?.label || k;

export const TIMEOFF_KINDS = ['holiday', 'sick', 'unavailable', 'other'];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function useBase() {
  const { user } = useAuth();
  return '/' + user.role;
}
export const canPay = (user) => user?.role === 'company' || (user?.role === 'security' && user?.can_see_pay);

export function useRoles() {
  const q = useApi('roles.list');
  const roles = q.data || [];
  const name = (code) => roles.find((r) => r.code === code)?.name || code;
  return { roles, name };
}

// Compliance summary from officers.list / officers.get `compliance` object
export function complianceState(c) {
  if (!c) return { tone: 'grey', label: 'Unknown' };
  const hard = (c.issues || []).filter((i) => !i.startsWith('Status:'));
  if (hard.length) return { tone: 'red', label: hard.some((i) => i.startsWith('SIA register')) ? 'SIA not active' : hard.some((i) => /expired/i.test(i)) ? 'Expired' : 'Missing checks', detail: hard.join(' · ') };
  if (c.grace) return { tone: 'amber', label: `On grace until ${date(c.grace.ends_on)}`, detail: graceDetail(c) };
  // In date but nobody has checked it: they can still be rostered, so this is a label, not a block
  if (c.sia_checked === false) return { tone: 'amber', label: 'SIA in date · not checked', detail: 'The licence date is in date, but nobody has checked the licence yet. They can still be rostered.' };
  const soon = [c.sia_days, c.rtw_days].filter((d) => d != null && d <= 30);
  if (soon.length) {
    const d = Math.min(...soon);
    return { tone: 'amber', label: d <= 0 ? 'Expires today' : `Expires in ${d}d`, detail: 'Licence or right to work expiring soon' };
  }
  return { tone: 'green', label: 'Compliant' };
}
// One grace wording for managers everywhere
export const graceDetail = (c) => `Can work while they send ${(c.graced || []).join(', ')}`;
export const graceLine = (c) => `On grace until ${date(c.grace.ends_on)}: can work while they send ${(c.graced || []).join(', ')}`;

export function ComplianceBadge({ c, className }) {
  const s = complianceState(c);
  return <Pill tone={s.tone} className={className}>{s.label}</Pill>;
}

// Days-to-expiry pill for a date
// checked={false}: the date is fine but nobody has checked the document, so it never reads as Valid
export function ExpiryPill({ date: d, missing = 'Not set', checked }) {
  if (!d) return <Pill tone="grey">{missing}</Pill>;
  const n = daysUntil(d);
  if (n < 0) return <Pill tone="red">Expired</Pill>;
  if (checked === false) return <Pill tone="amber">{n <= 30 ? `${n}d left` : 'In date'} · not checked</Pill>;
  if (n <= 30) return <Pill tone="amber">{n}d left</Pill>;
  return <Pill tone="green">Valid</Pill>;
}

// Shows an invite/reset link (relative /app/...) with a copy button
export function CopyLink({ link, label = 'Invite link', hint = 'Email may not be set up yet, so share this link directly.' }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  if (!link) return null;
  const full = link.startsWith('http') ? link : window.location.origin + link;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setDone(true);
      toast('Link copied');
      setTimeout(() => setDone(false), 2000);
    } catch {
      toast('Could not copy. Select the link and copy it manually.', 'error');
    }
  };
  return (
    <div className="rounded-2xl bg-blue-soft p-4">
      <div className="mb-1 flex items-center gap-1.5 text-footnote font-semibold uppercase tracking-wide text-blue"><Link2 size={14} />{label}</div>
      <div className="break-all rounded-xl bg-surface px-3 py-2 font-mono text-caption text-ink select-all">{full}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-caption text-muted">{hint}</span>
        <Button size="sm" icon={done ? Check : Copy} onClick={copy}>{done ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  );
}

export { Chips };

// Core officer fields used by "Add officer" and "Add applicant"
export function OfficerCoreFields({ form, roles, statusOptions = ['active', 'onboarding', 'applicant'], showInvite = true }) {
  const { v, bind, set } = form;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" {...bind('first_name')} autoFocus />
        <Input label="Last name" {...bind('last_name')} />
        <Input label="Goes by (optional)" placeholder="e.g. Goddey" maxLength={40} className="col-span-2" {...bind('goes_by')} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Email" type="email" {...bind('email')} />
        <Input label="Mobile" type="tel" {...bind('phone')} />
      </div>
      <Chips label="Roles" options={roles.map((r) => ({ value: r.code, label: r.name }))} value={v.roles} onChange={(x) => set('roles', x)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="SIA number" inputMode="numeric" {...bind('sia_number')} />
        <Select label="Licence type" placeholder="Choose" options={SIA_TYPES} {...bind('sia_type')} />
        <Input label="SIA expiry" type="date" {...bind('sia_expiry')} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {statusOptions.length > 1 && <Select label="Status" options={statusOptions} {...bind('status')} />}
        <Input label="Start date" type="date" {...bind('start_date')} />
      </div>
      {showInvite && (
        <div className="rounded-2xl bg-bg px-4 py-2">
          <Toggle checked={v.invite} onChange={(x) => set('invite', x)} label="App access" hint={v.email ? 'Creates their login and emails an invite to the officer app' : 'Add an email address to give them app access'} />
        </div>
      )}
    </div>
  );
}

export const emptyOfficer = (status = 'active') => ({
  first_name: '', last_name: '', goes_by: '', email: '', phone: '', roles: [], sia_number: '', sia_type: '', sia_expiry: '', start_date: '', status, invite: false,
});

export function cleanOfficer(v) {
  const out = { ...v };
  out.invite = !!(v.invite && v.email);
  return out;
}

export { Progress } from '../../ui/index.jsx';

// Small pictures of uploaded cards (SIA, passport/ID) on the profile; a tap opens them full size in the app
export function DocThumbs({ docs, className }) {
  if (!docs?.length) return null;
  const files = docs.map((d) => ({ url: d.url, mime: d.mime, name: d.title }));
  return (
    <div className={cx('flex flex-wrap gap-2', className)}>
      {docs.map((d, k) => (
        <Pressable press key={d.id} onClick={() => viewFiles(files, k)} aria-label={`View ${d.title}`}
          className="grid h-[72px] w-[104px] place-items-center overflow-hidden rounded-xl border border-line bg-fill text-muted">
          {String(d.mime || '').startsWith('image/') && d.mime !== 'image/heic'
            ? <img src={d.url} alt={d.title} loading="lazy" className="h-full w-full object-cover" />
            : <span className="flex flex-col items-center gap-1 px-2 text-caption"><FileText size={20} /><span className="line-clamp-1">{d.title}</span></span>}
        </Pressable>
      ))}
    </div>
  );
}

// Open a file from an action (it returns { url, mime?, name? }) in the in-app viewer
export async function openUrl(fn) {
  viewFiles([{ load: fn }]);
}
