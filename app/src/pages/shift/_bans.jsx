// The ejection log and ban register: cards, the log/ban/edit sheet and the confirm/revoke actions, shared by officers, managers and venues
import { useRef, useState } from 'react';
import { Ban, Camera, Check, DoorOpen, Pencil, X } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { compressImage } from '../officer/_parts.jsx';
import {
  addDays, Button, Chip, cx, date, dateTime, Empty, fromLocalInput, Input, isoDate, Lightbox, Pill, Segmented, Select, Sheet, Textarea, Toggle, toLocalInput,
  useAction, useConfirm, Pressable,
} from '../../ui/index.jsx';

export const BAN_STATUS = {
  proposed: { label: 'To confirm', tone: 'amber' },
  active: { label: 'Banned', tone: 'red' },
  lapsed: { label: 'Ended', tone: 'grey' },
  revoked: { label: 'Lifted', tone: 'grey' },
  rejected: { label: 'Not confirmed', tone: 'grey' },
};

// "Tonight" is stored as one day from the start
export const banLength = (b) => (!b.ends_on ? `Permanent from ${date(b.starts_on)}`
  : addDays(b.starts_on.slice(0, 10), 1) === b.ends_on.slice(0, 10) ? `Tonight only (${date(b.starts_on)})` : `${date(b.starts_on)} – ${date(b.ends_on)}`);
// One line on every register: what each record is for
export const REGISTER_NOTE = 'Ejections are quick door logs. Bans stop someone coming back in. Incident reports are separate, for force, injuries or police.';

export const OUTCOME = { ejected: { label: 'Ejected', tone: 'red' }, refused_entry: { label: 'Refused entry', tone: 'amber' } };
export const CATEGORIES = [
  { value: 'violence', label: 'Violence' }, { value: 'drugs', label: 'Drugs' }, { value: 'theft', label: 'Theft' }, { value: 'intoxication', label: 'Too drunk' },
  { value: 'abusive', label: 'Abusive' }, { value: 'underage_id', label: 'Underage / fake ID' }, { value: 'other', label: 'Other' },
];
const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));
const SCOPE = { venue: 'This venue only', client: "All this client's venues", all: 'Every venue' };
export const isEjection = (b) => b.kind === 'ejection';

// canConfirm: may approve proposals; canManage: may edit and lift active bans; canEscalate: may turn an ejection into a ban
// venueId: the venue being viewed, so a ban made at another venue says where it came from
export function BanCard({ b, canConfirm, canManage, canEscalate, venueId, onChanged, onEdit, onEscalate }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [photo, setPhoto] = useState(false);
  const ej = isEjection(b);
  const st = BAN_STATUS[b.status] || BAN_STATUS.active;
  const out = OUTCOME[b.outcome];
  const decide = (approve) => run(() => api('bans.confirm', { id: b.id, approve }), approve ? 'Ban confirmed' : 'Ban not confirmed').then(onChanged).catch(() => {});
  const revoke = async () => {
    const ok = ej
      ? await confirm({ title: 'Remove this from the ejection log?', body: 'Only do this if it was logged by mistake.', confirm: 'Remove', danger: true })
      : await confirm({ title: `Lift the ban on ${b.name || 'this person'}?`, body: 'They can come back in. The record stays in the register.', confirm: 'Lift ban', danger: true });
    if (!ok) return;
    run(() => api('bans.revoke', { id: b.id }), ej ? 'Removed from the log' : 'Ban lifted').then(onChanged).catch(() => {});
  };
  const from = venueId && b.venue_id !== venueId ? `Banned at ${b.venue_name}` : '';
  const scope = !ej ? [from, SCOPE[b.scope]].filter(Boolean).join(' · ') : '';
  return (
    <div className="rounded-tile border border-hairline bg-surface p-4 shadow-tile">
      <div className="flex items-start gap-3">
        {b.photo_url ? (
          <Pressable press onClick={() => setPhoto(true)} className="pressable h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-bg" aria-label="View photo">
            <img src={b.photo_url} alt="" className="h-full w-full object-cover" />
          </Pressable>
        ) : <div className={cx('grid h-16 w-16 shrink-0 place-items-center rounded-2xl', ej ? 'bg-amber-soft text-amber' : 'bg-red-soft text-red')}>{ej ? <DoorOpen size={24} /> : <Ban size={24} />}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 truncate text-headline font-bold">{b.name || 'Name not known'}</div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {out && <Pill tone={out.tone}>{out.label}</Pill>}
              {!ej && <Pill tone={st.tone}>{st.label}</Pill>}
            </div>
          </div>
          {b.description && <p className="mt-0.5 text-subhead text-muted">{b.description}</p>}
          <p className="mt-1 text-subhead">{b.category && <span className="font-semibold">{CATEGORY[b.category]} · </span>}{b.reason}</p>
          <p className="num mt-1 text-footnote text-muted">
            {b.occurred_at ? `${dateTime(b.occurred_at)}${b.venue_name && venueId !== b.venue_id ? ` · ${b.venue_name}` : ''}` : ''}
            {!ej && <>{b.occurred_at ? ' · ' : ''}{b.outcome ? 'Banned ' : ''}{banLength(b)}</>}
            {b.proposed_by_name ? ` · by ${b.proposed_by_name}` : ''}
          </p>
          {scope && <p className="mt-0.5 text-footnote font-semibold text-red">{scope}</p>}
          {b.status === 'revoked' && b.revoked_reason && <p className="mt-1 text-footnote text-muted">Lifted: {b.revoked_reason}</p>}
        </div>
      </div>
      {b.status === 'proposed' && canConfirm && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={X} busy={busy} onClick={() => decide(false)}>Don't ban</Button>
          <Button variant="danger" icon={Check} busy={busy} onClick={() => decide(true)}>Confirm ban</Button>
        </div>
      )}
      {b.status === 'active' && (canManage || (ej && canEscalate)) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {ej && canEscalate && <Button size="sm" variant="soft" icon={Ban} onClick={() => onEscalate?.(b)}>Upgrade to ban</Button>}
          {canManage && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit?.(b)}>Edit</Button>}
          {canManage && <Button size="sm" variant="link-red" onClick={revoke} disabled={busy}>{ej ? 'Remove' : 'Lift ban'}</Button>}
        </div>
      )}
      <Lightbox photos={b.photo_url ? [{ url: b.photo_url, name: b.name }] : []} index={photo ? 0 : null} onClose={() => setPhoto(false)} />
    </div>
  );
}

