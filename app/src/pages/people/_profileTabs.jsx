import { useEffect, useState } from 'react';
import {
  Award, BadgeCheck, CalendarOff, Check, ClipboardList, Clock, Eye, FileSignature, FileText, MessageSquare, Plus, ShieldOff, Star, Trash2, Upload, X,
} from 'lucide-react';
import { api, downloadAction, upload } from '../../api.js';
import {
  Bento, Button, Empty, ErrorBox, IconButton, Input, KV, List, Load, Pill, Row, Section, Segmented, Select, Sheet, Spinner, Stat, Table, Textarea, Tile, Toggle,
  addDays, cx, date, dateShort, dateTime, dayLabel, hours, isoDate, money, range, relative, titleCase, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { DOC_KINDS, ExpiryPill, Progress, RTW_TYPES, SIA_TYPES, TIMEOFF_KINDS, WEEKDAYS, docKindLabel, openUrl } from './_parts.jsx';

// useApi that reports 403 to the parent so the tab can be hidden
function useTabApi(action, body, onForbidden, opts) {
  const q = useApi(action, body, opts);
  useEffect(() => { if (q.error?.status === 403) onForbidden?.(); }, [q.error, onForbidden]);
  return q;
}
function TabLoad({ q, children }) {
  if (q.loading && !q.data) return <Spinner />;
  if (q.error?.status === 403) return <Empty title="Not available" body="You don't have access to this section." />;
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  return children(q.data);
}

/* ---------------- Overview ---------------- */

export function OverviewTab({ o, reload, isCo }) {
  const [editContacts, setEditContacts] = useState(false);
  const hasTax = 'ni_number' in o;
  const hasBank = 'bank_account' in o;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tile title="Personal details" className="lg:col-span-2">
        <KV items={[
          ['Full name', o.name],
          ['Email', o.email],
          ['Mobile', o.phone],
          'dob' in o && ['Date of birth', date(o.dob)],
          ['Address', [o.address, o.postcode].filter(Boolean).join(', ')],
          ['Start date', date(o.start_date)],
          ['Max hours a week', <span className="num">{o.max_weekly_hours}</span>],
          ['Last app sign-in', o.last_login ? relative(o.last_login) : null],
          ['Added', date(o.created_at)],
        ]} />
        {o.notes && <div className="mt-4 rounded-2xl bg-bg p-3 text-subhead whitespace-pre-wrap"><span className="mb-1 block text-caption font-semibold uppercase tracking-wide text-faint">Notes</span>{o.notes}</div>}
      </Tile>
      <Tile title="Emergency contacts" pad={false} action={isCo && <Button size="sm" variant="ghost" onClick={() => setEditContacts(true)}>Edit</Button>}>
        {o.emergency_contacts?.length ? (
          <div className="divide-y divide-line">
            {o.emergency_contacts.map((c) => (
              <Row key={c.id} title={c.name} subtitle={c.relationship || 'Contact'} right={c.phone && <a href={`tel:${c.phone}`} className="font-semibold text-blue num">{c.phone}</a>} />
            ))}
          </div>
        ) : <p className="px-5 pb-5 text-subhead text-faint">None on file</p>}
      </Tile>
      {hasTax && (
        <Tile title="Tax">
          <KV items={[['NI number', o.ni_number], ['UTR', o.utr]]} />
        </Tile>
      )}
      {hasBank && (
        <Tile title="Bank details" className="lg:col-span-2">
          <KV items={[['Bank', o.bank_name], ['Sort code', <span className="num">{o.bank_sort_code}</span>], ['Account number', <span className="num">{o.bank_account}</span>]]} />
        </Tile>
      )}
      {editContacts && <ContactsSheet o={o} onClose={() => setEditContacts(false)} onDone={reload} />}
    </div>
  );
}

function ContactsSheet({ o, onClose, onDone }) {
  const [list, setList] = useState(o.emergency_contacts?.length ? o.emergency_contacts.map(({ name, relationship, phone }) => ({ name, relationship, phone })) : [{ name: '', relationship: '', phone: '' }]);
  const [run, busy] = useAction();
  const upd = (i, k, val) => setList((l) => l.map((c, j) => (j === i ? { ...c, [k]: val } : c)));
  const save = async () => {
    await run(() => api('officers.saveContacts', { officer_id: o.id, contacts: list.filter((c) => c.name) }), 'Contacts saved');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Emergency contacts"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        {list.map((c, i) => (
          <div key={i} className="rounded-2xl bg-bg p-3">
            <div className="grid grid-cols-2 gap-2">
              <Input label="Name" value={c.name} onChange={(e) => upd(i, 'name', e.target.value)} />
              <Input label="Relationship" value={c.relationship} onChange={(e) => upd(i, 'relationship', e.target.value)} />
              <Input label="Phone" type="tel" value={c.phone} onChange={(e) => upd(i, 'phone', e.target.value)} />
              <div className="flex items-end justify-end"><Button variant="danger" size="sm" icon={Trash2} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>Remove</Button></div>
            </div>
          </div>
        ))}
        <Button variant="soft" icon={Plus} onClick={() => setList((l) => [...l, { name: '', relationship: '', phone: '' }])}>Add contact</Button>
      </div>
    </Sheet>
  );
}

/* ---------------- Compliance ---------------- */

