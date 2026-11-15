import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Award, Ban, BadgeCheck, BellRing, CalendarClock, CalendarOff, Check, ClipboardList, Clock, Contact, Eye, FileSignature, FileText, Landmark, MessageSquare, Pencil, Plus, PoundSterling, ReceiptText, ShieldCheck, ShieldOff, Smartphone, Star, Target, Trash2, ScrollText, Upload, UserRound, Users, X,
} from 'lucide-react';
import { api, downloadAction, upload } from '../../api.js';
import {
  ActionBar, addDays, AssignPill, Bento, Button, cx, date, dateShort, dateTime, dayLabel, Empty, ErrorBox, hours, IconButton, Input, isoDate, KV, List, money, Pill, Pressable, range, relative, Row, Section, Segmented, Select, Sheet, Spinner, Stat, Table, Textarea, Tile, titleCase, Toggle, useAction, useApi, useConfirm, useDirtyGuard, useForm,
} from '../../ui/index.jsx';
import { DOC_KINDS, ExpiryPill, Progress, RTW_TYPES, SIA_TYPES, TIMEOFF_KINDS, WEEKDAYS, docKindLabel, DocThumbs, openUrl } from './_parts.jsx';
import { CertificateSheet } from '../team/_training.jsx';
import { ContractView, DocPill, RemindButton, SendDocSheet } from './_esign.jsx';
import StartSheet from './contracts/StartSheet.jsx';
import { AMEND_KIND, ENGAGEMENT, JUR_SHORT } from './contracts/_shared.jsx';
import { PackPill } from '../shared/PackPaper.jsx';
import { SiaCheckPill, SiaVerifyButton, useSiaVerify } from './SiaVerify.jsx';
import { SIA_CHECK_ON } from '../../ui/sia.js';
import RtwCheckSheet from './RtwCheckSheet.jsx';
import GraceSheet, { GRACE_LABEL, GraceButton, graceFromHistory } from './_graceSheet.jsx';

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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Tile title="Personal details" icon={UserRound} className="lg:col-span-2">
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
      <Tile title="Emergency contacts" icon={Contact} pad={false} action={isCo && <Button size="sm" variant="ghost" onClick={() => setEditContacts(true)}>Edit</Button>}>
        {o.emergency_contacts?.length ? (
          <div className="divide-y divide-line">
            {o.emergency_contacts.map((c) => (
              <Row key={c.id} title={c.name} subtitle={c.relationship || 'Contact'} right={c.phone && <a href={`tel:${c.phone}`} className="font-semibold text-blue num">{c.phone}</a>} />
            ))}
          </div>
        ) : <p className="px-5 pb-5 text-subhead text-faint">None on file</p>}
      </Tile>
      <PhoneTile o={o} />
      {hasTax && (
        <Tile title="Tax" icon={ReceiptText}>
          <KV items={[['NI number', o.ni_number], ['UTR', o.utr]]} />
        </Tile>
      )}
      {hasBank && (
        <Tile title="Bank details" icon={Landmark} className="lg:col-span-2">
          <KV items={[['Bank', o.bank_name], ['Sort code', <span className="num">{o.bank_sort_code}</span>], ['Account number', <span className="num">{o.bank_account}</span>]]} />
        </Tile>
      )}
      {editContacts && <ContactsSheet o={o} onClose={() => setEditContacts(false)} onDone={reload} />}
    </div>
  );
}

// The officer's clock-in phone. Removing it makes them register a phone again, which a manager then approves.
function PhoneTile({ o }) {
  const q = useApi('device.list', { officer_id: o.id });
  const confirm = useConfirm();
  const [run, busy] = useAction();
  if (q.error || !q.data) return null;
  const revoke = async (d) => {
    if (!(await confirm({ title: `Remove ${d.label}?`, body: `${o.name} can't use it to clock in any more. Their next clock-in asks them to register a phone, and a manager must approve it.`, confirm: 'Remove phone', danger: true }))) return;
    run(() => api('device.revoke', { id: d.id }), 'Phone removed').then(q.reload).catch(() => {});
  };
  return (
    <Tile title="Clock-in phone" icon={Smartphone}>
      {!q.data.length ? (
        <div className="flex items-start gap-2"><Pill tone="amber">No phone</Pill><p className="text-subhead text-muted">Not registered yet. They're asked to on their Home page and at their first clock-in.</p></div>
      ) : (
        <div className="divide-y divide-line">
          {q.data.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-semibold">{d.label}</span>{d.status === 'pending' ? <Pill tone="amber">Awaiting approval</Pill> : <Pill tone="green">Active</Pill>}</div>
                <div className="text-footnote text-muted">Since {date(d.created_at)}{d.last_used_at ? ` · last used ${relative(d.last_used_at)}` : ''}</div>
              </div>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => revoke(d)}>Remove</Button>
            </div>
          ))}
        </div>
      )}
      {o.user_id && (
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-footnote text-muted">
          <BellRing size={16} className={o.has_push ? 'text-green' : 'text-faint'} />
          {o.has_push ? 'Phone notifications on' : "No phone notifications: they won't get alerts until they open the app. They're asked to turn them on."}
        </div>
      )}
    </Tile>
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

const GRACE_EVENT = { grant: 'Given', renew: 'Extended', cover: 'Now also covers', documents: 'Closed: documents in', expired: 'Ran out, documents still missing', ended: 'Ended early' };

