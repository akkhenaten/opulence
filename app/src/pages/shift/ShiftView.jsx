// One shift, for everyone on it: details, team, last handover, bans, the shift log and sign-off.
// Officers open it at /officer/shifts/:id, managers at /<role>/shifts/:id, the venue at /venue/logs/:id (signed logs only).
// Managers can switch to the officer's view, and send instructions that pin on the officer's card until they tap Got it.
import { useImperativeHandle, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRightLeft, Ban, BookOpen, Camera, Check, Clock3, Crown, DoorOpen, EyeOff, FilePen, FileSignature, HeartPulse, Hammer, LockOpen, MapPin, Megaphone,
  MessagesSquare, Pencil, Phone, Plus, MessageSquareHeart, Scale, ShieldAlert, ShoppingBag, Undo2, Users, X,
} from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { clockOpensAt, compressImage, DeclineSheet } from '../officer/_parts.jsx';
import {
  Avatar, Button, cx, dateTime, dayLabel, Empty, IconButton, Input, Lightbox, Load, Page, Pill, range, relative, Section, Segmented, Select, Sheet, Textarea, time,
  useAction, useApi, useConfirm, Pressable,
} from '../../ui/index.jsx';
import { BanList, BanSheet, isEjection } from './_bans.jsx';
import { SitePackCard } from '../officer/VenuePack.jsx';
import { GiveFeedbackSheet } from '../venue/_feedback.jsx';
import FlowEntry from '../guide/flow/Entry.jsx';

const KINDS = [
  { value: 'note', label: 'Note' },
  { value: 'handover', label: 'For handover' },
];
const KIND = {
  note: { label: 'Note', tone: 'grey' },
  handover: { label: 'Handover', tone: 'blue' },
  incident: { label: 'Incident', tone: 'red' },
  ban: { label: 'Ban', tone: 'red' },
  ejection: { label: 'Ejection', tone: 'amber' },
  instruction: { label: 'Instruction', tone: 'amber' },
};
const VIEWS = [{ value: 'mgr', label: 'Manager view' }, { value: 'officer', label: "Officer's view" }];
// Instructions sent to this person (or to everyone) that are still waiting for Got it
const unreadFor = (d) => d.entries.filter((e) => e.kind === 'instruction' && e.state === 'kept' && !e.read_by_me && new Date(d.shift.ends_at) > new Date()).reverse();
// One tap starts a report of that type (IncidentForm reads ?type=)
const REPORTS = [
  { type: 'ejection', label: 'Ejection / refused entry', icon: DoorOpen, tone: 'bg-amber-soft text-amber' },
  { type: 'medical', label: 'Injury / first aid', icon: HeartPulse, tone: 'bg-red-soft text-red' },
  { type: 'damage', label: 'Damage', icon: Hammer, tone: 'bg-blue-soft text-blue' },
  { type: 'theft', label: 'Theft', icon: ShoppingBag, tone: 'bg-blue-soft text-blue' },
  { type: 'other', label: 'Other', icon: ShieldAlert, tone: 'bg-fill text-ink' },
];
const TOOLBOX = [
  { cat: 'first_aid', label: 'First aid', icon: HeartPulse, tone: 'bg-red-soft text-red' },
  { cat: 'situations', label: 'Situations', icon: BookOpen, tone: 'bg-amber-soft text-amber' },
  { cat: 'law', label: 'Law at a glance', icon: Scale, tone: 'bg-blue-soft text-blue' },
];

export default function ShiftView() {
  const { id } = useParams();
  const { user } = useAuth();
  const loc = useLocation();
  const q = useApi('shifts.detail', { id }, { poll: 30000 });
  const mgr = user.role !== 'officer' && user.role !== 'venue';
  const back = user.role === 'officer' ? { to: '/officer/shifts', label: 'Shifts' }
    : user.role === 'venue' ? { to: '/venue/logs', label: 'Shift logs' }
      : loc.state?.from === 'live' ? { to: `/${user.role}/live`, label: 'Live' } : { to: `/${user.role}/rota`, label: 'Rota' };
  return (
    <Page backLabel="Shift" title={q.data?.shift.venue_name || 'Shift'} subtitle={q.data ? <>{dayLabel(q.data.shift.starts_at)} · <span className="num">{range(q.data.shift.starts_at, q.data.shift.ends_at)}</span></> : null} back={back}>
      <Load q={q} skeleton="rows">{(d) => (mgr && d.me.access === 'mgr' ? <ManagerShift d={d} reload={q.reload} role={user.role} /> : <Body d={d} reload={q.reload} role={user.role} />)}</Load>
    </Page>
  );
}