export function ComplianceTab({ o, reload, isCo }) {
  const [edit, setEdit] = useState(false);
  const [ban, setBan] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();
  const unban = async (b) => {
    if (!(await confirm({ title: `Lift ban at ${b.venue_name}?`, body: 'The officer can be rostered at this venue again.', confirm: 'Lift ban' }))) return;
    await run(() => api('officers.saveBan', { officer_id: o.id, venue_id: b.venue_id, remove: true }), 'Ban lifted');
    reload();
  };
  const c = o.compliance || {};
  return (
    <div className="space-y-4">
      <Bento className="lg:grid-cols-2">
        <Tile title="SIA licence" icon={BadgeCheck} className="col-span-2 lg:col-span-1" action={isCo && <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>Edit</Button>}>
          <div className="mb-3"><ExpiryPill date={o.sia_expiry} missing="No licence" /></div>
          <KV items={[
            ['Licence number', <span className="num">{o.sia_number}</span>],
            ['Type', o.sia_type],
            ['Expiry', o.sia_expiry && `${date(o.sia_expiry)}${c.sia_days != null ? ` (${c.sia_days < 0 ? `${-c.sia_days} days ago` : `in ${c.sia_days} days`})` : ''}`],
          ]} />
        </Tile>
        <Tile title="Right to work" icon={BadgeCheck} className="col-span-2 lg:col-span-1" action={isCo && <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>Edit</Button>}>
          <div className="mb-3">{o.rtw_verified ? <ExpiryPill date={o.rtw_expiry} missing="Verified, no expiry" /> : <Pill tone="red">Not verified</Pill>}</div>
          <KV items={[
            ['Evidence', o.rtw_type],
            ['Verified', o.rtw_verified ? 'Yes' : 'No'],
            ['Expiry', o.rtw_expiry ? `${date(o.rtw_expiry)}${c.rtw_days != null ? ` (${c.rtw_days < 0 ? `${-c.rtw_days} days ago` : `in ${c.rtw_days} days`})` : ''}` : o.rtw_verified ? 'No expiry' : null],
          ]} />
        </Tile>
      </Bento>
      {c.issues?.length > 0 && (
        <Tile title="Issues" className="bg-red-soft">
          <ul className="space-y-1 text-subhead font-semibold text-red">{c.issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </Tile>
      )}
      <Section title="Venue bans" action={isCo && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setBan(true)}>Add ban</Button>}>
        {o.bans?.length ? (
          <List>
            {o.bans.map((b) => (
              <Row key={b.venue_id} left={<div className="grid h-9 w-9 place-items-center rounded-full bg-red-soft text-red"><ShieldOff size={18} /></div>}
                title={b.venue_name} subtitle={[b.reason || 'No reason given', `since ${date(b.created_at)}`].join(' · ')}
                right={isCo && <Button size="sm" variant="secondary" onClick={() => unban(b)}>Lift</Button>} />
            ))}
          </List>
        ) : <Empty icon={ShieldOff} title="No venue bans" body="This officer can work at any venue." />}
      </Section>
      {edit && <ComplianceSheet o={o} onClose={() => setEdit(false)} onDone={reload} />}
      {ban && <BanSheet o={o} onClose={() => setBan(false)} onDone={reload} />}
    </div>
  );
}

function ComplianceSheet({ o, onClose, onDone }) {
  const { v, bind, set } = useForm({
    sia_number: o.sia_number || '', sia_type: o.sia_type || '', sia_expiry: o.sia_expiry || '',
    rtw_type: o.rtw_type || '', rtw_expiry: o.rtw_expiry || '', rtw_verified: !!o.rtw_verified,
  });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('officers.save', { id: o.id, ...v }), 'Compliance updated');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Licence and right to work"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="SIA number" {...bind('sia_number')} />
          <Select label="Licence type" placeholder="Choose" options={SIA_TYPES} {...bind('sia_type')} />
          <Input label="SIA expiry" type="date" {...bind('sia_expiry')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Right to work evidence" placeholder="Choose" options={RTW_TYPES} {...bind('rtw_type')} />
          <Input label="Right to work expiry" type="date" hint="Leave blank if indefinite" {...bind('rtw_expiry')} />
        </div>
        <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.rtw_verified} onChange={(x) => set('rtw_verified', x)} label="Right to work checked" hint="You have seen and kept a copy of the original evidence" /></div>
      </div>
    </Sheet>
  );
}

function BanSheet({ o, onClose, onDone }) {
  const venues = useApi('venues.list');
  const { v, bind } = useForm({ venue_id: '', reason: '' });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('officers.saveBan', { officer_id: o.id, ...v }), 'Ban added');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Ban from venue" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} disabled={!v.venue_id} onClick={save}>Add ban</Button></>}>
      <div className="space-y-4">
        <Select label="Venue" placeholder="Choose venue" options={(venues.data || []).map((x) => ({ value: x.id, label: x.name }))} {...bind('venue_id')} />
        <Textarea label="Reason" rows={3} {...bind('reason')} />
      </div>
    </Sheet>
  );
}

/* ---------------- Documents ---------------- */

// What the compliance check read off the scan; managers compare it with the record
function AiRead({ r }) {
  if (r.readable === false) return <div className="mt-0.5 text-caption font-semibold text-amber">AI couldn't read this scan clearly</div>;
  const bits = [r.number && `No. ${r.number}`, r.expiry && `exp. ${date(r.expiry)}`, r.licence_type, r.name].filter(Boolean);
  return (
    <div className="mt-0.5 text-caption text-muted">
      {bits.length > 0 && <div className="truncate"><span className="font-semibold text-blue">AI read:</span> {bits.join(' · ')}</div>}
      {r.concerns?.length > 0 && <div className="whitespace-normal text-amber">{r.concerns.join('; ')}</div>}
    </div>
  );
}

