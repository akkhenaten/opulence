// A meeting, task or time block, opened (who's coming, reply, propose a new time, reminders, Add to calendar) and the
// form it's made in, with each person's free/busy for the day and the next free times. Meetings and tasks can repeat;
// a change then applies to this time or this and the following. Shared by the Calendar page and the officer's Shifts.
import { useEffect, useMemo, useState } from 'react';
import {
  AlarmClock, BadgeCheck, CalendarClock, CalendarPlus, Check, CircleHelp, Clock, ExternalLink, Lock, MapPin, Pencil, Phone, Plus, PoundSterling, Repeat, Send, Sparkles, Trash2, TriangleAlert, Users, Video, X,
} from 'lucide-react';
import { api, API_BASE } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';
import {
  addDays, Avatar, Button, Callout, Chips, cx, dayLabel, Empty, ErrorBox, Input, List, Load, money, Pill, Pressable, range, Row, SearchInput, Section, Segmented, Select, Sheet, Spinner, Textarea, time, Toggle, useAction, useApi, useConfirm, nameMatches,
} from '../../ui/index.jsx';
import { londonIso, londonParts } from '../manager/_parts.jsx';

export const RESPONSE = {
  accepted: { label: 'Going', tone: 'green' },
  maybe: { label: 'Maybe', tone: 'amber' },
  declined: { label: 'Declined', tone: 'grey' },
  pending: { label: 'Awaiting reply', tone: 'blue' },
};
const REMINDERS = [{ value: 1440, label: '1 day before' }, { value: 60, label: '1 hour' }, { value: 30, label: '30 min' }, { value: 10, label: '10 min' }, { value: 0, label: 'At the start' }];
const WHERE = [
  { value: 'none', label: 'No place' }, { value: 'venue', label: 'At a venue' }, { value: 'hq', label: 'Head office' },
  { value: 'address', label: 'Another address' }, { value: 'phone', label: 'Phone call' }, { value: 'video', label: 'Video call (Teams, Zoom, Meet)' },
];

// What it is: a meeting; a task (a company manager books someone's time); my own time block, which others see as Busy
export const KIND = { meeting: 'Meeting', task: 'Task', block: 'Time block' };
const KIND_WORD = { meeting: 'meeting', task: 'task', block: 'time block' };
const REPEAT = [{ value: '', label: 'Doesn\u2019t repeat' }, { value: 'daily', label: 'Every day' }, { value: 'weekly', label: 'Every week' }, { value: 'fortnightly', label: 'Every two weeks' }, { value: 'monthly', label: 'Every month' }];
const SCOPE = [{ value: 'one', label: 'This time only' }, { value: 'following', label: 'This and the following' }];

const lastDay = (e) => londonParts(new Date(new Date(e.ends_at).getTime() - 1)).date;
/** "Thu 20 Nov · 14:00–15:00", an all-day span, or a meeting that runs past midnight. */
export function whenText(e) {
  const a = londonParts(e.starts_at).date;
  if (e.all_day) return a === lastDay(e) ? `${dayLabel(e.starts_at)} · All day` : `${dayLabel(a)} – ${dayLabel(lastDay(e))}`;
  return a === lastDay(e) ? `${dayLabel(e.starts_at)} · ${range(e.starts_at, e.ends_at)}` : `${dayLabel(e.starts_at)} ${time(e.starts_at)} – ${dayLabel(e.ends_at)} ${time(e.ends_at)}`;
}
export const roleLine = (p) => [ROLE_LABEL[p.role] || '', p.venue_names].filter(Boolean).join(' · ');
const mapLink = (where) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
const mins = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