const LENGTHS = [
  { value: '1', label: 'Tonight' }, { value: '7', label: '1 week' }, { value: '30', label: '1 month' }, { value: '180', label: '6 months' },
  { value: '365', label: '12 months' }, { value: 'custom', label: 'Pick date' }, { value: 'perm', label: 'Permanent' },
];
const OUTCOMES = [{ value: 'ejected', label: 'Ejected' }, { value: 'refused_entry', label: 'Refused entry' }];

// Log an ejection (shift_id → bans.propose, else venue_id → bans.create), optionally banning them too;
// edit (ban → bans.update); or upgrade a logged ejection to a ban (escalate → bans.escalate).
// banOnly: the office adding a ban straight to the register, without an ejection behind it
// venues: a manager looking at "All venues" picks which one this is for
// late: an officer logging after their shift (up to 30 days): the ejection only, timed during the shift by default
export function BanSheet({ open, onClose, onDone, shiftId, venueId: fixedVenue, venues, ban, escalate, direct, banOnly, late, lateAt }) {
  const { user } = useAuth();
  const [where, setWhere] = useState('');
  const askVenue = !fixedVenue && !shiftId && !ban && !escalate && venues?.length > 1;
  const venueId = fixedVenue || where;
  const today = isoDate();
  const src = ban || escalate;
  const [f, setF] = useState(() => ({
    outcome: src?.outcome || 'ejected', occurred_at: toLocalInput(src?.occurred_at || (late && lateAt ? new Date(lateAt) : new Date())), category: src?.category || '',
    name: src?.name || '', description: src?.description || '', reason: src?.reason || '',
    ban: !!escalate || banOnly || (ban ? !isEjection(ban) : false), scope: src?.scope || 'venue',
    starts_on: ban?.starts_on?.slice(0, 10) || today, length: ban && !isEjection(ban) ? (ban.ends_on ? 'custom' : 'perm') : '30', ends_on: ban?.ends_on?.slice(0, 10) || '',
  }));
  const [photo, setPhoto] = useState(ban?.photo_url ? { preview: ban.photo_url, existing: true } : null);
  const [uploading, setUploading] = useState(false);
  const [run, busy] = useAction();
  const picker = useRef(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  // What this sheet is: an ejection (with or without a ban), a plain ban, or an edit of either
  const ejection = escalate ? false : ban ? isEjection(ban) || !!ban.outcome : !banOnly;
  const proposing = f.ban && shiftId && !direct && !ban;

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
    const body = { name: f.name, description: f.description, reason: f.reason, category: f.category || null, ban: f.ban };
    if (ejection) Object.assign(body, { outcome: f.outcome, occurred_at: fromLocalInput(f.occurred_at) });
    if (f.ban) Object.assign(body, { starts_on: f.starts_on, ends_on: ends, permanent: f.length === 'perm', scope: f.scope });
    if (photo?.key) body.photo = { key: photo.key };
    if (ban && !photo) body.photo = null;
    const call = escalate ? api('bans.escalate', { id: escalate.id, ...body })
      : ban ? api('bans.update', { id: ban.id, ...body })
        : shiftId ? api('bans.propose', { shift_id: shiftId, ...body }) : api('bans.create', { venue_id: venueId, ...body });
    const done = ban ? 'Saved' : proposing || (escalate && user.role === 'officer' && !direct) ? 'Logged. The ban goes to the shift lead to confirm'
      : f.ban ? (ejection ? 'Logged and banned' : 'Ban added') : 'Ejection logged';
    run(() => call, done).then(onDone).catch(() => {});
  };

  const title = escalate ? `Ban ${escalate.name || 'this person'}` : ban ? 'Edit' : ejection ? 'Log ejection or ban' : 'Ban someone';
  const action = ban ? 'Save' : escalate ? (user.role === 'officer' && !direct ? 'Propose ban' : 'Ban them') : f.ban ? (proposing ? 'Log and propose ban' : ejection ? 'Log and ban' : 'Add ban') : 'Log ejection';
  const scopes = [{ value: 'venue', label: 'This venue' }, { value: 'client', label: "Client's venues" }, ...(user.role === 'venue' ? [] : [{ value: 'all', label: 'Every venue' }])];
  const banSection = (
    <div className="space-y-4">
      <Input label="Starts" type="date" value={f.starts_on} onChange={set('starts_on')} />
      <div>
        <div className="mb-1.5 text-subhead font-semibold">How long</div>
        <div className="no-scrollbar overflow-x-auto"><Segmented value={f.length} onChange={set('length')} options={LENGTHS} /></div>
      </div>
      {f.length === 'custom' && <Input label="Ends" type="date" min={f.starts_on} value={f.ends_on} onChange={set('ends_on')} />}
      <div>
        <div className="mb-1.5 text-subhead font-semibold">Banned from</div>
        <div className="no-scrollbar overflow-x-auto"><Segmented value={f.scope} onChange={set('scope')} options={scopes} /></div>
      </div>
      {(proposing || (escalate && user.role === 'officer' && !direct)) && <p className="text-footnote text-muted">The shift lead or the office confirms the ban before it goes in the register.</p>}
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={f.ban ? 'danger' : 'primary'} busy={busy} disabled={uploading || (askVenue && !where) || !f.reason.trim() || (!f.name.trim() && !f.description.trim()) || (f.ban && f.length === 'custom' && !f.ends_on)} onClick={save}>{action}</Button></>}>
      {escalate ? banSection : (
        <div className="space-y-4">
          {askVenue && <Select label="Venue" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Choose venue"
            options={venues.map((v) => ({ value: v.id, label: v.name }))} />}
          {ejection && (
            <>
              {!ban && <p className="text-subhead text-muted">A quick door log. Add a ban if they shouldn't come back.</p>}
              <Segmented full value={f.outcome} onChange={set('outcome')} options={OUTCOMES} />
              <Input label="When" type="datetime-local" max={toLocalInput(new Date())} value={f.occurred_at} onChange={set('occurred_at')} />
            </>
          )}
          <div>
            <div className="mb-1.5 text-subhead font-semibold">Why</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => <Chip key={c.value} label={c.label} active={f.category === c.value} onClick={() => setF((x) => ({ ...x, category: x.category === c.value ? '' : c.value }))} />)}
            </div>
          </div>
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
          <Textarea label="What happened" rows={3} placeholder="e.g. Aggressive to door staff, refused to leave" value={f.reason} onChange={set('reason')} />
          {late && <p className="text-footnote text-muted">Logged after the shift. If they should be banned too, ask the office.</p>}
          {ejection && !ban && !late && <Toggle checked={f.ban} onChange={(v) => setF((x) => ({ ...x, ban: v }))} label="Also ban this person" hint="Stop them coming back for a while, here or across venues" />}
          {f.ban && banSection}
        </div>
      )}
    </Sheet>
  );
}

export function BanList({ bans, canConfirm, canManage, canEscalate, venueId, onChanged, empty = 'Nobody is banned here', directBan }) {
  const [editing, setEditing] = useState(null);
  const [upgrading, setUpgrading] = useState(null);
  if (!bans.length) return <Empty icon={Ban} title={empty} />;
  return (
    <>
      <div className="space-y-2.5">
        {bans.map((b) => <BanCard key={b.id} b={b} canConfirm={canConfirm} canManage={canManage} canEscalate={canEscalate} venueId={venueId} onChanged={onChanged} onEdit={setEditing} onEscalate={setUpgrading} />)}
      </div>
      {editing && <BanSheet open ban={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); onChanged(); }} />}
      {upgrading && <BanSheet open escalate={upgrading} direct={directBan} onClose={() => setUpgrading(null)} onDone={() => { setUpgrading(null); onChanged(); }} />}
    </>
  );
}
