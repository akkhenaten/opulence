import { useCallback, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Trash2 } from 'lucide-react';
import { upload } from '../../api.js';
import { cx } from '../../ui/index.jsx';
import { compressImage } from '../officer/_parts.jsx';

// Same limits the API enforces on incident attachments
export const MAX_FILES = 20;
export const MAX_BYTES = 15 * 1024 * 1024;
export const DOC_ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const DOC_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
const IMAGE_RE = /^image\/(jpeg|png|webp|gif|heic|heif)$/;

export const fileSize = (n) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const isImage = (mime) => String(mime || '').startsWith('image/');

// Files upload as soon as they are added, so the AI and the report can use their keys.
// item: { uid, name, mime, size, url (preview), key, status: uploading|done|error, error }
export function useUploads({ existingCount = 0, toast }) {
  const [items, setItems] = useState([]);
  const patch = (uid, p) => setItems((xs) => xs.map((x) => (x.uid === uid ? { ...x, ...p } : x)));

  const add = useCallback(async (fileList) => {
    let room = MAX_FILES - existingCount - items.filter((x) => x.status !== 'error').length;
    for (const raw of fileList) {
      if (room <= 0) { toast(`A report can hold up to ${MAX_FILES} photos and files`, 'error'); break; }
      const type = raw.type || '';
      if (!IMAGE_RE.test(type) && !DOC_TYPES.includes(type)) { toast(`${raw.name}: only photos, PDF, Word or text files`, 'error'); continue; }
      const file = type.startsWith('image/') ? await compressImage(raw) : raw;
      if (file.size > MAX_BYTES) { toast(`${raw.name} is over 15 MB`, 'error'); continue; }
      room--;
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const item = { uid, name: file.name, mime: file.type, size: file.size, url: isImage(file.type) ? URL.createObjectURL(file) : null, status: 'uploading' };
      setItems((xs) => [...xs, item]);
      upload(file, 'incident')
        .then((key) => patch(uid, { key, status: 'done' }))
        .catch((e) => patch(uid, { status: 'error', error: e.message }));
    }
  }, [existingCount, items, toast]);

  const remove = (uid) => setItems((xs) => xs.filter((x) => x.uid !== uid));
  const done = items.filter((x) => x.status === 'done');
  return { items, add, remove, done, uploading: items.some((x) => x.status === 'uploading'), attachments: done.map((x) => ({ key: x.key, mime: x.mime, name: x.name })) };
}

export function FileTile({ name, mime, url, size, status, badge, onRemove, onOpen }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-bg">
      <button type="button" onClick={onOpen} disabled={!onOpen} className="block h-full w-full text-left">
        {isImage(mime) && url
          ? <img src={url} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center"><FileText size={24} className="text-blue" /><span className="line-clamp-2 break-all text-caption2 font-semibold text-ink">{name}</span>{size != null && <span className="text-caption2 text-muted">{fileSize(size)}</span>}</div>}
      </button>
      {status === 'uploading' && <div className="absolute inset-0 grid place-items-center bg-ink/35 text-white"><Loader2 className="animate-spin" /></div>}
      {status === 'error' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red/80 p-2 text-center text-caption2 font-semibold text-white"><AlertTriangle size={18} />Upload failed</div>}
      {badge && <span className="absolute bottom-1 left-1 rounded-full bg-ink/70 px-2 py-0.5 text-caption2 font-semibold text-white">{badge}</span>}
      {onRemove && (
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove}
          className={cx('absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-ink/70 text-white')}><Trash2 size={16} /></button>
      )}
    </div>
  );
}
