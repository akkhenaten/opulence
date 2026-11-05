// Venue feedback: the office sees every venue it covers and replies; a venue sees its own feedback and the replies
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Globe, MessageSquareHeart, Plus, Reply, Star } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, Empty, List, Load, Page, Pill, Segmented, Select, Sheet, Textarea, Toggle, cx, dayLabel, range, relative, useAction, useApi,
} from '../../ui/index.jsx';
import { ABOUT, GiveFeedbackSheet, TONES } from '../venue/_feedback.jsx';
import { useBase } from './_parts.jsx';

const TONE_PILL = { praise: 'green', suggestion: 'blue', complaint: 'red' };
const TONE_LABEL = Object.fromEntries(TONES.map((t) => [t.value, t.label]));
const STATUS = [{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: '', label: 'All' }];

export function StarsShown({ n }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} className={i <= n ? 'fill-amber text-amber' : 'text-line'} />)}
    </span>
  );
}

const aboutLine = (c) => (c.about === 'staff' ? c.officer_name || 'A member of staff'
  : c.about === 'shift' ? (c.shift_starts_at ? `Shift ${dayLabel(c.shift_starts_at)} · ${range(c.shift_starts_at, c.shift_ends_at)}` : 'A shift')
  : c.about === 'service' ? 'The service in general' : 'Other');

export default function Feedback() {
  const { user } = useAuth();
  const mgr = user.role !== 'venue';
  return (
    <Page title="Feedback" subtitle={mgr ? 'What venues tell us about staff, shifts and the service' : 'Your feedback to our office, and our replies'}>
      <FeedbackList />
    </Page>
  );
}

/** The feedback list with its filters and replies. With fixedVenue it shows one venue (its page's Feedback tab) and keeps filters local. */
export function FeedbackList({ venueId, fixedVenue, onChanged }) {
  const { user } = useAuth();
  const mgr = user.role !== 'venue';
  const [sp, setSp] = useSearchParams();
  const [local, setLocal] = useState({ tone: '', about: '', status: '' });
  const f = fixedVenue ? { venue_id: venueId, ...local }
    : { venue_id: sp.get('venue') || '', tone: sp.get('tone') || '', about: sp.get('about') || '', status: sp.get('status') ?? (mgr ? 'open' : '') };
  const setF = (k, v) => {
    if (fixedVenue) return setLocal((s) => ({ ...s, [k]: v }));
    const n = new URLSearchParams(sp); n.set(k === 'venue_id' ? 'venue' : k, v); if (!v && k !== 'status') n.delete(k === 'venue_id' ? 'venue' : k); setSp(n, { replace: true });
  };
  const opts = useApi('comments.options', {}, { skip: fixedVenue });
  const q = useApi('comments.list', { venue_id: f.venue_id || null, tone: f.tone || null, about: f.about || null, status: f.status || null });
  const [give, setGive] = useState(false);
  const [reply, setReply] = useState(null);
  const venues = opts.data?.venues || [];
  const reload = () => { q.reload(); onChanged?.(); };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented value={f.tone} onChange={(v) => setF('tone', v)} options={[{ value: '', label: 'All' }, ...TONES]} />
        {mgr && <Segmented value={f.status} onChange={(v) => setF('status', v)} options={STATUS} />}
        {!fixedVenue && venues.length > 1 && (
          <Select className="w-full sm:w-56" aria-label="Venue" value={f.venue_id} onChange={(e) => setF('venue_id', e.target.value)} placeholder="All venues"
            options={venues.map((v) => ({ value: v.id, label: v.name }))} />
        )}
        <Select className="w-full sm:w-44" aria-label="About" value={f.about} onChange={(e) => setF('about', e.target.value)} placeholder="About anything" options={ABOUT} />
        <Button className="sm:ml-auto" icon={Plus} onClick={() => setGive(true)}>Give feedback</Button>
      </div>
      <Load q={q} skeleton="rows">
        {(rows) => (!rows.length ? (
          <Empty icon={MessageSquareHeart} title={mgr ? 'No feedback here' : 'No feedback yet'}
            body={fixedVenue ? 'Feedback from this venue, and feedback logged for it, appears here.'
              : mgr ? 'Feedback from venues appears here. Complaints and low ratings also land in the Orb inbox.' : 'Tell us about our staff, a shift or the service. Only our office team sees it.'}
            action={<Button variant="soft" icon={Plus} onClick={() => setGive(true)}>Give feedback</Button>} />
        ) : (
          <List>
            {rows.map((c) => <Card key={c.id} c={c} mgr={mgr} office={user.role === 'company'} multi={!fixedVenue && venues.length > 1} onReply={() => setReply(c)} onChanged={reload} />)}
          </List>
        ))}
      </Load>
      <GiveFeedbackSheet open={give} onClose={() => setGive(false)} venueId={f.venue_id || undefined} onDone={reload} />
      <ReplySheet c={reply} onClose={() => setReply(null)} onDone={reload} />
    </>
  );
}