export function DocumentsTab({ o, isCo, onForbidden }) {
  const q = useTabApi('docs.list', { owner_type: 'officer', owner_id: o.id }, onForbidden);
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();
  const open = (d) => run(() => openUrl(() => api('docs.url', { id: d.id })));
  const verify = async (d) => {
    const msg = d.kind === 'sia' ? 'The licence number and expiry will be copied to the compliance record.' : d.kind === 'rtw' ? 'Right to work will be marked as verified with this expiry.' : 'Mark this document as checked.';
    if (!(await confirm({ title: `Verify ${d.title}?`, body: msg, confirm: 'Verify' }))) return;
    await run(() => api('docs.verify', { id: d.id }), 'Document verified');
    q.reload();
  };
  const remove = async (d) => {
    if (!(await confirm({ title: `Delete ${d.title}?`, body: 'The file will be removed permanently.', confirm: 'Delete', danger: true }))) return;
    await run(() => api('docs.delete', { id: d.id }), 'Document deleted');
    q.reload();
  };
  return (
    <TabLoad q={q}>
      {(docs) => (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-subhead text-muted num">{docs.length} document{docs.length === 1 ? '' : 's'}</p>
            {isCo && <Button icon={Upload} onClick={() => setAdding(true)}>Upload</Button>}
          </div>
          {docs.length ? (
            <List>
              {docs.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><FileText size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-semibold">{d.title}</div>
                    <div className="truncate text-footnote text-muted">
                      {[docKindLabel(d.kind), d.number && `No. ${d.number}`, d.expiry && `Expires ${date(d.expiry)}`, `Added ${dateShort(d.created_at)}`].filter(Boolean).join(' · ')}
                    </div>
                    {d.ai_read && d.ai_read_key === d.s3_key && <AiRead r={d.ai_read} />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {d.verified_at ? <Pill tone="green" className="max-w-[160px] truncate">Verified{d.verified_by_name ? ` · ${d.verified_by_name}` : ''}</Pill> : <Pill tone="amber">Unverified</Pill>}
                    {d.expiry && <ExpiryPill date={d.expiry} />}
                    {d.s3_key && <IconButton icon={Eye} label="Open" onClick={() => open(d)} />}
                    {isCo && !d.verified_at && <IconButton icon={Check} label="Verify" onClick={() => verify(d)} className="text-green" />}
                    {isCo && <IconButton icon={Trash2} label="Delete" onClick={() => remove(d)} className="text-red" />}
                  </div>
                </div>
              ))}
            </List>
          ) : <Empty icon={FileText} title="No documents" body="SIA licence, right to work, ID and proof of address will show here." />}
          {adding && <DocSheet o={o} onClose={() => setAdding(false)} onDone={q.reload} />}
        </>
      )}
    </TabLoad>
  );
}

function DocSheet({ o, onClose, onDone }) {
  const { v, bind, set } = useForm({ kind: 'sia', title: 'SIA licence', number: '', expiry: '' });
  const [file, setFile] = useState(null);
  const [run, busy] = useAction();
  const save = async () => {
    await run(async () => {
      const s3_key = file ? await upload(file, 'officer') : null;
      return api('docs.create', { owner_type: 'officer', owner_id: o.id, ...v, s3_key, mime: file?.type || null });
    }, 'Document uploaded');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Upload document"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.title || !file} onClick={save}>Upload</Button></>}>
      <div className="space-y-4">
        <Select label="Type" options={DOC_KINDS} value={v.kind} onChange={(e) => { const k = e.target.value; set('kind', k); set('title', docKindLabel(k)); }} />
        <Input label="Title" {...bind('title')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Number" hint={v.kind === 'sia' ? '16-digit licence number' : undefined} {...bind('number')} />
          <Input label="Expiry" type="date" {...bind('expiry')} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-footnote font-semibold text-muted">File</span>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-subhead file:mr-3 file:rounded-xl file:border-0 file:bg-blue-soft file:px-3 file:py-2 file:font-semibold file:text-blue" />
        </label>
      </div>
    </Sheet>
  );
}

/* ---------------- Rates ---------------- */

export function RatesTab({ o, reload, isCo, roles }) {
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();
  const del = async (r) => {
    if (!(await confirm({ title: 'Delete this rate?', body: `${r.role_name}, ${r.venue_name || 'all venues'}: ${money(r.rate)}/h`, confirm: 'Delete', danger: true }))) return;
    await run(() => api('officers.deleteRate', { id: r.id }), 'Rate deleted');
    reload();
  };
  const cols = [
    { key: 'role_name', label: 'Role' },
    { key: 'venue', label: 'Venue', render: (r) => r.venue_name || 'All venues' },
    { key: 'rate', label: 'Hourly rate', align: 'right', render: (r) => <span className="num font-semibold">{money(r.rate)}</span> },
    { key: 'from', label: 'From', render: (r) => date(r.effective_from) },
    isCo && { key: 'x', label: '', align: 'right', render: (r) => <IconButton icon={Trash2} label="Delete" className="text-red" onClick={(e) => { e.stopPropagation(); del(r); }} /> },
  ].filter(Boolean);
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-subhead text-muted">Officer rates override the standard rate for a role. A venue rate wins over an all-venue rate.</p>
        {isCo && <Button icon={Plus} onClick={() => setAdding(true)}>Add rate</Button>}
      </div>
      <Table columns={cols} rows={o.rates || []} empty="No officer-specific rates" />
      {adding && <RateSheet o={o} roles={roles} onClose={() => setAdding(false)} onDone={reload} />}
    </>
  );
}

function RateSheet({ o, roles, onClose, onDone }) {
  const venues = useApi('venues.list');
  const { v, bind } = useForm({ role: o.roles?.[0] || '', venue_id: '', rate: '', effective_from: isoDate() });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('officers.saveRate', { officer_id: o.id, ...v, rate: Number(v.rate), venue_id: v.venue_id || null }), 'Rate added');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Add rate" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.role || !v.rate} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Select label="Role" placeholder="Choose role" options={roles.map((r) => ({ value: r.code, label: r.name }))} {...bind('role')} />
        <Select label="Venue" placeholder="All venues" options={(venues.data || []).map((x) => ({ value: x.id, label: x.name }))} {...bind('venue_id')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Rate per hour (£)" type="number" step="0.01" min="0" inputMode="decimal" {...bind('rate')} />
          <Input label="Effective from" type="date" {...bind('effective_from')} />
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Shifts & hours ---------------- */

export function ShiftsTab({ o, onForbidden }) {
  const [view, setView] = useState('upcoming');
  const today = isoDate();
  return (
    <>
      <Segmented className="mb-4" value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'hours', label: 'Hours worked' }]} />
      {view === 'upcoming' ? <Upcoming o={o} from={today} onForbidden={onForbidden} /> : <Worked o={o} from={addDays(today, -90)} onForbidden={onForbidden} />}
    </>
  );
}

