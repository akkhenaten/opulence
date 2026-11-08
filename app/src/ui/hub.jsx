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
  const hub = findHub(loc.pathname, ctx.user, ctx.on, { exact: !inside });
  return hub && hub.tabs.length > 1 ? hub : null;
}

/** The tab row under a section's title. Switching tabs replaces the entry, so Back still leaves the section. */
export function HubTabs({ hub, className }) {
  if (!hub) return null;
  return (
    <nav aria-label={hub.title} className={cx('-mx-4 mb-5 overflow-x-auto border-b border-line px-4 no-scrollbar sm:mx-0 sm:px-0', className)}>
      <div className="flex gap-5">
        {hub.tabs.map((t) => {
          const on = t === hub.current;
          return (
            <Link key={t.to} to={t.to} replace aria-current={on ? 'page' : undefined}
              className={cx('pressable -mb-px whitespace-nowrap border-b-2 pb-2.5 pt-1 text-subhead font-semibold transition-colors', on ? 'border-[var(--accent-fill,var(--color-blue))] text-ink' : 'border-transparent text-muted hover:text-ink')}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** The tab row of the section this page belongs to, for pages that draw their own header */
export function SectionTabs({ className }) {
  return <HubTabs hub={useHub({ inside: true })} className={className} />;
}
