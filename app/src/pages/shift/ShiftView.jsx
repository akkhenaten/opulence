// One shift, for everyone on it: details, team, last handover, bans, the shift log and sign-off.
// Officers open it at /officer/shifts/:id, managers at /<role>/shifts/:id, the venue at /venue/logs/:id (signed logs only).
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Ban, BookOpen, Camera, Check, Clock3, Crown, EyeOff, FileSignature, HeartPulse, LockOpen, MapPin, MessagesSquare, Pencil, Phone, Plus,
  Scale, ShieldAlert, Undo2, X,
} from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { compressImage } from '../officer/_parts.jsx';
import {
  Avatar, Button, cx, dateTime, dayLabel, Empty, IconButton, Lightbox, Load, Page, Pill, range, relative, Section, Segmented, Sheet, Textarea, time,
  useAction, useApi, useConfirm, Pressable,
} from '../../ui/index.jsx';
import { BanList, BanSheet } from './_bans.jsx';

const KINDS = [
  { value: 'note', label: 'Note' },
  { value: 'handover', label: 'For handover' },
];
const KIND = {
  note: { label: 'Note', tone: 'grey' },
  handover: { label: 'Handover', tone: 'blue' },
  incident: { label: 'Incident', tone: 'red' },
  ban: { label: 'Ban', tone: 'red' },
};
const TOOLBOX = [
  { cat: 'first_aid', label: 'First aid', icon: HeartPulse, tone: 'bg-red-soft text-red' },
  { cat: 'situations', label: 'Situations', icon: BookOpen, tone: 'bg-amber-soft text-amber' },
  { cat: 'law', label: 'Law at a glance', icon: Scale, tone: 'bg-blue-soft text-blue' },
];

export default function ShiftView() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useApi('shifts.detail', { id }, { poll: 30000 });
  const back = user.role === 'officer' ? { to: '/officer/shifts', label: 'Shifts' }
    : user.role === 'venue' ? { to: '/venue/logs', label: 'Shift logs' } : { to: `/${user.role}/rota`, label: 'Rota' };
  return (
    <Page title={q.data?.shift.venue_name || 'Shift'} subtitle={q.data ? <>{dayLabel(q.data.shift.starts_at)} · <span className="num">{range(q.data.shift.starts_at, q.data.shift.ends_at)}</span></> : null} back={back}>
      <Load q={q} skeleton="rows">{(d) => <Body d={d} reload={q.reload} role={user.role} />}</Load>
    </Page>
  );
}

function Body({ d, reload, role }) {
  const { shift: s, me, team, log } = d;
  const [banning, setBanning] = useState(false);
  const venue = me.access === 'venue';
  const officer = role === 'officer';
  const signed = log.status === 'signed';
  const started = new Date(s.starts_at) <= new Date();
  const proposed = d.bans.filter((b) => b.status === 'proposed');

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="space-y-5">
        <Header s={s} me={me} officer={officer} signed={signed} />
        {officer && <QuickActions s={s} d={d} />}
        {d.previous_handover && !venue && (
          <Section title="Last handover here">
            <div className="rounded-tile bg-blue-soft/60 p-4">
              <p className="whitespace-pre-line text-body">{d.previous_handover.handover_summary || 'No summary written.'}</p>
              <p className="mt-2 text-footnote text-muted">{dayLabel(d.previous_handover.starts_at)} · signed by {d.previous_handover.signed_by_name || 'the lead'}</p>
            </div>
          </Section>
        )}
        <LogSection d={d} reload={reload} />
      </div>

      <div className="space-y-5">
        <Team team={team} venue={venue} />
        {!venue || d.bans.length ? (
          <Section title={`Banned here${d.bans.length ? ` · ${d.bans.length}` : ''}`} action={me.can_write && !signed && <Button size="sm" variant="soft" icon={Plus} onClick={() => setBanning(true)}>Ban someone</Button>}>
            {proposed.length > 0 && me.can_curate && <p className="mb-2 text-footnote font-semibold text-amber">{proposed.length} waiting for you to confirm</p>}
            <BanList bans={d.bans} canConfirm={me.can_curate || venue} canManage={!officer} onChanged={reload} empty="No bans at this venue" />
          </Section>
        ) : null}
        {officer && started && (
          <Section title="Toolbox">
            <div className="grid grid-cols-3 gap-2">
              {TOOLBOX.map((t) => (
                <Button key={t.cat} variant="plain" to={`/officer/learn/toolbox?cat=${t.cat}`} className="!h-auto flex-col !gap-1.5 rounded-tile bg-surface !py-3 shadow-tile">
                  <span className={cx('grid h-9 w-9 place-items-center rounded-xl', t.tone)}><t.icon size={18} /></span>
                  <span className="text-caption font-semibold">{t.label}</span>
                </Button>
              ))}
            </div>
          </Section>
        )}
      </div>
      {banning && <BanSheet open shiftId={s.id} direct={me.can_curate} onClose={() => setBanning(false)} onDone={() => { setBanning(false); reload(); }} />}
    </div>
  );
}

