import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, ChevronLeft, Copy, Eye, FileText, Flag, Megaphone, Paperclip, Pencil, Trash2, UserPlus, Users, X, LogOut } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Composer } from '../../ui/Chat.jsx';
import { Avatar, Button, cx, dayLabel, ErrorBox, IconButton, Input, Lightbox, Pressable, Sheet, Spinner, Textarea, time, useAction, useApi, useConfirm, useToast } from '../../ui/index.jsx';
import { api, upload } from '../../api.js';
import { ROLE_LABEL } from '../../layouts/nav.js';
import NewMessage from './NewMessage.jsx';
import { ConvAvatar, isImage, messagesChanged, useBase } from './_parts.jsx';

const EDIT_MINUTES = 15;
const canEdit = (m) => !m.deleted_at && Date.now() - new Date(m.created_at) < EDIT_MINUTES * 60000;

export default function Thread({ id, onChanged }) {
  const { user } = useAuth();
  const base = useBase();
  const latest = useApi('messages.thread', { id }, { poll: 10000 });
  const [older, setOlder] = useState([]);
  const [more, setMore] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef(null);
  const stick = useRef(true);
  const lastId = useRef(null);

  const conv = latest.data?.conversation;
  const msgs = useMemo(() => {
    const now = latest.data?.messages || [];
    const ids = new Set(now.map((m) => m.id));
    return [...older.filter((m) => !ids.has(m.id)), ...now];
  }, [older, latest.data]);
  const hasMore = more ?? latest.data?.more;

  // New message at the bottom: mark read, refresh the inbox and badge, and follow it if the person was at the bottom
  const tail = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    if (!tail || tail === lastId.current) return;
    lastId.current = tail;
    if (conv?.member) api('messages.read', { id }).then(() => { onChanged?.(); messagesChanged(); }).catch(() => {});
    if (stick.current) requestAnimationFrame(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; });
  }, [tail, conv?.member, id, onChanged]);

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

  const refresh = () => { stick.current = true; latest.reload(); };

  if (latest.error && !latest.data) return <div className="p-4"><ErrorBox error={latest.error} retry={latest.reload} /></div>;
  if (!conv) return <Spinner className="flex-1" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadHeader conv={conv} members={latest.data.members} base={base} onChanged={() => { latest.reload(); onChanged?.(); }} />
      {conv.oversight && (
        <div className="flex items-center gap-2 border-b border-line bg-amber-soft px-4 py-2 text-footnote text-amber">
          <Eye size={16} className="shrink-0" />You're viewing this conversation as a company manager. Your access is recorded in the audit log.
        </div>
      )}
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {hasMore && <div className="mb-3 text-center"><Button variant="ghost" size="sm" busy={loadingOlder} onClick={loadOlder}>Load earlier messages</Button></div>}
        {!msgs.length && <p className="py-10 text-center text-body text-muted">No messages yet. Say hello.</p>}
        <MessageList msgs={msgs} me={user} conv={conv} onReplied={refresh} />
      </div>
      {conv.member ? <SendBox conv={conv} onSent={refresh} /> : !conv.oversight && <p className="border-t border-line p-4 text-center text-footnote text-muted">You're no longer in this conversation.</p>}
    </div>
  );
}

