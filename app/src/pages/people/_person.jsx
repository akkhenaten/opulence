// One person, one page: what they can use (the Access tab), adding anyone from one sheet, and the page for someone
// who only has a login (an office or venue manager with no staff record). The server keeps the rules (users.setAccess).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, Pencil, Phone, UserRound, Users } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Callout, date, dateShort, Empty, Input, Load, LoadFail, Page, Pill, relative, Sheet, Spinner, Table, Tabs, Tile, Toggle, useAction, useApi, useConfirm, useForm, useUrlState,
} from '../../ui/index.jsx';
import { AccessFields, accessPreview, inviteHint, inviteStatus, PLATFORM_EMAILS, ROLE_HINT, USER_ROLES } from './_access.jsx';
import { CopyLink, OfficerCoreFields, emptyOfficer, useRoles } from './_parts.jsx';
import { HistoryEntry } from './_history.jsx';
import RecentEmail from '../email/_recent.jsx';

export const APP_LABEL = { officer: 'Officer app', company: 'Office', security: 'Security manager', venue: 'Venue manager' };
const OFFICER_HINT = 'Their own shifts, clock in, pay and training';
const listOf = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The ticks of a login: the Officer app (a linked staff record) and at most one manager access */
export const appsOf = (role, linked) => ({ officer: role === 'officer' || !!linked, manager: USER_ROLES.includes(role) ? role : null });

/** "Officer app and Security manager for Club One · can see pay", as the server words it */
export function appsLine({ officer, manager, venues, can_see_pay }) {
  const parts = [];
  if (officer) parts.push(APP_LABEL.officer);
  if (manager === 'company') parts.push('Office (all venues)');
  else if (manager) parts.push(venues ? `${APP_LABEL[manager]} for ${venues.length ? listOf(venues) : 'no venues yet'}` : APP_LABEL[manager]);
  if (!parts.length) return 'No app';
  return `${listOf(parts)}${manager === 'company' || (manager === 'security' && can_see_pay) ? ' · can see pay' : ''}`;
}

const STATUS_WORD = { active: 'Active', invited: 'Invited', disabled: 'Deactivated' };
export const statusPill = (u) => <Pill status={u.status === 'active' ? 'active' : u.status === 'invited' ? 'pending' : 'cancelled'}>{STATUS_WORD[u.status] || u.status}</Pill>;
export const seenWord = (u) => (u.status === 'invited' ? (u.invite_sent_at ? `Invited · sent ${dateShort(u.invite_sent_at)}` : 'Invited · not emailed yet')
  : u.last_login ? `Seen ${relative(u.last_login)}` : 'Never signed in');

/** Officer app on or off, and one manager access: ticking one portal unticks the other, and Venue manager has no Officer app */
export function AppPicker({ v, set, platform = false, disabled = false }) {
  const pickOfficer = (on) => { set('officer', on); if (on && v.manager === 'venue') set('manager', null); };
  const pickManager = (m, on) => { set('manager', on ? m : null); if (on && m === 'venue') set('officer', false); };
  return (
    <div className="space-y-1.5">
      <div className="divide-y divide-line rounded-2xl bg-bg px-4 py-1">
        <Toggle checked={!!v.officer} disabled={disabled} onChange={pickOfficer} label={APP_LABEL.officer} hint={OFFICER_HINT} />
        {USER_ROLES.map((r) => (
          <Toggle key={r} checked={v.manager === r} disabled={disabled || (platform && r !== 'company')} onChange={(on) => pickManager(r, on)} label={APP_LABEL[r]} hint={ROLE_HINT[r]} />
        ))}
      </div>
      <p className="px-1 text-caption text-faint">One manager access at a time. Venue managers use their own portal, so they don't have the Officer app.</p>
    </div>
  );
}

const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));
const PLACES = ['security', 'venue'];

/** The Access tab: tick what they can use, their venues and pay, then the invite, the reset link and Deactivate.
 *  person: { officer_id, user_id, email, name } — a staff record, a login, or both. */
export function AccessTab({ person, reload }) {
  const { user: me, refresh } = useAuth();
  const login = useApi('users.get', { id: person.user_id }, { skip: !person.user_id });
  if (person.user_id) return <Load q={login}>{(u) => <AccessForm person={person} u={u} me={me} refresh={refresh} reload={() => { login.reload(); reload?.(); }} />}</Load>;
  return <AccessForm person={person} u={null} me={me} refresh={refresh} reload={reload} />;
}

