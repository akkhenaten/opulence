import { createContext, useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { findHub } from './hubs.js';

export { findHub, HUBS, hubTabs } from './hubs.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// Shell shares who is signed in and which modules are on, so a page can find its section and tabs
export const HubCtx = createContext(null);
// `inside`: also on pages under a tab (a split view with a conversation open)
export function useHub({ inside } = {}) {
  const ctx = useContext(HubCtx);
  const loc = useLocation();
  if (!ctx) return null;
  const hub = findHub(loc.pathname, ctx.user, ctx.on, { exact: !inside, search: loc.search });
  return hub && hub.tabs.length > 1 ? hub : null;
}

/** The page's own controls (week, view, filters) on one line: beside the section tabs, or on their own without tabs */
export function ToolRow({ children, className }) {
  if (!children) return null;
  return <div className={cx('ui-tools flex min-w-0 flex-wrap items-center gap-2', className)}>{children}</div>;
}

/** The tab row under a section's title, with the page's tools on its right. Switching tabs replaces the entry, so Back still leaves the section. */
// counts: a number beside a tab, by its label (e.g. { 'Shift requests': 3 }); zero shows nothing
export function HubTabs({ hub, tools, counts, className }) {
  if (!hub) return tools ? <ToolRow className={cx('mb-4', className)}>{tools}</ToolRow> : null;
  return (
    <div className={cx('mb-4 xl:flex xl:items-end xl:gap-4 xl:border-b xl:border-line', className)}>
      <nav aria-label={hub.title} className="-mx-4 overflow-x-auto border-b border-line px-4 no-scrollbar sm:mx-0 sm:px-0 xl:mb-[-1px] xl:min-w-0 xl:flex-1 xl:border-b-0">
        <div className="flex gap-5">
        {hub.tabs.map((t) => {
          const on = t === hub.current;
          const n = counts?.[t.label];
          return (
            <Link key={t.to} to={t.to} replace aria-current={on ? 'page' : undefined}
              className={cx('pressable -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-subhead font-semibold transition-colors', on ? 'border-[var(--accent-fill,var(--color-blue))] text-ink' : 'border-transparent text-muted hover:text-ink')}>
              {t.label}
              {n > 0 && <span className="num rounded-full bg-blue-soft px-1.5 text-caption font-bold text-blue">{n}</span>}
            </Link>
          );
        })}
        </div>
      </nav>
      {tools && <ToolRow className="mt-3 xl:mt-0 xl:shrink-0 xl:justify-end xl:pb-2">{tools}</ToolRow>}
    </div>
  );
}

/** The tab row of the section this page belongs to, for pages that draw their own header */
export function SectionTabs({ className, tools, counts }) {
  return <HubTabs hub={useHub({ inside: true })} tools={tools} counts={counts} className={className} />;
}
