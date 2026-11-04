// The floating Orb button: bottom right on every manager page, above the tab bar and any action bar
import { useLocation } from 'react-router-dom';
import { cx } from './index.jsx';
import OrbMark from './OrbMark.jsx';

export default function OrbFab({ onClick, hidden, dot }) {
  const { pathname } = useLocation();
  // A message thread has its own composer at the bottom
  const thread = /\/messages\/[^/]+/.test(pathname);
  return (
    <button type="button" onClick={onClick} aria-label={dot ? 'Orb, your assistant (something new)' : 'Orb, your assistant'} title="Orb"
      className={cx('orb-fab pressable fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full sm:right-6 lg:right-8', (hidden || thread) && 'orb-fab-hidden')}>
      <OrbMark tile={false} className="h-8 w-8" />
      {dot && <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-red ring-2 ring-[var(--color-surface,#fff)]" />}
    </button>
  );
}