function AccessForm({ person, u, me, refresh, reload }) {
  const venues = useApi('venues.list');
  const clients = useApi('clients.list');
  const managers = useApi('users.list', { role: 'company' });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const start = {
    officer: u ? appsOf(u.role, u.officer_id).officer : false, manager: u ? appsOf(u.role).manager : null,
    venue_ids: u?.venue_ids || [], client_id: u?.client_id || '', can_see_pay: !!u?.can_see_pay,
  };
  const { v, set, setV } = useForm(start);
  const [link, setLink] = useState(null);
  const [taken, setTaken] = useState(null);
  const self = u && u.id === me.id;
  const locked = u?.platform && !me.platform;
  const platform = u?.platform || PLATFORM_EMAILS.includes(String(person.email || '').toLowerCase());
  const off = u?.status === 'disabled';
  const dirty = v.officer !== start.officer || v.manager !== start.manager || (PLACES.includes(v.manager) && (!sameSet(v.venue_ids, start.venue_ids) || (v.client_id || '') !== start.client_id))
    || (v.manager === 'security' && v.can_see_pay !== start.can_see_pay);
  const preview = accessPreview(start, v, venues.data || []);
  const cms = (managers.data || []).filter((x) => x.status === 'active' && !x.platform);
  const lastManager = u?.role === 'company' && u.status === 'active' && cms.length === 1 && cms[0].id === u.id;

  const body = (extra = {}) => ({
    ...(u ? { id: u.id } : { officer_id: person.officer_id }), officer: v.officer, manager: v.manager,
    venue_ids: PLACES.includes(v.manager) ? v.venue_ids : undefined, client_id: PLACES.includes(v.manager) ? v.client_id || null : undefined,
    can_see_pay: v.manager === 'security' ? v.can_see_pay : undefined, ...extra,
  });
  const save = async (invite = false) => {
    setTaken(null);
    const r = await run(() => api('users.setAccess', body({ invite })), (x) => (!u ? (invite ? (x.emailed === false ? "Email didn't send — share the link below" : 'Login created and invite sent') : 'Login created') : 'Access saved'))
      .catch((e) => { if (e.data?.existing) setTaken(e.data.existing); return null; });
    if (!r) return;
    if (r.invite_link) setLink({ link: r.invite_link, emailed: r.emailed });
    if (self) await refresh();
    reload?.();
  };
  const linkLogin = async () => {
    await run(() => api('officers.linkLogin', { id: person.officer_id }), 'Linked to their manager login').catch(() => null);
    reload?.();
  };
  const setStatus = async (status) => {
    if (status === 'disabled' && !(await confirm({ title: `Deactivate ${u.name}?`, body: 'They will be signed out and unable to use any app. Their staff record and history stay.', confirm: 'Deactivate', danger: true }))) return;
    await run(() => api('users.update', { id: u.id, status }), status === 'disabled' ? 'App access switched off' : 'App access back on').catch(() => null);
    reload?.();
  };
  const reset = async () => setLink({ link: (await run(() => api('users.resetLink', { id: u.id }), 'Link created')).link, reset: true });
  const resend = async () => {
    const r = await run(() => api('users.resendInvite', { id: u.id }), (x) => (x.emailed === false ? "Email didn't send — share the link below" : 'Invite sent again'));
    setLink({ link: r.invite_link, emailed: r.emailed !== false });
    reload?.();
  };
  const invited = u?.status === 'invited' && inviteStatus(u);

  return (
    <div className="space-y-4">
      <Tile className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-headline font-semibold">What they can use</h3>
          {u && statusPill(u)}
          {u?.platform && <Pill tone="amber">Platform admin</Pill>}
        </div>
        <p className="text-subhead">{u ? appsLine({ ...start, venues: u.venues, can_see_pay: u.can_see_pay }) : 'No app yet. Tick what they can use to give them a login.'}</p>
        {locked && <Callout tone="warning" title="Platform admin">Only they can change this account.</Callout>}
        {off && <Callout tone="warning" title="App access is switched off">Reactivate them first to change what they can use.</Callout>}
        {self && <p className="text-footnote text-muted">Another company manager needs to change your own access.</p>}
        <AppPicker v={v} set={set} platform={platform} disabled={busy || locked || off || self} />
        {PLACES.includes(v.manager) && !locked && !off && (
          <AccessFields role={v.manager} v={v} set={set} venues={venues.data || []} clients={clients.data || []} onClientCreated={clients.reload} />
        )}
        {v.manager === 'security' && !locked && !off && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
        {!u && !person.email && (v.officer || v.manager) && <p className="text-footnote text-amber">Add their email on Overview first, so they can sign in.</p>}
        {lastManager && v.manager !== 'company' && <p className="text-footnote text-amber">There must be at least one active company manager.</p>}
        {dirty && preview && <p className="rounded-xl bg-blue-soft px-3 py-2 text-footnote font-semibold text-blue" aria-live="polite">{preview}</p>}
        {taken && (
          <Callout tone="warning" title={`${taken.name} already signs in with this email`}
            action={<div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" to={`/company/staff/${taken.officer_id || taken.user_id}`}>Open their page</Button>
              <Button size="sm" busy={busy} onClick={linkLogin}>Link this staff record to their login</Button>
            </div>}>
            One login can carry the Officer app and their manager access.
          </Callout>
        )}
        {!locked && !off && !self && (
          <div className="flex flex-wrap justify-end gap-2">
            {dirty && <Button variant="secondary" disabled={busy} onClick={() => setV(start)}>Undo</Button>}
            {!u && <Button variant="soft" busy={busy} disabled={!dirty || !person.email} onClick={() => save(true)}>Save and send invite</Button>}
            <Button busy={busy} disabled={!dirty || (!u && !person.email)} onClick={() => save(false)}>{u ? 'Save' : 'Create login'}</Button>
          </div>
        )}
      </Tile>

      {u && v.officer && !start.officer && !locked && <TwinLogins u={u} reload={reload} />}

      {u && (
        <Tile className="space-y-3">
          <h3 className="text-headline font-semibold">Sign-in</h3>
          <p className="text-subhead text-muted">{u.email} · {seenWord(u)}</p>
          {invited && <p className={`text-footnote ${invited.tone === 'amber' ? 'text-amber' : 'text-muted'}`}>{invited.short}</p>}
          {u.status === 'invited' && (link?.link || u.invite_link) && <CopyLink link={link?.link || u.invite_link} hint={link && 'emailed' in link ? inviteHint(link.emailed, u.email) : invited.hint} />}
          {u.status !== 'invited' && link?.reset && <CopyLink link={link.link} label="Password reset link" hint="Valid for 48 hours. Share it directly." />}
          {!locked && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {u.status === 'invited' && <Button variant="soft" busy={busy} onClick={resend}>Resend invite</Button>}
              {u.status === 'active' && <Button variant="soft" icon={KeyRound} disabled={busy} onClick={reset}>Password reset link</Button>}
              {u.status !== 'disabled' && !self && (lastManager
                ? <p className="text-footnote text-muted">There must be at least one active company manager.</p>
                : <Button variant="danger" disabled={busy} onClick={() => setStatus('disabled')}>Deactivate</Button>)}
              {u.status === 'disabled' && <Button variant="secondary" busy={busy} onClick={() => setStatus('active')}>Reactivate</Button>}
            </div>
          )}
        </Tile>
      )}
      {!u && link && <Tile><CopyLink link={link.link} hint={link.emailed ? inviteHint(true, person.email) : 'Not emailed yet. Copy this link and send it to them, or send the invite from here later.'} /></Tile>}
    </div>
  );
}

