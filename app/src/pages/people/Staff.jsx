import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Download, LayoutGrid, List, Plus, ShieldAlert, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Chip, date, Empty, Load, MoreMenu, Page, PhotoCard, Pill, SearchInput, Segmented, Select, Sheet, Table, ToolField, ToolMenu, useAction, useApi, useForm, useMedia, useUrlState, displayName,
} from '../../ui/index.jsx';
import {
  ComplianceBadge, CopyLink, OFFICER_STATUSES, OfficerCoreFields, cleanOfficer, complianceState, emptyOfficer, useBase, useRoles,
} from './_parts.jsx';

// What managers can chase about the app: a registered clock-in phone, and phone notifications
const APP_SETUP = {
  phone: { label: 'No phone registered', test: (o) => o.has_phone },
  push: { label: 'No notifications', test: (o) => o.has_push },
};
const AppSetup = ({ o }) => (o.has_phone && o.has_push ? <span className="text-footnote text-faint">Set up</span> : (
  <span className="flex flex-wrap gap-1">{!o.has_phone && <Pill tone="amber">No phone</Pill>}{!o.has_push && <Pill tone="grey">No notifications</Pill>}</span>
));
const COMPLIANCE = [{ value: 'all', label: 'Any compliance' }, { value: 'green', label: 'Compliant' }, { value: 'amber', label: 'Expiring soon' }, { value: 'grace', label: 'On grace' }, { value: 'red', label: 'Not compliant' }];

