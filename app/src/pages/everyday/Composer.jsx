import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, Film, ImagePlus, MapPin, Megaphone, Pencil, Plus, UserPlus, X } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, Input, Pressable, Select, Sheet, Spinner, Toggle, useToast } from '../../ui/index.jsx';
import { PhotoEditor } from '../../ui/PhotoEditor.jsx';
import { compressImage } from '../officer/_parts.jsx';
import PlacePicker from './PlacePicker.jsx';
import {
  BADGES, fromLocalInput, isMgr, LinkCard, MentionBox, PeoplePicker, RulesSheet, toLocalInput, useEverydaySettings, usePeople, VIDEO_MAX_BYTES, VIDEO_MAX_S,
} from './_parts.jsx';

const MAX = 10;
const firstUrl = (t) => { const m = /\bhttps?:\/\/[^\s<>"')\]]+/i.exec(t || ''); return m ? m[0].replace(/[.,!?;:]+$/, '') : null; };
const sizeOf = async (file) => { try { const b = await createImageBitmap(file); const r = { w: b.width, h: b.height }; b.close?.(); return r; } catch { return { w: null, h: null }; } };

// Length, size and a still frame (at half a second) from a picked video
function readVideo(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const fail = () => reject(new Error("We can't open that video here. Try one recorded on your phone's camera."));
    const t = setTimeout(fail, 20000);
    v.preload = 'auto'; v.muted = true; v.playsInline = true; v.src = url;
    v.onerror = () => { clearTimeout(t); fail(); };
    v.onloadedmetadata = () => {
      if (!Number.isFinite(v.duration)) { clearTimeout(t); fail(); return; }
      v.currentTime = Math.min(0.5, v.duration / 2);
    };
    v.onseeked = () => {
      clearTimeout(t);
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      c.toBlob((blob) => resolve({ url, duration: v.duration, w: v.videoWidth, h: v.videoHeight, poster: blob }), 'image/jpeg', 0.8);
    };
  });
}

const KINDS = [
  { id: 'post', label: 'Post', icon: Pencil },
  { id: 'shoutout', label: 'Shout-out', icon: Megaphone },
  { id: 'poll', label: 'Poll', icon: BarChart3 },
  { id: 'event', label: 'Event', icon: CalendarDays, mgr: true },
];

/**
 * New post, or editing one (post given). Photos and video upload as soon as they are picked.
 * Before posting, Orb AI checks the text and photos; warnings let the poster edit or post anyway.
 */
