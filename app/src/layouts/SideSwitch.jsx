import { useNavigate } from 'react-router-dom';
import { HOME, useAuth } from '../auth.jsx';
import { Segmented, useAction } from '../ui/index.jsx';

/** "Manager | My shifts" for a manager who also works shifts. Hidden for everyone else. */
export function SideSwitch({ full, className }) {
  const { user, switchSide } = useAuth();
  const nav = useNavigate();
  const [run, busy] = useAction();
  if (!user?.dual) return null;
  const side = user.role === 'officer' ? 'officer' : 'manager';
  const go = (to) => {
    if (to === side || busy) return;
    run(async () => { const u = await switchSide(to); nav(HOME[u.role], { replace: true }); }).catch(() => {});
  };
  return (
    <Segmented full={full} className={className} value={side} onChange={go}
      options={[{ value: 'manager', label: 'Manager' }, { value: 'officer', label: 'My shifts' }]} />
  );
}
