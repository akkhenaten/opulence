import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crop, Eraser, RotateCw, Undo2, X } from 'lucide-react';
import { useScrollLock } from './motion.js';

const cx = (...c) => c.filter(Boolean).join(' ');
const MAX = 1600;
const PRESETS = [{ id: 'free', label: 'Free', r: null }, { id: '1', label: 'Square', r: 1 }, { id: '45', label: '4:5', r: 4 / 5 }, { id: '169', label: '16:9', r: 16 / 9 }];
const MIN = 40;

const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// A blocky copy of the image, painted through the blur brush
function pixelated(src) {
  const block = Math.max(8, Math.round(Math.max(src.width, src.height) / 45));
  const small = canvasOf(Math.max(1, Math.round(src.width / block)), Math.max(1, Math.round(src.height / block)));
  small.getContext('2d').drawImage(src, 0, 0, small.width, small.height);
  const out = canvasOf(src.width, src.height);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}
const fit = (W, H, r) => {
  if (!r) return { x: 0, y: 0, w: W, h: H };
  let w = W; let h = w / r;
  if (h > H) { h = H; w = h * r; }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
};

/**
 * Crop, rotate, blur out faces or details, and caption one photo before it is posted.
 * file: the picked image (null = caption only, url shows it). onDone({ file?, w, h, caption }).
 */
