// The venue ban register: cards, the add/edit sheet and the confirm/revoke actions, shared by officers, managers and venues
import { useRef, useState } from 'react';
import { Ban, Camera, Check, Pencil, X } from 'lucide-react';
import { api, upload } from '../../api.js';
import { compressImage } from '../officer/_parts.jsx';
import {
  addDays, Button, date, Empty, Input, isoDate, Lightbox, Pill, Segmented, Sheet, Textarea, useAction, useConfirm, Pressable,
} from '../../ui/index.jsx';

export const BAN_STATUS = {
  proposed: { label: 'To confirm', tone: 'amber' },
  active: { label: 'Banned', tone: 'red' },
  lapsed: { label: 'Ended', tone: 'grey' },
  revoked: { label: 'Lifted', tone: 'grey' },
  rejected: { label: 'Not confirmed', tone: 'grey' },
};

export const banLength = (b) => (b.ends_on ? `${date(b.starts_on)} – ${date(b.ends_on)}` : `Permanent from ${date(b.starts_on)}`);

// canConfirm: may approve proposals; canManage: may edit and lift active bans
export function BanCard({ b, canConfirm, canManage, onChanged, onEdit }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [photo, setPhoto] = useState(false);
  const st = BAN_STATUS[b.status] || BAN_STATUS.active;
  const decide = (approve) => run(() => api('bans.confirm', { id: b.id, approve }), approve ? 'Ban confirmed' : 'Ban not confirmed').then(onChanged).catch(() => {});
  const revoke = async () => {
    if (!(await confirm({ title: `Lift the ban on ${b.name || 'this person'}?`, body: 'They can come back in. The record stays in the register.', confirm: 'Lift ban', danger: true }))) return;
    run(() => api('bans.revoke', { id: b.id }), 'Ban lifted').then(onChanged).catch(() => {});
  };
  return (
    <div className="rounded-tile border border-black/[0.04] bg-surface p-4 shadow-tile">
      <div className="flex items-start gap-3">
        {b.photo_url ? (
          <Pressable press onClick={() => setPhoto(true)} className="pressable h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-bg" aria-label="View photo">
            <img src={b.photo_url} alt="" className="h-full w-full object-cover" />
          </Pressable>
        ) : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-red-soft text-red"><Ban size={24} /></div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 truncate text-headline font-bold">{b.name || 'Name not known'}</div>
            <Pill tone={st.tone}>{st.label}</Pill>
          </div>
          {b.description && <p className="mt-0.5 text-subhead text-muted">{b.description}</p>}
          <p className="mt-1 text-subhead">{b.reason}</p>
          <p className="num mt-1 text-footnote text-muted">{banLength(b)}{b.proposed_by_name ? ` · by ${b.proposed_by_name}` : ''}</p>
          {b.status === 'revoked' && b.revoked_reason && <p className="mt-1 text-footnote text-muted">Lifted: {b.revoked_reason}</p>}
        </div>
      </div>
      {b.status === 'proposed' && canConfirm && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={X} busy={busy} onClick={() => decide(false)}>Don't ban</Button>
          <Button variant="danger" icon={Check} busy={busy} onClick={() => decide(true)}>Confirm ban</Button>
        </div>
      )}
      {b.status === 'active' && canManage && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit?.(b)}>Edit</Button>
          <Button size="sm" variant="link-red" onClick={revoke} disabled={busy}>Lift ban</Button>
        </div>
      )}
      <Lightbox photos={b.photo_url ? [{ url: b.photo_url, name: b.name }] : []} index={photo ? 0 : null} onClose={() => setPhoto(false)} />
    </div>
  );
}

const LENGTHS = [
  { value: '1', label: 'Tonight' }, { value: '30', label: '1 month' }, { value: '180', label: '6 months' }, { value: 'custom', label: 'Pick date' }, { value: 'perm', label: 'Permanent' },
];

