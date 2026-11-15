// Venue feedback: the office sees every venue it covers and replies; a venue sees its own feedback and the replies
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDot, Globe, MessageSquareHeart, Plus, Reply, Star } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useVenue } from '../../venue.jsx';
import {
  BackTo, Button, Empty, FilterBar, FilterChip, List, Load, Page, periodLabel, Pill, Segmented, Select, Sheet, Textarea, Toggle, ToolField, ToolMenu, cx, dayLabel, range, relative, useAction, useApi, useMedia, useUrlState,
} from '../../ui/index.jsx';
import { ABOUT, GiveFeedbackSheet, TONES } from '../venue/_feedback.jsx';
import { useBase } from './_parts.jsx';

const TONE_PILL = { praise: 'green', suggestion: 'blue', complaint: 'red' };
const TONE_LABEL = Object.fromEntries(TONES.map((t) => [t.value, t.label]));
const STATUS = [{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'all', label: 'All statuses' }];

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
  const [give, setGive] = useState(false);
  return (
    // The filters sit on the tab line, so the list starts high
    <FeedbackList give={give} onGive={setGive} frame={(tools, list) => (
      <Page title="Feedback" subtitle={mgr ? 'What venues tell us about staff, shifts and the service' : 'Your feedback to our office, and our replies'} tools={tools}
        actions={[{ label: 'Give feedback', icon: Plus, main: true, onClick: () => setGive(true) }]}>
        {list}
      </Page>
    )} />
  );
}

/** The feedback list with its filters and replies. With fixedVenue it shows one venue (its page's Feedback tab) and keeps filters local.
    The Feedback page opens Give feedback from its header (give/onGive) and puts the filters in its page tools (frame); elsewhere the list has its own button and filter bar. */
export function FeedbackList({ venueId, fixedVenue, onChanged, give: giveOpen, onGive, frame }) {
  const { user } = useAuth();
  const mgr = user.role !== 'venue';
  // Managers start on open feedback; status=all (or the older empty status=) shows everything
  const [url, setUrl] = useUrlState({ venue: '', tone: '', about: '', status: mgr ? 'open' : '', from: '', to: '', back: '' });
  const [local, setLocal] = useState({ tone: '', about: '', status: '' });
  const shared = useVenue();
  const f = fixedVenue ? { venue_id: venueId, ...local }
    : { venue_id: mgr ? url.venue : shared.venueId, tone: url.tone, about: url.about, status: url.status };
  const setF = (k, v) => {
    if (fixedVenue) return setLocal((s) => ({ ...s, [k]: v }));
    if (k === 'venue_id') return mgr ? setUrl({ venue: v }) : shared.setVenueId(v);
    setUrl({ [k]: v });
  };
  const clearF = () => {
    if (fixedVenue) return setLocal({ tone: '', about: '', status: '' });
    // The venue and the way back to Analytics stay
    setUrl({ tone: '', about: '', status: mgr ? 'open' : '', from: '', to: '' });
  };
  const opts = useApi('comments.options', {}, { skip: fixedVenue });
  // Opened from Analytics: the period being looked at (both days included)
  const period = fixedVenue ? {} : { from: url.from || null, to: url.to || null };
  const q = useApi('comments.list', { venue_id: f.venue_id || null, tone: f.tone || null, about: f.about || null, status: f.status === 'all' ? null : f.status || null, ...period });
  const [ownGive, setOwnGive] = useState(false);
  const give = onGive ? giveOpen : ownGive;
  const setGive = onGive || setOwnGive;
  const [reply, setReply] = useState(null);
  const venues = opts.data?.venues || [];
  const reload = () => { q.reload(); onChanged?.(); };
  const about = ABOUT.find((a) => a.value === f.about);
  const wide = useMedia('(min-width: 640px)');

  // Page tools: status (managers) stays out, type beside it from sm up, the rest in Filters
  const pick = (k, label, value, options) => <Select aria-label={label} className="w-44" value={value || ''} onChange={(e) => setF(k, e.target.value)} options={options} />;
  const typePick = pick('tone', 'Type', f.tone, [{ value: '', label: 'All types' }, ...TONES]);
  const multi = venues.length > 1;
  const changed = (!wide && !!f.tone) + (multi && !!f.venue_id) + !!f.about;
  const tools = frame && <>
    {mgr && <Segmented value={f.status || 'all'} onChange={(v) => setF('status', v)} options={STATUS.map((o) => (o.value === 'all' ? { ...o, label: 'All' } : { ...o, icon: o.value === 'open' ? CircleDot : CheckCircle2 }))} />}
    {wide && typePick}
    <ToolMenu count={changed} onClear={() => { setUrl({ about: '', ...(!wide && { tone: '' }), ...(mgr && multi && { venue: '' }) }); if (!mgr && multi) shared.setVenueId(''); }}>
      {!wide && <ToolField label="Type">{typePick}</ToolField>}
      {multi && <ToolField label="Venue">{pick('venue_id', 'Venue', f.venue_id, [{ value: '', label: 'All venues' }, ...venues.map((v) => ({ value: v.id, label: v.name }))])}</ToolField>}
      <ToolField label="About">{pick('about', 'About', f.about, [{ value: '', label: 'About anything' }, ...ABOUT])}</ToolField>
    </ToolMenu>
  </>;

  const list = (
    <>
      {!frame && <FilterBar onChange={setF} onClear={clearF} filters={[
        { key: 'tone', label: 'Type', value: f.tone, options: [{ value: '', label: 'All types' }, ...TONES] },
        mgr && { key: 'status', label: 'Status', value: f.status || 'all', empty: fixedVenue ? 'all' : 'open', options: STATUS },
        !fixedVenue && venues.length > 1 && { key: 'venue_id', label: 'Venue', value: f.venue_id || '', options: [{ value: '', label: 'All venues' }, ...venues.map((v) => ({ value: v.id, label: v.name }))] },
        { key: 'about', label: 'About', value: f.about, options: [{ value: '', label: 'About anything' }, ...ABOUT], display: about && `About ${about.label.toLowerCase()}` },
      ]}>
        {!onGive && <Button icon={Plus} onClick={() => setGive(true)}>Give feedback</Button>}
      </FilterBar>}
      {!fixedVenue && url.back && <BackTo to={url.back} label="Analytics" />}
      {(period.from || period.to) && (
        <FilterChip label={[mgr && f.venue_id && venues.find((v) => v.id === f.venue_id)?.name, periodLabel(period.from, period.to)].filter(Boolean).join(' · ')}
          onClear={() => setUrl({ from: '', to: '', ...(mgr && { venue: '' }) })} />
      )}
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
  return frame ? frame(tools, list) : list;
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
  if (!c.comment?.trim()) return null;
  if (c.on_website === false && !c.public) {
    return (
      <p className="mt-2 text-footnote text-muted">
        <Globe size={14} className="mr-1 inline" aria-hidden />{c.venue_name} is hidden from the website. <Link className="font-semibold text-blue" to={`${base}/venues/${c.venue_id}?tab=details`}>Show it</Link> to share praise there.
      </p>
    );
  }
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
