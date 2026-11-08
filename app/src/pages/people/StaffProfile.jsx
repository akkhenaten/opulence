import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import RecentEmail from '../email/_recent.jsx';
import { Ban, Briefcase, CalendarDays, Mail, Pencil, Phone, PoundSterling, Send, ShieldCheck, UserCheck, UserRound } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Input, Load, Page, Pill, Segmented, Select, Sheet, Tabs, Textarea, Tile, Toggle, date, useAction, useApi, useConfirm, useForm, useUrlState,
} from '../../ui/index.jsx';
import { uploadPhoto } from '../officer/_parts.jsx';
import { inviteStatus } from './_access.jsx';
import { ComplianceBadge, CopyLink, ExpiryPill, LoginPill, OFFICER_STATUSES, SIA_TYPES, Chips, canPay, useBase, useRoles } from './_parts.jsx';
import {
  AttendanceTab, AvailabilityTab, ComplianceTab, ContractsTab, DocumentsTab, GrowthTab, HrTab, OffboardingTab, OnboardingTab, OverviewTab, RatesTab, ShiftsTab, TimeOffTab, TrainingTab,
} from './_profileTabs.jsx';

// Five groups, each a set of sub-views; the sub keys are the old tab keys so access rules and old links carry over
const GROUP_ICON = { overview: UserRound, compliance: ShieldCheck, work: CalendarDays, pay: PoundSterling, hr: Briefcase };
const GROUPS = [
  ['overview', 'Overview', [['overview', 'Overview']]],
  ['compliance', 'Compliance', [['compliance', 'Compliance'], ['documents', 'Documents'], ['training', 'Training']]],
  ['work', 'Work', [['shifts', 'Shifts'], ['attendance', 'Attendance'], ['availability', 'Availability'], ['timeoff', 'Time off']]],
  ['pay', 'Pay', [['rates', 'Rates']]],
  ['hr', 'HR', [['growth', 'One-to-ones'], ['hr', 'HR notes'], ['contracts', 'Contracts'], ['onboarding', 'Onboarding'], ['offboarding', 'Offboarding']]],
];
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([g, , subs]) => subs.map(([k]) => [k, g])));
const CO_ONLY = ['onboarding', 'contracts', 'offboarding'];

export default function StaffProfile() {
  const { id } = useParams();
  const base = useBase();
  const { user } = useAuth();
  const q = useApi('officers.get', { id });
  return (
    <Load q={q}>
      {(o) => <Profile o={o} reload={q.reload} user={user} base={base} />}
    </Load>
  );
}