// A manager given the Officer app may already have an officer login from before one login could do both: merge it
function TwinLogins({ u, reload }) {
  const q = useApi('users.list', { role: 'officer' });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const norm = (n) => String(n || '').trim().toLowerCase();
  const twins = (q.data || []).filter((x) => x.status !== 'disabled' && x.officer_id && norm(x.name) === norm(u.name));
  if (!twins.length) return null;
  const merge = async (t) => {
    if (!(await confirm({ title: `Merge ${t.email} into ${u.email}?`, body: `${u.name} signs in with ${u.email} from now on and switches to "My shifts" for their own shifts, pay and training. The officer login ${t.email} is deactivated. Nothing in their history is lost.`, confirm: 'Merge' }))) return;
    await run(() => api('users.mergeOfficerLogin', { manager_id: u.id, officer_user_id: t.id }), 'Logins merged').catch(() => null);
    reload?.();
  };
  return (
    <Callout title={twins.length === 1 ? `${twins[0].name} also has an officer login (${twins[0].email})` : 'They may also have an officer login'}
      action={<div className="mt-2 flex flex-wrap gap-2">{twins.map((t) => <Button key={t.id} size="sm" variant="soft" disabled={busy} onClick={() => merge(t)}>Merge {t.email}</Button>)}</div>}>
      Merge it to keep their staff record and history, instead of starting a new staff record when you save.
    </Callout>
  );
}

