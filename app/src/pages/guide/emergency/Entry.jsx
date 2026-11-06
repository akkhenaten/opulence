import { Link } from 'react-router-dom';
import { ChevronRight, Siren } from 'lucide-react';
import { useApi } from '../../../ui/index.jsx';

/** The way into the Emergency guide from the Toolbox; shows only for whoever the platform admin has let see the draft */
export default function EmergencyEntry({ from }) {
  const s = useApi('settings.get', {});
  if (!s.data?.emergency_visible) return null;
  return (
    <Link to={`/guide/emergency/S00?from=${encodeURIComponent(from)}`} className="eg-entry">
      <Siren size={24} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold">Emergency guide</span>
        <span className="block text-footnote opacity-80">Knife attack · Draft, not clinically approved</span>
      </span>
      <ChevronRight size={18} />
    </Link>
  );
}
