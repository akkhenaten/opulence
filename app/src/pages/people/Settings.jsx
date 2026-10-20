import { useEffect, useState } from 'react';
import { Building2, CalendarDays, Clock, FileSignature, KeyRound, Landmark, LayoutGrid, Percent, Plus, ReceiptText, Trash2, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Empty, IconButton, Input, List, Load, Page, Pill, Row, Section, Segmented, Select, Sheet, Tabs, Textarea, Tile, Toggle,
  dayLabel, isoDate, relative, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { Chips, CopyLink, DOC_KINDS, docKindLabel, SIA_TYPES } from './_parts.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';

const TABS = [
  { value: 'company', label: 'Company' }, { value: 'users', label: 'Users' }, { value: 'calendar', label: 'Roles & holidays' },
  { value: 'contracts', label: 'Contracts' }, { value: 'account', label: 'My account' },
];

export default function Settings() {
  const [tab, setTab] = useState('company');
  return (
    <Page title="Settings" subtitle="Company, users and templates">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'company' && <CompanyTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'contracts' && <ContractsTab />}
      {tab === 'account' && <AccountTab />}
    </Page>
  );
}

/* ---------------- Company ---------------- */

const NUMERIC = ['vat_rate', 'payment_terms_days', 'grace_minutes', 'auto_signoff_days', 'rounding_minutes', 'night_start', 'night_end',
  'pay_night_uplift', 'pay_weekend_uplift', 'pay_bh_uplift', 'gps_tolerance_m'];
const hourOpts = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));

function CompanyTab() {
  const q = useApi('settings.get');
  return <Load q={q}>{(s) => <><ModulesTile s={s} onSaved={(d) => q.setData(d)} /><CompanyForm s={s} onSaved={(d) => q.setData(d)} /></>}</Load>;
}

const MODULES = [
  { key: 'academy', label: 'Academy', hint: 'Training courses with quizzes and certificates' },
  { key: 'toolbox', label: 'Toolbox', hint: 'Quick guide cards officers can open on shift' },
  { key: 'everyday', label: 'Everyday', hint: 'Team feed with posts, photos and comments' },
];

// Switching a module off hides it from every menu straight away; nothing is deleted
function ModulesTile({ s, onSaved }) {
  const [run] = useAction();
  const confirm = useConfirm();
  const flip = (k) => async (on) => {
    if (!on && !(await confirm({ title: `Switch off ${MODULES.find((m) => m.key === k).label}?`, body: 'It disappears for everyone. Nothing is deleted — switch it back on at any time.', confirm: 'Switch off', danger: true }))) return;
    const d = await run(() => api('settings.update', { modules: { [k]: on } }), on ? 'Switched on' : 'Switched off').catch(() => null);
    if (d) { onSaved(d); window.dispatchEvent(new Event('orb:settings')); }
  };
  return (
    <Tile title="Modules" icon={LayoutGrid} className="mb-4">
      <div className="space-y-2">
        {MODULES.map((m) => <Toggle key={m.key} checked={s.modules?.[m.key] !== false} onChange={flip(m.key)} label={m.label} hint={m.hint} />)}
      </div>
    </Tile>
  );
}

