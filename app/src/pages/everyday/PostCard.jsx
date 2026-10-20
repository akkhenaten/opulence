import { useEffect, useRef, useState } from 'react';
import { EyeOff, Flag, MessageCircle, MoreHorizontal, Pencil, Pin, PinOff, Send, Trash2, VolumeX } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, Input, Load, Sheet, relative, Toggle, useAction, useApi, useConfirm, useToast } from '../../ui/index.jsx';
import Composer from './Composer.jsx';
import { Body, isMgr, Lightbox, MentionBox, MuteSheet, PhotoGrid, reaction, REACTIONS, ROLE_LABEL } from './_parts.jsx';

const total = (r) => Object.values(r || {}).reduce((a, b) => a + b, 0);
const topEmoji = (r) => Object.entries(r || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => reaction(k)?.emoji).join('');

// Optimistic reaction state: { reactions: {kind:n}, mine }
function applyReaction(item, kind) {
  const r = { ...(item.reactions || {}) };
  if (item.mine) { r[item.mine] -= 1; if (!r[item.mine]) delete r[item.mine]; }
  if (kind) r[kind] = (r[kind] || 0) + 1;
  return { ...item, reactions: r, mine: kind };
}

/** Tap = like (or undo); long-press or hover = choose a reaction. */
export function ReactButton({ item, onReact, small }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const long = useRef(false);
  const hover = useRef(null);
  const cur = reaction(item.mine);
  const start = () => { long.current = false; timer.current = setTimeout(() => { long.current = true; setOpen(true); }, 420); };
  const end = () => clearTimeout(timer.current);
  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(hover.current); }, []);
  return (
    <div className="relative" onMouseEnter={() => { hover.current = setTimeout(() => setOpen(true), 450); }} onMouseLeave={() => { clearTimeout(hover.current); setOpen(false); }}>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-full border border-line bg-surface p-1 shadow-lg">
          {REACTIONS.map((r) => (
            <button key={r.kind} type="button" title={r.label} aria-label={r.label} onClick={() => { setOpen(false); onReact(item.mine === r.kind ? null : r.kind); }}
              className={cx('grid h-10 w-10 place-items-center rounded-full text-title2 transition hover:-translate-y-1 hover:scale-125', item.mine === r.kind && 'bg-blue-soft')}>{r.emoji}</button>
          ))}
        </div>
      )}
      <button type="button" onPointerDown={start} onPointerUp={end} onPointerLeave={end} onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (long.current) return; onReact(item.mine ? null : 'like'); }}
        className={cx('flex select-none items-center gap-1.5 rounded-xl font-semibold transition active:scale-95', small ? 'text-caption' : 'px-3 py-2 text-subhead hover:bg-bg', cur ? 'text-blue' : 'text-muted')}>
        {cur ? <span className={small ? 'text-footnote' : 'text-headline'}>{cur.emoji}</span> : !small && <span className="text-headline grayscale">👍</span>}
        {cur ? cur.label : 'Like'}
      </button>
    </div>
  );
}