/** Everything that changed for this person: their staff record (and its parts) and their login, newest first */
export function PersonHistory({ officerId, userId }) {
  const [limit, setLimit] = useState(30);
  const a = useApi('audit.list', { entity: 'officer', entity_id: String(officerId || ''), related: true, limit }, { skip: !officerId });
  const b = useApi('audit.list', { entity: 'user', entity_id: String(userId || ''), limit }, { skip: !userId });
  if ((officerId && !a.data && !a.error) || (userId && !b.data && !b.error)) return <Spinner />;
  const seen = new Set();
  const rows = [...(a.data || []), ...(b.data || [])].filter((r) => !seen.has(r.id) && seen.add(r.id))
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  const more = (a.data || []).length >= limit || (b.data || []).length >= limit;
  return (
    <Tile>
      <LoadFail q={a} what="history" />
      <LoadFail q={b} what="access history" />
      {!rows.length ? <p className="text-subhead text-muted">Nothing recorded yet.</p> : (
        <ol className="space-y-3">
          {rows.map((r) => <HistoryEntry key={r.id} r={r} own={(r.entity === 'officer' && String(r.entity_id) === String(officerId)) || r.entity === 'user'} />)}
        </ol>
      )}
      {more && <Button variant="link" className="mt-2" onClick={() => setLimit((x) => x + 30)}>Show more</Button>}
    </Tile>
  );
}

/** Add person: an officer, an applicant, an office, security or venue manager, from one sheet.
 *  preset: { officer, manager, venue_ids, client_id, status }. A duplicate email offers their page instead. */
export function AddPersonSheet({ preset = {}, onClose, onDone, title = 'Add person', statusOptions }) {
  const nav = useNavigate();
  const { roles } = useRoles();
  const venues = useApi('venues.list');
  const clients = useApi('clients.list');
  const init = { ...emptyOfficer(preset.status || 'active'), officer: preset.officer ?? !preset.manager, manager: preset.manager || null, venue_ids: preset.venue_ids || [], client_id: preset.client_id || '', can_see_pay: false };
  const form = useForm(init);
  const { v, set, bind } = form;
  const [run, busy] = useAction();
  const [result, setResult] = useState(null);
  const [existing, setExisting] = useState(null);
  const platform = PLATFORM_EMAILS.includes(v.email.trim().toLowerCase());
  const manager = platform && v.manager ? 'company' : v.manager;
  const staffRecord = !manager || v.officer;
  const login = !!(manager || v.officer);
  const pageOf = (r) => `/company/staff/${r.officer_id || r.user_id}`;
  const create = async (invite) => {
    setExisting(null);
    const r = await run(() => api('people.add', {
      ...v, manager, invite, venue_ids: PLACES.includes(manager) ? v.venue_ids : undefined, client_id: PLACES.includes(manager) ? v.client_id || null : undefined,
      can_see_pay: manager === 'security' && v.can_see_pay,
    }), (x) => (invite ? (x.emailed === false ? "Email didn't send — share the link below" : 'Added and invite sent') : `${v.first_name} added`))
      .catch((e) => { if (e.data?.existing) setExisting(e.data.existing); return null; });
    if (!r) return;
    onDone?.(r);
    if (r.invite_link) setResult({ ...r, invite });
    else { onClose(); nav(pageOf(r)); }
  };
  const addOfficerApp = async () => {
    await run(() => api('users.setAccess', { id: existing.user_id, officer: true, manager: existing.role }), `${existing.name} now has the Officer app`).catch(() => null);
    onDone?.();
    onClose();
    nav(pageOf(existing));
  };
  const ok = v.first_name.trim() && v.last_name.trim() && (!login || v.email.trim());
  return (
    <Sheet open onClose={onClose} title={result ? 'Added' : title} size="lg"
      footer={result
        ? <><Button variant="secondary" onClick={onClose}>Done</Button><Button onClick={() => { onClose(); nav(pageOf(result)); }}>Open their page</Button></>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button>
          {login && <Button variant="soft" busy={busy} disabled={!ok} onClick={() => create(true)}>Create and send invite</Button>}
          <Button busy={busy} disabled={!ok} onClick={() => create(false)}>Create</Button></>}>
      {result ? (
        <CopyLink link={result.invite_link} hint={result.invite ? inviteHint(result.emailed !== false, v.email) : 'Not emailed yet. Copy this link and send it to them, or send the invite from their page later.'} />
      ) : (
        <div className="space-y-5">
          {existing && (
            <Callout tone="warning" title={`${existing.name} already uses this email`}
              action={<div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => { onClose(); nav(pageOf(existing)); }}>Open their page</Button>
                {existing.can_add_officer && v.officer && <Button size="sm" busy={busy} onClick={addOfficerApp}>Add Officer app to them</Button>}
              </div>}>
              One person, one page: change what they can use on their Access tab.
            </Callout>
          )}
          <div className="space-y-2">
            <div className="text-footnote font-semibold uppercase tracking-wide text-faint">What they can use</div>
            <AppPicker v={v} set={set} platform={platform} />
            {!login && <p className="px-1 text-footnote text-muted">No app: a staff record only. You can give them a login later from their Access tab.</p>}
          </div>
          {staffRecord
            ? <OfficerCoreFields form={form} roles={roles} statusOptions={statusOptions || ['active', 'applicant']} showInvite={false} />
            : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="First name" autoFocus {...bind('first_name')} />
                  <Input label="Last name" {...bind('last_name')} />
                  <Input label="Goes by (optional)" placeholder="e.g. Goddey" maxLength={40} className="col-span-2" {...bind('goes_by')} />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input label="Email" type="email" {...bind('email')} />
                  <Input label="Phone" type="tel" {...bind('phone')} />
                </div>
              </div>
            )}
          {PLACES.includes(manager) && <AccessFields role={manager} v={v} set={set} venues={venues.data || []} clients={clients.data || []} onClientCreated={clients.reload} />}
          {manager === 'security' && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
          {login && <p className="text-caption text-faint">Create makes their login without emailing them; copy the link or send the invite later. Create and send invite emails it now.</p>}
        </div>
      )}
    </Sheet>
  );
}

