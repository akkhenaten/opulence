import { Link } from 'react-router-dom';
import { ChevronRight, Workflow } from 'lucide-react';
import { useApi } from '../../../ui/index.jsx';

/** The way into the Emergency flowchart: a tile in the Toolbox, and a red button on every shift card (shift). Hidden only if the platform admin takes it offline. */
export default function FlowEntry({ from, shift }) {
  const s = useApi('settings.get', {});
  if (!s.data?.flow_visible) return null;
  return (
    <Link to={`/guide/flow?from=${encodeURIComponent(from)}`} className={`eg-entry fl-entry ${shift ? 'fl-entry-shift' : ''}`}>
      <Workflow size={24} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Emergency flowchart</span>
        <span className="block text-footnote opacity-80">Attack, explosion, suspicious item, bomb threat, injuries · ProtectUK advice</span>
      </span>
      <ChevronRight size={18} />
    </Link>
  );
}