function WhoReacted({ target, onClose, onPerson }) {
  const q = useApi('everyday.reactions', target || {}, { skip: !target });
  const [tab, setTab] = useState('all');
  return (
    <Sheet open={!!target} onClose={onClose} title="Reactions" size="sm">
      {target && (
        <Load q={q}>
          {(rows) => {
            const kinds = [...new Set(rows.map((r) => r.kind))];
            const shown = tab === 'all' ? rows : rows.filter((r) => r.kind === tab);
            return (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {['all', ...kinds].map((k) => (
                    <button key={k} type="button" onClick={() => setTab(k)} className={cx('rounded-full px-3 py-1 text-footnote font-semibold', tab === k ? 'bg-blue text-white' : 'bg-bg')}>
                      {k === 'all' ? `All ${rows.length}` : `${reaction(k)?.emoji} ${rows.filter((r) => r.kind === k).length}`}
                    </button>
                  ))}
                </div>
                <div className="space-y-1">
                  {shown.map((r) => (
                    <button key={r.person.id} type="button" onClick={() => onPerson(r.person.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-bg">
                      <span className="relative"><Avatar name={r.person.name} src={r.person.photo_url} size={36} /><span className="absolute -bottom-1 -right-1 text-subhead">{reaction(r.kind)?.emoji}</span></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{r.person.name}</span><span className="block text-caption text-muted">{ROLE_LABEL[r.person.role]}</span></span>
                    </button>
                  ))}
                </div>
              </>
            );
          }}
        </Load>
      )}
    </Sheet>
  );
}

function Menu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const list = items.filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="More" onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-bg"><MoreHorizontal size={20} /></button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-lg">
          {list.map((it) => (
            <button key={it.label} type="button" onClick={() => { setOpen(false); it.onClick(); }}
              className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left text-subhead font-medium hover:bg-bg', it.danger && 'text-red')}>
              <it.icon size={18} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportSheet({ target, onClose }) {
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.report', { ...target, reason }), 'Reported — a manager will take a look').then(() => { setReason(''); onClose(); }).catch(() => {});
  return (
    <Sheet open={!!target} onClose={onClose} title="Report to a manager" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={go}>Report</Button></>}>
      <p className="mb-3 text-subhead text-muted">Only managers see reports. The person isn't told who reported it.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {['Unkind or bullying', 'Shows a customer or incident', 'Personal details', 'Confidential', 'Spam'].map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className={cx('rounded-full px-3 py-1.5 text-footnote font-medium', reason === r ? 'bg-blue text-white' : 'bg-bg')}>{r}</button>
        ))}
      </div>
      <Input label="Anything else?" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Sheet>
  );
}

function HideSheet({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.hide', { ...target, reason }), 'Hidden from the feed').then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open={!!target} onClose={onClose} title={`Hide this ${target?.target_type}`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} onClick={go}>Hide</Button></>}>
      <p className="mb-3 text-subhead text-muted">Staff stop seeing it straight away; managers still can, and can unhide it. The author is told.</p>
      <Input label="Reason (shown to the author)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Sheet>
  );
}

function PinSheet({ post, onClose, onDone }) {
  const [announce, setAnnounce] = useState(false);
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.pin', { id: post.id, on: true, announce }), announce ? 'Pinned and everyone notified' : 'Pinned to the top').then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open={!!post} onClose={onClose} title="Pin to the top" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={go}>Pin</Button></>}>
      <Toggle checked={announce} onChange={setAnnounce} label="Also send it as an announcement" hint="Every member of staff gets a notification." />
    </Sheet>
  );
}

