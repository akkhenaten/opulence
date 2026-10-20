import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/* Page header store: Page publishes its title, the Shell header shows it once the large title scrolls away */
let state = { title: '', collapsed: false, wide: false };
const subs = new Set();
export const pageHeader = {
  get: () => state,
  set(patch) { state = { ...state, ...patch }; subs.forEach((f) => f()); },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};
export const usePageHeader = () => useSyncExternalStore(pageHeader.subscribe, pageHeader.get);

/* Where the person came from, so Back can use history (and keep their scroll) when it leads to the same place */
let prevPath = null;
let curPath = null;
export const previousPath = () => prevPath;

// Remembers scroll per history entry: back/forward returns to the same spot, new pages start at the top
const KEY = 'orb:scroll';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

export function useScrollMemory() {
  const loc = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    if (loc.pathname !== curPath) { prevPath = curPath; curPath = loc.pathname; }
  }, [loc.pathname]);
  useEffect(() => {
    const key = loc.key;
    if (type !== 'POP') window.scrollTo(0, 0);
    else {
      const y = read()[key] || 0;
      // Data loads after mount, so keep trying until the page is tall enough
      const until = Date.now() + 1500;
      const tick = () => {
        if (stop) return;
        window.scrollTo(0, y);
        if (Math.abs(window.scrollY - y) > 2 && Date.now() < until) raf = requestAnimationFrame(tick);
      };
      // Stop as soon as the person scrolls themselves
      let stop = false;
      const halt = () => { stop = true; };
      window.addEventListener('touchstart', halt, { passive: true, once: true });
      window.addEventListener('wheel', halt, { passive: true, once: true });
      let raf = requestAnimationFrame(tick);
      return save(key, () => { cancelAnimationFrame(raf); window.removeEventListener('touchstart', halt); window.removeEventListener('wheel', halt); });
    }
    return save(key);
  }, [loc.key]);
}
// Keeps the last scroll position seen while this entry was showing. Reading scrollY at cleanup
// is too late: the next page has rendered by then and the browser has already clamped it.
function save(key, extra) {
  let y = window.scrollY;
  const write = () => { const all = read(); all[key] = y; sessionStorage.setItem(KEY, JSON.stringify(all)); };
  let t;
  const onScroll = () => { y = window.scrollY; clearTimeout(t); t = setTimeout(write, 80); };
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => { extra?.(); clearTimeout(t); window.removeEventListener('scroll', onScroll); write(); };
}