// The manager's page, or the same card exactly as one officer on the shift sees it (look only, nothing can be pressed)
function ManagerShift({ d, reload, role }) {
  const [view, setView] = useState('mgr');
  const people = d.team.filter((m) => m.user_id);
  const [who, setWho] = useState(null);
  const m = people.find((x) => x.user_id === who) || people[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={VIEWS} />
        {view === 'officer' && people.length > 1 && <Segmented value={m.user_id} onChange={setWho} options={people.map((x) => ({ value: x.user_id, label: x.name }))} />}
      </div>
      {view === 'mgr' ? <Body d={d} reload={reload} role={role} />
        : !m ? <Empty icon={Users} title="Nobody to show" body="No one on this shift has the app yet." />
          : <OfficerPreview d={d} m={m} />}
    </div>
  );
}

function OfficerPreview({ d, m }) {
  const pd = {
    ...d,
    me: {
      ...d.me, access: m.is_lead ? 'lead' : 'officer', can_write: true, can_curate: m.is_lead, can_count: false, can_instruct: false, is_lead: m.is_lead,
      assignment_id: m.assignment_id, assignment_status: m.status,
      clock: [m.clocked_in && { kind: 'in', ts: m.clocked_in, status: 'ok' }, m.clocked_out && { kind: 'out', ts: m.clocked_out, status: 'ok' }].filter(Boolean),
    },
    entries: d.entries.filter((e) => e.kind !== 'instruction' || !e.to_user_id || e.to_user_id === m.user_id)
      .map((e) => (e.kind === 'instruction' ? { ...e, read_by_me: (e.reads || []).some((r) => r.user_id === m.user_id) } : e)),
  };
  const onShift = !!m.clocked_in && !m.clocked_out;
  return (
    <div className="space-y-4">
      <div className="rounded-tile bg-blue-soft p-3 text-subhead text-blue">
        <span className="font-semibold">This is what {m.name} sees.</span> {onShift ? 'They are clocked in, so this is their Home.' : m.clocked_out ? 'They have clocked out.' : 'Not started yet: they have not clocked in.'} Nothing here can be pressed.
      </div>
      <div inert="" className="pointer-events-none select-none" aria-hidden="true">
        <Body d={pd} reload={() => {}} role="officer" live={onShift} preview />
      </div>
    </div>
  );
}

// The same shift card without the page around it: the officer's Home while they are clocked in
export function ShiftPanel({ id }) {
  const { user } = useAuth();
  const q = useApi('shifts.detail', { id }, { poll: 30000 });
  return <Load q={q} skeleton="rows">{(d) => <Body d={d} reload={q.reload} role={user.role} live />}</Load>;
}

