// Orb on the venue portal: rate the officers who worked your recent shifts, and give feedback about anything
import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../../api.js';
import { useVenue } from '../../venue.jsx';
import { Avatar, Button, Empty, Input, Pressable, Segmented, Select, Sheet, Spinner, Textarea, Tile, cx, dayLabel, range, useAction, useApi } from '../../ui/index.jsx';

export function Stars({ value, onChange }) {
  return (
    <div className="-mr-1.5 flex" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable press key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => onChange(n)}
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-amber-soft">
          <Star size={24} className={cx(n <= value ? 'fill-amber text-amber' : 'text-line')} />
        </Pressable>
      ))}
    </div>
  );
}

function ShiftRating({ s, multi, onDone }) {
  const [run, busy] = useAction();
  const [r, setR] = useState({});
  const set = (id, k, v) => setR((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));
  const ratings = s.officers.filter((o) => r[o.officer_id]?.rating).map((o) => ({ officer_id: o.officer_id, ...r[o.officer_id] }));
  const submit = () => run(() => api('feedback.submit', { shift_id: s.shift_id, ratings }), 'Thanks for your feedback').then(onDone).catch(() => {});
  return (
    <div className="rounded-2xl bg-bg p-3 sm:p-4">
      <div className="text-subhead font-semibold">{dayLabel(s.starts_at)} · {range(s.starts_at, s.ends_at)} · {s.role_name}{multi && <span className="font-normal text-muted"> · {s.venue_name}</span>}</div>
      <div className="mt-2 space-y-3">
        {s.officers.map((o) => (
          <div key={o.officer_id}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-body font-semibold">{o.name}</span>
              <Stars value={r[o.officer_id]?.rating || 0} onChange={(v) => set(o.officer_id, 'rating', v)} />
            </div>
            {r[o.officer_id]?.rating > 0 && (
              <Input className="mt-1.5" aria-label={`Note about ${o.name}`} value={r[o.officer_id]?.note || ''} onChange={(e) => set(o.officer_id, 'note', e.target.value)} placeholder="Anything we should know? (optional)" />
            )}
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-3" busy={busy} disabled={!ratings.length} onClick={submit}>Send rating{ratings.length > 1 ? 's' : ''}</Button>
    </div>
  );
}

export function FeedbackTile({ multi, className = 'mb-4' }) {
  const q = useApi('feedback.pending', {});
  const list = q.data || [];
  if (!list.length) return null;
  return (
    <Tile title="Rate your recent officers" icon={Star} className={className}>
      <p className="-mt-1 mb-3 text-subhead text-muted">How did they do? It takes a few seconds and helps us send the right people. You can rate staff for 7 days after a shift.</p>
      <div className="space-y-3">{list.slice(0, 3).map((s) => <ShiftRating key={s.shift_id} s={s} multi={multi} onDone={q.reload} />)}</div>
    </Tile>
  );
}

// Rate anyone who worked at your venue in the last 7 days, without waiting to be asked
export function RateStaffSheet({ open, onClose }) {
  const { venueId } = useVenue();
  const q = useApi('feedback.recentOfficers', { venue_id: venueId || undefined }, { skip: !open });
  const [pick, setPick] = useState(null);
  const [v, setV] = useState({ rating: 0, note: '' });
  const [run, busy] = useAction();
  const close = () => { setPick(null); setV({ rating: 0, note: '' }); onClose(); };
  const send = () => run(() => api('feedback.submitAdhoc', { officer_id: pick.officer_id, venue_id: pick.venue_id || venueId || undefined, rating: v.rating, note: v.note.trim() || null }), `Thanks, ${pick.name.split(' ')[0]}'s rating is in`)
    .then(() => { setPick(null); setV({ rating: 0, note: '' }); q.reload(); }).catch(() => {});
  return (
    <Sheet open={open} onClose={close} title={pick ? `Rate ${pick.name}` : 'Rate staff'} size="sm"
      footer={pick
        ? <><Button variant="secondary" onClick={() => setPick(null)}>Back</Button><Button busy={busy} disabled={!v.rating} onClick={send}>Send rating</Button></>
        : <Button variant="secondary" onClick={close}>Close</Button>}>
      {pick ? (
        <div className="space-y-3">
          <p className="text-subhead text-muted">{pick.venue_name} · {dayLabel(pick.starts_at)}</p>
          <Stars value={v.rating} onChange={(n) => setV((s) => ({ ...s, rating: n }))} />
          <Input label="Note (optional)" value={v.note} onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))} placeholder="What went well, or what should change?" />
        </div>
      ) : !q.data ? <Spinner /> : !q.data.length ? (
        <Empty icon={Star} title="Nobody to rate" body="Officers who clocked in at your venue in the last 7 days appear here." />
      ) : (
        <div className="space-y-1">
          <p className="mb-2 text-subhead text-muted">Officers who worked at your venue in the last 7 days.</p>
          {q.data.map((o) => (
            <Pressable key={o.officer_id} onClick={() => setPick(o)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-bg">
              <Avatar name={o.name} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{o.name}</span>
                <span className="block text-footnote text-muted">{o.venue_name} · {dayLabel(o.starts_at)}</span>
              </span>
              {o.last_rating && <span className="flex items-center gap-1 text-footnote font-semibold text-amber"><Star size={14} className="fill-amber" />{o.last_rating}</span>}
            </Pressable>
          ))}
        </div>
      )}
    </Sheet>
  );
}

export const ABOUT = [{ value: 'staff', label: 'Staff' }, { value: 'shift', label: 'A shift' }, { value: 'service', label: 'Service' }, { value: 'other', label: 'Other' }];
export const TONES = [{ value: 'praise', label: 'Praise' }, { value: 'suggestion', label: 'Suggestion' }, { value: 'complaint', label: 'Complaint' }];
const blank = (shift, officerId) => ({
  about: officerId ? 'staff' : shift ? 'shift' : 'staff', officer_id: officerId || '', shift_id: shift?.id || '', rating: 0, tone: '', comment: '',
});

/**
 * "Give feedback": about a member of staff, a shift, the service or anything else. Only the office sees it.
 * Managers pass venueId to log feedback on a venue's behalf; a shift page passes the shift (and an officer) to prefill.
 */
export function GiveFeedbackSheet({ open, onClose, venueId, shift, officerId, onDone }) {
  // A venue manager's chosen venue (home tiles / top-bar chip) is the starting choice; they can still change it
  const chosen = useVenue().venueId;
  const start = venueId || shift?.venue_id || chosen || '';
  const [venue, setVenue] = useState(start);
  const opts = useApi('comments.options', venue ? { venue_id: venue } : {}, { skip: !open });
  const [v, setV] = useState(() => blank(shift, officerId));
  const [run, busy] = useAction();
  const set = (k, x) => setV((s) => ({ ...s, [k]: x }));
  useEffect(() => { if (open) { setV(blank(shift, officerId)); setVenue(start); } }, [open, shift?.id, officerId, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = opts.data;
  const vid = venue || d?.venue_id || '';
  const needsRating = v.about !== 'other';
  const ready = vid && v.tone && (!needsRating || v.rating) && (v.rating || v.comment.trim())
    && (v.about !== 'staff' || v.officer_id) && (v.about !== 'shift' || v.shift_id);
  const officers = d?.officers || [];
  const shifts = d?.shifts || [];
  const onShift = v.shift_id && shifts.find((s) => s.id === v.shift_id);
  const send = () => run(() => api('comments.save', {
    venue_id: vid, about: v.about, tone: v.tone, rating: v.rating || null, comment: v.comment.trim(),
    officer_id: v.about === 'staff' ? v.officer_id : null, shift_id: v.about === 'shift' || (v.about === 'staff' && onShift?.officers.some((o) => o.officer_id === v.officer_id)) ? v.shift_id || null : null,
  }), 'Thanks, your feedback is with our office').then(() => { onDone?.(); onClose(); }).catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title="Give feedback" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ready} onClick={send}>Send feedback</Button></>}>
      {!d ? <Spinner /> : (
        <div className="space-y-4">
          {!venueId && d.venues.length > 1 && (
            <Select label="Venue" value={vid} onChange={(e) => setVenue(e.target.value)} placeholder="Choose the venue"
              options={d.venues.map((x) => ({ value: x.id, label: x.name }))} />
          )}
          <div>
            <div className="mb-1.5 text-footnote font-semibold text-muted">What is it about?</div>
            <Segmented full value={v.about} onChange={(x) => set('about', x)} options={ABOUT} />
          </div>
          {v.about === 'staff' && (
            officers.length
              ? <Select label="Who" hint="Staff from the last 30 days" value={v.officer_id} onChange={(e) => set('officer_id', e.target.value)} placeholder="Choose an officer"
                  options={officers.map((o) => ({ value: o.officer_id, label: `${o.name} · last here ${dayLabel(o.last_shift_at)}` }))} />
              : <p className="text-subhead text-muted">Nobody has worked here in the last 30 days.</p>
          )}
          {v.about === 'shift' && (
            shifts.length
              ? <Select label="Which shift" hint="Shifts from the last 30 days" value={v.shift_id} onChange={(e) => set('shift_id', e.target.value)} placeholder="Choose a shift"
                  options={shifts.map((s) => ({ value: s.id, label: `${dayLabel(s.starts_at)} · ${range(s.starts_at, s.ends_at)} · ${s.role_name}` }))} />
              : <p className="text-subhead text-muted">No shifts here in the last 30 days.</p>
          )}
          <div>
            <div className="mb-0.5 text-footnote font-semibold text-muted">Rating{needsRating ? '' : ' (optional)'}</div>
            <Stars value={v.rating} onChange={(n) => set('rating', n === v.rating && !needsRating ? 0 : n)} />
          </div>
          <div>
            <div className="mb-1.5 text-footnote font-semibold text-muted">Is it…</div>
            <Segmented full value={v.tone} onChange={(x) => set('tone', x)} options={TONES} />
          </div>
          <Textarea label="Comment" rows={4} value={v.comment} maxLength={2000} onChange={(e) => set('comment', e.target.value)}
            placeholder={v.tone === 'complaint' ? 'What happened? We will look into it and reply.' : 'What went well, or what should change?'} />
          <p className="text-caption text-muted">Only our office team sees this. Complaints are followed up and you will see our reply under Feedback.</p>
        </div>
      )}
    </Sheet>
  );
}