// Add (shift_id → bans.propose, else venue_id → bans.create) or edit (ban → bans.update)
export function BanSheet({ open, onClose, onDone, shiftId, venueId, ban, direct }) {
  const today = isoDate();
  const [f, setF] = useState(() => ({
    name: ban?.name || '', description: ban?.description || '', reason: ban?.reason || '',
    starts_on: ban?.starts_on?.slice(0, 10) || today, length: ban ? (ban.ends_on ? 'custom' : 'perm') : '30', ends_on: ban?.ends_on?.slice(0, 10) || '',
  }));
  const [photo, setPhoto] = useState(ban?.photo_url ? { preview: ban.photo_url, existing: true } : null);
  const [uploading, setUploading] = useState(false);
  const [run, busy] = useAction();
  const picker = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const small = await compressImage(file, 1200);
      setPhoto({ key: await upload(small, 'ban'), preview: URL.createObjectURL(small) });
    } catch { /* the toast from upload is enough */ } finally { setUploading(false); }
  };

  const save = () => {
    const ends = f.length === 'perm' ? null : f.length === 'custom' ? f.ends_on : addDays(f.starts_on, Number(f.length));
    const body = { name: f.name, description: f.description, reason: f.reason, starts_on: f.starts_on, ends_on: ends, permanent: f.length === 'perm' };
    if (photo?.key) body.photo = { key: photo.key };
    if (ban && !photo) body.photo = null;
    const call = ban ? api('bans.update', { id: ban.id, ...body }) : shiftId ? api('bans.propose', { shift_id: shiftId, ...body }) : api('bans.create', { venue_id: venueId, ...body });
    run(() => call, ban ? 'Ban updated' : direct || !shiftId ? 'Ban added' : 'Sent to the shift lead to confirm').then(onDone).catch(() => {});
  };

  return (
    <Sheet open={open} onClose={onClose} title={ban ? 'Edit ban' : 'Ban someone'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} disabled={uploading || !f.reason.trim() || (!f.name.trim() && !f.description.trim())} onClick={save}>{ban ? 'Save' : direct || !shiftId ? 'Add ban' : 'Propose ban'}</Button></>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Pressable press onClick={() => picker.current?.click()} className="pressable grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-bg text-muted" aria-label="Add a photo">
            {photo ? <img src={photo.preview} alt="" className="h-full w-full object-cover" /> : <Camera size={24} />}
          </Pressable>
          <div className="text-footnote text-muted">
            {uploading ? 'Uploading…' : photo ? <Pressable press className="font-semibold text-red" onClick={() => setPhoto(null)}>Remove photo</Pressable> : 'A photo helps the team recognise them. Only add one you are allowed to keep.'}
          </div>
          <input ref={picker} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        </div>
        <Input label="Name" placeholder="If known" value={f.name} onChange={set('name')} />
        <Textarea label="What they look like" rows={2} placeholder="e.g. Tall, shaved head, red puffer jacket" value={f.description} onChange={set('description')} />
        <Textarea label="Reason" rows={3} placeholder="e.g. Aggressive to door staff, refused to leave" value={f.reason} onChange={set('reason')} />
        <Input label="Starts" type="date" value={f.starts_on} onChange={set('starts_on')} />
        <div>
          <div className="mb-1.5 text-subhead font-semibold">How long</div>
          <div className="no-scrollbar overflow-x-auto"><Segmented value={f.length} onChange={set('length')} options={LENGTHS} /></div>
        </div>
        {f.length === 'custom' && <Input label="Ends" type="date" min={f.starts_on} value={f.ends_on} onChange={set('ends_on')} />}
        {!ban && shiftId && !direct && <p className="text-footnote text-muted">The shift lead or the office confirms it before it goes in the register.</p>}
      </div>
    </Sheet>
  );
}

export function BanList({ bans, canConfirm, canManage, onChanged, empty = 'Nobody is banned here' }) {
  const [editing, setEditing] = useState(null);
  if (!bans.length) return <Empty icon={Ban} title={empty} />;
  return (
    <>
      <div className="space-y-2.5">
        {bans.map((b) => <BanCard key={b.id} b={b} canConfirm={canConfirm} canManage={canManage} onChanged={onChanged} onEdit={setEditing} />)}
      </div>
      {editing && <BanSheet open ban={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} />}
    </>
  );
}
