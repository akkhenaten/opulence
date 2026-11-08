import { useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkX, EyeOff, Flag, Megaphone, MessageCircle, Pencil, Pin, PinOff, Send, Trash2, UserMinus, VolumeX } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, MoreMenu, Pressable, relative, Sheet, Toggle, useAction, useConfirm, useToast } from '../../ui/index.jsx';
import { AckBar, AudienceSheet, CelebrationCard, EventCard, PollCard, ShoutoutCard } from './Cards.jsx';
import Comments, { applyReaction, HideSheet, ReactButton, RemoveSheet, ReportSheet, topEmoji, total, WhoReacted } from './Comments.jsx';
import Composer from './Composer.jsx';
import ShareSheet from './ShareSheet.jsx';
import { Body, isMgr, Lightbox, LinkCard, MuteSheet, PhotoGrid, PlaceLine, ROLE_LABEL, VideoPlayer, WithLine } from './_parts.jsx';

export { ReactButton };

// Pinned posts that stay on screen for about a second count as seen; sent in small batches
const seenQueue = new Set();
const seenDone = new Set();
let seenTimer = null;
function markSeen(id) {
  if (seenDone.has(id)) return;
  seenDone.add(id);
  seenQueue.add(id);
  clearTimeout(seenTimer);
  seenTimer = setTimeout(() => {
    const ids = [...seenQueue];
    seenQueue.clear();
    api('everyday.seenPosts', { ids }).catch(() => ids.forEach((x) => seenDone.delete(x)));
  }, 1500);
}
function useSeen(ref, post, me) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !post.pinned_at || post.author.id === me || post.audience?.seen_at || typeof IntersectionObserver === 'undefined') return undefined;
    let t = null;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(t);
      if (e.isIntersecting) t = setTimeout(() => { markSeen(post.id); io.disconnect(); }, 1000);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [post.id, post.pinned_at, post.audience?.seen_at, me]); // eslint-disable-line react-hooks/exhaustive-deps
}

// The post's … menu (the app's shared one)
const Menu = ({ items }) => <MoreMenu items={items} label="More" title="Post" />;

function PinSheet({ post, onClose, onDone }) {
  const [announce, setAnnounce] = useState(false);
  const [ack, setAck] = useState(false);
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.pin', { id: post.id, on: true, announce, must_ack: ack }),
    ack ? 'Pinned — everyone is asked to confirm they read it' : announce ? 'Pinned and everyone notified' : 'Pinned to the top')
    .then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open={!!post} onClose={onClose} title="Pin to the top" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={go}>Pin</Button></>}>
      <Toggle checked={announce || ack} onChange={setAnnounce} label="Also send it as an announcement" hint="Every member of staff gets a notification." />
      <Toggle checked={ack} onChange={setAck} label="Everyone must confirm they read it" hint={'Staff see an "I\'ve read this" button. You see who has and can remind the rest.'} />
    </Sheet>
  );
}

const KIND_LABEL = { shoutout: 'gave a shout-out', poll: 'asked', event: 'posted an event' };