function Profile({ o, reload, user, base }) {
  const isCo = user.role === 'company';
  const { roles, name: roleName } = useRoles();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [link, setLink] = useState(null);
  const [hidden, setHidden] = useState([]);
  const [url, setUrl] = useUrlState({ tab: 'overview', sub: '' });

  // Every section, in its group; a sub-view goes when access rules or a 403 hide it, a group goes when it has none left
  const groups = useMemo(() => GROUPS.map(([value, label, subs]) => ({
    value, label, icon: GROUP_ICON[value],
    subs: subs.filter(([k]) => (k !== 'rates' || canPay(user)) && (isCo || !CO_ONLY.includes(k)) && !hidden.includes(k)).map(([v, l]) => ({ value: v, label: l })),
  })).filter((g) => g.subs.length), [user, isCo, hidden]);
  // Old links name a section (?tab=documents); ?tab=hr alone meant HR notes
  const legacy = !url.sub && (url.tab === 'hr' ? 'hr' : GROUP_OF[url.tab] && url.tab !== GROUP_OF[url.tab] ? url.tab : null);
  const want = legacy ? GROUP_OF[legacy] : url.tab;
  const group = groups.find((g) => g.value === want) || groups[0];
  const current = (group.subs.find((x) => x.value === (legacy || url.sub)) || group.subs[0]).value;
  const pickGroup = (g) => setUrl({ tab: g, sub: g === 'overview' ? null : groups.find((x) => x.value === g).subs[0].value });
  const pickSub = (x) => setUrl({ tab: group.value, sub: x });
  const forbid = (k) => setHidden((h) => (h.includes(k) ? h : [...h, k]));

  const invite = async () => {
    const r = await run(() => api('officers.inviteLogin', { id: o.id }), 'Invite sent').catch((e) => e);
    // Their email already signs in as a manager: one login does both, no invite needed
    if (r?.data?.can_link) {
      if (await confirm({ title: `Link to ${r.data.user_name}'s manager login?`, body: `${r.data.user_name} keeps signing in as they do today and switches to "My shifts" for their own shifts, pay and training. Another manager approves their hours.`, confirm: 'Link' })) {
        await run(() => api('officers.linkLogin', { id: o.id }), 'Linked to their manager login').catch(() => {});
        reload();
      }
      return;
    }
    if (r instanceof Error) return;
    setLink(r.invite_link);
    reload();
  };
  const resend = async () => {
    const r = await run(() => api('users.resendInvite', { id: o.user_id }), (x) => (x.emailed === false ? "Email didn't send — share the link below" : 'Invite sent again'));
    setLink(r.invite_link);
    reload();
  };
  const invited = o.user_id && o.login_status === 'invited' && inviteStatus(o);
  const suspend = async () => {
    if (!(await confirm({ title: `Suspend ${o.first_name}?`, body: 'They will not be offered or assigned shifts until reinstated.', confirm: 'Suspend', danger: true }))) return;
    await run(() => api('onboarding.setStatus', { officer_id: o.id, status: 'suspended' }), 'Officer suspended');
    reload();
  };

  const props = { o, reload, user, isCo, roles, roleName, onForbidden: forbid };

  return (
    <Page title={o.full_name || o.name} subtitle={o.goes_by?.trim() ? `Goes by ${o.goes_by.trim()}` : undefined} back={{ to: `${base}/staff`, label: isCo ? 'Staff' : 'Officers' }}
      actions={isCo ? [
        { label: 'Edit', icon: Pencil, onClick: () => setEditing(true), main: true },
        !o.user_id && o.email && { label: 'Invite to app', icon: Send, variant: 'soft', busy, onClick: invite },
        o.user_id && o.login_status === 'invited' && { label: 'Resend invite', icon: Send, variant: 'soft', busy, onClick: resend },
        o.status !== 'left' && { label: 'Status', icon: UserCheck, onClick: () => setStatusOpen(true) },
        o.status === 'active' && { label: 'Suspend', icon: Ban, danger: true, onClick: suspend },
      ] : undefined}>
      <Tile className="mb-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={o.name} src={[o.photo_thumb_url, o.photo_url]} size={76} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Pill status={o.status} />
              <ComplianceBadge c={o.compliance} />
              {user.role === 'company' && o.user_id
                ? <Link to={`/company/settings?tab=users&user=${o.user_id}`} aria-label="Sign-in access in Settings" className="pressable"><LoginPill o={o} /></Link>
                : <LoginPill o={o} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(o.roles || []).length ? o.roles.map((r) => <span key={r} className="rounded-lg bg-bg px-2 py-0.5 text-footnote font-semibold">{roleName(r)}</span>)
                : <span className="text-footnote text-faint">No roles set</span>}
            </div>
            {(o.phone || o.email) && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-subhead">
              {o.phone && <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-blue"><Phone size={16} />{o.phone}</a>}
              {o.email && <a href={`mailto:${o.email}`} className="inline-flex min-w-0 items-center gap-1.5 truncate font-semibold text-blue"><Mail size={16} />{o.email}</a>}
            </div>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            <div className="rounded-2xl bg-bg p-3">
              <div className="text-caption2 font-semibold uppercase tracking-wide text-faint">SIA</div>
              <div className="mt-1"><ExpiryPill date={o.sia_expiry} missing="None" /></div>
              {o.sia_expiry && <div className="mt-1 text-caption text-muted num">{date(o.sia_expiry)}</div>}
            </div>
            <div className="rounded-2xl bg-bg p-3">
              <div className="text-caption2 font-semibold uppercase tracking-wide text-faint">Right to work</div>
              <div className="mt-1">{o.rtw_verified ? <ExpiryPill date={o.rtw_expiry} missing="Verified" /> : <Pill tone="red">Not verified</Pill>}</div>
              <div className="mt-1 text-caption text-muted num">{o.rtw_verified ? (o.rtw_expiry ? date(o.rtw_expiry) : 'No expiry') : ''}</div>
            </div>
          </div>
        </div>
        {(o.compliance?.issues?.length > 0 || o.compliance?.graced?.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
            {o.compliance.issues.map((i) => <span key={i} className="rounded-lg bg-red-soft px-2 py-0.5 text-caption font-semibold text-red">{i}</span>)}
            {(o.compliance.graced || []).map((i) => <span key={i} className="rounded-lg bg-amber-soft px-2 py-0.5 text-caption font-semibold text-amber">{i} · grace</span>)}
          </div>
        )}
        {invited && <p className={`mt-3 text-footnote ${invited.tone === 'amber' ? 'text-amber' : 'text-muted'}`}>{invited.short}</p>}
        {link && <div className="mt-4"><CopyLink link={link} hint={invited ? invited.hint : undefined} /></div>}
      </Tile>

      <Tabs tabs={groups} value={group.value} onChange={pickGroup} />
      {group.subs.length > 1 && <Segmented value={current} onChange={pickSub} options={group.subs} className="mb-4" />}

      {current === 'overview' && <OverviewTab {...props} />}
      {current === 'overview' && isCo && <RecentEmail type="officer" id={o.id} />}
      {current === 'compliance' && <ComplianceTab {...props} />}
      {current === 'documents' && <DocumentsTab {...props} onForbidden={() => forbid('documents')} />}
      {current === 'rates' && <RatesTab {...props} />}
      {current === 'shifts' && <ShiftsTab {...props} onForbidden={() => forbid('shifts')} />}
      {current === 'attendance' && <AttendanceTab {...props} onForbidden={() => forbid('attendance')} />}
      {current === 'availability' && <AvailabilityTab {...props} />}
      {current === 'timeoff' && <TimeOffTab {...props} onForbidden={() => forbid('timeoff')} />}
      {current === 'training' && <TrainingTab {...props} onForbidden={() => forbid('training')} />}
      {current === 'growth' && <GrowthTab {...props} onForbidden={() => forbid('growth')} />}
      {current === 'hr' && <HrTab {...props} onForbidden={() => forbid('hr')} />}
      {current === 'onboarding' && <OnboardingTab {...props} onForbidden={() => forbid('onboarding')} />}
      {current === 'contracts' && <ContractsTab {...props} onForbidden={() => forbid('contracts')} />}
      {current === 'offboarding' && <OffboardingTab {...props} />}

      {isCo && editing && <EditSheet open={editing} onClose={() => setEditing(false)} o={o} roles={roles} onDone={reload} />}
      {isCo && statusOpen && <StatusSheet open={statusOpen} onClose={() => setStatusOpen(false)} o={o} onDone={reload} />}
    </Page>
  );
}

const EDIT_KEYS = ['first_name', 'last_name', 'goes_by', 'email', 'phone', 'dob', 'address', 'postcode', 'ni_number', 'utr', 'bank_name', 'bank_sort_code', 'bank_account',
  'sia_number', 'sia_type', 'sia_expiry', 'roles', 'max_weekly_hours', 'start_date', 'notes'];

function EditSheet({ open, onClose, o, roles, onDone }) {
  const form = useForm(() => Object.fromEntries(EDIT_KEYS.map((k) => [k, o[k] ?? (k === 'roles' ? [] : '')])));
  const { v, bind, set } = form;
  const [run, busy] = useAction();
  const [photo, setPhoto] = useState(null);
  const [start] = useState(v);
  const dirty = !!photo || EDIT_KEYS.some((k) => JSON.stringify(v[k]) !== JSON.stringify(start[k]));
  const confirm = useConfirm();
  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Discard changes?', body: "What you've changed here won't be saved.", confirm: 'Discard', cancel: 'Keep editing', danger: true }))) return;
    onClose();
  };
  const save = async () => {
    await run(async () => {
      const body = { id: o.id, ...v, max_weekly_hours: Number(v.max_weekly_hours) || 60 };
      if (photo) { const { photo_key, photo_thumb_key } = await uploadPhoto(photo, 800); Object.assign(body, { photo_key, photo_thumb_key }); }
      return api('officers.save', body);
    }, 'Profile saved');
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit officer" size="lg" full dirty={dirty}
      footer={<><Button variant="secondary" onClick={cancel}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <Group title="Personal">
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" {...bind('first_name')} />
            <Input label="Last name" {...bind('last_name')} />
            <Input label="Goes by (optional)" placeholder="e.g. Goddey" maxLength={40} className="col-span-2" {...bind('goes_by')} />
            <Input label="Email" type="email" {...bind('email')} />
            <Input label="Mobile" type="tel" {...bind('phone')} />
            <Input label="Date of birth" type="date" {...bind('dob')} />
            <Input label="Postcode" {...bind('postcode')} />
          </div>
          <Textarea label="Address" rows={2} {...bind('address')} />
          <label className="block">
            <span className="mb-1.5 block text-footnote font-semibold text-muted">Photo</span>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} className="block w-full text-subhead file:mr-3 file:rounded-xl file:border-0 file:bg-blue-soft file:px-3 file:py-2 file:font-semibold file:text-blue" />
          </label>
        </Group>
        <Group title="Work">
          <Chips label="Roles" options={roles.map((r) => ({ value: r.code, label: r.name }))} value={v.roles} onChange={(x) => set('roles', x)} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input label="SIA number" {...bind('sia_number')} />
            <Select label="Licence type" placeholder="Choose" options={SIA_TYPES} {...bind('sia_type')} />
            <Input label="SIA expiry" type="date" {...bind('sia_expiry')} />
            <Input label="Start date" type="date" {...bind('start_date')} />
            <Input label="Max hours a week" type="number" min="0" {...bind('max_weekly_hours')} />
          </div>
        </Group>
        <Group title="Tax and bank">
          <div className="grid grid-cols-2 gap-3">
            <Input label="NI number" {...bind('ni_number')} />
            <Input label="UTR" {...bind('utr')} />
            <Input label="Bank" {...bind('bank_name')} />
            <Input label="Sort code" inputMode="numeric" placeholder="00-00-00" {...bind('bank_sort_code')} />
            <Input label="Account number" inputMode="numeric" className="col-span-2 sm:col-span-1" {...bind('bank_account')} />
          </div>
        </Group>
        <Textarea label="Internal notes" rows={3} {...bind('notes')} />
      </div>
    </Sheet>
  );
}

export const Group = ({ title, children }) => (
  <div className="space-y-3">
    <div className="text-footnote font-semibold uppercase tracking-wide text-faint">{title}</div>
    {children}
  </div>
);

function StatusSheet({ open, onClose, o, onDone }) {
  const [status, setStatus] = useState(o.status === 'left' ? 'onboarding' : o.status);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [force, setForce] = useState(false);
  const save = async () => {
    try {
      await run(() => api('onboarding.setStatus', { officer_id: o.id, status, force }), 'Status updated');
    } catch (e) {
      if (e.status === 422 && !force && await confirm({ title: 'Officer is not compliant', body: `${e.message}. Make them active anyway?`, confirm: 'Make active', danger: true })) {
        await run(() => api('onboarding.setStatus', { officer_id: o.id, status, force: true }), 'Status updated');
      } else return;
    }
    onDone();
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Change status" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={OFFICER_STATUSES.filter((s) => s !== 'left')} />
        {status === 'active' && <Toggle checked={force} onChange={setForce} label="Override compliance checks" hint="Only if you have seen the documents in person" />}
        <p className="text-footnote text-muted">To record a leaver, use the Offboarding tab.</p>
      </div>
    </Sheet>
  );
}