const REVIEW_PILL = { pending: ['amber', 'Review pending'], published: ['green', 'Review on the website'], hidden: ['grey', 'Review hidden'] };

function Card({ c, mgr, office, multi, onReply, onChanged }) {
  const rv = c.review_status && REVIEW_PILL[c.review_status];
  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={TONE_PILL[c.tone]}>{TONE_LABEL[c.tone]}</Pill>
        <StarsShown n={c.rating} />
        <span className="min-w-0 flex-1 truncate text-body font-semibold">{aboutLine(c)}</span>
        {c.public && <Pill tone="green"><Globe size={14} aria-hidden /> On website</Pill>}
        {mgr && c.status === 'open' && <Pill tone="amber">Open</Pill>}
      </div>
      {c.comment && <p className="mt-1.5 whitespace-pre-line text-body">{c.comment}</p>}
      <div className="mt-1.5 text-footnote text-muted">
        {(mgr || multi) && <>{c.venue_name} · </>}{relative(c.created_at)}
        {c.created_by_name && <> · {c.on_behalf ? `logged by ${c.created_by_name} for the venue` : c.created_by_name}</>}
      </div>
      {c.reply && (
        <div className="mt-2.5 rounded-2xl bg-bg px-3 py-2.5">
          <div className="text-footnote font-semibold">Reply{c.replied_by_name ? ` from ${c.replied_by_name}` : ''} <span className="font-normal text-muted">· {relative(c.replied_at)}</span></div>
          <p className="mt-0.5 whitespace-pre-line text-subhead">{c.reply}</p>
        </div>
      )}
      {(mgr || rv) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {mgr && <Button size="sm" variant="soft" icon={Reply} onClick={onReply}>{c.reply ? 'Reply again' : 'Reply'}</Button>}
          {rv && <Pill tone={rv[0]}>{rv[1]}</Pill>}
        </div>
      )}
      {office && c.tone === 'praise' && <WebsiteSwitch c={c} onChanged={onChanged} />}
    </div>
  );
}

// The office ticks praise onto the venue's tile on the website; the quote shows under the venue's name, never a person's
function WebsiteSwitch({ c, onChanged }) {
  const base = useBase();
  const [run] = useAction();
  if (!c.site_client) {
    return (
      <p className="mt-2 text-footnote text-muted">
        <Globe size={14} className="mr-1 inline" aria-hidden />{c.venue_name} isn't linked to a website tile yet. <Link className="font-semibold text-blue" to={`${base}/venues/${c.venue_id}?tab=details`}>Choose its tile</Link> to show praise on the website.
      </p>
    );
  }
  if (!c.comment?.trim()) return null;
  const set = (on) => run(() => api('comments.setPublic', { id: c.id, public: on }), on ? 'Now on the website' : 'Taken off the website').then(onChanged).catch(() => {});
  return (
    <div className="mt-2 rounded-2xl bg-bg px-3 py-1">
      <Toggle checked={!!c.public} onChange={set} label="Show on website" hint={`Appears on ${c.venue_name}'s tile as “— ${c.venue_name}, venue”`} />
    </div>
  );
}

function ReplySheet({ c, onClose, onDone }) {
  const [text, setText] = useState('');
  const [resolve, setResolve] = useState(true);
  const [hr, setHr] = useState(false);
  const [run, busy] = useAction();
  const close = () => { setText(''); setResolve(true); setHr(false); onClose(); };
  const send = () => run(() => api('comments.reply', { id: c.id, reply: text.trim(), resolve, hr_note: hr }), resolve ? 'Feedback resolved' : 'Reply sent')
    .then(() => { onDone(); close(); }).catch(() => {});
  return (
    <Sheet open={!!c} onClose={close} title="Reply to feedback" size="sm"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button busy={busy} disabled={!text.trim() && !resolve} onClick={send}>{text.trim() ? 'Send reply' : 'Mark resolved'}</Button></>}>
      {c && (
        <div className="space-y-4">
          <div className={cx('rounded-2xl bg-bg px-3 py-2.5')}>
            <div className="flex items-center gap-2"><Pill tone={TONE_PILL[c.tone]}>{TONE_LABEL[c.tone]}</Pill><StarsShown n={c.rating} /></div>
            <div className="mt-1 text-footnote text-muted">{c.venue_name} · {aboutLine(c)}</div>
            {c.comment && <p className="mt-1 text-subhead">{c.comment}</p>}
          </div>
          <Textarea label="Reply to the venue" rows={4} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="What we have done about it (the venue sees this)" />
          <Toggle checked={resolve} onChange={setResolve} label="Mark as resolved" />
          {c.officer_id && <Toggle checked={hr} onChange={setHr} label="Add to the officer's HR notes" hint="Saved on their record; officers don't see HR notes." />}
        </div>
      )}
    </Sheet>
  );
}