function Upcoming({ o, from, onForbidden }) {
  const q = useTabApi('shifts.list', { officer_id: o.id, from: new Date().toISOString(), to: `${addDays(from, 60)}T23:59:59Z` }, onForbidden);
  return (
    <TabLoad q={q}>
      {(rows) => rows.length ? (
        <List>
          {rows.map((s) => {
            const a = s.assignments.find((x) => x.officer_id === o.id);
            return <Row key={s.id} left={<DateBadge d={s.starts_at} />} title={s.venue_name} subtitle={`${s.role_name} · ${range(s.starts_at, s.ends_at)}`} right={<Pill status={a?.status || s.status} />} />;
          })}
        </List>
      ) : <Empty icon={Clock} title="No upcoming shifts" body="Nothing rostered in the next 60 days." />}
    </TabLoad>
  );
}

function Worked({ o, from, onForbidden }) {
  const q = useTabApi('timesheets.list', { officer_id: o.id, from }, onForbidden);
  return (
    <TabLoad q={q}>
      {(rows) => {
        const d28 = addDays(isoDate(), -28);
        const last28 = rows.filter((t) => isoDate(t.starts_at) >= d28).reduce((a, t) => a + Number(t.hours || 0), 0);
        const total = rows.reduce((a, t) => a + Number(t.hours || 0), 0);
        return (
          <>
            <Bento className="mb-4">
              <Tile><Stat value={hours(last28)} label="Last 4 weeks" /></Tile>
              <Tile><Stat value={hours(total)} label="Last 90 days" /></Tile>
              <Tile><Stat value={rows.length} label="Shifts worked" /></Tile>
              <Tile><Stat value={rows.filter((t) => t.status === 'disputed').length} label="Disputed" tone={rows.some((t) => t.status === 'disputed') ? 'red' : undefined} /></Tile>
            </Bento>
            <Table rows={rows} empty="No timesheets in the last 90 days" columns={[
              { key: 'day', label: 'Date', render: (t) => dayLabel(t.starts_at) },
              { key: 'venue_name', label: 'Venue' },
              { key: 'role_name', label: 'Role' },
              { key: 'times', label: 'Actual', render: (t) => (t.actual_start ? range(t.actual_start, t.actual_end || t.actual_start) : '—') },
              { key: 'hours', label: 'Hours', align: 'right', render: (t) => hours(t.hours) },
              { key: 'status', label: 'Status', render: (t) => <Pill status={t.status} /> },
            ]} />
          </>
        );
      }}
    </TabLoad>
  );
}

const DateBadge = ({ d }) => (
  <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-soft text-center leading-none text-blue">
    <div><div className="text-caption2 font-bold uppercase">{new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(new Date(d))}</div>
      <div className="num text-callout font-bold">{new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'Europe/London' }).format(new Date(d))}</div></div>
  </div>
);

/* ---------------- Availability ---------------- */

export function AvailabilityTab({ o, reload }) {
  const init = () => WEEKDAYS.map((_, i) => {
    const a = (o.availability || []).find((x) => x.weekday === i);
    return { weekday: i, available: a ? a.available : true, from_time: a?.from_time?.slice(0, 5) || '', to_time: a?.to_time?.slice(0, 5) || '' };
  });
  const [days, setDays] = useState(init);
  const [dirty, setDirty] = useState(false);
  const [run, busy] = useAction();
  const upd = (i, k, val) => { setDirty(true); setDays((d) => d.map((x, j) => (j === i ? { ...x, [k]: val } : x))); };
  const save = async () => {
    await run(() => api('officers.saveAvailability', { officer_id: o.id, days }), 'Availability saved');
    setDirty(false);
    reload();
  };
  return (
    <>
      <p className="mb-3 text-subhead text-muted">Usual weekly pattern. Leave times blank for any time of day.</p>
      <List>
        {days.map((d, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="w-28 text-body font-semibold">{WEEKDAYS[i]}</div>
            <div className="w-20"><Toggle checked={d.available} onChange={(x) => upd(i, 'available', x)} /></div>
            {d.available ? (
              <div className="flex flex-1 items-center gap-2">
                <input type="time" value={d.from_time} onChange={(e) => upd(i, 'from_time', e.target.value)} className="h-10 w-28 rounded-xl border border-line px-2 num" aria-label="From" />
                <span className="text-faint">to</span>
                <input type="time" value={d.to_time} onChange={(e) => upd(i, 'to_time', e.target.value)} className="h-10 w-28 rounded-xl border border-line px-2 num" aria-label="To" />
              </div>
            ) : <span className="text-subhead text-faint">Not available</span>}
          </div>
        ))}
      </List>
      <div className="mt-3 flex justify-end"><Button busy={busy} disabled={!dirty} onClick={save}>Save availability</Button></div>
    </>
  );
}

/* ---------------- Time off ---------------- */

export function TimeOffTab({ o, onForbidden }) {
  const q = useTabApi('timeoff.list', { officer_id: o.id }, onForbidden);
  const [adding, setAdding] = useState(false);
  return (
    <TabLoad q={q}>
      {(rows) => (
        <>
          <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => setAdding(true)}>Add time off</Button></div>
          {rows.length ? <List>{rows.map((t) => <TimeOffRow key={t.id} t={t} onDone={q.reload} />)}</List>
            : <Empty icon={CalendarOff} title="No time off" body="Holidays, sickness and unavailability will show here." />}
          {adding && <TimeOffSheet officerId={o.id} onClose={() => setAdding(false)} onDone={q.reload} />}
        </>
      )}
    </TabLoad>
  );
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000) + 1;