function Body({ d, reload, role, live, preview }) {
  const { shift: s, me, team, log } = d;
  const [banning, setBanning] = useState(false);
  const loc = useLocation();
  // "Add handover note" sets the composer to handover and moves to it
  const composer = useRef(null);
  const venue = me.access === 'venue';
  const officer = role === 'officer';
  const manager = me.access === 'mgr';
  const signed = log.status === 'signed';
  const started = new Date(s.starts_at) <= new Date();
  const proposed = d.bans.filter((b) => b.status === 'proposed');
  // Tonight's ejections that are not bans (those show under "Banned here")
  const tonight = (d.ejections || []).filter(isEjection);

  return (
    // Two columns only when the page itself is wide enough (the officer app stays one column on a desktop)
    <div className="@container"><div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1fr)_380px] @4xl:items-start">
      <div className="space-y-5">
        <Header s={s} me={me} officer={officer} signed={signed} live={live} phone={d.office_phone} />
        {/* The Emergency flowchart on every shift card, for everyone who can open it; Leave comes back here */}
        <FlowEntry shift from={loc.pathname + loc.search} />
        {officer && <PinnedInstructions d={d} reload={reload} />}
        {officer && <ReportTiles s={s} preview={preview} />}
        {officer && <QuickActions s={s} d={d} onBan={me.can_write && !signed ? () => setBanning(true) : null} />}
        {manager && <ManagerActions s={s} d={d} role={role} />}
        {manager && <InstructionsCard d={d} reload={reload} />}
        {venue && started && <VenueActions s={s} />}
        {!venue && <HandoverBlock d={d} onAdd={me.can_write && !signed ? () => composer.current?.handover() : null} />}
        {officer && me.assignment_id && (preview
          ? <div className="flex items-center gap-3 rounded-tile bg-surface p-4 shadow-tile"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><FileSignature size={20} /></span><span className="font-semibold">Site pack</span></div>
          : <SitePackCard venueId={s.venue_id} />)}
        {started && (me.can_count || log.customers != null) && <CustomersCard d={d} reload={reload} />}
        <LogSection d={d} reload={reload} composer={composer} />
      </div>

      <div className="space-y-5">
        <Team team={team} venue={venue} />
        {!venue || d.bans.length || tonight.length ? (
          <Section title="Ejections & bans" action={me.can_write && !signed && <Button size="sm" variant="soft" icon={Plus} onClick={() => setBanning(true)}>Log ejection</Button>}>
            {proposed.length > 0 && me.can_curate && <p className="mb-2 text-footnote font-semibold text-amber">{proposed.length} waiting for you to confirm</p>}
            {tonight.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-footnote font-semibold text-muted">This shift · {tonight.length}</div>
                <BanList bans={tonight} canManage={!officer && !venue} canEscalate={!venue && (me.can_write || !officer)} directBan={me.can_curate} venueId={s.venue_id} onChanged={reload} />
              </div>
            )}
            <div className="mb-2 text-footnote font-semibold text-muted">Banned here{d.bans.length ? ` · ${d.bans.length}` : ''}</div>
            <BanList bans={d.bans} canConfirm={me.can_curate || venue} canManage={!officer} venueId={s.venue_id} onChanged={reload} empty="No bans at this venue" />
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
    </div></div>
  );
}

function Header({ s, me, officer, signed, live: onShift, phone }) {
  const nav = useNavigate();
  const [declining, setDeclining] = useState(false);
  const opens = clockOpensAt(s.starts_at);
  const canClock = Date.now() >= opens.getTime();
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
          {s.notes && s.notes_updated_at && <p className="text-footnote font-semibold text-amber">Notes updated <span className="num">{time(s.notes_updated_at)}</span></p>}
        </div>
      )}
      {officer && !onShift && me.assignment_status === 'accepted' && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-sep pt-3">
          <span className="text-subhead text-muted">
            {ins.length ? <>Clocked in <span className="num font-semibold text-ink">{time(ins[0].ts)}</span>{outs.length ? <> · out <span className="num font-semibold text-ink">{time(outs.at(-1).ts)}</span></> : null}</> : 'Not clocked in yet'}
          </span>
          {!outs.length && (ins.length || canClock
            ? <Button size="sm" variant={ins.length ? 'secondary' : 'primary'} to="/officer/clock">{ins.length ? 'Clock out' : 'Clock in'}</Button>
            : <span className="text-footnote font-semibold text-muted">Clock-in opens at <span className="num">{time(opens)}</span>{dayLabel(opens) !== dayLabel(new Date()) && ` ${dayLabel(opens)}`}</span>)}
        </div>
      )}
      {officer && me.assignment_status === 'accepted' && !ins.length && new Date(s.starts_at) > new Date() && (
        <>
          <Button className="mt-2 w-full" variant="ghost" icon={X} onClick={() => setDeclining(true)}>I can't work this</Button>
          <DeclineSheet s={declining ? { ...s, assignment_id: me.assignment_id, assignment_status: 'accepted' } : null} phone={phone}
            onClose={() => setDeclining(false)} onDone={() => { setDeclining(false); nav('/officer', { replace: true }); }} />
        </>
      )}
    </div>
  );
}

