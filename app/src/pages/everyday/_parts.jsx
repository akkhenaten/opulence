import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, MapPin, Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, Input, Load, Pressable, relative, Select, Sheet, useAction, useApi } from '../../ui/index.jsx';

export const REACTIONS = [
  { kind: 'like', emoji: '👍', label: 'Like' },
  { kind: 'love', emoji: '❤️', label: 'Love' },
  { kind: 'laugh', emoji: '😂', label: 'Haha' },
  { kind: 'wow', emoji: '😮', label: 'Wow' },
  { kind: 'sad', emoji: '😢', label: 'Sad' },
  { kind: 'clap', emoji: '👏', label: 'Well done' },
];
export const reaction = (k) => REACTIONS.find((r) => r.kind === k);
// Same lists as the server (functions/api/lib/feed.mjs)
export const BADGES = [
  { id: 'above', label: 'Above and beyond', emoji: '🌟' },
  { id: 'calm', label: 'Calm under pressure', emoji: '🧊' },
  { id: 'team', label: 'Great teamwork', emoji: '🤝' },
  { id: 'customer', label: 'Customer hero', emoji: '💬' },
  { id: 'eyes', label: 'Sharp eyes', emoji: '👀' },
  { id: 'safety', label: 'Safety first', emoji: '🦺' },
  { id: 'welcome', label: 'Welcome aboard', emoji: '👋' },
];
export const badge = (id) => BADGES.find((b) => b.id === id);
export const MUTE_DAYS = [1, 7, 30, 90];
export const VIDEO_MAX_S = 60;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const ROLE_LABEL = { officer: 'Security officer', security: 'Security manager', company: 'Manager' };
export const isMgr = (u) => u.role === 'company' || u.role === 'security';

export function useFeedBase() {
  const { user } = useAuth();
  return user.role === 'officer' ? '/officer/everyday' : `/${user.role}?tab=everyday`;
}

/** Link to the feed with these params, e.g. feedHref({ topic: 'wins' }); keeps the manager Dashboard tab */
export function useFeedHref() {
  const base = useFeedBase();
  return (params = {}) => {
    const [path, qs] = base.split('?');
    const sp = new URLSearchParams(qs || '');
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') sp.set(k, v);
    const s = sp.toString();
    return s ? `${path}?${s}` : path;
  };
}

