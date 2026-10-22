import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ShieldCheck, Users } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Bento, Button, Empty, List, Load, Page, Row, SearchInput, Segmented, Select, Sheet, Stat, Tile, useAction, useApi, useForm,
} from '../../ui/index.jsx';
import {
  ComplianceBadge, CopyLink, OFFICER_STATUSES, OfficerCoreFields, cleanOfficer, complianceState, emptyOfficer, useBase, useRoles,
} from './_parts.jsx';

export default function Staff() {
  const { user } = useAuth();
  const base = useBase();
  const isCo = user.role === 'company';
  const q = useApi('officers.list');
  const { roles, name: roleName } = useRoles();
  const [status, setStatus] = useState('active');
  const [role, setRole] = useState('');
  const [comp, setComp] = useState('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const all = q.data || [];
  const counts = useMemo(() => Object.fromEntries(OFFICER_STATUSES.map((s) => [s, all.filter((o) => o.status === s).length])), [all]);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((o) => o.status === status
      && (!role || (o.roles || []).includes(role))
      && (comp === 'all' || complianceState(o.compliance).tone === comp)
      && (!s || `${o.name} ${o.email} ${o.phone} ${o.sia_number}`.toLowerCase().includes(s)));
  }, [all, status, role, comp, search]);

  const active = all.filter((o) => o.status === 'active');
  const states = active.map((o) => complianceState(o.compliance).tone);
  const half = Math.ceil(rows.length / 2);

  return (
    <Page2 isCo={isCo} onAdd={() => setAdding(true)}>
      <Load q={q}>
        {() => (
          <>
            <Bento className="mb-5">
              <Tile><Stat value={active.length} label="Active" hint="Can be rostered" /></Tile>
              <Tile><Stat value={states.filter((t) => t === 'red').length} tone={states.includes('red') ? 'red' : undefined} label="Not compliant" hint="Active, missing checks" /></Tile>
              <Tile><Stat value={states.filter((t) => t === 'amber').length} tone={states.includes('amber') ? 'amber' : undefined} label="Expiring" hint="Within 30 days" /></Tile>
              <Tile><Stat value={counts.onboarding + counts.applicant} label="In the pipeline" hint="Applicants and onboarding" /></Tile>
            </Bento>

            <div className="mb-4 space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <SearchInput className="flex-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or SIA number" />
                <div className="grid grid-cols-2 gap-3 md:flex">
                  <Select className="md:w-48" value={role} onChange={(e) => setRole(e.target.value)} placeholder="All roles" options={roles.map((r) => ({ value: r.code, label: r.name }))} />
                  <Select className="md:w-44" value={comp} onChange={(e) => setComp(e.target.value)}
                    options={[{ value: 'all', label: 'Any compliance' }, { value: 'green', label: 'Compliant' }, { value: 'amber', label: 'Expiring soon' }, { value: 'red', label: 'Not compliant' }]} />
                </div>
              </div>
              <Segmented value={status} onChange={setStatus} options={OFFICER_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: s === 'active' ? null : counts[s] }))} />
            </div>

            {!rows.length ? (
              <Empty icon={Users} title={all.length ? 'No officers match' : 'No officers yet'}
                body={all.length ? 'Try a different filter or search.' : isCo ? 'Add your first officer to start building the rota.' : 'Officers will appear here once the company adds them.'}
                action={isCo && !all.length && <Button icon={Plus} onClick={() => setAdding(true)}>Add officer</Button>} />
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
                {[rows.slice(0, half), rows.slice(half)].filter((c) => c.length).map((col, i) => (
                  <List key={i}>
                    {col.map((o) => (
                      <Row key={o.id} to={`${base}/staff/${o.id}`}
                        left={<Avatar name={o.name} src={o.photo_url} size={44} />}
                        title={o.name}
                        subtitle={[(o.roles || []).map(roleName).join(', ') || 'No roles', o.sia_number && `SIA ${o.sia_number}`].filter(Boolean).join(' · ')}
                        right={<ComplianceBadge c={o.compliance} />} />
                    ))}
                  </List>
                ))}
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

function Page2({ isCo, onAdd, children }) {
  return (
    <Page title={isCo ? 'Staff' : 'Officers'} subtitle={isCo ? 'Officers, licences and compliance' : 'Officers you can roster'}
      actions={isCo && <Button icon={Plus} onClick={onAdd}>Add staff member</Button>}>
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