export default function Composer({ rulesAccepted, onPosted, post, onCancel, autoFocus }) {
  const { user } = useAuth();
  const toast = useToast();
  const settings = useEverydaySettings();
  const people = usePeople();
  const [kind, setKind] = useState(post?.kind || 'post');
  const [text, setText] = useState(post?.body || '');
  const [notifyAll, setNotifyAll] = useState(false);
  const canNotify = !post && ['company', 'security'].includes(user.role) && ['post', 'poll', 'shoutout'].includes(kind);
  const [mentions, setMentions] = useState(post?.mentions?.map((m) => m.id) || []);
  const [photos, setPhotos] = useState(post?.photos?.map((p) => ({ key: p.key, url: p.url, w: p.w, h: p.h, caption: p.caption || '' })) || []);
  const [video, setVideo] = useState(post?.video ? { ...post.video } : null);
  const [place, setPlace] = useState(post?.place || null);
  const [tags, setTags] = useState(post?.tags?.map((t) => t.id) || []);
  const [link, setLink] = useState(post?.link || null);
  const [linkOff, setLinkOff] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(null);
  const [rules, setRules] = useState(false);
  const [accepted, setAccepted] = useState(rulesAccepted);
  const [editor, setEditor] = useState(null); // { i }
  const [sheet, setSheet] = useState(null); // 'place' | 'tags' | 'to'
  // Shout-out, poll, event
  const [badge, setBadge] = useState('above');
  const [to, setTo] = useState([]);
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [showResults, setShowResults] = useState('after_vote');
  const [closes, setCloses] = useState('');
  const ev = post?.event;
  const [title, setTitle] = useState(ev?.title || '');
  const [starts, setStarts] = useState(toLocalInput(ev?.starts_at));
  const [ends, setEnds] = useState(toLocalInput(ev?.ends_at));
  const [capacity, setCapacity] = useState(ev?.capacity ? String(ev.capacity) : '');
  const file = useRef(null);
  const vfile = useRef(null);

  useEffect(() => setAccepted(rulesAccepted), [rulesAccepted]);

  // Preview of the first web address in the text (× hides it for this address)
  useEffect(() => {
    const url = firstUrl(text);
    if (!url || linkOff.includes(url) || url === link?.url) { if (!url && link && !post?.link) setLink(null); return undefined; }
    let gone = false;
    const t = setTimeout(() => api('everyday.linkPreview', { url }).then((r) => { if (!gone && (r.title || r.image_url)) setLink(r); }).catch(() => {}), 700);
    return () => { gone = true; clearTimeout(t); };
  }, [text, linkOff]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhotos = async (files) => {
    const list = [...files].slice(0, MAX - photos.length);
    if (files.length > list.length) toast(`Up to ${MAX} photos per post`, 'error');
    setUploading((n) => n + list.length);
    // Upload in parallel, but keep the order the photos were picked in
    const done = await Promise.all(list.map(async (f) => {
      try {
        const small = await compressImage(f);
        const [{ w, h }, key] = await Promise.all([sizeOf(small), upload(small, 'feed')]);
        return { key, url: URL.createObjectURL(small), w, h, caption: '', file: f.type === 'image/gif' ? null : f };
      } catch (e) {
        toast(e.message || 'Photo upload failed', 'error');
        return null;
      } finally {
        setUploading((n) => n - 1);
      }
    }));
    setPhotos((p) => [...p, ...done.filter(Boolean)]);
  };
  const edited = async ({ file: out, w, h, caption }) => {
    const i = editor.i;
    setEditor(null);
    if (!out) { setPhotos((p) => p.map((x, j) => (j === i ? { ...x, caption } : x))); return; }
    setUploading((n) => n + 1);
    try {
      const key = await upload(out, 'feed');
      setPhotos((p) => p.map((x, j) => (j === i ? { ...x, key, url: URL.createObjectURL(out), w, h, caption } : x)));
    } catch (e) { toast(e.message || 'Photo upload failed', 'error'); } finally { setUploading((n) => n - 1); }
  };

  const addVideo = async (f) => {
    if (!f) return;
    if (f.size > VIDEO_MAX_BYTES) { toast('Videos can be up to 50 MB. Try a shorter clip.', 'error'); return; }
    setUploading((n) => n + 1);
    try {
      const v = await readVideo(f);
      if (v.duration > VIDEO_MAX_S + 0.5) throw new Error(`Videos can be up to ${VIDEO_MAX_S} seconds. Trim it on your phone first.`);
      const posterFile = new File([v.poster], 'poster.jpg', { type: 'image/jpeg' });
      const [key, poster_key] = await Promise.all([upload(f, 'feed'), upload(posterFile, 'feed')]);
      setVideo({ key, poster_key, duration: v.duration, w: v.w, h: v.h, url: v.url, poster_url: URL.createObjectURL(posterFile) });
    } catch (e) {
      toast(e.message || 'Video upload failed', 'error');
    } finally { setUploading((n) => n - 1); }
  };

  const common = () => ({
    body: text.trim(), mentions, place: place || null, tags,
    photos: photos.map(({ key, w, h, caption }) => ({ key, w, h, caption })),
    ...(kind === 'post' ? { video: video ? { key: video.key, poster_key: video.poster_key, duration: video.duration, w: video.w, h: video.h } : null } : {}),
    ...(link ? { link_url: link.url } : post?.link ? { remove_link: true } : {}),
  });
  const eventFields = () => ({ title: title.trim(), starts_at: fromLocalInput(starts), ends_at: fromLocalInput(ends), capacity: capacity ? Number(capacity) : null });
  const send = async () => {
    setBusy(true);
    try {
      if (post?.kind === 'event') await api('everyday.eventEdit', { post_id: post.id, ...eventFields(), body: text.trim(), place: place || null, photos: common().photos });
      else if (post) await api('everyday.edit', { id: post.id, ...common() });
      else {
        const b = { kind, ...common() };
        if (kind === 'shoutout') Object.assign(b, { badge, to });
        if (kind === 'poll') Object.assign(b, { options: options.map((o) => o.trim()).filter(Boolean), multi, anonymous, show_results: showResults, closes_at: fromLocalInput(closes) });
        if (kind === 'event') Object.assign(b, eventFields());
        if (canNotify && notifyAll) b.notify_all = true;
        await api('everyday.create', b);
      }
      setText(''); setMentions([]); setPhotos([]); setVideo(null); setPlace(null); setTags([]); setLink(null); setLinkOff([]); setWarn(null);
      setTo([]); setOptions(['', '']); setCloses(''); setTitle(''); setStarts(''); setEnds(''); setCapacity(''); setKind('post'); setNotifyAll(false);
      onPosted?.();
      toast(post ? 'Post updated' : `${{ shoutout: 'Shout-out posted', poll: 'Poll posted', event: 'Event posted' }[kind] || 'Posted'}${canNotify && notifyAll ? ' — everyone notified' : ''}`);
    } catch (e) {
      if (e.data?.need_rules) { setAccepted(false); setRules(true); } else toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const submit = async (ok = accepted) => {
    if (!ok) { setRules(true); return; }
    setBusy(true);
    try {
      const r = await api('everyday.precheck', { body: [title, text].filter(Boolean).join('\n'), photos: common().photos, video: kind === 'post' && video ? { poster_key: video.poster_key } : undefined });
      if (r.warnings?.length) { setWarn(r); setBusy(false); return; }
    } catch { /* if the check fails, the server checks again on posting */ }
    await send();
  };

  const ready = {
    post: text.trim() || photos.length || video,
    shoutout: to.length > 0 && badge,
    poll: text.trim() && options.filter((o) => o.trim()).length >= 2,
    event: title.trim() && starts,
  }[kind];
  const kinds = KINDS.filter((k) => (!k.mgr || isMgr(user)) && (k.id !== 'shoutout' || settings?.shoutouts !== false));
  const nameOf = (id) => people.find((p) => p.id === id)?.name || '';
  const tagged = tags.map(nameOf).filter(Boolean);
  const placeholder = {
    post: `What's happening, ${user.name.split(' ')[0]}?`,
    shoutout: 'Say what they did — be specific, it means more',
    poll: 'Ask a question',
    event: 'What is it about? (optional)',
  }[kind];

  return (
    <div className="rounded-tile bg-surface p-4 shadow-tile">
      {!post && kinds.length > 1 && (
        <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1">
          {kinds.map((k) => (
            <Pressable press key={k.id} onClick={() => setKind(k.id)}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote font-semibold', kind === k.id ? 'bg-blue text-white' : 'bg-bg text-muted')}>
              <k.icon size={15} /> {k.label}
            </Pressable>
          ))}
        </div>
      )}

      {kind === 'shoutout' && !post && (
        <div className="mb-3 space-y-3 rounded-2xl bg-amber-soft/60 p-3">
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map((b) => (
              <Pressable press key={b.id} onClick={() => setBadge(b.id)}
                className={cx('rounded-full px-3 py-1.5 text-footnote font-semibold', badge === b.id ? 'bg-amber text-white' : 'bg-surface')}>{b.emoji} {b.label}</Pressable>
            ))}
          </div>
          <Pressable press onClick={() => setSheet('to')} className="flex w-full items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-left text-subhead">
            <UserPlus size={18} className="text-amber" />
            {to.length ? <span className="min-w-0 flex-1 truncate font-semibold">For {to.map(nameOf).join(', ')}</span> : <span className="text-muted">Who is it for?</span>}
          </Pressable>
        </div>
      )}

      {kind === 'event' && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Input label="Event name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer team BBQ" className="sm:col-span-2" />
          <Input label="Starts" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          <Input label="Ends (optional)" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          <Input label="Places (optional)" type="number" min="1" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} hint="When full, people join a waiting list" />
        </div>
      )}

      <div className="flex gap-3">
        {!post && <Avatar name={user.name} src={[user.photo_thumb_url, user.photo_url]} size={40} />}
        <div className="min-w-0 flex-1">
          <MentionBox value={text} mentions={mentions} rows={post ? 4 : 2} autoFocus={autoFocus}
            onChange={(t, ids) => { setText(t); setMentions(ids); }} placeholder={placeholder} />
          {(tagged.length > 0 || place) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1 text-footnote text-muted">
              {tagged.length > 0 && <span>— with <b className="text-ink">{tagged.length > 2 ? `${tagged[0]} and ${tagged.length - 1} others` : tagged.join(' and ')}</b></span>}
              {place && <span className="inline-flex items-center gap-1">at <b className="text-ink">{place.name}</b><Pressable press aria-label="Remove place" onClick={() => setPlace(null)} className="text-faint"><X size={14} /></Pressable></span>}
            </div>
          )}
        </div>
      </div>

      {kind === 'poll' && !post && (
        <div className="mt-3 space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="flex-1" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))} placeholder={`Answer ${i + 1}`} />
              {options.length > 2 && <Pressable press aria-label="Remove answer" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-bg"><X size={18} /></Pressable>}
            </div>
          ))}
          {options.length < 6 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setOptions([...options, ''])}>Add an answer</Button>}
          <div className="rounded-2xl bg-bg px-3 py-1">
            <Toggle checked={multi} onChange={setMulti} label="People can pick more than one" />
            <Toggle checked={anonymous} onChange={setAnonymous} label="Anonymous" hint="Nobody sees who voted for what" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Results" value={showResults} onChange={(e) => setShowResults(e.target.value)} options={[{ value: 'after_vote', label: 'Shown after voting' }, { value: 'always', label: 'Always shown' }]} />
            <Input label="Closes (optional)" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </div>
        </div>
      )}

      {link && <LinkCard link={link} className="-mx-4 mt-3" onRemove={() => { setLinkOff((x) => [...x, link.url]); setLink(null); }} />}

      {kind === 'post' && video && (
        <div className="relative mt-3 overflow-hidden rounded-xl bg-black">
          <video src={video.url} poster={video.poster_url} controls playsInline className="max-h-[320px] w-full object-contain" />
          <Pressable press aria-label="Remove video" onClick={() => setVideo(null)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center before:absolute before:-inset-1.5 rounded-full bg-black/60 text-white"><X size={16} /></Pressable>
        </div>
      )}

      {(photos.length > 0 || uploading > 0) && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-bg">
              <img src={p.url} alt={p.caption || ''} className="h-full w-full object-cover" />
              <Pressable press aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((y) => y.key !== p.key))}
                className="absolute right-1 top-1 grid h-7 w-7 before:absolute before:-inset-2.5 place-items-center rounded-full bg-black/60 text-white"><X size={16} /></Pressable>
              <Pressable press onClick={() => setEditor({ i })}
                className="absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-caption font-semibold text-white"><Pencil size={12} /> {p.file ? 'Edit' : 'Caption'}</Pressable>
              {p.caption && <span className="absolute right-1 bottom-1 h-2 w-2 rounded-full bg-white" title="Has a caption" />}
            </div>
          ))}
          {Array.from({ length: uploading }, (_, i) => <div key={`u${i}`} className="grid aspect-square place-items-center rounded-xl bg-bg"><Spinner className="py-0" /></div>)}
        </div>
      )}

      {canNotify && (
        <div className="mt-3">
          <Toggle checked={notifyAll} onChange={setNotifyAll} label="Notify everyone" hint="Every member of staff gets a phone notification." />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="-ml-2 flex flex-wrap items-center">
          <Pressable press disabled={photos.length + uploading >= MAX} onClick={() => file.current?.click()} aria-label="Add photos"
            className="flex items-center gap-1.5 rounded-xl px-2 py-2.5 text-subhead font-semibold text-green hover:bg-bg disabled:opacity-40">
            <ImagePlus size={20} /> <span className="hidden sm:inline">Photo</span>
          </Pressable>
          {kind === 'post' && (
            <Pressable press disabled={!!video || uploading > 0} onClick={() => vfile.current?.click()} aria-label="Add a video"
              className="flex items-center gap-1.5 rounded-xl px-2 py-2.5 text-subhead font-semibold text-indigo hover:bg-bg disabled:opacity-40">
              <Film size={20} /> <span className="hidden sm:inline">Video</span>
            </Pressable>
          )}
          <Pressable press onClick={() => setSheet('place')} aria-label="Add a place"
            className="flex items-center gap-1.5 rounded-xl px-2 py-2.5 text-subhead font-semibold text-red hover:bg-bg">
            <MapPin size={20} /> <span className="hidden sm:inline">Place</span>
          </Pressable>
          {post?.kind !== 'event' && (
            <Pressable press onClick={() => setSheet('tags')} aria-label="Tag people"
              className="flex items-center gap-1.5 rounded-xl px-2 py-2.5 text-subhead font-semibold text-blue hover:bg-bg">
              <UserPlus size={20} /> <span className="hidden sm:inline">Tag</span>
            </Pressable>
          )}
        </div>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        <input ref={vfile} type="file" accept="video/*" hidden onChange={(e) => { addVideo(e.target.files[0]); e.target.value = ''; }} />
        <div className="ml-auto flex gap-2">
          {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
          <Button busy={busy} disabled={!ready || uploading > 0} onClick={() => submit()}>{post ? 'Save' : 'Post'}</Button>
        </div>
      </div>

      <PhotoEditor open={!!editor} file={editor ? photos[editor.i]?.file : null} url={editor ? photos[editor.i]?.url : null} caption={editor ? photos[editor.i]?.caption : ''}
        onClose={() => setEditor(null)} onDone={edited} />
      <PlacePicker open={sheet === 'place'} onClose={() => setSheet(null)} onPick={setPlace} />
      <PeoplePicker open={sheet === 'tags'} title="Who are you with?" value={tags} onChange={setTags} onClose={() => setSheet(null)} />
      <PeoplePicker open={sheet === 'to'} title="Who is the shout-out for?" value={to} onChange={setTo} onClose={() => setSheet(null)} />
      <Sheet open={!!warn} onClose={() => setWarn(null)} title="Check before posting" size="sm"
        footer={<><Button variant="secondary" onClick={() => setWarn(null)}>Edit post</Button><Button variant={warn?.serious ? 'danger' : 'primary'} busy={busy} onClick={send}>Post anyway</Button></>}>
        <div className="space-y-2">
          {warn?.warnings.map((w, i) => <div key={i} className="flex gap-2 rounded-2xl bg-amber-soft px-3 py-2.5 text-subhead"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber" />{w}</div>)}
          {warn?.serious && <p className="text-footnote text-muted">If you post this, a manager will be asked to review it.</p>}
        </div>
      </Sheet>
      <RulesSheet open={rules} onClose={() => setRules(false)} onAccept={() => { setAccepted(true); setRules(false); submit(true); }} />
    </div>
  );
}