function Comment({ c, post, onReply, onChanged, onPerson, highlight, reply }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [item, setItem] = useState(c);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [report, setReport] = useState(null);
  const [hide, setHide] = useState(null);
  const [who, setWho] = useState(null);
  const el = useRef(null);
  useEffect(() => setItem(c), [c]);
  useEffect(() => { if (highlight) el.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [highlight]);
  const mine = c.author.id === user.id;
  const react = (kind) => {
    const prev = item;
    setItem(applyReaction(item, kind));
    api('everyday.react', { target_type: 'comment', target_id: c.id, kind }).catch((e) => { setItem(prev); toast(e.message, 'error'); });
  };
  const save = () => api('everyday.editComment', { id: c.id, body: text }).then(() => { setEditing(false); onChanged(); }).catch((e) => toast(e.message, 'error'));
  const del = async () => {
    if (!(await confirm({ title: 'Delete this comment?', confirm: 'Delete', danger: true }))) return;
    api('everyday.delete', { target_type: 'comment', id: c.id }).then(onChanged).catch((e) => toast(e.message, 'error'));
  };
  const n = total(item.reactions);
  return (
    <div ref={el} className={cx('flex gap-2', reply && 'ml-10')}>
      <button type="button" onClick={() => onPerson(c.author.id)} className="shrink-0"><Avatar name={c.author.name} src={c.author.photo_url} size={reply ? 26 : 32} /></button>
      <div className="min-w-0 flex-1">
        <div className={cx('relative inline-block max-w-full rounded-2xl px-3 py-2', highlight ? 'bg-blue-soft' : 'bg-bg', c.hidden_at && 'opacity-60')}>
          <button type="button" onClick={() => onPerson(c.author.id)} className="block text-footnote font-semibold">{c.author.name}</button>
          {editing ? (
            <div className="min-w-[220px]">
              <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} className="w-full resize-none bg-transparent text-body outline-none" />
              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></div>
            </div>
          ) : <Body text={c.body} mentions={c.mentions} onPerson={onPerson} className="text-body" />}
          {c.hidden_at && <div className="text-caption2 font-semibold text-red">Hidden from staff</div>}
          {n > 0 && (
            <button type="button" onClick={() => setWho({ target_type: 'comment', target_id: c.id })}
              className="absolute -bottom-2.5 right-1 flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-0.5 text-caption shadow">{topEmoji(item.reactions)}{n > 1 && <span className="text-muted">{n}</span>}</button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 px-2 text-caption text-muted">
          <span>{relative(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
          <ReactButton item={item} onReact={react} small />
          <button type="button" className="font-semibold" onClick={() => onReply(c)}>Reply</button>
          {mine && !editing && <button type="button" className="font-semibold" onClick={() => setEditing(true)}>Edit</button>}
          {mine && <button type="button" className="font-semibold" onClick={del}>Delete</button>}
          {!mine && <button type="button" className="font-semibold" onClick={() => setReport({ target_type: 'comment', target_id: c.id })}>Report</button>}
          {isMgr(user) && !mine && !c.hidden_at && <button type="button" className="font-semibold text-red" onClick={() => setHide({ target_type: 'comment', id: c.id })}>Hide</button>}
          {isMgr(user) && c.hidden_at && <button type="button" className="font-semibold" onClick={() => api('everyday.unhide', { target_type: 'comment', id: c.id }).then(onChanged)}>Unhide</button>}
        </div>
      </div>
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <HideSheet target={hide} onClose={() => setHide(null)} onDone={onChanged} />
      <WhoReacted target={who} onClose={() => setWho(null)} onPerson={(id) => { setWho(null); onPerson(id); }} />
    </div>
  );
}

function CommentBox({ post, parent, onSent, onCancel, autoFocus }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState(parent ? `@${parent.author.name} ` : '');
  const [mentions, setMentions] = useState(parent && parent.author.id !== user.id ? [parent.author.id] : []);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setText(parent ? `@${parent.author.name} ` : '');
    setMentions(parent && parent.author.id !== user.id ? [parent.author.id] : []);
  }, [parent, user.id]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api('everyday.comment', { post_id: post.id, parent_id: parent?.id, body: text, mentions });
      setText(''); setMentions([]);
      onSent(r.id);
    } catch (e) {
      toast(e.data?.need_rules ? 'Open Everyday and agree to the community rules first' : e.message, 'error');
    } finally { setBusy(false); }
  };
  return (
    <div className={cx('flex items-end gap-2', parent && 'ml-10')}>
      <Avatar name={user.name} size={parent ? 26 : 32} />
      <div className="flex min-w-0 flex-1 items-end gap-1 rounded-2xl bg-bg py-1 pl-3 pr-1">
        <div className="min-w-0 flex-1">
          <MentionBox value={text} mentions={mentions} rows={1} autoFocus={autoFocus} onSubmit={send}
            onChange={(t, ids) => { setText(t); setMentions(ids); }} placeholder={parent ? `Reply to ${parent.author.name}` : 'Write a comment'} className="py-1.5 text-body" />
        </div>
        {onCancel && <button type="button" className="px-2 py-2 text-caption font-semibold text-muted" onClick={onCancel}>Cancel</button>}
        <button type="button" aria-label="Send" disabled={!text.trim() || busy} onClick={send} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-blue disabled:opacity-30"><Send size={18} /></button>
      </div>
    </div>
  );
}

/** One post. `full` shows every comment (used on the single-post view). */
export default function PostCard({ post: initial, onChanged, onPerson, full, highlightComment }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [post, setPost] = useState(initial);
  const [comments, setComments] = useState(initial.comments || []);
  const [all, setAll] = useState(!!full);
  const [box, setBox] = useState(!!full);
  const [replyTo, setReplyTo] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState(null);
  const [hide, setHide] = useState(null);
  const [pin, setPin] = useState(null);
  const [mute, setMute] = useState(false);
  const [who, setWho] = useState(null);
  useEffect(() => { setPost(initial); setComments(initial.comments || []); }, [initial]);

  const mine = post.author.id === user.id;
  const mgr = isMgr(user);
  const reload = async () => {
    try {
      const p = await api('everyday.post', { id: post.id });
      setPost(p); setComments(p.comments); setAll(true);
    } catch (e) { if (e.status === 404) onChanged?.(); else toast(e.message, 'error'); }
  };
  const react = (kind) => {
    const prev = post;
    setPost(applyReaction(post, kind));
    api('everyday.react', { target_type: 'post', target_id: post.id, kind }).catch((e) => { setPost(prev); toast(e.message, 'error'); });
  };
  const del = async () => {
    if (!(await confirm({ title: 'Delete this post?', body: 'It is removed for everyone, with its comments.', confirm: 'Delete', danger: true }))) return;
    api('everyday.delete', { target_type: 'post', id: post.id }).then(() => { toast('Post deleted'); onChanged?.(); }).catch((e) => toast(e.message, 'error'));
  };
  const unpin = () => api('everyday.pin', { id: post.id, on: false }).then(() => { toast('Unpinned'); onChanged?.(); }).catch((e) => toast(e.message, 'error'));
  const unhide = () => api('everyday.unhide', { target_type: 'post', id: post.id }).then(() => { toast('Visible again'); onChanged?.(); }).catch((e) => toast(e.message, 'error'));

  const n = total(post.reactions);
  const top = comments.filter((c) => !c.parent_id);
  const replies = (id) => comments.filter((c) => c.parent_id === id);
  const more = post.comment_count - comments.length;

  if (editing) return <Composer post={post} rulesAccepted onCancel={() => setEditing(false)} onPosted={() => { setEditing(false); reload(); }} autoFocus />;

  return (
    <article className={cx('overflow-hidden rounded-tile bg-surface shadow-tile', post.hidden_at && 'ring-2 ring-red/30')}>
      {post.pinned_at && <div className="flex items-center gap-1.5 bg-blue-soft px-4 py-1.5 text-caption font-semibold text-blue"><Pin size={14} /> Pinned announcement</div>}
      {post.hidden_at && <div className="flex items-center gap-1.5 bg-red-soft px-4 py-1.5 text-caption font-semibold text-red"><EyeOff size={14} /> Hidden from staff{post.hidden_reason ? ` — ${post.hidden_reason}` : ''}</div>}
      <header className="flex items-center gap-3 px-4 pt-3">
        <button type="button" onClick={() => onPerson(post.author.id)}><Avatar name={post.author.name} src={post.author.photo_url} size={42} /></button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onPerson(post.author.id)} className="block truncate text-body font-semibold">{post.author.name}</button>
          <div className="text-caption text-muted">{ROLE_LABEL[post.author.role]} · {relative(post.created_at)}{post.edited_at ? ' · edited' : ''}</div>
        </div>
        <Menu items={[
          mine && { label: 'Edit post', icon: Pencil, onClick: () => setEditing(true) },
          mine && { label: 'Delete post', icon: Trash2, onClick: del, danger: true },
          !mine && { label: 'Report to a manager', icon: Flag, onClick: () => setReport({ target_type: 'post', target_id: post.id }) },
          mgr && !post.hidden_at && (post.pinned_at ? { label: 'Unpin', icon: PinOff, onClick: unpin } : { label: 'Pin to the top', icon: Pin, onClick: () => setPin(post) }),
          mgr && !mine && (post.hidden_at ? { label: 'Unhide', icon: EyeOff, onClick: unhide } : { label: 'Hide from staff', icon: EyeOff, onClick: () => setHide({ target_type: 'post', id: post.id }), danger: true }),
          mgr && !mine && { label: `Pause ${post.author.name.split(' ')[0]}'s posting`, icon: VolumeX, onClick: () => setMute(true), danger: true },
        ]} />
      </header>
      {post.body && <Body text={post.body} mentions={post.mentions} onPerson={onPerson} className={cx('px-4 pt-2', !post.photos.length && post.body.length < 90 ? 'text-title3 leading-snug' : 'text-callout leading-relaxed')} />}
      {post.photos.length > 0 && <div className="mt-3"><PhotoGrid photos={post.photos} onOpen={setPhoto} /></div>}
      {(n > 0 || post.comment_count > 0) && (
        <div className="flex items-center justify-between px-4 pt-2.5 text-footnote text-muted">
          {n > 0 ? <button type="button" onClick={() => setWho({ target_type: 'post', target_id: post.id })} className="flex items-center gap-1"><span>{topEmoji(post.reactions)}</span>{n}</button> : <span />}
          {post.comment_count > 0 && <button type="button" onClick={() => (all ? setBox(true) : reload())}>{post.comment_count} comment{post.comment_count === 1 ? '' : 's'}</button>}
        </div>
      )}
      <div className="mx-4 mt-2 flex border-t border-line py-1">
        <div className="flex flex-1 justify-center"><ReactButton item={post} onReact={react} /></div>
        <button type="button" onClick={() => { setBox(true); setReplyTo(null); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-subhead font-semibold text-muted hover:bg-bg">
          <MessageCircle size={18} /> Comment
        </button>
      </div>
      {(comments.length > 0 || box) && (
        <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
          {!all && more > 0 && <button type="button" className="text-subhead font-semibold text-muted" onClick={reload}>View all {post.comment_count} comments</button>}
          {top.map((c) => (
            <div key={c.id} className="space-y-3">
              <Comment c={c} post={post} onReply={(x) => { setReplyTo(x); setBox(true); }} onChanged={reload} onPerson={onPerson} highlight={highlightComment === c.id} />
              {replies(c.id).map((r) => <Comment key={r.id} c={r} post={post} reply onReply={() => { setReplyTo({ ...r, id: c.id }); setBox(true); }} onChanged={reload} onPerson={onPerson} highlight={highlightComment === r.id} />)}
              {replyTo?.id === c.id && <CommentBox post={post} parent={replyTo} autoFocus onCancel={() => setReplyTo(null)} onSent={() => { setReplyTo(null); reload(); }} />}
            </div>
          ))}
          {box && !replyTo && <CommentBox post={post} autoFocus={!full} onSent={reload} />}
        </div>
      )}
      <Lightbox photos={post.photos} index={photo} onClose={() => setPhoto(null)} />
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <HideSheet target={hide} onClose={() => setHide(null)} onDone={() => onChanged?.()} />
      <PinSheet post={pin} onClose={() => setPin(null)} onDone={() => onChanged?.()} />
      <MuteSheet open={mute} person={post.author} onClose={() => setMute(false)} />
      <WhoReacted target={who} onClose={() => setWho(null)} onPerson={(id) => { setWho(null); onPerson(id); }} />
    </article>
  );
}

