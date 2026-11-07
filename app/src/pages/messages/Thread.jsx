import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, BadgeCheck, Bell, BellOff, Check, CheckCheck, ChevronLeft, Copy, Eye, FileText, Flag, Megaphone, Mic, Newspaper, MoreHorizontal, Paperclip, Pencil, Pin, PinOff, Reply, Search, Trash2, UserPlus, Users, X, LogOut } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Composer } from '../../ui/Chat.jsx';
import { RecordingBar, useRecorder, VoiceNote } from '../../ui/VoiceRecorder.jsx';
import { Avatar, Button, cx, dayLabel, ErrorBox, IconButton, Input, Lightbox, Pressable, SearchInput, Sheet, Spinner, Textarea, time, useAction, useApi, useConfirm, useToast, displayName } from '../../ui/index.jsx';
import { api, upload } from '../../api.js';
import { useRealtime, useRealtimeConnected } from '../../realtime.js';
import { ROLE_LABEL } from '../../layouts/nav.js';
import { REACTIONS, reaction, useFeedHref } from '../everyday/_parts.jsx';
import NewMessage from './NewMessage.jsx';
import { ConvAvatar, isImage, messagesChanged, useBase, whenLabel } from './_parts.jsx';

const EDIT_MINUTES = 15;
const TYPING_MS = 5000;
const TYPING_EVERY_MS = 3000;
const canEdit = (m) => !m.deleted_at && Date.now() - new Date(m.created_at) < EDIT_MINUTES * 60000;
const isAudio = (a) => /^audio\//.test(a.mime || '');
const quoteText = (m) => m.body || (m.share ? 'Shared post' : m.attachments.some(isAudio) ? 'Voice message' : m.attachments.some(isImage) ? 'Photo' : 'File');
// Replace messages we already hold with fresher copies of the same ids
const refreshIn = (list, fresh) => { const by = new Map(fresh.map((m) => [m.id, m])); return list.map((m) => by.get(m.id) || m); };