export default function Staff() {
  const { user } = useAuth();
  const base = useBase();
  const isCo = user.role === 'company';
  const q = useApi('officers.list');
  const { roles, name: roleName } = useRoles();
  const nav = useNavigate();
  // Search, filters and Grid · List live in the address so Back returns to the same list
  const [url, setUrl, clearUrl] = useUrlState({ q: '', role: '', compliance: 'all', app: '', status: 'active', view: 'grid' });
  const status = OFFICER_STATUSES.includes(url.status) ? url.status : 'active';
  const comp = COMPLIANCE.some((c) => c.value === url.compliance) ? url.compliance : 'all';
  const { role, q: search } = url;
  const view = url.view === 'list' ? 'list' : 'grid';
  const app = APP_SETUP[url.app] ? url.app : '';
  const [adding, setAdding] = useState(false);
  const wide = useMedia('(min-width: 640px)');

  const all = q.data || [];
  const counts = useMemo(() => Object.fromEntries(OFFICER_STATUSES.map((s) => [s, all.filter((o) => o.status === s).length])), [all]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((o) => o.status === status
      && (!role || (o.roles || []).includes(role))
      && (comp === 'all' || (comp === 'grace' ? !!o.compliance?.grace : complianceState(o.compliance).tone === comp && !(comp === 'amber' && o.compliance?.grace)))
      && (!app || !APP_SETUP[app].test(o))
      && (!s || `${o.name} ${o.full_name || ''} ${o.email} ${o.phone} ${o.sia_number}`.toLowerCase().includes(s)));
  }, [all, status, role, comp, app, search]);

  const active = all.filter((o) => o.status === 'active');
  const states = active.map((o) => (o.compliance?.grace && complianceState(o.compliance).tone === 'amber' ? 'grace' : complianceState(o.compliance).tone));

  const pipeline = counts.onboarding + counts.applicant;
  const nRed = states.filter((t) => t === 'red').length;
  const nAmber = states.filter((t) => t === 'amber').length;
  // Search and status sit on the tab line; role, compliance, app set-up and Grid · List under Filters
  const statusOpts = OFFICER_STATUSES.map((s) => ({ value: s, label: `${s[0].toUpperCase()}${s.slice(1)}${s !== 'active' && counts[s] ? ` · ${counts[s]}` : ''}` }));
  const statusPick = <Select aria-label="Status" value={status} onChange={(e) => setUrl({ status: e.target.value })} options={statusOpts} />;
  const changed = !!role + (comp !== 'all') + !!app + (view !== 'grid') + (!wide && status !== 'active');
  const tools = <>
    <SearchInput className="min-w-0 flex-1 sm:w-56 sm:flex-none" value={search} onChange={(e) => setUrl({ q: e.target.value })} placeholder="Search name, email, phone or SIA number" />
    <div className="hidden w-40 sm:block">{statusPick}</div>
    <ToolMenu count={changed} onClear={() => clearUrl(['role', 'compliance', 'app', 'view', ...(wide ? [] : ['status'])])}>
      {!wide && <ToolField label="Status">{statusPick}</ToolField>}
      <ToolField label="Role"><Select aria-label="Role" value={role} onChange={(e) => setUrl({ role: e.target.value })} options={[{ value: '', label: 'All roles' }, ...roles.map((r) => ({ value: r.code, label: r.name }))]} /></ToolField>
      <ToolField label="Compliance"><Select aria-label="Compliance" value={comp} onChange={(e) => setUrl({ compliance: e.target.value })} options={COMPLIANCE} /></ToolField>
      <ToolField label="App set-up"><Select aria-label="App set-up" value={app} onChange={(e) => setUrl({ app: e.target.value })} options={[{ value: '', label: 'Any app set-up' }, ...Object.entries(APP_SETUP).map(([value, a]) => ({ value, label: a.label }))]} /></ToolField>
      <ToolField label="Show as"><Segmented value={view} onChange={(v) => setUrl({ view: v })} options={[{ value: 'grid', label: 'Grid', icon: LayoutGrid }, { value: 'list', label: 'List', icon: List }]} iconOnly="phone" /></ToolField>
    </ToolMenu>
  </>;
  // Only what needs chasing among active officers; tap to filter the list
  const pick = (c) => setUrl(comp === c ? { compliance: 'all' } : { compliance: c, status: 'active' });

  return (
    <Page2 isCo={isCo} onAdd={() => setAdding(true)} tools={tools}>
      <Load q={q}>
        {() => (
          <>
            {(nRed > 0 || nAmber > 0 || pipeline > 0) && (
              <div className="mb-4 flex flex-wrap gap-2">
                {nRed > 0 && <Chip label="Not compliant" value={nRed} tone="red" icon={ShieldAlert} compact="phone" active={comp === 'red' && status === 'active'} onClick={() => pick('red')} />}
                {nAmber > 0 && <Chip label="Expiring" value={nAmber} tone="amber" icon={CalendarClock} compact="phone" active={comp === 'amber' && status === 'active'} onClick={() => pick('amber')} />}
                {pipeline > 0 && <Chip label="In the pipeline" value={pipeline} tone="blue" icon={UserPlus} compact="phone" />}
              </div>
            )}

            {!rows.length ? (
              <Empty icon={Users} title={all.length ? 'No officers match' : 'No officers yet'}
                body={all.length ? 'Try a different filter or search.' : isCo ? 'Add your first officer to start building the rota.' : 'Officers will appear here once the company adds them.'}
                action={isCo && !all.length && <Button icon={Plus} onClick={() => setAdding(true)}>Add officer</Button>} />
            ) : view === 'list' ? (
              <Table rows={rows} onRow={(o) => nav(`${base}/staff/${o.id}`)} columns={[
                { key: 'name', label: 'Name', mobile: 'title', render: (o) => <span className="flex items-center gap-3"><Avatar name={displayName(o)} src={o.photo_url} size={32} className="hidden md:grid" /><span className="font-semibold">{displayName(o)}</span></span> },
                { key: 'roles', label: 'Role', mobile: 'sub', render: (o) => (o.roles || []).map(roleName).join(', ') },
                { key: 'sia_expiry', label: 'SIA expiry', mobile: 'sub', mobileLabel: true, render: (o) => (o.sia_expiry ? <span className="num">{date(o.sia_expiry)}</span> : '—') },
                { key: 'status', label: 'Status', mobile: false, render: (o) => <Pill status={o.status} /> },
                { key: 'compliance', label: 'Compliance', mobile: 'value', render: (o) => <ComplianceBadge c={o.compliance} /> },
                { key: 'app', label: 'App', mobile: false, render: (o) => <AppSetup o={o} /> },
              ]} />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {rows.map((o) => {
                  const c = complianceState(o.compliance);
                  return (
                    <PhotoCard key={o.id} to={`${base}/staff/${o.id}`} srcs={[o.photo_url]} name={displayName(o)}
                      dot={{ tone: c.tone, label: c.detail ? `${c.label}: ${c.detail}` : c.label }} />
                  );
                })}
              </div>
            )}
            <p className="mt-3 px-1 text-footnote text-faint num">{rows.length} of {counts[status] || 0} {status} officers</p>
          </>
        )}
      </Load>
      {isCo && <AddOfficerSheet open={adding} onClose={() => setAdding(false)} roles={roles} onDone={q.reload} />}
    </Page2>
  );
}