const URL_OR_TOPIC = /(https?:\/\/[^\s<>"')\]]+)|#([\p{L}][\p{L}\p{N}_]{1,39})/gu;

// Plain text with web addresses as links and #topics as buttons
function Linked({ text, onTopic }) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(URL_OR_TOPIC)) {
    if (m[2] && m.index > 0 && /[\p{L}\p{N}_&]/u.test(text[m.index - 1])) continue;
    const raw = m[1] ? m[1].replace(/[.,!?;:]+$/, '') : m[0];
    if (m.index > at) out.push(text.slice(at, m.index));
    if (m[1]) out.push(<a key={m.index} href={raw} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-blue underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>{raw.replace(/^https?:\/\/(www\.)?/, '')}</a>);
    else out.push(<Pressable press key={m.index} className="inline font-semibold text-blue" onClick={(e) => { e.stopPropagation(); onTopic(m[2].toLowerCase()); }}>#{m[2]}</Pressable>);
    at = m.index + raw.length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

// Text with @Name mentions picked out (tapping one opens their card), links and #topics
export function Body({ text, mentions = [], onPerson, className }) {
  const navigate = useNavigate();
  const href = useFeedHref();
  if (!text) return null;
  const onTopic = (t) => navigate(href({ topic: t }));
  const names = mentions.filter((m) => m?.name).sort((a, b) => b.name.length - a.name.length);
  const parts = names.length ? text.split(new RegExp(`@(${names.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')) : [text];
  return (
    <div className={cx('whitespace-pre-wrap break-words', className)}>
      {parts.map((p, i) => {
        const m = i % 2 ? names.find((x) => x.name === p) : null;
        return m ? <Pressable press key={i} className="inline font-semibold text-blue" onClick={() => onPerson?.(m.id)}>@{p}</Pressable> : <Fragment key={i}><Linked text={p} onTopic={onTopic} /></Fragment>;
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
        className={cx('w-full resize-none bg-transparent text-callout leading-relaxed outline-none placeholder:text-faint', className)} />
      {list.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {list.map((p) => (
            <Pressable press key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg">
              <Avatar name={p.name} src={p.photo_url} size={30} />
              <span className="min-w-0 flex-1 truncate text-body font-medium">{p.name}</span>
              <span className="text-caption text-muted">{ROLE_LABEL[p.role]}</span>
            </Pressable>
          ))}
        </div>
      )}
    </div>
  );
}

export { Lightbox } from '../../ui/index.jsx';

const clampRatio = (w, h, lo = 4 / 5, hi = 16 / 9) => (w && h ? Math.min(hi, Math.max(lo, w / h)) : null);
const wide = (p) => p?.w && p?.h && p.w > p.h * 1.1;

function Tile({ p, i, onOpen, more, className, style }) {
  return (
    <Pressable press onClick={() => onOpen(i)} aria-label={p.caption || `Photo ${i + 1}`} className={cx('relative block overflow-hidden bg-bg', className)} style={style}>
      <img src={p.url} alt={p.caption || ''} loading="lazy" className="h-full w-full object-cover" />
      {more > 0 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-title1 font-bold text-white">+{more}</span>}
    </Pressable>
  );
}

/** Facebook-style collage: 1 photo at its own shape, 2 side by side (or stacked when wide), 3 one big + two, 4 a square grid, 5+ two over three. */
export function PhotoGrid({ photos, onOpen }) {
  if (!photos?.length) return null;
  const n = photos.length;
  const [a, b] = photos;
  if (n === 1) {
    const r = clampRatio(a.w, a.h);
    return r
      ? <Tile p={a} i={0} onOpen={onOpen} className="w-full" style={{ aspectRatio: r }} />
      : <Pressable press onClick={() => onOpen(0)} className="block w-full bg-bg"><img src={a.url} alt={a.caption || ''} loading="lazy" className="max-h-[560px] w-full object-contain" /></Pressable>;
  }
  if (n === 2) {
    const stack = wide(a) && wide(b);
    return (
      <div className={cx('grid gap-0.5', stack ? 'grid-rows-2' : 'grid-cols-2')} style={{ aspectRatio: stack ? '4 / 5' : '1 / 1' }}>
        {photos.map((p, i) => <Tile key={p.key} p={p} i={i} onOpen={onOpen} />)}
      </div>
    );
  }
  if (n === 3) {
    const top = wide(a);
    return (
      <div className={cx('grid gap-0.5', top ? 'grid-cols-2 grid-rows-[3fr_2fr]' : 'grid-cols-[3fr_2fr] grid-rows-2')} style={{ aspectRatio: '1 / 1' }}>
        <Tile p={a} i={0} onOpen={onOpen} className={top ? 'col-span-2' : 'row-span-2'} />
        {photos.slice(1).map((p, i) => <Tile key={p.key} p={p} i={i + 1} onOpen={onOpen} />)}
      </div>
    );
  }
  if (n === 4) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-0.5" style={{ aspectRatio: '1 / 1' }}>
        {photos.map((p, i) => <Tile key={p.key} p={p} i={i} onOpen={onOpen} />)}
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="grid grid-cols-2 gap-0.5">{photos.slice(0, 2).map((p, i) => <Tile key={p.key} p={p} i={i} onOpen={onOpen} className="aspect-square" />)}</div>
      <div className="grid grid-cols-3 gap-0.5">{photos.slice(2, 5).map((p, i) => <Tile key={p.key} p={p} i={i + 2} onOpen={onOpen} className="aspect-square" more={i === 2 ? n - 5 : 0} />)}</div>
    </div>
  );
}

export const mapsUrl = (pl) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pl.lat != null && pl.lng != null ? `${pl.lat},${pl.lng}` : [pl.name, pl.address].filter(Boolean).join(', '))}`;

/** "at Ministry of Sound" — opens the map */
export function PlaceLine({ place, className }) {
  if (!place) return null;
  return (
    <a href={mapsUrl(place)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={cx('inline-flex items-center gap-1 font-semibold text-ink hover:underline', className)}>
      <MapPin size={14} className="shrink-0 text-red" />{place.name}
    </a>
  );
}

/** "with Ann Bee and 2 others" */
export function WithLine({ people, onPerson }) {
  if (!people?.length) return null;
  const [first, second] = people;
  const rest = people.length - (people.length === 2 ? 2 : 1);
  const Name = ({ p }) => <Pressable press className="inline font-semibold text-ink hover:underline" onClick={() => onPerson?.(p.id)}>{p.name}</Pressable>;
  return (
    <span>with <Name p={first} />{people.length === 2 ? <> and <Name p={second} /></> : rest > 0 ? ` and ${rest} other${rest === 1 ? '' : 's'}` : ''}</span>
  );
}

/** Preview of a web page. onRemove shows a × (composer). */
export function LinkCard({ link, onRemove, className }) {
  if (!link) return null;
  return (
    <div className={cx('relative overflow-hidden border-y border-line bg-bg', className)}>
      <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="block">
        {link.image_url && <img src={link.image_url} alt="" loading="lazy" className="aspect-[1.91/1] w-full object-cover" />}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1 text-caption uppercase tracking-wide text-muted"><ExternalLink size={12} />{link.site}</div>
          {link.title && <div className="line-clamp-2 text-subhead font-semibold">{link.title}</div>}
          {link.description && <div className="line-clamp-2 text-footnote text-muted">{link.description}</div>}
        </div>
      </a>
      {onRemove && (
        <Pressable press aria-label="Remove link preview" onClick={onRemove} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"><X size={16} /></Pressable>
      )}
    </div>
  );
}

/** Plays muted while on screen; tap for sound. */
export function VideoPlayer({ video }) {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && e.intersectionRatio >= 0.6) el.play().catch(() => {}); else el.pause();
    }, { threshold: [0, 0.6] });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!video) return null;
  const r = clampRatio(video.w, video.h, 4 / 5, 16 / 9) || 16 / 9;
  const tap = () => {
    const el = ref.current;
    if (!el) return;
    if (muted) { el.muted = false; setMuted(false); el.play().catch(() => {}); } else if (el.paused) el.play().catch(() => {}); else el.pause();
  };
  return (
    <div className="relative w-full bg-black" style={{ aspectRatio: r }}>
      <video ref={ref} src={video.url} poster={video.poster_url} muted={muted} playsInline loop preload="metadata" onClick={tap} className="h-full w-full object-contain" />
      <button type="button" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} onClick={() => { const el = ref.current; if (el) el.muted = !muted; setMuted(!muted); }}
        className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white">{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
    </div>
  );
}

export function PersonSheet({ userId, onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const href = useFeedHref();
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
                  <div className="text-title3 font-bold leading-tight">{d.person.name}</div>
                  <div className="text-subhead text-muted">{ROLE_LABEL[d.person.role]} · with the team since {d.since}</div>
                  <div className="text-footnote text-faint">{d.post_count} post{d.post_count === 1 ? '' : 's'}</div>
                </div>
              </div>
              {d.badges?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.badges.map((b) => <span key={b.id} className="rounded-full bg-amber-soft px-2.5 py-1 text-footnote font-semibold">{b.emoji} {b.label}{b.count > 1 ? ` ×${b.count}` : ''}</span>)}
                </div>
              )}
              <Button className="mt-4 w-full" variant="secondary" onClick={() => { onClose(); navigate(href({ person: d.person.id })); }}>See full profile</Button>
              {isMgr(user) && d.person.id !== user.id && (
                <div className="mt-4 rounded-2xl bg-bg px-4 py-3 text-subhead">
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
                  <div className="text-footnote font-semibold uppercase tracking-wide text-muted">Recent posts</div>
                  {d.posts.map((p) => (
                    <div key={p.id} className="flex gap-3 rounded-2xl bg-bg p-3">
                      {p.photos[0] && <img src={p.photos[0].url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />}
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-subhead">{p.event?.title || p.body || (p.video ? 'Video' : 'Photo')}</div>
                        <div className="text-caption text-faint">{relative(p.created_at)}</div>
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
        <p className="text-subhead text-muted">They can still read Everyday, but can't post or comment. They are told why.</p>
        <Select label="For" value={days} onChange={(e) => setDays(e.target.value)} options={MUTE_DAYS.map((d) => ({ value: String(d), label: `${d} day${d === 1 ? '' : 's'}` }))} />
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
      <p className="mb-3 text-body">Everyday is for the team to share wins, news and life on shift. Before you post:</p>
      <ol className="space-y-2.5">
        {RULES.map((r, i) => <li key={i} className="flex gap-3 text-body"><span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-soft text-caption font-bold text-blue">{i + 1}</span>{r}</li>)}
      </ol>
    </Sheet>
  );
}

let settingsCache = null;
/** Company Everyday switches (shout-outs, celebrations, featured topics), fetched once */
export function useEverydaySettings() {
  const [s, setS] = useState(settingsCache);
  useEffect(() => {
    if (settingsCache) return;
    api('settings.get', {}).then((r) => { settingsCache = r.everyday || {}; setS(settingsCache); }).catch(() => setS({}));
  }, []);
  return s;
}
export const resetEverydaySettings = () => { settingsCache = null; };

/** Pick colleagues (tags, shout-outs). value: ids */
export function PeoplePicker({ open, title, value, onChange, onClose, excludeMe = true }) {
  const { user } = useAuth();
  const people = usePeople().filter((p) => !excludeMe || p.id !== user.id);
  const [text, setText] = useState('');
  const shown = people.filter((p) => p.name.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 60);
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id].slice(0, 20));
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<Button onClick={onClose}>Done{value.length ? ` (${value.length})` : ''}</Button>}>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search names" autoFocus />
      <div className="mt-3 space-y-0.5">
        {shown.map((p) => (
          <Pressable press key={p.id} onClick={() => toggle(p.id)} className={cx('flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left', value.includes(p.id) ? 'bg-blue-soft' : 'hover:bg-bg')}>
            <Avatar name={p.name} src={p.photo_url} size={36} />
            <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{p.name}</span><span className="block text-caption text-muted">{ROLE_LABEL[p.role]}</span></span>
            <span className={cx('grid h-6 w-6 place-items-center rounded-full border-2 text-caption font-bold', value.includes(p.id) ? 'border-blue bg-blue text-white' : 'border-line')}>{value.includes(p.id) ? '✓' : ''}</span>
          </Pressable>
        ))}
        {!shown.length && <p className="py-6 text-center text-subhead text-muted">No one found</p>}
      </div>
    </Sheet>
  );
}

export const whenText = (d, opts = {}) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...opts });
// <input type="datetime-local"> value ↔ ISO
export const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