/** Office, security and venue managers (and everyone, with All) as a table; a row opens the person's page */
export function LoginList({ who, rows, search, status, me }) {
  const nav = useNavigate();
  const s = search.trim().toLowerCase();
  const shown = rows.filter((u) => (status === 'all' || u.status === status)
    && (!s || [u.name, u.goes_by, u.email, u.client_name, ...(u.venues || [])].join(' ').toLowerCase().includes(s)));
  if (!shown.length) return <Empty icon={Users} title={s || status !== 'all' ? 'Nobody matches' : 'Nobody here yet'} body={s || status !== 'all' ? 'Try another search or status.' : undefined} />;
  return (
    <Table rows={shown} rowKey="key" onRow={(u) => nav(`/company/staff/${u.officer_id || u.id}`)} columns={[
      { key: 'name', label: 'Name', mobile: 'title', render: (u) => (
        <span className="flex items-center gap-3"><Avatar name={u.name} src={[u.photo_thumb_url, u.photo_url]} size={32} className="hidden md:grid" />
          <span className="min-w-0"><span className="block truncate font-semibold">{u.name}{u.id === me.id && <span className="ml-1.5 text-caption font-semibold text-faint">You</span>}</span>
            <span className="block truncate text-footnote text-muted">{u.email || 'No email'}</span></span></span>
      ) },
      { key: 'apps', label: 'Can use', mobile: 'sub', render: (u) => <span className="flex flex-wrap items-center gap-1.5">{appsLine({ ...appsOf(u.role, u.officer_id), can_see_pay: u.can_see_pay })}{u.platform && <Pill tone="amber">Platform admin</Pill>}</span> },
      { key: 'venues', label: 'Venues', mobile: who === 'all' ? false : 'sub', render: (u) => (u.role === 'company' ? 'All' : !u.venues?.length ? '—' : <span title={u.venues.join(', ')}>{u.venues.length === 1 ? u.venues[0] : `${u.venues.length} venues`}</span>) },
      { key: 'status', label: 'Status', mobile: 'value', render: (u) => (u.status ? statusPill(u) : <Pill tone="grey">No app</Pill>) },
      { key: 'seen', label: 'Last seen', mobile: false, render: (u) => <span className="text-footnote text-muted">{u.status ? seenWord(u) : '—'}</span> },
    ]} />
  );
}