// Officers can report from an hour before a shift until 30 days after it ends
const reportWindow = (s) => {
  if (new Date(s.starts_at).getTime() - 3600000 > Date.now()) return 'early';
  if (Date.now() - new Date(s.ends_at).getTime() >= 30 * 86400000) return 'closed';
  return 'open';
};

function QuickActions({ s, d, onBan }) {
  const open = reportWindow(s) === 'open';
  if (!(open && onBan) && !d.thread_id) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {open && onBan && <Button variant="soft" icon={Ban} onClick={onBan}>Log ejection or ban</Button>}
      {d.thread_id && <Button variant="secondary" icon={MessagesSquare} to={`/officer/messages/${d.thread_id}`}>Shift chat</Button>}
    </div>
  );
}

// Report types as tiles, always visible; they open an hour before the shift. A draft for this shift shows on top.
function ReportTiles({ s, preview }) {
  const w = reportWindow(s);
  const drafts = useApi('incidents.drafts', {}, { skip: preview });
  const mine = (drafts.data || []).filter((x) => x.shift_id === s.id);
  return (
    <Section title="Report an incident" action={w !== 'open' && <span className="text-footnote text-muted">{w === 'early' ? 'Opens 1 hour before your shift' : 'Reporting closed after 30 days'}</span>}>
      {mine.map((x) => (
        <Pressable key={x.id} press to={`/officer/incidents/new?draft=${x.id}`} className="mb-2 flex items-center gap-3 rounded-tile bg-amber-soft p-3 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber text-white"><FilePen size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Draft report: carry on</span>
            <span className="block text-footnote text-muted">{x.type ? REPORTS.find((r) => r.type === x.type)?.label || 'Incident' : 'Incident'} · saved <span className="num">{time(x.updated_at)}</span>{dayLabel(x.updated_at) !== dayLabel(new Date()) && ` ${dayLabel(x.updated_at)}`}</span>
          </span>
        </Pressable>
      ))}
      <div className={cx('grid grid-cols-3 gap-2 @lg:grid-cols-5', w !== 'open' && 'pointer-events-none opacity-60 grayscale')} aria-disabled={w !== 'open'}>
        {REPORTS.map((r) => (
          <Button key={r.type} variant="plain" tabIndex={w !== 'open' ? -1 : undefined} to={w === 'open' ? `/officer/incidents/new?shift=${s.id}&type=${r.type}` : undefined}
            className="!h-auto flex-col !gap-1.5 rounded-tile bg-surface !px-1 !py-3 text-center shadow-tile">
            <span className={cx('grid h-9 w-9 place-items-center rounded-xl', r.tone)}><r.icon size={18} /></span>
            <span className="whitespace-normal text-caption font-semibold leading-tight">{r.label}</span>
          </Button>
        ))}
      </div>
    </Section>
  );
}

