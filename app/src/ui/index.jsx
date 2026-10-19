import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { api } from '../api.js';
import { initials, titleCase } from './format.js';

export * from './format.js';
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
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x, { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none safe-t" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-tile backdrop-blur-xl',
            t.kind === 'error' ? 'bg-red text-white' : 'bg-ink/90 text-white')} style={{ animation: 'fade .2s' }}>
            {t.kind === 'error' ? <AlertCircle size={16} /> : <Check size={16} />}{t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Layout primitives ---------- */

export function Page({ title, subtitle, actions, back, children, wide }) {
  return (
    <div className={cx('mx-auto w-full px-4 pb-28 pt-4 sm:px-6 lg:pb-12 lg:pt-8', wide ? 'max-w-[1400px]' : 'max-w-6xl')}>
      {back && <Link to={back.to} className="mb-1 inline-flex items-center gap-1 text-[15px] font-semibold text-blue">‹ {back.label}</Link>}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight sm:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[15px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export const Bento = ({ className, children }) => <div className={cx('bento grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4', className)}>{children}</div>;

export function Tile({ title, icon: Icon, action, to, className, children, pad = true, tone }) {
  const tones = { blue: 'bg-blue text-white', soft: 'bg-blue-soft', ink: 'bg-ink text-white' };
  const body = (
    <>
      {(title || action) && (
        <div className={cx('flex items-center justify-between gap-2', pad ? 'mb-3' : 'px-5 pt-4 pb-2')}>
          <div className={cx('flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide', tone ? 'opacity-80' : 'text-muted')}>
            {Icon && <Icon size={15} strokeWidth={2.2} />}{title}
          </div>
          {action}
          {to && !action && <ChevronRight size={18} className={tone ? 'opacity-70' : 'text-faint'} />}
        </div>
      )}
      {children}
    </>
  );
  const cls = cx('rounded-tile border border-black/[0.04] shadow-tile min-w-0', tones[tone] || 'bg-surface', pad && 'p-5', to && 'transition hover:-translate-y-0.5 active:scale-[0.99]', className);
  return to ? <Link to={to} className={cx('block', cls)}>{body}</Link> : <section className={cls}>{body}</section>;
}

export function Stat({ value, label, hint, tone }) {
  const color = { red: 'text-red', amber: 'text-amber', green: 'text-green', blue: 'text-blue' }[tone] || '';
  return (
    <div>
      <div className={cx('display num font-bold leading-none', String(value).length > 7 ? 'text-[26px]' : 'text-[34px]', color)}>{value}</div>
      {label && <div className="mt-1.5 text-[14px] font-semibold">{label}</div>}
      {hint && <div className="mt-0.5 text-[13px] opacity-60">{hint}</div>}
    </div>
  );
}

/* ---------- Controls ---------- */

export function Button({ variant = 'primary', size = 'md', icon: Icon, busy, className, children, to, ...p }) {
  const v = {
    primary: 'bg-blue text-white hover:bg-blue-ink shadow-[0_4px_14px_-6px_rgba(10,108,255,.7)]',
    secondary: 'bg-surface text-ink border border-line hover:bg-bg',
    soft: 'bg-blue-soft text-blue hover:bg-[#dbe7ff]',
    ghost: 'text-blue hover:bg-blue-soft',
    danger: 'bg-red-soft text-red hover:bg-[#fbdcdc]',
    dark: 'bg-ink text-white hover:bg-black',
  }[variant];
  const s = { sm: 'h-8 px-3 text-[13px] rounded-[10px]', md: 'h-10 px-4 text-[14px] rounded-xl', lg: 'h-[52px] px-6 text-[16px] rounded-2xl' }[size];
  const cls = cx('inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50', v, s, className);
  const inner = <>{busy ? <Loader2 size={16} className="animate-spin" /> : Icon && <Icon size={size === 'lg' ? 19 : 16} strokeWidth={2.2} />}{children}</>;
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button type="button" className={cls} disabled={busy || p.disabled} {...p}>{inner}</button>;
}

export const IconButton = ({ icon: Icon, label, className, ...p }) => (
  <button type="button" aria-label={label} title={label} className={cx('grid h-9 w-9 place-items-center rounded-full text-muted transition hover:bg-black/5 active:scale-95', className)} {...p}><Icon size={19} /></button>
);

const inputCls = 'w-full rounded-xl border border-line bg-surface px-3.5 h-11 text-[15px] outline-none transition placeholder:text-faint focus:border-blue focus:ring-4 focus:ring-blue/10 disabled:bg-bg';
export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-muted">{label}</span>}
      {children}
      {(error || hint) && <span className={cx('mt-1 block text-[12px]', error ? 'text-red' : 'text-faint')}>{error || hint}</span>}
    </label>
  );
}
export const Input = ({ label, hint, className, ...p }) => <Field label={label} hint={hint} className={className}><input className={inputCls} {...p} /></Field>;
export const Textarea = ({ label, hint, className, rows = 4, ...p }) => <Field label={label} hint={hint} className={className}><textarea rows={rows} className={cx(inputCls, 'h-auto py-2.5 leading-relaxed')} {...p} /></Field>;
export function Select({ label, hint, options, className, placeholder, ...p }) {
  return (
    <Field label={label} hint={hint} className={className}>
      <select className={cx(inputCls, 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27none%27 stroke=%27%236B7280%27 stroke-width=%272%27%3E%3Cpath d=%27M2 4l4 4 4-4%27/%3E%3C/svg%3E")] bg-[right_14px_center] bg-no-repeat pr-9')} {...p}>
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{titleCase(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Field>
  );
}
export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span><span className="block text-[15px] font-medium">{label}</span>{hint && <span className="block text-[12px] text-muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={!!checked} onClick={() => onChange(!checked)}
        className={cx('relative h-[31px] w-[51px] shrink-0 rounded-full transition', checked ? 'bg-green' : 'bg-[#E3E5E8]')}>
        <span className={cx('absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-[2px]')} />
      </button>
    </label>
  );
}

// iOS segmented control
export function Segmented({ value, onChange, options, className, full }) {
  return (
    <div className={cx(full ? 'flex w-full' : 'inline-flex', 'rounded-xl bg-[#E8EAEE] p-[3px] no-scrollbar overflow-x-auto max-w-full', className)} role="tablist">
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? titleCase(o) : o.label;
        return (
          <button key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
            className={cx(full && 'flex-1', 'whitespace-nowrap rounded-[9px] px-3.5 py-1.5 text-[13px] font-semibold transition', value === v ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}>
            {l}{o.count != null && o.count > 0 && <span className="ml-1.5 rounded-full bg-blue px-1.5 text-[11px] text-white">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Lists ---------- */

export const List = ({ children, className, inset }) => (
  <div className={cx('overflow-hidden rounded-tile border border-black/[0.04] bg-surface shadow-tile divide-y divide-line', inset && 'border-0 shadow-none rounded-2xl bg-bg/60', className)}>{children}</div>
);
export function Row({ title, subtitle, left, right, to, onClick, chevron, className }) {
  const Inner = (
    <>
      {left && <div className="shrink-0">{left}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 text-right text-[14px]">{right}</div>}
      {(chevron || to) && <ChevronRight size={18} className="shrink-0 text-faint" />}
    </>
  );
  const cls = cx('flex w-full items-center gap-3 px-4 py-3 text-left', (to || onClick) && 'transition hover:bg-bg active:bg-bg', className);
  if (to) return <Link to={to} className={cls}>{Inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{Inner}</button>;
  return <div className={cls}>{Inner}</div>;
}
export const Section = ({ title, action, children, className }) => (
  <div className={cx('mt-6', className)}>
    {(title || action) && <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>{action}</div>}
    {children}
  </div>
);
export function KV({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="min-w-0"><dt className="text-[12px] font-semibold uppercase tracking-wide text-faint">{k}</dt><dd className="mt-0.5 break-words text-[15px]">{v || <span className="text-faint">—</span>}</dd></div>
      ))}
    </dl>
  );
}

// Simple responsive table: becomes cards on mobile
export function Table({ columns, rows, onRow, empty = 'Nothing here yet', rowKey = 'id' }) {
  if (!rows?.length) return <Empty title={empty} />;
  return (
    <div className="overflow-hidden rounded-tile border border-black/[0.04] bg-surface shadow-tile">
      <table className="hidden w-full text-[14px] md:table">
        <thead><tr className="border-b border-line text-left text-[12px] font-semibold uppercase tracking-wide text-faint">
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
              <div key={c.key || c.label} className={cx('flex items-center justify-between gap-3', ci === 0 ? 'text-[15px] font-semibold' : 'text-[13px] text-muted')}>
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
  green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red', blue: 'bg-blue-soft text-blue', grey: 'bg-[#EEF0F3] text-muted', ink: 'bg-ink text-white',
};
const STATUS_TONE = {
  active: 'green', ok: 'green', signed: 'green', paid: 'green', approved: 'green', accepted: 'green', on_shift: 'green', closed: 'grey', published: 'blue', filled: 'green', locked: 'grey',
  pending: 'amber', draft: 'grey', submitted: 'blue', issued: 'blue', requested: 'amber', onboarding: 'amber', applicant: 'blue', assigned: 'blue', upcoming: 'grey', on_break: 'amber',
  disputed: 'red', overdue: 'red', exception: 'red', rejected: 'red', declined: 'grey', cancelled: 'grey', void: 'grey', late: 'amber', no_show: 'red', left_early: 'amber', suspended: 'red', left: 'grey',
  changes_requested: 'amber', critical: 'red', high: 'red', medium: 'amber', low: 'grey', credited: 'grey', finished: 'grey', manual: 'blue', partial: 'amber', open: 'blue',
};
export function Pill({ children, tone, status, className }) {
  const t = tone || STATUS_TONE[status] || 'grey';
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold', PILL[t], className)}>{children ?? titleCase(status)}</span>;
}
export const Dot = ({ tone = 'green', live }) => <span className={cx('inline-block h-2.5 w-2.5 rounded-full', { green: 'bg-green', amber: 'bg-amber', red: 'bg-red', grey: 'bg-faint', blue: 'bg-blue' }[tone], live && 'live-dot')} />;

export function Avatar({ name, src, size = 40, className }) {
  const hue = [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  const bg = ['bg-blue-soft text-blue', 'bg-[#EEF0F3] text-ink', 'bg-[#E6F0FA] text-[#2563EB]', 'bg-[#EEF2FF] text-[#4F46E5]'][hue];
  if (src) return <img src={src} alt="" className={cx('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />;
  return <div className={cx('grid shrink-0 place-items-center rounded-full font-bold', bg, className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials(name)}</div>;
}

export const Spinner = ({ className }) => <div className={cx('grid place-items-center py-16 text-muted', className)}><Loader2 className="animate-spin" /></div>;
export function Empty({ title = 'Nothing here yet', body, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center rounded-tile border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon size={22} /></div>
      <div className="text-[16px] font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-sm text-[14px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const ErrorBox = ({ error, retry }) => (
  <div className="rounded-tile bg-red-soft p-5 text-red"><div className="font-semibold">{error?.message || 'Could not load'}</div>{retry && <button className="mt-2 text-sm font-semibold underline" onClick={retry}>Try again</button>}</div>
);

// Render loading / error / content for a useApi result
export function Load({ q, children }) {
  if (q.loading && !q.data) return <Spinner />;
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  return children(q.data);
}

/* ---------- Sheet (bottom sheet on mobile, centred modal on desktop) ---------- */

export function Sheet({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" style={{ animation: 'fade .2s' }} onClick={onClose} />
      <div className={cx('relative flex max-h-[92vh] w-full flex-col rounded-t-[28px] bg-surface shadow-sheet sm:rounded-[28px]', w)} style={{ animation: 'sheet-up .32s cubic-bezier(.2,.9,.2,1)' }}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 sm:pt-5">
          <h2 className="text-[20px] font-bold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} className="bg-bg" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 safe-b">{footer}</div>}
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
  const close = (v) => { st?.resolve(v); setSt(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Sheet open={!!st} onClose={() => close(false)} title={st?.title} size="sm"
        footer={<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button><Button variant={st?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{st?.confirm || 'Confirm'}</Button></>}>
        {st?.body && <p className="text-[15px] text-muted">{st.body}</p>}
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
