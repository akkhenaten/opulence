import { createElement, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
const PULL = 70;

// Pull down at the top of the page to reload. Returns an indicator element to render.
export function usePullRefresh(onRefresh, enabled = true) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef({ y: null, pull: 0 });
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    if (!touch || !enabled) return undefined;
    const s = ref.current;
    const start = (e) => { s.y = window.scrollY <= 0 && !document.body.style.overflow ? e.touches[0].clientY : null; };
    const move = (e) => {
      if (s.y == null) return;
      const dy = e.touches[0].clientY - s.y;
      if (dy <= 0) { s.pull = 0; setPull(0); return; }
      s.pull = Math.min(120, dy * 0.5); // rubber band
      setPull(s.pull);
    };
    const end = async () => {
      if (s.y == null) return;
      s.y = null;
      if (s.pull >= PULL) {
        setBusy(true); setPull(PULL * 0.75);
        try { await cb.current?.(); } finally { setBusy(false); setPull(0); }
      } else setPull(0);
      s.pull = 0;
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); };
  }, [enabled]);
  if (!pull && !busy) return null;
  return createPortal(
    createElement('div', {
      className: 'pointer-events-none fixed inset-x-0 z-30 flex justify-center',
      style: { top: 'calc(var(--header-h) + env(safe-area-inset-top))', transform: `translateY(${pull - 36}px)`, opacity: Math.min(1, pull / PULL), transition: busy || !pull ? 'transform var(--dur-2) var(--ease-ios)' : 'none' },
      role: busy ? 'status' : undefined, 'aria-label': busy ? 'Refreshing' : undefined,
    }, createElement('span', { className: 'grid h-9 w-9 place-items-center rounded-full bg-surface text-blue shadow-tile' },
      createElement(Loader2, { size: 20, className: busy ? 'animate-spin' : '', style: busy ? undefined : { transform: `rotate(${pull * 4}deg)` } }))),
    document.body,
  );
}
