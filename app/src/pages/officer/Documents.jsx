import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, BookOpenCheck, Camera, Clock3, ExternalLink, Eye, FileText, Paperclip, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, cx, date, daysUntil, Empty, Input, List, Load, Page, Pill, Pressable, Row, Section, Select, Sheet, useAction, useApi, useConfirm, useToast } from '../../ui/index.jsx';
import { viewFiles } from '../../ui/FileViewer.jsx';
import { PackPill } from '../shared/PackPaper.jsx';
import { compressImage, DOC_KINDS, docKindLabel, expiryText, expiryTone, NotLinked } from './_parts.jsx';

const NEEDS_EXPIRY = new Set(['sia', 'first_aid', 'cctv', 'id']);
const TRAINING = new Set(['first_aid', 'cctv', 'training']);
const NEEDS_NUMBER = new Set(['sia', 'id', 'rtw']);
const NUMBER_LABEL = { sia: 'Licence number', id: 'Document number', rtw: 'Share code' };
const isShareCode = (s) => /^W[A-Z0-9]{8}$/.test(String(s || '').toUpperCase().replace(/[\s-]+/g, ''));

export default function Documents() {
  const { user } = useAuth();
  // ?add=sia (from a Home warning) opens the upload sheet on that document straight away
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(() => (DOC_KINDS.some((k) => k.value === params.get('add')) ? params.get('add') : null));
  const q = useApi('docs.list', { owner_type: 'officer', owner_id: user.officer_id }, { skip: !user.officer_id });
  if (!user.officer_id) return <Page title="Documents and licence" back={{ to: '/officer/me', label: 'Me' }}><NotLinked /></Page>;

  return (
    <Page title="Documents and licence" back={{ to: '/officer/me', label: 'Me' }} actions={<Button icon={Plus} onClick={() => setAdding('sia')}>Add</Button>}>
      <Load q={q} skeleton="rows">
        {(rows) => {
          const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
          const warn = rows.filter((d) => d.expiry && daysUntil(d.expiry) <= 30);
          // The quick adds show only for a licence or right to work still missing or running out; Add covers the rest
          const quick = [{ kind: 'sia', icon: ShieldCheck, label: 'SIA licence' }, { kind: 'rtw', icon: BadgeCheck, label: 'Right to work' }]
            .filter((k) => !rows.some((d) => d.kind === k.kind && !warn.includes(d)));
          return (
            <div className="space-y-3">
              {warn.length > 0 && (
                <div className="rounded-2xl bg-amber-soft px-4 py-3 text-subhead font-semibold text-amber">
                  {warn.length === 1 ? `${warn[0].title}: ${expiryText(daysUntil(warn[0].expiry)).toLowerCase()}.` : `${warn.length} documents have expired or expire within 30 days.`} Upload a new copy to stay compliant.
                </div>
              )}
              {quick.length > 0 && <div className="grid grid-cols-2 gap-2">
                {quick.map((k) => <QuickAdd key={k.kind} icon={k.icon} label={k.label} onClick={() => setAdding(k.kind)} />)}
              </div>}
              {!rows.length ? (
                <Empty icon={FileText} title="No documents yet" body="Upload a photo of your SIA licence and right-to-work proof so the office can verify you." />
              ) : (
                <div className="space-y-2">{sorted.map((d) => <DocCard key={d.id} d={d} reload={q.reload} />)}</div>
              )}
              <p className="px-1 text-footnote text-muted">The office checks each document. Once verified, only the office can remove it.</p>
              <SitePacks />
            </div>
          );
        }}
      </Load>
      <AddSheet kind={adding} onClose={() => setAdding(null)} ownerId={user.officer_id} onDone={() => { setAdding(null); q.reload(); }} />
    </Page>
  );
}

// Every venue's site pack: what still needs signing, and the signed copies
function SitePacks() {
  const q = useApi('venuePacks.myList', {});
  const venues = q.data?.venues || [];
  if (!venues.length) return null;
  return (
    <Section title="Site packs" icon={BookOpenCheck} count={venues.length}>
      <List>
        {venues.map((v) => (
          <Row key={v.venue_id} to={`/officer/venue-pack/${v.venue_id}`} title={v.name}
            subtitle={v.signed_at ? `Signed ${date(v.signed_at)} · ${v.reference}` : v.next_shift ? `Sign before ${date(v.next_shift)}` : 'Not signed'}
            right={<PackPill status={v.status} />} />
        ))}
      </List>
    </Section>
  );
}

const rank = (d) => {
  const n = daysUntil(d.expiry);
  return n == null ? 1000 : n;
};

function QuickAdd({ icon: I, label, onClick }) {
  return (
    <Pressable card onClick={onClick} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 shadow-tile">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-soft text-blue"><I size={20} /></span>
      <span className="min-w-0"><span className="block text-body font-semibold leading-tight">{label}</span><span className="text-caption text-muted">Upload</span></span>
    </Pressable>
  );
}