export function TimeOffRow({ t, onDone, showName }) {
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const decide = async (status) => {
    if (status === 'rejected' && !(await confirm({ title: 'Decline this request?', body: `${t.officer_name}: ${titleCase(t.kind)} ${dateShort(t.start_date)} – ${dateShort(t.end_date)}`, confirm: 'Decline', danger: true }))) return;
    await run(() => api('timeoff.decide', { id: t.id, status }), status === 'approved' ? 'Approved' : 'Declined');
    onDone();
  };
  const cancel = async () => {
    if (!(await confirm({ title: 'Cancel this time off?', confirm: 'Cancel time off', danger: true }))) return;
    await run(() => api('timeoff.cancel', { id: t.id }), 'Cancelled');
    onDone();
  };
  const n = daysBetween(t.start_date, t.end_date);
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-body font-semibold">
          {showName ? t.officer_name : titleCase(t.kind)}
          {showName && <Pill tone={t.kind === 'sick' ? 'red' : t.kind === 'holiday' ? 'blue' : 'grey'}>{titleCase(t.kind)}</Pill>}
        </div>
        <div className="text-footnote text-muted">
          <span className="num">{t.start_date === t.end_date ? dayLabel(t.start_date) : `${dayLabel(t.start_date)} – ${dayLabel(t.end_date)}`} · {n} day{n === 1 ? '' : 's'}</span>
          {t.reason && ` · ${t.reason}`}
          {t.decided_by_name && t.status !== 'pending' && ` · ${titleCase(t.status)} by ${t.decided_by_name}`}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {t.status === 'pending' ? (
          <>
            <Button size="sm" variant="secondary" icon={X} busy={busy} onClick={() => decide('rejected')}>Decline</Button>
            <Button size="sm" icon={Check} busy={busy} onClick={() => decide('approved')}>Approve</Button>
          </>
        ) : (
          <>
            <Pill status={t.status} />
            {t.status === 'approved' && t.end_date >= isoDate() && <IconButton icon={X} label="Cancel" onClick={cancel} />}
          </>
        )}
      </div>
    </div>
  );
}

export function TimeOffSheet({ officerId, officers, onClose, onDone }) {
  const today = isoDate();
  const { v, bind, set } = useForm({ officer_id: officerId || '', kind: 'holiday', start_date: today, end_date: today, reason: '' });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('timeoff.request', v), 'Time off added');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Add time off" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.officer_id || !v.start_date || !v.end_date} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {officers && <Select label="Officer" placeholder="Choose officer" options={officers.map((x) => ({ value: x.id, label: x.name }))} {...bind('officer_id')} />}
        <Segmented value={v.kind} onChange={(k) => set('kind', k)} options={TIMEOFF_KINDS} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" {...bind('start_date')} onChange={(e) => { set('start_date', e.target.value); if (e.target.value > v.end_date) set('end_date', e.target.value); }} />
          <Input label="To" type="date" min={v.start_date} {...bind('end_date')} />
        </div>
        <Textarea label="Reason" rows={2} {...bind('reason')} />
        <p className="text-caption text-faint">Time off entered by a manager is approved straight away.</p>
      </div>
    </Sheet>
  );
}

/* ---------------- HR notes ---------------- */

const HR_KINDS = [
  { value: 'note', label: 'Note' }, { value: 'commendation', label: 'Commendation' }, { value: 'warning', label: 'Warning' },
  { value: 'review', label: 'Review' }, { value: 'training', label: 'Training' }, { value: 'venue_feedback', label: 'Venue feedback' },
];
const SECURITY_HR = ['note', 'commendation', 'training', 'venue_feedback'];
const HR_TONE = { commendation: 'green', warning: 'red', review: 'blue', training: 'blue', venue_feedback: 'amber', note: 'grey' };

export function HrTab({ o, isCo, onForbidden }) {
  const [kind, setKind] = useState('all');
  const q = useTabApi('hrnotes.list', { officer_id: o.id }, onForbidden);
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();
  const del = async (n) => {
    if (!(await confirm({ title: `Delete "${n.title}"?`, body: 'This record will be removed from the officer file.', confirm: 'Delete', danger: true }))) return;
    await run(() => api('hrnotes.delete', { id: n.id }), 'Deleted');
    q.reload();
  };
  return (
    <TabLoad q={q}>
      {(all) => {
        const rows = kind === 'all' ? all : all.filter((n) => n.kind === kind);
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...HR_KINDS.map((k) => ({ ...k, count: all.filter((n) => n.kind === k.value).length }))]} />
              <Button icon={Plus} onClick={() => setAdding(true)}>Add record</Button>
            </div>
            {rows.length ? (
              <List>
                {rows.map((n) => (
                  <div key={n.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={HR_TONE[n.kind]}>{HR_KINDS.find((k) => k.value === n.kind)?.label}</Pill>
                          {n.level && <Pill tone="grey">{n.kind === 'review' ? `Rating ${n.level}/5` : titleCase(n.level)}</Pill>}
                          {n.visible_to_officer && <Pill tone="blue">Shared with officer</Pill>}
                        </div>
                        <div className="mt-1.5 text-body font-semibold">{n.title}</div>
                        {n.body && <p className="mt-0.5 whitespace-pre-wrap text-subhead text-muted">{n.body}</p>}
                        <div className="mt-1 text-caption text-faint">{n.author_name || 'System'} · {dateTime(n.created_at)}</div>
                      </div>
                      {isCo && <IconButton icon={Trash2} label="Delete" className="text-red" onClick={() => del(n)} />}
                    </div>
                  </div>
                ))}
              </List>
            ) : <Empty icon={MessageSquare} title="Nothing recorded" body="Notes, commendations, warnings, reviews and training records." />}
            {adding && <HrSheet o={o} isCo={isCo} onClose={() => setAdding(false)} onDone={q.reload} />}
          </>
        );
      }}
    </TabLoad>
  );
}

