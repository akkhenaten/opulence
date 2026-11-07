// Venue managers with several venues pick one (home-page tiles or the top-bar chip) or "All venues".
// The choice is shared by every venue page and remembered on this device.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Layers } from 'lucide-react';
import { useAuth } from './auth.jsx';
import { List, Pressable, Row, Sheet, useApi } from './ui/index.jsx';

const KEY = 'orb.venue';
const Ctx = createContext({ venues: [], venueId: '', venue: null, many: false, setVenueId: () => {} });

const stored = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export function VenueProvider({ children }) {
  const { user } = useAuth();
  const q = useApi('venues.list', {}, { skip: user?.role !== 'venue' });
  const venues = useMemo(() => (q.data || []).filter((v) => v.active !== false), [q.data]);
  const [picked, setPicked] = useState(stored);
  const many = venues.length > 1;
  // A remembered venue that is no longer theirs, or a single venue, means "all"; until the list loads, trust what was remembered
  const venueId = !q.data ? (user?.role === 'venue' ? picked : '') : many && venues.some((v) => v.id === picked) ? picked : '';
  useEffect(() => {
    try { if (venueId) localStorage.setItem(KEY, venueId); else if (q.data) localStorage.removeItem(KEY); } catch { /* private mode */ }
  }, [venueId, q.data]);
  const value = useMemo(() => ({
    venues, venueId, many, venue: venues.find((v) => v.id === venueId) || null, setVenueId: (id) => setPicked(id || ''),
  }), [venues, venueId, many]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** { venues, venueId, venue, many, setVenueId }; outside a venue manager's app venueId is always '' */
export const useVenue = () => useContext(Ctx);

/** Top-bar chip to switch venue without going home; nothing for one-venue managers */
export function VenueChip() {
  const { venues, venue, venueId, many, setVenueId } = useVenue();
  const [open, setOpen] = useState(false);
  if (!many) return null;
  const choose = (id) => { setVenueId(id); setOpen(false); };
  return (
    <>
      <Pressable press onClick={() => setOpen(true)} aria-label={`Venue: ${venue?.name || 'All venues'}. Change venue`}
        className="flex h-10 max-w-[44vw] items-center gap-1.5 rounded-full bg-surface px-3.5 text-subhead font-semibold shadow-tile sm:max-w-[240px]">
        {venue ? <Building2 size={16} className="shrink-0 text-blue" /> : <Layers size={16} className="shrink-0 text-blue" />}
        <span className="truncate">{venue?.name || 'All venues'}</span>
        <ChevronDown size={16} className="shrink-0 text-muted" />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Show venue" size="sm">
        <List>
          <Row title="All venues" subtitle={`${venues.length} venues together`} left={<Layers size={20} className="text-blue" />}
            right={!venueId && <Check size={20} className="text-blue" />} onClick={() => choose('')} />
          {venues.map((v) => (
            <Row key={v.id} title={v.name} subtitle={v.postcode || v.address || ''} left={<Building2 size={20} className="text-muted" />}
              right={venueId === v.id && <Check size={20} className="text-blue" />} onClick={() => choose(v.id)} />
          ))}
        </List>
      </Sheet>
    </>
  );
}