function ThreadHeader({ conv, members, base, onChanged }) {
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
            {p.system ? <ConvAvatar c={{ kind: 'ops' }} size={40} /> : <Avatar name={p.name} src={p.photo_url} size={40} />}
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

function MessageList({ msgs, me, conv, onReplied }) {
  const [photos, setPhotos] = useState(null);
  const [action, setAction] = useState(null);
  let lastDay = null;
  return (
    <>
      {msgs.map((m, i) => {
        const day = dayLabel(m.created_at);
        const sep = day !== lastDay;
        lastDay = day;
        const mine = m.sender_id === me.id;
        const prev = msgs[i - 1];
        const first = sep || !prev || prev.sender_id !== m.sender_id;
        const images = m.attachments.filter(isImage);
        const files = m.attachments.filter((a) => !isImage(a));
        return (
          <div key={m.id}>
            {sep && <div className="my-4 text-center text-caption font-semibold text-muted">{day}</div>}
            <div className={cx('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-1')}>
              {!mine && conv.kind !== 'direct' && (
                <div className="w-8 shrink-0">{first && (m.sender.system ? <ConvAvatar c={{ kind: 'ops' }} size={32} /> : <Avatar name={m.sender.name} src={m.sender.photo_url} size={32} />)}</div>
              )}
              <div className={cx('flex max-w-[82%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
                {first && !mine && conv.kind !== 'direct' && <div className="mb-0.5 px-3 text-caption font-semibold text-muted">{m.sender.name}</div>}
                {images.length > 0 && (
                  <div className={cx('mb-1 grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                    {images.map((a, k) => (
                      <Pressable press key={a.url} onClick={() => setPhotos({ list: images, i: k })} className="overflow-hidden rounded-2xl">
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
                {(m.body || m.deleted_at) && (
                  <Pressable press onClick={() => !m.deleted_at && setAction(m)}
                    className={cx('whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-body leading-snug',
                      m.deleted_at ? 'border border-line italic text-muted' : mine ? 'bg-blue text-white' : m.sender.system ? 'bg-blue-soft text-ink' : 'bg-fill text-ink')}>
                    {m.deleted_at ? 'Message deleted' : m.body}
                  </Pressable>
                )}
                <div className="mt-0.5 px-2 text-caption2 text-faint">{time(m.created_at)}{m.edited_at && !m.deleted_at ? ' · Edited' : ''}</div>
                {m.quick && !mine && <QuickReplies m={m} onDone={onReplied} />}
              </div>
            </div>
          </div>
        );
      })}
      <Lightbox photos={photos?.list || []} index={photos?.i} onClose={() => setPhotos(null)} download />
      <ActionSheet m={action} me={me} onClose={() => setAction(null)} onChanged={onReplied} />
    </>
  );
}

// Buttons under an Orb Ops question ("On my way" / "Can't make it", "Accept" / "Decline")
function QuickReplies({ m, onDone }) {
  const [run, busy] = useAction();
  const [picked, setPicked] = useState(null);
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {m.quick.options.map((o) => (
        <Button key={o.value} size="sm" variant={o.value === 'accept' || o.value === 'on_my_way' ? 'primary' : 'secondary'} busy={busy && picked === o.value} disabled={busy}
          onClick={() => { setPicked(o.value); run(() => api('messages.reply', { message_id: m.id, value: o.value })).then(onDone).catch(onDone); }}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function ActionSheet({ m, me, onClose, onChanged }) {
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

  const copy = async () => { await navigator.clipboard?.writeText(m.body).catch(() => {}); toast('Copied'); close(); };
  const del = async () => {
    close();
    if (!(await confirm({ title: 'Delete this message?', body: 'Everyone in the conversation will see "Message deleted".', confirm: 'Delete', danger: true }))) return;
    await run(() => api('messages.delete', { id: m.id }), 'Deleted');
    onChanged();
  };
  const save = () => run(async () => {
    if (mode === 'edit') await api('messages.edit', { id: m.id, body: text });
    else await api('messages.report', { message_id: m.id, reason: text });
    close();
    onChanged();
  }, mode === 'edit' ? 'Saved' : 'Reported to the company managers');
  // Venue managers: read a chat message into the cover request form
  const toCover = () => run(async () => {
    const r = await api('venueRequests.create', { text: m.body, draft: true });
    close();
    if (r.draft) nav('/venue/cover', { state: { draft: r.draft } });
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
    m.body && { icon: Copy, label: 'Copy text', onClick: copy },
    user.role === 'venue' && m.body && { icon: Megaphone, label: 'Turn into cover request', onClick: toCover, busy },
    mine && canEdit(m) && { icon: Pencil, label: 'Edit', onClick: () => { setText(m.body); setMode('edit'); } },
    mine && { icon: Trash2, label: 'Delete', onClick: del, danger: true },
    !mine && !m.sender.system && { icon: Flag, label: 'Report to the company', onClick: () => { setText(''); setMode('report'); }, danger: true },
  ].filter(Boolean);
  return (
    <Sheet open onClose={close} title="Message" size="sm">
      <p className="mb-3 line-clamp-3 rounded-2xl bg-bg px-3 py-2 text-footnote text-muted">{m.body}</p>
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

function SendBox({ conv, onSent }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [run, busy] = useAction();
  const picker = useRef(null);
  const draftKey = `orb:msg:${conv.id}`;
  useEffect(() => { setText(sessionStorage.getItem(draftKey) || ''); setFiles([]); }, [draftKey]);
  useEffect(() => { if (text) sessionStorage.setItem(draftKey, text); else sessionStorage.removeItem(draftKey); }, [text, draftKey]);

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
    setText(''); setFiles([]);
    run(() => api('messages.send', { conversation_id: conv.id, body, attachments })).then(onSent).catch(() => { setText(body); });
  };
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
      <Composer value={text} onChange={setText} onSend={send} busy={busy || uploading} ready={files.length > 0}
        placeholder={conv.kind === 'ops' ? 'Reply to Orb Ops…' : 'Message'}
        left={<IconButton icon={Paperclip} label="Add a photo or file" className="!h-11 !w-11" disabled={uploading || files.length >= 6} onClick={() => picker.current?.click()} />} />
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
