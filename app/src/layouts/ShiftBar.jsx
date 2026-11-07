import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Coffee, FilePen, LogIn, LogOut, Siren } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { Button, cx, IconButton, time, useApi } from '../ui/index.jsx';
import { clockOpensAt } from '../pages/officer/_parts.jsx';

// Pages that already are the next step (or need the whole screen): no bar there. Home shows the shift card itself.
const HIDE = [/^\/officer\/?$/, /^\/officer\/clock/, /^\/officer\/incidents\/new/, /^\/guide\//];

/* The officer's shift in one bar above the tab bar, on every page, from the moment clock-in opens until they clock out:
   where they are in the shift, the one button that comes next, and Report incident and Emergency one tap away. */
export default function ShiftBar() {
  const { user } = useAuth();
  const loc = useLocation();
  const clock = useApi('clock.status', {}, { poll: 60000, skip: !user.officer_id });
  const settings = useApi('settings.get', {});
  const cur = clock.data?.current;
  const now = Date.now();
  const onShift = cur && (cur.state === 'on_shift' || cur.state === 'on_break');
  const due = cur && cur.state === 'not_started' && now >= clockOpensAt(cur.starts_at).getTime() && new Date(cur.ends_at).getTime() > now;
  const show = !!(onShift || due) && !HIDE.some((r) => r.test(loc.pathname));

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('has-shiftbar', show);
    return () => html.classList.remove('has-shiftbar');
  }, [show]);
  if (!show) return null;

  const brk = cur.state === 'on_break';
  const inAt = (cur.events || []).find((e) => e.kind === 'in' && e.status !== 'rejected')?.ts;
  const canReport = new Date(cur.starts_at).getTime() - 3600000 <= now;
  const s = settings.data || {};
  const emergency = s.flow_visible ? `/guide/flow?from=${encodeURIComponent(loc.pathname + loc.search)}`
    : s.emergency_visible ? `/guide/emergency/S00?from=${encodeURIComponent(loc.pathname + loc.search)}` : null;
  const next = brk ? { label: 'End break', icon: Coffee } : onShift ? { label: 'Clock out', icon: LogOut } : { label: 'Clock in', icon: LogIn };

  return (
    <div role="region" aria-label="Your shift"
      className="fixed inset-x-0 z-40 border-t border-line/70 bg-surface/95 backdrop-blur-xl safe-x [bottom:calc(58px+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex h-[var(--shiftbar-h)] max-w-2xl items-center gap-2 px-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-caption font-semibold uppercase tracking-wide text-muted">
            {onShift && <span className={cx('live-dot h-2 w-2 rounded-full', brk ? 'bg-amber' : 'bg-green')} />}
            {brk ? 'On break' : onShift ? 'On shift' : 'Starts'}
            {onShift && inAt ? <span className="num normal-case">· since {time(inAt)}</span>
              : !onShift ? <span className="num">{time(cur.starts_at)}</span> : null}
          </div>
          <div className="truncate text-subhead font-semibold">{cur.venue_name}</div>
        </div>
        {canReport && <IconButton icon={FilePen} label="Report an incident" tone="soft" to={`/officer/incidents/new?shift=${cur.shift_id}`} />}
        {emergency && <IconButton icon={Siren} label="Emergency guide" tone="danger" to={emergency} />}
        <Button size="sm" variant={onShift ? 'secondary' : 'primary'} icon={next.icon} to="/officer/clock">{next.label}</Button>
      </div>
    </div>
  );
}