// Grace period: on one now, or has had one before (with what happened)
function GraceTile({ o, q, isCo, reload }) {
  const [sheet, setSheet] = useState(null);
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const d = q.data;
  // Giving one sits on the SIA licence and Right to work tiles; this one is the open grace and the history
  if (!d?.graces.length) return null;
  const open = d.graces.find((g) => !g.ended_at);
  const done = () => { q.reload(); reload(); };
  const end = async () => {
    if (!(await confirm({ title: 'End the grace period now?', body: "They can't clock in or be rostered again until their documents are in. They are told.", confirm: 'End now', danger: true }))) return;
    run(() => api('compliance.grace.end', { officer_id: o.id, reason: 'Ended early from the profile' }), 'Grace period ended').then(done).catch(() => {});
  };
  const left = open && Math.round((new Date(open.ends_on) - new Date(isoDate())) / 86400000);
  const canRenew = (g) => g && g.renewals < d.max_renewals;
  return (
    <Tile title="Grace period" icon={CalendarClock}
      action={isCo && open && <div className="flex gap-1">{canRenew(open) && <Button size="sm" variant="ghost" onClick={() => setSheet({ mode: 'renew', grace: open })}>Extend</Button>}<Button size="sm" variant="ghost" disabled={busy} onClick={end}>End now</Button></div>}>
      {open ? (
        <>
          <div className="mb-2"><Pill tone={left <= 3 ? 'red' : 'amber'}>Can work until {date(open.ends_on)}</Pill></div>
          <KV items={[
            ['Covers', open.covers.map((k) => GRACE_LABEL[k] || k).join(', ')],
            ['Reason', open.reason],
            ['Extended', `${open.renewals} of ${d.max_renewals} times`],
            ['Given by', open.granted_by_name],
          ]} />
        </>
      ) : <p className="text-subhead text-muted">Not on a grace period now.</p>}
      <ul className="mt-3 space-y-1 border-t border-line pt-3 text-footnote text-muted">
        {d.graces.flatMap((g) => [...g.events].reverse()).slice(0, 8).map((e) => (
          <li key={e.id}><span className="num">{date(e.created_at)}</span> · {GRACE_EVENT[e.kind] || e.kind}{e.ends_on && ['grant', 'renew'].includes(e.kind) ? ` until ${date(e.ends_on)}` : ''}{e.kind === 'cover' && e.covers ? `: ${e.covers.map((k) => GRACE_LABEL[k] || k).join(', ')}` : ''}{e.by_name ? ` · ${e.by_name}` : ''}{e.reason ? ` · "${e.reason}"` : ''}</li>
        ))}
      </ul>
      {sheet && <GraceSheet officer={o} mode={sheet.mode} grace={sheet.grace} keys={d.keys} maxDays={d.max_days} maxRenewals={d.max_renewals} onClose={() => setSheet(null)} onDone={done} />}
    </Tile>
  );
}

export function ComplianceTab({ o, reload, isCo, user }) {
  const isMgr = ['company', 'security'].includes(user?.role);
  const [edit, setEdit] = useState(null);
  // ?rtw=check (from the Compliance page) opens Check right to work straight away
  const [rtwCheck, setRtwCheck] = useState(() => isCo && new URLSearchParams(window.location.search).get('rtw') === 'check');
  const [ban, setBan] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();
  const unban = async (b) => {
    if (!(await confirm({ title: `Lift ban at ${b.venue_name}?`, body: 'The officer can be rostered at this venue again.', confirm: 'Lift ban' }))) return;
    await run(() => api('officers.saveBan', { officer_id: o.id, venue_id: b.venue_id, remove: true }), 'Ban lifted');
    reload();
  };
  const c = o.compliance || {};
  const orbRtw = o.rtw_verified && o.rtw_method === 'orb_passport';
  const gq = useApi('compliance.grace.history', { officer_id: o.id }, { skip: !isMgr });
  const gs = gq.data && graceFromHistory(gq.data);
  // Give a grace period (or extend one that ran out) on the tile whose problem stops them working; an open one is extended on its own tile
  const graceOn = (area) => isCo && gs && !gs.grace && !c.ok && [...gs.keys, ...(gs.grace?.covers || []), ...(gs.lapsed?.covers || [])].some((k) => k.startsWith(area))
    && <GraceButton officer={o} state={gs} onDone={() => { gq.reload(); reload(); }} />;
  return (
    <div className="space-y-4">
      {isMgr && <GraceTile o={o} q={gq} isCo={isCo} reload={reload} />}
      <Bento className="lg:grid-cols-2">
        <Tile title="SIA licence" icon={BadgeCheck} className="col-span-2 lg:col-span-1" action={isCo && <Button size="sm" variant="ghost" onClick={() => setEdit('sia')}>Edit</Button>}>
          <div className="mb-3"><ExpiryPill date={o.sia_expiry} missing="No licence" /></div>
          {SIA_CHECK_ON && <SiaCheckPill status={o.sia_status} at={o.sia_last_verified_at} by={o.sia_last_verified_by_name} className="mb-3" />}
          <KV items={[
            ['Licence number', <span className="num">{o.sia_number}</span>],
            ['Type', o.sia_type],
            ['Expiry', o.sia_expiry && `${date(o.sia_expiry)}${c.sia_days != null ? ` (${c.sia_days < 0 ? `${-c.sia_days} days ago` : `in ${c.sia_days} days`})` : ''}`],
          ]} />
          <DocThumbs docs={o.id_docs?.filter((d) => d.kind === 'sia')} className="mt-3" />
          {SIA_CHECK_ON && isMgr && <div className="mt-3"><SiaVerifyButton o={o} onSaved={reload} /></div>}
          {graceOn('sia_') && <div className="mt-3">{graceOn('sia_')}</div>}
        </Tile>
        <Tile title="Right to work" icon={BadgeCheck} className="col-span-2 lg:col-span-1" action={isCo && <Button size="sm" variant="ghost" onClick={() => setEdit('rtw')}>Edit</Button>}>
          <div className="mb-3">{o.rtw_verified ? <ExpiryPill date={o.rtw_expiry} missing="Verified, no time limit" /> : <Pill tone="red">Not verified</Pill>}</div>
          <KV items={[
            ['Evidence', o.rtw_type || (o.rtw_verified && <span className="font-semibold text-amber">Not recorded</span>)],
            ['Share code', o.rtw_share_code && <span className="num whitespace-nowrap">{o.rtw_share_code}</span>],
            ['Checked', o.rtw_checked_at
              ? orbRtw ? `By Orb from the uploaded passport${o.id_docs?.find((d) => d.kind === 'id')?.face_against === 'sia' ? ' (photo matched their SIA card)' : ''}, ${date(o.rtw_checked_at)}` : `${o.rtw_method === 'manual' ? 'In person' : 'On GOV.UK'} by ${o.rtw_checked_by_name || 'a manager'}, ${date(o.rtw_checked_at)}`
              : o.rtw_verified ? 'Ticked by hand, no check saved' : 'Not yet'],
            ['Follow-up check', o.rtw_expiry ? `by ${date(o.rtw_expiry)}${c.rtw_days != null ? ` (${c.rtw_days < 0 ? `${-c.rtw_days} days ago` : `in ${c.rtw_days} days`})` : ''}` : o.rtw_verified ? 'Not needed (no time limit)' : null],
          ]} />
          {orbRtw && <Pill tone="amber" className="mt-3 whitespace-normal">Copy only — original not seen in person</Pill>}
          <DocThumbs docs={o.id_docs?.filter((d) => d.kind === 'id')} className="mt-3" />
          {(isCo || (o.rtw_check_doc && !orbRtw)) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {isCo && <Button size="sm" icon={ShieldCheck} onClick={() => setRtwCheck(true)}>{o.rtw_verified ? 'Check again' : 'Check right to work'}</Button>}
              {graceOn('rtw_')}
              {o.rtw_check_doc && !orbRtw && <Button size="sm" variant="secondary" icon={Eye} onClick={() => openUrl(() => api('docs.url', { id: o.rtw_check_doc }))}>View check</Button>}
            </div>
          )}
        </Tile>
      </Bento>
      {c.issues?.length > 0 && (
        <Tile title="Issues" icon={AlertTriangle} className="bg-red-soft">
          <ul className="space-y-1 text-subhead font-semibold text-red">{c.issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </Tile>
      )}
      <Section title="Venue bans" icon={Ban} count={o.bans?.length} action={isCo && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setBan(true)}>Add ban</Button>}>
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
      {edit === 'sia' && <SiaSheet o={o} onClose={() => setEdit(null)} onDone={reload} />}
      {edit === 'rtw' && <RtwSheet o={o} onClose={() => setEdit(null)} onDone={reload} />}
      {rtwCheck && <RtwCheckSheet o={o} onClose={() => setRtwCheck(false)} onDone={reload} />}
      {ban && <BanSheet o={o} onClose={() => setBan(false)} onDone={reload} />}
    </div>
  );
}