function DocCard({ d, reload }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const days = daysUntil(d.expiry);
  const tone = expiryTone(days);
  const open = () => viewFiles([{ name: d.title, mime: d.mime, load: () => api('docs.url', { id: d.id }) }]);
  const del = async () => {
    if (await confirm({ title: 'Delete document?', body: `${d.title} will be removed.`, confirm: 'Delete', danger: true })) {
      run(() => api('docs.delete', { id: d.id }), 'Document deleted').then(reload).catch(() => {});
    }
  };
  return (
    <div className="rounded-tile bg-surface p-4 shadow-tile">
      <div className="flex items-start gap-3">
        <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl', d.verified_at || d.system ? 'bg-green-soft text-green' : 'bg-bg text-muted')}>
          {d.verified_at && !d.system ? <BadgeCheck size={24} /> : <FileText size={24} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-callout font-semibold">{d.title}</div>
          <div className="truncate text-footnote text-muted">{docKindLabel(d.kind)}{d.number ? ` · ${d.number}` : ''}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {d.system ? <Pill tone="blue">Saved copy</Pill> : d.auto_applied_at ? <Pill tone="green">Checked by Orb</Pill> : d.verified_at ? <Pill tone="green">Verified</Pill> : <Pill tone="grey"><Clock3 size={14} />Awaiting check</Pill>}
            {d.expiry && <Pill tone={tone}>{days < 0 || days <= 60 ? expiryText(days) : `Expires ${date(d.expiry)}`}</Pill>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {d.s3_key && <Button variant="secondary" size="sm" icon={Eye} className="flex-1" disabled={busy} onClick={open}>View</Button>}
        {!d.verified_at && !d.system && <Button variant="ghost" size="sm" icon={Trash2} className="text-red" disabled={busy} onClick={del}>Delete</Button>}
      </div>
    </div>
  );
}

function AddSheet({ kind, onClose, ownerId, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ kind: 'sia', title: '', number: '', expiry: '', provider: '', issued_on: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [last, setLast] = useState(null);
  const [run, busy] = useAction();
  const cam = useRef(null);
  const pick = useRef(null);

  // Reset the form each time the sheet opens
  if (kind && kind !== last) {
    setLast(kind);
    setV({ kind, title: '', number: '', expiry: '', provider: '', issued_on: '' });
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
  const rtw = v.kind === 'rtw';
  const codeBad = rtw && v.number.trim() && !isShareCode(v.number);
  // Right to work: a share code on its own is enough; the office checks it on GOV.UK
  const ok = (file || (rtw && isShareCode(v.number))) && !codeBad && (!needsExpiry || v.expiry) && (v.kind !== 'other' || v.title.trim());
  const save = () => run(async () => {
    const key = file ? await upload(file, 'officer') : null;
    return api('docs.create', {
      owner_type: 'officer', owner_id: ownerId, kind: v.kind, title: v.title.trim() || (rtw && !file ? 'Right to work share code' : docKindLabel(v.kind)),
      number: v.number.trim(), expiry: v.expiry || null, s3_key: key, mime: file?.type || null,
      ...(TRAINING.has(v.kind) ? { provider: v.provider.trim() || null, issued_on: v.issued_on || null } : {}),
    });
  }, 'Uploaded — Orb is checking it').then((d) => {
    onDone();
    // Orb reads a licence or passport straight away and adds it to the profile when it all agrees
    if (d?.s3_key && ['sia', 'rtw', 'id', 'poa', 'other'].includes(d.kind)) {
      api('docs.read', { id: d.id }).then((r) => {
        if (r.applied?.length) { toast(r.applied.includes('sia') ? 'Checked — your SIA licence is on your profile' : 'Checked — your right to work is confirmed'); onDone(); }
        // Sent under the wrong type: Orb moved it to the right one
        else if (r.refiled?.length) { toast(r.refiled[0] === 'sia' ? 'That was your SIA licence, so Orb filed it there' : 'That was your passport, so Orb filed it under Right to work'); onDone(); }
      }).catch(() => {});
    }
  }).catch(() => {});

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
            <div className="min-w-0 flex-1"><div className="truncate text-subhead font-semibold">{file.name}</div><div className="text-caption text-muted">{Math.round(file.size / 1024)} KB</div></div>
            <Button variant="ghost" size="sm" onClick={() => { setFile(null); setPreview(null); }}>Change</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" icon={Camera} onClick={() => cam.current?.click()}>Take photo</Button>
            <Button size="lg" variant="secondary" icon={Paperclip} onClick={() => pick.current?.click()}>Choose file</Button>
          </div>
        )}
        {(v.kind === 'other' || v.kind === 'training') && <Input label="Title" value={v.title} onChange={set('title')} placeholder={v.kind === 'training' ? 'e.g. Physical intervention' : 'What is it?'} />}
        {TRAINING.has(v.kind) && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Training provider" value={v.provider} onChange={set('provider')} placeholder="e.g. St John Ambulance" />
            <Input label="Date passed" type="date" value={v.issued_on} onChange={set('issued_on')} />
          </div>
        )}
        {NEEDS_NUMBER.has(v.kind) && <Input label={NUMBER_LABEL[v.kind]} value={v.number} onChange={set('number')} autoCapitalize="characters"
          placeholder={rtw ? 'W12 345 678' : undefined} error={codeBad ? 'A share code has 9 letters and numbers and starts with W' : undefined}
          hint={rtw ? 'British or Irish passport? Leave this blank and add a photo of it instead.' : undefined} />}
        {rtw && (
          <a href="https://www.gov.uk/prove-right-to-work" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-subhead font-semibold text-blue">
            <ExternalLink size={16} /> Get a share code on GOV.UK
          </a>
        )}
        {!rtw && <Input label={needsExpiry ? 'Expiry date' : 'Expiry date (optional)'} type="date" value={v.expiry} onChange={set('expiry')} />}
      </div>
    </Sheet>
  );
}
