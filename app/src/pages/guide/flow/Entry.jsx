import { Link } from 'react-router-dom';
import { ChevronRight, Workflow } from 'lucide-react';
import { useApi } from '../../../ui/index.jsx';

/** The way into the Emergency flowchart from the Toolbox, under the guide's own tile; platform admin only until the permissions are in */
export default function FlowEntry({ from }) {
  const s = useApi('settings.get', {});
  if (!s.data?.flow_visible) return null;
  return (
    <Link to={`/guide/flow?from=${encodeURIComponent(from)}`} className="eg-entry fl-entry">
      <Workflow size={24} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Emergency flowchart (draft, to compare)</span>
        <span className="block text-footnote opacity-80">Text only, word for word from ProtectUK and citizenAID</span>
      </span>
      <ChevronRight size={18} />
    </Link>
  );
}