function CompanyForm({ s, onSaved }) {
  const toStr = (x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v == null ? '' : String(v)]));
  const { v, bind, setV } = useForm(toStr(s));
  const [dirty, setDirty] = useState(false);
  const [run, busy] = useAction();
  useEffect(() => { setDirty(Object.keys(v).some((k) => String(s[k] ?? '') !== v[k])); }, [v, s]);
  const b = (k) => bind(k);
  const save = async () => {
    const body = {};
    for (const k of Object.keys(v)) if (String(s[k] ?? '') !== v[k]) body[k] = NUMERIC.includes(k) ? Number(v[k] || 0) : v[k];
    const d = await run(() => api('settings.update', body), 'Settings saved');
    onSaved(d);
    setV(toStr(d));
  };
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tile title="Company" icon={Building2} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Company name" {...b('company_name')} />
            <Input label="Company number" {...b('company_number')} />
            <Input label="Email" type="email" {...b('company_email')} />
            <Input label="Phone" type="tel" {...b('company_phone')} />
            <Textarea label="Address" rows={3} className="sm:col-span-2" hint="Shown on invoices and pay statements" {...b('company_address')} />
          </div>
        </Tile>
        <Tile title="VAT" icon={Percent}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="VAT number" {...b('vat_number')} />
            <Input label="VAT rate (%)" type="number" step="0.01" min="0" {...b('vat_rate')} />
          </div>
        </Tile>
        <Tile title="Bank for client payments" icon={Landmark}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Bank" className="col-span-2" {...b('bank_name')} />
            <Input label="Sort code" inputMode="numeric" placeholder="00-00-00" {...b('bank_sort_code')} />
            <Input label="Account number" inputMode="numeric" {...b('bank_account')} />
          </div>
        </Tile>
        <Tile title="Invoicing" icon={ReceiptText}>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Invoice prefix" {...b('invoice_prefix')} />
            <Input label="Payment terms (days)" type="number" min="0" {...b('payment_terms_days')} />
            <Select label="Invoice cycle" className="col-span-2" options={['weekly', 'monthly']} {...b('invoice_cycle')} />
          </div>
        </Tile>
        <Tile title="Pay and timesheets" icon={Clock}>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Pay period" options={['weekly', 'fortnightly', 'monthly']} {...b('pay_period')} />
            <Input label="Round to (minutes)" type="number" min="0" hint="0 for exact minutes" {...b('rounding_minutes')} />
            <Input label="Late grace (minutes)" type="number" min="0" {...b('grace_minutes')} />
            <Input label="Auto sign-off (days)" type="number" min="0" hint="Venue sign-off window" {...b('auto_signoff_days')} />
            <Input label="GPS tolerance (metres)" type="number" min="0" className="col-span-2" hint="Extra distance allowed outside a venue's radius" {...b('gps_tolerance_m')} />
          </div>
        </Tile>
        <Tile title="Officer pay uplifts" icon={Percent} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Select label="Night starts" options={hourOpts} {...b('night_start')} />
            <Select label="Night ends" options={hourOpts} {...b('night_end')} />
            <Input label="Night (%)" type="number" step="0.01" min="0" {...b('pay_night_uplift')} />
            <Input label="Weekend (%)" type="number" step="0.01" min="0" {...b('pay_weekend_uplift')} />
            <Input label="Bank holiday (%)" type="number" step="0.01" min="0" {...b('pay_bh_uplift')} />
          </div>
          <p className="mt-3 text-caption text-faint">Added on top of the officer's base rate for hours in each band. Client uplifts are set per venue rate.</p>
        </Tile>
      </div>
      <div className="sticky bottom-20 z-10 mt-4 flex justify-end lg:bottom-4">
        <Button size="lg" busy={busy} disabled={!dirty} onClick={save} className="shadow-tile">Save changes</Button>
      </div>
    </>
  );
}

/* ---------------- Users ---------------- */

const USER_ROLES = ['company', 'security', 'venue'];

function UsersTab() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('all');
  const q = useApi('users.list');
  const venues = useApi('venues.list');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(null);
  return (
    <Load q={q}>
      {(all) => {
        const rows = all.filter((u) => (role === 'all' ? u.role !== 'officer' : u.role === role));
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Segmented value={role} onChange={setRole} options={[{ value: 'all', label: 'Managers' }, ...USER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r].replace(' manager', '') })), { value: 'officer', label: 'Officers' }]} />
              <Button icon={UserPlus} onClick={() => setInviting(true)}>Invite user</Button>
            </div>
            {rows.length ? (
              <List>
                {rows.map((u) => (
                  <Row key={u.id} onClick={() => setEditing(u)} chevron
                    left={<Avatar name={u.name} size={40} />}
                    title={<span>{u.name}{u.id === me.id && <span className="ml-1.5 text-caption font-semibold text-faint">You</span>}</span>}
                    subtitle={[u.email, u.venues?.length ? u.venues.join(', ') : null, u.last_login ? `Seen ${relative(u.last_login)}` : null].filter(Boolean).join(' · ')}
                    right={<div className="flex flex-col items-end gap-1"><Pill tone="grey">{ROLE_LABEL[u.role]}</Pill>{u.status !== 'active' && <Pill status={u.status === 'invited' ? 'pending' : 'cancelled'}>{u.status === 'invited' ? 'Invited' : 'Disabled'}</Pill>}</div>} />
                ))}
              </List>
            ) : <Empty title="No users" />}
            {inviting && <InviteSheet venues={venues.data || []} onClose={() => setInviting(false)} onDone={q.reload} />}
            {editing && <UserSheet u={editing} me={me} venues={venues.data || []} onClose={() => setEditing(null)} onDone={q.reload} />}
          </>
        );
      }}
    </Load>
  );
}