function SiaSheet({ o, onClose, onDone }) {
  const { v, bind } = useForm({ sia_number: o.sia_number || '', sia_type: o.sia_type || '', sia_expiry: o.sia_expiry || '' });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('officers.save', { id: o.id, ...v }), 'SIA licence updated');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="SIA licence"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="SIA number" {...bind('sia_number')} />
        <Select label="Licence type" placeholder="Choose" options={SIA_TYPES} {...bind('sia_type')} />
        <Input label="SIA expiry" type="date" {...bind('sia_expiry')} />
      </div>
    </Sheet>
  );
}

// The right to work evidence on the profile, and the document behind it when the officer's own upload went wrong
function RtwSheet({ o, onClose, onDone }) {
  const { v, bind } = useForm({ rtw_type: o.rtw_type || '', rtw_expiry: o.rtw_expiry || '' });
  const [file, setFile] = useState(null);
  const [run, busy] = useAction();
  const types = RTW_TYPES.some((t) => t.value === o.rtw_type) || !o.rtw_type ? RTW_TYPES : [...RTW_TYPES, { value: o.rtw_type, label: o.rtw_type }];
  const save = async () => {
    const d = await run(async () => {
      await api('officers.save', { id: o.id, ...v });
      if (!file) return null;
      const s3_key = await upload(file, 'officer');
      return api('docs.create', { owner_type: 'officer', owner_id: o.id, kind: 'rtw', title: /passport/i.test(v.rtw_type) ? 'Passport' : 'Right to work', s3_key, mime: file.type || null });
    }, file ? 'Right to work updated, Orb is reading the document' : 'Right to work updated');
    // Orb reads it straight away: a British or Irish passport whose photo matches saves its check
    if (d?.s3_key) api('docs.read', { id: d.id }).then(() => onDone()).catch(() => {});
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Right to work"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Evidence" placeholder="Choose" options={types} {...bind('rtw_type')} />
          <Input label="Expiry" type="date" hint="Leave blank if indefinite" {...bind('rtw_expiry')} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-footnote font-semibold text-muted">Their document (optional)</span>
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-subhead file:mr-3 file:rounded-xl file:border-0 file:bg-blue-soft file:px-3 file:py-2 file:font-semibold file:text-blue" />
          <span className="mt-1 block text-caption text-muted">Their passport, residence permit or share code letter, if what they sent was wrong or missing. Something filed under the wrong type can also be moved on the Documents tab.</span>
        </label>
        <p className="text-caption text-muted">To mark right to work as verified, use Check right to work: it saves the GOV.UK check (or your copy of their passport) as your record.</p>
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

export function DocumentsTab({ o, isCo, user, reload, onForbidden }) {
  const isMgr = ['company', 'security'].includes(user?.role);
  const [verifySia, siaSheet] = useSiaVerify(reload);
  const q = useTabApi('docs.list', { owner_type: 'officer', owner_id: o.id }, onForbidden);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const confirm = useConfirm();
  const [run] = useAction();
  const open = (d) => run(() => openUrl(() => api('docs.url', { id: d.id })));
  const verify = async (d) => {
    const msg = d.kind === 'sia' ? 'The licence number and expiry will be copied to the compliance record.' : d.kind === 'rtw' ? 'Marks the upload as seen. To verify right to work, use Check right to work on the Compliance tab.' : 'Mark this document as checked.';
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
                    {d.misfiled_as && <div className="mt-0.5 text-caption font-semibold text-amber">Looks like {d.misfiled_as === 'sia' ? 'an SIA licence card' : 'a passport'}, not {docKindLabel(d.kind).toLowerCase()}{isCo ? ': tap Edit to move it' : ''}</div>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {d.system ? <Pill tone="blue">Saved copy</Pill> : d.verified_at ? <Pill tone="green" className="max-w-[160px] truncate">Verified{d.verified_by_name ? ` · ${d.verified_by_name}` : ''}</Pill> : <Pill tone="amber">Unverified</Pill>}
                    {d.expiry && <ExpiryPill date={d.expiry} />}
                    {d.s3_key && <IconButton icon={Eye} label="Open" onClick={() => open(d)} />}
                    {SIA_CHECK_ON && isMgr && d.kind === 'sia' && <IconButton icon={ShieldCheck} label="Verify on SIA register" onClick={() => verifySia({ id: o.id, sia_number: o.sia_number || d.number })} className="text-blue" />}
                    {isCo && !d.system && !d.verified_at && <IconButton icon={Check} label="Verify" onClick={() => verify(d)} className="text-green" />}
                    {isCo && !d.system && <IconButton icon={Pencil} label="Edit" onClick={() => setEditing(d)} className={d.misfiled_as ? 'text-amber' : undefined} />}
                    {isCo && !d.system && <IconButton icon={Trash2} label="Delete" onClick={() => remove(d)} className="text-red" />}
                  </div>
                </div>
              ))}
            </List>
          ) : <Empty icon={FileText} title="No documents" body="SIA licence, right to work, ID and proof of address will show here." />}
          <OfficerPacks officerId={o.id} />
          {adding && <DocSheet o={o} onClose={() => setAdding(false)} onDone={q.reload} />}
          {editing && <DocEditSheet d={editing} onClose={() => setEditing(null)} onDone={() => { q.reload(); reload(); }} />}
          {SIA_CHECK_ON && siaSheet}
        </>
      )}
    </TabLoad>
  );
}

