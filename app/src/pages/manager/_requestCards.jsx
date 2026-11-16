import { useState } from 'react';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { ActionBar, Button, cx, dayLabel, List, Pill, Pressable, range, Row } from '../../ui/index.jsx';
import { canCancel, canChange, LABEL, requestLine, statusOf } from './_cover.jsx';
import { Check as Tick } from './_parts.jsx';

// Shared by the venue's Requests tab and the office's Venue requests: one card per request as it was made, its dates inside

const URGENT = ['pending', 'accepted', 'filled', 'declined', 'cancelled'];
const at = (c) => new Date(c.starts_at).getTime();
const day = (c) => (c.occurs_on ? String(c.occurs_on).slice(0, 10) : null);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Dates grouped by the request they came from; a pattern changed later ("this and later dates") stays in the same card. */
export function groupRequests(list, now = Date.now()) {
  const by = new Map();
  for (const c of list) {
    const key = c.root_id || c.series_id || c.id;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(c);
  }
  return [...by.entries()].map(([key, dates]) => {
    dates.sort((a, b) => at(a) - at(b));
    // Cancelled and finished dates fold away; the rest are what the card is about
    const upcoming = dates.filter((c) => new Date(c.ends_at) > now && c.status !== 'cancelled');
    const folded = dates.filter((c) => !upcoming.includes(c));
    const live = upcoming.filter((c) => ['pending', 'accepted'].includes(c.status));
    const n = (fn) => upcoming.filter(fn).length;
    const counts = {
      pending: n((c) => c.status === 'pending'), accepted: n((c) => statusOf(c) === 'accepted'), filled: n((c) => statusOf(c) === 'filled'),
      declined: n((c) => c.status === 'declined'), change: n((c) => c.change_status === 'pending'),
    };
    const fold = { cancelled: folded.filter((c) => c.status === 'cancelled').length, past: folded.filter((c) => c.status !== 'cancelled').length };
    const status = upcoming.length ? URGENT.find((s) => upcoming.some((c) => statusOf(c) === s))
      : dates.every((c) => c.status === 'cancelled') ? 'cancelled' : statusOf(dates[dates.length - 1]);
    const segs = [];
    for (const c of dates) if (c.series_id && c.pattern && !segs.some((s) => s.series_id === c.series_id)) segs.push({ series_id: c.series_id, from: day(c), pattern: c.pattern });
    return {
      key, dates, upcoming, folded, live, counts, fold, status, segs,
      waiting: counts.pending + counts.change > 0, next: live[0] || upcoming[0] || null, first: dates[0], last: dates[dates.length - 1],
      single: dates.length === 1 && dates[0].kind !== 'recurring', conversation_id: dates.find((c) => c.conversation_id)?.conversation_id,
    };
  });
}

/** Something waiting first, then by the next date; requests with nothing ahead, newest first. */
export const sortGroups = (groups) => groups.sort((a, b) => {
  if (!!a.next !== !!b.next) return a.next ? -1 : 1;
  if (!a.next) return at(b.last) - at(a.last);
  return (b.waiting - a.waiting) || (at(a.next) - at(b.next));
});

const countsLine = ({ counts: k }) => [
  k.change && `${plural(k.change, 'change')} waiting`, k.pending && `${k.pending} waiting for reply`, k.accepted && `${k.accepted} being staffed`,
  k.filled && `${k.filled} staffed`, k.declined && `${k.declined} declined`,
].filter(Boolean).join(' · ');
const foldLine = ({ fold }) => [fold.cancelled && `${fold.cancelled} cancelled`, fold.past && `${fold.past} past`].filter(Boolean).join(' · ');

function StatePill({ c }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <Pill status={statusOf(c)}>{LABEL[statusOf(c)]}</Pill>
      {c.change_status === 'pending' && <span className="text-caption font-semibold text-amber">Change waiting</span>}
    </div>
  );
}

/**
 * The request cards. `office` puts the venue first; `many` names the venue on a venue manager's cards.
 * `actions(group, { select })` gives each card its own buttons; `onCancelDates` / `onChangeDates(dates, stop)` act on ticked dates.
 */
