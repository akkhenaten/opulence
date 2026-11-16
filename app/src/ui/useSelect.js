import { useEffect, useRef, useState } from 'react';

const typing = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
const mod = (e) => e.metaKey || e.ctrlKey;

/**
 * Picking several items the way Windows and macOS do: Ctrl/Cmd+click adds or drops one, Shift+click adds everything
 * between the last one picked and this one, Ctrl/Cmd+A picks them all, Esc lets go. On a touch screen a long press
 * starts picking and taps then add or drop.
 * ids: what can be picked, in the order shown. range(from, to) gives the ids between two picks ({ id, at } each, `at`
 * being whatever the caller passed to click, e.g. a grid cell); by default the run of ids between them.
 * keys: 'always' takes Ctrl+A over on the page (a grid); 'picking' (default) only once picking has started.
 * can(id, sel): whether id may join what is already picked (e.g. cards of one kind only); by default anything.
 * click(e, id, at) returns true when the click picked something, so the caller does not also open the item.
 */
export function useSelect({ ids, range, keys = 'picking', can }) {
  const [sel, setSel] = useState(() => new Set());
  const [picking, setPicking] = useState(false);
  const anchor = useRef(null);
  const live = useRef(null);
  live.current = { ids, range, can };
  const timer = useRef(0);
  const down = useRef(null);
  const held = useRef(false);

  const stop = () => { setPicking(false); setSel(new Set()); anchor.current = null; };
  const toggle = (id, on, at) => {
    anchor.current = { id, at };
    setPicking(true);
    setSel((x) => { const n = new Set(x); if (on ?? !n.has(id)) add(n, [id]); else n.delete(id); return n; });
  };
  // Adds what may join, one at a time, so a rule like "one kind only" follows the first one picked
  const add = (n, list) => { for (const id of list) if (!live.current.can || live.current.can(id, n)) n.add(id); return n; };
  const setAll = (on = true) => { setPicking(true); setSel(on ? add(new Set(), live.current.ids) : new Set()); };
  const spread = (id, at) => {
    const { ids: all, range: r } = live.current;
    const from = anchor.current;
    if (!from) return toggle(id, true, at);
    let between;
    if (r) between = r(from, { id, at });
    else {
      const i = all.indexOf(from.id);
      const j = all.indexOf(id);
      between = i < 0 || j < 0 ? [id] : all.slice(Math.min(i, j), Math.max(i, j) + 1);
    }
    setPicking(true);
    setSel((x) => add(new Set(x), between));
    return undefined;
  };

  const click = (e, id, at) => {
    // The tap that ends a long press has already picked
    if (held.current) { held.current = false; return true; }
    if (e?.shiftKey) { e.preventDefault(); window.getSelection?.()?.removeAllRanges(); spread(id, at); return true; }
    if (e && mod(e)) { e.preventDefault(); toggle(id, undefined, at); return true; }
    if (picking) { toggle(id, undefined, at); return true; }
    return false;
  };

  const cancel = () => { clearTimeout(timer.current); timer.current = 0; };
  useEffect(() => cancel, []);
  const press = (id, at) => ({
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') return;
      cancel();
      held.current = false;
      down.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => { held.current = true; navigator.vibrate?.(8); toggle(id, true, at); }, 450);
    },
    onPointerMove: (e) => { if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 10) cancel(); },
    onPointerUp: () => { cancel(); down.current = null; },
    onPointerCancel: () => { cancel(); down.current = null; held.current = false; },
    onContextMenu: (e) => { if (down.current || held.current) e.preventDefault(); },
  });

  const on = keys === 'always' || picking || sel.size > 0;
  useEffect(() => {
    if (!on) return undefined;
    const key = (e) => {
      if (typing(document.activeElement) || document.querySelector('[role="dialog"]')) return;
      if (e.key === 'Escape' && (picking || sel.size)) { e.preventDefault(); stop(); }
      else if (e.key.toLowerCase() === 'a' && mod(e) && !e.shiftKey && !e.altKey && live.current.ids.length) { e.preventDefault(); setAll(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on, picking, sel.size]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = ids.filter((id) => sel.has(id));
  return { sel, has: (id) => sel.has(id), chosen, picking, start: () => setPicking(true), stop, toggle, setAll, click, press, setSel };
}