// Site packs at the venues they work: where they stand, and each signing's sealed PDF
function OfficerPacks({ officerId }) {
  const q = useApi('venuePacks.officer', { officer_id: officerId });
  const [run] = useAction();
  const d = q.data;
  if (!d || (!d.venues.length && !d.signings.length)) return null;
  return (
    <Section title="Site packs" icon={FileSignature}>
      <List>
        {d.venues.map((v) => <Row key={v.venue_id} title={v.name} subtitle="Current status at this venue" right={<PackPill status={v.status} />} />)}
        {d.signings.map((g) => (
          <Row key={g.id} onClick={() => run(() => downloadAction('venuePacks.pdf', { id: g.id })).catch(() => {})} left={<FileSignature size={18} className="text-muted" />}
            title={`Signed: ${g.venue_name}`} subtitle={`${dateTime(g.signed_at)} · ${g.reference}`} right={<Eye size={16} className="text-blue" />} />
        ))}
      </List>
    </Section>
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
    }, 'Document uploaded').then((d) => {
      // Orb reads a licence or passport straight away and applies it to the profile when it all agrees (and moves one sent under the wrong type)
      if (d?.s3_key && ['sia', 'rtw', 'id', 'poa', 'other'].includes(d.kind)) api('docs.read', { id: d.id }).then((r) => (r.applied?.length || r.refiled?.length) && onDone()).catch(() => {});
    });
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

// Put an upload right: the type the officer should have picked, or its title, number and expiry
const EDIT_KINDS = DOC_KINDS.filter((k) => k.value !== 'contract');

function DocEditSheet({ d, onClose, onDone }) {
  const { v, bind, set } = useForm({ kind: d.kind, title: d.title || '', number: d.number || '', expiry: d.expiry || '' });
  const [run, busy] = useAction();
  const moved = v.kind !== d.kind;
  const save = async () => {
    await run(() => api('docs.update', { id: d.id, ...v }), moved ? `Moved to ${docKindLabel(v.kind)}` : 'Document updated');
    onDone();
    onClose();
  };
  const changeKind = (k) => {
    set('kind', k);
    // The default title follows the type; a title someone typed stays
    if (!v.title || DOC_KINDS.some((x) => x.label === v.title) || v.title === 'Passport') set('title', k === 'rtw' && d.ai_read?.is_passport ? 'Passport' : docKindLabel(k));
  };
  return (
    <Sheet open onClose={onClose} title="Edit document" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.title.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {d.misfiled_as && d.misfiled_as !== v.kind && (
          <div className="rounded-2xl bg-amber-soft p-3 text-subhead">
            Orb read this as {d.misfiled_as === 'sia' ? 'an SIA licence card' : 'a passport'}, but it was sent as {docKindLabel(d.kind).toLowerCase()}.
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => changeKind(d.misfiled_as)}>File it as {docKindLabel(d.misfiled_as)}</Button>
          </div>
        )}
        <Select label="Type" options={EDIT_KINDS.some((k) => k.value === d.kind) ? EDIT_KINDS : [{ value: d.kind, label: docKindLabel(d.kind) }, ...EDIT_KINDS]} value={v.kind} onChange={(e) => changeKind(e.target.value)} />
        <Input label="Title" {...bind('title')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={v.kind === 'rtw' ? 'Number or share code' : 'Number'} hint={v.kind === 'sia' ? '16-digit licence number' : undefined} {...bind('number')} />
          <Input label="Expiry" type="date" {...bind('expiry')} />
        </div>
        {moved && ['sia', 'rtw', 'id'].includes(v.kind) && <p className="text-caption text-muted">Orb reads it again as {docKindLabel(v.kind).toLowerCase()} and updates the profile when everything on it agrees.</p>}
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
    { key: 'role_name', mobile: 'title', label: 'Role' },
    { key: 'venue', mobile: 'sub', label: 'Venue', render: (r) => r.venue_name || 'All venues' },
    { key: 'rate', mobile: 'value', label: 'Hourly rate', align: 'right', render: (r) => <span className="num font-semibold">{money(r.rate)}</span> },
    { key: 'from', mobile: 'sub', label: 'From', render: (r) => date(r.effective_from) },
    isCo && { key: 'x', mobile: 'value', label: '', align: 'right', render: (r) => <IconButton icon={Trash2} label="Delete" className="text-red" onClick={(e) => { e.stopPropagation(); del(r); }} /> },
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
      <Segmented className="mb-4" value={view} onChange={setView} options={[{ value: 'upcoming', label: 'Upcoming', icon: CalendarClock }, { value: 'hours', label: 'Hours worked', icon: Clock }]} />
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
            return <Row key={s.id} left={<DateBadge d={s.starts_at} />} title={s.venue_name} subtitle={`${s.role_name} · ${range(s.starts_at, s.ends_at)}`} right={a ? <AssignPill status={a.status} /> : <Pill status={s.status} />} />;
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
              { key: 'day', mobile: 'title', label: 'Date', render: (t) => dayLabel(t.starts_at) },
              { key: 'venue_name', mobile: 'sub', label: 'Venue' },
              { key: 'role_name', mobile: false, label: 'Role' },
              { key: 'times', mobile: 'sub', label: 'Actual', render: (t) => (t.actual_start ? range(t.actual_start, t.actual_end || t.actual_start) : '—') },
              { key: 'hours', mobile: 'value', label: 'Hours', align: 'right', render: (t) => hours(t.hours) },
              { key: 'status', mobile: 'value', label: 'Status', render: (t) => <Pill status={t.status} /> },
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
  useDirtyGuard(dirty);
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
                <Input type="time" value={d.from_time} onChange={(e) => upd(i, 'from_time', e.target.value)} className="w-32" inputClassName="num px-2" aria-label="From" />
                <span className="text-faint">to</span>
                <Input type="time" value={d.to_time} onChange={(e) => upd(i, 'to_time', e.target.value)} className="w-32" inputClassName="num px-2" aria-label="To" />
              </div>
            ) : <span className="text-subhead text-faint">Not available</span>}
          </div>
        ))}
      </List>
      <ActionBar show={dirty || busy} tone="light">
        <span className="mr-2 text-subhead font-semibold">Unsaved changes</span>
        <Button busy={busy} onClick={save}>Save availability</Button>
      </ActionBar>
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

