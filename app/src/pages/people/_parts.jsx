import { useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Button, Input, Pill, Select, Toggle, cx, daysUntil, useApi, useToast } from '../../ui/index.jsx';

export const OFFICER_STATUSES = ['active', 'onboarding', 'applicant', 'suspended', 'left'];

export const SIA_TYPES = [
  'Door Supervisor', 'Security Guarding', 'CCTV (Public Space Surveillance)', 'Close Protection',
  'Cash and Valuables in Transit', 'Key Holding', 'Vehicle Immobilising',
].map((s) => ({ value: s, label: s }));

export const RTW_TYPES = [
  'British or Irish passport', 'Birth certificate and NI', 'Share code', 'EU Settled Status', 'Biometric residence permit', 'Visa', 'Other',
].map((s) => ({ value: s, label: s }));

export const DOC_KINDS = [
  { value: 'sia', label: 'SIA licence' }, { value: 'rtw', label: 'Right to work' }, { value: 'id', label: 'Photo ID' },
  { value: 'poa', label: 'Proof of address' }, { value: 'training', label: 'Training certificate' }, { value: 'first_aid', label: 'First aid' },
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
  if (hard.length) return { tone: 'red', label: hard.some((i) => /expired/i.test(i)) ? 'Expired' : 'Missing checks', detail: hard.join(' · ') };
  const soon = [c.sia_days, c.rtw_days].filter((d) => d != null && d <= 30);
  if (soon.length) {
    const d = Math.min(...soon);
    return { tone: 'amber', label: d <= 0 ? 'Expires today' : `Expires in ${d}d`, detail: 'Licence or right to work expiring soon' };
  }
  return { tone: 'green', label: 'Compliant' };
}
export function ComplianceBadge({ c, className }) {
  const s = complianceState(c);
  return <Pill tone={s.tone} className={className}>{s.label}</Pill>;
}

// Days-to-expiry pill for a date
export function ExpiryPill({ date: d, missing = 'Not set' }) {
  if (!d) return <Pill tone="grey">{missing}</Pill>;
  const n = daysUntil(d);
  if (n < 0) return <Pill tone="red">Expired</Pill>;
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
      <div className="break-all rounded-xl bg-white px-3 py-2 font-mono text-caption text-ink select-all">{full}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-caption text-muted">{hint}</span>
        <Button size="sm" icon={done ? Check : Copy} onClick={copy}>{done ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  );
}

export { Chips } from '../../ui/index.jsx';

// Core officer fields used by "Add officer" and "Add applicant"
export function OfficerCoreFields({ form, roles, statusOptions = ['active', 'onboarding', 'applicant'], showInvite = true }) {
  const { v, bind, set } = form;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input label="First name" {...bind('first_name')} autoFocus />
        <Input label="Last name" {...bind('last_name')} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Email" type="email" {...bind('email')} />
        <Input label="Mobile" type="tel" {...bind('phone')} />
      </div>
      <Chips label="Roles" options={roles.map((r) => ({ value: r.code, label: r.name }))} value={v.roles} onChange={(x) => set('roles', x)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="SIA number" inputMode="numeric" {...bind('sia_number')} />
        <Select label="Licence type" placeholder="Choose" options={SIA_TYPES} {...bind('sia_type')} />
        <Input label="SIA expiry" type="date" {...bind('sia_expiry')} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {statusOptions.length > 1 && <Select label="Status" options={statusOptions} {...bind('status')} />}
        <Input label="Start date" type="date" {...bind('start_date')} />
      </div>
      {showInvite && (
        <div className="rounded-2xl bg-bg px-4 py-2">
          <Toggle checked={v.invite} onChange={(x) => set('invite', x)} label="Invite to the app" hint={v.email ? 'Creates a login and sends an invite email' : 'Add an email address to invite'} />
        </div>
      )}
    </div>
  );
}

export const emptyOfficer = (status = 'active') => ({
  first_name: '', last_name: '', email: '', phone: '', roles: [], sia_number: '', sia_type: '', sia_expiry: '', start_date: '', status, invite: false,
});

export function cleanOfficer(v) {
  const out = { ...v };
  out.invite = !!(v.invite && v.email);
  return out;
}

export function LoginPill({ o }) {
  if (!o.user_id) return <Pill tone="grey">No app login</Pill>;
  if (o.login_status === 'invited') return <Pill tone="amber">Invite pending</Pill>;
  if (o.login_status === 'disabled') return <Pill tone="grey">Login disabled</Pill>;
  return <Pill tone="blue">App active</Pill>;
}

export { Progress } from '../../ui/index.jsx';

// Open a presigned URL from an action without the popup being blocked
export async function openUrl(fn) {
  const w = window.open('', '_blank');
  try {
    const { url } = await fn();
    if (w) w.location = url; else window.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}