// Instructions from a manager, pinned on top of the officer's card until they tap Got it
function PinnedInstructions({ d, reload }) {
  const [run, busy] = useAction();
  const list = unreadFor(d);
  if (!list.length) return null;
  const ack = (id) => run(() => api('shiftlog.ack', { id })).then(reload).catch(() => {});
  return (
    <div className="space-y-2">
      {list.map((e) => (
        <div key={e.id} role="alert" className="rounded-tile border border-amber/40 bg-amber-soft p-4 shadow-tile">
          <div className="flex items-center gap-2 text-caption font-semibold uppercase tracking-wide text-amber"><Megaphone size={16} />From your manager</div>
          <p className="mt-1.5 whitespace-pre-line text-body font-semibold">{e.body}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-footnote text-muted">{e.author_name} · <span className="num">{time(e.created_at)}</span></span>
            <Button size="sm" icon={Check} disabled={busy} onClick={() => ack(e.id)}>Got it</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ManagerActions({ s, d, role }) {
  return (
    <div className="flex flex-wrap gap-2">
      {d.thread_id && <Button variant="secondary" icon={MessagesSquare} to={`/${role}/messages/${d.thread_id}`}>Shift chat</Button>}
      <Button variant="secondary" icon={FileSignature} to={`/${role}/venues/${s.venue_id}?tab=pack`}>Site pack</Button>
    </div>
  );
}

// Send an instruction to the whole team or one officer, and see who has read each one
function InstructionsCard({ d, reload }) {
  const { me, team } = d;
  const people = team.filter((m) => m.user_id);
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState(null);
  const [run, busy] = useAction();
  const sent = d.entries.filter((e) => e.kind === 'instruction').reverse();
  const send = () => run(() => api('shiftlog.instruct', { shift_id: d.shift.id, body: text.trim(), to_user_id: to || null }),
    (r) => `Sent to ${r.recipients} officer${r.recipients === 1 ? '' : 's'}`).then(() => { setText(''); setTo(''); reload(); }).catch(() => {});
  const nameOf = (id) => team.find((m) => m.user_id === id)?.name || 'one officer';
  if (!me.can_instruct && !sent.length) return null;
  return (
    <Section title="Instructions">
      {me.can_instruct ? (
        <div className="rounded-tile bg-surface p-3 shadow-tile">
          <Textarea rows={2} maxLength={500} placeholder="e.g. Close the side door at 23:00 and send the queue to the front" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <Select className="min-w-0 flex-1" aria-label="Send to" value={to} onChange={(e) => setTo(e.target.value)}
              options={[{ value: '', label: `Whole team (${people.length})` }, ...people.map((m) => ({ value: m.user_id, label: m.name }))]} />
            <Button icon={Megaphone} busy={busy} disabled={!text.trim() || !people.length} onClick={send}>Send instruction</Button>
          </div>
          <p className="mt-1.5 text-footnote text-muted">They get a notification, and it stays on top of their shift card until they tap Got it. <span className="num">{text.length}/500</span></p>
        </div>
      ) : <p className="text-footnote text-muted">Instructions can be sent from two hours before the shift until it ends.</p>}
      {sent.length > 0 && (
        <div className="mt-3 space-y-2">
          {sent.map((e) => {
            const reads = e.reads || [];
            const total = e.to_user_id ? 1 : people.length;
            const done = reads.length >= total && total > 0;
            return (
              <div key={e.id} className={cx('rounded-tile border p-3 shadow-tile', done ? 'border-hairline bg-surface' : 'border-amber/40 bg-amber-soft', e.state === 'removed' && 'opacity-60')}>
                <p className="whitespace-pre-line text-body">{e.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-footnote text-muted">
                  <span>{e.to_user_id ? `To ${nameOf(e.to_user_id)}` : 'To the whole team'} · {e.author_name} · <span className="num">{time(e.created_at)}</span></span>
                  <Button size="sm" variant="link" onClick={() => setOpen(open === e.id ? null : e.id)}><span>Read by <span className="num">{reads.length}</span> of <span className="num">{total}</span></span></Button>
                </div>
                {open === e.id && (
                  <ul className="mt-2 space-y-1 border-t border-sep pt-2 text-footnote">
                    {(e.to_user_id ? people.filter((m) => m.user_id === e.to_user_id) : people).map((m) => {
                      const r = reads.find((x) => x.user_id === m.user_id);
                      return <li key={m.user_id} className="flex justify-between gap-2"><span>{m.name}</span>{r ? <span className="text-green">Got it <span className="num">{time(r.read_at)}</span></span> : <span className="text-amber">Not yet</span>}</li>;
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// What the last team left, plus what this shift is leaving for the next one
function HandoverBlock({ d, onAdd }) {
  const [photo, setPhoto] = useState(null);
  const prev = d.previous_handover;
  const mine = d.entries.filter((e) => e.kind === 'handover' && e.state === 'kept');
  if (!prev && !mine.length && !onAdd) return null;
  return (
    <Section title="Handover">
      <div className="rounded-tile bg-surface p-4 shadow-tile">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><ArrowRightLeft size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-caption font-semibold uppercase tracking-wide text-muted">Left for you</div>
            {prev ? (
              <>
                <p className="mt-1 whitespace-pre-line text-body">{prev.handover_summary || 'No summary written.'}</p>
                {prev.photos?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {prev.photos.map((p, i) => (
                      <Pressable key={p.key || i} press aria-label="Open photo" onClick={() => setPhoto(i)} className="h-16 w-16 overflow-hidden rounded-xl bg-bg">
                        <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </Pressable>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-footnote text-muted">{dayLabel(prev.starts_at)} · signed by {prev.signed_by_name || 'the lead'}</p>
              </>
            ) : <p className="mt-1 text-subhead text-muted">No handover from the last shift here.</p>}
          </div>
        </div>
        {(mine.length > 0 || onAdd) && (
          <div className="mt-4 border-t border-sep pt-3">
            <div className="text-caption font-semibold uppercase tracking-wide text-muted">For the next team</div>
            {mine.map((e) => (
              <div key={e.id} className="mt-2 flex items-start gap-2 text-subhead">
                <span className="num shrink-0 text-muted">{time(e.created_at)}</span>
                <span className="min-w-0 flex-1 whitespace-pre-line">{e.body || 'Photo'}</span>
                {e.photos?.[0]?.url && <img src={e.photos[0].url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />}
              </div>
            ))}
            {!mine.length && <p className="mt-1 text-subhead text-muted">Nothing yet. Anything the next team should know goes here.</p>}
            {onAdd && <Button className="mt-3" size="sm" variant="soft" icon={Plus} onClick={onAdd}>Add handover note</Button>}
          </div>
        )}
      </div>
      <Lightbox photos={prev?.photos || []} index={photo} onClose={() => setPhoto(null)} />
    </Section>
  );
}

function VenueActions({ s }) {
  const [give, setGive] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="soft" icon={MessageSquareHeart} onClick={() => setGive(true)}>Give feedback</Button>
      <GiveFeedbackSheet open={give} onClose={() => setGive(false)} venueId={s.venue_id} shift={s} />
    </div>
  );
}

// The night's customer total: the lead enters it, the venue can correct it for a week, managers any time
function CustomersCard({ d, reload }) {
  const { me, log } = d;
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState('');
  const [run, busy] = useAction();
  const has = log.customers != null;
  const open = () => { setN(has ? String(log.customers) : ''); setEditing(true); };
  const save = () => run(() => api('shiftlog.customers', { shift_id: d.shift.id, customers: Number(n) }), 'Customers saved')
    .then(() => { setEditing(false); reload(); }).catch(() => {});
  const valid = /^\d{1,6}$/.test(n.trim());
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-tile border border-hairline bg-surface p-4 shadow-tile">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><Users size={20} /></div>
      {editing ? (
        <>
          <Input className="min-w-0 flex-1" type="number" inputMode="numeric" min="0" step="1" aria-label="Customers tonight" placeholder="Customers tonight"
            value={n} onChange={(e) => setN(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button busy={busy} disabled={!valid} onClick={save}>Save</Button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="text-footnote font-semibold uppercase tracking-wide text-muted">Customers tonight</div>
            {has ? (
              <div className="text-body"><span className="num text-title3 font-bold">{Number(log.customers).toLocaleString('en-GB')}</span>
                {log.customers_by_name && <span className="ml-2 text-footnote text-muted">by {log.customers_by_name}{log.customers_at ? `, ${relative(log.customers_at)}` : ''}</span>}</div>
            ) : <div className="text-subhead text-muted">Not counted yet. A rough total for the night is fine.</div>}
          </div>
          {me.can_count && <Button variant={has ? 'secondary' : 'primary'} size="sm" icon={has ? Pencil : Plus} onClick={open}>{has ? 'Correct' : 'Add count'}</Button>}
        </>
      )}
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
              <Avatar name={m.name} src={[m.photo_thumb_url, m.photo_url]} size={36} />
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

function LogSection({ d, reload, composer }) {
  const { me, log, entries } = d;
  const venue = me.access === 'venue';
  const signed = log.status === 'signed';
  const [showRemoved, setShowRemoved] = useState(false);
  const [signing, setSigning] = useState(false);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const removed = entries.filter((e) => e.state === 'removed').length;
  const shown = entries.filter((e) => (showRemoved || e.state === 'kept') && (e.kind !== 'instruction' || me.access === 'mgr' || e.read_by_me || new Date(d.shift.ends_at) <= new Date()));
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
          {me.can_write && !signed && <Composer handle={composer} shiftId={d.shift.id} onAdded={reload} />}
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

function Composer({ handle, shiftId, onAdded }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState('note');
  const box = useRef(null);
  useImperativeHandle(handle, () => ({
    handover: () => {
      setKind('handover');
      box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => box.current?.querySelector('textarea')?.focus({ preventScroll: true }), 300);
    },
  }), []);
  const ph = usePhotos();
  const [run, busy] = useAction();
  const add = () => run(() => api('shiftlog.add', { shift_id: shiftId, kind, body: text.trim(), photos: ph.files.map(({ key, name, mime }) => ({ key, name, mime })) }), 'Added to the log')
    .then(() => { setText(''); ph.setFiles([]); setKind('note'); onAdded(); }).catch(() => {});
  return (
    <div ref={box} className="scroll-mt-24 rounded-tile bg-surface p-3 shadow-tile">
      <Textarea rows={3} placeholder={kind === 'handover' ? 'For the next team, e.g. fire exit B sticks, regulars to watch' : 'What happened? e.g. 23:10 queue busy, fire exit B checked and clear'} value={text} onChange={(e) => setText(e.target.value)} />
      {ph.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {ph.files.map((f, i) => (
            <div key={f.key} className="relative h-16 w-16 overflow-hidden rounded-xl bg-bg">
              <img src={f.preview} alt="" className="h-full w-full object-cover" />
              <Pressable press aria-label="Remove photo" onClick={() => ph.setFiles((x) => x.filter((_, k) => k !== i))} className="absolute right-0.5 top-0.5 grid h-6 w-6 before:absolute before:-inset-2.5 place-items-center rounded-full bg-black/60 text-white"><X size={14} /></Pressable>
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
    <div className={cx('rounded-tile border border-hairline bg-surface p-4 shadow-tile', e.state === 'removed' && 'opacity-60')}>
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
  const [customers, setCustomers] = useState(d.log.customers != null ? String(d.log.customers) : '');
  const [run, busy] = useAction();
  const count = customers.trim();
  const badCount = count !== '' && !/^\d{1,6}$/.test(count);
  const sign = () => run(() => api('shiftlog.sign', { shift_id: d.shift.id, handover_summary: text.trim(), ...(count && d.me.can_count ? { customers: Number(count) } : {}) }),
    'Signed off. The venue and the next team have been told.').then(onDone).catch(() => {});
  const kept = d.entries.filter((e) => e.state === 'kept').length;
  return (
    <Sheet open onClose={onClose} title="Sign off the shift"
      footer={<><Button variant="secondary" onClick={onClose}>Not yet</Button><Button icon={Check} busy={busy} disabled={badCount} onClick={sign}>Sign off</Button></>}>
      <div className="space-y-4">
        <p className="text-body text-muted">
          {kept} entr{kept === 1 ? 'y' : 'ies'} will stay in the log. The venue can read it once signed, and the next team at {d.shift.venue_name} sees your handover.
        </p>
        {d.me.can_count && (
          <Input label="Customers tonight" type="number" inputMode="numeric" min="0" step="1" value={customers} onChange={(e) => setCustomers(e.target.value)}
            error={badCount ? 'Enter a whole number' : undefined}
            hint={count ? 'The venue sees this, and it feeds the analytics.' : 'Leave it empty if you did not count. A rough total helps the venue plan staffing.'} />
        )}
        <Textarea label="Handover for the next team" rows={6} placeholder="e.g. Quiet night. Watch for the group in red from last week. Fire exit B alarm is faulty." value={text} onChange={(e) => setText(e.target.value)} />
        {d.bans.some((b) => b.status === 'proposed') && <p className="flex items-center gap-1.5 text-footnote font-semibold text-amber"><Ban size={14} />Some bans are still waiting to be confirmed.</p>}
      </div>
    </Sheet>
  );
}