// Where on the profile each step gets done, so an open step is one tap from finishing
const STEP_TAB = {
  profile: 'tab=overview', bank: 'tab=overview', sia: 'tab=compliance&sub=compliance', rtw: 'tab=compliance&sub=compliance', id: 'tab=compliance&sub=documents',
  poa: 'tab=compliance&sub=documents', verified: 'tab=compliance&sub=documents', contract: 'tab=hr&sub=contracts', induction: 'tab=compliance&sub=training',
};

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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Tile title="Progress" icon={ClipboardList}>
              <Stat value={`${tasks.length ? Math.round((done / tasks.length) * 100) : 0}%`} label={`${done} of ${tasks.length} steps done`} />
              <Progress className="mt-4" done={done} total={tasks.length} />
              <div className="mt-4 text-footnote text-muted">Status: <Pill status={o.status} /></div>
              <p className="mt-3 text-caption text-faint">Steps tick automatically when documents are uploaded and contracts signed.</p>
            </Tile>
            <List className="lg:col-span-2">
              {tasks.map((t) => (
                <div key={t.code} className="flex items-center">
                  <Pressable press onClick={() => toggle(t)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-bg">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${t.done ? 'border-green bg-green text-white' : 'border-line'}`}>{t.done && <Check size={14} strokeWidth={3} />}</span>
                    <span className={`flex-1 text-body ${t.done ? 'text-muted line-through' : 'font-semibold'}`}>{t.title}</span>
                    {t.done_at && <span className="text-caption text-faint">{dateShort(t.done_at)}</span>}
                  </Pressable>
                  {!t.done && STEP_TAB[t.code] && <Button size="sm" variant="ghost" className="mr-2" to={`?${STEP_TAB[t.code]}`} replace>{t.code === 'contract' && t.waiting ? 'Issue contract' : 'Do it'}</Button>}
                </div>
              ))}
            </List>
          </div>
        );
      }}
    </TabLoad>
  );
}

/* ---------------- Contracts ---------------- */

/** How the officer is engaged, from the contract in force, and the ways to change it */
function EngagementCard({ o }) {
  const q = useApi('contracts.engagement', { officer_id: o.id });
  const nav = useNavigate();
  const [run, busy] = useAction();
  const [replacing, setReplacing] = useState(false);
  const e = q.data;
  if (!e?.engagement_type && !e?.amendments?.length) return null;
  const c = e.contract;
  const fromPack = c?.source === 'pack';
  const open = (r) => nav(`/company/people/contracts/draft/${r.draft.id}`);
  const amend = (kind) => run(() => api('contracts.amend', { id: c.id, kind })).then(open).catch(() => {});
  const ends = e.contract_end ? Math.ceil((new Date(e.contract_end) - new Date()) / 864e5) : null;
  const items = [
    ['Engaged as', ENGAGEMENT[e.engagement_type] || titleCase(e.engagement_type || '-')],
    ['Contract', c ? `${c.title} (${c.reference})` : '-'],
    ...(e.pack_title ? [['Built from', `${e.pack_title}${c.jurisdiction ? ` · ${JUR_SHORT[c.jurisdiction]}` : ''}`]] : []),
    ['Start', e.contract_start ? date(e.contract_start) : '-'],
    ...(e.contract_end ? [['End', <span className={ends <= 30 ? 'font-semibold text-amber' : ''}>{date(e.contract_end)}{ends < 0 ? ' · ended' : ends <= 30 ? ` · in ${ends} days` : ''}</span>]] : []),
    ...(e.fixed_term_renewals ? [['Renewals', `${e.fixed_term_renewals}${e.fixed_term_renewals >= 3 ? ' · after four years on fixed terms an employee is usually treated as permanent' : ''}`]] : []),
  ];
  return (
    <Tile title="Current contract" icon={FileSignature} className="mb-4"
      action={c && <div className="flex flex-wrap gap-1.5">
        {fromPack && <Button size="sm" variant="soft" busy={busy} onClick={() => amend('variation')}>Vary</Button>}
        {fromPack && e.contract_end && <Button size="sm" variant="soft" busy={busy} onClick={() => amend('extension')}>Extend</Button>}
        <Button size="sm" variant="secondary" busy={busy} onClick={() => (fromPack ? amend('replacement') : setReplacing(true))}>Replace</Button>
      </div>}>
      <KV items={items} />
      {e.agency && (
        <div className="mt-3 rounded-2xl bg-bg p-3.5">
          <div className="flex items-center justify-between gap-2 text-subhead font-semibold">
            <span>Weeks worked toward equal treatment</span>
            <span className="num">{Math.min(e.agency.weeks, e.agency.qualifying_weeks)} of {e.agency.qualifying_weeks}</span>
          </div>
          <Progress value={Math.min(e.agency.weeks, e.agency.qualifying_weeks)} max={e.agency.qualifying_weeks} className="mt-2" />
          <p className="mt-1.5 text-caption text-muted">
            {e.agency.weeks >= e.agency.qualifying_weeks ? 'Qualified: pay and basic conditions should now match a directly recruited officer. ' : ''}
            Weeks with at least one clocked-in shift since the contract started. Breaks of more than six weeks, or a substantially different role, can reset the count; some absences pause it.
          </p>
        </div>
      )}
      {e.amendments?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {e.amendments.map((d) => (
            <Link key={d.id} to={`/company/people/contracts/draft/${d.id}`} className="flex items-center gap-2 rounded-xl bg-blue-soft px-3 py-2 text-footnote">
              <Pill tone="blue">{AMEND_KIND[d.amend_kind]}</Pill><span className="min-w-0 flex-1 truncate">{d.title}</span><span className="font-semibold text-blue">Continue</span>
            </Link>
          ))}
        </div>
      )}
      {replacing && <StartSheet onClose={() => setReplacing(false)} amends={{ id: c.id, title: c.title, reference: c.reference, party: 'person' }} />}
    </Tile>
  );
}

