// The floating Orb button: bottom right on every manager page, above the tab bar and any action bar.
// Drag it anywhere; it stays where it was left (saved on this device).
// On phones it slips out of the way while you scroll down, and comes back on scroll up, a pause, or the end of the page.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { cx } from './index.jsx';

const KEY = 'orb.fab.pos';
const SIZE = 56;
const GAP = 8;

const saved = () => {
  try { const p = JSON.parse(localStorage.getItem(KEY)); return p && Number.isFinite(p.right) && Number.isFinite(p.bottom) ? p : null; } catch { return null; }
};

// Height of a CSS length (the bar variables include the safe areas)
const measure = (css) => {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;visibility:hidden;height:${css}`;
  document.body.appendChild(el);
  const h = el.offsetHeight;
  el.remove();
  return h;
};

// Keep the whole button on screen, clear of the header and the tab bar
function clamp({ right, bottom }) {
  const top = measure('calc(var(--header-h) + env(safe-area-inset-top))');
  const tabbar = measure('var(--tabbar-h)') || measure('env(safe-area-inset-bottom)');
  const fit = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)));
  return {
    right: fit(right, GAP, window.innerWidth - SIZE - GAP),
    bottom: fit(bottom, tabbar + GAP, window.innerHeight - top - SIZE - GAP),
  };
}

// True while the page (or a list inside it) is being scrolled down, phones and tablets only
function useScrollAway(pathname) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    setAway(false);
    const mq = window.matchMedia('(min-width: 1024px)');
    const last = new WeakMap(); // scroll position at the last change of direction, per scroller
    let timer, frame;
    const check = (el) => {
      frame = null;
      if (mq.matches) return setAway(false);
      const win = el === document || el === document.documentElement || el === document.body;
      const node = win ? document.documentElement : el;
      const y = win ? window.scrollY : node.scrollTop;
      const end = (win ? window.innerHeight : node.clientHeight) + y >= node.scrollHeight - 4;
      const from = last.get(node) ?? y;
      if (end || y - from < -8) { setAway(false); last.set(node, y); }
      else if (y - from > 8 && y > 80) { setAway(true); last.set(node, y); }
      else if (!last.has(node)) last.set(node, y);
      clearTimeout(timer);
      timer = setTimeout(() => setAway(false), 900);
    };
    const on = (e) => { if (!frame) { const el = e.target; frame = requestAnimationFrame(() => check(el)); } };
    document.addEventListener('scroll', on, { capture: true, passive: true });
    return () => { document.removeEventListener('scroll', on, { capture: true }); clearTimeout(timer); if (frame) cancelAnimationFrame(frame); };
  }, [pathname]);
  return away;
}

export default function OrbFab({ onClick, hidden, dot }) {
  const { pathname } = useLocation();
  const [pos, setPos] = useState(saved);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const moved = useRef(false);
  // A message thread has its own composer at the bottom
  const thread = /\/messages\/[^/]+/.test(pathname);
  const away = useScrollAway(pathname) && !dragging;
  // Slides off the nearest side edge; fades in place when it was left in the middle of the screen
  const awayClass = !away ? null
    : pos && pos.bottom > window.innerHeight * 0.4 ? 'orb-fab-away'
      : pos && pos.right > window.innerWidth / 2 ? 'orb-fab-away orb-fab-away-l' : 'orb-fab-away orb-fab-away-r';

  // Back on screen after a rotation or a smaller window
  useEffect(() => {
    const fix = () => setPos((p) => (p ? clamp(p) : p));
    fix();
    window.addEventListener('resize', fix);
    window.addEventListener('orientationchange', fix);
    return () => { window.removeEventListener('resize', fix); window.removeEventListener('orientationchange', fix); };
  }, []);

  const down = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { x0: e.clientX, y0: e.clientY, r0: window.innerWidth - r.right, b0: window.innerHeight - r.bottom, live: false };
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.live && Math.hypot(dx, dy) < 6) return;
    if (!d.live) { d.live = true; moved.current = true; setDragging(true); }
    setPos(clamp({ right: d.r0 - dx, bottom: d.b0 - dy }));
  };
  const up = () => {
    if (drag.current?.live) setPos((p) => { if (p) localStorage.setItem(KEY, JSON.stringify(p)); return p; });
    drag.current = null;
    setDragging(false);
  };
  const click = () => {
    if (moved.current) { moved.current = false; return; } // a drag, not a tap
    onClick();
  };

  return (
    <button type="button" onClick={click} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      aria-label={dot ? 'Orb, your assistant (something new)' : 'Orb, your assistant'} title="Orb"
      style={pos ? { right: pos.right, bottom: pos.bottom } : undefined}
      className={cx('orb-fab pressable fixed z-40 grid h-14 w-14 place-items-center rounded-full', !pos && 'right-4 sm:right-6 lg:right-8', dragging && 'orb-fab-drag', (hidden || thread) && 'orb-fab-hidden', awayClass)}>
      <img src="/app/brand/logo-gold-192.png" alt="" className="h-7 w-auto" draggable={false} />
      {dot && <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-red ring-2 ring-[var(--color-surface,#fff)]" />}
    </button>
  );
}
