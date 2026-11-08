import { useState } from 'react';
import { CalendarPlus, Check, CheckCircle2, CircleHelp, Eye, Lock, Users, XCircle } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, Input, Load, Pressable, relative, Segmented, Sheet, useAction, useApi, useConfirm, useToast } from '../../ui/index.jsx';
import { badge, isMgr, PlaceLine, ROLE_LABEL, whenText } from './_parts.jsx';

/** Coloured banner for a shout-out: the badge and who it's for */
export function ShoutoutCard({ post, onPerson }) {
  const b = badge(post.shoutout?.badge);
  const to = post.shoutout?.to || [];
  return (
    <div className="mx-4 mt-3 rounded-2xl bg-gradient-to-br from-amber-soft to-blue-soft p-4 text-center">
      <div className="text-[44px] leading-none">{b?.emoji || '🌟'}</div>
      <div className="mt-1 text-headline font-bold">{b?.label || 'Shout-out'}</div>
      {to.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {to.map((p) => (
            <Pressable press key={p.id} onClick={() => onPerson(p.id)} className="flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-3 shadow-sm">
              <Avatar name={p.name} src={[p.photo_thumb_url, p.photo_url]} size={26} /><span className="text-footnote font-semibold">{p.name}</span>
            </Pressable>
          ))}
        </div>
      )}
    </div>
  );
}

/** Birthday, anniversary, welcome or new qualification, posted by Orb */
export function CelebrationCard({ post, onChanged, onPerson }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const c = post.celebration || {};
  const emoji = { birthday: '🎂', anniversary: '🎉', welcome: '👋', qualification: '🎓' }[c.type] || '🎉';
  const title = { birthday: 'Happy birthday!', anniversary: c.years ? `${c.years} year${c.years === 1 ? '' : 's'} with the team` : 'Work anniversary', welcome: 'Welcome to the team', qualification: 'New qualification' }[c.type];
  const hide = async () => {
    if (!(await confirm({ title: 'Remove this post about you?', body: 'It is taken off Everyday for everyone.', confirm: 'Remove' }))) return;
    api('everyday.hideCelebration', { id: post.id }).then(() => { toast('Removed'); onChanged?.(); }).catch((e) => toast(e.message, 'error'));
  };
  return (
    <div className="mx-4 mt-3 rounded-2xl bg-gradient-to-br from-blue-soft to-green-soft p-4 text-center">
      {c.type === 'welcome' && c.person ? (
        <Pressable press onClick={() => onPerson?.(c.person.id)} className="mx-auto flex flex-col items-center">
          <Avatar name={c.person.name} src={[c.person.photo_url, c.person.photo_thumb_url]} size={96} className="ring-4 ring-surface shadow-tile" />
          <div className="mt-2 text-headline font-bold">{title} 👋</div>
          <div className="text-subhead font-semibold text-ink">{c.person.name}</div>
          {ROLE_LABEL[c.person.role] && <div className="text-footnote text-muted">{ROLE_LABEL[c.person.role]}</div>}
        </Pressable>
      ) : (
        <>
          <div className="text-[44px] leading-none">{emoji}</div>
          <div className="mt-1 text-headline font-bold">{title}</div>
        </>
      )}
      {c.course && <div className="text-subhead text-muted">{c.course}</div>}
      {c.user_id === user.id && <Button size="sm" variant="ghost" className="mt-2" onClick={hide}>Remove this post</Button>}
    </div>
  );
}