export function ContractsTab({ o, onForbidden }) {
  const q = useTabApi('contracts.list', { officer_id: o.id }, onForbidden);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const confirm = useConfirm();
  const [run] = useAction();
  const voidIt = async (c) => {
    if (!(await confirm({ title: `Void "${c.title}"?`, body: `${c.reference} can no longer be signed. It stays on record marked void.`, confirm: 'Void', danger: true }))) return;
    await run(() => api('contracts.void', { id: c.id }), 'Voided');
    q.reload();
  };
  return (
    <TabLoad q={q}>
      {(rows) => (
        <>
          <EngagementCard o={o} />
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon={FileSignature} onClick={() => setSending(true)}>Send a template</Button>
            <Button icon={Plus} onClick={() => setCreating(true)}>Create contract</Button>
          </div>
          {rows.length ? (
            <List>
              {rows.map((c) => (
                <ContractRow key={c.id} c={c} onView={() => setViewing(c.id)} onVoid={() => voidIt(c)} onDone={q.reload} />
              ))}
            </List>
          ) : <Empty icon={FileSignature} title="No contracts or policies" body="Send a contract or policy for e-signature." />}
          {sending && <SendDocSheet o={o} onClose={() => setSending(false)} onDone={q.reload} />}
          {creating && <StartSheet officer={{ id: o.id, name: `${o.first_name} ${o.last_name}`, sub: o.email }} onClose={() => setCreating(false)} />}
          {viewing && <ContractView id={viewing} onClose={() => setViewing(null)} />}
        </>
      )}
    </TabLoad>
  );
}

/** One issued contract or policy; `who` adds the officer line in the company-wide register */
export function ContractRow({ c, who, onView, onVoid, onDone }) {
  const [run] = useAction();
  const Icon = c.category === 'policy' ? ScrollText : FileSignature;
  const when = c.status === 'signed' ? `Signed by ${c.signed_name} · ${dateTime(c.signed_at)}`
    : c.status === 'sent' ? `Sent ${date(c.sent_at || c.created_at)}${c.opened_at ? ` · opened ${dateTime(c.opened_at)}` : ''}`
      : c.status === 'signed_paper' ? `Signed on paper${c.signed_at ? ` · ${date(c.signed_at)}` : ''}`
        : `Sent ${date(c.sent_at || c.created_at)}`;
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><Icon size={18} /></div>
      <div className="min-w-0 flex-1 basis-48">
        <Pressable press className="block w-full min-w-0 text-left" onClick={onView}>
          <div className="truncate text-body font-semibold">{c.title}{c.template_version > 1 && <span className="font-normal text-muted"> · v{c.template_version}</span>}</div>
        </Pressable>
        {who}
        <div className="truncate text-footnote text-muted"><span className="num">{c.reference}</span> · {when}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <DocPill r={c} />
        <RemindButton type="contract" r={c} onDone={onDone} />
        <Button size="sm" variant="secondary" onClick={() => run(() => downloadAction('contracts.pdf', { id: c.id })).catch(() => {})}>PDF</Button>
        {c.status === 'sent' && <IconButton icon={X} label="Void" onClick={onVoid} />}
      </div>
    </div>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

/* ---------------- Attendance (Orb) ---------------- */

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

          <Section title="Lates and absences" icon={Clock} count={d.events.length}>
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
            ) : <Empty icon={Clock} title="No lates or absences" body="Orb records lates, no-shows and early finishes here automatically." />}
          </Section>

          <Section title="Venue ratings" icon={Star} count={d.ratings.length}>
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
  const [adding, setAdding] = useState(false);
  const openDoc = (d) => openUrl(() => api('docs.url', { id: d.id })).catch(() => {});
  const unassign = async (c) => {
    if (!(await confirm({ title: `Remove ${c.title} from ${o.first_name}'s training?`, confirm: 'Remove' }))) return;
    await run(() => api('academy.unassign', { course_id: c.id, officer_id: o.id }), 'Removed');
    q.reload();
  };
  return (
    <TabLoad q={q}>
      {({ courses, certificates, outside = [] }) => (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            ) : <Empty title="No training yet" body="Assign courses from Training › Courses." />}
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
          <Tile title="Outside certificates" pad={false} className="lg:col-span-2"
            action={<Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding(true)}>Add</Button>}>
            {outside.length ? (
              <List>
                {outside.map((d) => (
                  <Row key={d.id} onClick={d.has_file ? () => openDoc(d) : undefined} left={<Award size={20} className="text-green" />} title={d.title}
                    subtitle={[docKindLabel(d.kind), d.provider, d.issued_on && `Passed ${date(d.issued_on)}`, !d.verified_at && 'Not checked yet'].filter(Boolean).join(' · ')}
                    right={d.expiry ? <ExpiryPill date={d.expiry} /> : <Pill tone="green">No expiry</Pill>} />
                ))}
              </List>
            ) : <Empty title="None on file" body="First aid, CCTV and other courses from outside providers." />}
          </Tile>
          <CertificateSheet open={adding} officerId={o.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); q.reload(); }} />
        </div>
      )}
    </TabLoad>
  );
}
const TRAINING_TONE = { passed: 'green', overdue: 'red', renew: 'amber', expired: 'red', in_progress: 'blue', assigned: 'blue', not_started: 'grey' };

/* ---------------- One-to-ones, goals and pay rises ---------------- */

const GOAL_TONE = { open: 'blue', met: 'green', missed: 'red', dropped: 'grey' };
const GOAL_LABEL = { open: 'Open', met: 'Met', missed: 'Missed', dropped: 'Dropped' };
const AGREEMENT = {
  draft: { label: 'Draft', tone: 'grey' }, sent: { label: 'Waiting for signature', tone: 'amber' }, signed: { label: 'Signed', tone: 'blue' },
  applied: { label: 'In effect', tone: 'green' }, void: { label: 'Withdrawn', tone: 'grey' },
};

