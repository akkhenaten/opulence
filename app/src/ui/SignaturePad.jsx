import { useEffect, useRef } from 'react';

// Canvas signature pad (touch, pen and mouse via pointer events)
export function SignaturePad({ handle: outer, onInk, max = 380000, className }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const ink = useRef(false);

  const setup = () => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 2.6;
    g.strokeStyle = '#0B1220';
    ink.current = false;
    onInk(false);
  };

  useEffect(() => {
    setup();
    const ro = new ResizeObserver(() => { if (!ink.current) setup(); });
    ro.observe(canvas.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose clear() and toDataURL() to the parent
  useEffect(() => {
    if (!outer) return;
    outer.current = {
      clear: setup,
      toDataURL: () => {
        if (!ink.current) return null;
        const c = canvas.current;
        let out = c.toDataURL('image/png');
        // Keep under the server's size limit by downscaling if needed
        let scale = 1;
        while (out.length > max && scale > 0.2) {
          scale *= 0.7;
          const t = document.createElement('canvas');
          t.width = Math.round(c.width * scale);
          t.height = Math.round(c.height * scale);
          t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
          out = t.toDataURL('image/png');
        }
        return out;
      },
    };
  });

  const pt = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    e.preventDefault();
    canvas.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pt(e);
    const g = canvas.current.getContext('2d');
    g.beginPath();
    g.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    g.fillStyle = '#0B1220';
    g.fill();
    if (!ink.current) { ink.current = true; onInk(true); }
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const g = canvas.current.getContext('2d');
    const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const ev of events) {
      const p = pt(ev);
      g.beginPath();
      g.moveTo(last.current.x, last.current.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      last.current = p;
    }
  };
  const up = () => { drawing.current = false; };

  return (
    <div className={`bg-paper relative rounded-2xl ${className || ''}`}>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        className="block h-44 w-full cursor-crosshair touch-none rounded-2xl border-2 border-dashed border-line bg-bg" aria-label="Signature pad" />
      <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-faint/60" />
      <div className="pointer-events-none absolute bottom-3 left-6 text-caption text-faint">Sign above the line</div>
    </div>
  );
}
