import { useEffect, useState } from 'react';

// Keeps a component mounted for `ms` after `open` turns false, so it can play its close animation
export function usePresence(open, ms = 240) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return undefined; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted: open || mounted, closing: !open && mounted };
}

// Locks page scroll while a sheet or viewer is open. iOS Safari ignores
// overflow:hidden on body, so there the body is pinned and the scroll restored after.
const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let locks = 0;
let savedY = 0;
export function useScrollLock(on) {
  useEffect(() => {
    if (!on) return undefined;
    const b = document.body.style;
    if (locks++ === 0) {
      savedY = window.scrollY;
      if (isIOS) Object.assign(b, { position: 'fixed', top: `-${savedY}px`, left: '0', right: '0' });
      b.overflow = 'hidden';
      document.documentElement.classList.add('scroll-locked');
    }
    return () => {
      if (--locks > 0) return;
      document.documentElement.classList.remove('scroll-locked');
      Object.assign(b, { position: '', top: '', left: '', right: '', overflow: '' });
      if (isIOS) window.scrollTo(0, savedY);
    };
  }, [on]);
}