export function GrowthTab({ o, isCo, roles, onForbidden }) {
  const q = useTabApi('growth.officer', { officer_id: o.id }, onForbidden);
  const [meeting, setMeeting] = useState(null);
  const [goal, setGoal] = useState(false);
  const [rise, setRise] = useState(false);
  return (
    <TabLoad q={q}>
      {(d) => (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-subhead text-muted">
              <Star size={16} className="fill-amber text-amber" />
              {d.rating.count
                ? <>Venue rating {d.rating.since ? `since ${date(d.rating.since)}` : 'overall'}: <span className="num font-semibold text-ink">{d.rating.avg}</span> from {d.rating.count} rating{d.rating.count === 1 ? '' : 's'}</>
                : `No venue ratings ${d.rating.since ? 'since the last one-to-one' : 'yet'}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Plus} onClick={() => setGoal(true)}>Add goal</Button>
              {isCo && d.can_see_pay && <Button variant="secondary" icon={Plus} onClick={() => setRise(true)}>Add pay rise</Button>}
              <Button icon={Plus} onClick={() => setMeeting({})}>Record one-to-one</Button>
            </div>
          </div>
          <Goals goals={d.goals} onDone={q.reload} />
          {d.can_see_pay && <Agreements rows={d.agreements} isCo={isCo} onDone={q.reload} />}
          <Section title="Meetings" icon={Users} count={d.meetings.length}>
            {d.meetings.length ? (
              <List>
                {d.meetings.map((m) => (
                  <Row key={m.id} onClick={() => setMeeting(m)} chevron
                    title={<>{date(m.held_on)}{m.rating ? <span className="font-normal text-muted"> · {m.rating}/5</span> : null}</>}
                    subtitle={<><span className="line-clamp-2 whitespace-pre-wrap">{m.notes || 'No notes'}</span><span className="text-caption text-faint">{m.manager_name || 'Manager'}{m.shared_with_officer ? ' · shared with officer' : ''}</span></>} />
                ))}
              </List>
            ) : <Empty icon={MessageSquare} title="No one-to-ones yet" body="Record how they are doing, agree goals and link a pay rise to them." />}
          </Section>
          {meeting && <MeetingSheet o={o} m={meeting} onClose={() => setMeeting(null)} onDone={q.reload} />}
          {goal && <GoalSheet o={o} onClose={() => setGoal(false)} onDone={q.reload} />}
          {rise && <RiseSheet o={o} roles={roles} goals={d.goals} onClose={() => setRise(false)} onDone={q.reload} />}
        </>
      )}
    </TabLoad>
  );
}

function Goals({ goals, onDone }) {
  const [run, busy] = useAction();
  const [note, setNote] = useState({});
  const status = (g, s) => run(() => api('goals.setStatus', { id: g.id, status: s }), (r) => (r.applied ? 'Goal met · pay rise applied' : `Goal marked ${GOAL_LABEL[s].toLowerCase()}`)).then(onDone).catch(() => {});
  const add = (g) => run(() => api('goals.addNote', { goal_id: g.id, body: note[g.id] }), 'Note added').then(() => { setNote((n) => ({ ...n, [g.id]: '' })); onDone(); }).catch(() => {});
  return (
    <Section title="Goals" icon={Target} count={goals.length}>
      {goals.length ? (
        <div className="space-y-2">
          {goals.map((g) => (
            <Tile key={g.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-body font-semibold">{g.title}</div>
                  {g.target && <p className="text-subhead text-muted">{g.target}</p>}
                  {g.due_on && <p className="text-footnote text-faint">Due {date(g.due_on)}</p>}
                </div>
                <Pill tone={GOAL_TONE[g.status]}>{GOAL_LABEL[g.status]}</Pill>
              </div>
              {g.notes.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {g.notes.map((n) => (
                    <div key={n.id} className="rounded-xl bg-bg px-3 py-2 text-subhead">
                      <span className="whitespace-pre-wrap">{n.body}</span>
                      <span className="block text-caption text-faint">{n.author_name || 'Someone'} · {dateTime(n.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Input className="flex-1" aria-label="Add a note" placeholder="Add a progress note" value={note[g.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [g.id]: e.target.value }))} />
                <Button variant="secondary" disabled={busy || !(note[g.id] || '').trim()} onClick={() => add(g)}>Add</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.keys(GOAL_LABEL).filter((s) => s !== g.status).map((s) => (
                  <Button key={s} size="sm" variant={s === 'met' ? 'soft' : 'ghost'} disabled={busy} onClick={() => status(g, s)}>{s === 'open' ? 'Reopen' : `Mark ${GOAL_LABEL[s].toLowerCase()}`}</Button>
                ))}
              </div>
            </Tile>
          ))}
        </div>
      ) : <Empty icon={Check} title="No goals" body="Goals agreed in a one-to-one show here. A pay rise can wait on them." />}
    </Section>
  );
}

function Agreements({ rows, isCo, onDone }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const send = (a) => run(() => api('payAgreements.send', { id: a.id }), 'Sent for signature').then(onDone).catch(() => {});
  const voidIt = async (a) => {
    if (!(await confirm({ title: 'Withdraw this pay rise?', body: `${money(a.new_rate)}/h from ${date(a.effective_from)}`, confirm: 'Withdraw', danger: true }))) return;
    run(() => api('payAgreements.void', { id: a.id }), 'Withdrawn').then(onDone).catch(() => {});
  };
  const pdf = (a) => run(() => downloadAction('payAgreements.pdf', { id: a.id })).catch(() => {});
  if (!rows.length) return null;
  return (
    <Section title="Pay rises" icon={PoundSterling} count={rows.length}>
      <List>
        {rows.map((a) => (
          <div key={a.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="num text-body font-semibold">{a.current_rate != null ? `${money(a.current_rate)} → ` : ''}{money(a.new_rate)}/h</div>
                <p className="text-subhead text-muted">{a.role_name} · {a.venue_name || 'All venues'} · from {date(a.effective_from)}</p>
                {a.conditions.length > 0 && <p className="text-footnote text-muted">Once met: {a.conditions.map((g) => `${g.title} (${GOAL_LABEL[g.status].toLowerCase()})`).join(', ')}</p>}
                {a.reference && <p className="num text-caption text-faint">{a.reference}{a.status === 'sent' && a.opened_at ? ` · opened ${dateTime(a.opened_at)}` : ''}</p>}
                {a.signed_at && <p className="text-caption text-faint">Signed by {a.signed_name} · {dateTime(a.signed_at)}</p>}
              </div>
              {a.status === 'sent' ? <DocPill r={a} /> : <Pill tone={AGREEMENT[a.status].tone}>{AGREEMENT[a.status].label}</Pill>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {isCo && a.status === 'draft' && <Button size="sm" icon={FileSignature} disabled={busy} onClick={() => send(a)}>Send to sign</Button>}
              {isCo && <RemindButton type="pay_agreement" r={a} onDone={onDone} />}
              <Button size="sm" variant="ghost" icon={FileText} disabled={busy} onClick={() => pdf(a)}>PDF</Button>
              {isCo && ['draft', 'sent', 'signed'].includes(a.status) && <Button size="sm" variant="link-red" disabled={busy} onClick={() => voidIt(a)}>Withdraw</Button>}
            </div>
          </div>
        ))}
      </List>
    </Section>
  );
}

function MeetingSheet({ o, m, onClose, onDone }) {
  const { v, bind, set } = useForm({ held_on: m.held_on || isoDate(), notes: m.notes || '', rating: m.rating ? String(m.rating) : '', shared_with_officer: !!m.shared_with_officer });
  const [goals, setGoals] = useState([]);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const setGoal = (i, k, val) => setGoals((g) => g.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  const save = () => run(() => api('oneToOnes.save', { id: m.id, officer_id: o.id, ...v, rating: v.rating || null, goals }), 'One-to-one saved').then(() => { onDone(); onClose(); }).catch(() => {});
  const del = async () => {
    if (!(await confirm({ title: 'Delete this one-to-one?', body: 'Goals agreed in it are kept.', confirm: 'Delete', danger: true }))) return;
    run(() => api('oneToOnes.delete', { id: m.id }), 'Deleted').then(() => { onDone(); onClose(); }).catch(() => {});
  };
  return (
    <Sheet open onClose={onClose} title={m.id ? 'One-to-one' : 'Record one-to-one'}
      footer={<>{m.id && <Button variant="link-red" className="mr-auto" disabled={busy} onClick={del}>Delete</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" {...bind('held_on')} />
          <Select label="How are they doing?" placeholder="No rating" options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} out of 5` }))} {...bind('rating')} />
        </div>
        <Textarea label="Notes" rows={6} placeholder="What went well, what to work on, anything they raised" {...bind('notes')} />
        <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.shared_with_officer} onChange={(x) => set('shared_with_officer', x)} label="Share notes with officer" hint="They see them on their Me page and get a notification" /></div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-subhead font-semibold">New goals</span>
            <Button size="sm" variant="ghost" icon={Plus} disabled={goals.length >= 10} onClick={() => setGoals((g) => [...g, { title: '', target: '', due_on: '' }])}>Add goal</Button>
          </div>
          {goals.map((g, i) => (
            <div key={i} className="mb-2 space-y-2 rounded-2xl bg-bg p-3">
              <div className="flex gap-2">
                <Input className="flex-1" aria-label="Goal" placeholder="Goal, e.g. Pass the conflict management course" value={g.title} onChange={(e) => setGoal(i, 'title', e.target.value)} />
                <IconButton icon={X} label="Remove goal" onClick={() => setGoals((x) => x.filter((_, j) => j !== i))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="How we'll know" placeholder="How we'll know (optional)" value={g.target} onChange={(e) => setGoal(i, 'target', e.target.value)} />
                <Input aria-label="Due" type="date" value={g.due_on} onChange={(e) => setGoal(i, 'due_on', e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function GoalSheet({ o, onClose, onDone }) {
  const { v, bind } = useForm({ title: '', target: '', due_on: '' });
  const [run, busy] = useAction();
  const save = () => run(() => api('goals.save', { officer_id: o.id, ...v, due_on: v.due_on || null }), 'Goal added').then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Add goal" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.title.trim()} onClick={save}>Add goal</Button></>}>
      <div className="space-y-4">
        <Input label="Goal" placeholder="e.g. No late clock-ins for 8 weeks" {...bind('title')} />
        <Input label="How we'll know (optional)" {...bind('target')} />
        <Input label="Due (optional)" type="date" {...bind('due_on')} />
      </div>
    </Sheet>
  );
}

function RiseSheet({ o, roles, goals, onClose, onDone }) {
  const venues = useApi('venues.list');
  const { v, bind, set } = useForm({ role: o.roles?.[0] || '', venue_id: '', new_rate: '', effective_from: addDays(isoDate(), 7), condition_goal_ids: [] });
  const [run, busy] = useAction();
  const open = goals.filter((g) => g.status === 'open' || g.status === 'met');
  const toggle = (id) => set('condition_goal_ids', v.condition_goal_ids.includes(id) ? v.condition_goal_ids.filter((x) => x !== id) : [...v.condition_goal_ids, id]);
  const save = () => run(() => api('payAgreements.save', { officer_id: o.id, ...v, new_rate: Number(v.new_rate), venue_id: v.venue_id || null }), 'Draft saved · send it when ready').then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Add pay rise"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.role || !(Number(v.new_rate) > 0) || !v.effective_from} onClick={save}>Save draft</Button></>}>
      <div className="space-y-4">
        <p className="text-subhead text-muted">{o.first_name} signs it in the app. It goes into their pay from the start date, once any goals you tick are met.</p>
        <Select label="Role" placeholder="Choose role" options={roles.filter((r) => !o.roles?.length || o.roles.includes(r.code)).map((r) => ({ value: r.code, label: r.name }))} {...bind('role')} />
        <Select label="Venue" placeholder="All venues" options={(venues.data || []).map((x) => ({ value: x.id, label: x.name }))} {...bind('venue_id')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="New rate per hour (£)" type="number" step="0.01" min="0" inputMode="decimal" {...bind('new_rate')} />
          <Input label="Starts" type="date" {...bind('effective_from')} />
        </div>
        <div>
          <div className="mb-1.5 text-subhead font-semibold">Only once these goals are met</div>
          {open.length ? (
            <div className="rounded-2xl bg-bg px-4 py-1">
              {open.map((g) => <Toggle key={g.id} checked={v.condition_goal_ids.includes(g.id)} onChange={() => toggle(g.id)} label={g.title} hint={g.status === 'met' ? 'Already met' : g.due_on ? `Due ${date(g.due_on)}` : undefined} />)}
            </div>
          ) : <p className="text-footnote text-muted">No open goals. Add one first to make the rise conditional.</p>}
        </div>
      </div>
    </Sheet>
  );
}