/** One post. `full` shows every comment (used on the single-post view). */
export default function PostCard({ post: initial, onChanged, onPerson, full, highlightComment }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [post, setPost] = useState(initial);
  const [comments, setComments] = useState(initial.comments || []);
  const [all, setAll] = useState(!!full);
  const [order, setOrder] = useState('relevant');
  const [box, setBox] = useState(!!full);
  const [photo, setPhoto] = useState(null);
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState(null);
  const [hide, setHide] = useState(null);
  const [remove, setRemove] = useState(null);
  const [pin, setPin] = useState(null);
  const [mute, setMute] = useState(false);
  const [who, setWho] = useState(null);
  const [share, setShare] = useState(null);
  const [audience, setAudience] = useState(null);
  const el = useRef(null);
  useEffect(() => { setPost(initial); if (!all || full) setComments(initial.comments || []); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  useSeen(el, post, user.id);

  const mine = post.author.id === user.id;
  const mgr = isMgr(user);
  const tagged = post.tags?.some((t) => t.id === user.id);
  const reload = async (o = order) => {
    try {
      const p = await api('everyday.post', { id: post.id, comment_order: o });
      setPost(p); setComments(p.comments); setAll(true); setOrder(o);
    } catch (e) { if (e.status === 404) onChanged?.(); else toast(e.message, 'error'); }
  };
  // Cards update in place; `fetch` reloads the post from the server
  const update = (next, fetch) => { if (next) setPost(next); if (fetch) reload(); };
  const react = (kind) => {
    const prev = post;
    setPost(applyReaction(post, kind));
    api('everyday.react', { target_type: 'post', target_id: post.id, kind }).catch((e) => { setPost(prev); toast(e.message, 'error'); });
  };
  const del = async () => {
    if (!(await confirm({ title: 'Delete this post?', body: 'It is removed for everyone, with its comments.', confirm: 'Delete', danger: true }))) return;
    api('everyday.delete', { target_type: 'post', id: post.id }).then(() => { toast('Post deleted'); onChanged?.(); }).catch((e) => toast(e.message, 'error'));
  };
  const save = () => api('everyday.save', { id: post.id, on: !post.saved })
    .then(() => { setPost((p) => ({ ...p, saved: !p.saved })); toast(post.saved ? 'Removed from saved' : 'Saved — find it under Saved'); })
    .catch((e) => toast(e.message, 'error'));
  const untag = () => api('everyday.untag', { id: post.id }).then(() => { toast('Your tag was removed'); reload(); }).catch((e) => toast(e.message, 'error'));
  const unpin = () => api('everyday.pin', { id: post.id, on: false }).then(() => { toast('Unpinned'); onChanged?.(); }).catch((e) => toast(e.message, 'error'));
  const unhide = () => api('everyday.unhide', { target_type: 'post', id: post.id }).then(() => { toast('Visible again'); onChanged?.(); }).catch((e) => toast(e.message, 'error'));

  const n = total(post.reactions);
  const celebration = post.kind === 'celebration';

  if (editing) return <Composer post={post} rulesAccepted onCancel={() => setEditing(false)} onPosted={() => { setEditing(false); reload(); }} autoFocus />;

  return (
    <article ref={el} className={cx('overflow-hidden rounded-tile bg-surface shadow-tile', post.hidden_at && 'ring-2 ring-red/30')}>
      {post.pinned_at && <div className="flex items-center gap-1.5 bg-blue-soft px-4 py-1.5 text-caption font-semibold text-blue"><Pin size={14} /> {post.must_ack ? 'Pinned — please read and confirm' : 'Pinned announcement'}</div>}
      {!post.pinned_at && post.announced && <div className="flex items-center gap-1.5 bg-blue-soft px-4 py-1.5 text-caption font-semibold text-blue"><Megaphone size={14} /> Important notice</div>}
      {post.hidden_at && <div className="flex items-center gap-1.5 bg-red-soft px-4 py-1.5 text-caption font-semibold text-red"><EyeOff size={14} /> Hidden from staff{post.hidden_reason ? ` — ${post.hidden_reason}` : ''}</div>}
      <header className="flex items-start gap-3 px-4 pt-3">
        <Pressable press onClick={() => onPerson(post.author.id)}><Avatar name={post.author.name} src={[post.author.photo_thumb_url, post.author.photo_url]} size={42} /></Pressable>
        <div className="min-w-0 flex-1">
          <div className="text-body leading-snug text-muted">
            <Pressable press onClick={() => onPerson(post.author.id)} className="inline font-semibold text-ink">{post.author.name}</Pressable>
            {KIND_LABEL[post.kind] && <> {KIND_LABEL[post.kind]}</>}
            {post.tags?.length > 0 && <> <WithLine people={post.tags} onPerson={onPerson} /></>}
            {post.place && post.kind !== 'event' && <> at <PlaceLine place={post.place} /></>}
          </div>
          <div className="text-caption text-muted">{celebration ? 'Celebrating the team' : ROLE_LABEL[post.author.role]} · {relative(post.created_at)}{post.edited_at ? ' · edited' : ''}</div>
        </div>
        <Menu items={[
          { label: post.saved ? 'Remove from saved' : 'Save post', icon: post.saved ? BookmarkX : Bookmark, onClick: save },
          !post.hidden_at && { label: 'Share to a chat', icon: Send, onClick: () => setShare(post) },
          mine && !celebration && post.kind !== 'poll' && { label: post.kind === 'event' ? 'Edit event' : 'Edit post', icon: Pencil, onClick: () => setEditing(true) },
          mine && { label: 'Delete post', icon: Trash2, onClick: del, danger: true },
          tagged && !mine && { label: 'Remove my tag', icon: UserMinus, onClick: untag },
          !mine && { label: 'Report to a manager', icon: Flag, onClick: () => setReport({ target_type: 'post', target_id: post.id }) },
          mgr && !post.hidden_at && (post.pinned_at ? { label: 'Unpin', icon: PinOff, onClick: unpin } : { label: 'Pin to the top', icon: Pin, onClick: () => setPin(post) }),
          mgr && !mine && (post.hidden_at ? { label: 'Unhide', icon: EyeOff, onClick: unhide } : { label: 'Hide from staff', icon: EyeOff, onClick: () => setHide({ target_type: 'post', id: post.id }), danger: true }),
          mgr && !mine && { label: 'Remove permanently', icon: Trash2, onClick: () => setRemove({ target_type: 'post', id: post.id }), danger: true },
          mgr && !mine && !celebration && { label: `Pause ${post.author.name.split(' ')[0]}'s posting`, icon: VolumeX, onClick: () => setMute(true), danger: true },
        ]} />
      </header>
      {post.body && <Body text={post.body} mentions={post.mentions} onPerson={onPerson}
        className={cx('px-4 pt-2', post.kind === 'poll' ? 'text-headline' : !post.photos.length && !post.video && !post.link && post.kind === 'post' && post.body.length < 90 ? 'text-title3 leading-snug' : 'text-callout leading-relaxed')} />}
      {post.kind === 'shoutout' && <ShoutoutCard post={post} onPerson={onPerson} />}
      {celebration && <CelebrationCard post={post} onChanged={onChanged} onPerson={onPerson} />}
      {post.kind === 'poll' && post.poll && <PollCard post={post} onUpdate={update} />}
      {post.kind === 'event' && post.event && <EventCard post={post} onUpdate={update} onEdit={() => setEditing(true)} onPerson={onPerson} />}
      <AckBar post={post} onUpdate={update} onAudience={() => setAudience(post)} />
      {post.video && <div className="mt-3"><VideoPlayer video={post.video} /></div>}
      {post.photos.length > 0 && <div className="mt-3"><PhotoGrid photos={post.photos} onOpen={setPhoto} /></div>}
      {post.link && !post.photos.length && !post.video && <LinkCard link={post.link} className="mt-3" />}
      {(n > 0 || post.comment_count > 0) && (
        <div className="flex items-center justify-between px-4 pt-2.5 text-footnote text-muted">
          {n > 0 ? <Pressable press onClick={() => setWho({ target_type: 'post', target_id: post.id })} className="-my-2 flex items-center gap-1 py-2"><span>{topEmoji(post.reactions)}</span>{n}</Pressable> : <span />}
          {post.comment_count > 0 && <Pressable press className="-my-2 py-2" onClick={() => (all ? setBox(true) : reload())}>{post.comment_count} comment{post.comment_count === 1 ? '' : 's'}</Pressable>}
        </div>
      )}
      <div className="mx-4 mt-2 flex border-t border-line py-1">
        <div className="flex flex-1 justify-center"><ReactButton item={post} onReact={react} /></div>
        <Pressable press onClick={() => setBox(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-subhead font-semibold text-muted hover:bg-bg">
          <MessageCircle size={18} /> Comment
        </Pressable>
        {!post.hidden_at && (
          <Pressable press onClick={() => setShare(post)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-subhead font-semibold text-muted hover:bg-bg">
            <Send size={18} /> Share
          </Pressable>
        )}
      </div>
      <Comments post={post} comments={comments} all={all} order={order} loadAll={reload} box={box} onPerson={onPerson} highlight={highlightComment} autoFocus={!full} />
      <Lightbox photos={post.photos.map((p) => ({ url: p.url, caption: p.caption }))} index={photo} onClose={() => setPhoto(null)} />
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <HideSheet target={hide} onClose={() => setHide(null)} onDone={() => onChanged?.()} />
      <RemoveSheet target={remove} onClose={() => setRemove(null)} onDone={() => onChanged?.()} />
      <PinSheet post={pin} onClose={() => setPin(null)} onDone={() => onChanged?.()} />
      <MuteSheet open={mute} person={post.author} onClose={() => setMute(false)} />
      <WhoReacted target={who} onClose={() => setWho(null)} onPerson={(id) => { setWho(null); onPerson(id); }} />
      <ShareSheet post={share} onClose={() => setShare(null)} />
      <AudienceSheet post={audience} onClose={() => setAudience(null)} />
    </article>
  );
}