function HrSheet({ o, isCo, onClose, onDone }) {
  const { v, bind, set } = useForm({ kind: 'note', title: '', body: '', level: '', visible_to_officer: false });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('hrnotes.create', { officer_id: o.id, ...v }), 'Saved');
    onDone();
    onClose();
  };
  const kinds = isCo ? HR_KINDS : HR_KINDS.filter((k) => SECURITY_HR.includes(k.value));
  return (
    <Sheet open onClose={onClose} title="Add HR record"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.title} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Select label="Type" options={kinds} value={v.kind} onChange={(e) => { set('kind', e.target.value); set('level', ''); }} />
        {v.kind === 'warning' && <Select label="Level" placeholder="Choose" options={['verbal', 'written', 'final']} {...bind('level')} />}
        {v.kind === 'review' && <Select label="Rating" placeholder="Choose" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} out of 5` }))} {...bind('level')} />}
        <Input label="Title" {...bind('title')} />
        <Textarea label="Details" rows={4} {...bind('body')} />
        <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.visible_to_officer} onChange={(x) => set('visible_to_officer', x)} label="Share with officer" hint="They will see it on their profile and get a notification" /></div>
        {!isCo && <p className="text-caption text-faint">Warnings and reviews can only be recorded by the company.</p>}
      </div>
    </Sheet>
  );
}

/* ---------------- Onboarding ---------------- */

export function OnboardingTab({ o, reload, onForbidden }) {
  const q = useTabApi('onboarding.tasks', { officer_id: o.id }, onForbidden);
  const [run] = useAction();
  const toggle = async (t) => {
    q.setData((rows) => rows.map((x) => (x.code === t.code ? { ...x, done: !t.done } : x)));
    try { await run(() => api('onboarding.toggle', { officer_id: o.id, code: t.code, done: !t.done })); } catch { /* toast shown */ }
    q.reload();
  };
  return (
    <TabLoad q={q}>
      {(tasks) => {
        const done = tasks.filter((t) => t.done).length;
        return (
          <div className="grid gap-4 lg:grid-cols-3">
            <Tile title="Progress" icon={ClipboardList}>
              <Stat value={`${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%`} label={`${done} of ${tasks.length} steps done`} />
              <Progress className="mt-4" done={done} total={tasks.length} />
              <div className="mt-4 text-footnote text-muted">Status: <Pill status={o.status} /></div>
              <p className="mt-3 text-caption text-faint">Steps tick automatically when documents are uploaded and contracts signed.</p>
            </Tile>
            <List className="lg:col-span-2">
              {tasks.map((t) => (
                <button key={t.code} type="button" onClick={() => toggle(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-bg">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${t.done ? 'border-green bg-green text-white' : 'border-line'}`}>{t.done && <Check size={14} strokeWidth={3} />}</span>
                  <span className={`flex-1 text-body ${t.done ? 'text-muted line-through' : 'font-semibold'}`}>{t.title}</span>
                  {t.done_at && <span className="text-caption text-faint">{dateShort(t.done_at)}</span>}
                </button>
              ))}
            </List>
          </div>
        );
      }}
    </TabLoad>
  );
}

/* ---------------- Contracts ---------------- */

export function ContractsTab({ o, onForbidden }) {
  const q = useTabApi('contracts.list', { officer_id: o.id }, onForbidden);
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState(null);
  const confirm = useConfirm();
  const [run] = useAction();
  const voidIt = async (c) => {
    if (!(await confirm({ title: `Void "${c.title}"?`, body: 'The officer will no longer be able to sign it.', confirm: 'Void', danger: true }))) return;
    await run(() => api('contracts.void', { id: c.id }), 'Contract voided');
    q.reload();
  };
  const tone = { sent: 'amber', signed: 'green', void: 'grey' };
  return (
    <TabLoad q={q}>
      {(rows) => (
        <>
          <div className="mb-3 flex justify-end"><Button icon={FileSignature} onClick={() => setSending(true)}>Send contract</Button></div>
          {rows.length ? (
            <List>
              {rows.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><FileSignature size={18} /></div>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setViewing(c.id)}>
                    <div className="truncate text-body font-semibold">{c.title}</div>
                    <div className="truncate text-footnote text-muted">{c.status === 'signed' ? `Signed by ${c.signed_name} · ${dateTime(c.signed_at)}` : `Sent ${date(c.created_at)}`}</div>
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Pill tone={tone[c.status]}>{c.status === 'sent' ? 'Awaiting signature' : titleCase(c.status)}</Pill>
                    <Button size="sm" variant="secondary" onClick={() => run(() => downloadAction('contracts.pdf', { id: c.id }))}>PDF</Button>
                    {c.status === 'sent' && <IconButton icon={X} label="Void" onClick={() => voidIt(c)} />}
                  </div>
                </div>
              ))}
            </List>
          ) : <Empty icon={FileSignature} title="No contracts" body="Send a contractor agreement for e-signature." />}
          {sending && <SendContractSheet o={o} onClose={() => setSending(false)} onDone={q.reload} />}
          {viewing && <ContractView id={viewing} onClose={() => setViewing(null)} />}
        </>
      )}
    </TabLoad>
  );
}

