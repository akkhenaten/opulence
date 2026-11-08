// Every attachment opens inside the app: pictures (zoom, swipe), PDFs (pages drawn by pdf.js) and anything else as a
// card with Download. viewFiles() can be called from anywhere; <FileViewerHost/> is mounted once in main.jsx.
// files: [{ url?, load?: () => Promise<{ url, mime?, name? }>, name?, mime? }]
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, FileText, Minus, Plus, X } from 'lucide-react';
import { usePresence, useScrollLock } from './motion.js';

const PdfPages = lazy(() => import('./PdfPages.jsx'));
const cx = (...c) => c.filter(Boolean).join(' ');
const btn = 'pressable grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-40';

let show = null;

/** Open files in the in-app viewer at `index` */
export function viewFiles(files, index = 0) {
  const list = (files || []).filter(Boolean);
  if (!list.length) return;
  if (show) show({ files: list, index });
  else if (list[0].url) window.open(list[0].url, '_blank', 'noopener');
}

const EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' };
const ext = (s) => (String(s || '').split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
export function fileType(mime, ...names) {
  const m = String(mime || '').toLowerCase() || names.map((n) => EXT[ext(n)]).find(Boolean) || '';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/') && m !== 'image/heic') return 'image';
  return 'other';
}

async function save(url, name) {
  try {
    const blob = await (await fetch(url)).blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || 'file';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

export function FileViewerHost() {
  const [state, setState] = useState(null);
  useEffect(() => {
    show = setState;
    return () => { show = null; };
  }, []);
  return <Viewer state={state} onClose={() => setState(null)} />;
}

function Viewer({ state, onClose }) {
  const open = !!state;
  const { mounted, closing } = usePresence(open, 200);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(1);
  const last = useRef(state);
  if (state) last.current = state;
  const files = last.current?.files || [];
  const n = files.length;
  // What each file resolved to, kept per opening: { url, mime, name } | { error } | { loading }
  const cache = useRef(new WeakMap());
  const [, redraw] = useState(0);
  if (!cache.current.has(files)) cache.current.set(files, {});
  const got = cache.current.get(files);
  useScrollLock(open);
  const [seen, setSeen] = useState(null);
  if (state && state !== seen) { setSeen(state); setI(state.index || 0); } // a new opening starts at its own file
  useEffect(() => setZoom(1), [i]);
  const go = (d) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));

  // Resolve the file on screen (a presigned URL is fetched only when it's needed)
  useEffect(() => {
    const f = files[i];
    if (!open || !f || got[i]) return;
    const done = (r) => { got[i] = r; redraw((x) => x + 1); };
    if (f.url) { done({ url: f.url, mime: f.mime, name: f.name }); return; }
    got[i] = { loading: true };
    Promise.resolve(f.load?.())
      .then((r) => done(r?.url ? { url: r.url, mime: r.mime || f.mime, name: f.name || r.name } : { error: true }))
      .catch(() => done({ error: true }));
  }, [open, i, files, got]);

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, n, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe sideways between files (when not zoomed), down to close a picture
  const swipe = useRef(null);
  const down = (e) => { if (!e.target.closest('button, a')) swipe.current = { x: e.clientX, y: e.clientY }; };
  const up = (e) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || zoom > 1) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    else if (dy > 110 && type === 'image') onClose();
  };

  if (!mounted || !n) return null;
  const f = files[Math.min(i, n - 1)];
  const r = got[i]?.loading ? null : got[i];
  const name = r?.name || f.name || 'File';
  const type = r?.url ? (r.broken ? 'other' : fileType(r.mime, r.name, f.name, r.url)) : null;

  return createPortal(
    <div className={cx('fixed inset-0 z-[85] flex flex-col bg-black text-white', closing ? 'anim-fade-out pointer-events-none' : 'anim-fade-in')}
      role="dialog" aria-modal="true" aria-label={name}>
      <div className="relative z-10 flex items-center gap-2 py-2 [--px:0.75rem] safe-t safe-x">
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-subhead font-semibold">{name}</div>
          {n > 1 && <div className="text-caption text-white/70">{i + 1} of {n}</div>}
        </div>
        {type && type !== 'other' && (
          <>
            <button type="button" className={btn} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Zoom out"><Minus size={20} /></button>
            <button type="button" className={btn} onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Zoom in"><Plus size={20} /></button>
          </>
        )}
        {r?.url && <button type="button" className={btn} onClick={() => save(r.url, name)} aria-label="Download"><Download size={20} /></button>}
        <button type="button" className={btn} onClick={onClose} aria-label="Close"><X size={24} /></button>
      </div>

      <div className="relative min-h-0 flex-1 safe-b" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { swipe.current = null; }}>
        <div className="absolute inset-0 overflow-auto overscroll-contain">
          {!r ? (
            <div className="grid h-full place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Loading" /></div>
          ) : r.error ? (
            <Card name={name} text="This file couldn't be loaded. Try again in a moment." />
          ) : type === 'image' ? (
            <div className="grid min-h-full place-items-center p-3" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
              onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}>
              <img key={r.url} src={r.url} alt={name} draggable={false} onError={() => { got[i] = { ...r, broken: true }; redraw((x) => x + 1); }}
                className={cx('select-none rounded-lg object-contain anim-pop', zoom === 1 && 'max-h-[calc(100dvh-7rem)] max-w-full')}
                style={zoom > 1 ? { width: '100%' } : undefined} />
            </div>
          ) : type === 'pdf' ? (
            <div className="mx-auto px-3 py-3 text-ink" style={{ width: `min(${zoom * 100}%, ${zoom * 56}rem)`, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined }}>
              <Suspense fallback={<div className="skeleton rounded-xl" style={{ aspectRatio: '0.707' }} />}><PdfPages key={r.url} src={r.url} /></Suspense>
            </div>
          ) : (
            <Card name={name} text="This type of file can't be shown in the app." action={<button type="button" className="pressable mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-subhead font-semibold text-black" onClick={() => save(r.url, name)}><Download size={18} />Download</button>} />
          )}
        </div>
        {n > 1 && (
          <>
            {i > 0 && <button type="button" onClick={() => go(-1)} className={cx(btn, 'absolute left-3 top-1/2 -translate-y-1/2')} aria-label="Previous"><ChevronLeft size={24} /></button>}
            {i < n - 1 && <button type="button" onClick={() => go(1)} className={cx(btn, 'absolute right-3 top-1/2 -translate-y-1/2')} aria-label="Next"><ChevronRight size={24} /></button>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Card({ name, text, action }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10"><FileText size={24} /></span>
        <div className="mt-3 break-words text-body font-semibold">{name}</div>
        <p className="mt-1 text-subhead text-white/70">{text}</p>
        {action}
      </div>
    </div>
  );
}
