import { useRef, useState } from 'react';
import { BadgeCheck, Camera, Clock3, ExternalLink, FileText, Paperclip, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, cx, date, daysUntil, Empty, Input, Load, Page, Pill, Select, Sheet, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { compressImage, DOC_KINDS, docKindLabel, expiryText, expiryTone, NotLinked } from './_parts.jsx';

const NEEDS_EXPIRY = new Set(['sia', 'first_aid', 'id']);
const NEEDS_NUMBER = new Set(['sia', 'id', 'rtw']);
const NUMBER_LABEL = { sia: 'Licence number', id: 'Document number', rtw: 'Share code (if any)' };

export default function Documents() {
  const { user } = useAuth();
  const [adding, setAdding] = useState(null);
  const q = useApi('docs.list', { owner_type: 'officer', owner_id: user.officer_id }, { skip: !user.officer_id });
  if (!user.officer_id) return <Page title="Documents" back={{ to: '/officer/me', label: 'Me' }}><NotLinked /></Page>;

  return (
    <Page title="Documents" back={{ to: '/officer/me', label: 'Me' }} actions={<Button icon={Plus} onClick={() => setAdding('sia')}>Add</Button>}>
      <Load q={q}>
        {(rows) => {
          const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
          const warn = rows.filter((d) => d.expiry && daysUntil(d.expiry) <= 30);
          return (
            <div className="space-y-3">
              {warn.length > 0 && (
                <div className="rounded-2xl bg-amber-soft px-4 py-3 text-[14px] font-semibold text-amber">
                  {warn.length === 1 ? `${warn[0].title}: ${expiryText(daysUntil(warn[0].expiry)).toLowerCase()}.` : `${warn.length} documents have expired or expire within 30 days.`} Upload a new copy to stay compliant.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <QuickAdd icon={ShieldCheck} label="SIA licence" onClick={() => setAdding('sia')} />
                <QuickAdd icon={BadgeCheck} label="Right to work" onClick={() => setAdding('rtw')} />
              </div>
              {!rows.length ? (
                <Empty icon={FileText} title="No documents yet" body="Upload a photo of your SIA licence and right-to-work proof so the office can verify you." />
              ) : (
                <div className="space-y-2">{sorted.map((d) => <DocCard key={d.id} d={d} reload={q.reload} />)}</div>
              )}
              <p className="px-1 text-[13px] text-muted">The office checks each document. Once verified, only the office can remove it.</p>
            </div>
          );
        }}
      </Load>
      <AddSheet kind={adding} onClose={() => setAdding(null)} ownerId={user.officer_id} onDone={() => { setAdding(null); q.reload(); }} />
    </Page>
  );
}

const rank = (d) => {
  const n = daysUntil(d.expiry);
  return n == null ? 1000 : n;
};

function QuickAdd({ icon: I, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left shadow-tile transition active:scale-[0.98]">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-soft text-blue"><I size={20} /></span>
      <span className="min-w-0"><span className="block text-[15px] font-semibold leading-tight">{label}</span><span className="text-[12px] text-muted">Upload</span></span>
    </button>
  );
}

function DocCard({ d, reload }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const days = daysUntil(d.expiry);
  const tone = expiryTone(days);
  const open = () => {
    const w = window.open('', '_blank');
    run(() => api('docs.url', { id: d.id })).then((r) => { if (w) w.location.href = r.url; else window.location.href = r.url; }).catch(() => w?.close());
  };
  const del = async () => {
    if (await confirm({ title: 'Delete document?', body: `${d.title} will be removed.`, confirm: 'Delete', danger: true })) {
      run(() => api('docs.delete', { id: d.id }), 'Document deleted').then(reload).catch(() => {});
    }
  };
  return (
    <div className="rounded-tile bg-surface p-4 shadow-tile">
      <div className="flex items-start gap-3">
        <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', d.verified_at ? 'bg-green-soft text-green' : 'bg-bg text-muted')}>
          {d.verified_at ? <BadgeCheck size={22} /> : <FileText size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{d.title}</div>
          <div className="truncate text-[13px] text-muted">{docKindLabel(d.kind)}{d.number ? ` · ${d.number}` : ''}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {d.verified_at ? <Pill tone="green">Verified</Pill> : <Pill tone="grey"><Clock3 size={12} />Awaiting check</Pill>}
            {d.expiry && <Pill tone={tone}>{days < 0 || days <= 60 ? expiryText(days) : `Expires ${date(d.expiry)}`}</Pill>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {d.s3_key && <Button variant="secondary" size="sm" icon={ExternalLink} className="flex-1" disabled={busy} onClick={open}>Open</Button>}
        {!d.verified_at && <Button variant="ghost" size="sm" icon={Trash2} className="text-red" disabled={busy} onClick={del}>Delete</Button>}
      </div>
    </div>
  );
}

function AddSheet({ kind, onClose, ownerId, onDone }) {
  const [v, setV] = useState({ kind: 'sia', title: '', number: '', expiry: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [last, setLast] = useState(null);
  const [run, busy] = useAction();
  const cam = useRef(null);
  const pick = useRef(null);

  // Reset the form each time the sheet opens
  if (kind && kind !== last) {
    setLast(kind);
    setV({ kind, title: '', number: '', expiry: '' });
    setFile(null);
    setPreview(null);
  }
  if (!kind && last) setLast(null);

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const choose = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const c = await compressImage(f, 2000, 0.85);
    setFile(c);
    setPreview(c.type.startsWith('image/') ? URL.createObjectURL(c) : null);
  };
  const needsExpiry = NEEDS_EXPIRY.has(v.kind);
  const ok = file && (!needsExpiry || v.expiry) && (v.kind !== 'other' || v.title.trim());
  const save = () => run(async () => {
    const key = await upload(file, 'officer');
    return api('docs.create', {
      owner_type: 'officer', owner_id: ownerId, kind: v.kind, title: v.title.trim() || docKindLabel(v.kind),
      number: v.number.trim(), expiry: v.expiry || null, s3_key: key, mime: file.type || null,
    });
  }, 'Uploaded. The office will check it.').then(onDone).catch(() => {});

  return (
    <Sheet open={!!kind} onClose={onClose} title="Add document" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Upload} busy={busy} disabled={!ok} onClick={save}>Upload</Button></>}>
      <div className="space-y-3">
        <Select label="Type" options={DOC_KINDS} value={v.kind} onChange={set('kind')} />
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={choose} />
        <input ref={pick} type="file" accept="image/*,application/pdf" className="hidden" onChange={choose} />
        {file ? (
          <div className="flex items-center gap-3 rounded-2xl bg-bg p-3">
            {preview ? <img src={preview} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-xl bg-surface text-muted"><FileText size={26} /></span>}
            <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold">{file.name}</div><div className="text-[12px] text-muted">{Math.round(file.size / 1024)} KB</div></div>
            <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreview(null); }}>Change</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" icon={Camera} onClick={() => cam.current?.click()}>Take photo</Button>
            <Button size="lg" variant="secondary" icon={Paperclip} onClick={() => pick.current?.click()}>Choose file</Button>
          </div>
        )}
        {(v.kind === 'other' || v.kind === 'training') && <Input label="Title" value={v.title} onChange={set('title')} placeholder={v.kind === 'training' ? 'e.g. Physical intervention' : 'What is it?'} />}
        {NEEDS_NUMBER.has(v.kind) && <Input label={NUMBER_LABEL[v.kind]} value={v.number} onChange={set('number')} autoCapitalize="characters" />}
        <Input label={needsExpiry ? 'Expiry date' : 'Expiry date (optional)'} type="date" value={v.expiry} onChange={set('expiry')}
          hint={v.kind === 'rtw' ? 'Leave blank only if your right to work has no end date' : undefined} />
      </div>
    </Sheet>
  );
}
