import { useEffect, useRef, useState } from 'react';
import { Camera, Send, X } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, Input, Load, Pressable, relative, Segmented, Sheet, Spinner, useAction, useApi, useConfirm, useToast } from '../../ui/index.jsx';
import { compressImage } from '../officer/_parts.jsx';
import { Body, isMgr, Lightbox, MentionBox, reaction, REACTIONS, ROLE_LABEL } from './_parts.jsx';

export const total = (r) => Object.values(r || {}).reduce((a, b) => a + b, 0);
export const topEmoji = (r) => Object.entries(r || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => reaction(k)?.emoji).join('');

// Optimistic reaction state: { reactions: {kind:n}, mine }
export function applyReaction(item, kind) {
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
            <Pressable press key={r.kind} title={r.label} aria-label={r.label} onClick={() => { setOpen(false); onReact(item.mine === r.kind ? null : r.kind); }}
              className={cx('grid h-10 w-10 place-items-center rounded-full text-title2 transition hover:-translate-y-1 hover:scale-125', item.mine === r.kind && 'bg-blue-soft')}>{r.emoji}</Pressable>
          ))}
        </div>
      )}
      <Pressable press onPointerDown={start} onPointerUp={end} onPointerLeave={end} onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (long.current) return; onReact(item.mine ? null : 'like'); }}
        className={cx('flex select-none items-center gap-1.5 rounded-xl font-semibold transition active:scale-95', small ? '-my-2 py-2 text-caption' : 'px-3 py-2 text-subhead hover:bg-bg', cur ? 'text-blue' : 'text-muted')}>
        {cur ? <span className={small ? 'text-footnote' : 'text-headline'}>{cur.emoji}</span> : !small && <span className="text-headline grayscale">👍</span>}
        {cur ? cur.label : 'Like'}
      </Pressable>
    </div>
  );
}

