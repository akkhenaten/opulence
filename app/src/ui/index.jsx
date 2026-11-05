import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Check as CheckIcon, ChevronLeft, ChevronRight, Inbox, Loader2, Search, X, XCircle } from 'lucide-react';
import { api } from '../api.js';
import { initials, titleCase } from './format.js';
import { usePresence, useScrollLock } from './motion.js';
import { pageHeader, previousPath } from './nav.js';

export * from './format.js';
export { usePresence, useScrollLock } from './motion.js';
export { usePageHeader, useScrollMemory } from './nav.js';
export { usePullRefresh } from './usePullRefresh.js';
export { Lightbox } from './Lightbox.jsx';
const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

/* ---------- Data hooks ---------- */

// Load an action on mount/when deps change; returns { data, error, loading, reload, setData }
export function useApi(action, body = {}, { poll, skip } = {}) {
  const key = JSON.stringify(body);
  const [state, setState] = useState({ data: null, error: null, loading: !skip });
  const alive = useRef(true);
  const load = useCallback(async (quiet) => {
    if (skip) return;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api(action, JSON.parse(key));
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (alive.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [action, key, skip]);
  useEffect(() => {
    alive.current = true;
    load();
    if (!poll) return () => { alive.current = false; };
    const t = setInterval(() => document.visibilityState === 'visible' && load(true), poll);
    return () => { alive.current = false; clearInterval(t); };
  }, [load, poll]);
  return { ...state, reload: () => load(true), setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

// Wrap an async action with busy state + toast on error/success
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, success) => {
    setBusy(true);
    try {
      const r = await fn();
      if (success) toast(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

/* ---------- Toasts ---------- */

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
let toastSeq = 0;
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => {
    setItems((x) => x.map((i) => (i.id === id ? { ...i, leaving: true } : i)));
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 170);
  }, []);
  // toast(message, kind?, { action: { label, onClick }, duration })
  const push = useCallback((message, kind = 'ok', opts = {}) => {
    const id = ++toastSeq;
    setItems((x) => [...x.slice(-2), { id, message, kind, action: opts.action }]);
    setTimeout(() => dismiss(id), opts.duration || (kind === 'error' || opts.action ? 5000 : 2600));
  }, [dismiss]);
  const swipe = useRef({});
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 safe-t" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            onClick={() => dismiss(t.id)}
            onPointerDown={(e) => { swipe.current[t.id] = e.clientY; }}
            onPointerUp={(e) => { if (e.clientY - (swipe.current[t.id] ?? e.clientY) < -20) dismiss(t.id); }}
            className={cx('pointer-events-auto flex max-w-full cursor-default items-center gap-2 rounded-full py-2.5 pl-4 text-subhead font-semibold shadow-tile backdrop-blur-xl',
              t.action ? 'pr-1.5' : 'pr-4',
              t.kind === 'error' ? 'bg-red text-white' : 'bg-ink/90 text-white', t.leaving ? 'anim-toast-out' : 'anim-toast-in')}>
            {t.kind === 'error' ? <AlertCircle size={16} className="shrink-0" /> : <CheckIcon size={16} className="shrink-0" />}<span className="min-w-0">{t.message}</span>
            {t.action && (
              <button type="button" className="pressable ml-1 h-8 shrink-0 rounded-full bg-white/15 px-3 text-footnote font-bold hover:bg-white/25"
                onClick={(e) => { e.stopPropagation(); t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Layout primitives ---------- */

export function Page({ title, subtitle, actions, back, children, wide }) {
  const nav = useNavigate();
  const sentinel = useRef(null);
  useEffect(() => {
    pageHeader.set({ title: typeof title === 'string' ? title : '', wide: !!wide });
    return () => pageHeader.set({ title: '', collapsed: false, wide: false });
  }, [title, wide]);
  // The large title hands over to the compact one in the top bar once it scrolls under it
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => pageHeader.set({ collapsed: !e.isIntersecting && e.boundingClientRect.top < 80 }), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Back uses history when it leads to the same page, so the list keeps its scroll position
  const goBack = (e) => {
    const to = String(back.to).split('?')[0];
    if (window.history.state?.idx > 0 && previousPath() && (previousPath() === to || previousPath().endsWith(to))) { e.preventDefault(); nav(-1); }
  };
  return (
    <div className={cx('mx-auto w-full pb-[calc(var(--tabbar-h)+32px)] pt-4 [--px:1rem] sm:[--px:1.5rem] lg:pt-8 safe-x', wide ? 'max-w-[1400px]' : 'max-w-6xl')}>
      {back && (
        <Link to={back.to} onClick={goBack} className="pressable -ml-2 mb-0.5 inline-flex h-11 items-center pr-3 text-body font-semibold text-blue">
          <ChevronLeft size={24} className="-mr-0.5" />{back.label}
        </Link>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title1 font-bold leading-tight sm:text-large">{title}</h1>
          {subtitle && <p className="mt-0.5 text-body text-muted">{subtitle}</p>}
          <div ref={sentinel} aria-hidden="true" />
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      <PoweredBy className="mt-10" />
    </div>
  );
}

// Platform credit at the bottom of every screen: Orb Security logo + a link to orbsolutions.co.uk
export const PoweredBy = ({ className }) => (
  <div className={cx('flex justify-center', className)}>
    <a href="https://orbsolutions.co.uk/" target="_blank" rel="noopener" className="pressable inline-flex items-center gap-2 rounded-control px-2 py-1.5 text-caption text-faint hover:text-muted">
      <img src="/app/orb-lockup.png" alt="Orb Security" className="brand-logo h-5 w-auto" />
      <span>Powered by <span className="font-semibold underline underline-offset-2">orbsolutions.co.uk</span></span>
    </a>
  </div>
);

export const Bento = ({ className, children }) => <div className={cx('bento grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4', className)}>{children}</div>;

export function Tile({ title, icon: Icon, action, to, className, children, pad = true, tone }) {
  const tones = { blue: 'bg-blue text-white', soft: 'bg-blue-soft', ink: 'bg-ink text-white' };
  const body = (
    <>
      {(title || action) && (
        <div className={cx('flex items-center justify-between gap-2', pad ? 'mb-3' : 'px-5 pt-4 pb-2')}>
          <div className={cx('flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide', tone ? 'opacity-80' : 'text-muted')}>
            {Icon && <Icon size={16} />}{title}
          </div>
          {action}
          {to && !action && <ChevronRight size={18} className={tone ? 'opacity-70' : 'text-faint'} />}
        </div>
      )}
      {children}
    </>
  );
  const cls = cx('rounded-tile border border-hairline shadow-tile min-w-0', tones[tone] || 'bg-surface', pad && 'p-[var(--pad-tile)]', to && 'pressable-card', className);
  return to ? <Link to={to} className={cx('block', cls)}>{body}</Link> : <section className={cls}>{body}</section>;
}

export function Stat({ value, label, hint, tone }) {
  const color = { red: 'text-red', amber: 'text-amber', green: 'text-green', blue: 'text-blue' }[tone] || '';
  return (
    <div>
      <div className={cx('display num font-bold leading-none', String(value).length > 7 ? 'text-title2' : 'text-large', color)}>{value}</div>
      {label && <div className="mt-1.5 text-subhead font-semibold">{label}</div>}
      {hint && <div className="mt-0.5 text-footnote opacity-60">{hint}</div>}
    </div>
  );
}

/* ---------- Controls ---------- */

const BTN_V = {
  primary: 'bg-blue text-white hover:bg-blue-ink shadow-[0_4px_14px_-6px_color-mix(in_srgb,var(--accent-fill,var(--color-blue))_70%,transparent)]',
  secondary: 'bg-surface text-ink border border-line hover:bg-bg',
  soft: 'bg-blue-soft text-blue hover:bg-blue-press',
  ghost: 'text-blue hover:bg-blue-soft',
  plain: 'text-ink hover:bg-fill',
  danger: 'bg-red-soft text-red hover:bg-red-press',
  dark: 'bg-ink text-white hover:bg-black',
  link: 'text-blue hover:underline underline-offset-2',
  'link-red': 'text-red hover:underline underline-offset-2',
};
// sm is for dense toolbars and tables; its hit area is still 44px tall
const BTN_S = {
  sm: ['h-9 px-3 text-footnote rounded-xl before:absolute before:inset-x-0 before:-inset-y-1', 'w-9', 16],
  md: ['h-11 px-4 text-subhead rounded-xl', 'w-11', 18],
  lg: ['h-[52px] px-6 text-callout rounded-2xl', 'w-[52px]', 20],
};
export function Button({ variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, iconOnly, busy, className, children, to, ...p }) {
  const [s, sq, is] = BTN_S[size];
  const link = variant.startsWith('link');
  const cls = cx('pressable relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold disabled:pointer-events-none disabled:opacity-50',
    BTN_V[variant],
    link ? cx('-mx-1 rounded-md px-1', { sm: 'text-footnote', md: 'text-subhead', lg: 'text-callout' }[size], 'min-h-9 before:absolute before:inset-x-0 before:-inset-y-1') : s,
    iconOnly && !link && cx(sq, 'px-0'), className);
  const spin = <Loader2 size={is} className="shrink-0 animate-spin" />;
  const hideLabel = busy && !Icon; // keep the label's width so the button doesn't jump
  const inner = (
    <>
      {hideLabel ? <span className="absolute inset-0 grid place-items-center">{spin}</span> : busy ? spin : Icon && <Icon size={is} className="shrink-0" />}
      {children != null && (hideLabel ? <span className="invisible">{children}</span> : children)}
      {IconRight && <IconRight size={is} className={cx('shrink-0', hideLabel && 'invisible')} />}
    </>
  );
  if (to) return <Link to={to} className={cls} {...p}>{inner}</Link>;
  return <button type="button" className={cls} disabled={busy || p.disabled} aria-busy={busy || undefined} {...p}>{inner}</button>;
}

const ICON_T = {
  ghost: 'text-muted hover:bg-black/5',
  soft: 'bg-fill text-ink hover:bg-fill-strong',
  solid: 'bg-surface text-ink shadow-tile border border-hairline hover:bg-bg',
  dark: 'bg-white/15 text-white hover:bg-white/25',
  primary: 'bg-blue text-white hover:bg-blue/90',
};
const ICON_S = { sm: 'h-9 w-9 before:absolute before:-inset-1', md: 'h-10 w-10 before:absolute before:-inset-0.5', lg: 'h-12 w-12' };
// Round icon-only button. badge: a count shown top-right
export function IconButton({ icon: Icon, label, tone = 'ghost', size = 'md', badge, badgeTone = 'blue', active, to, className, ...p }) {
  const cls = cx('pressable relative grid shrink-0 place-items-center rounded-full disabled:opacity-50', active ? 'bg-blue text-white shadow-tile' : ICON_T[tone], ICON_S[size], className);
  const inner = (
    <>
      <Icon size={size === 'lg' ? 24 : 20} />
      {badge > 0 && <span className={cx('absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 min-w-[18px] rounded-full px-1 text-center text-caption2 font-bold leading-[18px] text-white ring-2 ring-bg', badgeTone === 'red' ? 'bg-red' : 'bg-blue')}>{badge > 99 ? '99+' : badge}</span>}
    </>
  );
  if (to) return <Link to={to} aria-label={label} title={label} className={cls} {...p}>{inner}</Link>;
  return <button type="button" aria-label={label} title={label} className={cls} {...p}>{inner}</button>;
}

// Anything tappable that isn't a button: cards (card) or list rows (default highlight)
// card: press scale for tiles; press: press scale only (for chips/options that set their own colours); default: row highlight
export function Pressable({ to, href, onClick, card, press, className, children, ...p }) {
  const display = /(^|\s)(flex|grid|inline|inline-flex|inline-grid|inline-block|hidden)(\s|$)/.test(className || '');
  const cls = cx(!display && 'block', !/(^|\s)text-(center|right)(\s|$)/.test(className || '') && 'text-left', !press && 'w-full', card ? 'pressable-card' : press ? 'pressable' : 'transition-colors hover:bg-bg active:bg-fill', className);
  if (to) return <Link to={to} onClick={onClick} className={cls} {...p}>{children}</Link>;
  if (href) return <a href={href} onClick={onClick} className={cls} {...p}>{children}</a>;
  return <button type="button" onClick={onClick} className={cls} {...p}>{children}</button>;
}

// 16px text so iOS doesn't zoom into the field on focus
const inputCls = 'w-full rounded-xl border border-line bg-surface px-3.5 h-11 text-callout outline-none transition placeholder:text-faint focus:border-blue focus:ring-4 focus:ring-blue/10 disabled:bg-bg aria-[invalid=true]:border-red aria-[invalid=true]:focus:ring-red/10';
export { inputCls };
export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-footnote font-semibold text-muted">{label}</span>}
      {children}
      {(error || hint) && (
        <span className={cx('mt-1 flex items-start gap-1 text-caption', error ? 'text-red' : 'text-faint')}>
          {error && <AlertCircle size={14} className="mt-px shrink-0" />}{error || hint}
        </span>
      )}
    </label>
  );
}
const inv = (error) => (error ? { 'aria-invalid': true } : {});
export const Input = ({ label, hint, error, className, inputClassName, ...p }) => <Field label={label} hint={hint} error={error} className={className}><input className={cx(inputCls, inputClassName)} {...inv(error)} {...p} /></Field>;
export const Textarea = ({ label, hint, error, className, rows = 4, ...p }) => <Field label={label} hint={hint} error={error} className={className}><textarea rows={rows} className={cx(inputCls, 'h-auto py-2.5 leading-relaxed')} {...inv(error)} {...p} /></Field>;
export function Select({ label, hint, error, options, className, placeholder, ...p }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <select className={cx(inputCls, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27none%27 stroke=%27%236B7280%27 stroke-width=%272%27%3E%3Cpath d=%27M2 4l4 4 4-4%27/%3E%3C/svg%3E")] bg-[right_14px_center] bg-no-repeat pr-9')} {...inv(error)} {...p}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{titleCase(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Field>
  );
}
// Search box with a clear button. onChange gets an event-like { target: { value } }
export function SearchInput({ value, onChange, placeholder = 'Search', className, inputClassName, ...p }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <input type="search" enterKeyHint="search" value={value} onChange={onChange} placeholder={placeholder} aria-label={p['aria-label'] || placeholder}
        className={cx(inputCls, 'pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden', inputClassName)} {...p} />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange({ target: { value: '' } })}
          className="pressable absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-faint hover:text-ink"><XCircle size={18} /></button>
      ) : null}
    </div>
  );
}
export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span><span className="block text-body font-medium">{label}</span>{hint && <span className="block text-caption text-muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={!!checked} onClick={() => onChange(!checked)}
        className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-[var(--dur-2)]', checked ? 'bg-green' : 'bg-toggle-off')}>
        <span className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-[left] duration-[var(--dur-2)] ease-ios', checked ? 'left-[22px]' : 'left-[2px]')} />
      </button>
    </label>
  );
}

// iOS segmented control: the white thumb slides to the chosen option
export function Segmented({ value, onChange, options, className, full }) {
  const wrap = useRef(null);
  const [thumb, setThumb] = useState(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const measure = () => {
      const b = el.querySelector('[aria-selected="true"]');
      setThumb(b ? { left: b.offsetLeft, width: b.offsetWidth } : null);
      // Keep the chosen tab in view when the control scrolls sideways
      if (b && el.scrollWidth > el.clientWidth && (b.offsetLeft < el.scrollLeft || b.offsetLeft + b.offsetWidth > el.scrollLeft + el.clientWidth)) {
        el.scrollTo({ left: b.offsetLeft - 24, behavior: 'smooth' });
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);
  return (
    <div ref={wrap} className={cx(full ? 'flex w-full' : 'inline-flex', 'relative max-w-full overflow-x-auto rounded-xl bg-fill-strong p-[3px] no-scrollbar', className)} role="tablist">
      {thumb && <span aria-hidden="true" className="absolute bottom-[3px] top-[3px] rounded-lg bg-raised shadow-sm transition-[left,width] duration-[var(--dur-2)] ease-ios" style={{ left: thumb.left, width: thumb.width }} />}
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? titleCase(o) : o.label;
        return (
          <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
            className={cx(full && 'flex-1', 'relative min-h-9 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-footnote font-semibold transition-colors', value === v ? 'text-ink' : 'text-muted hover:text-ink', !thumb && value === v && 'bg-raised shadow-sm')}>
            {l}{o.count != null && o.count > 0 && <span className="ml-1.5 rounded-full bg-blue px-1.5 text-caption2 text-white">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Lists ---------- */

export const List = ({ children, className, inset }) => (
  <div className={cx('overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile divide-y divide-line', inset && 'border-0 shadow-none rounded-2xl bg-bg/60', className)}>{children}</div>
);
export function Row({ title, subtitle, left, right, to, onClick, chevron, className }) {
  const Inner = (
    <>
      {left && <div className="shrink-0">{left}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold">{title}</div>
        {subtitle && <div className="truncate text-footnote text-muted">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 text-right text-subhead">{right}</div>}
      {(chevron || to) && <ChevronRight size={18} className="shrink-0 text-faint" />}
    </>
  );
  const cls = cx('flex w-full items-center gap-3 px-4 py-3 text-left', (to || onClick) && 'transition-colors hover:bg-bg active:bg-fill', className);
  if (to) return <Link to={to} className={cls}>{Inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{Inner}</button>;
  return <div className={cls}>{Inner}</div>;
}
export const Section = ({ title, action, children, className }) => (
  <div className={cx('mt-6', className)}>
    {(title || action) && <div className="mb-2 flex items-center justify-between px-1"><h2 className="min-w-0 text-footnote font-semibold uppercase tracking-wide text-muted">{title}</h2>{action}</div>}
    {children}
  </div>
);
export function KV({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0"><dt className="text-caption font-semibold uppercase tracking-wide text-faint">{k}</dt><dd className="mt-0.5 break-words text-body">{v || <span className="text-faint">—</span>}</dd></div>
      ))}
    </dl>
  );
}

// Simple responsive table: becomes cards on mobile
export function Table({ columns, rows, onRow, empty = 'Nothing here yet', rowKey = 'id' }) {
  if (!rows?.length) return <Empty title={empty} />;
  return (
    <div className="overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile">
      <table className="hidden w-full text-subhead md:table">
        <thead><tr className="border-b border-line text-left text-caption font-semibold uppercase tracking-wide text-faint">
          {columns.map((c) => <th key={c.key || c.label} className={cx('px-4 py-3 font-semibold', c.align === 'right' && 'text-right')}>{c.label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} onClick={onRow ? () => onRow(r) : undefined} className={cx(onRow && 'cursor-pointer hover:bg-bg')}>
              {columns.map((c) => <td key={c.key || c.label} className={cx('px-4 py-3 align-middle', c.align === 'right' && 'text-right num', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="divide-y divide-line md:hidden">
        {rows.map((r, i) => (
          <div key={r[rowKey] ?? i} onClick={onRow ? () => onRow(r) : undefined} className={cx('px-4 py-3', onRow && 'active:bg-bg')}>
            {columns.map((c, ci) => (
              <div key={c.key || c.label} className={cx('flex items-center justify-between gap-3', ci === 0 ? 'text-body font-semibold' : 'text-footnote text-muted')}>
                {ci > 0 && <span className="text-faint">{c.label}</span>}<span className={cx('min-w-0', ci > 0 && 'text-right text-ink')}>{c.render ? c.render(r) : r[c.key]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Status ---------- */

const PILL = {
  green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red', blue: 'bg-blue-soft text-blue', grey: 'bg-fill text-muted', ink: 'bg-ink text-white',
};
const STATUS_TONE = {
  active: 'green', ok: 'green', signed: 'green', paid: 'green', approved: 'green', accepted: 'green', on_shift: 'green', closed: 'grey', published: 'blue', filled: 'green', locked: 'grey',
  pending: 'amber', draft: 'grey', submitted: 'blue', issued: 'blue', requested: 'amber', onboarding: 'amber', applicant: 'blue', assigned: 'blue', upcoming: 'grey', on_break: 'amber',
  disputed: 'red', overdue: 'red', exception: 'red', rejected: 'red', declined: 'grey', cancelled: 'grey', void: 'grey', late: 'amber', no_show: 'red', left_early: 'amber', suspended: 'red', left: 'grey',
  changes_requested: 'amber', critical: 'red', high: 'red', medium: 'amber', low: 'grey', credited: 'grey', finished: 'grey', manual: 'blue', partial: 'amber', open: 'blue',
  in_review: 'amber', reconciled: 'blue', no_response: 'amber', resolved: 'green', held: 'amber',
};
export function Pill({ children, tone, status, className }) {
  const t = tone || STATUS_TONE[status] || 'grey';
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold', PILL[t], className)}>{children ?? titleCase(status)}</span>;
}
// Shift assignments: 'assigned' means the officer has not confirmed yet, 'accepted' means they have
export function AssignPill({ status, className }) {
  if (status === 'assigned') return <Pill tone="amber" className={className}>Unconfirmed</Pill>;
  if (status === 'accepted') return <Pill tone="green" className={className}>Confirmed</Pill>;
  return <Pill status={status} className={className} />;
}
export const assignTone = (status) => (status === 'accepted' ? 'green' : status === 'assigned' ? 'amber' : 'grey');
// A shift is short until every place is filled, then unconfirmed until everyone on it has confirmed
export function confirmState({ filled, headcount, statuses = [] }) {
  if (filled < headcount) return 'short';
  return statuses.some((st) => st === 'assigned') ? 'unconfirmed' : 'confirmed';
}
export const Dot = ({ tone = 'green', live, label }) => <span className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', { green: 'bg-green', amber: 'bg-amber', red: 'bg-red', grey: 'bg-faint', blue: 'bg-blue' }[tone], live && 'live-dot')}>{label && <span className="sr-only">{label}</span>}</span>;

export function Avatar({ name, src, size = 40, className }) {
  const hue = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  const bg = ['bg-blue-soft text-blue', 'bg-fill text-ink', 'bg-sky-soft text-sky', 'bg-indigo-soft text-indigo'][hue];
  if (src) return <img src={src} alt="" className={cx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  return <div className={cx('grid shrink-0 place-items-center rounded-full font-bold', bg, className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</div>;
}

export const Spinner = ({ className }) => <div role="status" aria-label="Loading" className={cx('grid place-items-center py-16 text-muted', className)}><Loader2 className="animate-spin" /></div>;

/* ---------- Skeletons (shimmer placeholders while data loads) ---------- */

export const Skeleton = ({ className, style }) => <div aria-hidden="true" className={cx('skeleton rounded-lg', className)} style={style} />;
export function SkeletonRows({ n = 5, className }) {
  return (
    <div role="status" aria-label="Loading" className={cx('divide-y divide-line overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile', className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5" style={{ width: `${55 - (i % 3) * 10}%` }} /><Skeleton className="h-3 w-3/5" /></div>
        </div>
      ))}
    </div>
  );
}
export function SkeletonTiles({ n = 4, className }) {
  return (
    <div role="status" aria-label="Loading" className={cx('grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4', className)}>
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} className={cx('h-32 rounded-tile', i === 0 && n > 2 && 'col-span-2')} />)}
    </div>
  );
}
export function SkeletonPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 lg:pt-8">
      <Skeleton className="mb-6 mt-2 h-9 w-56 rounded-xl" />
      <SkeletonTiles />
      <SkeletonRows n={4} className="mt-6" />
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', body, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center rounded-tile border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon size={24} /></div>
      <div className="text-callout font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-sm text-subhead text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const ErrorBox = ({ error, retry }) => (
  <div className="rounded-tile bg-red-soft p-5 text-red"><div className="font-semibold">{error?.message || 'Could not load'}</div>{retry && <div className="mt-1"><Button variant="link" className="text-red" onClick={retry}>Try again</Button></div>}</div>
);

// Render loading / error / content for a useApi result
// skeleton: 'rows' | 'tiles' | 'page' shows a placeholder in the page's shape instead of a spinner
export function Load({ q, children, skeleton, n }) {
  if (q.loading && !q.data) return skeleton === 'rows' ? <SkeletonRows n={n} /> : skeleton === 'tiles' ? <SkeletonTiles n={n} /> : skeleton === 'page' ? <SkeletonPage /> : <Spinner />;
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  return children(q.data);
}

/* ---------- Sheet (bottom sheet on mobile, centred modal on desktop) ---------- */

export function Sheet({ open, onClose, title, children, footer, size = 'md' }) {
  const { mounted, closing } = usePresence(open, 240);
  const panel = useRef(null);
  const drag = useRef(null);
  const dragged = useRef(false);
  useScrollLock(open);
  useEffect(() => {
    if (!open) return undefined;
    dragged.current = false;
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!mounted) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }[size];

  // Drag the handle or title down to close (phones)
  const down = (e) => {
    if (e.pointerType === 'mouse' || window.innerWidth >= 640 || e.target.closest('button,a,input,select,textarea')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y);
    Object.assign(panel.current.style, { transition: 'none', transform: `translateY(${d.dy}px)` });
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panel.current) return;
    const fast = d.dy / Math.max(1, performance.now() - d.t) > 0.6;
    panel.current.style.transition = 'transform var(--dur-2) var(--ease-ios)';
    if (d.dy > 120 || (fast && d.dy > 30)) {
      dragged.current = true;
      panel.current.style.transform = 'translateY(100%)';
      onClose();
    } else panel.current.style.transform = '';
  };
  const grab = { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up };

  return createPortal(
    <div className={cx('fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6', closing && 'pointer-events-none')} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className={cx('absolute inset-0 bg-ink/30 backdrop-blur-[2px]', closing ? 'anim-fade-out' : 'anim-fade-in')} onClick={onClose} />
      <div ref={panel} className={cx('relative flex max-h-[92dvh] w-full flex-col rounded-t-sheet bg-surface shadow-sheet sm:rounded-sheet safe-x', w, closing ? (!dragged.current && 'anim-sheet-out') : 'anim-sheet-in')}>
        <div className="touch-none" {...grab}>
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
            <h2 className="text-title3 font-bold">{title}</h2>
            <IconButton icon={X} label="Close" tone="soft" onClick={onClose} />
          </div>
        </div>
        <div className={cx('flex-1 overflow-y-auto overscroll-contain px-5', footer ? 'pb-5' : 'pb-[calc(1.25rem+env(safe-area-inset-bottom))]')}>{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Promise-based confirm dialog
const ConfirmCtx = createContext(async () => true);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }) {
  const [st, setSt] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setSt({ ...(typeof opts === 'string' ? { title: opts } : opts), resolve })), []);
  const [shown, setShown] = useState(false);
  const close = (v) => { st?.resolve(v); setShown(false); };
  useEffect(() => { if (st) setShown(true); }, [st]);
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Sheet open={shown} onClose={() => close(false)} title={st?.title} size="sm"
        footer={<><Button variant="secondary" onClick={() => close(false)}>{st?.cancel || 'Cancel'}</Button><Button variant={st?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{st?.confirm || 'Confirm'}</Button></>}>
        {st?.body && <p className="text-body text-muted">{st.body}</p>}
      </Sheet>
    </ConfirmCtx.Provider>
  );
}

// Form state helper
export function useForm(initial) {
  const [v, setV] = useState(initial);
  const bind = (k, type) => type === 'checkbox'
    ? { checked: !!v[k], onChange: (e) => setV((s) => ({ ...s, [k]: e.target.checked })) }
    : { value: v[k] ?? '', onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })) };
  return { v, setV, set: (k, val) => setV((s) => ({ ...s, [k]: val })), bind };
}

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"><Segmented value={value} onChange={onChange} options={tabs} /></div>
);

/* ---------- Small shared controls ---------- */

// Checkbox: rounded square, or a circle with round
export function Check({ checked, onChange, label, className, round }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!checked} aria-label={label}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!checked); }}
      className={cx('relative grid h-[22px] w-[22px] shrink-0 place-items-center border-2 transition-colors before:absolute before:-inset-2.5', round ? 'rounded-full' : 'rounded-md',
        checked ? 'border-blue bg-blue text-white' : 'border-line bg-surface hover:border-faint', className)}>
      {checked && <CheckIcon size={14} strokeWidth={3} className="anim-pop" />}
    </button>
  );
}

// Progress bar. Either value/max, or done/total (which also shows "3/5")
export function Progress({ value, max, done, total, count, className }) {
  const v = value ?? done ?? 0;
  const m = max ?? total ?? 0;
  const pct = m ? Math.min(100, Math.round((v / m) * 100)) : 0;
  const bar = (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-fill-strong', count ?? done != null ? 'flex-1' : cx('w-full', className))}>
      <div className={cx('h-full rounded-full transition-[width] duration-[var(--dur-3)] ease-ios', pct >= 100 ? 'bg-green' : 'bg-blue')} style={{ width: `${pct}%` }} />
    </div>
  );
  if (!(count ?? done != null)) return bar;
  return <div className={cx('flex items-center gap-2', className)}>{bar}<span className="num text-caption font-semibold text-muted">{v}/{m}</span></div>;
}

// Summary chip with a count; tappable when onClick is set
export function Chip({ label, value, tone = 'grey', active, onClick }) {
  const tones = { grey: 'bg-surface text-ink', green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red', blue: 'bg-blue-soft text-blue' };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
      className={cx('inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-footnote font-semibold shadow-tile',
        tones[tone], active ? 'border-blue ring-2 ring-blue/15' : 'border-hairline', onClick && 'pressable')}>
      <span className="num text-body font-bold">{value}</span>{label}
    </Tag>
  );
}

// Multi-select chips
export function Chips({ options, value = [], onChange, label }) {
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div>
      {label && <div className="mb-1.5 text-footnote font-semibold text-muted">{label}</div>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => toggle(o.value)} aria-pressed={value.includes(o.value)}
            className={cx('pressable min-h-9 rounded-full border px-3.5 py-1.5 text-footnote font-semibold',
              value.includes(o.value) ? 'border-blue bg-blue text-white' : 'border-line bg-surface text-ink hover:bg-bg')}>
            {o.label}
          </button>
        ))}
        {!options.length && <span className="text-footnote text-faint">None available</span>}
      </div>
    </div>
  );
}

// Floating bar for bulk actions or a save button; sits above the tab bar
export function ActionBar({ show = true, children, className, tone = 'dark' }) {
  const { mounted, closing } = usePresence(show, 160);
  if (!mounted) return null;
  // in-flow spacer so the floating bar never covers the last row of the page
  return <><div aria-hidden="true" className="h-20" />{createPortal(
    <div className="action-bar pointer-events-none fixed inset-x-0 z-40 flex justify-center [--px:1rem] safe-x">
      <div className={cx('pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full py-2 pl-5 pr-2 shadow-sheet backdrop-blur-xl',
        tone === 'dark' ? 'bg-ink/95 text-white' : 'border border-hairline bg-surface/95 text-ink', closing ? 'anim-toast-out' : 'anim-bar-in', className)}>
        {children}
      </div>
    </div>,
    document.body,
  )}</>;
}