function SendContractSheet({ o, onClose, onDone }) {
  const tpl = useApi('contracts.templates');
  const [id, setId] = useState('');
  const [run, busy] = useAction();
  const active = (tpl.data || []).filter((t) => t.active);
  const chosen = id || active[0]?.id || '';
  const send = async () => {
    await run(() => api('contracts.send', { officer_id: o.id, template_id: chosen }), 'Contract sent');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Send contract" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!chosen} onClick={send}>Send for signature</Button></>}>
      <Load q={tpl}>
        {() => active.length ? (
          <div className="space-y-3">
            <Select label="Template" value={chosen} onChange={(e) => setId(e.target.value)} options={active.map((t) => ({ value: t.id, label: t.title }))} />
            <p className="text-footnote text-muted">{o.first_name} will be notified{o.user_id ? '' : ' once they have an app login'} and can sign on their phone.</p>
          </div>
        ) : <Empty title="No active templates" body="Add one in Settings → Contracts." />}
      </Load>
    </Sheet>
  );
}

function ContractView({ id, onClose }) {
  const q = useApi('contracts.get', { id });
  return (
    <Sheet open onClose={onClose} title={q.data?.title || 'Contract'} size="lg">
      <Load q={q}>
        {(c) => (
          <div>
            <div className="whitespace-pre-wrap rounded-2xl bg-bg p-4 text-subhead leading-relaxed">{c.body}</div>
            {c.status === 'signed' && (
              <div className="mt-4 rounded-2xl border border-line p-4">
                {c.signature && <img src={c.signature} alt="Signature" className="mb-2 h-20 object-contain" />}
                <KV items={[['Signed by', c.signed_name], ['Signed at', dateTime(c.signed_at)], ['IP address', c.signed_ip]]} />
              </div>
            )}
          </div>
        )}
      </Load>
    </Sheet>
  );
}

/* ---------------- Offboarding ---------------- */

export function OffboardingTab({ o, reload }) {
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const { v, bind, set } = useForm({ leave_date: isoDate(), reason: '', kit_returned: false, rehire_eligible: true, notes: '', disable_login: true });
  const ob = o.offboarding;
  const save = async () => {
    if (!(await confirm({ title: `Offboard ${o.first_name}?`, body: `Status becomes Left. Shifts after ${date(v.leave_date)} are cancelled${v.disable_login ? ' and their app login is disabled' : ''}.`, confirm: 'Offboard', danger: true }))) return;
    await run(() => api('offboarding.save', { officer_id: o.id, ...v }), 'Officer offboarded');
    reload();
  };
  const rehire = async () => {
    if (!(await confirm({ title: `Rehire ${o.first_name}?`, body: 'They move back to onboarding and their login is restored.', confirm: 'Rehire' }))) return;
    await run(() => api('offboarding.rehire', { officer_id: o.id }), 'Moved to onboarding');
    reload();
  };
  if (ob) {
    return (
      <Tile title="Leaver record" icon={Award} action={<Button size="sm" variant="soft" busy={busy} onClick={rehire}>Rehire</Button>}>
        <KV items={[
          ['Leave date', date(ob.leave_date)], ['Reason', ob.reason], ['Kit returned', ob.kit_returned ? 'Yes' : 'No'],
          ['Eligible for rehire', ob.rehire_eligible ? 'Yes' : 'No'], ['Notes', ob.notes], ['Recorded', date(ob.created_at)],
        ]} />
      </Tile>
    );
  }
  return (
    <Tile title="Record a leaver">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Last working day" type="date" {...bind('leave_date')} />
          <Select label="Reason" placeholder="Choose" options={['Resigned', 'Contract ended', 'Dismissed', 'Licence revoked', 'Moved away', 'Other'].map((x) => ({ value: x, label: x }))} {...bind('reason')} />
        </div>
        <Textarea label="Notes" rows={3} {...bind('notes')} />
        <div className="divide-y divide-line rounded-2xl bg-bg px-4">
          <div className="py-1.5"><Toggle checked={v.kit_returned} onChange={(x) => set('kit_returned', x)} label="Kit and ID returned" /></div>
          <div className="py-1.5"><Toggle checked={v.rehire_eligible} onChange={(x) => set('rehire_eligible', x)} label="Eligible for rehire" /></div>
          <div className="py-1.5"><Toggle checked={v.disable_login} onChange={(x) => set('disable_login', x)} label="Disable app login" /></div>
        </div>
        <div className="flex justify-end"><Button variant="danger" busy={busy} onClick={save}>Offboard officer</Button></div>
      </div>
    </Tile>
  );
}

/* ---------------- Attendance (Ops AI) ---------------- */

