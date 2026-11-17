import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Download, LayoutGrid, List, Plus, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Chip, date, Empty, Load, MoreMenu, Page, PhotoCard, Pill, SearchInput, Segmented, Select, Table, ToolField, ToolMenu, useApi, useMedia, useUrlState, displayName,
} from '../../ui/index.jsx';
import { ComplianceBadge, OFFICER_STATUSES, complianceState, useBase, useRoles } from './_parts.jsx';
import { AddPersonSheet, LoginList } from './_person.jsx';

// What managers can chase about the app: a registered clock-in phone, and phone notifications
const APP_SETUP = {
  phone: { label: 'No phone registered', test: (o) => o.has_phone },
  push: { label: 'No notifications', test: (o) => o.has_push },
  none: { label: 'No app', test: (o) => !!o.user_id },
};
const AppSetup = ({ o }) => (o.has_phone && o.has_push ? <span className="text-footnote text-faint">Set up</span> : (
  <span className="flex flex-wrap gap-1">{!o.has_phone && <Pill tone="amber">No phone</Pill>}{!o.has_push && <Pill tone="grey">No notifications</Pill>}</span>
));
// Who the list shows: officers (the staff records), or the people who sign in to a manager portal, or everyone
const WHO = [{ value: 'officers', label: 'Officers' }, { value: 'company', label: 'Office' }, { value: 'security', label: 'Security managers' }, { value: 'venue', label: 'Venue managers' }, { value: 'all', label: 'All' }];
const LOGIN_STATUS = [{ value: 'all', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'invited', label: 'Invited' }, { value: 'disabled', label: 'Deactivated' }];
const COMPLIANCE = [{ value: 'all', label: 'Any compliance' }, { value: 'green', label: 'Compliant' }, { value: 'amber', label: 'Expiring or not checked' }, { value: 'grace', label: 'On grace' }, { value: 'red', label: 'Not compliant' }];

export default function Staff() {
  const { user } = useAuth();
  const [url, setUrl] = useUrlState({ who: 'officers' });
  const who = user.role === 'company' && WHO.some((w) => w.value === url.who) ? url.who : 'officers';
  const picker = user.role === 'company' && <Segmented value={who} onChange={(w) => setUrl({ who: w === 'officers' ? null : w })} options={WHO} className="mb-4" />;
  return who === 'officers' ? <Officers picker={picker} /> : <Logins who={who} picker={picker} me={user} />;
}

// Office, security and venue managers, or everyone (logins plus staff records with no app)
function Logins({ who, picker, me }) {
  const users = useApi('users.list', { role: who === 'all' ? undefined : who });
  const officers = useApi('officers.list', {}, { skip: who !== 'all' });
  const [url, setUrl] = useUrlState({ q: '', login: 'all' });
  const status = LOGIN_STATUS.some((x) => x.value === url.login) ? url.login : 'all';
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => [
    ...(users.data || []).map((u) => ({ ...u, key: u.id })),
    ...(who === 'all' ? (officers.data || []).filter((o) => !o.user_id && o.status !== 'left')
      .map((o) => ({ key: o.id, id: o.id, officer_id: o.id, name: displayName(o), email: o.email, photo_url: o.photo_url, role: null, status: null })) : []),
  ].sort((a, b) => String(a.name).localeCompare(String(b.name))), [users.data, officers.data, who]);
  const tools = <>
    <SearchInput className="min-w-0 flex-1 sm:w-56 sm:flex-none" value={url.q} onChange={(e) => setUrl({ q: e.target.value })} placeholder="Search name, email, client or venue" />
    <div className="w-40"><Select aria-label="Status" value={status} onChange={(e) => setUrl({ login: e.target.value === 'all' ? null : e.target.value })} options={LOGIN_STATUS} /></div>
  </>;
  const preset = who === 'all' ? {} : { manager: who, officer: false };
  return (
    <Page2 isCo onAdd={() => setAdding(true)} tools={tools}>
      {picker}
      <Load q={users}>{() => <LoginList who={who} rows={rows} search={url.q} status={status} me={me} />}</Load>
      {adding && <AddPersonSheet preset={preset} onClose={() => setAdding(false)} onDone={() => { users.reload(); officers.reload?.(); }} />}
    </Page2>
  );
}

function Officers({ picker }) {
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
      <ToolField label="Show as"><Segmented value={view} onChange={(v) => setUrl({ view: v })} options={[{ value: 'grid', label: 'Grid', icon: LayoutGrid }, { value: 'list', label: 'List', icon: List }]} /></ToolField>
    </ToolMenu>
  </>;
  // Only what needs chasing among active officers; tap to filter the list
  const pick = (c) => setUrl(comp === c ? { compliance: 'all' } : { compliance: c, status: 'active' });

  return (
    <Page2 isCo={isCo} onAdd={() => setAdding(true)} tools={tools}>
      {picker}
      <Load q={q}>
        {() => (
          <>
            {(nRed > 0 || nAmber > 0 || pipeline > 0) && (
              <div className="mb-4 flex flex-wrap gap-2">
                {nRed > 0 && <Chip label="Not compliant" value={nRed} tone="red" icon={ShieldAlert} compact="phone" active={comp === 'red' && status === 'active'} onClick={() => pick('red')} />}
                {nAmber > 0 && <Chip label="Expiring or not checked" value={nAmber} tone="amber" icon={CalendarClock} compact="phone" active={comp === 'amber' && status === 'active'} onClick={() => pick('amber')} />}
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
                      dot={{ tone: c.tone, label: c.detail ? `${c.label}: ${/^[A-Z][a-z]/.test(c.detail) ? c.detail[0].toLowerCase() + c.detail.slice(1) : c.detail}` : c.label }} />
                  );
                })}
              </div>
            )}
            <p className="mt-3 px-1 text-footnote text-faint num">{rows.length} of {counts[status] || 0} {status} officers</p>
          </>
        )}
      </Load>
      {isCo && adding && <AddPersonSheet preset={{ officer: true }} onClose={() => setAdding(false)} onDone={q.reload} />}
    </Page2>
  );
}

function Page2({ isCo, onAdd, tools, children }) {
  return (
    <Page title={isCo ? 'People' : 'Officers'} subtitle={isCo ? 'Officers, managers and venue users, and what each can use' : 'Officers you can roster'} tools={tools}
      actions={<>{isCo && <Button icon={Plus} onClick={onAdd}>Add person</Button>}
        <MoreMenu items={[{ icon: Download, label: 'Export to spreadsheet', hint: 'Everyone on the list, as CSV', onClick: () => downloadAction('staff.exportCsv', {}).catch(() => {}) }]} /></>}>
      {children}
    </Page>
  );
}

/** Recruitment's Add applicant: the Add person sheet, starting as an applicant with no app */
export function AddOfficerSheet({ open, onClose, onDone, status = 'active', title = 'Add officer', statusOptions }) {
  if (!open) return null;
  return <AddPersonSheet title={title} preset={{ status, officer: status === 'active' }} statusOptions={statusOptions} onClose={onClose} onDone={onDone} />;
}
