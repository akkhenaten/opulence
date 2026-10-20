import { Fragment, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, Input, Load, Select, Sheet, relative, useAction, useApi } from '../../ui/index.jsx';

export const REACTIONS = [
  { kind: 'like', emoji: '👍', label: 'Like' },
  { kind: 'love', emoji: '❤️', label: 'Love' },
  { kind: 'laugh', emoji: '😂', label: 'Haha' },
  { kind: 'wow', emoji: '😮', label: 'Wow' },
  { kind: 'sad', emoji: '😢', label: 'Sad' },
  { kind: 'clap', emoji: '👏', label: 'Well done' },
];
export const reaction = (k) => REACTIONS.find((r) => r.kind === k);
export const ROLE_LABEL = { officer: 'Security officer', security: 'Security manager', company: 'Manager' };
export const isMgr = (u) => u.role === 'company' || u.role === 'security';

export function useFeedBase() {
  const { user } = useAuth();
  return user.role === 'officer' ? '/officer/everyday' : `/${user.role}/everyday`;
}

// Text with @Name mentions picked out; tapping one opens their card
export function Body({ text, mentions = [], onPerson, className }) {
  if (!text) return null;
  const names = mentions.filter((m) => m?.name).sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return <div className={cx('whitespace-pre-wrap break-words', className)}>{text}</div>;
  const re = new RegExp(`@(${names.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = text.split(re);
  return (
    <div className={cx('whitespace-pre-wrap break-words', className)}>
      {parts.map((p, i) => {
        const m = i % 2 ? names.find((x) => x.name === p) : null;
        return m ? <button key={i} type="button" className="font-semibold text-blue" onClick={() => onPerson?.(m.id)}>@{p}</button> : <Fragment key={i}>{p}</Fragment>;
      })}
    </div>
  );
}

let peopleCache = null;
export function usePeople() {
  const [people, setPeople] = useState(peopleCache || []);
  useEffect(() => {
    if (peopleCache) return;
    api('everyday.people').then((p) => { peopleCache = p; setPeople(p); }).catch(() => {});
  }, []);
  return people;
}

/**
 * Textarea with @mention suggestions. Calls onChange(text, mentionIds).
 * A mention only counts while "@Full Name" is still in the text (the server checks too).
 */
export function MentionBox({ value, onChange, mentions, placeholder, rows = 3, autoFocus, className, onSubmit }) {
  const people = usePeople();
  const ref = useRef(null);
  const [query, setQuery] = useState(null);
  const update = (text, ids = mentions) => {
    onChange(text, ids.filter((id) => { const p = people.find((x) => x.id === id); return p && text.includes(`@${p.name}`); }));
  };
  const onInput = (e) => {
    const text = e.target.value;
    const caret = e.target.selectionStart;
    const m = /(?:^|\s)@([\p{L}' -]{0,30})$/u.exec(text.slice(0, caret));
    setQuery(m ? { text: m[1], start: caret - m[1].length - 1, caret } : null);
    update(text);
  };
  const list = query ? people.filter((p) => p.name.toLowerCase().includes(query.text.trim().toLowerCase())).slice(0, 6) : [];
  const pick = (p) => {
    const text = `${value.slice(0, query.start)}@${p.name} ${value.slice(query.caret)}`;
    setQuery(null);
    update(text, [...new Set([...mentions, p.id])]);
    requestAnimationFrame(() => { const at = query.start + p.name.length + 2; ref.current?.focus(); ref.current?.setSelectionRange(at, at); });
  };
  return (
    <div className="relative">
      <textarea ref={ref} rows={rows} value={value} onChange={onInput} placeholder={placeholder} autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (list.length && e.key === 'Enter') { e.preventDefault(); pick(list[0]); }
          else if (e.key === 'Escape') setQuery(null);
          else if (onSubmit && e.key === 'Enter' && !e.shiftKey && window.matchMedia('(hover: hover)').matches) { e.preventDefault(); onSubmit(); }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className={cx('w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-faint', className)} />
      {list.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {list.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg">
              <Avatar name={p.name} src={p.photo_url} size={30} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{p.name}</span>
              <span className="text-[12px] text-muted">{ROLE_LABEL[p.role]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Lightbox({ photos, index, onClose }) {
  const [i, setI] = useState(index);
  useEffect(() => setI(index), [index]);
  useEffect(() => {
    if (index == null) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, photos.length - 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0)); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [index, photos.length, onClose]);
  if (index == null || !photos[i]) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90" onClick={onClose}>
      <img src={photos[i].url} alt="" className="max-h-[92vh] max-w-[96vw] object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" aria-label="Close" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" onClick={onClose}><X size={22} /></button>
      {photos.length > 1 && (
        <>
          <div className="absolute bottom-5 left-0 right-0 text-center text-[13px] text-white/80">{i + 1} / {photos.length}</div>
          {i > 0 && <button type="button" aria-label="Previous" className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" onClick={(e) => { e.stopPropagation(); setI(i - 1); }}><ChevronLeft size={24} /></button>}
          {i < photos.length - 1 && <button type="button" aria-label="Next" className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white" onClick={(e) => { e.stopPropagation(); setI(i + 1); }}><ChevronRight size={24} /></button>}
        </>
      )}
    </div>
  );
}

export function PhotoGrid({ photos, onOpen }) {
  if (!photos?.length) return null;
  const n = photos.length;
  const shown = photos.slice(0, 4);
  return (
    <div className={cx('grid gap-0.5 overflow-hidden', n === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
      {shown.map((p, i) => (
        <button key={p.key} type="button" onClick={() => onOpen(i)}
          className={cx('relative block bg-bg', n === 1 ? 'max-h-[520px]' : 'aspect-square', n === 3 && i === 0 && 'row-span-2 aspect-auto')}>
          <img src={p.url} alt="" loading="lazy" className={cx('h-full w-full', n === 1 ? 'max-h-[520px] object-contain' : 'object-cover')} />
          {i === 3 && n > 4 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-[26px] font-bold text-white">+{n - 4}</span>}
        </button>
      ))}
    </div>
  );
}

export function PersonSheet({ userId, onClose }) {
  const { user } = useAuth();
  const q = useApi('everyday.profile', { user_id: userId }, { skip: !userId });
  const [mute, setMute] = useState(false);
  const [run, busy] = useAction();
  const unmute = () => run(() => api('everyday.unmute', { user_id: userId }), 'Can post again').then(q.reload).catch(() => {});
  return (
    <Sheet open={!!userId} onClose={onClose} title="Profile">
      {userId && (
        <Load q={q}>
          {(d) => (
            <div>
              <div className="flex items-center gap-4">
                <Avatar name={d.person.name} src={d.person.photo_url} size={72} />
                <div className="min-w-0">
                  <div className="text-[20px] font-bold leading-tight">{d.person.name}</div>
                  <div className="text-[14px] text-muted">{ROLE_LABEL[d.person.role]} · with the team since {d.since}</div>
                  <div className="text-[13px] text-faint">{d.post_count} post{d.post_count === 1 ? '' : 's'}</div>
                </div>
              </div>
              {isMgr(user) && d.person.id !== user.id && (
                <div className="mt-4 rounded-2xl bg-bg px-4 py-3 text-[14px]">
                  {d.muted ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Can't post until {new Date(d.muted.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{d.muted.reason ? ` — ${d.muted.reason}` : ''}</span>
                      <Button size="sm" variant="secondary" busy={busy} onClick={unmute}>Let them post</Button>
                    </div>
                  ) : <Button size="sm" variant="secondary" onClick={() => setMute(true)}>Pause their posting</Button>}
                </div>
              )}
              {d.posts.length > 0 && (
                <div className="mt-5 space-y-2">
                  <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Recent posts</div>
                  {d.posts.map((p) => (
                    <div key={p.id} className="flex gap-3 rounded-2xl bg-bg p-3">
                      {p.photos[0] && <img src={p.photos[0].url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />}
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-[14px]">{p.body || 'Photo'}</div>
                        <div className="text-[12px] text-faint">{relative(p.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <MuteSheet open={mute} person={d.person} onClose={() => setMute(false)} onDone={q.reload} />
            </div>
          )}
        </Load>
      )}
    </Sheet>
  );
}

export function MuteSheet({ open, person, onClose, onDone }) {
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.mute', { user_id: person.id, days: Number(days), reason }), `${person.name} can't post for ${days} days`)
    .then(() => { onDone?.(); onClose(); }).catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title={`Pause ${person?.name || ''}'s posting`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} onClick={go}>Pause posting</Button></>}>
      <div className="space-y-3">
        <p className="text-[14px] text-muted">They can still read Everyday, but can't post or comment. They are told why.</p>
        <Select label="For" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: '1', label: '1 day' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
        <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Posted customer photos after a warning" />
      </div>
    </Sheet>
  );
}

export const RULES = [
  'Be kind. No bullying, harassment, hate or threats.',
  'No customers, incidents or evidence: no photos of faces, injuries, ID, CCTV screens or anything from a real incident. Report incidents in the Incidents screen.',
  'No personal details: names, phone numbers, car plates or addresses of customers or the public.',
  'Nothing confidential about clients, venues, pay or rotas.',
  'Managers can hide posts and pause posting. Orb AI checks posts before they go up and may flag them for a manager.',
];

export function RulesSheet({ open, onClose, onAccept }) {
  const [run, busy] = useAction();
  return (
    <Sheet open={open} onClose={onClose} title="Everyday community rules"
      footer={onAccept && <Button busy={busy} onClick={() => run(() => api('everyday.acceptRules')).then(onAccept).catch(() => {})}>I agree</Button>}>
      <p className="mb-3 text-[15px]">Everyday is for the team to share wins, news and life on shift. Before you post:</p>
      <ol className="space-y-2.5">
        {RULES.map((r, i) => <li key={i} className="flex gap-3 text-[15px]"><span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-soft text-[12px] font-bold text-blue">{i + 1}</span>{r}</li>)}
      </ol>
    </Sheet>
  );
}
