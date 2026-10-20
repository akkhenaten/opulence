// Ops AI on the venue portal: rate the officers who worked your recent shifts
import { useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Input, Pressable, Tile, cx, dayLabel, range, useAction, useApi } from '../../ui/index.jsx';

function Stars({ value, onChange }) {
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

export function FeedbackTile({ multi }) {
  const q = useApi('feedback.pending', {});
  const list = q.data || [];
  if (!list.length) return null;
  return (
    <Tile title="Rate your recent officers" icon={Star} className="mb-4">
      <p className="-mt-1 mb-3 text-subhead text-muted">How did they do? It takes a few seconds and helps us send the right people.</p>
      <div className="space-y-3">{list.slice(0, 3).map((s) => <ShiftRating key={s.shift_id} s={s} multi={multi} onDone={q.reload} />)}</div>
    </Tile>
  );
}