// London date + times from a meeting, and back: an end at or before the start runs to the next day
const toFields = (e) => ({
  date: londonParts(e.starts_at).date, start: londonParts(e.starts_at).time, end: londonParts(e.ends_at).time, all_day: !!e.all_day, end_date: e.all_day ? lastDay(e) : londonParts(e.starts_at).date,
});
function fromFields(f) {
  if (f.all_day) return { starts_at: londonIso(f.date, '00:00'), ends_at: londonIso(addDays(f.end_date < f.date ? f.date : f.end_date, 1), '00:00'), all_day: true };
  const starts_at = londonIso(f.date, f.start);
  let ends_at = londonIso(f.date, f.end);
  if (new Date(ends_at) <= new Date(starts_at)) ends_at = londonIso(addDays(f.date, 1), f.end);
  return { starts_at, ends_at, all_day: false };
}

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function TimeFields({ f, set, allDay = true }) {
  return (
    <div className="space-y-3">
      {allDay && <Toggle checked={f.all_day} onChange={(v) => set({ all_day: v })} label="All day" />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Input label={f.all_day ? 'From' : 'Date'} type="date" value={f.date} onChange={(e) => set({ date: e.target.value, ...(f.end_date < e.target.value ? { end_date: e.target.value } : {}) })} className="col-span-2 sm:col-span-1" />
        {f.all_day
          ? <Input label="To" type="date" min={f.date} value={f.end_date} onChange={(e) => set({ end_date: e.target.value })} className="col-span-2 sm:col-span-1" />
          : <>
            <Input label="Starts" type="time" step="300" value={f.start} onChange={(e) => {
              // Moving the start keeps the length
              const len = mins(londonIso(f.date, f.start), fromFields(f).ends_at);
              const end = londonParts(new Date(new Date(londonIso(f.date, e.target.value)).getTime() + len * 60000)).time;
              set({ start: e.target.value, end });
            }} />
            <Input label="Ends" type="time" step="300" value={f.end} onChange={(e) => set({ end: e.target.value })} />
          </>}
      </div>
    </div>
  );
}

/* ---------- The meeting, opened ---------- */

export function EventSheet({ id, onClose, onChanged, onEdit }) {
  const { user } = useAuth();
  const q = useApi('calendar.get', { id });
  const [run, busy] = useAction();
  const [note, setNote] = useState('');
  const [proposing, setProposing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [replyAll, setReplyAll] = useState(true);
  const [holding, setHolding] = useState(false);
  const e = q.data;
  const done = (r) => {
    // A time block is taken off rather than crossed out
    if (r?.removed) { onChanged?.(); onClose(); return; }
    q.setData(r);
    onChanged?.();
  };
  const act = (action, body, msg) => run(() => api(action, { id, ...body }), msg).then(done).catch(() => {});

  const mine = e?.organiser_id === user.id;
  const kind = e?.kind || 'meeting';
  const block = kind === 'block';
  const series = e?.series;
  const later = series?.later || 0;
  const proposals = (e?.attendees || []).filter((a) => a.proposed_start);
  const Icon = { venue: MapPin, hq: MapPin, address: MapPin, phone: Phone, video: Video }[e?.where_kind];

  const footer = e && !e.cancelled_at && e.can_edit && !cancelling && !proposing && (
    <>
      <Button variant="secondary" className="text-red" icon={block ? Trash2 : undefined} onClick={() => setCancelling({ note: '', scope: 'one' })}>{block ? 'Remove' : `Cancel ${KIND_WORD[kind]}`}</Button>
      <Button icon={Pencil} onClick={() => onEdit(e)}>Edit</Button>
    </>
  );

  return (
    <Sheet open onClose={onClose} title={e?.title || KIND[kind]} footer={footer} side>
      {q.error && !e ? <ErrorBox error={q.error} retry={q.reload} /> : !e ? <Spinner /> : (
        <div className="space-y-5">
          <div className="space-y-2">
            {e.cancelled_at && <Callout tone="warning" title="Cancelled">{e.cancel_note || 'Everyone on it was told.'}</Callout>}
            <div className={cx('flex items-center gap-2 text-callout font-semibold', e.cancelled_at && 'line-through opacity-60')}><Clock size={18} className="shrink-0 text-muted" />{whenText(e)}</div>
            {e.where && (
              <div className="flex items-start gap-2 text-body">
                <Icon size={18} className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  {e.where_kind === 'video'
                    ? <Button variant="link" href={e.video_url} target="_blank" rel="noreferrer" iconRight={ExternalLink}>Join the call</Button>
                    : e.where_kind === 'phone'
                      ? <a className="text-blue" href={`tel:${e.phone.replace(/\s/g, '')}`}>{e.where}</a>
                      : <><div>{e.where}</div><Button variant="link" size="sm" href={mapLink(e.where)} target="_blank" rel="noreferrer" iconRight={ExternalLink}>Map</Button></>}
                </div>
              </div>
            )}
            {series && (
              <div className="flex items-center gap-2 text-subhead"><Repeat size={18} className="shrink-0 text-muted" />{series.text}{series.total > 1 && <span className="text-muted">· time {series.n} of {series.total}</span>}</div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-footnote text-muted">
              {kind !== 'meeting' && <Pill tone={block ? 'grey' : 'blue'}>{KIND[kind]}</Pill>}
              {e.paid && <Pill tone="green">{e.pay ? (e.pay_rate != null ? `Paid · ${money(e.pay_rate)}/h` : 'Paid · usual rates') : 'Paid'}</Pill>}
              {e.private && <span className="inline-flex items-center gap-1"><Lock size={13} />{mine ? 'Private: others see Busy' : 'Private'}</span>}
              {!block && <span>{kind === 'task' ? 'Booked by' : 'Organised by'} {mine ? 'you' : e.organiser_name}</span>}
              {block && !mine && <span>{e.organiser_name}'s own time</span>}
            </div>
          </div>

          {/* Paid time: after it ends the organiser (or another company manager) confirms who came */}
          {e.pay && e.ended && !e.cancelled_at && <HeldSummary e={e} busy={busy} onAsBooked={() => act('calendar.held', { all: true }, 'Confirmed. Their pay is on the next pay run.')} onChange={() => setHolding(true)} />}

          {/* My reply */}
          {e.me && !mine && !e.cancelled_at && (
            <Section title="Your reply">
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[['accepted', 'Accept', Check], ['maybe', 'Maybe', CircleHelp], ['declined', 'Decline', X]].map(([r, label, I]) => (
                    <Button key={r} variant={e.me.response === r ? 'primary' : 'secondary'} icon={I} busy={busy}
                      onClick={() => act('calendar.respond', { response: r, note, ...(later && replyAll ? { scope: 'all' } : {}) }, r === 'declined' ? 'Declined. The organiser is told.' : 'Reply sent')}>{label}</Button>
                  ))}
                </div>
                {later > 0 && <Toggle checked={replyAll} onChange={setReplyAll} label="The same for every time after this" hint={`${later} more time${later === 1 ? '' : 's'} to come`} />}
                <Input placeholder="Add a note (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} />
                {e.me.proposed_start && !proposing && <Callout tone="info" icon={CalendarClock}>You proposed {whenText({ starts_at: e.me.proposed_start, ends_at: e.me.proposed_end })}. Waiting for {e.organiser_name}.</Callout>}
                {!proposing
                  ? <Button variant="soft" icon={CalendarClock} onClick={() => setProposing({ ...toFields(e), note: '' })}>Propose a new time</Button>
                  : (
                    <div className="space-y-3 rounded-2xl bg-fill/60 p-3">
                      <TimeFields f={proposing} set={(p) => setProposing((s) => ({ ...s, ...p }))} allDay={false} />
                      <Input placeholder={`A note for ${e.organiser_name} (optional)`} value={proposing.note} onChange={(ev) => setProposing((s) => ({ ...s, note: ev.target.value }))} />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setProposing(null)}>Back</Button>
                        <Button icon={Send} busy={busy} onClick={() => act('calendar.propose', { ...fromFields(proposing), note: proposing.note }, `Sent to ${e.organiser_name}`).then(() => setProposing(null))}>Send proposal</Button>
                      </div>
                    </div>
                  )}
              </div>
            </Section>
          )}

          {cancelling && (
            <div className="space-y-3 rounded-2xl bg-red-soft/50 p-3">
              <div className="text-subhead font-semibold">{block ? 'Remove this time block?' : `Cancel this ${KIND_WORD[kind]}?`}</div>
              {later > 0 && <Segmented full value={cancelling.scope} onChange={(v) => setCancelling((c) => ({ ...c, scope: v }))} options={SCOPE} />}
              {!block && <Textarea rows={2} placeholder="Why (optional) — everyone on it gets this" value={cancelling.note} onChange={(ev) => setCancelling((c) => ({ ...c, note: ev.target.value }))} />}
              {!mine && <p className="text-footnote text-muted">You're cancelling {e.organiser_name}'s {KIND_WORD[kind]}. It's recorded in history.</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCancelling(null)}>Keep it</Button>
                <Button variant="danger" busy={busy} onClick={() => act('calendar.cancel', { note: cancelling.note, scope: cancelling.scope }, block ? 'Removed' : 'Cancelled. Everyone is told.').then(() => setCancelling(null))}>
                  {block ? 'Remove' : e.attendees.length > 1 ? 'Cancel and tell everyone' : 'Cancel it'}
                </Button>
              </div>
            </div>
          )}

          {/* Proposed times, for the organiser (or a company manager) to answer */}
          {e.can_edit && proposals.length > 0 && (
            <Section title="New times proposed" icon={CalendarClock} count={proposals.length}>
              <div className="space-y-2">
                {proposals.map((a) => (
                  <div key={a.user_id} className="rounded-2xl bg-amber-soft/60 p-3">
                    <div className="text-subhead"><span className="font-semibold">{a.name}</span> asks for <span className="font-semibold">{whenText({ starts_at: a.proposed_start, ends_at: a.proposed_end })}</span></div>
                    {a.proposal_note && <p className="mt-1 text-footnote text-muted">“{a.proposal_note}”</p>}
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" busy={busy} onClick={() => act('calendar.decideProposal', { user_id: a.user_id, accept: false }, `Kept the time. ${a.name} is told.`)}>Keep current time</Button>
                      <Button size="sm" icon={Check} busy={busy} onClick={() => act('calendar.decideProposal', { user_id: a.user_id, accept: true }, 'Moved. Everyone is asked again.')}>Use this time</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!block && <Section title={kind === 'task' ? 'Booked' : "Who's coming"} icon={Users} count={e.attendees.length}>
            <List>
              {e.attendees.map((a) => (
                <Row key={a.user_id} left={<Avatar name={a.name} size={36} />} title={a.user_id === user.id ? `${a.name} (You)` : a.name}
                  subtitle={[a.organiser ? 'Organiser' : roleLine(a), a.note && `“${a.note}”`].filter(Boolean).join(' · ')}
                  right={!a.organiser && <Pill tone={RESPONSE[a.response].tone}>{a.proposed_start ? 'New time?' : RESPONSE[a.response].label}</Pill>} />
              ))}
            </List>
          </Section>}

          {e.notes && <Section title="Notes"><p className="whitespace-pre-line rounded-2xl bg-surface p-3 text-body shadow-tile">{e.notes}</p></Section>}

          {e.me && !e.cancelled_at && (
            <Section title="Reminders" icon={AlarmClock}>
              <Chips options={REMINDERS} value={e.me.reminders || []} onChange={(list) => act('calendar.reminders', { reminders: list }, list.length ? 'Reminders saved' : 'Reminders off')} />
            </Section>
          )}

          {e.ics && <Button variant="secondary" icon={CalendarPlus} href={`${API_BASE}?ics=${encodeURIComponent(e.ics)}`} className="w-full">Add to Outlook, Apple or Google</Button>}
        </div>
      )}
      {holding && e && <HeldSheet e={e} onClose={() => setHolding(false)} onDone={(r) => { setHolding(false); done(r); }} />}
    </Sheet>
  );
}

/* ---------- Paid time: Was this held? ---------- */

const payText = (p) => (p.attended ? `${p.hours} h × ${money(p.rate)} = ${money(p.amount)}` : 'Didn\u2019t attend');

function HeldSummary({ e, busy, onAsBooked, onChange }) {
  const word = KIND_WORD[e.kind];
  if (!e.pay.length) return <Callout tone="info" icon={PoundSterling}>Paid, but no officers are on this {word}, so there is nothing to confirm.</Callout>;
  if (!e.held_at) {
    return (
      <Section title="Was this held?" icon={PoundSterling}>
        <div className="space-y-3 rounded-2xl bg-amber-soft/60 p-3">
          <p className="text-subhead">It has ended. Confirm who came and for how long, and their paid time goes on the next pay run.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onChange}>Other times or not there</Button>
            <Button icon={Check} busy={busy} onClick={onAsBooked}>Held as booked</Button>
          </div>
        </div>
      </Section>
    );
  }
  return (
    <Section title="Held" icon={BadgeCheck}>
      <div className="space-y-2">
        <List>
          {e.pay.map((p) => <Row key={p.officer_id} left={<Avatar name={p.name} size={32} />} title={p.name}
            subtitle={p.attended ? `${range(p.starts_at, p.ends_at)} · ${payText(p)}` : payText(p)} />)}
        </List>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <span className="text-footnote text-muted">Confirmed{e.held_by_name ? ` by ${e.held_by_name}` : ''} · {dayLabel(e.held_at)}{e.locked ? ' · its pay run is finalised' : ''}</span>
          {!e.locked && <Button size="sm" variant="soft" icon={Pencil} onClick={onChange}>Change</Button>}
        </div>
      </div>
    </Section>
  );
}

const HELD = [{ value: 'booked', label: 'As booked' }, { value: 'times', label: 'Other times' }, { value: 'absent', label: 'Didn\u2019t attend' }];

// Per officer: there as booked, there for other times, or not there. What each is paid shows as it changes.
function HeldSheet({ e, onClose, onDone }) {
  const [run, busy] = useAction();
  const date = londonParts(e.starts_at).date;
  const booked = { start: londonParts(e.starts_at).time, end: londonParts(e.ends_at).time };
  const [rows, setRows] = useState(() => Object.fromEntries(e.pay.map((p) => {
    const was = p.attended != null;
    const same = was && p.attended && new Date(p.starts_at).getTime() === new Date(e.starts_at).getTime() && new Date(p.ends_at).getTime() === new Date(e.ends_at).getTime();
    const choice = was ? (!p.attended ? 'absent' : same ? 'booked' : 'times') : p.response === 'declined' ? 'absent' : 'booked';
    return [p.officer_id, { choice, start: p.attended ? londonParts(p.starts_at).time : booked.start, end: p.attended ? londonParts(p.ends_at).time : booked.end }];
  })));
  const set = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const timesOf = (r) => (r.choice === 'booked' ? { starts_at: e.starts_at, ends_at: e.ends_at } : fromFields({ date, start: r.start, end: r.end }));
  const hoursOf = (r) => (r.choice === 'absent' ? 0 : Math.round(mins(timesOf(r).starts_at, timesOf(r).ends_at) / 0.6) / 100);
  const choices = Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, r.choice === 'times' ? timesOf(r) : r.choice]));
  const footer = <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Check} busy={busy} onClick={() => run(() => api('calendar.held', { id: e.id, choices }), 'Confirmed. Their pay is on the next pay run.').then(onDone).catch(() => {})}>Confirm</Button></>;
  return (
    <Sheet open layer="top" onClose={onClose} title="Was this held?" footer={footer}>
      <div className="space-y-4">
        <p className="text-subhead text-muted">{e.title} · {whenText(e)}. Only confirmed time is paid. It is an office cost, never billed to a venue.</p>
        {e.pay.map((p) => {
          const r = rows[p.officer_id];
          const rate = e.pay_rate ?? p.usual_rate;
          const h = hoursOf(r);
          return (
            <div key={p.officer_id} className="space-y-3 rounded-2xl bg-surface p-3 shadow-tile">
              <div className="flex items-center gap-2">
                <Avatar name={p.name} size={32} />
                <div className="min-w-0 flex-1 truncate text-body font-semibold">{p.name}</div>
                {p.response === 'declined' && <Pill tone="grey">Declined</Pill>}
              </div>
              <Segmented full value={r.choice} onChange={(v) => set(p.officer_id, { choice: v })} options={HELD} />
              {r.choice === 'times' && (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Came" type="time" step="300" value={r.start} onChange={(ev) => set(p.officer_id, { start: ev.target.value })} />
                  <Input label="Left" type="time" step="300" value={r.end} onChange={(ev) => set(p.officer_id, { end: ev.target.value })} />
                </div>
              )}
              <div className="text-footnote text-muted">
                {r.choice === 'absent' ? 'Not paid'
                  : rate == null ? <span className="text-red">No usual rate. Edit the {KIND_WORD[e.kind]} and type a rate per hour.</span>
                    : `${h} h × ${money(rate)} = ${money(h * rate)}`}
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/* ---------- Making or changing a meeting, task or time block ---------- */

/** init: { event } to edit, or { starts_at, ends_at, all_day, attendee_ids, kind } for a new one. */
export function EventForm({ init, onClose, onSaved }) {
  const { user } = useAuth();
  const opts = useApi('calendar.options', {});
  const ev = init.event;
  const [f, setF] = useState(() => ({
    title: ev?.title || '', ...toFields(ev || init),
    attendee_ids: ev ? ev.attendees.map((a) => a.user_id).filter((x) => x !== user.id || ev.organiser_id !== user.id) : init.attendee_ids || [],
    where_kind: ev?.where_kind || 'none', venue_id: ev?.venue_id || '', address: ev?.address || '', phone: ev?.phone || '', video_url: ev?.video_url || '', notes: ev?.notes || '',
    reminders: (ev?.kind || init.kind) === 'block' ? [] : [1440, 30], kind: ev?.kind || init.kind || 'meeting', private: ev ? !!ev.private : true,
    freq: '', ends: 'count', count: '10', until: '', scope: 'one',
    paid: !!ev?.paid, pay_rate: ev?.pay_rate != null ? String(ev.pay_rate) : '',
  }));
  const [dirty, setDirty] = useState(false);
  const set = (p) => { setDirty(true); setF((s) => ({ ...s, ...p })); };
  const [term, setTerm] = useState('');
  const [run, busy] = useAction();
  const confirm = useConfirm();

  const people = opts.data?.people || [];
  const known = useMemo(() => new Map([...people, ...(ev?.attendees || []).map((a) => ({ id: a.user_id, ...a }))].map((p) => [p.id, p])), [people, ev]);
  const chosen = f.attendee_ids.map((id) => known.get(id)).filter(Boolean);
  const pickable = people.filter((p) => !f.attendee_ids.includes(p.id) && nameMatches(p, term));
  const times = fromFields(f);
  const block = f.kind === 'block';
  const task = f.kind === 'task';
  const word = KIND_WORD[f.kind];
  const repeat = !ev && f.freq ? (f.ends === 'until' ? { freq: f.freq, until: f.until } : { freq: f.freq, count: Number(f.count) }) : null;
  const valid = (block || f.title.trim()) && f.date && (f.all_day || (f.start && f.end)) && (!task || f.attendee_ids.length)
    && (!repeat || (repeat.until ? repeat.until > f.date : repeat.count >= 2 && repeat.count <= 100));
  const kinds = [{ value: 'meeting', label: 'Meeting' }, ...(opts.data?.can_invite_anyone ? [{ value: 'task', label: 'Task' }] : []), { value: 'block', label: 'Block time' }];
  const following = ev?.series?.later > 0 && f.scope === 'following';
  // Paid time: company managers, on a meeting or task a company manager organises
  const canPay = !!opts.data?.can_invite_anyone && !block && (!ev || ev.organiser_role === 'company');

  // Free/busy for everyone on it, a moment after the time or the list stops changing
  const fbBody = useDebounced(useMemo(() => ({ user_ids: block ? [] : f.attendee_ids, ...times, where_kind: f.where_kind, venue_id: f.venue_id || null, exclude_id: ev?.id || null }),
    [block, f.attendee_ids, times.starts_at, times.ends_at, f.where_kind, f.venue_id, ev?.id]));
  const fb = useApi('calendar.freeBusy', fbBody, { skip: !f.date || (!f.all_day && (!f.start || !f.end)) });

  const save = async () => {
    const moved = ev && (times.starts_at !== new Date(ev.starts_at).toISOString() || times.ends_at !== new Date(ev.ends_at).toISOString());
    const others = !block && f.attendee_ids.length > 0;
    if (moved && others && !(await confirm({ title: 'Change the time?', body: `Everyone on it is asked to reply again${following ? ', for this and the following times' : ''}.`, confirm: 'Change time' }))) return;
    const { freq, ends, count, until, paid, pay_rate, ...rest } = f;
    const body = { ...rest, ...times, venue_id: f.venue_id || null, attendee_ids: block ? [] : f.attendee_ids, ...(ev ? { id: ev.id, reminders: undefined } : { repeat }), ...(canPay ? { paid, pay_rate: paid ? pay_rate : '' } : {}) };
    const msg = ev ? (others ? 'Saved. Everyone on it is told.' : 'Saved') : task ? 'Booked. They are asked to accept.' : others ? 'Invites sent' : 'Added to your calendar';
    run(() => api('calendar.save', body), msg).then(onSaved).catch(() => {});
  };

  const footer = <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={ev ? Check : Send} busy={busy} disabled={!valid} onClick={save}>{ev ? 'Save' : task ? 'Book' : !block && f.attendee_ids.length ? 'Send invites' : 'Save'}</Button></>;

  return (
    <Sheet open onClose={onClose} title={ev ? `Edit ${word}` : `New ${word}`} footer={footer} dirty={dirty} size="lg">
      {opts.error && !opts.data ? <ErrorBox error={opts.error} retry={opts.reload} /> : !opts.data ? <Spinner /> : (
        <div className="space-y-5">
          {!ev && <Segmented full value={f.kind} onChange={(v) => set({ kind: v, reminders: v === 'block' ? [] : f.kind === 'block' ? [1440, 30] : f.reminders })} options={kinds} />}
          {!ev && task && <p className="-mt-3 px-1 text-footnote text-muted">Book someone's time for a job. They accept, decline or propose another time, like an invite.</p>}
          {ev && ev.organiser_id !== user.id && <Callout tone="info">You're changing {ev.organiser_name}'s {word}. It's recorded in history.</Callout>}
          {ev?.series?.later > 0 && <Segmented full value={f.scope} onChange={(v) => setF((s) => ({ ...s, scope: v }))} options={SCOPE} />}
          <Input label={block ? 'What for (optional)' : 'Title'} placeholder={block ? 'e.g. Dentist. Others only see Busy' : task ? 'e.g. Stock-take at The Loft' : 'e.g. Toolbox talk: radios'} value={f.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!ev} />
          <TimeFields f={f} set={set} />
          {block && <Toggle checked={f.private} onChange={(v) => set({ private: v })} label="Private" hint={f.private ? 'Everyone else sees Busy, the office included' : 'The office sees what it is for'} />}

          {!ev && (
            <div className="space-y-2">
              <Select label="Repeat" value={f.freq} onChange={(e) => set({ freq: e.target.value })} options={REPEAT} />
              {f.freq && (
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Ends" value={f.ends} onChange={(e) => set({ ends: e.target.value })} options={[{ value: 'count', label: 'After a number of times' }, { value: 'until', label: 'On a date' }]} />
                  {f.ends === 'until'
                    ? <Input label="Last date" type="date" min={addDays(f.date, 1)} value={f.until} onChange={(e) => set({ until: e.target.value })} />
                    : <Input label="Times" type="number" min="2" max="100" inputMode="numeric" value={f.count} onChange={(e) => set({ count: e.target.value })} />}
                </div>
              )}
            </div>
          )}

          {!block && <Section title={task ? 'Who to book' : 'Who'} icon={Users} count={chosen.length || undefined}>
            <div className="space-y-2">
              {chosen.length > 0 && (
                <List>
                  {chosen.map((p) => (
                    <Row key={p.id} left={<Avatar name={p.name} size={32} />} title={p.name} subtitle={roleLine(p)}
                      right={<Button variant="ghost" size="sm" icon={X} iconOnly aria-label={`Remove ${p.name}`} onClick={() => set({ attendee_ids: f.attendee_ids.filter((x) => x !== p.id) })}>Remove</Button>} />
                  ))}
                </List>
              )}
              <SearchInput collapse={false} value={term} onChange={(e) => setTerm(e.target.value)} placeholder={opts.data.can_invite_anyone ? 'Add people' : 'Add a company manager'} />
              {!opts.data.can_invite_anyone && <p className="px-1 text-footnote text-muted">You can invite the office's company managers.</p>}
              {(term || !chosen.length) && pickable.length > 0 && (
                <List>
                  {pickable.slice(0, term ? 12 : 5).map((p) => (
                    <Row key={p.id} left={<Avatar name={p.name} size={32} />} title={p.name} subtitle={roleLine(p)} right={<Plus size={18} className="text-blue" />}
                      onClick={() => { set({ attendee_ids: [...f.attendee_ids, p.id] }); setTerm(''); }} />
                  ))}
                </List>
              )}
              {term && !pickable.length && <p className="px-1 text-footnote text-muted">No one by that name you can invite.</p>}
            </div>
          </Section>}

          <FreeBusy fb={fb} times={times} date={f.date} self={block} onPick={(s) => set(toFields({ ...s, all_day: false }))} />

          {!block && <Section title="Where" icon={MapPin}>
            <div className="space-y-3">
              <Select value={f.where_kind} onChange={(e) => set({ where_kind: e.target.value })} options={WHERE} />
              {f.where_kind === 'venue' && <Select value={f.venue_id} onChange={(e) => set({ venue_id: e.target.value })} placeholder="Choose the venue" options={opts.data.venues.map((v) => ({ value: v.id, label: v.name }))} />}
              {f.where_kind === 'hq' && <p className="px-1 text-footnote text-muted">{opts.data.hq_address || 'Add the head office address in Settings to show it here.'}</p>}
              {f.where_kind === 'address' && <Input placeholder="Address or postcode" value={f.address} onChange={(e) => set({ address: e.target.value })} />}
              {f.where_kind === 'phone' && <Input type="tel" placeholder="Number to call" hint="Who calls whom? Say so in the notes." value={f.phone} onChange={(e) => set({ phone: e.target.value })} />}
              {f.where_kind === 'video' && <Input type="url" placeholder="https://… (paste the Teams, Zoom or Meet link)" value={f.video_url} onChange={(e) => set({ video_url: e.target.value })} />}
            </div>
          </Section>}

          {canPay && (
            <Section title="Pay" icon={PoundSterling}>
              <div className="space-y-3">
                <Toggle checked={f.paid} onChange={(v) => set({ paid: v })} label="Paid"
                  hint={f.paid ? 'After it ends you confirm who came; their time goes on the next pay run. Never billed to a venue.' : 'Officers on it are paid for their time'} />
                {f.paid && <Input label="Rate per hour (optional)" inputMode="decimal" placeholder="Each officer’s usual rate" value={f.pay_rate} onChange={(e) => set({ pay_rate: e.target.value })}
                  hint="Leave blank to pay each officer their usual rate" />}
              </div>
            </Section>
          )}

          <Textarea label="Notes" rows={3} placeholder={block ? 'Only you see these' : "What it's about, what to bring"} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          {!ev && <Chips label="Remind me" options={REMINDERS} value={f.reminders} onChange={(list) => set({ reminders: list })} />}
        </div>
      )}
    </Sheet>
  );
}

// Each person's day as a bar from 07:00 to 22:00: shifts, other meetings and time off, the chosen time outlined
const DAY_FROM = 7 * 60;
const DAY_TO = 22 * 60;
const BUSY_TONE = { shift: 'bg-green/70', meeting: 'bg-indigo/70', off: 'bg-faint/60' };
function FreeBusy({ fb, times, date, onPick, self }) {
  const at = (iso) => mins(londonIso(date, '00:00'), iso);
  const pct = (m) => `${((Math.min(DAY_TO, Math.max(DAY_FROM, m)) - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100}%`;
  const span = (a, b) => ({ left: pct(at(a)), width: `calc(${pct(at(b))} - ${pct(at(a))})` });
  const d = fb.data;
  return (
    <Section title="Free or busy" icon={CalendarClock}>
      {!d ? (fb.error ? <ErrorBox error={fb.error} retry={fb.reload} /> : <Spinner className="py-6" />) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-surface p-3 shadow-tile">
            <div className="mb-1 ml-[88px] flex justify-between text-caption2 text-faint"><span>07:00</span><span>12:00</span><span>17:00</span><span>22:00</span></div>
            <div className="space-y-1.5">
              {d.rows.map((r) => (
                <div key={r.user_id} className="flex items-center gap-2">
                  <div className="w-20 shrink-0 truncate text-caption font-semibold">{r.name}</div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-fill">
                    {r.busy.map((b, i) => <div key={i} title={`${b.label} · ${range(b.starts_at, b.ends_at)}`} className={cx('absolute inset-y-0', BUSY_TONE[b.kind])} style={span(b.starts_at, b.ends_at)} />)}
                    <div className="absolute inset-y-0 rounded-md ring-2 ring-inset ring-blue" style={span(times.starts_at, times.ends_at)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption2 text-muted">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green/70" />Shift</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-indigo/70" />Meeting</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-faint/60" />Time off</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm ring-2 ring-blue" />{self ? 'This time' : 'This meeting'}</span>
            </div>
          </div>
          {d.clashes.length > 0 && (
            <Callout tone="warning" icon={TriangleAlert} title="Clashes">
              <ul className="space-y-0.5">{d.clashes.map((c) => <li key={c}>{c}</li>)}</ul>
            </Callout>
          )}
          {d.suggestions.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-footnote font-semibold text-muted"><Sparkles size={14} />{self ? 'You are free' : 'Everyone is free'}</div>
              <div className="flex flex-wrap gap-2">
                {d.suggestions.map((s) => <Button key={s.starts_at} size="sm" variant="soft" onClick={() => onPick(s)}>{dayLabel(s.starts_at)} {range(s.starts_at, s.ends_at)}</Button>)}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

/* ---------- Invites and proposed times waiting (from Needs you) ---------- */

export function InboxSheet({ show, onClose, onOpen }) {
  const q = useApi('calendar.upcoming', {});
  const proposals = show === 'proposals';
  if (show === 'held') {
    return (
      <Sheet open onClose={onClose} title="Paid meetings to confirm">
        <Load q={q} skeleton="rows">
          {(d) => (!d.to_confirm?.length
            ? <Empty icon={BadgeCheck} title="All confirmed" body="Paid meetings and tasks you organised show here once they end, until you confirm who came." />
            : (
              <List>
                {d.to_confirm.map((m) => (
                  <Row key={m.id} chevron onClick={() => onOpen(m.id)} left={<div className="grid h-9 w-9 place-items-center rounded-full bg-amber-soft text-amber"><PoundSterling size={18} /></div>}
                    title={m.title} subtitle={[whenText(m), `${m.officers} officer${m.officers === 1 ? '' : 's'}`].join(' · ')} />
                ))}
              </List>
            ))}
        </Load>
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={onClose} title={proposals ? 'New times proposed' : 'Invites to reply to'}>
      <Load q={q} skeleton="rows">
        {(d) => {
          const list = proposals ? d.proposals : d.invites;
          if (!list.length) return <Empty icon={CalendarClock} title={proposals ? 'No new times waiting' : 'All replied'} body={proposals ? 'When someone proposes another time for your meeting, it shows here.' : 'New invites show here until you reply.'} />;
          return (
            <List>
              {list.map((m) => (
                <Row key={`${m.id}:${m.user_id || ''}`} chevron onClick={() => onOpen(m.id)} left={<Avatar name={proposals ? m.name : m.organiser_name} size={36} />} title={m.title}
                  subtitle={proposals ? `${m.name} asks for ${whenText({ starts_at: m.proposed_start, ends_at: m.proposed_end })}`
                    : [whenText(m), m.more ? `and ${m.more} more time${m.more === 1 ? '' : 's'}` : '', `${m.kind === 'task' ? 'booked by' : 'from'} ${m.organiser_name}`].filter(Boolean).join(' · ')} />
              ))}
            </List>
          );
        }}
      </Load>
    </Sheet>
  );
}

// The next meeting, for Home: "Next: Toolbox talk with Matthew · Thu 14:00"
export function NextMeeting({ base }) {
  const q = useApi('calendar.upcoming', {});
  const n = q.data?.next;
  const waiting = q.data?.invites?.length || 0;
  if (!n && !waiting) return null;
  return (
    <Pressable card press to={n && !waiting ? `${base}?event=${n.id}` : `${base}?show=invites`} className="flex items-center gap-3 p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-soft text-indigo"><CalendarClock size={20} /></div>
      <div className="min-w-0 flex-1">
        {n && <div className="truncate text-body font-semibold">Next: {n.title}{n.with_names ? ` with ${n.with_names}` : ''}</div>}
        {n && <div className="truncate text-footnote text-muted">{whenText(n)}</div>}
        {waiting > 0 && <div className="text-footnote font-semibold text-blue">{waiting} invite{waiting === 1 ? '' : 's'} to reply to</div>}
      </div>
    </Pressable>
  );
}
