// Venue feedback: the office sees every venue it covers and replies; a venue sees its own feedback and the replies
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Globe, MessageSquareHeart, Plus, Reply, Star } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, Empty, Input, List, Load, Page, Pill, Segmented, Select, Sheet, Textarea, Toggle, cx, dayLabel, range, relative, useAction, useApi,
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
  const [promote, setPromote] = useState(null);
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
            {rows.map((c) => <Card key={c.id} c={c} mgr={mgr} office={user.role === 'company'} multi={!fixedVenue && venues.length > 1} onReply={() => setReply(c)} onPromote={() => setPromote(c)} />)}
          </List>
        ))}
      </Load>
      <GiveFeedbackSheet open={give} onClose={() => setGive(false)} venueId={f.venue_id || undefined} onDone={reload} />
      <ReplySheet c={reply} onClose={() => setReply(null)} onDone={reload} />
      <ReviewSheet c={promote} onClose={() => setPromote(null)} onDone={reload} />
    </>
  );
}

const REVIEW_PILL = { pending: ['amber', 'Review pending'], published: ['green', 'On the website'], hidden: ['grey', 'Review hidden'] };

function Card({ c, mgr, office, multi, onReply, onPromote }) {
  const base = useBase();
  const rv = c.review_status && REVIEW_PILL[c.review_status];
  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={TONE_PILL[c.tone]}>{TONE_LABEL[c.tone]}</Pill>
        <StarsShown n={c.rating} />
        <span className="min-w-0 flex-1 truncate text-body font-semibold">{aboutLine(c)}</span>
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
          {office && c.tone === 'praise' && !c.review_id && <Button size="sm" variant="secondary" icon={Globe} onClick={onPromote}>Use as review</Button>}
          {rv && <Link to={office ? `${base}/reviews?status=${c.review_status}` : `${base}/reviews`}><Pill tone={rv[0]}>{rv[1]}</Pill></Link>}
        </div>
      )}
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

// Praise offered to the website: it becomes a pending review on the venue's website tile, to approve in Reviews
function ReviewSheet({ c, onClose, onDone }) {
  const base = useBase();
  const [v, setV] = useState(null);
  const [run, busy] = useAction();
  const open = !!c;
  const form = v || (c ? { quote: c.comment.slice(0, 600), reviewer: c.on_behalf ? '' : c.created_by_name || '', reviewer_role: 'Venue manager' } : {});
  const set = (k) => (e) => setV({ ...form, [k]: e.target.value });
  const close = () => { setV(null); onClose(); };
  const send = () => run(() => api('comments.toReview', { id: c.id, ...form }), 'Review added. Approve it in Reviews to publish it.')
    .then(() => { onDone(); close(); }).catch(() => {});
  return (
    <Sheet open={open} onClose={close} title="Use as a website review" size="sm"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button>{c?.site_client && <Button busy={busy} disabled={!form.quote?.trim()} onClick={send}>Add review</Button>}</>}>
      {c && (c.site_client ? (
        <div className="space-y-4">
          <p className="text-footnote text-muted">It is added as a pending review for {c.venue_name}'s tile on the website. Nothing is published until you approve it in Reviews.</p>
          <Textarea label="Quote" rows={4} maxLength={600} value={form.quote} onChange={set('quote')} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Who said it" placeholder="e.g. Sam, General Manager" maxLength={80} value={form.reviewer} onChange={set('reviewer')} />
            <Input label="Their role" maxLength={80} value={form.reviewer_role} onChange={set('reviewer_role')} />
          </div>
          <StarsShown n={c.rating} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-body">{c.venue_name} isn't linked to a tile on the website yet, so its reviews have nowhere to appear.</p>
          <Button variant="soft" to={`${base}/venues/${c.venue_id}?tab=details`} onClick={close}>Choose its website tile</Button>
        </div>
      ))}
    </Sheet>
  );
}
