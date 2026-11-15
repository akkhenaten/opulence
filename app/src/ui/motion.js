import { useEffect, useRef, useState } from 'react';

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

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Cards rise in as they scroll into view. One watcher for the whole app: any card (.ui-panel / .ui-card) added below
   the fold is held back and eased in when it comes into view, a few at a time in turn. Cards already on screen are left
   alone, so nothing flickers when a page opens. */
export function startReveal(root = document.body) {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined' || reduced()) return () => {};
  const io = new IntersectionObserver((entries) => {
    let i = 0;
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.style.setProperty('--i', Math.min(i++, 6));
      e.target.setAttribute('data-shown', '');
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  const SEL = '.ui-panel, .ui-card';
  const take = (el) => {
    if (el.hasAttribute('data-reveal') || el.closest('.bento, [data-reveal], [role="dialog"], .no-reveal')) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.setAttribute('data-reveal', '');
    io.observe(el);
  };
  const mo = new MutationObserver((list) => {
    list.forEach((m) => m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1) return;
      if (n.matches(SEL)) take(n);
      n.querySelectorAll?.(SEL).forEach(take);
    }));
  });
  mo.observe(root, { childList: true, subtree: true });
  return () => { mo.disconnect(); io.disconnect(); };
}

// The last number each counter showed, by page and key, so coming back to a page doesn't roll up from 0 again
const lastShown = new Map();

// A number that rolls to its value: up from 0 the first time, from the old value after. Anything that isn't a plain number passes through
// key: names the counter (its label); one seen before on this page starts from where it was
export function useCountUp(value, ms = 600, key) {
  const n = typeof value === 'number' ? value : /^\d+$/.test(String(value ?? '')) ? Number(value) : null;
  const k = key != null && `${window.location.pathname}|${key}`;
  const start = k && lastShown.has(k) ? lastShown.get(k) : 0;
  const [shown, setShown] = useState(n == null || reduced() ? n : start);
  const from = useRef(start);
  useEffect(() => {
    if (k && n != null) lastShown.set(k, n);
  }, [k, n]);
  useEffect(() => {
    if (n == null) return undefined;
    if (reduced() || from.current === n) { setShown(n); from.current = n; return undefined; }
    const a = from.current;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setShown(Math.round(a + (n - a) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step); else from.current = n;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = n; };
  }, [n, ms]);
  return n == null ? value : shown;
}

// True for a moment after `value` changes (not on first show), so a badge can pop
export function useBump(value) {
  const [on, setOn] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    if (last.current === value) return undefined;
    last.current = value;
    setOn(true);
    const t = setTimeout(() => setOn(false), 450);
    return () => clearTimeout(t);
  }, [value]);
  return on;
}

// The time now, refreshed every `ms` (a minute by default), so "Starts at" turns into "Started" without a reload
export function useNow(ms = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