/** Vote, change your vote, see results (and who, unless anonymous), close */
export function PollCard({ post, onUpdate }) {
  const { user } = useAuth();
  const toast = useToast();
  const p = post.poll;
  const [pick, setPick] = useState(p.mine || []);
  const [busy, setBusy] = useState(false);
  const [voters, setVoters] = useState(false);
  const [changing, setChanging] = useState(false);
  const voted = p.mine?.length > 0;
  const canVote = !p.closed && (!voted || changing);
  const vote = async (ids) => {
    setBusy(true);
    try {
      const poll = await api('everyday.vote', { post_id: post.id, option_ids: ids });
      onUpdate({ ...post, poll }); setChanging(false);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const tap = (id) => {
    if (!canVote) return;
    if (!p.multi) { setPick([id]); vote([id]); return; }
    setPick((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  };
  const close = () => api('everyday.closePoll', { post_id: post.id }).then(() => { toast('Poll closed'); onUpdate({ ...post, poll: { ...p, closed: true, results_visible: true } }, true); }).catch((e) => toast(e.message, 'error'));
  const max = Math.max(1, ...p.options.map((o) => o.count || 0));
  return (
    <div className="mx-4 mt-3 space-y-2">
      {p.options.map((o) => {
        const on = (canVote ? pick : p.mine || []).includes(o.id);
        const pct = p.results_visible && p.total ? Math.round(((o.count || 0) / p.total) * 100) : null;
        return (
          <Pressable press key={o.id} disabled={!canVote || busy} onClick={() => tap(o.id)}
            className={cx('relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left', on ? 'border-blue' : 'border-line', canVote && 'hover:bg-bg')}>
            {pct != null && !canVote && <span className={cx('absolute inset-y-0 left-0', on ? 'bg-blue-soft' : 'bg-bg')} style={{ width: `${((o.count || 0) / max) * 100}%` }} />}
            <span className={cx('relative grid h-5 w-5 shrink-0 place-items-center border-2', p.multi ? 'rounded-md' : 'rounded-full', on ? 'border-blue bg-blue text-white' : 'border-line')}>{on && <Check size={12} strokeWidth={3} />}</span>
            <span className="relative min-w-0 flex-1 text-body">{o.text}</span>
            {pct != null && !canVote && <span className="relative text-subhead font-semibold">{pct}%</span>}
          </Pressable>
        );
      })}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-muted">
        <span>{p.total} vote{p.total === 1 ? '' : 's'}</span>
        {p.anonymous && <span className="inline-flex items-center gap-1"><Lock size={12} /> Anonymous</span>}
        {p.closed ? <span className="font-semibold">Closed</span> : p.closes_at && <span>Closes {whenText(p.closes_at)}</span>}
        {!p.results_visible && !p.closed && <span>Results show after you vote</span>}
        {canVote && p.multi && <Button size="sm" busy={busy} disabled={!pick.length} onClick={() => vote(pick)}>Vote</Button>}
        {voted && !p.closed && !changing && <Pressable press className="font-semibold text-blue" onClick={() => { setPick(p.mine); setChanging(true); }}>Change vote</Pressable>}
        {changing && <Pressable press className="font-semibold" onClick={() => setChanging(false)}>Cancel</Pressable>}
        {!p.anonymous && p.results_visible && p.total > 0 && <Pressable press className="font-semibold text-blue" onClick={() => setVoters(true)}>See who voted</Pressable>}
        {!p.closed && (post.author.id === user.id || isMgr(user)) && <Pressable press className="font-semibold" onClick={close}>Close poll</Pressable>}
      </div>
      <VotersSheet open={voters} post={post} onClose={() => setVoters(false)} />
    </div>
  );
}

function VotersSheet({ open, post, onClose }) {
  const q = useApi('everyday.voters', { post_id: post.id }, { skip: !open });
  return (
    <Sheet open={open} onClose={onClose} title="Who voted" size="sm">
      {open && (
        <Load q={q}>
          {(rows) => (
            <div className="space-y-4">
              {post.poll.options.map((o) => {
                const list = rows.filter((r) => r.option_id === o.id);
                return (
                  <div key={o.id}>
                    <div className="mb-1 text-footnote font-semibold text-muted">{o.text} · {list.length}</div>
                    {list.map((r) => <PersonRow key={r.person.id} p={r.person} />)}
                    {!list.length && <p className="text-footnote text-faint">No one yet</p>}
                  </div>
                );
              })}
            </div>
          )}
        </Load>
      )}
    </Sheet>
  );
}

const PersonRow = ({ p, right }) => (
  <div className="flex items-center gap-3 rounded-xl px-1 py-1.5">
    <Avatar name={p.name} src={[p.photo_thumb_url, p.photo_url]} size={34} />
    <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{p.name}</span><span className="block text-caption text-muted">{ROLE_LABEL[p.role]}</span></span>
    {right}
  </div>
);

const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
function addToCalendar(post) {
  const e = post.event;
  const end = e.ends_at || new Date(new Date(e.starts_at).getTime() + 2 * 3600000).toISOString();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Everyday//EN', 'BEGIN:VEVENT',
    `UID:${post.id}@everyday`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(e.starts_at)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    post.body && `DESCRIPTION:${icsText(post.body)}`,
    post.place && `LOCATION:${icsText([post.place.name, post.place.address].filter(Boolean).join(', '))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${e.title.replace(/[^\w ]+/g, '').trim() || 'event'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const ANSWERS = [{ value: 'going', label: 'Going', icon: CheckCircle2 }, { value: 'maybe', label: 'Maybe', icon: CircleHelp }, { value: 'no', label: "Can't go", icon: XCircle }];

/** Date block, place, who's going, RSVP, add to calendar; managers edit or cancel */
export function EventCard({ post, onUpdate, onEdit, onPerson }) {
  const { user } = useAuth();
  const toast = useToast();
  const e = post.event;
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);
  const [cancel, setCancel] = useState(false);
  const d = new Date(e.starts_at);
  const over = new Date(e.ends_at || e.starts_at) < new Date();
  const left = e.capacity ? Math.max(0, e.capacity - e.counts.going) : null;
  const rsvp = async (answer) => {
    setBusy(true);
    try {
      const r = await api('everyday.rsvp', { post_id: post.id, answer });
      if (r.answer === 'waitlist') toast("It's full — you're on the waiting list and we'll tell you if a place frees up");
      onUpdate(null, true);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-2xl border border-line">
      <div className="flex gap-3 p-3">
        <div className="grid h-14 w-14 shrink-0 place-content-center rounded-xl bg-red-soft text-center">
          <div className="text-caption2 font-bold uppercase text-red">{d.toLocaleString('en-GB', { month: 'short' })}</div>
          <div className="text-title2 font-bold leading-none">{d.getDate()}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cx('text-headline font-bold', e.cancelled_at && 'line-through opacity-60')}>{e.title}</div>
          <div className="text-subhead text-muted">{whenText(e.starts_at)}{e.ends_at ? ` – ${whenText(e.ends_at, new Date(e.ends_at).toDateString() === d.toDateString() ? { weekday: undefined, day: undefined, month: undefined } : {})}` : ''}</div>
          {post.place && <PlaceLine place={post.place} className="text-subhead" />}
        </div>
      </div>
      {e.cancelled_at ? (
        <div className="flex items-center gap-2 bg-red-soft px-3 py-2 text-subhead font-semibold text-red"><XCircle size={16} /> Cancelled</div>
      ) : (
        <div className="space-y-2 border-t border-line p-3">
          <Pressable press onClick={() => setList(true)} className="flex w-full items-center gap-2 text-left text-footnote text-muted">
            {e.going.length > 0 && <span className="flex -space-x-2">{e.going.slice(0, 5).map((p) => <Avatar key={p.id} name={p.name} src={[p.photo_thumb_url, p.photo_url]} size={24} className="ring-2 ring-surface" />)}</span>}
            <span><b className="text-ink">{e.counts.going}</b> going{e.counts.maybe ? ` · ${e.counts.maybe} maybe` : ''}{e.counts.waitlist ? ` · ${e.counts.waitlist} waiting` : ''}{left != null ? ` · ${left ? `${left} place${left === 1 ? '' : 's'} left` : 'Full'}` : ''}</span>
          </Pressable>
          {e.mine === 'waitlist' && <div className="rounded-xl bg-amber-soft px-3 py-2 text-footnote font-semibold">You're on the waiting list</div>}
          {!over && <Segmented full value={e.mine === 'waitlist' ? 'going' : e.mine || ''} onChange={(v) => !busy && rsvp(v)} options={ANSWERS} />}
          <div className="flex flex-wrap gap-2">
            {!over && <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => addToCalendar(post)}>Add to calendar</Button>}
            {isMgr(user) && !over && <Button size="sm" variant="ghost" onClick={onEdit}>Edit event</Button>}
            {isMgr(user) && !over && <Button size="sm" variant="ghost" className="text-red" onClick={() => setCancel(true)}>Cancel event</Button>}
          </div>
        </div>
      )}
      <AttendeesSheet open={list} post={post} onClose={() => setList(false)} onPerson={onPerson} />
      <CancelEventSheet open={cancel} post={post} onClose={() => setCancel(false)} onDone={() => onUpdate(null, true)} />
    </div>
  );
}

function AttendeesSheet({ open, post, onClose, onPerson }) {
  const q = useApi('everyday.attendees', { post_id: post.id }, { skip: !open });
  const [tab, setTab] = useState('going');
  return (
    <Sheet open={open} onClose={onClose} title={post.event.title} size="sm">
      {open && (
        <Load q={q}>
          {(rows) => {
            const count = (a) => rows.filter((r) => r.answer === a).length;
            const tabs = [{ value: 'going', label: `Going ${count('going')}` }, { value: 'maybe', label: `Maybe ${count('maybe')}` }, { value: 'waitlist', label: `Waiting ${count('waitlist')}` }, { value: 'no', label: `Can't ${count('no')}` }];
            const shown = rows.filter((r) => r.answer === tab);
            return (
              <>
                <Segmented full className="mb-3" value={tab} onChange={setTab} options={tabs} />
                {shown.map((r) => <Pressable press key={r.person.id} className="block w-full text-left" onClick={() => { onClose(); onPerson(r.person.id); }}><PersonRow p={r.person} /></Pressable>)}
                {!shown.length && <p className="py-6 text-center text-subhead text-muted">No one</p>}
              </>
            );
          }}
        </Load>
      )}
    </Sheet>
  );
}