export function PhotoEditor({ open, file, url, caption: initialCaption = '', onDone, onClose }) {
  useScrollLock(open);
  const view = useRef(null);
  const st = useRef({ src: null, pix: null, strokes: [], drag: null });
  const [size, setSize] = useState(null); // { W, H }
  const [crop, setCrop] = useState(null);
  const [preset, setPreset] = useState('free');
  const [mode, setMode] = useState('crop');
  const [strokes, setStrokes] = useState(0);
  const [caption, setCaption] = useState(initialCaption);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setCaption(initialCaption); setPreset('free'); setMode('crop'); setStrokes(0); setSize(null);
    if (!file) return undefined;
    let gone = false;
    createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file)).then((bmp) => {
      if (gone) return;
      const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const src = canvasOf(Math.round(bmp.width * s), Math.round(bmp.height * s));
      src.getContext('2d').drawImage(bmp, 0, 0, src.width, src.height);
      st.current = { src, pix: pixelated(src), strokes: [], drag: null };
      setSize({ W: src.width, H: src.height });
      setCrop({ x: 0, y: 0, w: src.width, h: src.height });
    }).catch(() => onClose());
    return () => { gone = true; };
  }, [open, file]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the photo with blurred strokes on top
  const paint = (target = view.current) => {
    const { src, pix, strokes: list } = st.current;
    if (!target || !src) return;
    const ctx = target.getContext('2d');
    ctx.drawImage(src, 0, 0);
    if (!list.length) return;
    ctx.save();
    ctx.beginPath();
    for (const s of list) for (const p of s.pts) { ctx.moveTo(p.x + s.r, p.y); ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2); }
    ctx.clip();
    ctx.drawImage(pix, 0, 0);
    ctx.restore();
  };
  useEffect(() => { if (size) paint(); }, [size, strokes]); // eslint-disable-line react-hooks/exhaustive-deps

  const toImage = (e) => {
    const r = view.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * size.W, y: ((e.clientY - r.top) / r.height) * size.H, k: size.W / r.width };
  };

  const rotate = () => {
    const { src } = st.current;
    const flat = canvasOf(src.width, src.height);
    paint(flat);
    const out = canvasOf(src.height, src.width);
    const ctx = out.getContext('2d');
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(flat, 0, 0);
    st.current = { src: out, pix: pixelated(out), strokes: [], drag: null };
    setStrokes(0);
    setSize({ W: out.width, H: out.height });
    setCrop(fit(out.width, out.height, PRESETS.find((p) => p.id === preset).r));
  };
  const pickPreset = (id) => { setPreset(id); setCrop(fit(size.W, size.H, PRESETS.find((p) => p.id === id).r)); };

  // Crop box: drag inside to move it, drag a corner to resize (keeping the shape when one is chosen)
  const startCrop = (e, handle) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    st.current.drag = { handle, start: toImage(e), crop };
  };
  const moveCrop = (e) => {
    const d = st.current.drag;
    if (!d) return;
    const p = toImage(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const c = d.crop;
    const r = PRESETS.find((x) => x.id === preset).r;
    if (d.handle === 'move') {
      setCrop({ ...c, x: Math.min(size.W - c.w, Math.max(0, c.x + dx)), y: Math.min(size.H - c.h, Math.max(0, c.y + dy)) });
      return;
    }
    const left = d.handle.includes('w');
    const top = d.handle.includes('n');
    let w = Math.max(MIN, c.w + (left ? -dx : dx));
    let h = Math.max(MIN, c.h + (top ? -dy : dy));
    if (r) h = w / r;
    const ax = left ? c.x + c.w : c.x; // fixed corner
    const ay = top ? c.y + c.h : c.y;
    const maxW = left ? ax : size.W - ax;
    const maxH = top ? ay : size.H - ay;
    if (w > maxW) { w = maxW; if (r) h = w / r; }
    if (h > maxH) { h = maxH; if (r) w = h * r; }
    setCrop({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
  };

  // Blur brush
  const brushDown = (e) => {
    if (mode !== 'blur') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toImage(e);
    st.current.strokes.push({ r: Math.max(size.W, size.H) * 0.035, pts: [p] });
    st.current.drag = { brush: true };
    setStrokes(st.current.strokes.length);
    paint();
  };
  const brushMove = (e) => {
    if (!st.current.drag?.brush) return;
    const s = st.current.strokes[st.current.strokes.length - 1];
    s.pts.push(toImage(e));
    paint();
  };
  const end = () => { st.current.drag = null; };
  const undo = () => { st.current.strokes.pop(); setStrokes(st.current.strokes.length); };

  const done = async () => {
    if (!file) { onDone({ caption: caption.trim() }); return; }
    setBusy(true);
    try {
      const flat = canvasOf(size.W, size.H);
      paint(flat);
      const c = { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(crop.w), h: Math.round(crop.h) };
      const out = canvasOf(c.w, c.h);
      out.getContext('2d').drawImage(flat, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
      const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.85));
      const name = `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`;
      onDone({ file: new File([blob], name, { type: 'image/jpeg' }), w: c.w, h: c.h, caption: caption.trim() });
    } finally { setBusy(false); }
  };

  if (!open) return null;
  const pct = (v, of) => `${(v / of) * 100}%`;
  const tool = (on) => cx('pressable flex items-center gap-1.5 rounded-full px-3 py-2 text-footnote font-semibold', on ? 'bg-white text-black' : 'bg-white/15 text-white');
  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-black text-white anim-fade-in" role="dialog" aria-modal="true" aria-label="Edit photo">
      <div className="flex items-center justify-between gap-2 px-3 py-2 safe-t safe-x">
        <button type="button" onClick={onClose} className="pressable grid h-11 w-11 place-items-center rounded-full bg-white/15" aria-label="Cancel"><X size={22} /></button>
        <span className="text-headline">Edit photo</span>
        <button type="button" onClick={done} disabled={busy || (file && !size)} className="pressable rounded-full bg-blue px-5 py-2.5 text-subhead font-semibold disabled:opacity-50">Done</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        {file ? (size && crop && (
          <div className="relative inline-block max-h-full max-w-full touch-none select-none" onPointerMove={(e) => { moveCrop(e); brushMove(e); }} onPointerUp={end} onPointerCancel={end}>
            <canvas ref={view} width={size.W} height={size.H} onPointerDown={brushDown}
              className={cx('block max-h-[calc(100dvh-260px)] max-w-full', mode === 'blur' && 'cursor-crosshair')} style={{ aspectRatio: `${size.W} / ${size.H}` }} />
            {mode === 'crop' && (
              <div className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" onPointerDown={(e) => startCrop(e, 'move')}
                style={{ left: pct(crop.x, size.W), top: pct(crop.y, size.H), width: pct(crop.w, size.W), height: pct(crop.h, size.H), cursor: 'move' }}>
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/25" />)}</div>
                {['nw', 'ne', 'sw', 'se'].map((h) => (
                  <div key={h} onPointerDown={(e) => startCrop(e, h)} aria-label="Resize"
                    className={cx('absolute h-7 w-7 rounded-full border-2 border-white bg-black/40', h.includes('n') ? '-top-3.5' : '-bottom-3.5', h.includes('w') ? '-left-3.5' : '-right-3.5')}
                    style={{ cursor: `${h}-resize` }} />
                ))}
              </div>
            )}
          </div>
        )) : <img src={url} alt="" className="max-h-full max-w-full rounded-lg object-contain" />}
      </div>
      <div className="space-y-3 px-4 pb-4 safe-b safe-x">
        {file && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" className={tool(mode === 'crop')} onClick={() => setMode('crop')}><Crop size={16} /> Crop</button>
              <button type="button" className={tool(mode === 'blur')} onClick={() => setMode('blur')}><Eraser size={16} /> Blur</button>
              <button type="button" className={tool(false)} onClick={rotate} disabled={!size}><RotateCw size={16} /> Rotate</button>
            </div>
            {mode === 'crop' ? (
              <div className="flex justify-center gap-1.5">
                {PRESETS.map((p) => <button key={p.id} type="button" className={cx('pressable rounded-full px-3 py-1.5 text-caption font-semibold', preset === p.id ? 'bg-blue' : 'bg-white/10')} onClick={() => pickPreset(p.id)}>{p.label}</button>)}
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 text-footnote text-white/80">
                Paint over faces, plates or anything private
                <button type="button" className={tool(false)} disabled={!strokes} onClick={undo}><Undo2 size={16} /> Undo</button>
              </div>
            )}
          </>
        )}
        <input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 300))} placeholder="Add a caption"
          className="h-11 w-full rounded-2xl bg-white/10 px-4 text-body text-white outline-none placeholder:text-white/50" />
      </div>
    </div>,
    document.body,
  );
}