function InviteSheet({ venues, onClose, onDone }) {
  const { v, bind, set } = useForm({ name: '', email: '', phone: '', role: 'security', venue_ids: [], can_see_pay: false });
  const [run, busy] = useAction();
  const [link, setLink] = useState(null);
  const send = async () => {
    const r = await run(() => api('users.invite', { ...v, venue_ids: v.role === 'company' ? undefined : v.venue_ids, can_see_pay: v.role === 'security' && v.can_see_pay }), 'Invite sent');
    setLink(r.invite_link);
    onDone();
  };
  return (
    <Sheet open onClose={onClose} title={link ? 'Invite sent' : 'Invite user'}
      footer={link ? <Button onClick={onClose}>Done</Button>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.name || !v.email} onClick={send}>Send invite</Button></>}>
      {link ? <CopyLink link={link} /> : (
        <div className="space-y-4">
          <Segmented value={v.role} onChange={(r) => set('role', r)} options={USER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          <p className="text-footnote text-muted">{ROLE_HINT[v.role]}</p>
          <Input label="Full name" {...bind('name')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" {...bind('email')} />
            <Input label="Phone" type="tel" {...bind('phone')} />
          </div>
          {v.role !== 'company' && <Chips label={v.role === 'venue' ? 'Venues they manage' : 'Venues they look after'} options={venues.map((x) => ({ value: x.id, label: x.name }))} value={v.venue_ids} onChange={(x) => set('venue_ids', x)} />}
          {v.role === 'security' && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
          <p className="text-caption text-faint">Officers are invited from Staff.</p>
        </div>
      )}
    </Sheet>
  );
}
const ROLE_HINT = {
  company: 'Full access to everything, including money and settings.',
  security: 'Runs the rota, live view, timesheets and incidents for their venues.',
  venue: 'Client contact. Requests cover, signs off timesheets and sees invoices for their venues.',
};

function UserSheet({ u, me, venues, onClose, onDone }) {
  const { v, bind, set } = useForm({ name: u.name, phone: u.phone || '', can_see_pay: !!u.can_see_pay, venue_ids: u.venue_ids || [] });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [link, setLink] = useState(null);
  const save = async () => {
    await run(() => api('users.update', { id: u.id, ...v, venue_ids: ['security', 'venue'].includes(u.role) ? v.venue_ids : undefined }), 'User updated');
    onDone();
    onClose();
  };
  const setStatus = async (status) => {
    if (status === 'disabled' && !(await confirm({ title: `Deactivate ${u.name}?`, body: 'They will be signed out and unable to log in.', confirm: 'Deactivate', danger: true }))) return;
    await run(() => api('users.update', { id: u.id, status }), status === 'disabled' ? 'User deactivated' : 'User reactivated');
    onDone();
    onClose();
  };
  const reset = async () => setLink((await run(() => api('users.resetLink', { id: u.id }), 'Link created')).link);
  const resend = async () => setLink((await run(() => api('users.resendInvite', { id: u.id }), 'Invite sent again')).invite_link);
  return (
    <Sheet open onClose={onClose} title={u.name}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Pill tone="grey">{ROLE_LABEL[u.role]}</Pill><Pill status={u.status === 'active' ? 'active' : u.status === 'invited' ? 'pending' : 'cancelled'}>{u.status === 'invited' ? 'Invited' : u.status === 'active' ? 'Active' : 'Disabled'}</Pill><span className="text-footnote text-muted">{u.email}</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" {...bind('name')} />
          <Input label="Phone" type="tel" {...bind('phone')} />
        </div>
        {['security', 'venue'].includes(u.role) && <Chips label="Venues" options={venues.map((x) => ({ value: x.id, label: x.name }))} value={v.venue_ids} onChange={(x) => set('venue_ids', x)} />}
        {u.role === 'security' && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
        {link ? <CopyLink link={link} label={u.status === 'invited' ? 'Invite link' : 'Password reset link'} hint="Valid for 48 hours. Share it directly." /> : u.status === 'invited' && u.invite_link && <CopyLink link={u.invite_link} />}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {u.status === 'invited' && <Button variant="soft" onClick={resend}>Resend invite</Button>}
          {u.status === 'active' && <Button variant="soft" icon={KeyRound} onClick={reset}>Password reset link</Button>}
          {u.status !== 'disabled' && u.id !== me.id && <Button variant="danger" onClick={() => setStatus('disabled')}>Deactivate</Button>}
          {u.status === 'disabled' && <Button variant="secondary" onClick={() => setStatus('active')}>Reactivate</Button>}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Roles & bank holidays ---------------- */

const ROLE_DOCS = DOC_KINDS.filter((d) => !['sia', 'contract', 'other'].includes(d.value));

function RoleSheet({ role, onClose, onSaved }) {
  const [run, busy] = useAction();
  const [v, setV] = useState({ requires_sia: role.requires_sia, accepted_licences: role.accepted_licences || [], required_docs: role.required_docs || [] });
  const save = () => run(() => api('roles.update', { code: role.code, ...v, accepted_licences: v.requires_sia ? v.accepted_licences : [] }), 'Role updated').then(onSaved).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={role.name} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.requires_sia} onChange={(x) => setV((s) => ({ ...s, requires_sia: x }))} label="SIA licence required" hint="Officers need a valid licence to work this role" /></div>
        {v.requires_sia && (
          <div>
            <Chips label="Licences that cover this role" options={SIA_TYPES} value={v.accepted_licences} onChange={(x) => setV((s) => ({ ...s, accepted_licences: x }))} />
            <p className="mt-1.5 text-caption text-muted">{v.accepted_licences.length ? 'Officers with another licence type are flagged when rostered on this role.' : 'None picked: any SIA licence is accepted.'}</p>
          </div>
        )}
        <Chips label="Other documents officers need" options={ROLE_DOCS} value={v.required_docs} onChange={(x) => setV((s) => ({ ...s, required_docs: x }))} />
      </div>
    </Sheet>
  );
}

function CalendarTab() {
  const { user } = useAuth();
  const roles = useApi('roles.list');
  const [editing, setEditing] = useState(null);
  const bh = useApi('bankHolidays.list');
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const { v, bind, setV } = useForm({ day: '', name: '' });
  const [showPast, setShowPast] = useState(false);
  const add = async () => {
    await run(() => api('bankHolidays.save', v), 'Bank holiday saved');
    setV({ day: '', name: '' });
    bh.reload();
  };
  const del = async (h) => {
    if (!(await confirm({ title: `Remove ${h.name}?`, body: 'Hours on this day will no longer get the bank holiday uplift.', confirm: 'Remove', danger: true }))) return;
    await run(() => api('bankHolidays.delete', { day: h.day }), 'Removed');
    bh.reload();
  };
  const today = isoDate();
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <Section title="Roles" className="mt-0">
          <Load q={roles}>
            {(rows) => (
              <List>
                {rows.map((r) => (
                  <Row key={r.code} title={r.name} chevron={user.role === 'company'} onClick={user.role === 'company' ? () => setEditing(r) : undefined}
                    subtitle={[r.accepted_licences?.length ? r.accepted_licences.join(' or ') : r.requires_sia ? 'Any SIA licence' : null, r.required_docs?.length ? `Needs ${r.required_docs.map(docKindLabel).join(', ').toLowerCase()}` : null].filter(Boolean).join(' · ') || r.code}
                    right={r.requires_sia ? <Pill tone="blue">SIA required</Pill> : <Pill tone="grey">No SIA</Pill>} />
                ))}
              </List>
            )}
          </Load>
          {user.role === 'company' && <p className="mt-2 px-1 text-caption text-muted">Tap a role to set which licences cover it and which documents officers need. The compliance check uses these.</p>}
        </Section>
        {editing && <RoleSheet role={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); roles.reload(); }} />}
      </div>
      <div className="lg:col-span-3">
        <Section title="Bank holidays" className="mt-0" action={<button type="button" className="text-footnote font-semibold text-blue" onClick={() => setShowPast((x) => !x)}>{showPast ? 'Hide past' : 'Show past'}</button>}>
          <Tile className="mb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input label="Date" type="date" className="sm:w-44" {...bind('day')} />
              <Input label="Name" className="flex-1" {...bind('name')} />
              <Button icon={Plus} busy={busy} disabled={!v.day || !v.name} onClick={add}>Add</Button>
            </div>
          </Tile>
          <Load q={bh}>
            {(rows) => {
              const list = rows.filter((h) => showPast || h.day >= today);
              return list.length ? (
                <List>
                  {list.map((h) => (
                    <Row key={h.day} left={<CalendarDays size={18} className="text-blue" />} title={h.name} subtitle={dayLabel(h.day) + ' ' + h.day.slice(0, 4)}
                      right={<IconButton icon={Trash2} label="Remove" className="text-red" onClick={() => del(h)} />} />
                  ))}
                </List>
              ) : <Empty icon={CalendarDays} title="No bank holidays" />;
            }}
          </Load>
        </Section>
      </div>
    </div>
  );
}