function CancelEventSheet({ open, post, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.eventCancel', { post_id: post.id, reason }), 'Event cancelled — everyone who answered is told').then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title="Cancel this event?" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Keep it</Button><Button variant="danger" busy={busy} onClick={go}>Cancel event</Button></>}>
      <p className="mb-3 text-subhead text-muted">Everyone who said Going, Maybe or is waiting gets a notification.</p>
      <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Moved to next month" />
    </Sheet>
  );
}

/** Pinned must-acknowledge: "I've read this" for staff, "Seen by X of Y" for managers */
export function AckBar({ post, onUpdate, onAudience }) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const a = post.audience || {};
  const mgr = isMgr(user);
  const ack = async () => {
    setBusy(true);
    try { await api('everyday.ack', { id: post.id }); onUpdate({ ...post, audience: { ...a, acked_at: new Date().toISOString(), seen_at: a.seen_at || new Date().toISOString() } }); toast('Thanks — confirmed'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  if (!post.pinned_at) return null;
  const mine = post.author.id === user.id;
  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-2">
      {post.must_ack && !mine && (a.acked_at
        ? <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1.5 text-footnote font-semibold text-green"><CheckCircle2 size={15} /> You confirmed you read this</span>
        : <Button size="sm" icon={CheckCircle2} busy={busy} onClick={ack}>I've read this</Button>)}
      {mgr && a.total != null && (
        <Pressable press onClick={onAudience} className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-footnote font-semibold text-muted">
          <Eye size={15} /> Seen by {a.seen_count} of {a.total}{post.must_ack ? ` · ${a.ack_count} confirmed` : ''}
        </Pressable>
      )}
    </div>
  );
}

/** Managers: who has seen / confirmed a pinned announcement, and a reminder for the rest */
export function AudienceSheet({ post, onClose }) {
  const q = useApi('everyday.audience', { id: post?.id }, { skip: !post });
  const [tab, setTab] = useState('not');
  const [run, busy] = useAction();
  const remind = () => run(() => api('everyday.ackRemind', { id: post.id }), 'Reminder sent to everyone who has not confirmed').then(q.reload).catch(() => {});
  return (
    <Sheet open={!!post} onClose={onClose} title="Who has read it">
      {post && (
        <Load q={q}>
          {(d) => {
            const groups = {
              not: d.people.filter((p) => !p.seen_at && !p.acked_at),
              seen: d.people.filter((p) => p.seen_at && !p.acked_at),
              acked: d.people.filter((p) => p.acked_at),
            };
            const tabs = [{ value: 'not', label: `Not seen ${groups.not.length}` }, { value: 'seen', label: `${d.must_ack ? 'Seen only' : 'Seen'} ${groups.seen.length + (d.must_ack ? 0 : groups.acked.length)}` }];
            if (d.must_ack) tabs.push({ value: 'acked', label: `Confirmed ${groups.acked.length}` });
            const shown = tab === 'seen' && !d.must_ack ? [...groups.seen, ...groups.acked] : groups[tab];
            return (
              <>
                <Segmented full className="mb-3" value={tab} onChange={setTab} options={tabs} />
                {shown.map((r) => (
                  <PersonRow key={r.person.id} p={r.person}
                    right={<span className="text-caption text-faint">{r.acked_at ? `Confirmed ${relative(r.acked_at)}` : r.seen_at ? `Seen ${relative(r.seen_at)}` : ''}</span>} />
                ))}
                {!shown.length && <p className="py-6 text-center text-subhead text-muted">No one</p>}
                {d.must_ack && (
                  <div className="mt-4 rounded-2xl bg-bg p-3">
                    <Button className="w-full" icon={Users} busy={busy} disabled={!!d.can_remind_at || !(groups.not.length + groups.seen.length)} onClick={remind}>Remind the rest</Button>
                    {d.can_remind_at && <p className="mt-2 text-center text-footnote text-muted">You can send another reminder after {new Date(d.can_remind_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>}
                  </div>
                )}
              </>
            );
          }}
        </Load>
      )}
    </Sheet>
  );
}