export function RequestCards({ groups, office, many, onOpen, actions, onCancelDates, onChangeDates }) {
  const [open, setOpen] = useState(() => new Set(groups.length === 1 ? [groups[0].key] : []));
  const [shown, setShown] = useState(new Set()); // cards whose folded dates are out
  const [pick, setPick] = useState(null); // { key, sel: Set }
  const flip = (fn, key) => fn((x) => { const n = new Set(x); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const stop = () => setPick(null);
  const tick = (id) => setPick((p) => { const sel = new Set(p.sel); if (sel.has(id)) sel.delete(id); else sel.add(id); return { ...p, sel }; });
  const picked = pick ? groups.find((g) => g.key === pick.key)?.live.filter((c) => pick.sel.has(c.id)) || [] : [];
  const title = (c) => (office ? (c.stream_name ? `${c.venue_name} · ${c.stream_name}` : c.venue_name) : c.role_name);
  const meta = (c) => [office ? c.role_name : many && c.venue_name, !office && c.stream_name, office && c.requested_by_name].filter(Boolean).join(' · ');

  const dateRow = (c, g, faded) => {
    const can = pick?.key === g.key && (canCancel(c) || canChange(c));
    const sub = <span className="num">{range(c.starts_at, c.ends_at)} · {c.headcount} staff{c.status === 'accepted' ? ` · ${c.filled}/${c.headcount} booked` : ''}</span>;
    if (pick?.key === g.key && !faded) {
      return (
        <div key={c.id} className={cx('flex items-center gap-3 px-4 py-3', !can && 'opacity-50')}>
          {can ? <Tick checked={pick.sel.has(c.id)} onChange={() => tick(c.id)} label={`Select ${dayLabel(c.starts_at)}`} /> : <span className="w-6 shrink-0" aria-hidden />}
          <Pressable press={can} disabled={!can} className="min-w-0 flex-1 text-left" onClick={() => can && tick(c.id)}>
            <div className="truncate text-body font-semibold">{dayLabel(c.starts_at)}</div>
            <div className="truncate text-footnote text-muted">{sub}</div>
          </Pressable>
          <StatePill c={c} />
        </div>
      );
    }
    return <Row key={c.id} className={cx(faded && 'opacity-60')} onClick={() => onOpen(c, g)} chevron title={dayLabel(c.starts_at)} subtitle={sub} right={<StatePill c={c} />} />;
  };

  return (
    <>
      <List>
        {groups.map((g) => {
          const c = g.next || g.last;
          if (g.single) {
            return <Row key={g.key} onClick={() => onOpen(g.first, g)} chevron title={title(c)}
              subtitle={<span className="num">{requestLine(c)}{meta(c) ? ` · ${meta(c)}` : ''}</span>} right={<StatePill c={g.first} />} />;
          }
          const isOpen = open.has(g.key);
          const counts = countsLine(g);
          const fl = foldLine(g);
          return (
            <div key={g.key}>
              <Pressable onClick={() => flip(setOpen, g.key)} aria-expanded={isOpen} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold">{title(c)}</div>
                  {g.segs.length ? g.segs.map((s, i) => (
                    <div key={s.series_id} className="text-footnote text-muted">{i ? `From ${dayLabel(s.from)}: ` : ''}{s.pattern}</div>
                  )) : <div className="num text-footnote text-muted">{requestLine(c)}</div>}
                  {meta(c) && <div className="truncate text-footnote text-muted">{meta(c)}</div>}
                  {(counts || fl) && <div className="num mt-1 text-caption font-semibold text-ink">{[counts, fl].filter(Boolean).join(' · ')}</div>}
                  {g.next && <div className="num text-caption text-muted">Next: {dayLabel(g.next.starts_at)}, {range(g.next.starts_at, g.next.ends_at)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {g.counts.change > 0 ? <Pill tone="amber">Change waiting</Pill> : <Pill status={g.status}>{LABEL[g.status]}</Pill>}
                  <ChevronDown size={18} className={cx('shrink-0 text-faint transition-transform', isOpen && 'rotate-180')} />
                </div>
              </Pressable>
              {isOpen && (
                <div className="border-t border-line bg-bg/40">
                  {actions && <div className="flex flex-wrap gap-2 px-4 py-2.5">{actions(g, { select: () => setPick({ key: g.key, sel: new Set() }), picking: pick?.key === g.key, stop })}</div>}
                  <div className="divide-y divide-line">
                    {g.upcoming.map((d) => dateRow(d, g))}
                    {!g.upcoming.length && <p className="px-4 py-3 text-footnote text-muted">No dates ahead.</p>}
                    {fl && (
                      <button type="button" className="w-full px-4 py-2.5 text-left text-footnote font-semibold text-blue" onClick={() => flip(setShown, g.key)}>
                        {shown.has(g.key) ? `Hide ${fl}` : `Show ${fl}`}
                      </button>
                    )}
                    {shown.has(g.key) && g.folded.map((d) => dateRow(d, g, true))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </List>
      <ActionBar show={picked.length > 0}>
        <span className="num mr-2 text-subhead font-semibold">{picked.length} selected</span>
        {onCancelDates && <Button variant="secondary" size="sm" icon={Trash2} disabled={!picked.some((c) => canCancel(c))} onClick={() => onCancelDates(picked, stop)}>Cancel {picked.length}</Button>}
        {onChangeDates && <Button size="sm" icon={Pencil} disabled={!picked.some((c) => canChange(c))} onClick={() => onChangeDates(picked, stop)}>Change {picked.length}</Button>}
      </ActionBar>
    </>
  );
}