function Header({ s, me, officer, signed }) {
  const ins = me.clock.filter((e) => e.kind === 'in' && e.status !== 'rejected');
  const outs = me.clock.filter((e) => e.kind === 'out' && e.status !== 'rejected');
  const live = new Date(s.starts_at) <= new Date() && new Date(s.ends_at) > new Date();
  return (
    <div className="rounded-tile bg-surface p-4 shadow-tile">
      <div className="flex flex-wrap items-center gap-2">
        {s.status === 'cancelled' ? <Pill tone="grey">Cancelled</Pill> : live ? <Pill tone="green">On now</Pill> : null}
        <Pill tone={signed ? 'green' : 'grey'}>{signed ? 'Log signed off' : 'Log open'}</Pill>
        {me.is_lead && <Pill tone="ink"><Crown size={14} className="-ml-0.5 mr-1 inline" />You lead this shift</Pill>}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-soft text-blue"><MapPin size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-headline font-bold">{s.venue_name}</div>
          <div className="text-footnote text-muted">{[s.venue_address, s.postcode].filter(Boolean).join(', ')}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-subhead text-muted">
            <span className="num inline-flex items-center gap-1.5 font-semibold text-ink"><Clock3 size={16} />{range(s.starts_at, s.ends_at)}</span>
            <span>{s.role_name}</span>
            {s.break_minutes ? <span>{s.break_minutes} min break</span> : null}
          </div>
        </div>
      </div>
      {(s.instructions || s.notes) && (
        <div className="mt-3 space-y-1.5 rounded-2xl bg-bg/70 p-3 text-subhead">
          {s.instructions && <p className="whitespace-pre-line">{s.instructions}</p>}
          {s.notes && <p className="whitespace-pre-line text-muted">{s.notes}</p>}
        </div>
      )}
      {officer && me.assignment_status === 'accepted' && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-sep pt-3">
          <span className="text-subhead text-muted">
            {ins.length ? <>Clocked in <span className="num font-semibold text-ink">{time(ins[0].ts)}</span>{outs.length ? <> · out <span className="num font-semibold text-ink">{time(outs.at(-1).ts)}</span></> : null}</> : 'Not clocked in yet'}
          </span>
          {!outs.length && <Button size="sm" variant={ins.length ? 'secondary' : 'primary'} to="/officer/clock">{ins.length ? 'Clock out' : 'Clock in'}</Button>}
        </div>
      )}
    </div>
  );
}

function QuickActions({ s, d }) {
  const started = new Date(s.starts_at).getTime() - 3600000 <= Date.now();
  return (
    <div className="flex flex-wrap gap-2">
      {started && <Button variant="soft" icon={ShieldAlert} to={`/officer/incidents/new?shift=${s.id}`}>Report incident</Button>}
      {d.thread_id && <Button variant="secondary" icon={MessagesSquare} to={`/officer/messages/${d.thread_id}`}>Shift chat</Button>}
    </div>
  );
}