/** The page for a login with no staff record: Overview · Access · History */
export function UserProfile({ userId }) {
  const q = useApi('users.get', { id: userId });
  return <Load q={q} skeleton="page">{(u) => <UserPage u={u} reload={q.reload} />}</Load>;
}

const USER_TABS = [{ value: 'overview', label: 'Overview', icon: UserRound }, { value: 'access', label: 'Access', icon: KeyRound }, { value: 'history', label: 'History' }];

function UserPage({ u, reload }) {
  const [url, setUrl] = useUrlState({ tab: 'overview' });
  const tab = USER_TABS.some((t) => t.value === url.tab) ? url.tab : 'overview';
  const [editing, setEditing] = useState(false);
  const person = { user_id: u.id, officer_id: null, email: u.email, name: u.name };
  return (
    <Page title={u.name} subtitle={u.goes_by?.trim() ? `Goes by ${u.goes_by.trim()}` : undefined} back={{ to: '/company/staff?who=all', label: 'People' }}
      actions={[!(u.platform) && { label: 'Edit', icon: Pencil, onClick: () => setEditing(true), main: true }].filter(Boolean)}>
      <Tile className="mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={u.name} src={[u.photo_thumb_url, u.photo_url]} size={76} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">{statusPill(u)}{u.platform && <Pill tone="amber">Platform admin</Pill>}</div>
            <p className="mt-2 text-subhead font-semibold">{appsLine({ ...appsOf(u.role, u.officer_id), venues: u.venues, can_see_pay: u.can_see_pay })}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-subhead">
              {u.phone && <a href={`tel:${u.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-blue"><Phone size={16} />{u.phone}</a>}
              <a href={`mailto:${u.email}`} className="inline-flex min-w-0 items-center gap-1.5 truncate font-semibold text-blue"><Mail size={16} />{u.email}</a>
            </div>
          </div>
        </div>
      </Tile>
      <Tabs tabs={USER_TABS} value={tab} onChange={(t) => setUrl({ tab: t })} />
      {tab === 'overview' && (
        <>
          <Tile>
            <dl className="grid gap-x-6 gap-y-3 text-subhead sm:grid-cols-2">
              <Field k="Name" v={u.name} /><Field k="Goes by" v={u.goes_by || '—'} />
              <Field k="Sign-in email" v={u.email} /><Field k="Phone" v={u.phone || '—'} />
              {u.client_name && <Field k="Client" v={u.client_name} />}
              <Field k="Last seen" v={seenWord(u)} /><Field k="Added" v={date(u.created_at)} />
            </dl>
            <p className="mt-4 text-footnote text-muted">Works shifts too? Tick Officer app on <Link to="?tab=access" className="font-semibold text-blue">Access</Link> to give them a staff record on this login.</p>
          </Tile>
          <RecentEmail type="user" id={u.id} />
        </>
      )}
      {tab === 'access' && <AccessTab person={person} reload={reload} />}
      {tab === 'history' && <PersonHistory userId={u.id} />}
      {editing && <UserEditSheet u={u} onClose={() => setEditing(false)} onDone={reload} />}
    </Page>
  );
}

const Field = ({ k, v }) => <div><dt className="text-caption font-semibold uppercase tracking-wide text-faint">{k}</dt><dd className="mt-0.5 break-words">{v}</dd></div>;

function UserEditSheet({ u, onClose, onDone }) {
  const start = { name: u.name, goes_by: u.goes_by || '', email: u.email, phone: u.phone || '' };
  const { v, bind } = useForm(start);
  const [run, busy] = useAction();
  const dirty = Object.keys(start).some((k) => v[k] !== start[k]);
  const save = async () => {
    await run(() => api('users.update', { id: u.id, name: v.name, goes_by: v.goes_by, phone: v.phone, email: v.email === u.email ? undefined : v.email }), 'Saved');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={`Edit ${u.name}`} dirty={dirty}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!dirty} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Name" {...bind('name')} />
        <Input label="Goes by (optional)" placeholder="e.g. Goddey" maxLength={40} {...bind('goes_by')} />
        <Input label="Sign-in email" type="email" hint={v.email !== u.email ? 'They will sign in with the new email from now on' : undefined} {...bind('email')} />
        <Input label="Phone" type="tel" {...bind('phone')} />
      </div>
    </Sheet>
  );
}