/* ---------------- Contract templates ---------------- */

function ContractsTab() {
  const q = useApi('contracts.templates');
  const [editing, setEditing] = useState(null);
  return (
    <Load q={q}>
      {(rows) => (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-subhead text-muted">Templates for e-signature. Placeholders: {'{{company}}'}, {'{{officer}}'}, {'{{utr}}'}.</p>
            <Button icon={Plus} onClick={() => setEditing({})}>New template</Button>
          </div>
          {rows.length ? (
            <List>
              {rows.map((t) => (
                <Row key={t.id} onClick={() => setEditing(t)} chevron left={<FileSignature size={20} className="text-blue" />}
                  title={t.title} subtitle={t.body.slice(0, 120)} right={t.active ? <Pill tone="green">Active</Pill> : <Pill tone="grey">Archived</Pill>} />
              ))}
            </List>
          ) : <Empty icon={FileSignature} title="No templates" />}
          {editing && <TemplateSheet t={editing} onClose={() => setEditing(null)} onDone={q.reload} />}
        </>
      )}
    </Load>
  );
}

function TemplateSheet({ t, onClose, onDone }) {
  const { v, bind, set } = useForm({ title: t.title || '', body: t.body || '', active: t.active !== false });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('contracts.saveTemplate', { id: t.id, ...v }), 'Template saved');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={t.id ? 'Edit template' : 'New template'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.title || !v.body} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Title" {...bind('title')} />
        <Textarea label="Agreement text" rows={16} hint="Changes apply to contracts sent from now on. Signed contracts are not changed." {...bind('body')} />
        {t.id && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.active} onChange={(x) => set('active', x)} label="Active" hint="Archived templates can't be sent" /></div>}
      </div>
    </Sheet>
  );
}