export default function Thread({ id, onChanged }) {
  const { user } = useAuth();
  const base = useBase();
  const live = useRealtimeConnected();
  const latest = useApi('messages.thread', { id }, { poll: live ? 60000 : 10000 });
  const [older, setOlder] = useState([]);
  const [more, setMore] = useState(null);
  const [around, setAround] = useState(null); // a window of messages around a jumped-to message, instead of the latest
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [flash, setFlash] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [typing, setTyping] = useState({});
  const [searching, setSearching] = useState(false);
  const [params, setParams] = useSearchParams();
  const scroller = useRef(null);
  const stick = useRef(true);
  const lastId = useRef(null);
  const jumpTarget = useRef(null);

  const conv = latest.data?.conversation;
  const members = latest.data?.members || [];
  const msgs = useMemo(() => {
    const now = around ? around.messages : latest.data?.messages || [];
    const ids = new Set(now.map((m) => m.id));
    return [...older.filter((m) => !ids.has(m.id)), ...now];
  }, [older, latest.data, around]);
  const hasMore = more ?? (around ? around.more : latest.data?.more);

  // New message at the bottom: mark read, refresh the inbox and badge, and follow it if the person was at the bottom
  const tail = latest.data?.messages?.at(-1)?.id;
  useEffect(() => {
    if (!tail || tail === lastId.current) return;
    lastId.current = tail;
    if (conv?.member) api('messages.read', { id }).then(() => { onChanged?.(); messagesChanged(); }).catch(() => {});
    if (stick.current && !around) requestAnimationFrame(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; });
  }, [tail, conv?.member, id, onChanged, around]);

  const onScroll = () => {
    const el = scroller.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const loadOlder = async () => {
    if (!msgs.length) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const h = el.scrollHeight;
    try {
      const r = await api('messages.thread', { id, before: msgs[0].created_at });
      setOlder((o) => [...r.messages, ...o]);
      setMore(r.more);
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - h; });
    } finally { setLoadingOlder(false); }
  };

  // Scroll to a message and flash it; load the part of the chat around it first if it isn't on screen
  const jumpTo = useCallback(async (mid) => {
    const show = () => {
      const el = document.getElementById(`msg-${mid}`);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlash(mid);
      setTimeout(() => setFlash((f) => (f === mid ? null : f)), 1800);
      return true;
    };
    if (show()) return;
    try {
      const r = await api('messages.thread', { id, around: mid });
      stick.current = false;
      jumpTarget.current = mid;
      setOlder([]); setMore(null);
      setAround({ messages: r.messages, more: r.more, newer: r.newer, anchor: mid });
    } catch { /* message gone or no access: stay put */ }
  }, [id]);
  useEffect(() => {
    if (!jumpTarget.current) return;
    const mid = jumpTarget.current;
    if (document.getElementById(`msg-${mid}`)) { jumpTarget.current = null; requestAnimationFrame(() => jumpTo(mid)); }
  }, [msgs, jumpTo]);
  const backToLatest = () => {
    setAround(null); setOlder([]); setMore(null);
    stick.current = true;
    latest.reload();
    requestAnimationFrame(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; });
  };

  // ?m=<message> from a notification or search result
  const wanted = params.get('m');
  useEffect(() => {
    if (!wanted || !conv) return;
    jumpTo(wanted);
    setParams((p) => { p.delete('m'); return p; }, { replace: true });
  }, [wanted, conv, jumpTo, setParams]);

  // Refresh one message we hold outside the latest page (an older one someone reacted to)
  const refreshMsg = useCallback(async (mid) => {
    if (!mid || (latest.data?.messages || []).some((m) => m.id === mid)) { latest.reload(); return; }
    latest.reload();
    try {
      const r = await api('messages.thread', { id, around: mid });
      setOlder((o) => refreshIn(o, r.messages));
      setAround((a) => (a ? { ...a, messages: refreshIn(a.messages, r.messages) } : a));
    } catch { /* gone */ }
  }, [id, latest]);

  useRealtime(['msg', 'upd', 'read', 'typing'], (d, event) => {
    if (event === 'reconnected') { latest.reload(); return; }
    if (d.c !== id) return;
    if (event === 'typing') { setTyping((t) => ({ ...t, [d.u]: { name: d.name, until: Date.now() + TYPING_MS } })); return; }
    if (event === 'upd') refreshMsg(d.id); else latest.reload();
  });
  // Someone stops showing as typing a few seconds after their last keystroke, or when their message lands
  useEffect(() => {
    const keys = Object.keys(typing);
    if (!keys.length) return undefined;
    const t = setTimeout(() => setTyping((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v.until > Date.now()))), 1000);
    return () => clearTimeout(t);
  }, [typing]);
  useEffect(() => { setTyping({}); }, [tail]);

  const refresh = () => { stick.current = true; if (around) backToLatest(); else latest.reload(); };

  if (latest.error && !latest.data) return <div className="p-4"><ErrorBox error={latest.error} retry={latest.reload} /></div>;
  if (!conv) return <Spinner className="flex-1" />;
  const typers = Object.values(typing).map((t) => t.name);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadHeader conv={conv} members={members} base={base} onSearch={() => setSearching((s) => !s)} onChanged={() => { latest.reload(); onChanged?.(); }} />
      {searching && <ChatSearch conv={conv} onPick={(r) => { setSearching(false); jumpTo(r.id); }} onClose={() => setSearching(false)} />}
      {conv.oversight && (
        <div className="flex items-center gap-2 border-b border-line bg-amber-soft px-4 py-2 text-footnote text-amber">
          <Eye size={16} className="shrink-0" />You're viewing this conversation as a company manager. Your access is recorded in the audit log.
        </div>
      )}
      <PinnedBar items={latest.data.pinned || []} onJump={jumpTo} />
      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-4 sm:px-5">
          {hasMore && <div className="mb-3 text-center"><Button variant="ghost" size="sm" busy={loadingOlder} onClick={loadOlder}>Load earlier messages</Button></div>}
          {!msgs.length && <p className="py-10 text-center text-body text-muted">No messages yet. Say hello.</p>}
          <MessageList msgs={msgs} me={user} conv={conv} members={members} flash={flash} showSeen={!around || !around.newer}
            onReply={conv.member ? setReplyTo : null} onJump={jumpTo} onChanged={refreshMsg} onReplied={refresh} />
        </div>
        {around && <Button size="sm" icon={ArrowDown} className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-tile" onClick={backToLatest}>Latest messages</Button>}
      </div>
      {typers.length > 0 && <div className="px-4 pb-1 text-caption text-muted" aria-live="polite">{typers.length === 1 ? `${typers[0]} is typing…` : `${typers.slice(0, 2).join(' and ')} are typing…`}</div>}
      {conv.member ? <SendBox conv={conv} members={members} me={user} replyTo={replyTo} onClearReply={() => setReplyTo(null)} onSent={() => { setReplyTo(null); refresh(); }} />
        : !conv.oversight && <p className="border-t border-line p-4 text-center text-footnote text-muted">You're no longer in this conversation.</p>}
    </div>
  );
}

