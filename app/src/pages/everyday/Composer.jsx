import { useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, X } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, Sheet, Spinner, useToast } from '../../ui/index.jsx';
import { compressImage } from '../officer/_parts.jsx';
import { MentionBox, RulesSheet } from './_parts.jsx';

const MAX = 10;

/**
 * New post, or editing one (post given). Photos upload as soon as they are picked.
 * Before posting, Orb AI checks the text and photos; warnings let the poster edit or post anyway.
 */
export default function Composer({ rulesAccepted, onPosted, post, onCancel, autoFocus }) {
  const { user } = useAuth();
  const toast = useToast();
  const [text, setText] = useState(post?.body || '');
  const [mentions, setMentions] = useState(post?.mentions?.map((m) => m.id) || []);
  const [photos, setPhotos] = useState(post?.photos?.map((p) => ({ key: p.key, url: p.url })) || []);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(null);
  const [rules, setRules] = useState(false);
  const [accepted, setAccepted] = useState(rulesAccepted);
  const file = useRef(null);

  const add = async (files) => {
    const list = [...files].slice(0, MAX - photos.length);
    if (files.length > list.length) toast(`Up to ${MAX} photos per post`, 'error');
    setUploading((n) => n + list.length);
    await Promise.all(list.map(async (f) => {
      const local = URL.createObjectURL(f);
      try {
        const key = await upload(await compressImage(f), 'feed');
        setPhotos((p) => [...p, { key, url: local }]);
      } catch (e) {
        toast(e.message || 'Photo upload failed', 'error');
      } finally {
        setUploading((n) => n - 1);
      }
    }));
  };

  const body = () => ({ body: text.trim(), photo_keys: photos.map((p) => p.key), mentions });
  const send = async () => {
    setBusy(true);
    try {
      if (post) await api('everyday.edit', { id: post.id, ...body() });
      else await api('everyday.create', body());
      setText(''); setMentions([]); setPhotos([]); setWarn(null);
      onPosted?.();
      toast(post ? 'Post updated' : 'Posted');
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
      const r = await api('everyday.precheck', { body: text, photo_keys: photos.map((p) => p.key) });
      if (r.warnings?.length) { setWarn(r); setBusy(false); return; }
    } catch { /* if the check fails, the server checks again on posting */ }
    await send();
  };

  const empty = !text.trim() && !photos.length;
  return (
    <div className="rounded-tile bg-surface p-4 shadow-tile">
      <div className="flex gap-3">
        {!post && <Avatar name={user.name} size={40} />}
        <div className="min-w-0 flex-1">
          <MentionBox value={text} mentions={mentions} rows={post ? 4 : 2} autoFocus={autoFocus}
            onChange={(t, ids) => { setText(t); setMentions(ids); }} placeholder={`What's happening, ${user.name.split(' ')[0]}?`} />
        </div>
      </div>
      {(photos.length > 0 || uploading > 0) && (
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {photos.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-bg">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((y) => y.key !== p.key))}
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"><X size={15} /></button>
            </div>
          ))}
          {Array.from({ length: uploading }, (_, i) => <div key={`u${i}`} className="grid aspect-square place-items-center rounded-xl bg-bg"><Spinner /></div>)}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <button type="button" disabled={photos.length + uploading >= MAX} onClick={() => file.current?.click()}
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[14px] font-semibold text-green hover:bg-bg disabled:opacity-40">
          <ImagePlus size={20} /> Photo
        </button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <div className="flex gap-2">
          {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
          <Button busy={busy} disabled={empty || uploading > 0} onClick={() => submit()}>{post ? 'Save' : 'Post'}</Button>
        </div>
      </div>

      <Sheet open={!!warn} onClose={() => setWarn(null)} title="Check before posting" size="sm"
        footer={<><Button variant="secondary" onClick={() => setWarn(null)}>Edit post</Button><Button variant={warn?.serious ? 'danger' : 'primary'} busy={busy} onClick={send}>Post anyway</Button></>}>
        <div className="space-y-2">
          {warn?.warnings.map((w, i) => <div key={i} className="flex gap-2 rounded-2xl bg-amber-soft px-3 py-2.5 text-[14px]"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber" />{w}</div>)}
          {warn?.serious && <p className="text-[13px] text-muted">If you post this, a manager will be asked to review it.</p>}
        </div>
      </Sheet>
      <RulesSheet open={rules} onClose={() => setRules(false)} onAccept={() => { setAccepted(true); setRules(false); submit(true); }} />
    </div>
  );
}