/* ---------------- Account ---------------- */

function AccountTab() {
  const { user } = useAuth();
  const { v, bind, setV } = useForm({ current: '', password: '', confirm: '' });
  const [run, busy] = useAction();
  const mismatch = v.confirm && v.password !== v.confirm;
  const save = async () => {
    await run(() => api('auth.changePassword', { current: v.current, password: v.password }), 'Password changed');
    setV({ current: '', password: '', confirm: '' });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Tile title="Signed in as">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} size={52} />
          <div className="min-w-0"><div className="truncate text-headline font-bold">{user.name}</div><div className="truncate text-subhead text-muted">{user.email}</div><Pill tone="blue" className="mt-1">{ROLE_LABEL[user.role]}</Pill></div>
        </div>
      </Tile>
      <Tile title="Change password" icon={KeyRound}>
        <div className="space-y-3">
          <Input label="Current password" type="password" autoComplete="current-password" {...bind('current')} />
          <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" {...bind('password')} />
          <Input label="Confirm new password" type="password" autoComplete="new-password" hint={mismatch ? 'Passwords do not match' : undefined} {...bind('confirm')} />
          <div className="flex justify-end"><Button busy={busy} disabled={!v.current || v.password.length < 8 || v.password !== v.confirm} onClick={save}>Change password</Button></div>
        </div>
      </Tile>
    </div>
  );
}