function Page2({ isCo, onAdd, tools, children }) {
  return (
    <Page title={isCo ? 'Staff' : 'Officers'} subtitle={isCo ? 'Officers, licences and compliance' : 'Officers you can roster'} tools={tools}
      actions={<>{isCo && <Button icon={Plus} onClick={onAdd}>Add staff member</Button>}
        <MoreMenu items={[{ icon: Download, label: 'Export to spreadsheet', hint: 'Everyone on the list, as CSV', onClick: () => downloadAction('staff.exportCsv', {}).catch(() => {}) }]} /></>}>
      {children}
    </Page>
  );
}

export function AddOfficerSheet({ open, onClose, roles, onDone, status = 'active', title = 'Add staff member', statusOptions }) {
  const nav = useNavigate();
  const base = useBase();
  const form = useForm(emptyOfficer(status));
  const [run, busy] = useAction();
  const [result, setResult] = useState(null);
  const [dup, setDup] = useState(null);
  const [linkable, setLinkable] = useState(null);
  const close = () => { onClose(); setTimeout(() => { setResult(null); setDup(null); setLinkable(null); form.setV(emptyOfficer(status)); }, 300); };
  // extra: { link_user } links to the manager login with this email, { keep_separate } doesn't
  const save = async (extra = {}) => {
    setDup(null);
    setLinkable(null);
    const r = await run(() => api('officers.save', { ...cleanOfficer(form.v), ...extra }), extra.link_user ? `${form.v.first_name} linked to their manager login` : `${form.v.first_name} added`)
      .catch((e) => { setDup(e.data?.duplicate || null); setLinkable(e.data?.can_link ? e.data.user_name : null); });
    if (!r) return;
    onDone?.();
    if (r.invite_link) setResult(r);
    else { close(); nav(`${base}/staff/${r.id}`); }
  };
  return (
    <Sheet open={open} onClose={close} title={result ? 'Staff member added' : title}
      footer={result
        ? <><Button variant="secondary" onClick={close}>Done</Button><Button onClick={() => { close(); nav(`${base}/staff/${result.id}`); }}>Open profile</Button></>
        : <><Button variant="secondary" onClick={close}>Cancel</Button><Button busy={busy} disabled={!form.v.first_name || !form.v.last_name} onClick={() => save()}>Save</Button></>}>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-green-soft p-4 text-green"><ShieldCheck size={20} /><span className="text-body font-semibold">Invite created. They can set a password with this link.</span></div>
          <CopyLink link={result.invite_link} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-subhead text-muted">Someone who works shifts. Turn on App access to email them a login. Managers and venue users are invited from Settings → Users &amp; access.</p>
          {dup && (
            <div className="flex items-center gap-3 rounded-2xl bg-amber-soft p-3 text-amber">
              <Users size={20} className="shrink-0" />
              <span className="min-w-0 flex-1 text-subhead font-semibold">Already on your staff: {dup.name}{dup.status && dup.status !== 'active' ? ` (${dup.status})` : ''}</span>
              <Button size="sm" variant="secondary" onClick={() => { close(); nav(`${base}/staff/${dup.id}`); }}>Open</Button>
            </div>
          )}
          {linkable && (
            <div className="space-y-3 rounded-2xl bg-blue-soft p-4">
              <p className="text-subhead font-semibold text-blue">{linkable} already signs in as a manager. Link this staff record to their login?</p>
              <p className="text-footnote text-muted">One login does both: they switch to "My shifts" to clock in and see their own pay. No invite is sent, and another manager approves their hours.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" busy={busy} onClick={() => save({ link_user: true })}>Link to their manager login</Button>
                {!form.v.invite && <Button size="sm" variant="secondary" disabled={busy} onClick={() => save({ keep_separate: true })}>Keep separate</Button>}
              </div>
            </div>
          )}
          <OfficerCoreFields form={form} roles={roles} statusOptions={statusOptions} />
        </div>
      )}
      {!result && <p className="mt-4 text-caption text-faint">You can add right to work, bank details and documents from the profile.</p>}
    </Sheet>
  );
}