function ThreadHeader({ conv, members, base, onChanged, onSearch }) {
  const [info, setInfo] = useState(false);
  const [run] = useAction();
  const { user } = useAuth();
  const others = members.filter((p) => p.id !== user.id && !p.system);
  const sub = conv.label || (conv.kind === 'group' ? `${members.length} people` : ROLE_LABEL[others[0]?.role]);
  return (
    <div className="flex items-center gap-2 border-b border-line bg-surface/80 px-2 py-2 backdrop-blur sm:px-3">
      <IconButton icon={ChevronLeft} label="All messages" to={base} className="lg:hidden" />
      <Pressable onClick={() => setInfo(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1">
        <ConvAvatar c={conv} others={others.slice(0, 2)} size={40} />
        <div className="min-w-0">
          <div className="truncate text-body font-semibold">{conv.title}</div>
          {sub && <div className="truncate text-caption text-muted">{sub}</div>}
        </div>
      </Pressable>
      <IconButton icon={Search} label="Search in this conversation" onClick={onSearch} />
      {conv.member && <IconButton icon={conv.muted ? BellOff : Bell} label={conv.muted ? 'Turn notifications on' : 'Mute notifications'}
        onClick={() => run(async () => { await api('messages.mute', { id: conv.id, muted: !conv.muted }); onChanged(); }, conv.muted ? 'Notifications on' : 'Muted')} />}
      <IconButton icon={Users} label="People in this conversation" onClick={() => setInfo(true)} />
      <InfoSheet open={info} onClose={() => setInfo(false)} conv={conv} members={members} base={base} onChanged={onChanged} />
    </div>
  );
}

function InfoSheet({ open, onClose, conv, members, base, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(conv.title);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  useEffect(() => { if (open) setName(conv.title); }, [open, conv.title]);
  const leave = async () => {
    if (!(await confirm({ title: 'Leave this group?', body: 'You will stop getting its messages. Someone in the group can add you back.', confirm: 'Leave', danger: true }))) return;
    await run(() => api('messages.leave', { id: conv.id }), 'You left the group');
    messagesChanged();
    nav(base);
  };
  return (
    <Sheet open={open} onClose={onClose} title={conv.kind === 'group' ? 'Group' : 'Conversation'}>
      {conv.kind === 'group' && conv.member && (
        <div className="mb-4 flex items-end gap-2">
          <Input className="flex-1" label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <Button variant="secondary" busy={busy} disabled={!name.trim() || name === conv.title}
            onClick={() => run(async () => { await api('messages.rename', { id: conv.id, title: name }); onChanged(); }, 'Renamed')}>Save</Button>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-footnote font-semibold uppercase tracking-wide text-muted">{members.length} {members.length === 1 ? 'person' : 'people'}</h3>
        {conv.can_add && <Button variant="ghost" size="sm" icon={UserPlus} onClick={() => setAdding(true)}>Add people</Button>}
      </div>
      <div className="-mx-1">
        {members.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-1 py-2">
            {p.system ? <ConvAvatar c={{ kind: 'ops' }} size={40} /> : <Avatar name={p.name} src={[p.photo_thumb_url, p.photo_url]} size={40} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-semibold">{p.name}</div>
              <div className="truncate text-footnote text-muted">{p.system ? 'Automatic assistant' : ROLE_LABEL[p.role]}</div>
            </div>
          </div>
        ))}
      </div>
      {conv.can_leave && <Button className="mt-4 w-full" variant="secondary" icon={LogOut} onClick={leave}>Leave group</Button>}
      <NewMessage open={adding} onClose={() => setAdding(false)} addTo={conv.id} exclude={members.map((m) => m.id)} onAdded={onChanged} />
    </Sheet>
  );
}

// Up to three pinned messages (and "Must confirm" ones still waiting for me) at the top; a tap jumps to it and shows the next
function PinnedBar({ items, onJump }) {
  const [i, setI] = useState(0);
  if (!items.length) return null;
  const k = i % items.length;
  const it = items[k];
  return (
    <Pressable onClick={() => { onJump(it.id); setI(k + 1); }}
      className={cx('flex items-center gap-3 border-b border-line px-4 py-2', it.confirm ? 'bg-amber-soft' : 'bg-surface')}>
      {it.confirm ? <BadgeCheck size={18} className="shrink-0 text-amber" /> : <Pin size={18} className="shrink-0 text-blue" />}
      <div className="min-w-0 flex-1">
        <div className={cx('text-caption font-semibold', it.confirm ? 'text-amber' : 'text-blue')}>
          {it.confirm ? `Please confirm · ${it.name}` : 'Pinned'}{items.length > 1 ? ` · ${k + 1} of ${items.length}` : ''}
        </div>
        <div className="truncate text-footnote text-ink">{it.text}</div>
      </div>
    </Pressable>
  );
}

function ChatSearch({ conv, onPick, onClose }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  useEffect(() => {
    const s = text.trim();
    if (s.length < 2) { setRes(null); return undefined; }
    const t = setTimeout(() => api('messages.search', { q: s, conversation_id: conv.id }).then((r) => setRes(r.results)).catch(() => setRes([])), 300);
    return () => clearTimeout(t);
  }, [text, conv.id]);
  return (
    <div className="border-b border-line bg-surface px-3 py-2">
      <div className="flex items-center gap-2">
        <SearchInput className="flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Search in ${conv.title}`} autoFocus />
        <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
      </div>
      {res && (
        <div className="mt-2 max-h-64 overflow-y-auto">
          {res.length ? res.map((r) => (
            <Pressable key={r.id} onClick={() => onPick(r)} className="flex items-start gap-3 rounded-xl px-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-footnote font-semibold">{r.mine ? 'You' : r.sender}</span>
                  <span className="shrink-0 text-caption text-faint">{whenLabel(r.at)}</span>
                </div>
                <div className="line-clamp-2 text-footnote text-muted">{r.voice && <Mic size={13} className="mr-1 inline -translate-y-px" />}{r.text}</div>
              </div>
            </Pressable>
          )) : <p className="px-2 py-3 text-footnote text-muted">No messages match.</p>}
        </div>
      )}
    </div>
  );
}

// Body text with @Name mentions in bold
function BodyText({ text, names }) {
  if (!names.length) return text;
  const re = new RegExp(`(${names.map((n) => `@${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? <strong key={i} className="font-bold">{part}</strong> : part));
}

// Swipe a message to the right to reply (touch only; scrolling still works)
function useSwipeReply(onReply) {
  const [dx, setDx] = useState(0);
  const start = useRef(null);
  if (!onReply) return { dx: 0, handlers: {} };
  return {
    dx,
    handlers: {
      onPointerDown: (e) => { if (e.pointerType === 'touch') start.current = { x: e.clientX, y: e.clientY, on: false }; },
      onPointerMove: (e) => {
        const s = start.current;
        if (!s) return;
        const x = e.clientX - s.x;
        if (!s.on && Math.abs(e.clientY - s.y) > 12) { start.current = null; setDx(0); return; }
        if (x > 10) s.on = true;
        if (s.on) setDx(Math.max(0, Math.min(80, x)));
      },
      onPointerUp: () => { if (start.current?.on && dx >= 60) onReply(); start.current = null; setDx(0); },
      onPointerCancel: () => { start.current = null; setDx(0); },
    },
  };
}

function MessageList({ msgs, me, conv, members, flash, showSeen, onReply, onJump, onChanged, onReplied }) {
  const [photos, setPhotos] = useState(null);
  const [action, setAction] = useState(null);
  const [reactors, setReactors] = useState(null);
  const [confirms, setConfirms] = useState(null);
  const [seen, setSeen] = useState(null);
  const names = useMemo(() => new Map(members.map((p) => [p.id, p.name])), [members]);
  // "Seen" goes under my latest message, and only if nobody has written after it
  const lastMine = [...msgs].reverse().find((m) => !m.deleted_at);
  const seenFor = showSeen && lastMine?.sender_id === me.id ? lastMine : null;
  let lastDay = null;
  return (
    <>
      {msgs.map((m, i) => {
        const day = dayLabel(m.created_at);
        const sep = day !== lastDay;
        lastDay = day;
        const prev = msgs[i - 1];
        return (
          <div key={m.id}>
            {sep && <div className="my-4 text-center text-caption font-semibold text-muted">{day}</div>}
            <Bubble m={m} me={me} conv={conv} first={sep || !prev || prev.sender_id !== m.sender_id} flash={flash === m.id}
              mentionNames={(m.mentions || []).map((u) => names.get(u)).filter(Boolean)}
              onReply={onReply && (() => onReply(m))} onJump={onJump} onAction={() => setAction(m)} onPhotos={setPhotos}
              onReactors={() => setReactors(m)} onConfirms={() => setConfirms(m)} onChanged={onChanged} onReplied={onReplied} />
            {seenFor?.id === m.id && <SeenLine m={m} me={me} conv={conv} members={members} onOpen={setSeen} />}
          </div>
        );
      })}
      <Lightbox photos={photos?.list || []} index={photos?.i} onClose={() => setPhotos(null)} download />
      <ActionSheet m={action} me={me} conv={conv} onClose={() => setAction(null)} onChanged={onChanged} onReply={onReply}
        onConfirms={(m) => { setAction(null); setConfirms(m); }} />
      <ReactorsSheet m={reactors} onClose={() => setReactors(null)} />
      <ConfirmSheet m={confirms} onClose={() => setConfirms(null)} />
      <SeenSheet list={seen} onClose={() => setSeen(null)} />
    </>
  );
}

function Bubble({ m, me, conv, first, flash, mentionNames, onReply, onJump, onAction, onPhotos, onReactors, onConfirms, onChanged, onReplied }) {
  const [run, busy] = useAction();
  const swipe = useSwipeReply(!m.deleted_at && onReply);
  const mine = m.sender_id === me.id;
  const voice = m.attachments.find(isAudio);
  const images = m.attachments.filter(isImage);
  const files = m.attachments.filter((a) => !isImage(a) && !isAudio(a));
  const live = !m.deleted_at;
  return (
    <div id={`msg-${m.id}`} {...swipe.handlers} style={{ touchAction: 'pan-y' }}
      className={cx('group relative flex items-end gap-2 rounded-2xl transition-colors duration-500', mine ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-1', flash && 'bg-blue-soft')}>
      {swipe.dx > 0 && <Reply size={18} className="absolute left-1 top-1/2 -translate-y-1/2 text-muted" style={{ opacity: swipe.dx / 60 }} />}
      {!mine && conv.kind !== 'direct' && (
        <div className="w-8 shrink-0">{first && (m.sender.system ? <ConvAvatar c={{ kind: 'ops' }} size={32} /> : <Avatar name={m.sender.name} src={[m.sender.photo_thumb_url, m.sender.photo_url]} size={32} />)}</div>
      )}
      <div className={cx('flex max-w-[82%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')} style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined }}
        onContextMenu={(e) => { if (live) { e.preventDefault(); onAction(); } }}>
        {first && !mine && conv.kind !== 'direct' && <div className="mb-0.5 px-3 text-caption font-semibold text-muted">{m.sender.name}</div>}
        {m.reply && (
          <Pressable onClick={() => !m.reply.deleted && onJump(m.reply.id)}
            className={cx('mb-0.5 max-w-full rounded-2xl border-l-4 border-blue/50 bg-bg px-3 py-1.5 text-left', mine ? 'mr-1' : 'ml-1')}>
            <div className="flex items-center gap-1 text-caption font-semibold text-blue"><Reply size={12} />{m.reply.mine ? 'You' : m.reply.name}</div>
            <div className={cx('line-clamp-2 text-footnote', m.reply.deleted ? 'italic text-faint' : 'text-muted')}>{m.reply.voice && <Mic size={12} className="mr-1 inline -translate-y-px" />}{m.reply.text}</div>
          </Pressable>
        )}
        {m.confirm && <div className="mb-0.5 flex items-center gap-1 px-2 text-caption font-semibold text-amber"><BadgeCheck size={14} />Please confirm you've read this</div>}
        {images.length > 0 && (
          <div className={cx('mb-1 grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {images.map((a, k) => (
              <Pressable press key={a.url} onClick={() => onPhotos({ list: images, i: k })} className="overflow-hidden rounded-2xl">
                <img src={a.url} alt={a.name} loading="lazy" className="h-36 w-36 object-cover sm:h-44 sm:w-44" />
              </Pressable>
            ))}
          </div>
        )}
        {files.map((a) => (
          <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="mb-1 flex items-center gap-2 rounded-2xl bg-fill px-3 py-2 text-footnote font-semibold text-blue">
            <FileText size={16} />{a.name}
          </a>
        ))}
        {m.share && live && <ShareCard s={m.share} />}
        {voice && <div className="mb-1"><VoiceNote a={voice} mine={mine} transcript={m.transcript} status={m.transcript_status} /></div>}
        {(m.body || m.deleted_at) && (
          <Pressable press onClick={() => live && onAction()}
            className={cx('whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-body leading-snug',
              m.deleted_at ? 'border border-line italic text-muted' : mine ? 'bg-blue text-white' : m.sender.system ? 'bg-blue-soft text-ink' : 'bg-fill text-ink',
              m.confirm && !m.deleted_at && 'ring-2 ring-amber/60')}>
            {m.deleted_at ? 'Message deleted' : <BodyText text={m.body} names={mentionNames} />}
          </Pressable>
        )}
        {m.reactions?.length > 0 && (
          <Pressable press onClick={onReactors} className={cx('-mt-1.5 z-[1] flex items-center gap-1 rounded-full border border-hairline bg-surface px-1.5 py-0.5 text-caption shadow-tile', mine ? 'mr-2' : 'ml-2')}
            aria-label="See who reacted">
            {m.reactions.map((r) => <span key={r.kind} className={cx(r.mine && 'font-bold')}>{reaction(r.kind)?.emoji}{r.count > 1 ? <span className="ml-0.5 text-muted">{r.count}</span> : null}</span>)}
          </Pressable>
        )}
        <div className="mt-0.5 flex items-center gap-1 px-2 text-caption2 text-faint">
          {m.pinned && <Pin size={11} className="text-blue" />}
          {time(m.created_at)}{m.edited_at && !m.deleted_at ? ' · Edited' : ''}
          {/* Same menu as long-press; always shown on phones, on hover or focus on desktop */}
          {live && <button type="button" onClick={onAction} aria-label="Message options" className={cx('pressable relative -my-1 ml-1 rounded-full p-1 before:absolute before:-inset-3 hover:text-ink', m.body && 'lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100')}><MoreHorizontal size={14} /></button>}
        </div>
        {m.confirm && <ConfirmRow m={m} busy={busy} onConfirm={() => run(async () => { await api('messages.confirm', { id: m.id }); onChanged(m.id); }, 'Thanks — confirmed')} onOpen={onConfirms} />}
        {m.quick && !mine && <QuickReplies m={m} onDone={onReplied} />}
      </div>
    </div>
  );
}

/** An Everyday post someone shared into the chat */
function ShareCard({ s }) {
  const navigate = useNavigate();
  const href = useFeedHref();
  if (s.restricted || s.removed) {
    return <div className="mb-1 flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-footnote italic text-muted"><Newspaper size={16} />{s.removed ? 'This post was removed' : 'Shared from Everyday — staff only'}</div>;
  }
  return (
    <Pressable press onClick={() => navigate(href({ post: s.post_id }))} className="mb-1 flex w-64 max-w-full overflow-hidden rounded-2xl border border-line bg-surface text-left">
      {s.thumb_url && <img src={s.thumb_url} alt="" className="h-auto w-20 shrink-0 object-cover" />}
      <span className="min-w-0 flex-1 px-3 py-2">
        <span className="flex items-center gap-1 text-caption font-semibold text-blue"><Newspaper size={12} />Everyday · {s.author}</span>
        <span className="line-clamp-3 text-footnote text-ink">{s.text || (s.kind === 'poll' ? 'Poll' : s.kind === 'event' ? 'Event' : 'Post')}</span>
      </span>
    </Pressable>
  );
}

function ConfirmRow({ m, busy, onConfirm, onOpen }) {
  const c = m.confirm;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
      {c.needed && !c.mine && <Button size="sm" icon={Check} busy={busy} onClick={onConfirm}>Got it</Button>}
      {c.needed && c.mine && <span className="flex items-center gap-1 text-caption font-semibold text-green"><CheckCheck size={14} />You confirmed {time(c.mine)}</span>}
      {c.outstanding && (
        <Pressable press onClick={onOpen} className={cx('rounded-full px-2.5 py-1 text-caption font-semibold', c.done === c.total ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber')}>
          Confirmed {c.done}/{c.total}
        </Pressable>
      )}
    </div>
  );
}

// "Sent" / "Seen 21:04" in a one-to-one chat, "Seen by 4" in a group (tap for who and when)
function SeenLine({ m, me, conv, members, onOpen }) {
  const others = members.filter((p) => p.id !== me.id && !p.system);
  if (!others.length || conv.kind === 'ops') return null;
  const seen = others.filter((p) => p.last_read_at && new Date(p.last_read_at) >= new Date(m.created_at));
  let label = 'Sent';
  if (conv.kind === 'direct' || others.length === 1) { if (seen.length) label = `Seen ${time(seen[0].last_read_at)}`; } else if (seen.length) label = seen.length === others.length ? 'Seen by everyone' : `Seen by ${seen.length}`;
  const group = others.length > 1 && seen.length > 0;
  return (
    <div className="mt-0.5 flex justify-end px-2">
      {group
        ? <button type="button" onClick={() => onOpen(others.map((p) => ({ ...p, seen: seen.includes(p) })))} className="pressable text-caption2 font-semibold text-muted">{label}</button>
        : <span className="text-caption2 text-faint">{label}</span>}
    </div>
  );
}

function SeenSheet({ list, onClose }) {
  const sorted = (list || []).slice().sort((a, b) => Number(b.seen) - Number(a.seen));
  return (
    <Sheet open={!!list} onClose={onClose} title="Seen by" size="sm">
      <div className="-mx-1">
        {sorted.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-1 py-2">
            <Avatar name={p.name} src={[p.photo_thumb_url, p.photo_url]} size={36} />
            <span className="min-w-0 flex-1 truncate text-body font-semibold">{p.name}</span>
            <span className={cx('text-footnote', p.seen ? 'text-muted' : 'text-faint')}>{p.seen ? whenLabel(p.last_read_at) : 'Not yet'}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function ReactorsSheet({ m, onClose }) {
  const q = useApi('messages.reactions', { id: m?.id }, { skip: !m });
  return (
    <Sheet open={!!m} onClose={onClose} title="Reactions" size="sm">
      {!q.data ? <Spinner className="py-6" /> : (
        <div className="-mx-1">
          {q.data.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-1 py-2">
              <Avatar name={p.name} src={[p.photo_thumb_url, p.photo_url]} size={36} />
              <span className="min-w-0 flex-1 truncate text-body font-semibold">{p.name}</span>
              <span className="text-title3">{reaction(p.kind)?.emoji}</span>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// For the sender and managers: who has confirmed and who hasn't, with a reminder for those who haven't
function ConfirmSheet({ m, onClose }) {
  const [run, busy] = useAction();
  const c = m?.confirm;
  return (
    <Sheet open={!!c?.outstanding} onClose={onClose} title={c ? `Confirmed ${c.done}/${c.total}` : ''} size="sm"
      footer={c?.outstanding?.length ? <Button className="w-full" icon={Bell} busy={busy}
        onClick={() => run(() => api('messages.confirmChase', { id: m.id }), (r) => (r.sent ? `Reminder sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}` : 'Everyone has confirmed')).then(onClose).catch(() => {})}>
        Remind the {c.outstanding.length} who haven't</Button> : null}>
      {c?.outstanding && (
        <>
          {c.outstanding.length > 0 && <h3 className="mb-1 text-footnote font-semibold uppercase tracking-wide text-muted">Not yet</h3>}
          {c.outstanding.map((p) => <div key={p.id} className="py-1.5 text-body">{p.name}</div>)}
          {c.confirmed.length > 0 && <h3 className="mb-1 mt-4 text-footnote font-semibold uppercase tracking-wide text-muted">Confirmed</h3>}
          {c.confirmed.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-1.5 text-body">
              <span>{p.name}</span><span className="text-footnote text-muted">{whenLabel(p.at)} {time(p.at)}</span>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

// Buttons under an Orb question ("On my way" / "Can't make it", "Accept" / "Decline"), plus an optional link ("Sign site pack")
function QuickReplies({ m, onDone }) {
  const [run, busy] = useAction();
  const [picked, setPicked] = useState(null);
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {m.quick.link && <Button size="sm" to={m.quick.link.to}>{m.quick.link.label}</Button>}
      {m.quick.options.map((o) => (
        <Button key={o.value} size="sm" variant={!m.quick.link && (o.value === 'accept' || o.value === 'on_my_way') ? 'primary' : 'secondary'} busy={busy && picked === o.value} disabled={busy}
          onClick={() => { setPicked(o.value); run(() => api('messages.reply', { message_id: m.id, value: o.value })).then(onDone).catch(onDone); }}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function ActionSheet({ m, me, conv, onClose, onChanged, onReply, onConfirms }) {
  const { user } = useAuth();
  const [mode, setMode] = useState(null);
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  useEffect(() => { setMode(null); setText(m?.body || ''); }, [m]);
  if (!m) return <Sheet open={false} onClose={onClose} />;
  const mine = m.sender_id === me.id;
  const close = () => { setMode(null); onClose(); };
  const mineReaction = m.reactions?.find((r) => r.mine)?.kind;

  const react = (kind) => { close(); run(async () => { await api('messages.react', { id: m.id, kind: kind === mineReaction ? null : kind }); onChanged(m.id); }).catch(() => {}); };
  const pin = () => run(async () => { await api('messages.pin', { id: m.id, pinned: !m.pinned }); close(); onChanged(m.id); }, m.pinned ? 'Unpinned' : 'Pinned for everyone');
  const copy = async () => { await navigator.clipboard?.writeText(m.body).catch(() => {}); toast('Copied'); close(); };
  const del = async () => {
    close();
    if (!(await confirm({ title: 'Delete this message?', body: 'Everyone in the conversation will see "Message deleted".', confirm: 'Delete', danger: true }))) return;
    await run(() => api('messages.delete', { id: m.id }), 'Deleted');
    onChanged(m.id);
  };
  const save = () => run(async () => {
    if (mode === 'edit') await api('messages.edit', { id: m.id, body: text });
    else await api('messages.report', { message_id: m.id, reason: text });
    close();
    onChanged(m.id);
  }, mode === 'edit' ? 'Saved' : 'Reported to the company managers');
  // Venue managers: read a chat message into the cover request form
  const toCover = () => run(async () => {
    const r = await api('venueRequests.create', { text: m.body, draft: true });
    close();
    if (r.draft) nav('/venue/rota', { state: { draft: r.draft } });
    else toast(r.reply || 'Couldn\'t read a request from that message', 'error');
  });

  if (mode) {
    return (
      <Sheet open onClose={close} title={mode === 'edit' ? 'Edit message' : 'Report message'}
        footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button busy={busy} variant={mode === 'report' ? 'danger' : 'primary'} disabled={mode === 'edit' && !text.trim()} onClick={save}>{mode === 'edit' ? 'Save' : 'Report'}</Button></>}>
        {mode === 'report' && <p className="mb-3 text-body text-muted">The company managers will be told and can read the conversation. Tell them what's wrong (optional).</p>}
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'report' ? 'What happened?' : ''} autoFocus />
      </Sheet>
    );
  }
  const items = [
    onReply && { icon: Reply, label: 'Reply', onClick: () => { close(); onReply(m); } },
    m.body && { icon: Copy, label: 'Copy text', onClick: copy },
    conv.can_pin && { icon: m.pinned ? PinOff : Pin, label: m.pinned ? 'Unpin' : 'Pin for everyone', onClick: pin, busy },
    m.confirm?.outstanding && { icon: BadgeCheck, label: 'See who confirmed', onClick: () => onConfirms(m) },
    user.role === 'venue' && m.body && { icon: Megaphone, label: 'Turn into cover request', onClick: toCover, busy },
    mine && m.body && canEdit(m) && { icon: Pencil, label: 'Edit', onClick: () => { setText(m.body); setMode('edit'); } },
    mine && { icon: Trash2, label: 'Delete', onClick: del, danger: true },
    !mine && !m.sender.system && { icon: Flag, label: 'Report to the company', onClick: () => { setText(''); setMode('report'); }, danger: true },
  ].filter(Boolean);
  return (
    <Sheet open onClose={close} title="Message" size="sm">
      {conv.member && (
        <div className="mb-3 flex justify-between gap-1 rounded-full bg-bg p-1.5">
          {REACTIONS.map((r) => (
            <button key={r.kind} type="button" onClick={() => react(r.kind)} aria-label={r.label} aria-pressed={mineReaction === r.kind}
              className={cx('pressable grid h-11 w-11 place-items-center rounded-full text-[26px]', mineReaction === r.kind && 'bg-blue-soft ring-2 ring-blue/30')}>{r.emoji}</button>
          ))}
        </div>
      )}
      <p className="mb-3 line-clamp-3 rounded-2xl bg-bg px-3 py-2 text-footnote text-muted">{quoteText(m)}</p>
      <div className="-mx-1">
        {items.map((it) => (
          <Pressable key={it.label} onClick={it.onClick} className={cx('flex items-center gap-3 rounded-xl px-2 py-3 text-body font-semibold', it.danger ? 'text-red' : 'text-ink')}>
            <it.icon size={20} />{it.label}
          </Pressable>
        ))}
      </div>
    </Sheet>
  );
}

// The @word being typed right before the caret, if any
const mentionQuery = (text, caret) => /(?:^|\s)@([^\s@]{0,30})$/.exec(text.slice(0, caret))?.[1];

function SendBox({ conv, members, me, replyTo, onClearReply, onSent }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mustConfirm, setMustConfirm] = useState(false);
  const [mentions, setMentions] = useState([]); // [{ id, name }]
  const [caret, setCaret] = useState(0);
  const [run, busy] = useAction();
  const picker = useRef(null);
  const input = useRef(null);
  const typedAt = useRef(0);
  const draftKey = `orb:msg:${conv.id}`;
  useEffect(() => { setText(sessionStorage.getItem(draftKey) || ''); setFiles([]); setMentions([]); setMustConfirm(false); }, [draftKey]);
  useEffect(() => { if (text) sessionStorage.setItem(draftKey, text); else sessionStorage.removeItem(draftKey); }, [text, draftKey]);
  useEffect(() => { if (replyTo) input.current?.focus(); }, [replyTo]);

  const extra = () => ({
    reply_to: replyTo?.id || undefined,
    must_confirm: mustConfirm || undefined,
  });
  const sent = () => { setMustConfirm(false); onSent(); };

  // Voice message: upload, send, then ask for the written version (it shows up when ready)
  const rec = useRecorder({
    onDone: ({ file, duration }) => {
      setUploading(true);
      run(async () => {
        const key = await upload(file, 'message');
        const m = await api('messages.send', { conversation_id: conv.id, body: '', attachments: [{ key, name: file.name, mime: file.type, duration }], ...extra() });
        sent();
        api('messages.transcribe', { id: m.id }).catch(() => {});
      }).catch(() => {}).finally(() => setUploading(false));
    },
  });

  const change = (v) => {
    setText(v);
    setCaret(input.current?.selectionStart ?? v.length);
    if (v.trim() && conv.kind !== 'ops' && Date.now() - typedAt.current > TYPING_EVERY_MS) {
      typedAt.current = Date.now();
      api('messages.typing', { id: conv.id }).catch(() => {});
    }
  };

  const q = conv.can_mention ? mentionQuery(text, caret) : undefined;
  const choices = useMemo(() => (q === undefined ? [] : members
    .filter((p) => p.id !== me.id && !p.system && `${p.name} ${p.goes_by || ''}`.toLowerCase().split(/\s+/).concat(p.name.toLowerCase(), (p.goes_by || '').toLowerCase()).some((w) => w && w.startsWith(q.toLowerCase())))
    .slice(0, 5)), [q, members, me.id]);
  const pick = (p) => {
    const head = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${p.name} `);
    const next = head + text.slice(caret);
    setText(next);
    setMentions((x) => (x.some((y) => y.id === p.id) ? x : [...x, { id: p.id, name: p.name }]));
    requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(head.length, head.length); setCaret(head.length); } });
  };

  const add = (e) => {
    const chosen = [...e.target.files].slice(0, 6 - files.length);
    e.target.value = '';
    if (!chosen.length) return;
    setUploading(true);
    run(async () => {
      const up = await Promise.all(chosen.map(async (f) => ({ key: await upload(f, 'message'), name: f.name, mime: f.type, preview: URL.createObjectURL(f) })));
      setFiles((x) => [...x, ...up]);
    }).catch(() => {}).finally(() => setUploading(false));
  };
  const send = () => {
    if (busy || uploading || (!text.trim() && !files.length)) return;
    const body = text;
    const attachments = files.map(({ key, name, mime }) => ({ key, name, mime }));
    const ids = mentions.filter((p) => body.toLowerCase().includes(`@${p.name.toLowerCase()}`)).map((p) => p.id);
    setText(''); setFiles([]); setMentions([]);
    run(() => api('messages.send', { conversation_id: conv.id, body, attachments, mentions: ids, ...extra() })).then(sent).catch(() => { setText(body); });
  };

  if (rec.state === 'rec') return <div className="bg-surface safe-b"><RecordingBar r={rec} /></div>;
  const above = (
    <>
      {choices.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-tile" role="listbox" aria-label="People to mention">
          {choices.map((p) => (
            <Pressable key={p.id} onClick={() => pick(p)} className="flex items-center gap-3 px-3 py-2">
              <Avatar name={p.name} src={[p.photo_thumb_url, p.photo_url]} size={28} /><span className="truncate text-body font-semibold">{displayName(p)}</span>
            </Pressable>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border-l-4 border-blue bg-bg py-1.5 pl-3 pr-1">
          <div className="min-w-0 flex-1">
            <div className="text-caption font-semibold text-blue">Replying to {replyTo.sender_id === me.id ? 'yourself' : replyTo.sender.name}</div>
            <div className="truncate text-footnote text-muted">{quoteText(replyTo)}</div>
          </div>
          <IconButton icon={X} size="sm" label="Cancel reply" onClick={onClearReply} />
        </div>
      )}
      {mustConfirm && <div className="mb-2 flex items-center gap-2 rounded-2xl bg-amber-soft px-3 py-2 text-footnote text-amber"><BadgeCheck size={16} className="shrink-0" />Everyone will be asked to tap "Got it", and you'll see who has.</div>}
    </>
  );
  return (
    <div className="bg-surface safe-b">
      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-line px-3 pt-3 no-scrollbar">
          {files.map((f) => (
            <div key={f.key} className="relative shrink-0">
              {isImage(f) ? <img src={f.preview} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-xl bg-fill text-muted"><FileText size={20} /></div>}
              <IconButton icon={X} size="sm" tone="solid" label={`Remove ${f.name}`} className="absolute -right-2 -top-2 !h-7 !w-7" onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))} />
            </div>
          ))}
        </div>
      )}
      <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={add} />
      <Composer value={text} onChange={change} onSend={send} busy={busy || uploading} ready={files.length > 0} inputRef={input} above={above}
        onSelect={(e) => setCaret(e.target.selectionStart)}
        onKeyDown={(e) => { if (choices.length && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pick(choices[0]); } }}
        placeholder={conv.kind === 'ops' ? 'Reply to Orb…' : 'Message'}
        right={rec.supported && conv.kind !== 'ops'
          ? <IconButton icon={Mic} label="Hold to record a voice message" tone="primary" className="!h-11 !w-11 touch-none select-none" onPointerDown={rec.press} onContextMenu={(e) => e.preventDefault()} />
          : null}
        left={(
          <>
            <IconButton icon={Paperclip} label="Add a photo or file" className="!h-11 !w-11" disabled={uploading || files.length >= 6} onClick={() => picker.current?.click()} />
            {conv.can_confirm && <IconButton icon={BadgeCheck} label={mustConfirm ? 'Don\'t ask people to confirm' : 'Ask everyone to confirm they\'ve read it'} active={mustConfirm} className="!h-11 !w-11" onClick={() => setMustConfirm((v) => !v)} />}
          </>
        )} />
    </div>
  );
}

export function NoThread() {
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-blue-soft text-blue"><Users size={26} /></div>
        <p className="text-headline font-semibold">Choose a conversation</p>
        <p className="mt-1 text-body text-muted">Or start a new message from the list.</p>
      </div>
    </div>
  );
}
