import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';

/* Filters and views kept in the address, so Back returns to the same list with the same filters.
   Values equal to their default stay out of the URL; changes replace the entry, so Back still leaves the page. */
export function useUrlState(defaults) {
  const [sp, setSp] = useSearchParams();
  const keys = Object.keys(defaults);
  const state = useMemo(() => Object.fromEntries(keys.map((k) => [k, sp.get(k) ?? defaults[k]])), [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((patch) => setSp((cur) => {
    const next = new URLSearchParams(cur);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === '' || String(v) === String(defaults[k] ?? '')) next.delete(k); else next.set(k, String(v));
    });
    return next;
  }, { replace: true }), [setSp]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback((only) => set(Object.fromEntries((only || keys).map((k) => [k, defaults[k]]))), [set]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, set, clear];
}

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

/* The trail of pages in this tab, one per history entry, so Back returns to where the person came from and names it */
const TRAIL = 'orb:trail';
let trail = (() => { try { return JSON.parse(sessionStorage.getItem(TRAIL)) || []; } catch { return []; } })();
const keepTrail = () => { try { sessionStorage.setItem(TRAIL, JSON.stringify(trail.slice(-60))); } catch { /* private mode */ } };
// A new page drops anything ahead of it; going back keeps the trail; a replace on the same page keeps its name
export function stepTrail(list, idx, type, path) {
  const t = type === 'PUSH' ? list.slice(0, idx) : list.slice();
  const same = t[idx] && t[idx].path.split('?')[0] === path.split('?')[0];
  if (type === 'POP' && same) return t;
  t[idx] = { path, title: same ? t[idx].title : '' };
  return t;
}
const histIdx = () => (typeof window !== 'undefined' && window.history.state?.idx) || 0;
// Page names its history entry; the next page's Back shows that name
export const setTrailTitle = (title) => { const i = histIdx(); if (trail[i]) { trail[i] = { ...trail[i], title }; keepTrail(); } };
export const previousEntry = () => { const i = histIdx(); return i > 0 ? trail[i - 1] || null : null; };

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
  useLayoutEffect(() => {
    trail = stepTrail(trail, histIdx(), type, loc.pathname + loc.search);
    keepTrail();
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const key = `${loc.key}:${loc.pathname}`;
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
  }, [loc.key, loc.pathname]);
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