function Team({ team, venue }) {
  return (
    <Section title={`On this shift · ${team.length}`}>
      {!team.length ? <p className="text-subhead text-muted">Nobody booked yet.</p> : (
        <div className="divide-y divide-sep overflow-hidden rounded-tile bg-surface shadow-tile">
          {team.map((m) => (
            <div key={m.assignment_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.name} src={m.photo_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-body font-semibold">{m.name}{m.is_lead && <Crown size={14} className="shrink-0 text-amber" aria-label="Shift lead" />}</div>
                <div className="truncate text-caption text-muted">
                  {m.is_lead ? 'Shift lead' : m.head_door ? 'Head doorman' : m.status === 'assigned' ? 'Not confirmed yet' : 'Officer'}
                  {m.clocked_in ? <> · in <span className="num">{time(m.clocked_in)}</span></> : ''}{m.clocked_out ? <> · out <span className="num">{time(m.clocked_out)}</span></> : ''}
                </div>
              </div>
              {!venue && m.phone && <a href={`tel:${m.phone}`} aria-label={`Call ${m.name}`} className="pressable grid h-10 w-10 place-items-center rounded-full text-blue"><Phone size={18} /></a>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function LogSection({ d, reload }) {
  const { me, log, entries } = d;
  const venue = me.access === 'venue';
  const signed = log.status === 'signed';
  const [showRemoved, setShowRemoved] = useState(false);
  const [signing, setSigning] = useState(false);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const removed = entries.filter((e) => e.state === 'removed').length;
  const shown = entries.filter((e) => showRemoved || e.state === 'kept');
  const reopen = async () => {
    if (!(await confirm({ title: 'Reopen this log?', body: 'The lead can add and tidy entries again, then sign it off.', confirm: 'Reopen' }))) return;
    run(() => api('shiftlog.reopen', { shift_id: d.shift.id }), 'Log reopened').then(reload).catch(() => {});
  };

  return (
    <Section title="Shift log" action={(
      <div className="flex items-center gap-2">
        {removed > 0 && me.can_curate && <Button size="sm" variant="ghost" icon={EyeOff} onClick={() => setShowRemoved((v) => !v)}>{showRemoved ? 'Hide removed' : `${removed} removed`}</Button>}
        {signed && me.access === 'mgr' && <Button size="sm" variant="ghost" icon={LockOpen} onClick={reopen} disabled={busy}>Reopen</Button>}
      </div>
    )}>
      {signed && (
        <div className="mb-3 rounded-tile bg-green-soft/60 p-4">
          <div className="text-caption font-semibold uppercase tracking-wide text-green">Handover · signed by {log.signed_by_name || 'the lead'}, {dateTime(log.signed_at)}</div>
          <p className="mt-1 whitespace-pre-line text-body">{log.handover_summary || 'No summary written.'}</p>
        </div>
      )}
      {venue && !signed ? (
        <Empty icon={FileSignature} title="Not signed off yet" body="You can read the log once the shift lead signs it off." />
      ) : (
        <>
          {me.can_write && !signed && <Composer shiftId={d.shift.id} onAdded={reload} />}
          {!shown.length ? (
            <p className="py-4 text-center text-subhead text-muted">{signed ? 'Nothing was logged.' : 'Nothing logged yet. Notes, photos and anything the next team should know go here.'}</p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {shown.map((e) => <Entry key={e.id} e={e} me={me} signed={signed} shiftId={d.shift.id} onChanged={reload} />)}
            </div>
          )}
          {me.can_curate && !signed && new Date(d.shift.starts_at) <= new Date() && (
            <Button className="mt-4 w-full" size="lg" icon={FileSignature} onClick={() => setSigning(true)}>Sign off and hand over</Button>
          )}
          {!me.can_curate && !signed && me.access !== 'venue' && (
            <p className="mt-3 text-footnote text-muted">The shift lead decides what stays in the log and signs it off at the end.</p>
          )}
        </>
      )}
      {signing && <SignSheet d={d} onClose={() => setSigning(false)} onDone={() => { setSigning(false); reload(); }} />}
    </Section>
  );
}

function usePhotos() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const picker = useRef(null);
  const pick = async (e) => {
    const chosen = [...(e.target.files || [])].slice(0, 6 - files.length);
    e.target.value = '';
    if (!chosen.length) return;
    setUploading(true);
    try {
      const up = await Promise.all(chosen.map(async (f) => {
        const small = await compressImage(f);
        return { key: await upload(small, 'shiftlog'), name: small.name, mime: small.type, preview: URL.createObjectURL(small) };
      }));
      setFiles((x) => [...x, ...up]);
    } catch { /* upload shows its own error */ } finally { setUploading(false); }
  };
  const input = <input ref={picker} type="file" accept="image/*" multiple className="hidden" onChange={pick} />;
  return { files, setFiles, uploading, open: () => picker.current?.click(), input };
}

function Composer({ shiftId, onAdded }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('note');
  const ph = usePhotos();
  const [run, busy] = useAction();
  const add = () => run(() => api('shiftlog.add', { shift_id: shiftId, kind, body: text.trim(), photos: ph.files.map(({ key, name, mime }) => ({ key, name, mime })) }), 'Added to the log')
    .then(() => { setText(''); ph.setFiles([]); setKind('note'); onAdded(); }).catch(() => {});
  return (
    <div className="rounded-tile bg-surface p-3 shadow-tile">
      <Textarea rows={3} placeholder="What happened? e.g. 23:10 queue busy, fire exit B checked and clear" value={text} onChange={(e) => setText(e.target.value)} />
      {ph.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ph.files.map((f, i) => (
            <div key={f.key} className="relative h-16 w-16 overflow-hidden rounded-xl bg-bg">
              <img src={f.preview} alt="" className="h-full w-full object-cover" />
              <Pressable press aria-label="Remove photo" onClick={() => ph.setFiles((x) => x.filter((_, k) => k !== i))} className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><X size={14} /></Pressable>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconButton icon={Camera} label="Add photos" disabled={ph.uploading || ph.files.length >= 6} onClick={ph.open} />
          <Segmented value={kind} onChange={setKind} options={KINDS} />
        </div>
        <Button icon={Plus} busy={busy} disabled={ph.uploading || (!text.trim() && !ph.files.length)} onClick={add}>{ph.uploading ? 'Uploading…' : 'Add'}</Button>
      </div>
      {ph.input}
    </div>
  );
}

function Entry({ e, me, signed, shiftId, onChanged }) {
  const [photo, setPhoto] = useState(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(e.body);
  const [run, busy] = useAction();
  const k = KIND[e.kind] || KIND.note;
  const { user } = useAuth();
  const mine = e.author_user_id === user.id && me.can_write;
  const curate = (state, extra = {}) => run(() => api('shiftlog.curate', { id: e.id, state, ...extra }), state === 'removed' ? 'Removed from the log' : 'Kept').then(() => { setEditing(false); onChanged(); }).catch(() => {});
  const saveOwn = () => run(() => api('shiftlog.update', { id: e.id, body }), 'Saved').then(() => { setEditing(false); onChanged(); }).catch(() => {});
  const canEdit = !signed && (me.can_curate || mine);

  return (
    <div className={cx('rounded-tile border border-black/[0.04] bg-surface p-4 shadow-tile', e.state === 'removed' && 'opacity-60')}>
      <div className="flex items-center gap-2.5">
        <Avatar name={e.author_name} src={e.author_photo_url} size={28} />
        <div className="min-w-0 flex-1 truncate text-footnote"><span className="font-semibold">{e.author_name}</span> <span className="text-muted">· <span className="num">{time(e.created_at)}</span></span></div>
        {e.state === 'removed' ? <Pill tone="grey">Removed</Pill> : e.kind !== 'note' && <Pill tone={k.tone}>{k.label}</Pill>}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea rows={3} value={body} onChange={(x) => setBody(x.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setBody(e.body); }}>Cancel</Button>
            <Button size="sm" busy={busy} onClick={() => (me.can_curate ? curate('kept', { body }) : saveOwn())}>Save</Button>
          </div>
        </div>
      ) : e.body && <p className="mt-2 whitespace-pre-line text-body">{e.body}</p>}
      {e.photos?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {e.photos.map((p, i) => (
            <Pressable press key={p.url} onClick={() => setPhoto(i)} className="h-20 w-20 overflow-hidden rounded-xl bg-bg" aria-label={`Photo ${i + 1}`}>
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </Pressable>
          ))}
        </div>
      )}
      {(e.incident_ref || e.curated_by_name) && (
        <div className="mt-2 flex flex-wrap gap-x-3 text-caption text-muted">
          {e.incident_ref && <span>Incident {e.incident_ref}</span>}
          {e.curated_by_name && <span>Tidied by {e.curated_by_name}, {relative(e.curated_at)}</span>}
        </div>
      )}
      {!signed && me.access !== 'venue' && (me.can_curate || mine) && !editing && (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          {user.role === 'officer' && !e.incident_id && e.kind !== 'ban' && <Button size="sm" variant="ghost" icon={ShieldAlert} to={`/officer/incidents/new?shift=${shiftId}&entry=${e.id}`}>Make incident</Button>}
          {canEdit && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
          {me.can_curate && (e.state === 'kept'
            ? <Button size="sm" variant="ghost" icon={X} disabled={busy} onClick={() => curate('removed')}>Remove</Button>
            : <Button size="sm" variant="ghost" icon={Undo2} disabled={busy} onClick={() => curate('kept')}>Keep</Button>)}
        </div>
      )}
      <Lightbox photos={e.photos || []} index={photo} onClose={() => setPhoto(null)} download />
    </div>
  );
}

function SignSheet({ d, onClose, onDone }) {
  const handovers = d.entries.filter((e) => e.state === 'kept' && e.kind === 'handover').map((e) => `• ${e.body}`);
  const [text, setText] = useState(handovers.join('\n'));
  const [run, busy] = useAction();
  const sign = () => run(() => api('shiftlog.sign', { shift_id: d.shift.id, handover_summary: text.trim() }), 'Signed off. The venue and the next team have been told.').then(onDone).catch(() => {});
  const kept = d.entries.filter((e) => e.state === 'kept').length;
  return (
    <Sheet open onClose={onClose} title="Sign off the shift"
      footer={<><Button variant="secondary" onClick={onClose}>Not yet</Button><Button icon={Check} busy={busy} onClick={sign}>Sign off</Button></>}>
      <div className="space-y-4">
        <p className="text-body text-muted">
          {kept} entr{kept === 1 ? 'y' : 'ies'} will stay in the log. The venue can read it once signed, and the next team at {d.shift.venue_name} sees your handover.
        </p>
        <Textarea label="Handover for the next team" rows={6} placeholder="e.g. Quiet night. Watch for the group in red from last week. Fire exit B alarm is faulty." value={text} onChange={(e) => setText(e.target.value)} />
        {d.bans.some((b) => b.status === 'proposed') && <p className="flex items-center gap-1.5 text-footnote font-semibold text-amber"><Ban size={14} />Some bans are still waiting to be confirmed.</p>}
      </div>
    </Sheet>
  );
}
