// Training hub parts: staff training records, refreshers due and the outside-certificate upload sheet
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Bell, Camera, FileText, GraduationCap, Paperclip, Plus, RotateCcw } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { compressImage } from '../officer/_parts.jsx';
import {
  Avatar, Button, cx, date, Empty, Input, List, Load, Pill, Row, SearchInput, Segmented, Select, Sheet, useAction, useApi,
} from '../../ui/index.jsx';
import { AssignSheet } from './_parts.jsx';

export const CERT_KINDS = [
  { value: 'first_aid', label: 'First aid' },
  { value: 'cctv', label: 'CCTV' },
  { value: 'training', label: 'Other course' },
];
const KIND_LABEL = { first_aid: 'First aid', cctv: 'CCTV', training: 'Training', academy: 'Academy' };

// "Expired", "12 days left" or "Valid to 3 Mar 2027"
export function ExpiryTag({ days, on }) {
  if (on == null) return <Pill tone="grey">No expiry</Pill>;
  if (days < 0) return <Pill tone="red">Expired {date(on)}</Pill>;
  if (days <= 30) return <Pill tone="amber">{days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`}</Pill>;
  if (days <= 60) return <Pill tone="blue">Ends {date(on)}</Pill>;
  return <Pill tone="green">Valid to {date(on)}</Pill>;
}

// Add a certificate from an outside provider (first aid, CCTV, any other course). officerId fixed, or picked from a list.
export function CertificateSheet({ open, onClose, onDone, officerId }) {
  const [v, setV] = useState({ officer_id: officerId || '', kind: 'first_aid', title: '', provider: '', issued_on: '', expiry: '' });
  const [file, setFile] = useState(null);
  const [run, busy] = useAction();
  const cam = useRef(null);
  const pick = useRef(null);
  const officers = useApi('officers.list', { status: 'active' }, { skip: !open || !!officerId });
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const choose = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setFile(f.type.startsWith('image/') ? await compressImage(f, 2000, 0.85) : f);
  };
  const title = v.title.trim() || (v.kind === 'first_aid' ? 'First aid certificate' : v.kind === 'cctv' ? 'CCTV certificate' : '');
  const ok = (officerId || v.officer_id) && title && v.expiry !== undefined;
  const save = () => run(async () => {
    const key = file ? await upload(file, 'officer') : null;
    return api('docs.create', {
      owner_type: 'officer', owner_id: officerId || v.officer_id, kind: v.kind, title, provider: v.provider.trim() || null,
      issued_on: v.issued_on || null, expiry: v.expiry || null, s3_key: key, mime: file?.type || null,
    });
  }, 'Certificate added').then(() => { setFile(null); setV((s) => ({ ...s, title: '', provider: '', issued_on: '', expiry: '' })); onDone?.(); }).catch(() => {});

  return (
    <Sheet open={open} onClose={onClose} title="Add a training certificate" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Award} busy={busy} disabled={!ok} onClick={save}>Add certificate</Button></>}>
      <div className="space-y-3">
        {!officerId && (
          <Select label="Staff member" placeholder="Choose…" value={v.officer_id} onChange={set('officer_id')}
            options={(officers.data || []).map((o) => ({ value: o.id, label: o.name || `${o.first_name} ${o.last_name}` }))} />
        )}
        <div>
          <div className="mb-1.5 text-subhead font-semibold">Type</div>
          <Segmented full value={v.kind} onChange={set('kind')} options={CERT_KINDS} />
        </div>
        <Input label={v.kind === 'training' ? 'Course name' : 'Course name (optional)'} value={v.title} onChange={set('title')}
          placeholder={v.kind === 'first_aid' ? 'e.g. Emergency First Aid at Work' : v.kind === 'cctv' ? 'e.g. Level 2 CCTV Operations' : 'e.g. Physical intervention'} />
        <Input label="Training provider" value={v.provider} onChange={set('provider')} placeholder="e.g. St John Ambulance" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date passed" type="date" value={v.issued_on} onChange={set('issued_on')} />
          <Input label="Expiry date" type="date" value={v.expiry} onChange={set('expiry')} hint="Blank if it never runs out" />
        </div>
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={choose} />
        <input ref={pick} type="file" accept="image/*,application/pdf" className="hidden" onChange={choose} />
        {file ? (
          <div className="flex items-center gap-3 rounded-2xl bg-bg p-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface text-muted"><FileText size={24} /></span>
            <div className="min-w-0 flex-1 truncate text-subhead font-semibold">{file.name}</div>
            <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={Camera} onClick={() => cam.current?.click()}>Photo</Button>
            <Button variant="secondary" icon={Paperclip} onClick={() => pick.current?.click()}>File</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// One row per member of staff: what they hold, what is running out and what is still to do
export function StaffRecords() {
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useApi('academy.staffRecords');
  const [find, setFind] = useState('');
  const [show, setShow] = useState('all');
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find someone" className="min-w-[200px] flex-1" />
        <Segmented value={show} onChange={setShow} options={[{ value: 'all', label: 'Everyone' }, { value: 'action', label: 'Needs action' }]} />
        <Button icon={Plus} onClick={() => setAdding(true)}>Add certificate</Button>
      </div>
      <Load q={q} skeleton="rows">
        {(rows) => {
          const list = rows.filter((r) => `${r.officer.first_name} ${r.officer.last_name}`.toLowerCase().includes(find.trim().toLowerCase()))
            .filter((r) => show === 'all' || r.expired || r.expiring || r.overdue);
          if (!list.length) return <Empty icon={GraduationCap} title={show === 'action' ? 'Nothing needs action' : 'Nobody found'} />;
          return (
            <List>
              {list.map((r) => {
                const name = `${r.officer.first_name} ${r.officer.last_name}`;
                return (
                  <Row key={r.officer.id} chevron onClick={() => nav(`/${user.role}/staff/${r.officer.id}?tab=training`)}
                    left={<Avatar name={name} src={[r.officer.photo_thumb_url, r.officer.photo_url]} size={40} />}
                    title={name}
                    subtitle={(
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.certificates.length ? r.certificates.slice(0, 5).map((c) => (
                          <span key={`${c.source}${c.id}`} className={cx('rounded-full px-2 py-0.5 text-caption2 font-semibold',
                            c.days_left == null || c.days_left > 60 ? 'bg-green-soft text-green' : c.days_left < 0 ? 'bg-red-soft text-red' : c.days_left <= 30 ? 'bg-amber-soft text-amber' : 'bg-blue-soft text-blue')}>
                            {c.source === 'academy' ? c.title : KIND_LABEL[c.kind] === 'Training' ? c.title : KIND_LABEL[c.kind]}
                          </span>
                        )) : <span className="text-caption text-muted">No certificates yet</span>}
                        {r.certificates.length > 5 && <span className="text-caption2 text-muted">+{r.certificates.length - 5}</span>}
                      </span>
                    )}
                    right={(
                      <div className="flex flex-col items-end gap-1">
                        {r.expired > 0 && <Pill tone="red">{r.expired} expired</Pill>}
                        {r.expiring > 0 && <Pill tone="amber">{r.expiring} ending soon</Pill>}
                        {r.overdue > 0 && <Pill tone="red">{r.overdue} overdue</Pill>}
                        {!r.expired && !r.expiring && !r.overdue && (r.todo.length ? <Pill tone="blue">{r.todo.length} to do</Pill> : <Pill tone="green">Up to date</Pill>)}
                      </div>
                    )} />
                );
              })}
            </List>
          );
        }}
      </Load>
      <CertificateSheet open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); q.reload(); }} />
    </>
  );
}

// Everything that has run out or runs out soon, from the Academy and outside providers
export function Refreshers() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [within, setWithin] = useState('60');
  const q = useApi('academy.refreshersDue', { days: Number(within) });
  const [assign, setAssign] = useState(null);
  const [run, busy] = useAction();
  const remind = (c) => run(() => api('academy.remindRefresher', { source: c.source, id: c.id }), `Reminder sent to ${c.officer.first_name}`).catch(() => {});
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-subhead text-muted">Certificates that have run out or will soon. Renewals clear from this list once the new certificate is in.</p>
        <Segmented value={within} onChange={setWithin} options={[{ value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: '90', label: '90 days' }]} />
      </div>
      <Load q={q} skeleton="rows">
        {(rows) => (!rows.length ? <Empty icon={Award} title="No refreshers due" body={`Nothing runs out in the next ${within} days.`} /> : (
          <List>
            {rows.map((c) => {
              const name = `${c.officer.first_name} ${c.officer.last_name}`;
              return (
                <Row key={`${c.source}${c.id}`}
                  left={<Avatar name={name} src={[c.officer.photo_thumb_url, c.officer.photo_url]} size={40} />}
                  title={<>{name} <span className="font-normal text-muted">· {c.title}</span></>}
                  subtitle={<>{c.source === 'academy' ? 'Academy course' : `${KIND_LABEL[c.kind]}${c.provider ? ` · ${c.provider}` : ''}`}<span className="mt-1 block"><ExpiryTag days={c.days_left} on={c.expires_on} /></span></>}
                  right={(
                    <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                      {c.source === 'academy' && <Button size="sm" variant="soft" icon={RotateCcw} onClick={() => setAssign(c)}>Assign refresher</Button>}
                      <Button size="sm" variant="ghost" icon={Bell} disabled={busy} onClick={() => remind(c)}>Remind</Button>
                      <Button size="sm" variant="link" onClick={() => nav(`/${user.role}/staff/${c.officer_id}?tab=training`)}>Profile</Button>
                    </div>
                  )} />
              );
            })}
          </List>
        ))}
      </Load>
      {assign && <AssignSheet open courseId={assign.course_id} preset={{ target: 'officers', ids: [assign.officer_id], due_date: assign.expires_on }} onClose={() => setAssign(null)} onDone={() => { setAssign(null); q.reload(); }} />}
    </>
  );
}
