import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { usePresence, useScrollLock } from './motion.js';

const cx = (...c) => c.filter(Boolean).join(' ');
const btn = 'pressable grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25';

// Full-screen photo viewer: swipe or arrow keys between photos, pinch or double-tap to zoom.
// photos: [{ url, name }]; index: open photo (null = closed)
export function Lightbox({ photos = [], index, onClose, download }) {
  const open = index != null && !!photos[index];
  const { mounted, closing } = usePresence(open, 200);
  const [i, setI] = useState(index ?? 0);
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 });
  const g = useRef({ pts: new Map(), start: null, lastTap: 0 });
  useScrollLock(open);
  useEffect(() => { if (index != null) setI(index); }, [index]);
  useEffect(() => setZoom({ s: 1, x: 0, y: 0 }), [i]);
  const n = photos.length;
  const go = (d) => setI((x) => Math.max(0, Math.min(n - 1, x + d)));
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, n, onClose]);
  if (!mounted) return null;
  const p = photos[i] || photos[photos.length - 1];
  if (!p) return null;

  const dist = () => { const [a, b] = [...g.current.pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const down = (e) => {
    if (e.target.closest('button')) return;
    const s = g.current;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    s.start = s.pts.size === 2 ? { d: dist(), zoom } : { x: e.clientX, y: e.clientY, zoom, t: Date.now() };
  };
  const move = (e) => {
    const s = g.current;
    if (!s.pts.has(e.pointerId) || !s.start) return;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pts.size === 2 && s.start.d) setZoom({ ...s.start.zoom, s: Math.max(1, Math.min(3, s.start.zoom.s * (dist() / s.start.d))) });
    else if (s.pts.size === 1 && s.start.zoom.s > 1) setZoom({ ...s.start.zoom, x: s.start.zoom.x + e.clientX - s.start.x, y: s.start.zoom.y + e.clientY - s.start.y });
  };
  const up = (e) => {
    const s = g.current;
    const st = s.start;
    if (!s.pts.delete(e.pointerId)) return;
    if (s.pts.size) return;
    s.start = null;
    if (!st || st.d) { if (zoom.s < 1.05) setZoom({ s: 1, x: 0, y: 0 }); return; }
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (st.zoom.s > 1) return;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return go(dx < 0 ? 1 : -1);
    if (dy > 90) return onClose(); // swipe down to close
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      const now = Date.now();
      if (now - s.lastTap < 300) { setZoom(zoom.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.2, x: 0, y: 0 }); s.lastTap = 0; } else s.lastTap = now;
    }
  };

  return createPortal(
    <div className={cx('fixed inset-0 z-[80] flex flex-col bg-black/95 text-white', closing ? 'anim-fade-out pointer-events-none' : 'anim-fade-in')} role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="relative z-10 flex items-center justify-between py-2 [--px:0.75rem] safe-t safe-x">
        <span className="px-1 text-subhead font-semibold opacity-80">{n > 1 ? `${i + 1} of ${n}` : ''}</span>
        <div className="flex gap-2">
          {download && <a href={p.url} target="_blank" rel="noopener noreferrer" className={btn} aria-label="Open original"><Download size={20} /></a>}
          <button type="button" onClick={onClose} className={btn} aria-label="Close"><X size={24} /></button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-2 pb-6 safe-b"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={(e) => e.target === e.currentTarget && zoom.s === 1 && onClose()}>
        <img key={p.url} src={p.url} alt={p.name || ''} draggable={false}
          className={cx('max-h-full max-w-full select-none rounded-lg object-contain', closing ? 'anim-sheet-out' : 'anim-pop')}
          style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`, transition: g.current.start ? 'none' : 'transform var(--dur-2) var(--ease-ios)' }} />
        {n > 1 && (
          <>
            {i > 0 && <button type="button" onClick={() => go(-1)} className={cx(btn, 'absolute left-3 top-1/2 hidden -translate-y-1/2 sm:grid')} aria-label="Previous"><ChevronLeft size={24} /></button>}
            {i < n - 1 && <button type="button" onClick={() => go(1)} className={cx(btn, 'absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid')} aria-label="Next"><ChevronRight size={24} /></button>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