const ATT_KIND = { late: ['Late', 'amber'], no_show: ['No show', 'red'], left_early: ['Left early', 'amber'], cant_make_it: ["Couldn't make it", 'grey'] };
const sumCounts = (c) => Object.values(c || {}).reduce((a, n) => a + n, 0);
const countsHint = (c) => Object.entries(c || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${(ATT_KIND[k]?.[0] || k).toLowerCase()}`).join(' · ') || 'Clean record';

export function AttendanceTab({ o, onForbidden }) {
  const q = useTabApi('attendance.list', { officer_id: o.id }, onForbidden);
  const [edit, setEdit] = useState(null);
  return (
    <TabLoad q={q}>
      {(d) => (
        <>
          <Bento>
            <Tile title="Reliability"><Stat value={d.reliability == null ? '—' : `${Math.round(d.reliability * 100)}%`} label="On time, last 90 days" hint={`${d.shifts90} shift${d.shifts90 === 1 ? '' : 's'}`} tone={d.reliability != null && d.reliability < 0.85 ? 'amber' : undefined} /></Tile>
            <Tile title="Last 30 days"><Stat value={sumCounts(d.counts30)} label={sumCounts(d.counts30) === 1 ? 'Issue' : 'Issues'} hint={countsHint(d.counts30)} tone={d.counts30.no_show ? 'red' : undefined} /></Tile>
            <Tile title="Last 90 days"><Stat value={sumCounts(d.counts90)} label={sumCounts(d.counts90) === 1 ? 'Issue' : 'Issues'} hint={countsHint(d.counts90)} /></Tile>
            <Tile title="Venue rating"><Stat value={d.avg_rating == null ? '—' : `${d.avg_rating}/5`} label="Average" hint={`${d.ratings.length} rating${d.ratings.length === 1 ? '' : 's'}`} tone={d.avg_rating != null && d.avg_rating < 3 ? 'red' : undefined} /></Tile>
          </Bento>

          <Section title="Lates and absences">
            {d.events.length ? (
              <List>{d.events.map((e) => {
                const [label, tone] = ATT_KIND[e.kind] || [titleCase(e.kind), 'grey'];
                return (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-body font-semibold">
                        <span className={cx(e.excused && 'text-muted line-through')}>{e.venue_name}</span>
                        <Pill tone={tone}>{label}{e.kind === 'late' && e.minutes ? ` ${e.minutes} min` : ''}</Pill>
                        {e.excused && <Pill tone="green">Excused</Pill>}
                        {e.notified && !e.excused && <Pill tone="blue">Told us</Pill>}
                      </div>
                      <div className="text-footnote text-muted">{dayLabel(e.starts_at)} · {range(e.starts_at, e.ends_at)}</div>
                      {e.reason && <div className="mt-1 text-footnote">“{e.reason}”</div>}
                      {e.note && <div className="mt-1 rounded-xl bg-bg px-3 py-1.5 text-footnote text-muted">{e.note}</div>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(e)}>Review</Button>
                  </div>
                );
              })}</List>
            ) : <Empty icon={Clock} title="No lates or absences" body="Ops AI records lates, no-shows and early finishes here automatically." />}
          </Section>

          <Section title="Venue ratings">
            {d.ratings.length ? (
              <List>{d.ratings.map((r, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body font-semibold">{r.venue_name}</span>
                    <span className="flex items-center gap-0.5" aria-label={`${r.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={16} className={n <= r.rating ? 'fill-amber text-amber' : 'text-line'} />)}
                    </span>
                  </div>
                  <div className="text-footnote text-muted">{dayLabel(r.starts_at)}</div>
                  {r.note && <div className="mt-1 text-subhead">“{r.note}”</div>}
                </div>
              ))}</List>
            ) : <Empty icon={Star} title="No ratings yet" body="Venues are asked to rate officers after each shift." />}
          </Section>

          {edit && <AttendanceSheet e={edit} onClose={() => setEdit(null)} onDone={q.reload} />}
        </>
      )}
    </TabLoad>
  );
}

function AttendanceSheet({ e, onClose, onDone }) {
  const [run, busy] = useAction();
  const [excused, setExcused] = useState(!!e.excused);
  const [note, setNote] = useState(e.note || '');
  const save = () => run(() => api('attendance.update', { id: e.id, excused, note }), 'Saved').then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`${(ATT_KIND[e.kind] || [titleCase(e.kind)])[0]} · ${e.venue_name}`} size="sm" footer={<Button busy={busy} onClick={save}>Save</Button>}>
      <div className="space-y-3">
        <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={excused} onChange={setExcused} label="Excused" hint="Excused events don't count against reliability" /></div>
        <Textarea label="Note" rows={3} value={note} onChange={(x) => setNote(x.target.value)} />
      </div>
    </Sheet>
  );
}

/* ---------------- Training ---------------- */

export function TrainingTab({ o, user, onForbidden }) {
  const q = useTabApi('academy.officer', { officer_id: o.id }, onForbidden);
  const [run] = useAction();
  const confirm = useConfirm();
  const base = `/${user.role}`;
  const unassign = async (c) => {
    if (!(await confirm({ title: `Remove ${c.title} from ${o.first_name}'s training?`, confirm: 'Remove' }))) return;
    await run(() => api('academy.unassign', { course_id: c.id, officer_id: o.id }), 'Removed');
    q.reload();
  };
  return (
    <TabLoad q={q}>
      {({ courses, certificates }) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <Tile title="Courses" pad={false}>
            {courses.length ? (
              <List>
                {courses.map((c) => (
                  <Row key={c.id} to={`${base}/team/academy/${c.id}`} title={c.title}
                    subtitle={[c.due_date && `Due ${date(c.due_date)}`, c.last_attempt && `Last quiz ${c.last_attempt.score}%`, c.sections && `${c.done_sections}/${c.sections} sections read`].filter(Boolean).join(' · ')}
                    right={<span className="flex items-center gap-2">
                      <Pill tone={TRAINING_TONE[c.state]}>{titleCase(c.state)}</Pill>
                      {c.assignment_id && <IconButton icon={X} label="Remove assignment" onClick={(e) => { e.preventDefault(); e.stopPropagation(); unassign(c); }} />}
                    </span>} />
                ))}
              </List>
            ) : <Empty title="No training yet" body="Assign courses from Team › Academy." />}
          </Tile>
          <Tile title="Certificates" pad={false}>
            {certificates.length ? (
              <List>
                {certificates.map((c) => (
                  <Row key={c.id} to={`${base}/team/certificates/${c.id}`} left={<Award size={20} className="text-blue" />} title={c.title}
                    subtitle={`${c.ref} · ${c.score}% · ${date(c.issued_at)}`}
                    right={c.expires_at ? <ExpiryPill date={c.expires_at} /> : <Pill tone="green">No expiry</Pill>} />
                ))}
              </List>
            ) : <Empty title="No certificates yet" />}
          </Tile>
        </div>
      )}
    </TabLoad>
  );
}
const TRAINING_TONE = { passed: 'green', overdue: 'red', renew: 'amber', expired: 'red', in_progress: 'blue', assigned: 'blue', not_started: 'grey' };