export function WhoReacted({ target, onClose, onPerson }) {
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
                    <Pressable press key={k} onClick={() => setTab(k)} className={cx('rounded-full px-3 py-1 text-footnote font-semibold', tab === k ? 'bg-blue text-white' : 'bg-bg')}>
                      {k === 'all' ? `All ${rows.length}` : `${reaction(k)?.emoji} ${rows.filter((r) => r.kind === k).length}`}
                    </Pressable>
                  ))}
                </div>
                <div className="space-y-1">
                  {shown.map((r) => (
                    <Pressable press key={r.person.id} onClick={() => onPerson(r.person.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-bg">
                      <span className="relative"><Avatar name={r.person.name} src={r.person.photo_url} size={36} /><span className="absolute -bottom-1 -right-1 text-subhead">{reaction(r.kind)?.emoji}</span></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{r.person.name}</span><span className="block text-caption text-muted">{ROLE_LABEL[r.person.role]}</span></span>
                    </Pressable>
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

export function ReportSheet({ target, onClose }) {
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.report', { ...target, reason }), 'Reported — a manager will take a look').then(() => { setReason(''); onClose(); }).catch(() => {});
  return (
    <Sheet open={!!target} onClose={onClose} title="Report to a manager" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={go}>Report</Button></>}>
      <p className="mb-3 text-subhead text-muted">Only managers see reports. The person isn't told who reported it.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {['Unkind or bullying', 'Shows a customer or incident', 'Personal details', 'Confidential', 'Spam'].map((r) => (
          <Pressable press key={r} onClick={() => setReason(r)} className={cx('rounded-full px-3 py-1.5 text-footnote font-medium', reason === r ? 'bg-blue text-white' : 'bg-bg')}>{r}</Pressable>
        ))}
      </div>
      <Input label="Anything else?" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Sheet>
  );
}

export function HideSheet({ target, onClose, onDone }) {
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

/** Manager removes a post or comment for good; a copy is kept in the audit log. */
export function RemoveSheet({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const go = () => run(() => api('everyday.remove', { ...target, reason }), 'Removed').then(() => { setReason(''); onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open={!!target} onClose={onClose} title={`Remove this ${target?.target_type} permanently`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} onClick={go}>Remove</Button></>}>
      <p className="mb-3 text-subhead text-muted">It disappears for everyone, managers included. A copy is kept in the audit log, and the author is told.</p>
      <Input label="Reason (shown to the author)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shows a customer's face" />
    </Sheet>
  );
}

function Comment({ c, onReply, onChanged, onPerson, onPhoto, highlight, reply }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [item, setItem] = useState(c);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.body);
  const [ids, setIds] = useState(c.mentions?.map((m) => m.id) || []);
  const [report, setReport] = useState(null);
  const [hide, setHide] = useState(null);
  const [remove, setRemove] = useState(null);
  const [who, setWho] = useState(null);
  const el = useRef(null);
  useEffect(() => setItem(c), [c]);
  useEffect(() => { if (highlight) el.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [highlight]);
  const mine = c.author.id === user.id;
  const mgr = isMgr(user);
  const react = (kind) => {
    const prev = item;
    setItem(applyReaction(item, kind));
    api('everyday.react', { target_type: 'comment', target_id: c.id, kind }).catch((e) => { setItem(prev); toast(e.message, 'error'); });
  };
  const startEdit = () => { setText(c.body); setIds(c.mentions?.map((m) => m.id) || []); setEditing(true); };
  const save = () => api('everyday.editComment', { id: c.id, body: text, mentions: ids })
    .then((r) => { setEditing(false); if (r?.held) toast('Your comment is held for a manager to check', 'error'); onChanged(); })
    .catch((e) => toast(e.message, 'error'));
  const del = async () => {
    if (!(await confirm({ title: 'Delete this comment?', confirm: 'Delete', danger: true }))) return;
    api('everyday.delete', { target_type: 'comment', id: c.id }).then(onChanged).catch((e) => toast(e.message, 'error'));
  };
  const n = total(item.reactions);
  return (
    <div ref={el} className={cx('flex gap-2', reply && 'ml-10')}>
      <Pressable press onClick={() => onPerson(c.author.id)} className="shrink-0"><Avatar name={c.author.name} src={c.author.photo_url} size={reply ? 26 : 32} /></Pressable>
      <div className="min-w-0 flex-1">
        <div className={cx('relative inline-block max-w-full rounded-2xl px-3 py-2', highlight ? 'bg-blue-soft' : 'bg-bg', c.hidden_at && 'opacity-70', editing && 'w-full')}>
          <Pressable press onClick={() => onPerson(c.author.id)} className="block text-footnote font-semibold">{c.author.name}</Pressable>
          {editing ? (
            <div className="min-w-[220px]">
              <MentionBox value={text} mentions={ids} rows={2} autoFocus onChange={(t, m) => { setText(t); setIds(m); }} className="text-body" />
              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></div>
            </div>
          ) : c.body && <Body text={c.body} mentions={c.mentions} onPerson={onPerson} className="text-body" />}
          {c.held ? <div className="text-caption2 font-semibold text-amber">Held for review — only you and managers can see it</div>
            : c.hidden_at && <div className="text-caption2 font-semibold text-red">Hidden from staff{c.hidden_reason ? ` — ${c.hidden_reason}` : ''}</div>}
          {n > 0 && (
            <Pressable press onClick={() => setWho({ target_type: 'comment', target_id: c.id })}
              className="absolute -bottom-2.5 right-1 flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-0.5 text-caption shadow">{topEmoji(item.reactions)}{n > 1 && <span className="text-muted">{n}</span>}</Pressable>
          )}
        </div>
        {c.photo?.url && (
          <Pressable press onClick={() => onPhoto(c.photo)} className="mt-1 block w-fit overflow-hidden rounded-2xl">
            <img src={c.photo.url} alt="" loading="lazy" className="max-h-52 max-w-[240px] object-cover" />
          </Pressable>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 px-2 text-caption text-muted">
          <span>{relative(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
          <ReactButton item={item} onReact={react} small />
          <Pressable press className="-my-2 py-2 font-semibold" onClick={() => onReply(c)}>Reply</Pressable>
          {mine && !editing && <Pressable press className="-my-2 py-2 font-semibold" onClick={startEdit}>Edit</Pressable>}
          {mine && <Pressable press className="-my-2 py-2 font-semibold" onClick={del}>Delete</Pressable>}
          {!mine && <Pressable press className="-my-2 py-2 font-semibold" onClick={() => setReport({ target_type: 'comment', target_id: c.id })}>Report</Pressable>}
          {mgr && !mine && !c.hidden_at && <Pressable press className="-my-2 py-2 font-semibold text-red" onClick={() => setHide({ target_type: 'comment', id: c.id })}>Hide</Pressable>}
          {mgr && c.hidden_at && <Pressable press className="-my-2 py-2 font-semibold" onClick={() => api('everyday.unhide', { target_type: 'comment', id: c.id }).then(onChanged)}>Unhide</Pressable>}
          {mgr && !mine && <Pressable press className="-my-2 py-2 font-semibold text-red" onClick={() => setRemove({ target_type: 'comment', id: c.id })}>Remove</Pressable>}
        </div>
      </div>
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <HideSheet target={hide} onClose={() => setHide(null)} onDone={onChanged} />
      <RemoveSheet target={remove} onClose={() => setRemove(null)} onDone={onChanged} />
      <WhoReacted target={who} onClose={() => setWho(null)} onPerson={(id) => { setWho(null); onPerson(id); }} />
    </div>
  );
}

export function CommentBox({ post, parent, onSent, onCancel, autoFocus }) {
  const { user } = useAuth();
  const toast = useToast();
  const prefill = parent && parent.author.id !== user.id ? `@${parent.author.name} ` : '';
  const [text, setText] = useState(prefill);
  const [mentions, setMentions] = useState(parent && parent.author.id !== user.id ? [parent.author.id] : []);
  const [photo, setPhoto] = useState(null); // { key, w, h, url } | 'busy'
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  useEffect(() => {
    setText(prefill);
    setMentions(parent && parent.author.id !== user.id ? [parent.author.id] : []);
  }, [parent, user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = async (f) => {
    if (!f) return;
    setPhoto('busy');
    try {
      const small = await compressImage(f);
      let w = null; let h = null;
      try { const b = await createImageBitmap(small); w = b.width; h = b.height; b.close?.(); } catch { /* size unknown */ }
      const key = await upload(small, 'feed');
      setPhoto({ key, w, h, url: URL.createObjectURL(small) });
    } catch (e) { setPhoto(null); toast(e.message || 'Photo upload failed', 'error'); }
  };
  const ready = (text.trim() || (photo && photo !== 'busy')) && photo !== 'busy';
  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const r = await api('everyday.comment', { post_id: post.id, parent_id: parent?.id, body: text, mentions, photo: photo ? { key: photo.key, w: photo.w, h: photo.h } : undefined });
      setText(''); setMentions([]); setPhoto(null);
      if (r.held) toast('Orb AI held your comment for a manager to check', 'error');
      onSent(r.id);
    } catch (e) {
      toast(e.data?.need_rules ? 'Open Everyday and agree to the community rules first' : e.message, 'error');
    } finally { setBusy(false); }
  };
  return (
    <div className={cx('flex items-end gap-2', parent && 'ml-10')}>
      <Avatar name={user.name} src={user.photo_url} size={parent ? 26 : 32} />
      <div className="min-w-0 flex-1 rounded-2xl bg-bg py-1 pl-3 pr-1">
        {photo && (
          <div className="relative mb-1 mt-1 h-20 w-20 overflow-hidden rounded-xl bg-surface">
            {photo === 'busy' ? <Spinner className="h-full py-0" /> : <img src={photo.url} alt="" className="h-full w-full object-cover" />}
            {photo !== 'busy' && <Pressable press aria-label="Remove photo" onClick={() => setPhoto(null)} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><X size={14} /></Pressable>}
          </div>
        )}
        <div className="flex items-end gap-1">
          <div className="min-w-0 flex-1">
            <MentionBox value={text} mentions={mentions} rows={1} autoFocus={autoFocus} onSubmit={send}
              onChange={(t, ids) => { setText(t); setMentions(ids); }} placeholder={parent ? `Reply to ${parent.author.name}` : 'Write a comment'} className="py-1.5 text-body" />
          </div>
          {onCancel && <Pressable press className="px-2 py-2 text-caption font-semibold text-muted" onClick={onCancel}>Cancel</Pressable>}
          <Pressable press aria-label="Add a photo" disabled={!!photo} onClick={() => file.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted disabled:opacity-30"><Camera size={18} /></Pressable>
          <Pressable press aria-label="Send" disabled={!ready || busy} onClick={send} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-blue disabled:opacity-30"><Send size={18} /></Pressable>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
}

/**
 * Comments under a post: threads one level deep, "View N replies", an inline reply box under the comment,
 * and in the full view a Most relevant / Newest switch. loadAll(order) fetches every comment.
 */
export default function Comments({ post, comments, all, order, loadAll, box, onPerson, highlight, autoFocus }) {
  const [replyTo, setReplyTo] = useState(null); // top-level comment id + who to answer
  const [open, setOpen] = useState(() => new Set());
  const [photo, setPhoto] = useState(null);
  useEffect(() => {
    if (!highlight) return;
    const c = comments.find((x) => x.id === highlight);
    if (c?.parent_id) setOpen((s) => new Set(s).add(c.parent_id));
  }, [highlight, comments]);
  const top = comments.filter((c) => !c.parent_id);
  const repliesOf = (id) => comments.filter((c) => c.parent_id === id);
  const more = post.comment_count - comments.length;
  const reload = () => loadAll(order);
  const showReplies = async (id) => {
    if (!all) await loadAll(order);
    setOpen((s) => new Set(s).add(id));
  };
  const reply = (thread, to) => setReplyTo({ id: thread.id, author: to.author });
  if (!comments.length && !box) return null;
  return (
    <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
      {all && top.length > 1 && (
        <Segmented value={order} onChange={(v) => loadAll(v)} className="max-w-[260px]"
          options={[{ value: 'relevant', label: 'Most relevant' }, { value: 'newest', label: 'Newest' }]} />
      )}
      {!all && more > 0 && <Pressable press className="-my-2 py-2 text-subhead font-semibold text-muted" onClick={reload}>View all {post.comment_count} comments</Pressable>}
      {top.map((c) => {
        const list = repliesOf(c.id);
        const shown = open.has(c.id) ? list : list.slice(0, 1);
        const hidden = Math.max(0, (c.reply_count ?? list.length) - shown.length);
        return (
          <div key={c.id} className="space-y-3">
            <Comment c={c} onReply={() => reply(c, c)} onChanged={reload} onPerson={onPerson} onPhoto={setPhoto} highlight={highlight === c.id} />
            {shown.map((r) => <Comment key={r.id} c={r} reply onReply={() => reply(c, r)} onChanged={reload} onPerson={onPerson} onPhoto={setPhoto} highlight={highlight === r.id} />)}
            {hidden > 0 && (
              <Pressable press className="-my-1 ml-10 py-1 text-footnote font-semibold text-muted" onClick={() => showReplies(c.id)}>
                ↳ View {hidden}{shown.length ? ' more' : ''} repl{hidden === 1 ? 'y' : 'ies'}
              </Pressable>
            )}
            {replyTo?.id === c.id && (
              <CommentBox post={post} parent={replyTo} autoFocus onCancel={() => setReplyTo(null)}
                onSent={() => { setReplyTo(null); setOpen((s) => new Set(s).add(c.id)); reload(); }} />
            )}
          </div>
        );
      })}
      {box && <CommentBox post={post} autoFocus={autoFocus} onSent={reload} />}
      <Lightbox photos={photo ? [{ url: photo.url }] : []} index={photo ? 0 : null} onClose={() => setPhoto(null)} />
    </div>
  );
}
